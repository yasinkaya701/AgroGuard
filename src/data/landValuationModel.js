/**
 * LAND VALUATION MODEL v2.0
 * Çoklu özellik ML değerleme, risk analizi, portföy yönetimi, fuzzy-logic karar destek
 */

import { CITY_TO_REGION, getSmartLandPrice } from './marketModeling';

/* ───── Özellik Ağırlıkları (Multi-Feature Scoring) ───── */
const FEATURE_WEIGHTS = {
    soilScore: 0.18,
    irrigation: 0.14,
    slope: 0.10,
    zoning: 0.15,
    roadAccess: 0.12,
    roadDistance: 0.08,
    location: 0.13,
    structure: 0.05,
    planted: 0.05,
};

/* ───── Risk Parametreleri (İl Bazlı) ───── */
export const REGIONAL_RISK_MAP = {
    Marmara: { flood: 35, earthquake: 72, climate: 25, overall: 44 },
    Ege: { flood: 28, earthquake: 55, climate: 30, overall: 38 },
    Akdeniz: { flood: 40, earthquake: 35, climate: 45, overall: 40 },
    "Ic Anadolu": { flood: 15, earthquake: 30, climate: 50, overall: 32 },
    Karadeniz: { flood: 65, earthquake: 20, climate: 35, overall: 40 },
    "Dogu Anadolu": { flood: 25, earthquake: 60, climate: 55, overall: 47 },
    "Guneydogu Anadolu": { flood: 20, earthquake: 40, climate: 60, overall: 40 },
};

/* ───── Yıllık Büyüme Oranları (Bölge bazlı) ───── */
export const ANNUAL_GROWTH_RATES = {
    Marmara: 0.18,
    Ege: 0.15,
    Akdeniz: 0.14,
    "Ic Anadolu": 0.10,
    Karadeniz: 0.08,
    "Dogu Anadolu": 0.06,
    "Guneydogu Anadolu": 0.09,
};

/* ───── Özellik → Puan Dönüşümleri ───── */
const featureToScore = {
    soilScore: (v) => Math.min(100, Math.max(0, Number(v || 0))),
    irrigation: (v) => v === "var" ? 90 : 20,
    slope: (v) => Math.max(0, 100 - Number(v || 6) * 5),
    zoning: (v) => v === "var" ? 95 : v === "kismi" ? 55 : 20,
    roadAccess: (v) => v === "iyi" ? 90 : v === "orta" ? 55 : 20,
    roadDistance: (v) => {
        const d = Number(v || 500);
        if (d <= 100) return 95;
        if (d <= 300) return 75;
        if (d <= 700) return 50;
        return 20;
    },
    location: (v) => Math.min(100, Math.max(0, Number(v || 60))),
    structure: (v) => v === "var" ? 80 : 30,
    planted: (v) => v === "ekili" ? 75 : 40,
};

/* ───── Çoklu Özellik ML Değerleme ───── */
export const getMLValuation = (landDemo = {}, city = "") => {
    const features = {
        soilScore: featureToScore.soilScore(landDemo.soilScore),
        irrigation: featureToScore.irrigation(landDemo.irrigation),
        slope: featureToScore.slope(landDemo.slopePct),
        zoning: featureToScore.zoning(landDemo.zoningStatus),
        roadAccess: featureToScore.roadAccess(landDemo.roadAccess),
        roadDistance: featureToScore.roadDistance(landDemo.roadDistanceM),
        location: featureToScore.location(landDemo.locationScore || 60),
        structure: featureToScore.structure(landDemo.structureStatus),
        planted: featureToScore.planted(landDemo.plantedStatus),
    };

    let totalScore = 0;
    const featureBreakdown = [];
    Object.entries(FEATURE_WEIGHTS).forEach(([key, weight]) => {
        const score = features[key] || 0;
        const contribution = score * weight;
        totalScore += contribution;
        featureBreakdown.push({
            feature: key,
            label: FEATURE_LABELS[key] || key,
            score,
            weight: Math.round(weight * 100),
            contribution: Math.round(contribution * 10) / 10,
        });
    });

    totalScore = Math.round(totalScore);

    const basePrice = getSmartLandPrice(city || "Ankara");
    const qualityMultiplier = 0.5 + (totalScore / 100) * 1.0;
    const adjustedPrice = Math.round(basePrice.priceTlDa * qualityMultiplier);
    const areaDa = Number(landDemo.areaDa || 0);

    return {
        mlScore: totalScore,
        grade: totalScore >= 85 ? "A+" : totalScore >= 75 ? "A" : totalScore >= 65 ? "B" : totalScore >= 50 ? "C" : "D",
        featureBreakdown,
        pricing: {
            basePerDa: basePrice.priceTlDa,
            adjustedPerDa: adjustedPrice,
            totalEstimate: Math.round(adjustedPrice * Math.max(0, areaDa)),
            qualityMultiplier: Math.round(qualityMultiplier * 100) / 100,
        },
        confidence: Math.round(60 + totalScore * 0.3),
    };
};

