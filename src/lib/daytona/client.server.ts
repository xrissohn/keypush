// Server-only minimal Daytona Cloud API client (fetch based, edge-runtime safe).
// The official TypeScript SDK (@daytona/sdk) depends on Node-only modules
// (opentelemetry sdk-node, tar, fast-glob, ws) that cannot be bundled for this
// project's Worker runtime, so we talk to the same public Daytona API directly.
//
// API surface used (current Daytona Cloud API shape):
//   POST   {apiUrl}/sandbox                         -> create sandbox
//   GET    {apiUrl}/sandbox/{id}                    -> poll state, read toolboxProxyUrl
//   DELETE {apiUrl}/sandbox/{id}                    -> destroy sandbox
//   POST   https://proxy.app.daytona.io/toolbox/{id}/process/execute -> run a shell command inside it

const DEFAULT_API_URL = "https://app.daytona.io/api";

export function getDaytonaConfig() {
  const apiKey = process.env["DAYTONA_API_KEY"];
  const apiUrl = (process.env["DAYTONA_API_URL"] || DEFAULT_API_URL).replace(/\/$/, "");
  const target = process.env["DAYTONA_TARGET"] || undefined;
  const orgId = process.env["DAYTONA_ORGANIZATION_ID"] || undefined;
  return { apiKey, apiUrl, target, orgId, configured: Boolean(apiKey) };
}

export function isDaytonaConfigured() {
  return getDaytonaConfig().configured;
}

export class DaytonaError extends Error {}

interface SandboxDto {
  id: string;
  state?: string;
  toolboxProxyUrl?: string;
}

export interface DaytonaSandbox {
  id: string;
  toolboxBase: string;
}

function headers(apiKey: string, orgId?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Daytona-Source": "keyp-opportunity-agent",
  };
  if (orgId) h["X-Daytona-Organization-ID"] = orgId;
  return h;
}

async function req<T>(
  url: string,
  init: RequestInit,
  apiKey: string,
  orgId?: string,
): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers(apiKey, orgId), ...(init.headers as Record<string, string> | undefined) } });
  const text = await res.text();
  if (!res.ok) {
    throw new DaytonaError(`Daytona ${init.method ?? "GET"} ${new URL(url).pathname} -> ${res.status} ${text.slice(0, 400)}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return text as unknown as T;
  }
}

const DEFAULT_TOOLBOX_PROXY = "https://proxy.app.daytona.io/toolbox";

function toolboxBaseOf(dto: SandboxDto): string {
  const proxy = (dto.toolboxProxyUrl || DEFAULT_TOOLBOX_PROXY).replace(/\/$/, "");
  // If the proxy URL already ends with the sandbox id, do not append it again.
  if (proxy.endsWith(`/${dto.id}`)) return proxy;
  return `${proxy}/${dto.id}`;
}

/** Create a sandbox and wait until it is started. */
export async function createSandbox(opts: { snapshot?: string; labels?: Record<string, string> } = {}): Promise<DaytonaSandbox> {
  const { apiKey, apiUrl, target, orgId } = getDaytonaConfig();
  if (!apiKey) throw new DaytonaError("DAYTONA_API_KEY is not configured");

  const body: Record<string, unknown> = {
    language: "python", // guarantee agent.py has its expected runtime
    labels: { app: "keyp", purpose: "opportunity-agent", ...(opts.labels ?? {}) },
    autoStopInterval: 15,
    autoDeleteInterval: 30,
  };
  if (opts.snapshot) body["snapshot"] = opts.snapshot;
  if (target) body["target"] = target;

  let dto = await req<SandboxDto>(`${apiUrl}/sandbox`, { method: "POST", body: JSON.stringify(body) }, apiKey, orgId);

  const deadline = Date.now() + 90_000;
  while ((dto.state ?? "").toLowerCase() !== "started") {
    const state = (dto.state ?? "").toLowerCase();
    if (["error", "build_failed", "destroyed", "stopped"].includes(state)) {
      throw new DaytonaError(`sandbox entered state "${state}"`);
    }
    if (Date.now() > deadline) throw new DaytonaError("sandbox did not start within 90s");
    await new Promise((r) => setTimeout(r, 1500));
    dto = await req<SandboxDto>(`${apiUrl}/sandbox/${dto.id}`, { method: "GET" }, apiKey, orgId);
  }

  return { id: dto.id, toolboxBase: toolboxBaseOf(dto) };
}

export interface ExecResult {
  exitCode: number;
  result: string;
}

/** Run a shell command inside the sandbox. */
export async function exec(
  sandbox: DaytonaSandbox,
  command: string,
  opts: { cwd?: string; timeout?: number } = {},
): Promise<ExecResult> {
  const { apiKey, orgId } = getDaytonaConfig();
  if (!apiKey) throw new DaytonaError("DAYTONA_API_KEY is not configured");
  const out = await req<{ exitCode?: number; result: string }>(
    `${sandbox.toolboxBase}/process/execute`,
    {
      method: "POST",
      body: JSON.stringify({ command, cwd: opts.cwd, timeout: opts.timeout ?? 60 }),
    },
    apiKey,
    orgId,
  );
  return { exitCode: out.exitCode ?? 0, result: out.result ?? "" };
}

/** Write a text file inside the sandbox without multipart upload (base64 + shell). */
export async function writeFile(sandbox: DaytonaSandbox, path: string, content: string) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  const res = await exec(sandbox, `mkdir -p '${dir}' && printf %s '${b64}' | base64 -d > '${path}'`);
  if (res.exitCode !== 0) throw new DaytonaError(`failed to write ${path}: ${res.result.slice(0, 200)}`);
}

export async function readFile(sandbox: DaytonaSandbox, path: string): Promise<string> {
  const res = await exec(sandbox, `cat '${path}'`);
  if (res.exitCode !== 0) throw new DaytonaError(`failed to read ${path}`);
  return res.result;
}

export async function destroySandbox(sandbox: DaytonaSandbox) {
  const { apiKey, apiUrl, orgId } = getDaytonaConfig();
  if (!apiKey) return;
  try {
    await req(`${apiUrl}/sandbox/${sandbox.id}?force=true`, { method: "DELETE" }, apiKey, orgId);
  } catch (e) {
    console.error("[daytona] destroy failed", e);
  }
}
