/**
 * CROP PRICE MODEL v2.0
 * Sezonsal fiyat tahmin motoru, trend analizi, arbitraj tespiti
 */

import { cropPriceTlKg, cropLabelMap } from './economicsData';
import { TURKEY_REGIONAL_MULTIPLIERS, CITY_TO_REGION } from './marketModeling';

/* ───── Sezonsal Çarpan Matrisi (ay bazlı) ───── */
export const SEASONAL_MULTIPLIERS = {
    domates: [1.35, 1.30, 1.20, 1.10, 0.90, 0.75, 0.70, 0.72, 0.80, 0.95, 1.15, 1.30],
    patates: [1.10, 1.15, 1.20, 1.10, 1.00, 0.90, 0.85, 0.80, 0.85, 0.95, 1.05, 1.10],
    biber: [1.40, 1.35, 1.25, 1.10, 0.95, 0.80, 0.70, 0.72, 0.78, 0.90, 1.10, 1.30],
    bugday: [0.95, 0.98, 1.00, 1.02, 1.05, 1.08, 1.10, 1.05, 0.98, 0.95, 0.92, 0.93],
    arpa: [0.96, 0.98, 1.00, 1.03, 1.06, 1.10, 1.08, 1.03, 0.97, 0.94, 0.93, 0.94],
    misir: [1.05, 1.08, 1.10, 1.05, 1.00, 0.95, 0.88, 0.85, 0.88, 0.95, 1.02, 1.05],
    aycicegi: [0.95, 0.98, 1.00, 1.02, 1.04, 1.06, 1.08, 1.10, 1.05, 0.98, 0.95, 0.94],
    pamuk: [1.02, 1.04, 1.06, 1.03, 1.00, 0.97, 0.94, 0.92, 0.95, 0.98, 1.00, 1.02],
    sekerpancari: [1.00, 1.02, 1.04, 1.05, 1.03, 1.00, 0.97, 0.94, 0.92, 0.95, 0.98, 1.00],
};

/* ───── Hasat Dönemi Bilgisi ───── */
export const HARVEST_SEASONS = {
    domates: { start: 6, end: 9, peak: 7, label: "Haz–Eyl" },
    patates: { start: 6, end: 10, peak: 8, label: "Haz–Eki" },
    biber: { start: 6, end: 9, peak: 7, label: "Haz–Eyl" },
    bugday: { start: 6, end: 7, peak: 7, label: "Haz–Tem" },
    arpa: { start: 5, end: 7, peak: 6, label: "May–Tem" },
    misir: { start: 8, end: 10, peak: 9, label: "Ağu–Eki" },
    aycicegi: { start: 8, end: 9, peak: 9, label: "Ağu–Eyl" },
    pamuk: { start: 9, end: 11, peak: 10, label: "Eyl–Kas" },
    sekerpancari: { start: 9, end: 11, peak: 10, label: "Eyl–Kas" },
};

/* ───── Volatilite Parametreleri ───── */
const VOLATILITY_BASE = {
    domates: 0.28, patates: 0.15, biber: 0.32, bugday: 0.08,
    arpa: 0.07, misir: 0.10, aycicegi: 0.12, pamuk: 0.11, sekerpancari: 0.06,
};

/* ───── Sezonsal Fiyat Tahmini ───── */
export const getSeasonalPrice = (crop, month = new Date().getMonth()) => {
    const base = cropPriceTlKg[crop] || 10;
    const multipliers = SEASONAL_MULTIPLIERS[crop] || Array(12).fill(1);
    const m = multipliers[month] || 1;
    return {
        price: Math.round(base * m * 100) / 100,
        basePrice: base,
        seasonalMultiplier: m,
        month,
        trend: m > 1.05 ? "yükselen" : m < 0.95 ? "düşen" : "stabil",
        trendIcon: m > 1.05 ? "up" : m < 0.95 ? "down" : "stable",
    };
};

/* ───── 12 Aylık Fiyat Projeksiyon (tüm aylar) ───── */
export const get12MonthProjection = (crop) => {
    const base = cropPriceTlKg[crop] || 10;
    const multipliers = SEASONAL_MULTIPLIERS[crop] || Array(12).fill(1);
    const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    return multipliers.map((m, i) => ({
        month: i,
        monthLabel: monthNames[i],
        price: Math.round(base * m * 100) / 100,
        multiplier: m,
        isHarvest: HARVEST_SEASONS[crop] ? (i + 1 >= HARVEST_SEASONS[crop].start && i + 1 <= HARVEST_SEASONS[crop].end) : false,
        isPeak: HARVEST_SEASONS[crop] ? (i + 1 === HARVEST_SEASONS[crop].peak) : false,
    }));
};

/* ───── Trend Analizi (Lineer Regresyon) ───── */
export const calculateTrend = (priceHistory = []) => {
    if (priceHistory.length < 2) return { slope: 0, direction: "stabil", confidence: 0 };
    const n = priceHistory.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    priceHistory.forEach((p, i) => {
        sumX += i;
        sumY += p;
        sumXY += i * p;
        sumX2 += i * i;
    });
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const mean = sumY / n;
    const slopeNorm = mean > 0 ? (slope / mean) * 100 : 0;
    return {
        slope: Math.round(slope * 100) / 100,
        slopeNormalized: Math.round(slopeNorm * 100) / 100,
        direction: slopeNorm > 1 ? "yükselen" : slopeNorm < -1 ? "düşen" : "stabil",
        confidence: Math.min(100, Math.round(Math.abs(slopeNorm) * 8 + n * 5)),
        forecast: Math.round((mean + slope * 3) * 100) / 100,
    };
};

