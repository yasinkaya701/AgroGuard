import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Camera,
  Loader2,
  RefreshCcw,
  ScanLine,
  ShieldAlert,
  Upload,
  XCircle,
  BookOpen,
  ChevronDown,
  Search,
  Leaf,
  Bug,
  Droplets,
  Thermometer,
  MapPin,
  FileText,
  AlertTriangle,
  Beaker,
  Shield,
  HelpCircle,
  Edit,
  Cloud,
  Cpu,
  Wifi,
  Globe,
  Target,
  Bot,
  Sparkles
} from "lucide-react";
import {
  handbookSections,
  cropEncyclopedia,
  diseaseLibrary,
  glossary,
  pestGuide,
  ipmSteps,
  soilTesting,
  nutrientGuide,
  irrigationTips,
  weatherActions,
  troubleshooting,
  diseasePrevention,
  greenhouseRisks,
  fertilizerSchedule,
  harvestGuide
} from "../../data/guideData";

const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "10px 12px",
  border: "1px solid var(--ui-border)",
  borderRadius: "10px",
  background: "linear-gradient(165deg, rgba(15, 31, 22, 0.9), rgba(12, 24, 17, 0.84))"
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  fontWeight: 700,
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid var(--ui-border)",
  background: "rgba(19, 38, 28, 0.88)"
};

const HOME_OPERATIONS_TILES = [
  {
    id: "fields",
    title: "Tarlalarim",
    subtitle: "Parseller, arazi degeri ve saha kayitlari",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=900"
  },
  {
    id: "frost",
    title: "Don Riski",
    subtitle: "Don, anomali ve erken uyarı",
    image: "https://images.unsplash.com/photo-1517638851339-a711cfcf3279?auto=format&fit=crop&q=80&w=900"
  },
  {
    id: "satellite",
    title: "Uydu Izleme",
    subtitle: "Hackhaton quant grafikler ve iklim zekasi",
    image: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?auto=format&fit=crop&q=80&w=900"
  },
  {
    id: "irrigation",
    title: "Sulama Takibi",
    subtitle: "ET, sulama takvimi ve su butcesi",
    image: "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?auto=format&fit=crop&q=80&w=900"
  },
  {
    id: "fertility",
    title: "Gübreleme",
    subtitle: "Toprak, besin ve uygulama rehberi",
    image: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&q=80&w=900"
  },
  {
    id: "protection",
    title: "Bitki Koruma",
    subtitle: "Teşhis, zararlilar ve aksiyon plani",
    image: "https://images.unsplash.com/photo-1592982537447-6f2a6a0bfe7d?auto=format&fit=crop&q=80&w=900"
  }
];

const toPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (n > 1) return `${Math.round(n)}%`;
  return `${Math.round(n * 100)}%`;
};

const getHistoryConfidence = (item) => {
  const direct = Number(item?.confidence);
  if (Number.isFinite(direct)) return toPct(direct);
  const nested = Number(item?.result?.diagnosis?.confidence);
  if (Number.isFinite(nested)) return toPct(nested);
  return "-";
};

