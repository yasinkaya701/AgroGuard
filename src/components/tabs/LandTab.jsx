import React, { useState } from "react";
import {
  getMLValuation,
  getRiskAnalysis,
  get5YearProjection,
  getFuzzyDecision
} from "../../data/landValuationModel";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldCheck,
  TrendingUp,
  Upload,
  Wand2,
  Crosshair,
  DollarSign,
  ArrowUpRight,
  Layers
} from "lucide-react";
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const panelTitleStyle = { margin: 0, fontSize: "22px" };

const listItemStyle = {
  display: "grid",
  gap: "6px",
  border: "1px solid var(--ui-border)",
  borderRadius: "12px",
  padding: "12px",
  background: "linear-gradient(165deg, rgba(15, 31, 22, 0.9), rgba(12, 24, 17, 0.84))",
  boxShadow: "0 10px 24px rgba(4, 12, 8, 0.22)"
};

const metricCardStyle = {
  border: "1px solid var(--ui-border)",
  borderRadius: "12px",
  padding: "12px",
  background: "linear-gradient(155deg, var(--ui-surface-2), var(--ui-surface-1))",
  boxShadow: "0 10px 24px rgba(3, 11, 7, 0.24)"
};

const gridMetrics = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px"
};

const gridInputs = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px"
};

const fmtNum = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("tr-TR");
};

const fmtTl = (value) => `${fmtNum(value)} TL`;

const setField = (setter, key, value) => {
  if (typeof setter !== "function") return;
  setter((prev) => ({ ...(prev || {}), [key]: value }));
};

const confidenceText = (v) => {
  if (v == null) return "-";
  if (typeof v === "string") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
};

const medianFromRows = (rows = [], getter) => {
  const vals = rows
    .map((row) => Number(typeof getter === "function" ? getter(row) : row))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? Math.round((vals[mid - 1] + vals[mid]) / 2) : Math.round(vals[mid]);
};

const avgFromRows = (rows = [], getter) => {
  const vals = rows
    .map((row) => Number(typeof getter === "function" ? getter(row) : row))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((acc, v) => acc + v, 0) / vals.length);
};

const toneChip = (tone = "neutral") => {
  const map = {
    ok: {
      color: "#86efac",
      border: "1px solid rgba(34,197,94,0.35)",
      background: "rgba(34,197,94,0.14)"
    },
    warn: {
      color: "#fbbf24",
      border: "1px solid rgba(245,158,11,0.35)",
      background: "rgba(245,158,11,0.14)"
    },
    risk: {
      color: "#fca5a5",
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.14)"
    },
    neutral: {
      color: "rgba(245,237,216,0.86)",
      border: "1px solid rgba(143,188,69,0.2)",
      background: "rgba(15,26,15,0.32)"
    }
  };
  return {
    ...(map[tone] || map.neutral),
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    fontSize: "11px",
    fontWeight: 700
  };
};

/* ───── Sparkline Mini Chart ───── */
const Sparkline = ({ data = [], color = "var(--sprout)", width = 80, height = 28 }) => {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gId = `lsg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* ───── Radar Chart (6 dimensions) ───── */
const RadarChart = ({ dimensions = [], size = 200 }) => {
  const center = size / 2;
  const radius = (size / 2) - 20;
  const count = dimensions.length;
  if (count < 3) return null;
  const angleStep = (2 * Math.PI) / count;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const getPoint = (angle, r) => ({
    x: center + r * Math.sin(angle),
    y: center - r * Math.cos(angle)
  });
  const dataPoints = dimensions.map((d, i) => {
    const val = Math.max(0, Math.min(1, (d.value || 0) / 100));
    return getPoint(i * angleStep, val * radius);
  });
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level, li) => {
        const pts = Array.from({ length: count }).map((_, i) => {
          const p = getPoint(i * angleStep, level * radius);
          return `${p.x},${p.y}`;
        }).join(" ");
        return <polygon key={li} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {dimensions.map((d, i) => {
        const p = getPoint(i * angleStep, radius);
        const lp = getPoint(i * angleStep, radius + 16);
        return (
          <g key={i}>
            <line x1={center} y1={center} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <text x={lp.x} y={lp.y} fill="rgba(255,255,255,0.5)" fontSize="9" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{d.label}</text>
          </g>
        );
      })}
      <path d={dataPath} fill="rgba(0,255,157,0.15)" stroke="var(--sprout)" strokeWidth="2" strokeLinejoin="round" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--sprout)" stroke="#000" strokeWidth="1" />
      ))}
    </svg>
  );
};

/* ───── Grade Badge (A/B/C/D/F) ───── */
const GradeBadge = ({ score = 0 }) => {
  let grade, color, glow;
  if (score >= 90) { grade = "A+"; color = "#00FF9D"; glow = "rgba(0,255,157,0.3)"; }
  else if (score >= 80) { grade = "A"; color = "#86efac"; glow = "rgba(134,239,172,0.3)"; }
  else if (score >= 70) { grade = "B"; color = "#fbbf24"; glow = "rgba(251,191,36,0.3)"; }
  else if (score >= 60) { grade = "C"; color = "#fb923c"; glow = "rgba(251,146,60,0.3)"; }
  else if (score >= 50) { grade = "D"; color = "#f87171"; glow = "rgba(248,113,113,0.3)"; }
  else { grade = "F"; color = "#ef4444"; glow = "rgba(239,68,68,0.3)"; }
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: "8px"
    }}>
      <div className="land-grade-badge" style={{
        width: "80px", height: "80px", borderRadius: "20px",
        background: `rgba(0,0,0,0.5)`, border: `2px solid ${color}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 30px ${glow}, inset 0 0 20px ${glow}`,
        transition: "all 0.5s ease"
      }}>
        <span style={{ fontSize: "32px", fontWeight: "900", color, lineHeight: 1 }}>{grade}</span>
      </div>
      <span style={{ fontSize: "10px", fontWeight: "700", opacity: 0.5, letterSpacing: "1px" }}>PARSEL SKORU</span>
    </div>
  );
};

/* ───── ROI Calculator Widget ───── */
const ROICalculator = ({ unitPrice = 0, areaDa = 0, yieldKgDa = 5000, cropPriceKg = 12 }) => {
  const totalLandValue = unitPrice * areaDa;
  const annualRevenue = areaDa * yieldKgDa * cropPriceKg;
  const annualCost = areaDa * 3500;
  const annualProfit = annualRevenue - annualCost;
  const roi = totalLandValue > 0 ? ((annualProfit / totalLandValue) * 100) : 0;
  const paybackYears = annualProfit > 0 ? (totalLandValue / annualProfit) : Infinity;
  const items = [
    { label: "Arazi Değeri", value: fmtTl(totalLandValue), color: "var(--wheat)", pct: 100 },
    { label: "Yıllık Gelir", value: fmtTl(annualRevenue), color: "var(--sprout)", pct: totalLandValue > 0 ? Math.min(100, (annualRevenue / totalLandValue) * 100) : 0 },
    { label: "Yıllık Maliyet", value: fmtTl(annualCost), color: "#f87171", pct: totalLandValue > 0 ? Math.min(100, (annualCost / totalLandValue) * 100) : 0 },
    { label: "Net Kâr", value: fmtTl(annualProfit), color: annualProfit > 0 ? "var(--sprout)" : "#f87171", pct: totalLandValue > 0 ? Math.min(100, Math.abs(annualProfit / totalLandValue) * 100) : 0 }
  ];
  return (
    <div className="bento-card" style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
          <DollarSign size={18} color="var(--wheat)" /> Yatırım Getiri Hesabı
        </h4>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>ROI</div>
            <div style={{ fontSize: "18px", fontWeight: "900", color: roi > 0 ? "var(--sprout)" : "#f87171" }}>%{roi.toFixed(1)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>GERİ DÖNÜŞ</div>
            <div style={{ fontSize: "18px", fontWeight: "900", color: "var(--sky)" }}>{paybackYears < 100 ? `${paybackYears.toFixed(1)} yıl` : "∞"}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: "12px" }}>
        {items.map((item, idx) => (
          <div key={idx}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ fontWeight: 600 }}>{item.label}</span>
              <strong style={{ color: item.color, fontFamily: "JetBrains Mono", fontSize: "12px" }}>{item.value}</strong>
            </div>
            <div style={{ height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${item.pct}%`, background: item.color, borderRadius: "4px", transition: "width 1s cubic-bezier(0.2,1,0.2,1)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ───── Floating Quick-Action Toolbar ───── */
const FloatingToolbar = ({ onSoilSignal, onModelUpdate, onSaveProfile, onGoMarket }) => (
  <div className="land-floating-toolbar" style={{
    position: "sticky", bottom: "90px", zIndex: 100,
    display: "flex", gap: "8px", justifyContent: "center",
    padding: "10px 16px", borderRadius: "20px",
    background: "rgba(10,18,12,0.92)", backdropFilter: "blur(20px)",
    border: "1px solid var(--ui-border)",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
    maxWidth: "600px", margin: "0 auto"
  }}>
    <button className="btn-secondary" style={{ padding: "10px 16px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }} onClick={onSoilSignal}>
      <Wand2 size={14} /> Toprak Sinyali
    </button>
    <button className="btn-secondary" style={{ padding: "10px 16px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }} onClick={onModelUpdate}>
      <Activity size={14} /> Model Güncelle
    </button>
    <button className="btn-secondary" style={{ padding: "10px 16px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }} onClick={onSaveProfile}>
      <Save size={14} /> Profil Kaydet
    </button>
    <button className="btn-primary" style={{ padding: "10px 20px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", background: "var(--sprout)", color: "#000", fontWeight: "800" }} onClick={onGoMarket}>
      <ArrowUpRight size={14} /> Pazara Gönder
    </button>
  </div>
);

const LandModel3D = ({ landDemo }) => {
  const soilScore = Number(landDemo?.soilScore || 74);
  const moisture = Number(landDemo?.soilMoisture || 42);

  return (
    <div className="land-model-container" style={{
      perspective: '1200px',
      height: '380px',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, rgba(143,188,69,0.08) 0%, transparent 70%)',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '24px',
      border: '1px solid rgba(143,188,69,0.1)',
      marginBottom: '20px'
    }}>
      <div className="isometric-slab" style={{
        width: '300px',
        height: '200px',
        position: 'relative',
        transformStyle: 'preserve-3d',
        transform: 'rotateX(60deg) rotateZ(-45deg)',
        transition: 'transform 0.8s cubic-bezier(0.2, 1, 0.2, 1)'
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #121f12 0%, #081208 100%)',
          transform: 'translateZ(-40px)',
          border: '1px solid rgba(0, 255, 157, 0.2)',
          boxShadow: '0 0 50px rgba(0,0,0,0.8)'
        }}>
          <div className="moisture-glow" style={{
            position: 'absolute',
            inset: 0,
            opacity: moisture / 100,
            background: 'radial-gradient(circle at 40% 60%, var(--sky) 0%, transparent 60%)',
            filter: 'blur(15px)',
            animation: 'pulse-slow 4s infinite'
          }} />
        </div>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #2d1f16 0%, #1a120b 100%)',
          transform: 'translateZ(-20px)',
          border: '1px solid rgba(143,188,69,0.1)'
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${soilScore > 80 ? '#00FF9D' : soilScore > 60 ? '#86efac' : '#a3e635'} 0%, #1a2e1a 100%)`,
          transform: 'translateZ(0px)',
          border: '1px solid rgba(143,188,69,0.5)',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }} />
          <div className="scanning-bar" style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '200%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, var(--sprout), transparent)',
            boxShadow: '0 0 15px var(--sprout)',
            animation: 'scan-surface 4s linear infinite',
            zIndex: 10
          }} />
          {[
            { x: '20%', y: '20%', label: 'PH', value: landDemo?.soilPh || 6.8 },
            { x: '80%', y: '25%', label: 'MST', value: `${moisture}%` },
            { x: '35%', y: '75%', label: 'NPK', value: 'High' },
            { x: '75%', y: '80%', label: 'TEMP', value: '24°C' }
          ].map((node, idx) => (
            <div key={idx} style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              transform: 'translateZ(15px)',
              zIndex: 20
            }}>
              <div className="sensor-ping" style={{
                width: '10px',
                height: '10px',
                background: 'var(--sprout)',
                borderRadius: '50%',
                boxShadow: '0 0 12px var(--sprout)',
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
              }} />
              <div className="sensor-label" style={{
                position: 'absolute',
                top: '-28px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.85)',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '9px',
                fontWeight: '700',
                color: 'var(--sprout)',
                whiteSpace: 'nowrap',
                border: '1px solid var(--ui-border)',
                backdropFilter: 'blur(4px)'
              }}>
                {node.label}: {node.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '300px',
          height: '40px',
          background: '#1a120b',
          transform: 'rotateX(-90deg)',
          transformOrigin: 'bottom',
          border: '1px solid rgba(143,188,69,0.1)'
        }} />
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '40px',
          height: '200px',
          background: '#0d0805',
          transform: 'rotateY(90deg)',
          transformOrigin: 'right',
          border: '1px solid rgba(143,188,69,0.1)'
        }} />
      </div>
      <div style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 30 }}>
        <div className="tech-badge" style={{ marginBottom: '8px', opacity: 0.8 }}>TR_MODEL_V2_ACTIVE</div>
        <h3 style={{ margin: 0, fontSize: '18px', letterSpacing: '1px', color: 'var(--cream)' }}>
          PARSEL <span style={{ color: 'var(--sprout)' }}>DIGITAL TWIN</span>
        </h3>
      </div>
      <div style={{ position: 'absolute', bottom: '24px', right: '24px', textAlign: 'right', zIndex: 30 }}>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '4px' }}>SOIL_INTEGRITY</div>
        <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--sprout)' }}>{soilScore}%</div>
      </div>
    </div>
  );
};

