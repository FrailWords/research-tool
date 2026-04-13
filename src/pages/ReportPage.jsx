import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

function formatDate(val) {
  if (!val) return "";
  // Handle Unix timestamp (number or numeric string) or ISO string
  const d = /^\d+$/.test(String(val))
    ? new Date(Number(val) * 1000)
    : new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleString();
}

export default function ReportPage({ report, config, onBack }) {
  const [activeCite, setActiveCite] = useState(null);
  const [lang, setLang] = useState("en");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  const content = lang === "en" ? report.report_en : report.report_jp;
  const sources = report.sources || [];

  function handleCite(id) {
    setActiveCite(activeCite === id ? null : id);
    setTimeout(() => {
      const el = document.getElementById(`ev-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  async function handleExport(format) {
    setExporting(true);
    setExportMsg(null);
    try {
      const result = await invoke("export_report", { report, format, lang });
      if (result.path) setExportMsg(`Saved to: ${result.path}`);
      else setExportMsg(result.error || "Export failed.");
    } catch (e) {
      setExportMsg(String(e));
    }
    setExporting(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"var(--bg)" }}>
      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", padding:"0 20px", height:48, background:"var(--bg2)", borderBottom:"0.5px solid var(--border)", gap:12, flexShrink:0 }}>
        <button onClick={onBack} style={{ padding:"6px 12px", border:"0.5px solid var(--border2)", background:"transparent", color:"var(--text)", fontSize:13 }}>
          ← Back
        </button>
        <div style={{ fontWeight:500, fontSize:14, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {config.topic}
        </div>
        <div style={{ display:"flex", border:"0.5px solid var(--border2)", borderRadius:8, overflow:"hidden", flexShrink:0 }}>
{config.output_en && <LangBtn label="EN" active={lang==="en"} onClick={() => setLang("en")} />}
{config.output_jp && report.report_jp && <LangBtn label="JP" active={lang==="jp"} onClick={() => setLang("jp")} />}
{config.output_jp && !report.report_jp && (
  <span style={{ padding:"4px 10px", fontSize:12, color:"var(--text3)" }}>JP failed</span>
)}
        </div>
        <button onClick={() => handleExport("md")} disabled={exporting} style={{ padding:"6px 12px", border:"0.5px solid var(--border2)", background:"transparent", color:"var(--text)", fontSize:13 }}>
          Export .md
        </button>
        <button onClick={() => handleExport("pdf")} disabled={exporting} style={{ padding:"6px 12px", border:"0.5px solid var(--border2)", background:"transparent", color:"var(--text)", fontSize:13 }}>
          Export PDF
        </button>
      </div>

      {exportMsg && (
        <div style={{ padding:"8px 20px", background:"var(--green-bg)", color:"var(--green-text)", fontSize:12, borderBottom:"0.5px solid var(--border)" }}>
          {exportMsg}
        </div>
      )}

      {/* Sub-bar with meta */}
      <div style={{ display:"flex", alignItems:"center", padding:"0 20px", height:36, background:"var(--bg2)", borderBottom:"0.5px solid var(--border)", gap:16, flexShrink:0 }}>
        <span style={{ fontSize:12, color:"var(--text3)" }}>{sources.length} sources</span>
        <span style={{ fontSize:12, color:"var(--text3)" }}>·</span>
        <span style={{ fontSize:12, color:"var(--text3)" }}>{report.article_count || 0} articles analyzed</span>
        <span style={{ fontSize:12, color:"var(--text3)" }}>·</span>
        <span style={{ fontSize:12, color:"var(--text3)" }}>{formatDate(report.generated_at)}</span>
      </div>

      {/* Two-column body */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Left: Report */}
        <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", background:"var(--bg2)", userSelect:"text" }}>
          <ReportBody content={content} sources={sources} activeCite={activeCite} onCite={handleCite} />
        </div>

        {/* Right: Sources */}
        <div style={{ width:340, borderLeft:"0.5px solid var(--border)", background:"var(--bg)", overflowY:"auto", padding:16, flexShrink:0 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>
            Sources & evidence
          </div>
          {sources.map((src, i) => (
            <SourceCard key={i} src={src} index={i+1} active={activeCite === i+1} onClick={() => handleCite(i+1)} />
          ))}
          {sources.length === 0 && (
            <div style={{ fontSize:13, color:"var(--text3)" }}>No sources extracted.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LangBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:"4px 12px", border:"none", background: active ? "var(--text)" : "transparent", color: active ? "var(--bg2)" : "var(--text2)", fontSize:12 }}>
      {label}
    </button>
  );
}

function ReportBody({ content, sources, activeCite, onCite }) {
  if (!content) return <div style={{ color:"var(--text3)", fontSize:13 }}>No report content.</div>;

  // Parse the content which contains [REF:N] markers inserted by the worker
  // Split into segments: text and citation markers
  const parts = content.split(/(\[REF:\d+\])/g);

  return (
    <div style={{ maxWidth:680, lineHeight:1.8, fontSize:14, color:"var(--text)" }}>
      {parts.map((part, i) => {
        const refMatch = part.match(/\[REF:(\d+)\]/);
        if (refMatch) {
          const id = parseInt(refMatch[1]);
          const src = sources[id - 1];
          return (
            <span key={i}
              onClick={() => onCite(id)}
              title={src ? src.title : ""}
              style={{
                background: activeCite === id ? "rgba(24,95,165,0.25)" : "rgba(24,95,165,0.1)",
                borderRadius:3, cursor:"pointer", padding:"0 2px",
                transition:"background 0.15s",
              }}>
              <sup style={{ fontSize:10, color:"var(--blue)", fontWeight:600, marginLeft:1 }}>[{id}]</sup>
            </span>
          );
        }
        // Render markdown-ish: headers and paragraphs
        return <MarkdownSegment key={i} text={part} />;
      })}
    </div>
  );
}

function MarkdownSegment({ text }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize:22, fontWeight:600, margin:"0 0 8px", lineHeight:1.3 }}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize:16, fontWeight:600, margin:"24px 0 8px", color:"var(--text)" }}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize:14, fontWeight:600, margin:"16px 0 6px" }}>{line.slice(4)}</h3>;
        if (line.trim() === "") return <div key={i} style={{ height:10 }} />;
        return <p key={i} style={{ margin:"0 0 12px", lineHeight:1.8 }}>{line}</p>;
      })}
    </>
  );
}

function SourceCard({ src, index, active, onClick }) {
  const colors = [
    { bg:"rgba(24,95,165,0.1)", text:"#185fa5" },
    { bg:"rgba(15,110,86,0.1)", text:"#0f6e56" },
    { bg:"rgba(133,79,11,0.12)", text:"#854f0b" },
    { bg:"rgba(83,74,183,0.1)", text:"#534ab7" },
    { bg:"rgba(153,60,29,0.1)", text:"#993c1d" },
  ];
  const c = colors[(index - 1) % colors.length];

  return (
    <div id={`ev-${index}`} onClick={onClick}
      style={{ background:"var(--bg2)", border:`0.5px solid ${active ? "var(--blue)" : "var(--border)"}`, borderRadius:8, padding:"12px 14px", marginBottom:10, cursor:"pointer", transition:"border-color 0.15s" }}>
      <span style={{ display:"inline-block", fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:10, background:c.bg, color:c.text, marginBottom:6 }}>
        [{index}]
      </span>
      <div style={{ fontWeight:500, fontSize:13, marginBottom:3, color:"var(--text)" }}>{src.title || src.domain}</div>
      <div style={{ fontSize:11, color:"var(--blue)", marginBottom:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {src.url}
      </div>
      {src.key_quote && (
        <div style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6, borderLeft:"2px solid var(--border2)", paddingLeft:10, fontStyle:"italic" }}>
          {src.key_quote}
        </div>
      )}
      <div style={{ fontSize:11, color:"var(--text3)", marginTop:6 }}>
        {src.paragraph_ref && `Para. ${src.paragraph_ref} · `}{src.date || ""}
      </div>
    </div>
  );
}
