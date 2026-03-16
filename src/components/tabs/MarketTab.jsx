import React, { useState, useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  MessageSquare, Plus,
  RefreshCcw, Shield,
  ShoppingCart, Star,
  Tag, X,
  TrendingUp,
  ShoppingBag, Check,
  Target, Zap,
  BarChart3, Globe,
  Briefcase, Search,
  Heart, Award,
  Clock, ArrowRight,
  Package,
  Truck, Eye,
  PieChart, Layers,
  ArrowUpRight, ArrowDownRight,
  Gauge, Radar
} from "lucide-react";
import {
  getMarketOverview,
  get12MonthProjection,
  getRegionalPriceMap,
  getCropComparisonMatrix,
  getSmartSellPrice,
  getVolatilityScore
} from "../../data/cropPriceModel";

/**
 * MARKET TAB: COMMAND CENTER EVOLUTION (v5.0)
 * Premium UI with Ticker, Analytics Dashboard, Sparklines, Smart Pricing,
 * Arbitrage Radar, Crop Comparison, Live Feed & Checkout Progress
 */

/* ───── Inline SVG Sparkline Component ───── */
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
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const panelTitleStyle = { margin: 0, fontSize: "24px", fontWeight: "900", letterSpacing: "-1px" };

const metricCardStyle = {
  border: "1px solid var(--ui-border)",
  borderRadius: "20px",
  padding: "16px",
  background: "rgba(255, 255, 255, 0.03)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
  position: "relative",
  overflow: "hidden"
};

const listItemStyle = {
  border: "1px solid var(--ui-border)",
  borderRadius: "20px",
  padding: "16px",
  background: "linear-gradient(165deg, rgba(15, 31, 22, 0.9), rgba(12, 25, 18, 0.85))",
  backdropFilter: "blur(20px)",
  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
  display: "flex",
  flexDirection: "column",
  gap: "12px"
};

const gridInputs = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "16px"
};

const safeCall = (fn, ...args) => (typeof fn === "function" ? fn(...args) : undefined);
const fmtNum = (v) => Number(v || 0).toLocaleString("tr-TR");
const fmtPrice = (v) => `${Number(v || 0).toLocaleString("tr-TR")} TL`;
const fmtUnitPrice = (v, unit = "TL/kg") =>
  `${Number(v || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
const formatRelativeMarketTime = (value) => {
  const ts = new Date(value || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "Güncel";
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa önce`;
  return `${Math.round(diffHour / 24)} gün önce`;
};

const normalizeQualityGrade = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (["premium", "standard", "mixed", "processing"].includes(raw)) return raw;
  if (raw === "a" || raw === "a+") return "premium";
  if (raw === "b" || raw === "std") return "standard";
  if (raw === "c" || raw === "endustriyel") return "processing";
  return "standard";
};

const gradeToLetter = (grade) => {
  const g = normalizeQualityGrade(grade);
  if (g === "premium") return "A";
  if (g === "processing") return "C";
  return "B";
};

const getListingCrop = (item = {}) => item.crop || item.product || item.title || "";
const getListingQty = (item = {}) => Number(item.quantityKg ?? item.amount ?? 0);
const getListingPrice = (item = {}) => Number(item.priceTlKg ?? item.price ?? 0);
const getListingQuality = (item = {}) => item.qualityGrade || item.quality || "standard";
const getListingSeller = (item = {}) => item.seller || item.owner || item.contact || "";

/* ───── Quality badge ───── */
const QualityBadge = ({ quality }) => {
  const map = {
    premium: { label: "Premium", color: "#FFD700", bg: "rgba(255,215,0,0.1)" },
    standard: { label: "Standart", color: "var(--sprout)", bg: "rgba(0,255,157,0.1)" },
    mixed: { label: "Karma", color: "var(--sky)", bg: "rgba(0,209,255,0.1)" },
    processing: { label: "Endüstriyel", color: "#f97316", bg: "rgba(249,115,22,0.1)" },
    A: { label: "Premium", color: "#FFD700", bg: "rgba(255,215,0,0.1)" },
    B: { label: "Standart", color: "var(--sprout)", bg: "rgba(0,255,157,0.1)" },
    C: { label: "Endüstriyel", color: "var(--sky)", bg: "rgba(0,209,255,0.1)" }
  };
  const normalized = String(quality || "").trim();
  const key = map[normalized] ? normalized : map[normalized?.toLowerCase?.()] ? normalized.toLowerCase() : "standard";
  const q = map[key] || map.standard;
  return (
    <span style={{
      fontSize: "9px", fontWeight: "800", letterSpacing: "1px",
      padding: "3px 8px", borderRadius: "6px",
      background: q.bg, color: q.color, border: `1px solid ${q.color}`,
      textTransform: "uppercase"
    }}>
      {q.label}
    </span>
  );
};

/* ───── Star rating ───── */
const StarRating = ({ rating = 4.5 }) => {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          fill={i < full ? "#FFD700" : (i === full && hasHalf ? "#FFD700" : "none")}
          color={i <= full ? "#FFD700" : "rgba(255,255,255,0.15)"}
          strokeWidth={1.5}
        />
      ))}
      <span style={{ fontSize: "11px", fontWeight: "700", marginLeft: "4px", color: "#FFD700" }}>{rating}</span>
    </div>
  );
};