const FEATURE_LABELS = {
    soilScore: "Toprak Kalitesi",
    irrigation: "Sulama",
    slope: "Eğim",
    zoning: "İmar Durumu",
    roadAccess: "Yol Erişimi",
    roadDistance: "Yol Mesafesi",
    location: "Konum Kalitesi",
    structure: "Yapı Durumu",
    planted: "Ekim Durumu",
};

/* ───── Risk Analiz Motoru ───── */
export const getRiskAnalysis = (city = "") => {
    const region = CITY_TO_REGION[city] || "Ic Anadolu";
    const risks = REGIONAL_RISK_MAP[region] || REGIONAL_RISK_MAP["Ic Anadolu"];
    const riskItems = [
        { id: "flood", label: "Sel / Taşkın Riski", score: risks.flood, icon: "🌊", color: risks.flood > 50 ? "#f87171" : risks.flood > 30 ? "#fbbf24" : "#86efac" },
        { id: "earthquake", label: "Deprem Riski", score: risks.earthquake, icon: "🏚️", color: risks.earthquake > 50 ? "#f87171" : risks.earthquake > 30 ? "#fbbf24" : "#86efac" },
        { id: "climate", label: "İklim Değişikliği Riski", score: risks.climate, icon: "🌡️", color: risks.climate > 50 ? "#f87171" : risks.climate > 30 ? "#fbbf24" : "#86efac" },
    ];
    const overallRisk = risks.overall;
    return {
        region,
        items: riskItems,
        overallScore: overallRisk,
        overallLevel: overallRisk > 50 ? "Yüksek" : overallRisk > 30 ? "Orta" : "Düşük",
        overallColor: overallRisk > 50 ? "#f87171" : overallRisk > 30 ? "#fbbf24" : "#86efac",
        recommendation: overallRisk > 50
            ? "Yüksek riskli bölge — ek sigorta ve yapısal güçlendirme önerilir."
            : overallRisk > 30
                ? "Orta riskli bölge — standart önlemler yeterli."
                : "Düşük riskli bölge — yatırım için uygun profil.",
    };
};

/* ───── 5 Yıllık Değer Projeksiyonu ───── */
export const get5YearProjection = (currentValueTlDa, city = "", scenarios = null) => {
    const region = CITY_TO_REGION[city] || "Ic Anadolu";
    const baseGrowth = ANNUAL_GROWTH_RATES[region] || 0.10;

    const effectiveScenarios = scenarios || [
        { id: "pessimistic", label: "Düşük", rate: baseGrowth * 0.5, color: "#f87171" },
        { id: "expected", label: "Beklenen", rate: baseGrowth, color: "var(--sprout)" },
        { id: "optimistic", label: "Yüksek", rate: baseGrowth * 1.5, color: "#60a5fa" },
    ];

    const years = [0, 1, 2, 3, 4, 5];
    const projections = effectiveScenarios.map(scenario => ({
        ...scenario,
        values: years.map(y => ({
            year: y,
            yearLabel: y === 0 ? "Şimdi" : `${y}. Yıl`,
            value: Math.round(currentValueTlDa * Math.pow(1 + scenario.rate, y)),
        })),
    }));

    return {
        currentValue: currentValueTlDa,
        region,
        baseGrowthRate: Math.round(baseGrowth * 100),
        projections,
        maxValue: Math.round(currentValueTlDa * Math.pow(1 + baseGrowth * 1.5, 5)),
    };
};

