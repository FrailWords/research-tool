import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";

const SOURCE_OPTIONS = [
  { id: "google",  label: "Google News",    desc: "Past 24h news" },
  { id: "scholar", label: "Google Scholar", desc: "Academic papers" },
  { id: "reuters", label: "Reuters / AP",   desc: "Wire news" },
  { id: "arxiv",   label: "arXiv",          desc: "CS & AI preprints" },
];

export default function ConfigPage({ onReport, onBack, initialConfig }) {
  const [topic, setTopic]       = useState(initialConfig?.topic || "");
  const [keywords, setKeywords] = useState(initialConfig?.keywords || []);
  const [kwInput, setKwInput]   = useState("");
  const [sources, setSources]   = useState(initialConfig?.sources || ["google", "scholar"]);
  const [outputEN, setOutputEN] = useState(initialConfig?.output_en ?? true);
  const [outputJP, setOutputJP] = useState(initialConfig?.output_jp ?? true);

  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState([]);
  const [error, setError]       = useState(null);
  const progressRef = useRef(null);
  const unlistenRef = useRef(null);

  useEffect(() => {
    if (progressRef.current)
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
  }, [progress]);

  useEffect(() => () => { if (unlistenRef.current) unlistenRef.current(); }, []);

  function addKeyword() {
    const v = kwInput.trim();
    if (v && !keywords.includes(v)) setKeywords(prev => [...prev, v]);
    setKwInput("");
  }
  function removeKeyword(k) { setKeywords(prev => prev.filter(x => x !== k)); }
  function toggleSource(id) {
    setSources(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function handleRun() {
    if (!topic.trim()) { setError("Please enter a research topic."); return; }
    if (sources.length === 0) { setError("Please select at least one source."); return; }
    setError(null);
    setRunning(true);
    setProgress([]);

    if (unlistenRef.current) unlistenRef.current();
    unlistenRef.current = await listen("progress", (event) => {
      setProgress(p => [...p, event.payload]);
    });

    try {
      const result = await invoke("run_research", {
        config: {
          topic,
          keywords,
          excludes: [],
          sources,
          max_articles: 12,
          analysis_prompt: "",
          sections: [],
          tone: "",
          banned_words: [],
          output_en: outputEN,
          output_jp: outputJP,
        }
      });
      setRunning(false);
      if (result.error) { setError(result.error); return; }
      onReport(result, { topic, keywords, sources, output_en: outputEN, output_jp: outputJP });
    } catch (e) {
      setRunning(false);
      setError(String(e));
    }
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"var(--bg)" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"0 20px",
        height:52, background:"var(--bg2)", borderBottom:"0.5px solid var(--border)", flexShrink:0 }}>
        <button onClick={onBack} disabled={running}
          style={{ padding:"6px 14px", border:"0.5px solid var(--border2)",
            background:"transparent", color:"var(--text)", borderRadius:8, fontSize:13 }}>
          ← Back
        </button>
        <div style={{ fontWeight:600, fontSize:14, flex:1 }}>New run</div>
        <button onClick={handleRun} disabled={running}
          style={{ padding:"8px 22px", background: running ? "var(--border2)" : "var(--text)",
            color: running ? "var(--text3)" : "var(--bg2)",
            border:"none", borderRadius:8, fontWeight:500, fontSize:14 }}>
          {running ? "Running..." : "Run now"}
        </button>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Left: config */}
        <div style={{ flex:1, overflowY:"auto", padding:24,
          display:"flex", flexDirection:"column", gap:16, maxWidth:600 }}>

          {error && (
            <div style={{ padding:"10px 14px", background:"var(--red-bg)",
              color:"var(--red-text)", borderRadius:8, fontSize:13 }}>
              {error}
            </div>
          )}

          {/* Topic */}
          <Card title="What do you want to research?">
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Latest developments in humanoid robotics and labor market implications"
              style={{ width:"100%", padding:"10px 12px", minHeight:100, fontSize:14, lineHeight:1.6 }}
              autoFocus
            />
          </Card>

          {/* Keywords */}
          <Card title="Keywords (optional)">
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: keywords.length ? 10 : 0 }}>
              {keywords.map(k => (
                <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:4,
                  padding:"4px 10px", background:"var(--blue-bg)", color:"var(--blue-text)",
                  borderRadius:20, fontSize:12 }}>
                  {k}
                  <span onClick={() => removeKeyword(k)}
                    style={{ cursor:"pointer", opacity:0.6, fontSize:11, marginLeft:1 }}>×</span>
                </span>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addKeyword()}
                placeholder="Type a keyword and press Enter"
                style={{ flex:1, padding:"8px 12px" }}
              />
              <button onClick={addKeyword}
                style={{ padding:"8px 14px", border:"0.5px solid var(--border2)",
                  background:"transparent", color:"var(--text)", borderRadius:8 }}>
                Add
              </button>
            </div>
          </Card>

          {/* Sources */}
          <Card title="Sources">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {SOURCE_OPTIONS.map(s => {
                const on = sources.includes(s.id);
                return (
                  <div key={s.id} onClick={() => toggleSource(s.id)}
                    style={{ padding:"12px 14px", borderRadius:8, cursor:"pointer",
                      border:`0.5px solid ${on ? "var(--blue)" : "var(--border)"}`,
                      background: on ? "var(--blue-bg)" : "var(--bg3)",
                      transition:"all 0.15s" }}>
                    <div style={{ fontWeight:500, fontSize:13,
                      color: on ? "var(--blue-text)" : "var(--text)" }}>{s.label}</div>
                    <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{s.desc}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Language */}
          <Card title="Output language">
            <Toggle label="English report"    value={outputEN} onChange={setOutputEN} />
            <Toggle label="Japanese translation" value={outputJP} onChange={setOutputJP} />
          </Card>

        </div>

        {/* Right: progress */}
        <div style={{ width:300, borderLeft:"0.5px solid var(--border)", background:"var(--bg2)",
          display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ padding:"14px 16px", borderBottom:"0.5px solid var(--border)",
            fontSize:11, fontWeight:600, color:"var(--text3)",
            textTransform:"uppercase", letterSpacing:"0.04em" }}>
            Progress
          </div>
          {!running && progress.length === 0 && (
            <div style={{ padding:"20px 16px", fontSize:13, color:"var(--text3)", lineHeight:1.7 }}>
              Fill in your topic and click <strong style={{color:"var(--text)"}}>Run now</strong>.
              Progress will stream here in real time.
            </div>
          )}
          <div ref={progressRef}
            style={{ flex:1, overflowY:"auto", padding:"10px 16px",
              display:"flex", flexDirection:"column", gap:4 }}>
            {progress.filter(l => !l.startsWith("DEBUG")).map((line, i) => (
              <ProgressLine key={i} line={line} />
            ))}
            {running && (
              <div style={{ display:"flex", alignItems:"center", gap:8,
                padding:"4px 0", color:"var(--text3)", fontSize:12 }}>
                <Spinner /> Working...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background:"var(--bg2)", border:"0.5px solid var(--border)",
      borderRadius:12, padding:20 }}>
      <div style={{ fontSize:11, fontWeight:600, color:"var(--text3)",
        textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between",
      alignItems:"center", marginBottom:12 }}>
      <span style={{ fontSize:13, color:"var(--text)" }}>{label}</span>
      <div onClick={() => onChange(!value)}
        style={{ width:36, height:20, borderRadius:10,
          background: value ? "var(--text)" : "var(--border2)",
          position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
        <div style={{ width:14, height:14, borderRadius:"50%", background:"white",
          position:"absolute", top:3, left: value ? 19 : 3, transition:"left 0.2s" }} />
      </div>
    </div>
  );
}

function ProgressLine({ line }) {
  const isOk   = line.startsWith("✓");
  const isErr  = line.startsWith("✗");
  const isHead = line.startsWith("##");
  return (
    <div style={{
      fontSize: isHead ? 10 : 12,
      fontWeight: isHead ? 600 : 400,
      color: isOk ? "var(--green-text)" : isErr ? "var(--red-text)"
           : isHead ? "var(--text2)" : "var(--text)",
      padding: isHead ? "8px 0 2px" : "1px 0",
      textTransform: isHead ? "uppercase" : "none",
      letterSpacing: isHead ? "0.04em" : "normal",
      lineHeight: 1.5,
    }}>
      {isHead ? line.replace("## ", "") : line}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width:11, height:11, border:"1.5px solid var(--border2)",
      borderTopColor:"var(--text2)", borderRadius:"50%",
      animation:"spin 0.8s linear infinite", flexShrink:0 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
