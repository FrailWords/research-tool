import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import HomePage from "./pages/HomePage";
import ConfigPage from "./pages/ConfigPage";
import ReportPage from "./pages/ReportPage";

export default function App() {
  const [page, setPage]     = useState("loading");
  const [report, setReport] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    invoke("get_app_state").then((state) => {
      setPage("home");
    }).catch(() => setPage("home"));
  }, []);

  if (page === "loading") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", color:"var(--text3)", fontSize:13 }}>
      Loading...
    </div>
  );

  if (page === "home") return (
    <HomePage
      onNewRun={() => setPage("config")}
      onOpenRun={(r, cfg) => { setReport(r); setConfig(cfg); setPage("report"); }}
    />
  );

  if (page === "config") return (
    <ConfigPage
      onReport={(r, cfg) => { setReport(r); setConfig(cfg); setPage("report"); }}
      onBack={() => setPage("home")}
    />
  );

  if (page === "report") return (
    <ReportPage
      report={report}
      config={config}
      onBack={() => setPage("home")}
      onRunAgain={(cfg) => { setConfig(cfg); setPage("config"); }}
    />
  );
}
