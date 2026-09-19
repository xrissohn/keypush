// Server-only: runs the Opportunity Agent workload inside a real Daytona sandbox.
import {
  createSandbox,
  destroySandbox,
  exec,
  isDaytonaConfigured,
  readFile,
  writeFile,
  type DaytonaSandbox,
} from "./client.server";
import {
  RUN_STEP_LABELS,
  SAMPLE_COMPANY_PROFILE,
  type CompanyProfile,
  type GeneratedFile,
  type Opportunity,
  type RunResult,
  type RunStep,
} from "./types";
import type { ResearchEngine } from "@/lib/research/types";

const WORKDIR = "/home/daytona/keyp";
const OUTDIR = `${WORKDIR}/output`;
const RESDIR = `${WORKDIR}/research`;

function freshSteps(): RunStep[] {
  return RUN_STEP_LABELS.map((s) => ({ key: s.key, label: s.label, status: "pending" as const }));
}

function mark(steps: RunStep[], key: string, status: RunStep["status"], detail?: string) {
  const s = steps.find((x) => x.key === key);
  if (s) {
    s.status = status;
    s.at = new Date().toISOString();
    if (detail) s.detail = detail;
  }
}

function sq(v: string) {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/** The analysis program that actually runs inside the isolated sandbox. */
const AGENT_PY = String.raw`
import json, os, csv, datetime, re, urllib.request

base = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(base, "output")
resdir = os.path.join(base, "research")
os.makedirs(out, exist_ok=True)
os.makedirs(resdir, exist_ok=True)

opp = json.load(open(os.path.join(base, "opportunity.json"), encoding="utf-8"))
profile = json.load(open(os.path.join(base, "company-profile.json"), encoding="utf-8"))

research_path = os.path.join(resdir, "research-results.json")
research = json.load(open(research_path, encoding="utf-8")) if os.path.exists(research_path) else {}
evidence = opp.get("sourceEvidence") or []
x_evidence = opp.get("xEvidence") or []
engines = research.get("enginesUsed") or opp.get("discoveredBy") or []
query = research.get("query", "")

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

text = " ".join([str(opp.get(k, "")) for k in ("title", "category", "organizer", "location", "why", "summary")])
for e in evidence:
    text += " " + str(e.get("snippet", ""))
text = text.lower()

# 1) parse requirements out of the opportunity description + verified evidence
REQ_RULES = [
    ("location_seoul", "서울 소재 기업", ["seoul", "서울"]),
    ("startup", "스타트업 / 중소기업", ["startup", "sme", "스타트업", "중소기업"]),
    ("ai_domain", "AI 관련 사업 영역", ["ai", "인공지능", "machine learning"]),
    ("team", "팀 단위 참가", ["hackathon", "challenge", "해커톤", "공모"]),
]
requirements = []
for key, label, kws in REQ_RULES:
    if any(k in text for k in kws):
        requirements.append({"key": key, "label": label})
if not requirements:
    requirements.append({"key": "general", "label": "일반 지원 요건"})

ptext = " ".join([str(profile.get(k, "")) for k in ("company", "location", "industry", "companyType")] + list(profile.get("interests", []))).lower()

CHECKS = {
    "location_seoul": ("seoul" in ptext or "서울" in ptext),
    "startup": ("startup" in ptext or "sme" in ptext or "스타트업" in ptext),
    "ai_domain": ("ai" in ptext or "인공지능" in ptext),
    "team": True,
    "general": True,
}

results = []
met = 0
for r in requirements:
    ok = bool(CHECKS.get(r["key"], False))
    met += 1 if ok else 0
    results.append({"requirement": r["label"], "met": ok})

score = int(round(100.0 * met / max(1, len(requirements))))
score = max(35, min(98, score - (0 if met == len(requirements) else 8)))
eligible = "yes" if met == len(requirements) else ("review" if met >= max(1, len(requirements) - 1) else "no")
engine_used = "deterministic"
notes = []

# 2) evidence-driven reasoning with Gemini when a direct API key is available
def gemini_eligibility():
    payload_evidence = [{"url": e.get("url"), "title": e.get("title"), "statusCode": e.get("statusCode"),
                         "snippet": (e.get("snippet") or "")[:700]} for e in evidence[:6]]
    payload_x = [{"url": e.get("url"), "title": e.get("title")} for e in x_evidence[:6]]
    prompt = (
        "Assess eligibility of this company for this opportunity using ONLY the evidence given. "
        "Official/organizer evidence outranks social (X) posts; X posts must not override official "
        "eligibility or deadline facts. Never invent a deadline.\n\n"
        "Opportunity: %s\nCompany profile: %s\nOfficial/web evidence: %s\nX evidence: %s\n\n"
        'Return ONLY JSON: {"matchScore":0-100,"eligible":"yes|review|no",'
        '"requirements":[{"requirement":"...","met":true}],"missingDocuments":["..."],"notes":["..."]}'
        % (json.dumps(opp, ensure_ascii=False)[:2500], json.dumps(profile, ensure_ascii=False),
           json.dumps(payload_evidence, ensure_ascii=False)[:6000], json.dumps(payload_x, ensure_ascii=False)[:1500])
    )
    body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}]}).encode("utf-8")
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % GEMINI_MODEL,
        data=body, method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8", "replace"))
    txt = ""
    for p in ((data.get("candidates") or [{}])[0].get("content", {}) or {}).get("parts", []) or []:
        txt += p.get("text") or ""
    m = re.search(r"\{[\s\S]*\}", txt)
    return json.loads(m.group(0)) if m else None

if GEMINI_KEY and (evidence or x_evidence):
    try:
        g = gemini_eligibility()
        if g:
            score = int(max(0, min(100, g.get("matchScore", score))))
            if g.get("eligible") in ("yes", "review", "no"):
                eligible = g["eligible"]
            if isinstance(g.get("requirements"), list) and g["requirements"]:
                results = [{"requirement": str(x.get("requirement", ""))[:200], "met": bool(x.get("met"))}
                           for x in g["requirements"] if isinstance(x, dict)]
            notes = [str(n)[:300] for n in (g.get("notes") or [])][:6]
            engine_used = "gemini"
            gemini_missing = [str(d)[:120] for d in (g.get("missingDocuments") or [])]
    except Exception as e:
        notes.append("Gemini eligibility reasoning failed, deterministic fallback used: %s" % str(e)[:160])

DOCS = [
    ("사업자등록증", "business_registration"),
    ("법인 등기부등본 또는 대표자 신분증", "corporate_registry"),
    ("최근 회계연도 재무제표", "financials"),
    ("사업계획서 (PDF)", "business_plan"),
    ("팀 구성원 이력 요약", "team_profile"),
]
missing = [d[0] for d in DOCS if d[1] not in (profile.get("documents") or [])]
if engine_used == "gemini":
    try:
        extra = [m for m in gemini_missing if m not in missing]
        missing = missing + extra
    except Exception:
        pass

now = datetime.datetime.utcnow().isoformat() + "Z"

report = []
report.append("# Eligibility Report")
report.append("")
report.append("- Opportunity: **%s**" % opp.get("title"))
report.append("- Organizer: %s" % opp.get("organizer"))
report.append("- Deadline: %s" % (opp.get("deadline") or "공식 공고 확인 필요"))
report.append("- Company: **%s** (%s, %s)" % (profile.get("company"), profile.get("location"), profile.get("companyType")))
report.append("- Analysis engine: **%s**%s" % (engine_used, " (rule-based fallback)" if engine_used == "deterministic" else " (reasoned over collected evidence)"))
report.append("- Evidence sources: %d web/official, %d X" % (len(evidence), len(x_evidence)))
report.append("- Generated in Daytona sandbox at %s" % now)
report.append("")
report.append("## Requirement check")
report.append("")
report.append("| Requirement | Status |")
report.append("| --- | --- |")
for r in results:
    report.append("| %s | %s |" % (r["requirement"], "PASS" if r["met"] else "REVIEW"))
report.append("")
report.append("## Verdict")
report.append("")
report.append("- Match score: **%d%%**" % score)
report.append("- Eligible: **%s**" % eligible.upper())
for n in notes:
    report.append("- Note: %s" % n)
report.append("")
report.append("## Missing documents")
report.append("")
for m in missing:
    report.append("- [ ] %s" % m)
open(os.path.join(out, "eligibility-report.md"), "w", encoding="utf-8").write("\n".join(report))

draft = []
draft.append("# Application Draft — %s" % opp.get("title"))
draft.append("")
draft.append("## 1. 기업 개요")
draft.append("%s는 %s에 위치한 %s 분야의 %s입니다." % (profile.get("company"), profile.get("location"), profile.get("industry"), profile.get("companyType")))
draft.append("")
draft.append("## 2. 지원 동기")
draft.append(str(opp.get("why", "")) or "본 사업의 목표와 당사의 기술 방향이 일치합니다.")
draft.append("")
draft.append("## 3. 추진 계획")
draft.append("- 1개월: 요건 정리 및 제출 서류 확보")
draft.append("- 2개월: PoC 구축 및 성과지표 정의")
draft.append("- 3개월: 성과 검증 및 결과 보고")
draft.append("")
draft.append("## 4. 기대 효과")
draft.append("AI 기반 자동화로 운영 비용 절감 및 신규 매출 창출.")
draft.append("")
draft.append("_Source: %s_" % opp.get("url"))
open(os.path.join(out, "application-draft.md"), "w", encoding="utf-8").write("\n".join(draft))

with open(os.path.join(out, "submission-checklist.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["item", "type", "status", "due"])
    for r in results:
        w.writerow([r["requirement"], "requirement", "met" if r["met"] else "review", opp.get("deadline")])
    for m in missing:
        w.writerow([m, "document", "missing", opp.get("deadline")])

dossier = []
dossier.append("# Research Dossier")
dossier.append("")
dossier.append("- Query: %s" % (query or "(직접 선택된 기회 — 신규 검색 없음)"))
dossier.append("- Research engines used: %s" % (", ".join(engines) if engines else "none (no live search engine configured)"))
dossier.append("- Opportunity: %s" % opp.get("title"))
dossier.append("- Verification status: %s" % ("verified — accessible source confirmed" if opp.get("verified") else "needs verification"))
dossier.append("- Source type: %s" % (opp.get("sourceType") or "unknown"))
dossier.append("")
dossier.append("## Official / web sources")
dossier.append("")
if evidence:
    for e in evidence:
        dossier.append("- [%s](%s) — engine: %s · HTTP %s" % (e.get("title") or e.get("url"), e.get("url"), e.get("engine"), e.get("statusCode")))
        snip = (e.get("snippet") or "").replace("\n", " ")[:300]
        if snip:
            dossier.append("  - note: %s" % snip)
else:
    dossier.append("- (none collected)")
dossier.append("")
dossier.append("## X / social evidence (supporting only)")
dossier.append("")
if x_evidence:
    for e in x_evidence:
        dossier.append("- [%s](%s) — engine: %s" % (e.get("title") or e.get("url"), e.get("url"), e.get("engine")))
else:
    dossier.append("- (none collected)")
dossier.append("")
dossier.append("## Notes")
dossier.append("")
dossier.append("- Official organizer/government sources outrank social posts for eligibility and deadline facts.")
dossier.append("- Deadlines are never inferred; missing deadlines are reported as \"공식 공고 확인 필요\".")
for n in notes:
    dossier.append("- %s" % n)
open(os.path.join(out, "research-dossier.md"), "w", encoding="utf-8").write("\n".join(dossier))

json.dump({"opportunity": opp.get("id"), "sourceEvidence": evidence, "xEvidence": x_evidence},
          open(os.path.join(resdir, "source-evidence.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

print("KEYP_RESULT_JSON:" + json.dumps({
    "matchScore": score,
    "eligible": eligible,
    "requirements": results,
    "missingDocuments": missing,
    "eligibilityEngine": engine_used,
    "evidenceCount": len(evidence),
    "xSourceCount": len(x_evidence),
    "engines": engines,
    "generatedAt": now,
}, ensure_ascii=False))
`;

export async function runOpportunityInSandbox(
  opportunity: Opportunity,
  companyProfile: CompanyProfile = SAMPLE_COMPANY_PROFILE,
  research?: { query?: string; enginesUsed?: ResearchEngine[] },
): Promise<RunResult> {
  if (!isDaytonaConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "DAYTONA_API_KEY is not configured on the server. Add it in Project Settings → Secrets to enable REAL runs.",
    };
  }

  const steps = freshSteps();
  const log: string[] = [];
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  let sandbox: DaytonaSandbox | null = null;

  const push = (line: string) => log.push(`[${new Date().toISOString().slice(11, 23)}] ${line}`);

  try {
    push("daytona: creating isolated sandbox…");
    mark(steps, "sandbox", "running");
    sandbox = await createSandbox({ labels: { opportunity: opportunity.id } });
    mark(steps, "sandbox", "done", `sandbox ${sandbox.id}`);
    push(`daytona: sandbox ready id=${sandbox.id}`);

    mark(steps, "source", "running");
    await exec(sandbox, `mkdir -p ${OUTDIR} ${RESDIR}`);
    await writeFile(sandbox, `${WORKDIR}/opportunity.json`, JSON.stringify(opportunity, null, 2));
    await writeFile(sandbox, `${WORKDIR}/company-profile.json`, JSON.stringify(companyProfile, null, 2));
    await writeFile(
      sandbox,
      `${RESDIR}/research-results.json`,
      JSON.stringify(
        {
          query: research?.query ?? "",
          enginesUsed: research?.enginesUsed ?? opportunity.discoveredBy ?? [],
          results: [opportunity],
        },
        null,
        2,
      ),
    );
    await writeFile(
      sandbox,
      `${RESDIR}/source-evidence.json`,
      JSON.stringify(
        { sourceEvidence: opportunity.sourceEvidence ?? [], xEvidence: opportunity.xEvidence ?? [] },
        null,
        2,
      ),
    );
    await writeFile(sandbox, `${WORKDIR}/agent.py`, AGENT_PY);
    push(`fs: wrote opportunity.json, company-profile.json, research/*.json, agent.py into ${WORKDIR}`);
    mark(steps, "source", "done", "opportunity + evidence written");

    mark(steps, "requirements", "running");
    mark(steps, "profile", "running");
    mark(steps, "eligibility", "running");
    const geminiKey = process.env["GEMINI_API_KEY"] || "";
    const geminiModel = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
    const envPrefix = geminiKey
      ? `GEMINI_API_KEY=${sq(geminiKey)} GEMINI_MODEL=${sq(geminiModel)}`
      : "";
    push(`exec: python3 agent.py${geminiKey ? " (Gemini evidence reasoning enabled)" : " (deterministic scoring)"}`);
    const run = await exec(sandbox, `cd ${WORKDIR} && ${envPrefix} python3 agent.py`, { timeout: 150 });
    push(run.result.trim().split("\n").slice(-6).join("\n") || "(no stdout)");
    if (run.exitCode !== 0) {
      mark(steps, "requirements", "failed");
      mark(steps, "profile", "failed");
      mark(steps, "eligibility", "failed");
      throw new Error(`agent exited with code ${run.exitCode}: ${run.result.slice(-400)}`);
    }

    const m = run.result.match(/KEYP_RESULT_JSON:(\{[\s\S]*\})/);
    if (!m) throw new Error("agent produced no structured result");
    const parsed = JSON.parse(m[1]) as {
      matchScore: number;
      eligible: "yes" | "review" | "no";
      requirements: Array<{ requirement: string; met: boolean }>;
      missingDocuments: string[];
      eligibilityEngine: "gemini" | "deterministic";
      evidenceCount: number;
      xSourceCount: number;
      engines: ResearchEngine[];
    };
    mark(steps, "requirements", "done", `${parsed.requirements.length} requirements extracted`);
    mark(steps, "profile", "done", `${companyProfile.company} profile analyzed`);
    mark(
      steps,
      "eligibility",
      "done",
      `eligible=${parsed.eligible} score=${parsed.matchScore}% via ${parsed.eligibilityEngine}`,
    );

    mark(steps, "package", "running");
    const names = [
      "eligibility-report.md",
      "application-draft.md",
      "submission-checklist.csv",
      "research-dossier.md",
    ];
    const files: GeneratedFile[] = [];
    for (const name of names) {
      const content = await readFile(sandbox, `${OUTDIR}/${name}`);
      files.push({ name, path: `/output/${name}`, content });
      push(`fs: generated /output/${name} (${content.length} bytes)`);
    }
    mark(steps, "package", "done", `${files.length} files generated`);

    const finishedAt = new Date().toISOString();
    return {
      ok: true,
      mode: "real",
      sandboxId: sandbox.id,
      opportunity,
      companyProfile,
      startedAt,
      finishedAt,
      elapsedMs: Date.now() - t0,
      steps,
      log,
      matchScore: parsed.matchScore,
      eligible: parsed.eligible,
      reasons: parsed.requirements.map((r) => `${r.met ? "PASS" : "REVIEW"} · ${r.requirement}`),
      missingDocuments: parsed.missingDocuments,
      files,
      enginesUsed: parsed.engines ?? [],
      evidenceCount: parsed.evidenceCount ?? 0,
      xSourceCount: parsed.xSourceCount ?? 0,
      eligibilityEngine: parsed.eligibilityEngine,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    push(`error: ${message}`);
    console.error("[daytona] run failed", message);
    return { ok: false, code: "daytona_error", error: message, log, steps };
  } finally {
    if (sandbox) await destroySandbox(sandbox);
  }
}

/** Clearly-marked simulated run, only used when the client explicitly asks for DEMO mode. */
export function simulateOpportunityRun(
  opportunity: Opportunity,
  companyProfile: CompanyProfile = SAMPLE_COMPANY_PROFILE,
): RunResult {
  const startedAt = new Date().toISOString();
  const steps = freshSteps().map((s, i) => ({
    ...s,
    status: "done" as const,
    at: new Date(Date.now() + i * 420).toISOString(),
    detail: "simulated",
  }));
  const score = Math.max(62, Math.min(96, opportunity.matchScore || 85));
  const files: GeneratedFile[] = [
    {
      name: "eligibility-report.md",
      path: "/output/eligibility-report.md",
      content: `# Eligibility Report (DEMO — simulated, no sandbox executed)\n\n- Opportunity: **${opportunity.title}**\n- Company: **${companyProfile.company}** (${companyProfile.location}, ${companyProfile.companyType})\n- Analysis engine: deterministic (simulated)\n\n| Requirement | Status |\n| --- | --- |\n| 서울 소재 기업 | PASS |\n| 스타트업 / 중소기업 | PASS |\n| AI 관련 사업 영역 | PASS |\n\n## Verdict\n\n- Match score: **${score}%**\n- Eligible: **REVIEW**\n`,
    },
    {
      name: "application-draft.md",
      path: "/output/application-draft.md",
      content: `# Application Draft — ${opportunity.title} (DEMO)\n\n## 1. 기업 개요\n${companyProfile.company}는 ${companyProfile.location}에 위치한 ${companyProfile.industry} 분야의 ${companyProfile.companyType}입니다.\n\n## 2. 지원 동기\n${opportunity.why}\n\n## 3. 추진 계획\n- 1개월: 요건 정리 및 서류 확보\n- 2개월: PoC 구축\n- 3개월: 성과 검증\n`,
    },
    {
      name: "submission-checklist.csv",
      path: "/output/submission-checklist.csv",
      content: `item,type,status,due\n서울 소재 기업,requirement,met,${opportunity.deadline}\n사업자등록증,document,missing,${opportunity.deadline}\n사업계획서 (PDF),document,missing,${opportunity.deadline}\n`,
    },
    {
      name: "research-dossier.md",
      path: "/output/research-dossier.md",
      content: `# Research Dossier (DEMO — simulated, no live search performed)\n\n- Query: (demo)\n- Research engines used: none — this is a simulated run\n- Opportunity: ${opportunity.title}\n- Verification status: needs verification\n\n## Official / web sources\n\n- (none collected — DEMO run does not fetch sources)\n\n## X / social evidence\n\n- (none collected)\n`,
    },
  ];
  return {
    ok: true,
    mode: "demo",
    sandboxId: null,
    opportunity,
    companyProfile,
    startedAt,
    finishedAt: new Date(Date.now() + 2600).toISOString(),
    elapsedMs: 2600,
    steps,
    log: [
      "[demo] simulated run — no Daytona sandbox was created",
      "[demo] opportunity.json prepared (in-memory)",
      "[demo] requirements extracted: 3",
      `[demo] company profile analyzed: ${companyProfile.company}`,
      `[demo] eligibility: review (score ${score}%)`,
      "[demo] generated /output/eligibility-report.md, application-draft.md, submission-checklist.csv, research-dossier.md",
    ],
    matchScore: score,
    eligible: "review",
    reasons: ["PASS · 서울 소재 기업", "PASS · 스타트업 / 중소기업", "PASS · AI 관련 사업 영역"],
    missingDocuments: ["사업자등록증", "최근 회계연도 재무제표", "사업계획서 (PDF)"],
    files,
    enginesUsed: [],
    evidenceCount: 0,
    xSourceCount: 0,
    eligibilityEngine: "deterministic",
  };
}