/* ───── Checkout step indicator ───── */
const CheckoutProgress = ({ step = 0 }) => {
  const steps = [
    { label: "Ürün", icon: Package },
    { label: "Doğrulama", icon: Shield },
    { label: "Ödeme", icon: ShoppingCart },
    { label: "Tamamlandı", icon: CheckCircle2 }
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0", marginBottom: "24px" }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
            opacity: i <= step ? 1 : 0.3, transition: "all 0.4s ease"
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: i < step ? "var(--sprout)" : i === step ? "rgba(0,255,157,0.2)" : "rgba(255,255,255,0.05)",
              border: i <= step ? "2px solid var(--sprout)" : "2px solid rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.4s ease",
              boxShadow: i === step ? "0 0 20px rgba(0,255,157,0.3)" : "none"
            }}>
              <s.icon size={16} color={i < step ? "#000" : i === step ? "var(--sprout)" : "rgba(255,255,255,0.3)"} />
            </div>
            <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.5px" }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: "40px", height: "2px", marginBottom: "20px",
              background: i < step ? "var(--sprout)" : "rgba(255,255,255,0.1)",
              transition: "background 0.4s ease"
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default function MarketTab({
  tradeListings,
  tradeOffers,
  tradeMyListings,
  tradeMyOrders,
  tradeWorkspaceTab,
  setTradeWorkspaceTab,
  tradeIdentityName,
  effectiveTradeCity,
  effectiveTradeCrop,
  tradeListingForm,
  setTradeListingForm,
  submitTradeListing,
  loadTradeData,
  walletBalance,
  handleMarketPayment,
  tradeFilterType,
  setTradeFilterType,
  tradeFavorites,
  toggleTradeFavorite,
  editTradeListing,
  deleteTradeListing,
  acceptTradeOffer,
  rejectTradeOffer,
  tradeMarketDepth,
  tradeMarketPulse,
  tradeStatus,
  marketLiveData,
  marketLiveLoading,
  marketLiveError
}) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [useEscrow] = useState(true);
  const [activeCategory, setActiveCategory] = useState("crop");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [checkoutStep, setCheckoutStep] = useState(0);

  const listings = useMemo(() => (Array.isArray(tradeListings) ? tradeListings : []), [tradeListings]);
  const favoriteSet = useMemo(() => new Set((tradeFavorites || []).map(id => String(id))), [tradeFavorites]);
  const liveBoardItems = useMemo(
    () => (Array.isArray(marketLiveData?.board) ? marketLiveData.board.slice(0, 8) : []),
    [marketLiveData?.board]
  );
  const liveFuelItems = useMemo(
    () => (Array.isArray(marketLiveData?.fuel?.items) ? marketLiveData.fuel.items : []),
    [marketLiveData?.fuel?.items]
  );
  const hasLiveTicker = liveBoardItems.length > 0;
  const displayedTickerItems = useMemo(() => {
    if (!hasLiveTicker) return [];
    return liveBoardItems.map((item) => ({
      symbol: item.symbol || String(item.label || "").toUpperCase(),
      price: Number(item.priceTlKg || 0),
      spark: [Number(item.minTlKg || item.priceTlKg || 0), Number(item.priceTlKg || 0), Number(item.maxTlKg || item.priceTlKg || 0)],
      meta: `${fmtUnitPrice(item.minTlKg || item.priceTlKg || 0)} - ${fmtUnitPrice(item.maxTlKg || item.priceTlKg || 0)}`,
      bandPct: Number(item.bandPct || 0),
      sourceCount: Number(item.sourceCount || 0)
    }));
  }, [hasLiveTicker, liveBoardItems]);
  const liveFeedRows = useMemo(() => {
    if (!liveBoardItems.length) return [];
    const updatedText = formatRelativeMarketTime(marketLiveData?.updatedAt);
    return liveBoardItems.slice(0, 5).map((item, idx) => ({
      id: `live-${item.key || idx}`,
      buyer: `${Number(item.sourceCount || 0)} kaynak`,
      product: item.label,
      qty: (item.markets || []).slice(0, 2).join(" • ") || effectiveTradeCity || "Pazar",
      price: fmtUnitPrice(item.priceTlKg || 0),
      time: updatedText,
      type: "buy"
    }));
  }, [effectiveTradeCity, liveBoardItems, marketLiveData?.updatedAt]);

  // Filtered listings
  const filteredListings = useMemo(() => {
    let result = listings;
    if (filterCategory !== "all") {
      result = result.filter(item => (item.category || "crop") === filterCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item =>
        String(getListingCrop(item) || "").toLowerCase().includes(q) ||
        String(item.city || "").toLowerCase().includes(q) ||
        String(getListingSeller(item) || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [listings, filterCategory, searchQuery]);

  const recommendedLandPrice = useMemo(() => {
    if (activeCategory !== "land") return null;
    const base = 125000;
    const zoning = tradeListingForm?.zoning || "tarım";
    return {
      priceTlDa: base * (zoning === "imarlı" ? 1.4 : 1.0),
      confidence: 0.94
    };
  }, [activeCategory, tradeListingForm?.zoning]);
  const formPrice = Number(tradeListingForm?.priceTlKg ?? tradeListingForm?.price ?? 0);

  const setField = (field, value) => {
    safeCall(setTradeListingForm, prev => {
      const next = { ...(prev || {}), [field]: value };
      if (field === "product") next.crop = value;
      if (field === "crop") next.product = value;
      if (field === "amount") next.quantityKg = value;
      if (field === "quantityKg") next.amount = value;
      if (field === "price") next.priceTlKg = value;
      if (field === "priceTlKg") next.price = value;
      if (field === "quality") next.qualityGrade = normalizeQualityGrade(value);
      if (field === "qualityGrade") next.quality = gradeToLetter(value);
      return next;
    });
  };

  const handleAction = (item) => {
    setCheckoutItem(item);
    setCheckoutStep(0);
    setPaymentSuccess(false);
    setShowCheckout(true);
  };
  const workspaceTabs = [
    { id: "browse", label: "Keşfet", icon: Globe, description: "Açık mahsul ve arazi ilanlarını tarayıp teklif akışını izle." },
    { id: "analytics", label: "Analitik", icon: PieChart, description: "Trend, arbitraj ve fiyat matrisi ile karar katmanlarını oku." },
    { id: "sell", label: "İlan Ver", icon: Plus, description: "Mahsul veya arazi için satış akışını eksiksiz doldur." },
    { id: "mine", label: "İlanlarım", icon: Tag, description: "Aktif ilanlarını, durumlarını ve düzenleme ihtiyaçlarını yönet." },
    { id: "offers", label: "Teklifler", icon: MessageSquare, description: "Gelen teklifleri ve pazarlık adımlarını tek ekranda topla." },
    { id: "orders", label: "Siparişler", icon: Briefcase, description: "Tamamlanan işlemleri, escrow ve sevkiyat geçmişini izle." }
  ];
  const activeWorkspace = workspaceTabs.find((tab) => tab.id === tradeWorkspaceTab) || workspaceTabs[0];
  const marketWorkspaceStats = useMemo(() => {
    switch (tradeWorkspaceTab) {
      case "analytics":
        return [
          { label: "Takip edilen ürün", value: String(getCropComparisonMatrix(effectiveTradeCity || "Ankara").length || 0), tone: "var(--sprout)" },
          { label: "Spread", value: `${fmtNum(tradeMarketDepth?.spreadPct || 0)}%`, tone: "var(--wheat)" },
          { label: "En iyi satış", value: fmtPrice(tradeMarketPulse?.suggestedSell || 0), tone: "var(--sky)" },
          { label: "En iyi alış", value: fmtPrice(tradeMarketPulse?.suggestedBuy || 0), tone: "var(--cream)" }
        ];
      case "sell":
        return [
          { label: "Kategori", value: activeCategory === "land" ? "Arazi" : "Mahsul", tone: activeCategory === "land" ? "var(--wheat)" : "var(--sprout)" },
          { label: "Form fiyatı", value: formPrice ? fmtPrice(formPrice) : "-", tone: "var(--sky)" },
          { label: "Öneri motoru", value: activeCategory === "land" ? `${Math.round((recommendedLandPrice?.confidence || 0) * 100)}%` : "Aktif", tone: "var(--cream)" },
          { label: "İşlem durumu", value: tradeStatus || "Hazır", tone: "var(--sprout)" }
        ];
      case "mine":
        return [
          { label: "Toplam ilan", value: fmtNum((tradeMyListings || []).length), tone: "var(--sprout)" },
          { label: "Arazi", value: fmtNum((tradeMyListings || []).filter((item) => item.category === "land").length), tone: "var(--wheat)" },
          { label: "Mahsul", value: fmtNum((tradeMyListings || []).filter((item) => item.category !== "land").length), tone: "var(--sky)" },
          { label: "Durum", value: tradeStatus || "İzleniyor", tone: "var(--cream)" }
        ];
      case "offers":
        return [
          { label: "Teklif sayısı", value: fmtNum((tradeOffers || []).length), tone: "var(--sprout)" },
          { label: "Arazi odaklı", value: fmtNum((tradeOffers || []).filter((item) => item.category === "land").length), tone: "var(--wheat)" },
          { label: "Mahsul odaklı", value: fmtNum((tradeOffers || []).filter((item) => item.category !== "land").length), tone: "var(--sky)" },
          { label: "Pazarlık modu", value: (tradeOffers || []).length ? "Açık" : "Bekliyor", tone: "var(--cream)" }
        ];
      case "orders":
        return [
          { label: "İşlem sayısı", value: fmtNum((tradeMyOrders || []).length), tone: "var(--sprout)" },
          { label: "Tamamlanan", value: fmtNum((tradeMyOrders || []).filter((item) => String(item.status || "").toLowerCase().includes("tamam")).length), tone: "var(--wheat)" },
          { label: "Escrow / ödeme", value: useEscrow ? "Escrow" : "Doğrudan", tone: "var(--sky)" },
          { label: "Cüzdan", value: fmtPrice(walletBalance), tone: "var(--cream)" }
        ];
      case "browse":
      default:
        return [
          { label: "Açık ilan", value: fmtNum(filteredListings.length), tone: "var(--sprout)" },
          { label: "Favoriler", value: fmtNum(favoriteSet.size), tone: "var(--wheat)" },
          { label: "Aktif filtre", value: filterCategory === "all" ? "Tümü" : filterCategory === "land" ? "Arazi" : "Mahsul", tone: "var(--sky)" },
          { label: "Pazar derinliği", value: fmtNum((tradeMarketDepth?.depthSells?.length || 0) + (tradeMarketDepth?.depthBuys?.length || 0)), tone: "var(--cream)" }
        ];
    }
  }, [
    activeCategory,
    favoriteSet,
    filterCategory,
    filteredListings.length,
    recommendedLandPrice?.confidence,
    tradeMarketDepth,
    tradeMarketPulse?.suggestedBuy,
    tradeMarketPulse?.suggestedSell,
    tradeMyListings,
    tradeMyOrders,
    tradeOffers,
    formPrice,
    tradeStatus,
    tradeWorkspaceTab,
    useEscrow,
    walletBalance,
    effectiveTradeCity
  ]);
  const marketWorkspaceActions = useMemo(() => {
    switch (tradeWorkspaceTab) {
      case "analytics":
        return [
          { label: "Pazara dön", onClick: () => setTradeWorkspaceTab("browse"), tone: "secondary" },
          { label: "İlan ver", onClick: () => setTradeWorkspaceTab("sell"), tone: "primary" }
        ];
      case "sell":
        return [
          { label: activeCategory === "land" ? "Mahsule geç" : "Araziye geç", onClick: () => setActiveCategory(activeCategory === "land" ? "crop" : "land"), tone: "secondary" },
          { label: "İlanlarımı aç", onClick: () => setTradeWorkspaceTab("mine"), tone: "primary" }
        ];
      case "mine":
        return [
          { label: "Yeni ilan", onClick: () => setTradeWorkspaceTab("sell"), tone: "primary" },
          { label: "Teklifleri gör", onClick: () => setTradeWorkspaceTab("offers"), tone: "secondary" }
        ];
      case "offers":
        return [
          { label: "İlanlarım", onClick: () => setTradeWorkspaceTab("mine"), tone: "secondary" },
          { label: "Siparişler", onClick: () => setTradeWorkspaceTab("orders"), tone: "primary" }
        ];
      case "orders":
        return [
          { label: "Tekliflere dön", onClick: () => setTradeWorkspaceTab("offers"), tone: "secondary" },
          { label: "Pazarı aç", onClick: () => setTradeWorkspaceTab("browse"), tone: "primary" }
        ];
      case "browse":
      default:
        return [
          { label: "Filtreyi temizle", onClick: () => { setSearchQuery(""); setFilterCategory("all"); safeCall(setTradeFilterType, "all"); }, tone: "secondary" },
          { label: "İlan ver", onClick: () => setTradeWorkspaceTab("sell"), tone: "primary" }
        ];
    }
  }, [activeCategory, setTradeFilterType, setTradeWorkspaceTab, tradeWorkspaceTab]);
  const observedBoardValue = useMemo(() => {
    const liveValue = liveBoardItems.reduce(
      (sum, item) => sum + Number(item.priceTlKg || 0) * Math.max(1, Number(item.sourceCount || 1)) * 100,
      0
    );
    return Math.round(liveValue);
  }, [liveBoardItems]);
  const marketPressureLabel =
    tradeMarketPulse?.pressure === "alim-baskin"
      ? "Alıcı baskın"
      : tradeMarketPulse?.pressure === "satis-baskin"
        ? "Satıcı baskın"
        : "Dengeli";
  const marketCommandCards = useMemo(
    () => [
      {
        label: "Likidite",
        value: `${fmtNum(tradeMarketDepth?.liquidityScore || 0)}/100`,
        detail: `${fmtNum((tradeMarketDepth?.depthSells?.length || 0) + (tradeMarketDepth?.depthBuys?.length || 0))} kademe aktif`,
        tone: "var(--sprout)"
      },
      {
        label: "Spread",
        value: `${Number(tradeMarketDepth?.spread || 0).toFixed(2)} TL`,
        detail: `${fmtNum(tradeMarketDepth?.totalBuyQty || 0)} kg alis • ${fmtNum(tradeMarketDepth?.totalSellQty || 0)} kg satis`,
        tone: "var(--sky)"
      },
      {
        label: "Piyasa baskisi",
        value: marketPressureLabel,
        detail: tradeMarketPulse?.note || "Piyasa dengesi izleniyor.",
        tone: tradeMarketPulse?.pressure === "alim-baskin" ? "var(--sprout)" : tradeMarketPulse?.pressure === "satis-baskin" ? "#f0c26d" : "var(--cream)"
      },
      {
        label: "Mazot bandi",
        value: liveFuelItems[0]?.priceTlL ? fmtUnitPrice(liveFuelItems[0].priceTlL, liveFuelItems[0].unit || "TL/L") : "Bekleniyor",
        detail: liveFuelItems[0]?.district || effectiveTradeCity || "Canli kaynak bekleniyor",
        tone: "var(--wheat)"
      },
      {
        label: "Izlenen deger",
        value: hasLiveTicker ? fmtPrice(observedBoardValue) : "Bekleniyor",
        detail: hasLiveTicker ? "Canli hal tahtasindan turetilmis referans deger" : "Canli hal verisi bekleniyor",
        tone: "var(--cream)"
      }
    ],
    [
      effectiveTradeCity,
      hasLiveTicker,
      liveFuelItems,
      observedBoardValue,
      marketPressureLabel,
      tradeMarketDepth?.depthBuys,
      tradeMarketDepth?.depthSells,
      tradeMarketDepth?.liquidityScore,
      tradeMarketDepth?.spread,
      tradeMarketDepth?.totalBuyQty,
      tradeMarketDepth?.totalSellQty,
      tradeMarketPulse?.note,
      tradeMarketPulse?.pressure
    ]
  );
  const opportunityRadarItems = useMemo(() => {
    if (liveBoardItems.length) {
      return [...liveBoardItems]
        .sort((a, b) => (Number(b.bandPct || 0) * 2 + Number(b.sourceCount || 0)) - (Number(a.bandPct || 0) * 2 + Number(a.sourceCount || 0)))
        .slice(0, 3)
        .map((item) => ({
          key: item.key || item.label,
          title: item.label,
          value: fmtUnitPrice(item.priceTlKg || 0),
          detail: `${Number(item.bandPct || 0).toFixed(1)}% bant • ${Number(item.sourceCount || 0)} kaynak`
        }));
    }
    return [];
  }, [liveBoardItems]);
  const depthSellRows = useMemo(() => {
    if (Array.isArray(tradeMarketDepth?.depthSells) && tradeMarketDepth.depthSells.length) {
      return tradeMarketDepth.depthSells.slice(0, 4).map((row) => ({ p: Number(row.price || 0), v: Number(row.qty || 0) }));
    }
    return [];
  }, [tradeMarketDepth?.depthSells]);
  const depthBuyRows = useMemo(() => {
    if (Array.isArray(tradeMarketDepth?.depthBuys) && tradeMarketDepth.depthBuys.length) {
      return tradeMarketDepth.depthBuys.slice(0, 4).map((row) => ({ p: Number(row.price || 0), v: Number(row.qty || 0) }));
    }
    return [];
  }, [tradeMarketDepth?.depthBuys]);

  return (
    <div className="tab-page market-command-center">
      <div className="tab-content-inner">

        {/* ═══ ANIMATED PRICE TICKER ═══ */}
        <div className="market-ticker-strip" style={{
          overflow: "hidden", borderRadius: "16px",
          background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)",
          padding: "0", position: "relative"
        }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: "60px",
            background: "linear-gradient(to right, rgba(0,0,0,0.8), transparent)", zIndex: 2
          }} />
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: "60px",
            background: "linear-gradient(to left, rgba(0,0,0,0.8), transparent)", zIndex: 2
          }} />
          {displayedTickerItems.length ? (
            <div className="market-ticker" style={{ display: "inline-flex", gap: "0", whiteSpace: "nowrap" }}>
              {[...displayedTickerItems, ...displayedTickerItems].map((t, i) => (
                <div key={i} style={{
                  display: "inline-flex", alignItems: "center", gap: "12px",
                  padding: "12px 24px", borderRight: "1px solid rgba(255,255,255,0.04)"
                }}>
                  <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "1px", color: "var(--wheat)" }}>{t.symbol}</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", fontFamily: "JetBrains Mono" }}>
                    {fmtUnitPrice(t.price || 0)}
                  </span>
                  <span style={{
                    fontSize: "10px", fontWeight: "700",
                    color: "var(--sky)",
                    display: "flex", alignItems: "center", gap: "4px"
                  }}>
                    <Radar size={10} />
                    Bant {Number(t.bandPct || 0).toFixed(1)}% • {Number(t.sourceCount || 0)} kaynak
                  </span>
                  <Sparkline data={t.spark} color="var(--sky)" width={50} height={20} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 20px", fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
              Canli hal tahtasi verisi bekleniyor. Sabit ticker gosterilmiyor.
            </div>
          )}
        </div>

        {/* ═══ SUPERIOR HEADER & ANALYTICS ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>

          {/* Main Visual & Hero */}
          <div className="visual-card" style={{ height: '240px', borderRadius: '32px', overflow: 'hidden', position: 'relative' }}>
            <img
              src="https://images.unsplash.com/photo-1595841696662-506356242631?auto=format&fit=crop&q=80&w=2400"
              alt="Exchange"
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.3) contrast(1.1)' }}
            />
            <div style={{ position: 'absolute', inset: 0, padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <Zap size={18} color="var(--sprout)" className="pulse" />
                <span style={{ fontSize: "11px", fontWeight: "900", letterSpacing: "3px", color: hasLiveTicker || liveFuelItems.length ? "var(--sprout)" : "var(--wheat)" }}>
                  {hasLiveTicker || liveFuelItems.length ? "SYSTEM LIVE" : "CANLI KAYNAK BEKLENIYOR"}
                </span>
              </div>
              <h1 style={{ fontSize: '42px', margin: 0, fontWeight: "900", lineHeight: "1" }}>Ticaret <em>Terminali</em></h1>
              <p style={{ opacity: 0.68, maxWidth: "520px", marginTop: "12px", lineHeight: 1.6 }}>
                {effectiveTradeCity || "Türkiye"} odaklı canlı emtia, arazi ve girdi terminali. {effectiveTradeCrop || "Mahsul"} akışında alım-satım baskısı, mazot maliyeti ve teklif derinliği aynı ekranda.
              </p>
            </div>
          </div>

          {/* Right Sidebar: Quick Stats & Pulse */}
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ ...metricCardStyle, borderLeft: "4px solid var(--sprout)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: "900", opacity: 0.5 }}>CÜZDAN</span>
                <div className="neural-heartbeat" />
              </div>
              <div style={{ fontSize: "28px", fontWeight: "900", color: "var(--sprout)", fontFamily: "JetBrains Mono" }}>{fmtPrice(walletBalance)}</div>
            </div>

            <div style={metricCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: "900", opacity: 0.5 }}>MARKET PULSE</span>
                <TrendingUp size={14} color="var(--wheat)" />
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: "9px", opacity: 0.5 }}>ALIM</div>
                  <div style={{ fontWeight: "800", color: "var(--sky)" }}>{fmtPrice(tradeMarketPulse?.suggestedBuy || 14.2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", opacity: 0.5 }}>SATIM</div>
                  <div style={{ fontWeight: "800", color: "var(--sprout)" }}>{fmtPrice(tradeMarketPulse?.suggestedSell || 16.8)}</div>
                </div>
                <Sparkline data={[14.0, 14.5, 14.2, 15.0, 15.8, 16.2, 16.8]} color="var(--sprout)" width={60} height={24} />
              </div>
            </div>

            {/* Volume card */}
            <div style={metricCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: "900", opacity: 0.5 }}>IZLENEN DEGER</span>
                <Activity size={14} color="var(--sky)" />
              </div>
              <div style={{ display: "flex", gap: "12px", marginTop: "8px", alignItems: "flex-end" }}>
                <div style={{ fontSize: "20px", fontWeight: "900", fontFamily: "JetBrains Mono" }}>
                  {hasLiveTicker ? fmtPrice(observedBoardValue) : "Bekleniyor"}
                </div>
                {hasLiveTicker ? (
                  <Sparkline
                    data={[
                      Math.max(observedBoardValue * 0.42, 1),
                      Math.max(observedBoardValue * 0.51, 1),
                      Math.max(observedBoardValue * 0.48, 1),
                      Math.max(observedBoardValue * 0.62, 1),
                      Math.max(observedBoardValue * 0.78, 1),
                      Math.max(observedBoardValue * 0.91, 1),
                      Math.max(observedBoardValue, 1)
                    ]}
                    color="var(--sky)"
                    width={60}
                    height={20}
                  />
                ) : null}
              </div>
              <div style={{ fontSize: "10px", opacity: 0.45, marginTop: "8px" }}>
                Canli hal tahtasindaki fiyat ve kaynak sayisindan turetilen referans deger.
              </div>
            </div>
          </div>
        </div>

        <section className="panel glass-premium" style={{ display: "grid", gap: "16px", marginTop: "20px", marginBottom: "20px", position: "relative", overflow: "hidden" }}>
          <div className="hud-scan" style={{ opacity: 0.12, animationDuration: "20s" }} />
          <div style={{ position: "relative", zIndex: 2, display: "grid", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "760px" }}>
                <div className="tech-badge" style={{ marginBottom: "8px" }}>TRADE FLOOR</div>
                <h3 style={{ margin: 0, fontSize: "28px", fontWeight: "900" }}>
                  Pazar <em>komuta özeti</em>
                </h3>
                <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.68)", fontSize: "13px", lineHeight: 1.6 }}>
                  Fiyat baskısı, likidite, canlı mazot maliyeti ve fırsat radarını üst katmanda topla; sonra workspace içinde detay akışına in.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={() => setTradeWorkspaceTab("analytics")}>Analitiği aç</button>
                <button className="btn-primary" onClick={() => setTradeWorkspaceTab("sell")}>Yeni ilan</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {marketCommandCards.map((item) => (
                <div key={item.label} className="bento-card" style={{ padding: "14px", minHeight: "104px", background: "rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.7px" }}>{item.label}</div>
                  <strong style={{ fontSize: "22px", color: item.tone, display: "block", marginTop: "8px" }}>{item.value}</strong>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.62)", marginTop: "8px", lineHeight: 1.45 }}>{item.detail}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              {opportunityRadarItems.map((item, index) => (
                <div key={item.key} className="bento-card" style={{ padding: "16px", border: "1px solid rgba(0,255,157,0.14)", background: "linear-gradient(160deg, rgba(10,25,18,0.92), rgba(13,31,22,0.82))" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                    <span className="tech-badge" style={{ margin: 0, background: "rgba(0,255,157,0.1)", color: "var(--sprout)" }}>
                      Radar #{index + 1}
                    </span>
                    <ArrowRight size={14} color="var(--sky)" />
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "900", marginTop: "12px" }}>{item.title}</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "var(--sprout)", marginTop: "6px" }}>{item.value}</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", marginTop: "8px", lineHeight: 1.5 }}>{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ WORKSPACE NAVIGATION ═══ */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '24px', gap: '8px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
          {workspaceTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTradeWorkspaceTab(tab.id)}
              style={{
                flex: 1, padding: '16px 8px', borderRadius: '18px', border: 'none', cursor: 'pointer', transition: '0.3s',
                background: tradeWorkspaceTab === tab.id ? 'rgba(0,255,157,0.1)' : 'transparent',
                color: tradeWorkspaceTab === tab.id ? 'var(--sprout)' : 'rgba(255,255,255,0.4)',
                fontWeight: '900', textTransform: "uppercase", fontSize: "11px", letterSpacing: "1px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                minWidth: "100px"
              }}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        <section className="panel glass-premium" style={{ display: "grid", gap: "16px", padding: "18px", position: "relative", overflow: "hidden" }}>
          <div className="hud-scan" style={{ opacity: 0.12, animationDuration: "18s" }} />
          <div style={{ position: "relative", zIndex: 10, display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "760px" }}>
                <div className="tech-badge" style={{ marginBottom: "8px" }}>Pazar Workspace</div>
                <h3 style={{ margin: 0, fontSize: "26px", fontWeight: "900" }}>
                  {activeWorkspace.label} <em>akışı</em>
                </h3>
                <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.68)", fontSize: "13px" }}>
                  {activeWorkspace.description}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={() => safeCall(loadTradeData)}><RefreshCcw size={14} /> Yenile</button>
                {marketWorkspaceActions.map((action) => (
                  <button
                    key={action.label}
                    className={action.tone === "primary" ? "btn-primary" : "btn-secondary"}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {marketWorkspaceStats.map((item) => (
                <div key={item.label} style={{ ...metricCardStyle, minHeight: "84px" }}>
                  <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px" }}>{item.label}</div>
                  <strong style={{ fontSize: "22px", color: item.tone }}>{item.value}</strong>
                </div>
              ))}
            </div>
            {tradeStatus ? (
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>
                Sistem durumu: {tradeStatus}
              </div>
            ) : null}
            {marketLiveLoading ? (
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>
                Canli mazot ve hal fiyatlari yenileniyor...
              </div>
            ) : null}
            {!marketLiveLoading && marketLiveError ? (
              <div style={{ fontSize: "12px", color: "#f0c26d" }}>
                {marketLiveError}
              </div>
            ) : null}
            {!marketLiveLoading && !marketLiveError && marketLiveData?.updatedAt ? (
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>
                Canlı piyasa güncellemesi: {formatRelativeMarketTime(marketLiveData.updatedAt)}
              </div>
            ) : null}
          </div>
        </section>

        {/* ═══ DYNAMIC CONTENT AREA ═══ */}
        <div style={{ minHeight: "600px" }}>

          {/* 1. BROWSE VIEW */}
          {tradeWorkspaceTab === "browse" && (
            <div style={{ display: "grid", gap: "24px" }}>

              {/* Search & Filter Bar */}
              <div style={{
                display: "flex", gap: "12px", alignItems: "center",
                background: "rgba(255,255,255,0.02)", padding: "12px 16px",
                borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)"
              }}>
                <Search size={18} color="rgba(255,255,255,0.3)" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Ürün, satıcı veya şehir ara..."
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: "var(--cream)", fontSize: "14px", fontFamily: "Outfit"
                  }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  {[
                    { id: "all", label: "Tümü" },
                    { id: "crop", label: "Mahsul" },
                    { id: "land", label: "Arazi" }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFilterCategory(f.id)}
                      style={{
                        padding: "6px 14px", borderRadius: "10px", border: "none", cursor: "pointer",
                        background: filterCategory === f.id ? "rgba(0,255,157,0.15)" : "rgba(255,255,255,0.03)",
                        color: filterCategory === f.id ? "var(--sprout)" : "rgba(255,255,255,0.5)",
                        fontSize: "11px", fontWeight: "700", transition: "0.2s"
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <section className="panel quick-card" style={{ padding: "18px" }}>
                <div className="quick-header" style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div className="tech-badge" style={{ marginBottom: "6px" }}>HIZLI_ILAN</div>
                    <h3 className="section-title" style={{ fontSize: "22px", marginBottom: 0 }}>İlanı 20 saniyede gir</h3>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="btn-secondary" onClick={() => { setActiveCategory("crop"); setField("category", "crop"); }}>
                      Mahsul
                    </button>
                    <button className="btn-secondary" onClick={() => { setActiveCategory("land"); setField("category", "land"); }}>
                      Arazi
                    </button>
                  </div>
                </div>

                <div className="quick-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginTop: "12px" }}>
                  <div className="input-group">
                    <label>{activeCategory === "land" ? "Şehir" : "Ürün"}</label>
                    {activeCategory === "land" ? (
                      <input className="select-premium" value={tradeListingForm?.city || ""} onChange={(e) => setField("city", e.target.value)} placeholder="Malatya" />
                    ) : (
                      <input className="select-premium" value={tradeListingForm?.crop || tradeListingForm?.product || ""} onChange={(e) => setField("crop", e.target.value)} placeholder="Domates" />
                    )}
                  </div>
                  <div className="input-group">
                    <label>{activeCategory === "land" ? "Alan (da)" : "Miktar (kg)"}</label>
                    <input
                      className="select-premium"
                      type="number"
                      value={activeCategory === "land" ? (tradeListingForm?.areaDa || "") : (tradeListingForm?.quantityKg || tradeListingForm?.amount || "")}
                      onChange={(e) => setField(activeCategory === "land" ? "areaDa" : "quantityKg", e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>{activeCategory === "land" ? "Fiyat (TL/da)" : "Fiyat (TL/kg)"}</label>
                    <input
                      className="select-premium"
                      type="number"
                      value={activeCategory === "land" ? (tradeListingForm?.priceTlDa ?? tradeListingForm?.price ?? "") : (tradeListingForm?.priceTlKg ?? tradeListingForm?.price ?? "")}
                      onChange={(e) => setField(activeCategory === "land" ? "priceTlDa" : "priceTlKg", e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>Kalite</label>
                    <select className="select-premium" value={tradeListingForm?.qualityGrade || tradeListingForm?.quality || "standard"} onChange={(e) => setField("qualityGrade", e.target.value)}>
                      <option value="premium">Premium</option>
                      <option value="standard">Standart</option>
                      <option value="processing">Endüstriyel</option>
                      <option value="mixed">Karma</option>
                    </select>
                  </div>
                </div>

                <div className="quick-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                  <button className="btn-secondary" onClick={() => setTradeWorkspaceTab("sell")}>
                    Detaylı form
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const payload = { ...tradeListingForm, category: activeCategory, status: "open" };
                      safeCall(submitTradeListing, payload);
                    }}
                  >
                    Hemen yayınla
                  </button>
                </div>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>
                {/* Listings */}
                <div className="listings-grid bento-grid">
                  {filteredListings.length === 0 && (
                    <div style={{ padding: "60px 20px", textAlign: "center", opacity: 0.4, gridColumn: "1 / -1" }}>
                      <ShoppingBag size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
                      <p style={{ fontSize: "15px", fontWeight: "600" }}>
                        {searchQuery ? "Aramanızla eşleşen ilan bulunamadı." : "Henüz aktif ilan bulunmuyor."}
                      </p>
                    </div>
                  )}
                  {filteredListings.map(item => {
                    const isLand = item.category === "land";
                    const listingCrop = getListingCrop(item);
                    const listingQty = getListingQty(item);
                    const listingPrice = getListingPrice(item);
                    const listingQuality = getListingQuality(item);
                    const listingSeller = getListingSeller(item);
                    const listingArea = Number(item.areaDa ?? 0) || (isLand ? listingQty : 0);
                    return (
                      <div key={item.id} className="bento-card listing-card" style={{ ...listItemStyle, position: "relative" }}>
                        {/* Image */}
                        <div style={{ height: '140px', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
                          <img
                            src={isLand ? "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=400" : "https://images.unsplash.com/photo-1595841696662-506356242631?auto=format&fit=crop&q=80&w=400"}
                            alt={listingCrop || "Trade"}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute', top: '12px', left: '12px',
                            background: 'rgba(0,0,0,0.7)', backdropFilter: "blur(4px)",
                            padding: '4px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: '900',
                            color: isLand ? 'var(--wheat)' : 'var(--sprout)',
                            border: '1px solid currentColor'
                          }}>
                            {isLand ? "ARSA / YATIRIM" : "MAHSUL / EMTIA"}
                          </div>
                          {/* Favorite button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); safeCall(toggleTradeFavorite, item.id); }}
                            style={{
                              position: "absolute", top: "12px", right: "12px",
                              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
                              border: "none", borderRadius: "50%", width: "32px", height: "32px",
                              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                            }}
                          >
                            <Heart size={14} fill={favoriteSet.has(String(item.id)) ? "#f87171" : "none"} color={favoriteSet.has(String(item.id)) ? "#f87171" : "rgba(255,255,255,0.5)"} />
                          </button>
                        </div>

                        {/* Info */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                            <h3 style={{ fontSize: '20px', margin: '4px 0 2px 0', lineHeight: 1.2 }}>
                              {isLand ? `${item.city || "-"} / ${listingArea ? `${listingArea} da` : "-"}` : (listingCrop || "Ürün")}
                            </h3>
                            <QualityBadge quality={listingQuality} />
                          </div>
                          <p style={{ fontSize: '12px', opacity: 0.5, margin: "4px 0 0 0" }}>
                            {isLand ? `İmar: ${item.zoning || "-"} • Ada: ${item.parcel || "-"}` : `${listingQty || 0} kg • ${listingSeller || "Üretici"}`}
                          </p>

                          {/* Seller rating */}
                          <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <StarRating rating={item.sellerRating || 4.5} />
                            <span style={{ fontSize: "10px", opacity: 0.4 }}>• {item.sellerTradeCount || 12} işlem</span>
                          </div>
                        </div>

                        {/* Price & Action */}
                        <div style={{
                          borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: '22px', fontWeight: '900', color: 'var(--sprout)', fontFamily: 'JetBrains Mono' }}>
                              {isLand ? `${fmtPrice(listingPrice)} / da` : fmtUnitPrice(listingPrice, "TL/kg")}
                            </div>
                            {!isLand && listingQty > 0 && (
                              <div style={{ fontSize: "10px", opacity: 0.4 }}>{fmtPrice(listingPrice * listingQty)} toplam</div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: "8px 12px", fontSize: "11px" }}
                              onClick={() => { }}
                            >
                              <Eye size={12} />
                            </button>
                            <button className="btn-primary" style={{ padding: "10px 20px", fontSize: "13px" }} onClick={() => handleAction(item)}>İşlem Yap</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Browse Sidebar */}
                <div style={{ display: "grid", gap: "16px", alignContent: "flex-start" }}>
                  {/* Live fuel & farmer inputs */}
                  <div className="bento-card" style={{ padding: "20px" }}>
                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Gauge size={16} color="var(--wheat)" /> MAZOT + GİRDİ BANDI
                    </h4>
                    {marketLiveLoading ? (
                      <div style={{ fontSize: "12px", opacity: 0.65 }}>Canlı fiyatlar yükleniyor...</div>
                    ) : liveFuelItems.length ? (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {liveFuelItems.map((item) => (
                          <div
                            key={item.key}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.05)"
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--cream)" }}>{item.label}</div>
                              <div style={{ fontSize: "10px", opacity: 0.5 }}>
                                {item.district || effectiveTradeCity} • {item.sourceTitle || "Canlı kaynak"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "16px", fontWeight: "900", color: "var(--wheat)", fontFamily: "JetBrains Mono" }}>
                                {fmtUnitPrice(item.priceTlL || 0, item.unit || "TL/L")}
                              </div>
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "10px", color: "var(--sky)", textDecoration: "none" }}
                              >
                                Kaynağı aç
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", opacity: 0.65 }}>
                        Bu şehir için canlı mazot verisi şu an alınamadı.
                      </div>
                    )}
                  </div>

                  {/* Market Depth */}
                  <div className="bento-card" style={{ padding: "20px" }}>
                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                      <BarChart3 size={16} color="var(--sky)" /> PAZAR DERİNLİĞİ
                    </h4>
                    {depthSellRows.length || depthBuyRows.length ? (
                      <div style={{ display: "grid", gap: "4px" }}>
                        {depthSellRows.map((row, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                            <span style={{ width: "60px", textAlign: "right", color: "var(--sprout)", fontWeight: "700", fontFamily: "JetBrains Mono" }}>{row.p.toFixed(1)}</span>
                            <div style={{ flex: 1, height: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, row.v / 35)}%`, background: "rgba(0,255,157,0.2)", borderRadius: "4px" }} />
                            </div>
                            <span style={{ width: "50px", fontSize: "10px", opacity: 0.5 }}>{fmtNum(row.v)} kg</span>
                          </div>
                        ))}
                        <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", margin: "6px 0" }} />
                        {depthBuyRows.map((row, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                            <span style={{ width: "60px", textAlign: "right", color: "var(--sky)", fontWeight: "700", fontFamily: "JetBrains Mono" }}>{row.p.toFixed(1)}</span>
                            <div style={{ flex: 1, height: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, row.v / 35)}%`, background: "rgba(0,209,255,0.2)", borderRadius: "4px" }} />
                            </div>
                            <span style={{ width: "50px", fontSize: "10px", opacity: 0.5 }}>{fmtNum(row.v)} kg</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", opacity: 0.65 }}>
                        Canli derinlik verisi gelmedi. Sabit kademe gosterilmiyor.
                      </div>
                    )}
                  </div>

                  <div className="bento-card" style={{ padding: "20px" }}>
                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Radar size={16} color="var(--sprout)" /> FIRSAT RADARI
                    </h4>
                    {opportunityRadarItems.length ? (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {opportunityRadarItems.map((item) => (
                          <div
                            key={item.key}
                            style={{
                              display: "grid",
                              gap: "4px",
                              padding: "12px",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.05)"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                              <strong style={{ fontSize: "12px", color: "var(--cream)" }}>{item.title}</strong>
                              <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--sprout)", fontFamily: "JetBrains Mono" }}>{item.value}</span>
                            </div>
                            <div style={{ fontSize: "11px", opacity: 0.58, lineHeight: 1.45 }}>{item.detail}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", opacity: 0.65 }}>
                        Canli hal tahtasi gelmeden firsat radari hesaplanmiyor.
                      </div>
                    )}
                  </div>

                  {/* Live Trade Feed */}
                  <div className="bento-card" style={{ padding: "20px" }}>
                    <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Activity size={16} color="var(--sprout)" className="pulse" /> CANLI İŞLEMLER
                    </h4>
                    {liveFeedRows.length ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        {liveFeedRows.map(feed => (
                          <div key={feed.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 10px", borderRadius: "10px",
                            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)",
                            fontSize: "11px", transition: "0.2s"
                          }}>
                            <div>
                              <div style={{ fontWeight: "700", marginBottom: "2px" }}>{feed.product}</div>
                              <div style={{ fontSize: "10px", opacity: 0.4 }}>{feed.buyer} • {feed.qty}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: "800", color: feed.type === "land" ? "var(--wheat)" : "var(--sprout)", fontFamily: "JetBrains Mono", fontSize: "11px" }}>{feed.price}</div>
                              <div style={{ fontSize: "9px", opacity: 0.3, display: "flex", alignItems: "center", gap: "3px", justifyContent: "flex-end" }}>
                                <Clock size={8} /> {feed.time}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", opacity: 0.65 }}>
                        Canli islem akisi gelmedi. Sahte feed gosterilmiyor.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 1.5 ANALYTICS DASHBOARD */}
          {tradeWorkspaceTab === "analytics" && (() => {
            const overview = getMarketOverview();
            const comparison = getCropComparisonMatrix();
            const selectedCrop = effectiveTradeCrop ? effectiveTradeCrop.toLowerCase().replace(/[^a-z]/g, '') : 'domates';
            const projection = get12MonthProjection(selectedCrop);
            const regionalMap = getRegionalPriceMap(selectedCrop);
            const currentMonth = new Date().getMonth();
            return (
              <div style={{ display: "grid", gap: "24px" }}>
                <div style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  border: "1px solid rgba(240,194,109,0.18)",
                  background: "rgba(240,194,109,0.08)",
                  fontSize: "12px",
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.82)"
                }}>
                  Bu sekme canlı hal ve pazar akışından ayrıdır. Buradaki projeksiyon, volatilite ve bölgesel karşılaştırma kartları
                  <strong style={{ color: "var(--wheat)" }}> modelleme / tahmin</strong> katmanidir.
                </div>

                {/* Seasonal Chart Section */}
                <div className="bento-card" style={{ padding: "28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", display: "flex", alignItems: "center", gap: "10px" }}>
                      <Layers size={20} color="var(--sprout)" /> Sezonsal Fiyat Haritası
                      <span style={{ fontSize: "12px", fontWeight: "600", opacity: 0.5, textTransform: "uppercase" }}>
                        {(effectiveTradeCrop || "Domates")}
                      </span>
                    </h3>
                    <span style={{ fontSize: "10px", padding: "4px 10px", background: "rgba(0,255,157,0.1)", borderRadius: "8px", color: "var(--sprout)", fontWeight: "800" }}>
                      12 AYLIK PROJEKSİYON
                    </span>
                  </div>
                  {/* SVG bar chart */}
                  <div style={{ position: "relative", height: "200px", display: "flex", alignItems: "flex-end", gap: "6px", padding: "0 4px" }}>
                    {projection.map((p, i) => {
                      const maxP = Math.max(...projection.map(x => x.price));
                      const h = maxP > 0 ? (p.price / maxP) * 170 : 10;
                      const isCurrent = i === currentMonth;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "9px", fontWeight: "700", color: isCurrent ? "var(--sprout)" : "rgba(255,255,255,0.5)", fontFamily: "JetBrains Mono" }}>
                            {p.price.toFixed(1)}
                          </span>
                          <div style={{
                            width: "100%", height: `${h}px`, borderRadius: "8px 8px 4px 4px",
                            background: isCurrent
                              ? "linear-gradient(180deg, var(--sprout), rgba(0,255,157,0.3))"
                              : p.isHarvest
                                ? "linear-gradient(180deg, rgba(251,191,36,0.6), rgba(251,191,36,0.15))"
                                : "linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.03))",
                            border: isCurrent ? "1px solid var(--sprout)" : "1px solid rgba(255,255,255,0.05)",
                            transition: "height 0.8s cubic-bezier(0.2,1,0.2,1)",
                            position: "relative",
                            boxShadow: isCurrent ? "0 0 15px rgba(0,255,157,0.3)" : "none"
                          }}>
                            {p.isPeak && (
                              <div style={{ position: "absolute", top: "-20px", left: "50%", transform: "translateX(-50%)", fontSize: "14px" }}>🌾</div>
                            )}
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: isCurrent ? "900" : "600", color: isCurrent ? "var(--sprout)" : "rgba(255,255,255,0.4)" }}>
                            {p.monthLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "16px", marginTop: "16px", justifyContent: "center" }}>
                    <span style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: "var(--sprout)" }} /> Mevcut Ay
                    </span>
                    <span style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: "rgba(251,191,36,0.6)" }} /> Hasat Dönemi
                    </span>
                    <span style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}>
                      🌾 Pik Hasat
                    </span>
                  </div>
                </div>

                {/* Market Overview Grid */}
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "900", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Gauge size={18} color="var(--wheat)" /> Piyasa Genel Bakış
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                    {overview.map(item => (
                      <div key={item.crop} className="bento-card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "10px", fontWeight: "900", letterSpacing: "1px", opacity: 0.5 }}>{item.label.toUpperCase()}</div>
                            <div style={{ fontSize: "22px", fontWeight: "900", fontFamily: "JetBrains Mono", color: "var(--sprout)" }}>{item.currentPrice.toFixed(1)} TL</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{
                              fontSize: "10px", fontWeight: "800",
                              color: item.trend === "yükselen" ? "var(--sprout)" : item.trend === "düşen" ? "#f87171" : "var(--wheat)",
                              display: "flex", alignItems: "center", gap: "3px", justifyContent: "flex-end"
                            }}>
                              {item.trend === "yükselen" ? <ArrowUpRight size={12} /> : item.trend === "düşen" ? <ArrowDownRight size={12} /> : <ArrowRight size={12} />}
                              {item.trend.toUpperCase()}
                            </div>
                            <Sparkline data={item.sparkData} color={item.trend === "düşen" ? "#f87171" : "var(--sprout)"} width={60} height={20} />
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", opacity: 0.6 }}>
                          <span>Volatilite: <strong style={{ color: item.volatility.color }}>{item.volatility.level}</strong></span>
                          <span>{item.isHarvestSeason ? "🌾 Hasat Dönemi" : item.harvestLabel}</span>
                        </div>
                        <div style={{ height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${item.volatility.score}%`, background: item.volatility.color, borderRadius: "2px", transition: "width 1s ease" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arbitrage Radar */}
                <div className="bento-card" style={{ padding: "24px" }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: "900", display: "flex", alignItems: "center", gap: "10px" }}>
                    <Radar size={18} color="var(--sky)" /> Arbitraj Radarı
                    <span style={{ fontSize: "10px", fontWeight: "600", opacity: 0.5, textTransform: "uppercase" }}>
                      {(effectiveTradeCrop || "Domates")}
                    </span>
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center" }}>
                    <div style={{ display: "grid", gap: "6px" }}>
                      {regionalMap.regions.map((r, i) => {
                        const maxP = Math.max(...regionalMap.regions.map(x => x.price));
                        const pct = maxP > 0 ? (r.price / maxP) * 100 : 0;
                        const isMin = r.region === regionalMap.arbitrage.buyRegion;
                        const isMax = r.region === regionalMap.arbitrage.sellRegion;
                        return (
                          <div key={r.region} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
                            <span style={{ width: "120px", fontWeight: isMin || isMax ? "800" : "500", color: isMin ? "var(--sky)" : isMax ? "var(--sprout)" : "rgba(255,255,255,0.7)" }}>
                              {isMin && "🔵 "}{isMax && "🟢 "}{r.region}
                            </span>
                            <div style={{ flex: 1, height: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "4px", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", width: `${pct}%`, borderRadius: "4px",
                                background: isMin ? "rgba(0,209,255,0.4)" : isMax ? "rgba(0,255,157,0.4)" : "rgba(255,255,255,0.1)",
                                transition: "width 1s ease"
                              }} />
                            </div>
                            <span style={{ width: "60px", textAlign: "right", fontWeight: "700", fontFamily: "JetBrains Mono", fontSize: "11px", color: isMax ? "var(--sprout)" : isMin ? "var(--sky)" : "inherit" }}>
                              {r.price.toFixed(1)} TL
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ width: "200px", padding: "20px", background: regionalMap.arbitrage.viable ? "rgba(0,255,157,0.05)" : "rgba(255,255,255,0.02)", borderRadius: "20px", border: `1px solid ${regionalMap.arbitrage.viable ? "rgba(0,255,157,0.2)" : "rgba(255,255,255,0.05)"}`, textAlign: "center" }}>
                      <div style={{ fontSize: "10px", fontWeight: "900", letterSpacing: "1px", opacity: 0.5, marginBottom: "8px" }}>SPREAD</div>
                      <div style={{ fontSize: "28px", fontWeight: "900", color: regionalMap.arbitrage.viable ? "var(--sprout)" : "var(--wheat)", fontFamily: "JetBrains Mono" }}>
                        %{regionalMap.arbitrage.spreadPct.toFixed(1)}
                      </div>
                      <div style={{ fontSize: "11px", marginTop: "8px", color: regionalMap.arbitrage.viable ? "var(--sprout)" : "rgba(255,255,255,0.5)" }}>
                        {regionalMap.arbitrage.viable ? "✅ Arbitraj Fırsatı" : "⏳ Fırsat Düşük"}
                      </div>
                      <div style={{ fontSize: "10px", opacity: 0.5, marginTop: "8px" }}>
                        Al: {regionalMap.arbitrage.buyRegion}<br />
                        Sat: {regionalMap.arbitrage.sellRegion}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Crop Comparison Matrix */}
                <div className="bento-card" style={{ padding: "24px" }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: "900", display: "flex", alignItems: "center", gap: "10px" }}>
                    <BarChart3 size={18} color="var(--wheat)" /> Ürün Karşılaştırma Matrisi
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.5 }}>
                          <th style={{ textAlign: "left", padding: "8px 12px" }}>Ürün</th>
                          <th style={{ textAlign: "right", padding: "8px 12px" }}>Fiyat</th>
                          <th style={{ textAlign: "center", padding: "8px 12px" }}>Trend</th>
                          <th style={{ textAlign: "center", padding: "8px 12px" }}>Volatilite</th>
                          <th style={{ textAlign: "center", padding: "8px 12px" }}>En İyi Ay</th>
                          <th style={{ textAlign: "right", padding: "8px 12px" }}>Yıllık Aralık</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map(c => (
                          <tr key={c.crop} style={{ background: "rgba(255,255,255,0.02)", borderRadius: "10px" }}>
                            <td style={{ padding: "10px 12px", fontWeight: "800", borderRadius: "10px 0 0 10px" }}>{c.label}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", fontFamily: "JetBrains Mono", color: "var(--sprout)" }}>{c.currentPrice.toFixed(1)} TL</td>
                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                              <span style={{
                                fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "6px",
                                background: c.trend === "yükselen" ? "rgba(0,255,157,0.1)" : c.trend === "düşen" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.05)",
                                color: c.trend === "yükselen" ? "var(--sprout)" : c.trend === "düşen" ? "#f87171" : "var(--wheat)"
                              }}>
                                {c.trend === "yükselen" ? "↗" : c.trend === "düşen" ? "↘" : "→"} {c.trend}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                              <span style={{ fontSize: "10px", fontWeight: "700", color: c.volatilityScore > 60 ? "#f87171" : c.volatilityScore > 30 ? "#fbbf24" : "#86efac" }}>
                                {c.volatilityLevel} ({c.volatilityScore})
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "600" }}>{c.bestMonth} ({c.bestPrice.toFixed(1)} TL)</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono", fontSize: "11px", borderRadius: "0 10px 10px 0" }}>
                              {c.worstPrice.toFixed(1)} – {c.bestPrice.toFixed(1)} TL
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            );
          })()}

          {/* 2. SELL VIEW */}
          {tradeWorkspaceTab === "sell" && (
            <div className="bento-card" style={{ padding: '40px' }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                <h2 style={panelTitleStyle}>Sistem İlan Girişi</h2>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => { setActiveCategory("crop"); setField("category", "crop"); }}
                    style={{ padding: "8px 20px", borderRadius: "12px", border: activeCategory === "crop" ? "1px solid var(--sprout)" : "1px solid rgba(255,255,255,0.1)", background: activeCategory === "crop" ? "rgba(0,255,157,0.05)" : "transparent", color: activeCategory === "crop" ? "var(--sprout)" : "#fff", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}
                  >MAHSUL</button>
                  <button
                    onClick={() => { setActiveCategory("land"); setField("category", "land"); }}
                    style={{ padding: "8px 20px", borderRadius: "12px", border: activeCategory === "land" ? "1px solid var(--wheat)" : "1px solid rgba(255,255,255,0.1)", background: activeCategory === "land" ? "rgba(255,215,0,0.05)" : "transparent", color: activeCategory === "land" ? "var(--wheat)" : "#fff", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}
                  >ARSA / ARAZI</button>
                </div>
              </div>

              <div style={gridInputs}>
                {activeCategory === "land" ? (
                  <>
                    <div className="input-group">
                      <label>Şehir / Konum</label>
                      <input className="select-premium" value={tradeListingForm?.city || ""} onChange={e => setField("city", e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Alan (Dekar)</label>
                      <input className="select-premium" type="number" value={tradeListingForm?.areaDa || ""} onChange={e => setField("areaDa", e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>İmar Durumu</label>
                      <select className="select-premium" value={tradeListingForm?.zoning || "tarım"} onChange={e => setField("zoning", e.target.value)}>
                        <option value="tarım">Tarım Arazisi</option>
                        <option value="imarlı">Konut İmarlı</option>
                        <option value="sanayi">Sanayi / Ticari</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Ada / Parsel No</label>
                      <input className="select-premium" value={tradeListingForm?.parcel || ""} onChange={e => setField("parcel", e.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="input-group">
                      <label>Ürün / Model</label>
                      <input className="select-premium" value={tradeListingForm?.crop || tradeListingForm?.product || ""} onChange={e => setField("crop", e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Miktar (kg / Adet)</label>
                      <input className="select-premium" type="number" value={tradeListingForm?.quantityKg || tradeListingForm?.amount || ""} onChange={e => setField("quantityKg", e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Kalite Sınıfı</label>
                      <select className="select-premium" value={tradeListingForm?.qualityGrade || tradeListingForm?.quality || "standard"} onChange={e => setField("qualityGrade", e.target.value)}>
                        <option value="premium">Premium (A)</option>
                        <option value="standard">Standart (B)</option>
                        <option value="processing">Endüstriyel (C)</option>
                        <option value="mixed">Karma</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* Price Evaluation HUD */}
              <div style={{ marginTop: '40px', padding: '32px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)', display: "flex", gap: "40px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ fontSize: "11px", fontWeight: "900", color: "var(--wheat)", letterSpacing: "2px" }}>
                    {activeCategory === "land" ? "SATIS FIYATI (TL/da)" : "SATIS FIYATI (TL/kg)"}
                  </label>
                  <input
                    type="number"
                    value={
                      activeCategory === "land"
                        ? (tradeListingForm?.priceTlDa ?? tradeListingForm?.price ?? "")
                        : (tradeListingForm?.priceTlKg ?? tradeListingForm?.price ?? "")
                    }
                    onChange={e => setField(activeCategory === "land" ? "priceTlDa" : "priceTlKg", e.target.value)}
                    style={{ display: "block", width: "100%", background: "transparent", border: "none", borderBottom: "2px solid var(--sprout)", fontSize: "36px", fontWeight: "900", color: "var(--wheat)", outline: "none", marginTop: "12px" }}
                  />
                </div>

                {activeCategory === "land" && recommendedLandPrice && (
                  <div style={{ width: "260px", paddingLeft: "40px", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize: "10px", opacity: 0.5, fontWeight: "900" }}>VALUATION AI</div>
                    <div style={{ fontSize: "22px", fontWeight: "900", color: "var(--sprout)" }}>{fmtPrice(recommendedLandPrice.priceTlDa)} <small style={{ fontSize: "10px", opacity: 0.6 }}>/ dekar</small></div>
                    <div style={{ fontSize: "11px", marginTop: "4px", color: "var(--sky)" }}>Market Güveni: %{Math.round(recommendedLandPrice.confidence * 100)}</div>
                    <Sparkline data={[110000, 115000, 118000, 120000, 122000, 124000, 125000]} color="var(--sprout)" width={100} height={24} />
                  </div>
                )}

                {activeCategory === "crop" && (() => {
                  const cropKey = (tradeListingForm?.crop || tradeListingForm?.product || "domates").toLowerCase().replace(/[^a-z]/g, '');
                  const qualityLetter = gradeToLetter(tradeListingForm?.qualityGrade || tradeListingForm?.quality || "standard");
                  const smart = getSmartSellPrice(cropKey, effectiveTradeCity || "Ankara", qualityLetter);
                  const vol = getVolatilityScore(cropKey);
                  return (
                    <div style={{ width: "320px", paddingLeft: "40px", borderLeft: "1px solid rgba(255,255,255,0.1)", display: "grid", gap: "10px" }}>
                      <div style={{ fontSize: "10px", opacity: 0.5, fontWeight: "900", letterSpacing: "1px" }}>AKILLI FİYAT MOTORU</div>
                      <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                        <div>
                          <div style={{ fontSize: "9px", opacity: 0.4 }}>ÖNERİLEN</div>
                          <div style={{ fontSize: "24px", fontWeight: "900", color: "var(--sprout)", fontFamily: "JetBrains Mono" }}>{smart.recommended.toFixed(1)} TL<span style={{ fontSize: "10px", opacity: 0.5 }}>/kg</span></div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", opacity: 0.4 }}>ARALIK</div>
                          <div style={{ fontSize: "12px", fontWeight: "700", fontFamily: "JetBrains Mono" }}>{smart.min.toFixed(1)} – {smart.max.toFixed(1)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(0,255,157,0.08)", color: "var(--sprout)", fontWeight: "700" }}>Sezon: {smart.seasonalEffect}</span>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(255,215,0,0.08)", color: "var(--wheat)", fontWeight: "700" }}>Kalite: {smart.qualityPremium}</span>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", background: vol.score > 50 ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.03)", color: vol.color, fontWeight: "700" }}>Vol: {vol.level}</span>
                      </div>
                      <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${smart.confidence}%`, background: "var(--sprout)", borderRadius: "3px", transition: "width 1s ease" }} />
                      </div>
                      <div style={{ fontSize: "9px", opacity: 0.4 }}>Güven: %{smart.confidence} • Bölge: {smart.region}</div>
                    </div>
                  );
                })()}
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  const payload = { ...tradeListingForm, category: activeCategory, id: Date.now(), seller: tradeIdentityName || "System Agent", status: "open" };
                  safeCall(submitTradeListing, payload);
                  setTradeWorkspaceTab("browse");
                }}
                style={{ marginTop: '40px', width: '100%', height: '70px', fontSize: '20px', fontWeight: "900", borderRadius: "20px" }}
              >İLANI SİSTEME GÖNDER</button>
            </div>
          )}

          {/* 3. MY LISTINGS */}
          {tradeWorkspaceTab === "mine" && (
            <div className="panel" style={{ padding: "0" }}>
              <h3 className="section-title">Aktif İlanlarım</h3>
              <div className="listings-grid bento-grid" style={{ marginTop: "24px" }}>
                {tradeMyListings?.map(l => {
                  const isLand = l.category === "land";
                  const crop = getListingCrop(l) || l.city;
                  const price = getListingPrice(l);
                  return (
                    <div key={l.id} style={listItemStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{isLand ? `${l.city || ""} • ${l.areaDa || getListingQty(l)} da` : crop}</strong>
                        <span style={{ fontSize: "10px", padding: "2px 8px", background: "rgba(0,255,157,0.1)", borderRadius: "99px", color: "var(--sprout)" }}>{l.status}</span>
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: "900" }}>{isLand ? `${fmtPrice(price)} / da` : fmtUnitPrice(price, "TL/kg")}</div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="btn-secondary"
                          style={{ flex: 1 }}
                          onClick={() => {
                            safeCall(editTradeListing, l);
                            setTradeWorkspaceTab("sell");
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ flex: 1, color: "#fca5a5" }}
                          onClick={() => safeCall(deleteTradeListing, l)}
                        >
                          Kaldır
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(!tradeMyListings || tradeMyListings.length === 0) && (
                  <div style={{ padding: "60px 20px", textAlign: "center", opacity: 0.4, gridColumn: "1 / -1" }}>
                    <Tag size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
                    <p style={{ fontSize: "15px", fontWeight: "600" }}>Henüz bir ilanınız bulunmuyor.</p>
                    <button className="btn-primary" style={{ marginTop: "16px" }} onClick={() => setTradeWorkspaceTab("sell")}>
                      <Plus size={16} /> İlan Oluştur
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. OFFERS VIEW */}
          {tradeWorkspaceTab === "offers" && (
            <div className="panel">
              <h3 className="section-title">Gelen Teklifler</h3>
              <div style={{ display: 'grid', gap: '16px', marginTop: '24px' }}>
                {tradeOffers?.map(offer => (
                  <div key={offer.id} style={{ ...listItemStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{
                        width: "44px", height: "44px", borderRadius: "12px",
                        background: "rgba(0,255,157,0.1)", border: "1px solid rgba(0,255,157,0.2)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        <ShoppingCart size={20} color="var(--sprout)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: "800" }}>{offer.buyer} → {offer.product || offer.crop || "Ürün"}</div>
                        <div style={{ fontSize: "12px", opacity: 0.6 }}>Miktar: {offer.quantityKg} kg • Teklif: {fmtPrice(offer.offerPriceTlKg)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button className="btn-primary" style={{ padding: "8px 20px" }} onClick={() => safeCall(acceptTradeOffer, offer)}>Kabul</button>
                      <button className="btn-secondary" style={{ padding: "8px 20px" }} onClick={() => safeCall(rejectTradeOffer, offer)}>Red</button>
                    </div>
                  </div>
                ))}
                {(!tradeOffers || tradeOffers.length === 0) && (
                  <div style={{ padding: "60px 20px", textAlign: "center", opacity: 0.4 }}>
                    <MessageSquare size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
                    <p style={{ fontSize: "15px", fontWeight: "600" }}>Bekleyen teklifiniz bulunmuyor.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. ORDERS VIEW */}
          {tradeWorkspaceTab === "orders" && (
            <div className="panel">
              <h3 className="section-title">İşlem Geçmişi</h3>
              <div style={{ display: 'grid', gap: '12px', marginTop: '24px' }}>
                {tradeMyOrders?.map(order => (
                  <div key={order.id} style={{ ...listItemStyle, borderLeft: "4px solid var(--sky)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "10px",
                          background: "rgba(0,209,255,0.1)", border: "1px solid rgba(0,209,255,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <Package size={18} color="var(--sky)" />
                        </div>
                        <div>
                          <strong>Sipariş #{order.id}</strong>
                          <div style={{ fontSize: "11px", opacity: 0.5 }}>{new Date(order.id).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--sky)", padding: "4px 10px", background: "rgba(0,209,255,0.1)", borderRadius: "8px", fontWeight: "800" }}>{order.status || "Tamamlandı"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{order.product || order.crop || order.title || "Ürün"}</span>
                      <span style={{ fontWeight: "900", fontFamily: "JetBrains Mono", color: "var(--sprout)" }}>{fmtPrice(order.totalPrice)}</span>
                    </div>
                    {/* Shipping progress */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", opacity: 0.6 }}>
                      <Truck size={14} color="var(--sky)" />
                      <div style={{ flex: 1, height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: "75%", background: "var(--sky)", borderRadius: "2px", transition: "width 1s ease" }} />
                      </div>
                      <span>Kargoda</span>
                    </div>
                  </div>
                ))}
                {(!tradeMyOrders || tradeMyOrders.length === 0) && (
                  <div style={{ padding: "60px 20px", textAlign: "center", opacity: 0.4 }}>
                    <Briefcase size={48} style={{ marginBottom: "16px", opacity: 0.3 }} />
                    <p style={{ fontSize: "15px", fontWeight: "600" }}>Sipariş kaydı bulunamadı.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══ CHECKOUT SYSTEM (Enhanced) ═══ */}
        {showCheckout && checkoutItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)", zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div className="bento-card" style={{ width: "100%", maxWidth: "520px", padding: 0, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ padding: "24px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "20px", fontWeight: "900", margin: 0 }}>
                  {checkoutItem.category === "land" ? "Tapu Devir & Akreditif" : "Emtia Satın Alma"}
                </h2>
                <button onClick={() => { setShowCheckout(false); setPaymentSuccess(false); setCheckoutStep(0); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={24} /></button>
              </div>

              <div style={{ padding: "32px" }}>

                {/* Step Progress */}
                <CheckoutProgress step={paymentSuccess ? 3 : checkoutStep} />

                {paymentSuccess ? (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <CheckCircle2 size={72} color="var(--sprout)" className="pulse" style={{ marginBottom: "24px" }} />
                    <h3 style={{ fontSize: "24px", fontWeight: "900" }}>İŞLEM ONAYLANDI</h3>
                    <p style={{ opacity: 0.6, fontSize: "14px" }}>
                      {checkoutItem.category === "land"
                        ? "Dijital tapu örneği ve satış sözleşmesi e-devlet entegrasyonuna gönderildi."
                        : "Ürün bloke edildi, lojistik süreci başlatıldı."}
                    </p>
                    <button className="btn-primary" style={{ width: "100%", marginTop: "32px", height: "56px" }} onClick={() => { setShowCheckout(false); setCheckoutStep(0); }}>Kapat</button>
                  </div>
                ) : (
                  <>
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: "24px", borderRadius: "20px", marginBottom: "24px" }}>
                      <div style={{ fontSize: "11px", opacity: 0.5, fontWeight: "900", letterSpacing: "1px" }}>TOPLAM ODEME</div>
                      <div style={{ fontSize: "36px", fontWeight: "900", color: "var(--sprout)", marginTop: "4px" }}>{fmtPrice(getListingPrice(checkoutItem))}</div>
                    </div>

                    <div style={{ display: "grid", gap: "16px", marginBottom: "32px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", opacity: 0.8 }}>
                        <Target size={20} color="var(--wheat)" />
                        <span style={{ fontSize: "14px" }}>{checkoutItem.category === "land" ? `${checkoutItem.city} / ${checkoutItem.areaDa} dekar Arazi` : getListingCrop(checkoutItem)}</span>
                      </div>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", opacity: 0.8 }}>
                        <Shield size={20} color="var(--sky)" />
                        <span style={{ fontSize: "14px" }}>AgroGuard Escrow (Güvenli Havuz) Koruması</span>
                      </div>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", opacity: 0.8 }}>
                        <Check size={20} color="var(--sprout)" />
                        <span style={{ fontSize: "14px" }}>Yeterli Bakiye Mevcut</span>
                      </div>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", opacity: 0.8 }}>
                        <Award size={20} color="var(--wheat)" />
                        <span style={{ fontSize: "14px" }}>Satıcı Doğrulandı <StarRating rating={4.8} /></span>
                      </div>
                    </div>

                    <button
                      className="btn-primary"
                      disabled={isProcessingPayment}
                      style={{ width: "100%", height: "64px", fontSize: "18px", fontWeight: "900", borderRadius: "18px" }}
                      onClick={async () => {
                        setIsProcessingPayment(true);
                        setCheckoutStep(1);
                        await new Promise(r => setTimeout(r, 500));
                        setCheckoutStep(2);
                        const ok = await safeCall(handleMarketPayment, getListingPrice(checkoutItem), `Market: ${getListingCrop(checkoutItem) || 'Land'}`);
                        if (ok) {
                          setPaymentSuccess(true);
                          setCheckoutStep(3);
                        }
                        setIsProcessingPayment(false);
                      }}
                    >
                      {isProcessingPayment ? "AG BAGLANTISI KURULUYOR..." : "ODEMEYI ONAYLA"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
