import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Beaker,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Compass,
  Database,
  Download,
  FileText,
  Filter,
  Gauge,
  LayoutGrid,
  Mail,
  Mic,
  Play,
  Presentation,
  RefreshCcw,
  Rocket,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  XCircle
} from "lucide-react";

const gridAuto = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px"
};

const rowBetween = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px"
};

const card = {
  border: "1px solid rgba(143,188,69,0.22)",
  borderRadius: "14px",
  padding: "14px",
  background: "rgba(10,18,12,0.52)"
};

const sectionFrame = {
  padding: "18px",
  display: "grid",
  gap: "14px"
};

const statusChipStyle = (tone = "neutral") => {
  const map = {
    ok: {
      color: "#86efac",
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(34,197,94,0.35)"
    },
    warn: {
      color: "#fbbf24",
      background: "rgba(245,158,11,0.15)",
      border: "1px solid rgba(245,158,11,0.35)"
    },
    risk: {
      color: "#fca5a5",
      background: "rgba(239,68,68,0.14)",
      border: "1px solid rgba(239,68,68,0.35)"
    },
    running: {
      color: "#93c5fd",
      background: "rgba(59,130,246,0.16)",
      border: "1px solid rgba(59,130,246,0.34)"
    },
    neutral: {
      color: "#cbd5e1",
      background: "rgba(148,163,184,0.12)",
      border: "1px solid rgba(148,163,184,0.28)"
    }
  };
  return {
    ...(map[tone] || map.neutral),
    fontSize: "11px",
    fontWeight: 700,
    borderRadius: "999px",
    padding: "5px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px"
  };
};

const formatNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("tr-TR");
};

const formatPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n)}%`;
};

const formatTime = (value) => {
  if (!value) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return new Date(n).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Date(n).toLocaleString("tr-TR");
};

const normalizeStep = (step) => {
  if (!step) return null;
  if (typeof step === "string") {
    return { key: step, label: step, status: "pending", attempt: 0, durationMs: 0, messağe: "" };
  }
  return {
    key: String(step.key || step.id || step.label || ""),
    label: String(step.label || step.key || "Adim"),
    status: String(step.status || "pending"),
    attempt: Number(step.attempt || 0),
    durationMs: Number(step.durationMs || 0),
    messağe: String(step.messağe || "")
  };
};

const renderStepTone = (status) => {
  if (status === "ok") return "ok";
  if (status === "failed") return "risk";
  if (status === "running") return "running";
  return "neutral";
};

const getLog = (entry) => {
  if (typeof entry === "string") {
    return { text: entry, at: Date.now(), level: "info" };
  }
  return {
    text: String(entry?.text || ""),
    at: Number(entry?.at || Date.now()),
    level: String(entry?.level || "info")
  };
};

const toneFromStatus = (value) => {
  const text = String(value || "").toLowerCase();
  if (["ok", "hazır", "healthy", "ready", "aktif", "go"].some((item) => text.includes(item))) return "ok";
  if (["warn", "bekliyor", "review", "conditional", "risk"].some((item) => text.includes(item))) return "warn";
  if (["fail", "error", "hold", "kritik", "down"].some((item) => text.includes(item))) return "risk";
  return "neutral";
};

const SectionHeader = ({ eyebrow, title, desc, right }) => (
  <div style={rowBetween}>
    <div>
      {eyebrow ? <div className="tech-badge" style={{ marginBottom: "8px" }}>{eyebrow}</div> : null}
      <h3 className="section-title" style={{ margin: 0, fontSize: "26px" }}>{title}</h3>
      {desc ? <p style={{ margin: "8px 0 0", color: "rgba(236,244,228,0.76)" }}>{desc}</p> : null}
    </div>
    {right}
  </div>
);

const StatCard = ({ label, value, detail, tone = "neutral" }) => (
  <div style={card}>
    <small style={{ color: "rgba(236,244,228,0.55)" }}>{label}</small>
    <strong style={{ display: "block", fontSize: "24px", marginTop: "6px", color: tone === "ok" ? "var(--sprout)" : tone === "warn" ? "#fbbf24" : tone === "risk" ? "#fca5a5" : "var(--cream)" }}>
      {value}
    </strong>
    {detail ? <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.62)" }}>{detail}</small> : null}
  </div>
);

const WorkspacePills = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        className={active === tab.key ? "btn-primary" : "btn-secondary"}
        onClick={() => onChange(tab.key)}
        style={{ minWidth: "110px" }}
      >
        {tab.icon ? <tab.icon size={14} /> : null}
        {tab.label}
      </button>
    ))}
  </div>
);

export default function DemosTab({
  showFullDemo,
  setShowFullDemo,
  startQuickDemo,
  applyDemoPack,
  demoPack,
  setDemoPack,
  prepareDemosForUse,
  demoBootstrapRunning,
  demoBootstrapReady,
  demoBootstrapSummary,
  runDemoSmokeTest,
  demoSmokeResult,
  demoSmokeHistory,
  demoControlMetrics,
  demoRiskLevel,
  demoOpsStatus,
  runDemoAutopilot,
  demoAutopilotRunning,
  demoAutopilotSummary,
  demoAutopilotSteps,
  demoAutopilotLogs,
  runDemoAutopilotStep,
  runDemoEndToEnd,
  runDemoAutoRepair,
  runDemoResetSeed,
  demoFlowLibrary,
  runDemoFlow,
  runAllDemoFlows,
  runDemoFlowPreset,
  runFailedDemoFlows,
  demoFlowStats,
  demoFlowRunning,
  demoFlowStatus,
  demoRecommendedCommands,
  runDemoCommand,
  econCrop,
  setEconCrop,
  cropLabelMap,
  econArea,
  setEconArea,
  econYield,
  setEconYield,
  econPrice,
  setEconPrice,
  econTotals,
  selectedPlant,
  presentationMode,
  activatePresentationMode,
  investorPresentationScript,
  runInvestorPreflight,
  investorPreflight,
  investorPreflightRunning,
  runInvestorDryRun,
  runInvestorShowcase,
  investorExecutionDecision,
  investorHighlights,
  investorBlockers,
  investorRiskCards,
  copyInvestorScript,
  captureInvestorSnapshot,
  exportInvestorBrief,
  exportInvestorOnePager,
  exportInvestorDeckHtml,
  generateDemoReport,
  downloadDemoReport,
  modelHealth,
  modelHealthError,
  modelDiagnostics,
  modelDiagnosticsError,
  runModelSelfCheck,
  modelSelfCheckRunning,
  supportsModelSelfCheck,
  resetModelDiagnostics,
  modelDiagnosticsResetRunning,
  supportsModelDiagnostics,
  demoCompactItems,
  steps,
  demoInsightCards,
  demoStudioAssets,
  demoWorkbenchState,
  demoWorkbenchActions,
  demoStatusCards,
  demoYieldModel,
  demoYieldForecast,
  setDemoYieldModel,
  weatherSummary,
  forecastSummary,
  maxWindKmh,
  fieldScore,
  diseaseTrends,
  weather,
  soilReport,
  metrics,
  backendInfo,
  integrationsHealth,
  loadIntegrationsHealth,
  integrationsHealthError,
  metricsError,
  metricsStale,
  metricsUpdatedAt
}) {
  const [workspaceTab, setWorkspaceTab] = useState("overview");

  const smokeItems = Array.isArray(demoSmokeResult?.items) ? demoSmokeResult.items : [];
  const autopilotSteps = (Array.isArray(demoAutopilotSteps) ? demoAutopilotSteps : []).map(normalizeStep).filter(Boolean);
  const autopilotLogs = (Array.isArray(demoAutopilotLogs) ? demoAutopilotLogs : []).map(getLog);
  const flowLibrary = Array.isArray(demoFlowLibrary) ? demoFlowLibrary : [];
  const smokeHistory = Array.isArray(demoSmokeHistory) ? demoSmokeHistory : [];
  const recommendedCommands = Array.isArray(demoRecommendedCommands) ? demoRecommendedCommands : [];
  const investorChecks = Array.isArray(investorPreflight?.checks) ? investorPreflight.checks : [];
  const riskTone =
    demoRiskLevel?.tone === "safe" ? "ok" : demoRiskLevel?.tone === "warn" ? "warn" : "risk";
  const modelDiag = modelDiagnostics?.diagnostics;
  const runButtonDisabled = Boolean(demoAutopilotRunning || demoFlowRunning);
  const defaultCrop = selectedPlant?.id || "domates";
  const studio = demoWorkbenchState?.studio || {};
  const sandbox = demoWorkbenchState?.sandbox || {};
  const investorStudio = demoWorkbenchState?.investor || {};
  const modelStudio = demoWorkbenchState?.model || {};
  const systemStudio = demoWorkbenchState?.system || {};
  const actions = demoWorkbenchActions || {};
  const packValue = demoPack || "normal";
  const workspaceTabs = useMemo(
    () => [
      { key: "overview", label: "Studio", icon: LayoutGrid },
      { key: "ops", label: "Operasyon", icon: Rocket },
      { key: "sandbox", label: "Sandbox", icon: SlidersHorizontal },
      { key: "investor", label: "Yatirimci", icon: Presentation },
      { key: "model", label: "Model", icon: Bot },
      { key: "system", label: "Sistem", icon: Database }
    ],
    []
  );

  const addRoutineItem = () => {
    const text = String(sandbox.routineInput || "").trim();
    if (!text) return;
    actions.setRoutine?.((prev) => [...(Array.isArray(prev) ? prev : []), text].slice(-8));
    actions.setRoutineInput?.("");
  };

  const updateContact = (field, value) => {
    actions.setContactForm?.((prev) => ({ ...(prev || {}), [field]: value }));
  };

  const topMetrics = [
    {
      label: "Moduller",
      value: `${formatNumber(demoControlMetrics?.readyModules)}/${formatNumber(demoControlMetrics?.totalModules)}`,
      detail: demoBootstrapReady ? "hazır" : "hazırlaniyor",
      tone: demoBootstrapReady ? "ok" : "warn"
    },
    {
      label: "Run score",
      value: `${formatNumber(demoControlMetrics?.runScore)}/100`,
      detail: demoRiskLevel?.label || "risk sinyali",
      tone: riskTone
    },
    {
      label: "Model",
      value: modelHealth?.healthy ? "Healthy" : "Review",
      detail: modelHealthError || "diagnostics",
      tone: modelHealth?.healthy ? "ok" : "warn"
    },
    {
      label: "Aktif istasyon",
      value: studio.activeDock?.label || "Yield",
      detail: studio.strictModelActive ? "strict model aktif" : "standard mod",
      tone: studio.strictModelActive ? "ok" : "neutral"
    }
  ];

  return (
    <div className="tab-page">
      <div className="tab-content-inner">
        <section
          style={{
            padding: "42px 24px 32px",
            background: "linear-gradient(180deg, rgba(10,18,12,0.3) 0%, transparent 100%)",
            borderRadius: "24px",
            marginBottom: "20px",
            border: "1px solid rgba(143,188,69,0.1)",
            backdropFilter: "blur(8px)",
            position: "relative",
            overflow: "hidden",
            display: "grid",
            gap: "18px"
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 20% 20%, rgba(143,188,69,0.08) 0%, transparent 45%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "18px" }}>
            <div style={rowBetween}>
              <div>
                <div className="tech-badge" style={{ marginBottom: "10px" }}>AGROGUARD_LABS</div>
                <h2 style={{ fontSize: "38px", fontWeight: 900, margin: 0, lineHeight: 1.08, letterSpacing: "-1px" }}>
                  Demo <em style={{ color: "var(--sprout)" }}>Studio</em>
                </h2>
                <p style={{ fontSize: "15px", opacity: 0.72, marginTop: "10px", maxWidth: "620px", lineHeight: 1.5 }}>
                  Bug fix, yatirimci sunumu, model gozlemi ve demo operasyonlarini tek workspace icinde yonet.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={statusChipStyle(riskTone)}><ShieldAlert size={13} /> Risk: {demoRiskLevel?.label || "-"}</span>
                <span style={statusChipStyle(demoBootstrapReady ? "ok" : "warn")}><Activity size={13} /> {demoBootstrapReady ? "Hazır" : "Bootstrap"}</span>
                <span style={statusChipStyle(studio.strictModelActive ? "ok" : "neutral")}><Sparkles size={13} /> {studio.strictModelActive ? "Strict" : "Standard"}</span>
              </div>
            </div>

            <WorkspacePills tabs={workspaceTabs} active={workspaceTab} onChange={setWorkspaceTab} />

            <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {topMetrics.map((item) => <StatCard key={item.label} {...item} />)}
            </div>
          </div>
        </section>

        {!showFullDemo ? (
          <section className="panel" style={{ ...sectionFrame, textAlign: "center" }}>
            <Beaker size={42} color="rgba(143,188,69,0.8)" style={{ justifySelf: "center" }} />
            <h3 className="section-title" style={{ fontSize: "24px", margin: 0 }}>Gelismis demo paneli kapali</h3>
            <p style={{ margin: 0, color: "rgba(236,244,228,0.76)" }}>
              Yatirimci sunumu, smoke, autopilot ve sistem konsolu icin paneli ac.
            </p>
            <div style={{ justifySelf: "center" }}>
              <button className="btn-primary" onClick={() => setShowFullDemo?.(true)}>
                <Beaker size={14} /> Gelistirme panelini ac
              </button>
            </div>
          </section>
        ) : null}

        {showFullDemo && workspaceTab === "overview" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader
                eyebrow="Workspace"
                title={studio.ribbon?.title || "Demo orkestrasyon merkezi"}
                desc={studio.ribbon?.desc || "Demo akislarini temiz sekmelerle yonet."}
                right={<span style={statusChipStyle("neutral")}><Compass size={13} /> Dock: {studio.activeDock?.label || "Yield"}</span>}
              />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  ["all", "Tüm"],
                  ["core", "Core"],
                  ["operations", "Ops"],
                  ["intelligence", "AI"],
                  ["commerce", "Pazar"],
                  ["compliance", "Uygünlük"],
                  ["learning", "Bilgi"]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={studio.featureTab === key ? "btn-primary" : "btn-secondary"}
                    onClick={() => actions.handleFeatureTab?.(key)}
                  >
                    <Filter size={13} /> {label}
                  </button>
                ))}
              </div>
              <div style={gridAuto}>
                {(studio.summaryCards || []).map((item) => (
                  <StatCard key={item.title} label={item.title} value={item.value} tone="neutral" />
                ))}
              </div>
              <div style={gridAuto}>
                {(studio.showcaseCards || []).map((item) => (
                  <div key={item.key} style={card}>
                    <div style={rowBetween}>
                      <strong>{item.title}</strong>
                      <span style={statusChipStyle(item.tone === "emerald" ? "ok" : item.tone === "amber" ? "warn" : "neutral")}>{item.metric}</span>
                    </div>
                    <small style={{ display: "block", marginTop: "8px", color: "rgba(236,244,228,0.7)" }}>{item.desc}</small>
                  </div>
                ))}
              </div>
              <div style={gridAuto}>
                {(studio.showcaseWallItems || []).map((item) => (
                  <div key={item.key} style={card}>
                    <small style={{ color: "rgba(236,244,228,0.58)" }}>{item.title}</small>
                    <strong style={{ display: "block", fontSize: "22px", marginTop: "6px" }}>{item.value}</strong>
                    <small style={{ display: "block", marginTop: "4px", color: "rgba(236,244,228,0.62)" }}>{item.subtitle}</small>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(studio.heroSignals || []).map((item) => (
                  <span key={item.label} style={statusChipStyle(toneFromStatus(item.tone || item.value))}>{item.label}: {item.value}</span>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Storyline" title="Sunum ve demo akisi" desc="Hizli hikaye akisini yatirimci ve demo diliyle toparlar." />
              <div style={gridAuto}>
                {(Array.isArray(steps) ? steps : []).map((step, index) => (
                  <div key={step.id || step.title || index} style={card}>
                    <small style={{ color: "rgba(236,244,228,0.5)" }}>Adim {index + 1}</small>
                    <strong style={{ display: "block", marginTop: "6px" }}>{step.title || step.label}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.7)" }}>{step.detail || step.hint || step.desc || "-"}</small>
                  </div>
                ))}
              </div>
              <div style={gridAuto}>
                {(Array.isArray(demoInsightCards) ? demoInsightCards : []).slice(0, 4).map((item) => (
                  <div key={item.title} style={card}>
                    <strong>{item.title}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.7)" }}>{item.detail}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Asset Library" title="İçerik ve görsel havuzu" desc="Yatırımcı sunumu ve demo için hazır veri kütüphaneleri." />
              <div style={gridAuto}>
                {(Array.isArray(demoCompactItems) ? demoCompactItems : []).slice(0, 6).map((item) => (
                  <div key={item.title} style={card}>
                    <strong>{item.title}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.68)" }}>{item.detail}</small>
                  </div>
                ))}
              </div>
              <div style={gridAuto}>
                {(demoStudioAssets?.guideCollections || []).slice(0, 8).map((item) => (
                  <div key={item.id} style={card}>
                    <small>{item.label}</small>
                    <strong style={{ display: "block", fontSize: "22px", marginTop: "6px" }}>{formatNumber(item.count)}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.68)" }}>{item.sample}</small>
                  </div>
                ))}
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {(demoStudioAssets?.visuals || []).map((asset) => (
                  <div key={asset.id} style={{ ...card, overflow: "hidden", padding: 0 }}>
                    <div style={{ aspectRatio: "1.35 / 1", background: "rgba(0,0,0,0.25)" }}>
                      <img src={asset.src} alt={asset.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <strong>{asset.title}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {showFullDemo && workspaceTab === "ops" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Command Center" title="Demo operasyon komutlari" desc="Hazirla, smoke, autopilot ve full run akisini ayni panelde yonet." />
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <button className="btn-primary" onClick={() => startQuickDemo?.("normal")}><Play size={14} /> Normal</button>
                <button className="btn-secondary" onClick={() => startQuickDemo?.("frost_stress")}><ShieldAlert size={14} /> Don stresi</button>
                <button className="btn-secondary" onClick={() => startQuickDemo?.("pest_pressure")}><AlertTriangle size={14} /> Zararli baskisi</button>
                <button className="btn-secondary" disabled={Boolean(demoBootstrapRunning || runButtonDisabled)} onClick={() => prepareDemosForUse?.()}><RefreshCcw size={14} /> Hazirla</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoSmokeTest?.()}><Activity size={14} /> Smoke</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoAutopilot?.()}><Rocket size={14} /> Autopilot</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoEndToEnd?.()}><Play size={14} /> End-to-end</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoAutoRepair?.()}><ShieldAlert size={14} /> Oto onarim</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoResetSeed?.()}><RefreshCcw size={14} /> Reset + seed</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runAllDemoFlows?.()}><Terminal size={14} /> Tüm akışlar</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runFailedDemoFlows?.()}><AlertTriangle size={14} /> Fail retry</button>
              </div>
              {demoOpsStatus ? <div style={card}>{demoOpsStatus}</div> : null}
              {demoFlowStatus ? <div style={card}>{demoFlowStatus}</div> : null}
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Health" title="Hazirlik ve modul durumu" desc={demoBootstrapSummary || "Modul hazırligi ve smoke skorunu izler."} />
              <div style={gridAuto}>
                {(Array.isArray(demoStatusCards) ? demoStatusCards : []).map((item) => (
                  <div key={item.key} style={card}>
                    <div style={rowBetween}>
                      <strong>{item.title}</strong>
                      <span style={statusChipStyle(toneFromStatus(item.status))}>{item.status}</span>
                    </div>
                    <small style={{ display: "block", marginTop: "8px", color: "rgba(236,244,228,0.68)" }}>{item.detail}</small>
                  </div>
                ))}
              </div>
              <div style={gridAuto}>
                <StatCard label="Smoke sonucu" value={`${formatNumber(demoControlMetrics?.smokePass)}/${formatNumber(demoControlMetrics?.smokeTotal)}`} tone="ok" />
                <StatCard label="Flow başarı" value={formatPct(demoFlowStats?.successRate)} tone="neutral" />
                <StatCard label="Ortalama süre" value={`${formatNumber(Math.round(Number(demoFlowStats?.avgDurationMs || 0) / 1000))} sn`} tone="neutral" />
                <StatCard label="Hazirlik" value={formatNumber(demoControlMetrics?.runScore)} detail="run score" tone={riskTone} />
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Flow Lab" title="Preset ve akış kütüphanesi" desc="Seçili paketler ve tavsiye komutlarıyla hızlı smoke koşusu yap." />
              <div style={{ ...gridAuto, gridTemplateColumns: "minmax(220px, 1.1fr) 1fr 1fr" }}>
                <select className="select-premium" value={packValue} onChange={(e) => setDemoPack?.(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="riskli">Riskli</option>
                  <option value="pazar-hizli">Pazar hızlı</option>
                  <option value="pazar-durgun">Pazar durgun</option>
                </select>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => applyDemoPack?.(packValue)}><Play size={14} /> Paketi uygula</button>
                <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoFlowPreset?.("all_round")}><Terminal size={14} /> Tam tur</button>
              </div>
              <div style={gridAuto}>
                {recommendedCommands.length ? recommendedCommands.map((cmd) => (
                  <button key={cmd.id} className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoCommand?.(cmd.id)}>
                    <Terminal size={14} /> {cmd.title}
                  </button>
                )) : null}
              </div>
              <div style={gridAuto}>
                {flowLibrary.map((flow) => (
                  <div key={flow.id} style={card}>
                    <div style={rowBetween}>
                      <strong>{flow.title}</strong>
                      <button className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoFlow?.(flow.id)}>
                        <Play size={14} /> {flow.actionLabel || "Calistir"}
                      </button>
                    </div>
                    <small style={{ display: "block", marginTop: "8px", color: "rgba(236,244,228,0.68)" }}>{flow.detail}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader
                eyebrow="Smoke + Autopilot"
                title="Canli test izleme"
                right={<span style={statusChipStyle(demoAutopilotRunning ? "running" : "neutral")}><Rocket size={13} /> {demoAutopilotRunning ? "Autopilot çalışıyor" : "Autopilot beklemede"}</span>}
              />
              <div style={{ ...gridAuto, gridTemplateColumns: "1.15fr 1fr" }}>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "10px" }}>Son smoke sonucu</strong>
                  {!smokeItems.length ? <small>Smoke sonucu henuz yok.</small> : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {smokeItems.map((item) => (
                        <div key={item.id || item.label} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                          <span>{item.label}</span>
                          <span style={statusChipStyle(item.ok ? "ok" : "risk")}>
                            {item.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {item.ok ? "ok" : `fail (${item.status || 0})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <hr style={{ borderColor: "rgba(143,188,69,0.16)", margin: "12px 0" }} />
                  <strong style={{ display: "block", marginBottom: "8px" }}>Smoke gecmisi</strong>
                  {!smokeHistory.length ? <small>Kayıt yok.</small> : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {smokeHistory.slice(0, 6).map((row) => (
                        <div key={row.id} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                          <small>{formatDateTime(row.at)}</small>
                          <small>{row.passCount}/{row.total}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "10px" }}>Autopilot adimlari</strong>
                  <div style={{ marginBottom: "10px" }}>
                    <small>Ilerleme: {formatNumber(demoAutopilotSummary?.done)}/{formatNumber(demoAutopilotSummary?.total)} • %{formatNumber(demoAutopilotSummary?.progressPct)}</small>
                    <div style={{ width: "100%", height: "8px", borderRadius: "8px", background: "rgba(143,188,69,0.14)", marginTop: "6px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, Number(demoAutopilotSummary?.progressPct || 0)))}%`, height: "100%", background: "linear-gradient(90deg, rgba(127,179,213,0.9), rgba(143,188,69,0.9))" }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                    {autopilotSteps.length ? autopilotSteps.map((step) => (
                      <div key={step.key} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                        <small>{step.label}</small>
                        <span style={statusChipStyle(renderStepTone(step.status))}>{step.status}{step.attempt ? ` #${step.attempt}` : ""}</span>
                      </div>
                    )) : <small>Autopilot adimi henuz uretilmedi.</small>}
                  </div>
                  <div style={gridAuto}>
                    {["pack", "land", "trade", "smoke"].map((key) => (
                      <button key={key} className="btn-secondary" disabled={runButtonDisabled} onClick={() => runDemoAutopilotStep?.(key)}>
                        <Play size={14} /> {key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={card}>
                <strong style={{ display: "block", marginBottom: "8px" }}>Autopilot loglari</strong>
                {!autopilotLogs.length ? <small>Log kaydi yok.</small> : (
                  <div style={{ display: "grid", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                    {autopilotLogs.slice(0, 20).map((log, idx) => (
                      <div key={`${log.at}-${idx}`} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                        <small>{formatTime(log.at)}</small>
                        <small style={{ textAlign: "right" }}>{log.text}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}

        {showFullDemo && workspaceTab === "sandbox" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Yield Sandbox" title="Finans + rekolte simulasyonu" desc="Canli verim etkisi, gelir senaryolari ve operasyon aksiyonu." />
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <small>Urun</small>
                  <select className="select-premium" value={econCrop || defaultCrop} onChange={(e) => setEconCrop?.(e.target.value)}>
                    {Object.entries(cropLabelMap || {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <small>Alan (da)</small>
                  <input className="select-premium" type="number" value={Number(econArea || 0)} onChange={(e) => setEconArea?.(Number(e.target.value || 0))} />
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <small>Verim (kg/da)</small>
                  <input className="select-premium" type="number" value={Number(econYield || 0)} onChange={(e) => setEconYield?.(Number(e.target.value || 0))} />
                </div>
                <div style={{ display: "grid", gap: "6px" }}>
                  <small>Fiyat (TL/kg)</small>
                  <input className="select-premium" type="number" step="0.1" value={Number(econPrice || 0)} onChange={(e) => setEconPrice?.(Number(e.target.value || 0))} />
                </div>
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {[
                  { key: "climateImpact", label: "İklim etkisi" },
                  { key: "diseaseImpact", label: "Hastalik etkisi" },
                  { key: "operationImpact", label: "Operasyon etkisi" },
                  { key: "priceImpact", label: "Fiyat etkisi" }
                ].map((slider) => (
                  <div key={slider.key} style={card}>
                    <div style={rowBetween}>
                      <small>{slider.label}</small>
                      <strong>{Number(demoYieldForecast?.baseImpactPct || 0)}%</strong>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      value={Number(demoYieldModel?.[slider.key] || 0)}
                      onChange={(e) =>
                        setDemoYieldModel?.((prev) => ({
                          ...(prev || {}),
                          [slider.key]: Number(e.target.value || 0)
                        }))
                      }
                      style={{ width: "100%", marginTop: "8px" }}
                    />
                  </div>
                ))}
              </div>
              <div style={gridAuto}>
                {(Array.isArray(demoYieldForecast?.scenarios) ? demoYieldForecast.scenarios : []).map((item) => (
                  <div key={item.id} style={card}>
                    <strong style={{ display: "block", marginBottom: "8px" }}>{item.label}</strong>
                    <small style={{ display: "block" }}>Verim: {formatNumber(item.totalYieldKg)} kg</small>
                    <small style={{ display: "block" }}>Birim: {formatNumber(item.unitPrice)} TL/kg</small>
                    <small style={{ display: "block" }}>Ciro: {formatNumber(item.revenue)} TL</small>
                    <small style={{ display: "block" }}>Net: {formatNumber(item.net)} TL</small>
                  </div>
                ))}
              </div>
              {econTotals ? (
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "6px" }}>Canlı finans özeti</strong>
                  <small>Ciro {formatNumber(econTotals.revenue)} TL • Maliyet {formatNumber(econTotals.cost)} TL • Net {formatNumber(econTotals.net)} TL • ROI %{formatNumber(econTotals.roi)}</small>
                </div>
              ) : null}
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Action Plan" title="Operasyon ve mudahale paneli" desc="Risk aksiyonlari, check-list ve saha logu." />
              <div style={gridAuto}>
                <StatCard label="Readiness grade" value={sandbox.readinessGrade || "-"} detail={sandbox.maturity?.level || "-"} tone="ok" />
                <StatCard label="Olgünlük skoru" value={`${formatNumber(sandbox.maturity?.score)}/100`} detail={`Checklist ${formatNumber(sandbox.maturity?.checklistPct)}%`} tone="neutral" />
                <StatCard label="Tarama kapasitesi" value={formatNumber(sandbox.opsSummary?.capacity?.scan)} detail={`hedef ${formatNumber(sandbox.opsSummary?.demand?.scan)}`} tone="neutral" />
                <StatCard label="Spray bottleneck" value={sandbox.opsSummary?.bottleneck || "-"} detail={`hazırlık ${formatNumber(sandbox.opsSummary?.readiness)}/100`} tone="warn" />
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "1fr 1fr" }}>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Bugun aksiyonlari</strong>
                  {(sandbox.actionPlan || []).length ? sandbox.actionPlan.map((item, idx) => <small key={`${item}-${idx}`} style={{ display: "block", marginBottom: "6px" }}>- {item}</small>) : <small>Aksiyon yok.</small>}
                  <hr style={{ borderColor: "rgba(143,188,69,0.16)", margin: "12px 0" }} />
                  <strong style={{ display: "block", marginBottom: "8px" }}>Mudahale plani</strong>
                  {(sandbox.interventionPlan || []).length ? sandbox.interventionPlan.map((item) => <small key={item.key} style={{ display: "block", marginBottom: "6px" }}>- {item.label}: {item.action}</small>) : <small>Mudahale plani yok.</small>}
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Checklist</strong>
                  {(sandbox.demoChecklist || []).length ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {sandbox.demoChecklist.map((item) => (
                        <button key={item.id} type="button" className="btn-secondary" style={{ justifyContent: "space-between" }} onClick={() => actions.toggleDemoChecklistItem?.(item.id)}>
                          <span>{item.label}</span>
                          <span style={statusChipStyle(item.done ? "ok" : "neutral")}>{item.done ? "tamam" : "bekliyor"}</span>
                        </button>
                      ))}
                    </div>
                  ) : <small>Checklist yok.</small>}
                </div>
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {Object.entries(sandbox.demoExecution || {}).map(([key, value]) => (
                  <div key={key} style={card}>
                    <div style={rowBetween}>
                      <strong>{key}</strong>
                      <span style={statusChipStyle("neutral")}>{formatNumber(value)}</span>
                    </div>
                    <input className="select-premium" type="number" value={Number(value || 0)} onChange={(e) => actions.updateDemoExecution?.(key, e.target.value)} style={{ marginTop: "8px" }} />
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Voice + Calendar" title="Saha notlari ve takvim aksiyonu" desc="Sesli not, günlük log ve takvim aktarımini kullan." />
              <div style={{ ...gridAuto, gridTemplateColumns: "1.1fr 1fr" }}>
                <div style={card}>
                  <div style={rowBetween}>
                    <strong>Sesli not</strong>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn-secondary" onClick={() => actions.startDemoVoice?.()} disabled={Boolean(sandbox.demoVoiceRecording)}><Mic size={14} /> Başlat</button>
                      <button className="btn-secondary" onClick={() => actions.stopDemoVoice?.()} disabled={!sandbox.demoVoiceRecording}><Mic size={14} /> Durdur</button>
                    </div>
                  </div>
                  <textarea className="select-premium" rows={4} value={sandbox.demoVoiceDraft || ""} onChange={(e) => actions.setDemoVoiceDraft?.(e.target.value)} style={{ marginTop: "10px", resize: "vertical" }} placeholder="Saha notunu yaz veya ses kaydina donustur..." />
                  <div style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
                    {(sandbox.demoVoiceHistory || []).length ? sandbox.demoVoiceHistory.map((item) => (
                      <div key={item.id} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                        <small>{item.time}</small>
                        <small style={{ textAlign: "right" }}>{item.note}</small>
                      </div>
                    )) : <small>Ses kaydi yok.</small>}
                  </div>
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Demo timeline</strong>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(sandbox.demoTimeline || []).map((item) => (
                      <button key={`${item.day}-${item.task}`} className="btn-secondary" style={{ justifyContent: "space-between" }} onClick={() => actions.addDemoTimelineToCalendar?.(item)}>
                        <span>{item.day} • {item.task}</span>
                        <span style={statusChipStyle(sandbox.demoTimelineAdded?.[item.day] ? "ok" : "neutral")}>
                          {sandbox.demoTimelineAdded?.[item.day] ? "eklendi" : "takvime at"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                    <small>Rutin not gir</small>
                    <input className="select-premium" value={sandbox.routineInput || ""} onChange={(e) => actions.setRoutineInput?.(e.target.value)} placeholder="Günlük kontrol notu" />
                    <button className="btn-secondary" onClick={addRoutineItem}><Calendar size={14} /> Rutine ekle</button>
                    {(sandbox.routine || []).length ? <small style={{ color: "rgba(236,244,228,0.68)" }}>{sandbox.routine.join(" • ")}</small> : null}
                  </div>
                  {(sandbox.demoDailyLog || []).length ? (
                    <div style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
                      {sandbox.demoDailyLog.slice(0, 5).map((line, idx) => <small key={`${line}-${idx}`}>- {line}</small>)}
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={rowBetween}>
                <span style={statusChipStyle("neutral")}>Rapor: {sandbox.demoReportStatus || "hazır değil"}</span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn-secondary" onClick={() => generateDemoReport?.()}><FileText size={14} /> Rapor uret</button>
                  <button className="btn-secondary" onClick={() => actions.copyDemoReport?.()}><FileText size={14} /> Rapor kopyala</button>
                  <button className="btn-secondary" onClick={() => downloadDemoReport?.()}><Download size={14} /> Rapor indir</button>
                  <button className="btn-secondary" onClick={() => actions.resetDemoControls?.()}><RefreshCcw size={14} /> Sifirla</button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {showFullDemo && workspaceTab === "investor" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader
                eyebrow="Investor Room"
                title="Yatirimci sunum merkezi"
                desc={investorExecutionDecision?.note || "Preflight, pitch akisi ve export seti."}
                right={<span style={statusChipStyle(investorExecutionDecision?.tone === "ok" ? "ok" : "warn")}><Presentation size={13} /> {investorExecutionDecision?.label || "Karar bekleniyor"}</span>}
              />
              <div style={gridAuto}>
                <button className="btn-secondary" onClick={() => runInvestorPreflight?.()} disabled={Boolean(investorPreflightRunning)}><Activity size={14} /> {investorPreflightRunning ? "Preflight..." : "Preflight"}</button>
                <button className="btn-secondary" onClick={() => runInvestorDryRun?.()} disabled={runButtonDisabled}><Play size={14} /> Dry run</button>
                <button className="btn-secondary" onClick={() => runInvestorShowcase?.()} disabled={runButtonDisabled}><Rocket size={14} /> Showcase</button>
                <button className="btn-secondary" onClick={() => activatePresentationMode?.()}><Presentation size={14} /> {presentationMode ? "Sunum açık" : "Sunum modu"}</button>
                <button className="btn-secondary" onClick={() => captureInvestorSnapshot?.()}><FileText size={14} /> Snapshot</button>
                <button className="btn-secondary" onClick={() => copyInvestorScript?.()}><FileText size={14} /> Script kopyala</button>
                <button className="btn-secondary" onClick={() => exportInvestorBrief?.()}><Download size={14} /> Brief JSON</button>
                <button className="btn-secondary" onClick={() => exportInvestorOnePager?.()}><Download size={14} /> One pager</button>
                <button className="btn-secondary" onClick={() => exportInvestorDeckHtml?.()}><Download size={14} /> Deck HTML</button>
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Pitch Control" title="Sunum timer ve sahne yönetimi" desc="Sunum modunu ayni ekranda prova et." />
              <div style={gridAuto}>
                <StatCard label="Sahne" value={`${formatNumber(investorStudio.presentationScene + 1)}/${formatNumber(investorStudio.sceneCount)}`} detail={investorStudio.presentationFullscreen ? "fullscreen" : "windowed"} tone="neutral" />
                <StatCard label="Pitch timer" value={`${formatNumber(investorStudio.pitchSeconds)} sn`} detail={`toplam ${formatNumber(investorStudio.pitchDurationSeconds)} sn`} tone="ok" />
                <StatCard label="Auto advance" value={investorStudio.autoSceneAdvance ? "Açık" : "Kapali"} detail={`slot ${formatNumber(investorStudio.sceneAdvanceSeconds)} sn`} tone={investorStudio.autoSceneAdvance ? "ok" : "warn"} />
                <StatCard label="Momentum" value={investorStudio.investorMomentum?.trend || "-"} detail={`delta ${formatNumber(investorStudio.investorMomentum?.delta)}`} tone="neutral" />
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div style={card}>
                  <small>Sunum suresi</small>
                  <input type="range" min={45} max={300} value={Number(investorStudio.pitchDurationSeconds || 90)} onChange={(e) => actions.handlePitchDurationChange?.(e.target.value)} style={{ width: "100%", marginTop: "8px" }} />
                </div>
                <div style={card}>
                  <small>Sahne gecis suresi</small>
                  <input type="range" min={8} max={120} value={Number(investorStudio.sceneAdvanceSeconds || 22)} onChange={(e) => actions.handleSceneAdvanceChange?.(e.target.value)} style={{ width: "100%", marginTop: "8px" }} />
                </div>
                <div style={{ ...card, display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn-secondary" onClick={() => actions.startPresentationFlow?.()}><Play size={14} /> Zamanlayıcıyı başlat</button>
                  <button className="btn-secondary" onClick={() => actions.setAutoSceneAdvance?.((prev) => !prev)}><RefreshCcw size={14} /> Auto toggle</button>
                  <button className="btn-secondary" onClick={() => actions.togglePresentationFullscreen?.()}><Presentation size={14} /> Fullscreen</button>
                </div>
              </div>
              <div style={gridAuto}>
                {(investorStudio.presentationScenes || []).map((scene, idx) => (
                  <div key={scene.id} style={{ ...card, borderColor: idx === investorStudio.presentationScene ? "rgba(143,188,69,0.45)" : card.border }}>
                    <div style={rowBetween}>
                      <strong>{scene.title}</strong>
                      <span style={statusChipStyle(idx === investorStudio.presentationScene ? "ok" : "neutral")}>Sahne {idx + 1}</span>
                    </div>
                    <small style={{ display: "block", marginTop: "8px", color: "rgba(236,244,228,0.68)" }}>{scene.detail}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Pitch Content" title="Preflight, risk ve veri odasi" desc="Sunumda kullanilaçak cekirdek mesajlar ve risk kartlari." />
              <div style={{ ...gridAuto, gridTemplateColumns: "1.2fr 1fr 1fr" }}>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Preflight kontrolleri</strong>
                  {!investorChecks.length ? <small>Preflight sonucu yok.</small> : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {investorChecks.slice(0, 8).map((check) => (
                        <div key={check.id} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                          <small>{check.label}</small>
                          <span style={statusChipStyle(check.ok ? "ok" : "risk")}>{check.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{check.status || 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Highlights</strong>
                  {(Array.isArray(investorHighlights) ? investorHighlights : []).length ? investorHighlights.slice(0, 6).map((item, idx) => <small key={`${item}-${idx}`} style={{ display: "block", marginBottom: "6px" }}>- {item}</small>) : <small>Highlight yok.</small>}
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Bloker + risk</strong>
                  {(Array.isArray(investorBlockers) ? investorBlockers : []).length ? investorBlockers.slice(0, 4).map((item, idx) => <small key={`${item?.label || item}-${idx}`} style={{ display: "block", marginBottom: "6px" }}>- {item?.label || item}</small>) : <small>Bloker yok.</small>}
                  <hr style={{ borderColor: "rgba(143,188,69,0.16)", margin: "12px 0" }} />
                  {(Array.isArray(investorRiskCards) ? investorRiskCards : []).slice(0, 4).map((item, idx) => <small key={`${item?.title || idx}`} style={{ display: "block", marginBottom: "6px" }}>- {item?.title}: {item?.note || item?.value || item?.state}</small>)}
                </div>
              </div>
              <div style={gridAuto}>
                {(investorStudio.investorDataRoom || []).map((room) => (
                  <div key={room.id} style={card}>
                    <strong style={{ display: "block", marginBottom: "8px" }}>{room.title}</strong>
                    {(room.points || []).map((point, idx) => <small key={`${room.id}-${idx}`} style={{ display: "block", marginBottom: "6px" }}>- {point}</small>)}
                  </div>
                ))}
              </div>
              <div style={card}>
                <strong style={{ display: "block", marginBottom: "6px" }}>Sunum scripti</strong>
                <small style={{ whiteSpace: "pre-wrap", color: "rgba(236,244,228,0.72)" }}>{String(investorPresentationScript || "Yatirimci scripti hazır değil.")}</small>
              </div>
            </section>
          </>
        ) : null}

        {showFullDemo && workspaceTab === "model" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Model Ops" title="Model izleme ve tutarlılık" desc="Self-check, diagnostics ve retake hazırligini ayni panelde tutar." />
              <div style={gridAuto}>
                <StatCard label="Model health" value={modelHealth?.healthy ? "Healthy" : "Review"} detail={modelHealthError || "-"} tone={modelHealth?.healthy ? "ok" : "warn"} />
                <StatCard label="Sample count" value={formatNumber(modelDiag?.sampleCount)} detail={`fallback %${formatNumber(Math.round(Number(modelDiag?.fallbackRate || 0) * 100))}`} tone="neutral" />
                <StatCard label="Confidence std" value={`%${formatNumber(Math.round(Number(modelDiag?.confidence?.std || 0) * 1000) / 10)}`} detail={modelDiagnosticsError || "-"} tone="neutral" />
                <StatCard label="Field score" value={`${formatNumber(fieldScore?.score)}/100`} detail={modelStudio.showCarePlan ? "care plan açık" : "care plan kisitli"} tone="ok" />
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {supportsModelSelfCheck ? <button className="btn-secondary" onClick={() => runModelSelfCheck?.()} disabled={Boolean(modelSelfCheckRunning)}><Gauge size={14} /> {modelSelfCheckRunning ? "Self-check..." : "Self-check"}</button> : null}
                {supportsModelDiagnostics ? <button className="btn-secondary" onClick={() => resetModelDiagnostics?.()} disabled={Boolean(modelDiagnosticsResetRunning)}><RefreshCcw size={14} /> Reset diagnostics</button> : null}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Retake Readiness" title="Tekrar cekim ve aksiyon paneli" desc={modelStudio.retryReadinessLabel || "Retake adimlarini toplu yonet."} />
              <div style={gridAuto}>
                <StatCard label="Need for 60" value={formatNumber(modelStudio.retryNeedFor60)} tone={Number(modelStudio.retryNeedFor60) > 0 ? "warn" : "ok"} />
                <StatCard label="Retake sonucu" value={modelStudio.retakeOutcome?.label || "-"} tone={toneFromStatus(modelStudio.retakeOutcome?.tone)} />
                <StatCard label="Forecast max wind" value={`${formatNumber(maxWindKmh)} km/sa`} detail={`frost ${formatNumber(forecastSummary?.frostDays)} gun`} tone="neutral" />
                <StatCard label="Hava riski" value={`${formatNumber(weatherSummary?.score)}/100`} detail={(weatherSummary?.riskTags || []).join(", ")} tone="warn" />
              </div>
              <div style={{ ...gridAuto, gridTemplateColumns: "1fr 1fr" }}>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Kritik eksikler</strong>
                  {(modelStudio.retryMissingCritical || []).length ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {modelStudio.retryMissingCritical.map((item) => (
                        <button key={item.id || item.text} className="btn-secondary" onClick={() => actions.toggleRetryChecklist?.(item.id || item.text)}>
                          <AlertTriangle size={14} /> {item.text}
                        </button>
                      ))}
                    </div>
                  ) : <small>Kritik eksik yok.</small>}
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Hizli aksiyonlar</strong>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <button className="btn-secondary" onClick={() => actions.markAllRetryChecklist?.()}><CheckCircle2 size={14} /> Tumunu tamamla</button>
                    <button className="btn-secondary" onClick={() => actions.markPriorityRetryChecklist?.(4)}><ShieldAlert size={14} /> Kritikleri tamamla</button>
                    <button className="btn-secondary" onClick={() => actions.completeNextRetryItem?.()}><ChevronRight size={14} /> Siradakini tamamla</button>
                    <button className="btn-secondary" onClick={() => actions.autoPrepareRetake?.()}><Rocket size={14} /> Auto retake prep</button>
                  </div>
                </div>
              </div>
              <div style={gridAuto}>
                {(modelStudio.urgentActions || []).map((item, idx) => (
                  <div key={`${item}-${idx}`} style={card}>
                    <strong>Acil aksiyon {idx + 1}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.72)" }}>{item}</small>
                  </div>
                ))}
                {(diseaseTrends || []).map((item) => (
                  <div key={item.name} style={card}>
                    <strong>{item.name}</strong>
                    <small style={{ display: "block", marginTop: "6px" }}>Trend %{formatNumber(item.pct)}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {showFullDemo && workspaceTab === "system" ? (
          <>
            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Runtime" title="Sistem ve entegrasyon paneli" desc="API, metrics, haber/sources ve knowledge coverage burada izlenir." right={<span style={statusChipStyle(metricsStale ? "warn" : "ok")}>Metrics {metricsStale ? "stale" : "fresh"}</span>} />
              <div style={gridAuto}>
                <StatCard label="Platform" value={typeof navigator !== "undefined" ? (navigator.userAgent.includes("Android") ? "Android" : navigator.userAgent.includes("iPhone") ? "iOS" : "Web") : "Unknown"} detail={typeof window !== "undefined" && window.Capacitor ? "Capacitor" : "Browser"} tone="neutral" />
                <StatCard label="API base" value={typeof window !== "undefined" ? (window.__agroguardResolvedApiBase || "Mock") : "-"} detail={backendInfo?.mode || "server"} tone="neutral" />
                <StatCard label="Metrics update" value={metricsUpdatedAt ? formatDateTime(metricsUpdatedAt) : "-"} detail={metricsError || integrationsHealthError || "-"} tone={metricsError || integrationsHealthError ? "warn" : "ok"} />
                <StatCard label="Knowledge" value={formatNumber(systemStudio.sourceStats?.total)} detail={`${formatNumber(systemStudio.knowledgeTypes?.length)} tip / ${formatNumber(systemStudio.sourceStats?.categories)} kategori`} tone="neutral" />
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={() => loadIntegrationsHealth?.()}><RefreshCcw size={14} /> Entegrasyonlari yenile</button>
                <button className="btn-secondary" onClick={() => actions.upsertLandListingReportTask?.()}><Calendar size={14} /> Aylık rapor görevi</button>
                <button className="btn-secondary" onClick={() => actions.shiftDemoDockTab?.(1)}><ArrowRight size={14} /> Sonraki dock</button>
              </div>
              <div style={gridAuto}>
                {(Array.isArray(integrationsHealth) ? integrationsHealth : []).slice(0, 6).map((item, idx) => (
                  <div key={item.id || item.name || idx} style={card}>
                    <div style={rowBetween}>
                      <strong>{item.name || item.id || `Integration ${idx + 1}`}</strong>
                      <span style={statusChipStyle(toneFromStatus(item.status || item.state))}>{item.status || item.state || "unknown"}</span>
                    </div>
                    <small style={{ display: "block", marginTop: "8px", color: "rgba(236,244,228,0.68)" }}>{item.detail || item.note || "-"}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Knowledge Console" title="Haber / bilgi bankasi filtreleri" desc="Kaynak ve ansiklopedi tarafini demo icinden kontrol et." />
              <div style={{ ...gridAuto, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <input className="select-premium" placeholder="Kaynak ara" value={systemStudio.sourceQuery || ""} onChange={(e) => actions.setSourceQuery?.(e.target.value)} />
                <select className="select-premium" value={systemStudio.sourceCategory || "all"} onChange={(e) => actions.setSourceCategory?.(e.target.value)}>
                  {(systemStudio.sourceCategories || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <input className="select-premium" placeholder="Bilgi ara" value={systemStudio.knowledgeQuery || ""} onChange={(e) => actions.setKnowledgeQuery?.(e.target.value)} />
                <select className="select-premium" value={systemStudio.knowledgeType || "all"} onChange={(e) => actions.setKnowledgeType?.(e.target.value)}>
                  {(systemStudio.knowledgeTypes || []).map((item) => <option key={item} value={item}>{systemStudio.knowledgeTypeLabels?.[item] || item}</option>)}
                </select>
                <select className="select-premium" value={systemStudio.knowledgeSource || "all"} onChange={(e) => actions.setKnowledgeSource?.(e.target.value)}>
                  {(systemStudio.knowledgeSources || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="select-premium" value={systemStudio.encyclopediaLetter || "all"} onChange={(e) => actions.setEncyclopediaLetter?.(e.target.value)}>
                  {(systemStudio.encyclopediaLetters || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div style={gridAuto}>
                <StatCard label="Filtered sources" value={formatNumber(systemStudio.filteredSources?.length)} tone="neutral" />
                <StatCard label="Visible encyclopedia" value={formatNumber(systemStudio.encyclopediaVisibleEntries?.length)} tone="neutral" />
                <StatCard label="Related entries" value={formatNumber(systemStudio.relatedKnowledgeEntries?.length)} tone="neutral" />
                <StatCard label="Upcoming tasks" value={formatNumber(systemStudio.upcomingCalendarItems?.length)} tone="neutral" />
              </div>
              <div style={gridAuto}>
                {(systemStudio.researchHighlights || []).slice(0, 3).map((item, idx) => (
                  <div key={item.id || item.title || idx} style={card}>
                    <strong>{item.title || item.name || `Kaynak ${idx + 1}`}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.72)" }}>{item.summary || item.detail || item.link || "-"}</small>
                  </div>
                ))}
                {(systemStudio.knowledgeSpotlight || []).slice(0, 3).map((item, idx) => (
                  <div key={`${item.title}-${idx}`} style={card}>
                    <strong>{item.title}</strong>
                    <small style={{ display: "block", marginTop: "6px", color: "rgba(236,244,228,0.72)" }}>{item.detail}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={sectionFrame}>
              <SectionHeader eyebrow="Contact + Assets" title="Yatırımcı mail ve içerik kütüphanesi" desc="Destek mailini, kütüphane kapsamı ve görsel setini burada yönet." />
              <div style={{ ...gridAuto, gridTemplateColumns: "1fr 1fr" }}>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Danismanlik / yatirimci maili</strong>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <input className="select-premium" placeholder="Ad" value={systemStudio.contactForm?.name || ""} onChange={(e) => updateContact("name", e.target.value)} />
                    <input className="select-premium" placeholder="E-posta" value={systemStudio.contactForm?.email || ""} onChange={(e) => updateContact("email", e.target.value)} />
                    <input className="select-premium" placeholder="Konu" value={systemStudio.contactForm?.subject || ""} onChange={(e) => updateContact("subject", e.target.value)} />
                    <textarea className="select-premium" rows={4} placeholder="Mesaj" value={systemStudio.contactForm?.message || ""} onChange={(e) => updateContact("message", e.target.value)} style={{ resize: "vertical" }} />
                    <button className="btn-secondary" onClick={() => actions.submitContact?.()}><Mail size={14} /> Mail ac</button>
                    {systemStudio.contactStatus ? <small>{systemStudio.contactStatus}</small> : null}
                  </div>
                </div>
                <div style={card}>
                  <strong style={{ display: "block", marginBottom: "8px" }}>Icerik coverage</strong>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(demoStudioAssets?.fieldCollections || []).slice(0, 5).map((item) => (
                      <div key={item.id} style={{ ...rowBetween, ...card, padding: "8px 10px" }}>
                        <small>{item.label}</small>
                        <small>{formatNumber(item.count)}</small>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                    <span style={statusChipStyle("neutral")}>crop labels {formatNumber(demoStudioAssets?.supportedCropsCount)}</span>
                    <span style={statusChipStyle("neutral")}>word fixes {formatNumber(demoStudioAssets?.wordFixCount)}</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
