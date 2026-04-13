#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::Window;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ApiKeys {
    serper: String,
    anthropic: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct AppSettings {
    serper: String,
    anthropic: String,
    output_dir: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ResearchConfig {
    topic: String,
    keywords: Vec<String>,
    excludes: Vec<String>,
    sources: Vec<String>,
    max_articles: u32,
    analysis_prompt: String,
    sections: Vec<String>,
    tone: String,
    banned_words: Vec<String>,
    #[serde(alias = "outputEn")]
    output_en: bool,
    #[serde(alias = "outputJp")]
    output_jp: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct Source {
    title: Option<String>,
    url: String,
    domain: Option<String>,
    key_quote: Option<String>,
    paragraph_ref: Option<u32>,
    date: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ReportResult {
    report_en: Option<String>,
    report_jp: Option<String>,
    sources: Vec<Source>,
    article_count: u32,
    generated_at: String,
    error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct PastRun {
    id: String,
    topic: String,
    date: String,
    article_count: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct AppState {
    ready: bool,
}

#[derive(Serialize, Deserialize)]
struct SaveResult {
    ok: bool,
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct LoadRunResult {
    report: Option<ReportResult>,
    config: Option<serde_json::Value>,
}

// ── Paths ─────────────────────────────────────────────────────────────────────

fn settings_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path_resolver()
        .app_config_dir()
        .unwrap()
        .join("settings.json")
}

fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    let path = settings_path(app);
    if !path.exists() { return AppSettings::default(); }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings_to_disk(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&path, serde_json::to_string_pretty(settings).unwrap())
        .map_err(|e| e.to_string())
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn get_app_state(app: tauri::AppHandle) -> Result<AppState, String> {
    let s = load_settings(&app);
    Ok(AppState { ready: !s.serper.is_empty() && !s.anthropic.is_empty() && !s.output_dir.is_empty() })
}

#[tauri::command]
async fn get_api_keys(app: tauri::AppHandle) -> Result<ApiKeys, String> {
    let s = load_settings(&app);
    Ok(ApiKeys { serper: s.serper, anthropic: s.anthropic })
}

#[tauri::command]
async fn get_output_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(load_settings(&app).output_dir)
}

#[tauri::command]
async fn save_settings(
    app: tauri::AppHandle,
    serper: String,
    anthropic: String,
    output_dir: String,
) -> Result<SaveResult, String> {
    if !anthropic.starts_with("sk-ant-") {
        return Ok(SaveResult { ok: false,
            error: Some("Anthropic key should start with 'sk-ant-'. Check you copied it correctly.".into()) });
    }
    if serper.len() < 8 {
        return Ok(SaveResult { ok: false,
            error: Some("Serper key looks too short.".into()) });
    }
    let settings = AppSettings { serper, anthropic, output_dir };
    save_settings_to_disk(&app, &settings)
        .map(|_| SaveResult { ok: true, error: None })
        .map_err(|e| e)
}

#[tauri::command]
async fn get_past_runs(app: tauri::AppHandle) -> Result<Vec<PastRun>, String> {
    let settings = load_settings(&app);
    if settings.output_dir.is_empty() { return Ok(vec![]); }

    let dir = std::path::Path::new(&settings.output_dir);
    if !dir.exists() { return Ok(vec![]); }

    let mut runs: Vec<PastRun> = vec![];
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let meta_path = path.join("meta.json");
                if meta_path.exists() {
                    if let Ok(data) = std::fs::read_to_string(&meta_path) {
                        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&data) {
                            runs.push(PastRun {
                                id: path.file_name().unwrap().to_string_lossy().to_string(),
                                topic: meta["topic"].as_str().unwrap_or("Unknown").to_string(),
                                date: meta["date"].as_str().unwrap_or("").to_string(),
                                article_count: meta["article_count"].as_u64().map(|n| n as u32),
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort newest first
    runs.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(runs)
}

#[tauri::command]
async fn load_run(app: tauri::AppHandle, run_id: String) -> Result<LoadRunResult, String> {
    let settings = load_settings(&app);
    let run_dir = std::path::Path::new(&settings.output_dir).join(&run_id);

    let report_path = run_dir.join("report.json");
    let config_path = run_dir.join("config.json");

    let report = if report_path.exists() {
        std::fs::read_to_string(&report_path).ok()
            .and_then(|s| serde_json::from_str::<ReportResult>(&s).ok())
    } else { None };

    let config = if config_path.exists() {
        std::fs::read_to_string(&config_path).ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    } else { None };

    Ok(LoadRunResult { report, config })
}

// ── Worker runner ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn run_research(
    window: Window,
    app: tauri::AppHandle,
    config: ResearchConfig,
) -> Result<ReportResult, String> {
    let settings = load_settings(&app);

    let worker_path = {
        let sidecar = app
            .path_resolver()
            .resolve_resource("binaries/worker")
            .filter(|p| p.exists())
            .or_else(|| {
                app.path_resolver()
                    .resolve_resource("binaries/worker.exe")
                    .filter(|p| p.exists())
            });

        sidecar.unwrap_or_else(|| {
            let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            p.push("../worker/worker.py");
            p
        })
    };

    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    let mut cmd = if worker_path.extension().map(|e| e == "py").unwrap_or(false) {
        let mut c = Command::new("python3");
        c.arg(&worker_path);
        c
    } else {
        Command::new(&worker_path)
    };

    cmd.arg(&config_json)
        .env("SERPER_API_KEY", &settings.serper)
        .env("ANTHROPIC_API_KEY", &settings.anthropic)
        .env("OUTPUT_DIR", &settings.output_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start worker: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout).lines();
    let mut result_json: Option<String> = None;

    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        if line.starts_with("RESULT:") {
            result_json = Some(line[7..].to_string());
        } else {
            window.emit("progress", &line).ok();
        }
    }

    child.wait().await.map_err(|e| e.to_string())?;

    match result_json {
        Some(json) => serde_json::from_str(&json).map_err(|e| format!("Parse error: {}", e)),
        None => Ok(ReportResult {
            report_en: None, report_jp: None, sources: vec![],
            article_count: 0,
            generated_at: unix_now(),
            error: Some("Worker produced no output. Check API keys and internet connection.".into()),
        }),
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct ExportResult {
    path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn export_report(
    app: tauri::AppHandle,
    report: ReportResult,
    format: String,
    lang: String,
) -> Result<ExportResult, String> {
    let content = match lang.as_str() {
        "jp" => report.report_jp.clone().unwrap_or_default(),
        _    => report.report_en.clone().unwrap_or_default(),
    };

    let suffix = if lang == "jp" { "_jp" } else { "_en" };
    let filename = format!("report{}.{}", suffix, format);

    let save_path = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_file_name(&filename)
        .add_filter("Report", &[&format as &str])
        .save_file();

    let path = match save_path {
        Some(p) => p,
        None => return Ok(ExportResult { path: None, error: Some("Cancelled.".into()) }),
    };

    if format == "md" {
        let mut full = content.clone();
        full.push_str("\n\n---\n\n## Sources\n\n");
        for (i, src) in report.sources.iter().enumerate() {
            full.push_str(&format!(
                "[{}] **{}** — {}{}\n\n",
                i + 1,
                src.title.clone().unwrap_or_else(|| src.domain.clone().unwrap_or_default()),
                src.url,
                src.date.as_ref().map(|d| format!(" · {}", d)).unwrap_or_default()
            ));
        }
        std::fs::write(&path, full).map_err(|e| e.to_string())?;
    } else if format == "pdf" {
        let tmp_md = std::env::temp_dir().join("rp_export_tmp.md");
        let mut full = content.clone();
        full.push_str("\n\n---\n\n## Sources\n\n");
        for (i, src) in report.sources.iter().enumerate() {
            full.push_str(&format!("[{}] {} — {}\n\n", i + 1,
                src.title.clone().unwrap_or_default(), src.url));
        }
        std::fs::write(&tmp_md, &full).map_err(|e| e.to_string())?;

        let worker_path = app.path_resolver()
            .resolve_resource("binaries/worker")
            .filter(|p| p.exists())
            .unwrap_or_else(|| {
                let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                p.push("../worker/worker.py");
                p
            });

        let mut cmd = if worker_path.extension().map(|e| e == "py").unwrap_or(false) {
            let mut c = Command::new("python3");
            c.arg(&worker_path);
            c
        } else {
            Command::new(&worker_path)
        };

        let status = cmd.arg("--export-pdf").arg(&tmp_md).arg(&path)
            .status().await.map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&tmp_md);

        if !status.success() {
            return Ok(ExportResult { path: None,
                error: Some("PDF export failed. Run: pip install weasyprint markdown2".into()) });
        }
    }

    Ok(ExportResult { path: Some(path.to_string_lossy().to_string()), error: None })
}

fn unix_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs().to_string()
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            get_api_keys,
            get_output_dir,
            save_settings,
            get_past_runs,
            load_run,
            run_research,
            export_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
