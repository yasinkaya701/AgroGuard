export const MOCK_DISEASE_CATALOG = {
    tomato: {
        healthy: {
            label: "Tomato___healthy",
            name: "Tomato healthy",
            summary: "Belirgin semptom bulunmadi."
        },
        issues: [
            {
                label: "Tomato___Early_blight",
                name: "Tomato Early blight",
                summary: "Yapraktaki konsantrik kahverengi lekeler.",
                keywords: ["early", "yanik", "blight", "leke"]
            },
            {
                label: "Tomato___Late_blight",
                name: "Tomato Late blight",
                summary: "Hizli ilerleyen koyu lekelenme ve kurumalar.",
                keywords: ["late", "gec", "kararma", "çoklu"]
            },
            {
                label: "Tomato___Septoria_leaf_spot",
                name: "Tomato Septoria leaf spot",
                summary: "Kucuk, çok sayida yuvarlak lekeler.",
                keywords: ["septoria", "nokta", "spot"]
            },
            {
                label: "Tomato___Spider_mites Two-spotted_spider_mite",
                name: "Tomato Spider mites",
                summary: "Ince ag dokusu ve benekli sararma.",
                keywords: ["mite", "akar", "ag", "bocek"]
            },
            {
                label: "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
                name: "Tomato Yellow Leaf Curl Virus",
                summary: "Kivrilma ve sararma baskin.",
                keywords: ["virus", "curl", "kivrilma", "sari"]
            }
        ]
    },
    potato: {
        healthy: {
            label: "Potato___healthy",
            name: "Potato healthy",
            summary: "Semptom saptanmadi."
        },
        issues: [
            {
                label: "Potato___Early_blight",
                name: "Potato Early blight",
                summary: "Yapraktaki koyu kahve lekeler.",
                keywords: ["early", "yanik", "blight", "leke"]
            },
            {
                label: "Potato___Late_blight",
                name: "Potato Late blight",
                summary: "Nemli kosulda hizli yayılan lezyonlar.",
                keywords: ["late", "gec", "islak", "kararma"]
            }
        ]
    },
    pepper: {
        healthy: {
            label: "Pepper,_bell___healthy",
            name: "Pepper healthy",
            summary: "Görsel olarak sağlıkli gorunum."
        },
        issues: [
            {
                label: "Pepper,_bell___Bacterial_spot",
                name: "Pepper Bacterial spot",
                summary: "Koyu, duzensiz bakteriyel leke paterni.",
                keywords: ["bacterial", "spot", "leke", "bakteri"]
            }
        ]
    },
    apple: {
        healthy: {
            label: "Apple___healthy",
            name: "Apple healthy",
            summary: "Hastalik bulgusu düşük."
        },
        issues: [
            {
                label: "Apple___Apple_scab",
                name: "Apple scab",
                summary: "Zeytinimsi lekelenme ve kabuklanma.",
                keywords: ["scab", "kabuk", "lekeli"]
            },
            {
                label: "Apple___Black_rot",
                name: "Apple black rot",
                summary: "Koyu, halka formunda doku bozulmasi.",
                keywords: ["black", "rot", "kararma", "curume"]
            },
            {
                label: "Apple___Cedar_apple_rust",
                name: "Apple cedar rust",
                summary: "Pas tonunda noktalanma.",
                keywords: ["rust", "pas", "turuncu"]
            }
        ]
    },
    grape: {
        healthy: {
            label: "Grape___healthy",
            name: "Grape healthy",
            summary: "Asma yapragi dengeli gorunuyor."
        },
        issues: [
            {
                label: "Grape___Black_rot",
                name: "Grape Black rot",
                summary: "Yaprakta siyaha yakin lekeler.",
                keywords: ["rot", "black", "kararma"]
            },
            {
                label: "Grape___Esca_(Black_Measles)",
                name: "Grape Esca",
                summary: "Damar arasi renk kaybi ve mozaik.",
                keywords: ["esca", "measles", "mozaik"]
            },
            {
                label: "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)",
                name: "Grape Leaf blight",
                summary: "Yaprak lekesi ve kurumaya giden alanlar.",
                keywords: ["blight", "spot", "lekeli"]
            }
        ]
    },
    fallback: {
        healthy: {
            label: "Generic___healthy",
            name: "Saglikli gorunum",
            summary: "Belirgin semptom yakalanmadi."
        },
        issues: [
            {
                label: "Generic___Leaf_spot",
                name: "Leaf spot",
                summary: "Yapraktaki lekelenme olasiligi.",
                keywords: ["spot", "leke", "benek"]
            },
            {
                label: "Generic___Blight",
                name: "Blight",
                summary: "Doku bozulmasi ve solgünlük paterni.",
                keywords: ["blight", "yanik", "solma"]
            }
        ]
    }
};

export const mockNormText = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/ç/g, "c")
        .replace(/ğ/g, "g")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u");

export const mockPrettyLabel = (label) =>
    String(label || "")
        .replace(/___/g, " - ")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

export const mockHash = (value) => {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash +=
            (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0);
};

export const pickMockCatalog = (plant) => {
    const key = mockNormText(plant).replace(/[^a-z0-9]+/g, "");
    if (MOCK_DISEASE_CATALOG[key]) return MOCK_DISEASE_CATALOG[key];
    return MOCK_DISEASE_CATALOG.fallback;
};

export const buildMockPlantDiseases = (plant) => {
    const catalog = pickMockCatalog(plant);
    return {
        plant: plant || "tomato",
        healthy: catalog.healthy.name,
        diseases: catalog.issues.map((item) => ({
            label: item.label,
            pretty: mockPrettyLabel(item.label),
            name: item.name,
            summary: item.summary
        }))
    };
};

