// The research program that actually executes INSIDE the Daytona sandbox.
// It reads /research/input.json, calls Gemini (Google Search grounding) and/or
// xAI Grok (web_search + x_search), verifies every candidate URL with a real
// HTTP GET from inside the sandbox, fuses the evidence and writes
// /research/research-results.json + /research/source-evidence.json.
//
// API keys arrive as environment variables and are never printed.
export const RESEARCH_AGENT_PY = String.raw`
import json, os, re, sys, urllib.request, urllib.error, urllib.parse, hashlib, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(BASE, "input.json"), encoding="utf-8"))

QUERY = cfg.get("query", "")
PROFILE = cfg.get("companyProfile", {}) or {}
MAX_RESULTS = int(cfg.get("maxResults", 8))
GEMINI_MODEL = cfg.get("geminiModel", "gemini-2.5-flash")
GROK_MODEL = cfg.get("grokModel", "grok-4.6")
MAX_FETCH = int(cfg.get("maxFetch", 12))

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
XAI_KEY = os.environ.get("XAI_API_KEY", "")
LOVABLE_KEY = os.environ.get("LOVABLE_API_KEY", "")
LOVABLE_MODEL = cfg.get("lovableModel", "openai/gpt-6-astra")

logs = []
engines_used = []
engine_errors = []
UA = "Mozilla/5.0 (compatible; KeyPResearchAgent/1.0; +https://lovable.dev)"

def log(msg):
    logs.append("%s %s" % (datetime.datetime.utcnow().strftime("[%H:%M:%S]"), msg))

def post_json(url, payload, headers, timeout=75):
    body = json.dumps(payload).encode("utf-8")
    h = {"Content-Type": "application/json", "User-Agent": UA}
    h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))

PROMPT_PROFILE = json.dumps(PROFILE, ensure_ascii=False)

SCHEMA_HINT = (
    "Return ONLY a JSON array (no prose, no markdown fences) of up to %d objects with keys: "
    '"title","category","deadline","organizer","location","summary","why","url". '
    'If a deadline is not explicitly stated on the source, set deadline to "" — never invent one. '
    "url must be a real page you actually saw in search results, preferring the official "
    "government / organizer / accelerator / Devpost program page." % MAX_RESULTS
)

def extract_json_array(text):
    if not text:
        return []
    fence = chr(96) * 3
    m = re.search(fence + r"(?:json)?\s*([\[{][\s\S]*?)" + fence, text)

    raw = m.group(1) if m else None
    if raw is None:
        s = text.find("[")
        e = text.rfind("]")
        raw = text[s:e + 1] if s != -1 and e > s else None
    if raw is None:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if isinstance(data, dict):
        for k in ("results", "opportunities", "items"):
            if isinstance(data.get(k), list):
                data = data[k]
                break
    return data if isinstance(data, list) else []

# ─────────── A) Gemini + Google Search grounding ───────────
def run_gemini():
    prompt = (
        "You are the research engine for KeyP. Find CURRENTLY relevant funding, grant, "
        "competition, accelerator and hackathon opportunities matching this request.\n\n"
        "Request: %s\nCompany profile: %s\n\n"
        "Use Google Search. Strongly prefer official sources: government portals, the "
        "organizer's own site, accelerator pages, Devpost, official program pages.\n%s"
        % (QUERY, PROMPT_PROFILE, SCHEMA_HINT)
    )
    url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % GEMINI_MODEL
    data = post_json(
        url,
        {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "tools": [{"google_search": {}}]},
        {"x-goog-api-key": GEMINI_KEY},
    )
    cands = data.get("candidates") or []
    text = ""
    queries = []
    chunks = []
    if cands:
        for p in (cands[0].get("content", {}) or {}).get("parts", []) or []:
            if isinstance(p.get("text"), str):
                text += p["text"]
        gm = cands[0].get("groundingMetadata") or {}
        queries = gm.get("webSearchQueries") or []
        for c in gm.get("groundingChunks") or []:
            w = c.get("web") or {}
            if w.get("uri"):
                chunks.append({"url": w.get("uri"), "title": w.get("title") or w.get("uri")})
    log("gemini: model=%s searchQueries=%d groundingChunks=%d" % (GEMINI_MODEL, len(queries), len(chunks)))
    items = extract_json_array(text)
    log("gemini: parsed %d candidate opportunities" % len(items))
    return {"items": items, "chunks": chunks, "queries": queries, "text": text[:4000]}

# ─────────── A2) Lovable AI fallback (no live Google Search grounding) ───────────
# Used when GEMINI_API_KEY is absent. Calls the Lovable AI Gateway chat endpoint
# from inside the sandbox. This is model knowledge only — no live web search
# happens here, so results are always labeled discoveredBy=["lovable"] and must
# go through the same direct-URL verification as everything else.
def run_lovable():
    prompt = (
        "You are the research engine for KeyP. From your own knowledge, list "
        "funding, grant, competition, accelerator and hackathon opportunities "
        "matching this request. You have NO web access in this call — only list "
        "programs you are confident exist, with their official homepage URL. "
        "If unsure of a deadline, set deadline to \"\" — never invent one.\n\n"
        "Request: %s\nCompany profile: %s\n\n%s"
        % (QUERY, PROMPT_PROFILE, SCHEMA_HINT)
    )
    data = post_json(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
            "model": LOVABLE_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "reasoning_effort": "low",
        },
        {"Lovable-API-Key": LOVABLE_KEY},
        timeout=180,
    )
    choices = data.get("choices") or []
    text = ""
    if choices:
        text = ((choices[0].get("message") or {}).get("content")) or ""
    log("lovable: model=%s (knowledge-only fallback, no live search)" % LOVABLE_MODEL)
    items = extract_json_array(text)
    log("lovable: parsed %d candidate opportunities" % len(items))
    return {"items": items, "chunks": [], "queries": [], "text": text[:4000]}

# ─────────── B) Grok web_search + x_search ───────────
def run_grok():
    prompt = (
        "Find CURRENTLY relevant hackathons, builder events, startup programs, grants and "
        "competitions matching this request, with emphasis on X/Twitter announcements and "
        "organizer posts that general web search may miss.\n\n"
        "Request: %s\nCompany profile: %s\n\n%s"
        % (QUERY, PROMPT_PROFILE, SCHEMA_HINT)
    )
    # Grok with web_search + x_search tools routinely runs past 75s; give it a
    # long window and one retry on read timeouts.
    def _call(timeout):
        return post_json(
            "https://api.x.ai/v1/responses",
            {
                "model": GROK_MODEL,
                "input": prompt,
                "tools": [{"type": "web_search"}, {"type": "x_search"}],
                "max_tool_calls": 6,
            },
            {"Authorization": "Bearer %s" % XAI_KEY},
            timeout=timeout,
        )

    try:
        data = _call(240)
    except Exception as e:
        if "timed out" not in str(e):
            raise
        log("grok: first attempt timed out — retrying once")
        data = _call(240)
    text = ""
    cites = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") in ("output_text", "text") and isinstance(node.get("text"), str):
                globals()["_grok_text"] = globals().get("_grok_text", "") + node["text"]
            for k in ("url", "uri"):
                v = node.get(k)
                if isinstance(v, str) and v.startswith("http"):
                    cites.append({"url": v, "title": node.get("title") or node.get("name") or v})
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    globals()["_grok_text"] = ""
    walk(data.get("output", data))
    text = globals().get("_grok_text", "") or (data.get("output_text") or "")
    seen = set()
    uniq = []
    for c in cites:
        if c["url"] in seen:
            continue
        seen.add(c["url"])
        uniq.append(c)
    log("grok: model=%s citations=%d" % (GROK_MODEL, len(uniq)))
    items = extract_json_array(text)
    log("grok: parsed %d candidate opportunities" % len(items))
    return {"items": items, "chunks": uniq, "text": text[:4000]}

gemini_out = {"items": [], "chunks": [], "queries": [], "text": ""}
lovable_out = {"items": [], "chunks": [], "queries": [], "text": ""}
grok_out = {"items": [], "chunks": [], "text": ""}

if GEMINI_KEY:
    try:
        gemini_out = run_gemini()
        engines_used.append("gemini")
    except Exception as e:
        msg = str(e)[:300]
        engine_errors.append({"engine": "gemini", "message": msg})
        log("gemini: FAILED %s" % msg)
elif LOVABLE_KEY:
    try:
        lovable_out = run_lovable()
        engines_used.append("lovable")
    except Exception as e:
        msg = str(e)[:300]
        engine_errors.append({"engine": "lovable", "message": msg})
        log("lovable: FAILED %s" % msg)
else:
    log("gemini: GEMINI_API_KEY not configured and no Lovable AI fallback — skipped (no live Google Search grounding)")

if XAI_KEY:
    try:
        grok_out = run_grok()
        engines_used.append("grok")
    except Exception as e:
        msg = str(e)[:300]
        engine_errors.append({"engine": "grok", "message": msg})
        log("grok: FAILED %s" % msg)
else:
    log("grok: XAI_API_KEY not configured — skipped (no X search)")

# ─────────── C) direct source verification inside the sandbox ───────────
def norm_url(u):
    try:
        p = urllib.parse.urlsplit(u)
        host = (p.netloc or "").lower().replace("www.", "")
        path = (p.path or "/").rstrip("/") or "/"
        return host + path
    except Exception:
        return (u or "").lower()

def domain(u):
    try:
        return (urllib.parse.urlsplit(u).netloc or "").lower().replace("www.", "")
    except Exception:
        return ""

def is_x(u):
    d = domain(u)
    return d in ("x.com", "twitter.com", "mobile.twitter.com") or d.endswith(".x.com")

OFFICIAL_HINTS = (".go.kr", ".gov", ".gov.uk", ".govt.nz", ".gc.ca", ".europa.eu", ".or.kr", ".ac.kr", ".edu", ".org")

def looks_official(u):
    d = domain(u)
    if not d:
        return False
    if any(d.endswith(h) for h in OFFICIAL_HINTS):
        return True
    return d in ("devpost.com", "k-startup.go.kr")

fetch_cache = {}

def verify(u):
    if u in fetch_cache:
        return fetch_cache[u]
    out = {"statusCode": None, "finalUrl": u, "title": "", "snippet": "", "accessible": False}
    if len(fetch_cache) >= MAX_FETCH:
        out["snippet"] = "(fetch budget exhausted — not verified)"
        fetch_cache[u] = out
        return out
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
        with urllib.request.urlopen(req, timeout=10) as r:
            out["statusCode"] = r.getcode()
            out["finalUrl"] = r.geturl()
            html = r.read(220000).decode("utf-8", "replace")
        m = re.search(r"<title[^>]*>([\s\S]{0,300}?)</title>", html, re.I)
        if m:
            out["title"] = re.sub(r"\s+", " ", m.group(1)).strip()
        body = re.sub(r"(?is)<(script|style|noscript)[^>]*>[\s\S]*?</\1>", " ", html)
        body = re.sub(r"(?s)<[^>]+>", " ", body)
        body = re.sub(r"\s+", " ", body).strip()
        out["snippet"] = body[:400]
        out["accessible"] = bool(out["statusCode"] == 200 and body)
    except urllib.error.HTTPError as e:
        out["statusCode"] = e.code
        out["snippet"] = "(inaccessible: HTTP %s — login/paywall/bot protection not bypassed)" % e.code
    except Exception as e:
        out["snippet"] = "(inaccessible: %s)" % str(e)[:120]
    fetch_cache[u] = out
    log("fetch: %s -> %s" % (u[:90], out["statusCode"]))
    return out

# ─────────── D) evidence fusion ───────────
merged = {}

def add_candidate(item, engine, extra_chunks):
    if not isinstance(item, dict):
        return
    title = (item.get("title") or "").strip()
    url = (item.get("url") or "").strip()
    if not title:
        return
    key = norm_url(url) if url.startswith("http") else re.sub(r"\W+", "", title.lower())[:60]
    if not key:
        return
    rec = merged.get(key)
    if rec is None:
        rec = {
            "title": title,
            "category": (item.get("category") or "기회").strip(),
            "deadline": (item.get("deadline") or "").strip(),
            "organizer": (item.get("organizer") or "").strip(),
            "location": (item.get("location") or "").strip(),
            "summary": (item.get("summary") or "").strip(),
            "why": (item.get("why") or item.get("summary") or "").strip(),
            "url": url,
            "discoveredBy": [],
            "evidence": [],
            "xEvidence": [],
        }
        merged[key] = rec
    if engine not in rec["discoveredBy"]:
        rec["discoveredBy"].append(engine)
    # official facts (deadline) must not be overwritten by a later social find
    if not rec["deadline"] and item.get("deadline"):
        rec["deadline"] = str(item["deadline"]).strip()
    for f in ("organizer", "location", "summary", "why", "category"):
        if not rec.get(f) and item.get(f):
            rec[f] = str(item[f]).strip()
    if url:
        v = verify(url)
        rec["evidence"].append({
            "engine": engine, "url": url, "title": v["title"] or title,
            "statusCode": v["statusCode"], "snippet": v["snippet"], "accessible": v["accessible"],
        })
    # attach matching engine chunks as supporting evidence
    for c in extra_chunks[:4]:
        cu = c.get("url") or ""
        if not cu:
            continue
        bucket = rec["xEvidence"] if is_x(cu) else rec["evidence"]
        if any(e["url"] == cu for e in bucket):
            continue
        if is_x(cu):
            bucket.append({"engine": engine, "url": cu, "title": c.get("title") or cu,
                           "statusCode": None, "snippet": "(X/social source — supporting evidence only)",
                           "accessible": False})

for it in gemini_out["items"][: MAX_RESULTS * 2]:
    add_candidate(it, "gemini", gemini_out["chunks"])
for it in grok_out["items"][: MAX_RESULTS * 2]:
    add_candidate(it, "grok", grok_out["chunks"])

ptext = " ".join([str(PROFILE.get(k, "")) for k in ("company", "location", "industry", "companyType")] + list(PROFILE.get("interests", []) or [])).lower()

results = []
for key, rec in merged.items():
    ev = rec["evidence"]
    official_ev = [e for e in ev if looks_official(e["url"])]
    accessible = [e for e in ev if e.get("accessible")]
    verified = bool(accessible)
    if official_ev and accessible:
        source_type = "official"
    elif ev:
        source_type = "web"
    elif rec["xEvidence"]:
        source_type = "x"
    else:
        source_type = "web"

    confidence = 30
    confidence += 25 if verified else 0
    confidence += 20 if official_ev else 0
    confidence += 10 if len(rec["discoveredBy"]) > 1 else 0
    confidence += 5 if rec["deadline"] else 0
    confidence = max(10, min(98, confidence))

    blob = (rec["title"] + " " + rec["summary"] + " " + rec["why"] + " " + rec["location"]).lower()
    overlap = sum(1 for w in set(re.findall(r"[a-z가-힣]{2,}", ptext)) if w in blob)
    match = max(40, min(97, 45 + min(30, overlap * 3) + (12 if official_ev else 0) + (8 if verified else 0)))

    summary = rec["summary"] or rec["why"]
    if source_type == "x" or (not ev and rec["xEvidence"]):
        summary = ("needs verification — 소셜(X) 근거만 확보됨. " + summary).strip()

    results.append({
        "id": "live-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:12],
        "title": rec["title"],
        "category": rec["category"] or "기회",
        "deadline": rec["deadline"] or "공식 공고 확인 필요",
        "organizer": rec["organizer"] or "출처 확인 필요",
        "location": rec["location"] or "확인 필요",
        "summary": summary,
        "why": rec["why"] or summary,
        "matchScore": match,
        "url": rec["url"],
        "sample": False,
        "discoveredBy": rec["discoveredBy"],
        "sourceType": source_type,
        "sourceEvidence": ev,
        "xEvidence": rec["xEvidence"],
        "verified": verified,
        "confidence": confidence,
    })

results.sort(key=lambda r: (r["confidence"], r["matchScore"]), reverse=True)
results = results[:MAX_RESULTS]
log("merge: %d unique candidates -> %d ranked results" % (len(merged), len(results)))

json.dump({"query": QUERY, "enginesUsed": engines_used, "results": results},
          open(os.path.join(BASE, "research-results.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
json.dump({"gemini": {"queries": gemini_out.get("queries", []), "chunks": gemini_out.get("chunks", [])},
           "grok": {"chunks": grok_out.get("chunks", [])}},
          open(os.path.join(BASE, "source-evidence.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

print("KEYP_RESEARCH_JSON:" + json.dumps({
    "enginesUsed": engines_used,
    "engineErrors": engine_errors,
    "results": results,
    "logs": logs,
}, ensure_ascii=False))
`;