/* ───── Yatırım Portföy Analizi ───── */
export const analyzePortfolio = (parcels = []) => {
    if (!parcels.length) return null;
    const analyzed = parcels.map(p => {
        const ml = getMLValuation(p, p.city);
        const risk = getRiskAnalysis(p.city);
        return {
            ...p,
            mlScore: ml.mlScore,
            mlGrade: ml.grade,
            adjustedPerDa: ml.pricing.adjustedPerDa,
            totalValue: ml.pricing.totalEstimate,
            riskScore: risk.overallScore,
            riskLevel: risk.overallLevel,
        };
    });

    const totalValue = analyzed.reduce((sum, p) => sum + (p.totalValue || 0), 0);
    const totalArea = analyzed.reduce((sum, p) => sum + Number(p.areaDa || 0), 0);
    const avgMlScore = Math.round(analyzed.reduce((sum, p) => sum + p.mlScore, 0) / analyzed.length);
    const avgRisk = Math.round(analyzed.reduce((sum, p) => sum + p.riskScore, 0) / analyzed.length);

    return {
        parcels: analyzed,
        summary: {
            count: analyzed.length,
            totalValue,
            totalArea,
            avgPerDa: totalArea > 0 ? Math.round(totalValue / totalArea) : 0,
            avgMlScore,
            avgRisk,
            diversificationScore: Math.min(100, analyzed.length * 20 + (100 - avgRisk) * 0.3),
        },
    };
};

/* ───── Fuzzy-Logic Karar Destek Sistemi ───── */
export const getFuzzyDecision = (landDemo = {}, city = "", marketTrend = "stabil") => {
    const ml = getMLValuation(landDemo, city);
    const risk = getRiskAnalysis(city);
    const region = CITY_TO_REGION[city] || "Ic Anadolu";
    const growth = ANNUAL_GROWTH_RATES[region] || 0.10;

    // Fuzzy membership functions
    const qualityMembership = ml.mlScore / 100;               // 0–1
    const riskMembership = 1 - (risk.overallScore / 100);      // 0–1 (inverted)
    const growthMembership = Math.min(1, growth / 0.20);       // 0–1
    const trendMembership = marketTrend === "yükselen" ? 0.8 : marketTrend === "düşen" ? 0.3 : 0.5;

    // Weighted fuzzy aggregation
    const buySignal = (qualityMembership * 0.35 + riskMembership * 0.20 + growthMembership * 0.25 + trendMembership * 0.20);
    const sellSignal = 1 - buySignal;
    const holdZone = Math.abs(buySignal - 0.5) < 0.15;

    let decision, color, confidence;
    if (holdZone) {
        decision = "BEKLE";
        color = "#fbbf24";
        confidence = Math.round(50 + Math.abs(buySignal - 0.5) * 100);
    } else if (buySignal > 0.5) {
        decision = "AL";
        color = "#00FF9D";
        confidence = Math.round(buySignal * 100);
    } else {
        decision = "SAT";
        color = "#f87171";
        confidence = Math.round(sellSignal * 100);
    }

    return {
        decision,
        color,
        confidence,
        signals: {
            quality: Math.round(qualityMembership * 100),
            risk: Math.round(riskMembership * 100),
            growth: Math.round(growthMembership * 100),
            trend: Math.round(trendMembership * 100),
        },
        buySignal: Math.round(buySignal * 100),
        sellSignal: Math.round(sellSignal * 100),
        reasoning: [
            `Kalite skoru: ${ml.mlScore}/100 (${ml.grade})`,
            `Risk seviyesi: ${risk.overallLevel} (%${risk.overallScore})`,
            `Bölge büyüme: %${Math.round(growth * 100)}/yıl`,
            `Piyasa trendi: ${marketTrend}`,
        ],
    };
};

/* ───── Arazi Karşılaştırma (2 parsel) ───── */
export const compareParcels = (parcelA, parcelB, cityA, cityB) => {
    const mlA = getMLValuation(parcelA, cityA);
    const mlB = getMLValuation(parcelB, cityB);
    const riskA = getRiskAnalysis(cityA);
    const riskB = getRiskAnalysis(cityB);

    const metrics = [
        { label: "ML Skoru", a: mlA.mlScore, b: mlB.mlScore, unit: "puan", better: mlA.mlScore > mlB.mlScore ? "A" : "B" },
        { label: "Birim Fiyat", a: mlA.pricing.adjustedPerDa, b: mlB.pricing.adjustedPerDa, unit: "TL/da", better: mlA.pricing.adjustedPerDa > mlB.pricing.adjustedPerDa ? "A" : "B" },
        { label: "Risk Skoru", a: riskA.overallScore, b: riskB.overallScore, unit: "%", better: riskA.overallScore < riskB.overallScore ? "A" : "B" },
        { label: "Güven", a: mlA.confidence, b: mlB.confidence, unit: "%", better: mlA.confidence > mlB.confidence ? "A" : "B" },
    ];

    const aWins = metrics.filter(m => m.better === "A").length;
    const bWins = metrics.filter(m => m.better === "B").length;

    return {
        metrics,
        winner: aWins > bWins ? "A" : bWins > aWins ? "B" : "Eşit",
        aScore: aWins,
        bScore: bWins,
    };
};