export const buildMockDiagnosis = ({ plant, imageName = "", imageSize = 0, nowIso = "" } = {}) => {
    const catalog = pickMockCatalog(plant);
    const issueList = Array.isArray(catalog.issues) ? catalog.issues : [];
    const normalizedHint = mockNormText(imageName);
    const seed = mockHash(`${plant}|${imageName}|${imageSize}|${nowIso.slice(0, 10)}`);
    const healthyHint = /(healthy|sağlık|temiz|normal)/.test(normalizedHint);
    let selectedIssue = issueList.find((item) =>
        (item.keywords || []).some((key) => normalizedHint.includes(mockNormText(key)))
    );
    let isHealthy = false;
    if (healthyHint && !selectedIssue) {
        isHealthy = true;
    } else if (!selectedIssue) {
        const healthyChance = (seed % 100) < 28;
        isHealthy = healthyChance || !issueList.length;
        if (!isHealthy) {
            selectedIssue = issueList[seed % issueList.length];
        }
    }
    if (!selectedIssue && issueList.length) selectedIssue = issueList[seed % issueList.length];

    const topLabel = isHealthy ? catalog.healthy.label : selectedIssue?.label || catalog.healthy.label;
    const secondLabel = isHealthy
        ? (issueList[seed % Math.max(issueList.length, 1)]?.label || catalog.healthy.label)
        : catalog.healthy.label;
    const thirdLabel = issueList[(seed >> 5) % Math.max(issueList.length, 1)]?.label || secondLabel;

    const topBase = isHealthy ? 0.56 : 0.52;
    const topRange = isHealthy ? 0.32 : 0.36;
    const top1 = Math.min(0.93, topBase + ((seed % 1000) / 1000) * topRange);
    const secondRaw = Math.min(top1 - 0.06, 0.13 + (((seed >> 4) % 700) / 1000) * 0.25);
    const top2 = Math.max(0.05, secondRaw);
    const top3 = Math.max(0.02, 1 - top1 - top2);
    const norm = top1 + top2 + top3 || 1;
    const pred = [
        { label: topLabel, confidence: Number((top1 / norm).toFixed(4)) },
        { label: secondLabel, confidence: Number((top2 / norm).toFixed(4)) },
        { label: thirdLabel, confidence: Number((top3 / norm).toFixed(4)) }
    ];
    const margin = Math.max(0, pred[0].confidence - pred[1].confidence);
    const confidence = pred[0].confidence;
    const confidenceTier = confidence >= 0.7 ? "high" : confidence >= 0.45 ? "medium" : "low";
    const reviewNeeded = confidence < 0.55 || margin < 0.1;
    const diagnosisStatus = isHealthy ? (reviewNeeded ? "review" : "healthy") : reviewNeeded ? "review" : "issue";
    const reliabilityScore = Math.round(
        Math.max(44, Math.min(95, 58 + confidence * 28 + margin * 22 - (diagnosisStatus === "review" ? 10 : 0)))
    );
    const reliabilityLevel = reliabilityScore >= 75 ? "high" : reliabilityScore >= 55 ? "medium" : "low";
    const diagnosisName = isHealthy ? catalog.healthy.name : selectedIssue?.name || "Bitki riski";
    const diagnosisSummary = isHealthy
        ? catalog.healthy.summary
        : selectedIssue?.summary || "Semptom gorunumu mevcut.";
    const warnings = [
        "Canli backend kapali oldugu icin tahmini mock teşhis gosteriliyor."
    ];
    if (diagnosisStatus === "review") warnings.push("Sonuc belirsiz; daha net cekimle tekrar deneyin.");
    if (!isHealthy) warnings.push("Semptomlar yerinde dogrulanmadan ilaçlama yapmayin.");
    const confidenceProfileScore = Math.max(
        42,
        Math.min(92, Math.round(confidence * 70 + margin * 120 + reliabilityScore * 0.2))
    );
    const confidenceBand =
        confidenceProfileScore >= 75 ? "strong" : confidenceProfileScore >= 55 ? "medium" : "weak";

    return {
        detectedPlant: plant,
        diagnosis: {
            name: diagnosisName,
            status: diagnosisStatus,
            confidence: Number(confidence.toFixed(3)),
            confidencePct: Math.round(confidence * 1000) / 10,
            confidenceTier,
            severity: isHealthy ? "low" : "medium",
            problemArea: "Yaprak",
            summary: diagnosisSummary
        },
        carePlan: isHealthy
            ? ["7 günlük izleme yap", "Duzenli sulama ve hijyen rutini koru", "Yeni leke olusumunu takip et"]
            : [
                "Semptomlu yapraklari ayir ve kaydet",
                "Uygun etken maddeyi etikete göre sec",
                "48 saat sonra yeni cekimle sonucu dogrula"
            ],
        treatments: isHealthy
            ? {
                organic: ["Koruyucu saha hijyeni ve rutin gozlem."],
                chemical: []
            }
            : {
                organic: ["Enfekte yapraklari uzaklastir, hava sirkulasyonunu arttir."],
                chemical: ["Etken madde seçimini ruhsat etiketi + PHI/REI kuraliyla yap."]
            },
        model: {
            source: "frontend-mock-smart",
            labels: issueList.length + 1,
            tta: false,
            inputSize: 224,
            fallbackUsed: false
        },
        modelMetrics: {
            top1: pred[0].confidence,
            top2: pred[1].confidence,
            margin: Number(margin.toFixed(4)),
            entropy: Number((1 - pred[0].confidence).toFixed(4)),
            lowConfidence: diagnosisStatus === "review",
            confidenceProfileScore,
            confidenceProfileBand: confidenceBand
        },
        confidenceProfile: {
            score: confidenceProfileScore,
            band: confidenceBand,
            summary:
                confidenceBand === "strong"
                    ? "Mock model ayrimi guclu."
                    : confidenceBand === "medium"
                        ? "Mock model ayrimi orta seviye."
                        : "Mock model ayrimi zayif, ek cekim gerekli.",
            reasons: [
                `Top1 ${(pred[0].confidence * 100).toFixed(1)}%`,
                `Margin ${(margin * 100).toFixed(1)}%`,
                `Guvenilirlik ${reliabilityScore}/100`
            ],
            blockers: diagnosisStatus === "review" ? ["Top1/margin düşük"] : []
        },
        quality: { score: 0.72, brightness: 0.66, contrast: 0.62, warnings: [] },
        warnings,
        reasons: [diagnosisSummary],
        reliability: {
            score: reliabilityScore,
            level: reliabilityLevel,
            unstable: reliabilityScore < 55
        },
        decision: {
            status: diagnosisStatus === "healthy" ? "ok" : diagnosisStatus === "review" ? "review" : "ok",
            flags: diagnosisStatus === "review" ? ["low_confidence"] : [],
            needsRetake: diagnosisStatus === "review",
            messağe:
                diagnosisStatus === "review" ? "Analiz tekrar cekim istiyor." : "Analiz tamamlandi."
        },
        topPredictions: pred,
        topPredictionsDetailed: pred.map((item) => ({
            ...item,
            pretty: mockPrettyLabel(item.label),
            plant
        })),
        retrySuggested: diagnosisStatus === "review",
        retryTips: diagnosisStatus === "review"
            ? ["Yapragi daha yakin cek", "Arka plani sade tut", "Isigi iyılestir"]
            : [],
        notes: "Frontend-only mock modu. Gercek teşhis icin backend modeli calistirin."
    };
};

