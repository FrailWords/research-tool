# Research Pilot

A desktop app that searches the web for recent articles on a topic, analyses them with Claude AI, and produces a cited research report in English and Japanese.

Built with: Tauri 1 · Vite · React · Python (worker) · Claude claude-sonnet-4-5 · Serper API

---

## What it does

1. You enter a research topic, keywords, and style preferences
2. Click **Run now**
3. Watch live progress as it searches Google News, fetches articles, extracts claims with Claude, and synthesises a report
4. Review the two-column output — report on the left, source cards on the right, click any citation to highlight its source
5. Export as Markdown or PDF

---

## Prerequisites

You need these installed on your machine:

| Tool | Check with | Install from |
|---|---|---|
| Node.js 18+ | `node -v` | nodejs.org |
| Rust (stable) | `rustc -V` | rustup.rs |
| Python 3.10+ | `python3 -V` | python.org |
| npm | `npm -v` | comes with Node |

You also need two API keys:

- **Serper** — serper.dev → sign up → Dashboard → API Key (2,500 free searches/month)
- **Anthropic** — console.anthropic.com → API Keys (add $5 credit to start)

You will enter these in the app on first launch. They are stored locally on your machine.

---

## Development setup (run without building)

This is the fastest way to get started and iterate.

```bash
# 1. Install JS dependencies
npm install

# 2. Install Python dependencies
pip install -r worker/requirements.txt

# 3. Start the dev server
npm run tauri:dev
```

The app opens in a native window. The Python worker runs directly as `python3 worker/worker.py` in dev mode — no compilation needed.

---

## Building a distributable app

### Step 1 — Generate app icons

Put a 1024×1024 PNG of your icon at the project root (e.g. `icon.png`), then:

```bash
npx tauri icon icon.png
```

This fills `src-tauri/icons/` with all required sizes.

### Step 2 — Compile the Python worker into a binary

**Mac / Linux:**
```bash
cd worker
bash build_worker.sh
cd ..
```

**Windows:**
```
cd worker
build_worker.bat
cd ..
```

This produces `src-tauri/binaries/worker` (or `worker.exe` on Windows).

### Step 3 — Build the Tauri app

```bash
npm run tauri:build
```

Output:
- **Mac**: `src-tauri/target/release/bundle/dmg/Research Pilot_1.0.0_x64.dmg`
- **Windows**: `src-tauri/target/release/bundle/msi/Research Pilot_1.0.0_x64_en-US.msi`

Hand either file to your friend. He double-clicks, installs like any normal app.

---

## Releasing via GitHub Actions (build for both platforms at once)

This lets you build a Mac `.dmg` and Windows `.msi` without needing both machines.

### One-time setup

1. Push this repo to a **private** GitHub repository

2. Add these repository secrets (Settings → Secrets → Actions):
   - `TAURI_PRIVATE_KEY` — generate with: `npx tauri signer generate -w ~/.tauri/myapp.key`
   - `TAURI_KEY_PASSWORD` — the password you chose above

3. That's it. The CI workflow is already at `.github/workflows/release.yml`

### To release a new version

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds both platforms in parallel (~10 min). When done, a GitHub Release appears with two download links — one `.dmg` for Mac, one `.msi` for Windows. Share that release URL with your friend.

---

## Project structure

```
research-pilot/
├── src/                        # React frontend
│   ├── main.jsx                # Entry point
│   ├── App.jsx                 # Page router
│   ├── styles/global.css       # Global styles
│   └── pages/
│       ├── SetupPage.jsx       # First-run API key screen
│       ├── ConfigPage.jsx      # Search config + live progress
│       └── ReportPage.jsx      # Two-column report viewer
│
├── worker/
│   ├── worker.py               # Python worker (search → fetch → analyse → translate)
│   ├── requirements.txt        # Python deps
│   ├── build_worker.sh         # Compile to binary (Mac/Linux)
│   └── build_worker.bat        # Compile to binary (Windows)
│
├── src-tauri/
│   ├── src/main.rs             # Tauri backend (key storage, worker spawning, export)
│   ├── Cargo.toml
│   ├── tauri.conf.json         # App config, window size, bundle settings
│   ├── icons/                  # App icons (generate with: npx tauri icon)
│   └── binaries/               # Compiled worker binary goes here (gitignored)
│
├── .github/workflows/
│   └── release.yml             # Dual-platform CI build
│
├── index.html
├── vite.config.js
├── package.json
└── .gitignore
```

---

## How the worker pipeline works

```
1. Search      Serper API → Google News (past 24h) + Scholar
2. Fetch       HTTP GET each URL → strip HTML → extract text / parse PDF
3. Extract     Claude (per article) → structured JSON: claims, quote, entities, numbers
4. Filter      Drop irrelevant articles
5. Synthesise  Claude (all briefs) → full report with [REF:N] citation markers
6. Translate   Claude → Japanese version (markers preserved)
7. Return      JSON result → Tauri → React frontend
```

Progress lines are printed to stdout as each step completes. Tauri reads them line-by-line and emits them as frontend events, which the ConfigPage renders in real time.

The final result is printed as `RESULT:{json}` — Tauri detects this prefix and passes the JSON to the React frontend which switches to the ReportPage.

---

## Customising the AI behaviour

All AI behaviour is driven by prompts in `worker/worker.py`. The key constants to tune:

- `EXTRACTION_SYSTEM` — what to extract from each article (around line 130)
- `SYNTHESIS_SYSTEM` — how to write the report: tone, structure, citation rules (around line 195)
- `TRANSLATION_SYSTEM` — translation style rules (around line 230)

You do not need to recompile anything to change prompts during development — just edit `worker.py` and re-run.

---

## Troubleshooting

**"Failed to start worker"** — In dev mode, make sure `python3` is on your PATH. Run `python3 worker/worker.py` manually to see raw errors.

**"No search results"** — Check your Serper API key. Test it with: `curl -H "X-API-KEY: YOUR_KEY" "https://google.serper.dev/news" -d '{"q":"test"}' -H "Content-Type: application/json"`

**"HTTP 401" from Anthropic** — Check your Anthropic API key starts with `sk-ant-` and has billing credit.

**PDF articles show placeholder text** — Install pdfminer: `pip install pdfminer.six`

**PDF export fails** — Install weasyprint: `pip install weasyprint`. On Mac you may also need: `brew install pango`

**App icon missing / build fails** — Run `npx tauri icon your-icon.png` to generate all required icon sizes before building.

**Windows Defender blocks the .exe** — Expected for unsigned apps. Your friend clicks "More info → Run anyway". For a production release, look into code signing certificates.

---

## Upgrading your friend's app

When you build a new version:

1. Bump the version in `package.json` and `src-tauri/tauri.conf.json`
2. Tag and push to GitHub → CI builds both platforms
3. Share the new GitHub Release link

The app does not auto-update by default. To add auto-update, see: https://tauri.app/v1/guides/distribution/updater
