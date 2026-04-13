#!/usr/bin/env python3
"""
Research Pilot — worker.py
Invoked by Tauri with a JSON config as the first argument.
Streams progress lines to stdout, prints RESULT:{json} as the final line.
Special mode: --export-pdf <input.md> <output.pdf>
"""

import sys, os, json, re, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone

# ── PDF export mode ───────────────────────────────────────────────────────────

if len(sys.argv) >= 4 and sys.argv[1] == "--export-pdf":
    try:
        import markdown2
        from weasyprint import HTML
        md_path, pdf_path = sys.argv[2], sys.argv[3]
        with open(md_path, "r", encoding="utf-8") as f:
            md_content = f.read()
        html_body = markdown2.markdown(md_content, extras=["tables", "fenced-code-blocks"])
        html_full = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body {{ font-family: -apple-system, sans-serif; font-size: 13px; line-height: 1.7;
         max-width: 720px; margin: 40px auto; color: #1a1a18; padding: 0 20px; }}
  h1 {{ font-size: 22px; margin: 0 0 8px; }}
  h2 {{ font-size: 16px; margin: 28px 0 8px; border-bottom: 0.5px solid #ddd; padding-bottom: 6px; }}
  p  {{ margin: 0 0 12px; }}
  sup {{ color: #185fa5; font-size: 10px; font-weight: 600; }}
  hr  {{ border: none; border-top: 0.5px solid #ddd; margin: 32px 0; }}
  @page {{ margin: 2cm; }}
</style></head><body>{html_body}</body></html>"""
        HTML(string=html_full).write_pdf(pdf_path)
        sys.exit(0)
    except Exception as e:
        print(f"PDF export error: {e}", file=sys.stderr)
        sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
#  SYSTEM PROMPT CONFIGURATION
#  Edit these constants to tune the AI behaviour.
#  No other changes needed.
# ══════════════════════════════════════════════════════════════════════════════

REPORT_SECTIONS = [
    "Executive summary",
    "Key developments",
    "Company & market signals",
    "What to watch next",
]

TONE = """
Write like a senior analyst briefing a busy executive who has 3 minutes to read.
- Short sentences. One idea per sentence.
- No jargon, no buzzwords, no corporate speak.
- Lead with the most important finding. Never bury the lede.
- Use specific names, numbers, and dates — not vague references.
- Never use passive voice.
- Never start a sentence with "It is" or "There are".
""".strip()

BANNED_WORDS = [
    "em-dash", "delve", "furthermore", "utilize", "leverage", "synergy",
    "robust", "paradigm", "ecosystem", "stakeholder", "actionable",
    "cutting-edge", "game-changer", "groundbreaking", "revolutionary",
    "it is worth noting", "it should be noted", "in conclusion",
]

EXTRACTION_INSTRUCTIONS = """
Extract only information directly relevant to the research topic.
Prioritise: specific facts, named entities, concrete numbers, direct quotes.
Ignore: opinion pieces without evidence, duplicate coverage, unrelated tangents.
""".strip()

SYNTHESIS_INSTRUCTIONS = """
Write a tight, factual briefing. Every paragraph should answer:
what happened, who did it, what does it mean, what is the evidence.
If sources conflict, note the discrepancy briefly.
Do not speculate beyond what the sources say.
""".strip()

TRANSLATION_NOTES = """
Translate naturally — do not translate word-for-word.
Use plain, direct Japanese that a business professional would write.
Avoid overly formal keigo. Avoid translating corporate English clichés into Japanese equivalents.
""".strip()

# ══════════════════════════════════════════════════════════════════════════════

def emit(msg):
    print(msg, flush=True)

def emit_result(data):
    print(f"RESULT:{json.dumps(data, ensure_ascii=False)}", flush=True)

def err_result(msg):
    emit_result({
        "report_en": None, "report_jp": None, "sources": [],
        "article_count": 0, "generated_at": datetime.now(timezone.utc).isoformat(),
        "error": msg
    })
    sys.exit(0)

# ── Load config ───────────────────────────────────────────────────────────────

if len(sys.argv) < 2:
    err_result("No config provided.")

try:
    config = json.loads(sys.argv[1])
except Exception as e:
    err_result(f"Could not parse config: {e}")

SERPER_KEY    = os.environ.get("SERPER_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OUTPUT_DIR    = os.environ.get("OUTPUT_DIR", "")

if not SERPER_KEY or not ANTHROPIC_KEY:
    err_result("API keys not set. Please check your setup in the home screen.")

TOPIC        = config.get("topic", "").strip()
KEYWORDS     = config.get("keywords", [])
EXCLUDES     = config.get("excludes", [])
SOURCES      = config.get("sources", ["google"])
MAX_ARTICLES = min(int(config.get("max_articles", 12)), 25)
OUTPUT_EN    = config.get("output_en", True)
OUTPUT_JP    = config.get("output_jp", True)

if not TOPIC:
    err_result("No research topic provided.")

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def http_post(url, headers, body):
    data = json.dumps(body).encode("utf-8")
    req  = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}")

def http_get(url, timeout=15):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ct  = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "pdf" in ct.lower() or url.lower().endswith(".pdf"):
                return raw, "pdf"
            return raw.decode("utf-8", errors="replace"), "html"
    except Exception:
        return None, "error"

def extract_html(html):
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL|re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>',  '', html, flags=re.DOTALL|re.IGNORECASE)
    html = re.sub(r'<nav[^>]*>.*?</nav>',       '', html, flags=re.DOTALL|re.IGNORECASE)
    html = re.sub(r'<footer[^>]*>.*?</footer>', '', html, flags=re.DOTALL|re.IGNORECASE)
    html = re.sub(r'<(p|div|h[1-6]|li|br)[^>]*>', '\n', html, flags=re.IGNORECASE)
    html = re.sub(r'<[^>]+>', '', html)
    for old, new in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&nbsp;',' '),('&#39;',"'"),('&quot;','"')]:
        html = html.replace(old, new)
    lines = [l.strip() for l in html.split('\n') if len(l.strip()) > 40]
    return '\n'.join(lines)

def extract_pdf(raw):
    try:
        from pdfminer.high_level import extract_text_to_fp
        from pdfminer.layout import LAParams
        import io
        out = io.StringIO()
        extract_text_to_fp(io.BytesIO(raw), out, laparams=LAParams())
        return out.getvalue()
    except ImportError:
        return "[PDF - install pdfminer.six for full text extraction]"
    except Exception as e:
        return f"[PDF extraction failed: {e}]"

def claude(system, user, max_tokens=2000):
    resp = http_post(
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
         "content-type": "application/json"},
        {"model": "claude-sonnet-4-5", "max_tokens": max_tokens,
         "system": system, "messages": [{"role": "user", "content": user}]}
    )
    return resp["content"][0]["text"]

# ── Step 1: Search ────────────────────────────────────────────────────────────

emit("## Step 1 — Search")

query = " ".join([TOPIC] + KEYWORDS)
if EXCLUDES:
    query += " " + " ".join(f"-{e}" for e in EXCLUDES)
emit(f"Searching: {query[:80]}...")

search_results = []

if "google" in SOURCES or "reuters" in SOURCES:
    try:
        resp = http_post(
            "https://google.serper.dev/news",
            {"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            {"q": query, "num": MAX_ARTICLES, "tbs": "qdr:d"}
        )
        news = resp.get("news", [])
        for item in news:
            search_results.append({
                "title":   item.get("title", ""),
                "url":     item.get("link", ""),
                "snippet": item.get("snippet", ""),
                "date":    item.get("date", ""),
                "source":  item.get("source", ""),
            })
        emit(f"✓ Google News: {len(news)} results")
    except Exception as e:
        emit(f"✗ Google News failed: {e}")

if "scholar" in SOURCES:
    try:
        resp = http_post(
            "https://google.serper.dev/scholar",
            {"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            {"q": query, "num": min(5, MAX_ARTICLES)}
        )
        for item in resp.get("organic", []):
            search_results.append({
                "title":   item.get("title", ""),
                "url":     item.get("link", ""),
                "snippet": item.get("snippet", ""),
                "date":    item.get("year", ""),
                "source":  "Google Scholar",
            })
        emit(f"✓ Google Scholar: {len(resp.get('organic',[]))} results")
    except Exception as e:
        emit(f"✗ Scholar failed: {e}")

if "arxiv" in SOURCES:
    try:
        arxiv_query = urllib.parse.quote(query)
        resp = http_post(
            "https://google.serper.dev/search",
            {"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
            {"q": f"site:arxiv.org {query}", "num": min(5, MAX_ARTICLES)}
        )
        for item in resp.get("organic", []):
            search_results.append({
                "title":   item.get("title", ""),
                "url":     item.get("link", ""),
                "snippet": item.get("snippet", ""),
                "date":    "",
                "source":  "arXiv",
            })
        emit(f"✓ arXiv: {len(resp.get('organic',[]))} results")
    except Exception as e:
        emit(f"✗ arXiv failed: {e}")

if not search_results:
    err_result("No search results. Check your Serper API key and internet connection.")

# Deduplicate
seen, unique = set(), []
for r in search_results:
    if r["url"] not in seen:
        seen.add(r["url"])
        unique.append(r)
search_results = unique[:MAX_ARTICLES]
emit(f"✓ {len(search_results)} unique articles")

# ── Step 2: Fetch ─────────────────────────────────────────────────────────────

emit("## Step 2 — Fetch articles")

fetched = []
for i, result in enumerate(search_results):
    url    = result["url"]
    domain = urllib.parse.urlparse(url).netloc.replace("www.", "")
    emit(f"Fetching {i+1}/{len(search_results)}: {domain}...")
    content, ctype = http_get(url)
    if content is None:
        emit(f"  ✗ Blocked or timeout — using snippet")
        text = result.get("snippet", "")
    elif ctype == "pdf":
        text = extract_pdf(content)
        emit(f"  ✓ PDF ({len(text)} chars)")
    else:
        text = extract_html(content)
        emit(f"  ✓ HTML ({len(text)} chars)")
    fetched.append({**result, "domain": domain, "full_text": text[:4000].strip()})

emit(f"✓ Fetched {len(fetched)} articles")

# ── Step 3: Extract ───────────────────────────────────────────────────────────

emit("## Step 3 — AI extraction")

EXTRACTION_SYSTEM = f"""You are a research analyst extracting structured data from articles.

Research topic: {TOPIC}

{EXTRACTION_INSTRUCTIONS}

Return a JSON object with:
- "relevant": true/false
- "key_claims": array of strings (max 5, factual claims only)
- "key_quote": string (most important verbatim quote or data point, max 50 words)
- "entities": array of strings (named companies, people, products)
- "numbers": array of strings (stats, figures, dates)
- "paragraph_ref": integer (paragraph number of key quote, starting at 1)

Respond ONLY with valid JSON. No explanation."""

extracted = []
for i, article in enumerate(fetched):
    emit(f"Extracting {i+1}/{len(fetched)}: {article['domain']}...")
    try:
        user_msg = f"Title: {article['title']}\nURL: {article['url']}\nDate: {article.get('date','')}\n\nContent:\n{article['full_text']}"
        raw  = claude(EXTRACTION_SYSTEM, user_msg, max_tokens=800)
        raw  = re.sub(r'^```json?\s*', '', raw.strip())
        raw  = re.sub(r'\s*```$',      '', raw.strip())
        data = json.loads(raw)
        if data.get("relevant", True):
            extracted.append({**article, "extraction": data})
            emit(f"  ✓ {len(data.get('key_claims',[]))} claims")
        else:
            emit(f"  — Not relevant, skipping")
    except Exception as e:
        emit(f"  ✗ Error: {e}")
        extracted.append({**article, "extraction": {
            "relevant": True, "key_claims": [],
            "key_quote": article.get("snippet",""), "paragraph_ref": 1
        }})

emit(f"✓ {len(extracted)} relevant articles")
if not extracted:
    err_result("No relevant articles after filtering. Try broader keywords.")

# ── Step 4: Synthesise ────────────────────────────────────────────────────────

emit("## Step 4 — Writing report")

briefs = []
for i, art in enumerate(extracted):
    ex = art.get("extraction", {})
    b  = f"[{i+1}] {art['title']} ({art['domain']}, {art.get('date','')})\nURL: {art['url']}\n"
    if ex.get("key_claims"):
        b += "Claims:\n" + "\n".join(f"  - {c}" for c in ex["key_claims"]) + "\n"
    if ex.get("key_quote"):
        b += f'Key quote: "{ex["key_quote"]}"\n'
    if ex.get("numbers"):
        b += "Data: " + ", ".join(ex["numbers"]) + "\n"
    briefs.append(b)

combined   = "\n---\n".join(briefs)
sections   = "\n".join(f"- {s}" for s in REPORT_SECTIONS)
banned_str = ", ".join(BANNED_WORDS)

SYNTHESIS_SYSTEM = f"""You are writing a research briefing report.

TONE:
{TONE}

BANNED WORDS AND PHRASES — never use any of these:
{banned_str}

REPORT STRUCTURE — use exactly these sections in this order:
{sections}

CITATION RULE — after every specific factual claim, insert [REF:N] where N is the
article number from the brief. Every factual sentence must have a citation.

FORMATTING RULES:
- Start with the report title as a # heading
- Use ## for section headings
- Write in paragraphs, not bullet points
- No em-dashes anywhere. Use a comma or a new sentence instead.
- Keep the total report under 900 words

{SYNTHESIS_INSTRUCTIONS}"""

emit("Writing English report...")
try:
    en_report = claude(
        SYNTHESIS_SYSTEM,
        f"Write the report from these {len(extracted)} article briefs:\n\n{combined}",
        max_tokens=2200
    )
    emit("✓ English report done")
except Exception as e:
    err_result(f"Report writing failed: {e}")

# ── Step 5: Translate ─────────────────────────────────────────────────────────

jp_report = None
if OUTPUT_JP:
    emit("## Step 5 — Japanese translation")
    TRANSLATION_SYSTEM = f"""You are translating a research briefing from English to Japanese.

{TRANSLATION_NOTES}

Rules:
- Keep all [REF:N] citation markers exactly as written — do not translate them
- Translate all # and ## headings into natural Japanese
- Maintain paragraph structure
- Do not add or remove content
- Banned English patterns to avoid equivalents of: {banned_str}"""
    try:
        jp_report = claude(
            TRANSLATION_SYSTEM,
            f"Translate this report to Japanese:\n\n{en_report}",
            max_tokens=2800
        )
        emit("✓ Japanese translation done")
    except Exception as e:
        emit(f"✗ Translation failed: {e}")

# ── Auto-save run ─────────────────────────────────────────────────────────────

now         = datetime.now(timezone.utc)
run_id      = now.strftime("%Y%m%d_%H%M%S")
sources_out = []
for art in extracted:
    ex = art.get("extraction", {})
    sources_out.append({
        "title":         art.get("title"),
        "url":           art.get("url", ""),
        "domain":        art.get("domain"),
        "key_quote":     ex.get("key_quote"),
        "paragraph_ref": ex.get("paragraph_ref"),
        "date":          art.get("date"),
    })

result_data = {
    "report_en":     en_report if OUTPUT_EN else None,
    "report_jp":     jp_report,
    "sources":       sources_out,
    "article_count": len(extracted),
    "generated_at":  now.isoformat(),
    "error":         None,
}

if OUTPUT_DIR and os.path.isdir(OUTPUT_DIR):
    try:
        run_dir = os.path.join(OUTPUT_DIR, run_id)
        os.makedirs(run_dir, exist_ok=True)

        # Save report JSON (for reloading in app)
        with open(os.path.join(run_dir, "report.json"), "w", encoding="utf-8") as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        # Save config JSON (for re-running)
        with open(os.path.join(run_dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

        # Save meta (for home screen listing)
        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({
                "topic":         TOPIC,
                "date":          now.isoformat(),
                "article_count": len(extracted),
            }, f, ensure_ascii=False, indent=2)

        # Save human-readable markdown reports
        if en_report and OUTPUT_EN:
            md  = en_report + "\n\n---\n\n## Sources\n\n"
            md += "\n\n".join(
                f"[{i+1}] **{s.get('title') or s.get('domain','')}** — {s['url']}"
                + (f" · {s['date']}" if s.get('date') else "")
                for i, s in enumerate(sources_out)
            )
            with open(os.path.join(run_dir, "report_en.md"), "w", encoding="utf-8") as f:
                f.write(md)

        if jp_report and OUTPUT_JP:
            md  = jp_report + "\n\n---\n\n## ソース\n\n"
            md += "\n\n".join(
                f"[{i+1}] **{s.get('title') or s.get('domain','')}** — {s['url']}"
                for i, s in enumerate(sources_out)
            )
            with open(os.path.join(run_dir, "report_jp.md"), "w", encoding="utf-8") as f:
                f.write(md)

        emit(f"✓ Saved to {run_dir}")
    except Exception as e:
        emit(f"✗ Auto-save failed: {e}")

# ── Done ──────────────────────────────────────────────────────────────────────

emit("## Done")
emit(f"✓ Report complete — {len(extracted)} sources")
emit_result(result_data)