export const fetchOpenMeteo = async (city, type = "all") => {
    try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`);
        const geoData = await geoRes.json();
        if (!geoData.results || !geoData.results.length) return null;
        const { latitude: lat, longitude: lon } = geoData.results[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&hourly=temperature_2m,relative_humidity_2m,precipitation&timezone=auto`;
        const soilUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm`;

        const [wRes, sRes] = await Promise.all([fetch(weatherUrl), fetch(soilUrl)]);
        const wData = await wRes.json();
        const sData = await sRes.json();

        const nowIso = new Date().toISOString();
        const trFormat = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });

        const weather = {
            city,
            source: "open-meteo",
            condition: wData.current?.weather_code != null ? `Kod: ${wData.current.weather_code}` : "Açık",
            temp: Math.round(wData.current?.temperature_2m || 0),
            tempMin: Math.round(wData.daily?.temperature_2m_min?.[0] || 0),
            tempMax: Math.round(wData.daily?.temperature_2m_max?.[0] || 0),
            humidity: Math.round(wData.current?.relative_humidity_2m || 0),
            windKmh: Math.round(wData.current?.wind_speed_10m || 0),
            windGustKmh: Math.round(wData.current?.wind_gusts_10m || 0),
            precipitationMm: wData.daily?.precipitation_sum?.[0] || 0,
            frostRisk: (wData.daily?.temperature_2m_min?.[0] || 10) <= 0,
            updatedAt: nowIso
        };

        const forecast = {
            source: "open-meteo",
            city,
            days: (wData.daily?.time || []).slice(0, 7).map((t, i) => ({
                day: trFormat.format(new Date(t)),
                min: Math.round(wData.daily.temperature_2m_min[i]),
                max: Math.round(wData.daily.temperature_2m_max[i]),
                condition: `Kod: ${wData.daily.weather_code[i]}`,
                precipitationMm: wData.daily.precipitation_sum[i],
                frost: wData.daily.temperature_2m_min[i] <= 0,
                windGustKmh: Math.round(wData.daily.wind_gusts_10m_max[i])
            }))
        };

        const soil = {
            source: "open-meteo-soil",
            city,
            soilType: "Tinli (Simüle)",
            ph: 6.8,
            temp0cm: Math.round(sData.hourly?.soil_temperature_0cm?.[0] || 0),
            temp6cm: Math.round(sData.hourly?.soil_temperature_6cm?.[0] || 0),
            temp18cm: Math.round(sData.hourly?.soil_temperature_18cm?.[0] || 0),
            moisture0cm: Math.round((sData.hourly?.soil_moisture_0_to_1cm?.[0] || 0) * 100),
            moisture6cm: Math.round((sData.hourly?.soil_moisture_3_to_9cm?.[0] || 0) * 100),
            moisture18cm: Math.round((sData.hourly?.soil_moisture_9_to_27cm?.[0] || 0) * 100),
            internetSignals: {
                topTempAvg: Math.round(sData.hourly?.soil_temperature_0cm?.[0] || 0),
                deepTempAvg: Math.round(sData.hourly?.soil_temperature_18cm?.[0] || 0),
                moistureTopAvg: sData.hourly?.soil_moisture_0_to_1cm?.[0] || 0,
                moistureMidAvg: sData.hourly?.soil_moisture_3_to_9cm?.[0] || 0,
                moistureState: (sData.hourly?.soil_moisture_0_to_1cm?.[0] || 0) > 0.3 ? "Nemli" : "Normal"
            },
            updatedAt: nowIso
        };

        return { weather, forecast, soil };
    } catch (err) {
        console.warn("Open-Meteo fetch error:", err);
        return null;
    }
};

export const steps = [
    { title: "Görsel yukle", detail: "Yaprak veya govdeye odaklan." },
    { title: "Hizli analiz", detail: "Bulut servisimiz saniyeler icinde." },
    { title: "Bakim plani", detail: "Adim adim uygulama adimlari." }
];

export const highlights = [
    { label: "Tarla odakli", value: "Uretim sahasi merkezde" },
    { label: "Hizli teşhis", value: "Dakikalar icinde karar" },
    { label: "Saha aksiyonu", value: "Net ve uygulanabilir plan" }
];

export const gapHassasModules = [
    {
        title: "Uydu ile analiz (NDVI/NDMI odakli)",
        detail:
            "Parsel gelisimini uydu goruntulerinden takip eder; stres, gelisim farki ve su ihtiyaci sinyallerini erken yakalar."
    },
    {
        title: "Anomali tespiti",
        detail:
            "Tarlanin farkli bölgelerinde beklenmeyen gelisim farklarini tespit ederek erken mudahale listesi olusturur."
    },
    {
        title: "Toprak nem analizi",
        detail:
            "Bölgesel nem dengesini izler; sulama kararlarini parcaya göre optimize etmenize yardim eder."
    },
    {
        title: "Tarihsel tarla karşılastirma",
        detail:
            "Ayni parselin geçmiş donemleriyle karşılastirma yapip trend ve verim sapmalarini gosterir."
    },
    {
        title: "Tarla işlemleri kayit akisi",
        detail:
            "Ekim, ilaçlama, sulama ve hasat adimlarini zaman damgasiyla kaydeder; denetim ve raporlamayi kolaylastirir."
    },
    {
        title: "Öneri sistemleri",
        detail:
            "Toplanan saha verisi + goruntu analizini birlestirerek uygulanabilir aksiyon önerileri uretir."
    }
];

export const gapHassasLinks = [
    { title: "GAPHASSAS ana sayfa", url: "https://www.gaphassas.gov.tr/" },
    { title: "GAPHASSAS uygulama girisi", url: "https://app.gaphassas.gov.tr/" },
    {
        title: "Kullanici sozlesmesi ve gizlılık politikasi",
        url: "https://app.gaphassas.gov.tr/app_assets/pdf/gizlilikSozlesmesi.pdf"
    }
];

export const shippingPayloadSamples = {
    ptt: {
        status: "delivered",
        event: "Dagitim tamamlandi",
        barcode: "PTT123456789"
    },
    yurtici: {
        shipmentStatus: "in_transit",
        lastEvent: "Transfer merkezinde",
        cargoKey: "YK123456789"
    },
    mng: {
        state: "accepted",
        eventMessağe: "Sube kabul",
        trackingNo: "MNG998877"
    },
    aras: {
        tracking: {
            status: "in_transit",
            lastMovement: "Dagitim merkezine sevk"
        },
        trackingCode: "ARAS778899"
    },
    ups: {
        current_status: "delivered",
        description: "Delivered",
        tracking_number: "1Z999AA10123456784"
    }
};

export const demoInsightCards = [
    {
        title: "Kritik surec penceresi",
        detail: "İlaçlama oncesi 36 saatlik sakin rüzgar penceresi yakalandi."
    },
    {
        title: "Toprak risk dengesi",
        detail: "Organik madde düşük, sulama ve besin destegi oncelikli."
    },
    {
        title: "Verim etkisi",
        detail: "Erken mudahale ile tahmini verim +%12 artiyor."
    },
    {
        title: "Saha ilerleme",
        detail: "Haftalik görevlerin %78'i tamamlandi."
    }
];

export const demoCompactItems = [
    {
        title: "Canli video + sesli asistan",
        detail: "Mobil kamerada canli analiz, sesli soru-cevap ve seans raporu."
    },
    {
        title: "Hastalik risk haritasi",
        detail: "Parsel bazli risk skorlarini tek ekranda gosterir."
    },
    {
        title: "Parsel arsivi",
        detail: "Geçmiş teşhisler, uygulamalar ve trend notlari."
    },
    {
        title: "Verim tahminleme",
        detail: "Sezon ortasi aralik tahminleri ve trend karşılastirma."
    },
    {
        title: "Günlük saha brifingi",
        detail: "Sabah-oglen-aksam operasyon akisi."
    },
    {
        title: "Girdi ve stok yönetimi",
        detail: "Tohum, gübre, ilaç stoklari ve planlanan kullanim."
    },
    {
        title: "Uygulama gunlugu",
        detail: "Kim uyguladi, ne zaman uygulandi, hangi doz kullanildi."
    },
    {
        title: "Hasat kalite kontrol",
        detail: "Boy, renk ve kusur oranlarini izleyen saha paneli."
    },
    {
        title: "Danismanlik akisi",
        detail: "Saha notu, foto ve acil destek talebi tek formda."
    }
];

export const demoScorecards = [
    { title: "Saha sağligi", value: "82/100", detail: "Nem + besin dengesi iyi." },
    { title: "Risk endeksi", value: "Orta", detail: "Rüzgar ve nem dalgasi." },
    { title: "Uygulama uyumu", value: "Yüksek", detail: "Planla uyumlu ilerliyor." },
    { title: "Teşhis kalitesi", value: "Stabil", detail: "Ayni sinifta marj net." },
    { title: "Is gucu dengesi", value: "Dengeli", detail: "Ekip dagilimi optimize." }
];

export const demoTimeline = [
    { day: "Bugun", task: "Yaprak alti kontrolu" },
    { day: "Yarin", task: "Damla hat kontrolu" },
    { day: "+2 gun", task: "Yaprak leke taramasi" },
    { day: "+3 gun", task: "Koruyucu uygulama" },
    { day: "+4 gun", task: "Saha rapor yenileme" },
    { day: "+5 gun", task: "Besin dengesi kontrolu" }
];

export const demoHistory = [
    { time: "09:00", score: 72 },
    { time: "12:00", score: 78 },
    { time: "15:00", score: 69 },
    { time: "18:00", score: 81 },
    { time: "21:00", score: 76 }
];

export const demoTrend = [
    { label: "Hafta 1", value: 52 },
    { label: "Hafta 2", value: 61 },
    { label: "Hafta 3", value: 58 },
    { label: "Hafta 4", value: 70 },
    { label: "Hafta 5", value: 74 }
];

export const demoDiseaseScenarios = [
    { id: "mild", label: "Hafif yayılim", note: "Leke yayılimi sinirli, erken mudahale yeterli." },
    { id: "medium", label: "Orta yayılim", note: "Risk artiyor, uygulama takvimini siklastir." },
    { id: "high", label: "Agir yayılim", note: "Acil uygulama + izolasyon gerekir." },
    { id: "critical", label: "Kritik salgin", note: "Parsel kapatma ve agresif mudahale gerekir." }
];

export const demoPresetLibrary = [
    {
        id: "normal",
        label: "Normal sezon",
        scenario: { crop: "domates", risk: 30, price: 20, yieldBoost: 6 },
        flags: { frost: false, pest: false, irrigation: false, wind: false },
        disease: "mild"
    },
    {
        id: "frost_stress",
        label: "Don stresi",
        scenario: { crop: "patates", risk: 72, price: 18, yieldBoost: -10 },
        flags: { frost: true, pest: false, irrigation: true, wind: true },
        disease: "medium"
    },
    {
        id: "pest_pressure",
        label: "Zararli baskisi",
        scenario: { crop: "biber", risk: 80, price: 23, yieldBoost: -12 },
        flags: { frost: false, pest: true, irrigation: true, wind: false },
        disease: "high"
    }
];

export const demoFlowLibrary = [
    {
        id: "model_focus",
        title: "Model Odak",
        detail: "Riskli preset + model self-check + smoke",
        actionLabel: "Model akisini calistir"
    },
    {
        id: "market_focus",
        title: "Pazar Odak",
        detail: "Pazar hizli paket + seed + smoke",
        actionLabel: "Pazar akisini calistir"
    },
    {
        id: "finance_focus",
        title: "Finans Odak",
        detail: "Finans setup + normal preset + smoke",
        actionLabel: "Finans akisini calistir"
    },
    {
        id: "full_qa",
        title: "Full QA",
        detail: "Reset + seed + tum demo smoke",
        actionLabel: "Full QA calistir"
    },
    {
        id: "auto_repair",
        title: "Oto Onarim",
        detail: "Hazir olmayan modulleri tamamla ve smoke kos",
        actionLabel: "Oto onarim calistir"
    }
];

export const demoTaskTemplates = [
    { id: "scan", label: "Parsel tarama", targetPerDay: 6 },
    { id: "spray", label: "Hedefli uygulama", targetPerDay: 2 },
    { id: "irrigation", label: "Sulama turu", targetPerDay: 3 }
];

export const demoResourceBenchmarks = {
    scanPerHour: 2.2,
    sprayPerHour: 1.4,
    irrigationPerHour: 1.8
};

export const demoSeasonTemplate = [
    { month: "Mart", focus: "Toprak hazırligi", risk: "Orta" },
    { month: "Nisan", focus: "Dikim ve ilk izleme", risk: "Düşük" },
    { month: "Mayis", focus: "Zararli izleme", risk: "Orta" },
    { month: "Haziran", focus: "Sulama optimizasyonu", risk: "Yüksek" },
    { month: "Temmuz", focus: "Hastalik baskisi", risk: "Yüksek" },
    { month: "Agustos", focus: "Verim koruma", risk: "Orta" }
];

export const demoIncidentLibrary = [
    { id: "none", label: "Olay yok", severity: "Düşük", note: "Rutin saha akisi normal." },
    { id: "fungal_burst", label: "Mantar patlamasi", severity: "Yüksek", note: "Nem artisiyla yaprak lekesi hizla yayıliyor." },
    { id: "pest_cluster", label: "Zararli odagi", severity: "Orta", note: "Parselin bir bölgesinde bocek yogunlugu artisiyor." },
    { id: "irrigation_fault", label: "Sulama arizasi", severity: "Kritik", note: "Hat tikanikligi nedeniyle blok bazli su stresi var." }
];

export const demoInterventionLibrary = [
    { key: "scan", label: "Tarama", action: "Parselde gorsel tarama frekansini 2x artir." },
    { key: "isolation", label: "Izolasyon", action: "Riskli bölgeyi geçici olarak ayir ve girisi sinirla." },
    { key: "spray", label: "Hedefli uygulama", action: "Esik asilan alana hedefli uygulama planla." },
    { key: "irrigation", label: "Sulama duzeltme", action: "Debi testini tamamla, arizali hatti degistir." }
];

export const demoMicroDecisions = [
    {
        id: "spray_shift",
        title: "Uygulama saatini kaydir",
        detail: "Rüzgar yogunlugu artmadan 2 saat once hedefli uygulama.",
        action: "Planla"
    },
    {
        id: "irrigation_cut",
        title: "Sulama dozunu düzenle",
        detail: "Toprak nemi yüksek, %15 azaltimla stresi azalt.",
        action: "Uygula"
    },
    {
        id: "leaf_sample",
        title: "Yaprak örneklemesi",
        detail: "Riskli bölgede 12 yaprak ornegi ile saha dogrulama.",
        action: "Başlat"
    }
];

export const demoHeatmap = [
    { id: "A1", label: "A1", risk: 32, moisture: 48 },
    { id: "A2", label: "A2", risk: 46, moisture: 55 },
    { id: "B1", label: "B1", risk: 62, moisture: 38 },
    { id: "B2", label: "B2", risk: 28, moisture: 71 },
    { id: "C1", label: "C1", risk: 51, moisture: 44 },
    { id: "C2", label: "C2", risk: 37, moisture: 63 }
];

export const demoJourneySteps = [
    { id: "preset", title: "Senaryo sec", hint: "Hazir preset uygula" },
    { id: "ops", title: "Operasyonu ayarla", hint: "Ekip ve pencereyi optimize et" },
    { id: "alerts", title: "Riskleri hesapla", hint: "Stres testi ile alarm uret" },
    { id: "report", title: "Raporu tamamla", hint: "Çıktıyi olustur ve paylas" }
];

export const faqItems = [
    {
        title: "Analiz ne kadar surer?",
        detail: "Görsel yukunune ve cihazina göre degisir, genelde saniyeler icinde tamamlanir."
    },
    {
        title: "Hangi bitkiler destekleniyor?",
        detail: "Desteklenen bitkiler modelin labels.json kapsamina baglidir. Yeni siniflar egitimle eklenir."
    },
    {
        title: "Sonuclar kesin mi?",
        detail: "Hayir. Erken teşhis icin yardimci bir arac; sahada uzman onayi önerilir."
    },
    {
        title: "Neden bazen yeniden fotograf istiyor?",
        detail: "Düşük guven veya siniflar arasi fark düşükse, model daha net goruntu ister."
    },
    {
        title: "Neden bitki uyumsuz diyor?",
        detail: "Secilen bitkiyle uyusmayan siniflar engellenir. Bitki seçimini kontrol et."
    },
    {
        title: "IPM nedir?",
        detail: "IPM; izleme, esik, onleme ve kontrol adimlarini birlestiren resmi yaklasimdir."
    },
    {
        title: "PlantVillage neden saha performansinda dusuyor?",
        detail: "Veri seti kontrollu arka planli. Sahada isik/arka plan degisir; bu nedenle ek goruntuyle fine-tune gerekir."
    },
    {
        title: "Action threshold ne demek?",
        detail: "IPM'de mudahale karari, zararlinin riskli seviyeye ulasmasiyla verilir. Esik asilmadan kimyasal önerilmez."
    },
    {
        title: "Sahada neden farkli sonuclar gorulebilir?",
        detail: "Veri seti kontrollu ortamdan geldigi icin saha gorsellerinde arka plan ve isik farki sonucu etkileyebilir."
    },
    {
        title: "PlantVillage kapsamı nedir?",
        detail: "PlantVillage yaklasik 54K gorsel, 38 sinif ve 14 bitki turu icerir; bu kapsam labels.json ile belirlenir."
    },
    {
        title: "Hangi fotograf en iyi sonucu verir?",
        detail: "Yapraga yakin plan, net odak ve sade arka plan en iyi sonucu verir."
    },
    {
        title: "Kamera ile cekim mi yoksa galeriden mi?",
        detail: "Kamera daha taze ve net cekim sağlar; galeriden de netlik yüksekse analiz edilir."
    },
    {
        title: "Isik nasil olmali?",
        detail: "Gunesli ama patlamayan isik idealdir. Düşük isikta guven dusabilir."
    },
    {
        title: "Neden guven düşük çıktı?",
        detail: "Goruntu kalitesi düşük, siniflar birbirine yakin veya bitki dogrulama zayif olabilir."
    },
    {
        title: "Bitki secmeden analiz olur mu?",
        detail: "Hayir. Bitki seçimi zorunludur; model filtreyi buna göre uygular."
    },
    {
        title: "Etiket/PHI/REI ne demek?",
        detail: "Etiket uygulama dozu ve zamani icin resmi kaynaktir. PHI: hasat oncesi bekleme, REI: giris kisitlamasi suresidir."
    },
    {
        title: "Organik cozumler neden bazen yeterli değil?",
        detail: "Yayılim ileri seviyedeyse kimyasal/cozum rotasyonu gerekir; IPM bunu dengeler."
    },
    {
        title: "Neden model ayni hastaligi tekrar veriyor?",
        detail: "Bitki seçimi, goruntu acisi ve kalite benzerse model ayni sonucu tekrar edebilir."
    },
];

export const turkeyGuidePlants = [
    {
        name: "Domates",
        summary:
            "Sıcak ve gunesli alanlari sever. Duzenli sulama ve iyi havalanan toprakla yüksek verim verir.",
        link: "https://www.rhs.org.uk/vegetables/tomatoes/grow-your-own"
    },
    {
        name: "Biber (tatli)",
        summary:
            "Ilık ve korunakli ortamda daha iyi meyve verir. Toprak nemini dengede tutmak önemlidir.",
        link: "https://www.rhs.org.uk/vegetables/peppers/grow-your-own"
    },
    {
        name: "Salatalik",
        summary:
            "Ilık, gunesli ve duzenli sulanan ortamlarda hizli gelisir. Dikey destekle alanda tasarruf sağlar.",
        link: "https://www.rhs.org.uk/vegetables/cucumbers/grow-your-own"
    },
    {
        name: "Patlican",
        summary:
            "Sicagi sever; duzenli nem ve besinle daha iyi meyve baglar. Sezon boyu takip ister.",
        link: "https://www.rhs.org.uk/advice/grow-your-own/vegetables/aubergines"
    },
    {
        name: "Kabak (sakiz)",
        summary:
            "Gunesli alanda hizli buyur, bol su ister. Erken hasat daha lezzetli urun verir.",
        link: "https://www.rhs.org.uk/vegetables/courgettes/grow-your-own"
    },
    {
        name: "Sogan (kuru)",
        summary:
            "Iyi drene toprakta kolay yetisir. Set soganlar ilkbaharda pratik ekim sağlar.",
        link: "https://www.rhs.org.uk/vegetables/onions/grow-your-own"
    },
    {
        name: "Lahana",
        summary:
            "Duzenli sulama ve zararli korumasi ister. Soguga dayanikli cesitler yaygindir.",
        link: "https://www.rhs.org.uk/advice/grow-your-own/vegetables/cabbages"
    },
    {
        name: "Marul",
        summary:
            "Kisa surede hasat verir. Sıcak havada acilanma olmamasi icin nem dengesi önemli.",
        link: "https://www.rhs.org.uk/vegetables/lettuce/grow-your-own"
    },
    {
        name: "Taze fasulye",
        summary:
            "Gunesli alanda hizli buyur ve surekli hasatla verimi artar. Dikey cesitler destek ister.",
        link: "https://www.rhs.org.uk/vegetables/french-beans/grow-your-own"
    },
    {
        name: "Mantar (kultur)",
        summary:
            "Temiz ve kontrollu ortam ister. Uygun substrat ve hijyen başarınin anahtari.",
        link: "https://extension.usu.edu/yardandgarden/research/a-beginners-guide-to-growing-mushrooms-at-home.php"
    }
];

export const basePlantProfiles = [
    {
        id: "apple",
        name: "Elma",
        climate: "Ilık, serin kis",
        water: "Orta, duzenli",
        soil: "Iyi drene, organik",
        tip: "Hava akisini sağla, budamayi ihmal etme."
    },
    {
        id: "blueberry",
        name: "Yaban mersini",
        climate: "Ilık, nemli",
        water: "Duzenli, nemli",
        soil: "Asidik, organik",
        tip: "pH düşük tutulmali, organik mulc kullan."
    },
    {
        id: "cherry",
        name: "Kiraz",
        climate: "Ilık, hava akisi iyi",
        water: "Orta",
        soil: "Iyi drene",
        tip: "Budama ile hava akisini artir."
    },
    {
        id: "corn",
        name: "Misir",
        climate: "Sıcak, gunesli",
        water: "Duzenli",
        soil: "Derin, besinli",
        tip: "Sıra arasi havalandirmayi koru."
    },
    {
        id: "grape",
        name: "Uzum",
        climate: "Ilık, gunesli",
        water: "Az-orta",
        soil: "Iyi drene",
        tip: "Yapraklari kuru tut, duzenli buda."
    },
    {
        id: "orange",
        name: "Portakal",
        climate: "Ilık, don yok",
        water: "Duzenli",
        soil: "Iyi drene, organik",
        tip: "Don riskine karşı onlem al."
    },
    {
        id: "peach",
        name: "Seftali",
        climate: "Ilık",
        water: "Orta",
        soil: "Drenajli",
        tip: "Yaprak islanmasini azalt."
    },
    {
        id: "pepper",
        name: "Biber",
        climate: "Ilık, korunakli",
        water: "Orta, dengeli",
        soil: "Besinli, hafif nemli",
        tip: "Sıcakta meyve baglama icin nemi dengede tut."
    },
    {
        id: "potato",
        name: "Patates",
        climate: "Ilık",
        water: "Duzenli",
        soil: "Gevsek, drenajli",
        tip: "Toprak nemini dengede tut."
    },
    {
        id: "raspberry",
        name: "Ahududu",
        climate: "Serin-ılık",
        water: "Orta",
        soil: "Organik, nemli",
        tip: "Sıra arasi hava akisina dikkat."
    },
    {
        id: "soybean",
        name: "Soya",
        climate: "Ilık-sıcak",
        water: "Orta",
        soil: "Iyi drene, besinli",
        tip: "Asiri sulamadan kacin."
    },
    {
        id: "squash",
        name: "Kabak",
        climate: "Sıcak, gunesli",
        water: "Yüksek",
        soil: "Organik, nem tutan",
        tip: "Yaprak islanmasini azalt."
    },
    {
        id: "strawberry",
        name: "Cilek",
        climate: "Ilık",
        water: "Duzenli",
        soil: "Organik, hafif asidik",
        tip: "Mulc ile meyveyi topraktan ayir."
    },
    {
        id: "tomato",
        name: "Domates",
        climate: "Sıcak, gunesli",
        water: "Duzenli, toprak nemli",
        soil: "Iyi drene, humuslu",
        tip: "Yapraklari kuru tut, sabah sulama yap."
    }
];

export const riskMatrix = [
    { label: "Drenaj zayif", impact: "Yüksek", action: "Toprak yapisini iyılestir" },
    { label: "Sik dikim", impact: "Orta", action: "Bitkiler arasi mesafeyi ac" },
    { label: "Düşük hava akisi", impact: "Yüksek", action: "Havalandirmayi artir" },
    { label: "Yaprak islanmasi", impact: "Orta", action: "Sabah sulama uygula" }
];

export const diseaseScouting = [
    { day: "Pazartesi", task: "Yaprak alti kontrolu" },
    { day: "Carsamba", task: "Leke ve kloroz takibi" },
    { day: "Cuma", task: "Meyve ve govde kontrolu" }
];

export const supplyChecklist = [
    "Budama makasi",
    "Eldiven",
    "Nem olcer",
    "Yapiskan tuzak",
    "Organik kompost"
];

export const yieldTracker = [
    { crop: "Domates", target: "4-6 kg/bitki", note: "Sıcak sezonda yüksek verim." },
    { crop: "Biber", target: "2-4 kg/bitki", note: "Sulama dengesi kritik." },
    { crop: "Patlican", target: "3-5 kg/bitki", note: "Besin destegi önemli." }
];

export const costPlanner = [
    { item: "Tohum/Fide", note: "Sezon basi alimi planla." },
    { item: "Gübre", note: "Azot + potasyum dengesi." },
    { item: "İlaçlama", note: "Etiket dozlari ve araliklari." },
    { item: "Isgucu", note: "Budama ve hasat gunleri." }
];

export const marketingTips = [
    { title: "Pazar zamani", detail: "Hasadi haftasonuna denk getir." },
    { title: "Ambalaj", detail: "Kucuk kasalarda fiyat algisi artar." },
    { title: "Kalite", detail: "Uniform boyut ve temizlik satisi artirir." }
];

export const irrigationChecklist = [
    "Hatlarin tikanikligini kontrol et",
    "Damla uclarini temizle",
    "Su deposu seviyesini takip et"
];

export const starterChecklist = [
    { title: "Toprak hazırligi", detail: "Organik madde ve drenaji kontrol et." },
    { title: "Fide sağligi", detail: "Lekesiz, canli yaprak sec." },
    { title: "Hastalik onlemi", detail: "Aletleri temizle, hijyeni koru." }
];

export const TURKISH_WORD_FIXES = [
    ["turkce", "türkçe"],
    ["hazırlık", "hazırlık"],
    ["hazır", "hazır"],
    ["once", "önce"],
    ["seçiniz", "seçiniz"],
    ["seçilmedi", "seçilmedi"],
    ["seçilen", "seçilen"],
    ["seçimi", "seçimi"],
    ["seçim", "seçim"],
    ["sec", "seç"],
    ["gorseller", "görseller"],
    ["gorsel", "görsel"],
    ["gorunku", "görünür"],
    ["goruntu", "görüntü"],
    ["baglanti", "bağlantı"],
    ["yukleniyor", "yükleniyor"],
    ["yukle", "yükle"],
    ["kılavuzu", "kılavuzu"],
    ["kılavuz", "kılavuz"],
    ["ozellikler", "özellikler"],
    ["ozellik", "özellik"],
    ["sifirla", "sıfırla"],
    ["henuz", "henüz"],
    ["tum", "tüm"],
    ["çoklu", "çoklu"],
    ["düşük", "düşük"],
    ["yüksek", "yüksek"],
    ["rüzgar", "rüzgar"],
    ["isik", "ışık"],
    ["islakligi", "ıslaklığı"],
    ["açık", "açık"],
    ["agirligi", "ağırlığı"],
    ["hastaliklari", "hastalıkları"],
    ["hastaliklar", "hastalıklar"],
    ["hastalik", "hastalık"],
    ["sağlıkli", "sağlıklı"],
    ["sağlık", "sağlık"],
    ["sehirler", "şehirler"],
    ["sehir", "şehir"],
    ["ilçeler", "ilçeler"],
    ["ilçe", "ilçe"],
    ["urunleri", "ürünleri"],
    ["urunler", "ürünler"],
    ["urunu", "ürünü"],
    ["urun", "ürün"],
    ["uretici", "üretici"],
    ["uretim", "üretim"],
    ["çiftçiler", "çiftçiler"],
    ["çiftçi", "çiftçi"],
    ["gübreleme", "gübreleme"],
    ["gübre", "gübre"],
    ["ilaçlama", "ilaçlama"],
    ["ilaç", "ilaç"],
    ["teşhisi", "teşhisi"],
    ["teşhis", "teşhis"],
    ["yağış", "yağış"],
    ["gunes", "güneş"],
    ["buyuksehir", "büyükşehir"],
    ["topragi", "toprağı"],
    ["topraga", "toprağa"],
    ["ozeti", "özeti"],
    ["ozet", "özet"],
    ["öneriler", "öneriler"],
    ["öneri", "öneri"],
    ["uyarilari", "uyarıları"],
    ["uyari", "uyarı"],
    ["yönetimi", "yönetimi"],
    ["yönetim", "yönetim"],
    ["donus", "dönüş"],
    ["gorunumu", "görünümü"],
    ["gorunum", "görünüm"],
    ["gorunuyor", "görünüyor"]
];

export const MOCK_PAYMENT_METHODS = [
    { id: "wallet", type: "digital_wallet", label: "AgroGuzel Cüzdan", balance: 25000, primary: true },
    { id: "card_1", type: "credit_card", label: "Mastercard **** 4482", provider: "bank_ziraat" },
    { id: "transfer", type: "bank_transfer", label: "Banka Havalesi / EFT", note: "Onay süresi 2-4 saat" }
];

export const MOCK_TRANSACTIONS = [
    { id: "tr_1", date: "2026-02-28T14:20:00Z", amount: -1250, type: "purchase", status: "completed", detail: "Gübre Alımı - DAP 50kg" },
    { id: "tr_2", date: "2026-03-01T09:12:00Z", amount: 4500, type: "sale", status: "completed", detail: "Domates Satışı - 1500kg" },
    { id: "tr_3", date: "2026-03-01T18:45:00Z", amount: -2100, type: "escrow_locked", status: "pending", detail: "Fide Rezervasyonu (Havuzda)" }
];
