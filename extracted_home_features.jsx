    if (bottomTab === "home") {
      setActiveTab("diagnosis");
      setDemoDockOpen(false);
      return;
    }
    if (bottomTab === "weather") {
      setActiveTab("diagnosis");
      setDemoDockOpen(false);
      return;
    }
    setActiveTab("diagnosis");
    setDemoDockOpen(true);
    if (bottomTab === "demos") {
      if (["market", "economy", "land"].includes(demoDockTab)) {
        setDemoDockTab("yield");
      }
      return;
    }
    if (bottomTab === "market") {
      if (commerceMiniTab !== "market") setCommerceMiniTab("market");
      if (demoDockTab !== "market") setDemoDockTab("market");
      return;
    }
    if (bottomTab === "land") {
      if (commerceMiniTab !== "land") setCommerceMiniTab("land");
      if (!["economy", "land"].includes(demoDockTab)) setDemoDockTab("economy");
    }
  }, [bottomTab, demoDockTab, commerceMiniTab]);
  const demoDockTabs = [
    { key: "diagnosis", label: "Teshis" },
    { key: "weather", label: "Hava" },
    { key: "soil", label: "Toprak" },
    { key: "economy", label: "Ekonomi" },
    { key: "land", label: "Arazi" },
    { key: "market", label: "Pazar" },
    { key: "yield", label: "Rekolte" }
  ];
  const activeDemoDock = demoDockTabs.find((item) => item.key === demoDockTab) || demoDockTabs[0];
  const shiftDemoDockTab = (dir = 1) => {
    const idx = demoDockTabs.findIndex((item) => item.key === demoDockTab);
    const nextIdx = idx < 0 ? 0 : (idx + dir + demoDockTabs.length) % demoDockTabs.length;
    handleDemoDockTab(demoDockTabs[nextIdx].key);
  };

  const featureSummaries = {
    core: [
      { title: "Teshis", value: "Gorsel analiz + plan" },
      { title: "Guven", value: "Top3 tahmin" },
      { title: "Aksiyon", value: "Bugun/Bu hafta" }
    ],
    operations: [
      { title: "Tarla", value: "Konum + hava" },
      { title: "Toprak", value: "Profil + oneriler" },
      { title: "Sulama", value: "Alarm + kontrol" }
    ],
    intelligence: [
      { title: "AI", value: "Risk sinyalleri" },
      { title: "Rapor", value: "Otomatik dokum" },
      { title: "Skor", value: "Saha skoru" }
    ],
    commerce: [
      { title: "Fiyat", value: "Pazar trend" },
      { title: "Lojistik", value: "Rota plan" },
      { title: "Gelir", value: "Finansal ozet" }
    ],
    compliance: [
      { title: "PHI", value: "Etiket uyumu" },
      { title: "Izlenebilirlik", value: "Parti bazli" },
      { title: "Denetim", value: "Sertifikasyon" }
    ],
    learning: [
      { title: "Kilavuz", value: "Tarim referans" },
      { title: "Ders", value: "Mikro egitim" },
      { title: "Sozluk", value: "Belirti rehberi" }
    ],
    all: [
      { title: "Superapp", value: "Tum moduller" },
      { title: "Saha", value: "Operasyon + AI" },
      { title: "Pazar", value: "Fiyat + kalite" }
    ]
  };

  const showcaseCards = useMemo(() => {
    if (bottomTab === "weather") {
      return [
        {
          key: "weather-live",
          icon: Sparkles,
          title: "Canli hava paneli",
          metric: weather?.condition || "Veri bekleniyor",
          desc: "Anlik sicaklik, nem, ruzgar ve don riskini tek panelde izle.",
          tone: "emerald"
        },
        {
          key: "weather-risk",
          icon: AlertCircle,
          title: "Risk skoru",
          metric: `${weatherSummary?.score || 0}/100`,
          desc: "Ruzgar, yagis ve nem risklerini operasyon planina yansit.",
          tone: "amber"
        },
        {
          key: "weather-soil",
          icon: CheckCircle2,
          title: "Toprak profili",
          metric: soilReport?.soilType || "Veri bekleniyor",
          desc: `Toprak skoru ${soilReport?.soilHealth?.score || "-"} / pH ${soilReport?.ph ?? "-"}`,
          tone: "sky"
        }
      ];
    }
    if (bottomTab === "market") {
      return [
        {
          key: "market-depth",
          icon: Sparkles,
          title: "Canli pazar derinligi",
          metric: `${tradeListings.length || 0} ilan`,
          desc: "Alis-satis akisinda fiyat bandini hizli gor.",
          tone: "emerald"
        },
        {
          key: "market-offers",
          icon: ShieldCheck,
          title: "Guvenli teklif akisi",
          metric: `${tradeOffers.length || 0} teklif`,
          desc: "Escrow ve karsi teklif adimlarini tek ekranda yonet.",
          tone: "amber"
        },
        {
          key: "market-alert",
          icon: AlertCircle,
          title: "Anlik pazar alarmlari",
          metric: `${tradeAlerts.length || 0} olay`,
          desc: "Yeni siparis, fiyat kirilimi ve lojistik uyarilari.",
          tone: "sky"
        }
      ];
    }
    if (bottomTab === "land") {
      return [
        {
          key: "finance-net",
          icon: LeafyGreen,
          title: "Net karlilik panosu",
          metric: `${Number(econTotals?.net || 0).toLocaleString("tr-TR")} TL`,
          desc: "Gelir-gider dengesini donum bazli takip et.",
          tone: "emerald"
        },
        {
          key: "finance-land",
          icon: ShieldCheck,
          title: "Arazi deger motoru",
          metric: `${Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da`,
          desc: "Bolge, toprak ve erisim etkisini tek modelde gor.",
          tone: "amber"
        },
        {
          key: "finance-risk",
          icon: AlertCircle,
          title: "Risk etkisi",
          metric: `%${Math.round(Number(weatherSummary?.score || 0))}`,
          desc: "Hava ve saha risklerini butceye yansit.",
          tone: "sky"
        }
      ];
    }
    if (bottomTab === "demos") {
      return [
        {
          key: "demo-readiness",
          icon: CheckCircle2,
          title: "Demo hazirlik skoru",
          metric: `${demoControlMetrics.runScore}/100`,
          desc: "Moduller, smoke ve akis gecmisi tek bakista.",
          tone: "emerald"
        },
        {
          key: "demo-autopilot",
          icon: Sparkles,
          title: "Autopilot",
          metric: demoAutopilotRunning ? "Calisiyor" : "Hazir",
          desc: "Tek tusla reset, seed ve smoke senaryolari.",
          tone: "amber"
        },
        {
          key: "demo-flow",
          icon: Stethoscope,
          title: "Demo akis laboratuvari",
          metric: `${demoFlowStats.total || 0} kosu`,
          desc: "Model, pazar ve finans senaryolarini hizli dogrula.",
          tone: "sky"
        }
      ];
    }
    return [
      {
        key: "home-diagnosis",
        icon: Stethoscope,
        title: "Hastalik tespiti merkezi",
        metric: result?.diagnosis?.name || "Analiz bekleniyor",
        desc: "Gorsel analiz, guven puani ve aksiyon plani tek ekranda.",
        tone: "emerald"
      },
      {
        key: "home-weather",
        icon: Sparkles,
        title: "Hava + toprak istasyonu",
        metric: weather?.condition || "Veri bekleniyor",
        desc: "Anlik iklim sinyalleriyle saha kararlarini hizlandir.",
        tone: "amber"
      },
      {
        key: "home-ops",
        icon: ShieldCheck,
        title: "Operasyon guven kalkanı",
        metric: `${modelReady ? "Model hazir" : "Model bekleniyor"}`,
        desc: "Model sagligi, tutarlilik ve uyarilar surekli izlenir.",
        tone: "sky"
      }
    ];
  }, [
    bottomTab,
    tradeListings.length,
    tradeOffers.length,
    tradeAlerts.length,
    econTotals?.net,
    landPriceData?.priceTlDa,
    weatherSummary?.score,
    demoControlMetrics.runScore,
    demoAutopilotRunning,
    demoFlowStats.total,
    result?.diagnosis?.name,
    weather?.condition,
    soilReport?.soilType,
    soilReport?.ph,
    soilReport?.soilHealth?.score,
    modelReady
  ]);

  const showcaseWallItems = useMemo(() => {
    if (bottomTab === "weather") {
      return [
        { key: "w1", title: "Sicaklik", subtitle: "Anlik", tone: "emerald", value: `${weather?.temp ?? "-"}°C` },
        { key: "w2", title: "Nem", subtitle: "Ortam", tone: "amber", value: `${weather?.humidity ?? "-"}%` },
        { key: "w3", title: "Ruzgar", subtitle: "Ortalama", tone: "sky", value: `${weather?.windKmh ?? "-"} km/sa` },
        { key: "w4", title: "Don", subtitle: "Kisa vade", tone: "slate", value: weather?.frostRisk ? "Risk var" : "Risk yok" }
      ];
    }
    if (bottomTab === "market") {
      return [
        { key: "w1", title: "Fiyat bandi", subtitle: "Alis/satis spread", tone: "emerald", value: `${tradeMarketDepth?.spreadPct || 0}%` },
        { key: "w2", title: "Likidite", subtitle: "Ilk 5 kademe", tone: "amber", value: `${Math.round(Number(tradeMarketDepth?.liquidityKg || 0)).toLocaleString("tr-TR")} kg` },
        { key: "w3", title: "Acilan ilan", subtitle: "Canli akista", tone: "sky", value: `${tradeListings.length || 0}` },
        { key: "w4", title: "Aktif teklif", subtitle: "Pazarlik adimi", tone: "slate", value: `${tradeOffers.length || 0}` }
      ];
    }
    if (bottomTab === "land") {
      return [
        { key: "w1", title: "Net sonuc", subtitle: "Sezon sonu", tone: "emerald", value: `${Number(econTotals?.net || 0).toLocaleString("tr-TR")} TL` },
        { key: "w2", title: "Gelir", subtitle: "Brut", tone: "amber", value: `${Number(econTotals?.revenue || 0).toLocaleString("tr-TR")} TL` },
        { key: "w3", title: "Maliyet", subtitle: "Toplam", tone: "sky", value: `${Number(econTotals?.cost || 0).toLocaleString("tr-TR")} TL` },
        {
          key: "w4",
          title: "Arazi",
          subtitle: `Konum ${landPriceData?.contextInsights?.marketPosition || "denge"} • Skor ${landPriceData?.decisionSignals?.grade || "-"}`,
          tone: "slate",
          value: `${Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da`
        }
      ];
    }
    if (bottomTab === "demos") {
      return [
        { key: "w1", title: "Demo skoru", subtitle: "Modul hazirlik", tone: "emerald", value: `${demoControlMetrics.runScore}/100` },
        { key: "w2", title: "Smoke", subtitle: "Son kosu", tone: "amber", value: `${demoControlMetrics.smokePass}/${demoControlMetrics.smokeTotal || "-"}` },
        { key: "w3", title: "Akis", subtitle: "Toplam kosu", tone: "sky", value: `${demoFlowStats.total || 0}` },
        { key: "w4", title: "Autopilot", subtitle: "Durum", tone: "slate", value: demoAutopilotRunning ? "Calisiyor" : "Hazir" }
      ];
    }
    return [
      { key: "w1", title: "Teshis", subtitle: "Son sonuc", tone: "emerald", value: result?.diagnosis?.name || "Bekleniyor" },
      { key: "w2", title: "Hava", subtitle: "Anlik durum", tone: "amber", value: weather?.condition || "Bekleniyor" },
      { key: "w3", title: "Toprak", subtitle: "Saha profili", tone: "sky", value: soilReport?.soilType || "Bekleniyor" },
      { key: "w4", title: "Model", subtitle: "Saglik", tone: "slate", value: modelReady ? "Hazir" : "Bekleniyor" }
    ];
  }, [
    bottomTab,
    tradeMarketDepth?.spreadPct,
    tradeMarketDepth?.liquidityKg,
    tradeListings.length,
    tradeOffers.length,
    weather?.temp,
    weather?.humidity,
    weather?.windKmh,
    weather?.frostRisk,
    econTotals?.net,
    econTotals?.revenue,
    econTotals?.cost,
    landPriceData?.priceTlDa,
    landPriceData?.contextInsights?.marketPosition,
    landPriceData?.decisionSignals?.grade,
    demoControlMetrics.runScore,
    demoControlMetrics.smokePass,
    demoControlMetrics.smokeTotal,
    demoFlowStats.total,
    demoAutopilotRunning,
    result?.diagnosis?.name,
    weather?.condition,
    soilReport?.soilType,
    modelReady
  ]);

  const tabRibbon = useMemo(() => {
    if (bottomTab === "weather") {
      return {
        title: "Iklim + toprak merkezi",
        desc: "Hava, don riski, toprak profili ve ekim uygunlugunu tek panelde yonet."
      };
    }
    if (bottomTab === "market") {
      return {
        title: "Pazar operasyon merkezi",
        desc: "Ilan, teklif, siparis ve lojistik akislarini tek satirda yonet."
      };
    }
    if (bottomTab === "land") {
      return {
        title: "Arazi deger merkezi",
        desc: "Arazi fiyat tahmini, bolge sinyali ve net finans etkisini birlikte izle."
      };
    }
    if (bottomTab === "demos") {
      return {
        title: "Demo orkestrasyon merkezi",
        desc: "Autopilot, smoke ve akis testlerini hizli calistir."
      };
    }
    return {
      title: "Saha komuta merkezi",
      desc: "Teshis, hava, toprak ve aksiyon planini birlestir."
    };
  }, [bottomTab]);
  const summaryCards = featureSummaries[featureTab] || featureSummaries.all;
  const shouldFilterDemoSections = demoDockOpen && demoDockTab !== "diagnosis";
  const isDemoVisible = (key) => !shouldFilterDemoSections || demoDockTab === key;

  const statusItems = [
    {
      label: "Hava",
      value: weather
        ? `${weather.temp ?? "-"}°C · ${weather.condition} · Ruzgar ${weather.windKmh ?? "-"} km/sa`
        : "Yukleniyor"
    },
    {
      label: "Toprak",
      value: soilReport ? `${soilReport.soilType} · pH ${soilReport.ph}` : "Bekleniyor"
    },
    {
      label: "Don",
      value: weather?.frostRisk ? "Risk var" : "Risk yok"
    },
    {
      label: "Ruzgar",
      value: weather
        ? `${weather.windKmh ?? "-"} km/sa${weather.windGustKmh ? ` / Esinti ${weather.windGustKmh} km/sa` : ""}`
        : "Bekleniyor"
    },
    {
      label: "Bitki",
      value: selectedPlant?.name || "Secilmedi"
    }
  ];

  const statusPalette = {
    Hava: "sky",
    Toprak: "soil",
    Don: weather?.frostRisk ? "alert" : "safe",
    Ruzgar: (weather?.windGustKmh ?? 0) >= 40 || (weather?.windKmh ?? 0) >= 20 ? "alert" : "safe",
    Bitki: selectedPlant ? "plant" : "muted"
  };
  const heroSignals = [
    {
      label: "API",
      value:
        apiStatus.state === "ok"
          ? "Hazir"
          : apiStatus.state === "down"
            ? "Baglanti yok"
            : "Kontrol ediliyor",
      tone: apiStatus.state === "ok" ? "ok" : apiStatus.state === "down" ? "down" : "pending"
    },
    {
      label: "Teshis",
      value: result?.diagnosis?.name || "Bekleniyor",
      tone: result?.diagnosis?.name ? "ok" : "pending"
    },
    {
      label: "Bitki",
      value: selectedPlant?.name || "Secilmedi",
      tone: selectedPlant ? "ok" : "pending"
    },
    {
      label: "Risk",
      value: weather?.frostRisk ? "Don riski var" : "Don riski dusuk",
      tone: weather?.frostRisk ? "down" : "ok"
    }
  ];

  const soilFit = (() => {
    if (!soilReport || !selectedPlant) return null;
    const match = (soilReport.plantSuitability || []).find((item) => item.id === selectedPlant.id);
    if (match) {
      if (match.status === "Uygun") {
        return {
          level: "good",
          label: "Uygun",
          detail: `${selectedPlant.name}: ${match.score}/100. ${match.recommendation}`
        };
      }
      if (match.status === "Riskli") {
        return {
          level: "risk",
          label: "Riskli",
          detail: `${selectedPlant.name}: ${match.score}/100. ${match.recommendation}`
        };
      }
      return {
        level: "mid",
        label: "Dikkat",
        detail: `${selectedPlant.name}: ${match.score}/100. ${match.recommendation}`
      };
    }
    const name = selectedPlant.name;
    const recommended = (soilReport.recommended || []).map((item) => item.toLowerCase());
    const risky = (soilReport.risky || []).map((item) => item.toLowerCase());
    if (recommended.some((item) => item.includes(name.toLowerCase()))) {
      return { level: "good", label: "Uygun", detail: `${name} bu toprak icin uygun gorunuyor.` };
    }
    if (risky.some((item) => item.includes(name.toLowerCase()))) {
      return { level: "risk", label: "Riskli", detail: `${name} icin riskli bir profil.` };
    }
    return { level: "mid", label: "Dikkat", detail: `${name} ekilecekse su ve hastalik takibi artirilmali.` };
  })();

  const fieldScore = useMemo(() => {
    const weatherPenalty = weatherSummary?.score ?? 0;
    const soilPenalty = soilFit?.level === "risk" ? 20 : soilFit?.level === "mid" ? 10 : 0;
    const modelPenalty = analysisState === "review" ? 10 : analysisState === "blocked" ? 20 : 0;
    const score = Math.max(40, Math.min(95, 100 - weatherPenalty * 0.6 - soilPenalty - modelPenalty));
    const priorities = [];
    if (weatherSummary?.riskTags?.includes("Don riski")) priorities.push("Don onlemi planla");
    if (weatherSummary?.riskTags?.includes("Asiri yagis")) priorities.push("Drenaj ve su birikimini kontrol et");
    if (weatherSummary?.riskTags?.includes("Ruzgar stresi")) priorities.push("Ruzgar kirici ve baglama kontrolu");
    if (soilFit?.level === "risk") priorities.push("Toprak uygunlugunu yeniden degerlendir");
    if (analysisState === "review") priorities.push("Yeni fotografla teshisi dogrula");
    if (!priorities.length) priorities.push("Rutin izlemeye devam et");
    return { score: Math.round(score), priorities };
  }, [weatherSummary, soilFit, analysisState]);

  const soilSuitability = useMemo(() => {
    if (!Array.isArray(soilReport?.plantSuitability)) return [];
    return soilReport.plantSuitability;
  }, [soilReport]);

  const soilInsights = useMemo(() => {
    if (!soilReport || !String(soilReport.source || "").includes("soilgrids")) return null;
    const ph = Number(soilReport.ph);
    const organic = Number(soilReport.organic);
    const phLabel = Number.isNaN(ph)
      ? "Bilinmiyor"
      : ph < 5.5
        ? "Asidik"
        : ph <= 7.3
          ? "Nötr"
          : "Bazik";
    const organicLabel = Number.isNaN(organic)
      ? "Bilinmiyor"
      : organic < 1
        ? "Düsük organik"
        : organic < 2.5
          ? "Orta organik"
          : "Yüksek organik";
    return { phLabel, organicLabel };
  }, [soilReport]);

  const soilManagementPlan = useMemo(() => {
    if (!soilReport?.managementPlan || typeof soilReport.managementPlan !== "object") return null;
    return soilReport.managementPlan;
  }, [soilReport]);

  const soilDiagnostics = useMemo(() => {
    if (!soilReport) return null;
    if (soilReport.soilHealth && typeof soilReport.soilHealth === "object") {
      const remote = soilReport.soilHealth;
      return {
        score: Number.isFinite(Number(remote.score)) ? Number(remote.score) : 0,
        grade: remote.grade || "C",
        risk: remote.risk || "Orta",
        findings: Array.isArray(remote.findings) ? remote.findings : [],
        actions: Array.isArray(remote.actions) ? remote.actions : [],
        indices: soilReport.soilIndices && typeof soilReport.soilIndices === "object" ? soilReport.soilIndices : null
      };
    }

    const toNum = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    let score = 68;
    const findings = [];
    const actions = [];

    const ph = toNum(soilReport.ph);
    if (ph !== null) {
      if (ph < 5.5) {
        score -= 16;
        findings.push("pH asidik");
        actions.push("pH dengelemesi icin kirec/duzenleyici planla.");
      } else if (ph > 7.8) {
        score -= 12;
        findings.push("pH bazik");
        actions.push("Organik maddeyi artir, asit etkili duzenleyici degerlendir.");
      } else if (ph >= 6 && ph <= 7.4) {
        score += 8;
        findings.push("pH dengeli");
      } else {
        findings.push("pH sinira yakin");
      }
    } else {
      findings.push("pH bilinmiyor");
      actions.push("Toprak pH olcumu yap.");
    }

    const organic = toNum(soilReport.organic);
    if (organic !== null) {
      if (organic < 1) {
        score -= 14;
        findings.push("Organik madde dusuk");
        actions.push("Kompost/yesil gubre ile organik maddeyi artir.");
      } else if (organic < 2.5) {
        score += 2;
        findings.push("Organik madde orta");
      } else {
        score += 10;
        findings.push("Organik madde iyi");
      }
    } else {
      findings.push("Organik madde bilinmiyor");
    }

    const bulkDensity = toNum(soilReport.bulkDensity);
    if (bulkDensity !== null && bulkDensity > 1.5) {
      score -= 8;
      findings.push("Sikisma riski");
      actions.push("Derin havalandirma ve organik iyilestirme uygula.");
    }

    const soilTypeLower = (soilReport.soilType || "").toLowerCase();
    if (soilTypeLower.includes("kumlu")) {
      score -= 4;
      findings.push("Su tutma dusuk olabilir");
      actions.push("Sulama araligini kisalt, malc kullan.");
    }
    if (soilTypeLower.includes("killi")) {
      score -= 3;
      findings.push("Drenaj takibi gerekli");
      actions.push("Yuzey su birikimini ve drenaji izleyin.");
    }

    if (soilReport.source === "soilgrids" || soilReport.source === "soilgrids+mta") {
      score += 5;
    } else if (soilReport.source === "demo") {
      score -= 6;
      actions.push("Konum tabanli canli toprak verisi kullan.");
    }

    if (soilReport.mta?.mineralProspect) {
      findings.push("MTA maden anomalisi mevcut");
      actions.push("Bolgede agir metal analizi icin laboratuvar testi dusun.");
    }

    const normalized = Math.max(25, Math.min(98, Math.round(score)));
    const grade = normalized >= 85 ? "A" : normalized >= 72 ? "B" : normalized >= 58 ? "C" : "D";
    const risk = normalized >= 80 ? "Dusuk" : normalized >= 65 ? "Orta" : "Yuksek";

    return {
      score: normalized,
      grade,
      risk,
      findings: Array.from(new Set(findings)).slice(0, 4),
      actions: Array.from(new Set(actions)).slice(0, 5),
      indices: null
    };
  }, [soilReport]);

  const soilIndexCards = useMemo(() => {
    const idx = soilDiagnostics?.indices;
    if (!idx) return [];
    const entries = [
      {
        key: "waterHoldingScore",
        label: "Su tutma",
        value: Number(idx.waterHoldingScore),
        goodHigh: true
      },
      {
        key: "nutrientRetentionScore",
        label: "Besin tutma",
        value: Number(idx.nutrientRetentionScore),
        goodHigh: true
      },
      {
        key: "compactionRiskScore",
        label: "Sikisma riski",
        value: Number(idx.compactionRiskScore),
        goodHigh: false
      },
      {
        key: "erosionRiskScore",
        label: "Erozyon riski",
        value: Number(idx.erosionRiskScore),
        goodHigh: false
      },
      {
        key: "irrigationNeedScore",
        label: "Sulama ihtiyaci",
        value: Number(idx.irrigationNeedScore),
        goodHigh: false
      },
      {
        key: "confidenceScore",
        label: "Veri guveni",
        value: Number(idx.confidenceScore),
        goodHigh: true
      }
    ];
    return entries
      .filter((item) => Number.isFinite(item.value))
      .map((item) => {
        const effective = item.goodHigh ? item.value : 100 - item.value;
        const tone = effective >= 70 ? "good" : effective >= 50 ? "mid" : "risk";
        return {
          ...item,
          tone,
          text: item.goodHigh
            ? item.value >= 70
              ? "iyi"
              : item.value >= 50
                ? "orta"
                : "zayif"
            : item.value >= 70
              ? "yuksek"
              : item.value >= 50
                ? "orta"
                : "dusuk"
        };
      });
  }, [soilDiagnostics]);

  const demoYieldForecast = useMemo(() => {
    const areaDa = Math.max(1, Number(econArea) || Number(demoCost.area) || 1);
    const yieldPerDaBase = Math.max(
      1,
      Number(econYield) || Number(econYieldAuto) || Number(demoScenarioSummary.adjustedYield) || 1
    );
    const priceBase = Math.max(0, Number(econPrice) || Number(demoCost.price) || 0);
    const costPerDa = Math.max(
      0,
      Number(econTotals.costPerDa) || (Number(demoCost.cost) || 0) / areaDa
    );
    const landPerDa = Math.max(0, Number(econLandValue) || 0);

    const weatherPenalty = weatherSummary
      ? Math.min(18, Math.round((weatherSummary.score || 0) / 6))
      : 0;
    const soilPenalty = soilDiagnostics?.score
      ? Math.max(0, Math.round((70 - soilDiagnostics.score) / 4))
      : 0;

    const baseImpactPct =
      Number(demoYieldModel.climateImpact || 0) +
      Number(demoYieldModel.diseaseImpact || 0) +
      Number(demoYieldModel.operationImpact || 0) -
      weatherPenalty -
      soilPenalty;

    const scenarioDefs = [
      { id: "kotu", label: "Kotu", extra: -10, priceExtra: -6 },
      { id: "baz", label: "Baz", extra: 0, priceExtra: 0 },
      { id: "iyi", label: "Iyi", extra: 9, priceExtra: 6 }
    ];

    const scenarios = scenarioDefs.map((scenario) => {
      const yieldFactor = Math.max(0.4, 1 + (baseImpactPct + scenario.extra) / 100);
      const priceFactor = Math.max(
        0.5,
        1 + (Number(demoYieldModel.priceImpact || 0) + scenario.priceExtra) / 100
      );
      const yieldPerDa = yieldPerDaBase * yieldFactor;
      const totalYieldKg = yieldPerDa * areaDa;
      const unitPrice = priceBase * priceFactor;
      const revenue = totalYieldKg * unitPrice;
      const cost = areaDa * (costPerDa + landPerDa);
      const net = revenue - cost;
      return {
        id: scenario.id,
        label: scenario.label,
        yieldPerDa: Math.round(yieldPerDa),
        totalYieldKg: Math.round(totalYieldKg),
        unitPrice: Math.round(unitPrice * 100) / 100,
        revenue: Math.round(revenue),
        net: Math.round(net)
      };
    });

    return {
      areaDa,
      yieldPerDaBase: Math.round(yieldPerDaBase),
      priceBase: Math.round(priceBase * 100) / 100,
      weatherPenalty,
      soilPenalty,
      baseImpactPct,
      scenarios
    };
  }, [
    econArea,
    econYield,
    econYieldAuto,
    econPrice,
    econLandValue,
    econTotals.costPerDa,
    demoCost.area,
    demoCost.cost,
    demoCost.price,
    demoScenarioSummary.adjustedYield,
    demoYieldModel,
    weatherSummary,
    soilDiagnostics?.score
  ]);

  const soilSmartSuggestions = useMemo(() => {
    if (!soilReport) return [];
    const selectedSuitability = selectedPlant
      ? (soilReport.plantSuitability || []).find((item) => item.id === selectedPlant.id)
      : null;
    const list = [
      ...(soilReport.recommended || []).map((item) => `${item} (onerilen)`),
      ...(soilDiagnostics?.actions || []),
      ...(soilReport.diseaseRisk || []).map((item) => `${item} riskini izleyin`),
      selectedSuitability
        ? `${selectedSuitability.name}: ${selectedSuitability.score}/100 (${selectedSuitability.status})`
        : null
    ];
    return Array.from(new Set(list.filter(Boolean))).slice(0, 6);
  }, [soilReport, soilDiagnostics, selectedPlant]);

  const buildSoilAnswer = () => {
    if (!soilReport) return "Toprak verisi olmadan net yorum yapamam. Once konumu sec.";
    const area = soilReport.coords ? `Koordinat: ${soilReport.coords}` : `Sehir: ${soilReport.city}`;
    const rec = (soilReport.recommended || []).slice(0, 4).join(", ");
    const risk = (soilReport.diseaseRisk || []).slice(0, 2).join(", ");
    const scoreText = soilDiagnostics ? `Toprak skoru ${soilDiagnostics.score}/100 (${soilDiagnostics.grade}).` : "";
    const actionText = soilDiagnostics?.actions?.length
      ? `Aksiyon: ${soilDiagnostics.actions.slice(0, 2).join(" ")}`
      : "";
    return `${area}. Toprak tipi ${soilReport.soilType}, pH ${soilReport.ph}. Iklem ${soilReport.climate}. ${scoreText} Oncelikli oneriler: ${rec || "-"}. Riskli hastaliklar: ${risk || "-"}. ${actionText}`.trim();
  };

  React.useEffect(() => {
    const handleScrollProgress = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) {
        setScrollProgress(0);
        setShowBackTop(false);
        return;
      }
      const pct = Math.max(0, Math.min(100, (window.scrollY / max) * 100));
      setScrollProgress(pct);
      setShowBackTop(pct >= 18);
    };
    handleScrollProgress();
    window.addEventListener("scroll", handleScrollProgress, { passive: true });
    window.addEventListener("resize", handleScrollProgress);
    return () => {
      window.removeEventListener("scroll", handleScrollProgress);
      window.removeEventListener("resize", handleScrollProgress);
    };
  }, []);

  return (
    <div className={`app tab-${bottomTab} ${presentationMode ? "presentation-mode" : ""}`}>
      <div className="app-progress" aria-hidden="true">
        <span style={{ width: `${scrollProgress}%` }} />
      </div>
      <datalist id="location-city-suggestions">
        {locationCitySuggestions.map((option) => (
          <option key={`city-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-district-suggestions">
        {locationDistrictSuggestions.map((option) => (
          <option key={`district-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-neighborhood-suggestions">
        {locationNeighborhoodSuggestions.map((option) => (
          <option key={`neighborhood-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-land-district-suggestions">
        {landScopedDistrictSuggestions.map((option) => (
          <option key={`land-district-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-land-neighborhood-suggestions">
        {landScopedNeighborhoodSuggestions.map((option) => (
          <option key={`land-neighborhood-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-manual-district-suggestions">
        {manualScopedDistrictSuggestions.map((option) => (
          <option key={`manual-district-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-manual-neighborhood-suggestions">
        {manualScopedNeighborhoodSuggestions.map((option) => (
          <option key={`manual-neighborhood-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-trade-district-suggestions">
        {tradeScopedDistrictSuggestions.map((option) => (
          <option key={`trade-district-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-weather-district-suggestions">
        {weatherScopedDistrictSuggestions.map((option) => (
          <option key={`weather-district-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <datalist id="location-weather-neighborhood-suggestions">
        {weatherScopedNeighborhoodSuggestions.map((option) => (
          <option key={`weather-neighborhood-option-${normalizeKey(option)}`} value={option} />
        ))}
      </datalist>
      <header className="hero">
        <div className="hero-shapes">
          <span />
          <span />
          <span />
        </div>
        <div className="hero-top">
          <div className="logo">
            <Leaf size={22} />
            <span>AgroGuard</span>
          </div>
          <div className="hero-top-meta">
            <div className="hero-badge">
              {isHandbook ? "Tarim el kilavuzu" : "Tarim el kilavuzu + teshis"}
            </div>
            <div className={`api-indicator ${apiStatus.state}`}>
              <span>API</span>
              <strong>
                {apiStatus.state === "ok"
                  ? "Hazir"
                  : apiStatus.state === "down"
                    ? "Baglanti yok"
                    : "Kontrol ediliyor"}
              </strong>
            </div>
            {apiStatus.state === "ok" && backendInfo.apiVersion ? (
              <div className="hero-badge subtle">v{backendInfo.apiVersion}</div>
            ) : null}
            {strictModelActive ? <div className="hero-badge subtle">Strict model aktif</div> : null}
            <button
              type="button"
              className="hero-mode-toggle"
              onClick={() => {
                if (presentationMode) {
                  setPresentationMode(false);
                  setBottomTab("home");
                } else {
                  activatePresentationMode();
                }
              }}
            >
              {presentationMode ? "Standart mod" : "Sunum modu"}
            </button>
          </div>
        </div>
        <div className="hero-signal-bar" role="status" aria-label="Saha sinyalleri">
          {heroSignals.map((signal) => (
            <div key={signal.label} className={`hero-signal-chip tone-${signal.tone}`}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={14} /> Yeşil odaklı akıllı bakım asistanı
            </span>
            <h1>
              {isHandbook
                ? "Tarim el kilavuzu: sahada hizli karar al."
                : "Tarim superapp: hastalik tespiti ve saha aksiyonu."}
            </h1>
            <p>
              {isHandbook
                ? "Tarla yonetimi, sulama, besleme ve hastalik onleme icin net protokoller. Referanslari takip et, sahada uygulanabilir adimlarla ilerle."
                : "AgroGuard; tarla, sera ve uretim alanlari icin gorsel analiz, dogru bakim adimlari ve uygulama protokollerini tek yerde toplar. Bitki sec, fotograf yukle, sonucu gor, aksiyonlari hizla uygula."}
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (bottomTab !== "home") setBottomTab("home");
                  setActiveTab("diagnosis");
                  setDemoDockOpen(false);
                  document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Teshise git
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setBottomTab("land");
                  setCommerceMiniTab("land");
                  setDemoDockTab("land");
                  setTimeout(() => {
                    document.getElementById("demo-land")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 40);
                }}
              >
                Toprak bolumu
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setBottomTab("market");
                  setCommerceMiniTab("market");
                  setDemoDockTab("market");
                  setTimeout(() => {
                    document.getElementById("demo-market")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 40);
                }}
              >
                Pazar bolumu
              </button>
            </div>
            <div className="hero-visual-gallery">
              <article className="visual-card visual-sky">
                <div className="visual-overlay" />
                <div className="visual-content">
                  <strong>Canli hava + risk sinyali</strong>
                  <p>
                    {weather?.condition || "Hava verisi bekleniyor"} •{" "}
                    {typeof weather?.temp === "number" ? `${weather.temp}°C` : "sicaklik yok"}
                  </p>
                  <span className={`visual-pill ${weather?.frostRisk ? "danger" : "safe"}`}>
                    {weather?.frostRisk ? "Don riski acik" : "Don riski dusuk"}
                  </span>
                </div>
              </article>
              <article className="visual-card visual-soil">
                <div className="visual-overlay" />
                <div className="visual-content">
                  <strong>Toprak profili</strong>
                  <p>
                    {soilReport?.soilType || "Toprak tipi bekleniyor"} • pH {soilReport?.ph || "-"}
                  </p>
                  <span className="visual-pill">
                    Oneri: {(soilReport?.recommended || []).slice(0, 2).join(", ") || "Analiz bekleniyor"}
                  </span>
                </div>
              </article>
              <article className="visual-card visual-econ">
                <div className="visual-overlay" />
                <div className="visual-content">
                  <strong>Arazi fiyat motoru</strong>
                  <p>
                    {landPriceData?.priceTlDa
                      ? `${Number(landPriceData.priceTlDa).toLocaleString("tr-TR")} TL/da`
                      : "Fiyat bekleniyor"}
                  </p>
                  <span className="visual-pill">
                    API: {landProvidersHealth?.healthy || 0}/{landProvidersHealth?.total || 0} aktif
                  </span>
                </div>
              </article>
            </div>
            <details className="accordion compact">
              <summary>Saha ozetleri</summary>
              <div className="status-strip">
                {statusItems.map((item) => (
                  <div key={item.label} className={`status-card ${statusPalette[item.label] || ""}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    {item.label === "Hava" && weather?.source && (
                      <em className="status-badge live">
                        Canli
                      </em>
                    )}
                  </div>
                ))}
              </div>
              <div className="hero-highlights">
                {highlights.map((item) => (
                  <div key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </details>
            <div className="primary-nav">
              <button
                className={activeTab === "diagnosis" ? "active" : ""}
                onClick={() => setActiveTab("diagnosis")}
              >
                Hastalik tespiti
              </button>
              <button
                className={activeTab === "handbook" ? "active" : ""}
                onClick={() => setActiveTab("handbook")}
              >
                El kilavuzu
              </button>
              <button
                className={activeTab === "faq" ? "active" : ""}
                onClick={() => setActiveTab("faq")}
              >
                Sik sorulanlar
              </button>
              <button
                onClick={() => {
                  setActiveTab("handbook");
                  setTimeout(() => {
                    document.getElementById("knowledge-bank")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 80);
                }}
              >
                Bilgi bankasi
              </button>
              <button
                className={activeTab === "stats" ? "active" : ""}
                onClick={() => setActiveTab("stats")}
              >
                Istatistikler
              </button>
              <button
                className={activeTab === "calendar" ? "active" : ""}
                onClick={() => setActiveTab("calendar")}
              >
                Takvim
              </button>
            </div>
            <div className="cta-card">
              <div>
                <strong>{isHandbook ? "Kilavuza odaklan" : "Hastalik tespiti merkezde"}</strong>
                <p>
                  {isHandbook
                    ? "Referanslarla ekip planini hizla, sonra teshise don."
                    : "Once bitkiyi sec, sonra gorsel yukle ve sonucu al."}
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setActiveTab("diagnosis");
                }}
              >
                {isHandbook ? "Teshise don" : "Tespit baslat"}
              </button>
            </div>
            <div className="hero-kpi-strip" aria-label="Canli metrik kartlari">
              {showcaseWallItems.slice(0, 3).map((item) => (
                <article key={`hero-kpi-${item.key}`} className={`hero-kpi-card tone-${item.tone || "slate"}`}>
                  <span>{item.title}</span>
                  <strong>{item.value}</strong>
                  <small>{item.subtitle}</small>
                </article>
              ))}
            </div>
            {activeTab === "diagnosis" && (
              <section className="visual-gallery" aria-label="Saha gorselleri">
                <article className="visual-card">
                  <img src={visualLeaf} alt="Yaprak analizi gorseli" loading="lazy" />
                  <div className="visual-meta">
                    <strong>Yaprak analizi</strong>
                    <p>Net yaprak, temiz arka plan ile model guvenini artir.</p>
                  </div>
                </article>
                <article className="visual-card">
                  <img src={visualField} alt="Parsel izleme gorseli" loading="lazy" />
                  <div className="visual-meta">
                    <strong>Parsel izleme</strong>
                    <p>Hava + toprak sinyallerini konum bazli takip et.</p>
                  </div>
                </article>
                <article className="visual-card">
                  <img src={visualMarket} alt="Pazar takip gorseli" loading="lazy" />
                  <div className="visual-meta">
                    <strong>Pazar paneli</strong>
                    <p>Ilan, fiyat ve teklif akisini tek panelde yonet.</p>
                  </div>
                </article>
              </section>
            )}
            {activeTab === "diagnosis" && (
              <section className="knowledge-spotlight" aria-label="Bilgi bankasi one cikanlar">
                <div className="knowledge-spotlight-head">
                  <div>
                    <strong>Bilgi bankasi</strong>
                    <p>{knowledgeEntries.length} kayit icinden en kritik saha basliklari.</p>
                  </div>
                  <button
                    className="ghost"
                    onClick={() => {
                      setActiveTab("handbook");
                      setTimeout(() => {
                        document.getElementById("knowledge-bank")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 80);
                    }}
                  >
                    Tumunu ac
                  </button>
                </div>
                <div className="knowledge-spotlight-grid">
                  {knowledgeSpotlight.map((item, idx) => (
                    <article key={`ks-${item.type}-${item.title}-${idx}`} className="knowledge-spotlight-card">
                      <span>{knowledgeTypeLabels[item.type] || item.type}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
          {!isHandbook && <div className="panel">
            {activeTab === "diagnosis" && (
              <div className="workflow-strip">
                <div className={`workflow-step ${hasPlant ? "done" : ""}`}>
                  <span>1</span>
                  <div>
                    <strong>Bitki sec</strong>
                    <small>{hasPlant ? "Secildi" : "Zorunlu adim"}</small>
                  </div>
                </div>
                <div className={`workflow-step ${hasFile ? "done" : ""}`}>
                  <span>2</span>
                  <div>
                    <strong>Gorsel yukle</strong>
                    <small>{hasFile ? "Hazir" : "PNG/JPG"}</small>
                  </div>
                </div>
                <div className={`workflow-step ${hasPlant && hasFile ? "done" : ""}`}>
                  <span>3</span>
                  <div>
                    <strong>Analiz</strong>
                    <small>{hasPlant && hasFile ? "Baslatilabilir" : "Bekliyor"}</small>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "diagnosis" && !selectedPlant && (
              <div className="plant-gate">
                <div>
                  <h3>Once bitkiyi sec</h3>
                  <p>
                    En iyi sonucu almak icin once analiz edilecek bitkiyi secmelisin. Bu,
                    modeli dogru sinifa odaklar.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => plantSelectRef.current?.focus()}
                >
                  Bitki sec
                </button>
              </div>
            )}

            <div
              className={`upload-card ${preview ? "has-preview" : ""} ${
                selectedPlant ? "" : "disabled"
              } ${loading ? "loading" : ""}`}
              onClick={() => selectedPlant && fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              style={{ display: activeTab === "diagnosis" ? "grid" : "none" }}
            >
              {!preview ? (
                <>
                  <FileImage size={38} />
                  <h3>{selectedPlant ? "Gorsel ekle" : "Once bitki sec"}</h3>
                  <p>PNG, JPG, HEIC desteklenir. Maksimum 8 MB.</p>
                  <div className="quality-hint">
                    <span>Ipucu:</span> Net yaprak, tek odak, sade arka plan.
                  </div>
                  <div className="quality-grid">
                    <span>Yaprak net gorunsun</span>
                    <span>Arka plan sade olsun</span>
                    <span>Isik patlamasin</span>
                    <span>Yaprak kadrajin %60-80'i olsun</span>
                  </div>
                  <div className="upload-cta">
                    {selectedPlant ? "Dosya sec veya surukle" : "Bitki secimi gerekli"}
                  </div>
                </>
              ) : (
                <>
                  <img src={preview} alt="Secilen bitki" />
                  <div className="preview-meta">
                    <span>{file?.name}</span>
                    <span>{fileMeta}</span>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => onSelectFile(event.target.files[0])}
              />
            </div>

            <div className="panel-actions" style={{ display: activeTab === "diagnosis" ? "flex" : "none" }}>
              <div className="plant-select">
                <label>Bitki sec</label>
                <select
                  ref={plantSelectRef}
                  value={selectedPlant?.id || ""}
                  onChange={(event) => setSelectedPlantId(event.target.value)}
                >
                  <option value="">Bitki seciniz</option>
                  {filteredPlantProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  Model kapsamı: {filteredPlantProfiles.length} bitki
                </small>
                {filteredPlantProfiles.length <= 3 && (
                  <small className="muted warning-text">
                    Model sinirli bitkiyi destekliyor. Tum PlantVillage modeli gelince genisleyecek.
                  </small>
                )}
                <div className="info-banner">
                  Not: Model su an sadece labels.json icindeki bitkileri taniyor.
                </div>
                <div className="filter-badge">Bitki filtresi zorunlu</div>
                <details className="accordion compact">
                  <summary>Bitki listesi</summary>
                  <div className="plant-grid">
                    {(showAllPlants
                      ? filteredPlantProfiles
                      : filteredPlantProfiles.slice(0, 12)
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`plant-chip ${item.id} ${
                          selectedPlant?.id === item.id ? "active" : ""
                        }`}
                        onClick={() => setSelectedPlantId(item.id)}
                      >
                        <div className="chip-head">
                          <span className="chip-dot" />
                          <strong>{item.title || item.name}</strong>
                        </div>
                        <span>{item.climate}</span>
                      </button>
                    ))}
                  </div>
                  {filteredPlantProfiles.length > 12 && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowAllPlants((prev) => !prev)}
                    >
                      {showAllPlants ? "Daha az goster" : "Tum bitkileri goster"}
                    </button>
                  )}
                </details>
              </div>
              {!selectedPlant && (
                <div className="plant-mini inline">
                  <strong>Once bitki sec</strong>
                  <span>Bitki secimi zorunlu</span>
                </div>
              )}
              {selectedPlant && (
                <div className="plant-mini inline">
                  <strong>Secilen bitki: {selectedPlant.name}</strong>
                  <span>{selectedPlant.tip}</span>
                  <small className={`muted ${apiReady ? "" : "warning-text"}`}>
                    {apiReady ? "API durumu: bagli" : "API durumu: baglanti yok"}
                  </small>
                  <small className={`muted ${selectedPlantSupported ? "" : "warning-text"}`}>
                    {selectedPlantSupported ? "Model destegi: var" : "Model destegi: yok"}
                  </small>
                  <small className={`muted ${modelReady ? "" : "warning-text"}`}>
                    {modelReady ? "Model durumu: hazir" : "Model durumu: yuklu degil"}
                  </small>
                </div>
              )}
              {selectedPlant && (
                <details className="accordion compact">
                  <summary>Bitki bakim ozeti</summary>
                  <div className="plant-mini detail">
                    <div>
                      <strong>{selectedPlant.name}</strong>
                      <p>Iklem: {selectedPlant.climate}</p>
                      <p>Sulama: {selectedPlant.water}</p>
                      <p>Toprak: {selectedPlant.soil}</p>
                    </div>
                    <span>{selectedPlant.tip}</span>
                  </div>
                </details>
              )}
              {selectedPlant && (
                <details className="accordion compact">
                  <summary>PlantVillage hastalik listesi</summary>
                  <div className="plant-mini detail">
                    {plantDiseaseData?.diseases?.length ? (
                      <ul className="compact-list">
                        {plantDiseaseData.diseases.map((item) => (
                          <li key={item.label}>
                            <strong>{item.name}</strong>
                            {item.summary ? <span>{item.summary}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Bu bitki icin hastalik listesi bulunamadi.</p>
                    )}
                    {plantDiseaseData?.healthy && (
                      <small className="muted">Saglikli sinif: {plantDiseaseData.healthy}</small>
                    )}
                    {plantDiseaseError && <small className="muted">{plantDiseaseError}</small>}
                  </div>
                </details>
              )}
              {!diagnoseReadiness.ready && (
                <div className="alert warning">
                  <AlertCircle size={16} />
                  <div>
                    <strong>Analiz icin eksikler:</strong>{" "}
                    {diagnoseReadiness.blockers.join(" • ")}
                  </div>
                </div>
              )}
              <div className="readiness-card">
              <div className="readiness-head">
                  <strong>Sistem hazirlik</strong>
                  <span className={`badge ${diagnoseReadiness.ready ? "safe" : "issue"}`}>%{diagnoseChecks.pct}</span>
                  {strictModelActive ? <span className="badge safe">Strict model aktif</span> : null}
                </div>
                <div className="readiness-list">
                  {diagnoseChecks.items.map((item) => (
                    <div key={item.key} className={`readiness-item ${item.ok ? "ok" : "missing"}`}>
                      <span>{item.label}</span>
                      <small>{item.ok ? "Hazir" : "Eksik"}</small>
                    </div>
                  ))}
                </div>
                {!diagnoseReadiness.ready && (
                  <div className="readiness-actions">
                    {!apiReady && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setApiHealthTick((prev) => prev + 1)}
                      >
                        Baglantiyi tekrar dene
                      </button>
                    )}
                    {diagnoseNextStep && (
                      <button type="button" className="ghost" onClick={runDiagnoseNextStep}>
                        {diagnoseNextStep.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="action-stack">
                <button
                  className={`primary ${loading ? "loading" : ""}`}
                  onClick={analyze}
                  disabled={loading || !apiReady || !modelReady || !selectedPlant || !selectedPlantSupported || !file}
                  title={
                    !apiReady
                      ? "Backend baglantisi yok"
                      : !modelReady
                      ? "Model yuklu degil"
                      : !selectedPlant
                      ? "Once bitki secin"
                      : !selectedPlantSupported
                        ? "Secilen bitki modelde desteklenmiyor"
                        : !file
                        ? "Once gorsel yukleyin"
                        : ""
                  }
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                  {loading ? "Analiz ediliyor" : "Analizi baslat"}
                </button>
                <button className="ghost" onClick={resetAll} disabled={loading}>
                  <X size={16} /> Temizle
                </button>
              </div>
              {loading && (
                <div className="analysis-progress">
                  <div className="progress-bar">
                    <span />
                  </div>
                  <small className="muted">
                    Gorsel hazirlaniyor • Model calisiyor • Rapor olusuyor
                  </small>
                </div>
              )}
            </div>

            {apiStatus.state === "down" && activeTab === "diagnosis" && (
              <div className="alert warning">
                <AlertCircle size={16} />
                {apiStatus.message} API adresi: <strong>{runtimeApiBase}</strong>
              </div>
            )}

            {error && activeTab === "diagnosis" && (
              <div className="alert error">
                <AlertCircle size={16} /> {error}
                {diagnoseNextStep && (
                  <button type="button" className="ghost" onClick={runDiagnoseNextStep}>
                    {diagnoseNextStep.label}
                  </button>
                )}
              </div>
            )}

            {result && activeTab === "diagnosis" && (
              <div className="result-card compact">
                <div className="result-header">
                  <CheckCircle2 size={18} />
                  <div>
                    <h3>{showDiagnosisResult ? result.diagnosis.name : "Bitki uyumsuz"}</h3>
                    {showDiagnosisResult && diagnosisSummary && (
                      <p className="typewriter" key={diagnosisSummary}>
                        {diagnosisSummary}
                      </p>
                    )}
                    <span>
                      {showDiagnosisResult
                        ? `Guven ${diagnosisConfidenceText}% • ${result.diagnosis.severity}`
                        : "Secilen bitkiye uyan sinif bulunamadi."}
                    </span>
                    {showDiagnosisResult && (
                      <small className="muted">
                        {result.diagnosis.status === "healthy"
                          ? "Bitki saglikli gorunuyor; koruyucu plana odaklan."
                          : "Belirti gorunuyor; plana gore uygulama yap."}
                      </small>
                    )}
                  </div>
                </div>
                {showDiagnosisResult && (
                  <>
                    <div className="result-badges">
                      {(showModelAdvanced ? diagnosisBadges : diagnosisBadges.slice(0, 2)).map((item) => (
                        <span key={item.key} className={`badge ${item.className || ""}`}>
                          {item.label}
                        </span>
                      ))}
                      {!showModelAdvanced && diagnosisBadges.length > 2 ? (
                        <span className="badge subtle">+{diagnosisBadges.length - 2} detay</span>
                      ) : null}
                    </div>
                    <div className="confidence-meter">
                      <div className="confidence-track">
                        <div
                          className="confidence-fill"
                          style={{ width: `${Math.max(1, Math.min(100, diagnosisConfidencePct))}%` }}
                        />
                      </div>
                      <span>{diagnosisConfidenceText}% guven</span>
                    </div>
                    <div className="demo-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setShowModelAdvanced((prev) => {
                            const next = !prev;
                            if (!next) setModelDetailTab("summary");
                            return next;
                          })
                        }
                      >
                        {showModelAdvanced ? "Model detaylarini gizle" : "Model detaylarini ac"}
                      </button>
                    </div>
                  </>
                )}
                {result.detectedPlant && (
                  <div className="result-meta">
                    Tespit edilen bitki:{" "}
                    <strong>{plantNameMap.get(result.detectedPlant) || result.detectedPlant}</strong>
                  </div>
                )}
                {(result.warnings?.length ||
                  result.filter?.blocked ||
                  result.qualityGate ||
                  result.retrySuggested ||
                  analysisState) && (
                  <details className="accordion compact">
                    <summary>Uyarilar ve yonlendirme ({warningCount})</summary>
                    {result.warnings?.length ? (
                      <div className="alert warning">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Uyari</strong>
                          <ul>
                            {result.warnings.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                    {modelConsistencyAlert ? (
                      <div className="alert warning">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Model tutarlilik uyarisi</strong>
                          <p>{modelConsistencyAlert.message}</p>
                        </div>
                      </div>
                    ) : null}
                    {result.filter?.blocked && (
                      <div className="alert info">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Bitki filtresi aktif</strong>
                          <p>
                            Secilen bitkiyle eslesen sinif bulunamadi. Yeni bir fotografla
                            tekrar deneyin veya bitki secimini guncelleyin.
                          </p>
                          {result.suggestedPlant && (
                            <button
                              className="ghost"
                              onClick={() => {
                                const suggested = filteredPlantProfiles.find(
                                  (item) => item.id === result.suggestedPlant
                                );
                                if (suggested) {
                                  setSelectedPlantId(suggested.id);
                                }
                              }}
                            >
                              Onerilen bitkiye gec:{" "}
                              {plantNameMap.get(result.suggestedPlant) || result.suggestedPlant}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {result.qualityGate && (
                      <div className="alert warning">
                        <AlertCircle size={16} />
                        <div>
                          <strong>Fotograf kalitesi dusuk</strong>
                          <p>Isik/kontrast yetersiz. Daha net bir cekimle dene.</p>
                        </div>
                      </div>
                    )}
                    {result.retrySuggested && (
                      <div className="retry-card">
                        <div>
                          <strong>Yeniden fotograf onerisi</strong>
                          <p>Daha net sonuc icin akilli onerilere gore hizli tekrar deneyin.</p>
                        </div>
                        <ul>
                          {retryPlanItems.map((item) => (
                            <li key={item.id || item.text}>
                              <span>{item.text}</span>
                              {item.priority ? (
                                <small className={`tip-priority p${item.priority}`}>
                                  oncelik {item.priority}/5
                                </small>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        {retryPlanItems.length > 0 && (
                          <div className="retry-checklist">
                            <div className="retry-checklist-head">
                              <strong>Hazirlik kontrolu</strong>
                              <div className="retry-checklist-meta">
                                <span>
                                  {retryChecklistStats.done}/{retryChecklistStats.total} • %{retryChecklistStats.pct}
                                </span>
                                <span className={`chip ${retryHighPriorityStats.pct >= 100 ? "ok" : "warn"}`}>
                                  Kritik %{retryHighPriorityStats.pct}
                                </span>
                                <button className="ghost" onClick={() => markPriorityRetryChecklist(4)}>
                                  Oncelik 4+ tamamla
                                </button>
                                <button className="ghost" onClick={completeNextRetryItem} disabled={!retryNextItem}>
                                  Sonraki adim
                                </button>
                                <button className="ghost" onClick={markAllRetryChecklist}>
                                  Tumunu tamamla
                                </button>
                                <button className="ghost" onClick={() => setRetryChecklist({})}>
                                  Sifirla
                                </button>
                              </div>
                            </div>
                            {retryChecklistSavedAt > 0 && (
                              <p className="retry-saved-at">
                                Son kayit: {new Date(retryChecklistSavedAt).toLocaleTimeString("tr-TR")}
                              </p>
                            )}
                            {!canRetakeNow && (
                              <p className="retry-saved-at">
                                Hazir olmak icin en az {retryNeedFor60} adim daha tamamlanmali.
                              </p>
                            )}
                            {retryNextItem && !canRetakeNow && (
                              <p className="retry-next">Siradaki adim: {retryNextItem.text}</p>
                            )}
                            <p className={`retry-readiness ${canRetakeNow ? "ok" : "warn"}`}>
                              {retryReadinessLabel}
                            </p>
                            {!canRetakeNow && retryMissingCritical.length > 0 && (
                              <p className="retry-missing">
                                Eksik kritik:{" "}
                                {retryMissingCritical
                                  .slice(0, 2)
                                  .map((item) => item.text)
                                  .join(" • ")}
                              </p>
                            )}
                            {!canRetakeNow && retryMissingCritical.length === 0 && retryMissingAny.length > 0 && (
                              <p className="retry-missing">
                                Hazirlik icin en az {Math.max(0, 60 - retryChecklistStats.pct)} puan daha tamamlansin.
                              </p>
                            )}
                            <div className="retry-progress">
                              <div
                                className="retry-progress-fill"
                                style={{ width: `${Math.max(4, retryChecklistStats.pct)}%` }}
                              />
                            </div>
                            <div className="retry-checklist-list">
                              {retryPlanItems.map((item) => {
                                const key = item.id || item.text;
                                return (
                                  <label key={`${key}-check`} className="retry-check-item">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(retryChecklist[key])}
                                      onChange={() => toggleRetryChecklist(key)}
                                    />
                                    <span>{item.text}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="demo-actions">
                          <button className="ghost" onClick={startRetakeFlow} disabled={!canRetakeNow}>
                            2. fotograf yukle (%{retryChecklistStats.pct} hazir)
                          </button>
                          {!canRetakeNow && (
                            <button className="ghost" onClick={autoPrepareRetake}>
                              Otomatik hazirla + yukle
                            </button>
                          )}
                          <button className="ghost" onClick={resetAll}>
                            Sifirla
                          </button>
                        </div>
                      </div>
                    )}
                    {retakeComparison && (
                      <div className="alert info">
                        <AlertCircle size={16} />
                        <div>
                          <strong>2. cekim karsilastirmasi</strong>
                          {retakeOutcome && <span className={`chip ${retakeOutcome.tone}`}>{retakeOutcome.label}</span>}
                          <p>
                            Ilk sonuc: {retakeComparison.previousLabel} (%{Math.round(retakeComparison.previousConfidence)})
                            {" • "}Yeni sonuc: %{Math.round(retakeComparison.newConfidence)} (
                            {retakeComparison.confidenceDelta >= 0 ? "+" : ""}
                            {retakeComparison.confidenceDelta})
                          </p>
                          <p>
                            Guvenilirlik: {retakeComparison.previousReliability}/100 →{" "}
                            {retakeComparison.newReliability}/100 (
                            {retakeComparison.reliabilityDelta >= 0 ? "+" : ""}
                            {retakeComparison.reliabilityDelta})
                          </p>
                          <div className="retake-compare">
                            <div className="retake-row">
                              <span>Guven</span>
                              <div className="retake-track">
                                <div
                                  className="retake-fill old"
                                  style={{ width: `${Math.max(2, Math.min(100, retakeComparison.previousConfidence))}%` }}
                                />
                                <div
                                  className="retake-fill new"
                                  style={{ width: `${Math.max(2, Math.min(100, retakeComparison.newConfidence))}%` }}
                                />
                              </div>
                            </div>
                            <div className="retake-row">
                              <span>Guvenilirlik</span>
                              <div className="retake-track">
                                <div
                                  className="retake-fill old"
                                  style={{ width: `${Math.max(2, Math.min(100, retakeComparison.previousReliability))}%` }}
                                />
                                <div
                                  className="retake-fill new"
                                  style={{ width: `${Math.max(2, Math.min(100, retakeComparison.newReliability))}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {retakeTrend.length > 0 && (
                      <div className="retake-trend">
                        <div className="retake-trend-head">
                          <strong>Tekrar deneme trendi</strong>
                          <button className="ghost" onClick={() => setRetakeTrend([])}>
                            Temizle
                          </button>
                        </div>
                        <div className="retake-trend-list">
                          {retakeTrend.map((item) => (
                            <div key={item.id} className="retake-trend-item">
                              <div>
                                <p>{item.label}</p>
                                <small>
                                  Guven %{Math.round(item.confidence)} ({item.confidenceDelta >= 0 ? "+" : ""}
                                  {item.confidenceDelta}) • Guvenilirlik {item.reliability}/100 (
                                  {item.reliabilityDelta >= 0 ? "+" : ""}
                                  {item.reliabilityDelta})
                                </small>
                              </div>
                              <span className={`chip ${item.reliabilityDelta >= 5 ? "ok" : item.reliabilityDelta <= -5 ? "risk" : "warn"}`}>
                                {item.reliabilityDelta >= 5 ? "Artti" : item.reliabilityDelta <= -5 ? "Azaldi" : "Stabil"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisState && (
                      <div className={`analysis-state ${analysisState}`}>
                        <strong>
                          {analysisState === "ok"
                            ? "Analiz net"
                            : analysisState === "review"
                              ? "Analiz destek istiyor"
                              : "Bitki eslesmesi yok"}
                        </strong>
                        <p>
                          {analysisState === "ok"
                            ? "Planlari uygulamaya gecirebilirsin."
                            : analysisState === "review"
                              ? "Bir ek fotograf veya aci ile guveni artir."
                              : "Bitki secimini kontrol edip yeniden dene."}
                        </p>
                        {result.decision?.flags?.length ? (
                          <div className="analysis-flags">
                            {result.decision.flags.map((flag) => (
                              <span key={flag}>
                                {flag === "plant_filter_no_match"
                                  ? "Bitki uyusmadi"
                                  : flag === "low_quality"
                                    ? "Dusuk kalite"
                                    : flag === "low_confidence"
                                      ? "Dusuk guven"
                                      : flag === "low_margin"
                                        ? "Siniflar yakin"
                                        : flag === "non_plant_suspected"
                                          ? "Bitki degil gibi"
                                        : flag === "ensemble_disagreement"
                                          ? "Cift model uyumsuz"
                                        : flag === "high_ambiguity"
                                          ? "Model belirsiz"
                                        : flag === "high_uncertainty"
                                          ? "Belirsizlik yuksek"
                                        : flag === "class_balance_conflict"
                                          ? "Sinif catismasi"
                                        : flag === "model_consistency_warning"
                                          ? "Model tutarlilik riski"
                                        : flag === "plant_mismatch"
                                          ? "Bitki uyusmuyor"
                                          : flag === "low_reliability"
                                            ? "Guvenilirlik dusuk"
                                        : flag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {analysisState && (
                      <div className="next-actions">
                        <button className="ghost" onClick={resetAll}>
                          Yeni gorsel yukle
                        </button>
                        <button
                          className="ghost"
                          onClick={() => plantSelectRef.current?.focus()}
                        >
                          Bitkiyi degistir
                        </button>
                        <button className="ghost" onClick={() => setActiveTab("handbook")}>
                          Kilavuzda bak
                        </button>
                      </div>
                    )}
                  </details>
                )}
                {showDiagnosisResult && (result.reasons?.length || result.diagnosis?.confidenceTier) ? (
                  <details className="accordion compact result-accordion">
                    <summary>Analiz aciklamasi</summary>
                    {result.reasons?.length ? (
                      <div className="result-section">
                        <h4>Bu sonucu neden verdi?</h4>
                        <ul>
                          {result.reasons.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {result.diagnosis?.confidenceTier && (
                      <div className="result-section confidence-story">
                        <h4>Guven hikayesi</h4>
                        <p>
                          {result.diagnosis.confidenceTier === "high"
                            ? "Model belirgin desenler yakaladi. Bu nedenle guven yuksek ve aksiyon planini uygulamak icin uygun."
                            : result.diagnosis.confidenceTier === "medium"
                              ? "Goruntude benzer belirtiler var fakat sinirlar net degil. Ek bir fotografla guveni artirabilirsin."
                              : "Goruntu net degil veya sinyaller zayif. Aydinlik ve yakin planla tekrar dene."}
                        </p>
                        {result.filter?.applied && (
                          <p className="muted">
                            Bitki filtresi {result.filter.matched ? "eslesme buldu" : "eslesme bulamadi"}.
                          </p>
                        )}
                      </div>
                    )}
                  </details>
                ) : null}
                {result.diagnosis.status === "healthy" ? (
                  <div className="result-hero safe">
                    <LeafyGreen size={18} />
                    <div>
                      <strong>Koruma onerileri</strong>
                      <p>Bitki saglikli. Duzenli kontrol ve dengeyi koru.</p>
                    </div>
                  </div>
                ) : (
                  <div className="result-hero danger">
                    <ShieldAlert size={18} />
                    <div>
                      <strong>Acil yapilacaklar</strong>
                      <p>
                        Enfekte yapraklari temizle, havalandirmayi artir ve uygun
                        cozumleri hemen uygula.
                      </p>
                    </div>
                  </div>
                )}
                {urgentActions.length ? (
                  <div className="urgent-list">
                    {urgentActions.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                <p className="result-summary">{result.diagnosis.summary}</p>
                {showModelAdvanced && (
                <>
                <div className="model-tabs">
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "summary" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("summary")}
                  >
                    Ozet
                  </button>
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "risk" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("risk")}
                  >
                    Risk
                  </button>
                  <button
                    type="button"
                    className={`ghost ${modelDetailTab === "tech" ? "active" : ""}`}
                    onClick={() => setModelDetailTab("tech")}
                  >
                    Teknik
                  </button>
                </div>
                <div className="model-panel">
                  {modelDetailTab === "summary" && (
                    <div className="model-health-strip">
                      <div className="model-health-card">
                        <span>Kaynagi</span>
                        <strong>{result.model?.source || "-"}</strong>
                        <small className="muted">
                          {result.model?.ensembleSize ? `Cift model x${result.model.ensembleSize}` : "Tek model"}
                        </small>
                      </div>
                      <div className="model-health-card">
                        <span>Guven</span>
                        <strong>%{Math.round(Number(result.diagnosis?.confidence || 0) * 100)}</strong>
                        <small className="muted">{result.diagnosis?.confidenceTier || "-"}</small>
                      </div>
                      <div className="model-health-card">
                        <span>Risk</span>
                        <strong>{result.modelMetrics?.uncertaintyScore ?? "-"} / 100</strong>
                        <small className="muted">
                          {result.modelMetrics?.uncertaintyHigh ? "Yuksek" : "Kontrol altinda"}
                        </small>
                      </div>
                    </div>
                  )}
                  {modelDetailTab === "risk" && (
                    <div className="result-section">
                      <div className="model-insight">
                        <div>
                          <strong>Karar gucu</strong>
                          <p>
                            Top1 {Math.round((result.modelMetrics?.top1 || 0) * 100)}% • Top2{" "}
                            {Math.round((result.modelMetrics?.top2 || 0) * 100)}% • Fark{" "}
                            {Math.round((result.modelMetrics?.margin || 0) * 100)}%
                          </p>
                        </div>
                        <span className={result.modelMetrics?.lowConfidence ? "risk" : "ok"}>
                          {result.modelMetrics?.lowConfidence ? "Kararsiz" : "Net"}
                        </span>
                      </div>
                      {result.reliability ? (
                        <div className="model-insight">
                          <div>
                            <strong>Guvenilirlik</strong>
                            <p>Skor {result.reliability.score}/100 • {result.reliability.level || "-"}</p>
                          </div>
                          <span className={result.reliability.unstable ? "warn" : "ok"}>
                            {result.reliability.unstable ? "Tekrar cekim" : "Stabil"}
                          </span>
                        </div>
                      ) : null}
                      {result.plantCheck ? (
                        <div className="model-insight">
                          <div>
                            <strong>Bitki dogrulama</strong>
                            <p>{result.plantCheck.reason}</p>
                          </div>
                          <span>{result.plantCheck.label}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {modelDetailTab === "tech" && (
                    <div className="result-section">
                      <div className="quality-grid">
                        <div>
                          <span>Kaynak</span>
                          <strong>{result.model?.source || "demo"}</strong>
                        </div>
                        <div>
                          <span>Girdi boyutu</span>
                          <strong>{result.model?.inputSize || "-"}</strong>
                        </div>
                        <div>
                          <span>Sinif</span>
                          <strong>{result.model?.labels || "-"}</strong>
                        </div>
                        <div>
                          <span>Kalite</span>
                          <strong>{result.quality ? Math.round(result.quality.score * 100) : "-"}%</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </>
                )}
                {showCarePlan && (
                  <details className="accordion compact">
                    <summary>Uygulama plani</summary>
                    <div className="result-section">
                      <strong className="result-subtitle">Bakim adimlari</strong>
                      <ul>
                        {result.carePlan?.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    {result.treatments && (
                      <div className="result-section">
                        <strong className="result-subtitle">Ilac ve cozumler</strong>
                        <small className="muted warning-text">
                          Not: Ilac secimi, doz ve tekrar araligi icin ruhsat etiketi + ziraat muhendisi onayi gerekir.
                        </small>
                        {result.treatments.organic?.length ? (
                          <>
                            <strong className="result-subtitle muted">Organik</strong>
                            <ul>
                              {result.treatments.organic.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {result.treatments.chemical?.length ? (
                          <>
                            <strong className="result-subtitle muted">Kimyasal</strong>
                            <ul>
                              {result.treatments.chemical.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    )}
                  </details>
                )}
                <details className="accordion compact">
                  <summary>Uygulama plani</summary>
                  {actionPlan ? (
                    <div className="plan-grid">
                      <div>
                        <strong>Bugun</strong>
                        <ul>
                          {actionPlan.today.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Bu hafta</strong>
                        <ul>
                          {actionPlan.week.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Takip</strong>
                        <ul>
                          {actionPlan.monitor.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Plan olusmadı. Once analiz tamamlanmali.</p>
                  )}
                </details>
                {(result.topPredictionsDetailed || result.topPredictions)?.length ? (
                  <details className="accordion compact">
                    <summary>Top 3 tahmin</summary>
                    {result.filter?.applied && (
                      <p className="muted">
                        {result.filter.matched
                          ? "Bitki filtresi uygulandi."
                          : "Bitki filtresi uygulandi, eslesme bulunamadi."}
                      </p>
                    )}
                    <div className="top3-grid">
                      {(result.topPredictionsDetailed || result.topPredictions).map((item) => (
                        <div key={item.label} className="top3-card">
                          <div className="top3-head">
                            <Leaf size={14} />
                            <strong>{item.pretty || item.label.replace(/_/g, " ")}</strong>
                          </div>
                          {item.plant && (
                            <small className="muted">
                              Bitki: {plantNameMap.get(item.plant) || item.plant}
                            </small>
                          )}
                          <div className="top3-bar">
                            <span style={{ width: `${Math.round(item.confidence * 100)}%` }} />
                          </div>
                          <small>{Math.round(item.confidence * 100)}% guven</small>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : result.filter?.applied ? (
                  <details className="accordion compact">
                    <summary>Top 3 tahmin</summary>
                    <p className="muted">
                      Bitki filtresi nedeniyle tahmin listesi gosterilemiyor. Fotografu
                      yenileyin.
                    </p>
                  </details>
                ) : null}
                <div className="quick-actions">
                  <button className="ghost" onClick={() => setShowQuickModal("plan")}>
                    Bakim planini kaydet
                  </button>
                  <button className="ghost" onClick={() => setShowQuickModal("treatment")}>
                    Ilac listesini goruntule
                  </button>
                  <button className="primary" onClick={() => setShowQuickModal("alert")}>
                    Acil aksiyon al
                  </button>
                </div>
                <div className="mini-stats">
                  <div>
                    <strong>{history.length}</strong>
                    <span>Son analiz</span>
                  </div>
                  <div>
                    <strong>
                      {history.length
                        ? `${Math.round(
                            history.reduce((acc, item) => acc + (item.confidence || 0), 0) /
                              history.length *
                              100
                          )}%`
                        : "—"}
                    </strong>
                    <span>Ortalama guven</span>
                  </div>
                  <div>
                    <strong>{result.diagnosis.status === "healthy" ? "Saglikli" : "Risk"}</strong>
                    <span>Durum</span>
                  </div>
                </div>
                <div className="result-note">{result.notes}</div>
              </div>
            )}
            {activeTab === "diagnosis" && selectedPlant && (
              <div className="plant-card">
                <h3>{selectedPlant.name} bakim ozeti</h3>
                <div className="plant-grid">
                  <div>
                    <strong>Iklem</strong>
                    <span>{selectedPlant.climate}</span>
                  </div>
                  <div>
                    <strong>Sulama</strong>
                    <span>{selectedPlant.water}</span>
                  </div>
                  <div>
                    <strong>Toprak</strong>
                    <span>{selectedPlant.soil}</span>
                  </div>
                  <div>
                    <strong>Ipucu</strong>
                    <span>{selectedPlant.tip}</span>
                  </div>
                </div>
                <div className="plant-tip">
                  <strong>Hizli ipucu</strong>
                  <p>{selectedPlant.tip}</p>
                </div>
              </div>
            )}

            {activeTab === "faq" && (
              <div className="handbook-panel">
                <h3>Sik sorulanlar</h3>
                <div className="faq-toolbar">
                  <div className="search-input">
                    <input
                      type="text"
                      value={faqQuery}
                      onChange={(event) => setFaqQuery(event.target.value)}
                      placeholder="SSS icinde ara"
                    />
                    {faqQuery && (
                      <button
                        type="button"
                        className="clear-button"
                        onClick={() => setFaqQuery("")}
                      >
                        Temizle
                      </button>
                    )}
                  </div>
                  <div className="chip-row">
                    {[
                      { key: "all", label: "Hepsi" },
                      { key: "model", label: "Model" },
                      { key: "data", label: "Veri" },
                      { key: "ipm", label: "IPM" }
                    ].map((item) => (
                      <button
                        key={item.key}
                        className={`chip ${faqFocus === item.key ? "active" : ""}`}
                        onClick={() => setFaqFocus(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                {faqGroups.length ? (
                  faqGroups.map((group) => (
                    <div key={group.key} className="faq-group">
                      <h4>{group.label}</h4>
                      <div className="step-grid">
                        {group.items.map((item) => (
                          <div key={item.title} className="step-card">
                            <h3>{item.title}</h3>
                            <p>{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">Sonuc bulunamadi.</p>
                )}
              </div>
            )}
            {activeTab === "stats" && (
              <div className="handbook-panel">
                <h3>Istatistik ozetleri</h3>
                <p>Model ve saha kararlarini destekleyen hizli veri notlari.</p>
                <div className="stats-highlight">
                  <strong>Hizli ozet</strong>
                  <span>PlantVillage kapsami + IPM esik mantigi + saha gercekleri</span>
                </div>
                <div className="step-grid">
                  <div className="step-card">
                    <h3>PlantVillage kapsami</h3>
                    <p>Yaklasik 54K gorsel, 38 sinif ve 14 bitki turu kapsar.</p>
                    <a
                      className="stat-link"
                      href="https://meta-album.github.io/datasets/PLT_VIL.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: Meta-Album
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Kontrollu veri notu</h3>
                    <p>Gorseller kontrollu ortamdan geldigi icin sahada ek takip onemlidir.</p>
                    <a
                      className="stat-link"
                      href="https://www.innovatiana.com/en/datasets/plantvillage"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: Innovatiana
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>IPM odagi</h3>
                    <p>Izleme ve esik temelli mudahale, maliyeti ve riski azaltir.</p>
                    <a
                      className="stat-link"
                      href="https://www.epa.gov/ipm/introduction-integrated-pest-management"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: EPA IPM
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Action threshold</h3>
                    <p>Esik, mudahale kararini belirler; riskli seviyede uygulama gerekir.</p>
                    <a
                      className="stat-link"
                      href="https://www.epa.gov/ipm/introduction-integrated-pest-management"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: EPA
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Hastalik dagilimi</h3>
                    <p>Veri setinde mantar, bakteri, viral ve oomycete hastaliklari ile akar kaynakli bir sinif bulunur.</p>
                    <a
                      className="stat-link"
                      href="https://github.com/gabrieldgf4/PlantVillage-Dataset"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: PlantVillage Dataset
                    </a>
                  </div>
                  <div className="step-card">
                    <h3>Hastalik turleri</h3>
                    <p>17 mantar, 4 bakteri, 2 oomycete, 2 viral ve 1 akar kaynakli hastalik turu bulunur.</p>
                    <a
                      className="stat-link"
                      href="https://github.com/gabrieldgf4/PlantVillage-Dataset"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak: PlantVillage Dataset
                    </a>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "calendar" && (
              <div className="handbook-panel">
                <h3>Takvim</h3>
                <p>Gunluk tarla planini tarih bazli tut, tamamlananlari isaretle.</p>
                <div className="step-grid">
                  <div className="step-card">
                    <h3>Tarih sec</h3>
                    <input
                      className="time-input"
                      type="date"
                      value={calendarDate}
                      onChange={(event) => setCalendarDate(event.target.value)}
                    />
                  </div>
                  <div className="step-card">
                    <h3>Yeni gorev</h3>
                    <div className="search-input">
                      <input
                        type="text"
                        value={calendarInput}
                        onChange={(event) => setCalendarInput(event.target.value)}
                        placeholder="Orn: Sulama hattini kontrol et"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCalendarItem();
                          }
                        }}
                      />
                      <button type="button" className="primary" onClick={addCalendarItem}>
                        Ekle
                      </button>
                    </div>
                    <div className="notif-time" style={{ marginTop: 10 }}>
                      <label className="notif-row">
                        <span>Saat</span>
                        <input
                          type="time"
                          value={calendarTaskTime}
                          onChange={(event) => setCalendarTaskTime(event.target.value || "08:00")}
                        />
                      </label>
                      <label className="notif-row">
                        <input
                          type="checkbox"
                          checked={calendarTaskNotify}
                          onChange={(event) => setCalendarTaskNotify(event.target.checked)}
                        />
                        <span>Bildirim bagla</span>
                      </label>
                    </div>
                  </div>
                  <div className="step-card">
                    <h3>Bugun / secili tarih</h3>
                    <small className="muted">
                      Not: "ilan gorevi" tamamlaninca sonraki hafta otomatik tekrar olusturulur.
                    </small>
                    {calendarItemsByDate.length ? (
                      <ul>
                        {calendarItemsByDate.map((item) => (
                          <li key={item.id}>
                            <label className="todo">
                              <input
                                type="checkbox"
                                checked={item.done}
                                onChange={() => toggleCalendarItem(item.id)}
                              />
                              <span>
                                <strong style={{ textDecoration: item.done ? "line-through" : "none" }}>
                                  {item.title}
                                </strong>
                                {item.tag === "land-listings" ? <em>ilan gorevi</em> : null}
                                {item.tag === "land-listings-report" ? <em>ilan raporu</em> : null}
                                {item.tag === "land-price-delta-alert" ? <em>fark alarmi</em> : null}
                                <em>
                                  {item.date} {item.time ? `• ${item.time}` : ""}
                                </em>
                              </span>
                            </label>
                            <label className="notif-row" style={{ marginLeft: 10 }}>
                              <input
                                type="checkbox"
                                checked={item.notify !== false}
                                onChange={() => toggleCalendarItemNotify(item.id)}
                              />
                              <span>Bildirim</span>
                            </label>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => deleteCalendarItem(item.id)}
                            >
                              Sil
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Bu tarih icin gorev yok.</p>
                    )}
                  </div>
                  <div className="step-card">
                    <h3>Yaklasan gorevler</h3>
                    {upcomingCalendarItems.length ? (
                      <ul>
                        {upcomingCalendarItems.map((item) => (
                          <li key={item.id}>
                            <strong>{item.title}</strong>
                            <span>
                              {item.date} {item.time ? `• ${item.time}` : ""}{" "}
                              {item.notify === false ? "• bildirimsiz" : "• bildirimli"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Yaklasan aktif gorev yok.</p>
                    )}
                    <div className="demo-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => syncNotifications("manual")}
                        disabled={!isNativeApp}
                      >
                        Takvim + bildirimleri senkronla
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>}
        </div>
      </header>

      <div className="section-divider" />
      <main className="app-shell">
      {presentationMode && bottomTab === "demos" ? (
      <section className="presentation-summary">
        <div>
          <strong>Sunum ozet paneli</strong>
          <p>Yatirimci sunumu icin kritik KPI, demo hazirlik ve operasyon metrikleri.</p>
        </div>
        <div className="info-badges">
          <span className={`badge ${investorSnapshot.readiness >= 75 ? "safe" : "warn"}`}>Hazirlik {investorSnapshot.readiness}/100</span>
          <span className="badge">Akis basari %{investorSnapshot.flowSuccess}</span>
          <span className="badge">Acik ilan {investorSnapshot.marketOpen}</span>
          <span className="badge">Aktif siparis {investorSnapshot.activeOrders}</span>
          <span className="badge">Arazi guven %{investorSnapshot.landConfidence}</span>
          <span className={`badge ${investorExecutionDecision.tone}`}>Karar: {investorExecutionDecision.label}</span>
        </div>
        <small className="muted">{investorExecutionDecision.note}</small>
        <div className="pitch-timer-panel">
          <div className="pitch-timer-head">
            <strong>Pitch sayaci</strong>
            <span>{Math.floor(pitchSeconds / 60)}:{String(pitchSeconds % 60).padStart(2, "0")}</span>
          </div>
          <div className="pitch-timer-bar">
            <span style={{ width: `${Math.max(0, Math.min(100, (pitchSeconds / pitchDurationSeconds) * 100))}%` }} />
          </div>
          <div className="presentation-config-row">
            <label htmlFor="pitch-duration-select">Sunum suresi</label>
            <select
              id="pitch-duration-select"
              value={pitchDurationSeconds}
              onChange={(event) => handlePitchDurationChange(event.target.value)}
            >
              <option value={60}>60 sn</option>
              <option value={90}>90 sn</option>
              <option value={120}>120 sn</option>
              <option value={180}>180 sn</option>
            </select>
            <label htmlFor="scene-advance-seconds">Oto sahne sn</label>
            <input
              id="scene-advance-seconds"
              type="number"
              min={8}
              max={120}
              step={1}
              value={sceneAdvanceSeconds}
              onChange={(event) => handleSceneAdvanceChange(event.target.value)}
            />
          </div>
          <small className="muted">Sahne: {presentationScene + 1}/{presentationScenes.length} • Oto gecis {sceneAdvanceSeconds} sn</small>
          <div className="demo-actions">
            <button className="ghost" onClick={() => setPitchTimerRunning((prev) => !prev)}>
              {pitchTimerRunning ? "Sayaci durdur" : "Sayaci baslat"}
            </button>
            <button className="primary" onClick={startPresentationFlow}>
              Akisi bastan baslat
            </button>
            <button
              className="ghost"
              onClick={resetPresentationFlow}
            >
              Sayaci sifirla
            </button>
            <button className={`ghost ${autoSceneAdvance ? "active" : ""}`} onClick={() => setAutoSceneAdvance((prev) => !prev)}>
              {autoSceneAdvance ? "Oto sahne: acik" : "Oto sahne: kapali"}
            </button>
            <button className={`ghost ${presentationFullscreen ? "active" : ""}`} onClick={togglePresentationFullscreen}>
              {presentationFullscreen ? "Tam ekrandan cik" : "Tam ekran"}
            </button>
          </div>
        </div>
        <div className="presentation-scene-strip">
          {presentationScenes.map((scene, idx) => (
            <button
              key={scene.id}
              className={presentationScene === idx ? "active" : ""}
              onClick={() => setPresentationScene(idx)}
            >
              {idx + 1}. {scene.title}
            </button>
          ))}
        </div>
        <div className="presentation-scene-card">
          <strong>{presentationScenes[presentationScene]?.title || "-"}</strong>
          <span>{presentationScenes[presentationScene]?.detail || "-"}</span>
          <small className="muted">Kisayiol: Sol/Sag ok sahne degistirir, Home/End atlar, Space sayaci ac/kapat, R sifirlar.</small>
          <div className="demo-actions">
            <button
              className="ghost"
              onClick={() => setPresentationScene((prev) => Math.max(0, prev - 1))}
              disabled={presentationScene <= 0}
            >
              Onceki sahne
            </button>
            <button
              className="ghost"
              onClick={() => presentationScenes[presentationScene]?.action?.()}
            >
              Sahneyi ac
            </button>
            <button
              className="primary"
              onClick={() => setPresentationScene((prev) => Math.min(presentationScenes.length - 1, prev + 1))}
              disabled={presentationScene >= presentationScenes.length - 1}
            >
              Sonraki sahne
            </button>
          </div>
        </div>
        <div className="investor-room-grid">
          {investorDataRoom.map((block) => (
            <article key={`presentation-room-${block.id}`} className="investor-room-card">
              <strong>{block.title}</strong>
              {block.points.map((point) => (
                <small key={point} className="muted">
                  • {point}
                </small>
              ))}
            </article>
          ))}
        </div>
        <div className="demo-actions">
          <button className="primary" onClick={runInvestorShowcase} disabled={demoFlowRunning || demoAutopilotRunning}>
            Canli vitrin calistir
          </button>
          <button className="ghost" onClick={runInvestorDryRun} disabled={demoFlowRunning || demoAutopilotRunning}>
            Dry-run
          </button>
          <button className="ghost" onClick={exportInvestorOnePager}>
            One-pager
          </button>
        </div>
      </section>
      ) : null}
      <section className={`tab-ribbon tab-${bottomTab}`}>
        <div>
          <strong>{tabRibbon.title}</strong>
          <p>{tabRibbon.desc}</p>
        </div>
        <div className="tab-ribbon-media" aria-hidden="true">
          <img src={TAB_HERO_VISUALS[bottomTab] || visualField} alt="" loading="lazy" />
        </div>
        <div className="tab-ribbon-actions">
          <button className={bottomTab === "home" ? "active" : ""} onClick={() => handleBottomTab("home")}>Teshis + Kilavuz</button>
          <button className={bottomTab === "weather" ? "active" : ""} onClick={() => handleBottomTab("weather")}>Iklim + Toprak</button>
          <button className={bottomTab === "land" ? "active" : ""} onClick={() => handleBottomTab("land")}>Arazi</button>
          <button className={bottomTab === "market" ? "active" : ""} onClick={() => handleBottomTab("market")}>Pazar</button>
        </div>
      </section>
      <section className={`showcase-panel tab-${bottomTab}`}>
        <div className="steps-header">
          <h2>
            {bottomTab === "home"
              ? "Akilli saha vitrini"
              : bottomTab === "weather"
                ? "Iklim + toprak vitrini"
              : bottomTab === "demos"
                ? "Demo kontrol vitrini"
                : bottomTab === "market"
                  ? "Pazar vitrini"
                  : "Arazi fiyat vitrini"}
          </h2>
          <p>
            {bottomTab === "home"
              ? "Analiz, hava ve operasyon sinyallerini daha gorsel bir duzende takip et."
              : bottomTab === "weather"
                ? "Hava, don riski, toprak profili ve harita baglantisini tek panelde yonet."
              : bottomTab === "demos"
                ? "Senaryolari hizli ac, smoke sonuclarini izle ve akislari tekrar kos."
                : bottomTab === "market"
                  ? "Ilanlar, teklifler ve pazar hareketlerini daha okunakli gor."
                  : "Arazi degeri ve butce risklerini tek bakista yonet."}
          </p>
        </div>
        <div className="showcase-grid">
          {showcaseCards.map((item) => {
            const Icon = item.icon;
            return (
          <article key={`showcase-${item.key}`} className={`showcase-card tone-${item.tone}`}>
                <div className={`showcase-art tone-${item.tone}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="showcase-top">
                  <span className="showcase-icon">
                    <Icon size={18} />
                  </span>
                  <strong>{item.title}</strong>
                </div>
                <div className="showcase-metric">{item.metric}</div>
                <p>{item.desc}</p>
              </article>
            );
          })}
        </div>
        <div className="showcase-scene-grid" aria-hidden="true">
          <article className={`scene-card scene-${bottomTab}`}>
            <img className="scene-bg-image" src={TAB_SCENE_VISUALS[bottomTab] || visualField} alt="" loading="lazy" />
            <div className="scene-overlay" />
            <div className="scene-content">
              <strong>
                {bottomTab === "market"
                  ? "Pazar hareketi"
                  : bottomTab === "weather"
                    ? "Iklim + toprak komuta paneli"
                  : bottomTab === "land"
                    ? "Arazi fiyat akisi"
                    : bottomTab === "demos"
                      ? "Demo laboratuvari"
                      : "Saha komuta merkezi"}
              </strong>
              <span>
                {bottomTab === "market"
                  ? "Ilan, teklif ve lojistik gorunum"
                  : bottomTab === "weather"
                    ? "Anlik hava, don riski, toprak ve saha panoramasi"
                  : bottomTab === "land"
                    ? "Bolge, ilce ve toprak etkili fiyat katmani"
                    : bottomTab === "demos"
                      ? "Smoke, autopilot ve akis senaryolari"
                      : "Teshis, hava, toprak ve aksiyon baglantisi"}
              </span>
            </div>
          </article>
          <article className={`scene-card scene-mini scene-${bottomTab}`}>
            <img className="scene-bg-image" src={TAB_HERO_VISUALS[bottomTab] || visualField} alt="" loading="lazy" />
            <div className="scene-overlay" />
            <div className="scene-content">
              <strong>Canli pano</strong>
              <span>Aktif sekmeye gore gorsel panel otomatik yenilenir.</span>
            </div>
          </article>
        </div>
        <div className="showcase-wall">
          {showcaseWallItems.map((item) => (
            <article key={`showcase-wall-${item.key}`} className={`showcase-wall-card tone-${item.tone}`}>
              <small>{item.subtitle}</small>
              <strong>{item.title}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
      </section>
      <div key={`tab-stage-${bottomTab}`} className="tab-stage">
      {bottomTab === "weather" ? (
        <section className="features market-quick-create">
          <div className="steps-header">
            <h2>Iklim + toprak hizli panel</h2>
            <p>Arazi/pazar gibi bu panelden dogrudan hava ve toprak modullerine gec.</p>
          </div>
          <div className="step-card tab-quick-head market-quick-head">
            <div className="weather-quick-main">
              <strong>{weatherLocationLabel}</strong>
              <small className="muted">{weatherFreshnessText}</small>
            </div>
            <div className="chip-row">
              <span className={`chip ${frostSignal.hasRisk ? "warning" : ""}`}>
                {frostSignal.hasRisk ? "Don riski: aktif" : "Don riski: dusuk"}
              </span>
              <span className="chip">
                Toprak: {soilReport?.soilType || "bekleniyor"} • pH {soilReport?.ph ?? "-"}
              </span>
            </div>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={() => setWeatherRefreshKey((prev) => prev + 1)}>
                Verileri yenile
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => document.getElementById("demo-weather")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Hava modulu
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => document.getElementById("demo-soil")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Toprak modulu
              </button>
            </div>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Sehir</span>
              <input
                list="location-city-suggestions"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                onBlur={applyCityQuery}
                placeholder={city || "Sehir sec"}
              />
            </label>
            <label className="plant-select">
              <span>Ilce</span>
              <input
                list="location-weather-district-suggestions"
                value={landDemo.district}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))}
                placeholder="Ilce sec"
              />
            </label>
            <label className="plant-select">
              <span>Mahalle</span>
              <input
                list="location-weather-neighborhood-suggestions"
                value={landDemo.neighborhood}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, neighborhood: e.target.value }))}
                placeholder="Mahalle sec"
              />
            </label>
          </div>
          <div className="field-grid-2">
            <label className="plant-select">
              <span>Koordinat</span>
              <input
                type="text"
                value={fieldLocation.coords}
                onChange={(e) => setFieldLocation((prev) => ({ ...prev, coords: e.target.value }))}
                placeholder="38.3511, 38.3095"
              />
            </label>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={useMyLocation}>
                Konumumu al
              </button>
              {mapLink ? (
                <a className="ghost-button" href={mapLink} target="_blank" rel="noreferrer">
                  Haritada ac
                </a>
              ) : null}
              <button type="button" className="ghost-button" onClick={() => setWeatherRefreshKey((prev) => prev + 1)}>
                Risk verisi al
              </button>
            </div>
          </div>
          {!coordsValid && fieldLocation.coords?.trim() ? (
            <small className="muted warning-text">Koordinat formati hatali. Ornek: 38.3511, 38.3095</small>
          ) : null}
          <div className="quick-kpi-strip">
            <div>
              <span>Don riski</span>
              <strong>{frostSignal.hasRisk ? "Aktif" : "Dusuk"}</strong>
            </div>
            <div>
              <span>Hava skoru</span>
              <strong>{weatherSummary?.score || 0}/100</strong>
            </div>
            <div>
              <span>Toprak skoru</span>
              <strong>{soilDiagnostics?.score || "-"}</strong>
            </div>
            <div>
              <span>Risk etiketi</span>
              <strong>{(weatherSummary?.riskTags || ["Normal"]).slice(0, 2).join(" • ")}</strong>
            </div>
          </div>
          <div className="chip-row">
            <span className="chip">Hava kaynak: {weather?.source || "-"}</span>
            <span className="chip">Toprak kaynak: {soilReport?.source || "-"}</span>
            <span className={`chip ${soilDiagnostics?.risk === "Yuksek" ? "warning" : ""}`}>
              Toprak risk: {soilDiagnostics?.risk || "-"}
            </span>
          </div>
        </section>
      ) : null}
      {bottomTab === "weather" ? (
        <section id="legacy-climate-inline" className="features">
          <div className="steps-header">
            <h2>Iklim altinda eski detayli hava + toprak modulu</h2>
            <p>Hava, don, saatlik tahmin, toprak profili, indeksler ve operasyon plani tek yerde.</p>
          </div>
          <div className="step-grid">
            <div className="step-card">
              <h3>Canli hava detaylari</h3>
              {weather ? (
                <>
                  <p>{weather.city || city} • {weather.condition || "-"}</p>
                  <p>
                    Sicaklik: {weather.temp ?? "-"}°C (min {weather.tempMin ?? "-"} / max {weather.tempMax ?? "-"})
                  </p>
                  <p>
                    Nem: {weather.humidity ?? "-"}% • Ruzgar: {weather.windKmh ?? "-"} km/sa
                    {Number.isFinite(weather.windGustKmh) ? ` • Esinti: ${weather.windGustKmh} km/sa` : ""}
                  </p>
                  <p>Yagis: {weather.precipitationMm ?? 0} mm</p>
                  <div className={`weather-alert ${frostSignal.hasRisk ? "danger" : "safe"}`}>
                    {frostSignal.hasRisk ? "Don riski aktif" : "Don riski dusuk"}
                  </div>
                  <div className="chip-row">
                    {(weatherSummary?.riskTags || ["Normal"]).map((tag) => (
                      <span key={`inline-risk-${tag}`} className={`chip ${tag !== "Normal" ? "warning" : ""}`}>{tag}</span>
                    ))}
                  </div>
                  {weatherSummary?.actions?.length ? (
                    <ul>
                      {weatherSummary.actions.slice(0, 4).map((item) => (
                        <li key={`inline-act-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p>Hava verisi yukleniyor...</p>
              )}
              {weatherError ? <small className="muted warning-text">{weatherError}</small> : null}
            </div>
            <div className="step-card">
              <h3>Saatlik + gunluk tahmin</h3>
              {forecast?.days?.length ? (
                <div className="forecast-list">
                  {forecast.days.map((item) => (
                    <div key={`inline-day-${item.day}`} className={`forecast-item ${item.frost ? "risk" : "ok"}`}>
                      <strong>{item.day}</strong>
                      <span>{item.min}°C / {item.max}°C</span>
                      <em>{item.condition}</em>
                      <span>{item.frost ? "Don riski" : "Normal"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Gunluk tahmin bekleniyor...</p>
              )}
              {nextHours.length ? (
                <div className="hourly-strip">
                  {nextHours.slice(0, 8).map((item) => (
                    <div key={`inline-hour-${item.time}`} className="hourly-chip">
                      <strong>{item.label}</strong>
                      <span>{item.temp ?? "-"}°C</span>
                      <em>{item.precipitationMm ?? 0} mm</em>
                    </div>
                  ))}
                </div>
              ) : null}
              {(weatherAlerts.length || hourlyAlerts.length) ? (
                <div className="weather-alerts">
                  {[...weatherAlerts, ...hourlyAlerts].slice(0, 6).map((alert) => (
                    <div key={`inline-alert-${alert.text}`} className={`alert ${alert.level}`}>
                      <AlertCircle size={14} />
                      <span>{alert.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="step-card">
              <h3>Toprak profili + indeks</h3>
              {soilReport ? (
                <>
                  <p>Tip: {soilReport.soilType || "-"}</p>
                  <p>pH: {soilReport.ph ?? "-"} • Organik: {soilReport.organic ?? "-"}</p>
                  <p>Kil: {soilReport.clay ?? "-"} • Kum: {soilReport.sand ?? "-"} • Silt: {soilReport.silt ?? "-"}</p>
                  <p>Azot: {soilReport.nitrogen ?? "-"} • CEC: {soilReport.cec ?? "-"}</p>
                  <div className="chip-row">
                    <span className="chip">Kaynak: {soilReport.source || "-"}</span>
                    {soilDiagnostics ? (
                      <span className={`chip ${soilDiagnostics.risk === "Yuksek" ? "warning" : ""}`}>
                        Skor: {soilDiagnostics.score}/100
                      </span>
                    ) : null}
                  </div>
                  {soilDiagnostics?.actions?.length ? (
                    <ul>
                      {soilDiagnostics.actions.slice(0, 4).map((item) => (
                        <li key={`inline-soil-action-${item}`}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p>Toprak verisi yukleniyor...</p>
              )}
              {soilError ? <small className="muted warning-text">{soilError}</small> : null}
            </div>
            <div className="step-card">
              <h3>Toprak haritasi + yonetim plani</h3>
              <p>Konum: {soilMapContext.label}</p>
              <div className="soil-map-links">
                <a className="chip" href={soilMapContext.google} target="_blank" rel="noreferrer">Google Harita</a>
                <a className="chip" href={soilMapContext.osm} target="_blank" rel="noreferrer">OpenStreetMap</a>
                {soilMapContext.wmsUrl ? (
                  <a className="chip" href={soilMapContext.wmsUrl} target="_blank" rel="noreferrer">TR Toprak WMS</a>
                ) : null}
              </div>
              {soilManagementPlan ? (
                <ul>
                  <li>Sulama: {soilManagementPlan.irrigation || "-"}</li>
                  <li>Besleme: {soilManagementPlan.nutrition || "-"}</li>
                  <li>Toprak isleme: {soilManagementPlan.tillage || "-"}</li>
                  <li>Sezon: {soilManagementPlan.season || "-"}</li>
                </ul>
              ) : (
                <p>Yonetim plani hesaplanamadi.</p>
              )}
              {soilSmartSuggestions.length ? (
                <div className="chip-row">
                  {soilSmartSuggestions.slice(0, 6).map((item) => (
                    <span key={`inline-suggest-${item}`} className="chip">{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {(bottomTab === "market" || (bottomTab === "demos" && isDemoVisible("market"))) ? (
        <section className="features market-quick-create">
          <div className="steps-header">
            <h2>Pazar hizli panel</h2>
            <p>Ilan gir, aninda yayinla ve ilan yonetimini bu panelden yap.</p>
          </div>
          <div className="step-card tab-quick-head market-quick-head">
            <div className="weather-quick-main">
              <strong>
                {[effectiveTradeCity, landDemo?.district, landDemo?.neighborhood].filter(Boolean).join(" / ") || "Pazar konumu secilmedi"}
              </strong>
              <small className="muted">
                {tradeDashboard?.updatedAt
                  ? `Son guncelleme: ${new Date(tradeDashboard.updatedAt).toLocaleTimeString("tr-TR")}`
                  : "Canli pazar verisi bekleniyor"}
              </small>
            </div>
            <div className="chip-row">
              <span className={`chip ${Number(tradeDashboard?.orders?.active || 0) > 0 ? "warning" : ""}`}>
                Aktif siparis: {Number(tradeDashboard?.orders?.active || tradeMyOrders.length || 0)}
              </span>
              <span className="chip">
                Spread: {Number((tradeDashboard?.market?.spread ?? tradeMarketDepth?.spread) || 0).toFixed(2)} TL
              </span>
            </div>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={() => loadTradeData()}>
                Pazar verisini yenile
              </button>
            </div>
          </div>
          <div className="quick-kpi-strip">
            <div>
              <span>Toplam ilan</span>
              <strong>{Number(tradeDashboard?.listings?.total ?? tradeListings.length)}</strong>
            </div>
            <div>
              <span>Yayinda ilan</span>
              <strong>{Number(tradeDashboard?.listings?.open ?? tradeListings.filter((x) => x.status === "open").length)}</strong>
            </div>
            <div>
              <span>Aktif siparis</span>
              <strong>{Number(tradeDashboard?.orders?.active ?? tradeMyOrders.length)}</strong>
            </div>
            <div>
              <span>Spread</span>
              <strong>{Number((tradeDashboard?.market?.spread ?? tradeMarketDepth?.spread) || 0).toFixed(2)} TL</strong>
            </div>
          </div>
          <div className="quick-panel-tabs">
            {[
              { id: "kesfet", label: "Kesfet" },
              { id: "ilanlarim", label: "Ilanlarim" },
              { id: "teklifler", label: "Teklifler" },
              { id: "siparisler", label: "Siparisler" }
            ].map((tab) => (
              <button
                key={`market-quick-tab-${tab.id}`}
                className={tradeWorkspaceTab === tab.id ? "active" : ""}
                onClick={() => setTradeWorkspaceTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Profil / iletisim</span>
              <input
                value={tradeIdentityName}
                onChange={(e) => setTradeIdentityName(e.target.value)}
                placeholder={effectiveTradeIdentity || "Uretici adi"}
              />
            </label>
            <label className="plant-select">
              <span>Sehir filtresi</span>
              <input
                list="location-city-suggestions"
                value={tradeQuery.city}
                onChange={(e) => setTradeQuery((prev) => ({ ...prev, city: e.target.value }))}
                placeholder={effectiveTradeCity}
              />
            </label>
            <label className="plant-select">
              <span>Urun filtresi</span>
              <input
                value={tradeQuery.crop}
                onChange={(e) => setTradeQuery((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveTradeCrop}
              />
            </label>
            <label className="plant-select">
              <span>Durum filtresi</span>
              <select value={tradeFilterStatus} onChange={(e) => setTradeFilterStatus(e.target.value)}>
                <option value="all">Tum durumlar</option>
                <option value="open">Yayinda</option>
                <option value="paused">Duraklatilmis</option>
                <option value="closed">Kapatilmis</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Metin ara</span>
              <input
                value={tradeFilterText}
                onChange={(e) => setTradeFilterText(e.target.value)}
                placeholder="Baslik, urun, ilce, iletisim"
              />
            </label>
            <label className="plant-select">
              <span>Islem filtresi</span>
              <select value={tradeFilterType} onChange={(e) => setTradeFilterType(e.target.value)}>
                <option value="all">Tum tipler</option>
                <option value="sell">Satilik</option>
                <option value="buy">Alim</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Siralama</span>
              <select value={tradeSortBy} onChange={(e) => setTradeSortBy(e.target.value)}>
                <option value="newest">En yeni</option>
                <option value="smart">Akilli skor</option>
                <option value="price_asc">Fiyat artan</option>
                <option value="price_desc">Fiyat azalan</option>
                <option value="qty_desc">Miktar azalan</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Min fiyat (TL/kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tradePriceMin}
                onChange={(e) => setTradePriceMin(e.target.value)}
              />
            </label>
            <label className="plant-select">
              <span>Max fiyat (TL/kg)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tradePriceMax}
                onChange={(e) => setTradePriceMax(e.target.value)}
              />
            </label>
            <label className="plant-select">
              <span>Satici filtresi</span>
              <select value={tradeSellerFilter} onChange={(e) => setTradeSellerFilter(e.target.value)}>
                <option value="all">Tum saticilar</option>
                {tradeSellerDirectory.map((seller) => (
                  <option key={`quick-seller-${seller.id}`} value={seller.id}>
                    {seller.name} ({seller.openCount})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Islem tipi</span>
              <select
                value={tradeListingForm.type}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="sell">Satilik</option>
                <option value="buy">Alim</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Ilan sehri</span>
                <input
                  list="location-city-suggestions"
                  value={tradeListingForm.city}
                  onChange={(e) => {
                    const value = String(e.target.value || "");
                    const canonicalCity = cityCanonicalByKey[normalizeKey(value)] || value;
                    setTradeListingForm((prev) => ({ ...prev, city: canonicalCity, district: "" }));
                  }}
                  placeholder={effectiveTradeCity}
                />
            </label>
            <label className="plant-select">
              <span>Ilan urunu</span>
              <input
                value={tradeListingForm.crop}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveTradeCrop}
              />
            </label>
          </div>
          <label className="plant-select">
            <span>Baslik</span>
            <input
              value={tradeListingForm.title}
              onChange={(e) => setTradeListingForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Orn: Malatya domates satilik"
            />
          </label>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Miktar (kg)</span>
              <input
                type="number"
                min="1"
                value={tradeListingForm.quantityKg}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Fiyat (TL/kg)</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={tradeListingForm.priceTlKg}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, priceTlKg: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Ilce</span>
              <input
                list="location-trade-district-suggestions"
                value={tradeListingForm.district}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, district: e.target.value }))}
                placeholder="Orn: Yesilyurt"
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Teslimat</span>
              <select
                value={tradeListingForm.deliveryType}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, deliveryType: e.target.value }))}
              >
                <option value="pickup">Teslim al</option>
                <option value="seller_delivery">Satici teslim</option>
                <option value="cargo">Kargo</option>
                <option value="broker">Komisyoncu</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Odeme</span>
              <select
                value={tradeListingForm.paymentType}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, paymentType: e.target.value }))}
              >
                <option value="transfer">Havale/EFT</option>
                <option value="cash">Nakit</option>
                <option value="term">Vade</option>
                <option value="escrow">Guvenli odeme</option>
                <option value="card">Kart</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Kalite</span>
              <select
                value={tradeListingForm.qualityGrade}
                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, qualityGrade: e.target.value }))}
              >
                <option value="premium">Premium</option>
                <option value="standard">Standart</option>
                <option value="mixed">Karisik</option>
                <option value="processing">Sanayi/isalma</option>
              </select>
            </label>
          </div>
          <div className="market-quick-actions">
            <button className="primary" onClick={submitTradeListing}>
              {tradeEditingListingId ? "Ilan guncelle" : "Ilan koy"}
            </button>
            {tradeEditingListingId ? (
              <button className="ghost" onClick={cancelTradeListingEdit}>
                Duzenlemeyi iptal et
              </button>
            ) : null}
            <button className="ghost" onClick={loadTradeData}>Pazari yenile</button>
            <button className="ghost" onClick={() => setTradeWorkspaceTab("ilanlarim")}>Ilanlarim</button>
            <button className="ghost" onClick={() => setTradeWorkspaceTab("teklifler")}>Teklifler</button>
            <button
              className="ghost"
              onClick={() =>
                setTradeListingForm((prev) => ({
                  ...prev,
                  priceTlKg: String(
                    Number(tradeSummary?.market?.sellMedianTlKg || tradeMarketDepth?.bestAsk || prev.priceTlKg || 0).toFixed(2)
                  )
                }))
              }
            >
              Medyan fiyati uygula
            </button>
          </div>
          <div className="market-quick-actions">
            <button className="ghost" onClick={() => setTradeSellerFilter(normalizeKey(effectiveTradeIdentity) || "all")}>
              Sadece benim ilanlarim
            </button>
            <button className="ghost" onClick={resetTradeFilters}>
              Filtreleri sifirla
            </button>
            <button
              className="ghost"
              onClick={() =>
                setTradeListingForm((prev) => ({
                  ...prev,
                  city: effectiveTradeCity,
                  crop: effectiveTradeCrop,
                  title: `${effectiveTradeCity} ${effectiveTradeCrop} ${prev.type === "buy" ? "alim" : "satilik"}`.trim()
                }))
              }
            >
              Formu akilli doldur
            </button>
          </div>
          <div className="market-filter-presets">
            <div className="market-filter-presets-head">
              <strong>Filtre presetleri</strong>
              <small className="muted">Sabit kombinasyonlari tek tikla uygula.</small>
            </div>
            <div className="market-filter-presets-form">
              <input
                value={tradeFilterPresetName}
                onChange={(e) => setTradeFilterPresetName(e.target.value)}
                placeholder="Orn: Malatya acik satilik"
              />
              <button className="ghost" onClick={saveTradeFilterPreset}>
                Kaydet
              </button>
            </div>
            {tradeFilterPresets.length ? (
              <div className="chip-row">
                {tradeFilterPresets.map((preset) => (
                  <span key={`quick-preset-${preset.id}`} className="chip chip-action">
                    <button
                      type="button"
                      className="chip-link"
                      onClick={() => applyTradeFilterSnapshot(preset)}
                    >
                      {preset.label}
                    </button>
                    <button
                      type="button"
                      className="chip-link danger"
                      onClick={() => deleteTradeFilterPreset(preset.id)}
                    >
                      Sil
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <small className="muted">Kayitli preset yok.</small>
            )}
          </div>
          <div className="quick-offer-box">
            <strong>Hizli teklif</strong>
            <div className="field-grid-3">
              <label className="plant-select">
                <span>Ilan</span>
                <select
                  value={tradeOfferForm.listingId}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, listingId: e.target.value }))}
                >
                  <option value="">Ilan sec</option>
                  {tradeFilteredListings.slice(0, 24).map((item) => (
                    <option key={`quick-offer-${item.id}`} value={item.id}>
                      {(item.title || item.id)} • {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                    </option>
                  ))}
                </select>
              </label>
              <label className="plant-select">
                <span>Alici</span>
                <input
                  value={tradeOfferForm.buyer}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, buyer: e.target.value }))}
                  placeholder={effectiveTradeIdentity || "Alici"}
                />
              </label>
              <label className="plant-select">
                <span>Teklif suresi (saat)</span>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={tradeOfferForm.expiryHours}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, expiryHours: e.target.value }))}
                />
              </label>
            </div>
            <div className="field-grid-2">
              <label className="plant-select">
                <span>Miktar (kg)</span>
                <input
                  type="number"
                  min="1"
                  value={tradeOfferForm.quantityKg}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Teklif (TL/kg)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={tradeOfferForm.offerPriceTlKg}
                  onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, offerPriceTlKg: e.target.value }))}
                />
              </label>
            </div>
            <div className="market-quick-actions">
              <button className="ghost" onClick={submitTradeOffer}>Teklif ver</button>
              {selectedTradeListing ? (
                <button
                  className="ghost"
                  onClick={() =>
                    setTradeOfferForm((prev) => ({
                      ...prev,
                      offerPriceTlKg: String(
                        Number(selectedTradeListing.priceTlKg || 0)
                          ? Number((Number(selectedTradeListing.priceTlKg || 0) * 0.98).toFixed(2))
                          : prev.offerPriceTlKg
                      )
                    }))
                  }
                >
                  Fiyati %2 kir
                </button>
              ) : null}
            </div>
          </div>
          {tradeStatus ? <small className="muted">{tradeStatus}</small> : null}
          {tradeFilteredStats ? (
            <div className="info-badges">
              <span className="badge">Sonuc: {tradeFilteredStats.count}</span>
              <span className="badge">Min: {Number(tradeFilteredStats.min).toFixed(2)} TL/kg</span>
              <span className="badge">Medyan: {Number(tradeFilteredStats.median).toFixed(2)} TL/kg</span>
              <span className="badge">Max: {Number(tradeFilteredStats.max).toFixed(2)} TL/kg</span>
            </div>
          ) : null}
          {tradeOpportunityHighlights.length ? (
            <div className="info-badges">
              {tradeOpportunityHighlights.map((row, idx) => (
                <button
                  key={`quick-opportunity-${row.item.id}`}
                  className="badge badge-button"
                  onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: row.item.id }))}
                >
                  #{idx + 1} {row.item.title || row.item.crop || row.item.id} • skor {row.score}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="marketplace-list">
            {tradeFilteredListings.slice(0, 12).map((item) => (
              <li key={`fast-market-${item.id}`}>
                <strong>{item.title || `${item.crop || "-"} ${item.type || ""}`}</strong>
                <span>
                  {item.status || "open"} • {item.city || "-"} {item.district || ""} •{" "}
                  {Number(item.priceTlKg || 0).toFixed(2)} TL/kg • {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                </span>
                <div className="demo-actions">
                  <button className="ghost" onClick={() => editTradeListing(item)}>Duzenle</button>
                  <button className="ghost" onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }))}>Teklif sec</button>
                  <button
                    className="ghost"
                    onClick={() => pauseOrOpenTradeListing(item.id, item.status === "paused" ? "open" : "paused")}
                  >
                    {item.status === "paused" ? "Yayina al" : "Duraklat"}
                  </button>
                  <button className="ghost" onClick={() => closeTradeListing(item.id)}>Kapat</button>
                  <button className="ghost" onClick={() => deleteTradeListing(item.id)}>Sil</button>
                </div>
              </li>
            ))}
            {!tradeFilteredListings.length ? <li className="muted">Filtreye uygun ilan yok.</li> : null}
          </ul>
          <div className="quick-mini-columns">
            <div className="quick-mini-card">
              <strong>Benim ilanlarim</strong>
              <ul className="marketplace-list">
                {tradeMyListings.slice(0, 3).map((item) => (
                  <li key={`quick-my-listing-${item.id}`}>
                    <strong>{item.title || item.id}</strong>
                    <span>{Number(item.priceTlKg || 0).toFixed(2)} TL/kg • {item.status}</span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => editTradeListing(item)}>Duzenle</button>
                      <button className="ghost" onClick={() => closeTradeListing(item.id)}>Kapat</button>
                    </div>
                  </li>
                ))}
                {!tradeMyListings.length ? <li className="muted">Size ait ilan yok.</li> : null}
              </ul>
            </div>
            <div className="quick-mini-card">
              <strong>Benim tekliflerim</strong>
              <ul className="marketplace-list">
                {tradeMyOffers.slice(0, 3).map((item) => (
                  <li key={`quick-my-offer-${item.id}`}>
                    <strong>{item.listingTitle || item.listingId || "Teklif"}</strong>
                    <span>
                      {Number(item.offerPriceTlKg || 0).toFixed(2)} TL/kg • {Number(item.quantityKg || 0).toLocaleString("tr-TR")} kg
                    </span>
                  </li>
                ))}
                {!tradeMyOffers.length ? <li className="muted">Size ait teklif yok.</li> : null}
              </ul>
            </div>
            <div className="quick-mini-card">
              <strong>Siparislerim</strong>
              <ul className="marketplace-list">
                {tradeMyOrders.slice(0, 3).map((order) => (
                  <li key={`quick-my-order-${order.id}`}>
                    <strong>{order.crop || "Urun"} • {order.status}</strong>
                    <span>{Number(order.totalTl || 0).toLocaleString("tr-TR")} TL • escrow {order.escrowStatus || "-"}</span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "in_transit")}>Kargoda</button>
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "delivered")}>Teslim</button>
                      <button className="ghost" onClick={() => updateTradeOrder(order.id, "completed", "released")}>Tamamla</button>
                    </div>
                  </li>
                ))}
                {!tradeMyOrders.length ? <li className="muted">Size ait siparis yok.</li> : null}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {(bottomTab === "land" || (bottomTab === "demos" && isDemoVisible("land"))) ? (
        <section className="features market-quick-create">
          <div className="steps-header">
            <h2>Arazi hizli panel</h2>
            <p>Sehir/ilce/mahalle, toprak ve erisim degerlerini gir; model degeri aninda gunceller.</p>
          </div>
          <div className="step-card tab-quick-head land-quick-head">
            <div className="weather-quick-main">
              <strong>
                {[effectiveLandCity, landDemo?.district, landDemo?.neighborhood].filter(Boolean).join(" / ") || "Arazi konumu secilmedi"}
              </strong>
              <small className="muted">
                {landPriceData?.updatedAt
                  ? `Son guncelleme: ${new Date(landPriceData.updatedAt).toLocaleTimeString("tr-TR")}`
                  : "Arazi fiyat verisi bekleniyor"}
              </small>
            </div>
            <div className="chip-row">
              <span className={`chip ${Number((landMlData?.confidenceScore || landPriceData?.confidenceScore || 0) * 100) < 60 ? "warning" : ""}`}>
                Model guven: %{Math.round(Number((landMlData?.confidenceScore || landPriceData?.confidenceScore || 0) * 100))}
              </span>
              <span className="chip">
                Yatirim: {landPriceData?.decisionSignals?.grade || "-"}
              </span>
            </div>
            <div className="demo-actions">
              <button type="button" className="ghost-button" onClick={() => setLandRefreshKey((prev) => prev + 1)}>
                Arazi verisini yenile
              </button>
            </div>
          </div>
          <div className="quick-kpi-strip">
            <div>
              <span>Birim fiyat</span>
              <strong>{Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da</strong>
            </div>
            <div>
              <span>Tahmini toplam</span>
              <strong>{Number(landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</strong>
            </div>
            <div>
              <span>Model guven</span>
              <strong>%{Math.round(Number((landMlData?.confidenceScore || 0) * 100))}</strong>
            </div>
            <div>
              <span>Profil sayisi</span>
              <strong>{landProfiles.length}</strong>
            </div>
          </div>
          <div className="info-badges">
            <span className={`badge ${landDataReadiness.score >= 75 ? "safe" : "warn"}`}>
              Veri hazirlik: {landDataReadiness.score}/100
            </span>
            <span className="badge">
              Dolu alan: {landDataReadiness.hit}/{landDataReadiness.total}
            </span>
            {landDataReadiness.missing.length ? (
              <span className="badge">Eksik: {landDataReadiness.missing.join(", ")}</span>
            ) : (
              <span className="badge">Tum temel alanlar dolu</span>
            )}
          </div>
          <div className="quick-panel-tabs">
            <button onClick={() => setLandDemo((prev) => ({ ...prev, district: "", neighborhood: "" }))}>
              Konumu temizle
            </button>
            <button
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  district: landDistrictLeaders?.high?.district || prev.district
                }))
              }
            >
              Ust ilceyi sec
            </button>
            <button
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  district: landDistrictLeaders?.low?.district || prev.district
                }))
              }
            >
              Dusuk ilceyi sec
            </button>
            <button onClick={() => landProfiles[0] && applyLandProfile(landProfiles[0])}>Son profili uygula</button>
          </div>
          <div className="location-search-box">
            <label className="plant-select">
              <span>Konum arama (il / ilce / mahalle)</span>
              <input
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="M yaz: Malatya, Mersin, Merkez..."
              />
            </label>
            {locationSearchMatches.length ? (
              <div className="location-search-hits">
                {locationSearchMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ghost ${item.type}`}
                    onClick={() => applyLocationSearchHit(item)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Sehir</span>
              <input
                list="location-city-suggestions"
                value={landQuery.city}
                onChange={(e) => handleLandCityInputChange(e.target.value)}
                placeholder={effectiveLandCity}
              />
            </label>
            <label className="plant-select">
              <span>Urun</span>
              <input
                value={landQuery.crop}
                onChange={(e) => setLandQuery((prev) => ({ ...prev, crop: e.target.value }))}
                placeholder={effectiveLandCrop}
              />
            </label>
            <label className="plant-select">
              <span>Koordinat</span>
              <input
                value={fieldLocation.coords}
                placeholder="38.355, 38.309"
                onChange={(e) => setFieldLocation((prev) => ({ ...prev, coords: e.target.value }))}
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Ilce</span>
                  <input
                    list="location-land-district-suggestions"
                    value={landDemo.district}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))}
                  />
            </label>
            <label className="plant-select">
              <span>Mahalle</span>
              <input
                list="location-land-neighborhood-suggestions"
                value={landDemo.neighborhood}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, neighborhood: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Alan (da)</span>
              <input
                type="number"
                min="0"
                value={landDemo.areaDa}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, areaDa: e.target.value }))}
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Egim (%)</span>
              <input
                type="number"
                min="0"
                max="40"
                value={landDemo.slopePct}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, slopePct: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Sulama</span>
              <select
                value={landDemo.irrigation}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, irrigation: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Yol erisimi</span>
              <select
                value={landDemo.roadAccess}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadAccess: e.target.value }))}
              >
                <option value="iyi">Iyi</option>
                <option value="orta">Orta</option>
                <option value="zayif">Zayif</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Yola uzaklik (m)</span>
              <input
                type="number"
                min="0"
                step="10"
                value={landDemo.roadDistanceM}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadDistanceM: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Yol gecisi</span>
              <select
                value={landDemo.roadPass}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, roadPass: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Imar durumu</span>
              <select
                value={landDemo.zoningStatus}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, zoningStatus: e.target.value }))}
              >
                <option value="var">Var</option>
                <option value="kismi">Kismi</option>
                <option value="yok">Yok</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Arazide yapi</span>
              <select
                value={landDemo.structureStatus}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, structureStatus: e.target.value }))}
              >
                <option value="yok">Yok</option>
                <option value="var">Var</option>
              </select>
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Bolge tipi</span>
              <select
                value={landDemo.zone}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, zone: e.target.value }))}
              >
                <option value="ova">Ova</option>
                <option value="gecis">Gecis</option>
                <option value="yamac">Yamac</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Toprak skoru</span>
              <input
                type="number"
                min="0"
                max="100"
                value={landDemo.soilScore}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, soilScore: e.target.value }))}
              />
            </label>
            <label className="plant-select">
              <span>Profil adi</span>
              <input
                value={landProfileName}
                onChange={(e) => setLandProfileName(e.target.value)}
                placeholder="Orn: Yesilyurt 20da"
              />
            </label>
          </div>
          <div className="field-grid-3">
            <label className="plant-select">
              <span>Parsel durumu</span>
              <select
                value={landDemo.plantedStatus}
                onChange={(e) =>
                  setLandDemo((prev) => ({
                    ...prev,
                    plantedStatus: e.target.value,
                    plantedCrop: e.target.value === "ekili" ? prev.plantedCrop : "",
                    plantedValueTlDa: e.target.value === "ekili" ? prev.plantedValueTlDa : 0
                  }))
                }
              >
                <option value="bos">Bos</option>
                <option value="ekili">Ekili</option>
              </select>
            </label>
            <label className="plant-select">
              <span>Ekili urun</span>
              <input
                value={landDemo.plantedCrop}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedCrop: e.target.value }))}
                placeholder="Orn: domates"
                disabled={landDemo.plantedStatus !== "ekili"}
              />
            </label>
            <label className="plant-select">
              <span>Urun degeri (TL/da)</span>
              <input
                type="number"
                min="0"
                step="100"
                value={landDemo.plantedValueTlDa}
                onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedValueTlDa: e.target.value }))}
                disabled={landDemo.plantedStatus !== "ekili"}
              />
            </label>
          </div>
          <div className="market-quick-actions">
            <button className="primary" onClick={saveCurrentLandProfile}>Profili kaydet</button>
            <button className="ghost" onClick={applyLandFromSoilSignals}>
              Topraktan otomatik doldur
            </button>
            <button className="ghost" onClick={() => trainCustomLandPriceModel({ prefetch: true })}>
              Veriyi cek + modeli guncelle
            </button>
            <button className="ghost" onClick={resetLandDemoListings}>Arazi reset</button>
          </div>
          <div className="market-quick-actions">
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "ova",
                  irrigation: "var",
                  roadAccess: "iyi",
                  roadDistanceM: 120,
                  roadPass: "var",
                  zoningStatus: "kismi",
                  structureStatus: "var",
                  slopePct: 2,
                  soilScore: 84,
                  plantedStatus: "ekili",
                  plantedCrop: effectiveLandCrop || "domates",
                  plantedValueTlDa: 24000
                }))
              }
            >
              Senaryo: verimli ova
            </button>
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "gecis",
                  irrigation: "var",
                  roadAccess: "orta",
                  roadDistanceM: 480,
                  roadPass: "var",
                  zoningStatus: "yok",
                  structureStatus: "yok",
                  slopePct: 6,
                  soilScore: 70,
                  plantedStatus: "ekili",
                  plantedCrop: effectiveLandCrop || "domates",
                  plantedValueTlDa: 14500
                }))
              }
            >
              Senaryo: dengeli arazi
            </button>
            <button
              className="ghost"
              onClick={() =>
                setLandDemo((prev) => ({
                  ...prev,
                  zone: "yamac",
                  irrigation: "yok",
                  roadAccess: "zayif",
                  roadDistanceM: 2200,
                  roadPass: "yok",
                  zoningStatus: "yok",
                  structureStatus: "yok",
                  slopePct: 14,
                  soilScore: 56,
                  plantedStatus: "bos",
                  plantedCrop: "",
                  plantedValueTlDa: 0
                }))
              }
            >
              Senaryo: riskli arazi
            </button>
          </div>
          <div className="market-quick-actions">
            <button className="ghost" onClick={() => setEconLandValue(Number(landValuationDemo?.min || 0))}>
              Temkinli fiyat uygula
            </button>
            <button className="ghost" onClick={() => setEconLandValue(Number(landPriceData?.priceTlDa || 0))}>
              Baz fiyat uygula
            </button>
            <button className="ghost" onClick={() => setEconLandValue(Number(landValuationDemo?.max || 0))}>
              Agresif fiyat uygula
            </button>
            {landMlData?.unitPriceTlDa ? (
              <button className="ghost" onClick={() => setEconLandValue(Number(landMlData.unitPriceTlDa || 0))}>
                ML fiyatini uygula
              </button>
            ) : null}
          </div>
          {landProfileStatus ? <small className="muted">{landProfileStatus}</small> : null}
          {landMlLoading ? <small className="muted">ML modeli egitiliyor...</small> : null}
          {landMlError ? <small className="muted warning-text">{landMlError}</small> : null}
          <div className="info-badges">
            <span className="badge">Birim: {Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da</span>
            <span className="badge">Toplam: {Number(landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</span>
            {landValuationDemo?.planted ? (
              <span className="badge">Ekili urun: {Number(landValuationDemo?.plantedTotal || 0).toLocaleString("tr-TR")} TL</span>
            ) : null}
            <span className="badge">Toplam varlik: {Number(landValuationDemo?.totalWithCrop || landValuationDemo?.total || 0).toLocaleString("tr-TR")} TL</span>
            <span className="badge">Aralik: {Number(landValuationDemo?.min || 0).toLocaleString("tr-TR")} - {Number(landValuationDemo?.max || 0).toLocaleString("tr-TR")} TL/da</span>
          </div>
          {landDistrictBenchmark ? (
            <div className="info-badges">
              {landDistrictBenchmark.neighborhoodMedian ? (
                <span className="badge">Mahalle medyan: {Number(landDistrictBenchmark.neighborhoodMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
              {landDistrictBenchmark.districtMedian ? (
                <span className="badge">Ilce medyan: {Number(landDistrictBenchmark.districtMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
              {landDistrictBenchmark.cityMedian ? (
                <span className="badge">Il medyan: {Number(landDistrictBenchmark.cityMedian).toLocaleString("tr-TR")} TL/da</span>
              ) : null}
            </div>
          ) : null}
          <div className="info-badges">
            {Number.isFinite(Number(landInvestmentLens.annualNetPerDa)) ? (
              <span className="badge">Yillik net/da: {Number(landInvestmentLens.annualNetPerDa).toLocaleString("tr-TR")} TL</span>
            ) : null}
            {landInvestmentLens.paybackYears ? (
              <span className="badge">Geri donus: {Number(landInvestmentLens.paybackYears).toFixed(1)} yil</span>
            ) : null}
            {landMlData?.training?.sampleCount ? (
              <span className="badge">ML ornek: {landMlData.training.sampleCount}</span>
            ) : null}
            {landMlData?.preferredModel ? (
              <span className="badge">Aktif model: {landMlData.preferredModel}</span>
            ) : null}
          </div>
          {landActionPlan ? (
            <div className="info-badges">
              <span className={`badge ${landActionPlan.score >= 70 ? "safe" : "warn"}`}>Karar skoru: {landActionPlan.score}/100</span>
              <span className="badge">Belirsizlik: %{landActionPlan.uncertainty}</span>
              <span className="badge">Strateji: {landActionPlan.strategy}</span>
            </div>
          ) : null}
          {landLocationScope ? (
            <div className="info-badges">
              <span className="badge">Piyasa konumu: {landLocationScope.position}</span>
              <span className="badge">Mahalle sirasi: {landLocationScope.neighborhoodRank}</span>
              <span className="badge">Ilce sirasi: {landLocationScope.districtRank}</span>
              <span className="badge">Guven: %{landSignalQuality.confidencePct}</span>
            </div>
          ) : null}
          <div className="land-comparable-panel">
            <div className="land-comparable-head">
              <strong>Emsal ilan girisi + hizli uygulama</strong>
              <small className="muted">Bu alanla ilce/mahalle bazli emsal veriyi arazi modeline direkt bagla.</small>
            </div>
            <div className="field-grid-3">
              <label className="plant-select">
                <span>Ilce</span>
                <input
                  list="location-manual-district-suggestions"
                  value={manualListingForm.district}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, district: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Mahalle</span>
                <input
                  list="location-manual-neighborhood-suggestions"
                  value={manualListingForm.neighborhood}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, neighborhood: e.target.value }))}
                />
              </label>
              <label className="plant-select">
                <span>Fiyat (TL/da)</span>
                <input
                  type="number"
                  min="0"
                  value={manualListingForm.priceTlDa}
                  onChange={(e) => setManualListingForm((prev) => ({ ...prev, priceTlDa: e.target.value }))}
                />
              </label>
            </div>
            <label className="plant-select">
              <span>Ilan basligi</span>
              <input
                value={manualListingForm.title}
                onChange={(e) => setManualListingForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Orn: Yesilyurt satilik tarla"
              />
            </label>
            <div className="market-quick-actions">
              <button className="ghost" onClick={saveManualListing}>
                Ilan ekle
              </button>
              <button className="ghost" onClick={loadLiveLandListings}>
                Canli ilan cek
              </button>
              <button className="ghost" onClick={loadManualListings}>
                Emsal listeyi yenile
              </button>
            </div>
            {manualListingStatus ? <small className="muted">{manualListingStatus}</small> : null}
            {manualListingStats ? (
              <div className="info-badges">
                <span className="badge">Ilan: {manualListingStats.count}</span>
                <span className="badge">Medyan: {manualListingStats.median.toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Min/Max: {manualListingStats.min.toLocaleString("tr-TR")} / {manualListingStats.max.toLocaleString("tr-TR")}</span>
                <span className="badge">7 gun: %{manualListingStats.weeklyChangePct}</span>
              </div>
            ) : null}
            {landComparableListings.length ? (
              <ul className="marketplace-list">
                {landComparableListings.map((row) => (
                  <li key={`land-comparable-${row.item.id}`}>
                    <strong>{row.item.title || `${row.item.city || "-"} ${row.item.district || ""} ${row.item.neighborhood || ""}`}</strong>
                    <span>
                      {Number(row.item.priceTlDa || 0).toLocaleString("tr-TR")} TL/da • skor {row.score} • {row.item.source || "manual"}
                    </span>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => applyManualListingToLand(row.item)}>Uygula</button>
                      <button className="ghost" onClick={() => setEconLandValue(Number(row.item.priceTlDa || 0))}>Fiyati uygula</button>
                      <button className="ghost" onClick={() => removeManualListing(row.item.id)}>Sil</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <small className="muted">Bu konuma uygun emsal ilan bulunamadi.</small>
            )}
          </div>
          {(landDistrictLeaders?.high || landDistrictLeaders?.low) ? (
            <div className="market-quick-actions">
              {landDistrictLeaders?.high ? (
                <button
                  className="ghost"
                  onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.high.district, neighborhood: "" }))}
                >
                  Ust ilceyi sec: {landDistrictLeaders.high.district}
                </button>
              ) : null}
              {landDistrictLeaders?.low ? (
                <button
                  className="ghost"
                  onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.low.district, neighborhood: "" }))}
                >
                  Dusuk ilceyi sec: {landDistrictLeaders.low.district}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="quick-mini-columns">
            <div className="quick-mini-card">
              <strong>Deger karsilastirma</strong>
              <div className="info-badges">
                <span className="badge">Min: {Number(landValuationDemo?.min || 0).toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Baz: {Number(landValuationDemo?.unitPrice || 0).toLocaleString("tr-TR")} TL/da</span>
                <span className="badge">Max: {Number(landValuationDemo?.max || 0).toLocaleString("tr-TR")} TL/da</span>
                {landMlData?.unitPriceTlDa ? (
                  <span className="badge">ML: {Number(landMlData.unitPriceTlDa || 0).toLocaleString("tr-TR")} TL/da</span>
                ) : null}
              </div>
            </div>
            <div className="quick-mini-card">
              <strong>Konum skoru</strong>
              <div className="info-badges">
                <span className={`badge ${landSignalQuality.score >= 70 ? "safe" : "warn"}`}>
                  Skor: {landSignalQuality.score}/100
                </span>
                <span className="badge">Geo komsu: {landSignalQuality.geoCount}</span>
                <span className="badge">Ort mesafe: {Number(landSignalQuality.avgKm || 0).toFixed(1)} km</span>
              </div>
            </div>
            <div className="quick-mini-card">
              <strong>Emsal farki</strong>
              <div className="info-badges">
                {landDistrictBenchmark?.districtMedian ? (
                  <span className={`badge ${Number(landDistrictBenchmark.deltaPct || 0) <= 12 ? "safe" : "warn"}`}>
                    Ilce medyana fark: %{Number(landDistrictBenchmark.deltaPct || 0).toFixed(1)}
                  </span>
                ) : null}
                <span className="badge">Ilce: {landDemo.district || "-"}</span>
                <span className="badge">Mahalle: {landDemo.neighborhood || "-"}</span>
              </div>
            </div>
          </div>
          {landProfiles.length ? (
            <ul className="marketplace-list">
              {landProfiles.slice(0, 8).map((profile) => (
                <li key={`land-profile-quick-${profile.id}`}>
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.city || "-"} • {profile.crop || "-"} • {Number(profile?.landDemo?.areaDa || 0)} da
                  </span>
                  <div className="demo-actions">
                    <button className="ghost" onClick={() => applyLandProfile(profile)}>Uygula</button>
                    <button className="ghost" onClick={() => deleteLandProfile(profile.id)}>Sil</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <small className="muted">Kayitli arazi profili yok.</small>
          )}
        </section>
      ) : null}

      {bottomTab === "home" && (
      <>

      {activeTab === "handbook" && (
        <section className="handbook-page">
          <div className="handbook-hero">
            <div>
              <h2>Tarim El Kilavuzu</h2>
              <p>
                Tarla yonetimi, sulama, besleme, hastalik onleme ve hasat
                surecleri icin sahada uygulanabilir adimlar. Arama kutusuyla
                belirti, hastalik veya uygulama basligi bulun.
              </p>
              <p className="muted">
                Not: Bu bolum sahada uygulanabilir IPM prensipleri ve hastalik siniflandirmasina gore
                duzenlenmistir.
              </p>
              <div className="handbook-stats">
                <span className="handbook-stat">
                  {handbookStats.sectionCount} bolum
                </span>
                <span className="handbook-stat">
                  {handbookStats.itemCount} madde
                </span>
                <span className="handbook-stat">
                  Arastirma guncel: {sourcesUpdatedAt || "hazirlaniyor"}
                </span>
              </div>
            </div>
            <div className="search-row">
              <div className="search-input">
                <input
                  type="text"
                  value={handbookQuery}
                  onChange={(event) => setHandbookQuery(event.target.value)}
                  placeholder="Kilavuzda ara (ornegin: sari yaprak, damla sulama)"
                />
                {handbookQuery && (
                  <button
                    type="button"
                    className="clear-button"
                    onClick={() => setHandbookQuery("")}
                  >
                    Temizle
                  </button>
                )}
              </div>
              <details className="accordion compact">
                <summary>Filtreler</summary>
                <div className="chip-row handbook-focus">
                  {[
                    { key: "all", label: "Hepsi" },
                    { key: "diagnosis", label: "Teshis & IPM" },
                    { key: "irrigation", label: "Sulama" },
                    { key: "compliance", label: "Uygunluk" },
                    { key: "greenhouse", label: "Sera" }
                  ].map((item) => (
                    <button
                      key={item.key}
                      className={`chip ${handbookFocus === item.key ? "active" : ""}`}
                      onClick={() => setHandbookFocus(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <select
                  value={handbookCategory}
                  onChange={(event) => setHandbookCategory(event.target.value)}
                >
                  <option value="all">Tum basliklar</option>
                  <option value="tarla">Tarla yonetimi</option>
                  <option value="sulama">Sulama</option>
                  <option value="kimyasal-zamanlama">Kimyasal zamanlama</option>
                  <option value="izleme-esik">Izleme / esik</option>
                  <option value="sertifikasyon-kayit">Sertifikasyon</option>
                  <option value="hastalik-siniflari">Hastalik siniflari</option>
                  <option value="belirti-sozlugu">Belirti sozlugu</option>
                  <option value="ipm-cekirdek">IPM cekirdek</option>
                  <option value="ipm-etl">IPM ETL</option>
                  <option value="kayit-sablon">Kayit sablonu</option>
                  <option value="dataset-notu">PlantVillage notu</option>
                  <option value="dataset-kaynaklari">Veri kaynaklari</option>
                  <option value="saha-uyari">Saha uyarilari</option>
                  <option value="saha-gercekleri">Saha gercekleri</option>
                </select>
                <small className="muted">
                  Ornek: kulleme, azot eksikligi, dusuk nem • {handbookStats.sectionCount} bolum /{" "}
                  {handbookStats.itemCount} madde
                </small>
              </details>
            </div>
            {researchHighlights.length ? (
              <div className="research-strip">
                <div>
                  <strong>Arastirma notlari</strong>
                  <span className="muted">
                    En guncel kaynak ozeti • {sourcesUpdatedAt || "guncelleniyor"}
                  </span>
                </div>
                <div className="research-list">
                  {researchHighlights.map((item) => (
                    <a
                      key={item.title}
                      className="research-card"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{item.category}</span>
                      <strong>{item.title}</strong>
                      <em>{item.summary}</em>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="handbook-section">
            <h3>TarimAsistan platform modulleri</h3>
            <div className="pro-grid">
              {platformModules.map((item) => (
                <div key={item.title} className="pro-card">
                  <div className="pro-tag">{item.tag}</div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="handbook-section">
            <h3>GAP Hassas uyum katmani</h3>
            <p className="muted">
              Resmi platformdaki basliklarla uyumlu olacak sekilde saha izleme, kayit ve karar destek akislari
              bu bolume tasindi.
            </p>
            <div className="source-grid">
              {gapHassasModules.map((item) => (
                <div key={item.title} className="source-card">
                  <div className="source-meta">
                    <strong>{item.title}</strong>
                    <span>GAP Hassas uyum</span>
                  </div>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="source-grid">
              {gapHassasLinks.map((item) => (
                <div key={item.url} className="source-card">
                  <div className="source-meta">
                    <strong>{item.title}</strong>
                    <span>Resmi baglanti</span>
                  </div>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Baglantiyi ac
                  </a>
                </div>
              ))}
            </div>
          </div>
          <div className="handbook-grid">
            <div className="handbook-section">
              <h3>Temel saha rehberleri</h3>
              <div className="step-grid">
                {visibleHandbookSections.map((section) => (
                  <div key={section.id} className="step-card">
                    <h3>{section.title}</h3>
                    <ul>
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {item.link && (
                        <em>
                          <a href={item.link} target="_blank" rel="noreferrer">
                            Kaynak
                          </a>
                        </em>
                      )}
                    </li>
                  ))}
                    </ul>
                  </div>
                ))}
              </div>
              {filteredHandbook.length > 3 && (
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setShowAllHandbook((prev) => !prev)}
                >
                  {showAllHandbook ? "Daha az goster" : "Tum bolumleri goster"}
                </button>
              )}
            </div>
            <div id="knowledge-bank" className="handbook-section">
              <h3>Bilgi bankasi</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Bitki ansiklopedisi</h3>
                  <ul>
                    {cropEncyclopedia.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.desc || item.focus || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hastalik kutuphanesi</h3>
                  <ul>
                    {diseaseLibrary.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail || item.signs || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Bakim protokolleri</h3>
                  <ul>
                    {careProtocols.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail || (item.steps ? item.steps.join(" • ") : "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Terimler sozlugu</h3>
                  <ul>
                    {glossary.map((item) => (
                      <li key={item.term}>
                        <strong>{item.term}</strong>
                        <span>{item.meaning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="handbook-section">
              <h3>Isletme destek paketleri</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Tohumdan yetistirme</h3>
                  <ul>
                    {seedStartGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sera rehberi</h3>
                  <ul>
                    {greenhouseTips.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hasat sonrasi</h3>
                  <ul>
                    {postHarvest.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Organik uygulamalar</h3>
                  <ul>
                    {organicPractices.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="handbook-section">
              <h3>Teknik kutuphanesi</h3>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Belirti sozlugu</h3>
                  <ul>
                    {symptomDictionary
                      .filter((item) =>
                        `${item.name} ${item.causes}`.toLowerCase().includes(handbookQuery.toLowerCase())
                      )
                      .map((item) => (
                        <li key={item.name}>
                          <strong>{item.title || item.name}</strong>
                          <span>{item.causes}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Besin eksikligi rehberi</h3>
                  <ul>
                    {nutrientGuide.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.sign}</span>
                        <em>{item.fix}</em>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Zararli rehberi</h3>
                  <ul>
                    {pestGuide.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail || item.sign || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sulama ipuclari</h3>
                  <ul>
                    {irrigationTips.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Toprak tipleri</h3>
                  <ul>
                    {soilTypes.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Ilac guvenligi</h3>
                  <ul>
                    {safetyNotes.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Rotasyon rehberi</h3>
                  <ul>
                    {rotationGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Gubreleme takvimi</h3>
                  <ul>
                    {fertilizerSchedule.map((item) => (
                      <li key={item.stage}>
                        <strong>{item.stage}</strong>
                        <span>{item.detail || item.action || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sulama yontemleri</h3>
                  <ul>
                    {irrigationMethods.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Toprak testleri</h3>
                  <ul>
                    {soilTesting.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Zararli dongusu</h3>
                  <ul>
                    {pestLifecycle.map((item) => (
                      <li key={item.name}>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sera riskleri</h3>
                  <ul>
                    {greenhouseRisks.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hasat rehberi</h3>
                  <ul>
                    {harvestGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Mevsim plani</h3>
                  <ul>
                    {seasonalPlanner.map((item) => (
                      <li key={item.month}>
                        <strong>{item.season || item.month}</strong>
                        <span>{item.focus || (item.tasks ? item.tasks.join(" • ") : "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hava durumu aksiyonlari</h3>
                  <ul>
                    {weatherActions.map((item) => (
                      <li key={item.condition}>
                        <strong>{item.condition}</strong>
                        <span>{item.detail || item.action || ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Hastalik onleme</h3>
                  <ul>
                    {diseasePrevention.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Yaygin hatalar</h3>
                  <ul>
                    {commonMistakes.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Depolama rehberi</h3>
                  <ul>
                    {storageGuide.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Entegre zararli yonetimi</h3>
                  <ul>
                    {ipmSteps.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Tohum saklama</h3>
                  <ul>
                    {seedSaving.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Sorun giderme</h3>
                  <ul>
                    {troubleshooting.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="step-card">
                  <h3>Kucuk ciftci kontrol listesi</h3>
                  <ul>
                    {farmerChecklists.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="steps-header">
            <h2>Kaynaklar ve referanslar</h2>
            <p>Guvenilir kurum ve veri tabanlarindan derlenmis kaynak listesi.</p>
          </div>
          <div className="research-strip">
            <div>
              <strong>Arastirma ozeti</strong>
              <p>
                {sourceStats.total} kaynak • {sourceStats.categories} kategori •{" "}
                {sourceStats.handbookCount} kilavuz maddesi
              </p>
            </div>
            <span>
              {sourcesUpdatedAt
                ? `Guncelleme: ${new Date(sourcesUpdatedAt).toLocaleDateString("tr-TR")}`
                : "Guncelleme: -"}
            </span>
          </div>
          <details className="accordion">
            <summary>Kaynaklar ve referanslar</summary>
            <div className="source-controls">
              <input
                type="text"
                value={sourceQuery}
                onChange={(event) => setSourceQuery(event.target.value)}
                placeholder="Kaynak ara (ornegin: IPM, FAO, EPPO)"
              />
              <select
                value={sourceCategory}
                onChange={(event) => setSourceCategory(event.target.value)}
              >
                {sourceCategories.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Tum kategoriler" : item}
                  </option>
                ))}
              </select>
            </div>
            <div className="source-grid">
              {filteredSources.map((item) => (
                <div key={item.title} className="source-card">
                  <div className="source-meta">
                    <strong>{item.title}</strong>
                    <span>{item.category}</span>
                  </div>
                  <p>{item.summary}</p>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Kaynagi ac
                  </a>
                </div>
              ))}
              {!filteredSources.length && !sourcesError && <p>Kaynak bulunamadi.</p>}
              {!sources.length && !sourcesError && <p>Kaynaklar yukleniyor...</p>}
              {sourcesError && <p className="muted">{sourcesError}</p>}
            </div>
          </details>

          <details className="accordion">
            <summary>Tarim haberleri</summary>
            <div className="demo-actions" style={{ marginBottom: 8 }}>
              <button className="ghost" onClick={() => loadNews(true)}>
                Haberleri yenile
              </button>
              <small className="muted">Otomatik guncelleme: 3 dakika</small>
            </div>
            <div className="source-grid">
              {newsItems.slice(0, 10).map((item) => (
                <div key={`${item.link}-${item.title}`} className="source-card">
                  <div className="source-meta">
                    <strong>{item.title}</strong>
                    <span>{item.feedTitle || item.feedId || "Haber"}</span>
                  </div>
                  <p>{item.description || "Ozet mevcut degil."}</p>
                  <small className="muted">
                    {item.pubDate ? new Date(item.pubDate).toLocaleString("tr-TR") : "Tarih yok"}
                  </small>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    Haberi ac
                  </a>
                </div>
              ))}
              {!newsItems.length && !newsError && <p>Haberler yukleniyor...</p>}
              {newsLoading && <p className="muted">Guncel haberler aliniyor...</p>}
              {newsError && <p className="muted">{newsError}</p>}
            </div>
            <small className="muted">
              {newsUpdatedAt
                ? `Haber guncelleme: ${new Date(newsUpdatedAt).toLocaleString("tr-TR")}`
              : "Haber guncelleme: -"}
            </small>
          </details>

          <details className="accordion">
            <summary>Tarim Bilgi Bankasi</summary>
            <div className="source-controls">
              <input
                type="text"
                value={knowledgeQuery}
                onChange={(event) => setKnowledgeQuery(event.target.value)}
                placeholder="Bitki, hastalik, zararli, belirti ara..."
              />
              <select
                value={knowledgeType}
                onChange={(event) => setKnowledgeType(event.target.value)}
              >
                {knowledgeTypes.map((item) => (
                  <option key={item} value={item}>
                    {knowledgeTypeLabels[item] || item}
                  </option>
                ))}
              </select>
              <select
                value={knowledgeSource}
                onChange={(event) => setKnowledgeSource(event.target.value)}
              >
                {knowledgeSources.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Tum kaynaklar" : item}
                  </option>
                ))}
              </select>
            </div>
            <div className="research-strip">
              <div>
                <strong>Bilgi bankasi ozet</strong>
                <p>{knowledgeEntries.length} kayit • {filteredKnowledgeEntries.length} gosteriliyor</p>
              </div>
            </div>
            <div className="knowledge-type-strip">
              {knowledgeTypes.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={knowledgeType === item ? "primary" : "ghost"}
                  onClick={() => setKnowledgeType(item)}
                >
                  {(knowledgeTypeLabels[item] || item).toUpperCase()} ({knowledgeTypeCounts[item] || 0})
                </button>
              ))}
            </div>
            <div className="encyclopedia-shell">
              <aside className="encyclopedia-index">
                <strong>Harf indeksi</strong>
                <div className="encyclopedia-letters">
                  {encyclopediaLetters.map((letter) => (
                    <button
                      key={letter}
                      className={encyclopediaLetter === letter ? "primary" : "ghost"}
                      onClick={() => setEncyclopediaLetter(letter)}
                    >
                      {letter === "all" ? "Tum" : letter}
                    </button>
                  ))}
                </div>
                <small className="muted">
                  {encyclopediaEntries.length} madde • ilk {encyclopediaVisibleEntries.length} gosteriliyor
                </small>
                <ul className="encyclopedia-list">
                  {encyclopediaVisibleEntries.map((item) => (
                    <li key={item._id}>
                      <button
                        className={selectedEncyclopediaEntry?._id === item._id ? "primary" : "ghost"}
                        onClick={() => setEncyclopediaEntryId(item._id)}
                      >
                        {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
                {encyclopediaEntries.length > encyclopediaVisibleEntries.length ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setEncyclopediaListLimit((prev) => prev + 80)}
                  >
                    Daha fazla madde yukle
                  </button>
                ) : null}
              </aside>
              <article className="encyclopedia-detail">
                {selectedEncyclopediaEntry ? (
                  <>
                    <div className="source-meta">
                      <strong>{selectedEncyclopediaEntry.title}</strong>
                      <span>{knowledgeTypeLabels[selectedEncyclopediaEntry.type] || selectedEncyclopediaEntry.type}</span>
                    </div>
                    <p>{selectedEncyclopediaEntry.detail}</p>
                    <small className="muted">Kaynak: {selectedEncyclopediaEntry.source}</small>
                    {selectedEncyclopediaEntry.link ? (
                      <a href={selectedEncyclopediaEntry.link} target="_blank" rel="noreferrer">
                        Referansi ac
                      </a>
                    ) : null}
                    {relatedKnowledgeEntries.length ? (
                      <div className="related-entries">
                        <strong>Ilgili basliklar</strong>
                        <div className="knowledge-type-strip">
                          {relatedKnowledgeEntries.map((item) => (
                            <button
                              key={item._id}
                              type="button"
                              className="ghost"
                              onClick={() => setEncyclopediaEntryId(item._id)}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Kayit bulunamadi.</p>
                )}
              </article>
            </div>
          </details>

          <details className="accordion">
            <summary>Turkiye’de yaygin yetistirilen 10 bitki</summary>
            <div className="guide-grid">
              <div className="guide-column">
                <div className="guide-cards">
                  {turkeyGuidePlants.map((item) => (
                    <div key={item.name} className="guide-card">
                      <div>
                        <h4>{item.name}</h4>
                        <p>{item.summary}</p>
                      </div>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        Bakim rehberi
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </section>
      )}

      {activeTab !== "handbook" && (
        <>
          <div className="control-rail">
            <div className="rail-grid">
              <a className="rail-pill" href="#diagnosis">
                Teshis
                <span>Analiz & rapor</span>
              </a>
              <button
                className="rail-more"
                onClick={() => setShowOverflow((prev) => !prev)}
                aria-label="Diger ozellikler"
              >
                ⋯
              </button>
            </div>
            {showOverflow && (
              <div className="rail-menu">
                <div className="summary-strip">
                  {summaryCards.map((item) => (
                    <div key={item.title} className="summary-card">
                      <strong>{item.title}</strong>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rail-links">
                  {[
                    { key: "core", label: "Teshis & Ozet", icon: ShieldCheck, href: "#diagnosis" },
                    { key: "operations", label: "Saha", icon: Leaf, href: "#operations" },
                    { key: "intelligence", label: "AI", icon: Sparkles, href: "#intelligence" },
                    { key: "commerce", label: "Pazar", icon: FileImage, href: "#commerce" },
                    { key: "compliance", label: "Uygunluk", icon: Stethoscope, href: "#compliance" },
                    { key: "learning", label: "Ogrenme", icon: LeafyGreen, href: "#learning" }
                  ].map((item) => (
                    <a
                      key={item.key}
                      className="rail-link"
                      href={item.href}
                      onClick={() => setShowOverflow(false)}
                    >
                      <item.icon size={14} />
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showOverflow && (
            <div className="feature-tabs compact-tabs">
              {[
                { key: "core", label: "Teshis & Ozet", icon: ShieldCheck },
                { key: "operations", label: "Saha", icon: Leaf },
                { key: "intelligence", label: "AI", icon: Sparkles },
                { key: "commerce", label: "Pazar", icon: FileImage },
                { key: "compliance", label: "Uygunluk", icon: Stethoscope },
                { key: "learning", label: "Ogrenme", icon: LeafyGreen }
              ].map((item) => (
                <button
                  key={item.key}
                  className={featureTab === item.key ? "active" : ""}
                  onClick={() => handleFeatureTab(item.key)}
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div id="diagnosis" className="section-anchor" />
          {bottomTab === "demos" ? <div id="demo" className="section-anchor" /> : null}
          {bottomTab === "demos" ? (<div className="advanced-toggle">
            <div className="demo-note">
              <strong>Demo / Ar-Ge alani</strong>
              <p>Gelistirme asamasindaki ozellikler burada toplanir.</p>
            </div>
            <div className="demo-actions">
              <button
                className="ghost"
                onClick={() => startQuickDemo("normal")}
              >
                Hizli demo baslat
              </button>
              <button
                className="ghost"
                onClick={() => startQuickDemo("frost_stress")}
              >
                Kritik senaryo
              </button>
              <button
                className="primary"
                onClick={() => {
                  setShowFullDemo((prev) => !prev);
                  document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {showFullDemo ? "Demo modunu kapat" : "Demo modunu ac"}
              </button>
            </div>
          </div>) : null}
          {bottomTab === "demos" && showAdvanced && (
            <div className="drawer-overlay" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
              <div className="mini-drawer" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-head">
                  <strong>Diger Ozellikler</strong>
                  <button className="ghost" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                    Kapat
                  </button>
                </div>
                <div className="drawer-actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      setShowFullDemo((prev) => !prev);
                      setShowAdvanced(false);
                    }}
                  >
                    {showFullDemo ? "Demo icerigini kisalt" : "Tum demo icerigi"}
                  </button>
                </div>
                <div className="drawer-tabs">
                  {[
                    { key: "operations", label: "Saha" },
                    { key: "intelligence", label: "AI" },
                    { key: "commerce", label: "Pazar" },
                    { key: "learning", label: "Ogrenme" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      className={drawerTab === tab.key ? "active" : ""}
                      onClick={() => setDrawerTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="drawer-compact">
                  {drawerTab === "operations" && (
                    <div className="drawer-card">
                      <h4>Saha & Operasyon</h4>
                      <p>Hava, toprak, sulama, parsel ve risk kartlari.</p>
                      <a href="#operations" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "intelligence" && (
                    <div className="drawer-card">
                      <h4>AI & Rapor</h4>
                      <p>Ozet rapor, planlayici, risk haritasi.</p>
                      <a href="#intelligence" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "commerce" && (
                    <div className="drawer-card">
                      <h4>Pazar & Uygunluk</h4>
                      <p>Fiyat, lojistik, sertifikasyon ve kayit.</p>
                      <a href="#commerce" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                  {drawerTab === "learning" && (
                    <div className="drawer-card">
                      <h4>Ogrenme</h4>
                      <p>Kilavuz, dersler, uygulama notlari.</p>
                      <a href="#learning" onClick={() => { setShowFullDemo(true); setShowAdvanced(false); }}>
                        Bolume git
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {bottomTab === "demos" && showAdvanced && !showFullDemo && (
            <section className="demo-compact">
              <div className="steps-header">
                <h2>Demo ozellik ozetleri</h2>
                <p>Detaya girmek icin tum demo icerigini acabilirsin.</p>
              </div>
              <div className="demo-compact-grid">
                {demoCompactItems.map((item) => (
                  <div key={item.title} className="demo-compact-card">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {bottomTab === "demos" && showFullDemo && (
            <section className="steps">
              <div className="steps-header">
                <h2>3 adimda teshis</h2>
                <p>Ekstra donanim yok. Sadece fotograf, hizli sonuc.</p>
              </div>
              <div className="step-grid">
                {steps.map((step, index) => (
                  <div key={step.title} className="step-card">
                    <span className="step-index">0{index + 1}</span>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {bottomTab === "demos" && showFullDemo && (
            <>
            <section className="features">
              <div className="steps-header">
                <h2>Demo saha icgoru paketleri</h2>
                <p>Gorev, risk ve verim ciktilarini tek akista topla.</p>
              </div>
              <div className="step-grid">
                {demoInsightCards.map((item) => (
                  <div key={item.title} className="step-card">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="features">
              <div className="steps-header">
                <h2>Canli video + sesli asistan</h2>
                <p>Uygulama mobil oldugunda kameradan canli teshis ve sesli danismanlik.</p>
              </div>
              <div className="step-grid">
                <div className="step-card">
                  <h3>Canli kamera analizi</h3>
                  <p>Yapraklari gezdir, sistem sorunlu bolgeleri isaretlesin.</p>
                  <span className="badge subtle">Yakinda aktif</span>
                </div>
                <div className="step-card">
                  <h3>Sesli soru-cevap</h3>
                  <p>\"Bu leke neden oldu?\" diye sor, sahaya uygun cevap al.</p>
                  <span className="badge subtle">Mobilde acilacak</span>
                </div>
                <div className="step-card">
                  <h3>Video kayitli rapor</h3>
                  <p>Canli seans sonunda otomatik rapor ve aksiyon listesi.</p>
                  <span className="badge subtle">Beta asamasinda</span>
                </div>
                <div className="step-card assistant-card">
                  <h3>AI asistan oturumu</h3>
                  <p>Sesli sor, canli tespit et, aksiyon planini otomatik al.</p>
                  <div className="assistant-status">
                    <span>Mod</span>
                    <strong>Canli teshis + danismanlik</strong>
                  </div>
                  <span className="badge">Oturum baslat (mobilde)</span>
                </div>
              </div>
            </section>
            </>

          )}


          {bottomTab === "demos" && showFullDemo && (
            <>
          <div id="intelligence" className="section-anchor" />
              <section className="features">
            <div className="steps-header">
              <h2>AI saha raporu</h2>
              <p>Canli tespit oturumlarini rapora ceviren otomatik dokum.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Ozet rapor</h3>
                <ul>
                  <li>Tespit edilen hastalik ve risk skoru</li>
                  <li>Problem bolgesi ve yayilim haritasi</li>
                  <li>Uygulama takvimi ve acil aksiyonlar</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Uygulama planlayici</h3>
                <ul>
                  <li>Ilac/organik cozum zamanlari</li>
                  <li>Takip fotograflari icin hatirlatici</li>
                  <li>Risk azalma trendi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Paylasim ve export</h3>
                <ul>
                  <li>PDF rapor indir (mobil)</li>
                  <li>Danisman ile paylas</li>
                  <li>Parsel arsivi ile eslestir</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features land-demo-section">
            <div className="steps-header">
              <h2>Hastalik risk haritasi</h2>
              <p>Parsel bazli riskleri renklerle takip et.</p>
            </div>
            <div className="step-grid land-demo-grid">
              <div className="step-card land-demo-card">
                <h3>Parsel 1</h3>
                <div className="risk-meter high">Yuksek risk</div>
                <p>Nem ve yaprak islakligi yuksek.</p>
              </div>
              <div className="step-card">
                <h3>Parsel 2</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Hava akisi yetersiz.</p>
              </div>
              <div className="step-card">
                <h3>Parsel 3</h3>
                <div className="risk-meter low">Dusuk risk</div>
                <p>Denge stabil.</p>
              </div>
            </div>
          </section>

          <section className="features trade-section">
            <div className="steps-header">
              <h2>Parsel arsivi</h2>
              <p>Her parsel icin teshis ve uygulama gecmisi.</p>
            </div>
            <div className="step-grid trade-grid">
              <div className="step-card trade-card">
                <h3>Parsel: Battalgazi-1</h3>
                <ul>
                  <li>Son teshis: Bakteriyel leke</li>
                  <li>Uygulama: Bakir + mankozeb</li>
                  <li>Son guncelleme: 2 gun once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Parsel: Yazihan-2</h3>
                <ul>
                  <li>Son teshis: Kulleme</li>
                  <li>Uygulama: Kukürt bazli</li>
                  <li>Son guncelleme: 4 gun once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Parsel: Ornek-3</h3>
                <ul>
                  <li>Son teshis: Saglikli</li>
                  <li>Uygulama: Koruyucu plan</li>
                  <li>Son guncelleme: 1 hafta once</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Verim tahminleme</h2>
              <p>Sezon ortasi beklenen uretim araligi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Domates</h3>
                <p>Beklenen: 3.4 - 4.8 ton/da</p>
                <div className="score-pill">Trend: +%6</div>
              </div>
              <div className="step-card">
                <h3>Biber</h3>
                <p>Beklenen: 2.1 - 3.2 ton/da</p>
                <div className="score-pill">Trend: +%3</div>
              </div>
              <div className="step-card">
                <h3>Marul</h3>
                <p>Beklenen: 1.2 - 1.8 ton/da</p>
                <div className="score-pill">Trend: -%2</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gunluk saha brifingi</h2>
              <p>Bugun yapilacak oncelikli isler.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Sabah</h3>
                <ul>
                  <li>Yaprak islakligi kontrolu</li>
                  <li>Sulama hattini gozden gecir</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oglen</h3>
                <ul>
                  <li>Gunes stresi var mi kontrol et</li>
                  <li>Hizli zararlı taramasi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Aksam</h3>
                <ul>
                  <li>Notlari kaydet</li>
                  <li>Yarin icin aksiyon planini belirle</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Is gucu planlayici</h2>
              <p>Gunluk ekip planlamasi ve gorev dagilimi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugun ekip</h3>
                <ul>
                  <li>Sulama: 2 kisi</li>
                  <li>Ilaclama: 1 kisi</li>
                  <li>Hasat: 3 kisi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yarin</h3>
                <ul>
                  <li>Budama: 2 kisi</li>
                  <li>Toprak kontrol: 1 kisi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Haftalik</h3>
                <ul>
                  <li>Bakim ve temizlik gunu</li>
                  <li>Depo stok kontrolu</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ekipman bakim takvimi</h2>
              <p>Damla hatlari, ilaclama makinesi ve ekipman bakimi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Haftalik</h3>
                <ul>
                  <li>Filtre temizligi</li>
                  <li>Depo hizli kontrol</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Aylik</h3>
                <ul>
                  <li>Ilaclama nozulu kontrolu</li>
                  <li>Basinc ayari</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Sezonluk</h3>
                <ul>
                  <li>Hat yikama</li>
                  <li>Yedek parca yenileme</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ilaclama gunlugu</h2>
              <p>Uygulanan ilac, tarih ve doz kaydi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Son uygulama</h3>
                <ul>
                  <li>Urun: Bakir + mankozeb</li>
                  <li>Tarih: 2 gun once</li>
                  <li>Doz: Etikete uygun</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Planlanan</h3>
                <ul>
                  <li>Urun: Kukürt bazli</li>
                  <li>Tarih: 3 gun sonra</li>
                  <li>Not: Hava ruzgarsiz olmali</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Uyari</h3>
                <p>Hasat oncesi bekleme suresi etiketten kontrol edilmeli.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Su kullanimi takibi</h2>
              <p>Sezonluk su tuketimi ve tasarruf hedefleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Guncel tuketim</h3>
                <p>Haftalik 32 m³</p>
                <div className="score-pill">Hedef: 28 m³</div>
              </div>
              <div className="step-card">
                <h3>Tasarruf oneri</h3>
                <p>Gece sulamasi ve basinc dusurme ile %8 tasarruf.</p>
              </div>
              <div className="step-card">
                <h3>Kayip alarmi</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Hatta kacaği kontrol et.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Girdi ve stok yonetimi</h2>
              <p>Tohum, gubre ve ilac stoklarini tek panelde takip et.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Tohum stogu</h3>
                <ul>
                  <li>Domates: 4 paket</li>
                  <li>Biber: 2 paket</li>
                  <li>Marul: 6 paket</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Gubre stogu</h3>
                <ul>
                  <li>Azot: 120 kg</li>
                  <li>Fosfor: 60 kg</li>
                  <li>Potasyum: 80 kg</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Ilac stogu</h3>
                <ul>
                  <li>Bakirli: 12 L</li>
                  <li>Kukurt: 8 kg</li>
                  <li>Yaprak biti: 4 L</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Rotasyon planlayici</h2>
              <p>Topragi dinlendir, hastalik baskisini dusur.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yil 1</h3>
                <ul>
                  <li>Parsel A: Domates</li>
                  <li>Parsel B: Baklagil</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yil 2</h3>
                <ul>
                  <li>Parsel A: Tahil</li>
                  <li>Parsel B: Domates</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Yil 3</h3>
                <ul>
                  <li>Parsel A: Yag bitkisi</li>
                  <li>Parsel B: Tahil</li>
                </ul>
              </div>
            </div>
          </section>



          <div id="commerce" className="section-anchor" />
          <section className="features">
            <div className="steps-header">
              <h2>Canli saha risk & hasat penceresi</h2>
              <p>5 gunluk tahmin ve anlik verilerle planlama.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Isik/Isı penceresi</h3>
                {forecastSummary ? (
                  <>
                    <p>
                      Min: {forecastSummary.minTemp}°C • Max: {forecastSummary.maxTemp}°C
                    </p>
                    <div className="score-pill">
                      Don gunu: {forecastSummary.frostDays} • Yagisli gun: {forecastSummary.rainyDays}
                    </div>
                  </>
                ) : (
                  <p>Veri bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Yagis riski</h3>
                {forecastSummary ? (
                  <>
                    <p>Maks yagis: {forecastSummary.maxPrecip} mm</p>
                    <div className="score-pill">
                      {forecastSummary.maxPrecip >= 20 ? "Asiri yagis riski" : "Yagis kontrolu"}
                    </div>
                  </>
                ) : (
                  <p>Veri bekleniyor.</p>
                )}
              </div>
              <div className="step-card">
                <h3>Ruzgar stresi</h3>
                <p>Tepe ruzgar: {Math.round(maxWindKmh)} km/sa</p>
                <div className="score-pill">
                  {maxWindKmh >= 35 ? "Yuksek risk" : maxWindKmh >= 20 ? "Orta risk" : "Dengeli"}
                </div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Depolama ve lojistik</h2>
              <p>Hasat sonrasi kaybi azaltan kontrol listesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Soguk zincir</h3>
                <ul>
                  <li>On sogutma 0-4°C</li>
                  <li>Nem: %85-90</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Paketleme</h3>
                <ul>
                  <li>Darbelere karsi koruma</li>
                  <li>Havalandirmali kasa</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Nakliye</h3>
                <ul>
                  <li>Gunes altinda bekletme</li>
                  <li>Etiketleme ve izlenebilirlik</li>
                </ul>
              </div>
            </div>
          </section>



          <div id="compliance" className="section-anchor" />

                      <section className="features">
            <div className="steps-header">
              <h2>Uygunluk kontrolu</h2>
              <p>Gida guvenligi ve etiket uyum adimlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <ul>
                  <li>PHI (hasat oncesi bekleme) kaydi</li>
                  <li>Ilaclama etiketi ve doz uyumu</li>
                  <li>Personel KKD kontrolu</li>
                </ul>
              </div>
              <div className="step-card">
                <ul>
                  <li>Parti bazli izlenebilirlik</li>
                  <li>Depolama sicaklik kaydi</li>
                  <li>Atik bertaraf kaydi</li>
                </ul>
              </div>
              <div className="step-card">
                <ul>
                  <li>Su kaynagi test raporu</li>
                  <li>Gubre kaynagi belge kontrolu</li>
                  <li>Yillik risk degerlendirme</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Operasyon performans ozeti</h2>
              <p>Saha skoru ve oncelikli aksiyonlarin anlik ozeti.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Saha skoru</h3>
                <p>{fieldScore.score} / 100</p>
                <div className="score-pill">{fieldScore.status}</div>
              </div>
              <div className="step-card">
                <h3>Oncelikler</h3>
                <ul>
                  {fieldScore.priorities.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="step-card">
                <h3>Uyari yogunlugu</h3>
                <p>{weatherSummary?.riskTags?.join(" • ") || "Normal"}</p>
                <div className="score-pill">
                  {weatherSummary ? `Skor ${weatherSummary.score}/100` : "Veri bekleniyor"}
                </div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik trend analizi</h2>
              <p>Son teshislerden olusan canli dagilim.</p>
            </div>
            <div className="step-grid">
              {diseaseTrends.length ? (
                diseaseTrends.map((item) => (
                  <div key={item.name} className="step-card">
                    <h3>{item.name}</h3>
                    <div className="score-pill">%{item.pct}</div>
                  </div>
                ))
              ) : (
                <div className="step-card">
                  <h3>Veri yok</h3>
                  <p>Henuz analiz kaydi yok.</p>
                </div>
              )}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Canli veri kaynaklari</h2>
              <p>Uygulamanin internete bagli canli veri durumlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hava</h3>
                <p>{weather?.source ? `Kaynak: ${weather.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {weather?.updatedAt
                    ? `Guncel: ${new Date(weather.updatedAt).toLocaleTimeString("tr-TR")}`
                    : "Guncelleme yok"}
                </div>
              </div>
              <div className="step-card">
                <h3>Tahmin</h3>
                <p>{forecast?.source ? `Kaynak: ${forecast.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {forecast?.days?.length ? `${forecast.days.length} gunluk veri` : "Tahmin yok"}
                </div>
              </div>
              <div className="step-card">
                <h3>Toprak</h3>
                <p>{soilReport?.source ? `Kaynak: ${soilReport.source}` : "Veri yok"}</p>
                <div className="score-pill">
                  {soilReport?.soilType ? `Tip: ${soilReport.soilType}` : "Tip yok"}
                </div>
              </div>

              <div className="step-card">
                <h3>API metrikleri</h3>
                <p>{metrics?.status === "ok" ? "Saglikli" : "Bilinmiyor"}</p>
                <div className="score-pill">
                  {metrics ? `Uptime ${metrics.uptimeSec}s` : "Veri yok"}
                </div>
                <small className="muted">
                  {metrics ? `Queue ${metrics.queueLength} • Cache ${metrics.cacheSize}` : metricsError}
                </small>
                {metrics && (
                  <small className={`muted ${metricsStale ? "warning-text" : ""}`}>
                    {metricsStale ? "Metrik verisi bayat" : "Metrik verisi guncel"} •{" "}
                    {metricsUpdatedAt
                      ? new Date(metricsUpdatedAt).toLocaleTimeString("tr-TR")
                      : "-"}
                  </small>
                )}
                {metrics && (
                  <small className="muted">
                    Model: {metrics.primaryModelLoaded ? "primary" : "-"}
                    {metrics.secondaryModelLoaded ? " + secondary" : ""} • Sinif:{" "}
                    {metrics.modelLabels ?? 0}
                  </small>
                )}
                {metrics?.modelStrictOnly ? (
                  <small className="muted">Mod: strict (fallback kapali)</small>
                ) : null}
                {backendInfo.modelVersion ? (
                  <small className="muted">
                    Backend API {backendInfo.apiVersion || "-"} • Model {backendInfo.modelVersion}
                  </small>
                ) : null}
                {integrationsHealth ? (
                  <>
                    <small className="muted">
                      Dis API: {Number(integrationsHealth.healthy || 0)}/{Number(integrationsHealth.total || 0)} saglikli
                    </small>
                    <div className="info-badges">
                      {(integrationsHealth.items || []).slice(0, 4).map((item) => (
                        <span key={`integration-health-${item.id}`} className={`badge ${item.ok ? "safe" : "warn"}`}>
                          {item.title}: {item.ok ? "ok" : item.status || "down"}
                        </span>
                      ))}
                    </div>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => loadIntegrationsHealth(true)}>
                        API kontrollerini yenile
                      </button>
                    </div>
                  </>
                ) : null}
                {integrationsHealthError ? <small className="muted warning-text">{integrationsHealthError}</small> : null}
                {modelHealth ? (
                  <>
                    <small className={`muted ${modelHealth.healthy ? "" : "warning-text"}`}>
                      Model health: {modelHealth.healthy ? "iyi" : "sorun var"} • pipeline{" "}
                      {modelHealth?.checks?.pipelineCount ?? 0}
                    </small>
                    {modelHealth?.lastFailure ? (
                      <small className="muted warning-text">
                        Son hata: {modelHealth.lastFailure.failureCode} • {modelHealth.lastFailure.detail}
                      </small>
                    ) : (
                      <small className="muted">
                        Son basarili analiz:{" "}
                        {modelHealth?.lastSuccessAt
                          ? new Date(modelHealth.lastSuccessAt).toLocaleTimeString("tr-TR")
                          : "-"}
                      </small>
                    )}
                    {Array.isArray(modelHealth?.recommendations) && modelHealth.recommendations.length ? (
                      <small className="muted warning-text">
                        Oneri: {modelHealth.recommendations.slice(0, 2).join(" • ")}
                      </small>
                    ) : null}
                  </>
                ) : null}
                {modelHealthError ? <small className="muted warning-text">{modelHealthError}</small> : null}
                {modelSelfCheck ? (
                  <small className={`muted ${modelSelfCheck.ok ? "" : "warning-text"}`}>
                    Self-check: {modelSelfCheck.summary}
                  </small>
                ) : null}
                {modelDiagnostics?.diagnostics ? (
                  <>
                    <small
                      className={`muted ${
                        modelDiagnostics.diagnostics.lowVarianceWarning ? "warning-text" : ""
                      }`}
                    >
                      Guven dagilimi std: %
                      {Math.round(Number(modelDiagnostics.diagnostics?.confidence?.std || 0) * 1000) / 10} •
                      ortalama %{Math.round(Number(modelDiagnostics.diagnostics?.confidence?.mean || 0) * 100)}
                    </small>
                    <small className="muted">
                      Cesitlilik: {modelDiagnostics.diagnostics.labelDiversity || 0} sinif •
                      healthy orani %{Math.round(Number(modelDiagnostics.diagnostics.healthyRate || 0) * 100)}
                    </small>
                    <small className="muted">
                      Fallback orani %{Math.round(Number(modelDiagnostics.diagnostics.fallbackRate || 0) * 100)} •
                      baskin sinif payi %
                      {Math.round(Number(modelDiagnostics.diagnostics.dominantLabelShare || 0) * 100)}
                    </small>
                    <small className="muted">
                      Tahmin hata orani %{Math.round(Number(modelDiagnostics.diagnostics.failureRate || 0) * 100)} •
                      pencere {modelDiagnostics.diagnostics.predictEventWindow || "-"}
                    </small>
                    {modelDiagnostics.diagnostics.sourceBreakdown ? (
                      <small className="muted">
                        Kaynak dagilimi:{" "}
                        {Object.entries(modelDiagnostics.diagnostics.sourceBreakdown)
                          .map(([key, value]) => `${key}:${value}`)
                          .join(" • ") || "-"}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.topLabels) &&
                    modelDiagnostics.diagnostics.topLabels.length ? (
                      <small className="muted">
                        En sik siniflar:{" "}
                        {modelDiagnostics.diagnostics.topLabels
                          .slice(0, 3)
                          .map((item) => `${item.label} (%${Math.round(Number(item.share || 0) * 100)})`)
                          .join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recommendations) &&
                    modelDiagnostics.diagnostics.recommendations.length ? (
                      <small className="muted warning-text">
                        Oneri: {modelDiagnostics.diagnostics.recommendations.slice(0, 2).join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recentPredictions) &&
                    modelDiagnostics.diagnostics.recentPredictions.length ? (
                      <small className="muted">
                        Son tahminler:{" "}
                        {modelDiagnostics.diagnostics.recentPredictions
                          .slice(0, 3)
                          .map(
                            (item) =>
                              `${item.label} %${Math.round(Number(item.confidence || 0) * 100)} (${item.status})`
                          )
                          .join(" • ")}
                      </small>
                    ) : null}
                    {Array.isArray(modelDiagnostics.diagnostics.recentFailures) &&
                    modelDiagnostics.diagnostics.recentFailures.length ? (
                      <small className="muted warning-text">
                        Son hatalar:{" "}
                        {modelDiagnostics.diagnostics.recentFailures
                          .slice(0, 2)
                          .map((item) => `${item.stage}:${item.failureCode}`)
                          .join(" • ")}
                      </small>
                    ) : null}
                  </>
                ) : null}
                {modelDiagnosticsError ? (
                  <small className="muted warning-text">{modelDiagnosticsError}</small>
                ) : null}
                <div className="demo-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setApiHealthTick((prev) => prev + 1);
                      setMetricsRefreshTick((prev) => prev + 1);
                    }}
                  >
                    Metrikleri yenile
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={runModelSelfCheck}
                    disabled={modelSelfCheckRunning || !supportsModelSelfCheck}
                  >
                    {modelSelfCheckRunning ? "Self-check..." : "Model self-check"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={resetModelDiagnostics}
                    disabled={modelDiagnosticsResetRunning || !supportsModelDiagnostics}
                  >
                    {modelDiagnosticsResetRunning ? "Reset..." : "Diagnostics reset"}
                  </button>
                </div>
              </div>
            </div>
          </section>
      </>
      )}

          {bottomTab === "demos" && (
          <section className={`features ${demoUiMode === "expert" ? "demo-mode-expert" : "demo-mode-simple"}`}>
            <div className="steps-header">
              <h2>Demo durum panosu</h2>
              <p>Her modulu tek tek acip hizli test et.</p>
            </div>
            <div className="demo-mode-toggle">
              <button
                type="button"
                className={demoUiMode === "simple" ? "active" : ""}
                onClick={() => setDemoUiMode("simple")}
              >
                Basit
              </button>
              <button
                type="button"
                className={demoUiMode === "expert" ? "active" : ""}
                onClick={() => setDemoUiMode("expert")}
              >
                Uzman
              </button>
            </div>
            <div className="demo-ready-banner">
              <div>
                <strong>Tek tikla demo hazirlama</strong>
                <p>Paket uygula, arazi+pazar seed yukle ve smoke testi otomatik kos.</p>
                {demoBootstrapSummary ? <small className="muted">{demoBootstrapSummary}</small> : null}
              </div>
              <div className="demo-actions">
                <button
                  className="primary"
                  onClick={() => prepareDemosForUse({ silent: false })}
                  disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                >
                  {demoBootstrapRunning ? "Demo hazirlaniyor..." : "Demolari hazirla"}
                </button>
                <button
                  className="ghost"
                  onClick={runDemoShowcaseReady}
                  disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                >
                  {demoShowcaseRunning ? "Sunum hazirlaniyor..." : "Sunuma hazirla"}
                </button>
                {!demoBootstrapReady ? (
                  <button
                    className="ghost"
                    onClick={() => prepareDemosForUse({ silent: false, autoRepair: false })}
                    disabled={demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning || demoShowcaseRunning}
                  >
                    Tekrar dene
                  </button>
                ) : null}
                <span className={`badge ${demoBootstrapReady ? "safe" : "warn"}`}>
                  {demoBootstrapReady ? "Durum: hazir" : "Durum: hazirlaniyor"}
                </span>
              </div>
            </div>
            <div className="demo-story-grid">
              <article className="demo-story-card">
                <strong>Saha turu</strong>
                <p>Teshis, iklim ve model sagligini tek akista dogrula.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Tam tur</span>
                  <span className="badge">Hedef: teknik demo</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("demos");
                    runDemoFlowPreset("all_round");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Sahneyi baslat
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Yatirimci hikayesi</strong>
                <p>Pazar + arazi + KPI setini sunuma hazir akista topla.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Showcase</span>
                  <span className="badge">Hedef: yatirimci</span>
                </div>
                <button className="ghost" onClick={runInvestorShowcase} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Yatirimci akisini ac
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Model guven turu</strong>
                <p>Self-check, diagnostics ve smoke akisini birlestirir.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Model + onarim</span>
                  <span className="badge">Hedef: guvenilirlik</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("home");
                    runDemoFlowPreset("model_smoke");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Model turunu ac
                </button>
              </article>
              <article className="demo-story-card">
                <strong>Arazi + pazar turu</strong>
                <p>Fiyatlama paneli ve pazar vitrini gecisini hizla dogrula.</p>
                <div className="info-badges">
                  <span className="badge">Akis: Pazar + finans</span>
                  <span className="badge">Hedef: ticari demo</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("land");
                    setCommerceMiniTab("land");
                    runDemoFlowPreset("market_finance");
                  }}
                  disabled={demoFlowRunning || demoAutopilotRunning}
                >
                  Ticari turu ac
                </button>
              </article>
            </div>
            <div className="demo-pack-row">
              <label className="plant-select">
                <span>Demo paketi</span>
                <select value={demoPack} onChange={(e) => setDemoPack(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="riskli">Riskli saha</option>
                  <option value="pazar-hizli">Pazar hizli</option>
                  <option value="pazar-durgun">Pazar durgun</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Autopilot modu</span>
                <select value={demoAutopilotMode} onChange={(e) => setDemoAutopilotMode(e.target.value)}>
                  <option value="quick">Hizli</option>
                  <option value="full">Tam</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Retry</span>
                <select
                  value={String(demoAutopilotRetryCount)}
                  onChange={(e) => setDemoAutopilotRetryCount(Number(e.target.value) || 0)}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <div className="demo-actions">
                <button className="ghost" onClick={() => applyDemoPack(demoPack)}>
                  Paketi uygula
                </button>
                <button className="ghost" onClick={() => applyDemoPack("normal")}>
                  Normal'e don
                </button>
                <button className="ghost" onClick={runDemoResetSeed} disabled={demoAutopilotRunning}>
                  Full reset + seed
                </button>
                <button className="primary" onClick={runDemoAutopilot} disabled={demoAutopilotRunning}>
                  {demoAutopilotRunning ? "Autopilot calisiyor..." : "Demo autopilot"}
                </button>
              </div>
            </div>
            <div className="info-badges">
              <span className="badge">Hazir moduller: {demoControlMetrics.readyModules}/{demoControlMetrics.totalModules}</span>
              <span className="badge">Bekleyen: {demoControlMetrics.waitingModules}</span>
              <span className={`badge ${demoControlMetrics.runScore >= 80 ? "safe" : ""}`}>Demo skoru: {demoControlMetrics.runScore}/100</span>
              <span className="badge">Smoke: {demoControlMetrics.smokePass}/{demoControlMetrics.smokeTotal || "-"}</span>
            </div>
            <div className="demo-quick-actions">
              <button className="ghost" onClick={() => startQuickDemo("normal")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Hizli baslat
              </button>
              <button className="ghost" onClick={() => startQuickDemo("frost_stress")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Don senaryosu
              </button>
              <button className="ghost" onClick={runDemoEndToEnd} disabled={demoFlowRunning || demoAutopilotRunning}>
                Uctan uca
              </button>
              <button className="ghost" onClick={runDemoAutoRepair} disabled={demoFlowRunning || demoAutopilotRunning}>
                Oto onarim
              </button>
              <button className="ghost" onClick={runDemoSmokeTest} disabled={demoFlowRunning || demoAutopilotRunning}>
                Smoke test
              </button>
              <button className="ghost" onClick={simulateDemoDay} disabled={demoFlowRunning || demoAutopilotRunning}>
                Gun sonu simule et
              </button>
              <button className="ghost" onClick={runFailedDemoFlows} disabled={demoFlowRunning || demoAutopilotRunning}>
                Hatali akislari tekrarla
              </button>
              <button
                className="ghost"
                onClick={() => demoFlowTrend?.topFailFlowId && runDemoFlow(demoFlowTrend.topFailFlowId)}
                disabled={demoFlowRunning || demoAutopilotRunning || !demoFlowTrend?.topFailFlowId}
              >
                Kritik akisi calistir
              </button>
            </div>
            <div className="demo-preset-rail">
              <button className="ghost" onClick={() => runDemoFlowPreset("model_smoke")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Model + Onarim
              </button>
              <button className="ghost" onClick={() => runDemoFlowPreset("market_finance")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Pazar + Finans
              </button>
              <button className="ghost" onClick={() => runDemoFlowPreset("all_round")} disabled={demoFlowRunning || demoAutopilotRunning}>
                Preset: Tam tur
              </button>
            </div>
            <div className="investor-panel">
              <div className="investor-panel-head">
                <div>
                  <strong>Yatirimci sunum modulu</strong>
                  <small className="muted">Tek kartta urun hazirlik, pazar aktivitesi ve model guveni.</small>
                </div>
                <span className={`badge ${investorSnapshot.readiness >= 75 ? "safe" : "warn"}`}>
                  Hazirlik: {investorSnapshot.readiness}/100
                </span>
              </div>
              <div className="info-badges">
                <span className={`badge ${investorExecutionDecision.tone}`}>Yatirim karari: {investorExecutionDecision.label}</span>
                <span className="badge">{investorExecutionDecision.note}</span>
              </div>
              <div className="investor-kpi-grid">
                <article className="investor-kpi-card">
                  <span>Demo skoru</span>
                  <strong>{investorSnapshot.demoScore}/100</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Akis basari</span>
                  <strong>%{investorSnapshot.flowSuccess}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Yayindaki ilan</span>
                  <strong>{investorSnapshot.marketOpen}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Aktif siparis</span>
                  <strong>{investorSnapshot.activeOrders}</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Gerceklesen hacim</span>
                  <strong>{Math.round(investorSnapshot.fulfilledVolumeKg).toLocaleString("tr-TR")} kg</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Arazi model guveni</span>
                  <strong>%{investorSnapshot.landConfidence}</strong>
                </article>
              </div>
              <div className="investor-note-list">
                {investorHighlights.map((note) => (
                  <small key={note} className="muted">
                    • {note}
                  </small>
                ))}
              </div>
              <div className="investor-risk-grid">
                {investorRiskCards.map((card) => (
                  <article key={card.id} className="investor-risk-card">
                    <strong>{card.title}</strong>
                    <span>{card.state}</span>
                    <small className="muted">{card.note}</small>
                  </article>
                ))}
              </div>
              <div className="investor-room-grid">
                {investorDataRoom.map((block) => (
                  <article key={`investor-room-${block.id}`} className="investor-room-card">
                    <strong>{block.title}</strong>
                    {block.points.map((point) => (
                      <small key={point} className="muted">
                        • {point}
                      </small>
                    ))}
                  </article>
                ))}
              </div>
              <div className="investor-check-grid">
                {investorChecklist.map((item) => (
                  <article key={item.id} className="investor-check-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <em className={item.ok ? "safe-text" : "warning-text"}>{item.ok ? "Hazir" : "Takip et"}</em>
                  </article>
                ))}
              </div>
              <div className="investor-kpi-grid">
                <article className="investor-kpi-card">
                  <span>Gerceklesen GMV</span>
                  <strong>{Number(investorUnitEconomics.gmvTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Net gelir (take-rate)</span>
                  <strong>{Number(investorUnitEconomics.netRevenueTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
                <article className="investor-kpi-card">
                  <span>Aylik proj. gelir</span>
                  <strong>{Number(investorUnitEconomics.projectedMonthlyRevenueTl || 0).toLocaleString("tr-TR")} TL</strong>
                </article>
              </div>
              <div className="investor-note-list">
                <small className="muted">
                  Take-rate varsayimi: %{Number(investorUnitEconomics.takeRatePct || 0).toFixed(1)} •
                  Siparis tamamlanma: %{Number(investorUnitEconomics.orderFillRatePct || 0)}
                </small>
                {investorMomentum ? (
                  <small className="muted">
                    Son snapshot trendi: {investorMomentum.trend}
                    {" • "}hazirlik degisimi {investorMomentum.delta > 0 ? "+" : ""}
                    {investorMomentum.delta}
                  </small>
                ) : (
                  <small className="muted">Trend icin en az 2 snapshot biriktir.</small>
                )}
              </div>
              <div className="investor-blockers">
                <strong>Sunum blokeleri</strong>
                {investorBlockers.length ? (
                  <ul>
                    {investorBlockers.map((item) => (
                      <li key={`blocker-${item.id}`}>{item.label}: {item.value}</li>
                    ))}
                  </ul>
                ) : (
                  <small className="safe-text">Kritik bloke yok. Sunum hazir.</small>
                )}
              </div>
              <div className="demo-quick-actions">
                <button className="primary" onClick={runInvestorShowcase} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Yatirimci vitrinini calistir
                </button>
                <button className="ghost" onClick={runInvestorDryRun} disabled={demoFlowRunning || demoAutopilotRunning}>
                  Dry-run calistir
                </button>
                <button className="ghost" onClick={runInvestorPreflight} disabled={investorPreflightRunning}>
                  {investorPreflightRunning ? "Preflight kontrol..." : "Preflight kontrolu"}
                </button>
                <button className="ghost" onClick={exportInvestorBrief}>
                  Yatirimci ozeti indir
                </button>
                <button className="ghost" onClick={exportInvestorOnePager}>
                  One-pager indir
                </button>
                <button className="ghost" onClick={exportInvestorDeckHtml}>
                  Deck HTML indir
                </button>
                <button className="ghost" onClick={captureInvestorSnapshot}>
                  Snapshot al
                </button>
                <button className="ghost" onClick={clearInvestorSnapshots} disabled={!investorSnapshots.length}>
                  Snapshot temizle
                </button>
                <button className="ghost" onClick={copyInvestorScript}>
                  Sunum metnini kopyala
                </button>
                <button className="ghost" onClick={activatePresentationMode}>
                  Sunum moduna gec
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("market");
                    setTradeWorkspaceTab("vitrin");
                  }}
                >
                  Pazar vitrini ac
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setBottomTab("land");
                    setCommerceMiniTab("land");
                  }}
                >
                  Arazi panelini ac
                </button>
              </div>
              {investorPreflight ? (
                <div className="investor-preflight">
                  <div className="investor-preflight-head">
                    <strong>Preflight sonucu</strong>
                    <small className="muted">
                      {investorPreflight.city}/{investorPreflight.crop} • {investorPreflight.passCount}/
                      {investorPreflight.checks?.length || 0} gecti • {Math.round(investorPreflight.totalMs || 0)} ms
                    </small>
                  </div>
                  <div className="investor-preflight-grid">
                    {(investorPreflight.checks || []).map((row) => (
                      <article key={`preflight-${row.id}`} className="investor-preflight-card">
                        <span>{row.label}</span>
                        <strong className={row.ok ? "safe-text" : "warning-text"}>{row.ok ? "PASS" : "FAIL"}</strong>
                        <small className="muted">
                          HTTP {row.status || 0} • {row.latencyMs} ms
                        </small>
                        <small className="muted">{row.detail || "-"}</small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              {investorSnapshots.length ? (
                <div className="investor-preflight">
                  <div className="investor-preflight-head">
                    <strong>Snapshot gecmisi</strong>
                    <small className="muted">Son {Math.min(5, investorSnapshots.length)} kayit</small>
                  </div>
                  <div className="investor-preflight-grid">
                    {investorSnapshots.slice(0, 5).map((row) => (
                      <article key={`isnap-${row.id}`} className="investor-preflight-card">
                        <span>{new Date(row.capturedAt).toLocaleString("tr-TR")}</span>
                        <strong>Hazirlik {row.readiness}/100</strong>
                        <small className="muted">Akis %{row.flowSuccess} • Smoke {row.smokeFail}</small>
                        <small className="muted">
                          GMV {Number(row.gmvTl || 0).toLocaleString("tr-TR")} TL
                        </small>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
              <pre className="investor-script">{investorPresentationScript}</pre>
            </div>
            <div className="demo-insight-grid">
              <article className="demo-insight-card">
                <strong>Autopilot ozet</strong>
                <span>Adim: {demoAutopilotSummary.done}/{demoAutopilotSummary.total || "-"}</span>
                <span>Hata: {demoAutopilotSummary.failed}</span>
                <span>Ortalama sure: {demoAutopilotSummary.avgDurationMs} ms</span>
              </article>
              <article className="demo-insight-card">
                <strong>Akis trendi</strong>
                <span>Toplam kosu: {demoFlowStats.total}</span>
                <span>Basari: %{demoFlowStats.successRate}</span>
                <span>Kritik akis: {demoFlowTrend?.topFailFlowLabel || "-"}</span>
              </article>
              <article className="demo-insight-card">
                <strong>Smoke sonucu</strong>
                <span>
                  Son durum: {demoSmokeResult?.ok ? "basarili" : demoSmokeResult?.items?.length ? "hata var" : "bekleniyor"}
                </span>
                <span>Pass: {demoSmokeResult?.passCount ?? "-"}</span>
                <span>Fail: {demoSmokeResult?.failCount ?? "-"}</span>
              </article>
            </div>
            <div className="demo-health-strip">
              <div className="demo-health-bar">
                <span style={{ width: `${Math.max(0, Math.min(100, Number(demoControlMetrics.runScore || 0)))}%` }} />
              </div>
              <div className="info-badges">
                <span className={`badge ${Number(demoControlMetrics.runScore || 0) >= 80 ? "safe" : "warn"}`}>
                  Hazirlik: {demoControlMetrics.runScore}/100
                </span>
                <span className={`badge ${Number(demoFlowStats.successRate || 0) >= 80 ? "safe" : "warn"}`}>
                  Akis basari: %{demoFlowStats.successRate}
                </span>
                <span className="badge">Smoke fail: {demoSmokeResult?.failCount ?? "-"}</span>
              </div>
            </div>
            {demoSmokeHistory.length ? (
              <div className="demo-smoke-mini">
                {demoSmokeHistory.slice(0, 5).map((entry) => (
                  <span key={`demo-smoke-mini-${entry.id}`} className={`badge ${entry.ok ? "safe" : "warn"}`}>
                    {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.passCount}/{entry.total || "-"}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="demo-command-hub">
              <div className="demo-command-head">
                <strong>Demo komut merkezi</strong>
                <span className={`badge ${demoRiskLevel.tone}`}>Risk: {demoRiskLevel.label}</span>
              </div>
              <div className="demo-command-grid">
                {demoRecommendedCommands.map((cmd) => (
                  <article key={`demo-cmd-${cmd.id}`} className="demo-command-card">
                    <strong>{cmd.title}</strong>
                    <small className="muted">{cmd.note}</small>
                    <button className="ghost" onClick={() => runDemoCommand(cmd.id)} disabled={demoFlowRunning || demoAutopilotRunning}>
                      Komutu calistir
                    </button>
                  </article>
                ))}
              </div>
            </div>
            <div className="demo-ops-rail">
              <button className="ghost" onClick={exportDemoFlowHistory} disabled={!demoFlowHistory.length}>
                Akis JSON indir
              </button>
              <button className="ghost" onClick={exportDemoJson}>
                Demo bundle indir
              </button>
              <button className="ghost" onClick={generateDemoReport}>
                Rapor uret
              </button>
              <button className="ghost" onClick={downloadDemoReport} disabled={!demoReport}>
                Rapor indir
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setDemoSmokeHistory([]);
                  setDemoOpsStatus("Smoke gecmisi temizlendi.");
                }}
                disabled={!demoSmokeHistory.length || demoAutopilotRunning}
              >
                Smoke gecmisini temizle
              </button>
            </div>
            {demoFlowHistory[0] ? (
              <div className="demo-last-run-card">
                <strong>Son akis kosusu</strong>
                <span>
                  {demoFlowLibrary.find((item) => item.id === demoFlowHistory[0].flowId)?.title || demoFlowHistory[0].flowId} •{" "}
                  {demoFlowHistory[0].ok ? "ok" : "fail"} • {demoFlowHistory[0].durationMs} ms
                </span>
                <small className="muted">{demoFlowHistory[0].note || "-"}</small>
              </div>
            ) : null}
            {demoFailingFlows.length ? (
              <div className="demo-failing-panel">
                <strong>Tekrar eden hatali akislar</strong>
                <div className="demo-smoke-history">
                  {demoFailingFlows.map((item) => (
                    <div key={`demo-fail-${item.flowId}`} className="demo-step-chip">
                      <span className="badge warn">
                        {item.title} • {item.failCount} hata •{" "}
                        {item.lastAt ? new Date(item.lastAt).toLocaleTimeString("tr-TR") : "-"}
                      </span>
                      <button
                        className="ghost tiny"
                        onClick={() => runDemoFlow(item.flowId)}
                        disabled={demoFlowRunning || demoAutopilotRunning}
                      >
                        Calistir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="demo-flow-grid">
              {demoFlowLibrary.map((flow) => (
                <article key={`demo-flow-${flow.id}`} className="demo-flow-card">
                  <h3>{flow.title}</h3>
                  <p>{flow.detail}</p>
                  {demoFlowStats.byFlow?.[flow.id] ? (
                    <small className={`muted ${demoFlowStats.byFlow[flow.id]?.ok ? "safe-text" : "warning-text"}`}>
                      Son kosu: {demoFlowStats.byFlow[flow.id]?.ok ? "basarili" : "hatali"} •{" "}
                      {Number(demoFlowStats.byFlow[flow.id]?.durationMs || 0)} ms
                    </small>
                  ) : (
                    <small className="muted">Bu akis henuz calistirilmadi.</small>
                  )}
                  <button
                    className="ghost"
                    onClick={() => runDemoFlow(flow.id)}
                    disabled={demoFlowRunning || demoAutopilotRunning}
                  >
                    {demoFlowRunning ? "Akim calisiyor..." : flow.actionLabel}
                  </button>
                </article>
              ))}
            </div>
            <div className="demo-actions">
              <button className="ghost" onClick={runAllDemoFlows} disabled={demoFlowRunning || demoAutopilotRunning}>
                Tum akislari calistir
              </button>
              <button className="ghost" onClick={exportDemoFlowHistory} disabled={!demoFlowHistory.length}>
                Akis gecmisini indir
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setDemoFlowHistory([]);
                  setDemoFlowStatus("Akim gecmisi temizlendi.");
                }}
                disabled={!demoFlowHistory.length || demoFlowRunning || demoAutopilotRunning}
              >
                Akis gecmisini temizle
              </button>
            </div>
            <div className="demo-flow-toolbar">
              <label className="plant-select">
                <span>Filtre</span>
                <select value={demoFlowFilter} onChange={(e) => setDemoFlowFilter(e.target.value)}>
                  <option value="all">Tum sonuclar</option>
                  <option value="ok">Sadece basarili</option>
                  <option value="fail">Sadece hatali</option>
                </select>
              </label>
              <label className="plant-select">
                <span>Zaman</span>
                <select value={demoFlowWindow} onChange={(e) => setDemoFlowWindow(e.target.value)}>
                  <option value="all">Tum zaman</option>
                  <option value="today">Bugun</option>
                  <option value="7d">Son 7 gun</option>
                </select>
              </label>
              {demoFlowTrend ? (
                <div className="info-badges">
                  <span className={`badge ${demoFlowTrend.successRate >= 80 ? "safe" : ""}`}>
                    Son 10 basari: %{demoFlowTrend.successRate}
                  </span>
                  <span className="badge">Son 10 hata: {demoFlowTrend.fail}</span>
                  <span className="badge">Kritik akis: {demoFlowTrend.topFailFlowLabel}</span>
                </div>
              ) : null}
            </div>
            <div className="info-badges">
              <span className="badge">Akim kosu: {demoFlowStats.total}</span>
              <span className={`badge ${demoFlowStats.successRate >= 80 ? "safe" : ""}`}>Basari: %{demoFlowStats.successRate}</span>
              <span className="badge">Hata: {demoFlowStats.fail}</span>
              <span className="badge">Ortalama: {demoFlowStats.avgDurationMs} ms</span>
            </div>
            {demoFlowHistoryFiltered.length ? (
              <div className="demo-flow-history">
                {demoFlowHistoryFiltered.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="demo-flow-history-row">
                    <small className={`muted ${entry.ok ? "safe-text" : "warning-text"}`}>
                      {new Date(entry.endedAt).toLocaleTimeString("tr-TR")} •{" "}
                      {demoFlowLibrary.find((item) => item.id === entry.flowId)?.title || entry.flowId} •{" "}
                      {entry.ok ? "ok" : "fail"} • {entry.durationMs} ms
                    </small>
                    {!entry.ok ? (
                      <button
                        className="ghost tiny"
                        onClick={() => runDemoFlow(entry.flowId)}
                        disabled={demoFlowRunning || demoAutopilotRunning}
                      >
                        Tekrar calistir
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {demoFlowStatus ? <small className="muted">{demoFlowStatus}</small> : null}
            {demoRepairSummary ? <small className="muted">{demoRepairSummary}</small> : null}
            {demoAutopilotSummary.total ? (
              <div className="demo-autopilot-panel">
                <div className="demo-autopilot-progress">
                  <span style={{ width: `${demoAutopilotSummary.progressPct}%` }} />
                </div>
                <div className="info-badges">
                  <span className="badge">Adim: {demoAutopilotSummary.done}/{demoAutopilotSummary.total}</span>
                  <span className={`badge ${demoAutopilotSummary.failed ? "" : "safe"}`}>
                    Hata: {demoAutopilotSummary.failed}
                  </span>
                  <span className="badge">Calisan: {demoAutopilotSummary.runningLabel || "-"}</span>
                  <span className="badge">Ortalama sure: {demoAutopilotSummary.avgDurationMs} ms</span>
                  <span className="badge">Toplam sure: {demoAutopilotSummary.totalDurationMs} ms</span>
                </div>
                <div className="demo-smoke-history">
                  {demoAutopilotSteps.map((step) => (
                    <div key={`auto-step-${step.key}`} className="demo-step-chip">
                      <span className={`badge ${step.status === "ok" ? "safe" : ""}`}>
                        {step.label}: {step.status === "pending" ? "bekliyor" : step.status}
                        {step.attempt > 0 ? ` (${step.attempt})` : ""}
                        {Number(step.durationMs) > 0 ? ` • ${Number(step.durationMs)} ms` : ""}
                      </span>
                      {step.status === "failed" ? (
                        <button
                          className="ghost tiny"
                          onClick={() => runDemoAutopilotStep(step.key)}
                          disabled={demoAutopilotRunning}
                        >
                          Tekrar dene
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="demo-log-panel">
                  <div className="demo-log-header">
                    <strong>Autopilot loglari</strong>
                    <button className="ghost tiny" onClick={() => setDemoAutopilotLogs([])} disabled={demoAutopilotRunning}>
                      Temizle
                    </button>
                  </div>
                  <div className="demo-log-list">
                    {demoAutopilotLogs.length ? (
                      demoAutopilotLogs.map((entry) => (
                        <small key={entry.id} className={`muted demo-log-line ${entry.level}`}>
                          {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.text}
                        </small>
                      ))
                    ) : (
                      <small className="muted">Henüz log yok.</small>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="demo-status-grid">
              {demoStatusCards.map((item) => (
                <article key={`demo-status-${item.key}`} className={`demo-status-card ${item.status}`}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <span className="badge">{item.status}</span>
                  <div className="demo-actions">
                    <button
                      className="ghost"
                      onClick={() => {
                        if (item.key === "market") {
                          setBottomTab("market");
                          setCommerceMiniTab("market");
                          setDemoDockTab("market");
                          setTimeout(() => document.getElementById("demo-market")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                          return;
                        }
                        if (item.key === "economy" || item.key === "land") {
                          setBottomTab("land");
                          setCommerceMiniTab(item.key === "land" ? "land" : commerceMiniTab);
                          setDemoDockTab(item.key === "land" ? "land" : "economy");
                          setTimeout(() => {
                            const target = item.key === "land" ? "demo-land" : "demo-economy";
                            document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 80);
                          return;
                        }
                        setBottomTab("demos");
                        handleDemoDockTab(item.key);
                      }}
                    >
                      Modulu ac
                    </button>
                    {item.key === "market" ? (
                      <>
                        <button className="ghost" onClick={seedTradeDemoData}>
                          Demo veri yukle
                        </button>
                        <button className="ghost" onClick={resetTradeDemoData}>
                          Demo temizle
                        </button>
                      </>
                    ) : null}
                    {item.key === "land" ? (
                      <>
                        <button className="ghost" onClick={seedLandDemoListings}>
                          Arazi seed
                        </button>
                        <button className="ghost" onClick={resetLandDemoListings}>
                          Seed temizle
                        </button>
                      </>
                    ) : null}
                    {item.key === "weather" ? (
                      <button className="ghost" onClick={runWeatherDemoSetup}>
                        Senaryo kur
                      </button>
                    ) : null}
                    {item.key === "soil" ? (
                      <button className="ghost" onClick={runSoilDemoSetup}>
                        Koordinat kur
                      </button>
                    ) : null}
                    {item.key === "economy" ? (
                      <button className="ghost" onClick={runFinanceDemoSetup}>
                        Finansal kur
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="demo-actions">
              <button className="ghost" onClick={runDemoSmokeTest}>Tum demolar smoke test</button>
            </div>
            {demoOpsStatus ? <small className="muted">{demoOpsStatus}</small> : null}
            {demoSmokeHistory.length ? (
              <div className="demo-smoke-history">
                {demoSmokeHistory.map((entry) => (
                  <span key={entry.id} className={`badge ${entry.ok ? "safe" : ""}`}>
                    {new Date(entry.at).toLocaleTimeString("tr-TR")} • {entry.passCount}/{entry.total || "-"}
                    {!entry.ok && entry.failed.length ? ` • ${entry.failed.slice(0, 2).join(", ")}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
            {demoSmokeResult?.items?.length ? (
              <div className="info-badges">
                {demoSmokeResult.items.map((item) => (
                  <span key={`smoke-${item.id}`} className={`badge ${item.ok ? "safe" : ""}`}>
                    {item.label}: {item.ok ? "ok" : `hata(${item.status || "-"})`}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
          )}

          {bottomTab === "demos" && isDemoVisible("land") && (
          <section id="demo-economy" className="features">
            <div className="steps-header">
              <h2>Ekonomi planlayici</h2>
              <p>Donum bazli verim, maliyet ve gelir hesaplari. Verim verisi mevcutsa otomatik gelir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Urun & bolge</h3>
                <label className="plant-select">
                  <span>Urun</span>
                  <select
                    value={econCrop || selectedPlant?.id || ""}
                    onChange={(event) => setEconCrop(event.target.value)}
                  >
                    <option value="">Urun sec</option>
                    {Object.keys(cropLabelMap).map((key) => (
                      <option key={key} value={key}>{cropLabelMap[key]}</option>
                    ))}
                  </select>
                </label>
                <label className="plant-select">
                  <span>Sehir</span>
                  <input value={city} disabled />
                </label>
                <div className="demo-actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      setCommerceMiniTab("land");
                      setTimeout(
                        () => document.getElementById("demo-land")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                        60
                      );
                    }}
                  >
                    Arazi detay formunu ac
                  </button>
                </div>
                <small className="muted">
                  Verim kaynagi: {econCrop && cropYieldKgDa[econCrop]?.source?.title ? cropYieldKgDa[econCrop].source.title : "Veri yok"}
                </small>
              </div>
              <div className="step-card">
                <h3>Canli ekonomi verisi</h3>
                {economyPlannerLoading ? <small className="muted">Internet kaynaklari cekiliyor...</small> : null}
                {economyPlannerError ? <small className="muted warning-text">{economyPlannerError}</small> : null}
                {economyPlannerData ? (
                  <>
                    <div className="info-badges">
                      <span className="badge">
                        USD/TRY: {Number(economyPlannerData?.fx?.usdTry || 0).toFixed(4)}
                      </span>
                      <span className="badge">
                        EUR/TRY: {Number(economyPlannerData?.fx?.eurTry || 0).toFixed(4)}
                      </span>
                      <span className="badge">
                        Enflasyon: %{Number(economyPlannerData?.macro?.indicators?.inflation?.latestValue || 0).toFixed(1)}
                      </span>
                      <span className="badge">
                        GDP: %{Number(economyPlannerData?.macro?.indicators?.gdpGrowth?.latestValue || 0).toFixed(1)}
                      </span>
                      <span className="badge">
                        Bugday vadeli: {Number(economyPlannerData?.commodity?.wheat?.close || 0).toFixed(2)}
                      </span>
                      <span className="badge">
                        Maliyet baskisi: {Number(economyPlannerData?.signals?.costPressureScore || 0)}/100
                      </span>
                    </div>
                    <small className="muted">
                      Onerilen satis fiyati: {Number(economyPlannerData?.signals?.suggestedPriceTlKg || 0).toFixed(2)} TL/kg
                      {" • "}
                      gelir etkisi: {Number(economyPlannerData?.signals?.deltaRevenueTl || 0).toLocaleString("tr-TR")} TL
                    </small>
                    {Array.isArray(economyPlannerData?.failedSources) && economyPlannerData.failedSources.length ? (
                      <small className="muted warning-text">
                        Ulasilamayan kaynaklar: {economyPlannerData.failedSources.join(", ")}
                      </small>
                    ) : null}
                    <small className="muted">
                      Guncelleme: {economyPlannerData?.updatedAt ? new Date(economyPlannerData.updatedAt).toLocaleTimeString("tr-TR") : "-"}
                    </small>
                    <div className="demo-actions">
                      <button
                        className="ghost"
                        onClick={() =>
                          setEconPrice(Number(economyPlannerData?.signals?.suggestedPriceTlKg || econPriceAuto || 0))
                        }
                      >
                        Onerilen fiyati uygula
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="step-card">
                <h3>Alan & verim</h3>
                <label className="plant-select">
                  <span>Alan (donum)</span>
                  <input type="number" min="0" value={econArea} onChange={(e) => setEconArea(e.target.value)} />
                </label>
                <label className="plant-select">
                  <span>Verim (kg/da)</span>
                  <input type="number" min="0" value={econYield} onChange={(e) => setEconYield(e.target.value)} />
                </label>
                <label className="plant-select">
                  <span>Fiyat (TL/kg)</span>
                  <input type="number" min="0" value={econPrice} onChange={(e) => setEconPrice(e.target.value)} />
                </label>
                {econYieldAuto ? (
                  <small className="muted">Otomatik verim: {econYieldAuto} kg/da</small>
                ) : null}
                {econPriceAuto ? (
                  <small className="muted">Referans fiyat: {econPriceAuto} TL/kg</small>
                ) : null}
                <div className="demo-actions">
                  <button
                    className="ghost"
                    onClick={() => {
                      setEconArea(20);
                      setEconYield(econYieldAuto || 650);
                      setEconPrice(econPriceAuto || 18);
                    }}
                  >
                    Hizli demo doldur
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setEconArea(5);
                      setEconYield(Math.max(300, Number(econYieldAuto || 500) - 120));
                      setEconPrice(Math.max(10, Number(econPriceAuto || 16) - 3));
                    }}
                  >
                    Kotu senaryo
                  </button>
                </div>
              </div>
              <div className="step-card">
                <h3>Maliyet kalemleri (TL)</h3>
                {Object.keys(econCosts).map((key) => (
                  <label key={key} className="plant-select">
                    <span>{key}</span>
                    <input
                      type="number"
                      min="0"
                      value={econCosts[key]}
                      onChange={(e) =>
                        setEconCosts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <div className="demo-actions">
                  <button className="ghost" onClick={() => setEconCosts({ ...defaultCosts })}>
                    Varsayilana don
                  </button>
                </div>
              </div>
              <div className="step-card">
                <h3>Arsa degeri</h3>
                <div className="land-hero-visual">
                  <div className="land-orb land-orb-main">
                    <span>Guncel</span>
                    <strong>{Number(landPriceData?.priceTlDa || econLandValue || 0).toLocaleString("tr-TR")} TL/da</strong>
                  </div>
                  <div className="land-orb">
                    <span>API</span>
                    <strong>{landPriceData?.providerCount || 0}</strong>
                  </div>
                  <div className="land-orb">
                    <span>Guven</span>
                    <strong>%{Math.round(Number(landPriceData?.confidenceScore || 0) * 100)}</strong>
                  </div>
                </div>
                <label className="plant-select">
                  <span>Arsa bedeli (TL/da)</span>
                  <input type="number" min="0" value={econLandValue} onChange={(e) => setEconLandValue(e.target.value)} />
                </label>
                {landPriceLoading && <small className="muted">Arazi fiyat API verisi aliniyor...</small>}
                {landPriceData?.priceTlDa ? (
                  <>
                    <small className="muted">
                      API fiyat: {Number(landPriceData.priceTlDa).toLocaleString("tr-TR")} TL/da •
                      aralik {Number(landPriceData.minTlDa || 0).toLocaleString("tr-TR")} -{" "}
                      {Number(landPriceData.maxTlDa || 0).toLocaleString("tr-TR")} TL/da
                    </small>
                    <small className="muted">
                      Kaynak: {landPriceData.sourceTitle || landPriceData.source}
                      {landPriceData.method ? ` • yontem ${landPriceData.method}` : ""}
                      {landPriceData.confidenceScore
                        ? ` • guven %${Math.round(Number(landPriceData.confidenceScore) * 100)}`
                        : ""}
                      {landPriceData.updatedAt ? ` • ${new Date(landPriceData.updatedAt).toLocaleTimeString("tr-TR")}` : ""}
                    </small>
                    {landPriceData.coords ? <small className="muted">Koordinat: {landPriceData.coords}</small> : null}
                    {landPriceData.signalCount ? (
                      <small className="muted">Internet sinyali: {landPriceData.signalCount} fiyat kaydi</small>
                    ) : null}
                    {landPriceData.trendSignal ? (
                      <small className="muted">
                        Trend: %{Number(landPriceData.trendSignal.momentumPct || 0).toFixed(2)} • Son 30g medyan{" "}
                        {Number(landPriceData.trendSignal.recentMedianTlDa || 0).toLocaleString("tr-TR")} TL/da
                      </small>
                    ) : null}
                    {landPriceData.contextInsights ? (
                      <small className="muted">
                        Piyasa konumu: {landPriceData.contextInsights.marketPosition}
                        {" • "}Referans {Number(landPriceData.contextInsights.referencePriceTlDa || 0).toLocaleString("tr-TR")} TL/da
                        {" • "}Prim %{Number(landPriceData.contextInsights.premiumPct || 0).toFixed(1)}
                      </small>
                    ) : null}
                    {landPriceData.contextInsights?.districtRank ? (
                      <small className="muted">
                        Ilce sirasi: {landPriceData.contextInsights.districtRank}/{landPriceData.contextInsights.districtTotal || "-"}
                        {" • "}Veri tazeligi skoru: {landPriceData.contextInsights.freshnessScore || 0}/100
                      </small>
                    ) : null}
                    {landPriceData.adjustment ? (
                      <small className="muted">
                        Girdi carpani: x{Number(landPriceData.adjustment.factor || 1).toFixed(3)} • Ham{" "}
                        {Number(landPriceData.rawPriceTlDa || 0).toLocaleString("tr-TR")} TL/da
                      </small>
                    ) : null}
                    {landPriceData.decisionSignals ? (
                      <small className="muted">
                        Yatirim skoru: {landPriceData.decisionSignals.score}/100 ({landPriceData.decisionSignals.grade})
                        {" • "}Stabilite {landPriceData.decisionSignals.stabilityScore}/100
                        {" • "}Ornek kalitesi {landPriceData.decisionSignals.sampleScore}/100
                      </small>
                    ) : null}
                    {Number.isFinite(Number(landPriceData.uncertaintyPct)) ? (
                      <small className="muted">Belirsizlik: +/- %{Number(landPriceData.uncertaintyPct).toFixed(0)}</small>
                    ) : null}
                    {landPriceData.listingCount ? (
                      <small className="muted">Ilan ornegi: {landPriceData.listingCount}</small>
                    ) : null}
                    {landPriceData.geoNeighborCount ? (
                      <small className="muted">
                        Geo komsu: {landPriceData.geoNeighborCount}
                        {Number.isFinite(Number(landPriceData.geoAvgDistanceKm))
                          ? ` • ort mesafe ${Number(landPriceData.geoAvgDistanceKm).toFixed(1)} km`
                          : ""}
                      </small>
                    ) : null}
                    {landPriceData.componentCount ? (
                      <small className="muted">Hibrit bilesen: {landPriceData.componentCount}</small>
                    ) : null}
                    {landPriceData.providerCount ? (
                      <small className="muted">API uzlasi sayisi: {landPriceData.providerCount}</small>
                    ) : null}
                    {landPriceData.failedProviderCount ? (
                      <small className="muted warning-text">
                        Basarisiz API: {landPriceData.failedProviderCount}
                      </small>
                    ) : null}
                    {Array.isArray(landPriceData.providerResults) && landPriceData.providerResults.length ? (
                      <div className="info-badges">
                        {landPriceData.providerResults.slice(0, 4).map((item) => (
                          <span className="badge" key={`${item.source}-${item.url}`}>
                            {item.sourceTitle || item.source}: {Number(item.priceTlDa).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(landPriceData.components) && landPriceData.components.length ? (
                      <div className="info-badges">
                        {landPriceData.components.slice(0, 4).map((item) => (
                          <span className="badge" key={`${item.source}-${item.priceTlDa}`}>
                            {item.sourceTitle || item.source}: {Number(item.priceTlDa || 0).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(landPriceData.scenarios) && landPriceData.scenarios.length ? (
                      <div className="info-badges">
                        {landPriceData.scenarios.map((item) => (
                          <span className="badge" key={`lp-scn-${item.id}`}>
                            {item.label}: {Number(item.unitPriceTlDa || 0).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {landPriceData.decisionSignals ? (
                      <div className="info-badges">
                        <span className="badge">
                          Onerilen alim: {Number(landPriceData.decisionSignals.suggestedBidTlDa || 0).toLocaleString("tr-TR")} TL/da
                        </span>
                        <span className="badge">
                          Onerilen ilan: {Number(landPriceData.decisionSignals.suggestedAskTlDa || 0).toLocaleString("tr-TR")} TL/da
                        </span>
                        <span className="badge">
                          Pazarlik araligi: %{Number(landPriceData.decisionSignals.suggestedSpreadPct || 0).toFixed(1)}
                        </span>
                      </div>
                    ) : null}
                    {Array.isArray(landPriceData.contextInsights?.topDistricts) &&
                    landPriceData.contextInsights.topDistricts.length ? (
                      <div className="info-badges">
                        {landPriceData.contextInsights.topDistricts.slice(0, 2).map((item) => (
                          <span className="badge" key={`lp-top-${item.district}`}>
                            Ust ilce: {item.district} {Number(item.medianTlDa || 0).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                        {landPriceData.contextInsights.lowDistricts?.slice(0, 1).map((item) => (
                          <span className="badge" key={`lp-low-${item.district}`}>
                            Alt ilce: {item.district} {Number(item.medianTlDa || 0).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => setEconLandValue(Number(landPriceData.priceTlDa) || 0)}>
                        API fiyatini uygula
                      </button>
                    </div>
                  </>
                ) : null}
                {landPriceError && <small className="muted warning-text">{landPriceError}</small>}
                {landPriceSources.length ? (
                  <small className="muted">Bagli fiyat API sayisi: {landPriceSources.length}</small>
                ) : null}
                {landProvidersHealth ? (
                  <small className="muted">
                    API sagligi: {landProvidersHealth.healthy || 0}/{landProvidersHealth.total || 0} aktif
                  </small>
                ) : null}
                {landCompareLoading ? <small className="muted">Kaynak karsilastirma yukleniyor...</small> : null}
                {landCompareError ? <small className="muted warning-text">{landCompareError}</small> : null}
                {landCompareData ? (
                  <div className="info-badges">
                    {landCompareData.remote?.priceTlDa ? (
                      <span className="badge">
                        API {Number(landCompareData.remote.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.manual?.priceTlDa ? (
                      <span className="badge">
                        Ilan {Number(landCompareData.manual.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.comparable?.priceTlDa ? (
                      <span className="badge">
                        Emsal {Number(landCompareData.comparable.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.geoKnn?.priceTlDa ? (
                      <span className="badge safe">
                        Geo model {Number(landCompareData.geoKnn.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.internet?.priceTlDa ? (
                      <span className="badge">
                        Net {Number(landCompareData.internet.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.model?.priceTlDa ? (
                      <span className="badge">
                        Model {Number(landCompareData.model.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.trendModel?.priceTlDa ? (
                      <span className="badge">
                        Trend {Number(landCompareData.trendModel.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.ensemble?.priceTlDa ? (
                      <span className="badge safe">
                        Ensemble {Number(landCompareData.ensemble.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {landCompareData.adjustedEnsemble?.priceTlDa ? (
                      <span className="badge safe">
                        Ayarli ensemble {Number(landCompareData.adjustedEnsemble.priceTlDa).toLocaleString("tr-TR")} TL/da
                      </span>
                    ) : null}
                    {Number.isFinite(Number(landCompareData.adjustedUncertaintyPct)) ? (
                      <span className="badge">Belirsizlik %{Number(landCompareData.adjustedUncertaintyPct).toFixed(0)}</span>
                    ) : null}
                  </div>
                ) : null}
                <details className="accordion compact">
                  <summary>Manuel ilan veri yonetimi</summary>
                  <label className="plant-select">
                    <span>Ilce</span>
                    <input
                      list="location-manual-district-suggestions"
                      value={manualListingForm.district}
                      onChange={(e) => setManualListingForm((prev) => ({ ...prev, district: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Mahalle</span>
                    <input
                      list="location-manual-neighborhood-suggestions"
                      value={manualListingForm.neighborhood}
                      onChange={(e) => setManualListingForm((prev) => ({ ...prev, neighborhood: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Ilan basligi</span>
                    <input
                      value={manualListingForm.title}
                      onChange={(e) => setManualListingForm((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Ilan linki</span>
                    <input
                      value={manualListingForm.url}
                      onChange={(e) => setManualListingForm((prev) => ({ ...prev, url: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Fiyat (TL/da)</span>
                    <input
                      type="number"
                      min="0"
                      value={manualListingForm.priceTlDa}
                      onChange={(e) => setManualListingForm((prev) => ({ ...prev, priceTlDa: e.target.value }))}
                    />
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={saveManualListing}>
                      Ilan ekle
                    </button>
                  </div>
                  <label className="plant-select">
                    <span>CSV import</span>
                    <textarea
                      rows={4}
                      placeholder="city,district,crop,priceTlDa,title,url"
                      value={manualCsv}
                      onChange={(e) => setManualCsv(e.target.value)}
                    />
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={importManualCsv}>
                      CSV import et
                    </button>
                    <button className="ghost" onClick={seedLandDemoListings}>
                      Demo ilan yukle
                    </button>
                    <button className="ghost" onClick={resetLandDemoListings}>
                      Demo temizle
                    </button>
                    <button className="ghost" onClick={loadLiveLandListings}>
                      Canli ilan cek
                    </button>
                    <button className="ghost" onClick={loadManualListings}>
                      Listeyi yenile
                    </button>
                    <button className="ghost" onClick={upsertLandListingCalendarTask}>
                      Takvime gorev ekle
                    </button>
                    <button className="ghost" onClick={upsertLandListingReportTask}>
                      Aylik rapor gorevi
                    </button>
                    <button className="ghost" onClick={exportLandListingsReportTxt}>
                      TXT rapor indir
                    </button>
                    <button className="ghost" onClick={exportLandListingsCsv}>
                      CSV indir
                    </button>
                  </div>
                  {manualListingStatus ? <small className="muted">{manualListingStatus}</small> : null}
                  {manualListingsLoading ? <small className="muted">Ilanlar yukleniyor...</small> : null}
                  {manualListingStats ? (
                    <div className="info-badges">
                      <span className="badge">Ilan: {manualListingStats.count}</span>
                      <span className="badge">
                        Medyan: {manualListingStats.median.toLocaleString("tr-TR")} TL/da
                      </span>
                      <span className="badge">
                        Min/Max: {manualListingStats.min.toLocaleString("tr-TR")} / {manualListingStats.max.toLocaleString("tr-TR")}
                      </span>
                      <span className="badge">
                        7 gun degisim: %{manualListingStats.weeklyChangePct}
                      </span>
                      <button className="ghost" onClick={() => setEconLandValue(manualListingStats.median)}>
                        Ilan medyanini uygula
                      </button>
                    </div>
                  ) : null}
                  {manualVsApiDelta ? (
                    <>
                      <small
                        className={`muted ${Math.abs(manualVsApiDelta.pct) >= 20 ? "warning-text" : ""}`}
                      >
                        API vs Ilan farki: %{manualVsApiDelta.pct} (
                        {manualVsApiDelta.diff.toLocaleString("tr-TR")} TL/da)
                      </small>
                      {Math.abs(manualVsApiDelta.pct) >= 20 ? (
                        <div className="demo-actions">
                          <button className="ghost" onClick={() => upsertLandDeltaAlertTask(manualVsApiDelta.pct)}>
                            Fark alarmi gorevi olustur
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {manualListingTrend.length ? (
                    <div className="land-trend-wrap">
                      <div className="demo-actions">
                        <button
                          className={manualTrendRange === "14d" ? "primary" : "ghost"}
                          onClick={() => setManualTrendRange("14d")}
                        >
                          14 gun
                        </button>
                        <button
                          className={manualTrendRange === "30d" ? "primary" : "ghost"}
                          onClick={() => setManualTrendRange("30d")}
                        >
                          30 gun
                        </button>
                      </div>
                      <small className="muted">
                        Son {manualTrendRange === "30d" ? "30" : "14"} gun medyan fiyat trendi (TL/da)
                      </small>
                      <div className="land-trend-chart">
                        {manualListingTrend.map((item, idx) => {
                          const h = Math.max(10, Math.min(56, Math.round(item.value / 6000)));
                          const prevVal = idx > 0 ? manualListingTrend[idx - 1]?.value || item.value : item.value;
                          const tone = item.value >= prevVal ? "up" : "down";
                          return (
                            <div
                              key={item.date}
                              className={`land-trend-bar ${tone}`}
                              style={{ height: `${h}px` }}
                              title={`${item.date} • ${item.value.toLocaleString("tr-TR")} TL/da • ${item.count} ilan`}
                            />
                          );
                        })}
                      </div>
                      {manualTrendInsights ? (
                        <div className="info-badges">
                          <span className="badge">
                            Son: {manualTrendInsights.latest.toLocaleString("tr-TR")} TL/da
                          </span>
                          <span className="badge">
                            Ort: {manualTrendInsights.avg.toLocaleString("tr-TR")} TL/da
                          </span>
                          <span className="badge">
                            Gunluk fark: %{manualTrendInsights.diffPct}
                          </span>
                          <span className="badge">
                            Oynaklik: {manualTrendInsights.volatility.toLocaleString("tr-TR")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {manualListings.length ? (
                    <ul>
                      {manualListings.slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <strong>{item.title || `${item.city} ${item.district || ""} ${item.neighborhood || ""}`}</strong>
                          <span>
                            {Number(item.priceTlDa || 0).toLocaleString("tr-TR")} TL/da • {item.source}
                          </span>
                          <button className="ghost" onClick={() => removeManualListing(item.id)}>
                            Sil
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small className="muted">Manuel ilan kaydi yok.</small>
                  )}
                  {liveLandListings.length ? (
                    <>
                      <small className="muted">Canli tarla ilanlari (internet):</small>
                      <ul>
                        {liveLandListings.slice(0, 8).map((item, idx) => (
                          <li key={`live-${idx}-${item.source || ""}`}>
                            <strong>{Number(item.priceTlDa || 0).toLocaleString("tr-TR")} TL/da</strong>
                            <span>
                              Toplam {Number(item.totalPriceTl || 0).toLocaleString("tr-TR")} TL •{" "}
                              {Number(item.areaDa || 0).toLocaleString("tr-TR")} da
                            </span>
                            {item.source ? (
                              <a href={item.source} target="_blank" rel="noreferrer">
                                Kaynak
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </details>
                {landPriceHistory.length ? (
                  <div className="land-mini-chart">
                    {landPriceHistory.slice(0, 10).map((item) => {
                      const v = Number(item.priceTlDa || 0);
                      const h = Math.max(8, Math.min(42, Math.round(v / 8000)));
                      return (
                        <div
                          key={`${item.ts}-${item.source}-${v}`}
                          className="land-mini-bar"
                          style={{ height: `${h}px` }}
                          title={`${new Date(item.ts).toLocaleTimeString("tr-TR")} • ${v.toLocaleString("tr-TR")} TL/da`}
                        />
                      );
                    })}
                  </div>
                ) : null}
                <div className="score-pill">Toplam arsa: {econTotals.landValue.toLocaleString("tr-TR")} TL</div>
              </div>
              <div className="step-card">
                <h3>Hesap ozet</h3>
                <p>Toplam gelir: {econTotals.revenue.toLocaleString("tr-TR")} TL</p>
                <p>Toplam maliyet: {econTotals.cost.toLocaleString("tr-TR")} TL</p>
                <p>Toplam urun: {Math.round(econTotals.totalYieldKg).toLocaleString("tr-TR")} kg</p>
                <p>Birim maliyet: {econTotals.unitCostKg.toFixed(2)} TL/kg</p>
                <div className="score-pill">Net: {econTotals.net.toLocaleString("tr-TR")} TL</div>
                <small className="muted">ROI: %{econTotals.roi}</small>
                <small className="muted">Brut marj: %{Math.round(econTotals.marginPct)}</small>
              </div>
              <div className="step-card">
                <h3>Basa bas analizi</h3>
                <p>Basa bas fiyat: {econTotals.breakEvenPrice.toFixed(2)} TL/kg</p>
                <p>Basa bas verim: {Math.round(econTotals.breakEvenYield).toLocaleString("tr-TR")} kg/da</p>
                <p>Da basi maliyet: {Math.round(econTotals.costPerDa).toLocaleString("tr-TR")} TL</p>
                <div className="score-pill">
                  {(Number(econPrice) || 0) >= econTotals.breakEvenPrice ? "Karlilik esitigi asildi" : "Fiyat esitigi altinda"}
                </div>
              </div>
              <div className="step-card">
                <h3>3 senaryo net kar</h3>
                <ul>
                  {econTotals.scenarios.map((item) => (
                    <li key={item.key}>
                      {item.key}: {Math.round(item.net).toLocaleString("tr-TR")} TL
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          )}

          {bottomTab === "demos" && (isDemoVisible("land") || isDemoVisible("market")) && (
            <section className="features commerce-mini-nav">
              <div className="steps-header">
                <h2>Ticaret mini-app</h2>
                <p>Arazi ve pazar modullerini tek alanda sekmeli kullan.</p>
              </div>
              <div className="commerce-tabs">
                <button
                  type="button"
                  className={commerceMiniTab === "land" ? "active" : ""}
                  onClick={() => {
                    setCommerceMiniTab("land");
                    document.getElementById("demo-land")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Arazi fiyat
                </button>
                <button
                  type="button"
                  className={commerceMiniTab === "market" ? "active" : ""}
                  onClick={() => {
                    setCommerceMiniTab("market");
                    document.getElementById("demo-market")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Pazar yeri
                </button>
              </div>
            </section>
          )}

          {(bottomTab === "demos" && isDemoVisible("land") && commerceMiniTab === "land") && (
          <section id="demo-land" className="features">
            <div className="steps-header">
              <h2>Arazi fiyat bicme demo</h2>
              <p>Arazi parametrelerini ayri bir panelde degerlendir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <div className="market-offer-summary">
                  <strong>Benim arazi profillerim</strong>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Profil adi</span>
                      <input
                        value={landProfileName}
                        onChange={(e) => setLandProfileName(e.target.value)}
                        placeholder="Orn: Yesilyurt 20da"
                      />
                    </label>
                    <div className="demo-actions" style={{ alignItems: "end" }}>
                      <button className="ghost" onClick={saveCurrentLandProfile}>Profili kaydet</button>
                    </div>
                  </div>
                  {landProfileStatus ? <small className="muted">{landProfileStatus}</small> : null}
                  {landProfiles.length ? (
                    <ul className="marketplace-list">
                      {landProfiles.slice(0, 6).map((profile) => (
                        <li key={`land-profile-${profile.id}`}>
                          <strong>{profile.name}</strong>
                          <span>
                            {profile.city || "-"} • {profile.crop || "-"} • {Number(profile?.landDemo?.areaDa || 0)} da
                          </span>
                          <div className="demo-actions">
                            <button className="ghost" onClick={() => applyLandProfile(profile)}>Uygula</button>
                            <button className="ghost" onClick={() => deleteLandProfile(profile.id)}>Sil</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small className="muted">Kayitli arazi profili yok.</small>
                  )}
                </div>
                <div className="field-grid-2">
                  <label className="plant-select">
                    <span>Sehir</span>
                    <input
                      list="location-city-suggestions"
                      value={landQuery.city}
                      placeholder={city || "Malatya"}
                      onChange={(e) => handleLandCityInputChange(e.target.value)}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Urun</span>
                    <input
                      value={landQuery.crop}
                      placeholder={econCrop || selectedPlant?.id || "domates"}
                      onChange={(e) => setLandQuery((prev) => ({ ...prev, crop: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="plant-select">
                  <span>Koordinat (lat, lon)</span>
                  <input
                    value={fieldLocation.coords}
                    placeholder="38.355, 38.309"
                    onChange={(e) => setFieldLocation((prev) => ({ ...prev, coords: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Ilce</span>
                  <input
                    list="location-land-district-suggestions"
                    value={landDemo.district}
                    placeholder="Orn: Yesilyurt"
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, district: e.target.value, neighborhood: "" }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Mahalle</span>
                  <input
                    list="location-land-neighborhood-suggestions"
                    value={landDemo.neighborhood}
                    placeholder="Orn: Bostanbasi"
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, neighborhood: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Parsel alani (da)</span>
                  <input
                    type="number"
                    min="0"
                    value={landDemo.areaDa}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, areaDa: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Egim (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={landDemo.slopePct}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, slopePct: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Sulama</span>
                  <select
                    value={landDemo.irrigation}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, irrigation: e.target.value }))}
                  >
                    <option value="var">Var</option>
                    <option value="yok">Yok</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Yol erisimi</span>
                  <select
                    value={landDemo.roadAccess}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, roadAccess: e.target.value }))}
                  >
                    <option value="iyi">Iyi</option>
                    <option value="orta">Orta</option>
                    <option value="zayif">Zayif</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Yola uzaklik (m)</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={landDemo.roadDistanceM}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, roadDistanceM: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Yol gecisi</span>
                  <select
                    value={landDemo.roadPass}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, roadPass: e.target.value }))}
                  >
                    <option value="var">Var</option>
                    <option value="yok">Yok</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Imar durumu</span>
                  <select
                    value={landDemo.zoningStatus}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, zoningStatus: e.target.value }))}
                  >
                    <option value="var">Var</option>
                    <option value="kismi">Kismi</option>
                    <option value="yok">Yok</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Arazide yapi</span>
                  <select
                    value={landDemo.structureStatus}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, structureStatus: e.target.value }))}
                  >
                    <option value="yok">Yok</option>
                    <option value="var">Var</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Bolge tipi</span>
                  <select
                    value={landDemo.zone}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, zone: e.target.value }))}
                  >
                    <option value="ova">Ova</option>
                    <option value="gecis">Gecis</option>
                    <option value="yamac">Yamac</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Toprak skoru (0-100)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={landDemo.soilScore}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, soilScore: e.target.value }))}
                  />
                </label>
                <label className="plant-select">
                  <span>Parsel durumu</span>
                  <select
                    value={landDemo.plantedStatus}
                    onChange={(e) =>
                      setLandDemo((prev) => ({
                        ...prev,
                        plantedStatus: e.target.value,
                        plantedCrop: e.target.value === "ekili" ? prev.plantedCrop : "",
                        plantedValueTlDa: e.target.value === "ekili" ? prev.plantedValueTlDa : 0
                      }))
                    }
                  >
                    <option value="bos">Bos</option>
                    <option value="ekili">Ekili</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Ekili urun</span>
                  <input
                    value={landDemo.plantedCrop}
                    placeholder="Orn: domates"
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedCrop: e.target.value }))}
                    disabled={landDemo.plantedStatus !== "ekili"}
                  />
                </label>
                <label className="plant-select">
                  <span>Urun degeri (TL/da)</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={landDemo.plantedValueTlDa}
                    onChange={(e) => setLandDemo((prev) => ({ ...prev, plantedValueTlDa: e.target.value }))}
                    disabled={landDemo.plantedStatus !== "ekili"}
                  />
                </label>
                <p>Baz API rayici: {landValuationDemo.base.toLocaleString("tr-TR")} TL/da</p>
                <p>Bolge: {(landMlData?.region || landValuationDemo.region || "bilinmiyor").toUpperCase()}</p>
                <p>Cari deger: {landValuationDemo.unitPrice.toLocaleString("tr-TR")} TL/da</p>
                <p>Aralik: {landValuationDemo.min.toLocaleString("tr-TR")} - {landValuationDemo.max.toLocaleString("tr-TR")} TL/da</p>
                <div className="score-pill">Tahmini toplam: {landValuationDemo.total.toLocaleString("tr-TR")} TL</div>
                {landValuationDemo.planted ? (
                  <>
                    <p>Ekili urun: {landValuationDemo.plantedCrop || "-"}</p>
                    <p>
                      Ekili urun degeri: {Number(landValuationDemo.plantedValuePerDa || 0).toLocaleString("tr-TR")} TL/da
                      {" • "}toplam {Number(landValuationDemo.plantedTotal || 0).toLocaleString("tr-TR")} TL
                    </p>
                  </>
                ) : (
                  <p>Ekili urun: yok</p>
                )}
                <div className="score-pill">Toplam varlik: {Number(landValuationDemo.totalWithCrop || landValuationDemo.total || 0).toLocaleString("tr-TR")} TL</div>
                {Number.isFinite(Number(landInvestmentLens.annualNetPerDa)) ? (
                  <small className="muted">Yillik net/da: {Number(landInvestmentLens.annualNetPerDa).toLocaleString("tr-TR")} TL</small>
                ) : null}
                {landInvestmentLens.paybackYears ? (
                  <small className="muted">Geri donus: {Number(landInvestmentLens.paybackYears).toFixed(1)} yil</small>
                ) : null}
                {landMlLoading ? <small className="muted">ML modeli egitiliyor...</small> : null}
                {landMlError ? <small className="muted warning-text">{landMlError}</small> : null}
                {landMlData ? (
                  <>
                    <p>
                      ML birim tahmin: {Number(landMlData.unitPriceTlDa || 0).toLocaleString("tr-TR")} TL/da
                      {" • "}guven %{Math.round(Number(landMlData.confidenceScore || 0) * 100)}
                    </p>
                    <p>
                      ML aralik: {Number(landMlData.minTlDa || 0).toLocaleString("tr-TR")} -{" "}
                      {Number(landMlData.maxTlDa || 0).toLocaleString("tr-TR")} TL/da
                    </p>
                    {Number.isFinite(Number(landMlData.uncertaintyPct)) ? (
                      <small className="muted">Belirsizlik bandi: +/- %{Number(landMlData.uncertaintyPct).toFixed(0)}</small>
                    ) : null}
                    {Number.isFinite(Number(landMlData.trendPct)) ? (
                      <small className="muted">Trend etkisi: %{Number(landMlData.trendPct).toFixed(2)}</small>
                    ) : null}
                    {Number(landMlData.totalPriceTl || 0) > 0 ? (
                      <small className="muted">
                        ML toplam: {Number(landMlData.totalPriceTl).toLocaleString("tr-TR")} TL
                      </small>
                    ) : null}
                    <div className="info-badges">
                      <span className="badge">Ornek: {landMlData?.training?.sampleCount || 0}</span>
                      <span className="badge">Ilan: {landMlData?.training?.manualCount || 0}</span>
                      <span className="badge">Sentetik: {landMlData?.training?.syntheticCount || 0}</span>
                      <span className="badge">Yerel sinyal: {landMlData?.training?.localSignalCount || 0}</span>
                      <span className="badge">RMSE: {(landMlData?.training?.rmseTlDa || 0).toLocaleString("tr-TR")} TL</span>
                      {landMlData?.preferredModel ? <span className="badge">Aktif model: {landMlData.preferredModel}</span> : null}
                    </div>
                    <div className="demo-actions">
                      <button className="ghost" onClick={() => setEconLandValue(Number(landMlData.unitPriceTlDa || 0))}>
                        ML fiyatini uygula
                      </button>
                      <button className="ghost" onClick={() => trainCustomLandPriceModel({ prefetch: true })}>
                        Bu araziye gore modeli guncelle
                      </button>
                    </div>
                    {Array.isArray(landMlData.scenarios) && landMlData.scenarios.length ? (
                      <div className="info-badges">
                        {landMlData.scenarios.map((item) => (
                          <span className="badge" key={item.id}>
                            {item.label}: {Number(item.unitPriceTlDa || 0).toLocaleString("tr-TR")} TL/da
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {landCustomModelTrainStatus ? <small className="muted">{landCustomModelTrainStatus}</small> : null}
                    {landCustomModelStatus ? (
                      <small className="muted">
                        Parsel modeli: {landCustomModelStatus.version || "-"} • ornek {landCustomModelStatus.sampleCount || 0} •
                        R2 {Number(landCustomModelStatus?.metrics?.r2 || 0).toFixed(2)}
                      </small>
                    ) : null}
                    {landMlData?.modelSelection?.reason ? (
                      <small className="muted">
                        Model secimi: {landMlData.modelSelection.reason}
                      </small>
                    ) : null}
                    <div className="info-badges">
                      <span className={`badge ${landSignalQuality.score >= 70 ? "safe" : ""}`}>
                        Konum kalite skoru: {landSignalQuality.score}/100
                      </span>
                      <span className="badge">Geo komsu: {landSignalQuality.geoCount}</span>
                      <span className="badge">Ort mesafe: {Number(landSignalQuality.avgKm || 0).toFixed(1)} km</span>
                      <span className="badge">Guven: %{landSignalQuality.confidencePct}</span>
                    </div>
                    {landLocationScope ? (
                      <div className="info-badges">
                        <span className="badge">Piyasa konumu: {landLocationScope.position}</span>
                        <span className="badge">Mahalle sirasi: {landLocationScope.neighborhoodRank}</span>
                        <span className="badge">Ilce sirasi: {landLocationScope.districtRank}</span>
                        <span className="badge">Tazelik: {landLocationScope.freshness}/100</span>
                        <span className="badge">Ornek: {landLocationScope.sampleCount}</span>
                      </div>
                    ) : null}
                    {landActionPlan ? (
                      <>
                        <div className="info-badges">
                          <span className={`badge ${landActionPlan.score >= 70 ? "safe" : ""}`}>
                            Karar skoru: {landActionPlan.score}/100
                          </span>
                          <span className="badge">Belirsizlik: %{landActionPlan.uncertainty}</span>
                          <span className="badge">Strateji: {landActionPlan.strategy}</span>
                        </div>
                        <ul>
                          {landActionPlan.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                        <div className="demo-actions">
                          <button
                            className="ghost"
                            onClick={() => setEconLandValue(Number(landPriceData?.minTlDa || landValuationDemo.min || 0))}
                          >
                            Temkinli fiyat uygula
                          </button>
                          <button
                            className="ghost"
                            onClick={() =>
                              setEconLandValue(Number(landPriceData?.priceTlDa || landValuationDemo.unitPrice || 0))
                            }
                          >
                            Baz fiyat uygula
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setEconLandValue(Number(landPriceData?.maxTlDa || landValuationDemo.max || 0))}
                          >
                            Agresif fiyat uygula
                          </button>
                        </div>
                      </>
                    ) : null}
                    {landDistrictBenchmark ? (
                      <div className="info-badges">
                        {landDistrictBenchmark.neighborhoodMedian ? (
                          <span className="badge">
                            Mahalle medyan: {Number(landDistrictBenchmark.neighborhoodMedian).toLocaleString("tr-TR")} TL/da
                          </span>
                        ) : null}
                        {landDistrictBenchmark.districtMedian ? (
                          <span className="badge">
                            Ilce medyan: {Number(landDistrictBenchmark.districtMedian).toLocaleString("tr-TR")} TL/da
                          </span>
                        ) : null}
                        {landDistrictBenchmark.cityMedian ? (
                          <span className="badge">
                            Il medyan: {Number(landDistrictBenchmark.cityMedian).toLocaleString("tr-TR")} TL/da
                          </span>
                        ) : null}
                        <span className={`badge ${Math.abs(Number(landDistrictBenchmark.deltaPct || 0)) <= 12 ? "safe" : ""}`}>
                          API sapma: %{Number(landDistrictBenchmark.deltaPct || 0).toFixed(1)}
                        </span>
                        <span className="badge">
                          Emsal adet: m {landDistrictBenchmark.neighborhoodCount || 0} • i {landDistrictBenchmark.districtCount || 0} • il {landDistrictBenchmark.cityCount || 0}
                        </span>
                      </div>
                    ) : null}
                    {landDistrictHeatmap.length ? (
                      <>
                        <div className="demo-actions">
                          {landDistrictLeaders.high ? (
                            <button
                              className="ghost"
                              onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.high.district, neighborhood: "" }))}
                            >
                              En yuksek ilce: {landDistrictLeaders.high.district}
                            </button>
                          ) : null}
                          {landDistrictLeaders.low ? (
                            <button
                              className="ghost"
                              onClick={() => setLandDemo((prev) => ({ ...prev, district: landDistrictLeaders.low.district, neighborhood: "" }))}
                            >
                              En dusuk ilce: {landDistrictLeaders.low.district}
                            </button>
                          ) : null}
                        </div>
                        <div className="land-heatmap-grid">
                          {landDistrictHeatmap.map((item) => (
                            <button
                              key={`heat-${item.district}`}
                              type="button"
                              className="land-heatmap-card"
                              onClick={() => {
                                setLandDemo((prev) => ({ ...prev, district: item.district, neighborhood: "" }));
                                setBottomTab("land");
                                setCommerceMiniTab("land");
                                setDemoDockTab("land");
                                setTimeout(
                                  () =>
                                    document
                                      .getElementById("demo-land")
                                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                                  60
                                );
                              }}
                              title="Bu ilceyi arazi modeline uygula"
                            >
                              <div className="land-heatmap-head">
                                <strong>{item.district}</strong>
                                <span>{item.count} ilan</span>
                              </div>
                              <p>{Number(item.median).toLocaleString("tr-TR")} TL/da</p>
                              <small className={Math.abs(item.deltaPct) <= 10 ? "muted" : "warning-text"}>
                                Sehir medyan farki: %{item.deltaPct}
                              </small>
                              <div className="land-heatmap-bar">
                                <span style={{ width: `${item.intensity}%` }} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {landNeighborhoodHeatmap.length ? (
                      <>
                        <small className="muted">
                          Mahalle isı haritasi{landDemo?.district ? ` (${landDemo.district})` : ""}: bir mahalle secerek modeli daralt.
                        </small>
                        <div className="land-heatmap-grid">
                          {landNeighborhoodHeatmap.map((item) => (
                            <button
                              key={`nheat-${item.neighborhood}`}
                              type="button"
                              className="land-heatmap-card"
                              onClick={() => setLandDemo((prev) => ({ ...prev, neighborhood: item.neighborhood }))}
                              title="Bu mahalleyi arazi modeline uygula"
                            >
                              <div className="land-heatmap-head">
                                <strong>{item.neighborhood}</strong>
                                <span>{item.count} ilan</span>
                              </div>
                              <p>{Number(item.median).toLocaleString("tr-TR")} TL/da</p>
                              <small className={Math.abs(item.deltaPct) <= 10 ? "muted" : "warning-text"}>
                                Ilce medyan farki: %{item.deltaPct}
                              </small>
                              <div className="land-heatmap-bar">
                                <span style={{ width: `${item.intensity}%` }} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
                <details className="accordion compact">
                  <summary>Model carpani detaylari</summary>
                  <ul>
                    {landValuationDemo.notes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {landValuationDemo.benchmarkNote && (
                    <small className="muted">{landValuationDemo.benchmarkNote}</small>
                  )}
                </details>
              </div>
            </div>
          </section>
          )}

          {(bottomTab === "demos" && isDemoVisible("market") && commerceMiniTab === "market") && (
          <section id="demo-market" className="features">
            <div className="steps-header">
              <h2>Tarim pazari (al/sat/teklif)</h2>
              <p>Pazar akisini ayri panelde yonet.</p>
            </div>
            <div className="market-app-hero">
              <div className="market-kpis">
                <div>
                  <span>Acik ilan</span>
                  <strong>{tradeSummary?.openListingCount || 0}</strong>
                </div>
                <div>
                  <span>Satis medyan</span>
                  <strong>{Number(tradeSummary?.market?.sellMedianTlKg || 0).toFixed(2)} TL/kg</strong>
                </div>
                <div>
                  <span>Alis medyan</span>
                  <strong>{Number(tradeSummary?.market?.buyMedianTlKg || 0).toFixed(2)} TL/kg</strong>
                </div>
                <div>
                  <span>Siparis</span>
                  <strong>{tradeSummary?.orderCount || 0}</strong>
                </div>
              </div>
              <div className="market-quick-actions">
                <button className="primary" onClick={submitTradeListing}>Ilan koy</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("vitrin")}>Vitrin</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("piyasa")}>Piyasa</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("kesfet")}>Kesfet</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("eslesme")}>Eslesme</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("ilanlarim")}>Ilanlarim</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("teklifler")}>Teklifler</button>
                <button className="ghost" onClick={() => setTradeWorkspaceTab("siparisler")}>Siparisler</button>
                  <button className="ghost" onClick={seedTradeDemoData}>Demo veri yukle</button>
                  <button className="ghost" onClick={resetTradeDemoData}>Demo temizle</button>
              </div>
              <div className="market-quick-create">
                <div className="field-grid-3">
                  <label className="plant-select">
                    <span>Urun</span>
                    <input
                      value={tradeListingForm.crop}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, crop: e.target.value }))}
                      placeholder={effectiveTradeCrop || "Orn: domates"}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Sehir</span>
                    <input
                      list="location-city-suggestions"
                      value={tradeListingForm.city}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder={effectiveTradeCity || "Orn: Malatya"}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Baslik</span>
                    <input
                      value={tradeListingForm.title}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Orn: Domates satilik"
                    />
                  </label>
                  <label className="plant-select">
                    <span>Miktar (kg)</span>
                    <input
                      type="number"
                      min="1"
                      value={tradeListingForm.quantityKg}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Fiyat (TL/kg)</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={tradeListingForm.priceTlKg}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, priceTlKg: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="demo-actions">
                  <button className="primary" onClick={submitTradeListing}>Ilan koy</button>
                  <button className="ghost" onClick={loadTradeData}>Ilanlari yenile</button>
                  <button className="ghost" onClick={() => setTradeWorkspaceTab("ilanlarim")}>Ilanlarim sekmesine git</button>
                </div>
                {tradeStatus ? <small className="muted">{tradeStatus}</small> : null}
                <ul className="marketplace-list">
                  {tradeListings.slice(0, 6).map((item) => (
                    <li key={`quick-${item.id}`}>
                      <strong>{item.title || `${item.crop || "-"} ${item.type || ""}`}</strong>
                      <span>
                        {item.city || "-"} {item.district || ""} • {Number(item.priceTlKg || 0).toFixed(2)} TL/kg •{" "}
                        {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                      </span>
                    </li>
                  ))}
                  {!tradeListings.length ? <li className="muted">Ilan yok. "Ilan koy" ile ekle.</li> : null}
                </ul>
              </div>
            </div>
            <div className="step-grid">
              <div className="step-card trade-card ecommerce-card">
                {tradeSummary?.market ? (
                  <div className="info-badges">
                    <span className="badge">Satis medyan: {Number(tradeSummary.market.sellMedianTlKg || 0).toFixed(2)} TL/kg</span>
                    <span className="badge">Alis medyan: {Number(tradeSummary.market.buyMedianTlKg || 0).toFixed(2)} TL/kg</span>
                    <span className="badge">Teklif medyan: {Number(tradeSummary.market.offerMedianTlKg || 0).toFixed(2)} TL/kg</span>
                    <span className="badge">Acik ilan: {tradeSummary.openListingCount || 0}</span>
                    <span className="badge">Siparis: {tradeSummary.orderCount || 0}</span>
                    <span className="badge">Bildirim: {tradeAlerts.length || 0}</span>
                  </div>
                ) : null}
                <div className="marketplace-shell">
                  <div className="marketplace-topbar">
                    <label className="plant-select">
                      <span>Pazar profili (ad/telefon)</span>
                      <input
                        value={tradeIdentityName}
                        onChange={(e) => setTradeIdentityName(e.target.value)}
                        placeholder="Orn: 0555 123 45 67"
                      />
                    </label>
                    <div className="info-badges">
                      <span className="badge">Ilanlarim: {tradeMyListings.length}</span>
                      <span className="badge">Tekliflerim: {tradeMyOffers.length}</span>
                      <span className="badge">Siparislerim: {tradeMyOrders.length}</span>
                    </div>
                  </div>
                  <div className="marketplace-tabs">
                    {[
                      { id: "vitrin", label: "Vitrin" },
                      { id: "piyasa", label: "Piyasa" },
                      { id: "kesfet", label: `Kesfet (${tradeFilteredListings.length})` },
                      { id: "eslesme", label: `Eslesme (${tradeMatches.length})` },
                      { id: "favoriler", label: `Favoriler (${tradeFavorites.length})` },
                      { id: "saticilar", label: `Saticilar (${tradeSellerDirectory.length})` },
                      { id: "ilanlarim", label: `Ilanlarim (${tradeMyListings.length})` },
                      { id: "teklifler", label: `Teklifler (${tradeOffers.length})` },
                      { id: "siparisler", label: `Siparisler (${tradeMyOrders.length})` },
                      { id: "mesajlar", label: `Mesajlar (${tradeMessages.length})` },
                      { id: "bildirim", label: `Bildirimler (${tradeAlerts.length})` }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        className={tradeWorkspaceTab === tab.id ? "primary" : "ghost"}
                        onClick={() => setTradeWorkspaceTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {tradeWorkspaceTab === "vitrin" ? (
                    <div className="marketplace-panel market-vitrin-panel">
                      <div className="market-vitrin-top">
                        <div>
                          <strong>Pazar vitrini</strong>
                          <p className="muted">
                            E-ticaret tarzi hizli akis: kampanyalar, sepet ve tek tikla teklif.
                          </p>
                        </div>
                        <div className="info-badges">
                          <span className="badge">Sepet urun: {tradeCartSummary.itemCount}</span>
                          <span className="badge">Toplam kg: {Math.round(tradeCartSummary.totalQtyKg).toLocaleString("tr-TR")}</span>
                          <span className="badge safe">
                            Tutar: {Math.round(tradeCartSummary.totalTl).toLocaleString("tr-TR")} TL
                          </span>
                          <span className="badge">
                            En iyi alis: {Number(tradeDashboard?.market?.bestBid || 0).toFixed(2)} TL/kg
                          </span>
                          <span className="badge">
                            En iyi satis: {Number(tradeDashboard?.market?.bestAsk || 0).toFixed(2)} TL/kg
                          </span>
                          <span className="badge">
                            Gerceklesen hacim: {Math.round(Number(tradeDashboard?.orders?.fulfilledVolumeKg || 0)).toLocaleString("tr-TR")} kg
                          </span>
                        </div>
                      </div>
                      <div className="market-campaign-row">
                        {tradeMarketCampaigns.map((item) => (
                          <article key={item.id} className="market-campaign-card">
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            <button className="ghost" onClick={item.action}>
                              {item.cta}
                            </button>
                          </article>
                        ))}
                      </div>
                      <div className="market-cart-strip">
                        <button className="primary" onClick={checkoutTradeCart} disabled={!tradeCartSummary.itemCount}>
                          Sepetten teklife gec
                        </button>
                        <button
                          className="ghost"
                          onClick={submitTradeCartBulkOffers}
                          disabled={!tradeCartSummary.itemCount}
                        >
                          Toplu teklif gonder
                        </button>
                        <button className="ghost" onClick={() => setTradeWorkspaceTab("kesfet")}>
                          Urunleri kesfet
                        </button>
                        <button className="ghost" onClick={clearTradeCart} disabled={!tradeCartSummary.itemCount}>
                          Sepeti temizle
                        </button>
                      </div>
                      {tradeCartItems.length ? (
                        <ul className="marketplace-list">
                          {tradeCartItems.slice(0, 10).map((row) => (
                            <li key={`cart-${row.listingId}`}>
                              <strong>{row.listing.title || row.listing.crop || row.listing.id}</strong>
                              <span>
                                {Number(row.quantityKg || 0).toLocaleString("tr-TR")} kg ×{" "}
                                {Number(row.listing.priceTlKg || 0).toFixed(2)} TL/kg
                              </span>
                              <span>Ara toplam: {Math.round(row.subtotalTl || 0).toLocaleString("tr-TR")} TL</span>
                              <label className="market-qty-input">
                                <span>Adet (kg)</span>
                                <input
                                  type="number"
                                  min="1"
                                  max={Math.max(
                                    1,
                                    Number((row.listing.availableKg ?? row.listing.quantityKg) || row.quantityKg || 1)
                                  )}
                                  step="1"
                                  value={String(Math.max(1, Number(row.quantityKg || 1)))}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value || 1);
                                    const available = Math.max(
                                      1,
                                      Number((row.listing.availableKg ?? row.listing.quantityKg) || 1)
                                    );
                                    const next = Math.max(1, Math.min(available, Number.isFinite(raw) ? raw : 1));
                                    updateTradeCartQty(row.listingId, next);
                                  }}
                                />
                              </label>
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => removeTradeCartItem(row.listingId)}>
                                  Sepetten cikar
                                </button>
                                <button className="ghost" onClick={() => quickOfferForListing(row.listing)}>
                                  Hemen teklif
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small className="muted">Sepetin bos. Kesfet sekmesinden urun ekle.</small>
                      )}
                      <div className="market-catalog-grid">
                        {tradeFilteredListings.slice(0, 8).map((item) => {
                          const signals = tradeListingCommerceSignals.get(String(item.id));
                          return (
                            <article key={`vitrin-${item.id}`} className="market-card">
                              <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                              <span>{item.city || "-"} {item.district || ""}</span>
                              <p>
                                {Number(item.priceTlKg || 0).toFixed(2)} TL/kg •{" "}
                                {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                              </p>
                              <small>{item.deliveryType} • {item.paymentType} • {item.qualityGrade}</small>
                              {signals ? (
                                <div className="info-badges market-signal-badges">
                                  <span className={`badge ${getTradeSignalToneClass(signals.trustScore)}`}>
                                    Guven: {signals.trustScore}/100
                                  </span>
                                  <span className="badge">Likidite: {signals.liquidityScore}</span>
                                  <span className="badge">Fiyat: {signals.priceScore}</span>
                                </div>
                              ) : null}
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => addTradeCartItem(item)}>
                                  Sepete ekle
                                </button>
                                <button className="ghost" onClick={() => quickOfferForListing(item)}>
                                  Hemen teklif
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "piyasa" ? (
                    <div className="marketplace-panel">
                      <div className="info-badges">
                        <span className="badge">Pazar basinci: {tradeMarketPulse.pressure}</span>
                        <span className="badge">Dengesizlik: %{tradeMarketPulse.imbalancePct}</span>
                        <span className="badge">Likidite seviyesi: {tradeMarketPulse.liquidityTier}</span>
                        <span className="badge">Onerilen satis: {Number(tradeMarketPulse.suggestedSell || 0).toFixed(2)} TL/kg</span>
                        <span className="badge">Onerilen alim: {Number(tradeMarketPulse.suggestedBuy || 0).toFixed(2)} TL/kg</span>
                      </div>
                      <small className="muted">{tradeMarketPulse.note}</small>
                      <div className="market-depth-kpis">
                        <div className="market-depth-kpi">
                          <span>En iyi alis</span>
                          <strong>{Number(tradeMarketDepth.bestBid || 0).toFixed(2)} TL/kg</strong>
                        </div>
                        <div className="market-depth-kpi">
                          <span>En iyi satis</span>
                          <strong>{Number(tradeMarketDepth.bestAsk || 0).toFixed(2)} TL/kg</strong>
                        </div>
                        <div className="market-depth-kpi">
                          <span>Spread</span>
                          <strong>{Number(tradeMarketDepth.spread || 0).toFixed(2)} TL/kg</strong>
                        </div>
                        <div className="market-depth-kpi">
                          <span>Likidite</span>
                          <strong>{tradeMarketDepth.liquidityScore}/100</strong>
                        </div>
                        <div className="market-depth-kpi">
                          <span>Toplam satis derinligi</span>
                          <strong>{Number(tradeMarketDepth.totalSellQty || 0).toLocaleString("tr-TR")} kg</strong>
                        </div>
                        <div className="market-depth-kpi">
                          <span>Toplam alis derinligi</span>
                          <strong>{Number(tradeMarketDepth.totalBuyQty || 0).toLocaleString("tr-TR")} kg</strong>
                        </div>
                      </div>
                      <div className="market-depth-grid">
                        <div className="market-depth-col">
                          <h4>Alis derinligi</h4>
                          <ul className="market-depth-list">
                            {tradeMarketDepth.depthBuys.map((row) => (
                              <li key={`bid-${row.price}`}>
                                <strong>{Number(row.price).toFixed(1)} TL</strong>
                                <span>{Math.round(row.qty).toLocaleString("tr-TR")} kg</span>
                                <em style={{ width: `${Math.max(8, Math.min(100, row.qty / 120))}%` }} />
                              </li>
                            ))}
                            {!tradeMarketDepth.depthBuys.length ? <li className="muted">Alis derinligi yok.</li> : null}
                          </ul>
                        </div>
                        <div className="market-depth-col">
                          <h4>Satis derinligi</h4>
                          <ul className="market-depth-list">
                            {tradeMarketDepth.depthSells.map((row) => (
                              <li key={`ask-${row.price}`}>
                                <strong>{Number(row.price).toFixed(1)} TL</strong>
                                <span>{Math.round(row.qty).toLocaleString("tr-TR")} kg</span>
                                <em style={{ width: `${Math.max(8, Math.min(100, row.qty / 120))}%` }} />
                              </li>
                            ))}
                            {!tradeMarketDepth.depthSells.length ? <li className="muted">Satis derinligi yok.</li> : null}
                          </ul>
                        </div>
                      </div>
                      <div className="demo-actions market-pulse-actions">
                        <button
                          className="ghost"
                          disabled={!tradePulseActions.hasSell}
                          onClick={() => {
                            setTradeListingForm((prev) => ({
                              ...prev,
                              type: "sell",
                              priceTlKg: tradeMarketPulse.suggestedSell ? String(tradeMarketPulse.suggestedSell) : prev.priceTlKg
                            }));
                            setTradeStatus(
                              `Satis formu guncellendi: ${Number(tradeMarketPulse.suggestedSell || 0).toFixed(2)} TL/kg`
                            );
                            setTradeWorkspaceTab("ilanlarim");
                            document.getElementById("market-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          Satis fiyatini uygula
                        </button>
                        <button
                          className="ghost"
                          disabled={!tradePulseActions.hasBuy}
                          onClick={() => {
                            setTradeOfferForm((prev) => ({
                              ...prev,
                              offerPriceTlKg: tradeMarketPulse.suggestedBuy ? String(tradeMarketPulse.suggestedBuy) : prev.offerPriceTlKg
                            }));
                            setTradeStatus(
                              `Alim formu guncellendi: ${Number(tradeMarketPulse.suggestedBuy || 0).toFixed(2)} TL/kg`
                            );
                            setTradeWorkspaceTab("teklifler");
                          }}
                        >
                          Alim fiyatini uygula
                        </button>
                        <button
                          className="ghost"
                          disabled={!tradePulseActions.hasSell && !tradePulseActions.hasBuy}
                          onClick={() => {
                            setTradeListingForm((prev) => ({
                              ...prev,
                              type: "sell",
                              priceTlKg: tradePulseActions.hasSell ? String(tradeMarketPulse.suggestedSell) : prev.priceTlKg
                            }));
                            setTradeOfferForm((prev) => ({
                              ...prev,
                              offerPriceTlKg: tradePulseActions.hasBuy ? String(tradeMarketPulse.suggestedBuy) : prev.offerPriceTlKg
                            }));
                            setTradeStatus("Pazar pulse fiyatlari ilan ve teklif formlarina uygulandi.");
                          }}
                        >
                          Iki forma birden uygula
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            setTradeListingForm((prev) => ({
                              ...prev,
                              type: "sell",
                              priceTlKg: tradeMarketDepth.bestAsk ? String(tradeMarketDepth.bestAsk) : prev.priceTlKg
                            }));
                            setTradeWorkspaceTab("ilanlarim");
                            document.getElementById("market-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          En iyi satisla ilan ac
                        </button>
                        <button
                          className="ghost"
                          onClick={() => {
                            const first = tradeFilteredListings.find((x) => x.status === "open");
                            if (!first) return;
                            setTradeOfferForm((prev) => ({
                              ...prev,
                              listingId: first.id,
                              offerPriceTlKg: tradeMarketDepth.bestBid ? String(tradeMarketDepth.bestBid) : prev.offerPriceTlKg
                            }));
                            setTradeWorkspaceTab("teklifler");
                          }}
                        >
                          En iyi alisla teklif hazirla
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "kesfet" ? (
                    <div className="marketplace-panel">
                      <div className="market-preset-row">
                        <button className="ghost" onClick={() => {
                          setTradeFilterStatus("open");
                          setTradeFilterType("sell");
                          setTradeFilterText("");
                        }}>
                          Acik satiliklar
                        </button>
                        <button className="ghost" onClick={() => {
                          setTradeFilterStatus("open");
                          setTradeFilterType("buy");
                          setTradeFilterText("");
                        }}>
                          Acik alimlar
                        </button>
                        <button className="ghost" onClick={() => {
                          setTradeFilterText("domates");
                          setTradeFilterType("all");
                          setTradeFilterStatus("open");
                        }}>
                          Domates
                        </button>
                        <button className="ghost" onClick={() => {
                          setTradeFilterText("bugday");
                          setTradeFilterType("all");
                          setTradeFilterStatus("open");
                        }}>
                          Bugday
                        </button>
                        <button className="ghost" onClick={() => {
                          setTradeSellerFilter(normalizeKey(effectiveTradeIdentity) || "all");
                          setTradeFilterStatus("all");
                        }}>
                          Sadece benim ilanlarim
                        </button>
                        <button className="ghost" onClick={resetTradeFilters}>
                          Filtreleri sifirla
                        </button>
                      </div>
                      <div className="market-filter-presets">
                        <div className="market-filter-presets-head">
                          <strong>Filtre presetleri</strong>
                          <small className="muted">Kesfet sekmesi icin hizli filtre kaydi.</small>
                        </div>
                        <div className="market-filter-presets-form">
                          <input
                            value={tradeFilterPresetName}
                            onChange={(e) => setTradeFilterPresetName(e.target.value)}
                            placeholder="Orn: Acik alim / havale"
                          />
                          <button className="ghost" onClick={saveTradeFilterPreset}>
                            Kaydet
                          </button>
                        </div>
                        {tradeFilterPresets.length ? (
                          <div className="chip-row">
                            {tradeFilterPresets.map((preset) => (
                              <span key={`preset-${preset.id}`} className="chip chip-action">
                                <button
                                  type="button"
                                  className="chip-link"
                                  onClick={() => applyTradeFilterSnapshot(preset)}
                                >
                                  {preset.label}
                                </button>
                                <button
                                  type="button"
                                  className="chip-link danger"
                                  onClick={() => deleteTradeFilterPreset(preset.id)}
                                >
                                  Sil
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <small className="muted">Kayitli preset yok.</small>
                        )}
                      </div>
                      <div className="field-grid-2">
                        <label className="plant-select">
                          <span>Ara</span>
                          <input
                            value={tradeFilterText}
                            onChange={(e) => setTradeFilterText(e.target.value)}
                            placeholder="Urun, ilce, teslimat..."
                          />
                        </label>
                        <label className="plant-select">
                          <span>Tip</span>
                          <select value={tradeFilterType} onChange={(e) => setTradeFilterType(e.target.value)}>
                            <option value="all">Tum tipler</option>
                            <option value="sell">Satilik</option>
                            <option value="buy">Alim</option>
                          </select>
                        </label>
                      </div>
                      <div className="field-grid-3">
                        <label className="plant-select">
                          <span>Durum</span>
                          <select value={tradeFilterStatus} onChange={(e) => setTradeFilterStatus(e.target.value)}>
                            <option value="all">Hepsi</option>
                            <option value="open">Acik</option>
                            <option value="paused">Beklemede</option>
                            <option value="closed">Kapali</option>
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Teslimat</span>
                          <select value={tradeFilterDelivery} onChange={(e) => setTradeFilterDelivery(e.target.value)}>
                            <option value="all">Hepsi</option>
                            <option value="pickup">Teslim al</option>
                            <option value="seller_delivery">Satici teslim</option>
                            <option value="cargo">Kargo</option>
                            <option value="broker">Komisyoncu</option>
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Odeme</span>
                          <select value={tradeFilterPayment} onChange={(e) => setTradeFilterPayment(e.target.value)}>
                            <option value="all">Hepsi</option>
                            <option value="transfer">Havale/EFT</option>
                            <option value="cash">Nakit</option>
                            <option value="term">Vade</option>
                            <option value="escrow">Guvenli odeme</option>
                            <option value="card">Kart</option>
                          </select>
                        </label>
                      </div>
                      <div className="field-grid-3">
                        <label className="plant-select">
                          <span>Kalite</span>
                          <select value={tradeFilterQuality} onChange={(e) => setTradeFilterQuality(e.target.value)}>
                            <option value="all">Hepsi</option>
                            <option value="premium">Premium</option>
                            <option value="standard">Standart</option>
                            <option value="mixed">Karisik</option>
                            <option value="processing">Sanayi/isalma</option>
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Min fiyat (TL/kg)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tradePriceMin}
                            onChange={(e) => setTradePriceMin(e.target.value)}
                          />
                        </label>
                        <label className="plant-select">
                          <span>Max fiyat (TL/kg)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tradePriceMax}
                            onChange={(e) => setTradePriceMax(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="field-grid-2">
                        <label className="plant-select">
                          <span>Siralama</span>
                          <select value={tradeSortBy} onChange={(e) => setTradeSortBy(e.target.value)}>
                            <option value="smart">Akilli firsat</option>
                            <option value="newest">En yeni</option>
                            <option value="price_asc">Fiyat artan</option>
                            <option value="price_desc">Fiyat azalan</option>
                            <option value="qty_desc">Miktar azalan</option>
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Satici vitrini</span>
                          <select value={tradeSellerFilter} onChange={(e) => setTradeSellerFilter(e.target.value)}>
                            <option value="all">Tum saticilar</option>
                            {tradeSellerDirectory.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.openCount})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Hizli secim</span>
                          <select
                            value={tradeOfferForm.listingId}
                            onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, listingId: e.target.value }))}
                          >
                            <option value="">Ilan sec</option>
                            {tradeFilteredListings.slice(0, 40).map((item) => (
                              <option key={item.id} value={item.id}>
                                {(item.title || item.crop || item.id)} • {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="demo-actions">
                        <button className="ghost" onClick={resetTradeFilters}>
                          Filtreleri temizle
                        </button>
                      </div>
                      {tradeFilteredStats ? (
                        <div className="info-badges">
                          <span className="badge">Sonuc: {tradeFilteredStats.count}</span>
                          <span className="badge">Min: {Number(tradeFilteredStats.min).toFixed(2)} TL/kg</span>
                          <span className="badge">Medyan: {Number(tradeFilteredStats.median).toFixed(2)} TL/kg</span>
                          <span className="badge">Max: {Number(tradeFilteredStats.max).toFixed(2)} TL/kg</span>
                        </div>
                      ) : (
                        <small className="muted">Filtreye uygun ilan yok.</small>
                      )}
                      {tradeCropQuickFilters.length ? (
                        <div className="chip-row">
                          {tradeCropQuickFilters.map((item) => (
                            <button
                              key={`crop-${item.crop}`}
                              type="button"
                              className={`chip ${normalizeKey(tradeFilterText) === normalizeKey(item.crop) ? "active" : ""}`}
                              onClick={() => setTradeFilterText(item.crop)}
                            >
                              {item.crop} ({item.count})
                            </button>
                          ))}
                          <button type="button" className="chip" onClick={() => setTradeFilterText("")}>
                            Hepsi
                          </button>
                        </div>
                      ) : null}
                      {tradeSellerDirectory.length ? (
                        <div className="market-seller-row">
                          {tradeSellerDirectory.slice(0, 4).map((seller) => (
                            <article key={`seller-${seller.id}`} className="market-seller-card">
                              <strong>{seller.name}</strong>
                              <span>Acik ilan: {seller.openCount}</span>
                              <small>
                                Ort fiyat: {Number(seller.avgPrice || 0).toFixed(2)} TL/kg •
                                Stok: {Math.round(seller.totalQty || 0).toLocaleString("tr-TR")} kg
                              </small>
                              <button className="ghost" onClick={() => setTradeSellerFilter(seller.id)}>
                                Saticiya filtrele
                              </button>
                            </article>
                          ))}
                        </div>
                      ) : null}
                      {tradeCompareListings.length ? (
                        <div className="market-compare-strip">
                          {tradeCompareListings.map((item) => (
                            <article key={`cmp-${item.id}`} className="market-compare-card">
                              <strong>{item.title || item.id}</strong>
                              <span>{Number(item.priceTlKg || 0).toFixed(2)} TL/kg</span>
                              <small>{Number(item.quantityKg || 0).toLocaleString("tr-TR")} kg</small>
                              <button className="ghost" onClick={() => toggleTradeCompare(item.id)}>
                                Karsilastirmadan cikar
                              </button>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <small className="muted">Karsilastirma icin en az 1 ilan sec.</small>
                      )}
                      {tradeOpportunityHighlights.length ? (
                        <div className="market-opportunity-row">
                          {tradeOpportunityHighlights.map(({ item, score }) => (
                            <article key={`opp-${item.id}`} className="market-opportunity-card">
                              <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                              <span>{Number(item.priceTlKg || 0).toFixed(2)} TL/kg</span>
                              <small>Firsat skoru: {score}/100</small>
                            </article>
                          ))}
                        </div>
                      ) : null}
                      <div className="market-catalog-grid">
                        {tradeFilteredListings.slice(0, 6).map((item) => {
                          const signals = tradeListingCommerceSignals.get(String(item.id));
                          return (
                            <article key={`catalog-${item.id}`} className="market-card">
                              <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                              <span>{item.city || "-"} {item.district || ""}</span>
                              <p>
                                {Number(item.priceTlKg || 0).toFixed(2)} TL/kg •{" "}
                                {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                              </p>
                              <small>{item.deliveryType} • {item.paymentType} • {item.qualityGrade}</small>
                              {tradeOpportunityHighlights.find((x) => x.item.id === item.id) ? (
                                <span className="badge safe">One cikan ilan</span>
                              ) : null}
                              {signals ? (
                                <div className="info-badges market-signal-badges">
                                  <span className={`badge ${getTradeSignalToneClass(signals.trustScore)}`}>
                                    Guven: {signals.trustScore}/100
                                  </span>
                                  <span className="badge">Teslimat: {signals.deliveryScore}</span>
                                  <span className="badge">Odeme: {signals.paymentScore}</span>
                                  <span className="badge">Kalite: {signals.qualityScore}</span>
                                </div>
                              ) : null}
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => addTradeCartItem(item)}>
                                  Sepete ekle
                                </button>
                                <button
                                  className="ghost"
                                  onClick={() => {
                                    setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }));
                                    setTradeWorkspaceTab("teklifler");
                                  }}
                                >
                                  Teklif ver
                                </button>
                                {item.type === "sell" ? (
                                  <button className="ghost" onClick={() => quickOfferForListing(item)}>
                                    Hizli teklif
                                  </button>
                                ) : null}
                                <button className="ghost" onClick={() => toggleTradeFavorite(item.id)}>
                                  {tradeFavoriteSet.has(String(item.id)) ? "Favoriden cikar" : "Favorile"}
                                </button>
                                <button className="ghost" onClick={() => toggleTradeCompare(item.id)}>
                                  {tradeCompareIds.some((x) => String(x) === String(item.id))
                                    ? "Karsilastirma -"
                                    : "Karsilastir +"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      <ul className="marketplace-list">
                        {tradeFilteredListings.slice(0, 8).map((item) => {
                          const signals = tradeListingCommerceSignals.get(String(item.id));
                          return (
                            <li key={item.id}>
                              <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                              <span>
                                {item.type === "sell" ? "SATIS" : "ALIS"} • {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg •{" "}
                                {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                              </span>
                              <span>{item.deliveryType} • {item.paymentType} • {item.qualityGrade}</span>
                              {signals ? (
                                <span>
                                  Guven {signals.trustScore}/100 • Likidite {signals.liquidityScore} • Fiyat {signals.priceScore}
                                </span>
                              ) : null}
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => addTradeCartItem(item)}>
                                  Sepete ekle
                                </button>
                                <button
                                  className="ghost"
                                  onClick={() => {
                                    setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }));
                                    setTradeWorkspaceTab("teklifler");
                                  }}
                                >
                                  Teklif ekranina gec
                                </button>
                                {item.type === "sell" ? (
                                  <button className="ghost" onClick={() => quickOfferForListing(item)}>
                                    Hizli teklif
                                  </button>
                                ) : null}
                                <button className="ghost" onClick={() => toggleTradeFavorite(item.id)}>
                                  {tradeFavoriteSet.has(String(item.id)) ? "Favori cikart" : "Favorile"}
                                </button>
                                <button className="ghost" onClick={() => toggleTradeCompare(item.id)}>
                                  {tradeCompareIds.some((x) => String(x) === String(item.id)) ? "Karsilastirma -" : "Karsilastir +"}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "eslesme" ? (
                    <div className="marketplace-panel">
                      <div className="field-grid-3">
                        <label className="plant-select">
                          <span>Skor seviyesi</span>
                          <select value={tradeMatchTierFilter} onChange={(e) => setTradeMatchTierFilter(e.target.value)}>
                            <option value="all">Hepsi</option>
                            <option value="strong">Strong</option>
                            <option value="medium">Medium</option>
                            <option value="weak">Weak</option>
                          </select>
                        </label>
                        <label className="plant-select">
                          <span>Min skor: {tradeMatchMinScore}</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={tradeMatchMinScore}
                            onChange={(e) => setTradeMatchMinScore(Number(e.target.value) || 0)}
                          />
                        </label>
                        <div className="info-badges">
                          <span className="badge">Toplam: {tradeMatches.length}</span>
                          <span className="badge">Filtreli: {tradeMatchesFiltered.length}</span>
                          <span className={`badge ${tradeAutoAcceptCandidates.length ? "safe" : ""}`}>
                            Oto-kabul adayi: {tradeAutoAcceptCandidates.length}
                          </span>
                        </div>
                      </div>
                      <div className="demo-actions">
                        <button className="ghost" onClick={applyBulkCounterOffers}>
                          Skora gore toplu karsi teklif
                        </button>
                        <button className="ghost" onClick={applyBulkAcceptOffers}>
                          Onerilenleri toplu kabul et
                        </button>
                      </div>
                      {tradeMatchesFiltered.length ? (
                        <ul className="marketplace-list">
                          {tradeMatchesFiltered.slice(0, 16).map((row) => (
                            <li key={`match-${row.listingId}-${row.offerId}`}>
                              <strong>{row.listing?.title || row.listingId}</strong>
                              <span>
                                Teklif: {Number(row.offer?.offerPriceTlKg || 0).toFixed(2)} TL/kg •
                                Skor {Number(row.match?.score || 0)}/100 ({row.match?.tier || "-"})
                              </span>
                              {Array.isArray(row.match?.reasons) && row.match.reasons.length ? (
                                <small>{row.match.reasons.slice(0, 3).join(" • ")}</small>
                              ) : null}
                              <div className="demo-actions">
                                <button
                                  className="ghost"
                                  onClick={() => {
                                    setTradeOfferForm((prev) => ({ ...prev, listingId: row.listingId || "" }));
                                    setTradeWorkspaceTab("teklifler");
                                  }}
                                >
                                  Teklif ekranina gec
                                </button>
                                <button className="ghost" onClick={() => suggestCounterForOffer(row.offer)}>
                                  Karsi teklif oner
                                </button>
                                <button
                                  className="ghost"
                                  onClick={async () => {
                                    const ok = await applyCounterForOffer(row.offer);
                                    if (ok) await loadTradeData();
                                  }}
                                >
                                  Karsi teklif uygula
                                </button>
                                <button className="ghost" onClick={() => acceptTradeOffer(row.offerId)}>
                                  Kabul et
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <small className="muted">Filtreye uygun eslesme yok.</small>
                      )}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "favoriler" ? (
                    <div className="marketplace-panel">
                      {tradeFilteredListings.filter((item) => tradeFavoriteSet.has(String(item.id))).length ? (
                        <ul className="marketplace-list">
                          {tradeFilteredListings
                            .filter((item) => tradeFavoriteSet.has(String(item.id)))
                            .slice(0, 12)
                            .map((item) => (
                              <li key={`fav-${item.id}`}>
                                <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                                <span>
                                  {Number(item.priceTlKg || 0).toFixed(2)} TL/kg •{" "}
                                  {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg
                                </span>
                                <span>{item.deliveryType} • {item.paymentType} • {item.qualityGrade}</span>
                                <div className="demo-actions">
                                  <button className="ghost" onClick={() => toggleTradeFavorite(item.id)}>
                                    Favoriden cikar
                                  </button>
                                  {item.type === "sell" ? (
                                    <button className="ghost" onClick={() => quickOfferForListing(item)}>
                                      Hizli teklif
                                    </button>
                                  ) : null}
                                  <button
                                    className="ghost"
                                    onClick={() => {
                                      setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }));
                                      setTradeWorkspaceTab("teklifler");
                                    }}
                                  >
                                    Teklife gec
                                  </button>
                                </div>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <small className="muted">Favori ilanin yok.</small>
                      )}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "saticilar" ? (
                    <div className="marketplace-panel">
                      {tradeSellerDirectory.length ? (
                        <div className="market-seller-grid">
                          {tradeSellerDirectory.map((seller) => (
                            <article key={`seller-panel-${seller.id}`} className="market-seller-card">
                              <strong>{seller.name}</strong>
                              <span>Toplam ilan: {seller.listingCount}</span>
                              <span>Acik ilan: {seller.openCount}</span>
                              <small>
                                Ortalama fiyat: {Number(seller.avgPrice || 0).toFixed(2)} TL/kg •
                                Stok: {Math.round(seller.totalQty || 0).toLocaleString("tr-TR")} kg
                              </small>
                              <div className="demo-actions">
                                <button
                                  className="ghost"
                                  onClick={() => {
                                    setTradeSellerFilter(seller.id);
                                    setTradeWorkspaceTab("kesfet");
                                  }}
                                >
                                  Ilanlarini goster
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <small className="muted">Satici vitrini icin yeterli veri yok.</small>
                      )}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "ilanlarim" ? (
                    <div className="marketplace-panel">
                      <div className="market-mylist-toolbar">
                        <label className="plant-select">
                          <span>Durum</span>
                          <select value={tradeMineStatusFilter} onChange={(e) => setTradeMineStatusFilter(e.target.value)}>
                            <option value="all">Tum durumlar</option>
                            <option value="open">Yayinda</option>
                            <option value="paused">Duraklatilmis</option>
                            <option value="closed">Kapatilmis</option>
                          </select>
                        </label>
                        <div className="demo-actions">
                          <button
                            className="primary"
                            onClick={() => {
                              setTradeEditingListingId("");
                              setTradeMyFormExpanded(true);
                              setTradeListingForm((prev) => ({
                                ...prev,
                                title: "",
                                city: prev.city || effectiveTradeCity,
                                crop: prev.crop || effectiveTradeCrop,
                                district: prev.district || (landDemo?.district || "")
                              }));
                            }}
                          >
                            Yeni ilan
                          </button>
                          <button className="ghost" onClick={() => setTradeMyFormExpanded((prev) => !prev)}>
                            {tradeMyFormExpanded ? "Formu gizle" : "Formu ac"}
                          </button>
                          <button
                            className="ghost"
                            disabled={tradeBulkUpdating}
                            onClick={() => bulkUpdateMyListingsStatus("paused", "open")}
                          >
                            Tumunu yayina al
                          </button>
                          <button
                            className="ghost"
                            disabled={tradeBulkUpdating}
                            onClick={() => bulkUpdateMyListingsStatus("open", "paused")}
                          >
                            Tumunu duraklat
                          </button>
                          <button className="ghost" onClick={loadTradeData}>Ilanlari yenile</button>
                        </div>
                      </div>
                      {tradeMyFormExpanded ? (
                        <div className="market-inline-create">
                          <h4>{tradeEditingListingId ? "Ilan duzenle" : "Hizli ilan olustur"}</h4>
                          <div className="field-grid-3">
                            <label className="plant-select">
                              <span>Islem tipi</span>
                              <select
                                value={tradeListingForm.type}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, type: e.target.value }))}
                              >
                                <option value="sell">Satilik</option>
                                <option value="buy">Alim</option>
                              </select>
                            </label>
                            <label className="plant-select">
                              <span>Sehir</span>
                              <input
                                list="location-city-suggestions"
                                value={tradeListingForm.city}
                                onChange={(e) => {
                                  const value = String(e.target.value || "");
                                  const canonicalCity = cityCanonicalByKey[normalizeKey(value)] || value;
                                  setTradeListingForm((prev) => ({ ...prev, city: canonicalCity, district: "" }));
                                }}
                                placeholder={effectiveTradeCity}
                              />
                            </label>
                            <label className="plant-select">
                              <span>Ilce</span>
                              <input
                                list="location-trade-district-suggestions"
                                value={tradeListingForm.district}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, district: e.target.value }))}
                                placeholder={landDemo?.district || "Merkez"}
                              />
                            </label>
                          </div>
                          <div className="field-grid-3">
                            <label className="plant-select">
                              <span>Urun</span>
                              <input
                                value={tradeListingForm.crop}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, crop: e.target.value }))}
                                placeholder={effectiveTradeCrop}
                              />
                            </label>
                            <label className="plant-select">
                              <span>Miktar (kg)</span>
                              <input
                                type="number"
                                min="1"
                                value={tradeListingForm.quantityKg}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                              />
                            </label>
                            <label className="plant-select">
                              <span>Fiyat (TL/kg)</span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={tradeListingForm.priceTlKg}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, priceTlKg: e.target.value }))}
                              />
                            </label>
                          </div>
                          <label className="plant-select">
                            <span>Baslik</span>
                            <input
                              value={tradeListingForm.title}
                              onChange={(e) => setTradeListingForm((prev) => ({ ...prev, title: e.target.value }))}
                              placeholder="Orn: Malatya domates satilik"
                            />
                          </label>
                          <div className="field-grid-3">
                            <label className="plant-select">
                              <span>Teslimat</span>
                              <select
                                value={tradeListingForm.deliveryType}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, deliveryType: e.target.value }))}
                              >
                                <option value="pickup">Teslim al</option>
                                <option value="seller_delivery">Satici teslim</option>
                                <option value="cargo">Kargo</option>
                                <option value="broker">Komisyoncu</option>
                              </select>
                            </label>
                            <label className="plant-select">
                              <span>Odeme</span>
                              <select
                                value={tradeListingForm.paymentType}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, paymentType: e.target.value }))}
                              >
                                <option value="transfer">Havale/EFT</option>
                                <option value="cash">Nakit</option>
                                <option value="term">Vade</option>
                                <option value="escrow">Guvenli odeme</option>
                                <option value="card">Kart</option>
                              </select>
                            </label>
                            <label className="plant-select">
                              <span>Kalite</span>
                              <select
                                value={tradeListingForm.qualityGrade}
                                onChange={(e) => setTradeListingForm((prev) => ({ ...prev, qualityGrade: e.target.value }))}
                              >
                                <option value="premium">Premium</option>
                                <option value="standard">Standart</option>
                                <option value="mixed">Karisik</option>
                                <option value="processing">Sanayi/isalma</option>
                              </select>
                            </label>
                          </div>
                          <label className="plant-select">
                            <span>Iletisim</span>
                            <input
                              value={tradeListingForm.contact}
                              onChange={(e) => setTradeListingForm((prev) => ({ ...prev, contact: e.target.value }))}
                              placeholder={effectiveTradeIdentity || "Telefon / isim"}
                            />
                          </label>
                          <div className="demo-actions">
                            <button className="primary" onClick={submitTradeListing}>
                              {tradeEditingListingId ? "Ilan guncelle" : "Ilan koy"}
                            </button>
                            {tradeEditingListingId ? (
                              <button className="ghost" onClick={cancelTradeListingEdit}>Duzenlemeyi iptal et</button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <ul className="marketplace-list">
                        {tradeMyListings
                          .filter((item) => tradeMineStatusFilter === "all" || String(item.status || "") === tradeMineStatusFilter)
                          .slice(0, 40)
                          .map((item) => (
                            <li key={item.id}>
                              <strong>{item.title || item.id}</strong>
                              <span>
                                {item.status} • Toplam {Number(item.quantityKg || 0).toLocaleString("tr-TR")} kg •
                                Kalan {Number((item.availableKg ?? item.quantityKg) || 0).toLocaleString("tr-TR")} kg •
                                {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                              </span>
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => editTradeListing(item)}>Duzenle</button>
                                <button className="ghost" onClick={() => duplicateTradeListing(item)}>Kopyala</button>
                                <button
                                  className="ghost"
                                  onClick={() => pauseOrOpenTradeListing(item.id, item.status === "paused" ? "open" : "paused")}
                                >
                                  {item.status === "paused" ? "Yayina al" : "Duraklat"}
                                </button>
                                <button className="ghost" onClick={() => closeTradeListing(item.id)}>Ilani kapat</button>
                                <button className="ghost" onClick={() => deleteTradeListing(item.id)}>Sil</button>
                                <button className="ghost" onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }))}>Teklifleri ac</button>
                              </div>
                            </li>
                          ))}
                      </ul>
                      {!tradeMyListings.filter((item) => tradeMineStatusFilter === "all" || String(item.status || "") === tradeMineStatusFilter).length ? (
                        <small className="muted">Filtreye uygun ilan yok. "Yeni ilan" butonundan hemen ekleyebilirsin.</small>
                      ) : null}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "teklifler" ? (
                    <div className="marketplace-panel">
                      <div className="info-badges">
                        <span className="badge">Gelen teklif: {tradeIncomingOffers.length}</span>
                        <span className="badge">Isleme uygun: {tradeIncomingActionableOffers.length}</span>
                        <span className="badge">Secili: {tradeIncomingOfferSelection.length}</span>
                        <span className="badge">Benim teklifim: {tradeMyOffers.length}</span>
                      </div>
                      <div className="demo-actions">
                        <button className="ghost" onClick={selectAllIncomingActionableOffers}>
                          Isleme uygunlarin hepsini sec
                        </button>
                        <button className="ghost" onClick={clearIncomingOfferSelection}>
                          Secimi temizle
                        </button>
                        <button className="ghost" onClick={bulkAcceptIncomingOffers}>
                          Secilenleri toplu kabul et
                        </button>
                        <button className="ghost" onClick={bulkRejectIncomingOffers}>
                          Secilenleri toplu reddet
                        </button>
                      </div>
                      <h4>Gelen teklifler (satici paneli)</h4>
                      <ul className="marketplace-list">
                        {tradeIncomingOffers.slice(0, 16).map((offer) => {
                          const expired = isOfferExpired(offer);
                          const actionable = ["pending", "countered"].includes(String(offer.status || "").toLowerCase()) && !expired;
                          const listing = tradeListings.find((x) => String(x.id) === String(offer.listingId));
                          return (
                            <li key={`incoming-${offer.id}`}>
                              <strong>{offer.buyer || "Alici"} • {offer.status}</strong>
                              <span>
                                {Number(offer.quantityKg || 0).toLocaleString("tr-TR")} kg • {Number(offer.offerPriceTlKg || 0).toFixed(2)} TL/kg
                              </span>
                              <span>
                                {listing?.title || listing?.crop || offer.listingId} • Son: {getOfferExpiryText(offer)}
                              </span>
                              <div className="demo-actions">
                                <button
                                  className="ghost"
                                  onClick={() => toggleIncomingOfferSelection(offer.id)}
                                  disabled={!actionable}
                                >
                                  {tradeIncomingOfferSelection.some((id) => String(id) === String(offer.id)) ? "Secimden cikar" : "Sec"}
                                </button>
                                <button className="ghost" onClick={() => acceptTradeOffer(offer.id)} disabled={!actionable}>
                                  Kabul et
                                </button>
                                <button className="ghost" onClick={() => rejectTradeOffer(offer.id)} disabled={!actionable}>
                                  Reddet
                                </button>
                                <button
                                  className="ghost"
                                  onClick={() =>
                                    setTradeCounterForm((prev) => ({
                                      ...prev,
                                      offerId: offer.id,
                                      counterPriceTlKg: String(offer.offerPriceTlKg || "")
                                    }))
                                  }
                                  disabled={!actionable}
                                >
                                  Karsi teklif
                                </button>
                              </div>
                            </li>
                          );
                        })}
                        {!tradeIncomingOffers.length ? <li className="muted">Gelen teklif yok.</li> : null}
                      </ul>
                      <h4>Benim tekliflerim (alici paneli)</h4>
                      <ul className="marketplace-list">
                        {tradeMyOffers.slice(0, 16).map((offer) => {
                          const expired = isOfferExpired(offer);
                          const editable = ["pending", "countered"].includes(String(offer.status || "").toLowerCase()) && !expired;
                          return (
                            <li key={`mine-${offer.id}`}>
                              <strong>{offer.buyer || "Alici"} • {offer.status}</strong>
                              <span>
                                {Number(offer.quantityKg || 0).toLocaleString("tr-TR")} kg • {Number(offer.offerPriceTlKg || 0).toFixed(2)} TL/kg
                              </span>
                              <span>Son: {getOfferExpiryText(offer)}</span>
                              <div className="demo-actions">
                                <button className="ghost" onClick={() => startTradeOfferEdit(offer)} disabled={!editable}>
                                  Duzenle
                                </button>
                                <button className="ghost" onClick={() => cancelTradeOffer(offer.id)} disabled={!editable}>
                                  Geri cek
                                </button>
                              </div>
                            </li>
                          );
                        })}
                        {!tradeMyOffers.length ? <li className="muted">Bu profile ait teklif yok.</li> : null}
                      </ul>
                      {tradeOfferEditForm.id ? (
                        <div className="market-offer-summary">
                          <strong>Teklif duzenle • {tradeOfferEditForm.id}</strong>
                          <div className="field-grid-2">
                            <label className="plant-select">
                              <span>Miktar (kg)</span>
                              <input
                                type="number"
                                min="1"
                                value={tradeOfferEditForm.quantityKg}
                                onChange={(e) =>
                                  setTradeOfferEditForm((prev) => ({ ...prev, quantityKg: e.target.value }))
                                }
                              />
                            </label>
                            <label className="plant-select">
                              <span>Teklif (TL/kg)</span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={tradeOfferEditForm.offerPriceTlKg}
                                onChange={(e) =>
                                  setTradeOfferEditForm((prev) => ({ ...prev, offerPriceTlKg: e.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <div className="field-grid-2">
                            <label className="plant-select">
                              <span>Gecerlilik (saat)</span>
                              <input
                                type="number"
                                min="1"
                                max="720"
                                value={tradeOfferEditForm.expiryHours}
                                onChange={(e) =>
                                  setTradeOfferEditForm((prev) => ({ ...prev, expiryHours: e.target.value }))
                                }
                              />
                            </label>
                            <label className="plant-select">
                              <span>Not</span>
                              <input
                                value={tradeOfferEditForm.note}
                                onChange={(e) =>
                                  setTradeOfferEditForm((prev) => ({ ...prev, note: e.target.value }))
                                }
                              />
                            </label>
                          </div>
                          <div className="demo-actions">
                            <button className="ghost" onClick={submitTradeOfferEdit}>Guncelle</button>
                            <button className="ghost" onClick={clearTradeOfferEdit}>Iptal</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "siparisler" ? (
                    <div className="marketplace-panel">
                      <ul className="marketplace-list">
                        {tradeMyOrders.slice(0, 10).map((order) => (
                          <li key={order.id}>
                            <strong>{order.crop || "Urun"} • {order.status}</strong>
                            <span>{Number(order.totalTl || 0).toLocaleString("tr-TR")} TL • escrow {order.escrowStatus}</span>
                            <div className="demo-actions">
                              <button className="ghost" onClick={() => updateTradeOrder(order.id, "in_transit")}>Kargoda</button>
                              <button className="ghost" onClick={() => updateTradeOrder(order.id, "delivered")}>Teslim</button>
                              <button className="ghost" onClick={() => updateTradeOrder(order.id, "completed", "released")}>Tamamla</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {!tradeMyOrders.length ? <small className="muted">Bu profile ait siparis yok.</small> : null}
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "mesajlar" ? (
                    <div className="marketplace-panel">
                      <div className="field-grid-2">
                        <label className="plant-select">
                          <span>Gonderen</span>
                          <input
                            value={tradeMessageForm.sender}
                            onChange={(e) => setTradeMessageForm((prev) => ({ ...prev, sender: e.target.value }))}
                          />
                        </label>
                        <label className="plant-select">
                          <span>Ilan</span>
                          <select
                            value={tradeOfferForm.listingId}
                            onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, listingId: e.target.value }))}
                          >
                            <option value="">Ilan sec</option>
                            {tradeListings.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title || item.id}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="plant-select">
                        <span>Mesaj</span>
                        <input
                          value={tradeMessageForm.text}
                          onChange={(e) => setTradeMessageForm((prev) => ({ ...prev, text: e.target.value }))}
                        />
                      </label>
                      <div className="demo-actions">
                        <button className="ghost" onClick={submitTradeMessage}>Mesaj gonder</button>
                      </div>
                      <ul className="marketplace-list">
                        {tradeMessages.slice(-8).map((msg) => (
                          <li key={msg.id}>
                            <strong>{msg.sender || msg.senderRole}</strong>
                            <span>{msg.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {tradeWorkspaceTab === "bildirim" ? (
                    <div className="marketplace-panel">
                      <ul className="marketplace-list">
                        {tradeAlerts.slice(0, 12).map((item) => (
                          <li key={item.id}>
                            <strong>{item.title}</strong>
                            <span>{item.detail || "-"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="market-sticky-actions">
                  <button className="ghost" onClick={() => setTradeWorkspaceTab("vitrin")}>Vitrin</button>
                  <button className="ghost" onClick={() => setTradeWorkspaceTab("kesfet")}>Kesfet</button>
                  <button
                    className="primary"
                    onClick={() => {
                      document.getElementById("market-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Ilan ver
                  </button>
                  <button className="ghost" onClick={() => setTradeWorkspaceTab("teklifler")}>Teklifler</button>
                  <button className="ghost" onClick={() => setTradeWorkspaceTab("siparisler")}>Siparisler</button>
                  <button className="ghost" onClick={loadTradeData}>Yenile</button>
                </div>
                <div id="market-create-form" className="market-form-head">
                  <h3>{tradeEditingListingId ? "Ilan duzenle" : "Ilan olustur"}</h3>
                  <small className="muted">
                    {tradeEditingListingId ? `Duzenlenen ilan: ${tradeEditingListingId}` : "Satici veya alici ilanini asagidan yayinla."}
                  </small>
                </div>
                <div className="field-grid-2">
                  <label className="plant-select">
                    <span>Pazar sehri (filtre)</span>
                    <input
                      list="location-city-suggestions"
                      value={tradeQuery.city}
                      onChange={(e) => setTradeQuery((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder={city || "Malatya"}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Pazar urunu (filtre)</span>
                    <input
                      value={tradeQuery.crop}
                      onChange={(e) => setTradeQuery((prev) => ({ ...prev, crop: e.target.value }))}
                      placeholder={econCrop || selectedPlant?.id || "domates"}
                    />
                  </label>
                </div>
                <label className="plant-select">
                  <span>Islem tipi</span>
                  <select
                    value={tradeListingForm.type}
                    onChange={(e) => setTradeListingForm((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="sell">Satilik</option>
                    <option value="buy">Alim</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Baslik</span>
                  <input
                    value={tradeListingForm.title}
                    onChange={(e) => setTradeListingForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </label>
                <div className="field-grid-2">
                  <label className="plant-select">
                    <span>Ilan sehri</span>
                    <input
                      list="location-city-suggestions"
                      value={tradeListingForm.city}
                      onChange={(e) => {
                        const value = String(e.target.value || "");
                        const canonicalCity = cityCanonicalByKey[normalizeKey(value)] || value;
                        setTradeListingForm((prev) => ({ ...prev, city: canonicalCity, district: "" }));
                      }}
                      placeholder={effectiveTradeCity}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Ilan urunu</span>
                    <input
                      value={tradeListingForm.crop}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, crop: e.target.value }))}
                      placeholder={effectiveTradeCrop || "domates"}
                    />
                  </label>
                </div>
                <div className="field-grid-2">
                  <label className="plant-select">
                    <span>Miktar (kg)</span>
                    <input
                      type="number"
                      min="0"
                      value={tradeListingForm.quantityKg}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                    />
                  </label>
                  <label className="plant-select">
                    <span>Fiyat (TL/kg)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tradeListingForm.priceTlKg}
                      onChange={(e) => setTradeListingForm((prev) => ({ ...prev, priceTlKg: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="field-grid-2">
                  <label className="plant-select">
                    <span>Teslimat tipi</span>
                    <select
                      value={tradeListingForm.deliveryType}
                      onChange={(e) =>
                        setTradeListingForm((prev) => ({ ...prev, deliveryType: e.target.value }))
                      }
                    >
                      <option value="pickup">Teslim al</option>
                      <option value="seller_delivery">Satici teslim</option>
                      <option value="cargo">Kargo</option>
                      <option value="broker">Komisyoncu</option>
                    </select>
                  </label>
                  <label className="plant-select">
                    <span>Odeme tipi</span>
                    <select
                      value={tradeListingForm.paymentType}
                      onChange={(e) =>
                        setTradeListingForm((prev) => ({ ...prev, paymentType: e.target.value }))
                      }
                    >
                      <option value="transfer">Havale/EFT</option>
                      <option value="cash">Nakit</option>
                      <option value="term">Vade</option>
                      <option value="escrow">Guvenli odeme</option>
                      <option value="card">Kart</option>
                    </select>
                  </label>
                </div>
                <label className="plant-select">
                  <span>Kalite sinifi</span>
                  <select
                    value={tradeListingForm.qualityGrade}
                    onChange={(e) =>
                      setTradeListingForm((prev) => ({ ...prev, qualityGrade: e.target.value }))
                    }
                  >
                    <option value="premium">Premium</option>
                    <option value="standard">Standart</option>
                    <option value="mixed">Karisik</option>
                    <option value="processing">Sanayi/isalma</option>
                  </select>
                </label>
                <label className="plant-select">
                  <span>Ilce / iletisim</span>
                  <input
                    list="location-trade-district-suggestions"
                    value={tradeListingForm.district}
                    onChange={(e) => setTradeListingForm((prev) => ({ ...prev, district: e.target.value }))}
                    placeholder="Ilce"
                  />
                  <input
                    value={tradeListingForm.contact}
                    onChange={(e) => setTradeListingForm((prev) => ({ ...prev, contact: e.target.value }))}
                    placeholder="Iletisim"
                  />
                </label>
                <div className="demo-actions">
                  <button className="ghost" onClick={submitTradeListing}>
                    {tradeEditingListingId ? "Ilan guncelle" : "Ilan koy"}
                  </button>
                  {tradeEditingListingId ? (
                    <button className="ghost" onClick={cancelTradeListingEdit}>Duzenlemeyi iptal et</button>
                  ) : null}
                  <button className="ghost" onClick={loadTradeData}>Pazari yenile</button>
                </div>
                {tradeLoading ? <small className="muted">Pazar verisi yukleniyor...</small> : null}
                {tradeStatus ? <small className="muted">{tradeStatus}</small> : null}
                {tradeListings.length ? (
                  <ul>
                    {tradeListings.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <strong>{item.title || `${item.crop} ${item.type}`}</strong>
                        <span>
                          {item.type === "sell" ? "SATIS" : "ALIS"} • {Number(item.quantityKg || 0).toLocaleString("tr-TR")} kg •{" "}
                          {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                        </span>
                        <span>
                          {item.deliveryType || "-"} • {item.paymentType || "-"} • {item.qualityGrade || "-"}
                        </span>
                        <div className="demo-actions">
                          <button className="ghost" onClick={() => editTradeListing(item)}>
                            Duzenle
                          </button>
                          <button
                            className="ghost"
                            onClick={() => setTradeOfferForm((prev) => ({ ...prev, listingId: item.id }))}
                          >
                            Teklif sec
                          </button>
                          <button
                            className="ghost"
                            onClick={() => pauseOrOpenTradeListing(item.id, item.status === "paused" ? "open" : "paused")}
                          >
                            {item.status === "paused" ? "Yayina al" : "Duraklat"}
                          </button>
                          <button className="ghost" onClick={() => closeTradeListing(item.id)}>
                            Ilani kapat
                          </button>
                          <button className="ghost" onClick={() => deleteTradeListing(item.id)}>
                            Sil
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small className="muted">Acik ilan yok.</small>
                )}
                <details className="accordion compact">
                  <summary>Teklif ver</summary>
                  <label className="plant-select">
                    <span>Ilan</span>
                    <select
                      value={tradeOfferForm.listingId}
                      onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, listingId: e.target.value }))}
                    >
                      <option value="">Ilan sec</option>
                      {tradeListings.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title || item.id} • {Number(item.priceTlKg || 0).toFixed(2)} TL/kg
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTradeListing ? (
                    <div className="market-offer-summary">
                      <strong>{selectedTradeListing.title || selectedTradeListing.id}</strong>
                      <span>
                        {Number(selectedTradeListing.priceTlKg || 0).toFixed(2)} TL/kg •{" "}
                        {Number(selectedTradeListing.quantityKg || 0).toLocaleString("tr-TR")} kg •{" "}
                        {selectedTradeListing.deliveryType}
                      </span>
                      {tradeListingInsights ? (
                        <span>
                          Talep skoru: {Number(tradeListingInsights.demandScore || 0)} • Donusum:{" "}
                          %{Number(tradeListingInsights.conversionPct || 0).toFixed(1)} • Onerilen karsi teklif:{" "}
                          {Number.isFinite(Number(tradeListingInsights.suggestedCounterTlKg))
                            ? `${Number(tradeListingInsights.suggestedCounterTlKg).toFixed(2)} TL/kg`
                            : "-"}
                        </span>
                      ) : null}
                      <div className="demo-actions">
                        <button
                          className="ghost"
                          onClick={() =>
                            setTradeOfferForm((prev) => ({
                              ...prev,
                              quantityKg: String(Math.max(1, Math.round(Number(selectedTradeListing.quantityKg || 0) * 0.4))),
                              offerPriceTlKg: String(
                                Number(selectedTradeListing.priceTlKg || 0)
                                  ? Number((Number(selectedTradeListing.priceTlKg || 0) * 0.98).toFixed(2))
                                  : ""
                              ),
                              deliveryType: selectedTradeListing.deliveryType || "any",
                              paymentType: selectedTradeListing.paymentType || "any",
                              qualityGrade: selectedTradeListing.qualityGrade || "any"
                            }))
                          }
                        >
                          Akilli teklif doldur
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <label className="plant-select">
                    <span>Alici</span>
                    <input
                      value={tradeOfferForm.buyer}
                      onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, buyer: e.target.value }))}
                    />
                  </label>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Miktar (kg)</span>
                      <input
                        type="number"
                        min="0"
                        value={tradeOfferForm.quantityKg}
                        onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, quantityKg: e.target.value }))}
                      />
                    </label>
                    <label className="plant-select">
                      <span>Teklif (TL/kg)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tradeOfferForm.offerPriceTlKg}
                        onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, offerPriceTlKg: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="plant-select">
                    <span>Teklif gecerlilik suresi (saat)</span>
                    <input
                      type="number"
                      min="1"
                      max="720"
                      value={tradeOfferForm.expiryHours}
                      onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, expiryHours: e.target.value }))}
                    />
                  </label>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Teslimat tercihi</span>
                      <select
                        value={tradeOfferForm.deliveryType}
                        onChange={(e) =>
                          setTradeOfferForm((prev) => ({ ...prev, deliveryType: e.target.value }))
                        }
                      >
                        <option value="any">Farketmez</option>
                        <option value="pickup">Teslim al</option>
                        <option value="seller_delivery">Satici teslim</option>
                        <option value="cargo">Kargo</option>
                        <option value="broker">Komisyoncu</option>
                      </select>
                    </label>
                    <label className="plant-select">
                      <span>Odeme tercihi</span>
                      <select
                        value={tradeOfferForm.paymentType}
                        onChange={(e) =>
                          setTradeOfferForm((prev) => ({ ...prev, paymentType: e.target.value }))
                        }
                      >
                        <option value="any">Farketmez</option>
                        <option value="transfer">Havale/EFT</option>
                        <option value="cash">Nakit</option>
                        <option value="term">Vade</option>
                        <option value="escrow">Guvenli odeme</option>
                        <option value="card">Kart</option>
                      </select>
                    </label>
                  </div>
                  <label className="plant-select">
                    <span>Kalite tercihi</span>
                    <select
                      value={tradeOfferForm.qualityGrade}
                      onChange={(e) =>
                        setTradeOfferForm((prev) => ({ ...prev, qualityGrade: e.target.value }))
                      }
                    >
                      <option value="any">Farketmez</option>
                      <option value="premium">Premium</option>
                      <option value="standard">Standart</option>
                      <option value="mixed">Karisik</option>
                      <option value="processing">Sanayi/isalma</option>
                    </select>
                  </label>
                  <label className="plant-select">
                    <span>Not</span>
                    <input
                      value={tradeOfferForm.note}
                      onChange={(e) => setTradeOfferForm((prev) => ({ ...prev, note: e.target.value }))}
                    />
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={submitTradeOffer}>Teklif gonder</button>
                  </div>
                  {tradeOffers.length ? (
                    <ul>
                      {tradeOffers.slice(0, 5).map((offer) => (
                        <li key={offer.id}>
                          <strong>{offer.buyer || "Alici"}</strong>
                          <span>
                            {Number(offer.quantityKg || 0).toLocaleString("tr-TR")} kg •{" "}
                            {Number(offer.offerPriceTlKg || 0).toFixed(2)} TL/kg • {offer.status}
                          </span>
                          <small className="muted">Son: {getOfferExpiryText(offer)}</small>
                          {offer.match ? (
                            <small className="muted">Skor: {offer.match.score}/100 ({offer.match.tier})</small>
                          ) : null}
                          <div className="demo-actions">
                            <button className="ghost" onClick={() => acceptTradeOffer(offer.id)}>
                              Siparise cevir
                            </button>
                            <button
                              className="ghost"
                              onClick={() =>
                                setTradeCounterForm((prev) => ({
                                  ...prev,
                                  offerId: offer.id,
                                  counterPriceTlKg: String(offer.offerPriceTlKg || "")
                                }))
                              }
                            >
                              Karsi teklif hazirla
                            </button>
                            <button
                              className="ghost"
                              onClick={() => startTradeOfferEdit(offer)}
                              disabled={!["pending", "countered"].includes(String(offer.status || "").toLowerCase()) || isOfferExpired(offer)}
                            >
                              Teklifi duzenle
                            </button>
                            <button
                              className="ghost"
                              onClick={() => cancelTradeOffer(offer.id)}
                              disabled={!["pending", "countered"].includes(String(offer.status || "").toLowerCase()) || isOfferExpired(offer)}
                            >
                              Teklifi geri cek
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
                <details className="accordion compact">
                  <summary>Karsi teklif gonder</summary>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Teklif</span>
                      <select
                        value={tradeCounterForm.offerId}
                        onChange={(e) => setTradeCounterForm((prev) => ({ ...prev, offerId: e.target.value }))}
                      >
                        <option value="">Teklif sec</option>
                        {tradeOffers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.buyer || offer.id} • {Number(offer.offerPriceTlKg || 0).toFixed(2)} TL/kg
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="plant-select">
                      <span>Karsi fiyat (TL/kg)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tradeCounterForm.counterPriceTlKg}
                        onChange={(e) =>
                          setTradeCounterForm((prev) => ({ ...prev, counterPriceTlKg: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="demo-actions">
                    <button className="ghost" onClick={submitCounterOffer}>Karsi teklif gonder</button>
                  </div>
                </details>
                <details className="accordion compact">
                  <summary>Siparis + escrow</summary>
                  <label className="plant-select">
                    <span>Siparis sec</span>
                    <select
                      value={tradeOrderForm.orderId}
                      onChange={(e) => {
                        const orderId = e.target.value;
                        const selected = tradeOrders.find((x) => x.id === orderId);
                        setTradeOrderForm({
                          orderId,
                          invoiceNo: selected?.invoiceNo || "",
                          trackingCode: selected?.trackingCode || "",
                          shippingProvider: selected?.shippingProvider || ""
                        });
                      }}
                    >
                      <option value="">Siparis sec</option>
                      {tradeOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.id} • {order.crop || "-"} • {order.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Fatura no</span>
                      <input
                        value={tradeOrderForm.invoiceNo}
                        onChange={(e) =>
                          setTradeOrderForm((prev) => ({ ...prev, invoiceNo: e.target.value }))
                        }
                      />
                    </label>
                    <label className="plant-select">
                      <span>Kargo takip</span>
                      <input
                        value={tradeOrderForm.trackingCode}
                        onChange={(e) =>
                          setTradeOrderForm((prev) => ({ ...prev, trackingCode: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <label className="plant-select">
                    <span>Kargo firmasi</span>
                    <select
                      value={tradeOrderForm.shippingProvider}
                      onChange={(e) =>
                        setTradeOrderForm((prev) => ({ ...prev, shippingProvider: e.target.value }))
                      }
                    >
                      <option value="">Seciniz</option>
                      {shippingProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={syncTradeOrderShipping}>Kargo senkronla</button>
                    <button className="ghost" onClick={checkTradeOrderShippingStatus}>Durum sorgula</button>
                    <button className="ghost" onClick={syncAllTradeShipping}>Tumunu senkronla</button>
                    <button className="ghost" onClick={saveTradeOrderLogistics}>Fatura/takip kaydet</button>
                    <button
                      className="ghost"
                      onClick={() => loadTradeOrderContract(tradeOrderForm.orderId)}
                    >
                      Sozlesmeyi getir
                    </button>
                    <button
                      className="ghost"
                      onClick={() => downloadTradeOrderContractPdf(tradeOrderForm.orderId)}
                    >
                      PDF indir
                    </button>
                  </div>
                  {tradeOrders.length ? (
                    <ul>
                      {tradeOrders.slice(0, 5).map((order) => (
                        <li key={order.id}>
                          <strong>{order.crop || "Urun"} • {order.status}</strong>
                          <span>
                            {order.trackingCode || "-"} • escrow: {order.escrowStatus} • fatura:{" "}
                            {order.invoiceNo || "-"}
                          </span>
                          {order.trackingUrl ? (
                            <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                              Takip linki
                            </a>
                          ) : null}
                          <div className="demo-actions">
                            <button className="ghost" onClick={() => updateTradeOrder(order.id, "in_transit")}>
                              Kargoda
                            </button>
                            <button className="ghost" onClick={() => updateTradeOrder(order.id, "delivered")}>
                              Teslim edildi
                            </button>
                            <button
                              className="ghost"
                              onClick={() => updateTradeOrder(order.id, "completed", "released")}
                            >
                              Tamamla
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small className="muted">Aktif siparis yok.</small>
                  )}
                  {tradeContractPreview?.text ? (
                    <label className="plant-select">
                      <span>Sozlesme onizleme ({tradeContractPreview.contractNo || "-"})</span>
                      <textarea readOnly rows={7} value={tradeContractPreview.text} />
                    </label>
                  ) : null}
                  {shippingStatusPreview ? (
                    <small className="muted">
                      Kargo durum: {shippingStatusPreview.status || "-"} • {shippingStatusPreview.mode || "-"} •{" "}
                      {shippingStatusPreview.event || "-"}
                    </small>
                  ) : null}
                </details>
                <details className="accordion compact">
                  <summary>Kargo saglik paneli</summary>
                  {shippingHealth.length ? (
                    <ul>
                      {shippingHealth.map((item) => (
                        <li key={item.id}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.ok ? "Canli API hazir" : "Simulasyon"} •{" "}
                            {item.latencyMs ? `${item.latencyMs} ms` : "-"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small className="muted">Saglik verisi yok.</small>
                  )}
                  {shippingProviderConfigs.length ? (
                    <small className="muted">
                      Parser aktif: {shippingProviderConfigs.map((item) => item.id).join(", ")}
                    </small>
                  ) : null}
                </details>
                <details className="accordion compact">
                  <summary>Kargo parser debug</summary>
                  <label className="plant-select">
                    <span>Provider</span>
                    <select
                      value={shippingParseForm.provider}
                      onChange={(e) =>
                        setShippingParseForm((prev) => ({ ...prev, provider: e.target.value }))
                      }
                    >
                      {shippingProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="plant-select">
                    <span>Payload JSON</span>
                    <textarea
                      rows={6}
                      value={shippingParseForm.payload}
                      onChange={(e) =>
                        setShippingParseForm((prev) => ({ ...prev, payload: e.target.value }))
                      }
                    />
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={loadShippingSamplePayload}>Ornek payload doldur</button>
                    <button className="ghost" onClick={runShippingParsePreview}>Parse preview calistir</button>
                  </div>
                  {shippingParseResult?.parsed ? (
                    <small className="muted">
                      normalized: {shippingParseResult.parsed.normalizedStatus || "-"} • status:{" "}
                      {shippingParseResult.parsed.providerStatus || "-"} • code:{" "}
                      {shippingParseResult.parsed.trackingCode || "-"}
                    </small>
                  ) : null}
                </details>
                <details className="accordion compact">
                  <summary>Pazar bildirimleri</summary>
                  {tradeAlerts.length ? (
                    <ul>
                      {tradeAlerts.slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <strong>{item.title}</strong>
                          <span>{item.detail || "-"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <small className="muted">Bildirimi yok.</small>
                  )}
                </details>
                <details className="accordion compact">
                  <summary>Mesajlasma</summary>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Rol</span>
                      <select
                        value={tradeMessageForm.senderRole}
                        onChange={(e) => setTradeMessageForm((prev) => ({ ...prev, senderRole: e.target.value }))}
                      >
                        <option value="buyer">Alici</option>
                        <option value="seller">Satici</option>
                      </select>
                    </label>
                    <label className="plant-select">
                      <span>Gonderen</span>
                      <input
                        value={tradeMessageForm.sender}
                        onChange={(e) => setTradeMessageForm((prev) => ({ ...prev, sender: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="plant-select">
                    <span>Mesaj</span>
                    <input
                      value={tradeMessageForm.text}
                      onChange={(e) => setTradeMessageForm((prev) => ({ ...prev, text: e.target.value }))}
                    />
                  </label>
                  <div className="demo-actions">
                    <button className="ghost" onClick={submitTradeMessage}>Mesaj gonder</button>
                  </div>
                  {tradeMessages.length ? (
                    <ul>
                      {tradeMessages.slice(-5).map((msg) => (
                        <li key={msg.id}>
                          <strong>{msg.sender || msg.senderRole}</strong>
                          <span>{msg.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
                <details className="accordion compact">
                  <summary>Puanlama + guven skoru</summary>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Hedef rol</span>
                      <select
                        value={tradeRatingForm.targetRole}
                        onChange={(e) => setTradeRatingForm((prev) => ({ ...prev, targetRole: e.target.value }))}
                      >
                        <option value="seller">Satici</option>
                        <option value="buyer">Alici</option>
                      </select>
                    </label>
                    <label className="plant-select">
                      <span>Hedef ad</span>
                      <input
                        value={tradeRatingForm.targetName}
                        onChange={(e) => setTradeRatingForm((prev) => ({ ...prev, targetName: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="field-grid-2">
                    <label className="plant-select">
                      <span>Puan (1-5)</span>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={tradeRatingForm.score}
                        onChange={(e) => setTradeRatingForm((prev) => ({ ...prev, score: e.target.value }))}
                      />
                    </label>
                    <label className="plant-select">
                      <span>Yorum</span>
                      <input
                        value={tradeRatingForm.comment}
                        onChange={(e) => setTradeRatingForm((prev) => ({ ...prev, comment: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="demo-actions">
                    <button className="ghost" onClick={submitTradeRating}>Puanla</button>
                    <button
                      className="ghost"
                      onClick={() => loadTradeTrust(tradeRatingForm.targetName, tradeRatingForm.targetRole)}
                    >
                      Guveni sorgula
                    </button>
                  </div>
                  {tradeTrust ? (
                    <div className="info-badges">
                      <span className="badge">Guven: {tradeTrust.trustScore}/100 ({tradeTrust.tier})</span>
                      <span className="badge">Ort puan: {Number(tradeTrust.avgScore || 0).toFixed(2)}</span>
                      <span className="badge">Yorum sayisi: {tradeTrust.ratingCount || 0}</span>
                    </div>
                  ) : null}
                </details>
                {tradeMatches.length ? (
                  <details className="accordion compact">
                    <summary>Akilli teklif eslesmeleri</summary>
                    <ul>
                      {tradeMatches.slice(0, 6).map((item) => (
                        <li key={`${item.listingId}-${item.offerId}`}>
                          <strong>{item.listing?.title || item.listingId}</strong>
                          <span>
                            {item.offer?.buyer || "Alici"} • {Number(item.offer?.offerPriceTlKg || 0).toFixed(2)} TL/kg
                          </span>
                          <small className="muted">
                            Skor: {item.match?.score || 0}/100 • {(item.match?.reasons || []).slice(0, 3).join(", ")}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            </div>
          </section>
          )}

          <section className="features">
            <div className="steps-header">
              <h2>Ortalama verim (kg/da)</h2>
              <p>Il bazli veya ulusal ortalama verimler (rapor kaynakli).</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>{city}</h3>
                {(() => {
                  const key = econCrop || selectedPlant?.id || "";
                  const profile = cropYieldKgDa[key];
                  const local = profile?.provincesKgDa?.[city];
                  const national = profile?.nationalKgDa;
                  const label = cropLabelMap[key] || selectedPlant?.name || "Bitki";
                  if (!profile) {
                    return <p>Bu bitki icin verim verisi bulunamadi.</p>;
                  }
                  return (
                    <>
                      <div className="score-line">
                        <strong>{label}</strong>
                        <span>{local ? `${local} kg/da (il)` : "Il verisi yok"}</span>
                      </div>
                      <div className="score-line">
                        <span>Ulusal ortalama</span>
                        <span>{national ? `${national} kg/da` : "Yok"}</span>
                      </div>
                      {profile?.source?.title && (
                        <small className="muted">
                          Kaynak: {profile.source.title}
                        </small>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="step-card">
                <h3>Yorum ve oneriler</h3>
                <p>Verim ve fiyat artisi icin hedefli plan.</p>
                <ul>
                  <li>Verim ulusalin altindaysa sulama ve besin kalemlerini gozden gecir.</li>
                  <li>Il verisi yoksa ulusal ortalamayi hedef kabul et.</li>
                  <li>Verim artsin diye fenolojik evreye gore sulama planla.</li>
                </ul>
              </div>
            </div>
          </section>



          <section className="features">
            <div className="steps-header">
              <h2>Yedek parca ve servis</h2>
              <p>Makine ve ekipman servis gecmisi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Son servis</h3>
                <ul>
                  <li>Pompa bakimi: 3 ay once</li>
                  <li>Nozul degisimi: 1 ay once</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Planlanan</h3>
                <ul>
                  <li>Damla hat yenileme: 2 ay sonra</li>
                  <li>Depo temizligi: 1 ay sonra</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Stokta</h3>
                <ul>
                  <li>Nozul: 12 adet</li>
                  <li>Filtre: 6 adet</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hedef ve OKR paneli</h2>
              <p>Sezon hedefleri ve ilerleme durumlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hedef: Hastalik azalimi</h3>
                <p>Hedef: -%20</p>
                <div className="score-pill">Ilerleme: %11</div>
              </div>
              <div className="step-card">
                <h3>Hedef: Verim artisi</h3>
                <p>Hedef: +%15</p>
                <div className="score-pill">Ilerleme: %8</div>
              </div>
              <div className="step-card">
                <h3>Hedef: Su tasarrufu</h3>
                <p>Hedef: -%10</p>
                <div className="score-pill">Ilerleme: %5</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Danisman agi</h2>
              <p>Uretici, ziraat muhendisi ve teknik destek ile hizli baglanti.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Danismanlik formu</h3>
                <p>Formu doldur, mail uygulamasi acilsin. Ek dosya mail istemcisi uzerinden eklenir.</p>
                <div className="contact-grid">
                  <input
                    type="text"
                    placeholder="Ad Soyad"
                    value={contactForm.name}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                  <input
                    type="email"
                    placeholder="E-posta"
                    value={contactForm.email}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Konu (opsiyonel)"
                    value={contactForm.subject}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  />
                  <textarea
                    placeholder="Mesaj"
                    value={contactForm.message}
                    onChange={(event) =>
                      setContactForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                  />
                  <button className="primary" onClick={submitContact}>Gonder</button>
                  {contactStatus && <small className="muted">{contactStatus}</small>}
                </div>
              </div>
              <div className="step-card">
                <h3>Teknik destek</h3>
                <p>Ortalama yanit: 2 saat</p>
                <button className="primary" onClick={() => openConsultMail("Teknik destek icin danismanlik talebi.")}>Danismana baglan</button>
              </div>
              <div className="step-card">
                <h3>Saha ziyareti</h3>
                <p>Planli ziyaretler ile yerinde teshis.</p>
                <button className="ghost" onClick={() => openConsultMail("Saha ziyareti icin randevu talebi.")}>Randevu al</button>
              </div>
              <div className="step-card">
                <h3>Topluluk forumu</h3>
                <p>Benzer sorunlari yasayan ureticilerle paylas.</p>
                <button className="ghost" onClick={() => openConsultMail("Topluluk forumu daveti talebi.")}>Forum</button>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Senaryo simulatörü</h2>
              <p>"Sunu ekersem ne olur?" sorusuna 3 senaryo.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Senaryo A</h3>
                <p>Domates ekimi: Yuksek gelir, orta hastalik riski.</p>
                <div className="score-pill">Tahmin: +%12</div>
              </div>
              <div className="step-card">
                <h3>Senaryo B</h3>
                <p>Biber ekimi: Orta gelir, dusuk hastalik riski.</p>
                <div className="score-pill">Tahmin: +%7</div>
              </div>
              <div className="step-card">
                <h3>Senaryo C</h3>
                <p>Marul ekimi: Hizli nakit, yuksek fiyat riski.</p>
                <div className="score-pill">Tahmin: +%3</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Senaryo simulatoru (interaktif)</h2>
              <p>Urun, risk ve fiyat varsayimi ile sonuc uretir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Senaryo ayarlari</h3>
                <label className="plant-select">
                  <span>Urun</span>
                  <select value={demoScenario.crop} onChange={(e) => setDemoScenario((prev) => ({ ...prev, crop: e.target.value }))}>
                    {Object.keys(cropLabelMap).map((key) => (
                      <option key={key} value={key}>{cropLabelMap[key]}</option>
                    ))}
                  </select>
                </label>
                <label className="plant-select">
                  <span>Risk (%)</span>
                  <input type="number" min="0" max="100" value={demoScenario.risk} onChange={(e) => setDemoScenario((prev) => ({ ...prev, risk: e.target.value }))} />
                </label>
                <label className="plant-select">
                  <span>Fiyat (TL/kg)</span>
                  <input type="number" min="0" value={demoScenario.price} onChange={(e) => setDemoScenario((prev) => ({ ...prev, price: e.target.value }))} />
                </label>
                <label className="plant-select">
                  <span>Verim artisi (%)</span>
                  <input type="number" min="-30" max="30" value={demoScenario.yieldBoost} onChange={(e) => setDemoScenario((prev) => ({ ...prev, yieldBoost: e.target.value }))} />
                </label>
              </div>
              <div className="step-card">
                <h3>Sonuc</h3>
                <p>Ayarlanmis verim: {demoScenarioSummary.adjustedYield} kg/da</p>
                <p>Gelir (da): {demoScenarioSummary.revenue} TL</p>
                <div className="score-pill">Skor: {demoScenarioSummary.score}</div>
              </div>
              <div className="step-card">
                <h3>Yorum</h3>
                <p>Risk dusukse ve fiyat yuksekse senaryo daha avantajlidir.</p>
              </div>
            </div>
          </section>


          <section className="features">
            <div className="steps-header">
              <h2>Hasat kalite kontrol</h2>
              <p>Pazara cikmadan once kalite standartlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Siniflama</h3>
                <ul>
                  <li>Boy ve renk standardi</li>
                  <li>Hasar ayiklama</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Kalite puani</h3>
                <p>Ortalama: 86/100</p>
                <div className="score-pill">Hedef: 90/100</div>
              </div>
              <div className="step-card">
                <h3>Fire oranı</h3>
                <p>%4.2</p>
                <div className="score-pill">Hedef: %3</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Deprem - afet hazirlik</h2>
              <p>Acik alan ve tesis icin temel hazirlik listesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Acil durum plani</h3>
                <ul>
                  <li>Su ve yakit stoklari</li>
                  <li>Ilk yardim seti</li>
                  <li>Alternatif sulama planı</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Sigorta kontrolu</h3>
                <ul>
                  <li>Tarim sigortasi poliçesi</li>
                  <li>Hasar bildirim sureci</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Veri yedegi</h3>
                <ul>
                  <li>Gunluk rapor yedegi</li>
                  <li>Offline liste</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Zararlı erken uyarı</h2>
              <p>Populasyon artışı ve risk seviyeleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Beyaz sinek</h3>
                <div className="risk-meter mid">Orta risk</div>
                <p>Tuzak kontrolünü artır.</p>
              </div>
              <div className="step-card">
                <h3>Trips</h3>
                <div className="risk-meter high">Yüksek risk</div>
                <p>Yaprak altı kontrol ve izolasyon.</p>
              </div>
              <div className="step-card">
                <h3>Yaprak biti</h3>
                <div className="risk-meter low">Düşük risk</div>
                <p>Rutin izleme yeterli.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Kalite ve sertifikasyon</h2>
              <p>Organik, iyi tarım ve denetim kontrol listeleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Iyi tarim</h3>
                <ul>
                  <li>Girdi kayıtları</li>
                  <li>Izlenebilirlik formları</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Organik</h3>
                <ul>
                  <li>Sertifikalı girdi kontrolü</li>
                  <li>Uygulama kayıtları</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Denetim</h3>
                <ul>
                  <li>Rapor ve belge arşivi</li>
                  <li>Numune kayıtları</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Ar-Ge ve deneme parselleri</h2>
              <p>Yeni çeşitler ve uygulamalar için test alanı.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Deneme 1</h3>
                <p>Yeni domates çeşidi, düşük sulama.</p>
                <div className="score-pill">Sonuç: +%5</div>
              </div>
              <div className="step-card">
                <h3>Deneme 2</h3>
                <p>Organik gübre, orta verim.</p>
                <div className="score-pill">Sonuç: +%2</div>
              </div>
              <div className="step-card">
                <h3>Deneme 3</h3>
                <p>Yeni sulama paterni, risk düşük.</p>
                <div className="score-pill">Sonuç: +%6</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Isletme notlari</h2>
              <p>Sezonun kritik kararları ve gözlemleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <textarea
                  className="note"
                  placeholder="Orn: yeni deneme, yeni pazar, yeni ekipman"
                />
              </div>
              <div className="step-card">
                <h3>Not ipuçları</h3>
                <p>Verim, maliyet, risk ve ekip notlarını düzenli gir.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Karar kutusu</h2>
              <p>Bugun yapilacak 3 kritik karar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Ilaclama zamani</h3>
                <p>Ruzgar 12 km/sa altinda, uygulama icin uygun.</p>
              </div>
              <div className="step-card">
                <h3>Sulama karari</h3>
                <p>Toprak nemi dusuk, aksam sulamasi onerilir.</p>
              </div>
              <div className="step-card">
                <h3>Hasat planlamasi</h3>
                <p>Pazar fiyat trendi yukseliyor, erken hasat dusun.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Uretim saglik skoru</h2>
              <p>Toprak, hastalik ve iklim verilerinden tek skor.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Toplam skor</h3>
                <div className="score-pill">78 / 100</div>
                <p>Hedef: 85+</p>
              </div>
              <div className="step-card">
                <h3>Zayif alan</h3>
                <p>Nem dengesizligi ve mantar riski.</p>
              </div>
              <div className="step-card">
                <h3>Guçlu alan</h3>
                <p>Toprak besini iyi, bitki gelisimi stabil.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Sezon kontrol paneli</h2>
              <p>Sezonun kritik metrikleri tek satırda.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hedef verim</h3>
                <p>4.5 ton/da</p>
              </div>
              <div className="step-card">
                <h3>Gerceklesen</h3>
                <p>3.1 ton/da</p>
              </div>
              <div className="step-card">
                <h3>Kalan sure</h3>
                <p>42 gun</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gozlem paneli</h2>
              <p>Bugun sahadan gelen kritik sinyaller.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yaprak analizi</h3>
                <p>Son 24 saatte 8 yeni leke bildirimi.</p>
                <div className="score-pill">Trend: +%9</div>
              </div>
              <div className="step-card">
                <h3>Nem dengesi</h3>
                <p>3 parselde nem yuksek.</p>
                <div className="risk-meter mid">Orta risk</div>
              </div>
              <div className="step-card">
                <h3>Hizli oneri</h3>
                <p>Bu gece sulamayi azalt, sabah havalandirma ac.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Topraktan sofraya izlenebilirlik</h2>
              <p>Parti bazli izlenebilirlik ve QR etiket kurgusu.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Parti kodu</h3>
                <p>2026-02-04 / Parsel A / Domates</p>
              </div>
              <div className="step-card">
                <h3>Etiketleme</h3>
                <p>QR ile uretim tarihi, uygulama ve tarla bilgisi.</p>
              </div>
              <div className="step-card">
                <h3>Denetim gecmisi</h3>
                <p>2 kontrol basarili, 1 dusuk risk notu.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Dagitim ve rota planlama</h2>
              <p>Hasat sonrasi lojistik ve rota optimizasyonu.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Rota 1</h3>
                <p>Malatya Hal -> 2 saat 15 dk</p>
                <div className="score-pill">Yakıt: 14 L</div>
              </div>
              <div className="step-card">
                <h3>Rota 2</h3>
                <p>Perakende zinciri -> 3 saat 10 dk</p>
                <div className="score-pill">Yakıt: 18 L</div>
              </div>
              <div className="step-card">
                <h3>Rota 3</h3>
                <p>Yerel pazar -> 1 saat 20 dk</p>
                <div className="score-pill">Yakıt: 9 L</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Enerji ve maliyet optimizasyonu</h2>
              <p>Pompalar ve soguk zincir icin enerji takibi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Elektrik kullanimi</h3>
                <p>Gunluk 120 kWh</p>
                <div className="score-pill">Hedef: 95 kWh</div>
              </div>
              <div className="step-card">
                <h3>Gunes enerji oranı</h3>
                <p>%32</p>
                <div className="score-pill">Hedef: %40</div>
              </div>
              <div className="step-card">
                <h3>Enerji tavsiyesi</h3>
                <p>Gece tarife ile sulama planla.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI risk sinyalleri</h2>
              <p>Hava, toprak ve hastalik verilerini birlestiren sinyaller.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Mantar riski</h3>
                <div className="risk-meter high">Yuksek</div>
                <p>Nem + yaprak islakligi artiyor.</p>
              </div>
              <div className="step-card">
                <h3>Su stresi</h3>
                <div className="risk-meter mid">Orta</div>
                <p>Toprak nemi dalgalaniyor.</p>
              </div>
              <div className="step-card">
                <h3>Besin eksikligi</h3>
                <div className="risk-meter low">Dusuk</div>
                <p>Bitki gelisimi stabil.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Gorsel kalite skoru</h2>
              <p>Yaprak ve meyve goruntulerinden kalite puani.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yaprak kalitesi</h3>
                <div className="score-pill">89 / 100</div>
              </div>
              <div className="step-card">
                <h3>Meyve kalitesi</h3>
                <div className="score-pill">84 / 100</div>
              </div>
              <div className="step-card">
                <h3>Goruntu guvenirligi</h3>
                <div className="score-pill">92%</div>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Alarm paneli</h2>
              <p>Oncelik sirasina gore kritik alarmlar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Kritik</h3>
                <ul>
                  <li>Parsel 1: Mantar riski (kirmizi)</li>
                  <li>Parsel 2: Don riski (kirmizi)</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Orta</h3>
                <ul>
                  <li>Parsel 3: Tuzluluk artiyor</li>
                  <li>Parsel 4: Nem dengesizligi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Dusuk</h3>
                <ul>
                  <li>Parsel 5: Izleme</li>
                  <li>Parsel 6: Denge stabil</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Yapay zeka saha asistani</h2>
              <p>Gorus, teshis ve aksiyon cikarmayi tek akista birlestir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Konusma akisi</h3>
                <ul>
                  <li>Durum sorusu ("Toprak nasil?")</li>
                  <li>Analiz ve cevap</li>
                  <li>Uygulama planina ekle</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oneri jeneratörü</h3>
                <p>Hava + toprak + hastalik sinyalleriyle otomatik plan.</p>
                <div className="score-pill">Guven: %82</div>
              </div>
              <div className="step-card">
                <h3>Takip listesi</h3>
                <p>AI tarafindan olusturulan 5 gunluk takip akisi.</p>
                <span className="badge subtle">Takvimde ac</span>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Urun kalite standardi</h2>
              <p>Pazara cikmadan once kalite kontrol puanlari.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Boy standardi</h3>
                <p>%92 uyum</p>
              </div>
              <div className="step-card">
                <h3>Renk standardi</h3>
                <p>%88 uyum</p>
              </div>
              <div className="step-card">
                <h3>Hasar standardi</h3>
                <p>%95 uyum</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Hastalik kalkanı</h2>
              <p>Sezon boyunca koruyucu adimlari planla.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Onleyici rutin</h3>
                <ul>
                  <li>Haftalik yaprak kontrolu</li>
                  <li>Hava akis testi</li>
                  <li>Riskli alan dezenfeksiyonu</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Kimyasal plan</h3>
                <ul>
                  <li>Bakirli koruyucu (14 gun)</li>
                  <li>Donemsel fungisit</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Organik plan</h3>
                <ul>
                  <li>Neem + sabunlu su</li>
                  <li>Bitki bagisikligi guclendirici</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Tek tus mod</h2>
              <p>Tum kritik durumlari tek ekranda gosterir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugun</h3>
                <ul>
                  <li>Nem: Yuksek</li>
                  <li>Don riski: Orta</li>
                  <li>Zararli baskisi: Orta</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Oncelik</h3>
                <ul>
                  <li>Havalandirma ac</li>
                  <li>Yaprak alti kontrol</li>
                  <li>Sulama saatini guncelle</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Hizli aksiyon</h3>
                <button className="primary">Aksiyonlari baslat</button>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Akilli bildirimler</h2>
              <p>Mobilde kritik degisikliklerde otomatik bildirim.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Don bildirimi</h3>
                <p>Hava 2°C altina dustugunde uyar.</p>
              </div>
              <div className="step-card">
                <h3>Hastalik alarmi</h3>
                <p>Yeni leke gorulurse hizli uyar.</p>
              </div>
              <div className="step-card">
                <h3>Su tasarruf bildirimi</h3>
                <p>Gunluk su tuketimi hedefi asarsa uyar.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Otomatik rapor paketi</h2>
              <p>Gunluk ve haftalik raporlari otomatik olustur.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Gunluk rapor</h3>
                <p>Hava + hastalik + uygulama ozetleri.</p>
              </div>
              <div className="step-card">
                <h3>Haftalik rapor</h3>
                <p>Risk trendleri + aksiyon basarisi.</p>
              </div>
              <div className="step-card">
                <h3>Paylasim</h3>
                <p>PDF, e-posta, danisman paylasimi.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI ciftlik gunlugu</h2>
              <p>Gunluk olaylari otomatik ozetleyen akilli gunluk.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Bugunun ozeti</h3>
                <p>Nem artisi +2, yeni leke bildirimi 3 adet.</p>
                <div className="score-pill">Ozet: Dengeli</div>
              </div>
              <div className="step-card">
                <h3>En kritik olay</h3>
                <p>Parsel 1'de yaprak islakligi yuksek.</p>
              </div>
              <div className="step-card">
                <h3>Not ekle</h3>
                <textarea className="note" placeholder="Bugun ne oldu?" />
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Saha gorev panosu</h2>
              <p>Yapilacaklar, devam edenler ve tamamlananlar.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Yapilacak</h3>
                <ul>
                  <li>Damla hat temizligi</li>
                  <li>Yaprak alti kontrol</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Devam eden</h3>
                <ul>
                  <li>Budama calismasi</li>
                  <li>Besin destegi</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Tamamlandi</h3>
                <ul>
                  <li>Toprak testi</li>
                  <li>Hava sensörü kalibrasyonu</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Mikro iklim sensor hub</h2>
              <p>Saha sensorlerinden gelen anlik veri paneli.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Sensor 1</h3>
                <p>Nem: %72 • Isik: 430 lux</p>
              </div>
              <div className="step-card">
                <h3>Sensor 2</h3>
                <p>Sicaklik: 19°C • Ruzgar: 9 km/sa</p>
              </div>
              <div className="step-card">
                <h3>Sensor 3</h3>
                <p>Toprak pH: 7.2 • Tuzluluk: Dusuk</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Zararli tarama haritasi</h2>
              <p>Parsel bazli zararlı yogunluk göstergesi.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Parsel A</h3>
                <div className="risk-meter mid">Orta yogunluk</div>
              </div>
              <div className="step-card">
                <h3>Parsel B</h3>
                <div className="risk-meter high">Yuksek yogunluk</div>
              </div>
              <div className="step-card">
                <h3>Parsel C</h3>
                <div className="risk-meter low">Dusuk yogunluk</div>
              </div>
            </div>
          </section>



          <div id="learning" className="section-anchor" />

                      <section className="features">
            <div className="steps-header">
              <h2>Tarim mikro dersler</h2>
              <p>5 dakikalik mini egitim modulleri.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Hastalik teshisi 101</h3>
                <p>Yaprakta 5 temel belirtiyi ayirt et.</p>
              </div>
              <div className="step-card">
                <h3>Sulama stratejisi</h3>
                <p>Hangi gun, ne kadar sulama?</p>
              </div>
              <div className="step-card">
                <h3>Toprak sagligi</h3>
                <p>pH ve organik maddeyi koruma.</p>
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Don erken uyari</h2>
              <p>Onumuzdeki 48 saat icin olasi don senaryolari.</p>
            </div>
            <div className="step-grid">
              {frostOutlook.length ? (
                frostOutlook.map((item) => (
                  <div key={item.day} className="step-card">
                    <h3>{item.day}</h3>
                    <div className={`risk-meter ${item.level}`}>
                      {item.level === "high" ? "Yuksek risk" : item.level === "mid" ? "Orta risk" : "Dusuk risk"}
                    </div>
                    <p>Minimum {item.min}°C.</p>
                  </div>
                ))
              ) : (
                <div className="step-card">
                  <h3>Tahmin bekleniyor</h3>
                  <p>Don uyarisi icin hava verisi yukleniyor.</p>
                </div>
              )}
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>Akilli aksiyon motoru</h2>
              <p>Toprak, hava, risk ve hastalik verisini birlestirir.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Otomatik skor</h3>
                <p>Nem + isik + risk + hastalik sinyali ile saha skoru.</p>
                <div className="score-pill">Saha Skoru: {fieldScore.score} / 100</div>
              </div>
              <div className="step-card">
                <h3>Onceliklendirme</h3>
                <ul>
                  {fieldScore.priorities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="step-card">
                <h3>Kritik uyarilar</h3>
                <div className="chip-row">
                  {(weatherSummary?.riskTags || ["Veri bekleniyor"]).map((tag) => (
                    <span key={tag} className={`chip ${tag !== "Normal" ? "warning" : ""}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="step-card">
                <h3>Saha aksiyon listesi</h3>
                <p>Sonuclar netse gune yayilmis aksiyonlar.</p>
                {analysisState === "ok" ? (
                  <ul>
                    {(result?.carePlan || []).slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Oncelikle teshisi netlestir. Ardindan aksiyon listesi olusur.</p>
                )}
              </div>
            </div>
          </section>

          <section className="features">
            <div className="steps-header">
              <h2>AI oturum planlayici</h2>
              <p>Sesli ve goruntulu teshis icin adim adim akisi gor.</p>
            </div>
            <div className="step-grid">
              <div className="step-card">
                <h3>Oturum akisi</h3>
                <ul>
                  <li>Bitki secimi yap</li>
                  <li>Kamera ile leke/zarar bolgesini goster</li>
                  <li>Sesli sorunu kaydet</li>
                  <li>Otomatik rapor + ilac/uygulama planini al</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Izin ve guvenlik</h3>
                <ul>
                  <li>Kamera izni: sadece teshis icin</li>
                  <li>Mikrofon izni: soru-cevap icin</li>
                  <li>Kayit kontrolu: tek tusla silme</li>
                </ul>
              </div>
              <div className="step-card">
                <h3>Onerilen kullanim</h3>
                <ul>
                  <li>Gunes acisinda net goruntu</li>
                  <li>Yaprak alti + ustu ayri goster</li>
                  <li>2-3 dk icinde sonuc</li>
                </ul>
              </div>
            </div>
          </section>


          <section className="features">
                <div className="steps-header">
                  <h2>Yesil odakli ozellikler</h2>
                  <p>Tarla ve sera icin pratik ve guvenilir cozumler.</p>
                </div>
                <div className="step-grid">
                  {features.map((item) => (
                    <div key={item.title} className="step-card">
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Hizli aksiyonlar</h2>
                  <p>Gunluk kullanima uygun kisa ve net adimlar.</p>
                </div>
                <div className="step-grid">
                  {quickActions.map((item) => (
                    <div key={item.title} className="step-card">
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Hizli uyari karti</h2>
                  <p>Nem, isik ve hava akisini hizlica kontrol et.</p>
                </div>
                <div className="step-grid">
                  {[
                    { key: "moisture", label: "Toprak nemi" },
                    { key: "light", label: "Isik duzeyi" },
                    { key: "airflow", label: "Hava sirkulasyonu" },
                    { key: "temperature", label: "Sicaklik" },
                    { key: "humidity", label: "Ortam nemi" },
                    { key: "soilPh", label: "Toprak pH" },
                    { key: "salinity", label: "Tuzluluk" },
                    { key: "leafWetness", label: "Yaprak islakligi" },
                    { key: "pestPressure", label: "Zararli baskisi" },
                    { key: "nutrientBalance", label: "Besin dengesi" }
                  ].map((item) => (
                    <div key={item.key} className="step-card">
                      <h3>{item.label}</h3>
                      <div className="pill-row">
                        {["dusuk", "denge", "yuksek"].map((value) => (
                          <button
                            key={value}
                            className={`pill-btn ${alerts[item.key] === value ? "active" : ""}`}
                            onClick={() => setAlerts((prev) => ({ ...prev, [item.key]: value }))}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="step-card">
                    <h3>Hizli oneri</h3>
                    <p>{alertRecommendation()}</p>
                  </div>
                </div>
              </section>

              <section className="features">
                <div className="steps-header">
                  <h2>Sulama alarmi</h2>
                  <p>Hatirlatici saatini belirle, rutinini aksatma.</p>
                </div>
                <div className="step-grid">
                  <div className="step-card">
                    <label className="todo">
                      <input
                        type="checkbox"
                        checked={reminders.enabled}
                        onChange={(event) =>
                          setReminders((prev) => ({ ...prev, enabled: event.target.checked }))
                        }
                      />
                      <span>
                        <strong>Hatirlatici aktif</strong>
                        <em>Mobil uygulamada bildirim olarak gelecek.</em>
                      </span>
                    </label>
                  </div>
                  <div className="step-card">
                    <h3>Sulama saati</h3>
                    <input
                      className="time-input"
                      type="time"
                      value={reminders.wateringTime}
                      onChange={(event) =>
                        setReminders((prev) => ({ ...prev, wateringTime: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </section>


            </>
          )}
          <div id="operations" className="section-anchor" />
          className={bottomTab === "home" ? "active" : ""}
          onClick={() => handleBottomTab("home")}
          aria-current={bottomTab === "home" ? "page" : undefined}
          aria-label="Teshis ve kilavuz"
          title="Teshis + Kilavuz"
        >
          <Leaf size={14} />
          <span className="tab-label">Ana</span>
        </button>
        <button
          type="button"
          className={bottomTab === "weather" ? "active" : ""}
          onClick={() => handleBottomTab("weather")}
          aria-current={bottomTab === "weather" ? "page" : undefined}
          aria-label="Iklim ve toprak paneli"
          title="Iklim + Toprak"
        >
          <AlertCircle size={14} />
          <span className="tab-label">Iklim</span>
        </button>
        <button
          type="button"
          className={bottomTab === "demos" ? "active" : ""}
          onClick={() => handleBottomTab("demos")}
          aria-current={bottomTab === "demos" ? "page" : undefined}
          aria-label="Demolar"
          title="Demolar"
        >
          <Sparkles size={14} />
          <span className="tab-label">Demo</span>
        </button>
        <button
          type="button"
          className={bottomTab === "land" ? "active" : ""}
          onClick={() => handleBottomTab("land")}
          aria-current={bottomTab === "land" ? "page" : undefined}
          aria-label="Arazi fiyat tahmini"
          title="Arazi Fiyat"
        >
          <LeafyGreen size={14} />
          <span className="tab-label">Arazi</span>
        </button>
        <button
          type="button"
          className={bottomTab === "market" ? "active" : ""}
          onClick={() => handleBottomTab("market")}
          aria-current={bottomTab === "market" ? "page" : undefined}
          aria-label="Pazar yeri"
          title="Pazar Yeri"
        >
          <ShieldCheck size={14} />
          <span className="tab-label">Pazar</span>
        </button>
      </nav>
      <section className="developer">
        <div className="developer-card">
          <div className="developer-meta">
            <h2>Gelistirici</h2>
            <p>
              Mehmet Yasin Kaya • Boğaziçi Bilgisayar
            </p>
          </div>
          <div className="developer-links">
            <span>E-posta: gs7016903@gmail.com</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
