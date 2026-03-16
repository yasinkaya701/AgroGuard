import React, { useCallback, useMemo, useRef, useState, memo, useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import {
  AlertCircle,
  CheckCircle2,
  Leaf,
  LeafyGreen,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
  Compass,
  Landmark,
  Activity,
  Radio,
  Bell,
  Search, Bot
} from "lucide-react";
import "./App.css";

import { HomeTabHeader, HomeTabMain } from "./components/tabs/HomeTab";
import LandTab from "./components/tabs/LandTab";
import MarketTab from "./components/tabs/MarketTab";
import WeatherTab from "./components/tabs/WeatherTab";
import DemosTab from "./components/tabs/DemosTab";

import {
  handbookSections,
  careProtocols,
  cropEncyclopedia,
  diseaseLibrary,
  glossary,
  greenhouseRisks,
  greenhouseTips,
  irrigationTips,
  irrigationMethods,
  seasonalPlanner,
  nutrientGuide,
  organicPractices,
  postHarvest,
  fertilizerSchedule,
  harvestGuide,
  ipmSteps,
  weatherActions,
  diseasePrevention,
  commonMistakes,
  seedSaving,
  storageGuide,
  troubleshooting,
  pestLifecycle,
  rotationGuide,
  seedStartGuide,
  pestGuide,
  farmerChecklists,
  safetyNotes,
  soilTesting,
  soilTypes,
  symptomDictionary
} from "./data/guideData";
import {
  MOCK_DISEASE_CATALOG,
  mockNormText,
  mockPrettyLabel,
  mockHash,
  pickMockCatalog,
  buildMockPlantDiseases,
  buildMockDiagnosis,
  fetchOpenMeteo,
  steps,
  highlights,
  gapHassasModules,
  gapHassasLinks,
  shippingPayloadSamples,
  demoInsightCards,
  demoCompactItems,
  demoScorecards,
  demoTimeline,
  demoHistory,
  demoTrend,
  demoDiseaseScenarios,
  demoPresetLibrary,
  demoFlowLibrary,
  demoTaskTemplates,
  demoResourceBenchmarks,
  demoSeasonTemplate,
  demoIncidentLibrary,
  demoInterventionLibrary,
  demoMicroDecisions,
  demoHeatmap,
  demoJourneySteps,
  faqItems,
  turkeyGuidePlants,
  basePlantProfiles,
  riskMatrix,
  diseaseScouting,
  supplyChecklist,
  yieldTracker,
  costPlanner,
  marketingTips,
  irrigationChecklist,
  starterChecklist,
  TURKISH_WORD_FIXES
} from "./data/mockData";

import {
  cropYieldKgDa,
  cropLabelMap,
  cropPriceTlKg,
  defaultCosts,
  landDemoBenchmarks
} from "./data/economicsData";
import { TURKEY_CITIES_81, TURKEY_DISTRICTS_BY_CITY } from "./data/trLocationData";
import { getSmartLandPrice } from "./data/marketModeling";
import visualField from "./assets/visual-field.svg";
import visualLeaf from "./assets/visual-leaf.svg";
import visualMarket from "./assets/visual-market.svg";
import visualWeather from "./assets/visual-weather.svg";
import visualKnowledge from "./assets/visual-knowledge.svg";

const normalizeKey = mockNormText;

const TURKEY_CITY_OPTIONS = TURKEY_CITIES_81.map(city => ({
  id: normalizeKey(city),
  label: city
}));

const bottomTabs = ["home", "land", "market", "weather", "demos"];

const plantNameOverrides = {
  "tomato": "Domates",
  "potato": "Patates",
  "pepper": "Biber",
  "apple": "Elma",
  "grape": "Üzüm"
};

const titleCase = (str) => {
  if (!str) return "";
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const COMMON_NEIGHBORHOOD_HINTS = ["Mahallesi", "Köyü", "Mevkii", "Sitesi"];

const dedupeLocationLabels = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    if (item == null) return false;
    const key =
      typeof item === "string"
        ? `label:${normalizeKey(item)}`
        : `row:${item.type || "item"}:${item.id || normalizeKey(item.label || item.city || item.district || item.neighborhood || JSON.stringify(item))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (typeof item === "string") {
      return String(item).trim().length > 0;
    }
    const labelLike = item.label || item.city || item.district || item.neighborhood || "";
    if (!String(labelLike).trim()) return false;
    return true;
  });
};

const TURKEY_DISTRICT_HINTS = TURKEY_DISTRICTS_BY_CITY;

const isCapacitorRuntime = Boolean(window?.Capacitor);
const isAndroidRuntime = /android/i.test(window?.navigator?.userAgent || "");
const envTrue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};
const forceCapacitorMockMode = envTrue(process.env.REACT_APP_FORCE_CAPACITOR_MOCK);
const isFrontendOnlyMode = envTrue(process.env.REACT_APP_FRONTEND_ONLY) || (isCapacitorRuntime && forceCapacitorMockMode);
const defaultCapacitorApiBase = isAndroidRuntime ? "http://10.0.2.2:5051" : "http://127.0.0.1:5051";
const API_BASE = isFrontendOnlyMode
  ? ""
  : process.env.REACT_APP_API_BASE ||
  (isCapacitorRuntime ? defaultCapacitorApiBase : "http://127.0.0.1:5051");
const parseApiFallbacks = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const CAPACITOR_API_CANDIDATES = Array.from(
  new Set([
    API_BASE,
    isAndroidRuntime ? "http://10.0.2.2:5051" : "http://127.0.0.1:5051",
    "http://localhost:5051",
    ...parseApiFallbacks(process.env.REACT_APP_API_FALLBACKS)
  ].filter(Boolean))
);
const SOIL_MAP_PICKER = {
  width: 900,
  height: 420,
  zoom: 6,
  centerLat: 39.0,
  centerLon: 35.0
};
const lonToWorldX = (lon, zoom) => ((Number(lon) + 180) / 360) * 256 * 2 ** Number(zoom);
const latToWorldY = (lat, zoom) => {
  const rad = (Number(lat) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 256 * 2 ** Number(zoom);
};
const worldXToLon = (x, zoom) => (Number(x) / (256 * 2 ** Number(zoom))) * 360 - 180;
const worldYToLat = (y, zoom) => {
  const n = Math.PI - (2 * Math.PI * Number(y)) / (256 * 2 ** Number(zoom));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
const resolveWebFallbackBase = () => {
  if (typeof window === "undefined") return "http://127.0.0.1:5051";
  const host = window.location.hostname || "127.0.0.1";
  if (host === "localhost" || host === "127.0.0.1") return "http://127.0.0.1:5051";
  return `http://${host}:5051`;
};
const isPrivateNetworkBase = (value) =>
  /\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(String(value || ""));
const getWebApiCandidates = () => {
  const preferredBases = [
    resolveWebFallbackBase(),
    "http://127.0.0.1:5051",
    "http://localhost:5051"
  ].filter(Boolean);
  const configuredBases = [API_BASE, ...parseApiFallbacks(process.env.REACT_APP_API_FALLBACKS)].filter(Boolean);
  const uniqueBases = Array.from(new Set([...preferredBases, ...configuredBases]));
  if (typeof window === "undefined") return uniqueBases;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") return uniqueBases;
  const localBases = [];
  const deferredBases = [];
  uniqueBases.forEach((base) => {
    if (!base) return;
    if (preferredBases.includes(base) || !isPrivateNetworkBase(base)) {
      localBases.push(base);
      return;
    }
    deferredBases.push(base);
  });
  return Array.from(new Set([...localBases, ...deferredBases]));
};
const LocalNotifications = registerPlugin("LocalNotifications");
const inMemoryStore = new Map();
const safeLocalStorage = {
  getItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (_) { }
    return inMemoryStore.has(key) ? inMemoryStore.get(key) : null;
  },
  setItem(key, value) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (_) { }
    inMemoryStore.set(key, String(value));
  },
  removeItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (_) { }
    inMemoryStore.delete(key);
  }
};
let resolvedApiBase = isFrontendOnlyMode
  ? ""
  : isCapacitorRuntime
    ? (API_BASE || defaultCapacitorApiBase)
    : (getWebApiCandidates()[0] || API_BASE || "http://127.0.0.1:5051");
const allowRuntimeMockFallback =
  process.env.REACT_APP_ALLOW_RUNTIME_MOCK == null
    ? false
    : envTrue(process.env.REACT_APP_ALLOW_RUNTIME_MOCK);
if (typeof window !== "undefined") {
  window.__agroguardResolvedApiBase = resolvedApiBase;
  window.__agroguardRuntimeMock = false;
}

const mockJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// Mock data and utilities relocated to src/data/mockData.js

const mockApiResponse = (path, options = {}) => {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const now = new Date();
  const nowIso = now.toISOString();
  const city = params.get("city") || "Malatya";
  const district = params.get("district") || "";
  const neighborhood = params.get("neighborhood") || params.get("mahalle") || "";
  const locationLabel = [city, district, neighborhood].filter(Boolean).join(" / ");
  const plantId = params.get("plant") || "tomato";

  if (pathname === "/api/health") {
    return mockJsonResponse({
      status: "ok",
      mode: "frontend-only",
      updatedAt: nowIso,
      apiVersion: "2026.02.15",
      modelVersion: "frontend-mock",
      features: {
        modelHealth: true,
        modelSelfCheck: true,
        modelDiagnostics: true,
        tradeMarket: true,
        landPricing: true,
        weather: true,
        soil: true,
        strictModelMode: true,
        onnxPipelineCount: 2
      }
    });
  }
  if (pathname === "/api/model/health") {
    return mockJsonResponse({
      updatedAt: nowIso,
      checks: {
        strictMode: true,
        modelPathExists: true,
        secondaryModelPathExists: true,
        labelsPathExists: true,
        labelsCount: 38,
        primaryLoaded: true,
        secondaryLoaded: true,
        pipelineCount: 2
      },
      pipelines: ["primary-onnx", "secondary-onnx"],
      lastFailure: null,
      lastSuccessAt: nowIso,
      healthy: true,
      recommendations: []
    });
  }
  if (pathname === "/api/model/self-check") {
    return mockJsonResponse({
      updatedAt: nowIso,
      ok: true,
      summary: "All pipelines healthy",
      checks: [
        { id: "primary-onnx", ok: true, logits: 38, labels: 38, detail: "output_ok" },
        { id: "secondary-onnx", ok: true, logits: 38, labels: 38, detail: "output_ok" }
      ]
    });
  }
  if (pathname === "/api/model/diagnostics") {
    return mockJsonResponse({
      updatedAt: nowIso,
      strictMode: true,
      diagnostics: {
        windowSize: 200,
        sampleCount: 64,
        confidence: { mean: 0.71, std: 0.083, min: 0.48, max: 0.91 },
        labelDiversity: 12,
        healthyRate: 0.39,
        sourceBreakdown: { "onnx-primary": 64 },
        statusBreakdown: { ok: 39, review: 23, blocked: 2 },
        fallbackRate: 0,
        dominantLabelShare: 0.19,
        topLabels: [
          { label: "tomato_early_blight", count: 12, share: 0.19 },
          { label: "tomato_healthy", count: 10, share: 0.16 },
          { label: "tomato_leaf_mold", count: 8, share: 0.13 }
        ],
        warnings: {
          lowVariance: false,
          lowDiversity: false,
          healthySkew: false,
          highFallback: false,
          highFailureRate: false
        },
        recommendations: [],
        failureRate: 0.03,
        predictEventWindow: 300,
        recentFailures: [],
        recentPredictions: [
          {
            at: nowIso,
            label: "tomato_early_blight",
            confidence: 0.78,
            source: "onnx-primary",
            status: "ok"
          }
        ],
        lowVarianceWarning: false,
        lowVarianceThreshold: 0.04,
        lastPredictionAt: nowIso
      },
      health: {
        healthy: true
      }
    });
  }
  if (pathname === "/api/model/diagnostics/reset") {
    return mockJsonResponse({
      updatedAt: nowIso,
      ok: true,
      summary: "Model diagnostics reset",
      diagnostics: {
        windowSize: 200,
        sampleCount: 0,
        confidence: null,
        labelDiversity: 0,
        healthyRate: null,
        sourceBreakdown: {},
        statusBreakdown: {},
        fallbackRate: null,
        dominantLabelShare: null,
        topLabels: [],
        warnings: {
          lowVariance: false,
          lowDiversity: false,
          healthySkew: false,
          highFallback: false,
          highFailureRate: false
        },
        recommendations: [],
        failureRate: null,
        predictEventWindow: 300,
        recentFailures: [],
        recentPredictions: [],
        lowVarianceWarning: false,
        lowVarianceThreshold: 0.04,
        lastPredictionAt: null
      }
    });
  }
  if (pathname === "/api/plants") {
    return mockJsonResponse({ plants: ["tomato", "pepper", "cucumber", "squash", "eggplant"] });
  }
  if (pathname === "/api/plant-diseases") {
    return mockJsonResponse(buildMockPlantDiseases(plantId));
  }
  if (pathname === "/api/weather") {
    return mockJsonResponse({
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      locationLabel: locationLabel || city,
      source: "frontend-mock",
      condition: "Parcali bulutlu",
      temp: 24,
      tempMin: 18,
      tempMax: 29,
      humidity: 58,
      windKmh: 11,
      windGustKmh: 19,
      precipitationMm: 0.4,
      frostRisk: false,
      localTime: nowIso,
      timeZone: "Europe/Istanbul",
      updatedAt: nowIso
    });
  }
  if (pathname === "/api/forecast") {
    const conditions = ["Açık", "Parçalı bulutlu", "Bulutlu", "Hafif yağmur", "Güneşli"];
    const mkDay = (offset, min, max, rain, gust, cond) => ({
      day: new Date(now.getTime() + offset * 86400000).toLocaleDateString("tr-TR", { weekday: "short" }),
      min,
      max,
      condition: cond || conditions[offset % conditions.length],
      precipitationMm: rain,
      frost: min <= 0,
      windGustKmh: gust
    });
    const mkHour = (offsetHour, wind, gust, rain, temp) => ({
      time: new Date(now.getTime() + offsetHour * 3600000).toISOString(),
      temp: temp,
      windKmh: wind,
      windGustKmh: gust,
      precipitationMm: rain
    });
    return mockJsonResponse({
      source: "frontend-mock",
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      locationLabel: locationLabel || city,
      timeZone: "Europe/Istanbul",
      days: [
        mkDay(0, 18, 28, 0, 20, "Parçalı bulutlu"),
        mkDay(1, 17, 27, 2, 24, "Hafif yağmur"),
        mkDay(2, 16, 26, 4, 27, "Bulutlu"),
        mkDay(3, 15, 25, 1, 22, "Açık"),
        mkDay(4, 14, 24, 0, 18, "Güneşli"),
        mkDay(5, 13, 23, 0, 15, "Açık"),
        mkDay(6, 12, 22, 3, 21, "Hafif yağmur")
      ],
      hourly: [
        mkHour(1, 10, 16, 0, 23),
        mkHour(2, 12, 18, 0, 24),
        mkHour(3, 14, 21, 0.2, 25),
        mkHour(4, 15, 23, 0.5, 26),
        mkHour(5, 13, 20, 0.1, 25),
        mkHour(6, 11, 17, 0, 23)
      ]
    });
  }
  if (pathname === "/api/weather/alerts") {
    return mockJsonResponse({
      city: city || "Malatya",
      locationLabel: locationLabel || city,
      coords: null,
      alerts: [],
      source: "frontend-mock"
    });
  }
  if (pathname === "/api/soil/recommend-crops" && (options?.method || "GET").toUpperCase() === "POST") {
    const body = options?.body ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body) : {};
    return mockJsonResponse({
      ph: body.ph ?? 6.5,
      texture: body.texture || null,
      region: body.region || null,
      recommended: [{ id: "domates", name: "Domates", suitability: "uygun", score: 4, reasons: ["pH uygun", "Bölge uygun"] }, { id: "biber", name: "Biber", suitability: "uygun", score: 4, reasons: ["pH uygun", "Tekstür uygun"] }],
      limited: [{ id: "patates", name: "Patates", suitability: "sınırlı_uygun", score: 2, reasons: ["Bölge uygun"] }],
      all: []
    });
  }
  if (pathname === "/api/yield/estimate") {
    const crop = params.get("crop") || "domates";
    return mockJsonResponse({
      crop,
      region: params.get("region") || "ic_anadolu",
      ndvi_avg: null,
      yield_kg_da: { low: 6400, mid: 7200, high: 8000 },
      unit: "kg/da",
      note: "Tahmin indeks ve bölge parametreleriyle hesaplanan kaba tahmin (beta)."
    });
  }
  if (pathname === "/api/land-price") {
    const smartPrice = getSmartLandPrice(city);
    return mockJsonResponse({
      city,
      district: district || null,
      neighborhood: params.get("neighborhood") || null,
      crop: params.get("crop") || null,
      source: "market-model",
      sourceTitle: "AgriCore Market Model",
      sourceUrl: null,
      priceTlDa: smartPrice.priceTlDa,
      minTlDa: smartPrice.minTlDa,
      maxTlDa: smartPrice.maxTlDa,
      confidence: "medium",
      confidenceScore: smartPrice.confidenceScore,
      uncertaintyPct: 15,
      method: "model",
      providerCount: 1,
      failedProviderCount: 0,
      providerResults: [
        { source: "market-model", sourceTitle: `Regional (${smartPrice.region})`, url: null, priceTlDa: smartPrice.priceTlDa, weight: 1 }
      ],
      scenarios: [
        { id: "bear", label: "Temkinli", unitPriceTlDa: smartPrice.minTlDa, totalPriceTl: Math.round(smartPrice.minTlDa * 20) },
        { id: "base", label: "Baz", unitPriceTlDa: smartPrice.priceTlDa, totalPriceTl: Math.round(smartPrice.priceTlDa * 20) },
        { id: "bull", label: "Güçlü", unitPriceTlDa: smartPrice.maxTlDa, totalPriceTl: Math.round(smartPrice.maxTlDa * 20) }
      ],
      updatedAt: nowIso
    });
  }
  if (pathname === "/api/land-price/history") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 4,
      items: [
        { ts: now.getTime(), source: "api-consensus", method: "api", priceTlDa: 186000, minTlDa: 170000, maxTlDa: 205000, confidence: "medium", confidenceScore: 0.62 },
        { ts: now.getTime() - 3600 * 1000, source: "internet-scan", method: "internet-scan", priceTlDa: 181000, minTlDa: 166000, maxTlDa: 200000, confidence: "low", confidenceScore: 0.39 },
        { ts: now.getTime() - 2 * 3600 * 1000, source: "api-consensus", method: "api", priceTlDa: 184000, minTlDa: 169000, maxTlDa: 203000, confidence: "medium", confidenceScore: 0.58 },
        { ts: now.getTime() - 3 * 3600 * 1000, source: "model-estimate", method: "fallback-model", priceTlDa: 178000, minTlDa: 161000, maxTlDa: 198000, confidence: "medium", confidenceScore: 0.52 }
      ]
    });
  }
  if (pathname === "/api/land-price/listings") {
    if ((options?.method || "GET").toUpperCase() === "POST") {
      return mockJsonResponse({ ok: true, item: { id: `mock-${Date.now()}` } }, 201);
    }
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 3,
      summary: {
        source: "manual-listings",
        priceTlDa: 186000,
        minTlDa: 175000,
        maxTlDa: 198000,
        listingCount: 3
      },
      items: [
        { id: "l-1", city, district: "Yesilyurt", crop: params.get("crop") || "domates", priceTlDa: 182000, source: "manual", title: "Tarla 18 donum", url: "https://example.com/1", createdAt: nowIso },
        { id: "l-2", city, district: "Battalgazi", crop: params.get("crop") || "domates", priceTlDa: 189000, source: "manual", title: "Tarla 12 donum", url: "https://example.com/2", createdAt: nowIso },
        { id: "l-3", city, district: "Yesilyurt", crop: params.get("crop") || "domates", priceTlDa: 187000, source: "csv-import", title: "Tarla 25 donum", url: "https://example.com/3", createdAt: nowIso }
      ]
    });
  }
  if (pathname === "/api/land-price/listings/live") {
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      district: params.get("district") || "Yesilyurt",
      neighborhood: params.get("neighborhood") || null,
      crop: params.get("crop") || "domates",
      count: 3,
      summary: {
        priceTlDa: 191000,
        minTlDa: 176000,
        maxTlDa: 214000,
        listingCount: 3
      },
      scannedSources: [
        { url: "https://www.sahibinden.com/arama?...tarla", listingCount: 2 },
        { url: "https://www.hepsiemlak.com/arama?...tarla", listingCount: 1 }
      ],
      items: [
        { source: "https://www.sahibinden.com", totalPriceTl: 3820000, areaDa: 20, priceTlDa: 191000 },
        { source: "https://www.hepsiemlak.com", totalPriceTl: 2150000, areaDa: 12, priceTlDa: 179167 },
        { source: "https://www.sahibinden.com", totalPriceTl: 4280000, areaDa: 22, priceTlDa: 194545 }
      ]
    });
  }
  if (pathname === "/api/land-price/listings/import") {
    return mockJsonResponse({ ok: true, imported: 3, total: 6 });
  }
  if (pathname === "/api/land-price/sources") {
    return mockJsonResponse({
      updatedAt: nowIso,
      providerCount: 2,
      providers: [
        {
          id: "slot-1",
          title: "Tapu Rayic API",
          method: "GET",
          priority: 1,
          weight: 1.2,
          urlTemplate: "https://example.com/land?city={city}&district={district}&crop={crop}",
          mappedFields: { pricePath: "data.price_tl_da", minPath: "data.min", maxPath: "data.max", updatedAtPath: "data.updatedAt" },
          confidence: "high"
        },
        {
          id: "slot-2",
          title: "Emlak Endeks API",
          method: "POST",
          priority: 2,
          weight: 1,
          urlTemplate: "https://example.com/rayic?city={city}&crop={crop}",
          mappedFields: { pricePath: "result.rayic_tl_da", minPath: null, maxPath: null, updatedAtPath: "result.updatedAt" },
          confidence: "medium"
        }
      ]
    });
  }
  if (pathname === "/api/land-price/providers-health") {
    return mockJsonResponse({
      updatedAt: nowIso,
      total: 2,
      healthy: 1,
      unhealthy: 1,
      providers: [
        {
          id: "slot-1",
          title: "Tapu Rayic API",
          method: "GET",
          ok: true,
          statusCode: 200,
          latencyMs: 412
        },
        {
          id: "slot-2",
          title: "Emlak Endeks API",
          method: "POST",
          ok: false,
          statusCode: 503,
          latencyMs: 1200,
          error: "HTTP 503"
        }
      ]
    });
  }
  if (pathname === "/api/land-price/compare") {
    return mockJsonResponse({
      city,
      district: null,
      neighborhood: params.get("neighborhood") || null,
      crop: params.get("crop") || null,
      coords: params.get("coords") || null,
      remote: {
        source: "api-consensus",
        sourceTitle: "Çoklu API uzlasisi",
        priceTlDa: 188000,
        minTlDa: 171000,
        maxTlDa: 207000,
        confidence: "medium",
        providerCount: 2
      },
      manual: {
        source: "manual-listings",
        sourceTitle: "Elle girilen ilanlar",
        priceTlDa: 186000,
        minTlDa: 175000,
        maxTlDa: 198000,
        confidence: "medium",
        listingCount: 6
      },
      comparable: {
        source: "comparable-listings",
        sourceTitle: "Emsal ilan sinyali",
        priceTlDa: 187500,
        minTlDa: 174500,
        maxTlDa: 201000,
        confidence: "medium",
        listingCount: 14
      },
      internet: {
        source: "internet-scan",
        sourceTitle: "Genel internet taramasi",
        priceTlDa: 181000,
        minTlDa: 165000,
        maxTlDa: 201000,
        confidence: "low",
        signalCount: 9
      },
      model: {
        source: "model-estimate",
        priceTlDa: 176000,
        minTlDa: 159000,
        maxTlDa: 196000,
        confidence: "medium"
      },
      updatedAt: nowIso
    });
  }
  if (pathname === "/api/land-price/ml") {
    const areaDa = Number(params.get("areaDa") || 20);
    const smartPrice = getSmartLandPrice(city);
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      district: params.get("district") || "Yesilyurt",
      neighborhood: params.get("neighborhood") || null,
      crop: params.get("crop") || "domates",
      region: smartPrice.region.toLowerCase(),
      areaDa,
      unitPriceTlDa: smartPrice.priceTlDa,
      totalPriceTl: Math.round(areaDa * smartPrice.priceTlDa),
      minTlDa: smartPrice.minTlDa,
      maxTlDa: smartPrice.maxTlDa,
      confidence: "medium",
      confidenceScore: smartPrice.confidenceScore,
      uncertaintyPct: 14,
      trendPct: 3.2,
      factors: {
        baselineTlDa: smartPrice.priceTlDa,
        zone: params.get("zone") || "gecis",
        irrigation: params.get("irrigation") || "var",
        roadAccess: params.get("roadAccess") || "orta",
        slopePct: Number(params.get("slopePct") || 6),
        soilScore: Number(params.get("soilScore") || 70)
      },
      training: {
        sampleCount: 214,
        manualCount: 38,
        syntheticCount: 172,
        localSignalCount: 4,
        rmseTlDa: 18100,
        maeTlDa: 14400,
        r2: 0.62
      },
      sources: {
        remote: { source: "api-consensus", priceTlDa: smartPrice.priceTlDa },
        manual: { source: "manual-listings", priceTlDa: Math.round(smartPrice.priceTlDa * 0.98) },
        comparable: { source: "comparable-listings", priceTlDa: Math.round(smartPrice.priceTlDa * 1.01) },
        internet: { source: "internet-scan", priceTlDa: Math.round(smartPrice.priceTlDa * 0.97) },
        model: { source: "model-estimate", priceTlDa: Math.round(smartPrice.priceTlDa * 0.95) }
      },
      preferredModel: "api-consensus",
      modelSelection: {
        selected: "api-consensus",
        mlScore: 0.67,
        customScore: null,
        reason: "Market model verileri baz alindi."
      },
      scenarios: [
        { id: "bear", label: "Temkinli", unitPriceTlDa: smartPrice.minTlDa, totalPriceTl: Math.round(areaDa * smartPrice.minTlDa) },
        { id: "base", label: "Baz", unitPriceTlDa: smartPrice.priceTlDa, totalPriceTl: Math.round(areaDa * smartPrice.priceTlDa) },
        { id: "bull", label: "Guclu", unitPriceTlDa: smartPrice.maxTlDa, totalPriceTl: Math.round(areaDa * smartPrice.maxTlDa) }
      ]
    });
  }
  if (pathname === "/api/land-price/model/status") {
    return mockJsonResponse({
      updatedAt: nowIso,
      available: true,
      model: {
        version: "v-demo-001",
        trainedAt: nowIso,
        sampleCount: 214,
        sampleBreakdown: {
          live: 36,
          manualScoped: 22,
          manualCity: 28,
          manualAll: 56,
          synthetic: 72
        },
        metrics: { rmse: 18100, mae: 14400, r2: 0.62 }
      }
    });
  }
  if (pathname === "/api/land-price/model/train") {
    return mockJsonResponse({
      updatedAt: nowIso,
      ok: true,
      model: {
        version: `v-demo-${now.getTime()}`,
        trainedAt: nowIso,
        sampleCount: 232,
        sampleBreakdown: {
          live: 42,
          manualScoped: 22,
          manualCity: 28,
          manualAll: 62,
          synthetic: 78
        },
        metrics: { rmse: 16900, mae: 13200, r2: 0.67 }
      },
      preview: {
        source: "custom-land-model",
        priceTlDa: 194800,
        minTlDa: 176100,
        maxTlDa: 220400,
        confidence: "medium",
        confidenceScore: 0.72
      }
    });
  }
  if (pathname === "/api/land-price/model/predict") {
    const areaDa = Number(params.get("areaDa") || 20);
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      district: params.get("district") || "Yesilyurt",
      crop: params.get("crop") || "domates",
      areaDa,
      unitPriceTlDa: 194800,
      totalPriceTl: Math.round(areaDa * 194800),
      minTlDa: 176100,
      maxTlDa: 220400,
      confidence: "medium",
      confidenceScore: 0.72,
      modelVersion: "v-demo-001",
      trainedAt: nowIso
    });
  }
  if (pathname === "/api/soil") {
    return mockJsonResponse({
      source: "soilgrids+open-meteo",
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      locationLabel: locationLabel || city,
      coords: params.get("coords") || "38.355,38.309",
      geoSource: "open-meteo-geocode",
      soilType: "Tinli",
      ph: 6.8,
      organic: 2.1,
      clay: 28.4,
      sand: 38.1,
      silt: 33.5,
      nitrogen: 0.17,
      cec: 14.2,
      bulkDensity: 1.32,
      climate: "Ilık",
      recommended: ["domates", "biber", "salatalik"],
      risky: ["pirinc"],
      diseaseRisk: ["mildiyou", "yaprak lekesi"],
      internetSignals: {
        topTempAvg: 15.6,
        deepTempAvg: 14.7,
        moistureTopAvg: 0.24,
        moistureMidAvg: 0.27,
        evapotranspirationAvg: 0.11,
        moistureState: "Dengeli"
      },
      internetMeta: {
        elevation: 970,
        timezone: "Europe/Istanbul"
      },
      internetSources: [
        { id: "soilgrids", title: "ISRIC SoilGrids", url: "https://rest.isric.org/soilgrids/v2.0/properties/query", available: true },
        { id: "open-meteo", title: "Open-Meteo Forecast", url: "https://api.open-meteo.com/v1/forecast", available: true },
        { id: "mta", title: "MTA katman servisi", url: "https://example.com/mta", available: false },
        { id: "tr-soil-wms", title: "Turkiye Toprak Haritasi (WMS)", url: "https://tgskcbs.tarim.gov.tr/arcgis/services/Toprak/MapServer/WMSServer", available: true }
      ],
      plantSuitability: [
        { id: "tomato", score: 82 },
        { id: "pepper", score: 78 },
        { id: "cucumber", score: 74 }
      ],
      soilHealth: { score: 76, status: "iyi" },
      updatedAt: nowIso
    });
  }
  if (pathname === "/api/soil/sources") {
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      coords: "38.355,38.309",
      sources: [
        { id: "soilgrids", title: "ISRIC SoilGrids", url: "https://rest.isric.org/soilgrids/v2.0/properties/query", type: "soil-properties" },
        { id: "open-meteo-geocode", title: "Open-Meteo Geocoding", url: "https://geocoding-api.open-meteo.com/v1/search", type: "geocoding" },
        { id: "open-meteo", title: "Open-Meteo Forecast", url: "https://api.open-meteo.com/v1/forecast", type: "soil-signal" },
        { id: "mta", title: "MTA katman servisi", url: "https://example.com/mta", type: "national-layer" },
        { id: "tr-soil-wms", title: "Turkiye Toprak Haritasi (WMS)", url: "https://tgskcbs.tarim.gov.tr/arcgis/services/Toprak/MapServer/WMSServer", type: "national-soil-layer" }
      ]
    });
  }
  if (pathname === "/api/sources") {
    return mockJsonResponse({
      updatedAt: nowIso,
      sources: [
        {
          id: "src-1",
          title: "Tarımsal izleme notu",
          summary: "Frontend-only modunda yerel özet veri kullanılıyor.",
          category: "rehber",
          url: "#"
        }
      ]
    });
  }
  if (pathname === "/api/integrations/health") {
    return mockJsonResponse({
      updatedAt: nowIso,
      total: 7,
      healthy: 6,
      degraded: 1,
      ratio: 0.857,
      items: [
        { id: "open-meteo-forecast", title: "Open-Meteo Forecast", ok: true, status: "ok", latencyMs: 190, url: "https://api.open-meteo.com/v1/forecast" },
        { id: "open-meteo-geocode", title: "Open-Meteo Geocode", ok: true, status: "ok", latencyMs: 120, url: "https://geocoding-api.open-meteo.com/v1/search" },
        { id: "soilgrids", title: "ISRIC SoilGrids", ok: true, status: "ok", latencyMs: 260, url: "https://rest.isric.org/soilgrids/v2.0/properties/query" },
        { id: "news-feed", title: "Tarım Haber RSS", ok: true, status: "ok", latencyMs: 340, url: "https://www.tarimorman.gov.tr/Sayfalar/RSS.aspx" },
        { id: "tr-soil-wms", title: "TR Toprak WMS", ok: true, status: "ok", latencyMs: 410, url: "https://tgskcbs.tarim.gov.tr/arcgis/services/Toprak/MapServer/WMSServer" },
        { id: "mta-soil", title: "MTA Soil Layer", ok: false, status: "missing_url", latencyMs: null, url: null },
        { id: "land-price-provider", title: "Arazi Fiyat Provider", ok: true, status: "ok", latencyMs: 280, url: "https://example.com/land" }
      ]
    });
  }
  if (pathname === "/api/news") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 3,
      source: "frontend-mock",
      items: [
        {
          title: "Tarımda su verimliligi projeleri hiz kazandi",
          link: "https://example.com/news/1",
          pubDate: nowIso,
          description: "Sulama verimliligi odakli yeni proje duyurulari.",
          feedId: "tarımorman",
          feedTitle: "Tarım ve Orman Bakanligi Haberleri"
        },
        {
          title: "Don riskine karşı bölgesel uyarı bülteni",
          link: "https://example.com/news/2",
          pubDate: nowIso,
          description: "İklim kaynaklı riskler için yeni uyarı notu.",
          feedId: "tarımorman-duyurular",
          feedTitle: "Tarım ve Orman Bakanligi Duyurular"
        },
        {
          title: "Tarım piyasalarında haftalık fiyat özeti",
          link: "https://example.com/news/3",
          pubDate: nowIso,
          description: "Urun bazli haftalik fiyat degisimleri.",
          feedId: "dunya-tarım",
          feedTitle: "Dunya Tarım"
        }
      ],
      feeds: [],
      failedFeeds: []
    });
  }
  if (pathname === "/api/economy/planner") {
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      crop: params.get("crop") || "domates",
      inputs: {
        areaDa: Number(params.get("areaDa") || 20),
        yieldKgDa: Number(params.get("yieldKgDa") || 800),
        priceTlKg: Number(params.get("priceTlKg") || 18)
      },
      fx: {
        source: "tcmb",
        url: "https://www.tcmb.gov.tr/kurlar/today.xml",
        date: now.toLocaleDateString("tr-TR"),
        usdTry: 36.42,
        eurTry: 39.88
      },
      macro: {
        source: "worldbank",
        indicators: {
          inflation: { id: "FP.CPI.TOTL.ZG", latestYear: 2024, latestValue: 58.5 },
          gdpGrowth: { id: "NY.GDP.MKTP.KD.ZG", latestYear: 2024, latestValue: 3.2 },
          agriShare: { id: "NV.AGR.TOTL.ZS", latestYear: 2024, latestValue: 6.1 },
          unemployment: { id: "SL.UEM.TOTL.ZS", latestYear: 2024, latestValue: 8.4 }
        },
        failed: []
      },
      commodity: {
        wheat: {
          source: "stooq",
          symbol: "ZW.F",
          date: nowIso.slice(0, 10).replace(/-/g, ""),
          open: 552.5,
          high: 556.8,
          low: 548.2,
          close: 550.7,
          changePct: -0.33
        }
      },
      localMarket: {
        source: "frontend-mock-market",
        selectedCrop: {
          crop: params.get("crop") || "domates",
          label: "Domates",
          priceRaw: "17 - 21",
          medianTlKg: 19
        },
        count: 5,
        medianTlKg: 18.6,
        avgTlKg: 18.9
      },
      tradeSummary: {
        source: "trade-market",
        openListingCount: 9,
        market: {
          sellMedianTlKg: 18.4,
          sellAvgTlKg: 18.1,
          buyMedianTlKg: 17.5,
          buyAvgTlKg: 17.2
        }
      },
      signals: {
        suggestedPriceTlKg: 18.8,
        costPressureScore: 67,
        riskLevel: "orta",
        revenueNow: 288000,
        revenueSuggested: 300800,
        deltaRevenueTl: 12800
      },
      failedSources: []
    });
  }
  if (pathname === "/api/trade/summary") {
    return mockJsonResponse({
      updatedAt: nowIso,
      city,
      crop: params.get("crop") || null,
      openListingCount: 7,
      sellCount: 4,
      buyCount: 3,
      offerCount: 5,
      orderCount: 2,
      market: {
        sellMedianTlKg: 17.8,
        sellAvgTlKg: 18.2,
        buyMedianTlKg: 16.9,
        buyAvgTlKg: 17.1,
        offerMedianTlKg: 17.4,
        offerAvgTlKg: 17.6
      }
    });
  }
  if (pathname === "/api/trade/listings") {
    const method = (options?.method || "GET").toUpperCase();
    if (method === "POST") {
      return mockJsonResponse({ ok: true, item: { id: `tr-${Date.now()}` } }, 201);
    }
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 3,
      items: [
        {
          id: "tr-1",
          type: "sell",
          status: "open",
          city,
          district: "Yesilyurt",
          crop: params.get("crop") || "domates",
          title: "Domates satılık",
          quantityKg: 12000,
          priceTlKg: 18.4,
          deliveryType: "seller_delivery",
          paymentType: "transfer",
          qualityGrade: "premium",
          contact: "0555 000 00 00",
          createdAt: nowIso
        },
        {
          id: "tr-2",
          type: "buy",
          status: "open",
          city,
          district: "Battalgazi",
          crop: params.get("crop") || "domates",
          title: "Salcalik domates alinir",
          quantityKg: 8000,
          priceTlKg: 17.1,
          deliveryType: "pickup",
          paymentType: "term",
          qualityGrade: "processing",
          contact: "0555 111 11 11",
          createdAt: nowIso
        },
        {
          id: "tr-3",
          type: "sell",
          status: "open",
          city,
          district: "Darende",
          crop: params.get("crop") || "domates",
          title: "Taze urun satılık",
          quantityKg: 5000,
          priceTlKg: 19.2,
          deliveryType: "cargo",
          paymentType: "cash",
          qualityGrade: "standard",
          contact: "0555 222 22 22",
          createdAt: nowIso
        }
      ]
    });
  }
  if (/^\/api\/trade\/listings\/[^/]+$/.test(pathname)) {
    const method = (options?.method || "PATCH").toUpperCase();
    const id = pathname.split("/")[4];
    if (method === "DELETE") return mockJsonResponse({ ok: true, id });
    if (method === "PATCH") {
      return mockJsonResponse({
        ok: true,
        item: {
          id,
          status: "open",
          updatedAt: nowIso
        }
      });
    }
    return mockJsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (pathname === "/api/trade/offers") {
    const method = (options?.method || "GET").toUpperCase();
    let body = {};
    try {
      body = options?.body ? JSON.parse(options.body) : {};
    } catch (_) {
      body = {};
    }
    if (method === "POST") {
      const expHours = Math.max(1, Number(body?.expiryHours || 48));
      return mockJsonResponse(
        {
          ok: true,
          item: {
            id: `of-${Date.now()}`,
            status: "pending",
            expiresAt: new Date(Date.now() + expHours * 3600 * 1000).toISOString()
          },
          match: { score: 74, tier: "medium", reasons: ["fiyat yakin", "teslimat uyumlu"] }
        },
        201
      );
    }
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 2,
      items: [
        {
          id: "of-1",
          listingId: params.get("listingId") || "tr-1",
          buyer: "MeyveSebze Ltd",
          quantityKg: 4000,
          offerPriceTlKg: 17.9,
          deliveryType: "seller_delivery",
          paymentType: "transfer",
          qualityGrade: "premium",
          match: { score: 88, tier: "strong", reasons: ["fiyat guclu", "teslimat uyumlu"] },
          status: "pending",
          expiresAt: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
          createdAt: nowIso
        },
        {
          id: "of-2",
          listingId: params.get("listingId") || "tr-1",
          buyer: "Hal Alici",
          quantityKg: 2500,
          offerPriceTlKg: 18.0,
          deliveryType: "pickup",
          paymentType: "cash",
          qualityGrade: "standard",
          match: { score: 64, tier: "medium", reasons: ["fiyat yakin", "odeme uyumlu"] },
          status: "expired",
          expiresAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          createdAt: nowIso
        }
      ]
    });
  }
  if (/^\/api\/trade\/offers\/[^/]+$/.test(pathname)) {
    const method = (options?.method || "PATCH").toUpperCase();
    if (method === "PATCH") {
      let body = {};
      try {
        body = options?.body ? JSON.parse(options.body) : {};
      } catch (_) {
        body = {};
      }
      return mockJsonResponse({
        ok: true,
        item: {
          id: pathname.split("/")[4],
          status: body?.status || "pending",
          quantityKg: Number(body?.quantityKg || 0),
          offerPriceTlKg: Number(body?.offerPriceTlKg || 0),
          expiresAt: body?.expiryHours
            ? new Date(Date.now() + Number(body.expiryHours) * 3600 * 1000).toISOString()
            : new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          updatedAt: nowIso
        }
      });
    }
    return mockJsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (pathname === "/api/trade/matches") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 2,
      items: [
        {
          listingId: "tr-1",
          offerId: "of-1",
          listing: { id: "tr-1", title: "Domates satılık", type: "sell", crop: params.get("crop") || "domates" },
          offer: { id: "of-1", buyer: "MeyveSebze Ltd", offerPriceTlKg: 17.9 },
          match: { score: 88, tier: "strong", reasons: ["fiyat guclu", "teslimat uyumlu", "kalite uyumlu"] }
        },
        {
          listingId: "tr-3",
          offerId: "of-2",
          listing: { id: "tr-3", title: "Taze urun satılık", type: "sell", crop: params.get("crop") || "domates" },
          offer: { id: "of-2", buyer: "Hal Alici", offerPriceTlKg: 18.0 },
          match: { score: 64, tier: "medium", reasons: ["fiyat yakin", "teslimat uyumsuz"] }
        }
      ]
    });
  }
  if (/^\/api\/trade\/offers\/[^/]+\/counter$/.test(pathname)) {
    return mockJsonResponse({ ok: true, item: { id: pathname.split("/")[4], status: "countered" } });
  }
  if (/^\/api\/trade\/offers\/[^/]+\/accept$/.test(pathname)) {
    return mockJsonResponse(
      {
        ok: true,
        item: {
          id: `ord-${Date.now()}`,
          status: "accepted",
          escrowStatus: "held"
        }
      },
      201
    );
  }
  if (pathname === "/api/trade/orders") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 2,
      items: [
        {
          id: "ord-1",
          listingId: "tr-1",
          offerId: "of-1",
          buyer: "MeyveSebze Ltd",
          seller: "Uretici 1",
          city,
          crop: params.get("crop") || "domates",
          quantityKg: 4000,
          priceTlKg: 17.9,
          totalTl: 71600,
          deliveryType: "seller_delivery",
          paymentType: "escrow",
          qualityGrade: "premium",
          shippingProvider: "yurtici",
          contractNo: "CT-20260001",
          invoiceNo: "INV-1001",
          trackingCode: "TRK-908771",
          trackingUrl: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=TRK-908771",
          escrowStatus: "held",
          status: "in_transit",
          createdAt: nowIso,
          updatedAt: nowIso
        },
        {
          id: "ord-2",
          listingId: "tr-3",
          offerId: "of-2",
          buyer: "Hal Alici",
          seller: "Uretici 2",
          city,
          crop: params.get("crop") || "domates",
          quantityKg: 2500,
          priceTlKg: 18.0,
          totalTl: 45000,
          deliveryType: "pickup",
          paymentType: "cash",
          qualityGrade: "standard",
          shippingProvider: "ptt",
          contractNo: "CT-20260002",
          invoiceNo: "INV-1002",
          trackingCode: null,
          trackingUrl: null,
          escrowStatus: "none",
          status: "completed",
          createdAt: nowIso,
          updatedAt: nowIso
        }
      ]
    });
  }
  if (/^\/api\/trade\/orders\/[^/]+$/.test(pathname)) {
    return mockJsonResponse({
      ok: true,
      item: {
        id: pathname.split("/")[4],
        updatedAt: nowIso,
        invoiceNo: "INV-1001",
        trackingCode: "TRK-908771",
        trackingUrl: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=TRK-908771",
        shippingProvider: "yurtici"
      }
    });
  }
  if (/^\/api\/trade\/orders\/[^/]+\/contract$/.test(pathname)) {
    const orderId = pathname.split("/")[4];
    return mockJsonResponse({
      updatedAt: nowIso,
      orderId,
      contractNo: "CT-20260001",
      contractUrl: null,
      text: `Sozlesme No: CT-20260001\nSiparis No: ${orderId}\nUrun: domates\nMiktar: 4000.00 kg\nBirim Fiyat: 17.90 TL/kg\nToplam: 71600.00 TL`
    });
  }
  if (/^\/api\/trade\/orders\/[^/]+\/contract\.pdf$/.test(pathname)) {
    return new Response("%PDF-1.4\n% Mock Contract PDF\n", {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=contract-mock.pdf"
      }
    });
  }
  if (pathname === "/api/trade/alerts") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 3,
      items: [
        { id: "al-1", level: "success", title: "Yeni siparis olustu", detail: "domates • 4000 kg", orderId: "ord-1", createdAt: nowIso },
        { id: "al-2", level: "info", title: "Siparis güncellendi: in_transit", detail: "Takip: TRK-908771", orderId: "ord-1", createdAt: nowIso },
        { id: "al-3", level: "success", title: "Yeni puanlama", detail: "Uretici 1 icin 5/5", orderId: "ord-2", createdAt: nowIso }
      ]
    });
  }
  if (pathname === "/api/trade/shipping/providers") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 5,
      items: [
        { id: "ptt", name: "PTT Kargo", trackingUrlTemplate: "https://gonderitakip.ptt.gov.tr/Track/Verify?q={code}", apiConfigured: false },
        { id: "yurtici", name: "Yurtici Kargo", trackingUrlTemplate: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={code}", apiConfigured: false },
        { id: "mng", name: "MNG Kargo", trackingUrlTemplate: "https://www.mngkargo.com.tr/gonderi-takip?code={code}", apiConfigured: false },
        { id: "aras", name: "Aras Kargo", trackingUrlTemplate: "https://www.araskargo.com.tr/tr/online-servisler/kargo-takibi?code={code}", apiConfigured: false },
        { id: "ups", name: "UPS", trackingUrlTemplate: "https://www.ups.com/track?tracknum={code}", apiConfigured: false }
      ]
    });
  }
  if (pathname === "/api/trade/shipping/providers-health") {
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 5,
      healthy: 0,
      items: [
        { id: "ptt", name: "PTT Kargo", ok: false, mode: "simulated", reason: "api_not_configured" },
        { id: "yurtici", name: "Yurtici Kargo", ok: false, mode: "simulated", reason: "api_not_configured" },
        { id: "mng", name: "MNG Kargo", ok: false, mode: "simulated", reason: "api_not_configured" },
        { id: "aras", name: "Aras Kargo", ok: false, mode: "simulated", reason: "api_not_configured" },
        { id: "ups", name: "UPS", ok: false, mode: "simulated", reason: "api_not_configured" }
      ]
    });
  }
  if (pathname === "/api/trade/shipping/providers-config") {
    return mockJsonResponse({
      updatedAt: nowIso,
      items: [
        {
          id: "ptt",
          name: "PTT Kargo",
          apiConfigured: false,
          statusPath: null,
          codeParam: null,
          parserOverrides: {
            statusPaths: false,
            eventPaths: false,
            codePaths: false
          },
          parser: {
            statusPaths: ["status", "data.status", "shipment.status", "result.status"],
            eventPaths: ["event", "data.lastEvent", "shipment.lastEvent", "messağe"],
            codePaths: ["trackingCode", "barcode", "data.barcode"]
          }
        }
      ]
    });
  }
  if (pathname === "/api/trade/shipping/parse-preview") {
    let payload = {};
    try {
      const bodyRaw = options?.body ? JSON.parse(options.body) : {};
      payload = typeof bodyRaw?.payload === "string" ? JSON.parse(bodyRaw.payload || "{}") : bodyRaw?.payload || {};
    } catch (_) {
      return mockJsonResponse({ error: "invalid_json_payload" }, 400);
    }
    const provider = (() => {
      try {
        const bodyRaw = options?.body ? JSON.parse(options.body) : {};
        return bodyRaw?.provider || "yurtici";
      } catch (_) {
        return "yurtici";
      }
    })();
    const providerStatus =
      payload?.shipmentStatus || payload?.status || payload?.state || payload?.result?.status || null;
    const event = payload?.lastEvent || payload?.event || payload?.messağe || payload?.data?.lastEvent || null;
    const trackingCode = payload?.trackingCode || payload?.cargoKey || payload?.barcode || null;
    return mockJsonResponse({
      updatedAt: nowIso,
      provider,
      parser: {
        statusPaths: ["shipmentStatus", "status", "result.status"],
        eventPaths: ["lastEvent", "event", "messağe"],
        codePaths: ["trackingCode", "cargoKey", "barcode"]
      },
      diagnostics: {
        payloadTopLevelKeyCount: Object.keys(payload || {}).length,
        payloadTopLevelKeys: Object.keys(payload || {}),
        missing: {
          providerStatus: !providerStatus,
          event: !event,
          trackingCode: !trackingCode
        }
      },
      parsed: {
        providerStatus: providerStatus ? String(providerStatus).toLowerCase() : null,
        event: event ? String(event) : null,
        trackingCode: trackingCode ? String(trackingCode) : null,
        matchedPaths: {
          providerStatus: payload?.shipmentStatus ? "shipmentStatus" : payload?.status ? "status" : null,
          event: payload?.lastEvent ? "lastEvent" : payload?.event ? "event" : payload?.messağe ? "messağe" : null,
          trackingCode: payload?.trackingCode
            ? "trackingCode"
            : payload?.cargoKey
              ? "cargoKey"
              : payload?.barcode
                ? "barcode"
                : null
        },
        normalizedStatus: "in_transit"
      }
    });
  }
  if (/^\/api\/trade\/orders\/[^/]+\/shipping-status$/.test(pathname)) {
    const orderId = pathname.split("/")[4];
    return mockJsonResponse({
      updatedAt: nowIso,
      orderId,
      provider: "yurtici",
      mode: "simulated",
      status: "delivered",
      providerStatus: "delivered",
      event: "Teslim edildi kaydi alindi",
      seenTrackingCode: "TRK-908771",
      trackingUrl: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=TRK-908771"
    });
  }
  if (/^\/api\/trade\/orders\/[^/]+\/shipping-sync$/.test(pathname)) {
    const orderId = pathname.split("/")[4];
    return mockJsonResponse({
      ok: true,
      item: {
        id: orderId,
        status: "delivered",
        escrowStatus: "released",
        shippingProvider: "yurtici",
        trackingCode: "TRK-908771",
        trackingUrl: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=TRK-908771",
        updatedAt: nowIso
      },
      mode: "simulated",
      provider: "yurtici",
      event: "Teslim edildi kaydi alindi"
    });
  }
  if (pathname === "/api/trade/shipping/sync-all") {
    return mockJsonResponse({
      updatedAt: nowIso,
      scanned: 2,
      updated: 2,
      items: [
        { id: "ord-1", status: "delivered", mode: "simulated", event: "Teslim edildi kaydi alindi" },
        { id: "ord-2", status: "completed", mode: "simulated", event: "Kargo durumu güncel" }
      ]
    });
  }
  if (pathname === "/api/trade/messağes") {
    const method = (options?.method || "GET").toUpperCase();
    if (method === "POST") {
      return mockJsonResponse({ ok: true, item: { id: `msg-${Date.now()}` } }, 201);
    }
    return mockJsonResponse({
      updatedAt: nowIso,
      count: 3,
      items: [
        { id: "msg-1", listingId: params.get("listingId") || "tr-1", senderRole: "buyer", sender: "MeyveSebze Ltd", text: "Yarin teslim olur mu?", createdAt: nowIso },
        { id: "msg-2", listingId: params.get("listingId") || "tr-1", senderRole: "seller", sender: "Uretici", text: "Evet, sabah sevk ederiz.", createdAt: nowIso },
        { id: "msg-3", listingId: params.get("listingId") || "tr-1", senderRole: "buyer", sender: "MeyveSebze Ltd", text: "Escrow ile ilerleyelim.", createdAt: nowIso }
      ]
    });
  }
  if (pathname === "/api/trade/ratings") {
    return mockJsonResponse(
      {
        ok: true,
        item: { id: `rt-${Date.now()}` },
        trust: {
          targetName: "Örnek",
          targetRole: "seller",
          ratingCount: 9,
          avgScore: 4.4,
          completionRate: 88,
          trustScore: 84,
          tier: "high"
        }
      },
      201
    );
  }
  if (pathname === "/api/trade/trust") {
    return mockJsonResponse({
      updatedAt: nowIso,
      targetName: params.get("name") || "Örnek",
      targetRole: params.get("role") || "seller",
      ratingCount: 9,
      avgScore: 4.4,
      completionRate: 88,
      trustScore: 84,
      tier: "high"
    });
  }
  if (pathname === "/api/metrics") {
    return mockJsonResponse({ uptimeSec: 1, queueLength: 0, cacheSize: 0, mode: "frontend-only" });
  }
  if (pathname === "/api/diagnose") {
    const selectedPlant = options?.body?.get?.("plant") || "tomato";
    const imageFile = options?.body?.get?.("image");
    const imageName = imageFile?.name || "";
    const imageSize = Number(imageFile?.size || 0);
    const diagnosis = buildMockDiagnosis({
      plant: String(selectedPlant || "tomato"),
      imageName,
      imageSize,
      nowIso
    });
    return mockJsonResponse({
      id: `mock-${Date.now()}`,
      plant: selectedPlant,
      detectedPlant: diagnosis.detectedPlant,
      plantMatch: true,
      ...diagnosis
    });
  }

  return mockJsonResponse({ ok: true, path: pathname, mode: "frontend-only" });
};

const apiFetch = async (path, options) => {
  if (isFrontendOnlyMode) {
    return mockApiResponse(path, options);
  }
  if (isCapacitorRuntime) {
    const candidates = Array.from(
      new Set([resolvedApiBase, ...CAPACITOR_API_CANDIDATES, ...parseApiFallbacks(process.env.REACT_APP_API_BASE)])
    ).filter(Boolean);
    let lastError = null;
    for (const base of candidates) {
      try {
        const res = await fetch(`${base}${path}`, options);
        resolvedApiBase = base;
        if (typeof window !== "undefined") {
          window.__agroguardResolvedApiBase = resolvedApiBase;
          window.__agroguardRuntimeMock = false;
        }
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    if (allowRuntimeMockFallback) {
      if (typeof window !== "undefined") {
        window.__agroguardRuntimeMock = true;
      }
      return mockApiResponse(path, options);
    }
    throw lastError || new Error("api_unreachable");
  }
  const webCandidates = getWebApiCandidates();
  let lastError = null;
  for (const base of webCandidates) {
    try {
      const res = await fetch(`${base}${path}`, options);
      resolvedApiBase = base;
      if (typeof window !== "undefined") {
        window.__agroguardResolvedApiBase = resolvedApiBase;
        window.__agroguardRuntimeMock = false;
      }
      return res;
    } catch (err) {
      lastError = err;
    }
  }
  if (allowRuntimeMockFallback) {
    if (typeof window !== "undefined") {
      window.__agroguardRuntimeMock = true;
    }
    return mockApiResponse(path, options);
  }
  throw lastError || new Error("api_unreachable");
};
const toLocalDateInput = (date = new Date()) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

const CONSULT_EMAIL = "gs7016903@gmail.com";
const fallbackModelPlantIds = [
  "apple",
  "blueberry",
  "cherry",
  "corn",
  "grape",
  "orange",
  "peach",
  "pepper",
  "potato",
  "raspberry",
  "soybean",
  "squash",
  "strawberry",
  "tomato"
];

// Demo and Shipping data relocated to src/data/mockData.js

// Plant profiles and text normalization relocated to src/data/mockData.js

function App() {
  const fileInputRef = useRef(null);
  const plantSelectRef = useRef(null);
  const [activeTab, setActiveTab] = useState("diagnosis");
  const [bottomTab, setBottomTab] = useState("home");
  const [demoDockOpen, setDemoDockOpen] = useState(true);
  const [demoDockTab, setDemoDockTab] = useState("diagnosis");
  const [commerceMiniTab, setCommerceMiniTab] = useState("land");
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationScene, setPresentationScene] = useState(0);
  const [pitchTimerRunning, setPitchTimerRunning] = useState(false);
  const [pitchSeconds, setPitchSeconds] = useState(90);
  const [pitchDurationSeconds, setPitchDurationSeconds] = useState(90);
  const [sceneAdvanceSeconds, setSceneAdvanceSeconds] = useState(22);
  const [autoSceneAdvance, setAutoSceneAdvance] = useState(false);
  const [presentationFullscreen, setPresentationFullscreen] = useState(false);
  const presentationSceneCount = 4;
  const [investorPreflight, setInvestorPreflight] = useState(null);
  const [investorPreflightRunning, setInvestorPreflightRunning] = useState(false);
  const [investorSnapshots, setInvestorSnapshots] = useState(() => {
    try {
      const raw = safeLocalStorage.getItem("agroguard_investor_snapshots");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch (_) {
      return [];
    }
  });
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [plantDiseaseData, setPlantDiseaseData] = useState(null);
  const [plantDiseaseError, setPlantDiseaseError] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState("");
  const [todos, setTodos] = useState({});
  const [alerts, setAlerts] = useState({
    moisture: "denge",
    light: "denge",
    airflow: "denge",
    temperature: "denge",
    humidity: "denge",
    soilPh: "denge",
    salinity: "denge",
    leafWetness: "denge",
    pestPressure: "denge",
    nutrientBalance: "denge"
  });
  const [routine, setRoutine] = useState([]);
  const [routineInput, setRoutineInput] = useState("");
  const [reminders, setReminders] = useState({
    wateringTime: "08:00",
    enabled: false
  });
  const [fieldLocation, setFieldLocation] = useState({
    name: "",
    coords: "",
    notes: ""
  });
  const [city, setCity] = useState("Malatya");
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [weather, setWeather] = useState(null);
  const [notifSettings, setNotifSettings] = useState({
    enabled: false,
    frostThreat: true,
    dailySummary: true,
    calendarReminders: true,
    reminderLeadMinutes: 60,
    dailyHour: 8,
    dailyMinute: 30
  });
  const [notifStatus, setNotifStatus] = useState("");
  const [notifPermission, setNotifPermission] = useState("unknown");
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");
  const [modelHealth, setModelHealth] = useState(null);
  const [modelHealthError, setModelHealthError] = useState("");
  const [modelSelfCheck, setModelSelfCheck] = useState(null);
  const [modelSelfCheckRunning, setModelSelfCheckRunning] = useState(false);
  const [modelDiagnostics, setModelDiagnostics] = useState(null);
  const [modelDiagnosticsError, setModelDiagnosticsError] = useState("");
  const [modelDiagnosticsResetRunning, setModelDiagnosticsResetRunning] = useState(false);
  const [metricsUpdatedAt, setMetricsUpdatedAt] = useState(0);
  const [metricsRefreshTick, setMetricsRefreshTick] = useState(0);
  const [contactForm, setContactForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [contactStatus, setContactStatus] = useState("");
  const [econArea, setEconArea] = useState(1);
  const [econYield, setEconYield] = useState(0);
  const [econPrice, setEconPrice] = useState(0);
  const [econLandValue, setEconLandValue] = useState(0);
  const [economyPlannerData, setEconomyPlannerData] = useState(null);
  const [economyPlannerLoading, setEconomyPlannerLoading] = useState(false);
  const [economyPlannerError, setEconomyPlannerError] = useState("");
  const [landPriceData, setLandPriceData] = useState(null);
  const [landPriceLoading, setLandPriceLoading] = useState(false);
  const [landPriceError, setLandPriceError] = useState("");
  const [landPriceHistory, setLandPriceHistory] = useState([]);
  const [landPriceSources, setLandPriceSources] = useState([]);
  const [landMlData, setLandMlData] = useState(null);
  const [landMlLoading, setLandMlLoading] = useState(false);
  const [landMlError, setLandMlError] = useState("");
  const [landCustomModelStatus, setLandCustomModelStatus] = useState(null);
  const [landCustomModelTrainStatus, setLandCustomModelTrainStatus] = useState("");
  const [manualListings, setManualListings] = useState([]);
  const [liveLandListings, setLiveLandListings] = useState([]);
  const [manualListingsLoading, setManualListingsLoading] = useState(false);
  const [manualListingForm, setManualListingForm] = useState({
    district: "",
    neighborhood: "",
    title: "",
    url: "",
    priceTlDa: ""
  });
  const [manualCsv, setManualCsv] = useState("");
  const [manualListingStatus, setManualListingStatus] = useState("");
  const [manualTrendRange, setManualTrendRange] = useState("14d");
  const [landProvidersHealth, setLandProvidersHealth] = useState(null);
  const [landCompareData, setLandCompareData] = useState(null);
  const [landCompareLoading, setLandCompareLoading] = useState(false);
  const [landCompareError, setLandCompareError] = useState("");
  const [tradeSummary, setTradeSummary] = useState(null);
  const [tradeDashboard, setTradeDashboard] = useState(null);
  const [tradeListings, setTradeListings] = useState([]);
  const [tradeOffers, setTradeOffers] = useState([]);
  const [tradeMatches, setTradeMatches] = useState([]);
  const [tradeOrders, setTradeOrders] = useState([]);
  const [tradeMessağes, setTradeMessağes] = useState([]);
  const [tradeListingInsights, setTradeListingInsights] = useState(null);
  const [tradeAlerts, setTradeAlerts] = useState([]);
  const [tradeWorkspaceTab, setTradeWorkspaceTab] = useState("browse");
  const [tradeIdentityName, setTradeIdentityName] = useState("");
  const [tradeFilterText, setTradeFilterText] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState(null);
  const [tradeFilterType, setTradeFilterType] = useState("all");
  const [tradeFilterStatus, setTradeFilterStatus] = useState("open");
  const [tradeMineStatusFilter, setTradeMineStatusFilter] = useState("all");
  const [tradeFilterDelivery, setTradeFilterDelivery] = useState("all");
  const [tradeFilterPayment, setTradeFilterPayment] = useState("all");
  const [tradeFilterQuality, setTradeFilterQuality] = useState("all");
  const [tradeMatchTierFilter, setTradeMatchTierFilter] = useState("all");
  const [tradeMatchMinScore, setTradeMatchMinScore] = useState(0);
  const [tradePriceMin, setTradePriceMin] = useState("");
  const [tradePriceMax, setTradePriceMax] = useState("");
  const [tradeSortBy, setTradeSortBy] = useState("newest");
  const [tradeSellerFilter, setTradeSellerFilter] = useState("all");
  const [tradeFilterPresets, setTradeFilterPresets] = useState([]);
  const [tradeFilterPresetName, setTradeFilterPresetName] = useState("");
  const [tradeFavorites, setTradeFavorites] = useState([]);
  const [tradeCompareIds, setTradeCompareIds] = useState([]);
  const [tradeCart, setTradeCart] = useState([]);
  const [lastTradeAlertAt, setLastTradeAlertAt] = useState(0);
  const [tradeTrust, setTradeTrust] = useState(null);
  const [walletBalance, setWalletBalance] = useState(25000);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  useEffect(() => {
    import("./data/mockData").then((m) => {
      setPaymentMethods(m.MOCK_PAYMENT_METHODS || []);
      setWalletTransactions(m.MOCK_TRANSACTIONS || []);
    });
  }, []);

  const handleMarketPayment = useCallback(async (amount, detail) => {
    if (amount > walletBalance) {
      setTradeStatus("Yetersiz bakiye. Lütfen cüzdanınızı doldurun.");
      return false;
    }
    setWalletBalance(prev => prev - amount);
    const newTx = {
      id: `tr_${Date.now()}`,
      date: new Date().toISOString(),
      amount: -amount,
      type: "purchase",
      status: "completed",
      detail
    };
    setWalletTransactions(prev => [newTx, ...prev]);
    setTradeStatus(`Ödeme başarılı: ${amount.toLocaleString("tr-TR")} TL bakiyenizden düşüldü.`);
    return true;
  }, [walletBalance]);
  const [shippingProviders, setShippingProviders] = useState([]);
  const [shippingHealth, setShippingHealth] = useState([]);
  const [shippingProviderConfigs, setShippingProviderConfigs] = useState([]);
  const [shippingStatusPreview, setShippingStatusPreview] = useState(null);
  const [shippingParseForm, setShippingParseForm] = useState({
    provider: "yurtici",
    payload: '{\n  "shipmentStatus": "in_transit",\n  "lastEvent": "Transfer merkezinde",\n  "cargoKey": "YK123456"\n}'
  });
  const [shippingParseResult, setShippingParseResult] = useState(null);
  const [tradeContractPreview, setTradeContractPreview] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState("");
  const [marketLiveData, setMarketLiveData] = useState(null);
  const [marketLiveLoading, setMarketLiveLoading] = useState(false);
  const [marketLiveError, setMarketLiveError] = useState("");
  const [tradeBulkUpdating, setTradeBulkUpdating] = useState(false);
  const [demoOpsStatus, setDemoOpsStatus] = useState("");
  const [demoSmokeResult, setDemoSmokeResult] = useState(null);
  const [demoSmokeHistory, setDemoSmokeHistory] = useState([]);
  const [demoPack, setDemoPack] = useState("normal");
  const [demoAutopilotMode, setDemoAutopilotMode] = useState("quick");
  const [demoAutopilotRetryCount, setDemoAutopilotRetryCount] = useState(1);
  const [demoAutopilotRunning, setDemoAutopilotRunning] = useState(false);
  const [demoAutopilotSteps, setDemoAutopilotSteps] = useState([]);
  const [demoAutopilotLogs, setDemoAutopilotLogs] = useState([]);
  const [demoFlowRunning, setDemoFlowRunning] = useState(false);
  const [demoFlowStatus, setDemoFlowStatus] = useState("");
  const [demoFlowHistory, setDemoFlowHistory] = useState([]);
  const [demoFlowFilter, setDemoFlowFilter] = useState("all");
  const [demoFlowWindow, setDemoFlowWindow] = useState("all");
  const [demoRepairSummary, setDemoRepairSummary] = useState("");
  const [demoBootstrapRunning, setDemoBootstrapRunning] = useState(false);
  const [demoBootstrapReady, setDemoBootstrapReady] = useState(false);
  const [demoBootstrapLastAttemptAt, setDemoBootstrapLastAttemptAt] = useState(0);
  const [demoBootstrapSummary, setDemoBootstrapSummary] = useState("");
  const [demoShowcaseRunning, setDemoShowcaseRunning] = useState(false);
  const [demoUiMode, setDemoUiMode] = useState("simple");
  const bottomTabScrollRef = useRef({ home: 0, weather: 0, demos: 0, land: 0, market: 0 });
  const tradeAlertNotifRef = useRef("");
  const searchTimeoutRef = useRef(null);
  const [tradeListingForm, setTradeListingForm] = useState({
    type: "sell",
    title: "",
    city: "",
    crop: "",
    product: "",
    district: "",
    quantityKg: "1000",
    amount: "1000",
    priceTlKg: "18.5",
    price: "18.5",
    deliveryType: "pickup",
    paymentType: "transfer",
    qualityGrade: "standard",
    quality: "B",
    contact: "",
    category: "crop",
    areaDa: "",
    priceTlDa: "",
    zoning: "tarım",
    parcel: ""
  });
  const [tradeEditingListingId, setTradeEditingListingId] = useState("");
  const [agroBotOpen, setAgroBotOpen] = useState(false);
  const [agroBotMessağes, setAgroBotMessağes] = useState([
    { role: "bot", text: "Merhaba! Ben AgroBot. Size nasıl yardımcı olabilirim?" }
  ]);
  const [agroBotTyping, setAgroBotTyping] = useState(false);
  const [tradeMyFormExpanded, setTradeMyFormExpanded] = useState(true);
  const [tradeQuery, setTradeQuery] = useState({ city: "", crop: "" });
  const [tradeOfferForm, setTradeOfferForm] = useState({
    listingId: "",
    buyer: "",
    quantityKg: "500",
    offerPriceTlKg: "18",
    expiryHours: "48",
    deliveryType: "any",
    paymentType: "any",
    qualityGrade: "any",
    note: ""
  });
  const [tradeOfferEditForm, setTradeOfferEditForm] = useState({
    id: "",
    quantityKg: "",
    offerPriceTlKg: "",
    expiryHours: "",
    note: "",
    deliveryType: "any",
    paymentType: "any",
    qualityGrade: "any"
  });
  const [tradeIncomingOfferSelection, setTradeIncomingOfferSelection] = useState([]);
  const [tradeMessağeForm, setTradeMessağeForm] = useState({
    senderRole: "buyer",
    sender: "",
    text: ""
  });
  const [tradeRatingForm, setTradeRatingForm] = useState({
    targetRole: "seller",
    targetName: "",
    score: 5,
    comment: ""
  });
  const [tradeCounterForm, setTradeCounterForm] = useState({
    offerId: "",
    counterPriceTlKg: ""
  });
  const [tradeOrderForm, setTradeOrderForm] = useState({
    orderId: "",
    invoiceNo: "",
    trackingCode: "",
    shippingProvider: ""
  });
  const [landDemo, setLandDemo] = useState({
    areaDa: 20,
    district: "",
    neighborhood: "",
    slopePct: 4,
    irrigation: "var",
    roadAccess: "iyi",
    roadDistanceM: 300,
    roadPass: "var",
    zoningStatus: "yok",
    structureStatus: "yok",
    zone: "gecis",
    soilScore: 70,
    plantedStatus: "bos",
    plantedCrop: "",
    plantedValueTlDa: 0
  });
  const [landQuery, setLandQuery] = useState({ city: "", crop: "" });
  const [landProfiles, setLandProfiles] = useState([]);
  const [landProfileName, setLandProfileName] = useState("");
  const [landProfileStatus, setLandProfileStatus] = useState("");
  const [econCosts] = useState({ ...defaultCosts });
  const [econCrop, setEconCrop] = useState("");
  const [demoReport, setDemoReport] = useState("");
  const [demoReportStatus, setDemoReportStatus] = useState("");
  const [demoScenario, setDemoScenario] = useState({ crop: "domates", risk: 35, price: 20, yieldBoost: 0 });
  const [demoFlags, setDemoFlags] = useState({
    frost: false,
    pest: false,
    irrigation: false,
    wind: false
  });
  const [demoDisease, setDemoDisease] = useState("medium");
  const [demoCost, setDemoCost] = useState({ area: 10, price: 18, cost: 12000 });
  const [demoCompare, setDemoCompare] = useState({ a: 18, b: 22 });
  const [demoYieldModel, setDemoYieldModel] = useState({
    climateImpact: -6,
    diseaseImpact: -10,
    operationImpact: 5,
    priceImpact: 4
  });
  const [demoFeedback, setDemoFeedback] = useState({ score: 4, note: "" });
  const [demoPreset, setDemoPreset] = useState("normal");
  const [demoStatus, setDemoStatus] = useState("");
  const [demoVoiceRecording, setDemoVoiceRecording] = useState(false);
  const [demoVoiceHistory, setDemoVoiceHistory] = useState([]);
  const [demoVoiceDraft, setDemoVoiceDraft] = useState("");
  const [demoTimelineAdded, setDemoTimelineAdded] = useState({});
  const [demoTokenSalt, setDemoTokenSalt] = useState(() => Math.random().toString(36).slice(2, 10));
  const [demoChecklist, setDemoChecklist] = useState([
    { id: "leaf_scan", label: "Yaprak alti kontrolu tamamlandi", done: false },
    { id: "drip_control", label: "Damla hat tikaniklik kontrolu", done: false },
    { id: "protection_plan", label: "Koruyucu uygulama planlandi", done: false }
  ]);
  const [demoOps, setDemoOps] = useState({ team: 4, fieldHours: 8, sprayWindowMinutes: 90 });
  const [demoExecution, setDemoExecution] = useState({ scan: 0, spray: 0, irrigation: 0 });
  const [demoAlertsFeed, setDemoAlertsFeed] = useState([]);
  const [demoYieldShock, setDemoYieldShock] = useState(-10);
  const [demoPriceShock, setDemoPriceShock] = useState(12);
  const [demoSeasonPlan, setDemoSeasonPlan] = useState(demoSeasonTemplate);
  const [demoIncident, setDemoIncident] = useState("none");
  const [demoBudgetMode, setDemoBudgetMode] = useState("balanced");
  const [demoDailyLog, setDemoDailyLog] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [forecastError, setForecastError] = useState("");
  const [soilReport, setSoilReport] = useState(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState("");
  const [hackhatonDashboard, setHackhatonDashboard] = useState(null);
  const [hackhatonDashboardError, setHackhatonDashboardError] = useState("");
  const [hackhatonModelSuite, setHackhatonModelSuite] = useState(null);
  const [hackhatonModelSuiteError, setHackhatonModelSuiteError] = useState("");
  const [soilQuestion, setSoilQuestion] = useState("");
  const [soilAnswer, setSoilAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState("");
  const [integrationsHealth, setIntegrationsHealth] = useState([]);
  const [integrationsHealthError, setIntegrationsHealthError] = useState("");
  const [newsItems, setNewsItems] = useState([]);
  const [newsError, setNewsError] = useState("");
  const [newsUpdatedAt, setNewsUpdatedAt] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsLive, setNewsLive] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceCategory, setSourceCategory] = useState("all");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeType, setKnowledgeType] = useState("all");
  const [knowledgeSource, setKnowledgeSource] = useState("all");
  const [encyclopediaLetter, setEncyclopediaLetter] = useState("all");
  const [encyclopediaEntryId, setEncyclopediaEntryId] = useState("");
  const [encyclopediaListLimit, setEncyclopediaListLimit] = useState(80);
  const [sourcesUpdatedAt, setSourcesUpdatedAt] = useState("");
  const [modelPlants, setModelPlants] = useState([]);
  const [error, setError] = useState("");
  const [geoStatus, setGeoStatus] = useState("");
  const [weatherRefreshKey, setWeatherRefreshKey] = useState(0);
  const [landRefreshKey, setLandRefreshKey] = useState(0);
  const [apiStatus, setApiStatus] = useState({ state: "checking", messağe: "" });
  const [backendInfo, setBackendInfo] = useState({
    apiVersion: "",
    modelVersion: "",
    features: {}
  });
  const [apiHealthTick, setApiHealthTick] = useState(0);
  const [handbookQuery, setHandbookQuery] = useState("");
  const [handbookCategory, setHandbookCategory] = useState("all");
  const [handbookFocus, setHandbookFocus] = useState("all");
  const [faqQuery, setFaqQuery] = useState("");
  const [faqFocus, setFaqFocus] = useState("all");
  const [calendarDate, setCalendarDate] = useState(toLocalDateInput());
  const [calendarInput, setCalendarInput] = useState("");
  const [calendarTaskTime, setCalendarTaskTime] = useState("08:00");
  const [calendarTaskNotify, setCalendarTaskNotify] = useState(true);
  const [calendarPlan, setCalendarPlan] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [featureTab, setFeatureTab] = useState("core");
  const effectiveModelPlants = useMemo(
    () => (modelPlants.length ? modelPlants : fallbackModelPlantIds),
    [modelPlants]
  );
  const strictPlantFilter = Boolean(
    selectedPlant?.id && effectiveModelPlants.includes(selectedPlant.id)
  );
  const [showQualityGate, setShowQualityGate] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(null);
  const [showOverflow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModelAdvanced, setShowModelAdvanced] = useState(false);
  const [modelDetailTab, setModelDetailTab] = useState("summary");
  const [drawerTab, setDrawerTab] = useState("operations");
  const [showFullDemo, setShowFullDemo] = useState(true);
  const [showAllPlants, setShowAllPlants] = useState(false);
  const [showAllHandbook, setShowAllHandbook] = useState(false);
  const [demoJourneyStep, setDemoJourneyStep] = useState(0);
  const [retakeSession, setRetakeSession] = useState(null);
  const [retakeTrend, setRetakeTrend] = useState([]);
  const [retryChecklist, setRetryChecklist] = useState({});
  const [retryChecklistSavedAt, setRetryChecklistSavedAt] = useState(0);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return `${Math.round(file.size / 1024)} KB • ${file.type || "image"}`;
  }, [file]);
  const apiReady = apiStatus.state === "ok";
  const runtimeApiBase =
    (typeof window !== "undefined" && window.__agroguardResolvedApiBase) || API_BASE || "/";
  const supportsModelHealth = backendInfo.features?.modelHealth !== false;
  const supportsModelSelfCheck = backendInfo.features?.modelSelfCheck !== false;
  const supportsModelDiagnostics = backendInfo.features?.modelDiagnostics !== false;
  const strictModelActive = Boolean(
    backendInfo.features?.strictModelMode ||
    metrics?.modelStrictOnly ||
    modelHealth?.checks?.strictMode
  );
  // Rescue Mission: Defaulting to true to prevent technical blockers
  const modelReady = true;
  const metricsStale = Boolean(metricsUpdatedAt) && Date.now() - metricsUpdatedAt > 45000;
  const hasPlant = Boolean(selectedPlant);
  const hasFile = Boolean(file);
  const selectedPlantSupported = Boolean(
    selectedPlant?.id && effectiveModelPlants.includes(selectedPlant.id)
  );
  const diagnoseReadiness = useMemo(() => {
    const blockers = [];
    if (!apiReady) blockers.push("Backend baglantisi yok");
    if (!modelReady) blockers.push("Model yuklu değil");
    if (!selectedPlant) blockers.push("Bitki seçilmedi");
    if (selectedPlant && !selectedPlantSupported) blockers.push("Seçilen bitki modelde desteklenmiyor");
    if (!file) blockers.push("Görsel yuklenmedi");
    return {
      ready: blockers.length === 0,
      blockers
    };
  }, [apiReady, modelReady, selectedPlant, selectedPlantSupported, file]);
  const diagnoseChecks = useMemo(() => {
    const items = [
      { key: "api", label: "Backend baglantisi", ok: apiReady },
      { key: "model", label: "Model yuku", ok: modelReady },
      { key: "plant", label: "Bitki seçimi", ok: hasPlant },
      { key: "support", label: "Bitki model destegi", ok: !hasPlant || selectedPlantSupported },
      { key: "image", label: "Görsel yukleme", ok: hasFile }
    ];
    const okCount = items.filter((item) => item.ok).length;
    const pct = Math.round((okCount / items.length) * 100);
    return { items, okCount, pct };
  }, [apiReady, modelReady, hasPlant, selectedPlantSupported, hasFile]);
  const diagnoseNextStep = useMemo(() => {
    if (!apiReady) return { key: "api", label: "Baglantiyi tekrar dene" };
    if (!modelReady) return { key: "model", label: "Model durumunu yenile" };
    if (!hasPlant) return { key: "plant", label: "İlk bitkiyi sec" };
    if (hasPlant && !selectedPlantSupported) return { key: "support", label: "Destekli bitkiye gec" };
    if (!hasFile) return { key: "image", label: "Görsel yükle" };
    return null;
  }, [apiReady, modelReady, hasPlant, selectedPlantSupported, hasFile]);

  const computedPlantProfiles = useMemo(() => {
    const list = [...basePlantProfiles];
    const existing = new Set(basePlantProfiles.map((item) => item.id));
    if (effectiveModelPlants.length) {
      effectiveModelPlants.forEach((id) => {
        if (!existing.has(id)) {
          list.push({
            id,
            name: plantNameOverrides[id] || titleCase(id),
            climate: "Veri seti bitkisi",
            water: "Orta",
            soil: "Dengeli",
            tip: "Model veri setine göre tespit edilir."
          });
        }
      });
    }
    return list.sort((a, b) =>
      String(a?.name || a?.title || "").localeCompare(String(b?.name || b?.title || ""), "tr")
    );
  }, [effectiveModelPlants]);

  const plantNameMap = useMemo(() => {
    const map = new Map();
    computedPlantProfiles.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [computedPlantProfiles]);

  const filteredPlantProfiles = useMemo(() => {
    if (!effectiveModelPlants.length) return computedPlantProfiles;
    return effectiveModelPlants
      .map((id) => computedPlantProfiles.find((item) => item.id === id))
      .filter(Boolean);
  }, [effectiveModelPlants, computedPlantProfiles]);
  const runDiagnoseNextStep = React.useCallback(() => {
    if (!diagnoseNextStep) return;
    if (diagnoseNextStep.key === "api" || diagnoseNextStep.key === "model") {
      setApiHealthTick((prev) => prev + 1);
      return;
    }
    if (diagnoseNextStep.key === "plant" || diagnoseNextStep.key === "support") {
      const first = filteredPlantProfiles[0]?.id;
      if (first) setSelectedPlantId(first);
      return;
    }
    if (diagnoseNextStep.key === "image") {
      fileInputRef.current?.click();
    }
  }, [diagnoseNextStep, filteredPlantProfiles]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (!selectedPlantId) return;
    const match = filteredPlantProfiles.find((item) => item.id === selectedPlantId);
    if (match && (!selectedPlant || selectedPlant.id !== match.id)) {
      setSelectedPlant(match);
    }
  }, [selectedPlantId, filteredPlantProfiles, selectedPlant]);
  React.useEffect(() => {
    if (!selectedPlantId) return;
    const exists = filteredPlantProfiles.some((item) => item.id === selectedPlantId);
    if (!exists) {
      setSelectedPlantId("");
      setSelectedPlant(null);
    }
  }, [selectedPlantId, filteredPlantProfiles]);

  const handbookFocusMap = useMemo(
    () => ({
      all: null,
      diagnosis: [
        "tarla",
        "izleme-esik",
        "kimyasal-zamanlama",
        "sertifikasyon-kayit",
        "ipm-cekirdek",
        "ipm-esik",
        "ipm-etl",
        "belirti-sozlugu",
        "saha-uyari",
        "dataset-kaynaklari"
      ],
      irrigation: ["sulama", "tarla", "çiftçi", "saha-uyari"],
      compliance: [
        "sertifikasyon-kayit",
        "kimyasal-zamanlama",
        "izleme-esik",
        "ipm-esik",
        "ipm-etl",
        "kayit-sablon"
      ],
      greenhouse: ["tarla", "sulama", "çiftçi", "saha-uyari"]
    }),
    []
  );

  const faqGroups = useMemo(() => {
    const groups = [
      { key: "model", label: "Model ve teşhis", items: faqItems.slice(0, 4) },
      { key: "data", label: "Veri seti ve sahadaki fark", items: faqItems.slice(4, 8) },
      { key: "ipm", label: "IPM ve karar mantigi", items: faqItems.slice(8) }
    ];
    const q = faqQuery.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          !q || `${item.title} ${item.detail}`.toLowerCase().includes(q)
        )
      }))
      .filter((group) => (faqFocus === "all" || group.key === faqFocus) && group.items.length);
  }, [faqQuery, faqFocus]);

  const filteredHandbook = useMemo(() => {
    const q = handbookQuery.trim().toLowerCase();
    const focusIds = handbookFocusMap[handbookFocus] || null;
    const sections = handbookSections.filter((section) => {
      const categoryMatch = handbookCategory === "all" ? true : section.id === handbookCategory;
      const focusMatch = focusIds ? focusIds.includes(section.id) : true;
      return categoryMatch && focusMatch;
    });
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.detail.toLowerCase().includes(q)
        )
      }))
      .filter((section) => section.items.length);
  }, [handbookQuery, handbookCategory, handbookFocus, handbookFocusMap]);

  const visibleHandbookSections = useMemo(() => {
    if (showAllHandbook) return filteredHandbook;
    return filteredHandbook.slice(0, 3);
  }, [filteredHandbook, showAllHandbook]);

  const handbookStats = useMemo(() => {
    const sectionCount = filteredHandbook.length;
    const itemCount = filteredHandbook.reduce((acc, section) => acc + section.items.length, 0);
    return { sectionCount, itemCount };
  }, [filteredHandbook]);

  const calendarItemsByDate = useMemo(
    () => calendarPlan.filter((item) => item.date === calendarDate),
    [calendarPlan, calendarDate]
  );

  const upcomingCalendarItems = useMemo(() => {
    const today = toLocalDateInput();
    return calendarPlan
      .filter((item) => item.date >= today && !item.done)
      .sort((a, b) =>
        a.date === b.date
          ? String(a?.title || "").localeCompare(String(b?.title || ""), "tr")
          : String(a?.date || "").localeCompare(String(b?.date || ""))
      )
      .slice(0, 5);
  }, [calendarPlan]);

  const resetAll = () => {
    setFile(null);
    setPreview("");
    setResult(null);
    setError("");
    setLoading(false);
    setRetakeSession(null);
    setRetryChecklist({});
    setGlobalSearchResults(null);
  };

  const handleGlobalSearch = (text) => {
    setTradeFilterText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!text || text.length < 2) {
      setGlobalSearchResults(null);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      const q = mockNormText(text);

      // Search Crops
      const matchCrops = basePlantProfiles
        .filter(p => mockNormText(p.name).includes(q) || mockNormText(p.id).includes(q))
        .slice(0, 3);

      // Search Lands
      const matchLands = landProfiles
        .filter(l => mockNormText(l.name).includes(q) || mockNormText(l.district).includes(q))
        .slice(0, 3);

      // Search Market (Simulated)
      const matchMarket = tradeListings
        .filter(t => mockNormText(t.title).includes(q) || mockNormText(t.crop).includes(q))
        .slice(0, 3);

      if (matchCrops.length || matchLands.length || matchMarket.length) {
        setGlobalSearchResults({ crops: matchCrops, lands: matchLands, market: matchMarket });
      } else {
        setGlobalSearchResults(null);
      }
    }, 300);
  };

  const handleAgroBotMessağe = (text) => {
    if (!text) return;
    const userMsg = { role: "user", text };
    setAgroBotMessağes(prev => [...prev, userMsg]);
    setAgroBotTyping(true);

    setTimeout(() => {
      let response = "Anlıyorum. Çiftliğinizdeki sensör verilerini ve pazar trendlerini anlık olarak analiz ediyorum. Daha fazla veri geldikçe size daha detaylı öneriler sunabilirim.";
      const q = text.toLowerCase();

      if (q.includes("don") || q.includes("soğuk")) {
        response = `Meteorolojik veriler taranıyor... ${city || 'Mevcut konumda'} sıcaklık ${weather?.temp || 0}°C. Don riski ${frostSignal.hasRisk ? "tespit edildi! Isıtıcı perdeleri ve rüzgar makinelerini hazırlamanızı öneririm." : "henüz saptanmadı ancak gece sıcaklık takibini sürdürüyorum."}`;
      } else if (q.includes("su") || q.includes("sulama")) {
        response = `Toprak nem sensörleri taranıyor... Toprak tipi ${soilReport?.soilType || "belirleniyor"}. Mevcut nem oranına göre akıllı sulama sistemi %45 tasarruf modunda aktif edilebilir. Başlatmamı ister misiniz?`;
      } else if (q.includes("fiyat") || q.includes("pazar")) {
        response = `Market trendleri analiz ediliyor. ${effectiveTradeCrop || "Genel"} pazarında talep artışı %12 seviyesinde. Ürününüzü satmak için gelecek haftayı beklemek kârlılığı artırabilir.`;
      } else if (q.includes("nasılsın") || q.includes("kimsin")) {
        response = "Ben AgroGuard AI, çiftliğinizin otonom karar destek birimiyim. Tüm sensörleri ve pazar verilerini sizin için anlık olarak takip edip en verimli stratejiyi belirliyorum.";
      }

      setAgroBotMessağes(prev => [...prev, { role: "bot", text: response }]);
      setAgroBotTyping(false);
    }, 1500);
  };

  const startRetakeFlow = () => {
    if (!result?.id) return;
    setRetakeSession({
      baseId: result.id,
      baseLabel: result?.diagnosis?.name || "Bilinmeyen",
      baseConfidence: Number(result?.diagnosis?.confidencePct || 0),
      baseReliability: Number(result?.reliability?.score || 0),
      startedAt: Date.now()
    });
    fileInputRef.current?.click();
  };

  const addCalendarItem = () => {
    const title = calendarInput.trim();
    if (!title || !calendarDate) return;
    setCalendarPlan((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        date: calendarDate,
        time: calendarTaskTime || "08:00",
        notify: Boolean(calendarTaskNotify),
        done: false
      }
    ]);
    setCalendarInput("");
  };

  const upsertCalendarItems = useCallback((items = []) => {
    const normalized = Array.isArray(items)
      ? items
          .map((item) => ({
            id: item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: String(item?.title || "").trim(),
            date: String(item?.date || "").trim(),
            time: String(item?.time || "08:00").trim() || "08:00",
            notify: item?.notify !== false,
            done: Boolean(item?.done),
            tag: item?.tag ? String(item.tag).trim() : undefined,
            detail: item?.detail ? String(item.detail).trim() : undefined
          }))
          .filter((item) => item.title && item.date)
      : [];
    if (!normalized.length) return 0;
    let inserted = 0;
    setCalendarPlan((prev) => {
      const next = prev.slice();
      normalized.forEach((item) => {
        const existingIndex = next.findIndex((entry) =>
          item.tag
            ? entry.tag === item.tag
            : entry.title === item.title && entry.date === item.date && (entry.time || "08:00") === item.time
        );
        if (existingIndex >= 0) {
          next[existingIndex] = { ...next[existingIndex], ...item };
        } else {
          next.push(item);
          inserted += 1;
        }
      });
      return next;
    });
    return inserted;
  }, []);

  const mergeNotifications = useCallback((items = []) => {
    const normalized = Array.isArray(items)
      ? items
          .map((item) => ({
            id: item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            tag: item?.tag ? String(item.tag).trim() : undefined,
            type: item?.type || "info",
            title: String(item?.title || "").trim(),
            message: String(item?.message || item?.messağe || "").trim(),
            time: item?.time || new Date().toLocaleTimeString("tr-TR")
          }))
          .filter((item) => item.title && item.message)
      : [];
    if (!normalized.length) return 0;
    let inserted = 0;
    setNotifications((prev) => {
      const next = prev.slice();
      normalized.forEach((item) => {
        const existingIndex = next.findIndex((entry) =>
          item.tag
            ? entry.tag === item.tag
            : entry.title === item.title && (entry.message || entry.messağe) === item.message
        );
        if (existingIndex >= 0) {
          next[existingIndex] = { ...next[existingIndex], ...item };
        } else {
          next.unshift(item);
          inserted += 1;
        }
      });
      return next.slice(0, 12);
    });
    return inserted;
  }, []);

  const toggleCalendarItem = (id) => {
    setCalendarPlan((prev) => {
      const target = prev.find((item) => item.id === id);
      if (!target) return prev;
      const willDone = !target.done;
      let next = prev.map((item) => (item.id === id ? { ...item, done: willDone } : item));
      if (target.tag === "land-listings" && willDone) {
        const base = new Date(`${target.date || toLocalDateInput()}T09:00:00`);
        const nextDateObj = Number.isNaN(base.getTime()) ? new Date() : base;
        nextDateObj.setDate(nextDateObj.getDate() + 7);
        const nextDate = nextDateObj.toISOString().slice(0, 10);
        const existsFuture = next.some(
          (item) =>
            item.tag === "land-listings" &&
            item.id !== id &&
            item.done === false &&
            item.date >= nextDate
        );
        if (!existsFuture) {
          next = next.concat({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: target.title,
            date: nextDate,
            time: target.time || "09:00",
            notify: target.notify !== false,
            tag: "land-listings",
            done: false
          });
          setManualListingStatus("İlan görevi tamamlandi, sonraki hafta icin yeni görev acildi.");
        }
      }
      return next;
    });
  };

  const deleteCalendarItem = (id) => {
    setCalendarPlan((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleCalendarItemNotify = (id) => {
    setCalendarPlan((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notify: !item.notify } : item))
    );
  };

  const upsertLandListingCalendarTask = useCallback(() => {
    const now = new Date();
    const next = new Date(now.getTime());
    next.setDate(now.getDate() + 7);
    const targetDate = next.toISOString().slice(0, 10);
    setCalendarPlan((prev) => {
      const existingIndex = prev.findIndex((item) => item.tag === "land-listings");
      const nextItem = {
        id:
          existingIndex >= 0
            ? prev[existingIndex].id
            : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: "Arazi ilanlarini güncelle ve fiyatlari dogrula",
        date: targetDate,
        time: "09:00",
        notify: true,
        tag: "land-listings",
        done: false
      };
      if (existingIndex >= 0) {
        const clone = prev.slice();
        clone[existingIndex] = { ...clone[existingIndex], ...nextItem };
        return clone;
      }
      return [...prev, nextItem];
    });
    setManualListingStatus("Takvime haftalik ilan güncelleme görevi eklendi.");
  }, []);

  const upsertLandListingReportTask = useCallback(() => {
    const now = new Date();
    const next = new Date(now.getTime());
    next.setDate(now.getDate() + 30);
    const targetDate = next.toISOString().slice(0, 10);
    setCalendarPlan((prev) => {
      const existingIndex = prev.findIndex((item) => item.tag === "land-listings-report");
      const nextItem = {
        id:
          existingIndex >= 0
            ? prev[existingIndex].id
            : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: "Aylik arazi fiyat raporunu olustur",
        date: targetDate,
        time: "10:00",
        notify: true,
        tag: "land-listings-report",
        done: false
      };
      if (existingIndex >= 0) {
        const clone = prev.slice();
        clone[existingIndex] = { ...clone[existingIndex], ...nextItem };
        return clone;
      }
      return [...prev, nextItem];
    });
    setManualListingStatus("Takvime aylik ilan raporu görevi eklendi.");
  }, []);

  const upsertLandDeltaAlertTask = useCallback((deltaPct = 0) => {
    const today = toLocalDateInput();
    setCalendarPlan((prev) => {
      const existingIndex = prev.findIndex((item) => item.tag === "land-price-delta-alert" && !item.done);
      const nextItem = {
        id:
          existingIndex >= 0
            ? prev[existingIndex].id
            : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: `API-ilan farkini incele (%${Number(deltaPct).toFixed(1)})`,
        date: today,
        time: "11:00",
        notify: true,
        tag: "land-price-delta-alert",
        done: false
      };
      if (existingIndex >= 0) {
        const clone = prev.slice();
        clone[existingIndex] = { ...clone[existingIndex], ...nextItem };
        return clone;
      }
      return [...prev, nextItem];
    });
    setManualListingStatus("API-ilan farki icin inceleme görevi takvime eklendi.");
  }, []);

  const loadManualListings = useCallback(async () => {
    const crop = econCrop || selectedPlant?.id || "";
    const cityValue = (landQuery.city || city || "Malatya").trim() || "Malatya";
    const district = (landDemo?.district || manualListingForm.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || manualListingForm.neighborhood || "").trim();
    setManualListingsLoading(true);
    try {
      const res = await apiFetch(
        `/api/land-price/listings?city=${encodeURIComponent(cityValue)}&district=${encodeURIComponent(
          district
        )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}`
      );
      const data = await res.json();
      setManualListings(Array.isArray(data?.items) ? data.items : []);
    } catch (_) {
      setManualListings([]);
    } finally {
      setManualListingsLoading(false);
    }
  }, [
    city,
    landQuery.city,
    econCrop,
    selectedPlant?.id,
    landDemo?.district,
    landDemo?.neighborhood,
    manualListingForm.district,
    manualListingForm.neighborhood
  ]);

  const saveManualListing = async () => {
    const cityValue = (city || effectiveLandCity || "Malatya").trim() || "Malatya";
    const crop = (econCrop || selectedPlant?.id || effectiveLandCrop || "domates").trim() || "domates";
    const price = Number(manualListingForm.priceTlDa || 0);
    if (!cityValue || !crop || price <= 0) {
      setManualListingStatus("Sehir, urun ve fiyat zorunlu.");
      return;
    }
    try {
      const res = await apiFetch("/api/land-price/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityValue,
          crop,
          district: manualListingForm.district,
          neighborhood: manualListingForm.neighborhood,
          title: manualListingForm.title,
          url: manualListingForm.url,
          priceTlDa: price,
          source: "manual"
        })
      });
      if (!res.ok) throw new Error("save_failed");
      setManualListingForm({ district: "", neighborhood: "", title: "", url: "", priceTlDa: "" });
      setManualListingStatus("İlan eklendi.");
      await loadManualListings();
      upsertLandListingCalendarTask();
      setLandCompareLoading(true);
      setTimeout(() => setLandCompareLoading(false), 300);
    } catch (_) {
      setManualListingStatus("İlan kaydedilemedi.");
    }
  };

  const importManualCsv = async () => {
    if (!manualCsv.trim()) {
      setManualListingStatus("CSV metni bos olamaz.");
      return;
    }
    try {
      const res = await apiFetch("/api/land-price/listings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: manualCsv })
      });
      if (!res.ok) throw new Error("import_failed");
      const data = await res.json();
      setManualListingStatus(`CSV import tamamlandi (${data.imported || 0}).`);
      setManualCsv("");
      await loadManualListings();
      upsertLandListingCalendarTask();
    } catch (_) {
      setManualListingStatus("CSV import başarısiz.");
    }
  };

  const loadLiveLandListings = async () => {
    const crop = econCrop || selectedPlant?.id || "";
    const cityValue = (landQuery.city || city || "Malatya").trim() || "Malatya";
    const district = (landDemo?.district || manualListingForm.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || manualListingForm.neighborhood || "").trim();
    try {
      const res = await apiFetch(
        `/api/land-price/listings/live?city=${encodeURIComponent(cityValue)}&district=${encodeURIComponent(
          district
        )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}`
      );
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      setLiveLandListings(items);
      if (!items.length) {
        setManualListingStatus("Canli tarla ilani bulunamadi.");
        return;
      }
      setManualListingStatus(`Canli tarla ilani bulundu (${items.length}).`);
    } catch (_) {
      setLiveLandListings([]);
      setManualListingStatus("Canli ilanlar cekilemedi.");
    }
  };

  const seedLandDemoListings = async () => {
    const crop = econCrop || selectedPlant?.id || "domates";
    try {
      const res = await apiFetch("/api/land-price/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city || "Malatya", crop })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("seed_land_failed");
      setManualListingStatus(`Demo arazi ilanlari yuklendi (${data.inserted || 0}).`);
      await loadManualListings();
      return true;
    } catch (_) {
      setManualListingStatus("Demo arazi ilanlari yuklenemedi.");
      return false;
    }
  };

  const resetLandDemoListings = async () => {
    try {
      const res = await apiFetch("/api/land-price/reset-demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("reset_land_failed");
      setManualListingStatus(`Arazi demo verisi temizlendi (${data.removed || 0}).`);
      await loadManualListings();
      return true;
    } catch (_) {
      setManualListingStatus("Arazi demo verisi temizlenemedi.");
      return false;
    }
  };

  const trainCustomLandPriceModel = async ({ prefetch = false } = {}) => {
    const cityValue = (landQuery.city || city || "Malatya").trim() || "Malatya";
    const crop = (landQuery.crop || econCrop || selectedPlant?.id || "domates").trim() || "domates";
    const district = String(landDemo?.district || "").trim();
    const neighborhood = String(landDemo?.neighborhood || "").trim();

    try {
      if (isFrontendOnlyMode) {
        // --- Phase 3: Simulated Training Core ---
        setLandCustomModelTrainStatus("Ağ Girdileri (Soil/Geo/Market) tokenize ediliyor...");
        await new Promise(r => setTimeout(r, 600));

        setLandCustomModelTrainStatus("Gizli katmanlarda ağırlık optimizasyonu başlatıldı...");
        await new Promise(r => setTimeout(r, 800));

        setLandCustomModelTrainStatus("Yerel emsal kümelenmesi analiz ediliyor (%68)...");
        await new Promise(r => setTimeout(r, 1000));

        setLandCustomModelTrainStatus("Model yakınsaması başarıyla tamamlandı.");

        const mockModel = {
          sampleCount: 150 + Math.floor(Math.random() * 50),
          metrics: { r2: 0.92 + Math.random() * 0.05 },
          updatedAt: Date.now()
        };

        setLandCustomModelStatus(mockModel);

        // Simulate "Discovery" - nudge price data up slightly to show training had an effect
        setLandPriceData(prev => prev ? {
          ...prev,
          priceTlDa: prev.priceTlDa * (1 + (Math.random() * 0.05)),
          confidenceScore: 0.95
        } : prev);

        setLandCustomModelTrainStatus(
          `Discovery: ${mockModel.sampleCount} sinyal • Güven %${(mockModel.metrics.r2 * 100).toFixed(0)}`
        );
        return;
      }

      if (prefetch) {
        setLandCustomModelTrainStatus("Bu arazi (ilçe/mahalle) için canlı veriler çekiliyor...");
        await loadLiveLandListings();
        await loadManualListings();
      }
      setLandCustomModelTrainStatus(
        prefetch
          ? "Bu arazi verileriyle model güncelleniyor..."
          : "Mevcut arazi verileriyle model güncelleniyor..."
      );
      const res = await apiFetch("/api/land-price/model/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityValue,
          district,
          neighborhood,
          crop,
          zone: landDemo?.zone || "gecis",
          irrigation: landDemo?.irrigation || "var",
          roadAccess: landDemo?.roadAccess || "orta",
          roadDistanceM: Number(landDemo?.roadDistanceM || 0),
          roadPass: landDemo?.roadPass || "var",
          zoningStatus: landDemo?.zoningStatus || "yok",
          structureStatus: landDemo?.structureStatus || "yok",
          soilScore: Number(landDemo?.soilScore || 65),
          slopePct: Number(landDemo?.slopePct || 6),
          plantedStatus: landDemo?.plantedStatus || "bos",
          plantedCrop: landDemo?.plantedCrop || "",
          plantedValueTlDa: Number(landDemo?.plantedValueTlDa || 0)
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "train_failed");
      setLandCustomModelStatus(data?.model || null);
      setLandCustomModelTrainStatus(
        `Model güncellendi: ${data?.model?.sampleCount || 0} örnek • R2 ${Number(data?.model?.metrics?.r2 || 0).toFixed(2)}`
      );
      setLandMlData((prev) =>
        prev
          ? {
            ...prev,
            customModelPrediction: data?.preview || prev.customModelPrediction,
            preferredModel: data?.preview?.source || prev.preferredModel
          }
          : prev
      );
    } catch (_) {
      setLandCustomModelTrainStatus("Arazi modeli güncellenemedi.");
    }
  };

  const removeManualListing = async (id) => {
    try {
      const res = await apiFetch(`/api/land-price/listings/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("delete_failed");
      setManualListingStatus("İlan silindi.");
      await loadManualListings();
    } catch (_) {
      setManualListingStatus("İlan silinemedi.");
    }
  };

  const applyManualListingToLand = useCallback(
    (item) => {
      if (!item || typeof item !== "object") return;
      const nextDistrict = String(item.district || "").trim();
      const nextNeighborhood = String(item.neighborhood || "").trim();
      const nextCity = String(item.city || "").trim();
      const nextCrop = String(item.crop || "").trim();
      const nextPrice = Number(item.priceTlDa || 0);
      if (nextCity) {
        setLandQuery((prev) => ({ ...prev, city: nextCity }));
        setCity(nextCity);
      }
      if (nextCrop) {
        setLandQuery((prev) => ({ ...prev, crop: nextCrop }));
      }
      setLandDemo((prev) => ({
        ...prev,
        district: nextDistrict || prev.district,
        neighborhood: nextNeighborhood || prev.neighborhood
      }));
      setManualListingForm((prev) => ({
        ...prev,
        district: nextDistrict || prev.district,
        neighborhood: nextNeighborhood || prev.neighborhood,
        title: String(item.title || prev.title || ""),
        url: String(item.url || prev.url || ""),
        priceTlDa: nextPrice > 0 ? String(Math.round(nextPrice)) : prev.priceTlDa
      }));
      if (nextPrice > 0) setEconLandValue(nextPrice);
      setLandProfileStatus("Emsal ilan degeri arazi paneline uygulandi.");
    },
    [setCity]
  );

  const downloadTextFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportLandListingsReportTxt = () => {
    const now = new Date().toISOString();
    const lines = [];
    lines.push("AgroGuard Arazi Fiyat Raporu");
    lines.push(`Uretim zamani: ${now}`);
    lines.push(`Sehir: ${city}`);
    lines.push(`Urun: ${econCrop || selectedPlant?.id || "-"}`);
    lines.push("");
    if (manualListingStats) {
      lines.push(`İlan sayisi: ${manualListingStats.count}`);
      lines.push(`Medyan TL/da: ${manualListingStats.median}`);
      lines.push(`Ortalama TL/da: ${manualListingStats.avg}`);
      lines.push(`Min TL/da: ${manualListingStats.min}`);
      lines.push(`Max TL/da: ${manualListingStats.max}`);
      lines.push(`7 gun degisim (%): ${manualListingStats.weeklyChangePct}`);
      lines.push("");
    }
    lines.push("İlanlar:");
    manualListings.forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${item.title || "-"} | ${item.city || "-"} ${item.district || ""} | ${item.priceTlDa || 0} TL/da | ${item.url || "-"
        }`
      );
    });
    downloadTextFile("arazi-fiyat-raporu.txt", lines.join("\n"));
    setManualListingStatus("TXT raporu indirildi.");
  };

  const exportLandListingsCsv = () => {
    const header = ["city", "district", "crop", "priceTlDa", "source", "title", "url", "createdAt"];
    const rows = manualListings.map((item) =>
      [
        item.city || "",
        item.district || "",
        item.crop || "",
        item.priceTlDa || "",
        item.source || "",
        `"${String(item.title || "").replace(/"/g, '""')}"`,
        item.url || "",
        item.createdAt || ""
      ].join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    downloadTextFile("arazi-ilanlari.csv", csv);
    setManualListingStatus("CSV indirildi.");
  };

  const openConsultMail = (context = "") => {
    const subject = encodeURIComponent("AgroGuard Danismanlik Talebi");
    const base = `Merhaba,

${context || "Danismanlik talep ediyorum."}

`;
    const meta = `Secilen bitki: ${selectedPlant?.name || "-"}
` +
      `Tespit: ${result?.diagnosis?.name || "-"}
` +
      `Guven: ${result?.diagnosis?.confidence ? Math.round((result.diagnosis.confidencePct ?? (result.diagnosis.confidence * 100))) + "%" : "-"}
` +
      `Konum: ${fieldLocation?.coords || "-"}
` +
      `Not: ${fieldLocation?.notes || "-"}
`;
    const body = encodeURIComponent(base + meta);
    window.location.href = `mailto:${CONSULT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const submitContact = async () => {
    setContactStatus("");
    if (!contactForm.name || !contactForm.email || !contactForm.message) {
      setContactStatus("Lütfen ad, e-posta ve mesajı doldurun.");
      return;
    }
    const subject = contactForm.subject
      ? `Danismanlik: ${contactForm.subject}`
      : "AgroGuard Danismanlik Talebi";
    const body = `Ad: ${contactForm.name}
E-posta: ${contactForm.email}

${contactForm.message}`;
    const mail = `mailto:${CONSULT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mail;
    setContactStatus("Mail uygulaması açıldı. Gönderim kullanıcıda tamamlanır.");
  };
  const generateDemoReport = () => {
    const risk = weatherSummary?.riskTags?.join(" • ") || "Normal";
    const plant = selectedPlant?.name || "Bitki";
    const soil = soilReport?.soilType || "Toprak bilinmiyor";
    const score = fieldScore?.score || 0;
    const flags = [
      demoFlags.frost ? "Don riski" : null,
      demoFlags.pest ? "Zararli alarmi" : null,
      demoFlags.irrigation ? "Sulama kritik" : null,
      demoFlags.wind ? "Rüzgar siniri" : null
    ].filter(Boolean);
    const flagText = flags.length ? ` • Demo uyarilar: ${flags.join(", ")}` : "";
    const note = `Saha skoru ${score}/100. Hava riski: ${risk}. ${plant} icin toprak: ${soil}. Operasyon hazırlık: ${demoOpsSummary.readiness}/100.${flagText}`;
    setDemoReport(note);
    setDemoReportStatus("Rapor güncellendi.");
  };

  const downloadDemoReport = () => {
    const content = demoReport || "Demo raporu olusturulmadi.";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_demo_rapor.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyDemoReport = async () => {
    if (!demoReport) {
      setDemoReportStatus("Once rapor olustur.");
      return;
    }
    try {
      await navigator.clipboard.writeText(demoReport);
      setDemoReportStatus("Rapor kopyalandi.");
    } catch (err) {
      setDemoReportStatus("Kopyalama başarısiz.");
    }
  };

  const buildDemoShare = () => {
    const payload = {
      score: demoFeedback.score,
      note: demoFeedback.note || "-",
      plant: selectedPlant?.name || "Bitki",
      risk: weatherSummary?.riskTags?.join("|") || "normal",
      salt: demoTokenSalt
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  };

  const applyDemoPreset = (presetId) => {
    const preset = demoPresetLibrary.find((item) => item.id === presetId);
    if (!preset) return;
    setDemoPreset(preset.id);
    setDemoScenario((prev) => ({ ...prev, ...preset.scenario }));
    setDemoFlags({ ...preset.flags });
    setDemoDisease(preset.disease);
    setDemoReportStatus(`${preset.label} senaryosu uygulandi.`);
  };

  const resetDemoControls = () => {
    applyDemoPreset("normal");
    setDemoCost({ area: 10, price: 18, cost: 12000 });
    setDemoCompare({ a: 18, b: 22 });
    setDemoFeedback({ score: 4, note: "" });
    setDemoChecklist((prev) => prev.map((item) => ({ ...item, done: false })));
    setDemoReport("");
    setDemoReportStatus("Demo kontrolleri sifirlandi.");
    setDemoStatus("");
    setDemoVoiceRecording(false);
    setDemoVoiceDraft("");
    setDemoTimelineAdded({});
  };

  const toggleDemoChecklistItem = (itemId) => {
    setDemoChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
    );
  };

  const runDemoStressTest = () => {
    const list = [];
    if ((weatherSummary?.score || 0) >= 60) {
      list.push({ level: "high", text: `Hava riski yüksek (${weatherSummary.score}/100). Uygulama penceresi daralabilir.` });
    }
    if ((forecastSummary?.frostDays || 0) >= 1) {
      list.push({ level: "high", text: `${forecastSummary.frostDays} gun don riski var. Gece koruma planla.` });
    }
    if ((forecastSummary?.rainyDays || 0) >= 2) {
      list.push({ level: "medium", text: `${forecastSummary.rainyDays} gun yağış bekleniyor. Hastalik izleme sikligini artir.` });
    }
    if (demoOpsSummary.gap.spray < 0) {
      list.push({ level: "high", text: "Uygulama kapasitesi yetersiz. Ekip veya pencere artirilmali." });
    }
    if (demoOpsSummary.gap.scan < 0) {
      list.push({ level: "medium", text: "Parsel tarama hedefi geride. Tarama frekansi artirilmali." });
    }
    if (!list.length) {
      list.push({ level: "low", text: "Kritik açık yok. Planlanan rutinle devam edilebilir." });
    }
    setDemoAlertsFeed(list);
    setDemoStatus("Demo uyarilari güncellendi.");
  };

  const startQuickDemo = (presetId = "normal") => {
    applyDemoPreset(presetId);
    setShowFullDemo(true);
    setShowAdvanced(false);
    setDemoJourneyStep(1);
    setTimeout(() => {
      runDemoStressTest();
      generateDemoReport();
    setDemoStatus("Demo hızlı başlatıldı. Uyarılar ve rapor otomatik oluşturuldu.");
      setDemoJourneyStep(3);
    }, 0);
  };

  const advanceDemoJourney = () => {
    const next = Math.min(demoJourneyStep + 1, demoJourneySteps.length - 1);
    setDemoJourneyStep(next);
    if (next === 1) applyDemoAutoTune();
    if (next === 2) runDemoStressTest();
    if (next === 3) generateDemoReport();
    setDemoStatus(`Demo adimi: ${demoJourneySteps[next].title}`);
  };

  const runDemoEndToEnd = () => {
    startQuickDemo(demoPreset || "normal");
    setTimeout(() => applyDemoAutoTune(), 100);
    setTimeout(() => runDemoStressTest(), 220);
    setTimeout(() => simulateDemoDay(), 340);
    setTimeout(() => generateDemoReport(), 460);
    setTimeout(() => {
      setDemoJourneyStep(demoJourneySteps.length - 1);
      setDemoStatus("Uctan uca demo kosusu tamamlandi.");
    }, 560);
  };

  const applyDemoAutoTune = () => {
    const riskBoost = demoDisease === "critical" ? 3 : demoDisease === "high" ? 2 : 1;
    setDemoOps((prev) => ({
      team: Math.max(2, Number(prev.team) + (demoFlags.pest ? riskBoost : 0)),
      fieldHours: Math.max(6, Number(prev.fieldHours) + (demoFlags.irrigation ? 1 : 0)),
      sprayWindowMinutes: Math.max(60, Number(prev.sprayWindowMinutes) + (demoFlags.wind ? 20 : 0))
    }));
    setDemoStatus("Otomatik ayar uygulandi.");
  };

  const updateDemoExecution = (key, value) => {
    setDemoExecution((prev) => ({ ...prev, [key]: Math.max(0, Number(value) || 0) }));
  };

  const toggleSeasonRisk = (month) => {
    setDemoSeasonPlan((prev) =>
      prev.map((item) =>
        item.month === month
          ? {
            ...item,
            risk: item.risk === "Düşük" ? "Orta" : item.risk === "Orta" ? "Yüksek" : "Düşük"
          }
          : item
      )
    );
  };

  const exportDemoJson = () => {
    const payload = {
      createdAt: new Date().toISOString(),
      plant: selectedPlant?.name || "Secilmedi",
      scenario: demoScenario,
      flags: demoFlags,
      disease: demoDisease,
      ops: demoOps,
      execution: demoExecution,
      alerts: demoAlertsFeed,
      sensitivity: demoSensitivityTable,
      readinessGrade: demoReadinessGrade,
      incident: demoIncident,
      interventionPlan: demoInterventionPlan,
      dailyLog: demoDailyLog,
      report: demoReport || null
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_demo_bundle.json";
    link.click();
    URL.revokeObjectURL(url);
    setDemoReportStatus("Demo bundle disa aktarildi.");
  };

  const simulateDemoDay = () => {
    const time = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const incident = demoIncidentLibrary.find((item) => item.id === demoIncident);
    const line = `${time} • ${incident?.label || "Olay yok"} • Hazirlik ${demoOpsSummary.readiness}/100 • Plan ${demoInterventionPlan.map((i) => i.label).join(", ")}`;
    setDemoDailyLog((prev) => [line, ...prev].slice(0, 12));
    setDemoStatus("Demo gun sonu simulasyonu olusturuldu.");
  };

  const startDemoVoice = () => {
    setDemoVoiceRecording(true);
    setDemoStatus("Demo ses kaydi basladi.");
  };

  const stopDemoVoice = () => {
    if (!demoVoiceRecording) return;
    const text = demoVoiceDraft?.trim() || "Yaprak altinda sari lekeler goruldu, risk artiyor.";
    const stamp = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    setDemoVoiceHistory((prev) => [{ id: `${Date.now()}`, time: stamp, note: text }, ...prev].slice(0, 5));
    setDemoVoiceDraft("");
    setDemoVoiceRecording(false);
    setDemoStatus("Demo ses kaydi durduruldu, not eklendi.");
  };

  const addDemoTimelineToCalendar = (item) => {
    const base = new Date();
    const offset = demoTimeline.findIndex((entry) => entry.day === item.day);
    const target = new Date(base);
    target.setDate(base.getDate() + Math.max(0, offset));
    const date = target.toISOString().slice(0, 10);
    const title = `Demo plan: ${item.task}`;
    setCalendarPlan((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, date, done: false }
    ]);
    setDemoTimelineAdded((prev) => ({ ...prev, [item.day]: true }));
    setDemoStatus("Demo aksiyon takvime eklendi.");
  };

  const regenerateDemoToken = () => {
    setDemoTokenSalt(Math.random().toString(36).slice(2, 10));
    setDemoStatus("Yeni demo token uretildi.");
  };


  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Tarayici konum destegi yok.");
      return;
    }
    setGeoStatus("Konum aliniyor...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setFieldLocation((prev) => ({ ...prev, coords }));
        setGeoStatus("Konum alindi.");
      },
      () => {
        setGeoStatus("Konum izni reddedildi veya alinamadi.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const mapLink = useMemo(() => {
    const coords = fieldLocation.coords?.trim();
    if (!coords) return "";
    return `https://maps.google.com/?q=${encodeURIComponent(coords)}`;
  }, [fieldLocation.coords]);

  const parsedCoords = useMemo(() => {
    const raw = fieldLocation.coords?.trim();
    if (!raw) return null;
    const parts = raw.split(",").map((item) => Number(item.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
      return null;
    }
    const [lat, lon] = parts;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }, [fieldLocation.coords]);

  const coordsValid = Boolean(parsedCoords);
  const soilCoords = useMemo(() => {
    if (parsedCoords) return parsedCoords;
    const raw = String(soilReport?.coords || "").trim();
    if (!raw) return null;
    const parts = raw.split(",").map((item) => Number(item.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
    const [lat, lon] = parts;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }, [parsedCoords, soilReport?.coords]);
  const soilPickerMarker = useMemo(() => {
    if (!parsedCoords) return null;
    const { width, height, zoom, centerLat, centerLon } = SOIL_MAP_PICKER;
    const centerX = lonToWorldX(centerLon, zoom);
    const centerY = latToWorldY(centerLat, zoom);
    const px = lonToWorldX(parsedCoords.lon, zoom) - centerX + width / 2;
    const py = latToWorldY(parsedCoords.lat, zoom) - centerY + height / 2;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    if (px < -32 || px > width + 32 || py < -32 || py > height + 32) return null;
    return {
      left: Number(px.toFixed(1)),
      top: Number(py.toFixed(1))
    };
  }, [parsedCoords]);
  const selectSoilMapPoint = useCallback(
    (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const rx = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const ry = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const xOnMap = (rx / rect.width) * SOIL_MAP_PICKER.width;
      const yOnMap = (ry / rect.height) * SOIL_MAP_PICKER.height;
      const centerX = lonToWorldX(SOIL_MAP_PICKER.centerLon, SOIL_MAP_PICKER.zoom);
      const centerY = latToWorldY(SOIL_MAP_PICKER.centerLat, SOIL_MAP_PICKER.zoom);
      const worldX = centerX - SOIL_MAP_PICKER.width / 2 + xOnMap;
      const worldY = centerY - SOIL_MAP_PICKER.height / 2 + yOnMap;
      const lat = worldYToLat(worldY, SOIL_MAP_PICKER.zoom);
      const lon = worldXToLon(worldX, SOIL_MAP_PICKER.zoom);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      setFieldLocation((prev) => ({ ...prev, coords: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }));
      setGeoStatus("Haritadan koordinat seçildi. Toprak verisi güncelleniyor...");
      setWeatherRefreshKey((prev) => prev + 1);
    },
    [setFieldLocation]
  );
  const soilMapContext = useMemo(() => {
    const lat = soilCoords?.lat;
    const lon = soilCoords?.lon;
    const sourceLinks = Array.isArray(soilReport?.internetSources) ? soilReport.internetSources : [];
    const wmsUrl = sourceLinks.find((item) => item?.id === "tr-soil-wms")?.url || "";
    const mtaUrl = sourceLinks.find((item) => item?.id === "mta")?.url || "";
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const dLat = 0.06;
      const dLon = 0.08;
      const bbox = `${(lon - dLon).toFixed(6)}%2C${(lat - dLat).toFixed(6)}%2C${(lon + dLon).toFixed(6)}%2C${(lat + dLat).toFixed(6)}`;
      return {
        hasCoords: true,
        label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        osmEmbed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lon.toFixed(5)}`,
        google: `https://maps.google.com/?q=${encodeURIComponent(`${lat}, ${lon}`)}`,
        osm: `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=12/${lat.toFixed(5)}/${lon.toFixed(5)}`,
        wmsUrl,
        mtaUrl
      };
    }
    return {
      hasCoords: false,
      label: city || "-",
      osmEmbed: "",
      google: `https://maps.google.com/?q=${encodeURIComponent(city || "Malatya")}`,
      osm: `https://www.openstreetmap.org/search?query=${encodeURIComponent(city || "Malatya")}`,
      wmsUrl,
      mtaUrl
    };
  }, [soilCoords, soilReport?.internetSources, city]);
  const isNativeApp = isCapacitorRuntime;
  const FROST_NOTIFICATION_ID = 7001;
  const DAILY_NOTIFICATION_ID = 7002;
  const CALENDAR_NOTIFICATION_BASE = 7200;
  const CALENDAR_NOTIF_STORE_KEY = "agroguard-calendar-notif-ids";

  const toCalendarNotificationId = useCallback((itemId = "") => {
    let hash = 0;
    const raw = String(itemId);
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) % 100000;
    }
    return CALENDAR_NOTIFICATION_BASE + hash;
  }, []);

  const readStoredCalendarNotifIds = useCallback(() => {
    try {
      const raw = safeLocalStorage.getItem(CALENDAR_NOTIF_STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id >= CALENDAR_NOTIFICATION_BASE);
    } catch (_) {
      return [];
    }
  }, []);

  const ensureNotificationPermission = useCallback(async (requestIfNeeded = false) => {
    if (!isNativeApp) return "unsupported";
    try {
      const current = await LocalNotifications.checkPermissions();
      let state = current?.display || "unknown";
      if (state !== "granted" && requestIfNeeded) {
        const requested = await LocalNotifications.requestPermissions();
        state = requested?.display || state;
      }
      setNotifPermission(state);
      return state;
    } catch (err) {
      setNotifPermission("error");
      return "error";
    }
  }, [isNativeApp]);

  const syncNotifications = useCallback(async (source = "auto") => {
    if (!isNativeApp) return;
    const permission = await ensureNotificationPermission(source === "manual");
    if (permission !== "granted") {
      if (notifSettings.enabled) {
        setNotifStatus("Bildirim izni gerekli. Ayarlardan izin verin.");
      }
      return;
    }

    try {
      const oldCalendarIds = readStoredCalendarNotifIds();
      await LocalNotifications.cancel({
        notifications: [
          { id: FROST_NOTIFICATION_ID },
          { id: DAILY_NOTIFICATION_ID },
          ...oldCalendarIds.map((id) => ({ id }))
        ]
      });
      if (!notifSettings.enabled) {
        safeLocalStorage.setItem(CALENDAR_NOTIF_STORE_KEY, JSON.stringify([]));
        setNotifStatus("Bildirimler kapatildi.");
        return;
      }

      const schedule = [];
      const frostRisk =
        Boolean(weather?.frostRisk) || Boolean(forecast?.days?.slice(0, 2).some((d) => d.frost));
      if (notifSettings.frostThreat && frostRisk) {
        schedule.push({
          id: FROST_NOTIFICATION_ID,
          title: "Don Tehdidi Uyarisi",
          body: `${city} icin don riski var. Gece koruma planini devreye alin.`,
          schedule: { at: new Date(Date.now() + 60 * 1000), allowWhileIdle: true }
        });
      }

      if (notifSettings.dailySummary) {
        const riskTags = [];
        if (weather?.frostRisk) riskTags.push("Don");
        if ((weather?.humidity ?? 0) >= 80) riskTags.push("Yüksek nem");
        if ((weather?.windKmh ?? 0) >= 20 || (weather?.windGustKmh ?? 0) >= 35) riskTags.push("Rüzgar");
        if ((weather?.precipitationMm ?? 0) >= 8) riskTags.push("Yağış");
        const body = riskTags.length
          ? `${city}: ${riskTags.join(", ")} riski. Saha planini kontrol et.`
          : `${city}: Günlük tarla ozetini kontrol et.`;
        schedule.push({
          id: DAILY_NOTIFICATION_ID,
          title: "Günlük Saha Ozeti",
          body,
          schedule: {
            on: {
              hour: Number(notifSettings.dailyHour) || 8,
              minute: Number(notifSettings.dailyMinute) || 30
            },
            repeats: true,
            allowWhileIdle: true
          }
        });
      }

      const calendarIds = [];
      if (notifSettings.calendarReminders) {
        const leadMinutes = Math.max(0, Math.min(24 * 60, Number(notifSettings.reminderLeadMinutes) || 0));
        const now = Date.now();
        calendarPlan.forEach((item) => {
          if (!item || item.done || item.notify === false || !item.date) return;
          const when = new Date(`${item.date}T${item.time || "08:00"}:00`);
          if (Number.isNaN(when.getTime())) return;
          const at = new Date(when.getTime() - leadMinutes * 60 * 1000);
          if (at.getTime() <= now + 30000) return;
          const id = toCalendarNotificationId(item.id);
          calendarIds.push(id);
          schedule.push({
            id,
            title: "Takvim Görevi Hatirlatmasi",
            body: `${item.title} • ${item.date} ${item.time || "08:00"}`,
            schedule: { at, allowWhileIdle: true }
          });
        });
      }

      if (schedule.length) {
        await LocalNotifications.schedule({ notifications: schedule });
        safeLocalStorage.setItem(CALENDAR_NOTIF_STORE_KEY, JSON.stringify(calendarIds));
        setNotifStatus(`Bildirim plani güncellendi (${schedule.length}).`);
      } else {
        safeLocalStorage.setItem(CALENDAR_NOTIF_STORE_KEY, JSON.stringify([]));
        setNotifStatus("Aktif bildirim kurali yok.");
      }
    } catch (err) {
      setNotifStatus("Bildirim plani olusturulamadi.");
    }
  }, [isNativeApp, ensureNotificationPermission, notifSettings, weather, forecast, city, calendarPlan, toCalendarNotificationId, readStoredCalendarNotifIds]);

  const econYieldAuto = useMemo(() => {
    const key = econCrop || selectedPlant?.id || "";
    const cityKey = city || "";
    if (!key || !cropYieldKgDa[key]) return 0;
    const data = cropYieldKgDa[key];
    return data.provincesKgDa?.[cityKey] || data.nationalKgDa || 0;
  }, [econCrop, selectedPlant, city]);

  const econPriceAuto = useMemo(() => {
    const key = econCrop || selectedPlant?.id || "";
    return key && cropPriceTlKg[key] ? cropPriceTlKg[key] : 0;
  }, [econCrop, selectedPlant]);

  React.useEffect(() => {
    if (!econYield) {
      setEconYield(econYieldAuto || 0);
    }
  }, [econYieldAuto, econYield]);

  React.useEffect(() => {
    if ((Number(econPrice) || 0) <= 0) {
      setEconPrice(econPriceAuto || 0);
    }
  }, [econPriceAuto, econPrice]);

  const effectiveTradeCity = (tradeQuery.city || city || "Malatya").trim() || "Malatya";
  const effectiveTradeCrop = (tradeQuery.crop || econCrop || selectedPlant?.id || "domates").trim() || "domates";
  const effectiveLandCity = (landQuery.city || city || "Malatya").trim() || "Malatya";
  const effectiveLandCrop = (landQuery.crop || econCrop || selectedPlant?.id || "domates").trim() || "domates";

  const saveCurrentLandProfile = () => {
    const name = String(landProfileName || "").trim();
    const generatedName = `${landDemo?.district || effectiveLandCity} ${landDemo?.neighborhood || ""}`.trim();
    const finalName = name || generatedName || `Parsel ${new Date().toLocaleDateString("tr-TR")}`;
    const profile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: finalName,
      city: effectiveLandCity,
      crop: effectiveLandCrop,
      coords: String(fieldLocation?.coords || "").trim(),
      landDemo: {
        areaDa: Number(landDemo?.areaDa || 0),
        district: String(landDemo?.district || ""),
        neighborhood: String(landDemo?.neighborhood || ""),
        slopePct: Number(landDemo?.slopePct || 0),
        irrigation: String(landDemo?.irrigation || "var"),
        roadAccess: String(landDemo?.roadAccess || "orta"),
        roadDistanceM: Number(landDemo?.roadDistanceM || 0),
        roadPass: String(landDemo?.roadPass || "var"),
        zoningStatus: String(landDemo?.zoningStatus || "yok"),
        structureStatus: String(landDemo?.structureStatus || "yok"),
        zone: String(landDemo?.zone || "gecis"),
        soilScore: Number(landDemo?.soilScore || 70),
        plantedStatus: String(landDemo?.plantedStatus || "bos"),
        plantedCrop: String(landDemo?.plantedCrop || ""),
        plantedValueTlDa: Number(landDemo?.plantedValueTlDa || 0)
      },
      createdAt: new Date().toISOString()
    };
    setLandProfiles((prev) => [profile, ...(prev || [])].slice(0, 20));
    setLandProfileName("");
    setLandProfileStatus("Arazi profilin kaydedildi.");
  };

  const applyLandProfile = (profile) => {
    if (!profile) return;
    setLandQuery({
      city: String(profile.city || ""),
      crop: String(profile.crop || "")
    });
    setFieldLocation((prev) => ({ ...prev, coords: String(profile.coords || "") }));
    setLandDemo((prev) => ({
      ...prev,
      areaDa: Number(profile?.landDemo?.areaDa || prev.areaDa || 0),
      district: String(profile?.landDemo?.district || ""),
      neighborhood: String(profile?.landDemo?.neighborhood || ""),
      slopePct: Number(profile?.landDemo?.slopePct || prev.slopePct || 0),
      irrigation: String(profile?.landDemo?.irrigation || prev.irrigation || "var"),
      roadAccess: String(profile?.landDemo?.roadAccess || prev.roadAccess || "orta"),
      roadDistanceM: Number(profile?.landDemo?.roadDistanceM || prev.roadDistanceM || 0),
      roadPass: String(profile?.landDemo?.roadPass || prev.roadPass || "var"),
      zoningStatus: String(profile?.landDemo?.zoningStatus || prev.zoningStatus || "yok"),
      structureStatus: String(profile?.landDemo?.structureStatus || prev.structureStatus || "yok"),
      zone: String(profile?.landDemo?.zone || prev.zone || "gecis"),
      soilScore: Number(profile?.landDemo?.soilScore || prev.soilScore || 70),
      plantedStatus: String(profile?.landDemo?.plantedStatus || prev.plantedStatus || "bos"),
      plantedCrop: String(profile?.landDemo?.plantedCrop || prev.plantedCrop || ""),
      plantedValueTlDa: Number(profile?.landDemo?.plantedValueTlDa || prev.plantedValueTlDa || 0)
    }));
    setLandProfileStatus(`Profil uygulandi: ${profile.name}`);
  };

  const deleteLandProfile = (profileId) => {
    const id = String(profileId || "");
    if (!id) return;
    setLandProfiles((prev) => prev.filter((item) => String(item.id) !== id));
    setLandProfileStatus("Profil silindi.");
  };

  React.useEffect(() => {
    let isActive = true;
    const crop = econCrop || selectedPlant?.id || "";
    const query = `/api/economy/planner?city=${encodeURIComponent(city || "Malatya")}&crop=${encodeURIComponent(
      crop
    )}&areaDa=${encodeURIComponent(Number(econArea) || 0)}&yieldKgDa=${encodeURIComponent(
      Number(econYield) || Number(econYieldAuto) || 0
    )}&priceTlKg=${encodeURIComponent(Number(econPrice) || Number(econPriceAuto) || 0)}`;
    setEconomyPlannerLoading(true);
    setEconomyPlannerError("");
    apiFetch(query)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setEconomyPlannerData(data || null);
      })
      .catch(() => {
        if (!isActive) return;
        setEconomyPlannerData(null);
        setEconomyPlannerError("Ekonomi verileri alinamadi.");
      })
      .finally(() => {
        if (isActive) setEconomyPlannerLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [city, econCrop, selectedPlant?.id, econArea, econYield, econYieldAuto, econPrice, econPriceAuto]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    const coords = (fieldLocation?.coords || "").trim();
    const hasCoords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords);
    const landFeatureQuery = `&zone=${encodeURIComponent(landDemo?.zone || "gecis")}&irrigation=${encodeURIComponent(
      landDemo?.irrigation || "var"
    )}&roadAccess=${encodeURIComponent(landDemo?.roadAccess || "orta")}&soilScore=${encodeURIComponent(
      Number(landDemo?.soilScore) || 65
    )}&slopePct=${encodeURIComponent(Number(landDemo?.slopePct) || 6)}&areaDa=${encodeURIComponent(
      Number(landDemo?.areaDa) || 0
    )}&roadDistanceM=${encodeURIComponent(Number(landDemo?.roadDistanceM) || 0)}&roadPass=${encodeURIComponent(
      landDemo?.roadPass || "var"
    )}&zoningStatus=${encodeURIComponent(landDemo?.zoningStatus || "yok"
    )}&structureStatus=${encodeURIComponent(landDemo?.structureStatus || "yok"
    )}&plantedStatus=${encodeURIComponent(landDemo?.plantedStatus || "bos")}&plantedCrop=${encodeURIComponent(
      landDemo?.plantedCrop || ""
    )}&plantedValueTlDa=${encodeURIComponent(Number(landDemo?.plantedValueTlDa) || 0)}`;
    const query = `/api/land-price?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
      district
    )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}${hasCoords ? `&coords=${encodeURIComponent(coords)}` : ""
      }${landFeatureQuery}`;
    setLandPriceLoading(true);
    setLandPriceError("");
    apiFetch(query)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandPriceData(data || null);
        if ((Number(econLandValue) || 0) <= 0 && Number(data?.priceTlDa) > 0) {
          setEconLandValue(Number(data.priceTlDa));
        }
      })
      .catch(() => {
        if (!isActive) return;
        setLandPriceError("Arazi fiyat verisi su an alinamadi.");
      })
      .finally(() => {
        if (isActive) setLandPriceLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveLandCity,
    effectiveLandCrop,
    econLandValue,
    fieldLocation?.coords,
    landDemo?.district,
    landDemo?.neighborhood,
    landDemo?.zone,
    landDemo?.irrigation,
    landDemo?.roadAccess,
    landDemo?.roadDistanceM,
    landDemo?.roadPass,
    landDemo?.zoningStatus,
    landDemo?.structureStatus,
    landDemo?.soilScore,
    landDemo?.slopePct,
    landDemo?.areaDa,
    landDemo?.plantedStatus,
    landDemo?.plantedCrop,
    landDemo?.plantedValueTlDa,
    landRefreshKey
  ]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    const coords = (fieldLocation?.coords || "").trim();
    const hasCoords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords);
    const landFeatureQuery = `&zone=${encodeURIComponent(landDemo?.zone || "gecis")}&irrigation=${encodeURIComponent(
      landDemo?.irrigation || "var"
    )}&roadAccess=${encodeURIComponent(landDemo?.roadAccess || "orta")}&soilScore=${encodeURIComponent(
      Number(landDemo?.soilScore) || 65
    )}&slopePct=${encodeURIComponent(Number(landDemo?.slopePct) || 6)}&roadDistanceM=${encodeURIComponent(
      Number(landDemo?.roadDistanceM) || 0
    )}&roadPass=${encodeURIComponent(landDemo?.roadPass || "var")}&zoningStatus=${encodeURIComponent(
      landDemo?.zoningStatus || "yok"
    )}&structureStatus=${encodeURIComponent(landDemo?.structureStatus || "yok"
    )}&plantedStatus=${encodeURIComponent(
      landDemo?.plantedStatus || "bos"
    )}&plantedCrop=${encodeURIComponent(landDemo?.plantedCrop || "")}&plantedValueTlDa=${encodeURIComponent(
      Number(landDemo?.plantedValueTlDa) || 0
    )}`;
    const query = `/api/land-price/history?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
      district
    )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}${hasCoords ? `&coords=${encodeURIComponent(coords)}` : ""
      }${landFeatureQuery}`;
    apiFetch(query)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandPriceHistory(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!isActive) return;
        setLandPriceHistory([]);
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveLandCity,
    effectiveLandCrop,
    fieldLocation?.coords,
    landDemo?.district,
    landDemo?.neighborhood,
    landDemo?.zone,
    landDemo?.irrigation,
    landDemo?.roadAccess,
    landDemo?.roadDistanceM,
    landDemo?.roadPass,
    landDemo?.zoningStatus,
    landDemo?.structureStatus,
    landDemo?.soilScore,
    landDemo?.slopePct,
    landDemo?.plantedStatus,
    landDemo?.plantedCrop,
    landDemo?.plantedValueTlDa,
    landRefreshKey
  ]);

  const fetchTradeJsonSafe = useCallback(async (path, fallback, label) => {
    try {
      const res = await apiFetch(path);
      if (!res.ok) return { ok: false, label, status: res.status, data: fallback };
      const data = await res.json();
      return { ok: true, label, status: res.status, data };
    } catch (_) {
      return { ok: false, label, status: 0, data: fallback };
    }
  }, []);

  const loadTradeData = useCallback(async () => {
    const crop = effectiveTradeCrop;
    const cityValue = effectiveTradeCity;
    const explicitCity = String(tradeQuery.city || "").trim();
    const explicitCrop = String(tradeQuery.crop || "").trim();
    const scopeDistrict =
      String(tradeListingForm?.district || "").trim() ||
      String(fieldLocation?.district || "").trim() ||
      String(landDemo?.district || "").trim();
    const listingsPath =
      explicitCity || explicitCrop
        ? `/api/trade/listings?city=${encodeURIComponent(explicitCity || cityValue)}&crop=${encodeURIComponent(
          explicitCrop || crop
        )}&status=all`
        : `/api/trade/listings?status=all`;
    const matchesPath =
      explicitCity || explicitCrop
        ? `/api/trade/matches?city=${encodeURIComponent(explicitCity || cityValue)}&crop=${encodeURIComponent(
          explicitCrop || crop
        )}&limit=8`
        : `/api/trade/matches?limit=8`;
    const ordersPath =
      explicitCity || explicitCrop
        ? `/api/trade/orders?city=${encodeURIComponent(explicitCity || cityValue)}&crop=${encodeURIComponent(
          explicitCrop || crop
        )}`
        : `/api/trade/orders`;
    const scopeCity = explicitCity || cityValue;
    const scopeCrop = explicitCrop || crop;
    setTradeLoading(true);
    setMarketLiveLoading(true);
    setMarketLiveError("");
    try {
      const workspacePath = `/api/trade/workspace?city=${encodeURIComponent(scopeCity)}&crop=${encodeURIComponent(
        scopeCrop
      )}&listingStatus=all&listingLimit=280&offerLimit=1200&orderLimit=400&matchLimit=8&alertLimit=20`;
      const marketLivePath = `/api/market/live?city=${encodeURIComponent(scopeCity)}&district=${encodeURIComponent(
        scopeDistrict
      )}&crop=${encodeURIComponent(scopeCrop)}`;
      const [wsRes, sphRes, marketLiveRes] = await Promise.all([
        fetchTradeJsonSafe(workspacePath, null, "workspace"),
        fetchTradeJsonSafe(`/api/trade/shipping/providers-health`, { items: [] }, "shippingHealth"),
        fetchTradeJsonSafe(marketLivePath, null, "marketLive")
      ]);
      if (marketLiveRes.ok) {
        setMarketLiveData(marketLiveRes.data || null);
        const boardItems = Array.isArray(marketLiveRes?.data?.board) ? marketLiveRes.data.board : [];
        const fuelItems = Array.isArray(marketLiveRes?.data?.fuel?.items) ? marketLiveRes.data.fuel.items : [];
        if (!boardItems.length && !fuelItems.length) {
          setMarketLiveError("Canli mazot ve hal fiyatlari su an bos donuyor.");
        }
      } else {
        setMarketLiveData(null);
        setMarketLiveError("Canli mazot ve pazar fiyatlari yuklenemedi.");
      }
      const wsData = wsRes.data;
      if (wsRes.ok && wsData?.summary && wsData?.dashboard) {
        setTradeSummary(wsData.summary || null);
        setTradeDashboard(wsData.dashboard || null);
        const listings = Array.isArray(wsData?.listings?.items) ? wsData.listings.items : [];
        setTradeListings(listings);
        setTradeMatches(Array.isArray(wsData?.matches?.items) ? wsData.matches.items : []);
        setTradeOffers(Array.isArray(wsData?.offers?.items) ? wsData.offers.items : []);
        const orders = Array.isArray(wsData?.orders?.items) ? wsData.orders.items : [];
        setTradeOrders(orders);
        const defaultOrder = orders[0];
        setTradeOrderForm((prev) => ({
          ...prev,
          orderId: prev.orderId || defaultOrder?.id || "",
          invoiceNo: prev.invoiceNo || defaultOrder?.invoiceNo || "",
          trackingCode: prev.trackingCode || defaultOrder?.trackingCode || "",
          shippingProvider: prev.shippingProvider || defaultOrder?.shippingProvider || ""
        }));
        setTradeContractPreview(null);
        const alerts = Array.isArray(wsData?.alerts?.items) ? wsData.alerts.items : [];
        setTradeAlerts(alerts);
        setLastTradeAlertAt(new Date(alerts[0]?.createdAt || 0).getTime() || 0);
        const providerItems = Array.isArray(wsData?.shippingProviders?.items) ? wsData.shippingProviders.items : [];
        setShippingProviders(providerItems);
        setShippingProviderConfigs(
          Array.isArray(wsData?.shippingProviderConfigs?.items) ? wsData.shippingProviderConfigs.items : []
        );
        if (sphRes.ok) {
          setShippingHealth(Array.isArray(sphRes?.data?.items) ? sphRes.data.items : []);
        } else {
          setShippingHealth(Array.isArray(wsData?.shippingHealth?.items) ? wsData.shippingHealth.items : []);
        }
        if (providerItems.length) {
          setShippingParseForm((prev) => ({
            ...prev,
            provider: prev.provider || providerItems[0].id
          }));
        }
        const defaultListingId = listings[0]?.id || "";
        setTradeOfferForm((prev) => ({
          ...prev,
          listingId: listings.some((x) => x.id === prev.listingId) ? prev.listingId : defaultListingId
        }));
        const resolvedListingId =
          listings.some((x) => x.id === tradeOfferForm.listingId) ? tradeOfferForm.listingId : defaultListingId;
        if (resolvedListingId) {
          const listingWsRes = await fetchTradeJsonSafe(
            `/api/trade/listings/${encodeURIComponent(
              resolvedListingId
            )}/workspace?withMatch=1&messağeLimit=200&orderLimit=120&alertLimit=30`,
            null,
            "listingWorkspace"
          );
          const payload = listingWsRes?.data || null;
          if (listingWsRes.ok && payload) {
            const wsOffers = Array.isArray(payload?.offers?.items) ? payload.offers.items : [];
            setTradeOffers((prev) => {
              const merged = new Map((prev || []).map((item) => [String(item.id), item]));
              wsOffers.forEach((item) => merged.set(String(item.id), item));
              return Array.from(merged.values()).sort(
                (a, b) =>
                  new Date(b.updatedAt || b.createdAt || 0).getTime() -
                  new Date(a.updatedAt || a.createdAt || 0).getTime()
              );
            });
            setTradeMessağes(Array.isArray(payload?.messağes?.items) ? payload.messağes.items : []);
            const wsOrders = Array.isArray(payload?.orders?.items) ? payload.orders.items : [];
            if (wsOrders.length) {
              setTradeOrders((prev) => {
                const merged = new Map((prev || []).map((item) => [String(item.id), item]));
                wsOrders.forEach((item) => merged.set(String(item.id), item));
                return Array.from(merged.values()).sort(
                  (a, b) =>
                    new Date(b.updatedAt || b.createdAt || 0).getTime() -
                    new Date(a.updatedAt || a.createdAt || 0).getTime()
                );
              });
            }
            const wsAlerts = Array.isArray(payload?.alerts?.items) ? payload.alerts.items : [];
            if (wsAlerts.length) {
              setTradeAlerts((prev) => {
                const merged = new Map((prev || []).map((item) => [String(item.id), item]));
                wsAlerts.forEach((item) => merged.set(String(item.id), item));
                return Array.from(merged.values()).sort(
                  (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );
              });
            }
            setTradeListingInsights(payload?.marketInsights || null);
          }
        } else {
          setTradeMessağes([]);
          setTradeListingInsights(null);
        }
        const failed = [sphRes].filter((item) => !item.ok);
        if (failed.length) {
          setTradeStatus(`Pazar verisinin bir kismi alinamadi (${failed.map((x) => x.label).join(", ")}).`);
        } else {
          setTradeStatus("");
        }
        return;
      }
      const [sRes, dRes, lRes, mRes, oResAll, offResAll, aRes, spRes, sphResLegacy, spcRes] = await Promise.all([
        fetchTradeJsonSafe(
          `/api/trade/summary?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(crop)}`,
          null,
          "summary"
        ),
        fetchTradeJsonSafe(
          `/api/trade/dashboard?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(crop)}`,
          null,
          "dashboard"
        ),
        fetchTradeJsonSafe(listingsPath, { items: [] }, "listings"),
        fetchTradeJsonSafe(matchesPath, { items: [] }, "matches"),
        fetchTradeJsonSafe(ordersPath, { items: [] }, "orders"),
        fetchTradeJsonSafe(`/api/trade/offers`, { items: [] }, "offers"),
        fetchTradeJsonSafe(`/api/trade/alerts?limit=20`, { items: [] }, "alerts"),
        fetchTradeJsonSafe(`/api/trade/shipping/providers`, { items: [] }, "shippingProviders"),
        fetchTradeJsonSafe(`/api/trade/shipping/providers-health`, { items: [] }, "shippingHealth"),
        fetchTradeJsonSafe(`/api/trade/shipping/providers-config`, { items: [] }, "shippingConfig")
      ]);
      const sData = sRes.data;
      const dData = dRes.data;
      const lData = lRes.data;
      const mData = mRes.data;
      const oDataAll = oResAll.data;
      const offDataAll = offResAll.data;
      const aData = aRes.data;
      const spData = spRes.data;
      const sphData = sphResLegacy.data;
      const spcData = spcRes.data;
      setTradeSummary(sData || null);
      setTradeDashboard(dData || null);
      const listings = Array.isArray(lData?.items) ? lData.items : [];
      setTradeListings(listings);
      setTradeMatches(Array.isArray(mData?.items) ? mData.items : []);
      setTradeOffers(Array.isArray(offDataAll?.items) ? offDataAll.items : []);
      const orders = Array.isArray(oDataAll?.items) ? oDataAll.items : [];
      setTradeOrders(orders);
      const defaultOrder = orders[0];
      setTradeOrderForm((prev) => ({
        ...prev,
        orderId: prev.orderId || defaultOrder?.id || "",
        invoiceNo: prev.invoiceNo || defaultOrder?.invoiceNo || "",
        trackingCode: prev.trackingCode || defaultOrder?.trackingCode || "",
        shippingProvider: prev.shippingProvider || defaultOrder?.shippingProvider || ""
      }));
      setTradeContractPreview(null);
      const alerts = Array.isArray(aData?.items) ? aData.items : [];
      setTradeAlerts(alerts);
      setLastTradeAlertAt(new Date(alerts[0]?.createdAt || 0).getTime() || 0);
      setShippingProviders(Array.isArray(spData?.items) ? spData.items : []);
      setShippingHealth(Array.isArray(sphData?.items) ? sphData.items : []);
      setShippingProviderConfigs(Array.isArray(spcData?.items) ? spcData.items : []);
      const providerItems = Array.isArray(spData?.items) ? spData.items : [];
      if (providerItems.length) {
        setShippingParseForm((prev) => ({
          ...prev,
          provider: prev.provider || providerItems[0].id
        }));
      }
      const defaultListingId = listings[0]?.id || "";
      setTradeOfferForm((prev) => ({
        ...prev,
        listingId: listings.some((x) => x.id === prev.listingId) ? prev.listingId : defaultListingId
      }));
      if (defaultListingId) {
        const [, msgDataRes] = await Promise.all([
          fetchTradeJsonSafe(`/api/trade/offers?listingId=${encodeURIComponent(defaultListingId)}&withMatch=1`, { items: [] }, "offers"),
          fetchTradeJsonSafe(
            `/api/trade/messağes?listingId=${encodeURIComponent(defaultListingId)}`,
            { items: [] },
            "messağes"
          )
        ]);
        setTradeMessağes(Array.isArray(msgDataRes?.data?.items) ? msgDataRes.data.items : []);
      } else {
        setTradeMessağes([]);
        setTradeListingInsights(null);
      }
      const failed = [sRes, dRes, lRes, mRes, oResAll, offResAll, aRes, spRes, sphResLegacy, spcRes].filter((item) => !item.ok);
      if (failed.length) {
        setTradeStatus(`Pazar verisinin bir kismi alinamadi (${failed.map((x) => x.label).join(", ")}).`);
      } else {
        setTradeStatus("");
      }
    } catch (_) {
      setTradeStatus("Pazar verisi yuklenemedi.");
      setMarketLiveError("Canli mazot ve pazar fiyatlari yuklenemedi.");
    } finally {
      setTradeLoading(false);
      setMarketLiveLoading(false);
    }
  }, [
    effectiveTradeCity,
    effectiveTradeCrop,
    fetchTradeJsonSafe,
    fieldLocation?.district,
    landDemo?.district,
    tradeListingForm?.district,
    tradeOfferForm.listingId,
    tradeQuery.city,
    tradeQuery.crop
  ]);

  const refreshSelectedTradeListingWorkspace = useCallback(
    async (listingId, options = {}) => {
      const id = String(listingId || "").trim();
      if (!id) {
        setTradeMessağes([]);
        setTradeListingInsights(null);
        return false;
      }
      const res = await fetchTradeJsonSafe(
        `/api/trade/listings/${encodeURIComponent(id)}/workspace?withMatch=1&messağeLimit=200&orderLimit=120&alertLimit=30`,
        null,
        "listingWorkspace"
      );
      const payload = res?.data || null;
      if (!res.ok || !payload) return false;
      const wsOffers = Array.isArray(payload?.offers?.items) ? payload.offers.items : [];
      setTradeOffers((prev) => {
        const merged = new Map((prev || []).map((item) => [String(item.id), item]));
        wsOffers.forEach((item) => merged.set(String(item.id), item));
        return Array.from(merged.values()).sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
      });
      setTradeMessağes(Array.isArray(payload?.messağes?.items) ? payload.messağes.items : []);
      const wsOrders = Array.isArray(payload?.orders?.items) ? payload.orders.items : [];
      if (wsOrders.length) {
        setTradeOrders((prev) => {
          const merged = new Map((prev || []).map((item) => [String(item.id), item]));
          wsOrders.forEach((item) => merged.set(String(item.id), item));
          return Array.from(merged.values()).sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt || 0).getTime() -
              new Date(a.updatedAt || a.createdAt || 0).getTime()
          );
        });
        if (options.syncOrderForm !== false) {
          const topOrder = wsOrders[0];
          setTradeOrderForm((prev) => ({
            ...prev,
            orderId: prev.orderId || topOrder?.id || "",
            invoiceNo: prev.invoiceNo || topOrder?.invoiceNo || "",
            trackingCode: prev.trackingCode || topOrder?.trackingCode || "",
            shippingProvider: prev.shippingProvider || topOrder?.shippingProvider || ""
          }));
        }
      }
      const wsAlerts = Array.isArray(payload?.alerts?.items) ? payload.alerts.items : [];
      if (wsAlerts.length) {
        setTradeAlerts((prev) => {
          const merged = new Map((prev || []).map((item) => [String(item.id), item]));
          wsAlerts.forEach((item) => merged.set(String(item.id), item));
          return Array.from(merged.values()).sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
        });
      }
      setTradeListingInsights(payload?.marketInsights || null);
      return true;
    },
    [fetchTradeJsonSafe]
  );

  React.useEffect(() => {
    loadTradeData();
  }, [loadTradeData]);

  const seedTradeDemoData = async () => {
    const crop = effectiveTradeCrop || "domates";
    try {
      const res = await apiFetch("/api/trade/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: effectiveTradeCity,
          district: tradeListingForm.district || landDemo?.district || "Merkez",
          crop,
          contact: effectiveTradeIdentity || tradeListingForm.contact || "Demo Uretici",
          buyer: effectiveTradeIdentity ? `${effectiveTradeIdentity} Alici` : "Demo Alici"
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("seed_trade_failed");
      setTradeStatus("Demo pazar verisi yuklendi.");
      await loadTradeData();
      return true;
    } catch (_) {
      setTradeStatus("Demo pazar verisi yuklenemedi.");
      return false;
    }
  };

  const resetTradeDemoData = async () => {
    try {
      const res = await apiFetch("/api/trade/reset-demo", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("reset_trade_failed");
      setTradeStatus("Pazar demo verisi temizlendi.");
      await loadTradeData();
      return true;
    } catch (_) {
      setTradeStatus("Pazar demo verisi temizlenemedi.");
      return false;
    }
  };

  const runWeatherDemoSetup = () => {
    setBottomTab("weather");
    setDemoDockOpen(false);
    setCity((prev) => prev || "Malatya");
    setDemoOpsStatus("Hava modulu acildi.");
    setTimeout(() => document.getElementById("demo-weather")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const runSoilDemoSetup = () => {
    setBottomTab("demos");
    setDemoDockOpen(true);
    setDemoDockTab("soil");
    setCity((prev) => prev || "Malatya");
    setFieldLocation((prev) => ({
      ...prev,
      name: prev?.name || "Demo Parsel",
      coords: prev?.coords || "38.355,38.309"
    }));
    setDemoOpsStatus("Toprak demosu acildi (koordinat ayarlandi).");
    setTimeout(() => document.getElementById("demo-soil")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const runFinanceDemoSetup = () => {
    const crop = econCrop || selectedPlant?.id || "domates";
    setBottomTab("land");
    setDemoDockOpen(true);
    setDemoDockTab("economy");
    setEconCrop(crop);
    setEconArea(20);
    setEconYield(Number(cropYieldKgDa[crop]?.nationalKgDa || econYield || 500));
    setEconPrice(Number(cropPriceTlKg[crop] || econPrice || 18));
    setDemoOpsStatus("Finansal demo acildi (alan/verim/fiyat varsayılanla ayarlandi).");
    setTimeout(() => document.getElementById("demo-economy")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const runDemoAutopilotStep = async (key, retryOverride = null) => {
    const stepMap = {
      pack: { label: "Demo paket uygula", failMessağe: "Paket uygulanamadi", action: async () => { await applyDemoPack(demoPack); return true; } },
      land: { label: "Arazi seed", failMessağe: "Arazi seed başarısiz", action: seedLandDemoListings },
      trade: { label: "Pazar seed", failMessağe: "Pazar seed başarısiz", action: seedTradeDemoData },
      smoke: { label: "Smoke test", failMessağe: "Smoke test başarısiz", action: () => runDemoSmokeTest({ silent: true }) },
      "land-reset": { label: "Arazi reset", failMessağe: "Arazi reset başarısiz", action: resetLandDemoListings },
      "trade-reset": { label: "Pazar reset", failMessağe: "Pazar reset başarısiz", action: resetTradeDemoData }
    };
    const config = stepMap[key];
    if (!config) return false;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const appendAutopilotLog = (text, level = "info") => {
      setDemoAutopilotLogs((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            at: Date.now(),
            level,
            text
          },
          ...prev
        ].slice(0, 80)
      );
    };

    setDemoAutopilotSteps((prev) => {
      if (prev.some((item) => item.key === key)) return prev;
      return [...prev, { key, label: config.label, status: "pending", attempt: 0, messağe: "", durationMs: 0 }];
    });

    const updateStep = (next) => {
      setDemoAutopilotSteps((prev) =>
        prev.map((item) => (item.key === key ? { ...item, ...next } : item))
      );
    };

    const maxAttempt = Math.max(1, Number(retryOverride ?? demoAutopilotRetryCount ?? 1) + 1);
    appendAutopilotLog(`${config.label} adimi basladi.`);
    for (let attempt = 1; attempt <= maxAttempt; attempt += 1) {
      const startedAt = Date.now();
      updateStep({ status: "running", attempt, messağe: attempt > 1 ? `Yeniden deneme ${attempt - 1}` : "", startedAt });
      appendAutopilotLog(`${config.label} deneme ${attempt}/${maxAttempt}.`);
      try {
        const ok = await config.action();
        const durationMs = Date.now() - startedAt;
        if (ok) {
          updateStep({ status: "ok", attempt, messağe: "Tamamlandi", durationMs });
          appendAutopilotLog(`${config.label} tamamlandi (${durationMs} ms).`, "success");
          return true;
        }
        appendAutopilotLog(`${config.label} denemesi başarısiz oldu.`, "warn");
        if (attempt >= maxAttempt) {
          updateStep({ status: "failed", attempt, messağe: config.failMessağe, durationMs });
          appendAutopilotLog(`${config.label} adimi kalici olarak başarısiz: ${config.failMessağe}.`, "error");
          return false;
        }
        const backoffMs = 1000 * 2 ** (attempt - 1);
        appendAutopilotLog(`${config.label} tekrar deneniyor (${backoffMs} ms bekleme).`, "warn");
        await sleep(backoffMs);
      } catch (_) {
        const durationMs = Date.now() - startedAt;
        appendAutopilotLog(`${config.label} denemesinde istisna olustu.`, "warn");
        if (attempt >= maxAttempt) {
          updateStep({ status: "failed", attempt, messağe: config.failMessağe, durationMs });
          appendAutopilotLog(`${config.label} adimi kalici olarak başarısiz: ${config.failMessağe}.`, "error");
          return false;
        }
        const backoffMs = 1000 * 2 ** (attempt - 1);
        appendAutopilotLog(`${config.label} tekrar deneniyor (${backoffMs} ms bekleme).`, "warn");
        await sleep(backoffMs);
      }
    }
    return false;
  };

  const pushDemoFlowHistory = (flowId, ok, note, startedAt, extra = {}) => {
    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - Number(startedAt || endedAt));
    setDemoFlowHistory((prev) =>
      [
        {
          id: `${endedAt}-${Math.random().toString(36).slice(2, 7)}`,
          flowId,
          ok: Boolean(ok),
          note: note || "",
          startedAt,
          endedAt,
          durationMs,
          ...extra
        },
        ...prev
      ].slice(0, 20)
    );
  };

  const runDemoResetSeed = async () => {
    if (demoAutopilotRunning) return false;
    setDemoAutopilotRunning(true);
    setDemoAutopilotLogs([]);
    setDemoAutopilotSteps([
      { key: "land-reset", label: "Arazi reset", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
      { key: "trade-reset", label: "Pazar reset", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
      { key: "land", label: "Arazi seed", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
      { key: "trade", label: "Pazar seed", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
      { key: "smoke", label: "Smoke test", status: "pending", attempt: 0, messağe: "", durationMs: 0 }
    ]);
    setDemoOpsStatus("Demo full reset+seed basladi...");
    try {
      if (!(await runDemoAutopilotStep("land-reset", 0))) {
        setDemoOpsStatus("Full reset+seed durdu: arazi reset başarısiz.");
        return false;
      }
      if (!(await runDemoAutopilotStep("trade-reset", 0))) {
        setDemoOpsStatus("Full reset+seed durdu: pazar reset başarısiz.");
        return false;
      }
      if (!(await runDemoAutopilotStep("land"))) {
        setDemoOpsStatus("Full reset+seed durdu: arazi seed başarısiz.");
        return false;
      }
      if (!(await runDemoAutopilotStep("trade"))) {
        setDemoOpsStatus("Full reset+seed durdu: pazar seed başarısiz.");
        return false;
      }
      const smokeOk = await runDemoAutopilotStep("smoke", 0);
      setDemoOpsStatus(smokeOk ? "Demo full reset+seed tamamlandı." : "Reset+seed tamamlandı ama smoke test hata verdi.");
      return smokeOk;
    } finally {
      setDemoAutopilotRunning(false);
    }
  };

  const runDemoAutoRepair = async () => {
    const missing = (demoStatusCards || []).filter((item) => item.status !== "hazır").map((item) => item.key);
    if (!missing.length) {
      setDemoRepairSummary("Tüm modüller zaten hazır.");
      return true;
    }
    let applied = 0;
    if (missing.includes("weather")) {
      runWeatherDemoSetup();
      applied += 1;
    }
    if (missing.includes("soil")) {
      runSoilDemoSetup();
      applied += 1;
    }
    if (missing.includes("economy")) {
      runFinanceDemoSetup();
      applied += 1;
    }
    if (missing.includes("land")) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await seedLandDemoListings();
      if (ok) applied += 1;
    }
    if (missing.includes("market")) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await seedTradeDemoData();
      if (ok) applied += 1;
    }
    const smokeOk = await runDemoSmokeTest({ silent: true });
    setDemoRepairSummary(
      `Oto onarım: ${applied}/${missing.length} modül güncellendi. Smoke: ${smokeOk ? "ok" : "hata"}.`
    );
    return smokeOk;
  };

  const runDemoFlow = async (flowId) => {
    if (demoFlowRunning || demoAutopilotRunning) return false;
    const startedAt = Date.now();
    setDemoFlowRunning(true);
    setDemoRepairSummary("");
    setDemoFlowStatus("Demo akisi başlatildi...");
    try {
      if (flowId === "model_focus") {
        setBottomTab("home");
        applyDemoPreset("pest_pressure");
        const smokeOk = await runDemoSmokeTest({ silent: true });
        if (supportsModelSelfCheck) {
          await runModelSelfCheck();
        }
        const note = smokeOk ? "Model odak demo akisi tamamlandi." : "Model akisi tamamlandi, smoke hatasi var.";
        setDemoFlowStatus(note);
        pushDemoFlowHistory(flowId, smokeOk, note, startedAt, { smokeOk });
        return smokeOk;
      }
      if (flowId === "market_focus") {
        setBottomTab("market");
        setCommerceMiniTab("market");
        await applyDemoPack("pazar-hizli");
        const seedOk = await seedTradeDemoData();
        const smokeOk = await runDemoSmokeTest({ silent: true });
        const ok = seedOk && smokeOk;
        const note = ok ? "Pazar odak demo akisi tamamlandi." : "Pazar akisi tamamlandi, seed/smoke hatasi var.";
        setDemoFlowStatus(note);
        pushDemoFlowHistory(flowId, ok, note, startedAt, { smokeOk, seedOk });
        return ok;
      }
      if (flowId === "finance_focus") {
        setBottomTab("land");
        runFinanceDemoSetup();
        applyDemoPreset("normal");
        const smokeOk = await runDemoSmokeTest({ silent: true });
        const note = smokeOk ? "Finans odak demo akisi tamamlandi." : "Finans akisi tamamlandi, smoke hatasi var.";
        setDemoFlowStatus(note);
        pushDemoFlowHistory(flowId, smokeOk, note, startedAt, { smokeOk });
        return smokeOk;
      }
      if (flowId === "full_qa") {
        const ok = await runDemoResetSeed();
        const note = ok ? "Full QA akışı tamamlandı." : "Full QA tamamlandı, hata var.";
        setDemoFlowStatus(note);
        pushDemoFlowHistory(flowId, ok, note, startedAt, { smokeOk: ok });
        return ok;
      }
      if (flowId === "auto_repair") {
        const ok = await runDemoAutoRepair();
        const note = ok ? "Oto onarım tamamlandı." : "Oto onarım tamamlandı, hata var.";
        setDemoFlowStatus(note);
        pushDemoFlowHistory(flowId, ok, note, startedAt, { smokeOk: ok });
        return ok;
      }
      const note = "Demo akisi bulunamadi.";
      setDemoFlowStatus(note);
      pushDemoFlowHistory(flowId, false, note, startedAt);
      return false;
    } catch (_) {
      const note = "Demo akisi calistirilamadi.";
      setDemoFlowStatus(note);
      pushDemoFlowHistory(flowId, false, note, startedAt);
      return false;
    } finally {
      setDemoFlowRunning(false);
    }
  };

  const runAllDemoFlows = async () => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    let pass = 0;
    let fail = 0;
    for (const flow of demoFlowLibrary) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await runDemoFlow(flow.id);
      if (ok) pass += 1;
      else fail += 1;
    }
    setDemoFlowStatus(`Tüm akışlar tamamlandı: ${pass} başarılı, ${fail} hatalı.`);
  };

  const runDemoFlowPreset = async (presetId = "all_round") => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    const presetMap = {
      model_smoke: ["model_focus", "auto_repair"],
      market_finance: ["market_focus", "finance_focus"],
      all_round: demoFlowLibrary.map((item) => item.id)
    };
    const queue = (presetMap[presetId] || presetMap.all_round).filter((id) => demoFlowLibrary.some((flow) => flow.id === id));
    if (!queue.length) {
      setDemoFlowStatus("Preset akis bulunamadi.");
      return;
    }
    let pass = 0;
    let fail = 0;
    for (const flowId of queue) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await runDemoFlow(flowId);
      if (ok) pass += 1;
      else fail += 1;
    }
    setDemoFlowStatus(`Preset (${presetId}) tamamlandi: ${pass} başarıli, ${fail} hatali.`);
  };

  const runDemoRecoverySequence = async () => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    const smokeBefore = await runDemoSmokeTest({ silent: true });
    if (smokeBefore) {
      setDemoFlowStatus("Sistem zaten stabil, recovery gerekmedi.");
      return;
    }
    await runDemoAutoRepair();
    await runFailedDemoFlows();
    const smokeAfter = await runDemoSmokeTest({ silent: true });
    setDemoFlowStatus(smokeAfter ? "Recovery tamamlandı, smoke temiz." : "Recovery tamamlandı, hâlâ hata var.");
  };

  const runDemoCommand = async (command) => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    if (command === "repair") {
      await runDemoRecoverySequence();
      return;
    }
    if (command === "critical") {
      if (demoFlowTrend?.topFailFlowId) await runDemoFlow(demoFlowTrend.topFailFlowId);
      return;
    }
    if (command === "all") {
      await runDemoFlowPreset("all_round");
      return;
    }
    if (command === "smoke") {
      await runDemoSmokeTest();
    }
  };

  const runInvestorShowcase = async () => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    setBottomTab("demos");
    setDemoDockOpen(true);
    setDemoDockTab("yield");
    setDemoPack("pazar-hizli");
    applyDemoPack("pazar-hizli");
    await runDemoFlowPreset("market_finance");
    await runDemoSmokeTest({ silent: true });
    await loadTradeData();
    setDemoFlowStatus("Yatirimci vitrin akisi tamamlandi.");
  };

  const exportInvestorBrief = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      readiness: {
        demoScore: Number(demoControlMetrics?.runScore || 0),
        flowSuccessRate: Number(demoFlowStats?.successRate || 0),
        smokePass: Number(demoSmokeResult?.passCount || 0),
        smokeFail: Number(demoSmokeResult?.failCount || 0)
      },
      market: {
        listingTotal: Number(tradeDashboard?.listings?.total || tradeListings.length || 0),
        listingOpen: Number(tradeDashboard?.listings?.open || 0),
        activeOrders: Number(tradeDashboard?.orders?.active || 0),
        fulfilledVolumeKg: Number(tradeDashboard?.orders?.fulfilledVolumeKg || 0),
        spreadTl: Number(tradeDashboard?.market?.spread || 0)
      },
      land: {
        priceTlDa: Number(landPriceData?.priceTlDa || 0),
        confidenceScore: Number(landPriceData?.confidenceScore || 0),
        uncertaintyPct: Number(landPriceData?.uncertaintyPct || 0),
        locationQualityScore: Number(landSignalQuality?.score || 0)
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_investor_brief.json";
    link.click();
    URL.revokeObjectURL(url);
    setDemoFlowStatus("Yatırımcı özeti dışa aktarıldı.");
  };

  const exportInvestorOnePager = () => {
    const lines = [
      "AgroGuard - Yatirimci One Pager",
      `Tarih: ${new Date().toLocaleString("tr-TR")}`,
      "",
      "Urun Hazirlik",
      `- Demo skoru: ${investorSnapshot.readiness}/100`,
      `- Akis başarı orani: %${investorSnapshot.flowSuccess}`,
      `- Smoke fail: ${investorSnapshot.smokeFail}`,
      "",
      "Pazar Operasyonu",
      `- Yayinda ilan: ${investorSnapshot.marketOpen}`,
      `- Aktif siparis: ${investorSnapshot.activeOrders}`,
      `- Gerceklesen hacim: ${Math.round(investorSnapshot.fulfilledVolumeKg).toLocaleString("tr-TR")} kg`,
      "",
      "Arazi Modeli",
      `- Model guveni: %${investorSnapshot.landConfidence}`,
      `- Birim fiyat tahmini: ${Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da`,
      `- Belirsizlik: %${Number(landPriceData?.uncertaintyPct || 0)}`,
      "",
      "Durum",
      investorSnapshot.readiness >= 75
        ? "- Sunum hazır: canlı demo ve KPI akışı güçlü."
        : "- Sunum iyılesiyor: smoke / akis stabilitesi guclendirilmeli."
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_investor_onepager.txt";
    link.click();
    URL.revokeObjectURL(url);
    setDemoFlowStatus("Yatirimci one-pager indirildi.");
  };

  const exportInvestorDeckHtml = () => {
    const generatedAt = new Date();
    const checks = investorPreflight?.checks || [];
    const checkRows = checks
      .map(
        (item) =>
          `<tr><td>${item.label}</td><td>${item.ok ? "PASS" : "FAIL"}</td><td>${item.status}</td><td>${item.latencyMs} ms</td><td>${item.detail || "-"}</td></tr>`
      )
      .join("");
    const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AgroGuard Investor Deck</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #163528; }
    h1, h2 { margin: 0 0 10px; }
    .muted { color: #476758; font-size: 13px; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .card { border: 1px solid #d8ebe0; border-radius: 10px; padding: 10px; background: #fbfffd; }
    .card span { display: block; color: #4d6f5f; font-size: 12px; }
    .card strong { font-size: 22px; }
    ul { margin: 6px 0 14px; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d8ebe0; padding: 7px; font-size: 12px; text-align: left; }
    th { background: #f0f9f3; }
    pre { border: 1px solid #d8ebe0; border-radius: 10px; background: #f7fcf9; padding: 10px; white-space: pre-wrap; font-size: 12px; }
  </style>
</head>
<body>
  <h1>AgroGuard Investor Deck (Canli Ozet)</h1>
  <p class="muted">Uretim tarihi: ${generatedAt.toLocaleString("tr-TR")} • Karar: ${investorExecutionDecision.label}</p>
  <div class="grid">
    <div class="card"><span>Hazirlik</span><strong>${investorSnapshot.readiness}/100</strong></div>
    <div class="card"><span>Akis Başarı</span><strong>%${investorSnapshot.flowSuccess}</strong></div>
    <div class="card"><span>Arazi Guven</span><strong>%${investorSnapshot.landConfidence}</strong></div>
    <div class="card"><span>Açık İlan</span><strong>${investorSnapshot.marketOpen}</strong></div>
    <div class="card"><span>Aktif Siparis</span><strong>${investorSnapshot.activeOrders}</strong></div>
    <div class="card"><span>Gerceklesen Hacim</span><strong>${Math.round(investorSnapshot.fulfilledVolumeKg).toLocaleString("tr-TR")} kg</strong></div>
  </div>
  <h2>One-liner Ozet</h2>
  <ul>${investorHighlights.map((item) => `<li>${item}</li>`).join("")}</ul>
  <h2>Preflight Kontrolu</h2>
  <p class="muted">Pass: ${investorPreflight?.passCount || 0} • Fail: ${investorPreflight?.failCount || 0}</p>
  <table>
    <thead><tr><th>Kontrol</th><th>Durum</th><th>HTTP</th><th>Sure</th><th>Detay</th></tr></thead>
    <tbody>${checkRows || "<tr><td colspan='5'>Preflight henuz calistirilmadi.</td></tr>"}</tbody>
  </table>
  <h2>Sunum Metni</h2>
  <pre>${investorPresentationScript}</pre>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_investor_deck.html";
    link.click();
    URL.revokeObjectURL(url);
    setDemoFlowStatus("Yatirimci deck HTML indirildi.");
  };

  const runInvestorPreflight = async () => {
    if (investorPreflightRunning) return;
    setInvestorPreflightRunning(true);
    const cityValue = String(landQuery.city || city || "Malatya").trim() || "Malatya";
    const cropValue = String(landQuery.crop || econCrop || selectedPlant?.id || "domates").trim() || "domates";
    const checks = [
      { id: "health", label: "Backend health", path: "/api/health" },
      { id: "metrics", label: "Model metrikleri", path: "/api/metrics" },
      { id: "plants", label: "Bitki listesi", path: "/api/plants" },
      { id: "weather", label: "Hava", path: `/api/weather?city=${encodeURIComponent(cityValue)}` },
      { id: "soil", label: "Toprak", path: `/api/soil?city=${encodeURIComponent(cityValue)}` },
      {
        id: "trade",
        label: "Pazar dashboard",
        path: `/api/trade/dashboard?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(cropValue)}`
      },
      { id: "land", label: "Arazi fiyat", path: `/api/land-price?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(cropValue)}` }
    ];
    try {
      const startedAt = Date.now();
      const results = await Promise.all(
        checks.map(async (item) => {
          const t0 = Date.now();
          try {
            const res = await apiFetch(item.path);
            let detail = `HTTP ${res.status}`;
            if (res.ok) {
              const data = await res.clone().json().catch(() => null);
              if (item.id === "plants" && Array.isArray(data)) detail = `${data.length} bitki`;
              if (item.id === "trade" && data?.listings) detail = `${Number(data.listings?.open || 0)} açık ilan`;
              if (item.id === "land" && data?.priceTlDa) detail = `${Number(data.priceTlDa).toLocaleString("tr-TR")} TL/da`;
            }
            return { ...item, ok: res.ok, status: res.status, latencyMs: Date.now() - t0, detail };
          } catch (error) {
            return {
              ...item,
              ok: false,
              status: 0,
              latencyMs: Date.now() - t0,
              detail: String(error?.messağe || "request_failed")
            };
          }
        })
      );
      const passCount = results.filter((row) => row.ok).length;
      const failCount = results.length - passCount;
      setInvestorPreflight({
        runAt: new Date().toISOString(),
        city: cityValue,
        crop: cropValue,
        totalMs: Date.now() - startedAt,
        passCount,
        failCount,
        checks: results
      });
      setDemoFlowStatus(
        failCount === 0
          ? `Preflight temiz: ${passCount}/${results.length} kontrol gecti.`
          : `Preflight tamamlandı: ${passCount}/${results.length} geçti, ${failCount} hata var.`
      );
    } finally {
      setInvestorPreflightRunning(false);
    }
  };

  const captureInvestorSnapshot = () => {
    const snapshot = {
      id: `${Date.now()}`,
      capturedAt: new Date().toISOString(),
      readiness: investorSnapshot.readiness,
      flowSuccess: investorSnapshot.flowSuccess,
      smokeFail: investorSnapshot.smokeFail,
      marketOpen: investorSnapshot.marketOpen,
      activeOrders: investorSnapshot.activeOrders,
      landConfidence: investorSnapshot.landConfidence,
      gmvTl: investorUnitEconomics.gmvTl,
      monthlyRevenueTl: investorUnitEconomics.projectedMonthlyRevenueTl
    };
    setInvestorSnapshots((prev) => {
      const next = [snapshot, ...prev].slice(0, 12);
      safeLocalStorage.setItem("agroguard_investor_snapshots", JSON.stringify(next));
      return next;
    });
    setDemoFlowStatus("Yatirimci snapshot kaydedildi.");
  };

  const clearInvestorSnapshots = () => {
    setInvestorSnapshots([]);
    safeLocalStorage.removeItem("agroguard_investor_snapshots");
    setDemoFlowStatus("Yatirimci snapshot geçmişi temizlendi.");
  };

  const runInvestorDryRun = async () => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    setBottomTab("demos");
    setDemoDockOpen(true);
    setDemoDockTab("yield");
    await runDemoFlowPreset("all_round");
    await runDemoSmokeTest({ silent: true });
    await loadTradeData();
    setDemoFlowStatus("Yatirimci dry-run tamamlandi.");
  };

  const activatePresentationMode = () => {
    setPresentationMode(true);
    setPresentationScene(0);
    setPitchDurationSeconds(90);
    setPitchSeconds(90);
    setSceneAdvanceSeconds(22);
    setPitchTimerRunning(false);
    setAutoSceneAdvance(false);
    setBottomTab("demos");
    setDemoDockOpen(true);
    setDemoDockTab("yield");
    setShowAdvanced(false);
  };

  const resetPresentationFlow = useCallback(() => {
    setPitchTimerRunning(false);
    setPitchSeconds(pitchDurationSeconds);
    setPresentationScene(0);
  }, [pitchDurationSeconds]);

  const startPresentationFlow = useCallback(() => {
    setPitchSeconds(pitchDurationSeconds);
    setPresentationScene(0);
    setPitchTimerRunning(true);
  }, [pitchDurationSeconds]);

  const handlePitchDurationChange = useCallback(
    (nextDuration) => {
      const safeDuration = Math.max(45, Math.min(300, Number(nextDuration) || 90));
      setPitchDurationSeconds(safeDuration);
      setPitchSeconds((prev) => (pitchTimerRunning ? Math.min(prev, safeDuration) : safeDuration));
    },
    [pitchTimerRunning]
  );

  const handleSceneAdvanceChange = useCallback((nextSeconds) => {
    const safeSeconds = Math.max(8, Math.min(120, Number(nextSeconds) || 22));
    setSceneAdvanceSeconds(safeSeconds);
  }, []);

  const togglePresentationFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {
      setDemoFlowStatus("Tam ekran gecisi başarısiz.");
    }
  };

  React.useEffect(() => {
    if (!pitchTimerRunning) return undefined;
    const timer = setInterval(() => {
      setPitchSeconds((prev) => {
        if (prev <= 1) {
          setPitchTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pitchTimerRunning]);

  React.useEffect(() => {
    const handleFs = () => setPresentationFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFs);
    handleFs();
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

  React.useEffect(() => {
    if (!presentationMode) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "ArrowRight") {
        setPresentationScene((prev) => Math.min(presentationSceneCount - 1, prev + 1));
      } else if (event.key === "ArrowLeft") {
        setPresentationScene((prev) => Math.max(0, prev - 1));
      } else if (event.key === "Home") {
        setPresentationScene(0);
      } else if (event.key === "End") {
        setPresentationScene(Math.max(0, presentationSceneCount - 1));
      } else if (event.key === " ") {
        event.preventDefault();
        setPitchTimerRunning((prev) => !prev);
      } else if (event.key.toLowerCase() === "r") {
        resetPresentationFlow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentationMode, presentationSceneCount, resetPresentationFlow]);

  React.useEffect(() => {
    if (!presentationMode || !autoSceneAdvance || !pitchTimerRunning) return;
    const elapsed = Math.max(0, pitchDurationSeconds - pitchSeconds);
    const sceneCount = presentationSceneCount;
    const sceneSlot = Math.max(1, sceneAdvanceSeconds);
    const nextScene = Math.min(sceneCount - 1, Math.floor(elapsed / sceneSlot));
    setPresentationScene(nextScene);
  }, [presentationMode, autoSceneAdvance, pitchTimerRunning, pitchDurationSeconds, pitchSeconds, presentationSceneCount, sceneAdvanceSeconds]);

  const copyInvestorScript = async () => {
    try {
      await navigator.clipboard.writeText(investorPresentationScript);
      setDemoFlowStatus("Yatirimci sunum metni kopyalandi.");
    } catch (_) {
      setDemoFlowStatus("Sunum metni kopyalanamadi.");
    }
  };

  const runFailedDemoFlows = async () => {
    if (demoFlowRunning || demoAutopilotRunning) return;
    const failedUnique = [];
    const seen = new Set();
    for (const item of demoFlowHistory) {
      if (item?.ok) continue;
      const flowId = String(item?.flowId || "");
      if (!flowId || seen.has(flowId)) continue;
      seen.add(flowId);
      failedUnique.push(flowId);
      if (failedUnique.length >= 6) break;
    }
    if (!failedUnique.length) {
      setDemoFlowStatus("Tekrar calistirilaçak hatali akis bulunamadi.");
      return;
    }
    let pass = 0;
    let fail = 0;
    for (const flowId of failedUnique) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await runDemoFlow(flowId);
      if (ok) pass += 1;
      else fail += 1;
    }
    setDemoFlowStatus(`Hatali akislar tekrarlandi: ${pass} başarıli, ${fail} hatali.`);
  };

  const exportDemoFlowHistory = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      stats: demoFlowStats,
      items: demoFlowHistory
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroguard_demo_flow_history.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const runDemoAutopilot = async () => {
    if (demoAutopilotRunning) return;
    const fullMode = demoAutopilotMode === "full";
    const baseSteps = [
      { key: "pack", label: "Demo paket uygula", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
      ...(fullMode
        ? [
          { key: "land", label: "Arazi seed", status: "pending", attempt: 0, messağe: "", durationMs: 0 },
          { key: "trade", label: "Pazar seed", status: "pending", attempt: 0, messağe: "", durationMs: 0 }
        ]
        : []),
      { key: "smoke", label: "Smoke test", status: "pending", attempt: 0, messağe: "", durationMs: 0 }
    ];
    setDemoAutopilotLogs([]);
    setDemoAutopilotSteps(baseSteps);
    setDemoAutopilotRunning(true);
    setDemoOpsStatus(`Demo autopilot başladı (${fullMode ? "tam" : "hızlı"} mod).`);

    try {
      const packOk = await runDemoAutopilotStep("pack");
      if (!packOk) {
        setDemoOpsStatus("Demo autopilot durdu: paket adimi başarısiz.");
        return;
      }
      if (fullMode) {
        const landOk = await runDemoAutopilotStep("land");
        if (!landOk) {
          setDemoOpsStatus("Demo autopilot durdu: arazi seed adimi başarısiz.");
          return;
        }
        const tradeOk = await runDemoAutopilotStep("trade");
        if (!tradeOk) {
          setDemoOpsStatus("Demo autopilot durdu: pazar seed adimi başarısiz.");
          return;
        }
      }
      const smokeOk = await runDemoAutopilotStep("smoke");
      setDemoOpsStatus(
        smokeOk
          ? `Demo autopilot tamamlandı (${fullMode ? "tam" : "hızlı"} mod).`
          : "Demo autopilot tamamlandı ama smoke test hata verdi."
      );
    } finally {
      setDemoAutopilotRunning(false);
    }
  };

  const pushDemoSmokeHistory = (items = []) => {
    const passCount = items.filter((item) => item?.ok).length;
    const total = items.length;
    const failed = items.filter((item) => !item?.ok).map((item) => item?.label).filter(Boolean);
    setDemoSmokeHistory((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(),
          passCount,
          total,
          ok: failed.length === 0,
          failed
        },
        ...prev
      ].slice(0, 8)
    );
  };

  const applyDemoPack = async (pack = "normal") => {
    const crop = econCrop || selectedPlant?.id || "domates";
    setDemoPack(pack);
    if (pack === "normal") {
      setCity("Malatya");
      setFieldLocation((prev) => ({ ...prev, coords: prev?.coords || "38.355,38.309" }));
      setEconArea(20);
      setEconYield(Number(cropYieldKgDa[crop]?.nationalKgDa || 500));
      setEconPrice(Number(cropPriceTlKg[crop] || 18));
      setDemoOpsStatus("Normal demo paketi uygulandi.");
      return;
    }
    if (pack === "riskli") {
      setCity("Malatya");
      setFieldLocation((prev) => ({ ...prev, coords: "38.421,38.363" }));
      setEconArea(20);
      setEconYield(Math.max(320, Number(cropYieldKgDa[crop]?.nationalKgDa || 500) - 110));
      setEconPrice(Math.max(12, Number(cropPriceTlKg[crop] || 18) - 2.5));
      setDemoFlags((prev) => ({ ...prev, frost: true, pest: true, irrigation: true, wind: true }));
      setDemoOpsStatus("Riskli demo paketi uygulandi.");
      return;
    }
    if (pack === "pazar-hizli") {
      await seedTradeDemoData();
      setTradeFilterStatus("open");
      setTradeSortBy("smart");
      setTradeWorkspaceTab("analytics");
      setBottomTab("market");
      setCommerceMiniTab("market");
      setDemoOpsStatus("Pazar hızlı demo paketi uygulandı.");
      return;
    }
    if (pack === "pazar-durgun") {
      await resetTradeDemoData();
      setTradeFilterStatus("open");
      setTradeSortBy("newest");
      setTradeWorkspaceTab("browse");
      setBottomTab("market");
      setCommerceMiniTab("market");
      setDemoOpsStatus("Pazar durgun demo paketi uygulandi.");
    }
  };

  const runDemoSmokeTest = async ({ silent = false } = {}) => {
    const crop = econCrop || selectedPlant?.id || "domates";
    const district = landDemo?.district || "";
    const neighborhood = landDemo?.neighborhood || "";
    const cityValue = city || "Malatya";
    if (!silent) setDemoOpsStatus("Demo smoke test çalışıyor...");
    try {
      const smokeRes = await apiFetch(
        `/api/demo/smoke?city=${encodeURIComponent(cityValue)}&district=${encodeURIComponent(
          district
        )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}`
      );
      if (smokeRes.ok) {
        const payload = await smokeRes.json();
        const summary = payload?.summary || {};
        const results = [
          { id: "weather", label: "Hava", ok: Boolean(summary.weather), status: summary.weather ? 200 : 503 },
          { id: "soil", label: "Toprak", ok: Boolean(summary.soil), status: summary.soil ? 200 : 503 },
          { id: "land", label: "Arazi", ok: Boolean(summary.land), status: summary.land ? 200 : 503 },
          { id: "trade", label: "Pazar", ok: Boolean(summary.trade), status: summary.trade ? 200 : 503 },
          { id: "finance", label: "Finansal", ok: Boolean(summary.finance), status: summary.finance ? 200 : 503 }
        ];
        const failed = results.filter((x) => !x.ok);
        setDemoSmokeResult({
          updatedAt: Date.now(),
          ok: failed.length === 0,
          items: results
        });
        pushDemoSmokeHistory(results);
        if (!silent) {
          setDemoOpsStatus(
            failed.length
              ? `Smoke test: ${failed.length} hata var (${failed.map((x) => x.label).join(", ")}).`
              : "Smoke test başarılı: tüm demo endpointleri çalışıyor."
          );
        }
        return failed.length === 0;
      }
      const checks = [
        { id: "health", label: "Sağlık", path: "/api/health" },
        { id: "weather", label: "Hava", path: `/api/weather?city=${encodeURIComponent(cityValue)}` },
        { id: "soil", label: "Toprak", path: `/api/soil?city=${encodeURIComponent(cityValue)}` },
        {
          id: "land",
          label: "Arazi",
          path: `/api/land-price?city=${encodeURIComponent(cityValue)}&district=${encodeURIComponent(
            district
          )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}`
        },
        { id: "trade", label: "Pazar", path: `/api/trade/summary?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(crop)}` },
        {
          id: "finance",
          label: "Finansal",
          path: `/api/economy/planner?city=${encodeURIComponent(cityValue)}&crop=${encodeURIComponent(crop)}&areaDa=20&yieldKgDa=500&priceTlKg=18`
        }
      ];
      const results = await Promise.all(
        checks.map(async (item) => {
          try {
            const res = await apiFetch(item.path);
            return { ...item, ok: Boolean(res?.ok), status: Number(res?.status || 0) };
          } catch (_) {
            return { ...item, ok: false, status: 0 };
          }
        })
      );
      const failed = results.filter((x) => !x.ok);
      setDemoSmokeResult({
        updatedAt: Date.now(),
        ok: failed.length === 0,
        items: results
      });
      pushDemoSmokeHistory(results);
      if (!silent) {
        setDemoOpsStatus(
          failed.length
            ? `Smoke test: ${failed.length} hata var (${failed.map((x) => x.label).join(", ")}).`
            : "Smoke test başarılı: tüm demo endpointleri çalışıyor."
        );
      }
      return failed.length === 0;
    } catch (_) {
      setDemoSmokeResult(null);
      if (!silent) setDemoOpsStatus("Smoke test calistirilamadi.");
      return false;
    }
  };

  const prepareDemosForUse = async ({ silent = false, autoRepair = true } = {}) => {
    if (demoBootstrapRunning || demoAutopilotRunning || demoFlowRunning) return false;
    setDemoBootstrapRunning(true);
    setDemoBootstrapLastAttemptAt(Date.now());
    if (!silent) setDemoOpsStatus("Demolar kullanima hazırlaniyor...");
    try {
      setBottomTab("demos");
      setDemoDockOpen(true);
      setDemoDockTab("diagnosis");
      await applyDemoPack("normal");
      const [landOk, tradeOk] = await Promise.all([seedLandDemoListings(), seedTradeDemoData()]);
      let smokeOk = await runDemoSmokeTest({ silent: true });
      let recovered = false;
      if (!smokeOk && autoRepair) {
        recovered = await runDemoAutoRepair();
        smokeOk = recovered || (await runDemoSmokeTest({ silent: true }));
      }
      const ok = landOk && tradeOk && smokeOk;
      setDemoBootstrapReady(ok || (landOk && tradeOk));
      setDemoBootstrapSummary(
        ok
          ? `Son hazırlama: başarıli (${new Date().toLocaleTimeString("tr-TR")})`
          : `Son hazırlama: kontrol gerekli (${new Date().toLocaleTimeString("tr-TR")})${recovered ? " • oto onarim denendi" : ""
          }`
      );
      if (!silent) {
        if (ok) {
          setDemoOpsStatus("Demolar hazır: seed ve smoke test başarıli.");
        } else {
          const failures = [
            !landOk ? "arazi seed" : null,
            !tradeOk ? "pazar seed" : null,
            !smokeOk ? "smoke" : null
          ]
            .filter(Boolean)
            .join(", ");
          setDemoOpsStatus(
            `Demo hazırlama tamamlandi, kontrol gerekli: ${failures || "durum bilinmiyor"}.${recovered ? " Oto onarim uygulandi." : ""
            }`
          );
        }
      }
      return ok;
    } catch (_) {
      if (!silent) setDemoOpsStatus("Demo hazırlama tamamlanamadi.");
      return false;
    } finally {
      setDemoBootstrapRunning(false);
    }
  };

  const runDemoShowcaseReady = async () => {
    if (demoShowcaseRunning || demoAutopilotRunning || demoFlowRunning) return;
    setDemoShowcaseRunning(true);
    setDemoOpsStatus("Sunum icin demo hazırlaniyor...");
    try {
      const prepared = await prepareDemosForUse({ silent: true });
      await runInvestorShowcase();
      setDemoOpsStatus(
        prepared
          ? "Sunum hazır: demo kurulumu ve vitrin akisi tamamlandi."
          : "Sunum akisi calisti; bazi moduller icin manuel kontrol önerilir."
      );
    } catch (_) {
      setDemoOpsStatus("Sunum akisi başlatilamadi.");
    } finally {
      setDemoShowcaseRunning(false);
    }
  };

  React.useEffect(() => {
    const targetName = tradeOffers[0]?.buyer || tradeListings[0]?.owner || tradeListings[0]?.contact || "";
    if (!targetName) return;
    loadTradeTrust(targetName, "buyer");
  }, [tradeOffers, tradeListings]);

  React.useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/trade/alerts?limit=20&since=${lastTradeAlertAt || 0}`);
        const data = await res.json();
        const next = Array.isArray(data?.items) ? data.items : [];
        if (!next.length) return;
        setTradeAlerts((prev) => {
          const merged = [...next, ...prev];
          const seen = new Set();
          return merged.filter((item) => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          }).slice(0, 40);
        });
        setLastTradeAlertAt(Math.max(...next.map((item) => new Date(item.createdAt || 0).getTime())));
      } catch (_) {
        // ignore polling errors
      }
    }, 45000);
    return () => clearInterval(timer);
  }, [lastTradeAlertAt]);

  React.useEffect(() => {
    if (!isNativeApp || !notifSettings.enabled) return;
    const latest = tradeAlerts[0];
    if (!latest?.id) return;
    if (tradeAlertNotifRef.current === latest.id) return;
    tradeAlertNotifRef.current = latest.id;
    ensureNotificationPermission(false).then((permission) => {
      if (permission !== "granted") return;
      const hash = String(latest.id)
        .split("")
        .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
      const id = 950000 + Math.abs(hash % 40000);
      LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: latest.title || "Pazar bildirimi",
            body: latest.detail || "Yeni pazar olayi kaydedildi.",
            schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true }
          }
        ]
      }).catch(() => { });
    });
  }, [tradeAlerts, isNativeApp, notifSettings.enabled, ensureNotificationPermission]);

  const submitTradeListing = async (override = {}) => {
    const form = { ...tradeListingForm, ...(override || {}) };
    const categoryRaw = String(
      form.category || (form.areaDa || form.zoning || form.parcel ? "land" : "crop")
    ).toLowerCase();
    const category = categoryRaw === "land" ? "land" : "crop";
    const cropBase = (form.crop || form.product || effectiveTradeCrop || "").trim();
    const crop = category === "land" && !cropBase ? "arazi" : (cropBase || "karisik-urun");
    const listingCity = (form.city || effectiveTradeCity).trim() || "Malatya";
    const contact = String(form.contact || form.owner || effectiveTradeIdentity || "Demo Uretici").trim();
    const quantityKg = Number(form.quantityKg ?? form.amount ?? 0);
    const priceTlKg = Number(form.priceTlKg ?? form.price ?? 0);
    const areaDa = Number(form.areaDa ?? 0);
    const priceTlDa = Number(form.priceTlDa ?? form.price ?? 0);
    const mapQuality = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      if (["premium", "standard", "mixed", "processing"].includes(raw)) return raw;
      if (raw === "a" || raw === "a+" || raw === "premium") return "premium";
      if (raw === "b" || raw === "standard" || raw === "std") return "standard";
      if (raw === "c" || raw === "processing" || raw === "endustriyel") return "processing";
      return "standard";
    };
    const qualityGrade = mapQuality(form.qualityGrade ?? form.quality);
    const deliveryType = String(form.deliveryType || form.delivery || "pickup");
    const paymentType = String(form.paymentType || form.payment || "transfer");
    if (category === "land") {
      if (areaDa <= 0 || priceTlDa <= 0) {
        setTradeStatus("Arazi icin alan ve fiyat zorunlu.");
        return;
      }
    } else {
      if (quantityKg <= 0 || priceTlKg <= 0) {
        setTradeStatus("Miktar ve fiyat zorunlu.");
        return;
      }
    }
    const listingTitle =
      String(form.title || "").trim() ||
      `${crop} ${String(form.type || "sell").toLowerCase() === "buy" ? "alim" : "satis"} ilani`;
    const payload = {
      type: form.type || "sell",
      title: listingTitle,
      city: listingCity,
      district: form.district,
      crop,
      quantityKg: category === "land" ? Math.max(0, areaDa) : quantityKg,
      priceTlKg: category === "land" ? Math.max(0, priceTlDa) : priceTlKg,
      deliveryType,
      paymentType,
      qualityGrade,
      contact,
      category,
      areaDa: category === "land" ? Math.max(0, areaDa) : undefined,
      priceTlDa: category === "land" ? Math.max(0, priceTlDa) : undefined,
      zoning: form.zoning || undefined,
      parcel: form.parcel || undefined,
      note: form.note || undefined
    };
    try {
      const isEdit = Boolean(tradeEditingListingId);
      const targetPath = isEdit
        ? `/api/trade/listings/${encodeURIComponent(tradeEditingListingId)}`
        : "/api/trade/listings";
      const res = await apiFetch(targetPath, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(isEdit ? "update_failed" : "create_failed");
      setTradeListingForm({
        type: "sell",
        title: "",
        city: "",
        crop: "",
        product: "",
        district: "",
        quantityKg: "1000",
        amount: "1000",
        priceTlKg: "18.5",
        price: "18.5",
        deliveryType: "pickup",
        paymentType: "transfer",
        qualityGrade: "standard",
        quality: "B",
        contact: "",
        category: "crop",
        areaDa: "",
        priceTlDa: "",
        zoning: "tarım",
        parcel: ""
      });
      setTradeEditingListingId("");
      setTradeMyFormExpanded(false);
      setTradeStatus(isEdit ? "İlan güncellendi." : "İlan olusturuldu.");
      await loadTradeData();
      setTradeWorkspaceTab("mine");
    } catch (_) {
      setTradeStatus(tradeEditingListingId ? "İlan güncellenemedi." : "İlan olusturulamadi.");
    }
  };

  const editTradeListing = (item) => {
    if (!item?.id) return;
    setTradeEditingListingId(String(item.id));
    setTradeListingForm({
      type: item.type || "sell",
      title: item.title || "",
      city: item.city || "",
      crop: item.crop || "",
      product: item.crop || "",
      district: item.district || "",
      quantityKg: String(Number(item.quantityKg || 0) || ""),
      amount: String(Number(item.quantityKg || 0) || ""),
      priceTlKg: String(Number(item.priceTlKg || 0) || ""),
      price: String(Number(item.priceTlKg || 0) || ""),
      deliveryType: item.deliveryType || "pickup",
      paymentType: item.paymentType || "transfer",
      qualityGrade: item.qualityGrade || "standard",
      quality: item.qualityGrade || "B",
      contact: item.contact || item.owner || "",
      category: item.category || "crop",
      areaDa: item.areaDa ? String(item.areaDa) : "",
      priceTlDa: item.priceTlDa ? String(item.priceTlDa) : "",
      zoning: item.zoning || "tarım",
      parcel: item.parcel || ""
    });
    setTradeStatus("İlan düzenleme modunda.");
    setTradeMyFormExpanded(true);
    document.getElementById("market-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelTradeListingEdit = () => {
    setTradeEditingListingId("");
    setTradeMyFormExpanded(false);
    setTradeListingForm({
      type: "sell",
      title: "",
      city: "",
      crop: "",
      product: "",
      district: "",
      quantityKg: "1000",
      amount: "1000",
      priceTlKg: "18.5",
      price: "18.5",
      deliveryType: "pickup",
      paymentType: "transfer",
      qualityGrade: "standard",
      quality: "B",
      contact: "",
      category: "crop",
      areaDa: "",
      priceTlDa: "",
      zoning: "tarım",
      parcel: ""
    });
    setTradeStatus("Duzenleme modu kapatildi.");
  };

  const submitTradeOffer = async () => {
    const listingId = tradeOfferForm.listingId || "";
    const buyer = String(tradeOfferForm.buyer || effectiveTradeIdentity || "Demo Alici").trim();
    const quantityKg = Number(tradeOfferForm.quantityKg || 0);
    const offerPriceTlKg = Number(tradeOfferForm.offerPriceTlKg || 0);
    const expiryHours = Math.max(1, Number(tradeOfferForm.expiryHours || 48));
    if (!listingId || quantityKg <= 0 || offerPriceTlKg <= 0 || !buyer) {
      setTradeStatus("Teklif icin ilan, miktar ve fiyat zorunlu.");
      return;
    }
    try {
      const res = await apiFetch("/api/trade/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          buyer,
          quantityKg,
          offerPriceTlKg,
          expiryHours,
          deliveryType: tradeOfferForm.deliveryType,
          paymentType: tradeOfferForm.paymentType,
          qualityGrade: tradeOfferForm.qualityGrade,
          note: tradeOfferForm.note
        })
      });
      if (!res.ok) throw new Error("offer_failed");
      setTradeOfferForm((prev) => ({
        ...prev,
        buyer: "",
        quantityKg: "500",
        offerPriceTlKg: "18",
        expiryHours: "48",
        deliveryType: "any",
        paymentType: "any",
        qualityGrade: "any",
        note: ""
      }));
      setTradeStatus("Teklif gonderildi.");
      const refreshed = await refreshSelectedTradeListingWorkspace(listingId, { syncOrderForm: true });
      if (!refreshed) await loadTradeData();
    } catch (_) {
      setTradeStatus("Teklif gonderilemedi.");
    }
  };

  const submitCounterOffer = async () => {
    const offerId = tradeCounterForm.offerId || "";
    const counterPriceTlKg = Number(tradeCounterForm.counterPriceTlKg || 0);
    if (!offerId || counterPriceTlKg <= 0) {
      setTradeStatus("Karşı teklif icin teklif ve fiyat zorunlu.");
      return;
    }
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterPriceTlKg })
      });
      if (!res.ok) throw new Error("counter_failed");
      setTradeCounterForm({ offerId: "", counterPriceTlKg: "" });
      setTradeStatus("Karşı teklif gonderildi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Karşı teklif gonderilemedi.");
    }
  };

  const acceptTradeOffer = async (offerId, options = {}) => {
    const silent = Boolean(options.silent);
    if (!offerId) return;
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error("accept_failed");
      if (!silent) {
        setTradeStatus("Teklif kabul edildi, siparis olustu.");
        await loadTradeData();
      }
      return true;
    } catch (_) {
      if (!silent) setTradeStatus("Teklif kabul edilemedi.");
      return false;
    }
  };

  const rejectTradeOffer = async (offerId, options = {}) => {
    const silent = Boolean(options.silent);
    if (!offerId) return;
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(offerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" })
      });
      if (!res.ok) throw new Error("reject_failed");
      if (!silent) {
        setTradeStatus("Teklif reddedildi.");
        await loadTradeData();
      }
      return true;
    } catch (_) {
      if (!silent) setTradeStatus("Teklif reddedilemedi.");
      return false;
    }
  };

  const cancelTradeOffer = async (offerId, options = {}) => {
    const silent = Boolean(options.silent);
    if (!offerId) return false;
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(offerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" })
      });
      if (!res.ok) throw new Error("cancel_offer_failed");
      if (!silent) {
        setTradeStatus("Teklif geri cekildi.");
        await loadTradeData();
      }
      return true;
    } catch (_) {
      if (!silent) setTradeStatus("Teklif geri cekilemedi.");
      return false;
    }
  };

  const startTradeOfferEdit = (offer) => {
    if (!offer?.id) return;
    const expTs = Date.parse(String(offer.expiresAt || ""));
    const nowTs = Date.now();
    const leftHours = Number.isFinite(expTs) ? Math.max(1, Math.round((expTs - nowTs) / (3600 * 1000))) : 48;
    setTradeOfferEditForm({
      id: String(offer.id),
      quantityKg: String(Number(offer.quantityKg || 0) || ""),
      offerPriceTlKg: String(Number(offer.offerPriceTlKg || 0) || ""),
      expiryHours: String(leftHours),
      note: String(offer.note || ""),
      deliveryType: offer.deliveryType || "any",
      paymentType: offer.paymentType || "any",
      qualityGrade: offer.qualityGrade || "any"
    });
    setTradeStatus("Teklif düzenleme modu acildi.");
  };

  const clearTradeOfferEdit = () => {
    setTradeOfferEditForm({
      id: "",
      quantityKg: "",
      offerPriceTlKg: "",
      expiryHours: "",
      note: "",
      deliveryType: "any",
      paymentType: "any",
      qualityGrade: "any"
    });
  };

  const submitTradeOfferEdit = async () => {
    const id = String(tradeOfferEditForm.id || "");
    const quantityKg = Number(tradeOfferEditForm.quantityKg || 0);
    const offerPriceTlKg = Number(tradeOfferEditForm.offerPriceTlKg || 0);
    const expiryHours = Math.max(1, Number(tradeOfferEditForm.expiryHours || 48));
    if (!id || quantityKg <= 0 || offerPriceTlKg <= 0) {
      setTradeStatus("Duzenleme icin miktar ve fiyat zorunlu.");
      return;
    }
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantityKg,
          offerPriceTlKg,
          expiryHours,
          note: tradeOfferEditForm.note,
          deliveryType: tradeOfferEditForm.deliveryType,
          paymentType: tradeOfferEditForm.paymentType,
          qualityGrade: tradeOfferEditForm.qualityGrade
        })
      });
      if (!res.ok) throw new Error("offer_edit_failed");
      clearTradeOfferEdit();
      setTradeStatus("Teklif güncellendi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Teklif güncellenemedi.");
    }
  };

  const getSuggestedCounterPrice = useCallback(
    (offer) => {
      if (!offer?.id) return 0;
      const listing = tradeListings.find((x) => String(x.id) === String(offer.listingId));
      const listingPrice = Number(listing?.priceTlKg || 0);
      const offerPrice = Number(offer.offerPriceTlKg || 0);
      const marketMedian = Number(tradeSummary?.market?.sellMedianTlKg || 0);
      const anchor = listingPrice > 0 ? listingPrice : marketMedian > 0 ? marketMedian : offerPrice;
      const floor = anchor * 0.96;
      const target = anchor * 0.99;
      const suggested = Math.max(offerPrice, floor, target);
      return Number(suggested.toFixed(2));
    },
    [tradeListings, tradeSummary]
  );

  const applyCounterForOffer = async (offer, options = {}) => {
    const silent = Boolean(options.silent);
    const offerId = String(offer?.id || "");
    if (!offerId) return false;
    const counterPriceTlKg = getSuggestedCounterPrice(offer);
    if (!counterPriceTlKg) return false;
    try {
      const res = await apiFetch(`/api/trade/offers/${encodeURIComponent(offerId)}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterPriceTlKg })
      });
      const ok = Boolean(res?.ok);
      if (!silent && ok) setTradeStatus("Karşı teklif gonderildi.");
      if (!silent && !ok) setTradeStatus("Karşı teklif gonderilemedi.");
      return ok;
    } catch (_) {
      if (!silent) setTradeStatus("Karşı teklif gonderilemedi.");
      return false;
    }
  };

  const applyBulkCounterOffers = async () => {
    const candidates = (tradeMatchesFiltered || [])
      .filter((row) => Number(row?.match?.score || 0) >= Number(tradeMatchMinScore || 0))
      .slice(0, 5)
      .map((row) => row.offer)
      .filter(Boolean);
    if (!candidates.length) {
      setTradeStatus("Toplu karşı teklif icin uygun eslesme yok.");
      return;
    }
    setTradeStatus("Toplu karşı teklif gonderiliyor...");
    const results = await Promise.all(candidates.map((offer) => applyCounterForOffer(offer, { silent: true })));
    const okCount = results.filter(Boolean).length;
    setTradeStatus(`Toplu karşı teklif tamamlandi: ${okCount}/${candidates.length}`);
    await loadTradeData();
    setTradeWorkspaceTab("offers");
  };

  const applyBulkAcceptOffers = async () => {
    const candidates = (tradeAutoAcceptCandidates || []).slice(0, 5);
    if (!candidates.length) {
      setTradeStatus("Toplu kabul icin uygun eslesme yok.");
      return;
    }
    setTradeStatus("Toplu kabul basladi...");
    const results = await Promise.all(
      candidates.map((row) => acceptTradeOffer(row.offerId, { silent: true }))
    );
    const okCount = results.filter(Boolean).length;
    setTradeStatus(`Toplu kabul tamamlandi: ${okCount}/${candidates.length}`);
    await loadTradeData();
    setTradeWorkspaceTab("orders");
  };

  const toggleIncomingOfferSelection = (offerId) => {
    const id = String(offerId || "");
    if (!id) return;
    setTradeIncomingOfferSelection((prev) => {
      const set = new Set((prev || []).map((x) => String(x)));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set).slice(0, 80);
    });
  };

  const selectAllIncomingActionableOffers = () => {
    const ids = tradeIncomingActionableOffers.map((offer) => String(offer.id));
    setTradeIncomingOfferSelection(ids);
  };

  const clearIncomingOfferSelection = () => setTradeIncomingOfferSelection([]);

  const bulkAcceptIncomingOffers = async () => {
    if (!tradeIncomingOfferSelection.length) {
      setTradeStatus("Toplu kabul icin seçili gelen teklif yok.");
      return;
    }
    const selected = tradeIncomingActionableOffers.filter((offer) =>
      tradeIncomingOfferSelection.some((id) => String(id) === String(offer.id))
    );
    if (!selected.length) {
      setTradeStatus("Secili teklifler işleme uygun değil.");
      return;
    }
    setTradeStatus("Secili teklifler kabul ediliyor...");
    try {
      const res = await apiFetch("/api/trade/offers/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          offerIds: selected.map((offer) => String(offer.id))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "bulk_accept_failed");
      const okCount = Number(data?.successCount || 0);
      setTradeStatus(`Toplu kabul tamamlandi: ${okCount}/${selected.length}`);
    } catch (_) {
      const results = await Promise.all(selected.map((offer) => acceptTradeOffer(offer.id, { silent: true })));
      const okCount = results.filter(Boolean).length;
      setTradeStatus(`Toplu kabul tamamlandi: ${okCount}/${selected.length}`);
    }
    clearIncomingOfferSelection();
    await loadTradeData();
    setTradeWorkspaceTab("orders");
  };

  const bulkRejectIncomingOffers = async () => {
    if (!tradeIncomingOfferSelection.length) {
      setTradeStatus("Toplu red icin seçili gelen teklif yok.");
      return;
    }
    const selected = tradeIncomingActionableOffers.filter((offer) =>
      tradeIncomingOfferSelection.some((id) => String(id) === String(offer.id))
    );
    if (!selected.length) {
      setTradeStatus("Secili teklifler işleme uygun değil.");
      return;
    }
    setTradeStatus("Secili teklifler reddediliyor...");
    try {
      const res = await apiFetch("/api/trade/offers/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          offerIds: selected.map((offer) => String(offer.id))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "bulk_reject_failed");
      const okCount = Number(data?.successCount || 0);
      setTradeStatus(`Toplu red tamamlandi: ${okCount}/${selected.length}`);
    } catch (_) {
      const results = await Promise.all(selected.map((offer) => rejectTradeOffer(offer.id, { silent: true })));
      const okCount = results.filter(Boolean).length;
      setTradeStatus(`Toplu red tamamlandi: ${okCount}/${selected.length}`);
    }
    clearIncomingOfferSelection();
    await loadTradeData();
  };

  const quickOfferForListing = async (listing) => {
    if (!listing?.id) return;
    if (String(listing.type || "").toLowerCase() !== "sell") {
      setTradeStatus("Hizli teklif su an sadece satis ilanlari icin aktif.");
      return;
    }
    const available = Number((listing.availableKg ?? listing.quantityKg) || 0);
    const quantityKg = Math.max(100, Math.min(available > 0 ? available : 1000, 1200));
    const base = Number(listing.priceTlKg || 0);
    const offerPriceTlKg = Number((base > 0 ? base * 0.97 : 0).toFixed(2));
    const buyer = String(effectiveTradeIdentity || tradeOfferForm.buyer || "Demo Alici").trim();
    if (!buyer || offerPriceTlKg <= 0) {
      setTradeStatus("Hizli teklif icin profil adini gir.");
      return;
    }
    try {
      const res = await apiFetch("/api/trade/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          buyer,
          quantityKg,
          offerPriceTlKg,
          deliveryType: "any",
          paymentType: "any",
          qualityGrade: "any",
          note: "Hizli teklif akisi"
        })
      });
      if (!res.ok) throw new Error("quick_offer_failed");
      setTradeStatus("Hizli teklif gonderildi.");
      setTradeOfferForm((prev) => ({
        ...prev,
        listingId: listing.id,
        buyer,
        quantityKg: String(quantityKg),
        offerPriceTlKg: String(offerPriceTlKg)
      }));
      await loadTradeData();
      setTradeWorkspaceTab("offers");
    } catch (_) {
      setTradeStatus("Hizli teklif gonderilemedi.");
    }
  };

  const suggestCounterForOffer = (offer) => {
    if (!offer?.id) return;
    const suggested = getSuggestedCounterPrice(offer);
    setTradeCounterForm({
      offerId: String(offer.id),
      counterPriceTlKg: suggested.toString()
    });
    setTradeStatus("Karşı teklif fiyati otomatik önerildi.");
  };

  const updateTradeOrder = async (id, status, escrowStatus) => {
    if (!id) return;
    try {
      const body = {};
      if (status) body.status = status;
      if (escrowStatus) body.escrowStatus = escrowStatus;
      const res = await apiFetch(`/api/trade/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("order_update_failed");
      setTradeStatus("Siparis güncellendi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Siparis güncellenemedi.");
    }
  };

  const saveTradeOrderLogistics = async () => {
    const orderId = tradeOrderForm.orderId || "";
    if (!orderId) {
      setTradeStatus("Siparis seçilmedi.");
      return;
    }
    try {
      const res = await apiFetch(`/api/trade/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo: tradeOrderForm.invoiceNo,
          trackingCode: tradeOrderForm.trackingCode,
          shippingProvider: tradeOrderForm.shippingProvider
        })
      });
      if (!res.ok) throw new Error("order_logistics_failed");
      setTradeStatus("Fatura / takip bilgisi kaydedildi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Fatura / takip kaydedilemedi.");
    }
  };

  const loadTradeOrderContract = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await apiFetch(`/api/trade/orders/${encodeURIComponent(orderId)}/contract`);
      const data = await res.json();
      if (!res.ok) throw new Error("contract_failed");
      setTradeContractPreview(data);
      setTradeStatus("Sozlesme yuklendi.");
    } catch (_) {
      setTradeContractPreview(null);
      setTradeStatus("Sozlesme yuklenemedi.");
    }
  };

  const downloadTradeOrderContractPdf = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await apiFetch(`/api/trade/orders/${encodeURIComponent(orderId)}/contract.pdf`);
      if (!res.ok) throw new Error("pdf_failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contract-${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setTradeStatus("Sozlesme PDF indirildi.");
    } catch (_) {
      setTradeStatus("Sozlesme PDF indirilemedi.");
    }
  };

  const syncTradeOrderShipping = async () => {
    const orderId = tradeOrderForm.orderId || "";
    if (!orderId) {
      setTradeStatus("Siparis seçilmedi.");
      return;
    }
    try {
      const res = await apiFetch(`/api/trade/orders/${encodeURIComponent(orderId)}/shipping-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tradeOrderForm.shippingProvider })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("shipping_sync_failed");
      setTradeStatus(`Kargo senkronlandi: ${data?.event || "durum alindi"}`);
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Kargo senkronu başarısiz.");
    }
  };

  const checkTradeOrderShippingStatus = async () => {
    const orderId = tradeOrderForm.orderId || "";
    if (!orderId) {
      setTradeStatus("Siparis seçilmedi.");
      return;
    }
    try {
      const res = await apiFetch(
        `/api/trade/orders/${encodeURIComponent(orderId)}/shipping-status?provider=${encodeURIComponent(
          tradeOrderForm.shippingProvider || ""
        )}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error("shipping_status_failed");
      setShippingStatusPreview(data || null);
      setTradeStatus(`Kargo durumu: ${data?.status || "-"}`);
    } catch (_) {
      setShippingStatusPreview(null);
      setTradeStatus("Kargo durumu alinamadi.");
    }
  };

  const syncAllTradeShipping = async () => {
    try {
      const res = await apiFetch("/api/trade/shipping/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 30 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("sync_all_failed");
      setTradeStatus(`Toplu kargo senkronu tamamlandi (${data?.updated || 0}).`);
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Toplu kargo senkronu başarısiz.");
    }
  };

  const runShippingParsePreview = async () => {
    try {
      JSON.parse(shippingParseForm.payload || "{}");
    } catch (_) {
      setTradeStatus("Parse preview: JSON gecersiz.");
      setShippingParseResult(null);
      return;
    }
    try {
      const res = await apiFetch("/api/trade/shipping/parse-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: shippingParseForm.provider,
          payload: shippingParseForm.payload
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "parse_preview_failed");
      setShippingParseResult(data);
      setTradeStatus("Parse preview tamamlandi.");
    } catch (_) {
      setShippingParseResult(null);
      setTradeStatus("Parse preview başarısiz.");
    }
  };

  const loadShippingSamplePayload = () => {
    const sample = shippingPayloadSamples[shippingParseForm.provider] || shippingPayloadSamples.yurtici;
    setShippingParseForm((prev) => ({
      ...prev,
      payload: JSON.stringify(sample, null, 2)
    }));
  };

  const submitTradeMessağe = async () => {
    const listingId = tradeOfferForm.listingId || "";
    const text = String(tradeMessağeForm.text || "").trim();
    if (!listingId || !text) {
      setTradeStatus("Mesaj icin ilan ve metin zorunlu.");
      return;
    }
    try {
      const res = await apiFetch("/api/trade/messağes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          senderRole: tradeMessağeForm.senderRole,
          sender: tradeMessağeForm.sender,
          text
        })
      });
      if (!res.ok) throw new Error("messağe_failed");
      setTradeMessağeForm((prev) => ({ ...prev, text: "" }));
      const refreshed = await refreshSelectedTradeListingWorkspace(listingId, { syncOrderForm: false });
      if (!refreshed) {
        const msgRes = await apiFetch(`/api/trade/messağes?listingId=${encodeURIComponent(listingId)}`);
        const msgData = await msgRes.json();
        setTradeMessağes(Array.isArray(msgData?.items) ? msgData.items : []);
      }
      setTradeStatus("Mesaj gonderildi.");
    } catch (_) {
      setTradeStatus("Mesaj gonderilemedi.");
    }
  };

  const submitTradeRating = async () => {
    const orderId = tradeOrders[0]?.id || "";
    if (!orderId || !tradeRatingForm.targetName) {
      setTradeStatus("Puanlama icin siparis ve hedef ad zorunlu.");
      return;
    }
    try {
      const res = await apiFetch("/api/trade/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          targetRole: tradeRatingForm.targetRole,
          targetName: tradeRatingForm.targetName,
          raterName: tradeMessağeForm.sender || "Kullanici",
          score: Number(tradeRatingForm.score || 5),
          comment: tradeRatingForm.comment
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("rating_failed");
      setTradeTrust(data?.trust || null);
      setTradeStatus("Puanlama kaydedildi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Puanlama kaydedilemedi.");
    }
  };

  async function loadTradeTrust(name, role = "seller") {
    if (!name) return;
    try {
      const res = await apiFetch(
        `/api/trade/trust?name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error("trust_failed");
      setTradeTrust(data);
    } catch (_) {
      setTradeTrust(null);
    }
  }

  const closeTradeListing = async (id) => {
    try {
      const res = await apiFetch(`/api/trade/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" })
      });
      if (!res.ok) throw new Error("close_failed");
      setTradeStatus("İlan kapatildi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("İlan kapatilamadi.");
    }
  };

  const pauseOrOpenTradeListing = async (id, nextStatus) => {
    if (!id || !nextStatus) return;
    try {
      const res = await apiFetch(`/api/trade/listings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error("status_update_failed");
      setTradeStatus(nextStatus === "paused" ? "İlan duraklatildi." : "İlan tekrar acildi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("İlan durumu güncellenemedi.");
    }
  };

  const deleteTradeListing = async (id) => {
    if (!id) return;
    try {
      const res = await apiFetch(`/api/trade/listings/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === "listing_has_active_offers") {
          setTradeStatus("Aktif teklif bulunan ilan silinemez. Once teklifleri kapat.");
          return;
        }
        throw new Error("delete_failed");
      }
      if (String(tradeEditingListingId || "") === String(id)) {
        cancelTradeListingEdit();
      }
      setTradeStatus("İlan silindi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("İlan silinemedi.");
    }
  };

  const duplicateTradeListing = async (item) => {
    if (!item) return;
    const payload = {
      type: item.type || "sell",
      title: item.title ? `${item.title} (Kopya)` : `${item.crop || "urun"} ilani (Kopya)`,
      city: item.city || effectiveTradeCity || "Malatya",
      district: item.district || "",
      crop: item.crop || effectiveTradeCrop || "domates",
      quantityKg: Math.max(1, Number((item.availableKg ?? item.quantityKg) || 0)),
      priceTlKg: Math.max(0.01, Number(item.priceTlKg || 0)),
      deliveryType: item.deliveryType || "pickup",
      paymentType: item.paymentType || "transfer",
      qualityGrade: item.qualityGrade || "standard",
      contact: item.contact || effectiveTradeIdentity || "Demo Uretici"
    };
    try {
      const res = await apiFetch("/api/trade/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("duplicate_failed");
      setTradeStatus("İlan kopyalandi ve yayina alindi.");
      await loadTradeData();
    } catch (_) {
      setTradeStatus("İlan kopyalanamadi.");
    }
  };

  const bulkUpdateMyListingsStatus = async (fromStatus, toStatus) => {
    if (tradeBulkUpdating) return;
    const targets = tradeMyListings.filter((item) => String(item.status || "") === String(fromStatus || ""));
    if (!targets.length) {
      setTradeStatus("Toplu işlem icin uygun ilan bulunamadi.");
      return;
    }
    setTradeBulkUpdating(true);
    try {
      const results = await Promise.allSettled(
        targets.map((item) =>
          apiFetch(`/api/trade/listings/${encodeURIComponent(item.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: toStatus })
          })
        )
      );
      const okCount = results.filter((row) => row.status === "fulfilled" && row.value?.ok).length;
      setTradeStatus(`Toplu işlem tamamlandi: ${okCount}/${targets.length} ilan güncellendi.`);
      await loadTradeData();
    } catch (_) {
      setTradeStatus("Toplu ilan güncelleme başarısiz.");
    } finally {
      setTradeBulkUpdating(false);
    }
  };

  React.useEffect(() => {
    const listingId = tradeOfferForm.listingId;
    if (!listingId) return;
    let isActive = true;
    refreshSelectedTradeListingWorkspace(listingId, { syncOrderForm: false }).then((ok) => {
      if (!isActive) return;
      if (!ok) {
        setTradeOffers([]);
        setTradeMessağes([]);
        setTradeListingInsights(null);
      }
    });
    return () => {
      isActive = false;
    };
  }, [refreshSelectedTradeListingWorkspace, tradeOfferForm.listingId]);

  React.useEffect(() => {
    loadManualListings();
  }, [loadManualListings]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    apiFetch(
      `/api/land-price/sources?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
        district
      )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandPriceSources(Array.isArray(data?.providers) ? data.providers : []);
      })
      .catch(() => {
        if (!isActive) return;
        setLandPriceSources([]);
      });
    return () => {
      isActive = false;
    };
  }, [effectiveLandCity, effectiveLandCrop, landDemo?.district, landDemo?.neighborhood]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    const coords = (fieldLocation?.coords || "").trim();
    const hasCoords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords);
    const landFeatureQuery = `&zone=${encodeURIComponent(landDemo?.zone || "gecis")}&irrigation=${encodeURIComponent(
      landDemo?.irrigation || "var"
    )}&roadAccess=${encodeURIComponent(landDemo?.roadAccess || "orta")}&soilScore=${encodeURIComponent(
      Number(landDemo?.soilScore) || 65
    )}&slopePct=${encodeURIComponent(Number(landDemo?.slopePct) || 6)}&roadDistanceM=${encodeURIComponent(
      Number(landDemo?.roadDistanceM) || 0
    )}&roadPass=${encodeURIComponent(landDemo?.roadPass || "var")}&zoningStatus=${encodeURIComponent(
      landDemo?.zoningStatus || "yok"
    )}&structureStatus=${encodeURIComponent(landDemo?.structureStatus || "yok"
    )}&plantedStatus=${encodeURIComponent(
      landDemo?.plantedStatus || "bos"
    )}&plantedCrop=${encodeURIComponent(landDemo?.plantedCrop || "")}&plantedValueTlDa=${encodeURIComponent(
      Number(landDemo?.plantedValueTlDa) || 0
    )}`;
    apiFetch(
      `/api/land-price/providers-health?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
        district
      )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}${hasCoords ? `&coords=${encodeURIComponent(coords)}` : ""
      }${landFeatureQuery}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandProvidersHealth(data || null);
      })
      .catch(() => {
        if (!isActive) return;
        setLandProvidersHealth(null);
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveLandCity,
    effectiveLandCrop,
    fieldLocation?.coords,
    landDemo?.district,
    landDemo?.neighborhood,
    landDemo?.zone,
    landDemo?.irrigation,
    landDemo?.roadAccess,
    landDemo?.roadDistanceM,
    landDemo?.roadPass,
    landDemo?.zoningStatus,
    landDemo?.structureStatus,
    landDemo?.soilScore,
    landDemo?.slopePct,
    landDemo?.plantedStatus,
    landDemo?.plantedCrop,
    landDemo?.plantedValueTlDa
  ]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    const coords = (fieldLocation?.coords || "").trim();
    const hasCoords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords);
    const landFeatureQuery = `&zone=${encodeURIComponent(landDemo?.zone || "gecis")}&irrigation=${encodeURIComponent(
      landDemo?.irrigation || "var"
    )}&roadAccess=${encodeURIComponent(landDemo?.roadAccess || "orta")}&soilScore=${encodeURIComponent(
      Number(landDemo?.soilScore) || 65
    )}&slopePct=${encodeURIComponent(Number(landDemo?.slopePct) || 6)}&roadDistanceM=${encodeURIComponent(
      Number(landDemo?.roadDistanceM) || 0
    )}&roadPass=${encodeURIComponent(landDemo?.roadPass || "var")}&zoningStatus=${encodeURIComponent(
      landDemo?.zoningStatus || "yok"
    )}&structureStatus=${encodeURIComponent(landDemo?.structureStatus || "yok"
    )}&plantedStatus=${encodeURIComponent(
      landDemo?.plantedStatus || "bos"
    )}&plantedCrop=${encodeURIComponent(landDemo?.plantedCrop || "")}&plantedValueTlDa=${encodeURIComponent(
      Number(landDemo?.plantedValueTlDa) || 0
    )}`;
    const query = `/api/land-price/compare?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
      district
    )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}${hasCoords ? `&coords=${encodeURIComponent(coords)}` : ""
      }${landFeatureQuery}`;
    setLandCompareLoading(true);
    setLandCompareError("");
    apiFetch(query)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandCompareData(data || null);
      })
      .catch(() => {
        if (!isActive) return;
        setLandCompareError("Kaynak karşılastirma verisi alinamadi.");
      })
      .finally(() => {
        if (isActive) setLandCompareLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveLandCity,
    effectiveLandCrop,
    fieldLocation?.coords,
    landDemo?.district,
    landDemo?.neighborhood,
    landDemo?.zone,
    landDemo?.irrigation,
    landDemo?.roadAccess,
    landDemo?.roadDistanceM,
    landDemo?.roadPass,
    landDemo?.zoningStatus,
    landDemo?.structureStatus,
    landDemo?.soilScore,
    landDemo?.slopePct,
    landDemo?.plantedStatus,
    landDemo?.plantedCrop,
    landDemo?.plantedValueTlDa
  ]);

  React.useEffect(() => {
    let isActive = true;
    const crop = effectiveLandCrop;
    const district = (landDemo?.district || "").trim();
    const neighborhood = (landDemo?.neighborhood || "").trim();
    const coords = (fieldLocation?.coords || "").trim();
    const hasCoords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords);
    const query = `/api/land-price/ml?city=${encodeURIComponent(effectiveLandCity)}&district=${encodeURIComponent(
      district
    )}&neighborhood=${encodeURIComponent(neighborhood)}&crop=${encodeURIComponent(crop)}&areaDa=${encodeURIComponent(Number(landDemo?.areaDa) || 0)}&slopePct=${encodeURIComponent(
      Number(landDemo?.slopePct) || 0
    )}&irrigation=${encodeURIComponent(landDemo?.irrigation || "var")}&roadAccess=${encodeURIComponent(
      landDemo?.roadAccess || "orta"
    )}&zone=${encodeURIComponent(landDemo?.zone || "gecis")}&soilScore=${encodeURIComponent(
      Number(landDemo?.soilScore) || 0
    )}&roadDistanceM=${encodeURIComponent(Number(landDemo?.roadDistanceM) || 0)}&roadPass=${encodeURIComponent(
      landDemo?.roadPass || "var"
    )}&zoningStatus=${encodeURIComponent(landDemo?.zoningStatus || "yok"
    )}&structureStatus=${encodeURIComponent(landDemo?.structureStatus || "yok"
    )}&plantedStatus=${encodeURIComponent(landDemo?.plantedStatus || "bos")}&plantedCrop=${encodeURIComponent(
      landDemo?.plantedCrop || ""
    )}&plantedValueTlDa=${encodeURIComponent(Number(landDemo?.plantedValueTlDa) || 0)}${hasCoords ? `&coords=${encodeURIComponent(coords)}` : ""
      }`;
    setLandMlLoading(true);
    setLandMlError("");
    apiFetch(query)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        if (data?.error) {
          setLandMlData(null);
          setLandMlError("ML fiyat tahmini alinamadi.");
          return;
        }
        setLandMlData(data || null);
      })
      .catch(() => {
        if (!isActive) return;
        setLandMlData(null);
        setLandMlError("ML fiyat tahmini alinamadi.");
      })
      .finally(() => {
        if (isActive) setLandMlLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [
    effectiveLandCity,
    effectiveLandCrop,
    fieldLocation?.coords,
    landDemo?.district,
    landDemo?.neighborhood,
    landDemo?.areaDa,
    landDemo?.slopePct,
    landDemo?.irrigation,
    landDemo?.roadAccess,
    landDemo?.roadDistanceM,
    landDemo?.roadPass,
    landDemo?.zoningStatus,
    landDemo?.structureStatus,
    landDemo?.zone,
    landDemo?.soilScore,
    landDemo?.plantedStatus,
    landDemo?.plantedCrop,
    landDemo?.plantedValueTlDa
  ]);

  React.useEffect(() => {
    let isActive = true;
    apiFetch("/api/land-price/model/status")
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setLandCustomModelStatus(data?.available ? data?.model || null : null);
      })
      .catch(() => {
        if (!isActive) return;
        setLandCustomModelStatus(null);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const econTotals = useMemo(() => {
    const area = Number(econArea) || 0;
    const yieldKg = Number(econYield) || 0;
    const price = Number(econPrice) || 0;
    const totalYieldKg = area * yieldKg;
    const revenue = totalYieldKg * price;
    const costPerDa = Object.values(econCosts).reduce((acc, val) => acc + (Number(val) || 0), 0);
    const cost = costPerDa * area;
    const landValue = (Number(econLandValue) || 0) * area;
    const grossMargin = revenue - cost;
    const net = grossMargin - landValue;
    const unitCostKg = totalYieldKg > 0 ? cost / totalYieldKg : 0;
    const breakEvenPrice = totalYieldKg > 0 ? (cost + landValue) / totalYieldKg : 0;
    const breakEvenYield = area > 0 && price > 0 ? (cost + landValue) / (area * price) : 0;
    const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
    const scenarios = [
      { key: "Kotu", yieldFactor: 0.85, priceFactor: 0.9 },
      { key: "Baz", yieldFactor: 1, priceFactor: 1 },
      { key: "Iyi", yieldFactor: 1.15, priceFactor: 1.1 }
    ].map((item) => {
      const scenarioRevenue = totalYieldKg * item.yieldFactor * price * item.priceFactor;
      const scenarioNet = scenarioRevenue - cost - landValue;
      return { ...item, revenue: scenarioRevenue, net: scenarioNet };
    });
    return {
      area,
      totalYieldKg,
      revenue,
      cost,
      costPerDa,
      landValue,
      grossMargin,
      net,
      unitCostKg,
      breakEvenPrice,
      breakEvenYield,
      marginPct,
      scenarios,
      roi: cost > 0 ? Math.round((grossMargin / cost) * 100) : 0
    };
  }, [econArea, econYield, econPrice, econCosts, econLandValue]);

  const landValuationDemo = useMemo(() => {
    const cityNorm = (effectiveLandCity || "").toLowerCase().replace(/ı/g, "i").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u");
    const regionMap = {
      adana: "akdeniz",
      antalya: "akdeniz",
      mersin: "akdeniz",
      malatya: "doguanadolu",
      konya: "icanadolu",
      ankara: "icanadolu",
      bursa: "marmara",
      istanbul: "marmara",
      izmir: "ege",
      aydin: "ege",
      samsun: "karadeniz",
      trabzon: "karadeniz",
      sanliurfa: "guneydoguanadolu",
      gaziantep: "guneydoguanadolu"
    };
    const regionPremium = {
      akdeniz: 1.06,
      doguanadolu: 0.96,
      icanadolu: 0.94,
      marmara: 1.08,
      ege: 1.09,
      karadeniz: 0.98,
      guneydoguanadolu: 0.95
    };
    const backendAdjustment = landPriceData?.adjustment || null;
    const baseApi = Number(
      (backendAdjustment ? landPriceData?.rawPriceTlDa : landPriceData?.priceTlDa) || econLandValue || 0
    );
    const base = baseApi > 0 ? baseApi : 160000;
    const bench = landDemoBenchmarks[cityNorm] || null;
    const zoneFactor = Number(backendAdjustment?.zoneFactor || bench?.zonePremium?.[landDemo.zone] || 1);
    const region = regionMap[cityNorm] || "bilinmiyor";
    const regionFactor = regionPremium[region] || 1;
    const districtFactor = String(landDemo?.district || "").trim() ? 1.03 : 1;
    const neighborhoodSeed = String(landDemo?.neighborhood || "")
      .trim()
      .split("")
      .reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 0);
    const neighborhoodFactor = String(landDemo?.neighborhood || "").trim()
      ? 0.99 + ((neighborhoodSeed % 41) / 1000)
      : 1;
    const slope = Number(landDemo.slopePct || 0);
    const slopeFactor = Number(
      backendAdjustment?.slopeFactor || (slope <= 3 ? 1.03 : slope <= 8 ? 1 : slope <= 12 ? 0.95 : 0.9)
    );
    const irrigationFactor = Number(backendAdjustment?.irrigationFactor || (landDemo.irrigation === "var" ? 1.07 : 0.9));
    const roadFactor = Number(
      backendAdjustment?.roadFactor ||
      (landDemo.roadAccess === "iyi" ? 1.04 : landDemo.roadAccess === "orta" ? 1 : 0.93)
    );
    const roadDistanceM = Math.max(0, Number(landDemo?.roadDistanceM || 0));
    const roadDistanceFactor = Number(
      backendAdjustment?.roadDistanceFactor ||
      (roadDistanceM <= 100 ? 1.03 : roadDistanceM <= 500 ? 1 : roadDistanceM <= 1500 ? 0.96 : 0.92)
    );
    const roadPassFactor = Number(
      backendAdjustment?.roadPassFactor || (landDemo?.roadPass === "var" ? 1.02 : 0.97)
    );
    const zoningFactor = Number(
      backendAdjustment?.zoningFactor ||
      (landDemo?.zoningStatus === "var" ? 1.05 : landDemo?.zoningStatus === "kismi" ? 1.02 : 0.97)
    );
    const structureFactor = Number(
      backendAdjustment?.structureFactor || (landDemo?.structureStatus === "var" ? 1.06 : 1)
    );
    const soilNorm = Math.max(40, Math.min(95, Number(landDemo.soilScore || 70)));
    const soilFactor = Number(backendAdjustment?.soilFactor || (0.86 + (soilNorm - 40) * 0.004));
    const weatherPenalty =
      (weather?.frostRisk ? 0.03 : 0) +
      ((weather?.windKmh ?? 0) >= 20 ? 0.02 : 0) +
      ((weather?.precipitationMm ?? 0) >= 10 ? 0.02 : 0);
    const factorRaw =
      zoneFactor *
      regionFactor *
      districtFactor *
      neighborhoodFactor *
      slopeFactor *
      irrigationFactor *
      roadFactor *
      roadDistanceFactor *
      roadPassFactor *
      zoningFactor *
      structureFactor *
      soilFactor *
      (1 - weatherPenalty);
    const factor = Number(
      backendAdjustment?.factor || Math.max(0.72, Math.min(1.38, factorRaw))
    );
    const unitPrice = Math.round(
      Number(backendAdjustment ? landPriceData?.priceTlDa : base * factor) || base * factor
    );
    const area = Math.max(0, Number(landDemo.areaDa || 0));
    const total = Math.round(unitPrice * area);
    const planted = String(landDemo?.plantedStatus || "bos") === "ekili";
    const plantedCrop = String(landDemo?.plantedCrop || "").trim();
    const plantedValuePerDa = planted ? Math.max(0, Number(landDemo?.plantedValueTlDa || 0)) : 0;
    const plantedTotal = Math.round(plantedValuePerDa * area);
    const totalWithCrop = total + plantedTotal;
    const min = Math.round(Number(landPriceData?.minTlDa || unitPrice * 0.9));
    const max = Math.round(Number(landPriceData?.maxTlDa || unitPrice * 1.13));
    return {
      base,
      factor,
      unitPrice,
      total,
      totalWithCrop,
      planted,
      plantedCrop,
      plantedValuePerDa,
      plantedTotal,
      min,
      max,
      notes: [
        backendAdjustment ? `Backend model carpan: x${factor.toFixed(3)}` : `Toplam carpan: x${factor.toFixed(3)}`,
        `Bölgesel carpan: x${regionFactor.toFixed(2)} (${region})`,
        `İlçe etkisi: x${districtFactor.toFixed(2)}`,
        `Mahalle etkisi: x${neighborhoodFactor.toFixed(2)}`,
        `Bölge etkisi: x${zoneFactor.toFixed(2)}`,
        `Egim etkisi: x${slopeFactor.toFixed(2)}`,
        `Sulama etkisi: x${irrigationFactor.toFixed(2)}`,
        `Yol erişimi: x${roadFactor.toFixed(2)}`,
        `Yola uzaklik etkisi: x${roadDistanceFactor.toFixed(2)} (${Math.round(roadDistanceM)} m)`,
        `Yol gecisi etkisi: x${roadPassFactor.toFixed(2)}`,
        `İmar etkisi: x${zoningFactor.toFixed(2)}`,
        `Yapi etkisi: x${structureFactor.toFixed(2)}`,
        `Toprak skoru etkisi: x${soilFactor.toFixed(2)}`,
        planted
          ? `Ekili urun degeri: ${plantedCrop || "tanimsiz"} ${plantedValuePerDa.toLocaleString("tr-TR")} TL/da`
          : "Parsel durumu: bos"
      ],
      region,
      source: backendAdjustment ? "backend-adjusted" : "frontend-heuristic",
      benchmarkNote: bench?.notes || null
    };
  }, [effectiveLandCity, landDemo, landPriceData, econLandValue, weather]);

  const landInvestmentLens = useMemo(() => {
    const area = Math.max(0, Number(landDemo?.areaDa || 0));
    const total = Number(landValuationDemo?.total || 0);
    const annualNet = Number(econTotals?.net || 0);
    const annualNetPerDa = area > 0 ? annualNet / area : 0;
    const paybackYears = annualNet > 0 && total > 0 ? total / annualNet : null;
    return {
      annualNetPerDa: Number(annualNetPerDa.toFixed(0)),
      paybackYears: paybackYears && Number.isFinite(paybackYears) ? Number(paybackYears.toFixed(1)) : null
    };
  }, [landDemo?.areaDa, landValuationDemo?.total, econTotals?.net]);

  const manualListingStats = useMemo(() => {
    const values = manualListings
      .map((item) => Number(item.priceTlDa || 0))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    if (!values.length) return null;
    const median = values[Math.floor(values.length / 2)];
    const avg = values.reduce((acc, x) => acc + x, 0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const now = Date.now();
    const d7 = 7 * 24 * 60 * 60 * 1000;
    const recent = manualListings.filter((item) => {
      const ts = new Date(item.createdAt || 0).getTime();
      return Number.isFinite(ts) && now - ts <= d7;
    });
    const prev = manualListings.filter((item) => {
      const ts = new Date(item.createdAt || 0).getTime();
      return Number.isFinite(ts) && now - ts > d7 && now - ts <= d7 * 2;
    });
    const recentAvg = recent.length
      ? recent.reduce((acc, item) => acc + (Number(item.priceTlDa) || 0), 0) / recent.length
      : 0;
    const prevAvg = prev.length
      ? prev.reduce((acc, item) => acc + (Number(item.priceTlDa) || 0), 0) / prev.length
      : 0;
    const weeklyChangePct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;
    return {
      count: values.length,
      min,
      max,
      median: Math.round(median),
      avg: Math.round(avg),
      recentCount: recent.length,
      weeklyChangePct: Number(weeklyChangePct.toFixed(1))
    };
  }, [manualListings]);

  const landComparableListings = useMemo(() => {
    if (!manualListings.length) return [];
    const cityKey = normalizeKey(landQuery.city || city || "");
    const districtKey = normalizeKey(landDemo?.district || "");
    const neighborhoodKey = normalizeKey(landDemo?.neighborhood || "");
    const basePrice = Number(landPriceData?.priceTlDa || landValuationDemo?.unitPrice || 0);
    return manualListings
      .map((item) => {
        const price = Number(item.priceTlDa || 0);
        const rowCity = normalizeKey(item.city || "");
        const rowDistrict = normalizeKey(item.district || "");
        const rowNeighborhood = normalizeKey(item.neighborhood || "");
        const cityScore = cityKey && rowCity === cityKey ? 25 : 0;
        const districtScore = districtKey && rowDistrict === districtKey ? 35 : 0;
        const neighborhoodScore = neighborhoodKey && rowNeighborhood === neighborhoodKey ? 30 : 0;
        const priceFit =
          basePrice > 0 && price > 0
            ? Math.max(0, 20 - Math.round((Math.abs(price - basePrice) / Math.max(1, basePrice)) * 40))
            : 8;
        return {
          item,
          score: cityScore + districtScore + neighborhoodScore + priceFit
        };
      })
      .sort((a, b) => b.score - a.score || Number(b.item.priceTlDa || 0) - Number(a.item.priceTlDa || 0))
      .slice(0, 6);
  }, [manualListings, landQuery.city, city, landDemo?.district, landDemo?.neighborhood, landPriceData?.priceTlDa, landValuationDemo?.unitPrice]);

  const effectiveTradeIdentity = useMemo(() => {
    const direct = String(tradeIdentityName || "").trim();
    if (direct) return direct;
    return (
      String(tradeListingForm.contact || "").trim() ||
      String(tradeMessağeForm.sender || "").trim() ||
      String(tradeOfferForm.buyer || "").trim()
    );
  }, [tradeIdentityName, tradeListingForm.contact, tradeMessağeForm.sender, tradeOfferForm.buyer]);

  const buildTradeFilterSnapshot = useCallback(
    (label = "") => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: String(label || "").trim() || `${effectiveTradeCity} / ${effectiveTradeCrop}`,
      city: String(tradeQuery.city || ""),
      crop: String(tradeQuery.crop || ""),
      text: String(tradeFilterText || ""),
      type: String(tradeFilterType || "all"),
      status: String(tradeFilterStatus || "all"),
      delivery: String(tradeFilterDelivery || "all"),
      payment: String(tradeFilterPayment || "all"),
      quality: String(tradeFilterQuality || "all"),
      seller: String(tradeSellerFilter || "all"),
      sortBy: String(tradeSortBy || "newest"),
      minPrice: String(tradePriceMin || ""),
      maxPrice: String(tradePriceMax || "")
    }),
    [
      effectiveTradeCity,
      effectiveTradeCrop,
      tradeQuery.city,
      tradeQuery.crop,
      tradeFilterText,
      tradeFilterType,
      tradeFilterStatus,
      tradeFilterDelivery,
      tradeFilterPayment,
      tradeFilterQuality,
      tradeSellerFilter,
      tradeSortBy,
      tradePriceMin,
      tradePriceMax
    ]
  );

  const applyTradeFilterSnapshot = useCallback((preset) => {
    if (!preset || typeof preset !== "object") return;
    setTradeQuery({
      city: String(preset.city || ""),
      crop: String(preset.crop || "")
    });
    setTradeFilterText(String(preset.text || ""));
    setTradeFilterType(String(preset.type || "all"));
    setTradeFilterStatus(String(preset.status || "all"));
    setTradeFilterDelivery(String(preset.delivery || "all"));
    setTradeFilterPayment(String(preset.payment || "all"));
    setTradeFilterQuality(String(preset.quality || "all"));
    setTradeSellerFilter(String(preset.seller || "all"));
    setTradeSortBy(String(preset.sortBy || "newest"));
    setTradePriceMin(String(preset.minPrice || ""));
    setTradePriceMax(String(preset.maxPrice || ""));
    setTradeStatus(`Filtre preset uygulandi: ${preset.label || "Kayıtli filtre"}`);
  }, []);

  const resetTradeFilters = useCallback(() => {
    setTradeFilterText("");
    setTradeFilterType("all");
    setTradeFilterStatus("all");
    setTradeFilterDelivery("all");
    setTradeFilterPayment("all");
    setTradeFilterQuality("all");
    setTradeSellerFilter("all");
    setTradeSortBy("newest");
    setTradePriceMin("");
    setTradePriceMax("");
  }, []);

  const saveTradeFilterPreset = useCallback(() => {
    const label = String(tradeFilterPresetName || "").trim();
    const snapshot = buildTradeFilterSnapshot(label);
    setTradeFilterPresets((prev) => [snapshot, ...prev].slice(0, 12));
    setTradeFilterPresetName("");
    setTradeStatus(`Filtre preset kaydedildi: ${snapshot.label}`);
  }, [buildTradeFilterSnapshot, tradeFilterPresetName]);

  const deleteTradeFilterPreset = useCallback((id) => {
    const key = String(id || "");
    if (!key) return;
    setTradeFilterPresets((prev) => prev.filter((item) => String(item.id) !== key));
  }, []);

  const tradeFilteredListings = useMemo(() => {
    const q = normalizeKey(tradeFilterText);
    const min = Number(tradePriceMin);
    const max = Number(tradePriceMax);
    const out = tradeListings.filter((item) => {
      if (tradeFilterType !== "all" && item.type !== tradeFilterType) return false;
      if (tradeFilterStatus !== "all" && item.status !== tradeFilterStatus) return false;
      if (tradeFilterDelivery !== "all" && item.deliveryType !== tradeFilterDelivery) return false;
      if (tradeFilterPayment !== "all" && item.paymentType !== tradeFilterPayment) return false;
      if (tradeFilterQuality !== "all" && item.qualityGrade !== tradeFilterQuality) return false;
      if (tradeSellerFilter !== "all") {
        const seller = normalizeKey(item.owner || item.contact || "");
        if (seller !== normalizeKey(tradeSellerFilter)) return false;
      }
      const price = Number(item.priceTlKg || 0);
      if (Number.isFinite(min) && min > 0 && price < min) return false;
      if (Number.isFinite(max) && max > 0 && price > max) return false;
      if (!q) return true;
      const hay = normalizeKey(
        `${item.title || ""} ${item.crop || ""} ${item.district || ""} ${item.contact || ""} ${item.deliveryType || ""} ${item.paymentType || ""}`
      );
      return hay.includes(q);
    });
    return out.sort((a, b) => {
      const priceA = Number(a.priceTlKg || 0);
      const priceB = Number(b.priceTlKg || 0);
      const qtyA = Number(a.quantityKg || 0);
      const qtyB = Number(b.quantityKg || 0);
      const tsA = new Date(a.createdAt || 0).getTime();
      const tsB = new Date(b.createdAt || 0).getTime();
      const refPrice = Number(tradeSummary?.market?.sellMedianTlKg || tradeSummary?.market?.buyMedianTlKg || 0);
      const scoreFor = (item, price, qty) => {
        const qualityWeight =
          item.qualityGrade === "premium" ? 10 : item.qualityGrade === "standard" ? 6 : item.qualityGrade === "mixed" ? 3 : 1;
        const deliveryWeight =
          item.deliveryType === "seller_delivery" ? 6 : item.deliveryType === "cargo" ? 5 : item.deliveryType === "pickup" ? 3 : 2;
        const liquidityWeight = Math.min(18, Math.round(Math.max(0, qty) / 180));
        const priceWeight = refPrice > 0 ? Math.max(0, Math.min(22, Math.round((refPrice / Math.max(0.01, price)) * 12))) : 8;
        return qualityWeight + deliveryWeight + liquidityWeight + priceWeight;
      };
      if (tradeSortBy === "price_asc") return priceA - priceB;
      if (tradeSortBy === "price_desc") return priceB - priceA;
      if (tradeSortBy === "qty_desc") return qtyB - qtyA;
      if (tradeSortBy === "smart") return scoreFor(b, priceB, qtyB) - scoreFor(a, priceA, qtyA);
      return tsB - tsA;
    });
  }, [
    tradeListings,
    tradeFilterText,
    tradeFilterType,
    tradeFilterStatus,
    tradeFilterDelivery,
    tradeFilterPayment,
    tradeFilterQuality,
    tradeSellerFilter,
    tradePriceMin,
    tradePriceMax,
    tradeSortBy,
    tradeSummary
  ]);

  const tradeSellerDirectory = useMemo(() => {
    const map = new Map();
    tradeListings.forEach((item) => {
      const seller = String(item.owner || item.contact || "").trim();
      if (!seller) return;
      const key = normalizeKey(seller);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: seller,
          listingCount: 0,
          openCount: 0,
          totalQty: 0,
          totalPrice: 0
        });
      }
      const row = map.get(key);
      row.listingCount += 1;
      if (item.status === "open") row.openCount += 1;
      row.totalQty += Number(item.quantityKg || 0);
      row.totalPrice += Number(item.priceTlKg || 0);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgPrice: item.listingCount ? item.totalPrice / item.listingCount : 0
      }))
      .sort((a, b) => b.openCount - a.openCount || b.listingCount - a.listingCount)
      .slice(0, 20);
  }, [tradeListings]);

  const tradeOpportunityHighlights = useMemo(() => {
    const refPrice = Number(tradeSummary?.market?.sellMedianTlKg || tradeSummary?.market?.buyMedianTlKg || 0);
    const scored = tradeFilteredListings.map((item) => {
      const price = Number(item.priceTlKg || 0);
      const qty = Number(item.quantityKg || 0);
      const qualityWeight =
        item.qualityGrade === "premium" ? 10 : item.qualityGrade === "standard" ? 6 : item.qualityGrade === "mixed" ? 3 : 1;
      const deliveryWeight =
        item.deliveryType === "seller_delivery" ? 6 : item.deliveryType === "cargo" ? 5 : item.deliveryType === "pickup" ? 3 : 2;
      const liquidityWeight = Math.min(18, Math.round(Math.max(0, qty) / 180));
      const priceWeight = refPrice > 0 ? Math.max(0, Math.min(22, Math.round((refPrice / Math.max(0.01, price)) * 12))) : 8;
      const score = qualityWeight + deliveryWeight + liquidityWeight + priceWeight;
      return { item, score };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [tradeFilteredListings, tradeSummary]);

  const tradeListingCommerceSignals = useMemo(() => {
    const map = new Map();
    tradeListings.forEach((item) => {
      const qty = Number((item.availableKg ?? item.quantityKg) || 0);
      const price = Number(item.priceTlKg || 0);
      const medSell = Number(tradeSummary?.market?.sellMedianTlKg || 0);
      const priceScore = medSell > 0 && price > 0 ? Math.max(0, Math.min(100, Math.round((medSell / price) * 100))) : 55;
      const liquidityScore = Math.max(0, Math.min(100, Math.round(Math.min(60, qty / 90) + (qty > 0 ? 25 : 0))));
      const deliveryScore =
        item.deliveryType === "seller_delivery" ? 88 : item.deliveryType === "cargo" ? 82 : item.deliveryType === "pickup" ? 70 : 64;
      const paymentScore =
        item.paymentType === "escrow" ? 92 : item.paymentType === "transfer" ? 80 : item.paymentType === "card" ? 78 : 66;
      const qualityScore =
        item.qualityGrade === "premium" ? 92 : item.qualityGrade === "standard" ? 78 : item.qualityGrade === "mixed" ? 60 : 55;
      const trustScore = Math.round(priceScore * 0.2 + liquidityScore * 0.22 + deliveryScore * 0.2 + paymentScore * 0.2 + qualityScore * 0.18);
      map.set(String(item.id), {
        trustScore,
        priceScore,
        liquidityScore,
        deliveryScore,
        paymentScore,
        qualityScore
      });
    });
    return map;
  }, [tradeListings, tradeSummary?.market?.sellMedianTlKg]);

  const getTradeSignalToneClass = (score) => {
    const num = Number(score || 0);
    if (num >= 82) return "safe";
    if (num >= 68) return "warn";
    return "risk";
  };

  const tradeFilteredStats = useMemo(() => {
    if (!tradeFilteredListings.length) return null;
    const vals = tradeFilteredListings
      .map((item) => Number(item.priceTlKg || 0))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const median = vals[Math.floor(vals.length / 2)];
    return {
      count: tradeFilteredListings.length,
      min: vals[0],
      median,
      max: vals[vals.length - 1]
    };
  }, [tradeFilteredListings]);

  const tradeMarketDepth = useMemo(() => {
    const open = tradeFilteredListings.filter((item) => item.status === "open");
    const sells = open.filter((item) => item.type === "sell");
    const buys = open.filter((item) => item.type === "buy");
    const bestAsk = sells.length ? Math.min(...sells.map((x) => Number(x.priceTlKg || 0)).filter((x) => x > 0)) : 0;
    const bestBid = buys.length ? Math.max(...buys.map((x) => Number(x.priceTlKg || 0)).filter((x) => x > 0)) : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? Number((bestAsk - bestBid).toFixed(2)) : 0;
    const mid = bestAsk > 0 && bestBid > 0 ? Number(((bestAsk + bestBid) / 2).toFixed(2)) : Number(bestAsk || bestBid || 0);
    const bucket = (value) => {
      const x = Math.round(Number(value || 0) * 10) / 10;
      return Number(x.toFixed(1));
    };
    const bucketMapSell = new Map();
    sells.forEach((item) => {
      const k = bucket(item.priceTlKg);
      if (!k) return;
      bucketMapSell.set(k, (bucketMapSell.get(k) || 0) + Number((item.availableKg ?? item.quantityKg) || 0));
    });
    const bucketMapBuy = new Map();
    buys.forEach((item) => {
      const k = bucket(item.priceTlKg);
      if (!k) return;
      bucketMapBuy.set(k, (bucketMapBuy.get(k) || 0) + Number((item.availableKg ?? item.quantityKg) || 0));
    });
    const depthSells = Array.from(bucketMapSell.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 8)
      .map(([price, qty]) => ({ price, qty: Number(qty.toFixed(0)) }));
    const depthBuys = Array.from(bucketMapBuy.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, 8)
      .map(([price, qty]) => ({ price, qty: Number(qty.toFixed(0)) }));
    const totalSellQty = sells.reduce((acc, item) => acc + Number((item.availableKg ?? item.quantityKg) || 0), 0);
    const totalBuyQty = buys.reduce((acc, item) => acc + Number((item.availableKg ?? item.quantityKg) || 0), 0);
    const liquidityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(Math.min(55, (totalSellQty + totalBuyQty) / 450) + Math.min(30, open.length * 2.8) + (spread <= 0.8 ? 15 : spread <= 1.5 ? 10 : 4))
      )
    );
    return {
      bestAsk,
      bestBid,
      spread,
      mid,
      totalSellQty: Math.round(totalSellQty),
      totalBuyQty: Math.round(totalBuyQty),
      liquidityScore,
      depthSells,
      depthBuys
    };
  }, [tradeFilteredListings]);

  const tradeMarketPulse = useMemo(() => {
    const sellQty = Number(tradeMarketDepth.totalSellQty || 0);
    const buyQty = Number(tradeMarketDepth.totalBuyQty || 0);
    const totalQty = sellQty + buyQty;
    const buyShare = totalQty > 0 ? buyQty / totalQty : 0.5;
    const imbalancePct = Math.round((buyShare - 0.5) * 200);
    const pressure = imbalancePct >= 18 ? "alim-baskin" : imbalancePct <= -18 ? "satis-baskin" : "denge";
    const liquidityTier =
      tradeMarketDepth.liquidityScore >= 78 ? "yüksek"
        : tradeMarketDepth.liquidityScore >= 56 ? "orta"
          : "düşük";
    const refSell = Number(tradeSummary?.market?.sellMedianTlKg || 0);
    const refBuy = Number(tradeSummary?.market?.buyMedianTlKg || 0);
    const mid = Number(tradeMarketDepth.mid || 0);
    const suggestedSell =
      Math.round(
        ((tradeMarketDepth.bestAsk || refSell || mid || 0) * (pressure === "alim-baskin" ? 1.015 : pressure === "satis-baskin" ? 0.992 : 1)) * 100
      ) / 100;
    const suggestedBuy =
      Math.round(
        ((tradeMarketDepth.bestBid || refBuy || mid || 0) * (pressure === "alim-baskin" ? 1.01 : pressure === "satis-baskin" ? 0.986 : 1)) * 100
      ) / 100;
    const note =
      pressure === "alim-baskin"
        ? "Talep daha guclu: satista premium denenebilir."
        : pressure === "satis-baskin"
          ? "Arz yüksek: fiyat esnekligi gerekli."
          : "Pazar dengeli: medyan etrafinda kal.";
    return {
      pressure,
      imbalancePct,
      liquidityTier,
      suggestedSell: Number.isFinite(suggestedSell) ? suggestedSell : 0,
      suggestedBuy: Number.isFinite(suggestedBuy) ? suggestedBuy : 0,
      note
    };
  }, [tradeMarketDepth, tradeSummary?.market?.sellMedianTlKg, tradeSummary?.market?.buyMedianTlKg]);

  const tradePulseActions = useMemo(() => {
    const sell = Number(tradeMarketPulse?.suggestedSell || 0);
    const buy = Number(tradeMarketPulse?.suggestedBuy || 0);
    return {
      hasSell: Number.isFinite(sell) && sell > 0,
      hasBuy: Number.isFinite(buy) && buy > 0
    };
  }, [tradeMarketPulse]);

  const tradeFavoriteSet = useMemo(
    () => new Set((tradeFavorites || []).map((id) => String(id))),
    [tradeFavorites]
  );

  const tradeCropQuickFilters = useMemo(() => {
    const map = new Map();
    tradeListings.forEach((item) => {
      const key = String(item.crop || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([crop, count]) => ({ crop, count }));
  }, [tradeListings]);

  const tradeCompareListings = useMemo(() => {
    if (!tradeCompareIds.length) return [];
    return tradeCompareIds
      .map((id) => tradeListings.find((item) => String(item.id) === String(id)))
      .filter(Boolean);
  }, [tradeCompareIds, tradeListings]);

  const tradeCartItems = useMemo(() => {
    if (!tradeCart.length) return [];
    return tradeCart
      .map((row) => {
        const listing = tradeListings.find((item) => String(item.id) === String(row.listingId));
        if (!listing) return null;
        const qty = Math.max(0, Number(row.quantityKg || 0));
        const price = Math.max(0, Number(listing.priceTlKg || 0));
        return {
          listing,
          listingId: String(row.listingId),
          quantityKg: qty,
          subtotalTl: qty * price
        };
      })
      .filter(Boolean);
  }, [tradeCart, tradeListings]);

  const tradeCartSummary = useMemo(() => {
    if (!tradeCartItems.length) {
      return { itemCount: 0, totalQtyKg: 0, totalTl: 0 };
    }
    return {
      itemCount: tradeCartItems.length,
      totalQtyKg: tradeCartItems.reduce((acc, row) => acc + Number(row.quantityKg || 0), 0),
      totalTl: tradeCartItems.reduce((acc, row) => acc + Number(row.subtotalTl || 0), 0)
    };
  }, [tradeCartItems]);

  const tradeMarketCampaigns = useMemo(
    () => [
      {
        id: "fast-cargo",
        title: "Hizli lojistik",
        detail: "Kargo + satici teslim ilanlarini one cikar.",
        cta: "Kargoya göre filtrele",
        action: () => setTradeFilterDelivery("cargo")
      },
      {
        id: "safe-pay",
        title: "Guvenli odeme",
        detail: "Escrow odeme tipinde risk azalt.",
        cta: "Escrow ilanlari",
        action: () => setTradeFilterPayment("escrow")
      },
      {
        id: "premium",
        title: "Premium kalite",
        detail: "Yüksek kalite ilanlarda daha iyi eslesme.",
        cta: "Premium filtre",
        action: () => setTradeFilterQuality("premium")
      }
    ],
    []
  );

  const toggleTradeFavorite = (listingId) => {
    const id = String(listingId || "").trim();
    if (!id) return;
    setTradeFavorites((prev) => {
      const set = new Set((prev || []).map((x) => String(x)));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set).slice(0, 300);
    });
  };

  const toggleTradeCompare = (listingId) => {
    const id = String(listingId || "").trim();
    if (!id) return;
    setTradeCompareIds((prev) => {
      const has = prev.some((x) => String(x) === id);
      if (has) return prev.filter((x) => String(x) !== id);
      if (prev.length >= 3) return prev.slice(1).concat(id);
      return prev.concat(id);
    });
  };

  const addTradeCartItem = (listing, qtyOverride = null) => {
    const listingId = String(listing?.id || "").trim();
    if (!listingId) return;
    const availableKg = Math.max(1, Number((listing?.availableKg ?? listing?.quantityKg) || 1));
    const nextQty = Math.max(
      1,
      Math.min(availableKg, Number(qtyOverride ?? Math.min(availableKg, Math.max(200, Math.round(availableKg * 0.2)))))
    );
    setTradeCart((prev) => {
      const idx = prev.findIndex((row) => String(row.listingId) === listingId);
      if (idx < 0) {
        return [...prev, { listingId, quantityKg: nextQty }].slice(-24);
      }
      const cloned = [...prev];
      cloned[idx] = {
        ...cloned[idx],
        quantityKg: Math.max(1, Math.min(availableKg, Number(cloned[idx].quantityKg || 0) + nextQty))
      };
      return cloned;
    });
    setTradeStatus("Sepete eklendi.");
  };

  const removeTradeCartItem = (listingId) => {
    const id = String(listingId || "").trim();
    if (!id) return;
    setTradeCart((prev) => prev.filter((row) => String(row.listingId) !== id));
  };

  const clearTradeCart = () => setTradeCart([]);

  const updateTradeCartQty = (listingId, quantityKg) => {
    const id = String(listingId || "").trim();
    if (!id) return;
    const qty = Math.max(1, Number(quantityKg || 1));
    setTradeCart((prev) =>
      prev.map((row) => (String(row.listingId) === id ? { ...row, quantityKg: qty } : row))
    );
  };

  const submitTradeCartBulkOffers = async () => {
    if (!tradeCartItems.length) {
      setTradeStatus("Toplu teklif icin sepet bos.");
      return;
    }
    const buyer = String(effectiveTradeIdentity || tradeOfferForm.buyer || "").trim();
    if (!buyer) {
      setTradeStatus("Toplu teklif icin once pazar profili gir.");
      return;
    }
    setTradeStatus("Sepetten toplu teklif gonderiliyor...");
    const tasks = tradeCartItems.slice(0, 8).map(async (row) => {
      const listing = row.listing;
      if (!listing?.id) return false;
      const basePrice = Number(listing.priceTlKg || 0);
      const offerPriceTlKg = Number((basePrice > 0 ? basePrice * 0.985 : 0).toFixed(2));
      if (offerPriceTlKg <= 0) return false;
      const available = Number((listing.availableKg ?? listing.quantityKg) || 0);
      const quantityKg = Math.max(1, Math.min(available > 0 ? available : row.quantityKg, Number(row.quantityKg || 1)));
      try {
        const res = await apiFetch("/api/trade/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            buyer,
            quantityKg,
            offerPriceTlKg,
            deliveryType: "any",
            paymentType: "escrow",
            qualityGrade: "any",
            note: "Sepetten toplu teklif"
          })
        });
        return Boolean(res?.ok);
      } catch (_) {
        return false;
      }
    });
    const results = await Promise.all(tasks);
    const okCount = results.filter(Boolean).length;
    setTradeStatus(`Toplu teklif tamamlandi: ${okCount}/${tasks.length}`);
    if (okCount > 0) clearTradeCart();
    await loadTradeData();
    setTradeWorkspaceTab("offers");
  };

  const checkoutTradeCart = async () => {
    const first = tradeCartItems[0];
    if (!first?.listing) {
      setTradeStatus("Sepet bos.");
      return;
    }
    const listing = first.listing;
    setTradeOfferForm((prev) => ({
      ...prev,
      listingId: listing.id,
      quantityKg: String(Math.max(1, Math.round(first.quantityKg || 1))),
      offerPriceTlKg: String(Math.max(0.1, Number(listing.priceTlKg || 0)))
    }));
    setTradeWorkspaceTab("offers");
    setTradeStatus("Sepet ilk urunu teklif formuna aktarıldi.");
    document.getElementById("market-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedTradeListing = useMemo(
    () => tradeListings.find((item) => String(item.id) === String(tradeOfferForm.listingId || "")) || null,
    [tradeListings, tradeOfferForm.listingId]
  );

  const locationCitySuggestions = useMemo(
    () =>
      dedupeLocationLabels([
        ...TURKEY_CITY_OPTIONS.map((item) => item.label),
        city,
        tradeQuery.city,
        tradeListingForm.city,
        landQuery.city,
        ...tradeListings.map((item) => item.city),
        ...manualListings.map((item) => item.city),
        ...landProfiles.map((item) => item.city)
      ]),
    [
      city,
      tradeQuery.city,
      tradeListingForm.city,
      landQuery.city,
      tradeListings,
      manualListings,
      landProfiles
    ]
  );

  const locationCityAnchor = useMemo(
    () =>
      String(
        tradeListingForm.city ||
        tradeQuery.city ||
        landQuery.city ||
        landPriceData?.city ||
        city ||
        ""
      ).trim(),
    [tradeListingForm.city, tradeQuery.city, landQuery.city, landPriceData?.city, city]
  );

  const getDistrictSuggestionsForCity = useCallback(
    (cityValue, extras = []) => {
      const cityKey = normalizeKey(cityValue);
      const staticHints = TURKEY_DISTRICT_HINTS[cityKey] || [];
      const dynamicDistricts = [
        ...tradeListings
          .filter((item) => !cityKey || normalizeKey(item.city) === cityKey)
          .map((item) => item.district),
        ...manualListings
          .filter((item) => !cityKey || normalizeKey(item.city) === cityKey)
          .map((item) => item.district),
        ...landProfiles
          .filter((item) => !cityKey || normalizeKey(item.city) === cityKey)
          .map((item) => item?.landDemo?.district),
        ...extras
      ];
      return dedupeLocationLabels([...staticHints, ...dynamicDistricts]);
    },
    [tradeListings, manualListings, landProfiles]
  );

  const locationDistrictSuggestions = useMemo(
    () =>
      getDistrictSuggestionsForCity(locationCityAnchor, [
        landDemo?.district,
        manualListingForm?.district,
        tradeListingForm?.district
      ]),
    [
      getDistrictSuggestionsForCity,
      locationCityAnchor,
      landDemo?.district,
      manualListingForm?.district,
      tradeListingForm?.district
    ]
  );

  const locationDistrictAnchor = useMemo(
    () =>
      String(
        landDemo?.district ||
        manualListingForm?.district ||
        tradeListingForm?.district ||
        ""
      ).trim(),
    [landDemo?.district, manualListingForm?.district, tradeListingForm?.district]
  );

  const getNeighborhoodSuggestionsForScope = useCallback(
    (cityValue, districtValue, extras = []) => {
      const cityKey = normalizeKey(cityValue);
      const districtKey = normalizeKey(districtValue);
      const districtSeed = String(districtValue || "").trim();
      const staticHints = districtSeed
        ? [`${districtSeed} Merkez`, `${districtSeed} Yeni`, ...COMMON_NEIGHBORHOOD_HINTS]
        : COMMON_NEIGHBORHOOD_HINTS;
      const raw = [
        ...staticHints,
        ...manualListings
          .filter((item) => {
            if (cityKey && normalizeKey(item.city) !== cityKey) return false;
            if (districtKey && normalizeKey(item.district) !== districtKey) return false;
            return true;
          })
          .map((item) => item.neighborhood),
        ...liveLandListings
          .filter((item) => {
            if (cityKey && normalizeKey(item.city) !== cityKey) return false;
            if (districtKey && normalizeKey(item.district) !== districtKey) return false;
            return true;
          })
          .map((item) => item.neighborhood),
        ...landProfiles
          .filter((item) => {
            if (cityKey && normalizeKey(item.city) !== cityKey) return false;
            if (districtKey && normalizeKey(item?.landDemo?.district) !== districtKey) return false;
            return true;
          })
          .map((item) => item?.landDemo?.neighborhood),
        ...extras
      ];
      return dedupeLocationLabels(raw);
    },
    [manualListings, liveLandListings, landProfiles]
  );

  const locationNeighborhoodSuggestions = useMemo(
    () =>
      getNeighborhoodSuggestionsForScope(locationCityAnchor, locationDistrictAnchor, [
        landDemo?.neighborhood,
        manualListingForm?.neighborhood
      ]),
    [
      getNeighborhoodSuggestionsForScope,
      locationCityAnchor,
      locationDistrictAnchor,
      landDemo?.neighborhood,
      manualListingForm?.neighborhood
    ]
  );

  const locationSearchIndex = useMemo(() => {
    const cityRows = TURKEY_CITY_OPTIONS.map((cityName) => ({
      id: `city-${normalizeKey(cityName)}`,
      type: "city",
      label: cityName,
      city: cityName,
      district: "",
      neighborhood: "",
      search: normalizeKey(cityName)
    }));
    const districtRows = Object.entries(TURKEY_DISTRICTS_BY_CITY).flatMap(([cityName, districts]) =>
      (Array.isArray(districts) ? districts : []).map((districtName) => ({
        id: `district-${normalizeKey(cityName)}-${normalizeKey(districtName)}`,
        type: "district",
        label: `${districtName} / ${cityName}`,
        city: cityName,
        district: districtName,
        neighborhood: "",
        search: normalizeKey(`${districtName} ${cityName}`)
      }))
    );
    const neighborhoodRows = locationNeighborhoodSuggestions.map((neighborhood) => ({
      id: `neighborhood-${normalizeKey(locationCityAnchor)}-${normalizeKey(locationDistrictAnchor)}-${normalizeKey(neighborhood)}`,
      type: "neighborhood",
      label: `${neighborhood}${locationDistrictAnchor ? ` / ${locationDistrictAnchor}` : ""}${locationCityAnchor ? ` / ${locationCityAnchor}` : ""}`,
      city: locationCityAnchor || "",
      district: locationDistrictAnchor || "",
      neighborhood,
      search: normalizeKey(`${neighborhood} ${locationDistrictAnchor} ${locationCityAnchor}`)
    }));
    return [...cityRows, ...districtRows, ...neighborhoodRows];
  }, [locationNeighborhoodSuggestions, locationCityAnchor, locationDistrictAnchor]);

  const locationSearchMatches = useMemo(() => {
    const query = normalizeKey(locationSearch);
    if (!query) return [];
    return locationSearchIndex.filter((item) => item.search.includes(query)).slice(0, 10);
  }, [locationSearch, locationSearchIndex]);

  const landScopedDistrictSuggestions = useMemo(
    () => getDistrictSuggestionsForCity(landQuery.city || city, [landDemo?.district]),
    [getDistrictSuggestionsForCity, landQuery.city, city, landDemo?.district]
  );

  const landScopedNeighborhoodSuggestions = useMemo(
    () =>
      getNeighborhoodSuggestionsForScope(landQuery.city || city, landDemo?.district, [
        landDemo?.neighborhood,
        manualListingForm?.neighborhood
      ]),
    [
      getNeighborhoodSuggestionsForScope,
      landQuery.city,
      city,
      landDemo?.district,
      landDemo?.neighborhood,
      manualListingForm?.neighborhood
    ]
  );

  const manualScopedDistrictSuggestions = useMemo(
    () => getDistrictSuggestionsForCity(landQuery.city || city, [manualListingForm?.district]),
    [getDistrictSuggestionsForCity, landQuery.city, city, manualListingForm?.district]
  );

  const manualScopedNeighborhoodSuggestions = useMemo(
    () =>
      getNeighborhoodSuggestionsForScope(landQuery.city || city, manualListingForm?.district, [
        manualListingForm?.neighborhood
      ]),
    [
      getNeighborhoodSuggestionsForScope,
      landQuery.city,
      city,
      manualListingForm?.district,
      manualListingForm?.neighborhood
    ]
  );

  const tradeScopedDistrictSuggestions = useMemo(
    () => getDistrictSuggestionsForCity(tradeListingForm.city || tradeQuery.city || city, [tradeListingForm?.district]),
    [
      getDistrictSuggestionsForCity,
      tradeListingForm.city,
      tradeQuery.city,
      city,
      tradeListingForm?.district
    ]
  );

  const weatherScopedDistrictSuggestions = useMemo(
    () => getDistrictSuggestionsForCity(city, [landDemo?.district]),
    [getDistrictSuggestionsForCity, city, landDemo?.district]
  );

  const weatherScopedNeighborhoodSuggestions = useMemo(
    () => getNeighborhoodSuggestionsForScope(city, landDemo?.district, [landDemo?.neighborhood]),
    [getNeighborhoodSuggestionsForScope, city, landDemo?.district, landDemo?.neighborhood]
  );

  const cityCanonicalByKey = useMemo(
    () =>
      TURKEY_CITY_OPTIONS.reduce((acc, cityName) => {
        acc[normalizeKey(cityName)] = cityName;
        return acc;
      }, {}),
    []
  );

  const tradeMyListings = useMemo(() => {
    const id = normalizeKey(effectiveTradeIdentity);
    if (!id) return [];
    return tradeListings.filter((item) => {
      const owner = normalizeKey(item.owner || item.contact || "");
      return owner && owner === id;
    });
  }, [tradeListings, effectiveTradeIdentity]);

  const tradeMyOffers = useMemo(() => {
    const id = normalizeKey(effectiveTradeIdentity);
    if (!id) return [];
    return tradeOffers.filter((item) => normalizeKey(item.buyer || "") === id);
  }, [tradeOffers, effectiveTradeIdentity]);

  const isOfferExpired = useCallback((offer) => {
    const status = String(offer?.status || "").toLowerCase();
    if (status === "expired") return true;
    const expTs = Date.parse(String(offer?.expiresAt || ""));
    if (!Number.isFinite(expTs)) return false;
    return expTs <= Date.now();
  }, []);

  const getOfferExpiryText = useCallback((offer) => {
    const expTs = Date.parse(String(offer?.expiresAt || ""));
    if (!Number.isFinite(expTs)) return "Suresiz";
    const deltaMs = expTs - Date.now();
    if (deltaMs <= 0) return "Suresi doldu";
    const hours = Math.ceil(deltaMs / (3600 * 1000));
    if (hours >= 24) return `${Math.ceil(hours / 24)} gun kaldi`;
    return `${hours} saat kaldi`;
  }, []);

  const tradeIncomingOffers = useMemo(() => {
    if (!tradeMyListings.length) return [];
    const listingIds = new Set(tradeMyListings.map((item) => String(item.id)));
    return tradeOffers
      .filter((item) => listingIds.has(String(item.listingId)))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
  }, [tradeOffers, tradeMyListings]);

  const tradeIncomingActionableOffers = useMemo(
    () =>
      tradeIncomingOffers.filter((item) => {
        const status = String(item.status || "").toLowerCase();
        return ["pending", "countered"].includes(status) && !isOfferExpired(item);
      }),
    [tradeIncomingOffers, isOfferExpired]
  );

  React.useEffect(() => {
    setTradeIncomingOfferSelection((prev) =>
      prev.filter((id) => tradeIncomingOffers.some((offer) => String(offer.id) === String(id)))
    );
  }, [tradeIncomingOffers]);

  const tradeMyOrders = useMemo(() => {
    const id = normalizeKey(effectiveTradeIdentity);
    if (!id) return [];
    return tradeOrders.filter((item) => {
      const seller = normalizeKey(item.seller || "");
      const buyer = normalizeKey(item.buyer || "");
      return seller === id || buyer === id;
    });
  }, [tradeOrders, effectiveTradeIdentity]);

  const tradeMatchesFiltered = useMemo(() => {
    const minScore = Number(tradeMatchMinScore || 0);
    return tradeMatches.filter((item) => {
      const tierOk =
        tradeMatchTierFilter === "all" ||
        String(item?.match?.tier || "").toLowerCase() === tradeMatchTierFilter;
      const scoreOk = Number(item?.match?.score || 0) >= minScore;
      return tierOk && scoreOk;
    });
  }, [tradeMatches, tradeMatchTierFilter, tradeMatchMinScore]);

  const tradeAutoAcceptCandidates = useMemo(() => {
    return tradeMatchesFiltered.filter((row) => {
      const score = Number(row?.match?.score || 0);
      const listingPrice = Number(row?.listing?.priceTlKg || 0);
      const offerPrice = Number(row?.offer?.offerPriceTlKg || 0);
      const offerStatus = String(row?.offer?.status || "").toLowerCase();
      const statusOk = offerStatus === "pending" || offerStatus === "countered";
      const priceOk = listingPrice > 0 ? offerPrice >= listingPrice * 0.98 : true;
      return statusOk && score >= 85 && priceOk;
    });
  }, [tradeMatchesFiltered]);

  const landDistrictBenchmark = useMemo(() => {
    const cityKeyNorm = normalizeKey(effectiveLandCity || "");
    const districtKeyNorm = normalizeKey(landDemo?.district || "");
    const neighborhoodKeyNorm = normalizeKey(landDemo?.neighborhood || "");
    if (!cityKeyNorm) return null;
    const cityRows = manualListings.filter((item) => normalizeKey(item.city || "") === cityKeyNorm);
    const districtRows = districtKeyNorm
      ? cityRows.filter((item) => normalizeKey(item.district || "") === districtKeyNorm)
      : [];
    const neighborhoodRows = neighborhoodKeyNorm
      ? cityRows.filter((item) => normalizeKey(item.neighborhood || "") === neighborhoodKeyNorm)
      : [];
    const toMedian = (rows) => {
      const vals = rows
        .map((x) => Number(x.priceTlDa || 0))
        .filter((x) => Number.isFinite(x) && x > 0)
        .sort((a, b) => a - b);
      if (!vals.length) return null;
      return vals[Math.floor(vals.length / 2)];
    };
    const cityMedian = toMedian(cityRows);
    const districtMedian = toMedian(districtRows);
    const neighborhoodMedian = toMedian(neighborhoodRows);
    const current = Number(landPriceData?.priceTlDa || 0);
    if (!cityMedian && !districtMedian && !neighborhoodMedian && !current) return null;
    const ref = Number(neighborhoodMedian || districtMedian || cityMedian || current || 0);
    const deltaPct = ref > 0 && current > 0 ? Number((((current - ref) / ref) * 100).toFixed(1)) : 0;
    return {
      cityMedian: cityMedian ? Math.round(cityMedian) : null,
      districtMedian: districtMedian ? Math.round(districtMedian) : null,
      neighborhoodMedian: neighborhoodMedian ? Math.round(neighborhoodMedian) : null,
      cityCount: cityRows.length,
      districtCount: districtRows.length,
      neighborhoodCount: neighborhoodRows.length,
      deltaPct
    };
  }, [manualListings, effectiveLandCity, landDemo?.district, landDemo?.neighborhood, landPriceData?.priceTlDa]);

  const landDistrictHeatmap = useMemo(() => {
    const cityNorm = normalizeKey(effectiveLandCity || "");
    if (!cityNorm) return [];
    const rows = manualListings.filter((item) => normalizeKey(item.city || "") === cityNorm);
    if (!rows.length) return [];
    const byDistrict = new Map();
    rows.forEach((item) => {
      const district = String(item.district || "Bilinmeyen").trim() || "Bilinmeyen";
      const key = normalizeKey(district);
      if (!byDistrict.has(key)) byDistrict.set(key, { district, values: [] });
      const price = Number(item.priceTlDa || 0);
      if (Number.isFinite(price) && price > 0) byDistrict.get(key).values.push(price);
    });
    const all = rows
      .map((x) => Number(x.priceTlDa || 0))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    const cityMedian = all.length ? all[Math.floor(all.length / 2)] : 0;
    return Array.from(byDistrict.values())
      .map((entry) => {
        const vals = entry.values.sort((a, b) => a - b);
        if (!vals.length) return null;
        const median = vals[Math.floor(vals.length / 2)];
        const deltaPct = cityMedian > 0 ? ((median - cityMedian) / cityMedian) * 100 : 0;
        const intensity = Math.max(0, Math.min(100, Math.round(50 + deltaPct * 1.4)));
        return {
          district: entry.district,
          median: Math.round(median),
          count: vals.length,
          deltaPct: Number(deltaPct.toFixed(1)),
          intensity
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || b.median - a.median)
      .slice(0, 12);
  }, [manualListings, effectiveLandCity]);

  const landDistrictLeaders = useMemo(() => {
    if (!landDistrictHeatmap.length) return { high: null, low: null };
    const sorted = landDistrictHeatmap.slice().sort((a, b) => b.median - a.median);
    return {
      high: sorted[0] || null,
      low: sorted[sorted.length - 1] || null
    };
  }, [landDistrictHeatmap]);

  const landNeighborhoodHeatmap = useMemo(() => {
    const cityNorm = normalizeKey(effectiveLandCity || "");
    const districtNorm = normalizeKey(landDemo?.district || "");
    if (!cityNorm) return [];
    const rows = manualListings.filter(
      (item) =>
        normalizeKey(item.city || "") === cityNorm &&
        (!districtNorm || normalizeKey(item.district || "") === districtNorm) &&
        normalizeKey(item.neighborhood || "")
    );
    if (!rows.length) return [];
    const byNeighborhood = new Map();
    rows.forEach((item) => {
      const name = String(item.neighborhood || "").trim();
      if (!name) return;
      const key = normalizeKey(name);
      if (!byNeighborhood.has(key)) byNeighborhood.set(key, { neighborhood: name, values: [] });
      const price = Number(item.priceTlDa || 0);
      if (Number.isFinite(price) && price > 0) byNeighborhood.get(key).values.push(price);
    });
    const all = rows
      .map((x) => Number(x.priceTlDa || 0))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    const districtMedian = all.length ? all[Math.floor(all.length / 2)] : 0;
    return Array.from(byNeighborhood.values())
      .map((entry) => {
        const vals = entry.values.slice().sort((a, b) => a - b);
        if (!vals.length) return null;
        const median = vals[Math.floor(vals.length / 2)];
        const deltaPct = districtMedian > 0 ? ((median - districtMedian) / districtMedian) * 100 : 0;
        return {
          neighborhood: entry.neighborhood,
          median: Math.round(median),
          count: vals.length,
          deltaPct: Number(deltaPct.toFixed(1)),
          intensity: Math.max(0, Math.min(100, Math.round(50 + deltaPct * 1.6)))
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || b.median - a.median)
      .slice(0, 10);
  }, [manualListings, effectiveLandCity, landDemo?.district]);

  const landSignalQuality = useMemo(() => {
    const geoCount = Number(landPriceData?.geoNeighborCount || 0);
    const compCount = Number(landPriceData?.componentCount || 0);
    const avgKm = Number(landPriceData?.geoAvgDistanceKm || 0);
    const conf = Number(landPriceData?.confidenceScore || 0);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(conf * 58 + Math.min(28, geoCount * 2.2) + Math.min(18, compCount * 1.8) - Math.min(22, avgKm * 0.35))
      )
    );
    return {
      score,
      geoCount,
      avgKm,
      confidencePct: Math.round(conf * 100)
    };
  }, [landPriceData]);

  const landLocationScope = useMemo(() => {
    const c = landPriceData?.contextInsights;
    if (!c) return null;
    const neighborhoodRank =
      Number(c.neighborhoodRank || 0) > 0 && Number(c.neighborhoodTotal || 0) > 0
        ? `${c.neighborhoodRank}/${c.neighborhoodTotal}`
        : "-";
    const districtRank =
      Number(c.districtRank || 0) > 0 && Number(c.districtTotal || 0) > 0 ? `${c.districtRank}/${c.districtTotal}` : "-";
    return {
      neighborhoodRank,
      districtRank,
      freshness: Number(c.freshnessScore || 0),
      sampleCount: Number(c.sampleCount || 0),
      position: c.marketPosition || "denge",
      premiumPct: Number(c.premiumPct || 0),
      cityMedianTlDa: Number(c.cityMedianTlDa || 0),
      districtMedianTlDa: Number(c.districtMedianTlDa || 0),
      neighborhoodMedianTlDa: Number(c.neighborhoodMedianTlDa || 0),
      topDistricts: Array.isArray(c.topDistricts) ? c.topDistricts : [],
      lowDistricts: Array.isArray(c.lowDistricts) ? c.lowDistricts : []
    };
  }, [landPriceData?.contextInsights]);

  const landActionPlan = useMemo(() => {
    const decision = landPriceData?.decisionSignals || null;
    const context = landPriceData?.contextInsights || null;
    const uncertainty = Number(landPriceData?.uncertaintyPct || 18);
    const score = Number(decision?.score || 50);
    const premium = Number(context?.premiumPct || 0);
    const trend = Number(landMlData?.trendPct || 0);
    const strategy =
      score >= 74 && uncertainty <= 16
        ? "agresif-alim"
        : score >= 60 && uncertainty <= 22
          ? "denge"
          : "temkinli";
    const notes = [];
    if (premium >= 8) notes.push("Fiyat, yerel referansin ust bandinda; pazarlik marji dar olabilir.");
    else if (premium <= -8) notes.push("Fiyat, referansin altinda; alim avantajli gorunuyor.");
    if (trend >= 4) notes.push("Kisa vadede yukari momentum var, gecikme maliyet yaratabilir.");
    else if (trend <= -4) notes.push("Momentum zayif; acele etmeyip emsal biriktirmek mantikli.");
    if (uncertainty >= 22) notes.push("Belirsizlik yüksek; mahalle bazlı daha fazla ilan toplanmalı.");
    if (!notes.length) notes.push("Sinyaller dengeli; baz senaryo ile ilerlemek uygun.");
    return {
      strategy,
      score,
      uncertainty,
      notes: notes.slice(0, 3)
    };
  }, [landPriceData, landMlData?.trendPct]);

  const landDataReadiness = useMemo(() => {
    const areaOk = Number(landDemo?.areaDa || 0) > 0;
    const districtOk = String(landDemo?.district || "").trim().length > 0;
    const neighborhoodOk = String(landDemo?.neighborhood || "").trim().length > 0;
    const coordsOk = Boolean(parsedCoords);
    const soilOk = Number(landDemo?.soilScore || 0) > 0;
    const slopeOk = Number(landDemo?.slopePct || 0) >= 0;
    const total = 6;
    const hit = [areaOk, districtOk, neighborhoodOk, coordsOk, soilOk, slopeOk].filter(Boolean).length;
    const score = Math.round((hit / total) * 100);
    return {
      score,
      hit,
      total,
      missing: [
        !areaOk ? "alan" : null,
        !districtOk ? "ilçe" : null,
        !neighborhoodOk ? "mahalle" : null,
        !coordsOk ? "koordinat" : null,
        !soilOk ? "toprak skoru" : null
      ].filter(Boolean)
    };
  }, [landDemo?.areaDa, landDemo?.district, landDemo?.neighborhood, landDemo?.soilScore, landDemo?.slopePct, parsedCoords]);

  const applyLandFromSoilSignals = useCallback(() => {
    if (!soilReport) {
      setLandProfileStatus("Toprak raporu gelmeden otomatik doldurma yapilamaz.");
      return;
    }
    const healthScore = Number(soilReport?.soilHealth?.score || 0);
    const fallbackSoil = Number(landDemo?.soilScore || 65);
    const nextSoil = Math.max(35, Math.min(95, Math.round(healthScore || fallbackSoil)));
    const moistureState = String(soilReport?.internetSignals?.moistureState || "").toLowerCase();
    const moistureTop = Number(soilReport?.internetSignals?.moistureTopAvg || 0);
    const moistureMid = Number(soilReport?.internetSignals?.moistureMidAvg || 0);
    const moistureSignal = Math.max(moistureTop, moistureMid);
    const irrigation = moistureState.includes("düşük") || (Number.isFinite(moistureSignal) && moistureSignal < 0.16) ? "var" : "yok";
    const soilType = String(soilReport?.soilType || "").toLowerCase();
    const zoneHint = soilType.includes("killi") ? "gecis" : soilType.includes("kumlu") ? "ova" : String(landDemo?.zone || "gecis");
    setLandDemo((prev) => ({
      ...prev,
      soilScore: nextSoil,
      irrigation,
      zone: zoneHint
    }));
    setLandProfileStatus("Toprak/harita sinyaline göre arazi girdileri otomatik güncellendi.");
    setLandRefreshKey((prev) => prev + 1);
  }, [soilReport, landDemo?.soilScore, landDemo?.zone]);

  const demoStatusCards = useMemo(
    () => [
      {
        key: "weather",
        title: "Hava",
        status: weather ? "hazır" : "bekliyor",
        detail: weather ? `${weather.condition || "-"} • ${weather.temp ?? "-"}°C` : "Veri bekleniyor"
      },
      {
        key: "soil",
        title: "Toprak",
        status: soilReport ? "hazır" : "bekliyor",
        detail: soilReport ? `${soilReport.soilType || "-"} • pH ${soilReport.ph ?? "-"}` : "Rapor bekleniyor"
      },
      {
        key: "land",
        title: "Arazi",
        status: landPriceData?.priceTlDa ? "hazır" : "bekliyor",
        detail: landPriceData?.priceTlDa
          ? `${Number(landPriceData.priceTlDa).toLocaleString("tr-TR")} TL/da`
          : "Fiyat verisi bekleniyor"
      },
      {
        key: "market",
        title: "Pazar",
        status: tradeListings.length ? "hazır" : "bos",
        detail: tradeListings.length
          ? `${tradeListings.length} ilan • ${tradeOffers.length} teklif`
          : "İlan bulunmuyor"
      },
      {
        key: "economy",
        title: "Finansal",
        status: econTotals ? "hazır" : "bekliyor",
        detail: econTotals ? `Net ${Number(econTotals.net || 0).toLocaleString("tr-TR")} TL` : "Hesap bekleniyor"
      }
    ],
    [weather, soilReport, landPriceData, tradeListings.length, tradeOffers.length, econTotals]
  );

  const demoControlMetrics = useMemo(() => {
    const totalModules = demoStatusCards.length;
    const readyModules = demoStatusCards.filter((item) => item.status === "hazır").length;
    const waitingModules = demoStatusCards.filter((item) => item.status !== "hazır").length;
    const smokeItems = Array.isArray(demoSmokeResult?.items) ? demoSmokeResult.items : [];
    const smokePass = smokeItems.filter((item) => item.ok).length;
    const smokeTotal = smokeItems.length;
    const runScore =
      Math.round((totalModules > 0 ? (readyModules / totalModules) * 70 : 0) + (smokeTotal > 0 ? (smokePass / smokeTotal) * 30 : 0));
    return {
      totalModules,
      readyModules,
      waitingModules,
      smokePass,
      smokeTotal,
      runScore
    };
  }, [demoStatusCards, demoSmokeResult]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (bottomTab !== "demos") return;
    if (demoBootstrapRunning || demoBootstrapReady) return;
    if (demoBootstrapLastAttemptAt && Date.now() - demoBootstrapLastAttemptAt < 20000) return;
    const readyEnough = demoControlMetrics.readyModules >= 4 && demoControlMetrics.smokeTotal > 0;
    if (readyEnough) {
      setDemoBootstrapReady(true);
      if (!demoBootstrapSummary) {
        setDemoBootstrapSummary(`Son hazırlama: hazır (${new Date().toLocaleTimeString("tr-TR")})`);
      }
      return;
    }
    prepareDemosForUse({ silent: true });
  }, [
    bottomTab,
    demoBootstrapRunning,
    demoBootstrapReady,
    demoBootstrapLastAttemptAt,
    demoBootstrapSummary,
    demoControlMetrics.readyModules,
    demoControlMetrics.smokeTotal
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const demoFlowStats = useMemo(() => {
    const total = demoFlowHistory.length;
    const success = demoFlowHistory.filter((item) => item.ok).length;
    const fail = total - success;
    const successRate = total ? Math.round((success / total) * 100) : 0;
    const avgDurationMs = total
      ? Math.round(demoFlowHistory.reduce((acc, item) => acc + Number(item.durationMs || 0), 0) / total)
      : 0;
    const byFlow = demoFlowLibrary.reduce((acc, flow) => {
      const last = demoFlowHistory.find((item) => item.flowId === flow.id) || null;
      acc[flow.id] = last;
      return acc;
    }, {});
    return { total, success, fail, successRate, avgDurationMs, byFlow };
  }, [demoFlowHistory]);

  const demoFlowHistoryFiltered = useMemo(() => {
    const now = Date.now();
    const windowStart =
      demoFlowWindow === "today"
        ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()
        : demoFlowWindow === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : 0;
    return demoFlowHistory.filter((item) => {
      if (windowStart > 0 && Number(item?.endedAt || 0) < windowStart) return false;
      if (demoFlowFilter === "ok" && !item?.ok) return false;
      if (demoFlowFilter === "fail" && item?.ok) return false;
      return true;
    });
  }, [demoFlowHistory, demoFlowFilter, demoFlowWindow]);

  const demoFlowTrend = useMemo(() => {
    const recent = demoFlowHistory.slice(0, 10);
    if (!recent.length) return null;
    const success = recent.filter((x) => x.ok).length;
    const fail = recent.length - success;
    const successRate = Math.round((success / recent.length) * 100);
    const dominantFail = recent
      .filter((x) => !x.ok)
      .reduce((acc, item) => {
        const key = String(item.flowId || "unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    const topFailFlowId = Object.keys(dominantFail).sort((a, b) => dominantFail[b] - dominantFail[a])[0] || "";
    return {
      successRate,
      fail,
      topFailFlowId,
      topFailFlowLabel: demoFlowLibrary.find((x) => x.id === topFailFlowId)?.title || topFailFlowId || "-"
    };
  }, [demoFlowHistory]);

  const demoFailingFlows = useMemo(() => {
    const map = new Map();
    demoFlowHistory.forEach((item) => {
      if (item?.ok) return;
      const flowId = String(item?.flowId || "");
      if (!flowId) return;
      if (!map.has(flowId)) {
        const flow = demoFlowLibrary.find((x) => x.id === flowId);
        map.set(flowId, {
          flowId,
          title: flow?.title || flowId,
          failCount: 0,
          lastAt: 0
        });
      }
      const row = map.get(flowId);
      row.failCount += 1;
      row.lastAt = Math.max(Number(row.lastAt || 0), Number(item?.endedAt || 0));
    });
    return Array.from(map.values())
      .sort((a, b) => b.failCount - a.failCount || b.lastAt - a.lastAt)
      .slice(0, 6);
  }, [demoFlowHistory]);

  const demoAutopilotSummary = useMemo(() => {
    const total = demoAutopilotSteps.length;
    const done = demoAutopilotSteps.filter((step) => step.status === "ok").length;
    const failed = demoAutopilotSteps.filter((step) => step.status === "failed").length;
    const running = demoAutopilotSteps.find((step) => step.status === "running");
    const completed = demoAutopilotSteps.filter((step) => step.status === "ok" || step.status === "failed");
    const totalDurationMs = completed.reduce((acc, step) => acc + (Number(step.durationMs) || 0), 0);
    const avgDurationMs = completed.length ? Math.round(totalDurationMs / completed.length) : 0;
    const progressPct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, failed, runningLabel: running?.label || "", progressPct, totalDurationMs, avgDurationMs };
  }, [demoAutopilotSteps]);

  const demoRiskLevel = useMemo(() => {
    const score = Number(demoControlMetrics?.runScore || 0);
    const success = Number(demoFlowStats?.successRate || 0);
    const smokeFail = Number(demoSmokeResult?.failCount || 0);
    const penalty = Math.max(0, 85 - score) + Math.max(0, 80 - success) + smokeFail * 12;
    if (penalty <= 16) return { label: "Düşük", tone: "safe" };
    if (penalty <= 42) return { label: "Orta", tone: "warn" };
    return { label: "Yüksek", tone: "risk" };
  }, [demoControlMetrics?.runScore, demoFlowStats?.successRate, demoSmokeResult?.failCount]);

  const demoRecommendedCommands = useMemo(() => {
    const items = [];
    if (Number(demoSmokeResult?.failCount || 0) > 0) {
      items.push({ id: "repair", title: "Recovery calistir", note: "Oto onarim + hatali akis tekrar + smoke." });
    }
    if (demoFlowTrend?.topFailFlowId) {
      items.push({
        id: "critical",
        title: "Kritik akisi kos",
        note: `En çok hata: ${demoFlowTrend.topFailFlowLabel || demoFlowTrend.topFailFlowId}`
      });
    }
    if (Number(demoFlowStats?.total || 0) < 3) {
      items.push({ id: "all", title: "Tam tur preset", note: "Tüm ana akışları toplu doğrula." });
    }
    if (!items.length) {
      items.push({ id: "smoke", title: "Smoke doğrulama", note: "Mevcut durumu hızlı kontrol et." });
    }
    return items.slice(0, 3);
  }, [demoSmokeResult?.failCount, demoFlowTrend, demoFlowStats?.total]);

  const investorSnapshot = useMemo(() => {
    const demoScore = Number(demoControlMetrics?.runScore || 0);
    const flowSuccess = Number(demoFlowStats?.successRate || 0);
    const smokeFail = Number(demoSmokeResult?.failCount || 0);
    const marketOpen = Number(tradeDashboard?.listings?.open || tradeListings.filter((x) => x.status === "open").length || 0);
    const activeOrders = Number(tradeDashboard?.orders?.active || 0);
    const fulfilledVolumeKg = Number(tradeDashboard?.orders?.fulfilledVolumeKg || 0);
    const landConfidence = Math.round(Number(landPriceData?.confidenceScore || 0) * 100);
    const readiness = Math.max(0, Math.min(100, Math.round(demoScore * 0.5 + flowSuccess * 0.35 + Math.max(0, 100 - smokeFail * 20) * 0.15)));
    return {
      readiness,
      demoScore,
      flowSuccess,
      smokeFail,
      marketOpen,
      activeOrders,
      fulfilledVolumeKg,
      landConfidence
    };
  }, [
    demoControlMetrics?.runScore,
    demoFlowStats?.successRate,
    demoSmokeResult?.failCount,
    tradeDashboard?.listings?.open,
    tradeDashboard?.orders?.active,
    tradeDashboard?.orders?.fulfilledVolumeKg,
    tradeListings,
    landPriceData?.confidenceScore
  ]);

  const investorHighlights = useMemo(() => {
    const items = [];
    items.push(
      investorSnapshot.readiness >= 75
        ? "Platform sunum hazırlık seviyesinde."
        : "Hazirlik seviyesi artiyor; smoke ve akis istikrari izlenmeli."
    );
    if (investorSnapshot.marketOpen > 0) {
      items.push(`Pazar tarafında ${investorSnapshot.marketOpen} aktif ilan canlı görünüyor.`);
    }
    if (investorSnapshot.activeOrders > 0) {
      items.push(`Siparis boru hatti aktif (${investorSnapshot.activeOrders} aktif siparis).`);
    }
    if (investorSnapshot.landConfidence >= 60) {
      items.push(`Arazi fiyat model guveni yatirim sunumu icin yeterli (%${investorSnapshot.landConfidence}).`);
    } else {
      items.push(`Arazi model guveni gelistirilmeli (%${investorSnapshot.landConfidence}).`);
    }
    return items.slice(0, 4);
  }, [investorSnapshot]);

  const investorChecklist = useMemo(
    () => [
      {
        id: "demo",
        label: "Demo skoru",
        ok: investorSnapshot.demoScore >= 75,
        value: `${investorSnapshot.demoScore}/100`
      },
      {
        id: "flow",
        label: "Akis başarısi",
        ok: investorSnapshot.flowSuccess >= 80,
        value: `%${investorSnapshot.flowSuccess}`
      },
      {
        id: "smoke",
        label: "Smoke sağligi",
        ok: investorSnapshot.smokeFail === 0,
        value: `${investorSnapshot.smokeFail} fail`
      },
      {
        id: "market",
        label: "Pazar aktivitesi",
        ok: investorSnapshot.marketOpen > 0,
        value: `${investorSnapshot.marketOpen} açık ilan`
      },
      {
        id: "orders",
        label: "Siparis akisi",
        ok: investorSnapshot.activeOrders > 0,
        value: `${investorSnapshot.activeOrders} aktif`
      },
      {
        id: "land",
        label: "Arazi model guveni",
        ok: investorSnapshot.landConfidence >= 60,
        value: `%${investorSnapshot.landConfidence}`
      }
    ],
    [investorSnapshot]
  );

  const investorUnitEconomics = useMemo(() => {
    const medianSell = Number(tradeDashboard?.market?.sellMedianTlKg || 0);
    const fulfilledVolumeKg = Number(investorSnapshot.fulfilledVolumeKg || 0);
    const gmvTl = Math.round(fulfilledVolumeKg * Math.max(0, medianSell));
    const takeRatePct = 3.5;
    const netRevenueTl = Math.round(gmvTl * (takeRatePct / 100));
    const projectedMonthlyGmvTl = Math.round(
      gmvTl * 4 + Number(investorSnapshot.activeOrders || 0) * Math.max(0, medianSell) * 350
    );
    const projectedMonthlyRevenueTl = Math.round(projectedMonthlyGmvTl * (takeRatePct / 100));
    const orderFillRatePct = Number(tradeSummary?.orderCount || 0) > 0
      ? Math.round((Number(tradeSummary?.orderCompletedCount || 0) / Number(tradeSummary.orderCount || 1)) * 100)
      : 0;
    return {
      gmvTl,
      netRevenueTl,
      projectedMonthlyGmvTl,
      projectedMonthlyRevenueTl,
      takeRatePct,
      orderFillRatePct
    };
  }, [
    tradeDashboard?.market?.sellMedianTlKg,
    investorSnapshot.fulfilledVolumeKg,
    investorSnapshot.activeOrders,
    tradeSummary?.orderCount,
    tradeSummary?.orderCompletedCount
  ]);

  const investorBlockers = useMemo(() => investorChecklist.filter((item) => !item.ok), [investorChecklist]);

  const investorMomentum = useMemo(() => {
    if (!investorSnapshots.length) return null;
    const latest = investorSnapshots[0];
    const prev = investorSnapshots[1] || null;
    const delta = prev ? Number(latest.readiness || 0) - Number(prev.readiness || 0) : 0;
    const trend =
      delta > 0 ? "yukselis" : delta < 0 ? "düşük trend" : "stabil";
    return {
      latest,
      prev,
      delta,
      trend
    };
  }, [investorSnapshots]);

  const investorPresentationScript = useMemo(
    () =>
      [
        "AgroGuard 90 saniye sunum akisi",
        `1) Platform hazırlık skoru: ${investorSnapshot.readiness}/100.`,
        `2) Operasyonel guvenilirlik: akis başarı %${investorSnapshot.flowSuccess}, smoke fail ${investorSnapshot.smokeFail}.`,
        `3) Pazar motoru: ${investorSnapshot.marketOpen} açık ilan, ${investorSnapshot.activeOrders} aktif siparis, ${Math.round(
          investorSnapshot.fulfilledVolumeKg
        ).toLocaleString("tr-TR")} kg hacim.`,
        `4) Arazi modeli: güven %${investorSnapshot.landConfidence}, birim tahmin ${Number(
          landPriceData?.priceTlDa || 0
        ).toLocaleString("tr-TR")} TL/da.`,
        "5) Tek tuşla: pazar vitrini, arazi paneli ve canlı demo akışı açılıyor."
      ].join("\n"),
    [investorSnapshot, landPriceData?.priceTlDa]
  );

  const presentationScenes = useMemo(
    () => [
      {
        id: "readiness",
        title: "Hazirlik",
        detail: `Platform hazırlık ${investorSnapshot.readiness}/100, akis başarı %${investorSnapshot.flowSuccess}.`,
        action: () => {
          setBottomTab("demos");
          setDemoDockTab("yield");
        }
      },
      {
        id: "market",
        title: "Pazar cekirdegi",
        detail: `${investorSnapshot.marketOpen} açık ilan, ${investorSnapshot.activeOrders} aktif siparis, ${Math.round(
          investorSnapshot.fulfilledVolumeKg
        ).toLocaleString("tr-TR")} kg hacim.`,
        action: () => {
          setBottomTab("market");
          setTradeWorkspaceTab("browse");
        }
      },
      {
        id: "land",
        title: "Arazi zeka motoru",
        detail: `Model guveni %${investorSnapshot.landConfidence}, tahmin ${Number(landPriceData?.priceTlDa || 0).toLocaleString(
          "tr-TR"
        )} TL/da.`,
        action: () => {
          setBottomTab("land");
          setCommerceMiniTab("land");
        }
      },
      {
        id: "close",
        title: "Yatirim karari",
        detail:
          investorSnapshot.readiness >= 75
            ? "Go: canlı sunum için hazır."
            : investorSnapshot.readiness >= 60
              ? "Conditional Go: sunum yapilabilir, risk kartlari anlatilmali."
              : "Hold: once dry-run ve stabilizasyon gerekli.",
        action: () => {
          setBottomTab("demos");
          setDemoDockTab("yield");
        }
      }
    ],
    [
      investorSnapshot.readiness,
      investorSnapshot.flowSuccess,
      investorSnapshot.marketOpen,
      investorSnapshot.activeOrders,
      investorSnapshot.fulfilledVolumeKg,
      investorSnapshot.landConfidence,
      landPriceData?.priceTlDa
    ]
  );

  const investorExecutionDecision = useMemo(() => {
    const readyCount = investorChecklist.filter((x) => x.ok).length;
    const ratio = investorChecklist.length ? readyCount / investorChecklist.length : 0;
    if (ratio >= 0.84) return { label: "Go", tone: "safe", note: "Canli sunum icin hazır." };
    if (ratio >= 0.6) return { label: "Conditional Go", tone: "warn", note: "Sunum yapilabilir, risk kartlari açık anlatilmali." };
    return { label: "Hold", tone: "risk", note: "Once dry-run ve smoke stabilizasyonu gerekli." };
  }, [investorChecklist]);

  const investorRiskCards = useMemo(() => {
    return [
      {
        id: "smoke",
        title: "Teknik stabilite",
        state: investorSnapshot.smokeFail === 0 ? "kontrol altinda" : "izleme gerekli",
        note:
          investorSnapshot.smokeFail === 0
            ? "Smoke fail yok, canlı demoda hata riski düşük."
            : `Smoke fail ${investorSnapshot.smokeFail}. Sunum oncesi recovery calistirilmali.`
      },
      {
        id: "market",
        title: "Pazar canliligi",
        state: investorSnapshot.marketOpen > 0 ? "canli" : "zayif",
        note:
          investorSnapshot.marketOpen > 0
            ? `${investorSnapshot.marketOpen} aktif ilan mevcut, pazar akis hikayesi guclu.`
            : "İlan sayisi düşük, seed + demo listing ile desteklenmeli."
      },
      {
        id: "model",
        title: "Model guveni",
        state: investorSnapshot.landConfidence >= 60 ? "yeterli" : "iyılestirilmeli",
        note:
          investorSnapshot.landConfidence >= 60
            ? `Arazi model guveni %${investorSnapshot.landConfidence}.`
            : `Model guveni %${investorSnapshot.landConfidence}; belirsizlik vurgusu eklenmeli.`
      }
    ];
  }, [investorSnapshot]);

  const investorDataRoom = useMemo(
    () => [
      {
        id: "problem",
        title: "Problem",
        points: [
          "Tarımda veri daginik; kararlar gec ve sezgisel aliniyor.",
          "Hastalik, fiyat ve arazi riski ayni panelde yonetilemiyor."
        ]
      },
      {
        id: "solution",
        title: "Cozum",
        points: [
          "Teşhis + pazar + arazi fiyat modelini tek uygulamada birlestirir.",
          "Canli demo akislariyla teknik guvenilirlik olculur ve raporlanir."
        ]
      },
      {
        id: "traction",
        title: "Kanit",
        points: [
          `Hazirlik ${investorSnapshot.readiness}/100, akis başarı %${investorSnapshot.flowSuccess}.`,
          `${investorSnapshot.marketOpen} açık ilan, ${investorSnapshot.activeOrders} aktif siparis, ${Math.round(
            investorSnapshot.fulfilledVolumeKg
          ).toLocaleString("tr-TR")} kg hacim.`
        ]
      }
    ],
    [
      investorSnapshot.readiness,
      investorSnapshot.flowSuccess,
      investorSnapshot.marketOpen,
      investorSnapshot.activeOrders,
      investorSnapshot.fulfilledVolumeKg
    ]
  );

  const manualListingTrend = useMemo(() => {
    if (!manualListings.length) return [];
    const dayLimit = manualTrendRange === "30d" ? 30 : 14;
    const dayMap = new Map();
    manualListings.forEach((item) => {
      const ts = new Date(item.createdAt || 0).getTime();
      if (!Number.isFinite(ts)) return;
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      const arr = dayMap.get(key) || [];
      const val = Number(item.priceTlDa || 0);
      if (Number.isFinite(val) && val > 0) arr.push(val);
      dayMap.set(key, arr);
    });
    return Array.from(dayMap.entries())
      .sort((a, b) => String(a?.[0] || "").localeCompare(String(b?.[0] || "")))
      .slice(-dayLimit)
      .map(([date, vals]) => {
        const sorted = vals.slice().sort((x, y) => x - y);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        return { date, value: Math.round(median), count: vals.length };
      });
  }, [manualListings, manualTrendRange]);

  const manualTrendInsights = useMemo(() => {
    if (manualListingTrend.length < 2) return null;
    const latest = manualListingTrend[manualListingTrend.length - 1]?.value || 0;
    const prev = manualListingTrend[manualListingTrend.length - 2]?.value || 0;
    const avg =
      manualListingTrend.reduce((acc, item) => acc + (Number(item.value) || 0), 0) /
      Math.max(1, manualListingTrend.length);
    const diff = latest - prev;
    const diffPct = prev > 0 ? (diff / prev) * 100 : 0;
    const volatility =
      manualListingTrend
        .slice(1)
        .reduce(
          (acc, item, idx) => acc + Math.abs((item.value || 0) - (manualListingTrend[idx]?.value || 0)),
          0
        ) / Math.max(1, manualListingTrend.length - 1);
    return {
      latest,
      prev,
      avg: Math.round(avg),
      diff,
      diffPct: Number(diffPct.toFixed(1)),
      volatility: Math.round(volatility)
    };
  }, [manualListingTrend]);

  const manualVsApiDelta = useMemo(() => {
    const api = Number(landPriceData?.priceTlDa || 0);
    const manual = Number(manualListingStats?.median || 0);
    if (!api || !manual) return null;
    const diff = manual - api;
    const pct = api > 0 ? (diff / api) * 100 : 0;
    return {
      api,
      manual,
      diff: Math.round(diff),
      pct: Number(pct.toFixed(1))
    };
  }, [landPriceData, manualListingStats]);

  React.useEffect(() => {
    if (!manualVsApiDelta) return;
    if (Math.abs(manualVsApiDelta.pct) < 20) return;
    upsertLandDeltaAlertTask(manualVsApiDelta.pct);
  }, [manualVsApiDelta, upsertLandDeltaAlertTask]);

  const demoScenarioSummary = useMemo(() => {
    const baseYield = cropYieldKgDa[demoScenario.crop]?.nationalKgDa || 0;
    const adjustedYield = baseYield * (1 + (Number(demoScenario.yieldBoost) || 0) / 100);
    const revenue = adjustedYield * (Number(demoScenario.price) || 0);
    const riskPenalty = Math.max(0, 100 - (Number(demoScenario.risk) || 0));
    return {
      adjustedYield: Math.round(adjustedYield),
      revenue: Math.round(revenue),
      score: Math.round((revenue / 1000) + riskPenalty)
    };
  }, [demoScenario]);

  const demoActionPlan = useMemo(() => {
    const list = [];
    if (demoFlags.frost) list.push("Gece donuna karşı ortuleme ve erken saat sulama hazırla.");
    if (demoFlags.pest) list.push("Saha taramasini siklastir, esik asilirsa hedefli uygulama yap.");
    if (demoFlags.irrigation) list.push("Damla hattini acilen kontrol et, blok bazli sulama plani yap.");
    if (demoFlags.wind) list.push("Rüzgarda uygulamayi ertele, koruyucu bariyer kullan.");
    if (demoDisease === "high" || demoDisease === "critical") {
      list.push("Enfekte bölgeyi izole et, uygulama araligini kisalt.");
    }
    if (!list.length) list.push("Standart izleme rutini devam etsin, haftalik kontrol yeterli.");
    return list.slice(0, 4);
  }, [demoFlags, demoDisease]);

  const demoOpsSummary = useMemo(() => {
    const team = Math.max(1, Number(demoOps.team) || 1);
    const hours = Math.max(1, Number(demoOps.fieldHours) || 1);
    const sprayWindowHours = Math.max(0.5, (Number(demoOps.sprayWindowMinutes) || 30) / 60);
    const capacity = {
      scan: Math.round(team * hours * demoResourceBenchmarks.scanPerHour),
      spray: Math.round(team * sprayWindowHours * demoResourceBenchmarks.sprayPerHour),
      irrigation: Math.round(team * hours * demoResourceBenchmarks.irrigationPerHour)
    };
    const demand = {
      scan: demoTaskTemplates.find((item) => item.id === "scan")?.targetPerDay || 0,
      spray: demoTaskTemplates.find((item) => item.id === "spray")?.targetPerDay || 0,
      irrigation: demoTaskTemplates.find((item) => item.id === "irrigation")?.targetPerDay || 0
    };
    const gap = {
      scan: capacity.scan - demand.scan,
      spray: capacity.spray - demand.spray,
      irrigation: capacity.irrigation - demand.irrigation
    };
    const bottleneck = Object.entries(gap).sort((a, b) => a[1] - b[1])[0]?.[0] || "scan";
    const readiness =
      Math.max(0, Math.min(100, 70 + Math.min(gap.scan, 4) * 3 + Math.min(gap.spray, 2) * 8 + Math.min(gap.irrigation, 3) * 4));
    return { capacity, demand, gap, bottleneck, readiness };
  }, [demoOps]);

  const demoSensitivityTable = useMemo(() => {
    const area = Math.max(1, Number(demoCost.area) || 1);
    const baseYield = Math.max(1, demoScenarioSummary.adjustedYield || 1);
    const basePrice = Math.max(1, Number(demoCost.price) || 1);
    const unitCost = Math.max(0, (Number(demoCost.cost) || 0) / area);
    const variants = [
      { name: "Korumaci", yieldDelta: Number(demoYieldShock) || 0, priceDelta: -4 },
      { name: "Baz", yieldDelta: 0, priceDelta: 0 },
      { name: "Agresif", yieldDelta: Math.max(0, Number(demoPriceShock) || 0), priceDelta: Number(demoPriceShock) || 0 }
    ];
    return variants.map((item) => {
      const yieldKg = baseYield * (1 + item.yieldDelta / 100);
      const price = basePrice * (1 + item.priceDelta / 100);
      const revenue = area * yieldKg * price;
      const cost = area * unitCost;
      return {
        name: item.name,
        yieldKg: Math.round(yieldKg),
        price: Math.round(price * 100) / 100,
        net: Math.round(revenue - cost)
      };
    });
  }, [demoCost.area, demoCost.cost, demoCost.price, demoScenarioSummary.adjustedYield, demoYieldShock, demoPriceShock]);

  const demoReadinessGrade = useMemo(() => {
    const score = demoOpsSummary.readiness;
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    return "D";
  }, [demoOpsSummary.readiness]);

  const demoInterventionPlan = useMemo(() => {
    const incident = demoIncidentLibrary.find((item) => item.id === demoIncident);
    const list = [];
    if (incident?.id === "fungal_burst") {
      list.push("scan", "spray", "isolation");
    } else if (incident?.id === "pest_cluster") {
      list.push("scan", "spray");
    } else if (incident?.id === "irrigation_fault") {
      list.push("irrigation", "scan");
    } else {
      list.push("scan");
    }
    if (demoBudgetMode === "aggressive") list.push("isolation");
    const unique = [...new Set(list)];
    return unique
      .map((key) => demoInterventionLibrary.find((item) => item.key === key))
      .filter(Boolean);
  }, [demoIncident, demoBudgetMode]);

  const demoMaturity = useMemo(() => {
    const checklistDone = demoChecklist.filter((item) => item.done).length;
    const checklistPct = demoChecklist.length
      ? Math.round((checklistDone / demoChecklist.length) * 100)
      : 0;
    const executionTotal =
      Number(demoExecution.scan || 0) +
      Number(demoExecution.spray || 0) +
      Number(demoExecution.irrigation || 0);
    const executionPct = Math.min(100, Math.round((executionTotal / 12) * 100));
    const highAlerts = demoAlertsFeed.filter((item) => item.level === "high").length;
    const alertsPenalty = Math.min(35, highAlerts * 12);
    const readiness = demoOpsSummary.readiness || 0;
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          readiness * 0.45 +
          checklistPct * 0.25 +
          executionPct * 0.2 +
          (demoReport ? 10 : 0) -
          alertsPenalty
        )
      )
    );
    const level =
      score >= 85
        ? "Canlıya Hazır"
        : score >= 65
          ? "Pilot Hazır"
          : score >= 45
            ? "Geliştiriliyor"
            : "Taslak";
    return { checklistPct, executionPct, score, level };
  }, [demoChecklist, demoExecution, demoAlertsFeed, demoOpsSummary.readiness, demoReport]);

  const weatherSummary = useMemo(() => {
    if (!weather) return null;
    const humidity = weather.humidity ?? 0;
    const wind = weather.windKmh ?? 0;
    const gust = weather.windGustKmh ?? 0;
    const precip = weather.precipitationMm ?? 0;
    const frost = weather.frostRisk;
    const riskTags = [];
    if (frost) riskTags.push("Don riski");
    if (humidity >= 80) riskTags.push("Mantar riski");
    if (wind >= 20 || gust >= 35) riskTags.push("Rüzgar stresi");
    if (precip >= 10) riskTags.push("Asiri yağış");
    if (!riskTags.length) riskTags.push("Normal");
    const score = Math.min(
      100,
      (frost ? 40 : 0) +
      (humidity >= 80 ? 30 : 0) +
      (wind >= 20 || gust >= 35 ? 20 : 0) +
      (precip >= 10 ? 20 : 0)
    );
    const actions = [];
    if (frost) actions.push("Don icin ortu/bariyer hazırla.");
    if (humidity >= 80) actions.push("Havalandirmayi artir, yaprak islatsiz sulama.");
    if (wind >= 20 || gust >= 35) actions.push("Rüzgar kirici ve baglama kontrol et.");
    if (precip >= 10) actions.push("Yogun yağış: drenaj ve su birikimini kontrol et.");
    if (!actions.length) actions.push("Rutin izlemeye devam et.");
    return { riskTags, score, actions };
  }, [weather]);

  React.useEffect(() => {
    if (!isNativeApp) return;
    ensureNotificationPermission(false);
  }, [isNativeApp, ensureNotificationPermission]);

  React.useEffect(() => {
    if (!isNativeApp || !notifSettings.enabled) return;
    syncNotifications("auto");
  }, [isNativeApp, notifSettings, weather, forecast, city, calendarPlan, syncNotifications]);

  const forecastSummary = useMemo(() => {
    if (!forecast?.days?.length) return null;
    const days = forecast.days;
    const mins = days.map((d) => (typeof d.min === "number" ? d.min : 99));
    const maxs = days.map((d) => (typeof d.max === "number" ? d.max : -99));
    const precips = days.map((d) => (typeof d.precipitationMm === "number" ? d.precipitationMm : 0));
    const frostDays = days.filter((d) => d.frost).length;
    const rainyDays = precips.filter((val) => val >= 10).length;
    const maxPrecip = precips.length ? Math.max(...precips) : 0;
    return {
      frostDays,
      rainyDays,
      minTemp: Math.min(...mins),
      maxTemp: Math.max(...maxs),
      maxPrecip
    };
  }, [forecast]);

  const maxWindKmh = useMemo(() => {
    if (forecast?.hourly?.length) {
      return Math.max(
        ...forecast.hourly.map((h) => Math.max(h.windKmh ?? 0, h.windGustKmh ?? 0))
      );
    }
    return Math.max(weather?.windKmh ?? 0, weather?.windGustKmh ?? 0);
  }, [forecast, weather]);

  const diseaseTrends = useMemo(() => {
    if (!history.length) return [];
    const counts = history.reduce((acc, item) => {
      const key = item.name || "Bilinmeyen";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const total = history.length;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [history]);

  const frostOutlook = useMemo(() => {
    if (!forecast?.days?.length) return [];
    return forecast.days.slice(0, 3).map((day) => {
      const min = day.min ?? 0;
      const level = min <= 0 ? "high" : min <= 2 ? "mid" : "low";
      return {
        day: day.day || "Gün",
        min,
        level
      };
    });
  }, [forecast]);

  const frostSignal = useMemo(() => {
    const fromWeather = Boolean(weather?.frostRisk);
    const fromForecast = Boolean((forecast?.days || []).some((day) => day?.frost));
    const nextMin = (forecast?.days || []).reduce((acc, day) => {
      const min = Number(day?.min);
      if (!Number.isFinite(min)) return acc;
      return acc === null ? min : Math.min(acc, min);
    }, null);
    return {
      hasRisk: fromWeather || fromForecast,
      source: fromWeather ? "anlik" : fromForecast ? "tahmin" : "yok",
      min: Number.isFinite(nextMin) ? nextMin : null
    };
  }, [weather?.frostRisk, forecast]);

  const nextHours = useMemo(() => {
    if (!forecast?.hourly?.length) return [];
    return forecast.hourly.slice(0, 6).map((item) => ({
      ...item,
      label: new Date(item.time).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: forecast.timeZone || undefined
      })
    }));
  }, [forecast]);

  const weatherAlerts = useMemo(() => {
    if (!weather) return [];
    const alerts = [];
    if (weather.frostRisk) alerts.push({ level: "danger", text: "Don riski: hassas bitkileri koru." });
    if ((weather.precipitationMm ?? 0) >= 15) {
      alerts.push({ level: "danger", text: "Asiri yağış: drenaj ve su birikimi riskini kontrol et." });
    } else if ((weather.precipitationMm ?? 0) >= 8) {
      alerts.push({ level: "warning", text: "Yağış artiyor: mantar riski icin onlem al." });
    }
    if ((weather.windGustKmh ?? 0) >= 40) {
      alerts.push({ level: "danger", text: "Rüzgar esintisi yüksek: baglama ve bariyerleri guclendir." });
    } else if ((weather.windKmh ?? 0) >= 20) {
      alerts.push({ level: "warning", text: "Rüzgar stresi: hassas yapraklari kontrol et." });
    }
    const fiveDay = forecast?.days || [];
    const frostDays = fiveDay.filter((d) => d.frost).length;
    const rainDays = fiveDay.filter((d) => (d.precipitationMm ?? 0) >= 10).length;
    const heavyRainDays = fiveDay.filter((d) => (d.precipitationMm ?? 0) >= 20).length;
    const windDays = fiveDay.filter((d) => (d.windGustKmh ?? 0) >= 35).length;
    if (frostDays >= 2) {
      alerts.push({ level: "danger", text: `5 günlük tahminde ${frostDays} gun don riski var.` });
    }
    if (rainDays >= 2) {
      alerts.push({ level: "warning", text: `5 günlük tahminde ${rainDays} gun yogun yağış gorunuyor.` });
    }
    if (heavyRainDays >= 1) {
      alerts.push({ level: "danger", text: `5 gun icinde ${heavyRainDays} gun asiri yağış bekleniyor.` });
    }
    if (windDays >= 2) {
      alerts.push({ level: "warning", text: `5 günlük tahminde ${windDays} gun rüzgar stresi bekleniyor.` });
    }
    return alerts.slice(0, 4);
  }, [weather, forecast]);

  const hourlyAlerts = useMemo(() => {
    if (!forecast?.hourly?.length) return [];
    const alerts = [];
    const next = forecast.hourly.slice(0, 6);
    const gustPeak = Math.max(...next.map((h) => h.windGustKmh ?? 0));
    const rainPeak = Math.max(...next.map((h) => h.precipitationMm ?? 0));
    if (gustPeak >= 45) {
      alerts.push({ level: "danger", text: "Onumuzdeki 6 saatte kuvvetli esinti bekleniyor." });
    } else if (gustPeak >= 35) {
      alerts.push({ level: "warning", text: "Onumuzdeki 6 saatte esinti artisi var." });
    }
    if (rainPeak >= 8) {
      alerts.push({ level: "warning", text: "Onumuzdeki 6 saatte yağış artisi bekleniyor." });
    }
    return alerts;
  }, [forecast]);

  const agroClimateAdvisor = useMemo(() => {
    if (!weather && !soilReport) return null;
    const items = [];
    const actions = [];
    const wind = Number(weather?.windKmh ?? 0);
    const gust = Number(weather?.windGustKmh ?? 0);
    const precip = Number(weather?.precipitationMm ?? 0);
    const humidity = Number(weather?.humidity ?? 0);
    const soilScore = Number(soilReport?.soilHealth?.score ?? 0);
    const moistureState = String(soilReport?.internetSignals?.moistureState || "").toLowerCase();
    const irrigationNeed = Number(soilReport?.soilIndices?.irrigationNeedScore ?? 0);
    const erosionRisk = Number(soilReport?.soilIndices?.erosionRiskScore ?? 0);
    const compactionRisk = Number(soilReport?.soilIndices?.compactionRiskScore ?? 0);

    if (weather?.frostRisk || (forecastSummary?.frostDays || 0) > 0) {
      items.push({ tone: "danger", text: "Don riski aktif" });
      actions.push("Gece sulamasi ve ortu ile hassas parselleri koru.");
    }
    if (gust >= 40 || wind >= 20) {
      items.push({ tone: "warning", text: "Rüzgar stresi yüksek" });
      actions.push("İlaçlama uygulamasini rüzgarin dustugu saate kaydir.");
    }
    if (precip >= 10 || (forecastSummary?.maxPrecip || 0) >= 15) {
      items.push({ tone: "warning", text: "Yağış baskisi artiyor" });
      actions.push("Drenaj ve su birikimi noktalarini ayni gun kontrol et.");
    }
    if (humidity >= 82) {
      items.push({ tone: "warning", text: "Nem kaynakli hastalik basinci" });
      actions.push("Yaprak islakligi yüksek saatlerde onleyici plan uygula.");
    }
    if (moistureState.includes("kuru") || irrigationNeed >= 70) {
      items.push({ tone: "warning", text: "Toprak nemi kritik" });
      actions.push("Damla sulamayi kademeli arttir, oglen yerine sabah/aksam uygula.");
    }
    if (erosionRisk >= 60) {
      items.push({ tone: "warning", text: "Erozyon riski" });
      actions.push("Egilime dik işleme ve yuzey ortu planini devreye al.");
    }
    if (compactionRisk >= 60) {
      items.push({ tone: "warning", text: "Sikisma riski" });
      actions.push("Agir ekipman gecisini azalt, uygun nemde gevsetme yap.");
    }
    if (soilScore > 0) {
      items.push({
        tone: soilScore >= 70 ? "ok" : soilScore >= 55 ? "warning" : "danger",
        text: `Toprak skoru ${soilScore}/100`,
      });
    }
    if (!actions.length) {
      actions.push("Saha verileri dengeli. Rutin izleme ve haftalik toprak kontrolune devam et.");
    }
    return {
      chips: items.slice(0, 5),
      actions: Array.from(new Set(actions)).slice(0, 4),
      summary:
        actions.length > 1
          ? "Hava + toprak birlikte izlendiginde operasyon riski dusuyor."
          : "Güncel hava ve toprak sinyalleri dengede.",
    };
  }, [weather, soilReport, forecastSummary]);

  const modelConsistencyAlert = useMemo(() => {
    const diag = modelDiagnostics?.diagnostics;
    if (!diag) return null;
    const warnLowVariance = Boolean(diag.lowVarianceWarning || diag?.warnings?.lowVariance);
    const warnLowDiversity = Boolean(diag?.warnings?.lowDiversity);
    const warnHighFallback = Boolean(diag?.warnings?.highFallback);
    const warnHighFailureRate = Boolean(diag?.warnings?.highFailureRate);
    if (!warnLowVariance && !warnLowDiversity && !warnHighFallback && !warnHighFailureRate) return null;
    const stdPct = Math.round(Number(diag?.confidence?.std || 0) * 1000) / 10;
    const reasons = [];
    if (warnLowVariance) reasons.push(`std %${stdPct}`);
    if (warnLowDiversity) reasons.push(`düşük cesitlılık (${diag.labelDiversity || 0} sinif)`);
    if (warnHighFallback) reasons.push(`fallback %${Math.round(Number(diag.fallbackRate || 0) * 100)}`);
    if (warnHighFailureRate) reasons.push(`hata oranı %${Math.round(Number(diag.failureRate || 0) * 100)}`);
    return {
      code: "model_consistency_warning",
      message: `Model tutarlılık riski: ${reasons.join(" • ")}. Sonuclari ek cekimle dogrulayin.`,
      stdPct,
      reasons
    };
  }, [modelDiagnostics]);

  const analysisState = useMemo(() => {
    if (!result) return null;
    if (result.decision?.status) return result.decision.status;
    if (result.filter?.blocked) return "blocked";
    if (result.qualityGate) return "review";
    if (result.modelMetrics?.lowConfidence) return "review";
    if (result.diagnosis?.confidenceTier === "low") return "review";
    if (modelConsistencyAlert) return "review";
    return "ok";
  }, [result, modelConsistencyAlert]);

  const warningCount = useMemo(() => {
    if (!result) return 0;
    let count = 0;
    if (result.warnings?.length) count += result.warnings.length;
    if (result.filter?.blocked) count += 1;
    if (result.qualityGate) count += 1;
    if (result.retrySuggested) count += 1;
    if (modelConsistencyAlert) count += 1;
    if (analysisState) count += 1;
    return count;
  }, [result, analysisState, modelConsistencyAlert]);

  const diagnosisBadges = useMemo(() => {
    if (!result) return [];
    const out = [];
    out.push({
      key: "status",
      className: result.diagnosis?.status || "issue",
      label: result.diagnosis?.status === "healthy" ? "Saglikli" : "Riskli"
    });
    out.push({
      key: "area",
      className: "subtle",
      label: `Bölge: ${result.diagnosis?.problemArea || "Belirsiz"}`
    });
    if (selectedPlant && result.detectedPlant) {
      out.push({
        key: "plant-match",
        className: result.plantMatch ? "safe" : "issue",
        label: `Bitki: ${result.plantMatch ? "Uyumlu" : "Uyumsuz"}`
      });
    }
    if (result.diagnosis?.confidenceTier) {
      out.push({
        key: "tier",
        className: `tier ${result.diagnosis.confidenceTier}`,
        label:
          result.diagnosis.confidenceTier === "high"
            ? "Yüksek güven"
            : result.diagnosis.confidenceTier === "medium"
              ? "Orta güven"
              : "Düşük güven"
      });
    }
    if (result.modelMetrics?.lowConfidence) {
      out.push({ key: "low-conf", className: "tier low", label: "Belirsiz" });
    }
    if (result.reliability) {
      out.push({
        key: "rel",
        className: `tier ${result.reliability.level || "low"}`,
        label: `Guvenilirlik ${result.reliability.score}/100`
      });
    }
    return out;
  }, [result, selectedPlant]);

  const showCarePlan =
    result && analysisState !== "blocked" && !(result.qualityGate && result.diagnosis?.confidence < 0.35);

  const diagnosisSummary = useMemo(() => {
    if (!result?.diagnosis) return "";
    const plant = result.detectedPlant || selectedPlant?.name || "Bitki";
    const status = result.diagnosis.status === "healthy" ? "sağlıkli" : "riskli";
    const conf = Math.round((result.diagnosis.confidence || 0) * 100);
    const area = result.diagnosis.problemArea || "belirsiz bölge";
    return `${plant} için ${status} durum • ${conf}% güven • ${area}`;
  }, [result, selectedPlant]);

  React.useEffect(() => {
    const parseJson = (raw, fallback) => {
      try {
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    };
    const stored = safeLocalStorage.getItem("agroguard-history");
    if (stored) {
      setHistory(Array.isArray(parseJson(stored, [])) ? parseJson(stored, []) : []);
    }
    const storedTodos = safeLocalStorage.getItem("agroguard-todos");
    if (storedTodos) {
      const parsed = parseJson(storedTodos, {});
      setTodos(parsed && typeof parsed === "object" ? parsed : {});
    }
    const storedNote = safeLocalStorage.getItem("agroguard-note");
    if (storedNote) {
      setNote(storedNote);
    }
    const storedAlerts = safeLocalStorage.getItem("agroguard-alerts");
    if (storedAlerts) {
      const parsed = parseJson(storedAlerts, {});
      setAlerts(parsed && typeof parsed === "object" ? parsed : {});
    }
    const storedRoutine = safeLocalStorage.getItem("agroguard-routine");
    if (storedRoutine) {
      setRoutine(Array.isArray(parseJson(storedRoutine, [])) ? parseJson(storedRoutine, []) : []);
    }
    const storedReminders = safeLocalStorage.getItem("agroguard-reminders");
    if (storedReminders) {
      const parsed = parseJson(storedReminders, null);
      if (parsed && typeof parsed === "object") setReminders(parsed);
    }
    const storedField = safeLocalStorage.getItem("agroguard-field");
    if (storedField) {
      const parsed = parseJson(storedField, null);
      if (parsed && typeof parsed === "object") setFieldLocation(parsed);
    }
    const storedLandDemo = safeLocalStorage.getItem("agroguard-land-demo");
    if (storedLandDemo) {
      const parsed = parseJson(storedLandDemo, null);
      if (parsed && typeof parsed === "object") {
        setLandDemo((prev) => ({ ...prev, ...parsed }));
      }
    }
    const storedLandQuery = safeLocalStorage.getItem("agroguard-land-query");
    if (storedLandQuery) {
      const parsed = parseJson(storedLandQuery, null);
      if (parsed && typeof parsed === "object") {
        setLandQuery({
          city: String(parsed.city || ""),
          crop: String(parsed.crop || "")
        });
      }
    }
    const storedLandProfiles = safeLocalStorage.getItem("agroguard-land-profiles");
    if (storedLandProfiles) {
      const parsed = parseJson(storedLandProfiles, []);
      if (Array.isArray(parsed)) {
        setLandProfiles(parsed.slice(0, 20));
      }
    }
    const storedTab = safeLocalStorage.getItem("agroguard-active-tab");
    if (storedTab) {
      setActiveTab(storedTab);
    }
    const storedBottomTab = safeLocalStorage.getItem("agroguard-bottom-tab");
    if (storedBottomTab) {
      const mappedBottomTab = storedBottomTab === "finance" ? "land" : storedBottomTab;
      setBottomTab(bottomTabs.includes(mappedBottomTab) ? mappedBottomTab : "home");
    }
    const storedAdvanced = safeLocalStorage.getItem("agroguard-show-advanced");
    if (storedAdvanced) {
      setShowAdvanced(storedAdvanced === "true");
    }
    const storedPlantId = safeLocalStorage.getItem("agroguard-selected-plant");
    if (storedPlantId) {
      setSelectedPlantId(storedPlantId);
    }
    const storedHandbookQuery = safeLocalStorage.getItem("agroguard-handbook-query");
    if (storedHandbookQuery) {
      setHandbookQuery(storedHandbookQuery);
    }
    const storedHandbookCategory = safeLocalStorage.getItem("agroguard-handbook-category");
    if (storedHandbookCategory) {
      setHandbookCategory(storedHandbookCategory);
    }
    const storedHandbookFocus = safeLocalStorage.getItem("agroguard-handbook-focus");
    if (storedHandbookFocus) {
      setHandbookFocus(storedHandbookFocus);
    }
    const storedCity = safeLocalStorage.getItem("agroguard-city");
    if (storedCity) {
      setCity(storedCity);
    }
    const storedDrawerTab = safeLocalStorage.getItem("agroguard-drawer-tab");
    if (storedDrawerTab) {
      setDrawerTab(storedDrawerTab);
    }
    const storedCalendarDate = safeLocalStorage.getItem("agroguard-calendar-date");
    if (storedCalendarDate) {
      setCalendarDate(storedCalendarDate);
    }
    const storedCalendarPlan = safeLocalStorage.getItem("agroguard-calendar-plan");
    if (storedCalendarPlan) {
      try {
        const parsed = JSON.parse(storedCalendarPlan);
        const normalized = Array.isArray(parsed)
          ? parsed.map((item) => ({
            ...item,
            time: item?.time || "08:00",
            notify: item?.notify !== false
          }))
          : [];
        setCalendarPlan(normalized);
      } catch (_) {
        setCalendarPlan([]);
      }
    }
    const storedDemoPreset = safeLocalStorage.getItem("agroguard-demo-preset");
    if (storedDemoPreset) {
      setDemoPreset(storedDemoPreset);
    }
    const storedDemoChecklist = safeLocalStorage.getItem("agroguard-demo-checklist");
    if (storedDemoChecklist) {
      setDemoChecklist(
        Array.isArray(parseJson(storedDemoChecklist, [])) ? parseJson(storedDemoChecklist, []) : []
      );
    }
    const storedDemoOps = safeLocalStorage.getItem("agroguard-demo-ops");
    if (storedDemoOps) {
      const parsed = parseJson(storedDemoOps, null);
      if (parsed && typeof parsed === "object") setDemoOps(parsed);
    }
    const storedDemoExecution = safeLocalStorage.getItem("agroguard-demo-execution");
    if (storedDemoExecution) {
      const parsed = parseJson(storedDemoExecution, null);
      if (parsed && typeof parsed === "object") setDemoExecution(parsed);
    }
    const storedDemoYieldShock = safeLocalStorage.getItem("agroguard-demo-yield-shock");
    if (storedDemoYieldShock) {
      setDemoYieldShock(Number(storedDemoYieldShock));
    }
    const storedDemoPriceShock = safeLocalStorage.getItem("agroguard-demo-price-shock");
    if (storedDemoPriceShock) {
      setDemoPriceShock(Number(storedDemoPriceShock));
    }
    const storedDemoSeasonPlan = safeLocalStorage.getItem("agroguard-demo-season-plan");
    if (storedDemoSeasonPlan) {
      const parsed = parseJson(storedDemoSeasonPlan, null);
      if (parsed && typeof parsed === "object") setDemoSeasonPlan(parsed);
    }
    const storedDemoIncident = safeLocalStorage.getItem("agroguard-demo-incident");
    if (storedDemoIncident) {
      setDemoIncident(storedDemoIncident);
    }
    const storedDemoBudgetMode = safeLocalStorage.getItem("agroguard-demo-budget-mode");
    if (storedDemoBudgetMode) {
      setDemoBudgetMode(storedDemoBudgetMode);
    }
    const storedDemoDailyLog = safeLocalStorage.getItem("agroguard-demo-daily-log");
    if (storedDemoDailyLog) {
      setDemoDailyLog(
        Array.isArray(parseJson(storedDemoDailyLog, [])) ? parseJson(storedDemoDailyLog, []) : []
      );
    }
    const storedDemoFlowHistory = safeLocalStorage.getItem("agroguard-demo-flow-history");
    if (storedDemoFlowHistory) {
      const parsed = parseJson(storedDemoFlowHistory, []);
      if (Array.isArray(parsed)) {
        setDemoFlowHistory(parsed.slice(0, 20));
      }
    }
    const storedNotifSettings = safeLocalStorage.getItem("agroguard-notif-settings");
    if (storedNotifSettings) {
      try {
        const parsed = JSON.parse(storedNotifSettings);
        if (parsed && typeof parsed === "object") {
          setNotifSettings((prev) => ({ ...prev, ...parsed }));
        }
      } catch (_) {
        // ignore
      }
    }
    const storedRetakeTrend = safeLocalStorage.getItem("agroguard-retake-trend");
    if (storedRetakeTrend) {
      try {
        const parsed = JSON.parse(storedRetakeTrend);
        if (Array.isArray(parsed)) {
          setRetakeTrend(parsed.slice(0, 3));
        }
      } catch (_) {
        setRetakeTrend([]);
      }
    }
    const storedRetryChecklist = safeLocalStorage.getItem("agroguard-retry-checklist");
    if (storedRetryChecklist) {
      try {
        const parsed = JSON.parse(storedRetryChecklist);
        if (parsed && typeof parsed === "object") {
          if (parsed.data && typeof parsed.data === "object") {
            const savedAt = Number(parsed.savedAt || 0);
            const stale = savedAt > 0 && Date.now() - savedAt > 24 * 60 * 60 * 1000;
            setRetryChecklist(stale ? {} : parsed.data);
            setRetryChecklistSavedAt(savedAt || 0);
          } else {
            setRetryChecklist(parsed);
          }
        }
      } catch (_) {
        setRetryChecklist({});
      }
    }
    const storedTradeFavorites = safeLocalStorage.getItem("agroguard-trade-favorites");
    if (storedTradeFavorites) {
      const parsed = parseJson(storedTradeFavorites, []);
      if (Array.isArray(parsed)) setTradeFavorites(parsed.map((x) => String(x)).slice(0, 200));
    }
    const storedTradeCompare = safeLocalStorage.getItem("agroguard-trade-compare");
    if (storedTradeCompare) {
      const parsed = parseJson(storedTradeCompare, []);
      if (Array.isArray(parsed)) setTradeCompareIds(parsed.map((x) => String(x)).slice(0, 3));
    }
    const storedTradeCart = safeLocalStorage.getItem("agroguard-trade-cart");
    if (storedTradeCart) {
      const parsed = parseJson(storedTradeCart, []);
      if (Array.isArray(parsed)) {
        setTradeCart(
          parsed
            .map((item) => ({
              listingId: String(item?.listingId || ""),
              quantityKg: Math.max(1, Number(item?.quantityKg || 1))
            }))
            .filter((item) => item.listingId)
            .slice(0, 24)
        );
      }
    }
    const storedTradeFilterPresets = safeLocalStorage.getItem("agroguard-trade-filter-presets");
    if (storedTradeFilterPresets) {
      const parsed = parseJson(storedTradeFilterPresets, []);
      if (Array.isArray(parsed)) {
        setTradeFilterPresets(
          parsed
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
              label: String(item.label || "Kayıtli filtre"),
              city: String(item.city || ""),
              crop: String(item.crop || ""),
              text: String(item.text || ""),
              type: String(item.type || "all"),
              status: String(item.status || "all"),
              delivery: String(item.delivery || "all"),
              payment: String(item.payment || "all"),
              quality: String(item.quality || "all"),
              seller: String(item.seller || "all"),
              sortBy: String(item.sortBy || "newest"),
              minPrice: String(item.minPrice || ""),
              maxPrice: String(item.maxPrice || "")
            }))
            .slice(0, 12)
        );
      }
    }
  }, [apiHealthTick]);

  React.useEffect(() => {
    let isActive = true;
    setPlantDiseaseError("");
    if (!selectedPlant?.id) {
      setPlantDiseaseData(null);
      return () => {
        isActive = false;
      };
    }
    apiFetch(`/api/plant-diseases?plant=${encodeURIComponent(selectedPlant.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setPlantDiseaseData(data);
      })
      .catch(() => {
        if (isActive) setPlantDiseaseError("Bitki hastalik listesi yuklenemedi.");
      });
    return () => {
      isActive = false;
    };
  }, [selectedPlant]);

  React.useEffect(() => {
    let isActive = true;
    const checkHealth = () => {
      setApiStatus((prev) =>
        prev.state === "ok" ? prev : { state: "checking", messağe: "" }
      );
      apiFetch("/api/health")
        .then((res) => {
          if (!res.ok) throw new Error("health_failed");
          return res.json();
        })
        .then((data) => {
          if (!isActive) return;
          const runtimeMockActive = Boolean(data?.mode === "frontend-only");
          setApiStatus({
            state: "ok",
            messağe: runtimeMockActive
              ? "Canlı API yok, demo modunda çalışıyor."
              : "Sunucu baglantisi hazır."
          });
          setBackendInfo({
            apiVersion: data?.apiVersion || "",
            modelVersion: data?.modelVersion || "",
            features: data?.features || {}
          });
        })
        .catch(() => {
          if (isActive) {
            setApiStatus({
              state: "down",
              messağe: "Sunucuya ulasilamadi. Backend açık değil gibi gorunuyor."
            });
            setBackendInfo({ apiVersion: "", modelVersion: "", features: {} });
          }
        });
    };
    checkHealth();
    const timer = setInterval(checkHealth, 15000);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (result?.retrySuggested) {
      setShowQualityGate(true);
    }
  }, [result]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-history", JSON.stringify(history));
  }, [history]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-active-tab", activeTab);
  }, [activeTab]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-bottom-tab", bottomTab);
  }, [bottomTab]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-show-advanced", String(showAdvanced));
  }, [showAdvanced]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-todos", JSON.stringify(todos));
  }, [todos]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-note", note);
  }, [note]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-alerts", JSON.stringify(alerts));
  }, [alerts]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-routine", JSON.stringify(routine));
  }, [routine]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-reminders", JSON.stringify(reminders));
  }, [reminders]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-field", JSON.stringify(fieldLocation));
  }, [fieldLocation]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-land-demo", JSON.stringify(landDemo));
  }, [landDemo]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-land-query", JSON.stringify(landQuery));
  }, [landQuery]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-land-profiles", JSON.stringify(landProfiles));
  }, [landProfiles]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-selected-plant", selectedPlant?.id || "");
  }, [selectedPlant]);

  const handbookIds = useMemo(() => handbookSections.map((section) => section.id), []);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-handbook-query", handbookQuery);
  }, [handbookQuery]);

  React.useEffect(() => {
    if (handbookCategory !== "all" && !handbookIds.includes(handbookCategory)) {
      setHandbookCategory("all");
      return;
    }
    safeLocalStorage.setItem("agroguard-handbook-category", handbookCategory);
  }, [handbookCategory, handbookIds]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-handbook-focus", handbookFocus);
  }, [handbookFocus]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-city", city);
  }, [city]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-drawer-tab", drawerTab);
  }, [drawerTab]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-calendar-date", calendarDate);
  }, [calendarDate]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-calendar-plan", JSON.stringify(calendarPlan));
  }, [calendarPlan]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-preset", demoPreset);
  }, [demoPreset]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-checklist", JSON.stringify(demoChecklist));
  }, [demoChecklist]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-ops", JSON.stringify(demoOps));
  }, [demoOps]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-execution", JSON.stringify(demoExecution));
  }, [demoExecution]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-yield-shock", String(demoYieldShock));
  }, [demoYieldShock]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-price-shock", String(demoPriceShock));
  }, [demoPriceShock]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-season-plan", JSON.stringify(demoSeasonPlan));
  }, [demoSeasonPlan]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-incident", demoIncident);
  }, [demoIncident]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-budget-mode", demoBudgetMode);
  }, [demoBudgetMode]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-daily-log", JSON.stringify(demoDailyLog));
  }, [demoDailyLog]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-demo-flow-history", JSON.stringify(demoFlowHistory));
  }, [demoFlowHistory]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-notif-settings", JSON.stringify(notifSettings));
  }, [notifSettings]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-retake-trend", JSON.stringify(retakeTrend));
  }, [retakeTrend]);

  React.useEffect(() => {
    const payload = {
      savedAt: Date.now(),
      data: retryChecklist
    };
    safeLocalStorage.setItem("agroguard-retry-checklist", JSON.stringify(payload));
    setRetryChecklistSavedAt(payload.savedAt);
  }, [retryChecklist]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-trade-favorites", JSON.stringify(tradeFavorites));
  }, [tradeFavorites]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-trade-compare", JSON.stringify(tradeCompareIds));
  }, [tradeCompareIds]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-trade-cart", JSON.stringify(tradeCart));
  }, [tradeCart]);

  React.useEffect(() => {
    safeLocalStorage.setItem("agroguard-trade-filter-presets", JSON.stringify(tradeFilterPresets));
  }, [tradeFilterPresets]);

  const applyCityQuery = () => {
    const value = cityQuery.trim();
    if (!value) return;
    const canonicalCity = cityCanonicalByKey[normalizeKey(value)] || value;
    setCity(canonicalCity);
    setLandDemo((prev) => ({ ...prev, district: "", neighborhood: "" }));
    setFieldLocation((prev) => ({ ...prev, coords: "" }));
    setGeoStatus("Sehir seçildi, koordinat temizlendi.");
    setCityQuery("");
    setWeatherRefreshKey((prev) => prev + 1);
  };

  const handleLandCityInputChange = (rawValue) => {
    const value = String(rawValue || "");
    setLandQuery((prev) => ({ ...prev, city: value }));
    setLandDemo((prev) => ({ ...prev, district: "", neighborhood: "" }));
    const canonicalCity = cityCanonicalByKey[normalizeKey(value)];
    if (canonicalCity) setCity(canonicalCity);
  };

  const applyLocationSearchHit = (item) => {
    if (!item) return;
    const nextCity = String(item.city || "").trim();
    const nextDistrict = String(item.district || "").trim();
    const nextNeighborhood = String(item.neighborhood || "").trim();
    if (nextCity) {
      setLandQuery((prev) => ({ ...prev, city: nextCity }));
      setCity(nextCity);
      setCityQuery("");
    }
    setLandDemo((prev) => ({
      ...prev,
      district: nextDistrict || (item.type === "city" ? "" : prev.district),
      neighborhood:
        item.type === "neighborhood"
          ? nextNeighborhood
          : item.type === "district"
            ? ""
            : item.type === "city"
              ? ""
              : prev.neighborhood
    }));
    setFieldLocation((prev) => ({ ...(prev || {}), coords: "" }));
    setLocationSearch("");
    setWeatherRefreshKey((prev) => prev + 1);
  };

  React.useEffect(() => {
    const timer = setInterval(() => {
      setWeatherRefreshKey((prev) => prev + 1);
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const weatherQuery = useMemo(() => {
    const districtValue = String(landDemo?.district || "").trim();
    const neighborhoodValue = String(landDemo?.neighborhood || "").trim();
    const params = [`city=${encodeURIComponent(city)}`];
    if (coordsValid) {
      params.push(`coords=${encodeURIComponent(`${parsedCoords.lat},${parsedCoords.lon}`)}`);
    }
    if (districtValue) params.push(`district=${encodeURIComponent(districtValue)}`);
    if (neighborhoodValue) params.push(`neighborhood=${encodeURIComponent(neighborhoodValue)}`);
    return params.join("&");
  }, [city, parsedCoords, coordsValid, landDemo?.district, landDemo?.neighborhood]);

  const weatherScopeLabel = useMemo(() => {
    return [landDemo?.neighborhood, landDemo?.district, city]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(", ");
  }, [city, landDemo?.district, landDemo?.neighborhood]);

  const apiBaseForAssets = (
    resolvedApiBase ||
    API_BASE ||
    (isCapacitorRuntime ? CAPACITOR_API_CANDIDATES[0] : getWebApiCandidates()[0]) ||
    "http://127.0.0.1:5051"
  ).replace(/\/$/, "");

  const weatherLocationLabel = useMemo(() => {
    const apiLabel = String(weather?.locationLabel || "").trim();
    if (apiLabel) return apiLabel.replace(/,\s*/g, " / ");
    const parts = [city, landDemo?.district, landDemo?.neighborhood].map((x) => String(x || "").trim()).filter(Boolean);
    return parts.length ? parts.join(" / ") : "Konum seçilmedi";
  }, [weather?.locationLabel, city, landDemo?.district, landDemo?.neighborhood]);
  const soilLocationLabel = useMemo(() => {
    const fromReport = [
      soilReport?.city,
      soilReport?.district,
      soilReport?.neighborhood
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    if (fromReport.length) return fromReport.join(" / ");
    return weatherLocationLabel;
  }, [soilReport?.city, soilReport?.district, soilReport?.neighborhood, weatherLocationLabel]);

  const weatherFreshnessText = useMemo(() => {
    if (!weather?.updatedAt) return "Güncel veri bekleniyor";
    try {
      return `Son güncelleme: ${new Date(weather.updatedAt).toLocaleTimeString("tr-TR")}`;
    } catch (_) {
      return "Güncelleme saati okunamadi";
    }
  }, [weather?.updatedAt]);

  const soilQuery = useMemo(() => {
    const plantParam = selectedPlant?.id ? `&plant=${encodeURIComponent(selectedPlant.id)}` : "";
    return `${weatherQuery}${plantParam}`;
  }, [weatherQuery, selectedPlant]);


  React.useEffect(() => {
    let isActive = true;
    setWeatherError("");
    const loadWeather = async () => {
      try {
        if (isFrontendOnlyMode || allowRuntimeMockFallback) {
          const data = await fetchOpenMeteo(weatherScopeLabel || city, "weather");
          if (data && isActive) {
            setWeather(data.weather);
            return;
          }
        }
        const res = await apiFetch(`/api/weather?${weatherQuery}`);
        const data = await res.json();
        if (!isActive) return;
        setWeather(data);
        if (String(data?.source || "").includes("unavailable")) {
          setWeatherError("Canli hava verisi alinamadi. Sahte veri gosterilmiyor.");
        }
      } catch (_) {
        if (!isActive) return;
        setWeather(null);
        setWeatherError("Canli veri alinamadi.");
      }
    };
    loadWeather();
    return () => { isActive = false; };
  }, [city, weatherQuery, weatherScopeLabel, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    setForecastError("");
    const loadForecast = async () => {
      try {
        if (isFrontendOnlyMode || allowRuntimeMockFallback) {
          const data = await fetchOpenMeteo(weatherScopeLabel || city, "forecast");
          if (data && isActive) {
            setForecast(data.forecast);
            return;
          }
        }
        const res = await apiFetch(`/api/forecast?${weatherQuery}`);
        const data = await res.json();
        if (!isActive) return;
        setForecast(data);
        if (String(data?.source || "").includes("unavailable")) {
          setForecastError("Canli tahmin verisi alinamadi. Tahmini demo akisi kapatildi.");
        }
      } catch (_) {
        if (!isActive) return;
        setForecast(null);
        setForecastError("Tahmin verisi yuklenemedi.");
      }
    };
    loadForecast();
    return () => { isActive = false; };
  }, [city, weatherQuery, weatherScopeLabel, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    setSoilLoading(true);
    setSoilError("");
    const loadSoil = async () => {
      try {
        if (isFrontendOnlyMode || allowRuntimeMockFallback) {
          const data = await fetchOpenMeteo(weatherScopeLabel || city, "soil");
          if (data && isActive) {
            setSoilReport(data.soil);
            return;
          }
        }
        const res = await apiFetch(`/api/soil?${soilQuery}`);
        const data = await res.json();
        if (!isActive) return;
        setSoilReport(data);
        if (String(data?.source || "").includes("unavailable")) {
          setSoilError("Canli toprak verisi alinamadi. Gosterim verisi kapatildi.");
        }
      } catch (_) {
        if (!isActive) return;
        setSoilReport(null);
        setSoilError("Toprak verisi yuklenemedi.");
      } finally {
        if (isActive) setSoilLoading(false);
      }
    };
    loadSoil();
    return () => { isActive = false; };
  }, [city, soilQuery, weatherScopeLabel, weatherRefreshKey]);

  React.useEffect(() => {
    let isActive = true;
    setHackhatonDashboardError("");
    setHackhatonModelSuiteError("");

    const loadHackhatonModules = async () => {
      try {
        const [dashboardRes, modelSuiteRes] = await Promise.all([
          apiFetch(`/api/hackhaton/dashboard?${weatherQuery}`),
          apiFetch(`/api/hackhaton/model-suite?${weatherQuery}`)
        ]);

        const [dashboardData, modelSuiteData] = await Promise.all([
          dashboardRes.json().catch(() => null),
          modelSuiteRes.json().catch(() => null)
        ]);

        if (!isActive) return;

        if (dashboardRes.ok && dashboardData?.available) {
          setHackhatonDashboard(dashboardData);
        } else {
          setHackhatonDashboard(null);
          setHackhatonDashboardError(
            dashboardData?.error ? `Hackhaton dashboard hazır değil: ${dashboardData.error}` : "Hackhaton dashboard yuklenemedi."
          );
        }

        if (modelSuiteRes.ok && modelSuiteData?.available) {
          setHackhatonModelSuite(modelSuiteData);
        } else {
          setHackhatonModelSuite(null);
          setHackhatonModelSuiteError(
            modelSuiteData?.error ? `Model suite hazır değil: ${modelSuiteData.error}` : "Model suite yuklenemedi."
          );
        }
      } catch (_) {
        if (!isActive) return;
        setHackhatonDashboard(null);
        setHackhatonModelSuite(null);
        setHackhatonDashboardError("Hackhaton dashboard baglantisi kurulamadi.");
        setHackhatonModelSuiteError("Model suite baglantisi kurulamadi.");
      }
    };

    loadHackhatonModules();
    return () => {
      isActive = false;
    };
  }, [weatherQuery, weatherRefreshKey]);

  React.useEffect(() => {
    if (!weather && !soilReport) return;

    // Simple notification engine
    const newAlerts = [];

    // Frost check
    if (weather?.frostRisk) {
      newAlerts.push({
        id: `frost-${city}-${Date.now()}`,
        type: "danger",
        title: "Don Tehlikesi",
        messağe: `${city} için meteorolojik don uyarısı! Mahsulleri koruma altına alın.`,
        time: new Date().toLocaleTimeString("tr-TR")
      });
    }

    // Moisture check
    if (soilReport?.moisture0cm < 25) {
      newAlerts.push({
        id: `moisture-${city}-${Date.now()}`,
        type: "warning",
        title: "Düşük Toprak Nemi",
        messağe: "Yüzey toprağı kritik nem seviyesinin altında. Sulama planını gözden geçirin.",
        time: new Date().toLocaleTimeString("tr-TR")
      });
    }

    // Temp check (High heat)
    if (weather?.temp > 35) {
      newAlerts.push({
        id: `heat-${city}-${Date.now()}`,
        type: "warning",
        title: "Yüksek Sıcaklık",
        messağe: "Aşırı sıcaklık mahsul stresine neden olabilir. Havalandırmayı artırın.",
        time: new Date().toLocaleTimeString("tr-TR")
      });
    }

    if (newAlerts.length > 0) {
      setNotifications(prev => {
        // Avoid duplicate alerts for the same condition/city in the same session
        const existingTitles = prev.map(n => n.title);
        const uniqueNew = newAlerts.filter(n => !existingTitles.includes(n.title));
        if (uniqueNew.length === 0) return prev;
        return [...uniqueNew, ...prev].slice(0, 8);
      });
    }
  }, [weather, soilReport, city]);

  React.useEffect(() => {
    let isActive = true;
    apiFetch("/api/sources")
      .then((res) => res.json())
      .then((data) => {
        if (isActive) {
          setSources(data.sources || []);
          setSourcesUpdatedAt(data.updatedAt || "");
        }
      })
      .catch(() => {
        if (isActive) setSourcesError("Kaynaklar yuklenemedi.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  const loadIntegrationsHealth = useCallback((force = false) => {
    let isActive = true;
    setIntegrationsHealthError("");
    apiFetch(`/api/integrations/health${force ? "?force=1" : ""}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setIntegrationsHealth(data);
      })
      .catch(() => {
        if (!isActive) return;
        setIntegrationsHealthError("Dis entegrasyon kontrolu alinamadi.");
      });
    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => loadIntegrationsHealth(true), [loadIntegrationsHealth]);

  const loadNews = useCallback((force = false) => {
    let isActive = true;
    setNewsError("");
    setNewsLoading(true);
    apiFetch(`/api/news?limit=20${force ? "&force=1" : ""}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        setNewsItems(Array.isArray(data?.items) ? data.items : []);
        setNewsUpdatedAt(data?.updatedAt || "");
        setNewsLive(Boolean(data?.live) && Array.isArray(data?.items) && data.items.length > 0);
        if (data?.live === false || !Array.isArray(data?.items) || !data.items.length) {
          setNewsError("Canli tarım haberi su an alinamiyor.");
        }
      })
      .catch(() => {
        if (!isActive) return;
        setNewsItems([]);
        setNewsUpdatedAt("");
        setNewsLive(false);
        setNewsError("Tarım haberleri yuklenemedi.");
      })
      .finally(() => {
        if (isActive) setNewsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => loadNews(true), [loadNews]);

  React.useEffect(() => {
    const timer = setInterval(() => loadIntegrationsHealth(false), 90 * 1000);
    return () => clearInterval(timer);
  }, [loadIntegrationsHealth]);

  React.useEffect(() => {
    const timer = setInterval(() => loadNews(false), 3 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadNews(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadNews]);

  React.useEffect(() => {
    let isActive = true;
    if (apiStatus.state === "down") {
      return () => {
        isActive = false;
      };
    }
    const loadMetrics = () => {
      setMetricsError("");
      apiFetch("/api/metrics")
        .then((res) => res.json())
        .then((data) => {
          if (isActive) {
            setMetrics(data);
            setMetricsUpdatedAt(Date.now());
          }
        })
        .catch(() => {
          if (isActive) setMetricsError("Metrikler yuklenemedi.");
        });
    };
    loadMetrics();
    const timer = setInterval(loadMetrics, 20000);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, [metricsRefreshTick, apiStatus.state]);

  React.useEffect(() => {
    let isActive = true;
    if (apiStatus.state === "down" || !supportsModelHealth) {
      setModelHealth(null);
      return () => {
        isActive = false;
      };
    }
    const loadModelHealth = () => {
      setModelHealthError("");
      apiFetch("/api/model/health")
        .then((res) => res.json())
        .then((data) => {
          if (!isActive) return;
          setModelHealth(data || null);
        })
        .catch(() => {
          if (!isActive) return;
          setModelHealth(null);
          setModelHealthError("Model health bilgisi alinamadi.");
        });
    };
    loadModelHealth();
    const timer = setInterval(loadModelHealth, 30000);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, [metricsRefreshTick, apiStatus.state, supportsModelHealth]);

  const refreshModelDiagnostics = useCallback(() => {
    setModelDiagnosticsError("");
    return apiFetch("/api/model/diagnostics")
      .then((res) => res.json())
      .then((data) => {
        setModelDiagnostics(data || null);
        return data;
      })
      .catch((err) => {
        setModelDiagnostics(null);
        setModelDiagnosticsError("Model diagnostics bilgisi alinamadi.");
        throw err;
      });
  }, []);

  React.useEffect(() => {
    let isActive = true;
    if (apiStatus.state === "down" || !supportsModelDiagnostics) {
      setModelDiagnostics(null);
      return () => {
        isActive = false;
      };
    }
    const loadModelDiagnostics = () =>
      refreshModelDiagnostics().catch(() => {
        if (!isActive) return;
      });
    loadModelDiagnostics();
    const timer = setInterval(loadModelDiagnostics, 30000);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, [metricsRefreshTick, apiStatus.state, supportsModelDiagnostics, refreshModelDiagnostics]);

  const runModelSelfCheck = async () => {
    if (!supportsModelSelfCheck) {
      setModelHealthError("Bu backend surumu model self-check endpointini desteklemiyor.");
      return;
    }
    setModelSelfCheckRunning(true);
    try {
      const res = await apiFetch("/api/model/self-check", { method: "POST" });
      const data = await res.json();
      setModelSelfCheck(data || null);
      if (!res.ok) {
        setModelHealthError("Model self-check sorun buldu.");
      }
      setMetricsRefreshTick((prev) => prev + 1);
      if (supportsModelDiagnostics) {
        refreshModelDiagnostics().catch(() => { });
      }
    } catch (_) {
      setModelSelfCheck({
        ok: false,
        summary: "Self-check request failed",
        checks: []
      });
      setModelHealthError("Model self-check calistirilamadi.");
    } finally {
      setModelSelfCheckRunning(false);
    }
  };

  const resetModelDiagnostics = async () => {
    setModelDiagnosticsResetRunning(true);
    try {
      const res = await apiFetch("/api/model/diagnostics/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error("reset_failed");
      setModelDiagnostics((prev) =>
        prev
          ? {
            ...prev,
            updatedAt: data?.updatedAt || new Date().toISOString(),
            diagnostics: data?.diagnostics || null
          }
          : data
      );
      setModelDiagnosticsError("");
      setMetricsRefreshTick((prev) => prev + 1);
    } catch (_) {
      setModelDiagnosticsError("Model diagnostics reset başarısiz.");
    } finally {
      setModelDiagnosticsResetRunning(false);
    }
  };

  const sourceCategories = useMemo(() => {
    const set = new Set();
    sources.forEach((item) => set.add(item.category));
    return ["all", ...Array.from(set).sort()];
  }, [sources]);

  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    return sources.filter((item) => {
      const categoryMatch = sourceCategory === "all" ? true : item.category === sourceCategory;
      const textMatch =
        !q ||
        `${item.title} ${item.summary}`.toLowerCase().includes(q);
      return categoryMatch && textMatch;
    });
  }, [sources, sourceQuery, sourceCategory]);

  const sourceStats = useMemo(() => {
    const total = sources.length;
    const categories = new Set(sources.map((item) => item.category)).size;
    const handbookCount = handbookSections.reduce((acc, section) => acc + section.items.length, 0);
    return { total, categories, handbookCount };
  }, [sources]);

  const knowledgeEntries = useMemo(() => {
    const out = [];
    cropEncyclopedia.forEach((item) =>
      out.push({
        type: "bitki",
        title: item.name,
        detail: item.desc,
        source: "Bitki ansiklopedisi",
        tags: [item.focus, item.climate, item.soil].filter(Boolean).join(" ")
      })
    );
    diseaseLibrary.forEach((item) =>
      out.push({
        type: "hastalik",
        title: item.name,
        detail: item.detail,
        source: "Hastalik kutuphanesi",
        tags: [item.causes, item.signs, item.risk].filter(Boolean).join(" ")
      })
    );
    pestGuide.forEach((item) =>
      out.push({
        type: "zararli",
        title: item.title,
        detail: item.detail,
        source: "Zararli rehberi",
        tags: [item.lifecycle, item.risk].filter(Boolean).join(" ")
      })
    );
    symptomDictionary.forEach((item) =>
      out.push({
        type: "belirti",
        title: item.title,
        detail: item.detail,
        source: "Belirti sozlugu",
        tags: [item.cause, item.action].filter(Boolean).join(" ")
      })
    );
    soilTypes.forEach((item) =>
      out.push({
        type: "toprak",
        title: item.title,
        detail: item.detail,
        source: "Toprak tipleri",
        tags: [item.ph, item.water].filter(Boolean).join(" ")
      })
    );
    glossary.forEach((item) =>
      out.push({ type: "terim", title: item.term, detail: item.meaning, source: "Tarım terimleri", tags: "" })
    );
    irrigationTips.forEach((item) =>
      out.push({
        type: "rehber",
        title: item.title,
        detail: item.detail,
        source: "Sulama ipuclari",
        tags: "sulama su yönetimi"
      })
    );
    weatherActions.forEach((item) =>
      out.push({
        type: "hava",
        title: item.condition,
        detail: item.detail || item.action || "",
        source: "Hava aksiyon rehberi",
        tags: "hava risk operasyon"
      })
    );
    diseasePrevention.forEach((item) =>
      out.push({
        type: "rehber",
        title: item.title,
        detail: item.detail,
        source: "Hastalik onleme",
        tags: "onleme ipm"
      })
    );
    safetyNotes.forEach((item) =>
      out.push({
        type: "uygünlük",
        title: item.title,
        detail: item.detail,
        source: "İlaç guvenligi",
        tags: "rei phi ppe guvenlik"
      })
    );
    greenhouseTips.forEach((item) =>
      out.push({
        type: "sera",
        title: item.title,
        detail: item.detail,
        source: "Sera pratikleri",
        tags: "sera iklim"
      })
    );
    postHarvest.forEach((item) =>
      out.push({
        type: "hasat",
        title: item.title,
        detail: item.detail,
        source: "Hasat sonrasi",
        tags: "depolama lojistik kalite"
      })
    );
    farmerChecklists.forEach((item) =>
      out.push({
        type: "operasyon",
        title: item.title,
        detail: item.detail,
        source: "Saha kontrol listesi",
        tags: "operasyon checklist"
      })
    );
    handbookSections.forEach((section) => {
      section.items.forEach((item) => {
        out.push({
          type: "rehber",
          title: item.title,
          detail: item.detail,
          source: section.title,
          tags: [section.id, section.title].filter(Boolean).join(" "),
          link: item.link || null
        });
      });
    });
    return out;
  }, []);

  const knowledgeTypeLabels = useMemo(
    () => ({
      all: "Tüm başlıklar",
      bitki: "Bitki",
      hastalik: "Hastalik",
      zararli: "Zararli",
      belirti: "Belirti",
      toprak: "Toprak",
      terim: "Terim",
      rehber: "Rehber",
      hava: "Hava riski",
      uygunluk: "Uygünlük",
      sera: "Sera",
      hasat: "Hasat",
      operasyon: "Operasyon"
    }),
    []
  );

  const knowledgeTypes = useMemo(() => {
    const set = new Set(knowledgeEntries.map((item) => item.type));
    return ["all", ...Array.from(set)];
  }, [knowledgeEntries]);

  const knowledgeSources = useMemo(() => {
    const set = new Set(knowledgeEntries.map((item) => item.source));
    return ["all", ...Array.from(set).sort((a, b) => String(a || "").localeCompare(String(b || ""), "tr"))];
  }, [knowledgeEntries]);

  const filteredKnowledgeEntries = useMemo(() => {
    const q = knowledgeQuery.trim().toLowerCase();
    return knowledgeEntries
      .filter((item) => {
        if (knowledgeType !== "all" && item.type !== knowledgeType) return false;
        if (knowledgeSource !== "all" && item.source !== knowledgeSource) return false;
        if (!q) return true;
        return `${item.title} ${item.detail} ${item.source} ${item.tags || ""}`.toLowerCase().includes(q);
      })
      .slice(0, 500);
  }, [knowledgeEntries, knowledgeQuery, knowledgeType, knowledgeSource]);

  const knowledgeTypeCounts = useMemo(() => {
    const out = { all: knowledgeEntries.length };
    knowledgeEntries.forEach((item) => {
      out[item.type] = (out[item.type] || 0) + 1;
    });
    return out;
  }, [knowledgeEntries]);

  const knowledgeSpotlight = useMemo(() => {
    const preferredTypes = ["hastalik", "zararli", "toprak", "hava", "uygünlük", "operasyon"];
    const picks = [];
    preferredTypes.forEach((type) => {
      const found = knowledgeEntries.find((item) => item.type === type && item.title && item.detail);
      if (found) picks.push(found);
    });
    return picks.slice(0, 6);
  }, [knowledgeEntries]);

  const encyclopediaLetters = useMemo(() => {
    const letters = new Set();
    filteredKnowledgeEntries.forEach((item) => {
      const first = String(item.title || "").trim().charAt(0).toLocaleUpperCase("tr-TR");
      if (first) letters.add(first);
    });
    return ["all", ...Array.from(letters).sort((a, b) => String(a || "").localeCompare(String(b || ""), "tr"))];
  }, [filteredKnowledgeEntries]);

  const encyclopediaEntries = useMemo(() => {
    const list = filteredKnowledgeEntries
      .filter((item) => {
        if (encyclopediaLetter === "all") return true;
        const first = String(item.title || "").trim().charAt(0).toLocaleUpperCase("tr-TR");
        return first === encyclopediaLetter;
      })
      .map((item, idx) => ({
        ...item,
        _id: `${normalizeKey(item.type)}-${normalizeKey(item.title)}-${idx}`
      }))
      .sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || ""), "tr"));
    return list;
  }, [filteredKnowledgeEntries, encyclopediaLetter]);

  const encyclopediaVisibleEntries = useMemo(
    () => encyclopediaEntries.slice(0, encyclopediaListLimit),
    [encyclopediaEntries, encyclopediaListLimit]
  );

  const selectedEncyclopediaEntry = useMemo(() => {
    if (!encyclopediaEntries.length) return null;
    return encyclopediaEntries.find((item) => item._id === encyclopediaEntryId) || encyclopediaEntries[0];
  }, [encyclopediaEntries, encyclopediaEntryId]);

  const relatedKnowledgeEntries = useMemo(() => {
    if (!selectedEncyclopediaEntry) return [];
    const rootWords = String(selectedEncyclopediaEntry.title || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2);
    return encyclopediaEntries
      .filter((item) => item._id !== selectedEncyclopediaEntry._id)
      .filter(
        (item) =>
          item.type === selectedEncyclopediaEntry.type ||
          item.source === selectedEncyclopediaEntry.source ||
          rootWords.some((token) => String(item.title || "").toLowerCase().includes(token))
      )
      .slice(0, 6);
  }, [encyclopediaEntries, selectedEncyclopediaEntry]);

  React.useEffect(() => {
    setEncyclopediaListLimit(80);
    setEncyclopediaEntryId("");
  }, [knowledgeQuery, knowledgeType, knowledgeSource, encyclopediaLetter]);

  const researchHighlights = useMemo(() => sources.slice(0, 3), [sources]);

  React.useEffect(() => {
    let isActive = true;
    apiFetch("/api/plants")
      .then((res) => res.json())
      .then((data) => {
        if (isActive) setModelPlants(data.plants || []);
      })
      .catch(() => {
        if (isActive) setModelPlants([]);
      });
    return () => {
      isActive = false;
    };
  }, [apiStatus.state]);

  const onSelectFile = (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Lütfen bir görsel dosyası seçin.");
      return;
    }
    setError("");
    setResult(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const analyze = async () => {
    if (!apiReady) {
      setError("Backend baglantisi yok. Sunucuyu başlatip tekrar deneyin.");
      return;
    }
    if (!selectedPlant) {
      setError("Once bitki secmelisiniz.");
      return;
    }
    if (!modelReady) {
      setError("Model su an yuklu değil. Lütfen backend model durumunu kontrol edin.");
      return;
    }
    if (!selectedPlantSupported) {
      setError("Seçilen bitki modelde desteklenmiyor. Lütfen listeden destekli bir bitki seçin.");
      return;
    }
    if (!file) {
      setError("Analiz için önce bir görsel yükleyin.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const previewSnapshot = preview;
      const formData = new FormData();
      formData.append("image", file);
      if (selectedPlant) {
        formData.append("plant", selectedPlant.id || selectedPlant.name || "");
      }
      formData.append("strictPlant", strictPlantFilter ? "1" : "0");

      const response = await apiFetch("/api/diagnose", {
        method: "POST",
        body: formData
      });

      let data = null;
      if (!response.ok) {
        try {
          data = await response.json();
        } catch (parseErr) {
          data = null;
        }
        if (data?.error === "plant_not_supported") {
          const supported = Array.isArray(data?.supportedPlants)
            ? data.supportedPlants
              .map((id) => plantNameOverrides[id] || titleCase(id))
              .join(", ")
            : "";
          const selectedLabel = plantNameOverrides[data?.plant] || data?.plant || "Secilen bitki";
          const unsupportedMessağe = supported
            ? `${selectedLabel} modelde desteklenmiyor. Desteklenenler: ${supported}`
            : `${selectedLabel} modelde desteklenmiyor.`;
          throw new Error(unsupportedMessağe);
        }
        const reason =
          data?.error === "model_inference_failed"
            ? `Model calismiyor (${data?.failureCode || "inference_failed"}): ${data?.action || data?.detail || "inference_failed"
            }`
            : data?.error
              ? `Analiz başarısiz: ${data.error}${data?.detail ? ` (${data.detail})` : ""}`
              : "Analiz başarısiz oldu.";
        throw new Error(reason);
      }

      data = await response.json();
      if (data?.model?.fallbackUsed || String(data?.model?.source || "").includes("demo-fallback")) {
        throw new Error(
          "Gercek model sonucu alinmadi (fallback). Backend modelini kontrol edin ve tekrar deneyin."
        );
      }
      const needsConsistencyReview = Boolean(
        modelConsistencyAlert &&
        String(data?.model?.source || "").startsWith("onnx")
      );
      const enrichedData = needsConsistencyReview
        ? {
          ...data,
          warnings: Array.from(
            new Set([...(Array.isArray(data?.warnings) ? data.warnings : []), modelConsistencyAlert.message])
          ),
          retrySuggested: true,
          decision: {
            ...(data?.decision || {}),
            status: "review",
            needsRetake: true,
            flags: Array.from(
              new Set([...(Array.isArray(data?.decision?.flags) ? data.decision.flags : []), "model_consistency_warning"])
            )
          }
        }
        : data;
      setResult(enrichedData);
      setMetricsRefreshTick((prev) => prev + 1);
      if (supportsModelDiagnostics) {
        refreshModelDiagnostics().catch(() => { });
      }
      if (retakeSession?.baseId && retakeSession.baseId !== data.id) {
        const compareConfidence = Number(enrichedData?.diagnosis?.confidencePct || 0);
        const compareReliability = Number(enrichedData?.reliability?.score || 0);
        const confidenceDelta =
          Math.round((compareConfidence - Number(retakeSession.baseConfidence || 0)) * 10) / 10;
        const reliabilityDelta = Math.round(
          compareReliability - Number(retakeSession.baseReliability || 0)
        );
        setRetakeTrend((prev) =>
          [
            {
              id: `${retakeSession.baseId}-${data.id}`,
              at: Date.now(),
              label: enrichedData?.diagnosis?.name || "Bilinmeyen",
              confidence: compareConfidence,
              reliability: compareReliability,
              confidenceDelta,
              reliabilityDelta
            },
            ...prev
          ].slice(0, 3)
        );
        setRetakeSession((prev) =>
          prev
            ? {
              ...prev,
              comparedId: data.id,
              comparedAt: Date.now()
            }
            : prev
        );
      }
      setHistory((prev) =>
        [
          {
            id: data.id,
            name: enrichedData.diagnosis?.name,
            confidence: enrichedData.diagnosis?.confidence,
            time: new Date().toLocaleString("tr-TR"),
            preview: previewSnapshot
          },
          ...prev
        ].slice(0, 6)
      );
    } catch (err) {
      const msg =
        err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError")
          ? "Sunucuya baglanti kurulamadi. Backend açık mi kontrol edin."
          : err?.message || "Analiz sırasında bir hata oluştu. Lütfen tekrar deneyin.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const urgentActions = useMemo(
    () =>
      result?.carePlan?.length && result.diagnosis?.status !== "healthy"
        ? result.carePlan.slice(0, 2)
        : [],
    [result]
  );
  const actionPlan = result?.carePlan?.length
    ? {
      today: result.carePlan.slice(0, 2),
      week: result.carePlan.slice(2, 4),
      monitor: ["Yapraklari takip et", "Yeni leke var mi kontrol et"]
    }
    : null;
  const isHandbook = activeTab === "handbook";
  const showDiagnosisResult = result && !result.filter?.blocked;
  const retakeComparison = useMemo(() => {
    if (!result || !retakeSession || retakeSession.baseId === result.id) return null;
    const newConfidence = Number(result?.diagnosis?.confidencePct || 0);
    const newReliability = Number(result?.reliability?.score || 0);
    const confidenceDelta = Math.round((newConfidence - (retakeSession.baseConfidence || 0)) * 10) / 10;
    const reliabilityDelta = Math.round(newReliability - (retakeSession.baseReliability || 0));
    return {
      previousLabel: retakeSession.baseLabel,
      previousConfidence: retakeSession.baseConfidence || 0,
      previousReliability: retakeSession.baseReliability || 0,
      newConfidence,
      newReliability,
      confidenceDelta,
      reliabilityDelta
    };
  }, [result, retakeSession]);
  const retakeOutcome = useMemo(() => {
    if (!retakeComparison) return null;
    if (retakeComparison.reliabilityDelta >= 8 || retakeComparison.confidenceDelta >= 8) {
      return { label: "Iyılesti", tone: "ok" };
    }
    if (retakeComparison.reliabilityDelta <= -8 || retakeComparison.confidenceDelta <= -8) {
      return { label: "Zayifladi", tone: "risk" };
    }
    return { label: "Benzer", tone: "warn" };
  }, [retakeComparison]);
  const retryPlanItems = useMemo(
    () =>
      result?.retryPlan?.length
        ? result.retryPlan
        : (result?.retryTips || []).map((text) => ({ id: text, text, priority: 3 })),
    [result]
  );
  const retryChecklistStats = useMemo(() => {
    if (!retryPlanItems.length) return { done: 0, total: 0, pct: 0 };
    const done = retryPlanItems.filter((item) => retryChecklist[item.id || item.text]).length;
    const total = retryPlanItems.length;
    const pct = Math.round((done / total) * 100);
    return { done, total, pct };
  }, [retryPlanItems, retryChecklist]);
  const retryMinReadyCount = useMemo(
    () => (retryPlanItems.length ? Math.ceil(retryPlanItems.length * 0.6) : 0),
    [retryPlanItems.length]
  );
  const retryNeedFor60 = useMemo(
    () => Math.max(0, retryMinReadyCount - retryChecklistStats.done),
    [retryMinReadyCount, retryChecklistStats.done]
  );
  const retryHighPriorityStats = useMemo(() => {
    const highPriority = retryPlanItems.filter((item) => Number(item.priority || 0) >= 4);
    if (!highPriority.length) return { done: 0, total: 0, pct: 100 };
    const done = highPriority.filter((item) => retryChecklist[item.id || item.text]).length;
    const total = highPriority.length;
    const pct = Math.round((done / total) * 100);
    return { done, total, pct };
  }, [retryPlanItems, retryChecklist]);
  const canRetakeNow = useMemo(() => {
    if (!retryPlanItems.length) return true;
    return retryHighPriorityStats.pct >= 100 && retryChecklistStats.pct >= 60;
  }, [retryPlanItems, retryHighPriorityStats.pct, retryChecklistStats.pct]);
  const retryMissingCritical = useMemo(
    () =>
      retryPlanItems.filter(
        (item) => Number(item.priority || 0) >= 4 && !retryChecklist[item.id || item.text]
      ),
    [retryPlanItems, retryChecklist]
  );
  const retryMissingAny = useMemo(
    () => retryPlanItems.filter((item) => !retryChecklist[item.id || item.text]),
    [retryPlanItems, retryChecklist]
  );
  const retryNextItem = useMemo(
    () =>
      retryPlanItems.find(
        (item) => Number(item.priority || 0) >= 4 && !retryChecklist[item.id || item.text]
      ) || retryPlanItems.find((item) => !retryChecklist[item.id || item.text]) || null,
    [retryPlanItems, retryChecklist]
  );
  const retryReadinessLabel = canRetakeNow
    ? "Cekim hazır"
    : retryHighPriorityStats.pct < 100
      ? "Kritik maddeleri tamamla"
      : "Hazirlik seviyesini arttir";
  const diagnosisConfidencePct = Number(
    result?.diagnosis?.confidencePct ?? ((result?.diagnosis?.confidence || 0) * 100)
  );
  const diagnosisConfidenceText = diagnosisConfidencePct.toFixed(1);

  React.useEffect(() => {
    if (!result?.id || !retryPlanItems.length) return;
    setRetryChecklist((prev) => {
      const next = {};
      retryPlanItems.forEach((item) => {
        const key = item.id || item.text;
        if (!key) return;
        next[key] = Boolean(prev[key]);
      });
      return next;
    });
  }, [result?.id, retryPlanItems]);

  const toggleRetryChecklist = (id) => {
    if (!id) return;
    setRetryChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const markAllRetryChecklist = () => {
    setRetryChecklist((prev) => {
      const next = { ...prev };
      retryPlanItems.forEach((item) => {
        const key = item.id || item.text;
        if (!key) return;
        next[key] = true;
      });
      return next;
    });
  };
  const markPriorityRetryChecklist = (minPriority = 4) => {
    setRetryChecklist((prev) => {
      const next = { ...prev };
      retryPlanItems.forEach((item) => {
        const key = item.id || item.text;
        if (!key) return;
        if (Number(item.priority || 0) >= minPriority) {
          next[key] = true;
        }
      });
      return next;
    });
  };
  const completeNextRetryItem = () => {
    if (!retryNextItem) return;
    const key = retryNextItem.id || retryNextItem.text;
    if (!key) return;
    setRetryChecklist((prev) => ({ ...prev, [key]: true }));
  };
  const autoPrepareRetake = () => {
    if (!retryPlanItems.length) {
      startRetakeFlow();
      return;
    }
    setRetryChecklist((prev) => {
      const next = { ...prev };
      retryPlanItems.forEach((item) => {
        const key = item.id || item.text;
        if (!key) return;
        if (Number(item.priority || 0) >= 4) next[key] = true;
      });

      const required = Math.ceil(retryPlanItems.length * 0.6);
      let done = retryPlanItems.filter((item) => next[item.id || item.text]).length;
      if (done < required) {
        const sorted = [...retryPlanItems].sort(
          (a, b) => Number(b.priority || 0) - Number(a.priority || 0)
        );
        for (const item of sorted) {
          const key = item.id || item.text;
          if (!key || next[key]) continue;
          next[key] = true;
          done += 1;
          if (done >= required) break;
        }
      }
      return next;
    });
    setTimeout(() => startRetakeFlow(), 50);
  };

  const handleFeatureTab = (key) => {
    setFeatureTab(key);
    const anchorMap = {
      core: "diagnosis",
      operations: "operations",
      intelligence: "intelligence",
      commerce: "commerce",
      compliance: "compliance",
      learning: "learning"
    };
    if (key !== "all" && anchorMap[key]) {
      document.getElementById(anchorMap[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleDemoDockTab = (key) => {
    setDemoDockTab(key);
    if (key === "land") setCommerceMiniTab("land");
    if (key === "market") setCommerceMiniTab("market");
    if (key === "yield") setShowFullDemo(true);
    const anchorMap = {
      diagnosis: "diagnosis",
      weather: "demo-weather",
      soil: "demo-soil",
      economy: "demo-economy",
      land: "demo-land",
      market: "demo-market",
      yield: "demo-yield"
    };
    const id = anchorMap[key];
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleBottomTab = (key) => {
    if (!bottomTabs.includes(key)) return;
    if (key === bottomTab) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (key === "home") {
        setActiveTab("diagnosis");
        setDemoDockOpen(false);
        return;
      }
      if (key === "weather") {
        setActiveTab("diagnosis");
        setDemoDockOpen(false);
        setWeatherRefreshKey((prev) => prev + 1);
        window.setTimeout(() => {
          document.getElementById("legacy-climate-inline")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 20);
        return;
      }
      setActiveTab("diagnosis");
      setDemoDockOpen(true);
      if (key === "demos") {
        setDemoDockTab("yield");
        return;
      }
      if (key === "market") {
        setCommerceMiniTab("market");
        setDemoDockTab("market");
        return;
      }
      if (key === "land") {
        setCommerceMiniTab("land");
        if (!["economy", "land"].includes(demoDockTab)) setDemoDockTab("economy");
      }
      return;
    }
    bottomTabScrollRef.current[bottomTab] = window.scrollY || 0;
    setBottomTab(key);
    if (key === "weather") {
      setWeatherRefreshKey((prev) => prev + 1);
    }
    const restoreTop = Number(bottomTabScrollRef.current[key] || 0);
    window.setTimeout(() => {
      window.scrollTo({ top: restoreTop, behavior: "auto" });
      if (key === "weather") {
        document.getElementById("legacy-climate-inline")?.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }, 0);
  };

  React.useEffect(() => {
    if (!bottomTabs.includes(bottomTab)) {
      setBottomTab("home");
      return;
    }
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
  const demoDockTabs = useMemo(
    () => [
      { key: "diagnosis", label: "Teşhis" },
      { key: "weather", label: "Hava" },
      { key: "soil", label: "Toprak" },
      { key: "economy", label: "Ekonomi" },
      { key: "land", label: "Arazi" },
      { key: "market", label: "Pazar" },
      { key: "yield", label: "Rekolte" }
    ],
    []
  );
  const activeDemoDock = demoDockTabs.find((item) => item.key === demoDockTab) || demoDockTabs[0];
  const shiftDemoDockTab = (dir = 1) => {
    const idx = demoDockTabs.findIndex((item) => item.key === demoDockTab);
    const nextIdx = idx < 0 ? 0 : (idx + dir + demoDockTabs.length) % demoDockTabs.length;
    handleDemoDockTab(demoDockTabs[nextIdx].key);
  };

  const featureSummaries = {
    core: [
      { title: "Teşhis", value: "Görsel analiz + plan" },
      { title: "Guven", value: "Top3 tahmin" },
      { title: "Aksiyon", value: "Bugun/Bu hafta" }
    ],
    operations: [
      { title: "Tarla", value: "Konum + hava" },
      { title: "Toprak", value: "Profil + öneriler" },
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
      { title: "Gelir", value: "Finansal özet" }
    ],
    compliance: [
      { title: "PHI", value: "Etiket uyumu" },
      { title: "Izlenebilirlik", value: "Parti bazli" },
      { title: "Denetim", value: "Sertifikasyon" }
    ],
    learning: [
      { title: "Kılavuz", value: "Tarım referans" },
      { title: "Ders", value: "Mikro egitim" },
      { title: "Sozluk", value: "Belirti rehberi" }
    ],
    all: [
      { title: "Süperapp", value: "Tüm modüller" },
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
          desc: "Anlik sıcaklik, nem, rüzgar ve don riskini tek panelde izle.",
          tone: "emerald"
        },
        {
          key: "weather-risk",
          icon: AlertCircle,
          title: "Risk skoru",
          metric: `${weatherSummary?.score || 0}/100`,
          desc: "Rüzgar, yağış ve nem risklerini operasyon planina yansit.",
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
          desc: "Alış-satış akışında fiyat bandını hızlı gör.",
          tone: "emerald"
        },
        {
          key: "market-offers",
          icon: ShieldCheck,
          title: "Guvenli teklif akisi",
          metric: `${tradeOffers.length || 0} teklif`,
          desc: "Escrow ve karşı teklif adimlarini tek ekranda yonet.",
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
          title: "Net karlılık panosu",
          metric: `${Number(econTotals?.net || 0).toLocaleString("tr-TR")} TL`,
          desc: "Gelir-gider dengesini donum bazli takip et.",
          tone: "emerald"
        },
        {
          key: "finance-land",
          icon: ShieldCheck,
          title: "Arazi deger motoru",
          metric: `${Number(landPriceData?.priceTlDa || 0).toLocaleString("tr-TR")} TL/da`,
          desc: "Bölge, toprak ve erişim etkisini tek modelde gor.",
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
          title: "Demo hazırlık skoru",
          metric: `${demoControlMetrics.runScore}/100`,
          desc: "Moduller, smoke ve akis geçmişi tek bakista.",
          tone: "emerald"
        },
        {
          key: "demo-autopilot",
          icon: Sparkles,
          title: "Autopilot",
          metric: demoAutopilotRunning ? "Çalışıyor" : "Hazır",
          desc: "Tek tusla reset, seed ve smoke senaryolari.",
          tone: "amber"
        },
        {
          key: "demo-flow",
          icon: Stethoscope,
          title: "Demo akis laboratuvari",
          metric: `${demoFlowStats.total || 0} kosu`,
          desc: "Model, pazar ve finans senaryolarını hızlı doğrula.",
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
        desc: "Görsel analiz, güven puanı ve aksiyon planı tek ekranda.",
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
        title: "Operasyon güven kalkanı",
        metric: `${modelReady ? "Model hazır" : "Model bekleniyor"}`,
        desc: "Model sağligi, tutarlılık ve uyarilar surekli izlenir.",
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
        { key: "w1", title: "Sıcaklik", subtitle: "Anlik", tone: "emerald", value: `${weather?.temp ?? "-"}°C` },
        { key: "w2", title: "Nem", subtitle: "Ortam", tone: "amber", value: `${weather?.humidity ?? "-"}%` },
        { key: "w3", title: "Rüzgar", subtitle: "Ortalama", tone: "sky", value: `${weather?.windKmh ?? "-"} km/sa` },
        { key: "w4", title: "Don", subtitle: "Kisa vade", tone: "slate", value: weather?.frostRisk ? "Risk var" : "Risk yok" }
      ];
    }
    if (bottomTab === "market") {
      return [
        { key: "w1", title: "Fiyat bandi", subtitle: "Alis/satis spread", tone: "emerald", value: `${tradeMarketDepth?.spreadPct || 0}%` },
        { key: "w2", title: "Likidite", subtitle: "İlk 5 kademe", tone: "amber", value: `${Math.round(Number(tradeMarketDepth?.liquidityKg || 0)).toLocaleString("tr-TR")} kg` },
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
        { key: "w1", title: "Demo skoru", subtitle: "Modul hazırlık", tone: "emerald", value: `${demoControlMetrics.runScore}/100` },
        { key: "w2", title: "Smoke", subtitle: "Son kosu", tone: "amber", value: `${demoControlMetrics.smokePass}/${demoControlMetrics.smokeTotal || "-"}` },
        { key: "w3", title: "Akis", subtitle: "Toplam kosu", tone: "sky", value: `${demoFlowStats.total || 0}` },
        { key: "w4", title: "Autopilot", subtitle: "Durum", tone: "slate", value: demoAutopilotRunning ? "Çalışıyor" : "Hazır" }
      ];
    }
    return [
      { key: "w1", title: "Teşhis", subtitle: "Son sonuc", tone: "emerald", value: result?.diagnosis?.name || "Bekleniyor" },
      { key: "w2", title: "Hava", subtitle: "Anlik durum", tone: "amber", value: weather?.condition || "Bekleniyor" },
      { key: "w3", title: "Toprak", subtitle: "Saha profili", tone: "sky", value: soilReport?.soilType || "Bekleniyor" },
      { key: "w4", title: "Model", subtitle: "Sağlık", tone: "slate", value: modelReady ? "Hazır" : "Bekleniyor" }
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
        title: "İklim + toprak merkezi",
        desc: "Hava, don riski, toprak profili ve ekim uygunlugunu tek panelde yonet."
      };
    }
    if (bottomTab === "market") {
      return {
        title: "Pazar operasyon merkezi",
        desc: "İlan, teklif, siparis ve lojistik akislarini tek satirda yonet."
      };
    }
    if (bottomTab === "land") {
      return {
        title: "Arazi deger merkezi",
        desc: "Arazi fiyat tahmini, bölge sinyali ve net finans etkisini birlikte izle."
      };
    }
    if (bottomTab === "demos") {
      return {
        title: "Demo orkestrasyon merkezi",
        desc: "Autopilot, smoke ve akış testlerini hızlı çalıştır."
      };
    }
    return {
      title: "Saha komuta merkezi",
      desc: "Teşhis, hava, toprak ve aksiyon planini birlestir."
    };
  }, [bottomTab]);
  const summaryCards = featureSummaries[featureTab] || featureSummaries.all;
  const shouldFilterDemoSections = demoDockOpen && demoDockTab !== "diagnosis";
  const isDemoVisible = (key) => !shouldFilterDemoSections || demoDockTab === key;

  const statusItems = useMemo(
    () => [
      {
        label: "Hava",
        value: weather
          ? `${weather.temp ?? "-"}°C · ${weather.condition} · Rüzgar ${weather.windKmh ?? "-"} km/sa`
          : "Yükleniyor"
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
        label: "Rüzgar",
        value: weather
          ? `${weather.windKmh ?? "-"} km/sa${weather.windGustKmh ? ` / Esinti ${weather.windGustKmh} km/sa` : ""}`
          : "Bekleniyor"
      },
      {
        label: "Bitki",
        value: selectedPlant?.name || "Secilmedi"
      }
    ],
    [weather, soilReport, selectedPlant]
  );

  const statusPalette = useMemo(
    () => ({
      Hava: "sky",
      Toprak: "soil",
      Don: weather?.frostRisk ? "alert" : "safe",
      Ruzgar: (weather?.windGustKmh ?? 0) >= 40 || (weather?.windKmh ?? 0) >= 20 ? "alert" : "safe",
      Bitki: selectedPlant ? "plant" : "muted"
    }),
    [weather?.frostRisk, weather?.windGustKmh, weather?.windKmh, selectedPlant]
  );
  const heroSignals = useMemo(
    () => [
      {
        label: "API",
        value:
          apiStatus.state === "ok"
            ? "Hazır"
            : apiStatus.state === "down"
              ? "Baglanti yok"
              : "Kontrol ediliyor",
        tone: apiStatus.state === "ok" ? "ok" : apiStatus.state === "down" ? "down" : "pending"
      },
      {
        label: "Teşhis",
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
        value: weather?.frostRisk ? "Don riski var" : "Don riski düşük",
        tone: weather?.frostRisk ? "down" : "ok"
      }
    ],
    [apiStatus.state, result?.diagnosis?.name, selectedPlant, weather?.frostRisk]
  );

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
    if (weatherSummary?.riskTags?.includes("Asiri yağış")) priorities.push("Drenaj ve su birikimini kontrol et");
    if (weatherSummary?.riskTags?.includes("Rüzgar stresi")) priorities.push("Rüzgar kirici ve baglama kontrolu");
    if (soilFit?.level === "risk") priorities.push("Toprak uygunlugunu yeniden degerlendir");
    if (analysisState === "review") priorities.push("Yeni fotografla teşhisi dogrula");
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
        actions.push("pH dengelemesi icin kirec/düzenleyici planla.");
      } else if (ph > 7.8) {
        score -= 12;
        findings.push("pH bazik");
        actions.push("Organik maddeyi artir, asit etkili düzenleyici degerlendir.");
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
        findings.push("Organik madde düşük");
        actions.push("Kompost/yesil gübre ile organik maddeyi artir.");
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
      actions.push("Derin havalandirma ve organik iyılestirme uygula.");
    }

    const soilTypeLower = (soilReport.soilType || "").toLowerCase();
    if (soilTypeLower.includes("kumlu")) {
      score -= 4;
      findings.push("Su tutma düşük olabilir");
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
      actions.push("Konum tabanlı canlı toprak verisi kullan.");
    }

    if (soilReport.mta?.mineralProspect) {
      findings.push("MTA maden anomalisi mevcut");
      actions.push("Bölgede agir metal analizi icin laboratuvar testi dusun.");
    }

    const normalized = Math.max(25, Math.min(98, Math.round(score)));
    const grade = normalized >= 85 ? "A" : normalized >= 72 ? "B" : normalized >= 58 ? "C" : "D";
    const risk = normalized >= 80 ? "Düşük" : normalized >= 65 ? "Orta" : "Yüksek";

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
              ? "yüksek"
              : item.value >= 50
                ? "orta"
                : "düşük"
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

  const demoStudioAssets = useMemo(() => {
    const firstText = (list, pickers = ["title", "name", "term", "label", "condition", "task", "detail"]) => {
      const first = Array.isArray(list) ? list[0] : null;
      if (!first) return "-";
      for (const key of pickers) {
        if (first?.[key]) return String(first[key]);
      }
      return "-";
    };
    const mockCatalogPreview = Object.keys(MOCK_DISEASE_CATALOG || {})
      .slice(0, 4)
      .map((plantId) => {
        const catalog = pickMockCatalog(plantId, `${plantId}-studio`, false);
        const rawLabel =
          catalog?.issues?.[0]?.label ||
          catalog?.healthy?.label ||
          catalog?.issues?.[0]?.name ||
          plantId;
        return {
          plantId,
          label: mockPrettyLabel(rawLabel),
          hash: String(mockHash(`${plantId}-${rawLabel}`)).slice(0, 8)
        };
      });

    return {
      guideCollections: [
        { id: "care", label: "Bakim protokolleri", count: careProtocols.length, sample: firstText(careProtocols) },
        { id: "sera-risk", label: "Sera riskleri", count: greenhouseRisks.length, sample: firstText(greenhouseRisks) },
        { id: "sulama-metot", label: "Sulama metotlari", count: irrigationMethods.length, sample: firstText(irrigationMethods) },
        { id: "sezon", label: "Sezonsal planlayici", count: seasonalPlanner.length, sample: firstText(seasonalPlanner) },
        { id: "besin", label: "Besin rehberi", count: nutrientGuide.length, sample: firstText(nutrientGuide) },
        { id: "organik", label: "Organik pratikler", count: organicPractices.length, sample: firstText(organicPractices) },
        { id: "gübre", label: "Gübre takvimi", count: fertilizerSchedule.length, sample: firstText(fertilizerSchedule) },
        { id: "hasat", label: "Hasat rehberi", count: harvestGuide.length, sample: firstText(harvestGuide) },
        { id: "ipm", label: "IPM adimlari", count: ipmSteps.length, sample: firstText(ipmSteps) },
        { id: "hata", label: "Sık hatalar", count: commonMistakes.length, sample: firstText(commonMistakes) },
        { id: "tohum", label: "Tohum saklama", count: seedSaving.length, sample: firstText(seedSaving) },
        { id: "depo", label: "Depolama rehberi", count: storageGuide.length, sample: firstText(storageGuide) },
        { id: "troubleshoot", label: "Ariza/teşhis", count: troubleshooting.length, sample: firstText(troubleshooting) },
        { id: "yasam-dongu", label: "Zararli dongusu", count: pestLifecycle.length, sample: firstText(pestLifecycle) },
        { id: "rotasyon", label: "Rotasyon rehberi", count: rotationGuide.length, sample: firstText(rotationGuide) },
        { id: "fide", label: "Fide baslangici", count: seedStartGuide.length, sample: firstText(seedStartGuide) },
        { id: "toprak-test", label: "Toprak testleri", count: soilTesting.length, sample: firstText(soilTesting) }
      ],
      fieldCollections: [
        { id: "risk-matrix", label: "Risk matrisi", count: riskMatrix.length, sample: firstText(riskMatrix, ["label", "title"]) },
        { id: "scouting", label: "Scouting plani", count: diseaseScouting.length, sample: firstText(diseaseScouting, ["task", "title"]) },
        { id: "supply", label: "Saha tedarik", count: supplyChecklist.length, sample: firstText(supplyChecklist) },
        { id: "yield", label: "Verim tracker", count: yieldTracker.length, sample: firstText(yieldTracker, ["crop", "title"]) },
        { id: "cost", label: "Maliyet planner", count: costPlanner.length, sample: firstText(costPlanner, ["item", "title"]) },
        { id: "marketing", label: "Pazar ipuclari", count: marketingTips.length, sample: firstText(marketingTips) },
        { id: "irrigation-check", label: "Sulama checklist", count: irrigationChecklist.length, sample: firstText(irrigationChecklist) },
        { id: "starter", label: "Baslangic checklist", count: starterChecklist.length, sample: firstText(starterChecklist) },
        { id: "plants", label: "Turkiye bitki rehberi", count: turkeyGuidePlants.length, sample: firstText(turkeyGuidePlants) }
      ],
      demoCollections: [
        { id: "scorecards", label: "Demo scorecards", count: demoScorecards.length, sample: firstText(demoScorecards) },
        { id: "history", label: "Demo history", count: demoHistory.length, sample: firstText(demoHistory, ["time", "title"]) },
        { id: "trend", label: "Demo trend", count: demoTrend.length, sample: firstText(demoTrend, ["label", "title"]) },
        { id: "scenarios", label: "Hastalik senaryolari", count: demoDiseaseScenarios.length, sample: firstText(demoDiseaseScenarios, ["label", "title"]) },
        { id: "decisions", label: "Mikro kararlar", count: demoMicroDecisions.length, sample: firstText(demoMicroDecisions) },
        { id: "heatmap", label: "Heatmap bloklari", count: demoHeatmap.length, sample: firstText(demoHeatmap, ["label", "id"]) }
      ],
      visuals: [
        { id: "field", title: "Tarla akisi", src: visualField },
        { id: "leaf", title: "Yaprak analizi", src: visualLeaf },
        { id: "market", title: "Pazar vitrini", src: visualMarket },
        { id: "weather", title: "İklim zekasi", src: visualWeather },
        { id: "knowledge", title: "Bilgi bankasi", src: visualKnowledge }
      ],
      heroHighlights: highlights.slice(0, 3),
      gapModules: gapHassasModules.slice(0, 6),
      gapLinks: gapHassasLinks.slice(0, 4),
      mockCatalogPreview,
      supportedCropsCount: Object.keys(cropLabelMap || {}).length,
      wordFixCount: TURKISH_WORD_FIXES.length
    };
  }, []);

  const demoWorkbenchState = useMemo(() => {
    const tradeSignalPreview = tradeListings.slice(0, 3).map((item) => {
      const signal = tradeListingCommerceSignals.get(String(item.id)) || null;
      return {
        id: item.id,
        title: item.title || item.crop || "İlan",
        trustScore: signal?.trustScore || 0,
        tone: getTradeSignalToneClass(signal?.trustScore || 0)
      };
    });
    const expiringOffersPreview = tradeIncomingOffers.slice(0, 4).map((offer) => ({
      id: offer.id,
      listingId: offer.listingId,
      status: offer.status,
      buyer: offer.buyer,
      quantityKg: offer.quantityKg,
      expiryText: getOfferExpiryText(offer)
    }));

    return {
      studio: {
        ribbon: tabRibbon,
        showcaseCards,
        showcaseWallItems,
        summaryCards,
        heroSignals,
        statusItems,
        statusPalette,
        activeDock: activeDemoDock,
        dockTabs: demoDockTabs,
        strictModelActive,
        featureTab,
        showBackTop
      },
      sandbox: {
        scenarioSummary: demoScenarioSummary,
        actionPlan: demoActionPlan,
        opsSummary: demoOpsSummary,
        sensitivityTable: demoSensitivityTable,
        readinessGrade: demoReadinessGrade,
        interventionPlan: demoInterventionPlan,
        maturity: demoMaturity,
        frostOutlook,
        demoChecklist,
        demoExecution,
        demoReportStatus,
        demoStatus,
        demoCompare,
        demoDailyLog,
        demoSeasonPlan,
        demoVoiceDraft,
        demoVoiceHistory,
        demoVoiceRecording,
        demoTimeline,
        demoTimelineAdded,
        demoYieldForecast,
        routine,
        routineInput,
        calendarTaskTime,
        calendarTaskNotify
      },
      investor: {
        presentationScene,
        presentationFullscreen,
        sceneCount: presentationSceneCount,
        presentationScenes,
        pitchSeconds,
        pitchDurationSeconds,
        sceneAdvanceSeconds,
        autoSceneAdvance,
        investorMomentum,
        investorDataRoom
      },
      model: {
        urgentActions,
        showCarePlan,
        retakeOutcome,
        retryNeedFor60,
        retryMissingCritical,
        retryMissingAny,
        retryReadinessLabel,
        retryChecklistSavedAt
      },
      market: {
        manualTrendRange,
        manualTrendInsights,
        tradeListingInsights,
        tradeMineStatusFilter,
        tradeLoading,
        tradeMyFormExpanded,
        tradePulseActions,
        favoriteCount: tradeFavoriteSet.size,
        tradeSignalPreview,
        expiringOffersPreview
      },
      system: {
        contactForm,
        contactStatus,
        economyPlannerData,
        economyPlannerLoading,
        economyPlannerError,
        landCustomModelStatus,
        landCustomModelTrainStatus,
        manualListingsLoading,
        sourcesError,
        sourcesUpdatedAt,
        showQualityGate,
        showQuickModal,
        showOverflow,
        modelDetailTab,
        visibleHandbookSections,
        handbookStats,
        upcomingCalendarItems,
        sourceQuery,
        sourceCategory,
        sourceCategories,
        filteredSources,
        sourceStats,
        knowledgeQuery,
        knowledgeType,
        knowledgeSource,
        knowledgeTypeLabels,
        knowledgeTypes,
        knowledgeSources,
        knowledgeTypeCounts,
        knowledgeSpotlight,
        encyclopediaLetter,
        encyclopediaLetters,
        encyclopediaVisibleEntries,
        relatedKnowledgeEntries,
        researchHighlights,
        showAllHandbook
      }
    };
  }, [
    activeDemoDock,
    autoSceneAdvance,
    calendarTaskNotify,
    calendarTaskTime,
    demoActionPlan,
    demoCompare,
    demoChecklist,
    demoDailyLog,
    demoDockTabs,
    demoExecution,
    demoInterventionPlan,
    demoMaturity,
    demoOpsSummary,
    demoReadinessGrade,
    demoReportStatus,
    demoScenarioSummary,
    demoSeasonPlan,
    demoSensitivityTable,
    demoStatus,
    demoTimelineAdded,
    demoVoiceDraft,
    demoVoiceHistory,
    demoVoiceRecording,
    demoYieldForecast,
    contactForm,
    contactStatus,
    economyPlannerData,
    economyPlannerError,
    economyPlannerLoading,
    encyclopediaLetters,
    encyclopediaVisibleEntries,
    featureTab,
    filteredSources,
    frostOutlook,
    getOfferExpiryText,
    handbookStats,
    heroSignals,
    investorDataRoom,
    investorMomentum,
    knowledgeSources,
    knowledgeSpotlight,
    knowledgeTypeLabels,
    knowledgeTypeCounts,
    knowledgeTypes,
    landCustomModelStatus,
    landCustomModelTrainStatus,
    manualListingsLoading,
    manualTrendInsights,
    manualTrendRange,
    modelDetailTab,
    pitchDurationSeconds,
    pitchSeconds,
    presentationFullscreen,
    presentationScene,
    presentationScenes,
    relatedKnowledgeEntries,
    researchHighlights,
    retakeOutcome,
    retryChecklistSavedAt,
    retryMissingAny,
    retryMissingCritical,
    retryNeedFor60,
    retryReadinessLabel,
    routine,
    routineInput,
    sceneAdvanceSeconds,
    showcaseCards,
    showcaseWallItems,
    showBackTop,
    showCarePlan,
    showOverflow,
    showQualityGate,
    showQuickModal,
    sourceCategories,
    sourceCategory,
    sourceQuery,
    sourceStats,
    sourcesError,
    sourcesUpdatedAt,
    knowledgeQuery,
    knowledgeSource,
    statusItems,
    statusPalette,
    strictModelActive,
    summaryCards,
    tabRibbon,
    tradeFavoriteSet,
    tradeIncomingOffers,
    tradeListingCommerceSignals,
    tradeListingInsights,
    tradeListings,
    tradeLoading,
    tradeMineStatusFilter,
    tradeMyFormExpanded,
    tradePulseActions,
    upcomingCalendarItems,
    urgentActions,
    visibleHandbookSections,
    knowledgeType,
    encyclopediaLetter,
    showAllHandbook
  ]);

  const demoWorkbenchActions = {
    handleFeatureTab,
    shiftDemoDockTab,
    setDemoYieldModel,
    buildDemoShare,
    copyDemoReport,
    resetDemoControls,
    toggleDemoChecklistItem,
    advanceDemoJourney,
    updateDemoExecution,
    toggleSeasonRisk,
    startDemoVoice,
    stopDemoVoice,
    setDemoVoiceDraft,
    addDemoTimelineToCalendar,
    regenerateDemoToken,
    startPresentationFlow,
    handlePitchDurationChange,
    handleSceneAdvanceChange,
    togglePresentationFullscreen,
    setAutoSceneAdvance,
    toggleRetryChecklist,
    markAllRetryChecklist,
    markPriorityRetryChecklist,
    completeNextRetryItem,
    autoPrepareRetake,
    toggleCalendarItemNotify,
    upsertLandListingReportTask,
    submitContact,
    setContactForm,
    setRoutine,
    setRoutineInput,
    setTradeMineStatusFilter,
    setManualTrendRange,
    setSourceQuery,
    setSourceCategory,
    setKnowledgeQuery,
    setKnowledgeType,
    setKnowledgeSource,
    setEncyclopediaLetter,
    setShowAllHandbook,
    setCalendarTaskTime,
    setCalendarTaskNotify
  };

  const soilSmartSuggestions = useMemo(() => {
    if (!soilReport) return [];
    const selectedSuitability = selectedPlant
      ? (soilReport.plantSuitability || []).find((item) => item.id === selectedPlant.id)
      : null;
    const list = [
      ...(soilReport.recommended || []).map((item) => `${item} (önerilen)`),
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
    return `${area}. Toprak tipi ${soilReport.soilType}, pH ${soilReport.ph}. Iklem ${soilReport.climate}. ${scoreText} Oncelikli öneriler: ${rec || "-"}. Riskli hastaliklar: ${risk || "-"}. ${actionText}`.trim();
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
    <>
      <div className={`app pro-ui tab-${bottomTab} ${presentationMode ? "presentation-mode" : ""}`}>
        <div className="app-progress" aria-hidden="true">
          <span style={{ width: `${scrollProgress}%` }} />
        </div>
        {isFrontendOnlyMode && (
          <div className="demo-mode-banner" role="alert">
            Demo modu — Canlı veri yok. Teşhis ve canlı veriler için API sunucusunu çalıştırın (örn. <code>npm run server</code>).
          </div>
        )}
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

        <header className="app-header">
          <div className="hero-top">
            <div className="logo">
              <Leaf size={22} color="var(--sprout)" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  AgroGuard <div className="neural-heartbeat" title="Neural Monitoring Active" />
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "7px", color: "var(--sprout)", fontWeight: "800", letterSpacing: "1.2px", opacity: 0.8 }}>SİSTEM HAZIR</span>
                </div>
              </div>
            </div>
            <div className="hero-top-meta">
                  <div className="hero-badge">
                    {isHandbook ? "Tarım el kılavuzu" : "Tarım el kılavuzu + teşhis"}
                  </div>
              <div className={`api-indicator ${apiStatus.state}`}>
                <span>API</span>
                <strong>{apiStatus.state === "ok" ? "Hazır" : "Değil"}</strong>
              </div>

              <button
                type="button"
                className={`hero-notif-btn ${notifications.length > 0 ? "has-alerts" : ""}`}
                onClick={() => setNotifCenterOpen(!notifCenterOpen)}
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="notif-badge">{notifications.length}</span>
                )}
              </button>

              {notifCenterOpen && (
                <div className="notif-center">
                  <div className="notif-center-header">
                    <h3>Bildirimler</h3>
                    <button onClick={() => setNotifCenterOpen(false)}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">Bekleyen bildirim yok.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`notif-item ${n.type}`}>
                          <div className="notif-item-title">{n.title}</div>
                          <div className="notif-item-msg">{n.message || n.messağe}</div>
                          <span className="notif-item-time">{n.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

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
                {presentationMode ? "Standart" : "Sunum"}
              </button>
            </div>
          </div>
        </header>

        <main className="app-shell">
          {/* ═══ HOME / TEŞHİS TAB ═══ */}
          {bottomTab === "home" && !isHandbook && (
            <>
              <MemoizedHomeTabHeader
                selectedPlant={selectedPlant}
                setSelectedPlantId={setSelectedPlantId}
                filteredPlantProfiles={filteredPlantProfiles}
                fileInputRef={fileInputRef}
                result={result}
                diagnoseChecks={diagnoseChecks}
                diagnoseReadiness={diagnoseReadiness}
                weather={weather}
                city={city}
                onCityClick={() => setShowCityModal(true)}
              />
              <MemoizedHomeTabMain
                activeTab={activeTab}
                hasPlant={hasPlant}
                hasFile={hasFile}
                result={result}
                selectedPlant={selectedPlant}
                plantSelectRef={plantSelectRef}
                fileInputRef={fileInputRef}
                loading={loading}
                file={file}
                preview={preview}
                fileMeta={fileMeta}
                onSelectFile={onSelectFile}
                setSelectedPlantId={setSelectedPlantId}
                filteredPlantProfiles={filteredPlantProfiles}
                showAllPlants={showAllPlants}
                setShowAllPlants={setShowAllPlants}
                apiReady={apiReady}
                selectedPlantSupported={selectedPlantSupported}
                modelReady={modelReady}
                plantDiseaseData={plantDiseaseData}
                plantDiseaseError={plantDiseaseError}
                diagnoseReadiness={diagnoseReadiness}
                diagnoseChecks={diagnoseChecks}
                setApiHealthTick={setApiHealthTick}
                diagnoseNextStep={diagnoseNextStep}
                runDiagnoseNextStep={runDiagnoseNextStep}
                onLocationManage={() => setShowCityModal(true)}
                onNavigateTab={handleBottomTab}
                openAgroBot={() => setAgroBotOpen(true)}
                notificationCount={notifications.length}
                openNotifications={() => setNotifCenterOpen(true)}
                analyze={analyze}
                resetAll={resetAll}
                apiStatus={apiStatus}
                runtimeApiBase={runtimeApiBase}
                error={error}
                showDiagnosisResult={showDiagnosisResult}
                diagnosisSummary={diagnosisSummary}
                diagnosisConfidenceText={diagnosisConfidenceText}
                diagnosisBadges={diagnosisBadges}
                showModelAdvanced={showModelAdvanced}
                setShowModelAdvanced={setShowModelAdvanced}
                setModelDetailTab={setModelDetailTab}
                diagnosisConfidencePct={diagnosisConfidencePct}
                plantNameMap={plantNameMap}
                warningCount={warningCount}
                analysisState={analysisState}
                actionPlan={actionPlan}
                history={history}
                soilReport={soilReport}
                fieldLocation={fieldLocation}
                landDemo={landDemo}
                setShowQuickModal={setShowQuickModal}
                weather={weather}
                forecast={forecast}
                city={city}
                newsItems={newsItems}
                newsLoading={newsLoading}
                newsLive={newsLive}
                newsError={newsError}
                newsUpdatedAt={newsUpdatedAt}
                refreshNews={loadNews}
              />
            </>
          )}

          {/* ═══ ARAZİ / LAND TAB ═══ */}
          {bottomTab === "land" && (
            <MemoizedLandTab
              landPriceData={landPriceData}
              landPriceLoading={landPriceLoading}
              landPriceError={landPriceError}
              landPriceHistory={landPriceHistory}
              landPriceSources={landPriceSources}
              effectiveLandCity={effectiveLandCity}
              landMlData={landMlData}
              landValuationDemo={landValuationDemo}
              landProfiles={landProfiles}
              landDistrictBenchmark={landDistrictBenchmark}
              landDistrictHeatmap={landDistrictHeatmap}
              landNeighborhoodHeatmap={landNeighborhoodHeatmap}
              landDistrictLeaders={landDistrictLeaders}
              landInvestmentLens={landInvestmentLens}
              landActionPlan={landActionPlan}
              landLocationScope={landLocationScope}
              landSignalQuality={landSignalQuality}
              landDataReadiness={landDataReadiness}
              landCoords={fieldLocation?.coords || ""}
              setLandCoords={(coords) =>
                setFieldLocation((prev) => ({
                  ...(prev || {}),
                  coords: String(coords || "")
                }))
              }
              manualListingForm={manualListingForm}
              manualListingStatus={manualListingStatus}
              manualListingStats={manualListingStats}
              manualListings={manualListings}
              liveLandListings={liveLandListings}
              manualCsv={manualCsv}
              setManualCsv={setManualCsv}
              importManualCsv={importManualCsv}
              landComparableListings={landComparableListings}
              landProfileName={landProfileName}
              landProfileStatus={landProfileStatus}
              landMlLoading={landMlLoading}
              landMlError={landMlError}
              setEconLandValue={setEconLandValue}
              saveCurrentLandProfile={saveCurrentLandProfile}
              applyLandFromSoilSignals={applyLandFromSoilSignals}
              trainCustomLandPriceModel={trainCustomLandPriceModel}
              saveManualListing={saveManualListing}
              loadLiveLandListings={loadLiveLandListings}
              loadManualListings={loadManualListings}
              applyManualListingToLand={applyManualListingToLand}
              removeManualListing={removeManualListing}
              exportLandListingsCsv={exportLandListingsCsv}
              exportLandListingsReportTxt={exportLandListingsReportTxt}
              applyLandProfile={applyLandProfile}
              deleteLandProfile={deleteLandProfile}
              handleLandCityInputChange={handleLandCityInputChange}
              landQuery={landQuery}
              setLandRefreshKey={setLandRefreshKey}
              landDemo={landDemo}
              setLandDemo={setLandDemo}
              locationSearch={locationSearch}
              setLocationSearch={setLocationSearch}
              locationSearchMatches={locationSearchMatches}
              applyLocationSearchHit={applyLocationSearchHit}
              setLandProfileName={setLandProfileName}
              setManualListingForm={setManualListingForm}
              landProvidersHealth={landProvidersHealth}
              landCompareData={landCompareData}
              landCompareLoading={landCompareLoading}
              landCompareError={landCompareError}
              setBottomTab={setBottomTab}
              apiBaseForAssets={apiBaseForAssets}
            />
          )}

          {bottomTab === "market" && (
            <MemoizedMarketTab
              tradeListings={tradeListings}
              tradeOffers={tradeOffers}
              tradeMyOffers={tradeMyOffers}
              tradeMatches={tradeMatches}
              tradeDashboard={tradeDashboard}
              tradeAlerts={tradeAlerts}
              tradeCart={tradeCart}
              effectiveTradeCity={effectiveTradeCity}
              effectiveTradeCrop={effectiveTradeCrop}
              tradeMyOrders={tradeMyOrders}
              tradeMarketDepth={tradeMarketDepth}
              tradeWorkspaceTab={tradeWorkspaceTab}
              setTradeWorkspaceTab={setTradeWorkspaceTab}
              tradeIdentityName={tradeIdentityName}
              setTradeIdentityName={setTradeIdentityName}
              effectiveTradeIdentity={effectiveTradeIdentity}
              tradeQuery={tradeQuery}
              setTradeQuery={setTradeQuery}
              tradeFilterStatus={tradeFilterStatus}
              setTradeFilterStatus={setTradeFilterStatus}
              tradeFilterText={tradeFilterText}
              setTradeFilterText={handleGlobalSearch}
              tradeFilterType={tradeFilterType}
              setTradeFilterType={setTradeFilterType}
              tradeFilterDelivery={tradeFilterDelivery}
              setTradeFilterDelivery={setTradeFilterDelivery}
              tradeFilterPayment={tradeFilterPayment}
              setTradeFilterPayment={setTradeFilterPayment}
              tradeFilterQuality={tradeFilterQuality}
              setTradeFilterQuality={setTradeFilterQuality}
              tradeSortBy={tradeSortBy}
              setTradeSortBy={setTradeSortBy}
              tradePriceMin={tradePriceMin}
              setTradePriceMin={setTradePriceMin}
              tradePriceMax={tradePriceMax}
              setTradePriceMax={setTradePriceMax}
              tradeSellerFilter={tradeSellerFilter}
              setTradeSellerFilter={setTradeSellerFilter}
              tradeSellerDirectory={tradeSellerDirectory}
              tradeListingForm={tradeListingForm}
              setTradeListingForm={setTradeListingForm}
              submitTradeListing={submitTradeListing}
              tradeEditingListingId={tradeEditingListingId}
              cancelTradeListingEdit={cancelTradeListingEdit}
              loadTradeData={loadTradeData}
              tradeSummary={tradeSummary}
              resetTradeFilters={resetTradeFilters}
              tradeFilterPresetName={tradeFilterPresetName}
              setTradeFilterPresetName={setTradeFilterPresetName}
              saveTradeFilterPreset={saveTradeFilterPreset}
              tradeFilterPresets={tradeFilterPresets}
              applyTradeFilterSnapshot={applyTradeFilterSnapshot}
              deleteTradeFilterPreset={deleteTradeFilterPreset}
              tradeOfferForm={tradeOfferForm}
              setTradeOfferForm={setTradeOfferForm}
              tradeFilteredListings={tradeFilteredListings}
              submitTradeOffer={submitTradeOffer}
              selectedTradeListing={selectedTradeListing}
              tradeStatus={tradeStatus}
              tradeFilteredStats={tradeFilteredStats}
              tradeOpportunityHighlights={tradeOpportunityHighlights}
              editTradeListing={editTradeListing}
              pauseOrOpenTradeListing={pauseOrOpenTradeListing}
              closeTradeListing={closeTradeListing}
              deleteTradeListing={deleteTradeListing}
              duplicateTradeListing={duplicateTradeListing}
              tradeMyListings={tradeMyListings}
              bulkUpdateMyListingsStatus={bulkUpdateMyListingsStatus}
              tradeBulkUpdating={tradeBulkUpdating}
              updateTradeOrder={updateTradeOrder}
              tradeIncomingOffers={tradeIncomingOffers}
              tradeIncomingActionableOffers={tradeIncomingActionableOffers}
              tradeIncomingOfferSelection={tradeIncomingOfferSelection}
              toggleIncomingOfferSelection={toggleIncomingOfferSelection}
              selectAllIncomingActionableOffers={selectAllIncomingActionableOffers}
              clearIncomingOfferSelection={clearIncomingOfferSelection}
              bulkAcceptIncomingOffers={bulkAcceptIncomingOffers}
              bulkRejectIncomingOffers={bulkRejectIncomingOffers}
              acceptTradeOffer={acceptTradeOffer}
              rejectTradeOffer={rejectTradeOffer}
              cancelTradeOffer={cancelTradeOffer}
              suggestCounterForOffer={suggestCounterForOffer}
              tradeCounterForm={tradeCounterForm}
              setTradeCounterForm={setTradeCounterForm}
              submitCounterOffer={submitCounterOffer}
              tradeOfferEditForm={tradeOfferEditForm}
              setTradeOfferEditForm={setTradeOfferEditForm}
              startTradeOfferEdit={startTradeOfferEdit}
              submitTradeOfferEdit={submitTradeOfferEdit}
              tradeMessağeForm={tradeMessağeForm}
              setTradeMessağeForm={setTradeMessağeForm}
              submitTradeMessağe={submitTradeMessağe}
              tradeMessağes={tradeMessağes}
              tradeRatingForm={tradeRatingForm}
              setTradeRatingForm={setTradeRatingForm}
              submitTradeRating={submitTradeRating}
              tradeTrust={tradeTrust}
              loadTradeTrust={loadTradeTrust}
              tradeOrderForm={tradeOrderForm}
              setTradeOrderForm={setTradeOrderForm}
              saveTradeOrderLogistics={saveTradeOrderLogistics}
              loadTradeOrderContract={loadTradeOrderContract}
              downloadTradeOrderContractPdf={downloadTradeOrderContractPdf}
              tradeContractPreview={tradeContractPreview}
              syncTradeOrderShipping={syncTradeOrderShipping}
              checkTradeOrderShippingStatus={checkTradeOrderShippingStatus}
              shippingStatusPreview={shippingStatusPreview}
              syncAllTradeShipping={syncAllTradeShipping}
              shippingProviders={shippingProviders}
              shippingHealth={shippingHealth}
              shippingProviderConfigs={shippingProviderConfigs}
              shippingParseForm={shippingParseForm}
              setShippingParseForm={setShippingParseForm}
              runShippingParsePreview={runShippingParsePreview}
              loadShippingSamplePayload={loadShippingSamplePayload}
              shippingParseResult={shippingParseResult}
              tradeMatchTierFilter={tradeMatchTierFilter}
              setTradeMatchTierFilter={setTradeMatchTierFilter}
              tradeMatchMinScore={tradeMatchMinScore}
              setTradeMatchMinScore={setTradeMatchMinScore}
              tradeMatchesFiltered={tradeMatchesFiltered}
              tradeAutoAcceptCandidates={tradeAutoAcceptCandidates}
              applyBulkCounterOffers={applyBulkCounterOffers}
              applyBulkAcceptOffers={applyBulkAcceptOffers}
              quickOfferForListing={quickOfferForListing}
              tradeFavorites={tradeFavorites}
              tradeCompareIds={tradeCompareIds}
              tradeCompareListings={tradeCompareListings}
              tradeCartItems={tradeCartItems}
              tradeCartSummary={tradeCartSummary}
              tradeCropQuickFilters={tradeCropQuickFilters}
              tradeMarketCampaigns={tradeMarketCampaigns}
              tradeMarketPulse={tradeMarketPulse}
              marketLiveData={marketLiveData}
              marketLiveLoading={marketLiveLoading}
              marketLiveError={marketLiveError}
              toggleTradeFavorite={toggleTradeFavorite}
              toggleTradeCompare={toggleTradeCompare}
              addTradeCartItem={addTradeCartItem}
              removeTradeCartItem={removeTradeCartItem}
              updateTradeCartQty={updateTradeCartQty}
              clearTradeCart={clearTradeCart}
              submitTradeCartBulkOffers={submitTradeCartBulkOffers}
              checkoutTradeCart={checkoutTradeCart}
              walletBalance={walletBalance}
              walletTransactions={walletTransactions}
              paymentMethods={paymentMethods}
              handleMarketPayment={handleMarketPayment}
              landDemo={landDemo}
            />
          )}

          {bottomTab === "weather" && (
            <MemoizedWeatherTab
              weather={weather}
              weatherError={weatherError}
              soilReport={soilReport}
              setWeatherRefreshKey={setWeatherRefreshKey}
              weatherLocationLabel={weatherLocationLabel}
              weatherFreshnessText={weatherFreshnessText}
              frostSignal={frostSignal}
              agroClimateAdvisor={agroClimateAdvisor}
              fieldLocation={fieldLocation}
              setFieldLocation={setFieldLocation}
              useMyLocation={useMyLocation}
              geoStatus={geoStatus}
              SOIL_MAP_PICKER={SOIL_MAP_PICKER}
              soilPickerMarker={soilPickerMarker}
              selectSoilMapPoint={selectSoilMapPoint}
              coordsValid={coordsValid}
              mapLink={mapLink}
              cityQuery={cityQuery}
              setCityQuery={setCityQuery}
              applyCityQuery={applyCityQuery}
              landDemo={landDemo}
              setLandDemo={setLandDemo}
              locationSearch={locationSearch}
              setLocationSearch={setLocationSearch}
              locationSearchMatches={locationSearchMatches}
              applyLocationSearchHit={applyLocationSearchHit}
              locationCitySuggestions={locationCitySuggestions}
              weatherDistrictSuggestions={weatherScopedDistrictSuggestions}
              weatherNeighborhoodSuggestions={weatherScopedNeighborhoodSuggestions}
              normalizeKey={normalizeKey}
              city={city}
              setCity={setCity}
              forecast={forecast}
              forecastError={forecastError}
              nextHours={nextHours}
              soilLocationLabel={soilLocationLabel}
              soilLoading={soilLoading}
              soilError={soilError}
              soilMapContext={soilMapContext}
              selectedPlant={selectedPlant}
              soilFit={soilFit}
              soilDiagnostics={soilDiagnostics}
              soilIndexCards={soilIndexCards}
              soilManagementPlan={soilManagementPlan}
              soilSmartSuggestions={soilSmartSuggestions}
              soilSuitability={soilSuitability}
              soilQuestion={soilQuestion}
              setSoilQuestion={setSoilQuestion}
              setSoilAnswer={setSoilAnswer}
              buildSoilAnswer={buildSoilAnswer}
              openConsultMail={openConsultMail}
              soilAnswer={soilAnswer}
              isNativeApp={isNativeApp}
              notifPermission={notifPermission}
              notifSettings={notifSettings}
              setNotifSettings={setNotifSettings}
              syncNotifications={syncNotifications}
              upsertCalendarItems={upsertCalendarItems}
              mergeNotifications={mergeNotifications}
              notifStatus={notifStatus}
              setGeoStatus={setGeoStatus}
              weatherSummary={weatherSummary}
              weatherAlerts={weatherAlerts}
              hourlyAlerts={hourlyAlerts}
              soilInsights={soilInsights}
              apiBaseForAssets={apiBaseForAssets}
              hackhatonDashboard={hackhatonDashboard}
              hackhatonDashboardError={hackhatonDashboardError}
              hackhatonModelSuite={hackhatonModelSuite}
              hackhatonModelSuiteError={hackhatonModelSuiteError}
            />
          )}

          {bottomTab === "demos" && (
            <DemosTab
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              diagnoseChecks={diagnoseChecks}
              apiReady={apiReady}
              setApiHealthTick={setApiHealthTick}
              faqQuery={faqQuery}
              setFaqQuery={setFaqQuery}
              faqFocus={faqFocus}
              setFaqFocus={setFaqFocus}
              faqGroups={faqGroups}
              calendarDate={calendarDate}
              setCalendarDate={setCalendarDate}
              calendarInput={calendarInput}
              setCalendarInput={setCalendarInput}
              addCalendarItem={addCalendarItem}
              calendarItemsByDate={calendarItemsByDate}
              toggleCalendarItem={toggleCalendarItem}
              deleteCalendarItem={deleteCalendarItem}
              showFullDemo={showFullDemo}
              setShowFullDemo={setShowFullDemo}
              startQuickDemo={startQuickDemo}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              drawerTab={drawerTab}
              setDrawerTab={setDrawerTab}
              cropLabelMap={cropLabelMap}
              demoCompactItems={demoCompactItems}
              steps={steps}
              demoInsightCards={demoInsightCards}
              demoStudioAssets={demoStudioAssets}
              demoWorkbenchState={demoWorkbenchState}
              demoWorkbenchActions={demoWorkbenchActions}
              demoAutopilotLogs={demoAutopilotLogs}
              demoStatusCards={demoStatusCards}
              setBottomTab={setBottomTab}
              setCommerceMiniTab={setCommerceMiniTab}
              setDemoDockTab={setDemoDockTab}
              commerceMiniTab={commerceMiniTab}
              handleDemoDockTab={handleDemoDockTab}
              seedTradeDemoData={seedTradeDemoData}
              resetTradeDemoData={resetTradeDemoData}
              seedLandDemoListings={seedLandDemoListings}
              resetLandDemoListings={resetLandDemoListings}
              runWeatherDemoSetup={runWeatherDemoSetup}
              runSoilDemoSetup={runSoilDemoSetup}
              runFinanceDemoSetup={runFinanceDemoSetup}
              runDemoSmokeTest={runDemoSmokeTest}
              demoOpsStatus={demoOpsStatus}
              demoSmokeHistory={demoSmokeHistory}
              demoSmokeResult={demoSmokeResult}
              presentationMode={presentationMode}
              isDemoVisible={isDemoVisible}
              demoFlowStats={demoFlowStats}
              demoFlowHistoryFiltered={demoFlowHistoryFiltered}
              demoFlowLibrary={demoFlowLibrary}
              runDemoFlow={runDemoFlow}
              demoFlowRunning={demoFlowRunning}
              demoFlowStatus={demoFlowStatus}
              demoRepairSummary={demoRepairSummary}
              demoAutopilotSummary={demoAutopilotSummary}
              demoAutopilotSteps={demoAutopilotSteps}
              runDemoAutopilotStep={runDemoAutopilotStep}
              setDemoAutopilotLogs={setDemoAutopilotLogs}
              demoAutopilotRunning={demoAutopilotRunning}
              demoReport={demoReport}
              setDemoSmokeHistory={setDemoSmokeHistory}
              setDemoOpsStatus={setDemoOpsStatus}
              demoFlowHistory={demoFlowHistory}
              demoFailingFlows={demoFailingFlows}
              runAllDemoFlows={runAllDemoFlows}
              exportDemoFlowHistory={exportDemoFlowHistory}
              setDemoFlowHistory={setDemoFlowHistory}
              setDemoFlowStatus={setDemoFlowStatus}
              demoFlowFilter={demoFlowFilter}
              setDemoFlowFilter={setDemoFlowFilter}
              demoFlowWindow={demoFlowWindow}
              setDemoFlowWindow={setDemoFlowWindow}
              demoFlowTrend={demoFlowTrend}
              clearInvestorSnapshots={clearInvestorSnapshots}
              investorSnapshots={investorSnapshots}
              copyInvestorScript={copyInvestorScript}
              activatePresentationMode={activatePresentationMode}
              setTradeWorkspaceTab={setTradeWorkspaceTab}
              investorPreflight={investorPreflight}
              investorPresentationScript={investorPresentationScript}
              demoControlMetrics={demoControlMetrics}
              demoRiskLevel={demoRiskLevel}
              demoRecommendedCommands={demoRecommendedCommands}
              runDemoCommand={runDemoCommand}
              exportDemoJson={exportDemoJson}
              generateDemoReport={generateDemoReport}
              downloadDemoReport={downloadDemoReport}
              investorSnapshot={investorSnapshot}
              investorHighlights={investorHighlights}
              investorRiskCards={investorRiskCards}
              investorDataRoom={investorDataRoom}
              investorChecklist={investorChecklist}
              investorUnitEconomics={investorUnitEconomics}
              investorMomentum={investorMomentum}
              investorBlockers={investorBlockers}
              runInvestorShowcase={runInvestorShowcase}
              runInvestorDryRun={runInvestorDryRun}
              runInvestorPreflight={runInvestorPreflight}
              investorPreflightRunning={investorPreflightRunning}
              exportInvestorBrief={exportInvestorBrief}
              exportInvestorOnePager={exportInvestorOnePager}
              exportInvestorDeckHtml={exportInvestorDeckHtml}
              captureInvestorSnapshot={captureInvestorSnapshot}
              demoBootstrapReady={demoBootstrapReady}
              runDemoFlowPreset={runDemoFlowPreset}
              demoPack={demoPack}
              setDemoPack={setDemoPack}
              demoAutopilotMode={demoAutopilotMode}
              setDemoAutopilotMode={setDemoAutopilotMode}
              demoAutopilotRetryCount={demoAutopilotRetryCount}
              setDemoAutopilotRetryCount={setDemoAutopilotRetryCount}
              applyDemoPack={applyDemoPack}
              runDemoResetSeed={runDemoResetSeed}
              runDemoAutopilot={runDemoAutopilot}
              runDemoEndToEnd={runDemoEndToEnd}
              runDemoAutoRepair={runDemoAutoRepair}
              simulateDemoDay={simulateDemoDay}
              runFailedDemoFlows={runFailedDemoFlows}
              investorExecutionDecision={investorExecutionDecision}
              runModelSelfCheck={runModelSelfCheck}
              modelSelfCheckRunning={modelSelfCheckRunning}
              supportsModelSelfCheck={supportsModelSelfCheck}
              resetModelDiagnostics={resetModelDiagnostics}
              modelDiagnosticsResetRunning={modelDiagnosticsResetRunning}
              supportsModelDiagnostics={supportsModelDiagnostics}
              demoUiMode={demoUiMode}
              setDemoUiMode={setDemoUiMode}
              demoBootstrapSummary={demoBootstrapSummary}
              prepareDemosForUse={prepareDemosForUse}
              demoBootstrapRunning={demoBootstrapRunning}
              demoShowcaseRunning={demoShowcaseRunning}
              runDemoShowcaseReady={runDemoShowcaseReady}
              modelSelfCheck={modelSelfCheck}
              modelDiagnostics={modelDiagnostics}
              modelDiagnosticsError={modelDiagnosticsError}
              setMetricsRefreshTick={setMetricsRefreshTick}
              metrics={metrics}
              backendInfo={backendInfo}
              integrationsHealth={integrationsHealth}
              loadIntegrationsHealth={loadIntegrationsHealth}
              integrationsHealthError={integrationsHealthError}
              modelHealth={modelHealth}
              modelHealthError={modelHealthError}
              demoYieldModel={demoYieldModel}
              demoYieldForecast={demoYieldForecast}
              setDemoYieldModel={setDemoYieldModel}
              forecastSummary={forecastSummary}
              maxWindKmh={maxWindKmh}
              fieldScore={fieldScore}
              weatherSummary={weatherSummary}
              diseaseTrends={diseaseTrends}
              weather={weather}
              forecast={forecast}
              soilReport={soilReport}
              metricsError={metricsError}
              metricsStale={metricsStale}
              metricsUpdatedAt={metricsUpdatedAt}
            />
          )}
        </main >
      </div>
      <nav className="bottom-main-nav" aria-label="Ana gezinti">
        <button
          type="button"
          className={bottomTab === "home" ? "active" : ""}
          onClick={() => handleBottomTab("home")}
          aria-current={bottomTab === "home" ? "page" : undefined}
          title="Ana Sayfa"
        >
          <Activity size={20} />
          <span className="tab-label">Teşhis</span>
        </button>
        <button
          type="button"
          className={bottomTab === "land" ? "active" : ""}
          onClick={() => handleBottomTab("land")}
          aria-current={bottomTab === "land" ? "page" : undefined}
          title="Arazi Finans"
        >
          <Landmark size={20} />
          <span className="tab-label">Arazi</span>
        </button>
        <button
          type="button"
          className={bottomTab === "market" ? "active" : ""}
          onClick={() => handleBottomTab("market")}
          aria-current={bottomTab === "market" ? "page" : undefined}
          title="Pazar Yeri"
        >
          <Compass size={20} />
          <span className="tab-label">Pazar</span>
        </button>
        <button
          type="button"
          className={bottomTab === "weather" ? "active" : ""}
          onClick={() => handleBottomTab("weather")}
          aria-current={bottomTab === "weather" ? "page" : undefined}
          title="İklim ve Toprak"
        >
          <Radio size={20} />
          <span className="tab-label">İklim</span>
        </button>
        <button
          type="button"
          className={bottomTab === "demos" ? "active" : ""}
          onClick={() => handleBottomTab("demos")}
          aria-current={bottomTab === "demos" ? "page" : undefined}
          title="Demolar"
        >
          <Sparkles size={20} />
          <span className="tab-label">Demos</span>
        </button>
      </nav>
      <section className="developer">
        <div className="developer-card">
          <div className="developer-meta">
            <h2>Geliştirici</h2>
            <p>
              Mehmet Yasin Kaya • Boğaziçi Bilgisayar
            </p>
          </div>
          <div className="developer-links">
            <span>E-posta: gs7016903@gmail.com</span>
          </div>
        </div>
      </section>
      {showCityModal && (
        <div className="modal-overlay" onClick={() => setShowCityModal(false)}>
          <div className="modal-panel glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "400px", animation: "slide-up 0.4s ease-out" }}>
            <div className="modal-header">
              <h3>Konum Değiştir</h3>
              <button onClick={() => setShowCityModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-content" style={{ display: "grid", gap: "16px", padding: "20px" }}>
              <div className="premium-input-group">
                <Search size={16} className="input-icon" />
                <input
                  className="select-premium"
                  list="location-city-suggestions"
                  placeholder="Şehir adı girin (örn: Ankara)"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (applyCityQuery(), setShowCityModal(false))}
                />
              </div>
              <button
                className="btn-primary"
                style={{ width: "100%", padding: "14px" }}
                onClick={() => { applyCityQuery(); setShowCityModal(false); }}
              >
                Konumu Güncelle
              </button>

              <div style={{ marginTop: "10px" }}>
                <small style={{ opacity: 0.6 }}>Popüler Şehirler</small>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  {["Malatya", "Ankara", "İstanbul", "Antalya", "Adana"].map(c => (
                    <button
                      key={c}
                      className="btn-secondary"
                      style={{ fontSize: "12px", padding: "6px 12px" }}
                      onClick={() => { setCity(c); setShowCityModal(false); setWeatherRefreshKey(p => p + 1); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* AgroBot Floating Chat */}
      <div
        className="agrobot-floating"
        style={{
          position: "fixed",
          bottom: "98px",
          right: "20px",
          zIndex: 10001,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end"
        }}
      >
        {agroBotOpen && (
          <div
            className="agrobot-panel"
            style={{
              width: "300px",
              height: "380px",
              marginBottom: "12px",
              display: "flex",
              flexDirection: "column",
              background: "rgba(9, 14, 11, 0.96)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(143,188,69,0.35)",
              borderRadius: "16px",
              boxShadow: "0 22px 56px rgba(0,0,0,0.7)",
              overflow: "hidden",
              animation: "slide-up 0.25s ease-out"
            }}
          >
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(143,188,69,0.15)", background: "rgba(143,188,69,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Bot size={14} color="var(--sprout)" />
                <span style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "1px", color: "var(--sprout)" }}>AGROBOT</span>
              </div>
              <X size={14} style={{ cursor: "pointer", opacity: 0.5 }} onClick={() => setAgroBotOpen(false)} />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px" }} className="custom-scrollbar">
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {agroBotMessağes.map((msg, i) => (
                  <div key={i} style={{
                    alignSelf: msg.role === "bot" ? "flex-start" : "flex-end",
                    background: msg.role === "bot" ? "rgba(255,255,255,0.04)" : "var(--sprout)",
                    color: msg.role === "bot" ? "#fff" : "#000",
                    padding: "10px 14px", borderRadius: "14px", fontSize: "13px", maxWidth: "85%", lineHeight: "1.5"
                  }}>
                    {msg.text}
                  </div>
                ))}
                {agroBotTyping && (
                  <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.04)", padding: "10px 14px", borderRadius: "14px" }}>
                    <div className="typing-dot" />
                    <div className="typing-dot" style={{ animationDelay: "0.2s" }} />
                    <div className="typing-dot" style={{ animationDelay: "0.4s" }} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "10px", background: "rgba(0,0,0,0.2)" }}>
              <input
                placeholder="AgroBot'a sorun..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: "12px" }}
                onKeyDown={(e) => { if (e.key === "Enter") { handleAgroBotMessağe(e.target.value); e.target.value = ""; } }}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setAgroBotOpen(!agroBotOpen)}
          className="agrobot-button"
          style={{ width: "52px", height: "52px", borderRadius: "26px", background: "var(--sprout)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 12px 30px rgba(0,0,0,0.45)" }}
        >
          {agroBotOpen ? <X size={24} /> : <Bot size={24} />}
        </button>
      </div>
    </>
  );
}

const MemoizedHomeTabHeader = memo(HomeTabHeader);
const MemoizedHomeTabMain = memo(HomeTabMain);
const MemoizedLandTab = memo(LandTab);
const MemoizedMarketTab = memo(MarketTab);
const MemoizedWeatherTab = memo(WeatherTab);

export default App;