const SensorGrid = ({ landDemo }) => {
  const sensors = [
    { id: 'ph', label: 'PH SEVIYESI', value: landDemo?.soilPh || 6.8, unit: 'pH', icon: '🧪', color: '#fbbf24' },
    { id: 'mst', label: 'NEM ORANI', value: landDemo?.soilMoisture || 42, unit: '%', icon: '💧', color: 'var(--sky)' },
    { id: 'npk', label: 'NPK DENGESI', value: 'OPTIMAL', unit: '', icon: '🌿', color: 'var(--sprout)' },
    { id: 'tmp', label: 'TOPRAK ISISI', value: 24.2, unit: '°C', icon: '🔥', color: '#f87171' },
    { id: 'cnd', label: 'ILETKENLIK', value: 1.2, unit: 'mS/cm', icon: '⚡', color: '#a78bfa' },
    { id: 'om', label: 'ORG. MADDE', value: 3.5, unit: '%', icon: '🍂', color: '#b45309' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
      {sensors.map(s => (
        <div key={s.id} className="bento-card" style={{ padding: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,18,12,0.6)' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>{s.icon}</div>
          <div style={{ fontSize: '10px', opacity: 0.5, fontWeight: '700', letterSpacing: '0.5px' }}>{s.label}</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>
            {s.value} <span style={{ fontSize: '12px', fontWeight: '400', opacity: 0.6 }}>{s.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default function LandTab({
  landPriceData,
  landPriceLoading,
  landPriceError,
  landPriceHistory,
  landPriceSources,
  effectiveLandCity,
  landMlData,
  landValuationDemo,
  landProfiles,
  landDistrictBenchmark,
  landDistrictHeatmap,
  landNeighborhoodHeatmap,
  landDistrictLeaders,
  landInvestmentLens,
  landActionPlan,
  landLocationScope,
  landSignalQuality,
  landDataReadiness,
  landCoords,
  setLandCoords,
  manualListingForm,
  setManualListingForm,
  manualListingStatus,
  manualListingStats,
  manualListings,
  liveLandListings,
  manualCsv,
  setManualCsv,
  importManualCsv,
  saveManualListing,
  loadLiveLandListings,
  loadManualListings,
  applyManualListingToLand,
  removeManualListing,
  exportLandListingsCsv,
  exportLandListingsReportTxt,
  setEconLandValue,
  saveCurrentLandProfile,
  applyLandFromSoilSignals,
  trainCustomLandPriceModel,
  applyLandProfile,
  deleteLandProfile,
  handleLandCityInputChange,
  landQuery,
  landDemo,
  setLandDemo,
  setLandRefreshKey,
  locationSearch,
  setLocationSearch,
  locationSearchMatches,
  applyLocationSearchHit,
  setLandProfileName,
  landProfileName,
  landProfileStatus,
  landMlLoading,
  landMlError,
  landProvidersHealth,
  landCompareData,
  landCompareLoading,
  landCompareError,
  landComparableListings,
  setBottomTab
}) {
  const [landWorkspaceTab, setLandWorkspaceTab] = useState("overview");
  const profiles = Array.isArray(landProfiles) ? landProfiles : [];
  const matches = Array.isArray(locationSearchMatches) ? locationSearchMatches : [];
  const manualRows = Array.isArray(manualListings) ? manualListings : [];
  const liveRows = Array.isArray(liveLandListings) ? liveLandListings : [];
  const comparableRows = Array.isArray(landComparableListings) ? landComparableListings : [];
  const historyRows = Array.isArray(landPriceHistory) ? landPriceHistory : [];
  const sourceRows = Array.isArray(landPriceSources) ? landPriceSources : [];
  const districtHeatRows = Array.isArray(landDistrictHeatmap) ? landDistrictHeatmap : [];
  const neighborhoodHeatRows = Array.isArray(landNeighborhoodHeatmap) ? landNeighborhoodHeatmap : [];
  const providerRows = Array.isArray(landProvidersHealth?.providers)
    ? landProvidersHealth.providers
    : Array.isArray(landProvidersHealth?.items)
      ? landProvidersHealth.items
      : [];
  const coordsRaw = String(landCoords || "").trim();
  const coordsValid = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coordsRaw);

  const compareRows = [
    landCompareData?.remote,
    landCompareData?.manual,
    landCompareData?.comparable,
    landCompareData?.internet,
    landCompareData?.model
  ].filter(Boolean);
  const parcelAreaDa = Number(landDemo?.areaDa || 0);
  const parcelUnitPrice = Number(landValuationDemo?.unitPrice || landPriceData?.priceTlDa || 0);
  const parcelEstimatedTotal = Math.max(0, parcelAreaDa * parcelUnitPrice);
  const parcelReadinessChecks = [
    { key: "city", label: "Sehir", ok: String(landQuery?.city || effectiveLandCity || "").trim().length > 0 },
    { key: "district", label: "İlçe", ok: String(landDemo?.district || "").trim().length > 0 },
    { key: "neighborhood", label: "Mahalle", ok: String(landDemo?.neighborhood || "").trim().length > 0 },
    { key: "areaDa", label: "Alan", ok: parcelAreaDa > 0 },
    { key: "soilScore", label: "Toprak skoru", ok: Number(landDemo?.soilScore || 0) > 0 }
  ];
  const parcelReadinessScore = Math.round(
    (parcelReadinessChecks.filter((item) => item.ok).length / parcelReadinessChecks.length) * 100
  );
  const modelReadinessScore = Number(landDataReadiness?.score || 0);
  const modelReadinessMissing = Array.isArray(landDataReadiness?.missing) ? landDataReadiness.missing : [];
  const manualFormValid =
    String(manualListingForm?.title || "").trim().length > 0 &&
    Number(manualListingForm?.priceTlDa || 0) > 0;
  const manualPriceTlDa = Number(manualListingForm?.priceTlDa || 0);
  const apiPriceTlDa = Number(landPriceData?.priceTlDa || 0);
  const manualVsApiPct = apiPriceTlDa > 0
    ? Math.round(((manualPriceTlDa - apiPriceTlDa) / apiPriceTlDa) * 1000) / 10
    : null;
  const missingReadiness = parcelReadinessChecks.filter((item) => !item.ok).map((item) => item.label);
  const strategy = String(landActionPlan?.strategy || "").toLowerCase();
  const strategyTone = strategy.includes("agresif")
    ? "ok"
    : strategy.includes("temkinli")
      ? "warn"
      : "neutral";
  const strategyLabel = strategy
    ? strategy.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Denge";
  const neighborhoodMedian = Number(landDistrictBenchmark?.neighborhoodMedian || 0);
  const parcelVsNeighborhoodPct =
    neighborhoodMedian > 0 && Number(landValuationDemo?.unitPrice || 0) > 0
      ? Math.round(((Number(landValuationDemo.unitPrice) - neighborhoodMedian) / neighborhoodMedian) * 1000) / 10
      : null;

  // ──── Map Click Handler ────
  function LocationPicker() {
    useMapEvents({
      click(e) {
        if (typeof setLandCoords === 'function') {
          setLandCoords(`${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`);
        }
      },
    });
    return null;
  }

  // Parse current coordinates for the map
  let mapLat = 38.3552;
  let mapLon = 38.3095;
  if (coordsValid) {
    const parts = coordsRaw.split(',');
    mapLat = parseFloat(parts[0]);
    mapLon = parseFloat(parts[1]);
  }

  const comparableMedianTlDa = medianFromRows(comparableRows, (row) => row?.item?.priceTlDa);
  const liveMedianTlDa = medianFromRows(liveRows, (row) => row?.priceTlDa);
  const sourceBlendCandidates = [
    apiPriceTlDa,
    Number(manualListingStats?.median || 0),
    Number(comparableMedianTlDa || 0),
    Number(liveMedianTlDa || 0)
  ].filter((v) => Number.isFinite(v) && v > 0);
  const sourceBlendUnitPrice = sourceBlendCandidates.length
    ? Math.round(sourceBlendCandidates.reduce((acc, v) => acc + v, 0) / sourceBlendCandidates.length)
    : null;
  const sourceBlendTotal = sourceBlendUnitPrice ? Math.round(sourceBlendUnitPrice * Math.max(0, parcelAreaDa)) : null;
  const comparableAvgScore = avgFromRows(comparableRows, (row) => row?.score);
  const topDistricts = Array.isArray(landLocationScope?.topDistricts) ? landLocationScope.topDistricts : [];
  const lowDistricts = Array.isArray(landLocationScope?.lowDistricts) ? landLocationScope.lowDistricts : [];
  const parcelPresets = [
    {
      id: "ova_sulak",
      label: "Ova + sulak",
      note: "Verimli ve yola yakin parsel",
      values: {
        zone: "ova",
        slopePct: 2,
        irrigation: "var",
        roadAccess: "iyi",
        roadDistanceM: 80,
        roadPass: "var",
        zoningStatus: "yok",
        structureStatus: "yok",
        soilScore: 82
      }
    },
    {
      id: "gecis_denge",
      label: "Gecis + dengeli",
      note: "Orta riskli standart profil",
      values: {
        zone: "gecis",
        slopePct: 6,
        irrigation: "var",
        roadAccess: "orta",
        roadDistanceM: 350,
        roadPass: "var",
        zoningStatus: "kismi",
        structureStatus: "yok",
        soilScore: 70
      }
    },
    {
      id: "yamac_kuru",
      label: "Yamaç + kuru",
      note: "Riskli, düşük erişim",
      values: {
        zone: "yamac",
        slopePct: 14,
        irrigation: "yok",
        roadAccess: "zayif",
        roadDistanceM: 1200,
        roadPass: "yok",
        zoningStatus: "yok",
        structureStatus: "yok",
        soilScore: 55
      }
    }
  ];
  const applyParcelPreset = (preset) => {
    if (!preset || typeof setLandDemo !== "function") return;
    setLandDemo((prev) => ({ ...(prev || {}), ...(preset.values || {}) }));
  };
  const scrollToSection = (id) => {
    if (!id || typeof document === "undefined") return;
    const node = document.getElementById(id);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const landWorkspaceTabs = [
    {
      id: "overview",
      label: "Genel Bakis",
      icon: Activity,
      description: "Parselin hızlı durumunu, vitalite skorunu ve yatırım sinyallerini tek ekranda oku."
    },
    {
      id: "valuation",
      label: "Degerleme",
      icon: DollarSign,
      description: "ML fiyatlama, risk analizi, 5 yıllık projeksiyon ve nihai degerleme katmanlarini incele."
    },
    {
      id: "location",
      label: "Konum",
      icon: MapPin,
      description: "İl, ilçe, mahalle, koordinat ve saha parametrelerini tek akışta güncelle."
    },
    {
      id: "comparables",
      label: "Emsal + Kaynak",
      icon: Layers,
      description: "Manuel emsaller, canlı ilanlar ve provider sağlığını aynı alanda yönet."
    },
    {
      id: "profile",
      label: "Profil",
      icon: Save,
      description: "Kayıtli profilleri, fiyat geçmişini ve tekrar kullanilabilir parsel senaryolarini yonet."
    }
  ];
  const activeLandWorkspace = landWorkspaceTabs.find((item) => item.id === landWorkspaceTab) || landWorkspaceTabs[0];
  const landWorkspaceStats = [
    { label: "Parsel toplam", value: fmtTl(landValuationDemo?.totalWithCrop || landValuationDemo?.total || parcelEstimatedTotal || 0), tone: "var(--wheat)" },
    { label: "Model hazırlık", value: `%${modelReadinessScore}`, tone: "var(--sprout)" },
    { label: "Emsal havuzu", value: fmtNum((manualListingStats?.count || 0) + liveRows.length), tone: "var(--sky)" },
    { label: "Kaynak sinyali", value: `${fmtNum(landSignalQuality?.score || 0)}/100`, tone: "var(--cream)" }
  ];
  const jumpLandWorkspace = (tabId, sectionId) => {
    setLandWorkspaceTab(tabId);
    if (!sectionId || typeof window === "undefined") return;
    window.setTimeout(() => scrollToSection(sectionId), 80);
  };

  return (
    <div className="tab-page">
      <div className="tab-content-inner">
        <section className="panel glass-premium" style={{ display: "grid", gap: "16px", padding: "18px", position: "relative", overflow: "hidden" }}>
          <div className="hud-scan" style={{ opacity: 0.14, animationDuration: "16s" }} />
          <div style={{ position: "relative", zIndex: 10, display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "720px" }}>
                <div className="tech-badge" style={{ marginBottom: "8px" }}>Arazi Workspace</div>
                <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "28px" }}>
                  Arazi kontrol <em>merkezi</em>
                </h3>
                <p style={{ margin: "8px 0 0", color: "var(--ui-muted)", fontSize: "13px" }}>
                  {activeLandWorkspace.description}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={() => jumpLandWorkspace("location", "land-location-section")}>
                  <MapPin size={14} /> Konum düzenle
                </button>
                <button className="btn-secondary" onClick={() => jumpLandWorkspace("comparables", "land-manual-form")}>
                  <Layers size={14} /> Emsal yonet
                </button>
                <button className="btn-primary" onClick={() => jumpLandWorkspace("valuation", "land-valuation-section")}>
                  <DollarSign size={14} /> Degerlemeye git
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {landWorkspaceTabs.map((tab) => {
                const Icon = tab.icon;
                const active = landWorkspaceTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLandWorkspaceTab(tab.id)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px",
                      border: active ? "1px solid rgba(143,188,69,0.45)" : "1px solid var(--ui-border)",
                      background: active ? "rgba(143,188,69,0.12)" : "rgba(10,18,12,0.45)",
                      color: active ? "var(--sprout)" : "var(--cream)",
                      fontSize: "12px",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {landWorkspaceStats.map((item) => (
                <div key={item.label} style={{ ...metricCardStyle, minHeight: "84px" }}>
                  <div className="bento-head">{item.label}</div>
                  <strong style={{ fontSize: "22px", color: item.tone }}>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        {landWorkspaceTab === "overview" ? (
        <section className="panel quick-card" style={{ padding: "18px", display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: "6px" }}>HIZLI_PARSEL</div>
              <h3 className="section-title" style={{ fontSize: "22px", marginBottom: 0 }}>Hızlı parsel girişi</h3>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={() => setLandWorkspaceTab("location")}>
                Konum detay
              </button>
              <button className="btn-primary" onClick={() => setLandWorkspaceTab("valuation")}>
                Değerlemeye geç
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
            <div>
              <label className="bento-head">Şehir</label>
              <input
                className="select-premium"
                value={landQuery?.city || ""}
                placeholder={effectiveLandCity || "Malatya"}
                onChange={(e) => typeof handleLandCityInputChange === "function" && handleLandCityInputChange(e.target.value)}
              />
            </div>
            <div>
              <label className="bento-head">İlçe</label>
              <input className="select-premium" value={landDemo?.district || ""} onChange={(e) => setField(setLandDemo, "district", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Mahalle</label>
              <input className="select-premium" value={landDemo?.neighborhood || ""} onChange={(e) => setField(setLandDemo, "neighborhood", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Alan (da)</label>
              <input className="select-premium" type="number" value={landDemo?.areaDa ?? ""} onChange={(e) => setField(setLandDemo, "areaDa", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Toprak skoru</label>
              <input className="select-premium" type="number" min="0" max="100" value={landDemo?.soilScore ?? ""} onChange={(e) => setField(setLandDemo, "soilScore", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Sulama</label>
              <select className="select-premium" value={landDemo?.irrigation || "var"} onChange={(e) => setField(setLandDemo, "irrigation", e.target.value)}>
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </div>
          </div>
        </section>
        ) : null}

        {/* ═══ PREMIUM 3D LAND MODEL ═══ */}
        {landWorkspaceTab === "overview" ? <LandModel3D landDemo={landDemo} /> : null}

        {(landWorkspaceTab === "overview" || landWorkspaceTab === "location") ? (
        <section className="panel" style={{ display: "grid", gap: "14px", border: '1px solid var(--ui-border)' }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div className="tech-badge" style={{ marginBottom: "8px" }}>LIVE_SYSTEM_ANALYTICS</div>
              <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "28px" }}>Arazi <em>Digital Twin</em></h3>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <GradeBadge score={Number(landDemo?.soilScore || 70)} />
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={toneChip("ok")}>NEURAL_NET_SYNC</div>
                <div style={toneChip(strategyTone)}>{strategyLabel}</div>
              </div>
            </div>
          </div>

          <SensorGrid landDemo={landDemo} />

          <div style={gridMetrics}>
            <div style={metricCardStyle}>
              <div className="bento-head">API birim fiyat</div>
              <strong style={{ fontSize: "20px" }}>{fmtTl(landPriceData?.priceTlDa || 0)}/da</strong>
              <Sparkline data={[145000, 152000, 158000, 162000, 168000, 175000, landPriceData?.priceTlDa || 180000]} color="var(--sprout)" width={90} height={22} />
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Parsel toplam</div>
              <strong style={{ fontSize: "20px" }}>{fmtTl(landValuationDemo?.total || 0)}</strong>
              <Sparkline data={[2800000, 3000000, 3100000, 3250000, 3400000, 3500000, landValuationDemo?.total || 3600000]} color="var(--wheat)" width={90} height={22} />
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Guven</div>
              <strong style={{ fontSize: "20px" }}>%{Math.round(Number(landPriceData?.confidenceScore || 0) * 100)}</strong>
              <Sparkline data={[55, 58, 62, 65, 68, 72, Math.round(Number(landPriceData?.confidenceScore || 0) * 100)]} color="var(--sky)" width={90} height={22} />
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Geri donus</div>
              <strong style={{ fontSize: "20px" }}>{landInvestmentLens?.paybackYears ?? "-"} yil</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Emsal sayisi</div>
              <strong style={{ fontSize: "20px" }}>{manualListingStats?.count ?? manualRows.length}</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Canli ilan</div>
              <strong style={{ fontSize: "20px" }}>{liveRows.length}</strong>
            </div>
          </div>
          <div style={listItemStyle}>
            <strong>Parsel hazırlık skoru: %{parcelReadinessScore}</strong>
            <small>
              {parcelReadinessChecks.map((item) => `${item.label}: ${item.ok ? "OK" : "Eksik"}`).join(" • ")}
            </small>
            <small>
              Onizleme: {fmtNum(parcelAreaDa)} da • {fmtNum(parcelUnitPrice)} TL/da • Toplam {fmtNum(parcelEstimatedTotal)} TL
            </small>
            <small>
              Konum koordinati: {coordsValid ? coordsRaw : "Girili değil (lat,lon)"} • Model hazırlık: %{modelReadinessScore}
            </small>
            {missingReadiness.length ? (
              <small style={{ color: "#fbbf24" }}>
                Eksik alanlar: {missingReadiness.join(", ")}
              </small>
            ) : (
              <small style={{ color: "#86efac" }}>
                <CheckCircle2 size={12} style={{ verticalAlign: "middle", marginRight: "6px" }} />
                Parsel bilgileri model icin hazır.
              </small>
            )}
            {parcelVsNeighborhoodPct != null ? (
              <small>
                Mahalle medyanına göre fark: {parcelVsNeighborhoodPct > 0 ? "+" : ""}{parcelVsNeighborhoodPct}%
              </small>
            ) : null}
            {modelReadinessMissing.length ? (
              <small style={{ color: "rgba(245,237,216,0.72)" }}>
                Gelismis model icin eksikler: {modelReadinessMissing.join(", ")}
              </small>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => typeof loadLiveLandListings === "function" && loadLiveLandListings()}>
              <Upload size={14} /> Canli ilan cek
            </button>
            <button className="btn-secondary" onClick={() => typeof loadManualListings === "function" && loadManualListings()}>
              <BarChart3 size={14} /> Emsal yenile
            </button>
            {sourceBlendUnitPrice ? (
              <button
                className="btn-secondary"
                onClick={() => typeof setEconLandValue === "function" && setEconLandValue(sourceBlendUnitPrice)}
                title="API + emsal + canlı ilan ortalaması"
              >
                <ShieldCheck size={14} /> Harman fiyati uygula ({fmtNum(sourceBlendUnitPrice)} TL/da)
              </button>
            ) : null}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.78 }}>
            Not: Demo veri tohumlama islemleri sadece <strong>Demo</strong> sekmesinde tutulur.
          </div>

          {landPriceLoading || landMlLoading ? <div style={{ color: "#d4a843", fontSize: "13px" }}>Veri yukleniyor...</div> : null}
          {landPriceError ? <div style={{ color: "#E07070", fontSize: "13px" }}>{landPriceError}</div> : null}
          {landMlError ? <div style={{ color: "#E07070", fontSize: "13px" }}>{landMlError}</div> : null}
          {manualListingStatus ? <div style={{ color: "rgba(245,237,216,0.8)", fontSize: "13px" }}>{manualListingStatus}</div> : null}
          {landProfileStatus ? <div style={{ color: "rgba(245,237,216,0.8)", fontSize: "13px" }}>{landProfileStatus}</div> : null}
        </section>
        ) : null}

        {/* ═══ Phase 2: Intelligent Monitoring Section ═══ */}
        {landWorkspaceTab === "overview" ? (
        <section className="panel" style={{ display: "grid", gap: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "24px" }}>Akıllı İzleme <em>ve Tahmin</em></h3>
            <span style={toneChip("ok")}>Real-time Analiz Aktif</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            {/* Soil Health Gauge */}
            <div className="bento-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px" }}>
              <div className="bento-head">Toprak Vitalite Skoru</div>
              <div style={{ position: "relative", width: "130px", height: "130px", margin: "20px 0" }}>
                <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="var(--sprout)" strokeWidth="8"
                    strokeDasharray={`${(landDemo?.soilScore || 70) * 2.82} 282`} strokeLinecap="round"
                    style={{ filter: "drop-shadow(0 0 8px var(--ui-glow))", transition: "stroke-dasharray 1.5s cubic-bezier(0.2, 1, 0.2, 1)" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "32px", fontWeight: "800", color: "var(--sprout)", lineHeight: 1 }}>{landDemo?.soilScore || 70}</span>
                  <span style={{ fontSize: "12px", opacity: 0.5 }}>SKOR</span>
                </div>
              </div>
              <p style={{ fontSize: "12px", opacity: 0.7, textAlign: "center", padding: "0 10px" }}>
                {Number(landDemo?.soilScore || 70) > 80 ? "Mükemmel yetiştirme koşulları saptandı." : Number(landDemo?.soilScore || 70) > 60 ? "Standart verimlılık seviyesi." : "Besin takviyesi ve iyıleştirme önerilir."}
              </p>
            </div>

            {/* Satellite-Backed Yield Estimation (Phase 5) */}
            <div className="bento-card" style={{ minHeight: "220px", display: "flex", flexDirection: "column" }}>
              <div className="bento-head" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Uydu Destekli Rekolte Tahmini</span>
                <span style={{ fontSize: "10px", padding: "4px 8px", background: "rgba(143,188,69,0.1)", borderRadius: "10px", color: "var(--sprout)" }}>
                  <Crosshair size={10} style={{ display: 'inline', marginRight: '4px' }} />
                  CANLI VERİ
                </span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                {[
                  { label: "Bölge Ortalaması", value: 85, color: "rgba(255,255,255,0.2)" },
                  { label: "Mevcut Potansiyel (NDVI Bazlı)", value: Number(landDemo?.soilScore || 70), color: "var(--wheat)" },
                  { label: "Optimum Hedef (İklim Bazlı)", value: Math.min(100, Number(landDemo?.soilScore || 70) + 15), color: "var(--sprout)" }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ fontWeight: 500 }}>{item.label}</span>
                      <strong style={{ color: item.color, cursor: 'help' }} title={`${item.value}% potansiyel üzerinden hesaplanmıştır`}>
                        {fmtNum(Math.round(parcelAreaDa * (item.value / 100) * 450))} kg
                      </strong>
                    </div>
                    <div style={{ height: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "5px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.03)" }}>
                      <div style={{ width: `${item.value}%`, height: "100%", background: item.color, borderRadius: "5px", transition: "width 1.5s cubic-bezier(0.2, 1, 0.2, 1)" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", fontSize: "11px", opacity: 0.6, fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
                * Hasat projeksiyonu {parcelAreaDa} da alan, <strong>{landDemo?.plantedCrop || "seçili mahsul"}</strong> türü ve güncel uydu <strong>NDVI</strong> indisleri kullanılarak hesaplanmıştır.
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {/* ═══ INVESTMENT INTELLIGENCE: RADAR + ROI (Phase 7) ═══ */}
        {landWorkspaceTab === "overview" ? (
        <section className="panel" style={{ display: "grid", gap: "20px" }}>
          <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "24px" }}>Yatırım <em>İstihbaratı</em></h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            {/* Radar Chart */}
            <div className="bento-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px" }}>
              <div className="bento-head" style={{ alignSelf: "flex-start", marginBottom: "12px" }}>Parsel Kalite Radarı</div>
              <RadarChart size={220} dimensions={[
                { label: "TOPRAK", value: Number(landDemo?.soilScore || 70) },
                { label: "SULAMA", value: (landDemo?.irrigation === "var" ? 85 : 30) },
                { label: "ERİŞİM", value: (landDemo?.roadAccess === "iyi" ? 90 : landDemo?.roadAccess === "orta" ? 60 : 30) },
                { label: "İMAR", value: (landDemo?.zoningStatus === "var" ? 95 : landDemo?.zoningStatus === "kismi" ? 60 : 25) },
                { label: "EĞİM", value: Math.max(0, 100 - Number(landDemo?.slopePct || 6) * 4) },
                { label: "KONUM", value: Number(landSignalQuality?.score || 65) }
              ]} />
            </div>
            {/* ROI Calculator */}
            <ROICalculator
              unitPrice={Number(landPriceData?.priceTlDa || 0)}
              areaDa={parcelAreaDa}
              yieldKgDa={5000}
              cropPriceKg={12.5}
            />
          </div>
        </section>
        ) : null}

        {/* ═══ ML VALUATION INTELLIGENCE (Phase 8) ═══ */}
        {landWorkspaceTab === "valuation" ? (() => {
          const mlResult = getMLValuation(landDemo || {}, landQuery?.city || effectiveLandCity || "Ankara");
          const riskResult = getRiskAnalysis(landQuery?.city || effectiveLandCity || "Ankara");
          const projResult = get5YearProjection(
            Number(landPriceData?.priceTlDa || mlResult.pricing.adjustedPerDa || 150000),
            landQuery?.city || effectiveLandCity || "Ankara"
          );
          const fuzzyResult = getFuzzyDecision(landDemo || {}, landQuery?.city || effectiveLandCity || "Ankara");
          return (
            <>

              {/* ML Feature Analysis */}
              <section className="panel" style={{ display: "grid", gap: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "24px" }}>ML <em>Değerleme</em></h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ padding: "6px 14px", borderRadius: "12px", background: "rgba(0,255,157,0.06)", border: "1px solid rgba(0,255,157,0.15)", fontSize: "11px", fontWeight: "800", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "var(--sprout)" }}>ML SKOR</span>
                      <span style={{ fontSize: "18px", fontWeight: "900", color: "var(--sprout)", fontFamily: "JetBrains Mono" }}>{mlResult.mlScore}</span>
                      <span style={{ fontSize: "10px", opacity: 0.5 }}>/100</span>
                    </div>
                    <GradeBadge score={mlResult.mlScore} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                  {/* Feature Breakdown */}
                  <div className="bento-card" style={{ padding: "24px" }}>
                    <div className="bento-head" style={{ marginBottom: "16px" }}>Özellik Ağırlık Analizi</div>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {mlResult.featureBreakdown.map((f, idx) => (
                        <div key={idx}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                            <span style={{ fontWeight: "600" }}>{f.label}</span>
                            <span style={{ fontFamily: "JetBrains Mono", fontSize: "10px" }}>
                              <strong style={{ color: f.score > 70 ? "var(--sprout)" : f.score > 40 ? "var(--wheat)" : "#f87171" }}>{f.score}</strong>
                              <span style={{ opacity: 0.4 }}> × %{f.weight}</span>
                            </span>
                          </div>
                          <div style={{ height: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${f.score}%`, borderRadius: "4px",
                              background: f.score > 70 ? "var(--sprout)" : f.score > 40 ? "var(--wheat)" : "#f87171",
                              transition: "width 1s cubic-bezier(0.2,1,0.2,1)"
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ML Pricing Output */}
                  <div className="bento-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="bento-head">ML Fiyat Çıktısı</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>BAZ FIYAT</div>
                        <div style={{ fontSize: "20px", fontWeight: "900", fontFamily: "JetBrains Mono" }}>{fmtTl(mlResult.pricing.basePerDa)}/da</div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(0,255,157,0.03)", borderRadius: "14px", border: "1px solid rgba(0,255,157,0.1)" }}>
                        <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>ML DÜZELTİLMİŞ</div>
                        <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--sprout)", fontFamily: "JetBrains Mono" }}>{fmtTl(mlResult.pricing.adjustedPerDa)}/da</div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>KALİTE ÇARPANI</div>
                        <div style={{ fontSize: "20px", fontWeight: "900", color: "var(--wheat)" }}>×{mlResult.pricing.qualityMultiplier}</div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: "9px", opacity: 0.4, fontWeight: "700" }}>TOPLAM TAHMİN</div>
                        <div style={{ fontSize: "20px", fontWeight: "900", fontFamily: "JetBrains Mono" }}>{fmtTl(mlResult.pricing.totalEstimate)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", opacity: 0.5, textAlign: "center" }}>Güven skoru: %{mlResult.confidence} • Derece: {mlResult.grade}</div>
                  </div>
                </div>
              </section>

              {/* Risk Analysis Dashboard */}
              <section className="panel" style={{ display: "grid", gap: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "24px" }}>Risk <em>Analizi</em></h3>
                  <span style={{
                    padding: "6px 14px", borderRadius: "12px", fontSize: "11px", fontWeight: "800",
                    background: `${riskResult.overallColor}15`, border: `1px solid ${riskResult.overallColor}30`,
                    color: riskResult.overallColor
                  }}>
                    {riskResult.overallLevel} Risk • %{riskResult.overallScore}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  {riskResult.items.map(r => (
                    <div key={r.id} className="bento-card" style={{ padding: "20px", textAlign: "center" }}>
                      <div style={{ fontSize: "32px", marginBottom: "10px" }}>{r.icon}</div>
                      <div style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "0.5px", opacity: 0.6, marginBottom: "8px" }}>{r.label}</div>
                      <div style={{ position: "relative", width: "80px", height: "80px", margin: "0 auto 10px" }}>
                        <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
                          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                          <circle cx="50" cy="50" r="40" fill="none" stroke={r.color} strokeWidth="8"
                            strokeDasharray={`${r.score * 2.51} 251`} strokeLinecap="round"
                            style={{ filter: `drop-shadow(0 0 6px ${r.color})`, transition: "stroke-dasharray 1.5s cubic-bezier(0.2,1,0.2,1)" }} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: "22px", fontWeight: "900", color: r.color }}>{r.score}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  💡 {riskResult.recommendation}
                </div>
              </section>

              {/* 5-Year Projection */}
              <section className="panel" style={{ display: "grid", gap: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="section-title" style={{ ...panelTitleStyle, fontSize: "24px" }}>5 Yıllık <em>Projeksiyon</em></h3>
                  <span style={{ fontSize: "10px", padding: "4px 10px", background: "rgba(0,255,157,0.08)", borderRadius: "8px", color: "var(--sprout)", fontWeight: "800" }}>
                    Bölge: %{projResult.baseGrowthRate} /yıl
                  </span>
                </div>
                <div className="bento-card" style={{ padding: "28px" }}>
                  <div style={{ display: "flex", gap: "24px", marginBottom: "20px", justifyContent: "center" }}>
                    {projResult.projections.map(s => (
                      <span key={s.id} style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: s.color }} />
                        <strong>{s.label}</strong>
                      </span>
                    ))}
                  </div>
                  <div style={{ position: "relative", height: "200px" }}>
                    {/* Simplified bar-group chart */}
                    <div style={{ display: "flex", alignItems: "flex-end", height: "100%", gap: "12px", justifyContent: "center" }}>
                      {[0, 1, 2, 3, 4, 5].map(year => (
                        <div key={year} style={{ display: "flex", gap: "3px", alignItems: "flex-end", flex: 1 }}>
                          {projResult.projections.map(s => {
                            const val = s.values[year]?.value || 0;
                            const maxVal = projResult.maxValue || 1;
                            const h = Math.max(8, (val / maxVal) * 180);
                            return (
                              <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                <span style={{ fontSize: "8px", fontFamily: "JetBrains Mono", color: s.color, fontWeight: "700", whiteSpace: "nowrap" }}>
                                  {(val / 1000).toFixed(0)}K
                                </span>
                                <div style={{
                                  width: "100%", height: `${h}px`, borderRadius: "4px 4px 2px 2px",
                                  background: `linear-gradient(180deg, ${s.color}, ${s.color}40)`,
                                  transition: "height 1s cubic-bezier(0.2,1,0.2,1)"
                                }} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-around", marginTop: "8px" }}>
                    {["Şimdi", "1. Yıl", "2. Yıl", "3. Yıl", "4. Yıl", "5. Yıl"].map((l, i) => (
                      <span key={i} style={{ fontSize: "10px", fontWeight: "600", opacity: 0.5 }}>{l}</span>
                    ))}
                  </div>
                </div>
              </section>

              {/* Fuzzy-Logic Decision Support HUD */}
              <section className="glass-premium" style={{ padding: "28px", position: "relative", overflow: "hidden", border: `1px solid ${fuzzyResult.color}40` }}>
                <div className="hud-scan" style={{ opacity: 0.15 }} />
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "28px", alignItems: "center" }}>
                  {/* Decision LED */}
                  <div style={{ textAlign: "center" }}>
                    <div className="pulse" style={{
                      width: "90px", height: "90px", borderRadius: "22px",
                      background: `${fuzzyResult.color}15`,
                      border: `2px solid ${fuzzyResult.color}`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 0 30px ${fuzzyResult.color}30`
                    }}>
                      <span style={{ fontSize: "26px", fontWeight: "900", color: fuzzyResult.color, lineHeight: 1 }}>{fuzzyResult.decision}</span>
                      <span style={{ fontSize: "9px", opacity: 0.5, fontWeight: "700", marginTop: "4px" }}>%{fuzzyResult.confidence}</span>
                    </div>
                    <div style={{ fontSize: "9px", fontWeight: "800", letterSpacing: "1px", opacity: 0.5, marginTop: "8px" }}>FUZZY KARAR</div>
                  </div>

                  {/* Signal Bars */}
                  <div style={{ display: "grid", gap: "8px" }}>
                    {[
                      { label: "Kalite", value: fuzzyResult.signals.quality, color: "var(--sprout)" },
                      { label: "Risk (Ters)", value: fuzzyResult.signals.risk, color: "#86efac" },
                      { label: "Büyüme", value: fuzzyResult.signals.growth, color: "var(--sky)" },
                      { label: "Piyasa", value: fuzzyResult.signals.trend, color: "var(--wheat)" },
                    ].map((s, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "3px" }}>
                          <span style={{ fontWeight: "600" }}>{s.label}</span>
                          <span style={{ fontWeight: "700", color: s.color, fontFamily: "JetBrains Mono" }}>{s.value}%</span>
                        </div>
                        <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${s.value}%`, background: s.color, borderRadius: "3px", transition: "width 1s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reasoning */}
                  <div style={{ width: "200px", display: "grid", gap: "6px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "900", letterSpacing: "1px", opacity: 0.5 }}>GEREKÇELENDİRME</div>
                    {fuzzyResult.reasoning.map((r, i) => (
                      <div key={i} style={{ fontSize: "10px", opacity: 0.7, padding: "4px 8px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", borderLeft: `2px solid ${fuzzyResult.color}40` }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

            </>
          );
        })() : null}

        {/* ═══ ECOSYSTEM SYNERGY: MARKET LINKAGE (Phase 6) ═══ */}
        {landWorkspaceTab === "overview" ? (
        <section className="glass-premium" style={{ padding: '24px', border: '1px solid var(--sprout)', position: 'relative', overflow: 'hidden' }}>
          <div className="hud-scan" style={{ opacity: 0.2 }} />
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '16px', background: 'rgba(143,188,69,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(143,188,69,0.3)' }}>
              <TrendingUp size={32} color="var(--sprout)" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 className="section-title" style={{ fontSize: '20px', margin: '0 0 4px 0', color: 'var(--sprout)' }}>Pazar <em>Entegrasyonu</em></h3>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: 0 }}>
                Arazinizin değerleme raporu ({fmtTl(parcelEstimatedTotal)}) hazır. Bu veriyi kullanarak hemen bir pazar ilanı oluşturabilir veya hasat projeksiyonunu satışa sunabilirsiniz.
              </p>
            </div>
            <button
              className="btn-primary"
              style={{ padding: '12px 24px', background: 'var(--sprout)', color: '#000', fontWeight: '800', boxShadow: '0 0 20px rgba(143,188,69,0.4)' }}
              onClick={() => {
                if (typeof setBottomTab === 'function') {
                  setBottomTab('market');
                  // Optionally pre-fill something here if global state allows
                }
              }}
            >
              PAZARA GÖNDER
            </button>
          </div>
        </section>
        ) : null}

        {landWorkspaceTab === "location" ? (
        <section className="panel" id="land-location-section" style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h3 className="section-title" style={panelTitleStyle}>Konum ve parsel</h3>
            <span style={toneChip(strategyTone)}>
              {strategyTone === "warn" ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
              Strateji: {strategyLabel}
            </span>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label className="bento-head">Parsel hızlı preset</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {parcelPresets.map((preset) => (
                <button
                  key={preset.id}
                  className="btn-secondary"
                  title={preset.note}
                  onClick={() => applyParcelPreset(preset)}
                >
                  <Wand2 size={13} /> {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label className="bento-head">İl/ilçe/mahalle ara</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                className="select-premium"
                value={locationSearch || ""}
                onChange={(e) => typeof setLocationSearch === "function" && setLocationSearch(e.target.value)}
                placeholder="Malatya, Yesilyurt, Tecde..."
              />
              <button className="btn-secondary" onClick={() => typeof setLocationSearch === "function" && setLocationSearch("")}>
                <Search size={14} /> Temizle
              </button>
            </div>
            {matches.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {matches.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    style={{ ...listItemStyle, textAlign: "left", cursor: "pointer" }}
                    onClick={() => typeof applyLocationSearchHit === "function" && applyLocationSearchHit(item)}
                  >
                    <span>
                      <MapPin size={14} style={{ verticalAlign: "middle", marginRight: "6px" }} />
                      {item.label}
                    </span>
                    <small>{item.type}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {!matches.length && String(locationSearch || "").trim().length >= 2 ? (
              <small style={{ color: "rgba(245,237,216,0.72)" }}>
                Eşleşen konum bulunamadı. İl / ilçe / mahalle adını tam yazın.
              </small>
            ) : null}
          </div>

          <div style={gridInputs}>
            <div>
              <label className="bento-head">Sehir</label>
              <input
                className="select-premium"
                value={landQuery?.city || ""}
                placeholder={effectiveLandCity || "Malatya"}
                onChange={(e) => typeof handleLandCityInputChange === "function" && handleLandCityInputChange(e.target.value)}
              />
            </div>
            <div>
              <label className="bento-head">İlçe</label>
              <input className="select-premium" value={landDemo?.district || ""} onChange={(e) => setField(setLandDemo, "district", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Mahalle</label>
              <input className="select-premium" value={landDemo?.neighborhood || ""} onChange={(e) => setField(setLandDemo, "neighborhood", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="bento-head">Uydu Haritasından Konum Seçin</label>
              <div style={{ height: "260px", width: "100%", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(143,188,69,0.3)", position: "relative", marginBottom: "12px" }}>
                {typeof window !== 'undefined' && (
                  <MapContainer
                    center={[mapLat, mapLon]}
                    zoom={14}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={18}
                      attribution="Tiles &copy; Esri"
                    />
                    <LocationPicker />
                    <CircleMarker
                      center={[mapLat, mapLon]}
                      pathOptions={{ color: 'var(--sprout)', fillColor: 'var(--sprout)', fillOpacity: 0.5 }}
                      radius={8}
                    />
                    <CircleMarker
                      center={[mapLat, mapLon]}
                      pathOptions={{ color: 'var(--sprout)', fill: false, weight: 2 }}
                      radius={24}
                    />
                  </MapContainer>
                )}
                <div style={{ position: "absolute", bottom: "10px", left: "10px", background: "rgba(0,0,0,0.7)", padding: "4px 8px", borderRadius: "6px", fontSize: "11px", color: "var(--sprout)", zIndex: 1000, backdropFilter: "blur(4px)" }}>
                  Haritaya tıklayarak tarlanızı seçin
                </div>
              </div>
            </div>
            <div>
              <label className="bento-head">Giden Koordinat (lat,lon)</label>
              <input
                className="select-premium"
                value={landCoords || ""}
                placeholder="38.3552, 38.3095"
                onChange={(e) => typeof setLandCoords === "function" && setLandCoords(e.target.value)}
              />
            </div>
            <div>
              <label className="bento-head">Alan (da)</label>
              <input className="select-premium" type="number" value={landDemo?.areaDa ?? ""} onChange={(e) => setField(setLandDemo, "areaDa", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Egim (%)</label>
              <input className="select-premium" type="number" value={landDemo?.slopePct ?? ""} onChange={(e) => setField(setLandDemo, "slopePct", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Toprak skoru</label>
              <input className="select-premium" type="number" min="0" max="100" value={landDemo?.soilScore ?? ""} onChange={(e) => setField(setLandDemo, "soilScore", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Bolge tipi</label>
              <select className="select-premium" value={landDemo?.zone || "gecis"} onChange={(e) => setField(setLandDemo, "zone", e.target.value)}>
                <option value="ova">Ova</option>
                <option value="gecis">Gecis</option>
                <option value="yamac">Yamac</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Sulama</label>
              <select className="select-premium" value={landDemo?.irrigation || "var"} onChange={(e) => setField(setLandDemo, "irrigation", e.target.value)}>
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Yol erisimi</label>
              <select className="select-premium" value={landDemo?.roadAccess || "orta"} onChange={(e) => setField(setLandDemo, "roadAccess", e.target.value)}>
                <option value="iyi">Iyi</option>
                <option value="orta">Orta</option>
                <option value="zayif">Zayif</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Yol mesafe (m)</label>
              <input className="select-premium" type="number" value={landDemo?.roadDistanceM ?? ""} onChange={(e) => setField(setLandDemo, "roadDistanceM", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Yol gecisi</label>
              <select className="select-premium" value={landDemo?.roadPass || "var"} onChange={(e) => setField(setLandDemo, "roadPass", e.target.value)}>
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </div>
            <div>
              <label className="bento-head">İmar</label>
              <select className="select-premium" value={landDemo?.zoningStatus || "yok"} onChange={(e) => setField(setLandDemo, "zoningStatus", e.target.value)}>
                <option value="var">İmarli</option>
                <option value="kismi">Kismi</option>
                <option value="yok">Tarım</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Yapi</label>
              <select className="select-premium" value={landDemo?.structureStatus || "yok"} onChange={(e) => setField(setLandDemo, "structureStatus", e.target.value)}>
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Parsel durumu</label>
              <select className="select-premium" value={landDemo?.plantedStatus || "bos"} onChange={(e) => setField(setLandDemo, "plantedStatus", e.target.value)}>
                <option value="bos">Bos</option>
                <option value="ekili">Ekili</option>
              </select>
            </div>
            <div>
              <label className="bento-head">Ekili urun</label>
              <input
                className="select-premium"
                value={landDemo?.plantedCrop || ""}
                placeholder="Orn. domates"
                onChange={(e) => setField(setLandDemo, "plantedCrop", e.target.value)}
              />
            </div>
            <div>
              <label className="bento-head">Ekili urun degeri (TL/da)</label>
              <input
                className="select-premium"
                type="number"
                min="0"
                value={landDemo?.plantedValueTlDa ?? ""}
                onChange={(e) => setField(setLandDemo, "plantedValueTlDa", e.target.value)}
              />
            </div>
          </div>

          <small style={{ color: coordsValid ? "#86efac" : "rgba(245,237,216,0.72)" }}>
            {coordsValid
              ? "Koordinat gecerli: ML ve geo emsal sorgusu noktayi kullanir."
              : "İpucu: koordinatı `lat,lon` formatında girersen model ilçe/mahalle dışında noktasal ağırlık da kullanır."}
          </small>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => typeof applyLandFromSoilSignals === "function" && applyLandFromSoilSignals()}>
              <Wand2 size={14} /> Toprak sinyalini uygula
            </button>
            <button className="btn-secondary" onClick={() => typeof trainCustomLandPriceModel === "function" && trainCustomLandPriceModel({ prefetch: false })}>
              <Activity size={14} /> Bu parselde modeli güncelle
            </button>
          </div>
        </section>
        ) : null}

        {landWorkspaceTab === "location" ? (
        <section className="panel" style={{ display: "grid", gap: "12px" }}>
          <h3 className="section-title" style={panelTitleStyle}>Konum bilgileri</h3>

          <div style={gridMetrics}>
            <div style={metricCardStyle}>
              <div className="bento-head">Pazar konumu</div>
              <strong style={{ fontSize: "18px" }}>{landLocationScope?.position || "-"}</strong>
              <small>
                Prim farki: {landLocationScope?.premiumPct != null ? `${landLocationScope.premiumPct > 0 ? "+" : ""}${landLocationScope.premiumPct}%` : "-"}
              </small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Saha kapsami</div>
              <strong style={{ fontSize: "18px" }}>{fmtNum(landLocationScope?.sampleCount || 0)} ilan</strong>
              <small>Tazelik skoru: {fmtNum(landLocationScope?.freshness || 0)}/100</small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Lider ilçe</div>
              <strong style={{ fontSize: "18px" }}>
                {landDistrictLeaders?.high?.district || "-"}
              </strong>
              <small>
                {landDistrictLeaders?.high?.median ? `${fmtNum(landDistrictLeaders.high.median)} TL/da` : "Veri yok"}
              </small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Düşük ilçe</div>
              <strong style={{ fontSize: "18px" }}>
                {landDistrictLeaders?.low?.district || "-"}
              </strong>
              <small>
                {landDistrictLeaders?.low?.median ? `${fmtNum(landDistrictLeaders.low.median)} TL/da` : "Veri yok"}
              </small>
            </div>
          </div>

          {topDistricts.length || lowDistricts.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {topDistricts.length ? (
                <div style={listItemStyle}>
                  <strong>Yuksek bant ilceler</strong>
                  <small>
                    {topDistricts.map((item) => `${item.district} (${fmtNum(item.medianTlDa)} TL/da, ${item.sampleCount} ilan)`).join(" • ")}
                  </small>
                </div>
              ) : null}
              {lowDistricts.length ? (
                <div style={listItemStyle}>
                  <strong>Giriş için daha düşük ilçeler</strong>
                  <small>
                    {lowDistricts.map((item) => `${item.district} (${fmtNum(item.medianTlDa)} TL/da, ${item.sampleCount} ilan)`).join(" • ")}
                  </small>
                </div>
              ) : null}
            </div>
          ) : null}

          {districtHeatRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>İlçe isiharitasi</h4>
              {districtHeatRows.slice(0, 8).map((row) => (
                <div key={`${row.district}-${row.median}`} style={listItemStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{row.district}</strong>
                    <small>{fmtNum(row.median)} TL/da • {row.count} ilan • {row.deltaPct > 0 ? "+" : ""}{row.deltaPct}%</small>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      background: "rgba(245,237,216,0.12)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(4, Math.min(100, Number(row.intensity || 0)))}%`,
                        background: "linear-gradient(90deg,#6ee7b7,#34d399,#10b981)"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        typeof setLandDemo === "function" &&
                        setLandDemo((prev) => ({
                          ...(prev || {}),
                          district: row.district || "",
                          neighborhood: ""
                        }))
                      }
                    >
                      İlçeyi uygula
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {neighborhoodHeatRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Mahalle sinyalleri</h4>
              {neighborhoodHeatRows.slice(0, 8).map((row) => (
                <div key={`${row.neighborhood}-${row.median}`} style={listItemStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{row.neighborhood}</strong>
                    <small>{fmtNum(row.median)} TL/da • {row.count} ilan • {row.deltaPct > 0 ? "+" : ""}{row.deltaPct}%</small>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      typeof setLandDemo === "function" &&
                      setLandDemo((prev) => ({
                        ...(prev || {}),
                        neighborhood: row.neighborhood || ""
                      }))
                    }
                  >
                    Mahalleyi uygula
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

        {landWorkspaceTab === "valuation" ? (
        <section className="panel" id="land-valuation-section" style={{ display: "grid", gap: "12px" }}>
          <h3 className="section-title" style={panelTitleStyle}>Degerleme sonucu</h3>
          <div style={gridMetrics}>
            <div style={metricCardStyle}>
              <div className="bento-head">Baz</div>
              <strong style={{ fontSize: "18px" }}>{fmtTl(landValuationDemo?.base || 0)}/da</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Cari</div>
              <strong style={{ fontSize: "18px" }}>{fmtTl(landValuationDemo?.unitPrice || 0)}/da</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Aralik</div>
              <strong style={{ fontSize: "18px" }}>{fmtNum(landValuationDemo?.min || 0)} - {fmtNum(landValuationDemo?.max || 0)} TL/da</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Toplam</div>
              <strong style={{ fontSize: "18px" }}>{fmtTl(landValuationDemo?.totalWithCrop || landValuationDemo?.total || 0)}</strong>
            </div>
          </div>

          <div style={gridMetrics}>
            <div style={metricCardStyle}>
              <div className="bento-head">Konum etiketi</div>
              <strong style={{ fontSize: "18px" }}>{landLocationScope?.position || "-"}</strong>
              <small>{landActionPlan?.strategy || "-"}</small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Mahalle/İlçe medyan</div>
              <strong style={{ fontSize: "18px" }}>{fmtNum(landDistrictBenchmark?.neighborhoodMedian || 0)} / {fmtNum(landDistrictBenchmark?.districtMedian || 0)}</strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Sinyal</div>
              <strong style={{ fontSize: "18px" }}>
                <ShieldCheck size={14} style={{ verticalAlign: "middle", marginRight: "6px" }} />
                %{Math.round(Number(landSignalQuality?.score || 0))}
              </strong>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">ML tahmin</div>
              <strong style={{ fontSize: "18px" }}>{landMlData?.prediction ? `${fmtNum(landMlData.prediction)} TL/da` : "-"}</strong>
            </div>
          </div>

          <div style={gridMetrics}>
            <div style={metricCardStyle}>
              <div className="bento-head">Karar skoru</div>
              <strong style={{ fontSize: "18px" }}>{fmtNum(landActionPlan?.score || 0)}/100</strong>
              <small>Belirsizlik %{fmtNum(landActionPlan?.uncertainty || 0)}</small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Kaynak sinyali</div>
              <strong style={{ fontSize: "18px" }}>{fmtNum(landSignalQuality?.score || 0)}/100</strong>
              <small>{fmtNum(landSignalQuality?.geoCount || 0)} komsu • {fmtNum(landSignalQuality?.avgKm || 0)} km</small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Harman birim fiyat</div>
              <strong style={{ fontSize: "18px" }}>{sourceBlendUnitPrice ? `${fmtNum(sourceBlendUnitPrice)} TL/da` : "-"}</strong>
              <small>{sourceBlendTotal ? `Toplam ${fmtNum(sourceBlendTotal)} TL` : "Kaynak eksik"}</small>
            </div>
            <div style={metricCardStyle}>
              <div className="bento-head">Emsal benzerligi</div>
              <strong style={{ fontSize: "18px" }}>{comparableAvgScore ? `%${fmtNum(comparableAvgScore)}` : "-"}</strong>
              <small>{comparableRows.length ? `${comparableRows.length} uygun emsal` : "Emsal bulunamadi"}</small>
            </div>
          </div>

          {Array.isArray(landActionPlan?.notes) && landActionPlan.notes.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {landActionPlan.notes.slice(0, 4).map((note, idx) => (
                <div key={`${idx}-${note}`} style={listItemStyle}>
                  <small>{note}</small>
                </div>
              ))}
            </div>
          ) : null}

          {Array.isArray(landValuationDemo?.notes) && landValuationDemo.notes.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {landValuationDemo.notes.slice(0, 10).map((note, idx) => (
                <div key={`${idx}-${note}`} style={listItemStyle}>{note}</div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

        {landWorkspaceTab === "comparables" ? (
        <section className="panel" id="land-manual-form" style={{ display: "grid", gap: "12px" }}>
          <h3 className="section-title" style={panelTitleStyle}>Emsal ilan yonetimi</h3>
          <div style={gridInputs}>
            <div>
              <label className="bento-head">Baslik</label>
              <input className="select-premium" value={manualListingForm?.title || ""} onChange={(e) => setField(setManualListingForm, "title", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Fiyat TL/da</label>
              <input className="select-premium" type="number" value={manualListingForm?.priceTlDa || ""} onChange={(e) => setField(setManualListingForm, "priceTlDa", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">İlçe</label>
              <input className="select-premium" value={manualListingForm?.district || ""} onChange={(e) => setField(setManualListingForm, "district", e.target.value)} />
            </div>
            <div>
              <label className="bento-head">Mahalle</label>
              <input className="select-premium" value={manualListingForm?.neighborhood || ""} onChange={(e) => setField(setManualListingForm, "neighborhood", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="bento-head">İlan URL</label>
              <input className="select-premium" value={manualListingForm?.url || ""} onChange={(e) => setField(setManualListingForm, "url", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className="btn-primary" disabled={!manualFormValid} onClick={() => typeof saveManualListing === "function" && saveManualListing()}>
              <Plus size={14} /> İlan ekle
            </button>
            <button className="btn-secondary" onClick={() => typeof exportLandListingsCsv === "function" && exportLandListingsCsv()}>
              <Download size={14} /> CSV indir
            </button>
            <button className="btn-secondary" onClick={() => typeof exportLandListingsReportTxt === "function" && exportLandListingsReportTxt()}>
              <FileText size={14} /> TXT rapor
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                typeof setManualListingForm === "function" &&
                setManualListingForm({
                  district: "",
                  neighborhood: "",
                  title: "",
                  url: "",
                  priceTlDa: ""
                })
              }
            >
              Temizle
            </button>
          </div>
          {!manualFormValid ? (
            <small style={{ color: "rgba(245,237,216,0.75)" }}>
              Emsal ilan icin en az baslik + fiyat girin.
            </small>
          ) : null}
          {(manualPriceTlDa > 0 || apiPriceTlDa > 0) ? (
            <div style={listItemStyle}>
              <strong>Emsal fiyat onizleme</strong>
              <small>
                Girilen emsal: {fmtNum(manualPriceTlDa)} TL/da • API rayici: {fmtNum(apiPriceTlDa)} TL/da
              </small>
              <small>
                Fark: {manualVsApiPct == null ? "-" : `${manualVsApiPct > 0 ? "+" : ""}${manualVsApiPct}%`}
              </small>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: "8px" }}>
            <label className="bento-head">Toplu CSV import</label>
            <textarea
              className="select-premium"
              rows={5}
              value={manualCsv || ""}
              onChange={(e) => typeof setManualCsv === "function" && setManualCsv(e.target.value)}
              placeholder="city,district,neighborhood,crop,priceTlDa,title,url"
            />
            <button className="btn-secondary" onClick={() => typeof importManualCsv === "function" && importManualCsv()}>
              <Upload size={14} /> CSV import et
            </button>
          </div>

          {manualListingStats ? (
            <div style={gridMetrics}>
              <div style={metricCardStyle}><div className="bento-head">Emsal sayisi</div><strong style={{ fontSize: "18px" }}>{manualListingStats.count}</strong></div>
              <div style={metricCardStyle}><div className="bento-head">Medyan</div><strong style={{ fontSize: "18px" }}>{fmtNum(manualListingStats.median)} TL/da</strong></div>
              <div style={metricCardStyle}><div className="bento-head">Ortalama</div><strong style={{ fontSize: "18px" }}>{fmtNum(manualListingStats.avg)} TL/da</strong></div>
              <div style={metricCardStyle}><div className="bento-head">Haftalik degisim</div><strong style={{ fontSize: "18px" }}>%{manualListingStats.weeklyChangePct}</strong></div>
            </div>
          ) : null}

          {(manualListingStats || comparableMedianTlDa || liveMedianTlDa) ? (
            <div style={listItemStyle}>
              <strong>Emsal özeti</strong>
              <small>
                Manuel medyan: {manualListingStats?.median ? `${fmtNum(manualListingStats.median)} TL/da` : "-"} •
                Uyumlu emsal medyan: {comparableMedianTlDa ? `${fmtNum(comparableMedianTlDa)} TL/da` : "-"} •
                Canli medyan: {liveMedianTlDa ? `${fmtNum(liveMedianTlDa)} TL/da` : "-"}
              </small>
              {sourceBlendUnitPrice ? (
                <small>
                  Harman birim fiyat onerisi: {fmtNum(sourceBlendUnitPrice)} TL/da
                  {parcelAreaDa > 0 ? ` • Parsel toplam ${fmtNum(sourceBlendTotal)} TL` : ""}
                </small>
              ) : null}
            </div>
          ) : null}

          {comparableRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>En uygun emsaller</h4>
              {comparableRows.slice(0, 8).map((row) => {
                const item = row?.item || {};
                return (
                  <div key={item.id || `${item.title}-${item.priceTlDa}`} style={listItemStyle}>
                    <strong>{item.title || "Emsal"}</strong>
                    <small>{[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ")} • {fmtNum(item.priceTlDa)} TL/da • Uyum %{Math.round(Number(row.score || 0))}</small>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="btn-secondary" onClick={() => typeof setEconLandValue === "function" && setEconLandValue(Number(item.priceTlDa || 0))}>Fiyati baz al</button>
                      <button className="btn-secondary" onClick={() => typeof applyManualListingToLand === "function" && applyManualListingToLand(item)}>Parselde uygula</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {liveRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Canli cekilen ilanlar</h4>
              {liveRows.slice(0, 10).map((item) => (
                <div key={item.id || `${item.title}-${item.priceTlDa}`} style={listItemStyle}>
                  <strong>{item.title || "Canli ilan"}</strong>
                  <small>{[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ")} • {fmtNum(item.priceTlDa)} TL/da</small>
                  <button className="btn-secondary" onClick={() => typeof applyManualListingToLand === "function" && applyManualListingToLand(item)}>
                    Parselde uygula
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {manualRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Manuel ilan listesi</h4>
              {manualRows.slice(0, 14).map((item) => (
                <div key={item.id || `${item.title}-${item.priceTlDa}`} style={listItemStyle}>
                  <strong>{item.title || "İlan"}</strong>
                  <small>{[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ")} • {fmtNum(item.priceTlDa)} TL/da</small>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="btn-secondary" onClick={() => typeof applyManualListingToLand === "function" && applyManualListingToLand(item)}>Uygula</button>
                    {item.id ? <button className="btn-secondary" onClick={() => typeof removeManualListing === "function" && removeManualListing(item.id)}>Sil</button> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

        {landWorkspaceTab === "comparables" ? (
        <section className="panel" id="land-sources-section" style={{ display: "grid", gap: "12px" }}>
          <h3 className="section-title" style={panelTitleStyle}>Kaynak sağligi ve karşılastirma</h3>

          {sourceRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Kaynaklar</h4>
              {sourceRows.map((row) => (
                <div key={row.id || row.title} style={listItemStyle}>
                  <strong>{row.title || row.id}</strong>
                  <small>Oncelik {row.priority || "-"} • Agirlik {row.weight || "-"} • Guven {row.confidence || "-"}</small>
                </div>
              ))}
            </div>
          ) : null}

          {providerRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Provider health</h4>
              {providerRows.map((row) => (
                <div key={row.id || row.title} style={listItemStyle}>
                  <strong>{row.title || row.id}</strong>
                  <small>
                    Durum: {row.ok ? "Saglikli" : "Problem"} • HTTP {row.statusCode ?? "-"} • {row.latencyMs ?? "-"} ms
                    {row.error ? ` • ${row.error}` : ""}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "rgba(245,237,216,0.75)", fontSize: "13px" }}>Provider sağlık verisi yok.</div>
          )}

          {landCompareLoading ? <div style={{ color: "#d4a843", fontSize: "13px" }}>Karsilastirma yukleniyor...</div> : null}
          {landCompareError ? <div style={{ color: "#E07070", fontSize: "13px" }}>{landCompareError}</div> : null}

          {compareRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Model/kaynak fiyat karşılastirma</h4>
              {compareRows.map((row, idx) => (
                <div key={`${row.source || idx}`} style={listItemStyle}>
                  <strong>{row.sourceTitle || row.source || `Kaynak ${idx + 1}`}</strong>
                  <small>
                    {fmtNum(row.priceTlDa)} TL/da • Min/Max {fmtNum(row.minTlDa)} / {fmtNum(row.maxTlDa)} • Guven {confidenceText(row.confidence)}
                  </small>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

        {landWorkspaceTab === "profile" ? (
        <section className="panel" id="land-profile-section" style={{ display: "grid", gap: "12px" }}>
          <h3 className="section-title" style={panelTitleStyle}>Profil ve geçmiş</h3>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              className="select-premium"
              style={{ maxWidth: "360px" }}
              value={landProfileName || ""}
              onChange={(e) => typeof setLandProfileName === "function" && setLandProfileName(e.target.value)}
              placeholder="Profil adi"
            />
            <button className="btn-primary" onClick={() => typeof saveCurrentLandProfile === "function" && saveCurrentLandProfile()}>
              <Save size={14} /> Profili kaydet
            </button>
          </div>

          {profiles.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {profiles.map((profile) => (
                <div key={profile.id || `${profile.name}-${profile.city}`} style={listItemStyle}>
                  <strong>{profile.name || "Profil"}</strong>
                  <small>{[profile.city, profile.district, profile.neighborhood].filter(Boolean).join(" / ")} • {profile.area} da</small>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="btn-secondary" onClick={() => typeof applyLandProfile === "function" && applyLandProfile(profile)}>Yukle</button>
                    <button className="btn-secondary" onClick={() => typeof deleteLandProfile === "function" && deleteLandProfile(profile.id)}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "rgba(245,237,216,0.75)", fontSize: "13px" }}>Kayıtli profil yok.</div>
          )}

          {historyRows.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <h4 style={{ margin: "6px 0 0", fontSize: "16px" }}>Fiyat gecmisi</h4>
              {historyRows.slice(0, 10).map((row, idx) => (
                <div key={`${row.year || row.date || idx}`} style={listItemStyle}>
                  <strong>{row.year || row.date || `Kayıt ${idx + 1}`}</strong>
                  <small>{fmtNum(row.priceTlDa)} TL/da</small>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}

        {/* ═══ FLOATING QUICK-ACTION TOOLBAR ═══ */}
        <FloatingToolbar
          onSoilSignal={() => typeof applyLandFromSoilSignals === "function" && applyLandFromSoilSignals()}
          onModelUpdate={() => typeof trainCustomLandPriceModel === "function" && trainCustomLandPriceModel({ prefetch: false })}
          onSaveProfile={() => typeof saveCurrentLandProfile === "function" && saveCurrentLandProfile()}
          onGoMarket={() => typeof setBottomTab === "function" && setBottomTab("market")}
        />
      </div >
    </div >
  );
}
