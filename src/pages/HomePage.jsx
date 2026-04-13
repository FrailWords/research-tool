import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";

export default function HomePage({ onNewRun, onOpenRun }) {
  const [keys, setKeys]           = useState({ serper: "", anthropic: "" });
  const [outputDir, setOutputDir] = useState("");
  const [keysOpen, setKeysOpen]   = useState(false);
  const [pastRuns, setPastRuns]   = useState([]);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState(null); // { type: "ok"|"err", text }
  const [loading, setLoading]     = useState(true);
  const [runLoading, setRunLoading] = useState(null);

  useEffect(() => {
    Promise.all([
      invoke("get_api_keys"),
      invoke("get_output_dir"),
      invoke("get_past_runs"),
    ]).then(([k, dir, runs]) => {
      setKeys(k);
      setOutputDir(dir || "");
      setPastRuns(runs || []);
      // Show keys section open if not configured yet
      setKeysOpen(!k.serper || !k.anthropic || !dir);
      setLoading(false);
    }).catch(() => {
      setKeysOpen(true);
      setLoading(false);
    });
  }, []);

  async function pickFolder() {
    const selected = await open({ directory: true, multiple: false, title: "Choose folder for saved reports" });
    if (selected) setOutputDir(selected);
  }

  async function saveSettings() {
    if (!keys.serper.trim() || !keys.anthropic.trim()) {
      setMsg({ type: "err", text: "Both API keys are required." }); return;
    }
    if (!outputDir) {
      setMsg({ type: "err", text: "Please choose a folder for saved reports." }); return;
    }
    setSaving(true);
    try {
      const result = await invoke("save_settings", {
        serper: keys.serper.trim(),
        anthropic: keys.anthropic.trim(),
        outputDir,
      });
      if (result.ok) {
        setMsg({ type: "ok", text: "Settings saved." });
        setKeysOpen(false);
        setTimeout(() => setMsg(null), 2500);
      } else {
        setMsg({ type: "err", text: result.error || "Save failed." });
      }
    } catch (e) {
      setMsg({ type: "err", text: String(e) });
    }
    setSaving(false);
  }

  async function openRun(run) {
    setRunLoading(run.id);
    try {
      const result = await invoke("load_run", { runId: run.id });
      if (result.report) {
        onOpenRun(result.report, result.config);
      } else {
        setMsg({ type: "err", text: "Could not load run." });
      }
    } catch (e) {
      setMsg({ type: "err", text: String(e) });
    }
    setRunLoading(null);
  }

  const isReady = keys.serper && keys.anthropic && outputDir;

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", color:"var(--text3)", fontSize:13 }}>Loading...</div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"var(--bg)" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 24px", height:52, background:"var(--bg2)",
        borderBottom:"0.5px solid var(--border)", flexShrink:0 }}>
        <div style={{ fontWeight:600, fontSize:15 }}>Research Pilot</div>
        <button
          onClick={onNewRun}
          disabled={!isReady}
          style={{ padding:"8px 22px", background: isReady ? "var(--text)" : "var(--border2)",
            color: isReady ? "var(--bg2)" : "var(--text3)",
            border:"none", borderRadius:8, fontWeight:500, fontSize:14,
            cursor: isReady ? "pointer" : "default" }}>
          New run
        </button>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"24px", display:"flex",
        flexDirection:"column", gap:16, maxWidth:720, width:"100%", margin:"0 auto" }}>

        {/* Setup card */}
        <div style={{ background:"var(--bg2)", border:"0.5px solid var(--border)",
          borderRadius:12, overflow:"hidden" }}>

          {/* Header row — always visible */}
          <div onClick={() => setKeysOpen(o => !o)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"14px 20px", cursor:"pointer", userSelect:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <StatusDot ok={!!isReady} />
              <span style={{ fontWeight:500, fontSize:14 }}>
                {isReady ? "Setup complete" : "Setup required"}
              </span>
            </div>
            <span style={{ fontSize:12, color:"var(--text3)" }}>{keysOpen ? "▲ hide" : "▼ edit"}</span>
          </div>

          {keysOpen && (
            <div style={{ padding:"0 20px 20px", borderTop:"0.5px solid var(--border)" }}>
              {msg && (
                <div style={{ margin:"12px 0", padding:"10px 12px", borderRadius:8, fontSize:12,
                  background: msg.type === "ok" ? "var(--green-bg)" : "var(--red-bg)",
                  color: msg.type === "ok" ? "var(--green-text)" : "var(--red-text)" }}>
                  {msg.text}
                </div>
              )}

              <FieldRow label="Serper API key" hint="serper.dev → Dashboard → API Key (free tier: 2,500 searches/month)">
                <input type="password" value={keys.serper}
                  onChange={e => setKeys(k => ({ ...k, serper: e.target.value }))}
                  placeholder="your-serper-key"
                  style={{ width:"100%", padding:"8px 12px" }} />
              </FieldRow>

              <FieldRow label="Anthropic API key" hint="console.anthropic.com → API Keys">
                <input type="password" value={keys.anthropic}
                  onChange={e => setKeys(k => ({ ...k, anthropic: e.target.value }))}
                  placeholder="sk-ant-..."
                  style={{ width:"100%", padding:"8px 12px" }} />
              </FieldRow>

              <FieldRow label="Save reports to" hint="A folder on your computer where all reports and configs will be saved automatically.">
                <div style={{ display:"flex", gap:8 }}>
                  <input readOnly value={outputDir} placeholder="No folder chosen"
                    style={{ flex:1, padding:"8px 12px", cursor:"default", color: outputDir ? "var(--text)" : "var(--text3)" }} />
                  <button onClick={pickFolder}
                    style={{ padding:"8px 16px", border:"0.5px solid var(--border2)",
                      background:"transparent", color:"var(--text)", borderRadius:8, whiteSpace:"nowrap" }}>
                    Choose folder
                  </button>
                </div>
              </FieldRow>

              <button onClick={saveSettings} disabled={saving}
                style={{ marginTop:4, padding:"9px 20px", background:"var(--text)", color:"var(--bg2)",
                  border:"none", borderRadius:8, fontWeight:500, fontSize:13,
                  opacity: saving ? 0.5 : 1 }}>
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
          )}
        </div>

        {/* Past runs */}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text3)",
            textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>
            Past runs
          </div>

          {pastRuns.length === 0 ? (
            <div style={{ padding:"32px 0", textAlign:"center", color:"var(--text3)", fontSize:13 }}>
              No runs yet. Click <strong>New run</strong> to get started.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pastRuns.map(run => (
                <div key={run.id} onClick={() => openRun(run)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"14px 18px", background:"var(--bg2)",
                    border:"0.5px solid var(--border)", borderRadius:10,
                    cursor:"pointer", transition:"border-color 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border2)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div>
                    <div style={{ fontWeight:500, fontSize:14, color:"var(--text)", marginBottom:3 }}>
                      {run.topic}
                    </div>
                    <div style={{ fontSize:12, color:"var(--text3)" }}>
                      {formatDate(run.date)} · {run.article_count || "?"} sources
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:"var(--blue)", flexShrink:0, marginLeft:16 }}>
                    {runLoading === run.id ? "Loading..." : "Open →"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function StatusDot({ ok }) {
  return (
    <div style={{ width:8, height:8, borderRadius:"50%",
      background: ok ? "var(--green)" : "var(--blue)", flexShrink:0 }} />
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ marginTop:16 }}>
      <div style={{ fontSize:12, fontWeight:500, color:"var(--text2)", marginBottom:5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize:11, color:"var(--text3)", marginTop:5, lineHeight:1.5 }}>{hint}</div>}
    </div>
  );
}

function formatDate(val) {
  if (!val) return "";
  const d = /^\d+$/.test(String(val)) ? new Date(Number(val) * 1000) : new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleString();
}