/* ───── Hareketli Ortalama (SMA) ───── */
export const movingAverage = (data = [], window = 3) => {
    if (data.length < window) return data;
    return data.map((_, i, arr) => {
        if (i < window - 1) return null;
        const slice = arr.slice(i - window + 1, i + 1);
        return Math.round((slice.reduce((a, b) => a + b, 0) / window) * 100) / 100;
    }).filter(v => v !== null);
};

/* ───── Volatilite Skoru ───── */
export const getVolatilityScore = (crop) => {
    const base = VOLATILITY_BASE[crop] || 0.15;
    const currentMonth = new Date().getMonth();
    const seasonal = SEASONAL_MULTIPLIERS[crop] || Array(12).fill(1);
    const monthEffect = Math.abs(seasonal[currentMonth] - 1);
    const score = Math.round(Math.min(100, (base + monthEffect) * 200));
    return {
        score,
        level: score > 60 ? "yüksek" : score > 30 ? "orta" : "düşük",
        color: score > 60 ? "#f87171" : score > 30 ? "#fbbf24" : "#86efac",
        baseVolatility: base,
    };
};

/* ───── Bölgesel Fiyat Karşılaştırma & Arbitraj ───── */
export const getRegionalPriceMap = (crop) => {
    const base = cropPriceTlKg[crop] || 10;
    const currentMonth = new Date().getMonth();
    const seasonalM = (SEASONAL_MULTIPLIERS[crop] || Array(12).fill(1))[currentMonth];
    const regions = Object.entries(TURKEY_REGIONAL_MULTIPLIERS).map(([region, regionalM]) => {
        const price = Math.round(base * seasonalM * (1 + (regionalM - 1.3) * 0.15) * 100) / 100;
        return { region, price, multiplier: regionalM };
    });
    regions.sort((a, b) => a.price - b.price);
    const minRegion = regions[0];
    const maxRegion = regions[regions.length - 1];
    const spread = maxRegion.price - minRegion.price;
    const spreadPct = minRegion.price > 0 ? Math.round((spread / minRegion.price) * 10000) / 100 : 0;
    return {
        regions,
        arbitrage: {
            buyRegion: minRegion.region,
            buyPrice: minRegion.price,
            sellRegion: maxRegion.region,
            sellPrice: maxRegion.price,
            spread,
            spreadPct,
            viable: spreadPct > 8,
        },
    };
};

/* ───── Akıllı Fiyat Önerisi (Satış İçin) ───── */
export const getSmartSellPrice = (crop, city, quality = "A") => {
    const base = cropPriceTlKg[crop] || 10;
    const region = CITY_TO_REGION[city] || "Ic Anadolu";
    const regionalM = TURKEY_REGIONAL_MULTIPLIERS[region] || 1.0;
    const currentMonth = new Date().getMonth();
    const seasonalM = (SEASONAL_MULTIPLIERS[crop] || Array(12).fill(1))[currentMonth];
    const qualityM = quality === "A" ? 1.15 : quality === "B" ? 1.0 : 0.88;
    const price = Math.round(base * seasonalM * (1 + (regionalM - 1.3) * 0.12) * qualityM * 100) / 100;
    const minPrice = Math.round(price * 0.88 * 100) / 100;
    const maxPrice = Math.round(price * 1.12 * 100) / 100;
    return {
        recommended: price,
        min: minPrice,
        max: maxPrice,
        region,
        seasonalEffect: seasonalM > 1 ? "pozitif" : seasonalM < 1 ? "negatif" : "nötr",
        qualityPremium: quality === "A" ? "+15%" : quality === "B" ? "baz" : "-12%",
        confidence: Math.round(70 + Math.random() * 20),
    };
};

/* ───── Tüm Ürünler İçin Piyasa Özeti ───── */
export const getMarketOverview = () => {
    const currentMonth = new Date().getMonth();
    return Object.keys(cropPriceTlKg).map(crop => {
        const seasonal = getSeasonalPrice(crop, currentMonth);
        const vol = getVolatilityScore(crop);
        const harvest = HARVEST_SEASONS[crop];
        return {
            crop,
            label: cropLabelMap[crop] || crop,
            currentPrice: seasonal.price,
            basePrice: seasonal.basePrice,
            trend: seasonal.trend,
            volatility: vol,
            isHarvestSeason: harvest ? (currentMonth + 1 >= harvest.start && currentMonth + 1 <= harvest.end) : false,
            harvestLabel: harvest?.label || "-",
            sparkData: get12MonthProjection(crop).map(p => p.price),
        };
    });
};

/* ───── Ürün Karşılaştırma Matrisi ───── */
export const getCropComparisonMatrix = (crops = []) => {
    if (!crops.length) crops = Object.keys(cropPriceTlKg);
    const currentMonth = new Date().getMonth();
    return crops.map(crop => {
        const s = getSeasonalPrice(crop, currentMonth);
        const v = getVolatilityScore(crop);
        const proj = get12MonthProjection(crop);
        const maxMonth = proj.reduce((best, p) => p.price > best.price ? p : best, proj[0]);
        const minMonth = proj.reduce((best, p) => p.price < best.price ? p : best, proj[0]);
        return {
            crop,
            label: cropLabelMap[crop] || crop,
            currentPrice: s.price,
            trend: s.trend,
            volatilityScore: v.score,
            volatilityLevel: v.level,
            bestMonth: maxMonth.monthLabel,
            bestPrice: maxMonth.price,
            worstMonth: minMonth.monthLabel,
            worstPrice: minMonth.price,
            yearRange: Math.round((maxMonth.price - minMonth.price) * 100) / 100,
        };
    });
};