export function HomeTabHeader({ selectedPlant, result, diagnoseChecks, diagnoseReadiness, weather, city, onCityClick }) {
  const okCount = Number(diagnoseChecks?.okCount || 0);
  const totalCount = Number(diagnoseChecks?.items?.length || 0);

  const getAdvice = () => {
    if (!weather) return "Mevcut konum icin veri yukleniyor...";
    if (weather.frostRisk) return `${city}'de DON RISKI! Hassas bitkileri koruma altina alin.`;
    if (weather.temp > 32) return `${city}'de asiri sıcaklik. Sulama sikligini artirin.`;
    return `${city} için hava ve toprak sinyalleri dengede.`;
  };

  return (
    <section className="panel glass-premium" style={{ padding: "18px", position: "relative" }}>
      <div className="hud-scan" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", position: "relative", zIndex: 20 }}>
        <div style={{ flex: 1, minWidth: "240px" }}>
          <h2
            className="section-title"
            style={{ margin: 0, fontSize: "28px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}
            onClick={onCityClick}
          >
            {city} <Edit size={18} style={{ opacity: 0.5 }} /> <em>Danışmanı</em>
          </h2>
          <p style={{ margin: "6px 0 0", color: weather?.frostRisk ? "var(--danger)" : "var(--wheat)", fontWeight: 600 }}>
            <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />
            {getAdvice()}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={badgeStyle}>
            <Activity size={14} /> Hazırlık: {okCount}/{totalCount}
          </span>
          <span style={badgeStyle}>Bitki: {selectedPlant?.name || "Seçilmedi"}</span>
        </div>
      </div>
    </section>
  );
}

export function HomeTabMain({
  selectedPlant,
  plantSelectRef,
  fileInputRef,
  loading,
  file,
  preview,
  fileMeta,
  onSelectFile,
  setSelectedPlantId,
  filteredPlantProfiles,
  analyze,
  resetAll,
  result,
  showDiagnosisResult,
  diagnosisSummary,
  diagnosisConfidenceText,
  actionPlan,
  history,
  error,
  runtimeApiBase,
  apiReady,
  modelReady,
  selectedPlantSupported,
  hasPlant,
  hasFile,
  diagnoseChecks,
  diagnoseNextStep,
  runDiagnoseNextStep,
  diagnoseReadiness,
  onLocationManage,
  onNavigateTab,
  openAgroBot,
  notificationCount,
  openNotifications,
  plantDiseaseData,
  plantDiseaseError,
  weather,
  forecast,
  soilReport,
  fieldLocation,
  landDemo,
  city,
  newsItems,
  newsLoading,
  newsLive,
  newsError,
  newsUpdatedAt,
  refreshNews
}) {
  const checks = Array.isArray(diagnoseChecks?.items) ? diagnoseChecks.items : [];
  const diseaseList = Array.isArray(plantDiseaseData?.diseases) ? plantDiseaseData.diseases : [];
  const topPredictions = Array.isArray(result?.topPredictions) ? result.topPredictions : [];
  const historyItems = Array.isArray(history) ? history : [];
  const scrollToSection = (id) => {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const quickJumpItems = [
    {
      id: "home-readiness",
      label: "Hazırlık",
      detail: `${diagnoseChecks?.pct || 0}% tamam`,
      icon: Shield
    },
    {
      id: "home-diagnosis",
      label: "Teşhis",
      detail: selectedPlant?.name || "Bitki seçimi gerekli",
      icon: ScanLine
    },
    {
      id: result ? "home-results" : "home-diagnosis",
      label: "Sonuç",
      detail: result?.diagnosis?.name || "Henüz sonuç yok",
      icon: AlertTriangle
    },
    {
      id: "knowledge-base",
      label: "Bilgi Bankası",
      detail: `${handbookSections.length}+ rehber`,
      icon: BookOpen
    }
  ];
  const quickSummaryCards = [
    { label: "Hazırlık", value: `${diagnoseChecks?.pct || 0}%`, tone: "var(--sprout)" },
    { label: "Bitki hastalık listesi", value: diseaseList.length || "-", tone: "var(--wheat)" },
    { label: "Son analiz", value: historyItems.length || 0, tone: "var(--sky)" },
    { label: "Bilgi bankası modülü", value: handbookSections.length, tone: "var(--cream)" }
  ];
  const locationDistrict = String(fieldLocation?.district || landDemo?.district || "").trim();
  const locationNeighborhood = String(fieldLocation?.neighborhood || landDemo?.neighborhood || "").trim();
  const currentLocationLabel = [locationNeighborhood, locationDistrict, city].filter(Boolean).join(", ") || city || "Konum seç";
  const [favoriteLocations, setFavoriteLocations] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("agroguard.favoriteLocations");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
    } catch (_) {
      return [];
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("agroguard.favoriteLocations", JSON.stringify(favoriteLocations.slice(0, 5)));
    } catch (_) {
      // ignore storage failures
    }
  }, [favoriteLocations]);

  const saveCurrentLocation = () => {
    if (!currentLocationLabel) return;
    setFavoriteLocations((prev) => [currentLocationLabel, ...prev.filter((item) => item !== currentLocationLabel)].slice(0, 5));
  };

  const handleOperationsTile = (tileId) => {
    if (tileId === "fields") {
      onNavigateTab?.("land");
      return;
    }
    if (tileId === "frost" || tileId === "satellite" || tileId === "irrigation") {
      onNavigateTab?.("weather");
      return;
    }
    if (tileId === "fertility") {
      scrollToSection("knowledge-base");
      return;
    }
    if (tileId === "protection") {
      scrollToSection("home-diagnosis");
    }
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      {/* ═══ SYSTEM METRICS & NEWS GRID ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", alignItems: "start" }}>
        <div className="system-metrics-grid" style={{ gridTemplateColumns: "1fr", gap: "12px", margin: 0 }}>
          <div className="metric-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="metric-label">Neural Sync</span>
              <Cpu size={14} color="var(--sprout)" />
            </div>
            <span className="metric-value">{modelReady ? "98.4%" : "BOOTING..."}</span>
            <div style={{ height: "2px", background: "rgba(143,188,69,0.1)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ width: modelReady ? "98%" : "20%", height: "100%", background: "var(--sprout)", transition: "width 1s ease" }} />
            </div>
          </div>

          <div className="metric-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="metric-label">Atmosphere</span>
              <Cloud size={14} color="var(--sky)" />
            </div>
            <span className="metric-value">{weather?.temp ? `${weather.temp}°C` : "SCANNING..."}</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>{weather?.description || "Signal acquired"}</span>
          </div>

          <div className="metric-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="metric-label">Connectivity</span>
              <Wifi size={14} color="var(--wheat)" />
            </div>
            <span className="metric-value">Active</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>SSL Secured Portal</span>
          </div>
        </div>

        <section className="panel" style={{ display: "grid", gap: "12px", padding: "16px", background: "linear-gradient(145deg, rgba(18,34,24,0.92), rgba(10,22,15,0.88))" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: "8px" }}>Bilgi Bankası</div>
              <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>El kılavuzu ve rehberler</h3>
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "rgba(245,237,216,0.55)" }}>
                Hastalık, zararlı, toprak ve uygulama rehberleri tek yerde.
              </p>
            </div>
            <button className="btn-secondary" style={{ padding: "10px 16px" }} onClick={() => scrollToSection("knowledge-base")}>
              Görüntüle
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["Hastalık", "Toprak", "IPM", "Sulama", "Gübre", "Zararlı"].map((tag) => (
              <span key={tag} className="tech-badge" style={{ background: "rgba(143,188,69,0.12)", color: "var(--sprout)" }}>{tag}</span>
            ))}
          </div>
        </section>

        {/* --- GLOBAL AGRI NEWS (New Feature) --- */}
        <AgriNewsFeed
          items={newsItems}
          loading={newsLoading}
          live={newsLive}
          error={newsError}
          updatedAt={newsUpdatedAt}
          onRefresh={refreshNews}
        />
      </div>

      {/* Smart Advisor Cards (Phase 2) */}
      <SmartAdvisorCards weather={weather} city={city} />

      <section className="panel glass-premium" style={{ display: "grid", gap: "16px", padding: "16px", position: "relative", overflow: "hidden" }}>
        <div className="hud-scan" style={{ animationDuration: "18s", opacity: 0.14 }} />
        <div style={{ position: "relative", zIndex: 10, display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(260px, 0.9fr)", gap: "16px" }}>
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "24px",
                border: "1px solid rgba(88,143,180,0.18)",
                background: "linear-gradient(145deg, rgba(88,143,180,0.92), rgba(77,131,196,0.72))",
                padding: "18px"
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 85% 22%, rgba(255,214,84,0.22), transparent 22%), radial-gradient(circle at 18% 85%, rgba(255,255,255,0.14), transparent 24%)" }} />
              <div style={{ position: "relative", zIndex: 2, display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) 40px", gap: "10px", alignItems: "center" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "18px", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MapPin size={18} color="#fff" />
                  </div>
                  <button
                    type="button"
                    onClick={onLocationManage}
                    style={{
                      textAlign: "left",
                      border: "1px solid rgba(255,255,255,0.35)",
                      background: "rgba(255,255,255,0.92)",
                      color: "#50606d",
                      borderRadius: "16px",
                      padding: "12px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      boxShadow: "0 8px 22px rgba(28, 47, 80, 0.16)"
                    }}
                  >
                    {currentLocationLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onLocationManage}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "20px",
                      border: "none",
                      background: "rgba(255,255,255,0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Search size={18} color="#fff" />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "12px", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "58px", lineHeight: 1, fontWeight: 800, color: "#fff" }}>
                      {weather?.temp != null ? `${weather.temp}°` : "--°"}
                    </div>
                    <div style={{ marginTop: "10px", display: "grid", gap: "10px", color: "rgba(255,255,255,0.9)", fontSize: "14px" }}>
                      <div>Nem {weather?.humidity ?? "?"}%</div>
                      <div>Yağış {forecast?.days?.[0]?.condition || weather?.condition || "?"}</div>
                      <div>Rüzgar {weather?.windKmh ?? "?"} km/s</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "10px", minWidth: "190px" }}>
                    <div style={{ fontSize: "52px", justifySelf: "center" }}>
                      {weather?.frostRisk ? "❄️" : "⛅"}
                    </div>
                    <button type="button" className="ghost" onClick={saveCurrentLocation} style={{ justifyContent: "center", background: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}>
                      Favori konuma ekle
                    </button>
                    <button type="button" className="ghost" onClick={() => onNavigateTab?.("weather")} style={{ justifyContent: "center", background: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}>
                      Detayları gör
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px", alignContent: "start" }}>
              <button
                type="button"
                className="primary"
                onClick={() => onNavigateTab?.("land")}
                style={{ minHeight: "88px", justifyContent: "center", fontSize: "18px", borderRadius: "20px", background: "linear-gradient(145deg, rgba(50,177,69,0.95), rgba(32,138,59,0.88))" }}
              >
                <Target size={18} /> Arazi ekle
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  openNotifications?.();
                  openAgroBot?.();
                }}
                style={{ minHeight: "88px", justifyContent: "center", fontSize: "18px", borderRadius: "20px", background: "linear-gradient(145deg, rgba(255,166,0,0.95), rgba(230,128,14,0.9))", borderColor: "rgba(255,166,0,0.3)", color: "#fff" }}
              >
                <AlertTriangle size={18} /> Uyarılar ve öneriler
              </button>
              <div className="panel" style={{ padding: "14px", background: "linear-gradient(145deg, rgba(18,34,24,0.92), rgba(10,22,15,0.86))" }}>
                <strong style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>Favori konumlar</strong>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {favoriteLocations.length ? favoriteLocations.map((item) => (
                    <button key={item} type="button" className="ghost" onClick={onLocationManage}>
                      {item}
                    </button>
                  )) : (
                    <span style={{ fontSize: "12px", color: "var(--ui-muted)" }}>Kayıtlı favori konum yok.</span>
                  )}
                </div>
                <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--ui-muted)" }}>
                  Aktif bildirim: {notificationCount || 0}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
            {HOME_OPERATIONS_TILES.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => handleOperationsTile(tile.id)}
                style={{
                  position: "relative",
                  minHeight: "220px",
                  borderRadius: "22px",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "#0f1b14",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: 0
                }}
              >
                <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${tile.image})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,10,8,0.12) 0%, rgba(5,10,8,0.38) 35%, rgba(5,10,8,0.94) 100%)" }} />
                <div style={{ position: "absolute", inset: 0, padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ width: "54px", height: "54px", borderRadius: "18px", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {tile.id === "fields" ? <Leaf size={22} color="#fff" /> : null}
                    {tile.id === "frost" ? <Cloud size={22} color="#fff" /> : null}
                    {tile.id === "satellite" ? <Globe size={22} color="#fff" /> : null}
                    {tile.id === "irrigation" ? <Droplets size={22} color="#fff" /> : null}
                    {tile.id === "fertility" ? <Beaker size={22} color="#fff" /> : null}
                    {tile.id === "protection" ? <Shield size={22} color="#fff" /> : null}
                  </div>
                  <div>
                    <strong style={{ display: "block", fontSize: "28px", lineHeight: 1.08, color: "#fff" }}>{tile.title}</strong>
                    <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>{tile.subtitle}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="home-agrobot" className="panel glass-premium" style={{ display: "grid", gap: "16px", padding: "16px", position: "relative", overflow: "hidden" }}>
        <div className="hud-scan" style={{ animationDuration: "16s", opacity: 0.18 }} />
        <div style={{ position: "relative", zIndex: 10, display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: "8px", background: "rgba(143,188,69,0.12)", color: "var(--sprout)" }}>
                <Bot size={14} /> AGROBOT
              </div>
              <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
                Akıllı <em>danışman</em>
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--ui-muted)", lineHeight: 1.6 }}>
                Teşhis, iklim, toprak ve pazar sorularını tek ekranda yanıtlar. Sohbet, sağ alttaki AgroBot ikonundan açılır.
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={() => openAgroBot?.()}>
              <Bot size={16} /> AgroBot'u aç
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={badgeStyle}>{city}</span>
            {selectedPlant?.name ? <span style={badgeStyle}>{selectedPlant.name}</span> : null}
            <span style={badgeStyle}>{currentLocationLabel}</span>
          </div>
        </div>
      </section>

      <section
        className="panel glass-premium"
        style={{ display: "grid", gap: "16px", padding: "16px", position: "relative", overflow: "hidden" }}
      >
        <div className="hud-scan" style={{ animationDuration: "14s", opacity: 0.2 }} />
        <div style={{ position: "relative", zIndex: 10, display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div className="tech-badge" style={{ marginBottom: "8px" }}>Hızlı Akış</div>
              <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
                Ana kontrol <em>şeridi</em>
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--ui-muted)" }}>
                Hazırlık, teşhis, sonuç ve bilgi bankasına tek satırdan geç.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {quickJumpItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className="ghost"
                    onClick={() => scrollToSection(item.id)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                  >
                    <Icon size={14} /> {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
            {quickSummaryCards.map((item) => (
              <div key={item.label} style={{ ...rowStyle, minHeight: "74px", alignItems: "flex-start", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "var(--ui-muted)" }}>{item.label}</span>
                <strong style={{ fontSize: "22px", color: item.tone }}>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="home-readiness" className="panel" style={{ display: "grid", gap: "20px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
            Hazirlik kontrolu
          </h3>
          <span style={badgeStyle}>{diagnoseChecks?.pct || 0}%</span>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {checks.map((item) => (
            <div key={item.key} style={rowStyle}>
              <span>{item.label}</span>
              <strong style={{ color: item.ok ? "#8fbc45" : "#f28b82" }}>
                {item.ok ? "Hazır" : "Eksik"}
              </strong>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="ghost" onClick={runDiagnoseNextStep} disabled={!diagnoseNextStep}>
            {diagnoseNextStep?.label || "Tüm adımlar tamam"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={resetAll}
            disabled={loading}
            title="Secimi, gorseli ve son sonucu temizler"
          >
            <RefreshCcw size={14} /> Temizle
          </button>
        </div>
        {!apiReady || !modelReady ? (
          <div style={{ fontSize: "13px", color: "#f28b82" }}>
            Sistem notu: API veya model hazır değil. Once sistemi hazırlayin.
          </div>
        ) : null}
      </section>

      <section id="home-diagnosis" className="panel glass-premium" style={{ display: "grid", gap: "12px", padding: "16px", position: "relative" }}>
        <div className="hud-scan" style={{ animationDuration: "12s" }} />
        <div style={{ position: "relative", zIndex: 20 }}>
          <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
            Teşhis Akışı <em>ve Analiz</em>
          </h3>
        </div>

        <div style={{ position: "relative", zIndex: 20 }}>
          <div style={{ display: "grid", gap: "6px" }}>
            <label htmlFor="diagnosis-plant-select">1) Bitki sec</label>
            <select
              id="diagnosis-plant-select"
              ref={plantSelectRef}
              value={selectedPlant?.id || ""}
              onChange={(e) => setSelectedPlantId(e.target.value)}
            >
              <option value="">Bitki seçiniz</option>
              {(filteredPlantProfiles || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {!selectedPlantSupported && hasPlant ? (
              <small style={{ color: "var(--ui-danger)" }}>Seçilen bitki modelde desteklenmiyor.</small>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label>2) Görüntüyü yükle</label>
            <button
              type="button"
              className="ghost"
              onClick={() => fileInputRef?.current?.click()}
              disabled={loading || !hasPlant}
            >
              <Upload size={14} /> {file ? "Görseli degistir" : "Görsel sec"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onSelectFile?.(e.target.files?.[0])}
            />
            {preview ? (
              <img
                src={preview}
                alt="Yüklenen görsel"
                style={{
                  width: "100%",
                  maxHeight: "360px",
                  objectFit: "contain",
                  borderRadius: "12px",
                  border: "1px solid var(--ui-border)",
                  background: "rgba(9, 18, 13, 0.82)"
                }}
              />
            ) : (
              <div style={{ ...rowStyle, justifyContent: "center", color: "var(--ui-muted)" }}>
                <Camera size={16} /> Henüz görsel seçilmedi
              </div>
            )}
            {fileMeta ? <small>{fileMeta}</small> : null}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary"
              onClick={analyze}
              disabled={loading || !hasPlant || !hasFile || !diagnoseReadiness?.ready}
            >
              {loading ? <Loader2 size={15} className="spin" /> : <ScanLine size={15} />} Analizi başlat
            </button>
            <button type="button" className="ghost" onClick={resetAll} disabled={loading}>
              <XCircle size={14} /> Sifirla
            </button>
          </div>

          {diagnoseNextStep && (
            <div style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="secondary"
                style={{ width: "100%" }}
                onClick={runDiagnoseNextStep}
                disabled={loading}
              >
                {diagnoseNextStep.label}
              </button>
            </div>
          )}

          {error ? (
            <div
              style={{
                ...rowStyle,
                marginTop: "12px",
                borderColor: "rgba(242,139,130,0.45)",
                background: "rgba(242,139,130,0.12)",
                color: "var(--ui-danger)"
              }}
            >
              <ShieldAlert size={15} /> {error}
            </div>
          ) : null}
        </div>
      </section>

      {
        selectedPlant ? (
          <section id="home-diseases" className="panel" style={{ display: "grid", gap: "10px", padding: "16px" }} >
            <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
              Bitkiye göre hastalık listesi
            </h3>
            {plantDiseaseError ? <div style={{ color: "var(--ui-danger)" }}>{plantDiseaseError}</div> : null}
            {
              !plantDiseaseError && diseaseList.length ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {diseaseList.slice(0, 20).map((item, idx) => {
                    const label = typeof item === "string" ? item : item?.name || item?.pretty || item?.label;
                    const summary = typeof item === "object" ? item?.summary : "";
                    return (
                      <div key={`${label || "disease"}-${idx}`} style={rowStyle}>
                        <span style={{ display: "grid", gap: "4px" }}>
                          <strong>{String(label || "Bilinmeyen").replaceAll("_", " ")}</strong>
                          {summary ? <small style={{ color: "var(--ui-muted)" }}>{summary}</small> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null
            }
            {
              !plantDiseaseError && !diseaseList.length ? (
                <div style={{ color: "var(--ui-muted)", fontSize: "14px" }}>
                  Bu bitki için hastalık listesi bulunamadı.
                </div>
              ) : null
            }
          </section >
        ) : null
      }

      {
        result ? (
          <section id="home-results" className="panel" style={{ display: "grid", gap: "10px", padding: "16px" }}>
            <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
              Teşhis sonucu
            </h3>
            <div style={rowStyle}>
              <span>Teşhis</span>
              <strong>{showDiagnosisResult ? result?.diagnosis?.name || "-" : "Bitki uyumsuz"}</strong>
            </div>
            <div style={rowStyle}>
              <span>Guven</span>
              <strong>{diagnosisConfidenceText || "-"}%</strong>
            </div>
            <div style={rowStyle}>
              <span>Durum</span>
              <strong
                style={{
                  color:
                    result?.diagnosis?.status === "healthy"
                      ? "var(--ui-accent)"
                      : result?.diagnosis?.status === "review"
                        ? "var(--ui-accent-2)"
                        : "var(--ui-danger)"
                }}
              >
                {result?.diagnosis?.status === "healthy"
                  ? "Saglikli"
                  : result?.diagnosis?.status === "review"
                    ? "Dogrulama"
                    : "Riskli"}
              </strong>
            </div>
            {diagnosisSummary ? <div style={{ fontSize: "14px" }}>{diagnosisSummary}</div> : null}

            {result?.confidenceProfile ? (
              <div style={{ ...rowStyle, alignItems: "flex-start", flexDirection: "column" }}>
                <strong>
                  Guven profili: {result.confidenceProfile.band || "-"} • {result.confidenceProfile.score || 0}/100
                </strong>
                <small style={{ color: "var(--ui-muted)" }}>{result.confidenceProfile.summary}</small>
                {Array.isArray(result.confidenceProfile.reasons) && result.confidenceProfile.reasons.length ? (
                  <small style={{ color: "var(--ui-info)" }}>
                    Neden: {result.confidenceProfile.reasons.slice(0, 2).join(" • ")}
                  </small>
                ) : null}
                {Array.isArray(result.confidenceProfile.blockers) && result.confidenceProfile.blockers.length ? (
                  <small style={{ color: "var(--ui-accent-2)" }}>
                    Risk: {result.confidenceProfile.blockers.slice(0, 2).join(" • ")}
                  </small>
                ) : null}
              </div>
            ) : null}

            {topPredictions.length ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>Top tahminler</strong>
                {topPredictions.slice(0, 3).map((item, idx) => (
                  <div key={`${item?.label || "pred"}-${idx}`} style={rowStyle}>
                    <span>{String(item?.label || "-").replaceAll("_", " ")}</span>
                    <strong>{toPct(item?.confidence)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(result?.warnings) && result.warnings.length ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>Uyarilar</strong>
                {result.warnings.slice(0, 3).map((warn, idx) => (
                  <div key={`${warn}-${idx}`} style={{ ...rowStyle, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}>
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(actionPlan?.today) && actionPlan.today.length ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <strong>Bugun onerilen adimlar</strong>
                {actionPlan.today.slice(0, 3).map((step, idx) => (
                  <div key={`${step}-${idx}`} style={rowStyle}>{step}</div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null
      }

      {
        historyItems.length ? (
          <section id="home-history" className="panel" style={{ display: "grid", gap: "10px", padding: "16px" }}>
            <h3 className="section-title" style={{ margin: 0, fontSize: "22px" }}>
              Son analizler
            </h3>
            {historyItems.slice(0, 6).map((item, idx) => (
              <div key={item?.id || idx} style={rowStyle}>
                <span>{item?.name || item?.result?.diagnosis?.name || "Bilinmeyen"}</span>
                <small>{getHistoryConfidence(item)} • {item?.time || "-"}</small>
              </div>
            ))}
          </section>
        ) : null
      }

      {/* ═══ BİLGİ BANKASI / EL KILAVUZU ═══ */}
      <KnowledgeBase />
    </div >
  );
}

/* ──── Smart Advisor Cards Component (Phase 2) ──── */
function SmartAdvisorCards({ weather, city }) {
  if (!weather) return null;

  const insights = [
    {
      title: "Hava Öngörüsü",
      icon: Thermometer,
      shade: "rgba(0, 209, 255, 0.08)",
      border: "rgba(0, 209, 255, 0.2)",
      color: "var(--sky)",
      msg: weather.frostRisk
        ? "Kritik don riski saptandı. Koruyucu önlemler gerekebilir."
        : weather.temp > 32
          ? "Yüksek sıcaklık saptandı. Bitki stresini azaltmak için sulamayı artırın."
          : "Hava koşulları bölgeniz için ideal yetiştirme bandında seyretiyor."
    },
    {
      title: "Bitki Koruma",
      icon: Shield,
      shade: "rgba(0, 255, 157, 0.08)",
      border: "rgba(0, 255, 157, 0.2)",
      color: "var(--sprout)",
      msg: weather.humidity > 80
        ? "Yüksek nem fungal hastalık riskini artırır. Havalandırmayı kontrol edin."
        : "Bölgesel sinyaller şu an için düşük enfeksiyon riski göstermektedir."
    },
    {
      title: "Operasyonel Verim",
      icon: Activity,
      shade: "rgba(255, 215, 0, 0.08)",
      border: "rgba(255, 215, 0, 0.2)",
      color: "var(--wheat)",
      msg: weather.windKmh > 22
        ? "Şiddetli rüzgar uyarısı. İlaçlama ve gübreleme ertelenmelidir."
        : "Hafif rüzgar, tozlaşma ve doğal hava sirkülasyonu için dengeli."
    }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px" }}>
      {insights.map((card, idx) => (
        <div key={idx} style={{
          background: card.shade,
          border: `1px solid ${card.border}`,
          borderRadius: "18px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          backdropFilter: "blur(10px)",
          transition: "transform 0.3s ease",
          cursor: "default"
        }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-4px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: card.color }}>
            <card.icon size={16} />
            <span style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.8px" }}>{card.title}</span>
          </div>
          <p style={{ fontSize: "12px", lineHeight: "1.5", fontWeight: "500", color: "rgba(255,255,255,0.8)" }}>{card.msg}</p>
        </div>
      ))}
    </div>
  );
}

/* ──── Agricultural News Feed Component ──── */
const NEWS_BACKDROPS = {
  "trt-ekonomi-rss": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=800",
  "aa-yesilhat-tarim": "https://images.unsplash.com/photo-1590682680695-43b964a3ae17?auto=format&fit=crop&q=80&w=800",
  "tarim-istatistik": "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800",
  fallback: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&q=80&w=800"
};

function formatRelativeNewsTime(value) {
  const ts = new Date(value || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "Güncel";
  const diffMs = Date.now() - ts;
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa önce`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} gün önce`;
}

function getNewsSourceLabel(item = {}) {
  return item.feedTitle || item.source || "Tarım gündemi";
}

function getNewsImage(item = {}) {
  return NEWS_BACKDROPS[item.feedId] || NEWS_BACKDROPS.fallback;
}

function AgriNewsFeed({ items = [], loading = false, live = false, error = "", updatedAt = "", onRefresh }) {
  const news = Array.isArray(items) ? items.slice(0, 4) : [];
  const updatedText = formatRelativeNewsTime(updatedAt);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', zIndex: 1 }}>
        <div>
          <h3 className="bento-head" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="var(--info)" /> Global Tarım Bülteni
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'rgba(245,237,216,0.5)' }}>
            İnternetten çekilen güncel tarım ve piyasa akışı • {updatedAt ? updatedText : "canlı tarama"}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="ghost" type="button" onClick={() => onRefresh?.(true)} style={{ padding: "8px 12px" }}>
            <RefreshCcw size={12} /> Yenile
          </button>
          {loading && <Loader2 size={14} className="spin" style={{ color: 'var(--ui-muted)', marginRight: '8px' }} />}
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: live ? 'var(--info)' : 'var(--wheat)', animation: live ? 'pulse 2s infinite' : 'none' }}></span>
          <span style={{ fontSize: '10px', color: live ? 'var(--info)' : 'var(--wheat)', fontWeight: 600, textTransform: 'uppercase' }}>{live ? 'Canlı' : 'Kaynak bekleniyor'}</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
        {error ? (
          <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</div>
        ) : news.length ? (
          news.map((item, idx) => (
            <a key={`${item.link || item.title}-${idx}`} href={item.link || "#"} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', position: 'relative', textDecoration: 'none', color: 'inherit',
                height: idx === 0 ? '180px' : '130px', borderRadius: '14px', overflow: 'hidden',
                border: '1px solid rgba(143,188,69,0.15)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                transition: 'transform 0.3s ease, border-color 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'var(--sprout)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(143,188,69,0.15)';
              }}
            >
              <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${getNewsImage(item)})`, backgroundSize: 'cover', backgroundPosition: 'center', transition: 'transform 0.5s ease' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,6,4,0.98) 0%, rgba(4,6,4,0.4) 50%, transparent 100%)' }} />

              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--sprout)', background: 'rgba(143,188,69,0.15)', padding: '4px 8px', borderRadius: '6px', backdropFilter: 'blur(4px)' }}>
                    {getNewsSourceLabel(item)}
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(245,237,216,0.6)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Activity size={10} /> {formatRelativeNewsTime(item.pubDate || item.observedAt)}
                  </span>
                </div>
                <h4 style={{ color: 'white', fontSize: idx === 0 ? '15px' : '13px', fontWeight: 600, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                  {item.title}
                </h4>
                {item.description ? (
                  <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'rgba(245,237,216,0.72)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.description}
                  </p>
                ) : null}
              </div>
            </a>
          ))
        ) : (
          <div style={{ fontSize: '12px', color: 'rgba(245,237,216,0.6)' }}>
            Şu anda haber akışı boş. Yenileyip tekrar dene.
          </div>
        )}
      </div>
    </div>
  );
}

/* ──── Knowledge Base Component ──── */
function KnowledgeBase() {
  const [openSection, setOpenSection] = useState(null);
  const [searchText, setSearchText] = useState("");

  const knowledgeSections = [
    {
      id: "hastalik",
      title: "Hastalık Kütüphanesi",
      icon: ShieldAlert,
      color: "#E07070",
      image: "https://images.unsplash.com/photo-1599305090598-fe179d501c27?auto=format&fit=crop&q=80&w=400",
      items: diseaseLibrary.map(d => ({ title: d.name, detail: d.detail }))
    },
    {
      id: "bitki",
      title: "Bitki Ansiklopedisi",
      icon: Leaf,
      color: "var(--sprout)",
      image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=600",
      items: cropEncyclopedia.map(c => ({ title: c.name, detail: c.desc }))
    },
    {
      id: "gübre",
      title: "Gübreleme Takvimi",
      icon: Beaker,
      color: "var(--wheat)",
      image: "https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?auto=format&fit=crop&q=80&w=600",
      items: fertilizerSchedule.map(f => ({ title: f.stage, detail: f.detail }))
    },
    {
      id: "hasat",
      title: "Hasat Rehberi",
      icon: Activity,
      color: "var(--sprout)",
      image: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=600",
      items: harvestGuide.map(h => ({ title: h.title, detail: h.detail }))
    },
    {
      id: "zararli",
      title: "Zararlı Rehberi",
      icon: Bug,
      color: "var(--wheat)",
      image: "https://images.unsplash.com/photo-1543933934-ce7a026cadd1?auto=format&fit=crop&q=80&w=600",
      items: pestGuide.map(p => ({ title: p.name, detail: p.detail }))
    },
    {
      id: "ipm",
      title: "IPM Adımları",
      icon: Shield,
      color: "var(--sprout)",
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=400",
      items: ipmSteps.map(s => ({ title: s.step, detail: s.detail }))
    },
    {
      id: "toprak",
      title: "Toprak Testi Rehberi",
      icon: Beaker,
      color: "var(--sky)",
      image: "https://images.unsplash.com/photo-1594918712790-25e408544d9f?auto=format&fit=crop&q=80&w=400",
      items: soilTesting.map(s => ({ title: s.title, detail: s.detail }))
    },
    {
      id: "besin",
      title: "Besin Eksikliği Rehberi",
      icon: Droplets,
      color: "#72b9d9",
      image: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=400",
      items: nutrientGuide.map(n => ({ title: n.name, detail: `Belirti: ${n.sign} | Çözüm: ${n.fix}` }))
    },
    {
      id: "sulama",
      title: "Sulama İpuçları",
      icon: Droplets,
      color: "var(--sky)",
      image: "https://images.unsplash.com/photo-1592918805565-f48375824c04?auto=format&fit=crop&q=80&w=400",
      items: irrigationTips.map(i => ({ title: i.title, detail: i.detail }))
    },
    {
      id: "hava",
      title: "Hava Durumuna Göre Aksiyon",
      icon: Thermometer,
      color: "var(--wheat)",
      image: "https://images.unsplash.com/photo-1470252649358-96949c756461?auto=format&fit=crop&q=80&w=400",
      items: weatherActions.map(w => ({ title: w.condition, detail: w.action }))
    },
    {
      id: "sorun",
      title: "Sorun Giderme",
      icon: AlertTriangle,
      color: "#f0c26d",
      image: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&q=80&w=400",
      items: troubleshooting.map(t => ({ title: t.title, detail: t.detail }))
    },
    {
      id: "onleme",
      title: "Hastalık Önleme",
      icon: Shield,
      color: "var(--sprout)",
      image: "https://images.unsplash.com/photo-1592919016335-59b19e2c659d?auto=format&fit=crop&q=80&w=400",
      items: diseasePrevention.map(d => ({ title: d.title, detail: d.detail }))
    },
    {
      id: "sera",
      title: "Sera Riskleri",
      icon: AlertTriangle,
      color: "#E07070",
      image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=400",
      items: greenhouseRisks.map(g => ({ title: g.title, detail: g.detail }))
    },
    {
      id: "sozluk",
      title: "Tarım Sözlüğü",
      icon: FileText,
      color: "rgba(245,237,216,0.8)",
      image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=400",
      items: glossary.map(g => ({ title: g.term, detail: g.meaning }))
    }
  ];

  // Include handbook sections
  const allSections = [
    ...knowledgeSections,
    ...handbookSections.map(h => ({
      id: h.id,
      title: h.title,
      icon: BookOpen,
      color: "var(--sprout)",
      items: h.items.map(i => ({ title: i.title, detail: i.detail }))
    })),
    {
      id: "sss",
      title: "Sıkça Sorulan Sorular (SSS)",
      icon: HelpCircle,
      color: "var(--sky)",
      image: "https://images.unsplash.com/photo-1484067331354-345caee10665?auto=format&fit=crop&q=80&w=600",
      items: [
        { title: "Teşhis ne kadar güvenilir?", detail: "Teşhis modelimiz %90+ doğruluk payına sahiptir ancak arazi koşulları ve ışık değişkenlik gösterebilir." },
        { title: "Don uyarısı nasıl çalışır?", detail: "Hava istasyonumuz anlık sıcaklık takibi yapar ve kritik eşik (genelde 0°C) altına inildiğinde sinyal verir." },
        { title: "Verilerim güvende mi?", detail: "Tüm arazi ve teşhis verileriniz uçtan uca şifrelenir ve anonim olarak saklanır." },
        { title: "IPM taktiği nedir?", detail: "Entegre Zararlı Yönetimi, kimyasal kullanımını minimuma indirip doğal dengeleri korumayı hedefler." }
      ]
    }
  ];

  const q = searchText.toLowerCase().trim();
  const filtered = q
    ? allSections.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.items.some(i => i.title.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q))
    )
    : allSections.slice(0, 12); // Show first 12 by default


  return (
    <section id="knowledge-base" style={{ display: "grid", gap: "16px" }}>
      {/* Header */}
      <div className="panel" style={{ padding: "20px", background: "linear-gradient(135deg, rgba(14,52,30,0.92), rgba(9,40,25,0.88))", border: "1px solid rgba(143,188,69,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "14px",
            background: "linear-gradient(135deg, rgba(143,188,69,0.25), rgba(143,188,69,0.1))",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid rgba(143,188,69,0.3)",
            boxShadow: "0 0 20px rgba(143,188,69,0.15)"
          }}>
            <BookOpen size={22} color="var(--sprout)" />
          </div>
          <div>
            <h3 className="section-title" style={{ margin: 0, fontSize: "26px" }}>
              Tarım <em>Bilgi Bankası</em>
            </h3>
            <p style={{ fontSize: "12px", color: "rgba(245,237,216,0.5)", margin: "4px 0 0" }}>
              El kılavuzu • Hastalık rehberi • IPM • Toprak • Zararlılar
            </p>
          </div>
        </div>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "rgba(10,19,13,0.8)", borderRadius: "12px",
          padding: "10px 14px", border: "1px solid rgba(143,188,69,0.2)"
        }}>
          <Search size={14} color="var(--sprout)" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Konu ara... (örn: mildiyo, sulama, toprak)"
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "var(--cream)", fontSize: "13px", width: "100%",
              fontFamily: "Outfit"
            }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <XCircle size={14} color="rgba(245,237,216,0.4)" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Access Grid */}
      {!searchText && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
          {knowledgeSections.slice(0, 4).map(s => {
            const Icon = s.icon;
            return (
              <button
                key={`quick-${s.id}`}
                onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
                style={{
                  height: "100px",
                  position: "relative",
                  background: `url(${s.image}) center/cover no-repeat`,
                  border: openSection === s.id ? "1px solid rgba(143,188,69,0.8)" : "1px solid rgba(143,188,69,0.3)",
                  borderRadius: "14px", padding: 0,
                  cursor: "pointer", transition: "all 0.3s",
                  overflow: "hidden"
                }}
              >
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(15,26,15,0.9), rgba(15,26,15,0.2))",
                  display: "flex", flexDirection: "column", justifyContent: "flex-end",
                  padding: "12px", gap: "4px", textAlign: "left"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{
                      width: "24px", height: "24px", borderRadius: "6px",
                      background: `${s.color}22`, backdropFilter: "blur(4px)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <Icon size={14} color={s.color} />
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--cream)" }}>{s.title}</span>
                  </div>
                  <span style={{ fontSize: "10px", color: "rgba(245,237,216,0.6)", fontFamily: "JetBrains Mono" }}>
                    {s.items.length} madde
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Accordion Sections */}
      {filtered.map(section => {
        const Icon = section.icon;
        const isOpen = openSection === section.id;
        const sectionItems = q
          ? section.items.filter(i =>
            i.title.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q)
          )
          : section.items;
        return (
          <div key={section.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setOpenSection(isOpen ? null : section.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "12px",
                padding: "16px 18px", background: section.image ? `linear-gradient(to right, rgba(15,26,15,0.95), rgba(15,26,15,0.7)), url(${section.image}) center/cover` : "transparent",
                border: "none", cursor: "pointer", color: "var(--cream)", textAlign: "left",
                transition: "all 0.3s"
              }}
            >
              <div style={{
                width: "34px", height: "34px", borderRadius: "10px",
                background: `${section.color}20`, backdropFilter: "blur(4px)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                border: `1px solid ${section.color}40`
              }}>
                <Icon size={16} color={section.color} />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "15px", display: "block" }}>{section.title}</strong>
                <span style={{ fontSize: "11px", color: "rgba(245,237,216,0.6)" }}>
                  {sectionItems.length} madde
                </span>
              </div>
              <ChevronDown
                size={16}
                color="rgba(245,237,216,0.7)"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
              />
            </button>
            {isOpen && (
              <div style={{ padding: "0 18px 16px", display: "grid", gap: "8px" }}>
                {sectionItems.map((item, idx) => (
                  <div
                    key={`${section.id}-${idx}`}
                    style={{
                      display: "flex", gap: "10px", alignItems: "flex-start",
                      padding: "12px 14px", borderRadius: "10px",
                      background: "rgba(245,237,216,0.03)",
                      border: "1px solid rgba(245,237,216,0.06)",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: section.color, flexShrink: 0, marginTop: "6px"
                    }} />
                    <div>
                      <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>
                        {item.title}
                      </strong>
                      <p style={{ fontSize: "12px", color: "rgba(245,237,216,0.6)", lineHeight: 1.5, margin: 0 }}>
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="panel" style={{ textAlign: "center", padding: "32px", color: "rgba(245,237,216,0.5)" }}>
          <Search size={24} style={{ marginBottom: "8px", opacity: 0.5 }} />
          <p>"{searchText}" ile eşleşen sonuç bulunamadı</p>
        </div>
      )}
    </section>
  );
}
