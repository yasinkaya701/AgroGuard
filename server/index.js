const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const nodemailer = require("nodemailer");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5001);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const RATE_LIMITS = {
  "/api/diagnose": { windowMs: 60 * 1000, max: 8 },
  "/api/weather": { windowMs: 60 * 1000, max: 60 },
  "/api/forecast": { windowMs: 60 * 1000, max: 60 },
  default: { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }
};

function getDynamicRate(req, rule) {
  if (req.path !== "/api/diagnose") return rule;
  const size = Number(req.headers["content-length"] || 0);
  if (size > 6 * 1024 * 1024) return { ...rule, max: Math.max(3, Math.floor(rule.max * 0.5)) };
  if (size > 3 * 1024 * 1024) return { ...rule, max: Math.max(4, Math.floor(rule.max * 0.7)) };
  return rule;
}

const stageLogs = new Map();

function markStage(req, stage) {
  if (!req || !req.requestId) return;
  const entry = stageLogs.get(req.requestId) || { start: Date.now(), stages: [] };
  entry.stages.push({ stage, at: Date.now() });
  stageLogs.set(req.requestId, entry);
}

function flushStages(req) {
  if (!req || !req.requestId) return;
  const entry = stageLogs.get(req.requestId);
  if (!entry) return;
  const timeline = entry.stages.map((s, idx) => {
    const prev = idx === 0 ? entry.start : entry.stages[idx - 1].at;
    return `${s.stage}:${s.at - prev}ms`;
  });
  const line = `[${req.requestId}] stages ${timeline.join(' | ')}`;
  console.log(line);
  writeLog(line, {
    type: "stages",
    id: req.requestId,
    stages: entry.stages,
    at: new Date().toISOString()
  });
  stageLogs.delete(req.requestId);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 25000);

const MODEL_META_PATH = path.join(__dirname, "model", "model_meta.json");
let modelMeta = null;
if (fs.existsSync(MODEL_META_PATH)) {
  try {
    modelMeta = JSON.parse(fs.readFileSync(MODEL_META_PATH, "utf-8"));
  } catch (err) {
    modelMeta = null;
  }
}


const SERVER_START = Date.now();
const API_VERSION = process.env.API_VERSION || "2026.02.15";
const MODEL_VERSION = process.env.MODEL_VERSION || (modelMeta?.version || "unknown");
const GIT_SHA = process.env.GIT_SHA || "unknown";

const LOG_TO_FILE = process.env.LOG_TO_FILE === "true";
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, "logs", "server.log");

const LOG_JSON = process.env.LOG_JSON === "true";

function writeLog(line) {
  if (!LOG_TO_FILE) return;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (err) {
    // ignore file log errors
  }
}

app.use((req, res, next) => {
  const reqUrl = String(req.originalUrl || req.url || "");
  const isLargeLandPipeline =
    reqUrl.startsWith("/api/land-price/model/collect-train-large") ||
    reqUrl.startsWith("/api/land-price/dataset/build-large") ||
    reqUrl.startsWith("/api/land-price/model/collect-train") ||
    reqUrl.startsWith("/api/land-price/model/boost-data-train");
  const timeoutMs = isLargeLandPipeline
    ? Math.max(REQUEST_TIMEOUT_MS, Number(process.env.LAND_LARGE_PIPELINE_TIMEOUT_MS || 15 * 60 * 1000))
    : REQUEST_TIMEOUT_MS;
  req._timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "request_timeout" });
    }
  }, timeoutMs);
  res.on("finish", () => clearTimeout(req._timeout));
  next();
});

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_DIMENSION = Number(process.env.MAX_DIMENSION || 3000);

function validateUpload(file) {
  if (!file) return { ok: false, error: "image_required" };
  if (!ALLOWED_MIME.has(file.mimetype)) return { ok: false, error: "invalid_mime_type" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "file_too_large" };
  return { ok: true };
}

const rateBucket = new Map();

app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const route = req.path || "default";
  const baseRule = RATE_LIMITS[route] || RATE_LIMITS.default;
  const rule = getDynamicRate(req, baseRule);
  const key = `${ip}:${route}`;
  const entry = rateBucket.get(key) || { count: 0, start: now };
  if (now - entry.start > rule.windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateBucket.set(key, entry);
  if (entry.count > rule.max) {
    return res.status(429).json({ error: "rate_limited" });
  }
  return next();
});

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  req.startTime = Date.now();
  res.setHeader("x-request-id", req.requestId);
  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    const line = `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    console.log(line);
    writeLog(line, {
      type: "request",
      id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      at: new Date().toISOString()
    });
    flushStages(req);
  });
  next();
});

const MODEL_PATH = path.join(__dirname, "model", "model.onnx");
const MODEL_PATH_SECONDARY =
  process.env.MODEL_PATH_SECONDARY || path.join(__dirname, "model", "model_secondary.onnx");
const LABELS_PATH = path.join(__dirname, "model", "labels.json");
const LABELS_PATH_SECONDARY = process.env.LABELS_PATH_SECONDARY || LABELS_PATH;
const META_PATH = path.join(__dirname, "model", "labels_meta.json");
const PYTHON_INFER = path.join(__dirname, "python_infer.py");
const PYTHON_BIN =
  process.env.PYTHON_BIN || path.join(process.env.HOME || "", ".venv", "bin", "python");
const PT_PATH = path.join(__dirname, "model", "model.pt");
const INPUT_SIZE = Number(process.env.MODEL_INPUT_SIZE || modelMeta?.img_size || 128);
const normMean = modelMeta?.norm_mean || [0.485, 0.456, 0.406];
const normStd = modelMeta?.norm_std || [0.229, 0.224, 0.225];
const MODEL_API_URL = (process.env.MODEL_API_URL || "").trim();
const MODEL_API_TOKEN = (process.env.MODEL_API_TOKEN || "").trim();
const MODEL_API_TIMEOUT_MS = Number(process.env.MODEL_API_TIMEOUT_MS || 10000);
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const SOILGRIDS_QUERY = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const MTA_SOIL_URL = (process.env.MTA_SOIL_URL || "").trim();
const MTA_MINERAL_URL = (process.env.MTA_MINERAL_URL || "").trim();
const MTA_TIMEOUT_MS = Number(process.env.MTA_TIMEOUT_MS || 7000);
const TR_SOIL_WMS_URL = (
  process.env.TR_SOIL_WMS_URL || "https://tgskcbs.tarim.gov.tr/arcgis/services/Toprak/MapServer/WMSServer"
).trim();
const TR_SOIL_WMS_LAYER = (process.env.TR_SOIL_WMS_LAYER || "").trim();
const TR_SOIL_WMS_VERSION = (process.env.TR_SOIL_WMS_VERSION || "1.3.0").trim();
const TR_SOIL_WMS_INFO_FORMAT = (process.env.TR_SOIL_WMS_INFO_FORMAT || "application/json").trim();
const TR_SOIL_WMS_CRS = (process.env.TR_SOIL_WMS_CRS || "EPSG:4326").trim();
const MAX_CONCURRENT_INFER = Number(process.env.MAX_CONCURRENT_INFER || 2);
const inferQueue = [];
let activeInference = 0;
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "AgroGuard <no-reply@agroguard.local>";
const SMTP_TO = process.env.SMTP_TO || "gs7016903@gmail.com";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK !== "false";
const MODEL_STRICT_ONLY =
  String(process.env.MODEL_STRICT_ONLY || "true").toLowerCase() !== "false" ||
  !ALLOW_FALLBACK;

function getMailer() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}


let labelMetadata = {};

let modelSession = null;
let modelSessionSecondary = null;
let labels = null;
let labelsSecondary = null;
let modelLastFailure = null;
let modelLastSuccessAt = null;
const modelPredictionStats = [];
const MODEL_STATS_WINDOW = Number(process.env.MODEL_STATS_WINDOW || 200);
const modelEventStats = [];
const MODEL_EVENT_WINDOW = Number(process.env.MODEL_EVENT_WINDOW || 300);
const soilCache = new Map();
const SOIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const geoCache = new Map();
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const weatherCache = new Map();
const forecastCache = new Map();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const FORECAST_CACHE_TTL_MS = 30 * 60 * 1000;

const marketCache = new Map();
const MARKET_CACHE_TTL_MS = 30 * 60 * 1000;
const newsCache = new Map();
const NEWS_CACHE_TTL_MS = Number(process.env.NEWS_CACHE_TTL_MS || 5 * 60 * 1000);
const integrationsHealthCache = new Map();
const INTEGRATIONS_HEALTH_CACHE_TTL_MS = Number(process.env.INTEGRATIONS_HEALTH_CACHE_TTL_MS || 2 * 60 * 1000);
const landPriceCache = new Map();
const LAND_PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const landPriceHistory = new Map();
const LAND_PRICE_HISTORY_LIMIT = Number(process.env.LAND_PRICE_HISTORY_LIMIT || 40);
const LAND_DISCOVERY_ENABLED = process.env.LAND_DISCOVERY_ENABLED !== "false";
const LAND_DISCOVERY_TIMEOUT_MS = Number(process.env.LAND_DISCOVERY_TIMEOUT_MS || 6500);
const LAND_DISCOVERY_MAX_SOURCES = Number(process.env.LAND_DISCOVERY_MAX_SOURCES || 5);
const LAND_PROVIDER_TIMEOUT_MS = Number(process.env.LAND_PROVIDER_TIMEOUT_MS || 7000);
const LAND_LISTINGS_DEFAULT_MAX = Number(process.env.LAND_LISTINGS_DEFAULT_MAX || 12000);
const LAND_LISTINGS_MAX_LIMIT = Number(process.env.LAND_LISTINGS_MAX_LIMIT || 50000);
const LAND_DATASET_MIN_TARGET = Number(process.env.LAND_DATASET_MIN_TARGET || 10000);
const LAND_BLEND_OUTLIER_PIVOT = Math.max(0.08, Math.min(0.5, Number(process.env.LAND_BLEND_OUTLIER_PIVOT || 0.2)));
const LAND_BLEND_MIN_RELIABILITY = Math.max(
  0.05,
  Math.min(0.4, Number(process.env.LAND_BLEND_MIN_RELIABILITY || 0.15))
);
const economyPlannerCache = new Map();
const ECONOMY_CACHE_TTL_MS = Number(process.env.ECONOMY_CACHE_TTL_MS || 20 * 60 * 1000);

const inferCache = new Map();
const INFER_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;

const CACHE_FILE = path.join(__dirname, "cache", "infer_cache.json");
const CACHE_PERSIST = process.env.CACHE_PERSIST === "true";
const LAND_LISTINGS_FILE = path.join(__dirname, "data", "land_listings.json");
const LAND_CUSTOM_MODEL_FILE = path.join(__dirname, "data", "land_price_custom_model.json");
let landManualListings = [];
let landCustomModel = null;
const TRADE_MARKET_FILE = path.join(__dirname, "data", "trade_market.json");
let tradeListings = [];
let tradeOffers = [];
let tradeOrders = [];
let tradeMessages = [];
let tradeRatings = [];
let tradeAlerts = [];

function loadCacheFromDisk() {
  if (!CACHE_PERSIST) return;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      Object.entries(parsed).forEach(([key, value]) => {
        inferCache.set(key, value);
      });
      console.log(`Loaded ${inferCache.size} cache entries from disk.`);
    }
  } catch (err) {
    console.warn("Cache load failed", err.message);
  }
}

function saveCacheToDisk() {
  if (!CACHE_PERSIST) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const obj = {};
    inferCache.forEach((value, key) => {
      obj[key] = value;
    });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch (err) {
    // ignore
  }
}

function loadLandListingsFromDisk() {
  try {
    if (!fs.existsSync(LAND_LISTINGS_FILE)) {
      landManualListings = [];
      return;
    }
    const raw = fs.readFileSync(LAND_LISTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    landManualListings = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    landManualListings = [];
  }
}

function saveLandListingsToDisk() {
  try {
    fs.mkdirSync(path.dirname(LAND_LISTINGS_FILE), { recursive: true });
    fs.writeFileSync(LAND_LISTINGS_FILE, JSON.stringify(landManualListings, null, 2));
  } catch (err) {
    // ignore
  }
}

function loadLandCustomModelFromDisk() {
  try {
    if (!fs.existsSync(LAND_CUSTOM_MODEL_FILE)) {
      landCustomModel = null;
      return;
    }
    const raw = fs.readFileSync(LAND_CUSTOM_MODEL_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.weights) &&
      Number.isFinite(Number(parsed.featureSize)) &&
      Number(parsed.featureSize) > 0
    ) {
      landCustomModel = {
        ...parsed,
        featureSize: Number(parsed.featureSize),
        weights: parsed.weights.map((x) => Number(x))
      };
      return;
    }
    landCustomModel = null;
  } catch (err) {
    landCustomModel = null;
  }
}

function saveLandCustomModelToDisk() {
  try {
    if (!landCustomModel) return;
    fs.mkdirSync(path.dirname(LAND_CUSTOM_MODEL_FILE), { recursive: true });
    fs.writeFileSync(LAND_CUSTOM_MODEL_FILE, JSON.stringify(landCustomModel, null, 2));
  } catch (err) {
    // ignore
  }
}

function loadTradeMarketFromDisk() {
  try {
    if (!fs.existsSync(TRADE_MARKET_FILE)) {
      tradeListings = [];
      tradeOffers = [];
      tradeOrders = [];
      tradeMessages = [];
      tradeRatings = [];
      tradeAlerts = [];
      return;
    }
    const raw = fs.readFileSync(TRADE_MARKET_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    tradeListings = Array.isArray(parsed?.listings)
      ? parsed.listings.map((item) => normalizeTradeListing(item))
      : [];
    tradeOffers = Array.isArray(parsed?.offers)
      ? parsed.offers.map((item) => normalizeTradeOffer(item))
      : [];
    tradeOrders = Array.isArray(parsed?.orders)
      ? parsed.orders.map((item) => normalizeTradeOrder(item))
      : [];
    tradeMessages = Array.isArray(parsed?.messages)
      ? parsed.messages.map((item) => normalizeTradeMessage(item))
      : [];
    tradeRatings = Array.isArray(parsed?.ratings)
      ? parsed.ratings.map((item) => normalizeTradeRating(item))
      : [];
    tradeAlerts = Array.isArray(parsed?.alerts)
      ? parsed.alerts.map((item) => normalizeTradeAlert(item))
      : [];
  } catch (err) {
    tradeListings = [];
    tradeOffers = [];
    tradeOrders = [];
    tradeMessages = [];
    tradeRatings = [];
    tradeAlerts = [];
  }
}

function saveTradeMarketToDisk() {
  try {
    fs.mkdirSync(path.dirname(TRADE_MARKET_FILE), { recursive: true });
    fs.writeFileSync(
      TRADE_MARKET_FILE,
      JSON.stringify(
        {
          listings: tradeListings,
          offers: tradeOffers,
          orders: tradeOrders,
          messages: tradeMessages,
          ratings: tradeRatings,
          alerts: tradeAlerts
        },
        null,
        2
      )
    );
  } catch (err) {
    // ignore
  }
}

function getCache(key) {
  const item = inferCache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > INFER_CACHE_TTL_MS) {
    inferCache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value) {
  if (inferCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = inferCache.keys().next().value;
    if (firstKey) inferCache.delete(firstKey);
  }
  inferCache.set(key, { ts: Date.now(), value });
  saveCacheToDisk();
}

async function runWithQueue(task) {
  return new Promise((resolve, reject) => {
    const exec = async () => {
      activeInference += 1;
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeInference -= 1;
        if (inferQueue.length) {
          const next = inferQueue.shift();
          next();
        }
      }
    };
    if (activeInference < MAX_CONCURRENT_INFER) {
      exec();
    } else {
      inferQueue.push(exec);
    }
  });
}

async function fetchJsonWithRetry(url, options = {}, retries = 2, timeoutMs = 8000) {
  let lastErr = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr || new Error("fetch_failed");
}

async function fetchTextWithRetry(url, options = {}, retries = 1, timeoutMs = 7000) {
  let lastErr = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr || new Error("fetch_text_failed");
}

function getAnyCacheEntry(map, key) {
  const cached = map.get(key);
  if (!cached) return null;
  return cached.value;
}

function getCityWeatherPreset(city = "") {
  const key = cityKey(city);
  const month = new Date().getMonth() + 1;
  const winter = [12, 1, 2].includes(month);
  const spring = [3, 4, 5].includes(month);
  const summer = [6, 7, 8].includes(month);
  const seasonal = {
    temp: winter ? 7 : spring ? 16 : summer ? 31 : 19,
    min: winter ? 1 : spring ? 9 : summer ? 21 : 11,
    max: winter ? 11 : spring ? 22 : summer ? 36 : 25,
    humidity: winter ? 72 : spring ? 62 : summer ? 42 : 58,
    windKmh: winter ? 12 : spring ? 10 : summer ? 8 : 10,
    precipitationMm: winter ? 2.1 : spring ? 1.4 : summer ? 0.1 : 0.8,
    condition: winter ? "Parcali bulutlu" : spring ? "Acik" : summer ? "Az bulutlu" : "Parcali bulutlu"
  };
  const cityOverrides = {
    malatya: { temp: winter ? 5 : spring ? 15 : summer ? 32 : 18, min: winter ? -1 : spring ? 7 : summer ? 20 : 9 },
    izmir: { temp: winter ? 11 : spring ? 19 : summer ? 34 : 22, min: winter ? 6 : spring ? 12 : summer ? 24 : 15, humidity: 55 },
    antalya: { temp: winter ? 14 : spring ? 22 : summer ? 35 : 26, min: winter ? 9 : spring ? 16 : summer ? 26 : 19, humidity: 60 },
    ankara: { temp: winter ? 3 : spring ? 14 : summer ? 30 : 16, min: winter ? -3 : spring ? 5 : summer ? 18 : 7, windKmh: 13 },
    istanbul: { temp: winter ? 9 : spring ? 15 : summer ? 29 : 19, min: winter ? 4 : spring ? 10 : summer ? 22 : 13, humidity: 68 }
  };
  return { ...seasonal, ...(cityOverrides[key] || {}) };
}

function buildDemoWeather(city, coords = null, reason = null) {
  const preset = getCityWeatherPreset(city);
  return {
    city,
    coords,
    temp: preset.temp,
    tempMin: preset.min,
    tempMax: preset.max,
    humidity: preset.humidity,
    windKmh: preset.windKmh,
    windGustKmh: Math.round(preset.windKmh * 1.6),
    precipitationMm: preset.precipitationMm,
    condition: preset.condition,
    frostRisk: preset.min <= 0,
    localTime: new Date().toISOString(),
    timeZone: "Europe/Istanbul",
    updatedAt: new Date().toISOString(),
    source: "demo",
    warning: reason || "canli_veri_alinamadi"
  };
}

function buildDemoForecast(city, coords = null, reason = null) {
  const preset = getCityWeatherPreset(city);
  const labels = ["Bugun", "Yarin", "2 gun", "3 gun", "4 gun"];
  const tempOffsets = [0, 1, -1, 2, 0];
  const minOffsets = [0, 1, 0, 1, -1];
  const rainPattern = [preset.precipitationMm, 0.6, 0.2, 1.1, 0.3];
  const days = labels.map((label, idx) => {
    const min = Math.round(preset.min + minOffsets[idx]);
    const max = Math.round(preset.max + tempOffsets[idx]);
    return {
      day: label,
      min,
      max,
      condition: idx % 2 === 0 ? preset.condition : "Parcali bulutlu",
      precipitationMm: Number(rainPattern[idx].toFixed(1)),
      windGustKmh: Math.round((preset.windKmh + idx) * 1.6),
      frost: min <= 0
    };
  });
  return {
    city,
    coords,
    days,
    hourly: [],
    timeZone: "Europe/Istanbul",
    source: "demo",
    warning: reason || "canli_tahmin_alinamadi"
  };
}

function safeLoadLabels(labelsPath) {
  if (!labelsPath || !fs.existsSync(labelsPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(labelsPath, "utf-8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

function getActiveLabels() {
  if (Array.isArray(labels) && labels.length) return labels;
  if (Array.isArray(labelsSecondary) && labelsSecondary.length) return labelsSecondary;
  return safeLoadLabels(LABELS_PATH) || [];
}

function getCatalogLabels() {
  const active = getActiveLabels();
  if (active.length) return active;
  if (labelMetadata && typeof labelMetadata === "object") {
    const keys = Object.keys(labelMetadata).filter(Boolean);
    if (keys.length) return keys;
  }
  return [];
}

function getOnnxPipelines() {
  const items = [];
  if (modelSession) {
    items.push({
      id: "onnx-primary",
      session: modelSession,
      labels: Array.isArray(labels) && labels.length ? labels : getActiveLabels()
    });
  }
  if (modelSessionSecondary) {
    items.push({
      id: "onnx-secondary",
      session: modelSessionSecondary,
      labels:
        Array.isArray(labelsSecondary) && labelsSecondary.length
          ? labelsSecondary
          : getActiveLabels()
    });
  }
  return items;
}

async function loadModel() {
  labels = safeLoadLabels(LABELS_PATH);
  labelsSecondary = safeLoadLabels(LABELS_PATH_SECONDARY);
  if (fs.existsSync(META_PATH)) {
    try {
      labelMetadata = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
    } catch (err) {
      labelMetadata = {};
    }
  }

  if (!Array.isArray(labels) || !labels.length) {
    console.warn("Labels not found. Plant and disease lists may be empty.");
  }

  if (fs.existsSync(MODEL_PATH)) {
    try {
      modelSession = await ort.InferenceSession.create(MODEL_PATH);
      console.log("ONNX primary model loaded.");
    } catch (err) {
      console.warn("Primary ONNX model failed to load:", err?.message || err);
      modelSession = null;
    }
  }

  if (fs.existsSync(MODEL_PATH_SECONDARY)) {
    try {
      modelSessionSecondary = await ort.InferenceSession.create(MODEL_PATH_SECONDARY);
      console.log("ONNX secondary model loaded.");
    } catch (err) {
      console.warn("Secondary ONNX model failed to load:", err?.message || err);
      modelSessionSecondary = null;
    }
  }

  if (!modelSession && !modelSessionSecondary) {
    console.warn("No ONNX model loaded. API will use API/Python/demo fallback.");
  }
}

function hasPythonModel() {
  return fs.existsSync(PYTHON_INFER) && fs.existsSync(PT_PATH) && fs.existsSync(PYTHON_BIN);
}

function hasModelApi() {
  return Boolean(MODEL_API_URL);
}

async function runModelApiInference(buffer, plant = "") {
  if (!hasModelApi()) throw new Error("model_api_not_configured");
  const form = new FormData();
  const blob = new Blob([buffer], { type: "image/jpeg" });
  form.append("image", blob, "upload.jpg");
  if (plant) form.append("plant", plant);

  const headers = {};
  if (MODEL_API_TOKEN) headers.Authorization = `Bearer ${MODEL_API_TOKEN}`;

  const result = await fetchJsonWithRetry(
    MODEL_API_URL,
    { method: "POST", headers, body: form },
    1,
    MODEL_API_TIMEOUT_MS
  );
  const apiLabel = result.label || result.class || result.top1?.label || result.prediction?.label;
  const apiConfidence = Number(
    result.confidence ?? result.score ?? result.top1?.confidence ?? result.prediction?.confidence
  );
  if (!apiLabel || Number.isNaN(apiConfidence)) {
    throw new Error("model_api_invalid_payload");
  }
  const top = Array.isArray(result.topPredictions)
    ? result.topPredictions
    : Array.isArray(result.topk)
      ? result.topk
      : [];
  return {
    label: String(apiLabel),
    confidence: Math.max(0, Math.min(1, apiConfidence)),
    topPredictions: top
      .map((item) => ({
        label: String(item.label || item.class || ""),
        confidence: Number(item.confidence ?? item.score ?? 0)
      }))
      .filter((item) => item.label)
      .slice(0, 3)
  };
}

function runPythonInference(buffer) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bitkikor-"));
    const tmpPath = path.join(tmpDir, "upload.jpg");
    fs.writeFileSync(tmpPath, buffer);

    execFile(
      PYTHON_BIN,
      [PYTHON_INFER, "--image", tmpPath, "--checkpoint", PT_PATH],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        if (err) {
          console.error(stderr || err);
          return reject(err);
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - maxLogit));
  const sum = exps.reduce((acc, val) => acc + val, 0);
  return exps.map((val) => val / sum);
}

function softmaxWithTemperature(logits, temperature = 1) {
  const t = Number.isFinite(temperature) && temperature > 0 ? temperature : 1;
  if (t === 1) return softmax(logits);
  return softmax(logits.map((x) => x / t));
}

function resolveAdaptiveTemperature(baseTemp = 1.05, quality = null, plantCheck = null, mode = "main") {
  const base = Math.max(0.6, Math.min(2.2, Number(baseTemp) || 1.05));
  const qualityScore =
    quality?.score === undefined || quality?.score === null ? 0.62 : Number(quality.score || 0.62);
  const plantScore =
    plantCheck?.score === undefined || plantCheck?.score === null
      ? 0.62
      : Number(plantCheck.score || 0.62);
  const q = Math.max(0, Math.min(1, qualityScore));
  const p = Math.max(0, Math.min(1, plantScore));

  // Dusuk kalite/bitki skoru -> daha yuksek temp (asiri guveni azalt)
  // Yuksek kalite/bitki skoru -> daha dusuk temp (ayrimi guclendir)
  const qualityDelta = (0.6 - q) * 0.3;
  const plantDelta = (0.6 - p) * 0.25;
  const modeDelta = mode === "rescue" ? -0.02 : 0;
  const adaptive = base + qualityDelta + plantDelta + modeDelta;
  return Math.max(0.7, Math.min(1.8, adaptive));
}

function applyClassTemperatureScaling(probs = [], labels = [], config = null) {
  if (!Array.isArray(probs) || !probs.length) return probs;
  if (!Array.isArray(labels) || labels.length !== probs.length) return probs;
  if (!config || typeof config !== "object") return probs;

  const classTemps = config.class_temps && typeof config.class_temps === "object" ? config.class_temps : {};
  const defaultTemp = Number(
    process.env.MODEL_CLASS_TEMP_DEFAULT || config.default_temp || config.default || 1
  );
  const safeDefault = Math.max(0.5, Math.min(2.5, Number.isFinite(defaultTemp) ? defaultTemp : 1));

  const scaled = probs.map((p, idx) => {
    const label = String(labels[idx] || "");
    const key = normalizeLabelKey(label);
    const rawTemp = Number(classTemps[label] ?? classTemps[key] ?? safeDefault);
    const temp = Math.max(0.5, Math.min(2.5, Number.isFinite(rawTemp) ? rawTemp : safeDefault));
    const exponent = 1 / temp;
    return Math.pow(Math.max(1e-12, Number(p) || 0), exponent);
  });
  const sum = scaled.reduce((acc, p) => acc + p, 0) || 1;
  return scaled.map((p) => p / sum);
}

function normalizePredictionScores(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const sum = items.reduce((acc, item) => acc + (item?.val || 0), 0);
  if (sum <= 0) return items.map((item) => ({ ...item, val: 0 }));
  return items.map((item) => ({ ...item, val: item.val / sum }));
}

function entropyNormalized(sortedItems) {
  if (!Array.isArray(sortedItems) || sortedItems.length < 2) return 0;
  const eps = 1e-12;
  const probs = sortedItems.map((item) => Math.max(eps, item?.val || 0));
  const n = probs.length;
  const entropy = -probs.reduce((acc, p) => acc + p * Math.log(p), 0);
  return entropy / Math.log(n);
}

function calibrateConfidence(baseConfidence, margin, entropyNorm, plantCheckScore) {
  const base = Math.max(0, Math.min(1, baseConfidence || 0));
  const m = Math.max(0, Math.min(1, margin || 0));
  const e = Math.max(0, Math.min(1, entropyNorm || 0));
  const plantBonus = plantCheckScore === null || plantCheckScore === undefined
    ? 0
    : Math.max(-0.2, Math.min(0.12, (plantCheckScore - 0.5) * 0.25));
  const score = base * 0.82 + m * 0.22 + (1 - e) * 0.16 + plantBonus;
  return Math.max(0.01, Math.min(0.995, score));
}

function blendConfidence(calibrated, top1, weight = 0.58) {
  const w = Math.max(0.1, Math.min(0.9, Number(weight) || 0.58));
  const c = Math.max(0, Math.min(1, Number(calibrated) || 0));
  const t = Math.max(0, Math.min(1, Number(top1) || 0));
  return Math.max(0.01, Math.min(0.995, c * w + t * (1 - w)));
}

function calibrateFinalConfidence(confidence, ctx = {}) {
  const base = Math.max(0.01, Math.min(0.995, Number(confidence) || 0.01));
  const uncertaintyNorm = clamp01((Number(ctx.uncertaintyScore || 0) || 0) / 100);
  const slopeBase = Number(process.env.MODEL_CONF_SHAPE_SLOPE || 4.1);
  const slope = Math.max(1.4, slopeBase - uncertaintyNorm * 2.4);
  const curved = 1 / (1 + Math.exp(-slope * (base - 0.5)));
  let out = curved * 0.88 + base * 0.12;

  const source = String(ctx.source || "");
  if (source.includes("fallback")) {
    out = Math.min(out, Number(process.env.MODEL_FALLBACK_CONF_CAP || 0.72));
  }

  if (ctx.isHealthy && (ctx.uncertaintyHigh || ctx.ambiguityHigh || ctx.classConflictHigh)) {
    out = Math.min(out, Number(process.env.MODEL_HEALTHY_UNCERTAIN_CAP || 0.66));
  }

  const margin = Number(ctx.margin || 0);
  const top1 = Number(ctx.top1 || 0);
  if (!ctx.isHealthy && top1 >= 0.55 && margin >= 0.2) {
    out = Math.max(out, Number(process.env.MODEL_ISSUE_CONF_FLOOR || 0.36));
  }

  return Math.max(0.01, Math.min(0.995, out));
}

function applyConfidenceCalibration(confidence, label, calibration = {}, ctx = {}) {
  let out = Math.max(0.01, Math.min(0.995, Number(confidence) || 0.01));
  const globalScale = Number(calibration?.global_scale ?? 1);
  const globalBias = Number(calibration?.global_bias ?? 0);
  out = out * globalScale + globalBias;

  const key = normalizeLabelKey(label || "");
  const classRule =
    (label && (calibration?.class_scale?.[label] || calibration?.class_scale?.[key])) || 1;
  const classBias =
    (label && (calibration?.class_bias?.[label] || calibration?.class_bias?.[key])) || 0;
  out = out * Number(classRule || 1) + Number(classBias || 0);

  if (ctx.source && String(ctx.source).includes("fallback")) {
    out = Math.min(out, Number(calibration?.fallback_cap ?? 0.74));
  }
  return Math.max(0.01, Math.min(0.995, out));
}

function sharpenConfidenceSeparation(confidence, ctx = {}) {
  let out = Math.max(0.01, Math.min(0.995, Number(confidence) || 0.01));
  const top1 = clamp01(Number(ctx.top1 || 0));
  const margin = clamp01(Number(ctx.margin || 0));
  const entropyNorm = clamp01(Number(ctx.entropyNorm || 0));
  const certainty = clamp01(top1 * 0.42 + margin * 0.34 + (1 - entropyNorm) * 0.24);
  const delta = (certainty - 0.5) * 0.22;
  out += delta;

  const source = String(ctx.source || "");
  if (source.includes("fallback")) out = Math.min(out, Number(process.env.MODEL_FALLBACK_SHARP_CAP || 0.68));
  if (ctx.isHealthy && certainty < 0.45) out = Math.min(out, Number(process.env.MODEL_HEALTHY_LOW_CERT_CAP || 0.58));
  if (!ctx.isHealthy && certainty > 0.72) out = Math.max(out, Number(process.env.MODEL_ISSUE_HIGH_CERT_FLOOR || 0.46));
  return Math.max(0.01, Math.min(0.995, out));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function computeReliability(ctx = {}) {
  const top1 = Number(ctx.top1 || 0);
  const margin = Number(ctx.margin || 0);
  const minConf = Math.max(0.01, Number(ctx.minConf || 0.35));
  const minMargin = Math.max(0.01, Number(ctx.minMargin || 0.08));
  const qualityScore = ctx.quality?.score === undefined ? 0.62 : Number(ctx.quality.score || 0);
  const plantScore = ctx.plantCheck?.score === undefined ? 0.62 : Number(ctx.plantCheck.score || 0);
  const agreement = ctx.ensembleConsensus
    ? Number(ctx.ensembleConsensus.agreement || 0)
    : 0.85;

  const confNorm = clamp01(top1 / Math.max(minConf, 0.2));
  const marginNorm = clamp01(margin / Math.max(minMargin, 0.05));
  const qualityNorm = clamp01(qualityScore);
  const plantNorm = clamp01(plantScore);
  const ensembleNorm = clamp01(agreement);
  const ambiguityPenalty = Math.max(0, Math.min(0.2, Number(ctx.ambiguityPenalty || 0)));
  const classConflictPenalty = Math.max(0, Math.min(0.2, Number(ctx.classConflictPenalty || 0)));
  const plantMismatchPenalty = Math.max(0, Math.min(0.2, Number(ctx.plantMismatchPenalty || 0)));

  let score =
    confNorm * 34 +
    marginNorm * 20 +
    qualityNorm * 18 +
    plantNorm * 16 +
    ensembleNorm * 12;
  score -= ambiguityPenalty * 100 * 0.45;
  score -= classConflictPenalty * 100 * 0.45;
  score -= plantMismatchPenalty * 100 * 0.52;

  const source = String(ctx.source || "");
  if (source.includes("demo")) score -= 20;
  else if (source.includes("fallback")) score -= 12;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const level = normalized >= 75 ? "high" : normalized >= 55 ? "medium" : "low";
  return {
    score: normalized,
    level,
    unstable: normalized < 55
  };
}

function computeClassConflict(sortedItems = [], topLabel = "", opts = {}) {
  if (!Array.isArray(sortedItems) || sortedItems.length < 2) {
    return {
      topIsHealthy: false,
      healthyAltMass: 0,
      issueAltMass: 0,
      healthyIssueConflict: false,
      issueHealthyConflict: false,
      penalty: 0
    };
  }
  const top = Number(sortedItems[0]?.val || 0);
  const second = Number(sortedItems[1]?.val || 0);
  const margin = Math.max(0, top - second);
  const topIsHealthy = String(topLabel || sortedItems[0]?.label || "")
    .toLowerCase()
    .includes("healthy");

  const alt = sortedItems.slice(1, 6);
  const healthyAltMass = alt
    .filter((item) => String(item?.label || "").toLowerCase().includes("healthy"))
    .reduce((acc, item) => acc + Number(item?.val || 0), 0);
  const issueAltMass = alt
    .filter((item) => !String(item?.label || "").toLowerCase().includes("healthy"))
    .reduce((acc, item) => acc + Number(item?.val || 0), 0);

  const healthyIssueMassThreshold = Number(opts.healthyIssueMassThreshold ?? 0.28);
  const issueHealthyMassThreshold = Number(opts.issueHealthyMassThreshold ?? 0.24);
  const issueConflictMarginMax = Number(opts.issueConflictMarginMax ?? 0.14);

  const healthyIssueConflict = topIsHealthy && issueAltMass >= healthyIssueMassThreshold;
  const issueHealthyConflict =
    !topIsHealthy && healthyAltMass >= issueHealthyMassThreshold && margin <= issueConflictMarginMax;

  let penalty = 0;
  if (healthyIssueConflict) {
    penalty = Math.min(0.08, 0.02 + issueAltMass * 0.12);
  } else if (issueHealthyConflict) {
    penalty = Math.min(0.06, 0.015 + healthyAltMass * 0.1);
  }

  return {
    topIsHealthy,
    healthyAltMass: Number(healthyAltMass.toFixed(4)),
    issueAltMass: Number(issueAltMass.toFixed(4)),
    healthyIssueConflict,
    issueHealthyConflict,
    penalty: Number(penalty.toFixed(4))
  };
}

function computeUncertaintyScore(ctx = {}) {
  const entropyNorm = clamp01(ctx.entropyNorm);
  const ambiguityPenalty = clamp01((Number(ctx.ambiguityPenalty || 0) * 100) / 12);
  const classConflictPenalty = clamp01((Number(ctx.classConflictPenalty || 0) * 100) / 8);
  const ensembleDisagreement = clamp01(Number(ctx.ensembleDisagreement || 0));
  const ensembleStd = clamp01((Number(ctx.ensembleStd || 0) * 100) / 12);
  const plantRisk = clamp01(1 - clamp01(ctx.plantScore === null || ctx.plantScore === undefined ? 0.62 : ctx.plantScore));
  const plantMismatch = clamp01(Number(ctx.plantMismatch || 0));
  const uncertainty =
    entropyNorm * 32 +
    ambiguityPenalty * 24 +
    classConflictPenalty * 20 +
    ensembleDisagreement * 8 +
    ensembleStd * 6 +
    plantRisk * 6 +
    plantMismatch * 4;
  return Math.max(0, Math.min(100, Math.round(uncertainty)));
}

function computeAmbiguityPenalty(sortedItems = [], topLabel = "", opts = {}) {
  if (!Array.isArray(sortedItems) || sortedItems.length < 2) {
    return { penalty: 0, closeCount: 0, highRisk: false };
  }
  const top = Number(sortedItems[0]?.val || 0);
  const topIsHealthy = String(topLabel || sortedItems[0]?.label || "")
    .toLowerCase()
    .includes("healthy");
  const deltaMax = Number(opts.deltaMax ?? 0.1);
  const healthyAltMin = Number(opts.healthyAltMin ?? 0.16);
  const issueAltMin = Number(opts.issueAltMin ?? 0.12);
  const penaltyPerAlt = Number(opts.penaltyPerAlt ?? 0.025);
  const marginPenaltyLow = Number(opts.marginPenaltyLow ?? 0.03);
  const marginPenaltyMid = Number(opts.marginPenaltyMid ?? 0.015);
  const maxPenalty = Number(opts.maxPenalty ?? 0.12);
  const highRiskPenalty = Number(opts.highRiskPenalty ?? 0.06);

  const closeAlt = sortedItems
    .slice(1, 5)
    .filter((item) => {
      const val = Number(item?.val || 0);
      const itemLabel = String(item?.label || "").toLowerCase();
      const isHealthy = itemLabel.includes("healthy");
      const delta = top - val;
      if (!Number.isFinite(delta)) return false;
      if (delta > deltaMax) return false;
      // Healthy sonuclarda issue alternatifleri daha kritik.
      if (topIsHealthy && !isHealthy && val >= healthyAltMin) return true;
      // Issue sonuclarinda yakin herhangi alternatif belirsizliktir.
      if (!topIsHealthy && val >= issueAltMin) return true;
      return false;
    });
  const closeCount = closeAlt.length;
  const second = Number(sortedItems[1]?.val || 0);
  const margin = Math.max(0, top - second);
  const penaltyBase = closeCount * penaltyPerAlt;
  const marginPenalty = margin < 0.08 ? marginPenaltyLow : margin < 0.12 ? marginPenaltyMid : 0;
  const penalty = Math.max(0, Math.min(maxPenalty, penaltyBase + marginPenalty));
  return {
    penalty,
    closeCount,
    highRisk: penalty >= highRiskPenalty
  };
}

async function toRgbRaw(sharpFactory, size, fit) {
  const run = (space) =>
    sharpFactory()
      .resize(size, size, { fit })
      .removeAlpha()
      .toColourspace(space)
      .raw()
      .toBuffer({ resolveWithObject: true });
  try {
    return await run("srgb");
  } catch (err) {
    return run("rgb");
  }
}

async function preprocessFromSharp(sharpImg, size, mean, std) {
  const { data } = await toRgbRaw(() => sharpImg.clone(), size, "cover");

  const floatData = new Float32Array(3 * size * size);

  for (let i = 0; i < size * size; i += 1) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    floatData[i] = (r - mean[0]) / std[0];
    floatData[i + size * size] = (g - mean[1]) / std[1];
    floatData[i + 2 * size * size] = (b - mean[2]) / std[2];
  }

  return floatData;
}

async function preprocessImage(buffer, size, mean, std) {
  return preprocessFromSharp(sharp(buffer), size, mean, std);
}

async function optimizeImage(buffer) {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return buffer;
    const maxSide = Math.max(meta.width, meta.height);
    if (maxSide <= 1400) return buffer;
    const resized = await img
      .resize({ width: maxSide > 2200 ? 2200 : 1400, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return resized;
  } catch (err) {
    return buffer;
  }
}

function extractLogits(outputs) {
  if (!outputs || typeof outputs !== "object") {
    throw new Error("onnx_invalid_output");
  }
  if (outputs.logits?.data) {
    return Array.from(outputs.logits.data);
  }
  const first = Object.values(outputs).find((item) => item && item.data);
  if (!first?.data) {
    throw new Error("onnx_logits_missing");
  }
  return Array.from(first.data);
}

async function inferOnnx(buffer, size, mean, std, session) {
  const inputData = await preprocessImage(buffer, size, mean, std);
  const tensor = new ort.Tensor("float32", inputData, [1, 3, size, size]);
  const outputs = await session.run({ input: tensor });
  return extractLogits(outputs);
}

async function inferOnnxTTA(buffer, size, mean, std, session) {
  const original = await inferOnnx(buffer, size, mean, std, session);
  const flippedInput = await preprocessFromSharp(sharp(buffer).flop(), size, mean, std);
  const flippedTensor = new ort.Tensor("float32", flippedInput, [1, 3, size, size]);
  const flippedOutputs = await session.run({ input: flippedTensor });
  const flipped = extractLogits(flippedOutputs);
  return original.map((val, idx) => (val + flipped[idx]) / 2);
}

function combineOnnxSortedPredictions(items, options = {}) {
  if (!Array.isArray(items) || !items.length) return [];
  const modelWeights = options?.modelWeights && typeof options.modelWeights === "object"
    ? options.modelWeights
    : null;
  const bucket = new Map();
  let totalWeight = 0;
  for (const item of items) {
    const sorted = item?.rawSorted || [];
    const top1 = sorted[0]?.val || 0;
    const configuredWeight = modelWeights ? Number(modelWeights[item?.id]) : NaN;
    const weight = Number.isFinite(configuredWeight)
      ? Math.max(0.05, Math.min(5, configuredWeight))
      : Math.max(0.2, top1 || 0.2);
    totalWeight += weight;
    sorted.forEach((row) => {
      const key = String(row.label || "");
      if (!key) return;
      const prev = bucket.get(key) || 0;
      bucket.set(key, prev + row.val * weight);
    });
  }
  if (!bucket.size) return [];
  const norm = totalWeight > 0 ? totalWeight : 1;
  const sorted = Array.from(bucket.entries())
    .map(([label, val], idx) => ({ idx, label, val: val / norm }))
    .sort((a, b) => b.val - a.val);
  const sum = sorted.reduce((acc, row) => acc + row.val, 0) || 1;
  return sorted.map((row, idx) => ({ ...row, idx, val: row.val / sum }));
}

function blendSortedPredictions(primary = [], secondary = [], primaryWeight = 0.65) {
  if (!Array.isArray(primary) || !primary.length) return Array.isArray(secondary) ? secondary : [];
  if (!Array.isArray(secondary) || !secondary.length) return primary;
  const p = Math.max(0.05, Math.min(0.95, Number(primaryWeight) || 0.65));
  const s = 1 - p;
  const bucket = new Map();
  primary.forEach((item) => {
    const label = String(item?.label || "");
    if (!label) return;
    bucket.set(label, (bucket.get(label) || 0) + Number(item?.val || 0) * p);
  });
  secondary.forEach((item) => {
    const label = String(item?.label || "");
    if (!label) return;
    bucket.set(label, (bucket.get(label) || 0) + Number(item?.val || 0) * s);
  });
  const out = Array.from(bucket.entries())
    .map(([label, val], idx) => ({ idx, label, val }))
    .sort((a, b) => b.val - a.val);
  const sum = out.reduce((acc, item) => acc + item.val, 0) || 1;
  return out.map((item, idx) => ({ ...item, idx, val: item.val / sum }));
}

function applyEnsembleDisagreementPenalty(combinedSorted = [], members = [], options = {}) {
  if (!Array.isArray(combinedSorted) || combinedSorted.length < 2) {
    return {
      sorted: Array.isArray(combinedSorted) ? combinedSorted : [],
      stats: { applied: false, avgTopStd: 0, maxTopStd: 0 }
    };
  }
  if (!Array.isArray(members) || members.length < 2) {
    return {
      sorted: combinedSorted,
      stats: { applied: false, avgTopStd: 0, maxTopStd: 0 }
    };
  }

  const alpha = Math.max(0, Math.min(3, Number(options.alpha ?? 1.6)));
  const topK = Math.max(2, Math.min(8, Number(options.topK ?? 5)));
  const memberMaps = members.map((item) => {
    const map = new Map();
    (item?.rawSorted || []).forEach((row) => {
      const label = String(row?.label || "");
      if (!label) return;
      map.set(label, Number(row?.val || 0));
    });
    return map;
  });

  const adjusted = combinedSorted.map((item, idx) => {
    const label = String(item?.label || "");
    const probs = memberMaps.map((m) => Number(m.get(label) || 0));
    const mean = probs.reduce((acc, p) => acc + p, 0) / probs.length;
    const variance = probs.reduce((acc, p) => acc + (p - mean) * (p - mean), 0) / probs.length;
    const std = Math.sqrt(Math.max(0, variance));
    const topWeight = idx < topK ? 1 : 0.6;
    const penalty = Math.max(0.78, 1 - std * alpha * topWeight);
    return {
      ...item,
      val: Number(item?.val || 0) * penalty,
      _std: std
    };
  });

  const sum = adjusted.reduce((acc, item) => acc + Number(item?.val || 0), 0) || 1;
  const sorted = adjusted
    .map((item, idx) => ({ ...item, idx, val: Number(item.val || 0) / sum }))
    .sort((a, b) => b.val - a.val)
    .map((item, idx) => ({ idx, label: item.label, val: item.val, std: item._std }));

  const top = sorted.slice(0, 3);
  const avgTopStd = top.length
    ? top.reduce((acc, item) => acc + Number(item.std || 0), 0) / top.length
    : 0;
  const maxTopStd = top.length ? Math.max(...top.map((item) => Number(item.std || 0))) : 0;

  return {
    sorted: sorted.map((item) => ({ idx: item.idx, label: item.label, val: item.val })),
    stats: {
      applied: true,
      avgTopStd: Number(avgTopStd.toFixed(4)),
      maxTopStd: Number(maxTopStd.toFixed(4))
    }
  };
}

function applyPriorCorrection(sortedItems = [], priorConfig = null) {
  if (!Array.isArray(sortedItems) || !sortedItems.length) return [];
  if (!priorConfig || priorConfig.enabled === false) return sortedItems;
  const classPriors = priorConfig.class_priors || {};
  const targetPriors = priorConfig.target_priors || {};
  const strength = Math.max(0, Math.min(1.5, Number(priorConfig.strength ?? 0.55)));

  const corrected = sortedItems.map((item) => {
    const label = String(item?.label || "");
    const key = normalizeLabelKey(label);
    const trainPrior = Number(classPriors[label] ?? classPriors[key] ?? 0);
    const targetPrior = Number((targetPriors[label] ?? targetPriors[key] ?? trainPrior) || 0);
    if (!trainPrior || !targetPrior) return { ...item };
    const ratio = Math.max(0.2, Math.min(5, targetPrior / trainPrior));
    const adjusted = Number(item?.val || 0) * Math.pow(ratio, strength);
    return { ...item, val: adjusted };
  });
  const sum = corrected.reduce((acc, item) => acc + Number(item?.val || 0), 0) || 1;
  return corrected
    .map((item, idx) => ({ ...item, idx, val: Number(item.val || 0) / sum }))
    .sort((a, b) => b.val - a.val)
    .map((item, idx) => ({ ...item, idx }));
}

function adaptPredictionDistribution(sortedItems = [], ctx = {}) {
  if (!Array.isArray(sortedItems) || sortedItems.length < 2) return sortedItems;
  const quality = Math.max(0, Math.min(1, Number(ctx.qualityScore ?? 0.62)));
  const plantScore = Math.max(0, Math.min(1, Number(ctx.plantScore ?? 0.62)));
  const entropy = entropyNormalized(sortedItems);
  let gamma = 1;
  gamma += (quality - 0.5) * 0.38;
  gamma += (plantScore - 0.5) * 0.33;
  gamma += (0.5 - entropy) * 0.48;
  if (String(ctx.source || "").includes("fallback")) gamma -= 0.1;
  gamma = Math.max(0.78, Math.min(1.34, gamma));

  const adjusted = sortedItems.map((item) => ({
    ...item,
    val: Math.pow(Math.max(1e-9, Number(item?.val || 0)), gamma)
  }));
  const sum = adjusted.reduce((acc, item) => acc + Number(item?.val || 0), 0) || 1;
  return adjusted
    .map((item, idx) => ({ ...item, idx, val: Number(item.val || 0) / sum }))
    .sort((a, b) => b.val - a.val)
    .map((item, idx) => ({ ...item, idx }));
}

function computeEnsembleConsensus(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  const topLabels = items
    .map((item) => String(item?.rawSorted?.[0]?.label || ""))
    .filter(Boolean);
  if (!topLabels.length) return null;

  const counts = topLabels.reduce((acc, label) => {
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [winnerLabel, winnerVotes] = entries[0] || ["", 0];
  const ratio = topLabels.length ? winnerVotes / topLabels.length : 0;

  return {
    size: topLabels.length,
    winnerLabel,
    winnerVotes,
    agreement: Number(ratio.toFixed(3)),
    disagreement: Number((1 - ratio).toFixed(3)),
    unstable: ratio < 0.67,
    distinctTopLabels: entries.length
  };
}

async function analyzeImageQuality(buffer) {
  const size = 96;
  const { data } = await toRgbRaw(() => sharp(buffer), size, "inside");

  let sum = 0;
  let sumSq = 0;
  const total = size * size;
  for (let i = 0; i < total; i += 1) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / total;
  const variance = Math.max(sumSq / total - mean * mean, 0);
  const contrast = Math.sqrt(variance);

  const warnings = [];
  if (mean < 0.25) warnings.push("Dusuk isik: goruntu karanlik olabilir.");
  if (mean > 0.85) warnings.push("Asiri isik: goruntu patlak olabilir.");
  if (contrast < 0.08) warnings.push("Dusuk kontrast: detaylar kaybolmus olabilir.");

  const score = Math.max(0.35, 1 - warnings.length * 0.2);
  return {
    score: Number(score.toFixed(2)),
    brightness: Number(mean.toFixed(2)),
    contrast: Number(contrast.toFixed(2)),
    warnings
  };
}

async function analyzePlantLikelihood(buffer) {
  const size = 64;
  const { data } = await toRgbRaw(() => sharp(buffer), size, "inside");

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const total = size * size;
  for (let i = 0; i < total; i += 1) {
    sumR += data[i * 3] / 255;
    sumG += data[i * 3 + 1] / 255;
    sumB += data[i * 3 + 2] / 255;
  }
  const rMean = sumR / total;
  const gMean = sumG / total;
  const bMean = sumB / total;
  const sum = rMean + gMean + bMean || 1;
  const greenRatio = gMean / sum;
  const dominance = gMean - Math.max(rMean, bMean);

  const scale = (value, min, max) =>
    Math.max(0, Math.min(1, (value - min) / (max - min)));
  const score =
    0.6 * scale(greenRatio, 0.22, 0.45) + 0.4 * scale(dominance, 0.02, 0.18);

  const label = score >= 0.6 ? "yuksek" : score >= 0.4 ? "orta" : "dusuk";
  const reason =
    label === "yuksek"
      ? "Yesil tonlar baskin, bitki olma olasiligi yuksek."
      : label === "orta"
        ? "Bitki olabilir ama arka plan/isik etkisi var."
        : "Bitki dokusu/renkleri zayif, kadraj kontrol edilmeli.";

  return {
    score: Number(score.toFixed(2)),
    label,
    greenRatio: Number(greenRatio.toFixed(2)),
    dominance: Number(dominance.toFixed(2)),
    reason
  };
}

function fallbackDiagnosis(buffer, plant = null, ctx = {}) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const seed = parseInt(hash.slice(0, 8), 16);
  const allLabels = Object.keys(labelMetadata).length ? Object.keys(labelMetadata) : ["unknown"];
  const byPlant = plant
    ? allLabels.filter((item) => labelToPlantId(item) === plant)
    : allLabels;
  const pool = byPlant.length ? byPlant : allLabels;
  const nonHealthyPool = pool.filter((item) => !String(item).toLowerCase().includes("healthy"));
  const healthyPool = pool.filter((item) => String(item).toLowerCase().includes("healthy"));

  let pick = "unknown";
  if (nonHealthyPool.length) {
    pick = nonHealthyPool[seed % nonHealthyPool.length];
  } else if (healthyPool.length) {
    pick = healthyPool[seed % healthyPool.length];
  } else if (pool.length) {
    pick = pool[seed % pool.length];
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const qualityScore = clamp(ctx?.quality?.score ?? 0.58, 0, 1);
  const plantScore = clamp(ctx?.plantCheck?.score ?? 0.58, 0, 1);
  const qualityPenalty = 1 - (qualityScore * 0.7 + plantScore * 0.3);
  const temperature = clamp(1 + qualityPenalty * 0.9, 0.8, 1.9);

  // Fallback dagilimi deterministic + kaliteye duyarli uretilir.
  const pseudoScores = pool.map((item, idx) => {
    const h = crypto
      .createHash("sha256")
      .update(`${seed}:${item}:${idx}`)
      .digest("hex");
    const value = (parseInt(h.slice(0, 6), 16) % 1000) / 1000; // [0,1)
    const centered = (value - 0.5) * 2; // [-1,1]
    const plantBoost = plant && labelToPlantId(item) === plant ? 0.24 : 0;
    const healthyPenalty =
      String(item).toLowerCase().includes("healthy") && qualityPenalty > 0.45 ? 0.08 : 0;
    const logit = (centered + plantBoost - healthyPenalty) / temperature;
    return { label: item, logit };
  });

  const maxLogit = Math.max(...pseudoScores.map((item) => item.logit));
  const expScores = pseudoScores.map((item) => ({
    label: item.label,
    raw: Math.exp(item.logit - maxLogit)
  }));
  const expSum = expScores.reduce((acc, item) => acc + item.raw, 0) || 1;
  const normalized = expScores.map((item, idx) => ({
    idx,
    label: item.label,
    val: item.raw / expSum
  }));
  const sorted = normalized
    .sort((a, b) => b.val - a.val);
  const topChunk = sorted.slice(0, Math.min(6, sorted.length));
  const chunkSum = topChunk.reduce((acc, item) => acc + item.val, 0) || 1;
  const renormChunk = topChunk.map((item) => ({ ...item, val: item.val / chunkSum }));
  const topLabel = renormChunk[0]?.label || pick;
  const top1 = Number(renormChunk[0]?.val || 0.34);
  const top2 = Number(renormChunk[1]?.val || 0);
  const margin = Math.max(0, top1 - top2);
  const entropy = entropyNormalized(renormChunk);
  const baseConf = top1 * 0.62 + margin * 0.26 + (1 - entropy) * 0.12;
  const qualityFactor = 0.82 + qualityScore * 0.12 + plantScore * 0.06;
  const topConfidence = clamp(baseConf * qualityFactor, 0.18, 0.78);
  return {
    label: topLabel,
    confidence: Number(topConfidence.toFixed(4)),
    sorted: renormChunk
  };
}

function classifyModelFailure(detail = "") {
  const text = String(detail || "").toLowerCase();
  if (!text) return "unknown_inference_error";
  if (text.includes("model_unavailable_strict")) return "model_unavailable";
  if (text.includes("model_output_mismatch")) return "output_mismatch";
  if (text.includes("model_labels_missing")) return "labels_missing";
  if (text.includes("onnx_all_failed") || text.includes("onnx_fallback")) return "onnx_failed";
  if (text.includes("timeout") || text.includes("abort")) return "timeout";
  if (text.includes("model_api_not_configured")) return "api_not_configured";
  if (text.includes("http ")) return "remote_model_http_error";
  if (text.includes("python")) return "python_infer_failed";
  return "unknown_inference_error";
}

function buildModelInferenceFailurePayload(detail = "") {
  const failureCode = classifyModelFailure(detail);
  const actionMap = {
    model_unavailable: "Model dosyasini ve backend yuklenmesini kontrol edin.",
    output_mismatch: "Model cikti boyutu ile labels.json uyumunu duzeltin.",
    labels_missing: "labels.json ve model metadata dosyalarini kontrol edin.",
    onnx_failed: "ONNX model dosyasi bozuk veya yuklenemiyor; modeli yeniden export edin.",
    timeout: "Model timeout oldu; istek boyutu ve sunucu kaynaklarini kontrol edin.",
    api_not_configured: "MODEL_API_URL / TOKEN ayarlanmamis.",
    remote_model_http_error: "Harici model API hata donuyor; endpoint ve tokeni kontrol edin.",
    python_infer_failed: "Python inference ortami veya checkpoint bozuk.",
    unknown_inference_error: "Server loglarini kontrol ederek modeli tekrar yukleyin."
  };
  return {
    error: "model_inference_failed",
    detail: String(detail || "inference_failed"),
    failureCode,
    action: actionMap[failureCode] || actionMap.unknown_inference_error,
    strictMode: true
  };
}

function recordModelFailure(stage = "infer", detail = "") {
  const failureCode = classifyModelFailure(detail);
  modelLastFailure = {
    stage,
    detail: String(detail || "inference_failed"),
    failureCode,
    at: new Date().toISOString()
  };
  recordModelEventStat({
    type: "predict_fail",
    stage,
    failureCode
  });
}

function clearModelFailureOnSuccess() {
  modelLastSuccessAt = new Date().toISOString();
}

function buildModelHealthSummary() {
  const pipelines = getOnnxPipelines();
  const activeLabels = getActiveLabels();
  const checks = {
    strictMode: MODEL_STRICT_ONLY,
    modelPathExists: fs.existsSync(MODEL_PATH),
    secondaryModelPathExists: fs.existsSync(MODEL_PATH_SECONDARY),
    labelsPathExists: fs.existsSync(LABELS_PATH),
    labelsCount: activeLabels.length,
    primaryLoaded: Boolean(modelSession),
    secondaryLoaded: Boolean(modelSessionSecondary),
    pipelineCount: pipelines.length
  };
  const recommendations = [];
  if (!checks.modelPathExists) recommendations.push("model.onnx dosyasi eksik.");
  if (!checks.labelsPathExists) recommendations.push("labels.json dosyasi eksik.");
  if (!checks.primaryLoaded) recommendations.push("Primary ONNX modeli yuklenemedi.");
  if (!checks.pipelineCount) recommendations.push("En az bir inference pipeline gerekli.");
  if (checks.labelsCount <= 0) recommendations.push("Etiket listesi bos.");
  if (modelLastFailure?.failureCode === "output_mismatch") {
    recommendations.push("Model cikti boyutu ile labels.json uyumunu kontrol edin.");
  }
  return {
    updatedAt: new Date().toISOString(),
    checks,
    pipelines: pipelines.map((item) => item.id),
    lastFailure: modelLastFailure,
    lastSuccessAt: modelLastSuccessAt,
    healthy: recommendations.length === 0,
    recommendations
  };
}

function buildFeatureFlags() {
  const pipelines = getOnnxPipelines();
  return {
    modelHealth: true,
    modelSelfCheck: true,
    modelDiagnostics: true,
    tradeMarket: true,
    landPricing: true,
    weather: true,
    soil: true,
    strictModelMode: MODEL_STRICT_ONLY,
    onnxPipelineCount: pipelines.length
  };
}

function recordModelPredictionStat(payload = {}) {
  modelPredictionStats.push({
    ts: Date.now(),
    label: String(payload.label || ""),
    confidence: Math.max(0, Math.min(1, Number(payload.confidence) || 0)),
    source: String(payload.source || "unknown"),
    plant: payload.plant ? String(payload.plant) : null,
    status: String(payload.status || "unknown")
  });
  if (modelPredictionStats.length > MODEL_STATS_WINDOW) {
    modelPredictionStats.splice(0, modelPredictionStats.length - MODEL_STATS_WINDOW);
  }
  recordModelEventStat({
    type: "predict_ok",
    source: String(payload.source || "unknown"),
    status: String(payload.status || "unknown")
  });
}

function recordModelEventStat(payload = {}) {
  modelEventStats.push({
    ts: Date.now(),
    type: String(payload.type || "unknown"),
    source: payload.source ? String(payload.source) : null,
    status: payload.status ? String(payload.status) : null,
    stage: payload.stage ? String(payload.stage) : null,
    failureCode: payload.failureCode ? String(payload.failureCode) : null
  });
  if (modelEventStats.length > MODEL_EVENT_WINDOW) {
    modelEventStats.splice(0, modelEventStats.length - MODEL_EVENT_WINDOW);
  }
}

function summarizeModelDiagnostics() {
  const rows = modelPredictionStats.slice();
  const n = rows.length;
  const recent = rows
    .slice(Math.max(0, rows.length - 10))
    .map((item) => ({
      at: new Date(item.ts).toISOString(),
      label: item.label,
      confidence: Number(item.confidence.toFixed(4)),
      source: item.source,
      status: item.status
    }))
    .reverse();
  const recentFailures = modelEventStats
    .filter((item) => item.type === "predict_fail")
    .slice(Math.max(0, modelEventStats.length - 8))
    .map((item) => ({
      at: new Date(item.ts).toISOString(),
      stage: item.stage || "infer",
      failureCode: item.failureCode || "unknown"
    }))
    .reverse();
  const predictOkEvents = modelEventStats.filter((item) => item.type === "predict_ok").length;
  const predictFailEvents = modelEventStats.filter((item) => item.type === "predict_fail").length;
  const totalPredictEvents = predictOkEvents + predictFailEvents;
  const failureRate = totalPredictEvents ? predictFailEvents / totalPredictEvents : null;
  if (!n) {
    return {
      windowSize: MODEL_STATS_WINDOW,
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
      recentPredictions: recent,
      failureRate,
      predictEventWindow: MODEL_EVENT_WINDOW,
      recentFailures,
      lowVarianceWarning: false
    };
  }
  const confidences = rows.map((item) => item.confidence);
  const mean = confidences.reduce((a, b) => a + b, 0) / n;
  const variance = confidences.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const min = Math.min(...confidences);
  const max = Math.max(...confidences);
  const healthyCount = rows.filter((item) => item.label.toLowerCase().includes("healthy")).length;
  const sourceBreakdown = rows.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {});
  const statusBreakdown = rows.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const labelCounts = rows.reduce((acc, item) => {
    const key = item.label || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const dominantLabelCount = Math.max(...Object.values(labelCounts));
  const topLabels = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      share: Number((count / n).toFixed(4))
    }));
  const labelDiversity = new Set(rows.map((item) => item.label)).size;
  const fallbackCount = rows.filter((item) => item.source.includes("fallback")).length;
  const fallbackRate = fallbackCount / n;
  const dominantLabelShare = dominantLabelCount / n;
  const lowVarianceThreshold = Number(process.env.MODEL_CONF_STD_WARN || 0.04);
  const lowVarianceWarning = n >= 20 && std < lowVarianceThreshold;
  const lowDiversityWarning = n >= 20 && labelDiversity <= Number(process.env.MODEL_LABEL_DIVERSITY_WARN || 2);
  const healthySkewWarning =
    n >= 20 &&
    (healthyCount / n >= Number(process.env.MODEL_HEALTHY_SKEW_WARN || 0.9) ||
      healthyCount / n <= Number(process.env.MODEL_ISSUE_SKEW_WARN || 0.1));
  const highFallbackWarning = n >= 10 && fallbackRate > Number(process.env.MODEL_FALLBACK_RATE_WARN || 0.2);
  const highFailureRateWarning =
    totalPredictEvents >= 12 &&
    (failureRate || 0) > Number(process.env.MODEL_FAILURE_RATE_WARN || 0.18);
  const recommendations = [];
  if (lowVarianceWarning) {
    recommendations.push("Guven dagilimi dar. Siniflar arasi ayrimi artirmak icin model kalibrasyonu yapin.");
  }
  if (lowDiversityWarning) {
    recommendations.push("Sinif cesitliligi dusuk. Veri dengesini ve bitki filtresi ayarini kontrol edin.");
  }
  if (healthySkewWarning) {
    recommendations.push("Healthy/issue dagilimi asiri kayik. Etiket dagilimini ve threshold degerlerini gozden gecirin.");
  }
  if (highFallbackWarning) {
    recommendations.push("Fallback orani yuksek. ONNX model yukleme ve inference hatalarini inceleyin.");
  }
  if (highFailureRateWarning) {
    recommendations.push("Model hata orani yuksek. model/labels uyumu ve runtime loglarini kontrol edin.");
  }

  return {
    windowSize: MODEL_STATS_WINDOW,
    sampleCount: n,
    confidence: {
      mean: Number(mean.toFixed(4)),
      std: Number(std.toFixed(4)),
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4))
    },
    labelDiversity,
    healthyRate: Number((healthyCount / n).toFixed(4)),
    sourceBreakdown,
    statusBreakdown,
    fallbackRate: Number(fallbackRate.toFixed(4)),
    dominantLabelShare: Number(dominantLabelShare.toFixed(4)),
    topLabels,
    warnings: {
      lowVariance: lowVarianceWarning,
      lowDiversity: lowDiversityWarning,
      healthySkew: healthySkewWarning,
      highFallback: highFallbackWarning,
      highFailureRate: highFailureRateWarning
    },
    recommendations,
    recentPredictions: recent,
    failureRate: Number((failureRate || 0).toFixed(4)),
    predictEventWindow: MODEL_EVENT_WINDOW,
    recentFailures,
    lowVarianceWarning,
    lowVarianceThreshold,
    lastPredictionAt: new Date(rows[rows.length - 1].ts).toISOString()
  };
}

async function runModelSelfCheck() {
  const pipelines = getOnnxPipelines();
  const checks = [];
  if (!pipelines.length) {
    return {
      updatedAt: new Date().toISOString(),
      ok: false,
      summary: "No ONNX pipeline loaded",
      checks: [{ id: "pipelines", ok: false, detail: "No ONNX pipeline loaded" }]
    };
  }
  const probeBuffer = await sharp({
    create: {
      width: Math.max(64, INPUT_SIZE),
      height: Math.max(64, INPUT_SIZE),
      channels: 3,
      background: { r: 90, g: 120, b: 95 }
    }
  })
    .png()
    .toBuffer();

  for (const pipeline of pipelines) {
    const labelsRef = pipeline.labels || [];
    try {
      const logits = await runWithQueue(async () =>
        inferOnnx(probeBuffer, INPUT_SIZE, normMean, normStd, pipeline.session)
      );
      const match = logits.length === labelsRef.length;
      checks.push({
        id: pipeline.id,
        ok: match,
        logits: logits.length,
        labels: labelsRef.length,
        detail: match ? "output_ok" : "output_label_mismatch"
      });
    } catch (err) {
      checks.push({
        id: pipeline.id,
        ok: false,
        logits: null,
        labels: labelsRef.length,
        detail: String(err?.message || err || "infer_failed")
      });
    }
  }
  const ok = checks.every((item) => item.ok);
  return {
    updatedAt: new Date().toISOString(),
    ok,
    summary: ok ? "All pipelines healthy" : "Some pipelines failed",
    checks
  };
}

function prettyLabel(label) {
  if (!label) return "Bilinmeyen";
  return label
    .replace(/___/g, " - ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabelKey(label) {
  if (!label) return "";
  return label
    .replace(/__+/g, "___")
    .replace(/\s+/g, " ")
    .replace(/\s-\s/g, "___")
    .replace(/,\s?/g, ",")
    .replace(/\s+_+\s+/g, "___")
    .trim();
}

function labelToPlantId(label) {
  if (!label) return null;
  const base = label.split("___")[0];
  const normalized = base
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const map = {
    apple: "apple",
    elma: "apple",
    blueberry: "blueberry",
    yaban_mersini: "blueberry",
    cherry: "cherry",
    cherry_including_sour: "cherry",
    kiraz: "cherry",
    corn: "corn",
    maize: "corn",
    corn_maize: "corn",
    misir: "corn",
    grape: "grape",
    uzum: "grape",
    orange: "orange",
    portakal: "orange",
    peach: "peach",
    seftali: "peach",
    pepper_bell: "pepper",
    pepper: "pepper",
    biber: "pepper",
    potato: "potato",
    patates: "potato",
    raspberry: "raspberry",
    ahududu: "raspberry",
    soybean: "soybean",
    soya: "soybean",
    squash: "squash",
    kabak: "squash",
    strawberry: "strawberry",
    cilek: "strawberry",
    tomato: "tomato",
    domates: "tomato"
  };
  if (map[normalized]) return map[normalized];
  const contains = (key) => normalized.includes(key);
  if (contains("tomato")) return "tomato";
  if (contains("potato")) return "potato";
  if (contains("pepper")) return "pepper";
  if (contains("apple")) return "apple";
  if (contains("corn") || contains("maize")) return "corn";
  if (contains("grape")) return "grape";
  if (contains("orange")) return "orange";
  if (contains("peach")) return "peach";
  if (contains("blueberry")) return "blueberry";
  if (contains("raspberry")) return "raspberry";
  if (contains("soybean")) return "soybean";
  if (contains("squash")) return "squash";
  if (contains("strawberry")) return "strawberry";
  if (contains("cherry")) return "cherry";
  return null;
}

function normalizePlantInput(rawPlant, supportedPlantIds = []) {
  if (rawPlant === null || rawPlant === undefined) return null;
  const raw = String(rawPlant).trim();
  if (!raw) return null;

  const normalizedToken = raw
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const candidates = [
    labelToPlantId(raw),
    labelToPlantId(`${raw}___x`),
    labelToPlantId(normalizedToken),
    normalizedToken || null
  ].filter(Boolean);

  const uniqCandidates = Array.from(new Set(candidates));
  if (!supportedPlantIds.length) return uniqCandidates[0] || null;

  for (const candidate of uniqCandidates) {
    if (supportedPlantIds.includes(candidate)) return candidate;
  }
  return null;
}

function confidenceTier(value) {
  if (value >= 0.7) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function explainDiagnosis(label, quality, confidence, margin) {
  const reasons = [];
  if (!label) return reasons;
  const lower = label.toLowerCase();
  if (lower.includes("healthy")) reasons.push("Belirti bulunamadi, saglikli doku baskin.");
  if (lower.includes("spot")) reasons.push("Yuvarlak/duzensiz leke paterni algilandi.");
  if (lower.includes("blight")) reasons.push("Genis leke ve doku solmasi sinyali algilandi.");
  if (lower.includes("mold")) reasons.push("Kuflenme benzeri doku bozulmasi algilandi.");
  if (lower.includes("scab")) reasons.push("Kabuk benzeri piturleri tespit etti.");
  if (lower.includes("rot")) reasons.push("Doku curumesi veya yumusama sinyali algilandi.");
  if (lower.includes("rust")) reasons.push("Pas benzeri renklenme paterni tespit edildi.");
  if (lower.includes("mildew")) reasons.push("Pudramsi/kuf benzeri gorunum algilandi.");
  if (lower.includes("virus") || lower.includes("mosaic")) {
    reasons.push("Mozaik veya damar bozulmasi izleri olasilik dahilinde.");
  }
  if (lower.includes("leaf curl")) reasons.push("Yaprak kivrilmasi ve deformasyon sinyali.");
  if (lower.includes("bacterial")) reasons.push("Bakteriyel kaynakli leke paterni olasiligi.");
  if (quality?.brightness < 0.25) reasons.push("Dusuk isik nedeniyle detaylar zayif.");
  if (quality?.contrast < 0.08) reasons.push("Dusuk kontrast: sinirlar net degil.");
  if (confidence !== null && confidence < 0.45) reasons.push("Guven dusuk, netlik ihtiyaci var.");
  if (typeof margin === "number") {
    if (margin < 0.12) reasons.push("Siniflar birbirine yakin, ayrim net degil.");
    if (margin > 0.3 && confidence > 0.7) {
      reasons.push("Model siniflar arasi ayrimi net buldu.");
    }
  }
  return reasons;
}

function buildRetryPlan(ctx = {}) {
  const tips = new Map();
  const pushTip = (id, text, priority, reason) => {
    if (!id || !text) return;
    const current = tips.get(id);
    const item = {
      id,
      text,
      priority: Math.max(1, Math.min(5, Number(priority) || 1)),
      reason: reason || null
    };
    if (!current || item.priority > current.priority) {
      tips.set(id, item);
    }
  };

  pushTip("closeup", "Yapragi yakin plandan cekin.", 3, "detay");
  pushTip("lighting", "Iyi isik (gunesli ama patlamayan) ortam secin.", 3, "goruntu");

  if (ctx.qualityGate || (ctx.qualityWarnings || 0) > 0) {
    pushTip("lens", "Kamera lensini temizleyin, bulanikligi azaltin.", 5, "kalite");
    pushTip("light_balance", "Asiri golge veya patlayan isiktan kacin.", 4, "kalite");
  }
  if (ctx.nonPlantSuspected) {
    pushTip(
      "framing",
      "Kadrajda arka plan yerine yaprak/gozlenen bolgeyi ortalayin.",
      5,
      "kadraj"
    );
  }
  if (ctx.lowMargin || ctx.lowConfidence) {
    pushTip("multi_angle", "Ayni belirtinin farkli acilarini 2-3 kare cekin.", 4, "belirsizlik");
  }
  if (ctx.plantMismatch) {
    pushTip(
      "confirm_plant",
      "Secilen bitkiyi dogrulayin; farkli bitki yapragi cekimi karisiklik yaratabilir.",
      5,
      "bitki"
    );
  }
  if (ctx.ambiguityHigh) {
    pushTip(
      "macro_focus",
      "Semptomlu bolgeyi yakin/tek odakli bir kareyle tekrar cekin.",
      5,
      "belirsizlik"
    );
  }
  if (ctx.ensembleDisagreement || ctx.lowReliability) {
    pushTip(
      "cross_leaf",
      "Benzer semptomlu baska yaprakla dogrulama cekimi yapin.",
      5,
      "dogrulama"
    );
  }
  if (ctx.highUncertainty) {
    pushTip(
      "repeat_batch",
      "Ayni parcadan 2 ek cekim alip ortak sonucu karsilastirin.",
      5,
      "belirsizlik"
    );
  }
  pushTip("background", "Arka plan sade olsun.", 2, "goruntu");

  return Array.from(tips.values())
    .sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text, "tr"))
    .slice(0, 6);
}

function inferSeverity(label, status = null) {
  if (status === "issue") return "medium";
  if (status === "review") return "medium";
  if (status === "healthy") return "low";
  if (!label) return "low";
  return label.toLowerCase().includes("healthy") ? "low" : "medium";
}

function inferStatus(label, ctx = {}) {
  if (!label) return "unknown";
  const lower = label.toLowerCase();
  const isHealthy = lower.includes("healthy");
  if (!isHealthy) {
    if (ctx.issueHealthyConflict || ctx.classConflictHigh || ctx.uncertaintyHigh) return "review";
    return "issue";
  }

  const healthyMinConf = Number(process.env.MODEL_HEALTHY_MIN_CONF || 0.68);
  const healthyMinMargin = Number(process.env.MODEL_HEALTHY_MIN_MARGIN || 0.16);
  const healthyAltConf = Number(process.env.MODEL_HEALTHY_ALT_CONF || 0.18);

  if (ctx.filterBlocked) return "unknown";
  if (ctx.plantMismatch) return "review";
  if (ctx.source && String(ctx.source).includes("fallback")) return "review";
  if (typeof ctx.plantScore === "number" && ctx.plantScore < 0.35) return "review";
  if (ctx.ensembleUnstable) return "review";
  if (ctx.ambiguityHigh) return "review";
  if (ctx.healthyIssueConflict || ctx.classConflictHigh) return "review";
  if (ctx.uncertaintyHigh) return "review";
  if (ctx.reliabilityUnstable) return "review";
  if (ctx.lowConfidence) return "review";
  if (typeof ctx.top1 === "number" && ctx.top1 < healthyMinConf) return "review";
  if (
    typeof ctx.margin === "number" &&
    typeof ctx.minMargin === "number" &&
    (ctx.margin < ctx.minMargin || ctx.margin < healthyMinMargin)
  ) {
    return "review";
  }
  if (Array.isArray(ctx.topPredictions)) {
    const hasStrongAltIssue = ctx.topPredictions.some((item, idx) => {
      if (idx === 0) return false;
      const itemLabel = String(item?.label || "").toLowerCase();
      const conf = Number(item?.confidence ?? 0);
      return !itemLabel.includes("healthy") && conf >= healthyAltConf;
    });
    if (hasStrongAltIssue) return "review";
  }
  return "healthy";
}

function inferProblemArea(label) {
  if (!label) return "Belirsiz";
  const lower = label.toLowerCase();
  if (lower.includes("leaf") || lower.includes("spot") || lower.includes("blight")) {
    return "Yaprak";
  }
  if (lower.includes("fruit")) {
    return "Meyve";
  }
  if (lower.includes("stem") || lower.includes("mold")) {
    return "Govde";
  }
  if (lower.includes("mite")) {
    return "Yaprak alti";
  }
  return "Yaprak";
}

function buildDefaultTreatments({ label = "", diseaseName = "", status = "" } = {}) {
  const lower = `${String(label || "").toLowerCase()} ${String(diseaseName || "").toLowerCase()}`;
  if (status === "healthy" || lower.includes("healthy")) {
    return {
      organic: [
        "Koruyucu plan: sabah sulamasi + yaprak islakligini azalt.",
        "Haftalik saha kontrolu ve hijyen uygulamasi yap."
      ],
      chemical: []
    };
  }
  if (lower.includes("virus") || lower.includes("mosaic") || lower.includes("curl")) {
    return {
      organic: [
        "Enfekte bitkiyi ayir, vektor kontrolu (beyaz sinek/yaprak biti) yap.",
        "Sari yapiskan tuzak ve hijyen protokolu uygula."
      ],
      chemical: [
        "Virus etmeninde dogrudan ilac yerine vektor kontrolu uygulanir.",
        "Etken madde secimini yalnizca ruhsat etiketi + PHI/REI kurallariyla yap."
      ]
    };
  }
  if (lower.includes("mite") || lower.includes("spider")) {
    return {
      organic: [
        "Yaprak alti odakli biyolojik/mekanik kontrol uygula."
      ],
      chemical: [
        "Akar icin secici akarisit: abamectin veya bifenazate (etikete gore).",
        "Direnc yonetimi icin etken madde rotasyonu uygula."
      ]
    };
  }
  if (
    lower.includes("blight") ||
    lower.includes("spot") ||
    lower.includes("mold") ||
    lower.includes("mildew") ||
    lower.includes("rust") ||
    lower.includes("septoria")
  ) {
    return {
      organic: [
        "Enfekte yapraklari uzaklastir, havalandirmayi artir.",
        "Bakir bazli koruyucu uygulamayi etiket sinirlarinda planla."
      ],
      chemical: [
        "Mantar etmeninde hedefli program: azoxystrobin, difenoconazole veya mancozeb (etikete gore).",
        "Doz ve tekrar araligini etikete gore uygula; hasat oncesi sureye (PHI) dikkat et."
      ]
    };
  }
  if (lower.includes("rot")) {
    return {
      organic: ["Drenaj ve sulama yonetimini duzelt, kok bolgesinde hava gecisini artir."],
      chemical: ["Toprak/kok etmenine uygun fungisit secimini etiket ve uzman onayi ile yap."]
    };
  }
  return {
    organic: [
      "Semptomlu bolgeyi izole et ve tekrar gozlem yap."
    ],
    chemical: [
      "Etmen netlesmeden genis spektrum ilaclama yapma.",
      "Uzman onayi + urun etiketi ile hedefli etken madde sec."
    ]
  };
}

function weatherCodeToText(code) {
  const map = {
    0: "Acik",
    1: "Genel olarak acik",
    2: "Parcali bulutlu",
    3: "Bulutlu",
    45: "Sis",
    48: "Kivrimli sis",
    51: "Hafif cise",
    53: "Cise",
    55: "Yogun cise",
    56: "Donan cise",
    57: "Yogun donan cise",
    61: "Hafif yagmur",
    63: "Yagmur",
    65: "Yogun yagmur",
    66: "Donan yagmur",
    67: "Yogun donan yagmur",
    71: "Hafif kar",
    73: "Kar",
    75: "Yogun kar",
    77: "Kar tanecikleri",
    80: "Hafif saganak",
    81: "Saganak",
    82: "Yogun saganak",
    85: "Hafif kar saganagi",
    86: "Yogun kar saganagi",
    95: "Gok gurultulu firtina",
    96: "Dolu riski",
    99: "Yogun dolu"
  };
  return map[code] || "Degisken";
}

function classifySoilTexture({ sand, clay, silt }) {
  if ([sand, clay, silt].some((v) => typeof v !== "number")) return "Bilinmiyor";
  if (sand > 70 && clay < 15) return "Kumlu";
  if (clay > 35) return "Killi";
  if (silt > 50) return "Siltli";
  if (sand > 50 && clay < 20) return "Kumlu-tinali";
  if (clay >= 20 && clay <= 35) return "Tinali-killi";
  return "Tinali";
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOrganic(value) {
  const numeric = toFiniteNumber(value);
  if (numeric !== null) return numeric;
  const text = String(value || "").toLowerCase();
  if (!text) return null;
  if (text.includes("dusuk")) return 0.9;
  if (text.includes("orta")) return 1.8;
  if (text.includes("yuksek")) return 3.2;
  return null;
}

function buildSoilRecommendations({ soilType, ph, organic }) {
  const soilTypeLower = String(soilType || "").toLowerCase();
  const phNum = toFiniteNumber(ph);
  const organicNum = normalizeOrganic(organic);

  const recommended = [];
  const risky = [];
  const diseaseRisk = [];

  if (soilTypeLower.includes("kumlu")) {
    recommended.push("Patates", "Havuc", "Sogan", "Yer fistigi");
    risky.push("Pirinç", "Asiri su isteyen urunler");
    diseaseRisk.push("Su stresi", "Besin yikanmasi");
  } else if (soilTypeLower.includes("killi")) {
    recommended.push("Bugday", "Arpa", "Aycicegi", "Nohut");
    risky.push("Kok hassas sebzeler");
    diseaseRisk.push("Kok curuklugu", "Drenaj kaynakli mantar");
  } else if (soilTypeLower.includes("silt")) {
    recommended.push("Misir", "Seker pancari", "Yonca");
    risky.push("Asiri yagis alan donemlerde fide dikimi");
    diseaseRisk.push("Yuzey kabuklanmasi");
  } else {
    recommended.push("Domates", "Biber", "Bugday", "Mercimek");
    risky.push("Toprakla uyumu belirsiz urunler");
    diseaseRisk.push("Yapraksal mantar riski");
  }

  if (phNum !== null) {
    if (phNum < 5.6) {
      risky.push("Kirec seven urunler");
      diseaseRisk.push("Asidik stres");
    } else if (phNum > 7.8) {
      risky.push("Demir eksikligine hassas urunler");
      diseaseRisk.push("Mikro element baglanmasi");
    }
  }

  if (organicNum !== null && organicNum < 1.2) {
    diseaseRisk.push("Verim dusuklugu");
  }

  return {
    recommended: Array.from(new Set(recommended)).slice(0, 6),
    risky: Array.from(new Set(risky)).slice(0, 4),
    diseaseRisk: Array.from(new Set(diseaseRisk)).slice(0, 5)
  };
}

const SOIL_PLANT_RULES = {
  apple: { name: "Elma", phMin: 6, phMax: 7.2, water: ["Orta"], fertilityMin: "Orta" },
  blueberry: { name: "Yaban mersini", phMin: 4.4, phMax: 5.8, water: ["Orta", "Yuksek"], fertilityMin: "Orta" },
  cherry: { name: "Kiraz", phMin: 6, phMax: 7.4, water: ["Orta"], fertilityMin: "Orta" },
  corn: { name: "Misir", phMin: 5.8, phMax: 7.2, water: ["Orta", "Yuksek"], fertilityMin: "Yuksek" },
  grape: { name: "Uzum", phMin: 5.8, phMax: 7.4, water: ["Dusuk", "Orta"], fertilityMin: "Orta" },
  orange: { name: "Portakal", phMin: 5.8, phMax: 7.3, water: ["Orta"], fertilityMin: "Orta" },
  peach: { name: "Seftali", phMin: 6, phMax: 7.2, water: ["Orta"], fertilityMin: "Orta" },
  pepper: { name: "Biber", phMin: 6, phMax: 7.1, water: ["Orta"], fertilityMin: "Yuksek" },
  potato: { name: "Patates", phMin: 5, phMax: 6.5, water: ["Orta"], fertilityMin: "Orta" },
  raspberry: { name: "Ahududu", phMin: 5.6, phMax: 6.8, water: ["Orta"], fertilityMin: "Orta" },
  soybean: { name: "Soya", phMin: 6, phMax: 7.2, water: ["Orta"], fertilityMin: "Orta" },
  squash: { name: "Kabak", phMin: 6, phMax: 7.5, water: ["Orta", "Yuksek"], fertilityMin: "Yuksek" },
  strawberry: { name: "Cilek", phMin: 5.5, phMax: 6.8, water: ["Orta"], fertilityMin: "Orta" },
  tomato: { name: "Domates", phMin: 6, phMax: 7.2, water: ["Orta"], fertilityMin: "Yuksek" }
};

function scoreRank(level) {
  const map = { Dusuk: 1, Orta: 2, Yuksek: 3 };
  return map[level] || 2;
}

function buildPlantSuitability(report, profile) {
  const ph = toFiniteNumber(report.ph);
  const fertility = profile?.fertility || "Orta";
  const waterHolding = profile?.waterHolding || "Orta";
  const soilTypeLower = String(report.soilType || "").toLowerCase();
  const salinity = String(report.salinity || "").toLowerCase();

  return Object.entries(SOIL_PLANT_RULES)
    .map(([id, rule]) => {
      let score = 70;
      const reasons = [];

      if (ph !== null) {
        if (ph < rule.phMin) {
          score -= 12;
          reasons.push("pH dusuk");
        } else if (ph > rule.phMax) {
          score -= 12;
          reasons.push("pH yuksek");
        } else {
          score += 8;
          reasons.push("pH uygun");
        }
      } else {
        reasons.push("pH verisi sinirli");
      }

      if (rule.water.includes(waterHolding)) {
        score += 6;
        reasons.push("Su tutma uyumlu");
      } else {
        score -= 8;
        reasons.push("Su tutma uyumsuz");
      }

      if (scoreRank(fertility) >= scoreRank(rule.fertilityMin)) {
        score += 6;
        reasons.push("Verimlilik uygun");
      } else {
        score -= 10;
        reasons.push("Verimlilik dusuk");
      }

      if (id === "blueberry" && profile?.phBand !== "Asidik") {
        score -= 10;
        reasons.push("Asidik pH ihtiyaci var");
      }
      if (id === "potato" && soilTypeLower.includes("killi")) {
        score -= 6;
        reasons.push("Agir kilde yumru riski");
      }
      if ((id === "squash" || id === "corn") && waterHolding === "Dusuk") {
        score -= 6;
        reasons.push("Yuksek su ihtiyaci");
      }
      if (salinity.includes("yuksek") && (id === "strawberry" || id === "pepper")) {
        score -= 8;
        reasons.push("Tuz hassasiyeti");
      }

      const normalized = Math.max(20, Math.min(96, Math.round(score)));
      const status = normalized >= 80 ? "Uygun" : normalized >= 62 ? "Dikkat" : "Riskli";
      const recommendation =
        status === "Uygun"
          ? "Mevcut profile uygun."
          : status === "Dikkat"
            ? "Yonetimle verim artabilir."
            : "Bu profilde risk yuksek.";

      return {
        id,
        name: rule.name,
        score: normalized,
        status,
        reasons: reasons.slice(0, 3),
        recommendation
      };
    })
    .sort((a, b) => b.score - a.score);
}

function evaluateSoilHealth(report) {
  let score = 68;
  const findings = [];
  const actions = [];

  const ph = toFiniteNumber(report.ph);
  if (ph !== null) {
    if (ph < 5.5) {
      score -= 16;
      findings.push("pH asidik");
      actions.push("Kirecleme ve pH dengeleme planla.");
    } else if (ph > 7.8) {
      score -= 12;
      findings.push("pH bazik");
      actions.push("Organik maddeyi artir, mikro element takibi yap.");
    } else if (ph >= 6 && ph <= 7.4) {
      score += 8;
      findings.push("pH dengeli");
    } else {
      findings.push("pH sinira yakin");
    }
  } else {
    findings.push("pH olcumu eksik");
    actions.push("Laboratuvarda pH olcumu yap.");
  }

  const organic = normalizeOrganic(report.organic);
  if (organic !== null) {
    if (organic < 1) {
      score -= 14;
      findings.push("Organik madde dusuk");
      actions.push("Kompost/yesil gubre uygulamasi planla.");
    } else if (organic < 2.5) {
      score += 2;
      findings.push("Organik madde orta");
    } else {
      score += 10;
      findings.push("Organik madde iyi");
    }
  } else {
    findings.push("Organik madde verisi sinirli");
  }

  const bulkDensity = toFiniteNumber(report.bulkDensity);
  if (bulkDensity !== null && bulkDensity > 1.5) {
    score -= 8;
    findings.push("Sikisma riski");
    actions.push("Derin havalandirma ve toprak isleme planla.");
  }

  const soilTypeLower = String(report.soilType || "").toLowerCase();
  if (soilTypeLower.includes("kumlu")) {
    score -= 4;
    findings.push("Su tutma kapasitesi dusuk olabilir");
    actions.push("Daha sik ama kontrollu sulama uygula.");
  }
  if (soilTypeLower.includes("killi")) {
    score -= 3;
    findings.push("Drenaj takibi gerekli");
    actions.push("Yuzey su birikimine karsi drenaj ac.");
  }

  if (report.source === "soilgrids" || report.source === "soilgrids+mta") {
    score += 5;
  } else if (report.source === "demo") {
    score -= 6;
    actions.push("Canli koordinat verisiyle tekrar analiz yap.");
  }

  if (report.mta?.mineralProspect) {
    findings.push("MTA maden anomalisi mevcut");
    actions.push("Agir metal analizini laboratuvarda dogrula.");
  }

  const normalized = Math.max(25, Math.min(98, Math.round(score)));
  const grade = normalized >= 85 ? "A" : normalized >= 72 ? "B" : normalized >= 58 ? "C" : "D";
  const risk = normalized >= 80 ? "Dusuk" : normalized >= 65 ? "Orta" : "Yuksek";

  return {
    score: normalized,
    grade,
    risk,
    findings: Array.from(new Set(findings)).slice(0, 5),
    actions: Array.from(new Set(actions)).slice(0, 6)
  };
}

function buildSoilIndices(report, profile) {
  const ph = toFiniteNumber(report.ph);
  const organic = normalizeOrganic(report.organic);
  const cec = toFiniteNumber(report.cec);
  const bulkDensity = toFiniteNumber(report.bulkDensity);
  const clay = toFiniteNumber(report.clay);
  const sand = toFiniteNumber(report.sand);
  const silt = toFiniteNumber(report.silt);
  const moistureTop = toFiniteNumber(report.internetSignals?.moistureTopAvg);
  const evap = toFiniteNumber(report.internetSignals?.evapotranspirationAvg);

  let waterHoldingScore = 58;
  if (profile?.waterHolding === "Yuksek") waterHoldingScore += 20;
  if (profile?.waterHolding === "Orta") waterHoldingScore += 10;
  if (organic !== null) waterHoldingScore += Math.max(-8, Math.min(12, (organic - 1.3) * 6));
  if (clay !== null) waterHoldingScore += Math.max(-6, Math.min(8, (clay - 22) * 0.35));
  if (sand !== null && sand > 62) waterHoldingScore -= 10;
  if (moistureTop !== null) {
    if (moistureTop < 0.16) waterHoldingScore -= 9;
    else if (moistureTop <= 0.34) waterHoldingScore += 5;
    else waterHoldingScore -= 4;
  }

  let nutrientRetentionScore = 56;
  if (cec !== null) nutrientRetentionScore += Math.max(-12, Math.min(18, (cec - 10) * 1.8));
  if (organic !== null) nutrientRetentionScore += Math.max(-10, Math.min(14, (organic - 1.2) * 5.2));
  if (clay !== null) nutrientRetentionScore += Math.max(-8, Math.min(10, (clay - 20) * 0.35));
  if (ph !== null) {
    if (ph < 5.6) nutrientRetentionScore -= 10;
    else if (ph <= 7.5) nutrientRetentionScore += 8;
    else nutrientRetentionScore -= 7;
  }

  let compactionRiskScore = 28;
  if (bulkDensity !== null) compactionRiskScore += Math.max(-10, Math.min(40, (bulkDensity - 1.25) * 52));
  if (clay !== null && clay > 35) compactionRiskScore += 10;
  if (organic !== null && organic >= 2.5) compactionRiskScore -= 6;

  let erosionRiskScore = 26;
  if (sand !== null && sand > 58) erosionRiskScore += 18;
  if (silt !== null && silt > 50) erosionRiskScore += 10;
  const slopeText = String(report.trSoil?.slopeClass || "").toLowerCase();
  if (/(dik|cok|yuksek|fazla|steep)/.test(slopeText)) erosionRiskScore += 24;
  else if (/(orta|mid)/.test(slopeText)) erosionRiskScore += 10;
  const erosionText = String(report.trSoil?.erosionRisk || "").toLowerCase();
  if (/(yuksek|fazla|severe)/.test(erosionText)) erosionRiskScore += 26;
  else if (/(orta|moderate)/.test(erosionText)) erosionRiskScore += 10;

  let irrigationNeedScore = 45;
  if (profile?.waterHolding === "Dusuk") irrigationNeedScore += 22;
  if (profile?.waterHolding === "Yuksek") irrigationNeedScore -= 10;
  if (moistureTop !== null) {
    if (moistureTop < 0.16) irrigationNeedScore += 28;
    else if (moistureTop > 0.34) irrigationNeedScore -= 14;
  }
  if (evap !== null) irrigationNeedScore += Math.max(-8, Math.min(18, (evap - 0.14) * 90));

  const confidenceScore = (() => {
    let score = 40;
    if (ph !== null) score += 8;
    if (organic !== null) score += 8;
    if (cec !== null) score += 6;
    if (clay !== null && sand !== null && silt !== null) score += 12;
    if (bulkDensity !== null) score += 6;
    if (report.internetSignals) score += 8;
    if (report.trSoil?.soilMap) score += 8;
    if (report.mta?.soilMap || report.mta?.geology) score += 4;
    return Math.max(25, Math.min(98, Math.round(score)));
  })();

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
  const holding = clamp(waterHoldingScore);
  const nutrient = clamp(nutrientRetentionScore);
  const compaction = clamp(compactionRiskScore);
  const erosion = clamp(erosionRiskScore);
  const irrigationNeed = clamp(irrigationNeedScore);

  const findings = [];
  if (holding < 45) findings.push("Su tutma kapasitesi sinirli.");
  if (nutrient < 50) findings.push("Besin tutma kapasitesi dusuk.");
  if (compaction >= 65) findings.push("Toprak sikismasi riski yuksek.");
  if (erosion >= 60) findings.push("Erozyon riski belirgin.");
  if (irrigationNeed >= 65) findings.push("Sulama talebi yuksek.");
  if (confidenceScore < 60) findings.push("Veri guvenilirligi orta-alt seviyede.");

  const actions = [];
  if (holding < 50) actions.push("Malc + organik madde ile su tutmayi artir.");
  if (nutrient < 55) actions.push("Toprak analizine gore bolunmus gubreleme uygula.");
  if (compaction >= 60) actions.push("Trafik azalt, uygun nemde derin isleme planla.");
  if (erosion >= 55) actions.push("Egilime dik ekim ve ortu bitkisi kullan.");
  if (irrigationNeed >= 60) actions.push("Kademeli damla sulama periyodunu siklastir.");

  return {
    waterHoldingScore: holding,
    nutrientRetentionScore: nutrient,
    compactionRiskScore: compaction,
    erosionRiskScore: erosion,
    irrigationNeedScore: irrigationNeed,
    confidenceScore,
    findings: findings.slice(0, 5),
    actions: actions.slice(0, 5)
  };
}

function monthToSeason(month) {
  if ([12, 1, 2].includes(month)) return "kis";
  if ([3, 4, 5].includes(month)) return "ilkbahar";
  if ([6, 7, 8].includes(month)) return "yaz";
  return "sonbahar";
}

function buildSoilManagementPlan(report, profile, soilHealth, plantSuitability) {
  const season = monthToSeason(new Date().getMonth() + 1);
  const plantId = String(report.requestedPlant || "").trim();
  const plantTarget = plantSuitability.find((item) => item.id === plantId) || null;
  const soilIndices = report.soilIndices || {};
  const moisture = toFiniteNumber(report.internetSignals?.moistureTopAvg);
  const evapo = toFiniteNumber(report.internetSignals?.evapotranspirationAvg);
  const ph = toFiniteNumber(report.ph);
  const organic = normalizeOrganic(report.organic);

  let irrigationCadence = "4-6 gunde bir kontrol";
  if (soilIndices.irrigationNeedScore >= 70) irrigationCadence = "1-2 gunde bir, dusuk debi damla";
  else if (soilIndices.irrigationNeedScore >= 55) irrigationCadence = "2-3 gunde bir, parsel bazli";
  else if (soilIndices.irrigationNeedScore <= 35) irrigationCadence = "5-7 gunde bir, asiri sulamadan kacin";
  if (moisture !== null && moisture < 0.16) irrigationCadence = "Acil: bugun kademeli sulama baslat";

  let nutritionPlan = "Temel NPK + organik madde takvimi uygula";
  if (organic !== null && organic < 1.2) nutritionPlan = "Kompost/yesil gubreyi onceliklendir, azotu bolerek ver";
  if (ph !== null && ph > 7.8) nutritionPlan = "Mikro element (ozellikle Fe/Zn) yaprak uygulamasi planla";
  if (ph !== null && ph < 5.6) nutritionPlan = "pH duzenleme + dengeli taban gubre programi uygula";

  let tillagePlan = "Yuzey isleme + ot kontrolu";
  if (soilIndices.compactionRiskScore >= 62) tillagePlan = "Trafik azalt + uygun nemde derin gevsetme";
  if (soilIndices.erosionRiskScore >= 60) tillagePlan = "Egilime dik isleme + ortu bitkisi";

  const alerts = [];
  if (soilHealth.risk === "Yuksek") alerts.push("Toprak riski yuksek: ekim oncesi laboratuvar dogrulama yap.");
  if (soilIndices.irrigationNeedScore >= 70) alerts.push("Sulama talebi yuksek: gunluk nem izleme ac.");
  if (soilIndices.erosionRiskScore >= 65) alerts.push("Erozyon riski yuksek: yuzey koruma gerekli.");
  if (soilIndices.compactionRiskScore >= 65) alerts.push("Sikisma riski yuksek: agir ekipman gecisini sinirla.");
  if (report.mta?.mineralProspect) alerts.push("MTA anomalisi var: agir metal analizini ihmal etme.");

  const monitor = [
    `Sezon: ${season}`,
    `Nem takibi: ${moisture === null ? "veri sinirli" : `0-1cm ${moisture}`}`,
    `ET: ${evapo === null ? "veri sinirli" : `${evapo} mm/saat ort.`}`,
    plantTarget ? `${plantTarget.name} uygunluk: ${plantTarget.score}/100 (${plantTarget.status})` : null
  ].filter(Boolean);

  return {
    season,
    irrigation: irrigationCadence,
    nutrition: nutritionPlan,
    tillage: tillagePlan,
    monitoring: monitor,
    alerts: alerts.slice(0, 5)
  };
}

function buildSoilProfile(report) {
  const soilTypeLower = String(report.soilType || "").toLowerCase();
  const ph = toFiniteNumber(report.ph);
  const organic = normalizeOrganic(report.organic);
  const cec = toFiniteNumber(report.cec);

  const waterHolding = soilTypeLower.includes("killi")
    ? "Yuksek"
    : soilTypeLower.includes("kumlu")
      ? "Dusuk"
      : "Orta";
  const fertility = organic !== null && organic >= 2.5 && (cec === null || cec >= 10)
    ? "Yuksek"
    : organic !== null && organic >= 1.2
      ? "Orta"
      : "Dusuk";
  const phBand = ph === null ? "Bilinmiyor" : ph < 5.6 ? "Asidik" : ph <= 7.6 ? "Dengeli" : "Bazik";

  return { waterHolding, fertility, phBand };
}

function enrichSoilResponse(base) {
  const rec = buildSoilRecommendations(base);
  const profile = buildSoilProfile(base);
  const soilIndices = buildSoilIndices({ ...base, ...rec }, profile);
  const soilHealth = evaluateSoilHealth({ ...base, ...rec, soilIndices });
  const blendedScore = Math.round((soilHealth.score * 0.72) + (soilIndices.confidenceScore * 0.08) + (soilIndices.waterHoldingScore * 0.1) + (soilIndices.nutrientRetentionScore * 0.1));
  const blendedRisk = blendedScore >= 80 ? "Dusuk" : blendedScore >= 65 ? "Orta" : "Yuksek";
  soilHealth.score = Math.max(25, Math.min(98, blendedScore));
  soilHealth.risk = blendedRisk;
  soilHealth.findings = Array.from(new Set([...(soilHealth.findings || []), ...(soilIndices.findings || [])])).slice(0, 6);
  soilHealth.actions = Array.from(new Set([...(soilHealth.actions || []), ...(soilIndices.actions || [])])).slice(0, 7);
  const plantSuitability = buildPlantSuitability({ ...base, ...rec }, profile);
  const managementPlan = buildSoilManagementPlan(
    { ...base, ...rec, soilIndices },
    profile,
    soilHealth,
    plantSuitability
  );
  const topPlants = plantSuitability.filter((item) => item.status === "Uygun").slice(0, 6).map((item) => item.name);
  const riskyPlants = plantSuitability.filter((item) => item.status === "Riskli").slice(0, 4).map((item) => item.name);
  return {
    ...base,
    recommended: base.recommended?.length ? base.recommended : topPlants.length ? topPlants : rec.recommended,
    risky: base.risky?.length ? base.risky : riskyPlants.length ? riskyPlants : rec.risky,
    diseaseRisk: base.diseaseRisk?.length ? base.diseaseRisk : rec.diseaseRisk,
    profile,
    soilHealth,
    soilIndices,
    managementPlan,
    plantSuitability
  };
}

function parseSoilGrids(json) {
  const layers = json?.properties?.layers || [];
  const pickDepths = ["0-5cm", "5-15cm"];
  const trackedDepths = ["0-5cm", "5-15cm", "15-30cm", "30-60cm"];
  const result = {};
  const depthProfile = {};
  layers.forEach((layer) => {
    const name = layer.name;
    const dFactor = layer?.unit_measure?.d_factor || 1;
    const depths = layer.depths || [];
    depthProfile[name] = {};
    depths.forEach((d) => {
      const depthName = d?.name;
      const raw = d?.values?.mean;
      if (!trackedDepths.includes(depthName) || typeof raw !== "number") return;
      depthProfile[name][depthName] = Number((raw / dFactor).toFixed(2));
    });
    const values = depths
      .filter((d) => pickDepths.includes(d?.name))
      .map((d) => d?.values?.mean)
      .filter((v) => typeof v === "number");
    if (!values.length) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    result[name] = Number((mean / dFactor).toFixed(2));
  });
  result.depthProfile = Object.fromEntries(
    Object.entries(depthProfile).filter(([, value]) => value && Object.keys(value).length)
  );
  return result;
}

async function fetchSoilGrids(lat, lon) {
  const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const cached = soilCache.get(key);
  if (cached && Date.now() - cached.ts < SOIL_CACHE_TTL_MS) return cached.value;

  const properties = [
    "phh2o",
    "soc",
    "clay",
    "sand",
    "silt",
    "nitrogen",
    "cec",
    "bdod"
  ]
    .map((p) => `property=${p}`)
    .join("&");
  const depths = ["0-5cm", "5-15cm"].map((d) => `depth=${d}`).join("&");
  const url = `${SOILGRIDS_QUERY}?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(
    lat
  )}&${properties}&${depths}&value=mean`;

  const json = await fetchJsonWithRetry(
    url,
    { headers: { accept: "application/json" } },
    1,
    7000
  ).catch(() => null);
  if (!json) return null;
  const parsed = parseSoilGrids(json);
  soilCache.set(key, { ts: Date.now(), value: parsed });
  return parsed;
}

async function fetchOpenMeteoGeocode(city) {
  const q = String(city || "").trim();
  if (!q) return null;
  const url = `${OPEN_METEO_GEOCODE_URL}?name=${encodeURIComponent(q)}&count=1&language=tr&format=json`;
  const json = await fetchJsonWithRetry(url, { headers: { accept: "application/json" } }, 1, 7000).catch(() => null);
  const first = Array.isArray(json?.results) ? json.results[0] : null;
  if (!first) return null;
  const lat = Number(first.latitude);
  const lon = Number(first.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    name: first.name || q,
    country: first.country || null,
    admin1: first.admin1 || null
  };
}

function avgOf(values = []) {
  const nums = values.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summarizeOpenMeteoSoil(json) {
  const hourly = json?.hourly || {};
  const topTemps = Array.isArray(hourly?.soil_temperature_0cm)
    ? hourly.soil_temperature_0cm.slice(0, 24)
    : [];
  const deepTemps = Array.isArray(hourly?.soil_temperature_6cm)
    ? hourly.soil_temperature_6cm.slice(0, 24)
    : [];
  const topMoisture = Array.isArray(hourly?.soil_moisture_0_to_1cm)
    ? hourly.soil_moisture_0_to_1cm.slice(0, 24)
    : [];
  const midMoisture = Array.isArray(hourly?.soil_moisture_1_to_3cm)
    ? hourly.soil_moisture_1_to_3cm.slice(0, 24)
    : [];
  const evapo = Array.isArray(hourly?.evapotranspiration) ? hourly.evapotranspiration.slice(0, 24) : [];

  const topTempAvg = avgOf(topTemps);
  const deepTempAvg = avgOf(deepTemps);
  const moistureTopAvg = avgOf(topMoisture);
  const moistureMidAvg = avgOf(midMoisture);
  const evapotranspirationAvg = avgOf(evapo);

  const moistureState =
    moistureTopAvg === null
      ? "Bilinmiyor"
      : moistureTopAvg < 0.18
        ? "Dusuk"
        : moistureTopAvg > 0.34
          ? "Yuksek"
          : "Dengeli";

  return {
    topTempAvg: topTempAvg === null ? null : Number(topTempAvg.toFixed(2)),
    deepTempAvg: deepTempAvg === null ? null : Number(deepTempAvg.toFixed(2)),
    moistureTopAvg: moistureTopAvg === null ? null : Number(moistureTopAvg.toFixed(3)),
    moistureMidAvg: moistureMidAvg === null ? null : Number(moistureMidAvg.toFixed(3)),
    evapotranspirationAvg:
      evapotranspirationAvg === null ? null : Number(evapotranspirationAvg.toFixed(3)),
    moistureState
  };
}

async function fetchOpenMeteoSoilSignals(lat, lon) {
  const hourly = [
    "soil_temperature_0cm",
    "soil_temperature_6cm",
    "soil_moisture_0_to_1cm",
    "soil_moisture_1_to_3cm",
    "evapotranspiration"
  ].join(",");
  const url =
    `${OPEN_METEO_FORECAST_URL}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&hourly=${encodeURIComponent(hourly)}&forecast_days=2&timezone=auto`;
  const json = await fetchJsonWithRetry(url, { headers: { accept: "application/json" } }, 1, 8000).catch(
    () => null
  );
  if (!json) return null;
  return {
    url,
    summary: summarizeOpenMeteoSoil(json),
    rawMeta: {
      elevation: Number.isFinite(Number(json?.elevation)) ? Number(json.elevation) : null,
      timezone: json?.timezone || null
    }
  };
}

function resolveCoordsUrl(template, lat, lon) {
  if (!template) return "";
  const latText = String(lat);
  const lonText = String(lon);
  if (template.includes("{lat}") || template.includes("{lon}")) {
    return template.replaceAll("{lat}", encodeURIComponent(latText)).replaceAll("{lon}", encodeURIComponent(lonText));
  }
  const sep = template.includes("?") ? "&" : "?";
  return `${template}${sep}lat=${encodeURIComponent(latText)}&lon=${encodeURIComponent(lonText)}`;
}

async function fetchMtaLayer(templateUrl, lat, lon) {
  if (!templateUrl) return null;
  const url = resolveCoordsUrl(templateUrl, lat, lon);
  if (!url) return null;
  try {
    const data = await fetchJsonWithRetry(
      url,
      { headers: { accept: "application/json" } },
      1,
      MTA_TIMEOUT_MS
    );
    return { url, data };
  } catch (err) {
    return null;
  }
}

function extractFirstText(node, depth = 0) {
  if (depth > 5 || node === null || node === undefined) return null;
  if (typeof node === "string") {
    const value = node.trim();
    return value || null;
  }
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractFirstText(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) {
      const found = extractFirstText(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function pickField(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const found = extractFirstText(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

function summarizeMtaData(soilLayer, mineralLayer) {
  if (!soilLayer && !mineralLayer) return null;
  const soilData = soilLayer?.data || null;
  const mineralData = mineralLayer?.data || null;
  const soilMap =
    pickField(soilData, ["toprak", "soil", "soilType", "litoloji", "lithology", "formation", "unit"]) ||
    extractFirstText(soilData);
  const mineralProspect =
    pickField(mineralData, ["maden", "mineral", "anomaly", "target", "resource", "deposit"]) ||
    extractFirstText(mineralData);
  const geology =
    pickField(soilData, ["jeoloji", "geology", "litoloji", "lithology", "formation"]) ||
    pickField(mineralData, ["jeoloji", "geology", "formation"]);
  const mapName = (() => {
    const candidate = soilLayer?.url || mineralLayer?.url;
    if (!candidate) return null;
    try {
      const pathname = new URL(candidate).pathname;
      const parts = pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch (err) {
      return null;
    }
  })();
  return {
    source: "mta",
    soilMap: soilMap || null,
    mineralProspect: mineralProspect || null,
    geology: geology || null,
    mapName,
    endpoints: {
      soil: soilLayer?.url || null,
      mineral: mineralLayer?.url || null
    }
  };
}

function parseTrSoilText(raw = "") {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const tokens = text
    .split(/[\|,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const pick = (re) => tokens.find((item) => re.test(item));
  const soilMap =
    pick(/toprak|sinif|textur|büny|buny|soil|unit|litoloji|lithology/i) ||
    tokens.find((item) => item.length >= 4) ||
    null;
  const slope = pick(/egim|eğim|slope/i) || null;
  const erosion = pick(/erozyon|erosion/i) || null;
  const depth = pick(/derinlik|depth/i) || null;
  return {
    source: "tr-soil-wms",
    soilMap: soilMap || null,
    slopeClass: slope,
    erosionRisk: erosion,
    depthClass: depth,
    rawSnippet: text.slice(0, 320)
  };
}

async function fetchTrSoilFromWms(lat, lon) {
  if (!TR_SOIL_WMS_URL || !TR_SOIL_WMS_LAYER) return null;
  const base = new URL(TR_SOIL_WMS_URL);
  const version = TR_SOIL_WMS_VERSION || "1.3.0";
  const crs = TR_SOIL_WMS_CRS || "EPSG:4326";
  const bbox = `${Number(lon) - 0.002},${Number(lat) - 0.002},${Number(lon) + 0.002},${Number(lat) + 0.002}`;
  const common = {
    service: "WMS",
    request: "GetFeatureInfo",
    version,
    layers: TR_SOIL_WMS_LAYER,
    query_layers: TR_SOIL_WMS_LAYER,
    styles: "",
    info_format: TR_SOIL_WMS_INFO_FORMAT || "application/json",
    width: "101",
    height: "101",
    i: "50",
    j: "50"
  };
  if (version === "1.3.0") {
    common.crs = crs;
    common.bbox = bbox;
  } else {
    common.srs = crs;
    common.bbox = bbox;
    common.x = "50";
    common.y = "50";
    delete common.i;
    delete common.j;
  }
  Object.entries(common).forEach(([k, v]) => base.searchParams.set(k, String(v)));

  const tryFetchText = async (format) => {
    const url = new URL(base.toString());
    url.searchParams.set("info_format", format);
    return fetchTextWithRetry(
      url.toString(),
      { headers: { accept: format.includes("json") ? "application/json,text/plain,*/*" : "text/plain,*/*" } },
      1,
      MTA_TIMEOUT_MS
    ).then((txt) => ({ url: url.toString(), txt }));
  };

  try {
    const first = await tryFetchText(TR_SOIL_WMS_INFO_FORMAT || "application/json");
    const asJson = safeJsonParse(first.txt, null);
    if (asJson) {
      const text = JSON.stringify(asJson);
      const parsed = parseTrSoilText(text);
      if (parsed) return { url: first.url, ...parsed };
    }
    const parsedText = parseTrSoilText(first.txt);
    if (parsedText) return { url: first.url, ...parsedText };
  } catch (err) {
    // continue fallback
  }

  try {
    const second = await tryFetchText("text/plain");
    const parsed = parseTrSoilText(second.txt);
    if (parsed) return { url: second.url, ...parsed };
  } catch (err) {
    return null;
  }
  return null;
}

function buildLocationSearchQuery(city = "", district = "", neighborhood = "") {
  return [neighborhood, district, city]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeCity(city, district = "", neighborhood = "") {
  const queryCandidates = [
    buildLocationSearchQuery(city, district, neighborhood),
    buildLocationSearchQuery(city, district, ""),
    buildLocationSearchQuery(city, "", "")
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!queryCandidates.length) return null;

  for (const query of queryCandidates) {
    const key = query.toLowerCase().trim();
    const cached = geoCache.get(key);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) return cached.value;

    const url = `${OPEN_METEO_GEO}?name=${encodeURIComponent(query)}&count=1&language=tr`;
    let data = null;
    try {
      data = await fetchJsonWithRetry(url);
    } catch (err) {
      continue;
    }
    const result = data.results?.[0];
    if (!result) continue;
    const payload = {
      name: result.name || city,
      lat: result.latitude,
      lon: result.longitude,
      city: city || result.name || null,
      district: district || null,
      neighborhood: neighborhood || null
    };
    geoCache.set(key, { ts: Date.now(), value: payload });
    return payload;
  }
  return null;
}

async function fetchOpenMeteoWeather(lat, lon) {
  const url =
    `${OPEN_METEO_FORECAST}?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code" +
    "&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code,wind_gusts_10m_max" +
    "&forecast_days=1&timezone=auto";
  let data = null;
  try {
    data = await fetchJsonWithRetry(url);
  } catch (err) {
    return null;
  }
  const tempMin = data.daily?.temperature_2m_min?.[0];
  const tempMax = data.daily?.temperature_2m_max?.[0];
  const precipitation = data.daily?.precipitation_sum?.[0];
  const gust = data.current?.wind_gusts_10m ?? data.daily?.wind_gusts_10m_max?.[0];
  const currentCode = data.current?.weather_code ?? data.current?.weathercode;
  return {
    temp: data.current?.temperature_2m ?? null,
    tempMin: typeof tempMin === "number" ? Math.round(tempMin) : null,
    tempMax: typeof tempMax === "number" ? Math.round(tempMax) : null,
    humidity: data.current?.relative_humidity_2m ?? null,
    windKmh: data.current?.wind_speed_10m ?? null,
    windGustKmh: typeof gust === "number" ? Math.round(gust) : null,
    precipitationMm: typeof precipitation === "number" ? Number(precipitation.toFixed(1)) : null,
    condition: weatherCodeToText(currentCode),
    frostRisk: typeof tempMin === "number" ? tempMin <= 0 : false,
    localTime: data.current?.time || null,
    timeZone: data.timezone || null,
    updatedAt: new Date().toISOString(),
    source: "openmeteo"
  };
}

async function fetchOpenMeteoForecast(lat, lon) {
  const url =
    `${OPEN_METEO_FORECAST}?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    "&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code,wind_gusts_10m_max" +
    "&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m" +
    "&forecast_days=5&timezone=auto";
  let data = null;
  try {
    data = await fetchJsonWithRetry(url);
  } catch (err) {
    return null;
  }
  const days = data.daily?.time || [];
  const minTemps = data.daily?.temperature_2m_min || [];
  const maxTemps = data.daily?.temperature_2m_max || [];
  const precips = data.daily?.precipitation_sum || [];
  const gusts = data.daily?.wind_gusts_10m_max || [];
  const codes = data.daily?.weather_code || data.daily?.weathercode || [];
  const labels = ["Bugun", "Yarin", "2 gun", "3 gun", "4 gun", "5 gun"];
  const daily = days.slice(0, 5).map((day, idx) => ({
    day: labels[idx] || day,
    min: Math.round(minTemps[idx] ?? 0),
    max: Math.round(maxTemps[idx] ?? 0),
    condition: weatherCodeToText(codes[idx]),
    precipitationMm: typeof precips[idx] === "number" ? Number(precips[idx].toFixed(1)) : null,
    windGustKmh: typeof gusts[idx] === "number" ? Math.round(gusts[idx]) : null,
    frost: (minTemps[idx] ?? 0) <= 0
  }));
  const hourlyTimes = data.hourly?.time || [];
  const hourlyTemps = data.hourly?.temperature_2m || [];
  const hourlyPrecip = data.hourly?.precipitation || [];
  const hourlyWind = data.hourly?.wind_speed_10m || [];
  const hourlyGust = data.hourly?.wind_gusts_10m || [];
  const hourly = hourlyTimes.slice(0, 12).map((time, idx) => ({
    time,
    temp: typeof hourlyTemps[idx] === "number" ? Math.round(hourlyTemps[idx]) : null,
    precipitationMm: typeof hourlyPrecip[idx] === "number" ? Number(hourlyPrecip[idx].toFixed(1)) : null,
    windKmh: typeof hourlyWind[idx] === "number" ? Math.round(hourlyWind[idx]) : null,
    windGustKmh: typeof hourlyGust[idx] === "number" ? Math.round(hourlyGust[idx]) : null
  }));
  return { daily, hourly, timeZone: data.timezone || null };
}

const MARKET_SOURCES = {
  bursa: "https://www.bursa.bel.tr/hal_fiyatlari",
  antalya: "https://www.antalya.bel.tr/tr/halden-gunluk-fiyatlar",
  konya: "https://www.konya.bel.tr/hal-fiyatlari",
  kayseri: "https://www.kayseri.bel.tr/hal-fiyatlari",
  eskisehir: "https://www.eskisehir.bel.tr/hal-fiyatlari",
  bolu: "https://www.bolu.bel.tr/t-c-bolu-belediyesi-toptanci-hal-fiyat-listesi/",
  biga: "https://www.biga.bel.tr/hal-fiyat-listesi",
  eregli: "https://eregli.bel.tr/public/sayfa/hal-fiyatlari",
  kocaeli: "https://www.kocaeli.bel.tr/hal-fiyatlari/",
  van: "https://van.bel.tr/Syf/hal-fiyatlari.html",
  ankara: "https://www.ankara.bel.tr/hal-fiyatlari",
  malatya: "https://yenimalatya.com.tr/hal-fiyatlari",
  mersin: "https://www.mersin.plus/gunluk-sebze-ve-meyve-resmi-hal-fiyatlari-mersin/"
};

async function fetchMarketPrices(city) {
  const key = city.toLowerCase();
  const cached = marketCache.get(key);
  if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached.value;

  const url = MARKET_SOURCES[key];
  if (!url) return { source: "none", items: [] };

  let html = "";
  try {
    html = await fetch(url).then((r) => r.text());
  } catch (err) {
    return { source: "error", items: [] };
  }

  const items = [];
  const lines = html.split(/\r?\n/).map((l) => l.replace(/<[^>]+>/g, " ").trim());
  const findPrice = (name) => {
    const line = lines.find((l) => l.toLowerCase().includes(name));
    if (!line) return null;
    const nums = line.match(/\d+[\.,]?\d*/g);
    if (!nums) return null;
    if (nums.length >= 2) return `${nums[0]} - ${nums[1]}`;
    return nums[0];
  };
  [
    { key: "domates", label: "Domates" },
    { key: "biber", label: "Biber" },
    { key: "patates", label: "Patates" },
    { key: "bugday", label: "Bugday" },
    { key: "arpa", label: "Arpa" }
  ].forEach((crop) => {
    const price = findPrice(crop.label.toLowerCase());
    if (price) items.push({ crop: crop.key, label: crop.label, price });
  });

  const payload = { source: url, items };
  marketCache.set(key, { ts: Date.now(), value: payload });
  return payload;
}

function buildDemoMarketItems(city = "") {
  const month = new Date().getMonth() + 1;
  const seasonalBoost = [6, 7, 8].includes(month) ? 1.08 : [12, 1, 2].includes(month) ? 1.14 : 1;
  const rows = [
    { crop: "Domates", base: 18.4, unit: "TL/kg" },
    { crop: "Biber", base: 24.2, unit: "TL/kg" },
    { crop: "Salatalik", base: 16.1, unit: "TL/kg" },
    { crop: "Patates", base: 12.7, unit: "TL/kg" },
    { crop: "Sogan", base: 11.8, unit: "TL/kg" }
  ];
  return rows.map((item, idx) => {
    const min = Math.max(1, item.base * seasonalBoost * (0.92 + idx * 0.01));
    const max = min * 1.16;
    return {
      crop: item.crop,
      label: item.crop,
      unit: item.unit,
      price: `${min.toFixed(2)} - ${max.toFixed(2)}`
    };
  });
}

function parsePriceRangeToMedian(value) {
  const raw = String(value || "");
  if (!raw) return 0;
  const nums = raw
    .replace(/[^0-9,.\- ]/g, " ")
    .match(/\d+[.,]?\d*/g);
  if (!nums || !nums.length) return 0;
  const parsed = nums
    .map((item) => Number(String(item).replace(",", ".")))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (!parsed.length) return 0;
  if (parsed.length === 1) return Number(parsed[0].toFixed(2));
  return Number(((parsed[0] + parsed[1]) / 2).toFixed(2));
}

function medianOf(values = []) {
  if (!values.length) return 0;
  const arr = values.slice().sort((a, b) => a - b);
  return arr[Math.floor(arr.length / 2)] || 0;
}

function avgOf(values = []) {
  if (!values.length) return 0;
  return values.reduce((acc, x) => acc + x, 0) / values.length;
}

async function fetchTcmbFxSnapshot() {
  const url = "https://www.tcmb.gov.tr/kurlar/today.xml";
  const xml = await fetchTextWithRetry(url, {}, 1, 8000);
  const day = xml.match(/<Tarih_Date[^>]*Tarih="([^"]+)"/i)?.[1] || null;
  const findCurrency = (code) => {
    const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[\\s\\S]*?<\\/Currency>`, "i"))?.[0] || "";
    const selling = block.match(/<ForexSelling>([^<]+)<\/ForexSelling>/i)?.[1];
    const bank = block.match(/<BanknoteSelling>([^<]+)<\/BanknoteSelling>/i)?.[1];
    const val = Number(String(selling || bank || "").replace(",", "."));
    return Number.isFinite(val) && val > 0 ? Number(val.toFixed(4)) : null;
  };
  return {
    source: "tcmb",
    url,
    date: day,
    usdTry: findCurrency("USD"),
    eurTry: findCurrency("EUR")
  };
}

async function fetchWorldBankIndicator(indicatorId) {
  const url = `https://api.worldbank.org/v2/country/TUR/indicator/${encodeURIComponent(
    indicatorId
  )}?format=json&per_page=25`;
  const data = await fetchJsonWithRetry(url, {}, 1, 9000);
  const rows = Array.isArray(data?.[1]) ? data[1] : [];
  const valid = rows
    .map((row) => {
      const value = Number(row?.value);
      const year = Number(row?.date);
      if (!Number.isFinite(value) || !Number.isFinite(year)) return null;
      return { year, value };
    })
    .filter(Boolean)
    .sort((a, b) => b.year - a.year);
  const latest = valid[0] || null;
  return {
    id: indicatorId,
    source: "worldbank",
    sourceUrl: url,
    latestYear: latest?.year || null,
    latestValue: latest ? Number(latest.value.toFixed(2)) : null,
    history: valid.slice(0, 6).reverse()
  };
}

async function fetchWorldBankMacroSnapshot() {
  const defs = [
    { key: "inflation", id: "FP.CPI.TOTL.ZG" },
    { key: "gdpGrowth", id: "NY.GDP.MKTP.KD.ZG" },
    { key: "agriShare", id: "NV.AGR.TOTL.ZS" },
    { key: "unemployment", id: "SL.UEM.TOTL.ZS" }
  ];
  const results = await Promise.allSettled(defs.map((item) => fetchWorldBankIndicator(item.id)));
  const payload = {};
  const failed = [];
  results.forEach((item, idx) => {
    const key = defs[idx].key;
    if (item.status === "fulfilled") payload[key] = item.value;
    else failed.push({ key, id: defs[idx].id });
  });
  return { source: "worldbank", indicators: payload, failed };
}

async function fetchStooqWheatSnapshot() {
  const url = "https://stooq.com/q/l/?s=ZW.F&i=d";
  const csv = (await fetchTextWithRetry(url, {}, 1, 8000)).trim();
  const row = csv.split(/\r?\n/)[0] || "";
  const parts = row.split(",");
  if (parts.length < 7) throw new Error("stooq_invalid");
  const open = Number(parts[3]);
  const high = Number(parts[4]);
  const low = Number(parts[5]);
  const close = Number(parts[6]);
  const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
  return {
    source: "stooq",
    url,
    symbol: parts[0] || "ZW.F",
    date: parts[1] || null,
    open: Number.isFinite(open) ? Number(open.toFixed(2)) : null,
    high: Number.isFinite(high) ? Number(high.toFixed(2)) : null,
    low: Number.isFinite(low) ? Number(low.toFixed(2)) : null,
    close: Number.isFinite(close) ? Number(close.toFixed(2)) : null,
    changePct: Number.isFinite(changePct) ? Number(changePct.toFixed(2)) : null
  };
}

function buildEconomyPlannerPayload({
  city,
  crop,
  areaDa,
  yieldKgDa,
  priceTlKg,
  localMarket,
  tradeSummary,
  fx,
  macro,
  wheat
}) {
  const marketPrice = Number(localMarket?.medianTlKg || 0);
  const tradeSellMedian = Number(tradeSummary?.market?.sellMedianTlKg || 0);
  const candidatePrices = [priceTlKg, marketPrice, tradeSellMedian].filter((x) => Number.isFinite(x) && x > 0);
  const suggestedPriceTlKg = candidatePrices.length ? Number(medianOf(candidatePrices).toFixed(2)) : 0;
  const inflation = Number(macro?.indicators?.inflation?.latestValue || 0);
  const gdp = Number(macro?.indicators?.gdpGrowth?.latestValue || 0);
  const usdTry = Number(fx?.usdTry || 0);
  const wheatChange = Number(wheat?.changePct || 0);
  const costPressureRaw =
    Math.max(0, inflation / 12) +
    Math.max(0, (usdTry - 30) / 4) +
    Math.max(0, wheatChange * 2) -
    Math.max(0, gdp);
  const costPressureScore = Math.max(0, Math.min(100, Math.round(40 + costPressureRaw)));
  const riskLevel =
    costPressureScore >= 75 ? "yuksek" : costPressureScore >= 55 ? "orta" : "dusuk";
  const revenueNow = Math.round((areaDa || 0) * (yieldKgDa || 0) * (priceTlKg || 0));
  const revenueSuggested = Math.round((areaDa || 0) * (yieldKgDa || 0) * (suggestedPriceTlKg || 0));
  return {
    updatedAt: new Date().toISOString(),
    city,
    crop: crop || null,
    inputs: {
      areaDa,
      yieldKgDa,
      priceTlKg
    },
    fx,
    macro,
    commodity: {
      wheat
    },
    localMarket,
    tradeSummary,
    signals: {
      suggestedPriceTlKg,
      costPressureScore,
      riskLevel,
      revenueNow,
      revenueSuggested,
      deltaRevenueTl: revenueSuggested - revenueNow
    }
  };
}

const LAND_BASELINE_TL_DA = {
  adana: 230000,
  ankara: 175000,
  antalya: 260000,
  aydin: 220000,
  bursa: 240000,
  canakkale: 205000,
  denizli: 190000,
  edirne: 150000,
  eskisehir: 165000,
  gaziantep: 185000,
  hatay: 210000,
  izmir: 275000,
  kayseri: 145000,
  konya: 135000,
  malatya: 140000,
  manisa: 225000,
  mersin: 235000,
  mugla: 280000,
  sakarya: 210000,
  samsun: 170000,
  sanliurfa: 125000,
  tekirdag: 195000
};

const TURKIYE_REGION_BY_CITY = {
  adana: "akdeniz",
  adiyaman: "guneydoguanadolu",
  afyonkarahisar: "ege",
  agri: "doguanadolu",
  amasya: "karadeniz",
  ankara: "icanadolu",
  antalya: "akdeniz",
  artvin: "karadeniz",
  aydin: "ege",
  balikesir: "marmara",
  bilecik: "marmara",
  bingol: "doguanadolu",
  bitlis: "doguanadolu",
  bolu: "karadeniz",
  burdur: "akdeniz",
  bursa: "marmara",
  canakkale: "marmara",
  cankiri: "icanadolu",
  corum: "karadeniz",
  denizli: "ege",
  diyarbakir: "guneydoguanadolu",
  edirne: "marmara",
  elazig: "doguanadolu",
  erzincan: "doguanadolu",
  erzurum: "doguanadolu",
  eskisehir: "icanadolu",
  gaziantep: "guneydoguanadolu",
  giresun: "karadeniz",
  gumushane: "karadeniz",
  hakkari: "doguanadolu",
  hatay: "akdeniz",
  isparta: "akdeniz",
  mersin: "akdeniz",
  istanbul: "marmara",
  izmir: "ege",
  kars: "doguanadolu",
  kastamonu: "karadeniz",
  kayseri: "icanadolu",
  kirklareli: "marmara",
  kirsehir: "icanadolu",
  kocaeli: "marmara",
  konya: "icanadolu",
  kutahya: "ege",
  malatya: "doguanadolu",
  manisa: "ege",
  kahramanmaras: "akdeniz",
  mardin: "guneydoguanadolu",
  mugla: "ege",
  mus: "doguanadolu",
  nevsehir: "icanadolu",
  nigde: "icanadolu",
  ordu: "karadeniz",
  rize: "karadeniz",
  sakarya: "marmara",
  samsun: "karadeniz",
  siirt: "guneydoguanadolu",
  sinop: "karadeniz",
  sivas: "icanadolu",
  tekirdag: "marmara",
  tokat: "karadeniz",
  trabzon: "karadeniz",
  tunceli: "doguanadolu",
  sanliurfa: "guneydoguanadolu",
  usak: "ege",
  van: "doguanadolu",
  yozgat: "icanadolu",
  zonguldak: "karadeniz",
  aksaray: "icanadolu",
  bayburt: "karadeniz",
  karaman: "icanadolu",
  kirikkale: "icanadolu",
  batman: "guneydoguanadolu",
  sirnak: "guneydoguanadolu",
  bartin: "karadeniz",
  ardahan: "doguanadolu",
  igdir: "doguanadolu",
  yalova: "marmara",
  karabuk: "karadeniz",
  kilis: "guneydoguanadolu",
  osmaniye: "akdeniz",
  duzce: "karadeniz"
};

const DISTRICT_CENTROIDS_TR = {
  "malatya|yesilyurt": [38.2962, 38.2456],
  "malatya|battalgazi": [38.421, 38.3634],
  "malatya|darende": [38.5487, 37.5054],
  "malatya|dogansehir": [38.0898, 37.8717],
  "malatya|akcadag": [38.3399, 37.9702],
  "malatya|hekimhan": [38.8162, 37.9339],
  "malatya|arguvan": [38.7801, 38.263],
  "malatya|kuluncak": [38.8787, 37.6643],
  "malatya|puturge": [38.1962, 38.8742],
  "malatya|yazihan": [38.5918, 38.1732],
  "malatya|doganyol": [38.3074, 39.0358],
  "malatya|kale": [38.3965, 38.7605],
  "malatya|arapgir": [39.0435, 38.4921]
};

const REGION_FEATURES = [
  "icanadolu",
  "ege",
  "akdeniz",
  "marmara",
  "karadeniz",
  "doguanadolu",
  "guneydoguanadolu"
];

function cityKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cropFactorFromKey(crop = "") {
  const c = cityKey(crop);
  if (c === "domates" || c === "tomato") return 1.12;
  if (c === "biber" || c === "pepper") return 1.1;
  if (c === "patates" || c === "potato") return 0.96;
  if (c === "bugday" || c === "wheat") return 0.87;
  return 1;
}

function regionFromCity(city = "") {
  const key = cityKey(city);
  return TURKIYE_REGION_BY_CITY[key] || "bilinmiyor";
}

function hashToUnitInterval(text = "") {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return 0;
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = (h << 5) - h + raw.charCodeAt(i);
    h |= 0;
  }
  return ((h >>> 0) % 1000) / 1000;
}

function parseCoordsTuple(raw = "") {
  if (!raw) return null;
  const parts = String(raw)
    .split(",")
    .map((x) => x.trim());
  if (parts.length < 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function getDistrictCentroid(city = "", district = "") {
  const key = `${cityKey(city)}|${cityKey(district)}`;
  const tuple = DISTRICT_CENTROIDS_TR[key];
  if (!Array.isArray(tuple) || tuple.length < 2) return null;
  return { lat: Number(tuple[0]), lon: Number(tuple[1]) };
}

function haversineKm(a = null, b = null) {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = Number(a.lat);
  const lon1 = Number(a.lon);
  const lat2 = Number(b.lat);
  const lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 6371 * c;
}

function normalizeLandFeatureInput(input = {}) {
  const city = String(input.city || "").trim();
  const district = String(input.district || "").trim();
  const neighborhood = String(input.neighborhood || input.mahalle || "").trim();
  const crop = String(input.crop || "").trim();
  const zoneRaw = cityKey(input.zone || "gecis");
  const zone = ["ova", "gecis", "yamac"].includes(zoneRaw) ? zoneRaw : "gecis";
  const irrigation = cityKey(input.irrigation || "var") === "yok" ? "yok" : "var";
  const roadRaw = cityKey(input.roadAccess || "orta");
  const roadAccess = ["iyi", "orta", "zayif"].includes(roadRaw) ? roadRaw : "orta";
  const roadDistanceM = Math.max(0, Math.min(50000, Number(input.roadDistanceM || 0)));
  const roadPass = cityKey(input.roadPass || "var") === "yok" ? "yok" : "var";
  const zoningRaw = cityKey(input.zoningStatus || "yok");
  const zoningStatus = ["var", "kismi", "yok"].includes(zoningRaw) ? zoningRaw : "yok";
  const structureStatus = cityKey(input.structureStatus || "yok") === "var" ? "var" : "yok";
  const soilScore = Math.max(0, Math.min(100, Number(input.soilScore || 65)));
  const slopePct = Math.max(0, Math.min(45, Number(input.slopePct || 6)));
  const areaDa = Math.max(0, Math.min(50000, Number(input.areaDa || 0)));
  const plantedStatus = cityKey(input.plantedStatus || "bos") === "ekili" ? "ekili" : "bos";
  const plantedCrop = String(input.plantedCrop || "").trim();
  const plantedValueTlDa = Math.max(0, Math.min(20000000, Number(input.plantedValueTlDa || 0)));
  return {
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa,
    region: regionFromCity(city)
  };
}

function buildLandFeatureVector(input = {}) {
  const normalized = normalizeLandFeatureInput(input);
  const key = cityKey(normalized.city);
  const baseline = Number(LAND_BASELINE_TL_DA[key] || 160000);
  const cropKeyNorm = cityKey(normalized.crop);
  const cropFlags = {
    domates: cropKeyNorm === "domates" || cropKeyNorm === "tomato" ? 1 : 0,
    biber: cropKeyNorm === "biber" || cropKeyNorm === "pepper" ? 1 : 0,
    patates: cropKeyNorm === "patates" || cropKeyNorm === "potato" ? 1 : 0,
    bugday: cropKeyNorm === "bugday" || cropKeyNorm === "wheat" ? 1 : 0
  };
  const cropOther = cropFlags.domates || cropFlags.biber || cropFlags.patates || cropFlags.bugday ? 0 : 1;
  const plantedCropKeyNorm = cityKey(normalized.plantedCrop);
  const plantedCropFlags = {
    domates: plantedCropKeyNorm === "domates" || plantedCropKeyNorm === "tomato" ? 1 : 0,
    biber: plantedCropKeyNorm === "biber" || plantedCropKeyNorm === "pepper" ? 1 : 0,
    patates: plantedCropKeyNorm === "patates" || plantedCropKeyNorm === "potato" ? 1 : 0,
    bugday: plantedCropKeyNorm === "bugday" || plantedCropKeyNorm === "wheat" ? 1 : 0
  };
  const plantedCropOther =
    plantedCropFlags.domates || plantedCropFlags.biber || plantedCropFlags.patates || plantedCropFlags.bugday ? 0 : 1;
  const regionFlags = REGION_FEATURES.map((region) => (normalized.region === region ? 1 : 0));
  return {
    normalized,
    vector: [
      1,
      baseline / 200000,
      cropFlags.domates,
      cropFlags.biber,
      cropFlags.patates,
      cropFlags.bugday,
      cropOther,
      normalized.zone === "ova" ? 1 : 0,
      normalized.zone === "gecis" ? 1 : 0,
      normalized.zone === "yamac" ? 1 : 0,
      normalized.irrigation === "var" ? 1 : 0,
      normalized.roadAccess === "iyi" ? 1 : 0,
      normalized.roadAccess === "orta" ? 1 : 0,
      normalized.roadAccess === "zayif" ? 1 : 0,
      Math.min(1, normalized.roadDistanceM / 4000),
      normalized.roadPass === "var" ? 1 : 0,
      normalized.zoningStatus === "var" ? 1 : 0,
      normalized.zoningStatus === "kismi" ? 1 : 0,
      normalized.structureStatus === "var" ? 1 : 0,
      normalized.soilScore / 100,
      normalized.slopePct / 40,
      Math.min(1, normalized.areaDa / 250),
      normalized.district ? 1 : 0,
      hashToUnitInterval(normalized.district),
      normalized.neighborhood ? 1 : 0,
      hashToUnitInterval(normalized.neighborhood),
      normalized.plantedStatus === "ekili" ? 1 : 0,
      plantedCropFlags.domates,
      plantedCropFlags.biber,
      plantedCropFlags.patates,
      plantedCropFlags.bugday,
      plantedCropOther,
      Math.min(1, normalized.plantedValueTlDa / 300000),
      ...regionFlags
    ],
    baselineTlDa: baseline
  };
}

function expectedLandPriceFromMeta(city = "", crop = "") {
  const c = cityKey(city || "");
  const base = Number(LAND_BASELINE_TL_DA[c] || 160000);
  const cropFactor = cropFactorFromKey(crop || "");
  return Math.max(12000, base * cropFactor);
}

function capRowsBySourceShare(rows = [], capConfig = {}) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (!list.length) return [];
  const caps = {
    "synthetic-augment-v2": Math.max(0.05, Math.min(0.5, Number(capConfig["synthetic-augment-v2"] ?? 0.2))),
    synthetic: Math.max(0.05, Math.min(0.5, Number(capConfig.synthetic ?? 0.2))),
    "manual-all": Math.max(0.1, Math.min(0.8, Number(capConfig["manual-all"] ?? 0.42))),
    "manual-city-crop": Math.max(0.1, Math.min(0.8, Number(capConfig["manual-city-crop"] ?? 0.36)))
  };
  const bySource = new Map();
  list.forEach((row) => {
    const key = String(row?.source || "unknown");
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(row);
  });
  const total = list.length;
  const keep = [];
  bySource.forEach((sourceRows, source) => {
    const cap = Object.prototype.hasOwnProperty.call(caps, source) ? caps[source] : 1;
    const limit = Math.max(20, Math.floor(total * cap));
    sourceRows
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
      .slice(0, limit)
      .forEach((row) => keep.push(row));
  });
  return keep;
}

function cleanLandTrainingRows(rows = [], options = {}) {
  const strict = Boolean(options?.strict);
  const prepared = (Array.isArray(rows) ? rows : [])
    .filter((row) => Number.isFinite(Number(row?.price)) && Number(row.price) >= 12000 && Number(row.price) <= 8000000)
    .map((row) => {
      const city = String(row?.city || "");
      const crop = String(row?.crop || "");
      const expected = expectedLandPriceFromMeta(city, crop);
      const ratio = expected > 0 ? Number(row.price || 0) / expected : 1;
      return {
        ...row,
        expectedPrice: expected,
        ratioToExpected: ratio
      };
    })
    .filter((row) => {
      const ratio = Number(row.ratioToExpected || 1);
      if (!Number.isFinite(ratio) || ratio <= 0) return false;
      return ratio >= 0.35 && ratio <= 2.9;
    });
  const nonSyntheticCount = prepared.filter((row) => {
    const source = String(row?.source || "");
    return source !== "synthetic" && source !== "synthetic-augment-v2";
  }).length;
  const syntheticCap = strict
    ? nonSyntheticCount >= 800
      ? 0.04
      : 0.08
    : 0.16;
  const capped = capRowsBySourceShare(prepared, {
    "synthetic-augment-v2": syntheticCap,
    synthetic: syntheticCap,
    "manual-all": strict ? 0.24 : 0.4,
    "manual-city-crop": strict ? 0.3 : 0.34
  });
  return capped.map((row) => {
    const source = String(row?.source || "");
    const baseWeight = Number(row?.weight || 1);
    let tuned = baseWeight;
    if (source === "live-listings-scan") tuned *= strict ? 1.42 : 1.22;
    else if (source === "manual-scoped") tuned *= strict ? 1.35 : 1.18;
    else if (source === "manual-city-crop") tuned *= strict ? 1.1 : 1.02;
    else if (source === "manual-all") tuned *= strict ? 0.62 : 0.85;
    else if (source === "synthetic" || source === "synthetic-augment-v2") tuned *= strict ? 0.12 : 0.25;
    return {
      ...row,
      weight: Math.max(0.03, Math.min(4, Number(tuned.toFixed(4))))
    };
  });
}

function dot(a = [], b = []) {
  let total = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) total += (a[i] || 0) * (b[i] || 0);
  return total;
}

function trainLandPriceLinearModel(samples = [], featureSize = 0, options = {}) {
  if (!samples.length || featureSize <= 0) return null;
  const rows = samples.filter(
    (s) =>
      Array.isArray(s?.x) &&
      s.x.length === featureSize &&
      Number.isFinite(Number(s?.y)) &&
      Number.isFinite(Number(s?.price)) &&
      Number(s?.price) > 0
  );
  if (!rows.length) return null;
  const epochs = Math.max(200, Math.min(5000, Number(options.epochs || 1800)));
  const lr = Math.max(0.0001, Math.min(0.2, Number(options.lr || 0.025)));
  const lambda = Math.max(0, Math.min(1, Number(options.lambda || 0.0012)));
  const huberDelta = Math.max(0.02, Math.min(1, Number(options.huberDelta || 0.12)));
  const patience = Math.max(60, Math.min(900, Number(options.patience || 220)));
  const valRatio = Math.max(0, Math.min(0.4, Number(options.valRatio || 0.16)));
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  const shuffled = rows
    .map((item) => ({ k: Math.random(), item }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
  const valSize = shuffled.length >= 36 ? Math.max(8, Math.floor(shuffled.length * valRatio)) : 0;
  const trainRows = valSize > 0 ? shuffled.slice(0, shuffled.length - valSize) : shuffled;
  const valRows = valSize > 0 ? shuffled.slice(shuffled.length - valSize) : [];

  const featureMeans = Array.from({ length: featureSize }, () => 0);
  const featureStds = Array.from({ length: featureSize }, () => 1);
  for (let j = 1; j < featureSize; j += 1) {
    let sum = 0;
    for (const row of trainRows) sum += Number(row.x[j] || 0);
    const mean = sum / Math.max(1, trainRows.length);
    let variance = 0;
    for (const row of trainRows) {
      const d = Number(row.x[j] || 0) - mean;
      variance += d * d;
    }
    const std = Math.sqrt(variance / Math.max(1, trainRows.length));
    featureMeans[j] = mean;
    featureStds[j] = std > 1e-8 ? std : 1;
  }

  const scaleX = (x = []) =>
    x.map((value, idx) => {
      if (idx === 0) return Number(value || 0);
      return (Number(value || 0) - featureMeans[idx]) / featureStds[idx];
    });
  const scaledTrain = trainRows.map((row) => ({
    ...row,
    xScaled: scaleX(row.x),
    weight: Math.max(0.05, Number(row.weight || 1))
  }));
  const scaledVal = valRows.map((row) => ({
    ...row,
    xScaled: scaleX(row.x),
    weight: Math.max(0.05, Number(row.weight || 1))
  }));

  let w = Array.from({ length: featureSize }, () => 0);
  let m = Array.from({ length: featureSize }, () => 0);
  let v = Array.from({ length: featureSize }, () => 0);
  let bestWeights = w.slice();
  let bestScore = Number.POSITIVE_INFINITY;
  let bestEpoch = 0;
  let stale = 0;

  const huberGrad = (err) => {
    if (Math.abs(err) <= huberDelta) return err;
    return Math.sign(err) * huberDelta;
  };
  const rmseInPrice = (rowsToScore = [], weights = []) => {
    if (!rowsToScore.length) return null;
    let sumSq = 0;
    let totalWeight = 0;
    for (const row of rowsToScore) {
      const wt = Math.max(0.05, Number(row.weight || 1));
      const pred = Math.exp(dot(weights, row.xScaled || row.x));
      const err = pred - Number(row.price || 0);
      sumSq += wt * err * err;
      totalWeight += wt;
    }
    return Math.sqrt(sumSq / Math.max(1e-6, totalWeight));
  };

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const grads = Array.from({ length: featureSize }, () => 0);
    let totalWeight = 0;
    for (const sample of scaledTrain) {
      const pred = dot(w, sample.xScaled);
      const err = pred - sample.y;
      const weight = sample.weight;
      totalWeight += weight;
      const g = huberGrad(err);
      for (let i = 0; i < featureSize; i += 1) grads[i] += weight * g * sample.xScaled[i];
    }
    const norm = Math.max(1e-6, totalWeight);
    for (let i = 0; i < featureSize; i += 1) {
      const grad = grads[i] / norm + lambda * w[i];
      m[i] = beta1 * m[i] + (1 - beta1) * grad;
      v[i] = beta2 * v[i] + (1 - beta2) * grad * grad;
      const mHat = m[i] / (1 - Math.pow(beta1, epoch));
      const vHat = v[i] / (1 - Math.pow(beta2, epoch));
      w[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
    }

    const trainRmse = rmseInPrice(scaledTrain, w);
    const valRmse = scaledVal.length ? rmseInPrice(scaledVal, w) : null;
    const score = Number.isFinite(valRmse) ? valRmse : trainRmse;
    if (score < bestScore) {
      bestScore = score;
      bestWeights = w.slice();
      bestEpoch = epoch;
      stale = 0;
    } else {
      stale += 1;
      if (stale >= patience) break;
    }
  }

  const rawWeights = bestWeights.slice();
  for (let i = 1; i < featureSize; i += 1) rawWeights[i] = rawWeights[i] / featureStds[i];
  let intercept = rawWeights[0];
  for (let i = 1; i < featureSize; i += 1) intercept -= rawWeights[i] * featureMeans[i];
  rawWeights[0] = intercept;

  const preds = rows.map((s) => Math.exp(dot(rawWeights, s.x)));
  const reals = rows.map((s) => Number(s.price || 0));
  const mean = reals.length ? reals.reduce((a, b) => a + b, 0) / reals.length : 0;
  const mse = reals.length
    ? reals.reduce((acc, real, idx) => acc + Math.pow((preds[idx] || 0) - real, 2), 0) / reals.length
    : 0;
  const mae = reals.length
    ? reals.reduce((acc, real, idx) => acc + Math.abs((preds[idx] || 0) - real), 0) / reals.length
    : 0;
  const ssTot = reals.reduce((acc, real) => acc + Math.pow(real - mean, 2), 0);
  const ssRes = reals.reduce((acc, real, idx) => acc + Math.pow(real - (preds[idx] || 0), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    weights: rawWeights,
    metrics: {
      rmse: Math.sqrt(Math.max(0, mse)),
      mae,
      r2,
      valRmse: Number.isFinite(bestScore) ? Number(bestScore) : null,
      epochs: bestEpoch || epochs,
      trainCount: trainRows.length,
      valCount: valRows.length
    }
  };
}

function trainLandPriceModelAuto(samples = [], featureSize = 0, options = {}) {
  const rows = cleanLandTrainingRows(samples, { strict: Boolean(options?.strict) });
  if (!rows.length) return null;
  const candidates = [
    { name: "stable", epochs: 1800, lr: 0.016, lambda: 0.0016, huberDelta: 0.09, patience: 280, valRatio: 0.2 },
    { name: "balanced", epochs: 2200, lr: 0.014, lambda: 0.0019, huberDelta: 0.1, patience: 340, valRatio: 0.22 }
  ];
  let best = null;
  candidates.forEach((cfg) => {
    const trained = trainLandPriceLinearModel(rows, featureSize, cfg);
    if (!trained) return;
    const score = Number(trained?.metrics?.valRmse || trained?.metrics?.rmse || Number.POSITIVE_INFINITY);
    if (!Number.isFinite(score)) return;
    if (!best || score < best.score) {
      best = { score, trained, cfg };
    }
  });
  if (!best) return null;
  return {
    ...best.trained,
    metrics: {
      ...(best.trained.metrics || {}),
      tuner: best.cfg.name,
      cleanedSampleCount: rows.length
    }
  };
}

function pickPath(obj, dottedPath = "") {
  if (!obj || typeof obj !== "object" || !dottedPath) return null;
  const chunks = dottedPath
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
  let cur = obj;
  for (const part of chunks) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[part];
  }
  return cur;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const num = Number(normalized);
  if (Number.isFinite(num)) return num;
  return null;
}

function extractLandPriceValue(payload) {
  if (!payload || typeof payload !== "object") return null;
  const directKeys = [
    "price_tl_da",
    "priceTlDa",
    "unit_price_tl_da",
    "unitPriceTlDa",
    "landPriceTlDa",
    "rayic_tl_da",
    "rayic"
  ];
  for (const key of directKeys) {
    const val = payload[key];
    if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  }
  const nested = [payload.data, payload.result, payload.value, payload.prices].filter(Boolean);
  for (const item of nested) {
    const val = extractLandPriceValue(item);
    if (val) return val;
  }
  return null;
}

function getLandPriceApiProviders() {
  const fromSlots = [
    process.env.LAND_PRICE_API_URL_1,
    process.env.LAND_PRICE_API_URL_2,
    process.env.LAND_PRICE_API_URL_3,
    process.env.LAND_PRICE_API_URL_4,
    process.env.LAND_PRICE_API_URL_5
  ]
    .filter(Boolean)
    .map((url, idx) => ({
      id: `slot-${idx + 1}`,
      title: `LAND_PRICE_API_URL_${idx + 1}`,
      urlTemplate: url,
      priority: Number(process.env[`LAND_PRICE_API_${idx + 1}_PRIORITY`] || idx + 1),
      weight: Number(process.env[`LAND_PRICE_API_${idx + 1}_WEIGHT`] || 1),
      method: (process.env[`LAND_PRICE_API_${idx + 1}_METHOD`] || "GET").toUpperCase(),
      bodyTemplate: process.env[`LAND_PRICE_API_${idx + 1}_BODY_TEMPLATE`] || "",
      headersJson: process.env[`LAND_PRICE_API_${idx + 1}_HEADERS_JSON`] || "",
      pricePath: process.env[`LAND_PRICE_API_${idx + 1}_PRICE_PATH`] || "",
      minPath: process.env[`LAND_PRICE_API_${idx + 1}_MIN_PATH`] || "",
      maxPath: process.env[`LAND_PRICE_API_${idx + 1}_MAX_PATH`] || "",
      updatedAtPath: process.env[`LAND_PRICE_API_${idx + 1}_UPDATED_AT_PATH`] || "",
      confidence: "high"
    }));

  const fromJson = (() => {
    const raw = process.env.LAND_PRICE_API_PROVIDERS_JSON;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && item.urlTemplate)
        .map((item, idx) => ({
          id: item.id || `json-${idx + 1}`,
          title: item.title || item.id || `Provider ${idx + 1}`,
          urlTemplate: String(item.urlTemplate),
          priority: Number(item.priority || idx + 100),
          weight: Number(item.weight || 1),
          method: String(item.method || "GET").toUpperCase(),
          bodyTemplate: item.bodyTemplate || "",
          headersJson: item.headersJson || "",
          pricePath: item.pricePath || "",
          minPath: item.minPath || "",
          maxPath: item.maxPath || "",
          updatedAtPath: item.updatedAtPath || "",
          confidence: item.confidence || "high"
        }));
    } catch (err) {
      return [];
    }
  })();

  const all = fromSlots.concat(fromJson);
  const unique = [];
  const seen = new Set();
  for (const item of all) {
    const key = item.urlTemplate.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique.sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

async function probeLandProvider(provider, { city, district, neighborhood, crop, lat, lon }) {
  const url = fillLandTemplate(provider.urlTemplate, { city, district, neighborhood, crop, lat, lon });
  const startedAt = Date.now();
  try {
    const headersFromProvider = safeJsonParse(
      fillLandRawTemplate(provider.headersJson || "", { city, district, neighborhood, crop, lat, lon }),
      {}
    );
    const method = String(provider.method || "GET").toUpperCase();
    const probeMethod = method === "HEAD" ? "HEAD" : "GET";
    const res = await fetch(url, {
      method: probeMethod,
      headers: headersFromProvider && typeof headersFromProvider === "object" ? headersFromProvider : {},
      signal: AbortSignal.timeout(Math.max(1500, Math.min(10000, LAND_PROVIDER_TIMEOUT_MS)))
    });
    return {
      id: provider.id,
      title: provider.title,
      method: provider.method || "GET",
      urlTemplate: provider.urlTemplate,
      ok: res.ok,
      statusCode: res.status,
      latencyMs: Date.now() - startedAt
    };
  } catch (err) {
    return {
      id: provider.id,
      title: provider.title,
      method: provider.method || "GET",
      urlTemplate: provider.urlTemplate,
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      error: err?.name === "TimeoutError" ? "timeout" : err?.message || "probe_failed"
    };
  }
}

function fillLandTemplate(template, { city, district, neighborhood, crop, lat, lon }) {
  return String(template)
    .replace(/\{city\}/g, encodeURIComponent(city || ""))
    .replace(/\{district\}/g, encodeURIComponent(district || ""))
    .replace(/\{neighborhood\}/g, encodeURIComponent(neighborhood || ""))
    .replace(/\{crop\}/g, encodeURIComponent(crop || ""))
    .replace(/\{lat\}/g, encodeURIComponent(lat || ""))
    .replace(/\{lon\}/g, encodeURIComponent(lon || ""));
}

function fillLandRawTemplate(template, { city, district, neighborhood, crop, lat, lon }) {
  return String(template || "")
    .replace(/\{city\}/g, String(city || ""))
    .replace(/\{district\}/g, String(district || ""))
    .replace(/\{neighborhood\}/g, String(neighborhood || ""))
    .replace(/\{crop\}/g, String(crop || ""))
    .replace(/\{lat\}/g, String(lat || ""))
    .replace(/\{lon\}/g, String(lon || ""));
}

function safeJsonParse(value, fallback = null) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeListingRecord(item = {}) {
  const city = String(item.city || "").trim();
  const district = String(item.district || "").trim();
  const neighborhood = String(item.neighborhood || item.mahalle || "").trim();
  const crop = String(item.crop || "").trim();
  const priceTlDa = Number(item.priceTlDa || item.price_tl_da || 0);
  const areaDa = Number(item.areaDa || item.area_da || 0);
  const createdAt = item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString();
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const parsedCoords = parseCoordsTuple(item.coords || "");
  const latRaw = Number(item.lat);
  const lonRaw = Number(item.lon);
  const lat = parsedCoords?.lat ?? (Number.isFinite(latRaw) ? latRaw : null);
  const lon = parsedCoords?.lon ?? (Number.isFinite(lonRaw) ? lonRaw : null);
  const coordTuple =
    Number.isFinite(lat) && Number.isFinite(lon) ? `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}` : null;
  return {
    id,
    city,
    district,
    neighborhood: neighborhood || null,
    crop,
    title: String(item.title || "").trim() || null,
    url: String(item.url || "").trim() || null,
    source: String(item.source || "manual"),
    priceTlDa: Number.isFinite(priceTlDa) && priceTlDa > 0 ? Math.round(priceTlDa) : 0,
    areaDa: Number.isFinite(areaDa) && areaDa > 0 ? Number(areaDa.toFixed(2)) : null,
    coords: coordTuple,
    lat: Number.isFinite(lat) ? Number(lat.toFixed(6)) : null,
    lon: Number.isFinite(lon) ? Number(lon.toFixed(6)) : null,
    createdAt
  };
}

function listingFingerprint(item = {}) {
  const city = cityKey(item.city || "");
  const district = cityKey(item.district || "");
  const neighborhood = cityKey(item.neighborhood || "");
  const crop = cityKey(item.crop || "");
  const price = Math.round(Number(item.priceTlDa || 0));
  const area = Number(item.areaDa || 0) > 0 ? Number(Number(item.areaDa).toFixed(2)) : 0;
  const url = String(item.url || "").trim().toLowerCase();
  return [city, district, neighborhood, crop, price, area, url].join("|");
}

function mergeLandListings(records = [], options = {}) {
  const keepMax = Math.max(200, Math.min(LAND_LISTINGS_MAX_LIMIT, Number(options.keepMax || LAND_LISTINGS_DEFAULT_MAX)));
  const next = [];
  const seen = new Set();
  const push = (raw) => {
    const item = normalizeListingRecord(raw);
    if (!item.city || item.priceTlDa <= 0) return;
    const fp = listingFingerprint(item);
    if (seen.has(fp)) return;
    seen.add(fp);
    next.push(item);
  };
  records.forEach(push);
  return next
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, keepMax);
}

function filterOutlierListings(listings = []) {
  const vals = listings
    .map((item) => Number(item.priceTlDa || 0))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (vals.length < 8) return listings.slice();
  const q1 = vals[Math.floor(vals.length * 0.25)] || vals[0];
  const q3 = vals[Math.floor(vals.length * 0.75)] || vals[vals.length - 1];
  const iqr = Math.max(1, q3 - q1);
  const low = q1 - 2.2 * iqr;
  const high = q3 + 2.2 * iqr;
  return listings.filter((item) => {
    const p = Number(item.priceTlDa || 0);
    return Number.isFinite(p) && p >= low && p <= high;
  });
}

function queryLandListings({ city, district, neighborhood, crop }) {
  const cCity = cityKey(city);
  const cDistrict = cityKey(district);
  const cNeighborhood = cityKey(neighborhood);
  const cCrop = cityKey(crop);
  return landManualListings.filter((item) => {
    if (cCity && cityKey(item.city) !== cCity) return false;
    if (cDistrict && cityKey(item.district || "") !== cDistrict) return false;
    if (cNeighborhood && cityKey(item.neighborhood || "") !== cNeighborhood) return false;
    if (cCrop && cityKey(item.crop || "") !== cCrop) return false;
    return Number(item.priceTlDa || 0) > 0;
  });
}

function summarizeLandListings(listings = []) {
  const vals = listings
    .map((item) => Number(item.priceTlDa || 0))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const median = vals[Math.floor(vals.length / 2)];
  const q1 = vals[Math.floor(vals.length * 0.25)] || vals[0];
  const q3 = vals[Math.floor(vals.length * 0.75)] || vals[vals.length - 1];
  const confidenceScore = Math.max(0.45, Math.min(0.84, 0.45 + vals.length * 0.03));
  return {
    source: "manual-listings",
    sourceTitle: "Elle girilen ilanlar",
    priceTlDa: Math.round(median),
    minTlDa: Math.round(q1),
    maxTlDa: Math.round(q3),
    listingCount: vals.length,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3))
  };
}

function buildManualLandSignal({ city, district, neighborhood, crop }) {
  const cCity = cityKey(city);
  const cDistrict = cityKey(district);
  const cNeighborhood = cityKey(neighborhood);
  const cCrop = cityKey(crop);
  const rows = landManualListings
    .filter((item) => cityKey(item.city || "") === cCity && Number(item.priceTlDa || 0) > 0)
    .map((item) => {
      const itemDistrict = cityKey(item.district || "");
      const itemNeighborhood = cityKey(item.neighborhood || "");
      const itemCrop = cityKey(item.crop || "");
      const createdAtTs = item.createdAt ? new Date(item.createdAt).getTime() : Date.now();
      const ageDays = Number.isFinite(createdAtTs) ? (Date.now() - createdAtTs) / (24 * 3600 * 1000) : 365;
      const recency = ageDays <= 30 ? 1.18 : ageDays <= 90 ? 1.08 : ageDays <= 180 ? 0.96 : 0.82;
      const districtWeight = cDistrict && itemDistrict === cDistrict ? 1.24 : cDistrict ? 0.88 : 1;
      const neighborhoodWeight = cNeighborhood && itemNeighborhood === cNeighborhood ? 1.3 : cNeighborhood ? 0.82 : 1;
      const cropWeight = cCrop && itemCrop === cCrop ? 1.18 : cCrop ? 0.92 : 1;
      const weight = recency * districtWeight * neighborhoodWeight * cropWeight;
      return { item, weight };
    })
    .filter((row) => Number.isFinite(row.weight) && row.weight > 0);

  if (!rows.length) return null;
  const weighted = rows
    .slice()
    .sort((a, b) => Number(a.item.priceTlDa || 0) - Number(b.item.priceTlDa || 0));
  const totalW = weighted.reduce((acc, row) => acc + row.weight, 0) || 1;
  let cumulative = 0;
  let median = Number(weighted[0].item.priceTlDa || 0);
  for (const row of weighted) {
    cumulative += row.weight;
    if (cumulative >= totalW * 0.5) {
      median = Number(row.item.priceTlDa || 0);
      break;
    }
  }
  const mean =
    weighted.reduce((acc, row) => acc + Number(row.item.priceTlDa || 0) * row.weight, 0) / totalW;
  const variance =
    weighted.reduce((acc, row) => {
      const diff = Number(row.item.priceTlDa || 0) - mean;
      return acc + row.weight * diff * diff;
    }, 0) / totalW;
  const std = Math.sqrt(Math.max(0, variance));
  const spread = Math.max(0.06, Math.min(0.24, (mean > 0 ? std / mean : 0.16) + 0.06));
  const confidenceScore = Math.max(0.44, Math.min(0.9, 0.5 + Math.min(0.22, rows.length * 0.018) - spread * 0.2));
  const districtCoverage = cDistrict ? rows.filter((r) => cityKey(r.item.district || "") === cDistrict).length : 0;
  const neighborhoodCoverage = cNeighborhood
    ? rows.filter((r) => cityKey(r.item.neighborhood || "") === cNeighborhood).length
    : 0;
  const cropCoverage = cCrop ? rows.filter((r) => cityKey(r.item.crop || "") === cCrop).length : 0;
  const matchQuality =
    neighborhoodCoverage > 0 && cropCoverage > 0 ? "high"
      : districtCoverage > 0 && cropCoverage > 0 ? "high"
      : neighborhoodCoverage > 0 || districtCoverage > 0 || cropCoverage > 0 ? "medium"
      : "low-medium";
  return {
    source: "manual-listings",
    sourceTitle: "Elle girilen ilanlar",
    priceTlDa: Math.round(median),
    minTlDa: Math.round(Math.max(8000, mean * (1 - spread))),
    maxTlDa: Math.round(Math.max(mean + 1000, mean * (1 + spread))),
    listingCount: rows.length,
    districtCoverage,
    neighborhoodCoverage,
    cropCoverage,
    matchQuality,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3))
  };
}

function buildComparableLandSignal({ city, district, neighborhood, crop }) {
  const cityRows = queryLandListings({ city, district: "", neighborhood: "", crop: "" });
  if (cityRows.length < 5) return null;
  const cDistrict = cityKey(district || "");
  const cNeighborhood = cityKey(neighborhood || "");
  const cCrop = cityKey(crop || "");
  const now = Date.now();
  const rows = cityRows
    .map((item) => {
      const price = Number(item.priceTlDa || 0);
      if (!Number.isFinite(price) || price <= 0) return null;
      const itemDistrict = cityKey(item.district || "");
      const itemNeighborhood = cityKey(item.neighborhood || "");
      const itemCrop = cityKey(item.crop || "");
      const districtMatch = cDistrict && itemDistrict === cDistrict;
      const neighborhoodMatch = cNeighborhood && itemNeighborhood === cNeighborhood;
      const cropMatch = cCrop && itemCrop === cCrop;
      const createdAtTs = item.createdAt ? new Date(item.createdAt).getTime() : now;
      const ageDays = Number.isFinite(createdAtTs) ? (now - createdAtTs) / (24 * 3600 * 1000) : 365;
      const recencyWeight = ageDays <= 30 ? 1.22 : ageDays <= 90 ? 1.08 : ageDays <= 180 ? 0.94 : 0.8;
      const districtWeight = districtMatch ? 1.35 : cDistrict ? 0.86 : 1;
      const neighborhoodWeight = neighborhoodMatch ? 1.38 : cNeighborhood ? 0.8 : 1;
      const cropWeight = cropMatch ? 1.3 : cCrop ? 0.88 : 1;
      const weight = recencyWeight * districtWeight * neighborhoodWeight * cropWeight;
      return {
        price,
        weight,
        districtMatch,
        neighborhoodMatch,
        cropMatch
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price);

  if (!rows.length) return null;
  const totalWeight = rows.reduce((acc, row) => acc + row.weight, 0) || 1;
  let rolling = 0;
  let weightedMedian = rows[Math.floor(rows.length / 2)].price;
  for (const row of rows) {
    rolling += row.weight;
    if (rolling >= totalWeight * 0.5) {
      weightedMedian = row.price;
      break;
    }
  }
  const weightedMean = rows.reduce((acc, row) => acc + row.price * row.weight, 0) / totalWeight;
  const weightedVar =
    rows.reduce((acc, row) => acc + row.weight * Math.pow(row.price - weightedMean, 2), 0) / totalWeight;
  const weightedStd = Math.sqrt(Math.max(0, weightedVar));
  const spread = Math.max(0.07, Math.min(0.26, weightedMean > 0 ? weightedStd / weightedMean : 0.18));
  const districtHits = rows.filter((row) => row.districtMatch).length;
  const neighborhoodHits = rows.filter((row) => row.neighborhoodMatch).length;
  const cropHits = rows.filter((row) => row.cropMatch).length;
  const exactHits = rows.filter((row) => (row.neighborhoodMatch || row.districtMatch) && row.cropMatch).length;
  const matchQuality =
    exactHits >= 3 ? "high" : neighborhoodHits >= 3 || districtHits >= 3 || cropHits >= 3 ? "medium" : "low-medium";
  const confidenceScore = Math.max(
    0.4,
    Math.min(
      0.88,
      0.5 +
        Math.min(0.16, rows.length * 0.012) +
        (exactHits >= 3 ? 0.08 : neighborhoodHits >= 3 ? 0.05 : districtHits >= 3 ? 0.04 : 0) -
        spread * 0.24
    )
  );

  return {
    source: "comparable-listings",
    sourceTitle: "Emsal ilan sinyali",
    priceTlDa: Math.round(weightedMedian),
    minTlDa: Math.round(Math.max(8000, weightedMean * (1 - spread))),
    maxTlDa: Math.round(Math.max(weightedMean + 1000, weightedMean * (1 + spread))),
    listingCount: rows.length,
    districtCoverage: districtHits,
    neighborhoodCoverage: neighborhoodHits,
    cropCoverage: cropHits,
    exactCoverage: exactHits,
    matchQuality,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3))
  };
}

function buildGeoKnnLandSignal({ city, district, neighborhood, crop, lat, lon }) {
  const cCity = cityKey(city);
  if (!cCity) return null;
  const cDistrict = cityKey(district || "");
  const cNeighborhood = cityKey(neighborhood || "");
  const cCrop = cityKey(crop || "");
  const targetPoint =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      ? { lat: Number(lat), lon: Number(lon) }
      : getDistrictCentroid(city, district);
  const now = Date.now();
  const rows = landManualListings
    .filter((item) => cityKey(item.city || "") === cCity)
    .map((item) => {
      const price = Number(item.priceTlDa || 0);
      if (!Number.isFinite(price) || price <= 0) return null;
      const listingPoint =
        (Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
          ? { lat: Number(item.lat), lon: Number(item.lon) }
          : parseCoordsTuple(item.coords || "")) || getDistrictCentroid(item.city || city, item.district || "");
      const distanceKm = targetPoint && listingPoint ? haversineKm(targetPoint, listingPoint) : null;
      const distanceWeight =
        distanceKm == null ? 0.82 : Math.max(0.35, Math.min(1.35, Math.exp(-Math.max(0, distanceKm) / 45)));
      const districtMatch = cDistrict && cityKey(item.district || "") === cDistrict;
      const neighborhoodMatch = cNeighborhood && cityKey(item.neighborhood || "") === cNeighborhood;
      const cropMatch = cCrop && cityKey(item.crop || "") === cCrop;
      const districtWeight = districtMatch ? 1.34 : cDistrict ? 0.88 : 1;
      const neighborhoodWeight = neighborhoodMatch ? 1.42 : cNeighborhood ? 0.78 : 1;
      const cropWeight = cropMatch ? 1.28 : cCrop ? 0.9 : 1;
      const createdAtTs = item.createdAt ? new Date(item.createdAt).getTime() : now;
      const ageDays = Number.isFinite(createdAtTs) ? (now - createdAtTs) / (24 * 3600 * 1000) : 365;
      const recencyWeight = ageDays <= 30 ? 1.18 : ageDays <= 90 ? 1.06 : ageDays <= 180 ? 0.95 : 0.82;
      const weight = distanceWeight * districtWeight * neighborhoodWeight * cropWeight * recencyWeight;
      return { price, weight, distanceKm, districtMatch, neighborhoodMatch, cropMatch };
    })
    .filter((x) => x && Number.isFinite(x.weight) && x.weight > 0)
    .sort((a, b) => a.price - b.price);
  if (rows.length < 5) return null;
  const totalW = rows.reduce((acc, x) => acc + x.weight, 0) || 1;
  let cum = 0;
  let median = rows[Math.floor(rows.length / 2)].price;
  for (const row of rows) {
    cum += row.weight;
    if (cum >= totalW * 0.5) {
      median = row.price;
      break;
    }
  }
  const mean = rows.reduce((acc, x) => acc + x.price * x.weight, 0) / totalW;
  const variance =
    rows.reduce((acc, x) => acc + Math.pow(x.price - mean, 2) * x.weight, 0) / totalW;
  const std = Math.sqrt(Math.max(0, variance));
  const spread = Math.max(0.06, Math.min(0.25, mean > 0 ? std / mean : 0.17));
  const weightedAvgDistance =
    rows.reduce((acc, x) => acc + (Number(x.distanceKm) || 35) * x.weight, 0) / totalW;
  const exactCoverage = rows.filter((x) => (x.neighborhoodMatch || x.districtMatch) && x.cropMatch).length;
  const confidenceScore = Math.max(
    0.42,
    Math.min(
      0.9,
      0.52 +
        Math.min(0.16, rows.length * 0.012) +
        Math.min(0.08, exactCoverage * 0.015) -
        Math.min(0.18, weightedAvgDistance / 260) -
        spread * 0.2
    )
  );
  return {
    source: "geo-knn-model",
    sourceTitle: "Konum tabanli emsal model",
    priceTlDa: Math.round(median),
    minTlDa: Math.round(Math.max(8000, mean * (1 - spread))),
    maxTlDa: Math.round(Math.max(mean + 1000, mean * (1 + spread))),
    listingCount: rows.length,
    avgDistanceKm: Number(weightedAvgDistance.toFixed(2)),
    exactCoverage,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3))
  };
}

function medianOfNumbers(values = []) {
  const sorted = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

function buildLandContextInsights({ city, district, neighborhood, crop, priceTlDa }) {
  const cCity = cityKey(city || "");
  if (!cCity) return null;
  const cDistrict = cityKey(district || "");
  const cNeighborhood = cityKey(neighborhood || "");
  const cCrop = cityKey(crop || "");
  const current = Number(priceTlDa || 0);
  const cityRows = landManualListings.filter((item) => cityKey(item.city || "") === cCity);
  if (!cityRows.length) return null;
  const cityPrices = cityRows.map((item) => Number(item.priceTlDa || 0)).filter((x) => Number.isFinite(x) && x > 0);
  const cityMedian = medianOfNumbers(cityPrices);
  if (!cityMedian) return null;

  const districtRows = cDistrict
    ? cityRows.filter((item) => cityKey(item.district || "") === cDistrict)
    : [];
  const neighborhoodRows = cNeighborhood
    ? cityRows.filter((item) => cityKey(item.neighborhood || "") === cNeighborhood)
    : [];
  const cropRows = cCrop ? cityRows.filter((item) => cityKey(item.crop || "") === cCrop) : [];
  const neighborhoodMedian = medianOfNumbers(neighborhoodRows.map((item) => Number(item.priceTlDa || 0)));
  const districtMedian = medianOfNumbers(districtRows.map((item) => Number(item.priceTlDa || 0)));
  const cropMedian = medianOfNumbers(cropRows.map((item) => Number(item.priceTlDa || 0)));
  const refPrice = neighborhoodMedian || districtMedian || cropMedian || cityMedian;
  const premiumPct = refPrice > 0 && current > 0 ? Number((((current - refPrice) / refPrice) * 100).toFixed(2)) : 0;

  const districtMap = new Map();
  cityRows.forEach((item) => {
    const key = cityKey(item.district || "");
    if (!key) return;
    const list = districtMap.get(key) || [];
    const value = Number(item.priceTlDa || 0);
    if (Number.isFinite(value) && value > 0) {
      list.push(value);
      districtMap.set(key, list);
    }
  });
  const districtMedians = Array.from(districtMap.entries())
    .map(([key, values]) => ({
      key,
      district: cityRows.find((row) => cityKey(row.district || "") === key)?.district || key,
      median: Number(medianOfNumbers(values) || 0),
      count: values.length
    }))
    .filter((x) => x.median > 0)
    .sort((a, b) => b.median - a.median);

  const topDistricts = districtMedians.slice(0, 3).map((x) => ({
    district: x.district,
    medianTlDa: Math.round(x.median),
    sampleCount: x.count
  }));
  const lowDistricts = districtMedians.slice(-3).reverse().map((x) => ({
    district: x.district,
    medianTlDa: Math.round(x.median),
    sampleCount: x.count
  }));
  const districtRank = cDistrict
    ? districtMedians.findIndex((item) => item.key === cDistrict) + 1
    : 0;
  const neighborhoodMap = new Map();
  cityRows.forEach((item) => {
    const key = cityKey(item.neighborhood || "");
    if (!key) return;
    const list = neighborhoodMap.get(key) || [];
    const value = Number(item.priceTlDa || 0);
    if (Number.isFinite(value) && value > 0) {
      list.push(value);
      neighborhoodMap.set(key, list);
    }
  });
  const neighborhoodMedians = Array.from(neighborhoodMap.entries())
    .map(([key, values]) => ({
      key,
      neighborhood: cityRows.find((row) => cityKey(row.neighborhood || "") === key)?.neighborhood || key,
      median: Number(medianOfNumbers(values) || 0),
      count: values.length
    }))
    .filter((x) => x.median > 0)
    .sort((a, b) => b.median - a.median);
  const neighborhoodRank = cNeighborhood
    ? neighborhoodMedians.findIndex((item) => item.key === cNeighborhood) + 1
    : 0;

  const scopedRows = neighborhoodRows.length ? neighborhoodRows : districtRows.length ? districtRows : cityRows;
  const ageDays = scopedRows
    .map((item) => {
      const ts = new Date(item.createdAt || 0).getTime();
      if (!Number.isFinite(ts) || ts <= 0) return null;
      return (Date.now() - ts) / (24 * 3600 * 1000);
    })
    .filter((x) => x !== null);
  const avgListingAgeDays = ageDays.length
    ? Number((ageDays.reduce((acc, x) => acc + Number(x || 0), 0) / ageDays.length).toFixed(1))
    : null;
  const freshnessScore = avgListingAgeDays === null
    ? 40
    : Math.max(0, Math.min(100, Math.round(100 - Math.min(80, avgListingAgeDays * 1.2))));

  return {
    cityMedianTlDa: Math.round(cityMedian),
    neighborhoodMedianTlDa: neighborhoodMedian ? Math.round(neighborhoodMedian) : null,
    districtMedianTlDa: districtMedian ? Math.round(districtMedian) : null,
    cropMedianTlDa: cropMedian ? Math.round(cropMedian) : null,
    referencePriceTlDa: Math.round(refPrice),
    premiumPct,
    marketPosition:
      premiumPct >= 10 ? "ust-bant"
        : premiumPct >= 3 ? "ust-orta"
        : premiumPct <= -10 ? "alt-bant"
        : premiumPct <= -3 ? "alt-orta"
        : "denge",
    neighborhoodRank: neighborhoodRank || null,
    neighborhoodTotal: neighborhoodMedians.length || null,
    districtRank: districtRank || null,
    districtTotal: districtMedians.length || null,
    topDistricts,
    lowDistricts,
    sampleCount: scopedRows.length,
    avgListingAgeDays,
    freshnessScore
  };
}

function buildLandDecisionSignals(payload = {}) {
  const price = Number(payload?.priceTlDa || 0);
  if (!Number.isFinite(price) || price <= 0) return null;
  const uncertaintyPct = Number(payload?.uncertaintyPct || 18);
  const confidence = Number(payload?.confidenceScore || 0.45);
  const freshness = Number(payload?.contextInsights?.freshnessScore || 45);
  const sampleCount = Number(payload?.contextInsights?.sampleCount || payload?.listingCount || 0);
  const premiumPct = Number(payload?.contextInsights?.premiumPct || 0);
  const sampleScore = Math.max(0, Math.min(100, Math.round(Math.log10(sampleCount + 1) * 42)));
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - Math.min(70, uncertaintyPct * 2.1))));
  const valuationScore = Math.max(0, Math.min(100, Math.round(100 - Math.min(60, Math.abs(premiumPct) * 2.5))));
  const confidenceScore = Math.round(confidence * 100);
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        confidenceScore * 0.34 +
          freshness * 0.18 +
          sampleScore * 0.2 +
          stabilityScore * 0.18 +
          valuationScore * 0.1
      )
    )
  );
  const grade = score >= 82 ? "A" : score >= 70 ? "B" : score >= 58 ? "C" : "D";

  const discountPct = Math.max(1, Math.min(10, uncertaintyPct * 0.4));
  const premiumAskPct = Math.max(2, Math.min(12, uncertaintyPct * 0.55 + (premiumPct > 0 ? 1.2 : 0)));
  const suggestedBidTlDa = Math.round(price * (1 - discountPct / 100));
  const suggestedAskTlDa = Math.round(price * (1 + premiumAskPct / 100));
  return {
    score,
    grade,
    confidenceScore,
    freshnessScore: freshness,
    sampleScore,
    stabilityScore,
    valuationScore,
    suggestedBidTlDa,
    suggestedAskTlDa,
    suggestedSpreadPct: Number((premiumAskPct + discountPct).toFixed(1))
  };
}

function deriveListingPremium({ city, district, neighborhood, crop }) {
  const cCity = cityKey(city);
  if (!cCity) return null;
  const cDistrict = cityKey(district || "");
  const cNeighborhood = cityKey(neighborhood || "");
  const cCrop = cityKey(crop || "");
  const cityRows = landManualListings.filter((item) => cityKey(item.city || "") === cCity);
  if (cityRows.length < 8) return null;

  const cityMedian = medianOfNumbers(cityRows.map((x) => Number(x.priceTlDa || 0)));
  if (!cityMedian || cityMedian <= 0) return null;

  const districtRows = cDistrict ? cityRows.filter((item) => cityKey(item.district || "") === cDistrict) : [];
  const neighborhoodRows = cNeighborhood
    ? cityRows.filter((item) => cityKey(item.neighborhood || "") === cNeighborhood)
    : [];
  const cropRows = cCrop ? cityRows.filter((item) => cityKey(item.crop || "") === cCrop) : [];
  const districtCropRows =
    cDistrict && cCrop
      ? cityRows.filter((item) => cityKey(item.district || "") === cDistrict && cityKey(item.crop || "") === cCrop)
      : [];
  const neighborhoodCropRows =
    cNeighborhood && cCrop
      ? cityRows.filter(
          (item) => cityKey(item.neighborhood || "") === cNeighborhood && cityKey(item.crop || "") === cCrop
        )
      : [];

  const getStats = (rows = []) => {
    const vals = rows.map((x) => Number(x.priceTlDa || 0)).filter((x) => Number.isFinite(x) && x > 0);
    if (!vals.length) return null;
    const med = medianOfNumbers(vals);
    const mad = medianOfNumbers(vals.map((x) => Math.abs(x - med)));
    const spreadPct = med > 0 ? (mad / med) * 100 : 0;
    return {
      median: med,
      count: vals.length,
      spreadPct: Number(spreadPct.toFixed(2))
    };
  };

  const cityStats = getStats(cityRows);
  if (!cityStats?.median || cityStats.median <= 0) return null;

  const layers = [
    { id: "neighborhood+crop", stats: getStats(neighborhoodCropRows), prior: 12, weight: 1.16 },
    { id: "district+crop", stats: getStats(districtCropRows), prior: 14, weight: 1.12 },
    { id: "neighborhood", stats: getStats(neighborhoodRows), prior: 18, weight: 1.08 },
    { id: "district", stats: getStats(districtRows), prior: 22, weight: 1.04 },
    { id: "crop", stats: getStats(cropRows), prior: 26, weight: 0.9 }
  ].filter((item) => item.stats && item.stats.count > 0);
  if (!layers.length) return null;

  // Hierarchical shrinkage: small-sample mahalle/ilce medians are softly pulled to city median.
  let weightedNumerator = 0;
  let weightedDenominator = 0;
  let totalSignals = 0;
  layers.forEach((layer) => {
    const n = Number(layer.stats.count || 0);
    const prior = Number(layer.prior || 16);
    const shrink = n / (n + prior);
    const adjustedMedian = cityStats.median + (layer.stats.median - cityStats.median) * shrink;
    const stability = Math.max(0.55, Math.min(1, 1 - Number(layer.stats.spreadPct || 0) / 120));
    const layerWeight = Math.max(0.2, Math.min(2.4, layer.weight * shrink * stability));
    weightedNumerator += adjustedMedian * layerWeight;
    weightedDenominator += layerWeight;
    totalSignals += n;
  });

  const targetMedian = weightedDenominator > 0 ? weightedNumerator / weightedDenominator : null;
  if (!targetMedian || targetMedian <= 0) return null;

  const rawFactor = targetMedian / cityStats.median;
  const factor = Math.max(0.78, Math.min(1.32, rawFactor));
  const confidence = Math.max(
    0.36,
    Math.min(
      0.88,
      0.42 +
        Math.min(0.2, totalSignals * 0.008) +
        Math.min(0.14, layers.length * 0.03) -
        Math.max(0, Math.abs(1 - factor) - 0.18) * 0.2
    )
  );

  const strongest = layers[0];

  return {
    factor: Number(factor.toFixed(3)),
    confidenceScore: Number(confidence.toFixed(3)),
    baseCityMedianTlDa: Math.round(cityStats.median),
    targetMedianTlDa: Math.round(targetMedian),
    sampleCount: totalSignals,
    basis: strongest?.id || "multi-layer",
    layers: layers.map((row) => ({
      basis: row.id,
      count: row.stats.count,
      medianTlDa: Math.round(row.stats.median),
      spreadPct: row.stats.spreadPct
    }))
  };
}

function normalizeLandBlendConfig(input = {}) {
  const outlierPivot = Math.max(
    0.08,
    Math.min(0.5, Number(input?.outlierPivot ?? input?.pivot ?? LAND_BLEND_OUTLIER_PIVOT))
  );
  const minReliability = Math.max(
    0.05,
    Math.min(0.4, Number(input?.minReliability ?? input?.min ?? LAND_BLEND_MIN_RELIABILITY))
  );
  return {
    outlierPivot,
    minReliability
  };
}

function blendLandPriceSignals(candidates = [], blendConfig = null) {
  const rows = (candidates || [])
    .filter((item) => Number.isFinite(Number(item?.priceTlDa)) && Number(item.priceTlDa) > 0)
    .map((item) => ({
      ...item,
      confidenceScore: Number(item.confidenceScore || confidenceLabelToScore(item.confidence || "medium") || 0.5),
      weight: Math.max(0.1, Number(item.weight || 1))
    }));
  if (!rows.length) return null;
  const config = normalizeLandBlendConfig(blendConfig || {});
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const baseWeightedSum = rows.reduce((acc, row) => acc + Number(row.priceTlDa || 0) * row.weight * row.confidenceScore, 0);
  const baseTotalWeight = rows.reduce((acc, row) => acc + row.weight * row.confidenceScore, 0) || 1;
  const baseCenter = baseWeightedSum / baseTotalWeight;
  const robustRows = rows.map((row) => {
    const price = Number(row.priceTlDa || 0);
    const residualRatio = Math.abs(price - baseCenter) / Math.max(1, baseCenter);
    const reliability = 1 / (1 + Math.pow(residualRatio / config.outlierPivot, 2));
    return {
      ...row,
      residualRatio,
      reliability: clamp(reliability, config.minReliability, 1)
    };
  });
  const robustTotalWeight =
    robustRows.reduce((acc, row) => acc + row.weight * row.confidenceScore * row.reliability, 0) || 1;
  const weightedPrice =
    robustRows.reduce((acc, row) => acc + Number(row.priceTlDa || 0) * row.weight * row.confidenceScore * row.reliability, 0) /
    robustTotalWeight;
  const weightedMin =
    robustRows.reduce(
      (acc, row) => acc + Number(row.minTlDa || row.priceTlDa * 0.9) * row.weight * row.confidenceScore * row.reliability,
      0
    ) / robustTotalWeight;
  const weightedMax =
    robustRows.reduce(
      (acc, row) => acc + Number(row.maxTlDa || row.priceTlDa * 1.1) * row.weight * row.confidenceScore * row.reliability,
      0
    ) / robustTotalWeight;
  const disagreement =
    robustRows.length >= 2
      ? robustRows.reduce((acc, row) => acc + row.residualRatio * row.reliability, 0) /
        (robustRows.reduce((acc, row) => acc + row.reliability, 0) || 1)
      : 0;
  const confidenceScore = Math.max(
    0.36,
    Math.min(
      0.93,
      robustRows.reduce((acc, row) => acc + row.confidenceScore * row.weight * row.reliability, 0) /
        (robustRows.reduce((acc, row) => acc + row.weight * row.reliability, 0) || 1) -
        disagreement * 0.28 +
        Math.min(0.08, robustRows.length * 0.018)
    )
  );
  return {
    source: "hybrid-ensemble",
    sourceTitle: "Hibrit fiyat uzlasisi",
    priceTlDa: Math.round(weightedPrice),
    minTlDa: Math.round(Math.min(weightedMin, weightedPrice * 0.98)),
    maxTlDa: Math.round(Math.max(weightedMax, weightedPrice * 1.02)),
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    blendConfig: config,
    componentCount: robustRows.length,
    components: robustRows.map((row) => ({
      source: row.source,
      sourceTitle: row.sourceTitle || row.source,
      method: row.method || null,
      priceTlDa: Number(row.priceTlDa || 0),
      confidenceScore: Number(row.confidenceScore || 0),
      weight: Number(row.weight || 1),
      reliability: Number(row.reliability || 1)
    }))
  };
}

function buildLandEnsembleCandidates({
  remote = null,
  manual = null,
  comparable = null,
  geoKnn = null,
  internet = null,
  trendModel = null,
  trendSignal = null
} = {}) {
  const candidates = [];
  if (remote?.priceTlDa) {
    candidates.push({
      ...remote,
      method: "api",
      weight: 1.5,
      sourceUrl: remote.url || null
    });
  }
  if (manual?.priceTlDa) {
    candidates.push({
      ...manual,
      method: "manual-listings",
      weight: manual.matchQuality === "high" ? 1.45 : manual.matchQuality === "medium" ? 1.2 : 1
    });
  }
  if (comparable?.priceTlDa) {
    candidates.push({
      ...comparable,
      method: "comparable-listings",
      weight: comparable.matchQuality === "high" ? 1.4 : comparable.matchQuality === "medium" ? 1.18 : 0.95
    });
  }
  if (geoKnn?.priceTlDa) {
    candidates.push({
      ...geoKnn,
      method: "geo-knn-model",
      weight: 1.5
    });
  }
  if (internet?.priceTlDa) {
    candidates.push({
      ...internet,
      method: "internet-scan",
      weight: 0.85
    });
  }
  if (trendModel?.priceTlDa) {
    candidates.push({
      ...trendModel,
      method: "trend-model",
      weight: trendSignal ? 0.95 : 0.75
    });
  }
  return candidates;
}

function buildLandTrendSignal({ city, district, neighborhood, crop }) {
  const cCity = cityKey(city);
  const cDistrict = cityKey(district);
  const cNeighborhood = cityKey(neighborhood);
  const cCrop = cityKey(crop);
  const rows = landManualListings
    .filter((item) => {
      if (cityKey(item.city || "") !== cCity) return false;
      if (cDistrict && cityKey(item.district || "") !== cDistrict) return false;
      if (cNeighborhood && cityKey(item.neighborhood || "") !== cNeighborhood) return false;
      if (cCrop && cityKey(item.crop || "") !== cCrop) return false;
      return Number(item.priceTlDa || 0) > 0;
    })
    .map((item) => ({
      price: Number(item.priceTlDa || 0),
      ts: item.createdAt ? new Date(item.createdAt).getTime() : Date.now()
    }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.ts))
    .sort((a, b) => b.ts - a.ts);

  if (rows.length < 6) return null;
  const now = Date.now();
  const recent = rows.filter((row) => now - row.ts <= 30 * 24 * 3600 * 1000);
  const baseline = rows.filter((row) => now - row.ts <= 180 * 24 * 3600 * 1000);
  if (recent.length < 3 || baseline.length < 6) return null;
  const medianOf = (arr) => {
    const vals = arr.map((x) => x.price).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)] || null;
  };
  const recentMedian = medianOf(recent);
  const baselineMedian = medianOf(baseline);
  if (!recentMedian || !baselineMedian) return null;
  const rawMomentum = (recentMedian - baselineMedian) / Math.max(1, baselineMedian);
  const momentum = Math.max(-0.16, Math.min(0.18, rawMomentum));
  return {
    recentCount: recent.length,
    baselineCount: baseline.length,
    recentMedianTlDa: Math.round(recentMedian),
    baselineMedianTlDa: Math.round(baselineMedian),
    momentumPct: Number((momentum * 100).toFixed(2))
  };
}

function applyTrendToEstimate(estimate, trendSignal) {
  if (!estimate || !trendSignal) return estimate || null;
  const basePrice = Number(estimate.priceTlDa || 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return estimate;
  const momentum = Number(trendSignal.momentumPct || 0) / 100;
  const priceTlDa = Math.round(basePrice * (1 + momentum * 0.65));
  const minTlDa = Math.round(Number(estimate.minTlDa || basePrice * 0.9) * (1 + momentum * 0.45));
  const maxTlDa = Math.round(Number(estimate.maxTlDa || basePrice * 1.1) * (1 + momentum * 0.85));
  const confidenceScore = Math.max(
    0.35,
    Math.min(0.9, Number(estimate.confidenceScore || confidenceLabelToScore(estimate.confidence || "medium")) + 0.03)
  );
  return {
    ...estimate,
    source: "trend-adjusted-model",
    sourceTitle: "Trend duzeltilmis model",
    priceTlDa,
    minTlDa: Math.min(minTlDa, priceTlDa),
    maxTlDa: Math.max(maxTlDa, priceTlDa),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    confidence: confidenceScoreToLabel(confidenceScore),
    trendSignal
  };
}

function applyLandInputAdjustment(basePayload = {}, input = {}) {
  const normalized = normalizeLandFeatureInput(input);
  const basePrice = Number(basePayload.priceTlDa || 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return basePayload;

  const zoneFactor = normalized.zone === "ova" ? 1.08 : normalized.zone === "yamac" ? 0.92 : 1;
  const irrigationFactor = normalized.irrigation === "var" ? 1.06 : 0.92;
  const roadFactor = normalized.roadAccess === "iyi" ? 1.05 : normalized.roadAccess === "zayif" ? 0.93 : 1;
  const soilFactor = 0.9 + (Math.max(0, Math.min(100, Number(normalized.soilScore || 65))) / 100) * 0.2;
  const slopeFactor = 1 - Math.max(0, Math.min(45, Number(normalized.slopePct || 6))) * 0.0045;

  const rawFactor = zoneFactor * irrigationFactor * roadFactor * soilFactor * slopeFactor;
  const factor = Math.max(0.78, Math.min(1.24, rawFactor));

  const minBase = Number(basePayload.minTlDa || basePrice * 0.9);
  const maxBase = Number(basePayload.maxTlDa || basePrice * 1.1);
  const adjustedPrice = Math.round(basePrice * factor);
  const adjustedMin = Math.round(minBase * Math.max(0.82, factor - 0.02));
  const adjustedMax = Math.round(maxBase * Math.min(1.3, factor + 0.03));
  const conf = Number(basePayload.confidenceScore || confidenceLabelToScore(basePayload.confidence || "medium"));
  const delta = Math.abs(1 - factor);
  const adjustedConfidence = Math.max(0.34, Math.min(0.95, conf - Math.max(0, delta - 0.08) * 0.3));

  return {
    ...basePayload,
    rawPriceTlDa: basePrice,
    rawMinTlDa: minBase,
    rawMaxTlDa: maxBase,
    priceTlDa: adjustedPrice,
    minTlDa: Math.min(adjustedMin, adjustedPrice),
    maxTlDa: Math.max(adjustedMax, adjustedPrice),
    confidenceScore: Number(adjustedConfidence.toFixed(3)),
    confidence: confidenceScoreToLabel(adjustedConfidence),
    landInput: normalized,
    adjustment: {
      factor: Number(factor.toFixed(3)),
      zoneFactor: Number(zoneFactor.toFixed(3)),
      irrigationFactor: Number(irrigationFactor.toFixed(3)),
      roadFactor: Number(roadFactor.toFixed(3)),
      soilFactor: Number(soilFactor.toFixed(3)),
      slopeFactor: Number(slopeFactor.toFixed(3))
    }
  };
}

function stabilizeLandPriceWithLocalContext(payload = {}, contextInsights = null) {
  const current = Number(payload?.priceTlDa || 0);
  const reference = Number(contextInsights?.referencePriceTlDa || 0);
  const sampleCount = Number(contextInsights?.sampleCount || 0);
  if (!Number.isFinite(current) || current <= 0) return payload;
  if (!Number.isFinite(reference) || reference <= 0) return payload;
  if (sampleCount < 3) return payload;

  const diffPct = Math.abs(((current - reference) / reference) * 100);
  if (!Number.isFinite(diffPct) || diffPct < 8) return payload;

  const hasNeighborhood = Number(contextInsights?.neighborhoodMedianTlDa || 0) > 0;
  const hasDistrict = Number(contextInsights?.districtMedianTlDa || 0) > 0;
  const baseBlend = sampleCount >= 20 ? 0.38 : sampleCount >= 10 ? 0.28 : sampleCount >= 5 ? 0.18 : 0.1;
  const scopeBoost = hasNeighborhood ? 0.16 : hasDistrict ? 0.1 : 0.04;
  const deviationBoost = diffPct >= 35 ? 0.12 : diffPct >= 20 ? 0.06 : 0;
  const blend = Math.max(0.08, Math.min(0.58, baseBlend + scopeBoost + deviationBoost));

  const minBase = Number(payload?.minTlDa || current * 0.9);
  const maxBase = Number(payload?.maxTlDa || current * 1.1);
  const anchoredPrice = Math.round(current * (1 - blend) + reference * blend);
  const anchoredMin = Math.round(minBase * (1 - blend * 0.6) + reference * blend * 0.6);
  const anchoredMax = Math.round(maxBase * (1 - blend * 0.5) + reference * blend * 0.5);
  const conf = Number(payload?.confidenceScore || confidenceLabelToScore(payload?.confidence || "medium"));
  const confidenceScore = Math.max(0.34, Math.min(0.95, conf + Math.min(0.08, blend * 0.12)));

  return {
    ...payload,
    priceTlDa: anchoredPrice,
    minTlDa: Math.min(anchoredMin, anchoredPrice),
    maxTlDa: Math.max(anchoredMax, anchoredPrice),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    confidence: confidenceScoreToLabel(confidenceScore),
    localContextAdjustment: {
      applied: true,
      blend: Number(blend.toFixed(3)),
      diffPctBefore: Number(diffPct.toFixed(2)),
      referencePriceTlDa: Math.round(reference),
      sampleCount,
      scope: hasNeighborhood ? "neighborhood" : hasDistrict ? "district" : "city"
    }
  };
}

function parseLandListingsCsv(csvText = "") {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const detectDelimiter = (line) => (line.includes(";") ? ";" : ",");
  const delimiter = detectDelimiter(lines[0]);
  const header = lines[0]
    .split(delimiter)
    .map((x) => x.trim().toLowerCase());
  const idx = {
    city: header.findIndex((x) => ["city", "sehir", "il"].includes(x)),
    district: header.findIndex((x) => ["district", "ilce"].includes(x)),
    neighborhood: header.findIndex((x) => ["neighborhood", "mahalle", "mah", "semt"].includes(x)),
    crop: header.findIndex((x) => ["crop", "urun", "bitki"].includes(x)),
    price: header.findIndex((x) => ["pricetlda", "price_tl_da", "fiyat_tl_da", "fiyat"].includes(x)),
    area: header.findIndex((x) => ["areada", "area_da", "alan_da", "alan"].includes(x)),
    title: header.findIndex((x) => ["title", "ilan"].includes(x)),
    url: header.findIndex((x) => ["url", "link"].includes(x)),
    lat: header.findIndex((x) => ["lat", "latitude", "enlem"].includes(x)),
    lon: header.findIndex((x) => ["lon", "lng", "longitude", "boylam"].includes(x)),
    coords: header.findIndex((x) => ["coords", "koordinat", "coord"].includes(x))
  };
  const out = [];
  lines.slice(1).forEach((line) => {
    const parts = line.split(delimiter).map((x) => x.trim());
    const rec = normalizeListingRecord({
      city: idx.city >= 0 ? parts[idx.city] : "",
      district: idx.district >= 0 ? parts[idx.district] : "",
      neighborhood: idx.neighborhood >= 0 ? parts[idx.neighborhood] : "",
      crop: idx.crop >= 0 ? parts[idx.crop] : "",
      priceTlDa: idx.price >= 0 ? toNumber(parts[idx.price]) : 0,
      areaDa: idx.area >= 0 ? toNumber(parts[idx.area]) : null,
      title: idx.title >= 0 ? parts[idx.title] : "",
      url: idx.url >= 0 ? parts[idx.url] : "",
      lat: idx.lat >= 0 ? toNumber(parts[idx.lat]) : null,
      lon: idx.lon >= 0 ? toNumber(parts[idx.lon]) : null,
      coords: idx.coords >= 0 ? parts[idx.coords] : "",
      source: "csv-import"
    });
    if (rec.city && rec.priceTlDa > 0) out.push(rec);
  });
  return out;
}

function normalizeTradeListing(item = {}) {
  const normEnum = (raw, allowed, fallback) => {
    const val = String(raw || "").trim().toLowerCase();
    return allowed.includes(val) ? val : fallback;
  };
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const typeRaw = String(item.type || "sell").toLowerCase();
  const type = typeRaw === "buy" ? "buy" : "sell";
  const statusRaw = String(item.status || "open").toLowerCase();
  const status = ["open", "closed", "paused"].includes(statusRaw) ? statusRaw : "open";
  const quantityKg = Number(item.quantityKg || 0);
  const priceTlKg = Number(item.priceTlKg || 0);
  return {
    id,
    type,
    status,
    city: String(item.city || "").trim(),
    district: String(item.district || "").trim() || null,
    crop: String(item.crop || "").trim(),
    title: String(item.title || "").trim() || null,
    quantityKg: Number.isFinite(quantityKg) && quantityKg > 0 ? Number(quantityKg.toFixed(2)) : 0,
    priceTlKg: Number.isFinite(priceTlKg) && priceTlKg > 0 ? Number(priceTlKg.toFixed(2)) : 0,
    deliveryType: normEnum(item.deliveryType, ["pickup", "seller_delivery", "cargo", "broker"], "pickup"),
    paymentType: normEnum(item.paymentType, ["cash", "transfer", "term", "escrow", "card"], "transfer"),
    qualityGrade: normEnum(item.qualityGrade, ["premium", "standard", "mixed", "processing"], "standard"),
    note: String(item.note || "").trim() || null,
    contact: String(item.contact || "").trim() || null,
    owner: String(item.owner || "").trim() || null,
    soldKg: Number.isFinite(Number(item.soldKg)) && Number(item.soldKg) > 0 ? Number(Number(item.soldKg).toFixed(2)) : 0,
    reservedKg:
      Number.isFinite(Number(item.reservedKg)) && Number(item.reservedKg) > 0
        ? Number(Number(item.reservedKg).toFixed(2))
        : 0,
    availableKg:
      Number.isFinite(Number(item.availableKg)) && Number(item.availableKg) >= 0
        ? Number(Number(item.availableKg).toFixed(2))
        : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
  };
}

function tradeActorKey(value = "") {
  return cityKey(String(value || "").replace(/\s+/g, ""));
}

function getListingAvailableKg(listing = {}) {
  const explicit = Number(listing.availableKg);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const qty = Number(listing.quantityKg || 0);
  const sold = Number(listing.soldKg || 0);
  const reserved = Number(listing.reservedKg || 0);
  return Math.max(0, qty - sold - reserved);
}

function normalizeListingForApi(listing = {}) {
  const qty = Math.max(0, Number(listing.quantityKg || 0));
  const sold = Math.max(0, Number(listing.soldKg || 0));
  const reserved = Math.max(0, Number(listing.reservedKg || 0));
  const available = Math.max(0, getListingAvailableKg(listing));
  return {
    ...listing,
    quantityKg: Number(qty.toFixed(2)),
    soldKg: Number(sold.toFixed(2)),
    reservedKg: Number(reserved.toFixed(2)),
    availableKg: Number(available.toFixed(2))
  };
}

function normalizeTradeOffer(item = {}) {
  const normEnum = (raw, allowed, fallback) => {
    const val = String(raw || "").trim().toLowerCase();
    return allowed.includes(val) ? val : fallback;
  };
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const statusRaw = String(item.status || "pending").toLowerCase();
  const status = ["pending", "countered", "accepted", "rejected", "cancelled", "expired"].includes(statusRaw)
    ? statusRaw
    : "pending";
  const quantityKg = Number(item.quantityKg || 0);
  const offerPriceTlKg = Number(item.offerPriceTlKg || 0);
  const createdAtIso = item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString();
  const expiryHoursRaw = Number(
    item.expiryHours ?? item.expiresInHours ?? item.expiresHours ?? item.ttlHours ?? 0
  );
  const expiryHours = Number.isFinite(expiryHoursRaw)
    ? Math.max(1, Math.min(24 * 30, Math.round(expiryHoursRaw)))
    : 0;
  const explicitExpiresAt = item.expiresAt ? new Date(item.expiresAt).toISOString() : null;
  const defaultExpiresAt =
    !item.createdAt && !item.expiresAt && !expiryHours
      ? new Date(Date.now() + 72 * 3600 * 1000).toISOString()
      : null;
  const expiresAt = explicitExpiresAt || (expiryHours ? new Date(new Date(createdAtIso).getTime() + expiryHours * 3600 * 1000).toISOString() : defaultExpiresAt);
  return {
    id,
    listingId: String(item.listingId || "").trim(),
    buyer: String(item.buyer || "").trim() || null,
    note: String(item.note || "").trim() || null,
    quantityKg: Number.isFinite(quantityKg) && quantityKg > 0 ? Number(quantityKg.toFixed(2)) : 0,
    offerPriceTlKg:
      Number.isFinite(offerPriceTlKg) && offerPriceTlKg > 0 ? Number(offerPriceTlKg.toFixed(2)) : 0,
    deliveryType: normEnum(item.deliveryType, ["any", "pickup", "seller_delivery", "cargo", "broker"], "any"),
    paymentType: normEnum(item.paymentType, ["any", "cash", "transfer", "term", "escrow", "card"], "any"),
    qualityGrade: normEnum(item.qualityGrade, ["any", "premium", "standard", "mixed", "processing"], "any"),
    status,
    expiresAt,
    createdAt: createdAtIso,
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()
  };
}

function isTradeOfferExpired(offer = {}, nowTs = Date.now()) {
  const status = String(offer.status || "").toLowerCase();
  if (status === "expired") return true;
  if (!["pending", "countered"].includes(status)) return false;
  const expTs = Date.parse(String(offer.expiresAt || ""));
  if (!Number.isFinite(expTs)) return false;
  return expTs <= nowTs;
}

function sweepExpiredTradeOffers() {
  const nowTs = Date.now();
  let changed = false;
  tradeOffers = tradeOffers.map((offer) => {
    if (!isTradeOfferExpired(offer, nowTs)) return offer;
    if (String(offer.status || "").toLowerCase() === "expired") return offer;
    changed = true;
    return { ...offer, status: "expired", updatedAt: new Date(nowTs).toISOString() };
  });
  if (changed) saveTradeMarketToDisk();
}

function normalizeTradeOrder(item = {}) {
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const statusRaw = String(item.status || "created").toLowerCase();
  const status = ["created", "accepted", "in_transit", "delivered", "completed", "cancelled"].includes(
    statusRaw
  )
    ? statusRaw
    : "created";
  const escrowStatusRaw = String(item.escrowStatus || "held").toLowerCase();
  const escrowStatus = ["none", "held", "released", "refunded"].includes(escrowStatusRaw)
    ? escrowStatusRaw
    : "held";
  const quantityKg = Number(item.quantityKg || 0);
  const priceTlKg = Number(item.priceTlKg || 0);
  const totalTl = Number(item.totalTl || quantityKg * priceTlKg || 0);
  return {
    id,
    listingId: String(item.listingId || "").trim(),
    offerId: String(item.offerId || "").trim() || null,
    seller: String(item.seller || "").trim() || null,
    buyer: String(item.buyer || "").trim() || null,
    city: String(item.city || "").trim() || null,
    crop: String(item.crop || "").trim() || null,
    quantityKg: Number.isFinite(quantityKg) && quantityKg > 0 ? Number(quantityKg.toFixed(2)) : 0,
    priceTlKg: Number.isFinite(priceTlKg) && priceTlKg > 0 ? Number(priceTlKg.toFixed(2)) : 0,
    totalTl: Number.isFinite(totalTl) && totalTl > 0 ? Number(totalTl.toFixed(2)) : 0,
    deliveryType: String(item.deliveryType || "pickup").toLowerCase(),
    paymentType: String(item.paymentType || "transfer").toLowerCase(),
    qualityGrade: String(item.qualityGrade || "standard").toLowerCase(),
    shippingProvider:
      String(item.shippingProvider || "").toLowerCase() ||
      detectShippingProviderFromCode(item.trackingCode) ||
      null,
    contractNo: String(item.contractNo || `CT-${Date.now().toString().slice(-8)}`).trim(),
    contractUrl: String(item.contractUrl || "").trim() || null,
    invoiceNo: String(item.invoiceNo || "").trim() || null,
    trackingCode: String(item.trackingCode || "").trim() || null,
    trackingUrl:
      String(item.trackingUrl || "").trim() ||
      buildTrackingUrl(item.trackingCode, item.shippingProvider || detectShippingProviderFromCode(item.trackingCode)),
    escrowStatus,
    status,
    note: String(item.note || "").trim() || null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()
  };
}

function normalizeTradeMessage(item = {}) {
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    id,
    listingId: String(item.listingId || "").trim() || null,
    offerId: String(item.offerId || "").trim() || null,
    orderId: String(item.orderId || "").trim() || null,
    senderRole: ["seller", "buyer", "system"].includes(String(item.senderRole || "").toLowerCase())
      ? String(item.senderRole || "").toLowerCase()
      : "buyer",
    sender: String(item.sender || "").trim() || null,
    text: String(item.text || "").trim(),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
  };
}

function normalizeTradeRating(item = {}) {
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const score = Number(item.score || 0);
  return {
    id,
    orderId: String(item.orderId || "").trim(),
    targetRole: ["seller", "buyer"].includes(String(item.targetRole || "").toLowerCase())
      ? String(item.targetRole || "").toLowerCase()
      : "seller",
    targetName: String(item.targetName || "").trim() || "Bilinmiyor",
    raterName: String(item.raterName || "").trim() || null,
    score: Number.isFinite(score) ? Math.min(5, Math.max(1, Math.round(score))) : 3,
    comment: String(item.comment || "").trim() || null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
  };
}

function normalizeTradeAlert(item = {}) {
  const id = String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return {
    id,
    level: ["info", "success", "warning", "critical"].includes(String(item.level || "").toLowerCase())
      ? String(item.level || "").toLowerCase()
      : "info",
    title: String(item.title || "").trim() || "Pazar bildirimi",
    detail: String(item.detail || "").trim() || null,
    orderId: String(item.orderId || "").trim() || null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
  };
}

function pushTradeAlert(payload = {}) {
  const item = normalizeTradeAlert(payload);
  tradeAlerts.unshift(item);
  if (tradeAlerts.length > 3000) tradeAlerts = tradeAlerts.slice(0, 3000);
}

const shippingProviders = [
  {
    id: "ptt",
    name: "PTT Kargo",
    trackingUrlTemplate: "https://gonderitakip.ptt.gov.tr/Track/Verify?q={code}"
  },
  {
    id: "yurtici",
    name: "Yurtici Kargo",
    trackingUrlTemplate: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={code}"
  },
  {
    id: "mng",
    name: "MNG Kargo",
    trackingUrlTemplate: "https://www.mngkargo.com.tr/gonderi-takip?code={code}"
  },
  {
    id: "aras",
    name: "Aras Kargo",
    trackingUrlTemplate: "https://www.araskargo.com.tr/tr/online-servisler/kargo-takibi?code={code}"
  },
  {
    id: "ups",
    name: "UPS",
    trackingUrlTemplate: "https://www.ups.com/track?tracknum={code}"
  }
];

function buildTrackingUrl(code = "", provider = "") {
  const c = String(code || "").trim();
  if (!c) return null;
  const providerId = String(provider || "").toLowerCase();
  const cfg = shippingProviders.find((item) => item.id === providerId);
  if (!cfg) return `https://kargotakip.example.com/track/${encodeURIComponent(c)}`;
  return cfg.trackingUrlTemplate.replace("{code}", encodeURIComponent(c));
}

function detectShippingProviderFromCode(code = "") {
  const c = String(code || "").toUpperCase();
  if (!c) return null;
  if (c.startsWith("PTT")) return "ptt";
  if (c.startsWith("YK") || c.startsWith("YRT")) return "yurtici";
  if (c.startsWith("MNG")) return "mng";
  if (c.startsWith("ARAS")) return "aras";
  if (c.startsWith("1Z")) return "ups";
  return null;
}

function simulateShippingStatus(order = {}) {
  const statusRank = { created: 0, accepted: 1, in_transit: 2, delivered: 3, completed: 4 };
  const currentRank = statusRank[String(order.status || "created")] ?? 0;
  if (!order.trackingCode) return { status: order.status || "accepted", event: "Takip kodu yok" };
  if (currentRank < 2) return { status: "in_transit", event: "Kargo cikis taramasi alindi" };
  if (currentRank === 2) return { status: "delivered", event: "Teslim edildi kaydi alindi" };
  return { status: order.status || "delivered", event: "Kargo durumu guncel" };
}

function resolveShippingProviderConfig(providerId = "") {
  const id = String(providerId || "").toUpperCase();
  if (!id) return null;
  const baseUrl = String(process.env[`SHIPPING_PROVIDER_${id}_API_URL`] || "").trim();
  const apiKey = String(process.env[`SHIPPING_PROVIDER_${id}_API_KEY`] || "").trim();
  const statusPath = String(process.env[`SHIPPING_PROVIDER_${id}_STATUS_PATH`] || "/status").trim();
  const codeParam = String(process.env[`SHIPPING_PROVIDER_${id}_CODE_PARAM`] || "trackingCode").trim();
  if (!baseUrl) return null;
  return { baseUrl, apiKey, statusPath, codeParam };
}

function mapShippingEventToOrderStatus(eventStatus = "", fallback = "in_transit") {
  const s = String(eventStatus || "").toLowerCase();
  if (["delivered", "teslim", "teslim_edildi", "success"].includes(s)) return "delivered";
  if (["in_transit", "on_route", "yolda", "dispatched"].includes(s)) return "in_transit";
  if (["accepted", "created", "registered", "ready"].includes(s)) return "accepted";
  if (["cancelled", "returned", "failed"].includes(s)) return "cancelled";
  return fallback;
}

function getValueByPath(obj, pathExpr = "") {
  if (!obj || !pathExpr) return undefined;
  const parts = String(pathExpr)
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const shippingProviderParsers = {
  ptt: {
    statusPaths: ["status", "data.status", "shipment.status", "result.status"],
    eventPaths: ["event", "data.lastEvent", "shipment.lastEvent", "message"],
    codePaths: ["trackingCode", "barcode", "data.barcode"]
  },
  yurtici: {
    statusPaths: ["shipmentStatus", "data.shipmentStatus", "status", "result.status"],
    eventPaths: ["lastEvent", "data.lastEvent", "event", "message"],
    codePaths: ["cargoKey", "trackingCode", "data.cargoKey"]
  },
  mng: {
    statusPaths: ["state", "data.state", "status"],
    eventPaths: ["eventMessage", "data.eventMessage", "lastEvent", "message"],
    codePaths: ["trackingNo", "trackingCode", "data.trackingNo"]
  },
  aras: {
    statusPaths: ["status", "tracking.status", "data.status"],
    eventPaths: ["tracking.lastMovement", "lastMovement", "data.lastMovement", "message"],
    codePaths: ["trackingCode", "tracking.number", "data.trackingCode"]
  },
  ups: {
    statusPaths: ["current_status", "status", "track.status", "shipment.status"],
    eventPaths: ["description", "track.event", "lastEvent", "message"],
    codePaths: ["tracking_number", "trackingCode", "track.number"]
  },
  default: {
    statusPaths: ["status", "shipmentStatus", "state", "result.status", "data.status", "eventStatus"],
    eventPaths: ["event", "lastEvent", "message", "data.lastEvent", "detail"],
    codePaths: ["trackingCode", "barcode", "trackingNo"]
  }
};

function parseEnvPathList(value = "") {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function resolveShippingParser(providerId = "") {
  const id = String(providerId || "").toLowerCase();
  const parser = shippingProviderParsers[id] || shippingProviderParsers.default;
  const envKey = String(providerId || "").toUpperCase();
  if (!envKey) return parser;
  const statusPathsEnv = parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_STATUS_PATHS`]);
  const eventPathsEnv = parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_EVENT_PATHS`]);
  const codePathsEnv = parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_CODE_PATHS`]);
  return {
    statusPaths: statusPathsEnv.length ? statusPathsEnv : parser.statusPaths,
    eventPaths: eventPathsEnv.length ? eventPathsEnv : parser.eventPaths,
    codePaths: codePathsEnv.length ? codePathsEnv : parser.codePaths
  };
}

function parseShippingPayload(providerId = "", payload = {}) {
  const parser = resolveShippingParser(providerId);
  const pick = (paths = []) => {
    for (const p of paths) {
      const v = getValueByPath(payload, p);
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return { value: v, path: p };
      }
    }
    return { value: null, path: null };
  };
  const statusRaw = pick(parser.statusPaths);
  const eventRaw = pick(parser.eventPaths);
  const codeRaw = pick(parser.codePaths);
  return {
    providerStatus: statusRaw.value ? String(statusRaw.value).toLowerCase() : null,
    event: eventRaw.value ? String(eventRaw.value) : null,
    trackingCode: codeRaw.value ? String(codeRaw.value) : null,
    matchedPaths: {
      providerStatus: statusRaw.path,
      event: eventRaw.path,
      trackingCode: codeRaw.path
    }
  };
}

function parseJsonInput(value) {
  if (value == null) return {};
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return {};
  return JSON.parse(text);
}

async function fetchShippingStatusLive(providerId, trackingCode) {
  const cfg = resolveShippingProviderConfig(providerId);
  if (!cfg || !trackingCode) return null;
  const url = new URL(cfg.statusPath || "/status", cfg.baseUrl);
  url.searchParams.set(cfg.codeParam || "trackingCode", trackingCode);
  const headers = { accept: "application/json" };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  const payload = await fetchJsonWithRetry(url.toString(), { headers }, 1, 6500);
  const parsed = parseShippingPayload(String(providerId || "").toLowerCase(), payload);
  const rawStatus = parsed.providerStatus || "";
  const rawEvent = parsed.event || null;
  const seenCode = parsed.trackingCode || trackingCode;
  return {
    source: "provider-api",
    raw: payload,
    providerStatus: String(rawStatus || "").toLowerCase() || null,
    event: rawEvent ? String(rawEvent) : null,
    trackingCode: seenCode ? String(seenCode) : null,
    status: mapShippingEventToOrderStatus(rawStatus, "in_transit")
  };
}

function buildContractLines(order = {}) {
  return [
    `Sozlesme No: ${order.contractNo || "-"}`,
    `Siparis No: ${order.id}`,
    `Urun: ${order.crop || "-"}`,
    `Miktar: ${Number(order.quantityKg || 0).toFixed(2)} kg`,
    `Birim Fiyat: ${Number(order.priceTlKg || 0).toFixed(2)} TL/kg`,
    `Toplam: ${Number(order.totalTl || 0).toFixed(2)} TL`,
    `Teslimat: ${order.deliveryType || "-"}`,
    `Odeme: ${order.paymentType || "-"}`,
    `Escrow: ${order.escrowStatus || "-"}`,
    `Fatura: ${order.invoiceNo || "-"}`,
    `Takip: ${order.trackingCode || "-"}`,
    `Satici: ${order.seller || "-"}`,
    `Alici: ${order.buyer || "-"}`,
    `Olusturma: ${order.createdAt || "-"}`
  ];
}

function generateSimplePdfBuffer(title = "Sozlesme", lines = []) {
  const sanitize = (s) =>
    String(s || "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/[()\\]/g, "");
  const textLines = [sanitize(title), ...lines.map((x) => sanitize(x))].slice(0, 40);
  const body = [];
  body.push("BT");
  body.push("/F1 11 Tf");
  body.push("50 790 Td");
  textLines.forEach((line, idx) => {
    if (idx === 0) body.push(`(${line}) Tj`);
    else body.push(`0 -16 Td (${line}) Tj`);
  });
  body.push("ET");
  const content = `${body.join("\n")}\n`;
  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  objects.push(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
  );
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n");
  objects.push(
    `5 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}endstream endobj\n`
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function calcTradeTrustSummary(targetName, targetRole = "seller") {
  const nameKey = cityKey(targetName || "");
  const filtered = tradeRatings.filter(
    (item) => cityKey(item.targetName) === nameKey && item.targetRole === targetRole
  );
  const count = filtered.length;
  if (!count) {
    return { targetName, targetRole, ratingCount: 0, avgScore: 0, trustScore: 50, tier: "new" };
  }
  const avgScore = filtered.reduce((acc, item) => acc + Number(item.score || 0), 0) / count;
  const recentOrders = tradeOrders.filter(
    (item) =>
      cityKey(item.seller || "") === nameKey || cityKey(item.buyer || "") === nameKey
  );
  const completedCount = recentOrders.filter((item) => item.status === "completed").length;
  const completionRate = recentOrders.length ? completedCount / recentOrders.length : 0.5;
  const trustScore = Math.round(
    Math.min(
      100,
      Math.max(0, avgScore * 16 + Math.min(20, count * 2) + Math.round(completionRate * 20))
    )
  );
  const tier = trustScore >= 80 ? "high" : trustScore >= 60 ? "medium" : trustScore >= 40 ? "low" : "risk";
  return {
    targetName,
    targetRole,
    ratingCount: count,
    avgScore: Number(avgScore.toFixed(2)),
    completionRate: Number((completionRate * 100).toFixed(1)),
    trustScore,
    tier
  };
}

function calcTradeMatchScore(listing = {}, offer = {}) {
  let score = 40;
  const reasons = [];
  const listingQty = Number(listing.quantityKg || 0);
  const offerQty = Number(offer.quantityKg || 0);
  if (listingQty > 0 && offerQty > 0) {
    const ratio = offerQty / listingQty;
    if (ratio <= 1) {
      score += 20;
      reasons.push("miktar uygun");
    } else if (ratio <= 1.2) {
      score += 10;
      reasons.push("miktar yakin");
    } else {
      score -= 20;
      reasons.push("miktar yuksek");
    }
  }

  const listPrice = Number(listing.priceTlKg || 0);
  const offerPrice = Number(offer.offerPriceTlKg || 0);
  if (listPrice > 0 && offerPrice > 0) {
    if (listing.type === "sell") {
      if (offerPrice >= listPrice * 0.98) {
        score += 20;
        reasons.push("fiyat guclu");
      } else if (offerPrice >= listPrice * 0.9) {
        score += 10;
        reasons.push("fiyat kabul edilebilir");
      } else {
        score -= 20;
        reasons.push("fiyat dusuk");
      }
    } else if (offerPrice <= listPrice * 1.02) {
      score += 20;
      reasons.push("fiyat guclu");
    } else if (offerPrice <= listPrice * 1.1) {
      score += 10;
      reasons.push("fiyat yakin");
    } else {
      score -= 20;
      reasons.push("fiyat yuksek");
    }
  }

  const deliveryOk =
    !offer.deliveryType ||
    offer.deliveryType === "any" ||
    offer.deliveryType === listing.deliveryType;
  score += deliveryOk ? 10 : -8;
  reasons.push(deliveryOk ? "teslimat uyumlu" : "teslimat uyumsuz");

  const paymentOk =
    !offer.paymentType || offer.paymentType === "any" || offer.paymentType === listing.paymentType;
  score += paymentOk ? 10 : -8;
  reasons.push(paymentOk ? "odeme uyumlu" : "odeme uyumsuz");

  const qualityOk =
    !offer.qualityGrade ||
    offer.qualityGrade === "any" ||
    offer.qualityGrade === listing.qualityGrade ||
    offer.qualityGrade === "mixed" ||
    listing.qualityGrade === "mixed";
  score += qualityOk ? 10 : -6;
  reasons.push(qualityOk ? "kalite uyumlu" : "kalite uyumsuz");

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const tier = finalScore >= 75 ? "strong" : finalScore >= 55 ? "medium" : "weak";
  return { score: finalScore, tier, reasons };
}

function filterTradeListingsByScope({ city = "", crop = "", status = "all" } = {}) {
  const cityK = cityKey(city);
  const cropK = cityKey(crop);
  const statusK = String(status || "all").toLowerCase();
  return tradeListings.filter((item) => {
    if (cityK && cityKey(item.city) !== cityK) return false;
    if (cropK && cityKey(item.crop) !== cropK) return false;
    if (statusK && statusK !== "all" && String(item.status || "").toLowerCase() !== statusK) return false;
    return true;
  });
}

function buildTradeSummaryData({ city = "", crop = "" } = {}) {
  const openListings = tradeListings.filter((item) => {
    if (item.status !== "open") return false;
    if (city && cityKey(item.city) !== cityKey(city)) return false;
    if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
    return true;
  });
  const sellVals = openListings
    .filter((item) => item.type === "sell")
    .map((item) => Number(item.priceTlKg))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  const buyVals = openListings
    .filter((item) => item.type === "buy")
    .map((item) => Number(item.priceTlKg))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  const offers = tradeOffers.filter((item) => {
    const listing = tradeListings.find((x) => x.id === item.listingId);
    if (!listing) return false;
    if (city && cityKey(listing.city) !== cityKey(city)) return false;
    if (crop && cityKey(listing.crop) !== cityKey(crop)) return false;
    return true;
  });
  const offerVals = offers
    .map((item) => Number(item.offerPriceTlKg))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  const orderCount = tradeOrders.filter((item) => {
    if (item.status === "cancelled") return false;
    if (city && cityKey(item.city) !== cityKey(city)) return false;
    if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
    return true;
  }).length;
  const mid = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
    city: city || null,
    crop: crop || null,
    openListingCount: openListings.length,
    sellCount: sellVals.length,
    buyCount: buyVals.length,
    offerCount: offerVals.length,
    orderCount,
    market: {
      sellMedianTlKg: Number(mid(sellVals).toFixed(2)),
      sellAvgTlKg: Number(avg(sellVals).toFixed(2)),
      buyMedianTlKg: Number(mid(buyVals).toFixed(2)),
      buyAvgTlKg: Number(avg(buyVals).toFixed(2)),
      offerMedianTlKg: Number(mid(offerVals).toFixed(2)),
      offerAvgTlKg: Number(avg(offerVals).toFixed(2))
    }
  };
}

function buildTradeDashboardData({ city = "", crop = "" } = {}) {
  const scopedListings = filterTradeListingsByScope({ city, crop, status: "all" });
  const scopedOffers = tradeOffers.filter((item) => {
    const listing = tradeListings.find((x) => x.id === item.listingId);
    if (!listing) return false;
    if (city && cityKey(listing.city) !== cityKey(city)) return false;
    if (crop && cityKey(listing.crop) !== cityKey(crop)) return false;
    return true;
  });
  const scopedOrders = tradeOrders.filter((item) => {
    if (city && cityKey(item.city) !== cityKey(city)) return false;
    if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
    return true;
  });
  const openListings = scopedListings.filter((item) => item.status === "open");
  const openSells = openListings.filter((item) => item.type === "sell");
  const openBuys = openListings.filter((item) => item.type === "buy");
  const sellPrices = openSells.map((item) => Number(item.priceTlKg || 0)).filter((x) => Number.isFinite(x) && x > 0);
  const buyPrices = openBuys.map((item) => Number(item.priceTlKg || 0)).filter((x) => Number.isFinite(x) && x > 0);
  const sellQty = openSells.reduce((acc, item) => acc + Number(getListingAvailableKg(item) || 0), 0);
  const buyQty = openBuys.reduce((acc, item) => acc + Number(getListingAvailableKg(item) || 0), 0);
  const bestAsk = sellPrices.length ? Math.min(...sellPrices) : 0;
  const bestBid = buyPrices.length ? Math.max(...buyPrices) : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? Number((bestAsk - bestBid).toFixed(2)) : 0;
  const fulfilledVolumeKg = scopedOrders
    .filter((x) => ["in_transit", "delivered", "completed"].includes(String(x.status || "").toLowerCase()))
    .reduce((acc, x) => acc + Number(x.quantityKg || 0), 0);
  return {
    scope: { city: city || null, crop: crop || null },
    listings: {
      total: scopedListings.length,
      open: openListings.length,
      paused: scopedListings.filter((x) => x.status === "paused").length,
      closed: scopedListings.filter((x) => x.status === "closed").length,
      sell: openSells.length,
      buy: openBuys.length,
      sellQtyKg: Math.round(sellQty),
      buyQtyKg: Math.round(buyQty)
    },
    offers: {
      total: scopedOffers.length,
      pending: scopedOffers.filter((x) => ["pending", "countered"].includes(String(x.status || "").toLowerCase())).length,
      accepted: scopedOffers.filter((x) => String(x.status || "").toLowerCase() === "accepted").length
    },
    orders: {
      total: scopedOrders.length,
      active: scopedOrders.filter((x) => ["accepted", "in_transit", "delivered"].includes(String(x.status || "").toLowerCase())).length,
      completed: scopedOrders.filter((x) => String(x.status || "").toLowerCase() === "completed").length,
      fulfilledVolumeKg: Math.round(fulfilledVolumeKg)
    },
    market: {
      bestBid: Number(bestBid.toFixed(2)),
      bestAsk: Number(bestAsk.toFixed(2)),
      spread,
      sellMedianTlKg: Number((medianOfNumbers(sellPrices) || 0).toFixed(2)),
      buyMedianTlKg: Number((medianOfNumbers(buyPrices) || 0).toFixed(2))
    }
  };
}

function buildTradeMatchesData({ city = "", crop = "", limit = 20 } = {}) {
  const maxItems = Math.min(Math.max(Number(limit || 20), 1), 100);
  const openListings = filterTradeListingsByScope({ city, crop, status: "open" });
  const scored = [];
  for (const offer of tradeOffers) {
    const listing = openListings.find((x) => x.id === offer.listingId);
    if (!listing) continue;
    const match = calcTradeMatchScore(listing, offer);
    scored.push({ listingId: listing.id, offerId: offer.id, listing, offer, match });
  }
  scored.sort((a, b) => b.match.score - a.match.score);
  return {
    city: city || null,
    crop: crop || null,
    count: scored.length,
    items: scored.slice(0, maxItems)
  };
}

function buildTradeListingInsights(listing = {}, offers = [], orders = []) {
  const listPrice = Number(listing.priceTlKg || 0);
  const pendingOffers = offers.filter((x) => ["pending", "countered"].includes(String(x.status || "").toLowerCase()));
  const offerPrices = offers
    .map((x) => Number(x.counterPriceTlKg || x.offerPriceTlKg || 0))
    .filter((x) => Number.isFinite(x) && x > 0);
  const acceptedPrices = offers
    .filter((x) => String(x.status || "").toLowerCase() === "accepted")
    .map((x) => Number(x.counterPriceTlKg || x.offerPriceTlKg || 0))
    .filter((x) => Number.isFinite(x) && x > 0);
  const offerMedian = medianOfNumbers(offerPrices) || 0;
  const acceptedMedian = medianOfNumbers(acceptedPrices) || 0;
  const matchScores = offers
    .map((x) => Number(x?.match?.score || 0))
    .filter((x) => Number.isFinite(x) && x > 0);
  const avgMatch = matchScores.length
    ? matchScores.reduce((acc, x) => acc + x, 0) / matchScores.length
    : 0;
  const conversionPct = offers.length ? (orders.length / offers.length) * 100 : 0;
  const anchor = listPrice > 0 ? listPrice : offerMedian > 0 ? offerMedian : acceptedMedian;
  const floor = anchor > 0 ? anchor * 0.96 : 0;
  const target = anchor > 0 ? anchor * 0.99 : 0;
  const suggestedCounterTlKg =
    anchor > 0
      ? Number(Math.max(offerMedian || 0, acceptedMedian || 0, floor, target).toFixed(2))
      : null;
  const demandScore = Math.max(
    0,
    Math.min(100, Math.round(Math.min(40, pendingOffers.length * 12) + Math.min(40, avgMatch * 0.4) + Math.min(20, conversionPct * 0.2)))
  );
  return {
    offerMedianTlKg: Number(offerMedian.toFixed(2)),
    acceptedMedianTlKg: Number(acceptedMedian.toFixed(2)),
    suggestedCounterTlKg,
    demandScore,
    conversionPct: Number(conversionPct.toFixed(1)),
    avgMatchScore: Number(avgMatch.toFixed(1)),
    pendingOfferCount: pendingOffers.length,
    spreadToListingPct:
      listPrice > 0 && offerMedian > 0
        ? Number((((offerMedian - listPrice) / listPrice) * 100).toFixed(2))
        : null
  };
}

function acceptTradeOfferInternal(offerId, options = {}) {
  const persist = options.persist !== false;
  const withAlert = options.withAlert !== false;
  sweepExpiredTradeOffers();
  const id = String(offerId || "").toString();
  const offerIdx = tradeOffers.findIndex((item) => item.id === id);
  if (offerIdx < 0) return { ok: false, status: 404, error: "offer_not_found" };
  const offer = tradeOffers[offerIdx];
  if (isTradeOfferExpired(offer)) {
    tradeOffers[offerIdx] = { ...offer, status: "expired", updatedAt: new Date().toISOString() };
    if (persist) saveTradeMarketToDisk();
    return { ok: false, status: 409, error: "offer_expired" };
  }
  const listing = tradeListings.find((item) => item.id === offer.listingId);
  if (!listing) return { ok: false, status: 404, error: "listing_not_found" };
  if (!["pending", "countered"].includes(String(offer.status || "").toLowerCase())) {
    return { ok: false, status: 409, error: "offer_not_actionable" };
  }
  if (listing.status !== "open") return { ok: false, status: 409, error: "listing_not_open" };
  const availableKg = getListingAvailableKg(listing);
  const offerQty = Number(offer.quantityKg || 0);
  if (!Number.isFinite(offerQty) || offerQty <= 0 || offerQty > availableKg) {
    return {
      ok: false,
      status: 409,
      error: "insufficient_available_quantity",
      availableKg: Number(availableKg.toFixed(2))
    };
  }
  tradeOffers[offerIdx] = { ...offer, status: "accepted", updatedAt: new Date().toISOString() };
  const order = normalizeTradeOrder({
    listingId: listing.id,
    offerId: offer.id,
    seller: listing.owner || "Satici",
    buyer: offer.buyer || "Alici",
    city: listing.city,
    crop: listing.crop,
    quantityKg: offer.quantityKg || listing.quantityKg,
    priceTlKg: offer.counterPriceTlKg || offer.offerPriceTlKg,
    deliveryType: listing.deliveryType,
    paymentType: listing.paymentType,
    qualityGrade: listing.qualityGrade,
    shippingProvider: options.shippingProvider || null,
    escrowStatus: listing.paymentType === "escrow" ? "held" : "none",
    status: "accepted",
    note: options.note || null
  });
  tradeOrders.unshift(order);
  if (tradeOrders.length > 10000) tradeOrders = tradeOrders.slice(0, 10000);
  const listingIdx = tradeListings.findIndex((item) => item.id === listing.id);
  if (listingIdx >= 0) {
    const prev = tradeListings[listingIdx];
    const soldKg = Math.max(0, Number(prev.soldKg || 0)) + Number(order.quantityKg || 0);
    const nextAvailable = Math.max(0, Number(prev.quantityKg || 0) - soldKg - Math.max(0, Number(prev.reservedKg || 0)));
    const nextStatus = nextAvailable <= 0.0001 ? "closed" : prev.status;
    tradeListings[listingIdx] = {
      ...prev,
      soldKg: Number(soldKg.toFixed(2)),
      availableKg: Number(nextAvailable.toFixed(2)),
      status: nextStatus
    };
    if (nextStatus === "closed") {
      tradeOffers = tradeOffers.map((item) => {
        if (item.id === offer.id) return item;
        if (item.listingId !== listing.id) return item;
        if (!["pending", "countered"].includes(String(item.status || "").toLowerCase())) return item;
        return { ...item, status: "rejected", updatedAt: new Date().toISOString() };
      });
    }
  }
  if (withAlert) {
    pushTradeAlert({
      level: "success",
      title: "Yeni siparis olustu",
      detail: `${order.crop || "Urun"} • ${Number(order.quantityKg || 0).toFixed(0)} kg`,
      orderId: order.id
    });
  }
  if (persist) saveTradeMarketToDisk();
  return { ok: true, status: 201, item: order };
}

function confidenceLabelToScore(label) {
  const x = String(label || "").toLowerCase();
  if (x === "high") return 0.85;
  if (x === "medium") return 0.6;
  if (x === "low-medium") return 0.48;
  if (x === "low") return 0.35;
  return 0.5;
}

function confidenceScoreToLabel(score) {
  const s = Number(score || 0);
  if (s >= 0.75) return "high";
  if (s >= 0.52) return "medium";
  if (s >= 0.42) return "low-medium";
  return "low";
}

function calcLandUncertaintyPct({ confidenceScore, minTlDa, maxTlDa, priceTlDa, components = [] }) {
  const conf = Math.max(0, Math.min(1, Number(confidenceScore || 0.5)));
  const price = Math.max(1, Number(priceTlDa || 0));
  const range = Math.max(0, Number(maxTlDa || 0) - Number(minTlDa || 0));
  const rangePct = price > 0 ? range / price : 0.2;
  const rows = Array.isArray(components)
    ? components
        .map((x) => ({
          price: Number(x?.priceTlDa || 0),
          reliability: Math.max(0.05, Math.min(1, Number(x?.reliability || 1)))
        }))
        .filter((x) => Number.isFinite(x.price) && x.price > 0)
    : [];
  const disagreementPct =
    rows.length >= 2
      ? rows.reduce((acc, row) => acc + (Math.abs(row.price - price) / Math.max(1, price)) * row.reliability, 0) /
        (rows.reduce((acc, row) => acc + row.reliability, 0) || 1)
      : 0;
  const score = (1 - conf) * 0.62 + Math.min(0.45, rangePct * 0.75) + Math.min(0.3, disagreementPct * 0.5);
  return Math.max(8, Math.min(32, Math.round(score * 100)));
}

function buildLandPriceScenarios({ priceTlDa, uncertaintyPct, areaDa = 0 }) {
  const unit = Math.max(1, Number(priceTlDa || 0));
  const band = Math.max(0.06, Math.min(0.28, Number(uncertaintyPct || 14) / 100));
  const scenarios = [
    { id: "bear", label: "Temkinli", unitPriceTlDa: Math.round(unit * (1 - band)) },
    { id: "base", label: "Baz", unitPriceTlDa: Math.round(unit) },
    { id: "bull", label: "Guclu", unitPriceTlDa: Math.round(unit * (1 + band * 0.82)) }
  ];
  return scenarios.map((item) => ({
    ...item,
    totalPriceTl: areaDa > 0 ? Math.round(item.unitPriceTlDa * areaDa) : null
  }));
}

function pushLandPriceHistory(key, payload) {
  const next = {
    ts: Date.now(),
    city: payload.city || null,
    district: payload.district || null,
    neighborhood: payload.neighborhood || null,
    crop: payload.crop || null,
    coords: payload.coords || null,
    source: payload.source || null,
    method: payload.method || null,
    priceTlDa: Number(payload.priceTlDa || 0),
    minTlDa: Number(payload.minTlDa || 0),
    maxTlDa: Number(payload.maxTlDa || 0),
    confidence: payload.confidence || null,
    confidenceScore: Number(payload.confidenceScore || 0)
  };
  const arr = landPriceHistory.get(key) || [];
  arr.unshift(next);
  if (arr.length > LAND_PRICE_HISTORY_LIMIT) arr.length = LAND_PRICE_HISTORY_LIMIT;
  landPriceHistory.set(key, arr);
}

function buildLandCacheKey({
  city,
  district,
  neighborhood,
  crop,
  coords = "",
  zone,
  irrigation,
  roadAccess,
  soilScore,
  slopePct,
  blendConfig
}) {
  const [lat, lon] = String(coords || "")
    .split(",")
    .map((item) => item.trim());
  const coordKey = lat && lon ? `${lat},${lon}` : "";
  const cfg = normalizeLandBlendConfig(blendConfig || {});
  const inputKey = `${cityKey(zone || "gecis")}|${cityKey(irrigation || "var")}|${cityKey(
    roadAccess || "orta"
  )}|${Math.round(Number(soilScore || 65))}|${Math.round(Number(slopePct || 6))}|${cfg.outlierPivot.toFixed(3)}|${cfg.minReliability.toFixed(3)}`;
  return `${cityKey(city)}|${cityKey(district)}|${cityKey(neighborhood)}|${cityKey(crop)}|${coordKey}|${inputKey}`;
}

function getLandInternetSearchUrls({ city, district, neighborhood, crop }) {
  const qBase = [city, district, neighborhood, crop, "tarla", "donum", "fiyat", "TL"]
    .filter(Boolean)
    .join(" ");
  const queries = [
    qBase,
    [city, district, neighborhood, crop, "arsa rayic bedel", "TL"].filter(Boolean).join(" "),
    [city, district, neighborhood, crop, "tarim arazisi satis fiyati", "TL"].filter(Boolean).join(" ")
  ];
  const engineSet = String(process.env.LAND_DISCOVERY_ENGINES || "duckduckgo,bing,google")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const engines = new Set(engineSet);
  const urls = [];
  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    if (engines.has("duckduckgo")) urls.push(`https://duckduckgo.com/html/?q=${encoded}`);
    if (engines.has("bing")) urls.push(`https://www.bing.com/search?q=${encoded}`);
    if (engines.has("google")) urls.push(`https://www.google.com/search?q=${encoded}`);
    if (engines.has("yandex")) urls.push(`https://yandex.com/search/?text=${encoded}`);
  }
  return Array.from(new Set(urls)).slice(0, LAND_DISCOVERY_MAX_SOURCES);
}

function parseMoneyNumber(rawValue, rawScale = "") {
  if (!rawValue) return null;
  const compact = String(rawValue).replace(/\s+/g, "").trim();
  let num = Number(compact.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(num)) return null;
  const scale = String(rawScale || "").toLowerCase();
  if (["milyon", "mn"].includes(scale)) num *= 1_000_000;
  if (["bin", "k"].includes(scale)) num *= 1_000;
  return num;
}

function parseLocalizedNumber(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const text = String(rawValue).replace(/[^\d.,]/g, "").trim();
  if (!text) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  const decPos = Math.max(lastDot, lastComma);
  let normalized = text;
  if (decPos >= 0) {
    const intPart = text.slice(0, decPos).replace(/[.,]/g, "");
    const fracPart = text.slice(decPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${fracPart}`;
  } else {
    normalized = text.replace(/[.,]/g, "");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function areaToDa(area, unitRaw = "") {
  const value = Number(area);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = String(unitRaw || "").toLowerCase();
  if (unit.includes("ha") || unit.includes("hektar")) return value * 10;
  if (unit.includes("m2") || unit.includes("m²") || unit.includes("metrekare")) return value / 1000;
  if (
    unit.includes("da") ||
    unit.includes("dekar") ||
    unit.includes("donum") ||
    unit.includes("dönüm")
  ) {
    return value;
  }
  return null;
}

function cleanTextForListingParse(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function walkObjects(root, visitor) {
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i += 1) stack.push(cur[i]);
      continue;
    }
    if (typeof cur === "object") {
      visitor(cur);
      Object.keys(cur).forEach((k) => stack.push(cur[k]));
    }
  }
}

function pickFirstNumberByKeys(obj = {}, keys = []) {
  for (const key of keys) {
    const chunks = String(key)
      .split(".")
      .map((x) => x.trim())
      .filter(Boolean);
    let cur = obj;
    for (const chunk of chunks) {
      if (!cur || typeof cur !== "object") {
        cur = null;
        break;
      }
      cur = cur[chunk];
    }
    const n = parseLocalizedNumber(cur);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractEmlakjetListingsFromText(text = "", sourceUrl = "") {
  const out = [];
  const html = String(text || "");
  const scriptBlocks = [];
  const nextData = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextData?.[1]) scriptBlocks.push(nextData[1]);
  const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m = null;
  while ((m = ldJsonRegex.exec(html)) !== null) {
    if (m?.[1]) scriptBlocks.push(m[1]);
  }
  scriptBlocks.forEach((block) => {
    const parsed = safeJsonParse(block, null);
    if (!parsed) return;
    walkObjects(parsed, (obj) => {
      const unitPrice = pickFirstNumberByKeys(obj, [
        "squareMeterPrice",
        "pricePerSquareMeter",
        "m2Price",
        "unitPrice"
      ]);
      if (Number.isFinite(unitPrice) && unitPrice >= 8000 && unitPrice <= 9000000) {
        out.push({
          source: sourceUrl || null,
          totalPriceTl: null,
          areaDa: null,
          priceTlDa: Math.round(unitPrice * 1000),
          context: "emlakjet-json-unit"
        });
        return;
      }
      const totalPrice = pickFirstNumberByKeys(obj, [
        "priceDetail.price",
        "price",
        "listingPrice",
        "priceInfo.price",
        "properties.price"
      ]);
      const areaM2 = pickFirstNumberByKeys(obj, [
        "netSquare",
        "grossSquare",
        "squareMeter",
        "m2Net",
        "m2Brut",
        "properties.squareMeter"
      ]);
      if (!Number.isFinite(totalPrice) || !Number.isFinite(areaM2) || areaM2 <= 0) return;
      const areaDa = areaM2 / 1000;
      const priceTlDa = totalPrice / areaDa;
      if (!Number.isFinite(priceTlDa) || priceTlDa < 8000 || priceTlDa > 9000000) return;
      out.push({
        source: sourceUrl || null,
        totalPriceTl: Math.round(totalPrice),
        areaDa: Number(areaDa.toFixed(2)),
        priceTlDa: Math.round(priceTlDa),
        context: "emlakjet-json"
      });
    });
  });
  return out.slice(0, 120);
}

function extractListingsFromText(text = "", sourceUrl = "") {
  const raw = cleanTextForListingParse(text);
  if (!raw) return [];
  const candidates = [];
  const priceRegex = /(\d[\d\.\,\s]{1,20})\s*(milyon|mn|bin|k)?\s*(?:₺|tl|try)/gi;
  let priceMatch = null;
  while ((priceMatch = priceRegex.exec(raw)) !== null) {
    const totalPrice = parseMoneyNumber(priceMatch[1], priceMatch[2]);
    if (!Number.isFinite(totalPrice) || totalPrice < 50_000 || totalPrice > 2_500_000_000) continue;
    const idx = priceMatch.index || 0;
    const local = raw.slice(Math.max(0, idx - 140), Math.min(raw.length, idx + 200));
    const areaMatch =
      local.match(/(\d[\d\.,]{1,12})\s*(m2|m²|metrekare|da|dekar|donum|dönüm|ha|hektar)/i) || null;
    if (!areaMatch) continue;
    const areaNum = parseLocalizedNumber(areaMatch[1]);
    const da = areaToDa(areaNum, areaMatch[2]);
    if (!Number.isFinite(da) || da <= 0) continue;
    const priceTlDa = totalPrice / da;
    if (!Number.isFinite(priceTlDa) || priceTlDa < 8_000 || priceTlDa > 9_000_000) continue;
    candidates.push({
      source: sourceUrl || null,
      totalPriceTl: Math.round(totalPrice),
      areaDa: Number(da.toFixed(2)),
      priceTlDa: Math.round(priceTlDa),
      context: local.slice(0, 220)
    });
    if (candidates.length >= 80) break;
  }
  return candidates;
}

function moneySignalsToListingRows(signals = [], sourceUrl = "") {
  if (!Array.isArray(signals) || !signals.length) return [];
  return signals
    .map((item) => {
      const priceTlDa = Number(item?.valueTlDa || 0);
      if (!Number.isFinite(priceTlDa) || priceTlDa < 8_000 || priceTlDa > 9_000_000) return null;
      return {
        source: sourceUrl || null,
        totalPriceTl: null,
        areaDa: null,
        priceTlDa: Math.round(priceTlDa),
        context: String(item?.context || "").slice(0, 220)
      };
    })
    .filter(Boolean)
    .slice(0, 80);
}

function dedupeListingSignals(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const price = Number(row?.priceTlDa || 0);
    if (!Number.isFinite(price) || price <= 0) return;
    const area = Number(row?.areaDa || 0);
    const areaKey = Number.isFinite(area) && area > 0 ? Math.round(area * 10) : 0;
    const src = String(row?.source || "");
    const key = `${Math.round(price)}|${areaKey}|${src}`;
    if (!map.has(key)) map.set(key, row);
  });
  return Array.from(map.values());
}

function normalizeSearchUrlToRss(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (!u.hostname.includes("bing.com")) return "";
    if (!u.pathname.includes("/search")) return "";
    u.searchParams.set("format", "rss");
    return u.toString();
  } catch (_) {
    return "";
  }
}

function normalizeCandidateDocUrl(url = "") {
  try {
    const u = new URL(String(url || "").trim());
    if (!/^https?:$/.test(u.protocol)) return "";
    const host = u.hostname.toLowerCase();
    if (host.includes("bing.com") || host.includes("duckduckgo.com") || host.includes("google.com") || host.includes("yandex.")) {
      return "";
    }
    return u.toString();
  } catch (_) {
    return "";
  }
}

async function fetchSearchResultDocuments({ city, district, neighborhood, crop }, maxDocs = 10) {
  const rssUrls = getLandInternetSearchUrls({ city, district, neighborhood, crop })
    .map((url) => normalizeSearchUrlToRss(url))
    .filter(Boolean);
  if (!rssUrls.length) return [];
  const linkSet = new Set();
  for (const rssUrl of rssUrls) {
    // eslint-disable-next-line no-await-in-loop
    const xml = await fetchTextWithRetry(rssUrl, { headers: { accept: "application/rss+xml,application/xml,text/xml,*/*" } }, 1, LAND_DISCOVERY_TIMEOUT_MS).catch(() => "");
    if (!xml) continue;
    const items = parseFeedItems(xml, 10);
    items.forEach((item) => {
      const normalized = normalizeCandidateDocUrl(item?.link || "");
      if (normalized) linkSet.add(normalized);
    });
    if (linkSet.size >= maxDocs) break;
  }
  const docUrls = Array.from(linkSet).slice(0, Math.max(1, maxDocs));
  if (!docUrls.length) return [];
  const responses = await Promise.allSettled(
    docUrls.map((url) =>
      fetchTextWithRetry(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6"
          }
        },
        1,
        LAND_DISCOVERY_TIMEOUT_MS
      ).then((text) => ({ url, text }))
    )
  );
  return responses
    .filter((res) => res.status === "fulfilled")
    .map((res) => res.value)
    .filter((item) => item?.text);
}

function summarizeListingSignals(listings = []) {
  if (!Array.isArray(listings) || !listings.length) return null;
  const rows = listings
    .map((item) => {
      const price = Number(item.priceTlDa || 0);
      if (!Number.isFinite(price) || price <= 0) return null;
      const src = String(item.source || "");
      const srcNorm = src.toLowerCase();
      const sourceWeight =
        srcNorm.includes("sahibinden") ? 1.22
          : srcNorm.includes("hepsiemlak") ? 1.12
            : srcNorm.includes("emlakjet") ? 1.08
              : 0.94;
      const areaDa = Number(item.areaDa || 0);
      const areaWeight = Number.isFinite(areaDa) && areaDa > 0 ? Math.max(0.85, Math.min(1.2, 1 + Math.log10(areaDa + 1) * 0.08)) : 1;
      return { price, weight: sourceWeight * areaWeight };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  const sorted = rows.slice().sort((a, b) => a.price - b.price);
  const totalW = sorted.reduce((acc, row) => acc + row.weight, 0) || 1;
  const qAt = (q = 0.5) => {
    let acc = 0;
    const target = totalW * Math.max(0, Math.min(1, q));
    for (const row of sorted) {
      acc += row.weight;
      if (acc >= target) return row.price;
    }
    return sorted[sorted.length - 1]?.price || 0;
  };
  const mid = qAt(0.5);
  const p20 = qAt(0.2) || mid;
  const p80 = qAt(0.8) || mid;
  const spreadPct = mid > 0 ? Math.max(0, Math.min(1, (p80 - p20) / mid)) : 0.3;
  const confidenceScore = Math.max(0.42, Math.min(0.9, 0.52 + Math.min(0.24, rows.length * 0.018) - spreadPct * 0.22));
  return {
    priceTlDa: Math.round(mid),
    minTlDa: Math.round(p20),
    maxTlDa: Math.round(p80),
    listingCount: rows.length,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3))
  };
}

function isTrustedLiveListing(item = {}) {
  const priceTlDa = Number(item?.priceTlDa || 0);
  const areaDa = Number(item?.areaDa || 0);
  const totalPriceTl = Number(item?.totalPriceTl || 0);
  if (!Number.isFinite(priceTlDa) || priceTlDa < 12_000 || priceTlDa > 4_000_000) return false;
  // Model egitimi icin alan+toplam fiyat eslesen ilanlar daha guvenilir.
  if (!Number.isFinite(areaDa) || areaDa < 0.5) return false;
  if (!Number.isFinite(totalPriceTl) || totalPriceTl < 100_000) return false;
  return true;
}

function getLiveListingUrls({ city, district, neighborhood, crop }) {
  const query = [city, district, neighborhood, crop, "satilik", "tarla"].filter(Boolean).join(" ");
  const encoded = encodeURIComponent(query);
  const defaults = [
    `https://www.sahibinden.com/arama?query_text=${encoded}`,
    `https://www.sahibinden.com/satilik-tarla?query_text=${encoded}`,
    `https://www.hepsiemlak.com/arama?q=${encoded}`,
    `https://www.hepsiemlak.com/satilik/tarla?q=${encoded}`,
    `https://www.emlakjet.com/arama/?q=${encoded}`,
    `https://www.zingat.com/arama?q=${encoded}`,
    `https://www.remax.com.tr/arama?query=${encoded}`
  ];
  const custom = String(process.env.LAND_LISTING_URLS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((url) =>
      url
        .replace(/\{city\}/g, encodeURIComponent(city || ""))
        .replace(/\{district\}/g, encodeURIComponent(district || ""))
        .replace(/\{neighborhood\}/g, encodeURIComponent(neighborhood || ""))
        .replace(/\{crop\}/g, encodeURIComponent(crop || ""))
        .replace(/\{query\}/g, encoded)
    );
  const urls = custom.length ? custom : defaults;
  return Array.from(new Set(urls)).slice(0, Math.max(1, LAND_DISCOVERY_MAX_SOURCES));
}

async function fetchLiveLandListings({ city, district, neighborhood, crop, source = "" }) {
  let urls = getLiveListingUrls({ city, district, neighborhood, crop });
  const discoveryUrls = getLandInternetSearchUrls({ city, district, neighborhood, crop });
  if (source) {
    const src = String(source).toLowerCase();
    urls = urls.filter((url) => url.toLowerCase().includes(src));
  }
  if (!urls.length) return { items: [], scannedSources: [] };
  const responses = await Promise.allSettled(
    urls.map((url) =>
      fetchTextWithRetry(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
            Referer: "https://www.google.com/"
          }
        },
        1,
        LAND_DISCOVERY_TIMEOUT_MS
      ).then((text) => ({ url, text }))
    )
  );
  const items = [];
  const scannedSources = [];
  responses.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const { url, text } = res.value;
    const extractedPrimary =
      url.includes("emlakjet.com")
        ? extractEmlakjetListingsFromText(text, url).concat(extractListingsFromText(text, url))
        : extractListingsFromText(text, url);
    const recovered =
      extractedPrimary.length > 0
        ? extractedPrimary
        : moneySignalsToListingRows(extractMoneySignalsFromText(text), url);
    const extracted = dedupeListingSignals(recovered);
    scannedSources.push({ url, listingCount: extracted.length });
    items.push(...extracted);
  });

  const firstPass = dedupeListingSignals(items);
  if (firstPass.length >= 8 || !discoveryUrls.length) {
    return {
      items: firstPass.slice(0, 120),
      scannedSources
    };
  }

  const fallbackResponses = await Promise.allSettled(
    discoveryUrls.map((url) =>
      fetchTextWithRetry(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
            Referer: "https://www.google.com/"
          }
        },
        1,
        LAND_DISCOVERY_TIMEOUT_MS
      ).then((text) => ({ url, text }))
    )
  );

  fallbackResponses.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const { url, text } = res.value;
    const extracted = dedupeListingSignals(
      extractListingsFromText(text, url).concat(moneySignalsToListingRows(extractMoneySignalsFromText(text), url))
    );
    scannedSources.push({ url, listingCount: extracted.length });
    items.push(...extracted);
  });

  let deduped = dedupeListingSignals(items);
  if (deduped.length < 6) {
    const docs = await fetchSearchResultDocuments({ city, district, neighborhood, crop }, 12).catch(() => []);
    docs.forEach(({ url, text }) => {
      const extracted = dedupeListingSignals(
        (url.includes("emlakjet.com") ? extractEmlakjetListingsFromText(text, url) : [])
          .concat(extractListingsFromText(text, url))
          .concat(moneySignalsToListingRows(extractMoneySignalsFromText(text), url))
      );
      scannedSources.push({ url, listingCount: extracted.length });
      items.push(...extracted);
    });
    deduped = dedupeListingSignals(items);
  }
  return {
    items: deduped.slice(0, 120),
    scannedSources
  };
}

function groupDistrictCentroidsByCity() {
  const out = {};
  Object.entries(DISTRICT_CENTROIDS_TR).forEach(([key, tuple]) => {
    const parts = String(key || "").split("|");
    if (parts.length < 2) return;
    const city = parts[0];
    const district = parts[1];
    if (!city || !district) return;
    if (!Array.isArray(tuple) || tuple.length < 2) return;
    if (!out[city]) out[city] = [];
    out[city].push({
      district,
      lat: Number(tuple[0]),
      lon: Number(tuple[1])
    });
  });
  return out;
}

function buildNationwideLandScopes({ city = "", district = "", crop = "", cityLimit = 81, crops = [] } = {}) {
  const districtMap = groupDistrictCentroidsByCity();
  const cities = city
    ? [cityKey(city)]
    : Object.keys(TURKIYE_REGION_BY_CITY).slice(0, Math.max(1, Math.min(81, Number(cityLimit || 81))));
  const cropPool = Array.isArray(crops) && crops.length
    ? crops.map((x) => String(x || "").trim()).filter(Boolean)
    : crop
      ? [crop]
      : ["domates", "biber", "bugday", "patates"];
  const scopes = [];
  cities.forEach((cityKeyName) => {
    const cityName = cityKeyName;
    const districtRows = district
      ? [{ district: cityKey(district), lat: null, lon: null }]
      : (districtMap[cityName] || []).slice(0, 3);
    const districtPool = districtRows.length ? districtRows : [{ district: "", lat: null, lon: null }];
    cropPool.forEach((cropName) => {
      districtPool.forEach((d) => {
        scopes.push({
          city: cityName,
          district: d.district || "",
          neighborhood: "",
          crop: cropName,
          lat: d.lat,
          lon: d.lon
        });
      });
    });
  });
  return scopes;
}

function pickDistributedScopes(scopes = [], limit = 42) {
  const rows = Array.isArray(scopes) ? scopes : [];
  const max = Math.max(1, Math.min(rows.length, Number(limit || 42)));
  if (rows.length <= max) return rows.slice();
  const out = [];
  const step = rows.length / max;
  for (let i = 0; i < max; i += 1) {
    const idx = Math.min(rows.length - 1, Math.floor(i * step));
    out.push(rows[idx]);
  }
  return out;
}

function jitterAround(value = 0, pct = 0.12) {
  const v = Number(value || 0);
  if (!Number.isFinite(v) || v <= 0) return v;
  const noise = (Math.random() * 2 - 1) * pct;
  return v * (1 + noise);
}

function buildBalancedManualTrainingPool(listings = [], maxCount = 6500) {
  const pool = Array.isArray(listings) ? listings : [];
  const real = pool.filter((item) => String(item?.source || "") !== "synthetic-augment-v2");
  const synthetic = pool.filter((item) => String(item?.source || "") === "synthetic-augment-v2");
  const realCap = Math.max(400, Math.min(maxCount, Math.round(maxCount * 0.75)));
  const synthCap = Math.max(200, Math.min(maxCount - Math.min(real.length, realCap), 2200));
  return real.slice(0, realCap).concat(synthetic.slice(0, synthCap));
}

function synthesizeLandListings(seedRows = [], targetCount = LAND_DATASET_MIN_TARGET) {
  const seedsRaw = (seedRows || []).filter((row) => Number(row?.priceTlDa || 0) > 0);
  const districtMap = groupDistrictCentroidsByCity();
  const baselineAnchors = [];
  Object.keys(TURKIYE_REGION_BY_CITY).forEach((cityName) => {
    const crops = ["domates", "biber", "bugday", "patates"];
    const districtPool = (districtMap[cityName] || []).slice(0, 2);
    const districts = districtPool.length ? districtPool : [{ district: "", lat: null, lon: null }];
    crops.forEach((cropName) => {
      districts.forEach((d) => {
        const base = Number(LAND_BASELINE_TL_DA[cityName] || 160000);
        const cropFactor = cropFactorFromKey(cropName);
        const districtFactor = 0.92 + hashToUnitInterval(`${cityName}-${d.district || "merkez"}`) * 0.18;
        const priceTlDa = Math.round(base * cropFactor * districtFactor);
        baselineAnchors.push(
          normalizeListingRecord({
            city: cityName,
            district: d.district || "",
            crop: cropName,
            areaDa: Number((6 + hashToUnitInterval(`${cityName}-${cropName}`) * 42).toFixed(2)),
            priceTlDa,
            lat: d.lat,
            lon: d.lon,
            source: "synthetic-augment-v2",
            title: "Baseline sentetik anchor",
            createdAt: new Date().toISOString()
          })
        );
      });
    });
  });
  const missing = Math.max(0, Number(targetCount || 0) - seedsRaw.length);
  const seeds = seedsRaw.concat(baselineAnchors);
  if (!seeds.length || missing <= 0) return [];
  const out = [];
  let guard = 0;
  while (out.length < missing && guard < Math.max(2000, missing * 20)) {
    guard += 1;
    const base = seeds[Math.floor(Math.random() * seeds.length)];
    if (!base) continue;
    const cKey = cityKey(base.city || "");
    const districtPool = districtMap[cKey] || [];
    const districtPick = districtPool.length ? districtPool[Math.floor(Math.random() * districtPool.length)] : null;
    const areaDa = Math.max(1, jitterAround(Number(base.areaDa || 12), 0.08));
    const priceTlDa = Math.max(12000, jitterAround(Number(base.priceTlDa || 160000), 0.03));
    out.push(
      normalizeListingRecord({
        city: base.city,
        district: districtPick?.district || base.district || "",
        neighborhood: base.neighborhood || null,
        crop: base.crop || "",
        priceTlDa: Math.round(priceTlDa),
        areaDa: Number(areaDa.toFixed(2)),
        lat: districtPick?.lat ?? base.lat ?? null,
        lon: districtPick?.lon ?? base.lon ?? null,
        source: "synthetic-augment-v2",
        title: `Sentetik arsa ${out.length + 1}`,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 120) * 86400000).toISOString()
      })
    );
  }
  return out;
}

async function buildLargeLandDataset({
  city = "",
  district = "",
  crop = "",
  source = "",
  cityLimit = 81,
  liveScanScopeLimit = Number(process.env.LAND_LIVE_SCAN_SCOPE_LIMIT || 42),
  concurrency = Number(process.env.LAND_LIVE_SCAN_CONCURRENCY || 7),
  scanPasses = Number(process.env.LAND_LIVE_SCAN_PASSES || 2),
  minTarget = LAND_DATASET_MIN_TARGET,
  keepMax = Math.max(LAND_LISTINGS_DEFAULT_MAX, LAND_DATASET_MIN_TARGET + 2500)
} = {}) {
  const scopes = buildNationwideLandScopes({ city, district, crop, cityLimit });
  const scoped = pickDistributedScopes(scopes, liveScanScopeLimit);
  const collected = [];
  const scannedSources = [];
  const importedFingerprints = new Set();
  const width = Math.max(1, Math.min(20, Number(concurrency || 7)));
  const passCount = Math.max(1, Math.min(5, Number(scanPasses || 1)));
  for (let pass = 0; pass < passCount; pass += 1) {
    const shifted = scoped.slice(pass).concat(scoped.slice(0, pass));
    for (let i = 0; i < shifted.length; i += width) {
      const batch = shifted.slice(i, i + width);
      const responses = await Promise.all(
        batch.map((scope) =>
          fetchLiveLandListings({
            city: scope.city,
            district: scope.district,
            neighborhood: scope.neighborhood,
            crop: scope.crop,
            source
          })
            .then((live) => ({ live, scope }))
            .catch(() => ({ live: null, scope }))
        )
      );
      responses.forEach(({ live, scope }) => {
        const rows = (live?.items || [])
          .filter((item) => isTrustedLiveListing(item))
          .map((item, idx) =>
          normalizeListingRecord({
            city: scope.city,
            district: scope.district,
            neighborhood: scope.neighborhood,
            crop: scope.crop,
            title: `Canli ilan ${scope.city}/${scope.district || "merkez"} #${idx + 1}`,
            url: item.source || null,
            source: "live-listings-scan",
            priceTlDa: Number(item.priceTlDa || 0),
            areaDa: Number(item.areaDa || 0) || null,
            lat: scope.lat,
            lon: scope.lon,
            createdAt: new Date().toISOString()
          })
        );
        filterOutlierListings(rows).forEach((row) => {
          const fp = listingFingerprint(row);
          if (importedFingerprints.has(fp)) return;
          importedFingerprints.add(fp);
          collected.push(row);
        });
        if (Array.isArray(live?.scannedSources)) scannedSources.push(...live.scannedSources);
      });
    }
  }
  const manualBase = landManualListings.filter((item) => String(item?.source || "") !== "synthetic-augment-v2");
  const merged = mergeLandListings(collected.concat(manualBase), { keepMax });
  const minWanted = Math.max(2000, Number(minTarget || LAND_DATASET_MIN_TARGET));
  const rawSyntheticNeeded = Math.max(0, minWanted - merged.length);
  const maxSyntheticShare = 0.55;
  const maxSyntheticAllowed = Math.max(0, Math.round((merged.length / (1 - maxSyntheticShare)) * maxSyntheticShare));
  const syntheticNeeded = Math.min(rawSyntheticNeeded, maxSyntheticAllowed);
  const syntheticRows = syntheticNeeded > 0 ? synthesizeLandListings(merged.length ? merged : landManualListings, minWanted) : [];
  const finalRows = mergeLandListings(syntheticRows.concat(merged), { keepMax: Math.max(keepMax, minTarget + 2000) });
  landManualListings = finalRows;
  saveLandListingsToDisk();
  landPriceCache.clear();
  return {
    ok: true,
    requestedScopes: scopes.length,
    scannedScopes: scoped.length * passCount,
    scanPasses: passCount,
    importedLive: collected.length,
    syntheticAdded: syntheticRows.length,
    totalListings: landManualListings.length,
    scannedSources: scannedSources.slice(0, 240)
  };
}

function extractMoneySignalsFromText(text = "") {
  if (!text) return [];
  const raw = String(text)
    .toLowerCase()
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const out = [];
  const patterns = [
    /(?:₺|tl|try)\s*(\d[\d\.\,\s]{1,20})\s*(milyon|mn|bin|k)?/gi,
    /(\d[\d\.\,\s]{1,20})\s*(milyon|mn|bin|k)?\s*(?:₺|tl|try)/gi
  ];
  for (const re of patterns) {
    let match = null;
    while ((match = re.exec(raw)) !== null) {
      const value = parseMoneyNumber(match[1], match[2]);
      if (!Number.isFinite(value)) continue;
      if (value < 10_000 || value > 8_000_000) continue;
      const idx = match.index || 0;
      const local = raw.slice(Math.max(0, idx - 60), Math.min(raw.length, idx + 120));
      let normalized = value;
      if (/\bhektar\b/.test(local)) normalized = value / 10;
      if (/\bm2\b|\bmetrekare\b/.test(local)) normalized = value * 1000;
      out.push({
        valueTlDa: Math.round(normalized),
        context: local
      });
      if (out.length >= 80) break;
    }
    if (out.length >= 80) break;
  }
  return out;
}

function summarizeMoneySignals(signals) {
  if (!Array.isArray(signals) || !signals.length) return null;
  const values = signals
    .map((item) => Number(item.valueTlDa))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = values[Math.floor(values.length / 2)];
  const q1 = values[Math.floor(values.length * 0.2)];
  const q3 = values[Math.floor(values.length * 0.8)];
  return {
    priceTlDa: Math.round(mid),
    minTlDa: Math.round(q1 || mid * 0.9),
    maxTlDa: Math.round(q3 || mid * 1.1),
    signalCount: values.length
  };
}

async function fetchLandPriceFromInternet({ city, district, neighborhood, crop }) {
  if (!LAND_DISCOVERY_ENABLED) return null;
  let liveListings = null;
  try {
    liveListings = await fetchLiveLandListings({ city, district, neighborhood, crop });
  } catch (err) {
    liveListings = null;
  }
  const liveSummary = summarizeListingSignals(liveListings?.items || []);
  if (liveSummary?.priceTlDa) {
    const c = liveSummary.listingCount;
    const baseConf = Number(liveSummary.confidenceScore || 0.52);
    const conf = Math.max(0.42, Math.min(0.9, baseConf + (c >= 16 ? 0.04 : c >= 10 ? 0.02 : 0)));
    return {
      source: "live-listings",
      sourceTitle: "Canli tarla ilan taramasi",
      sourceUrl:
        liveListings?.scannedSources?.find((item) => (item.listingCount || 0) > 0)?.url || null,
      priceTlDa: liveSummary.priceTlDa,
      minTlDa: liveSummary.minTlDa,
      maxTlDa: liveSummary.maxTlDa,
      signalCount: c,
      listings: (liveListings?.items || []).slice(0, 20),
      scannedSources: liveListings?.scannedSources || [],
      confidence: confidenceScoreToLabel(conf),
      confidenceScore: Number(conf.toFixed(3))
    };
  }

  const urls = getLandInternetSearchUrls({ city, district, neighborhood, crop });
  if (!urls.length) return null;

  const responses = await Promise.allSettled(
    urls.map((url) =>
      fetchTextWithRetry(url, {}, 1, LAND_DISCOVERY_TIMEOUT_MS).then((text) => ({ url, text }))
    )
  );
  const sourceStats = [];
  const allSignals = [];
  responses.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const { url, text } = res.value;
    const signals = extractMoneySignalsFromText(text);
    sourceStats.push({ url, signalCount: signals.length });
    allSignals.push(...signals);
  });
  const summary = summarizeMoneySignals(allSignals);
  if (!summary) return null;
  return {
    source: "internet-scan",
    sourceTitle: "Genel internet taramasi",
    sourceUrl: sourceStats.find((item) => item.signalCount > 0)?.url || null,
    priceTlDa: summary.priceTlDa,
    minTlDa: summary.minTlDa,
    maxTlDa: summary.maxTlDa,
    signalCount: summary.signalCount,
    scannedSources: sourceStats,
    confidence: summary.signalCount >= 8 ? "medium" : "low",
    confidenceScore: summary.signalCount >= 12 ? 0.62 : summary.signalCount >= 8 ? 0.54 : 0.38
  };
}

async function fetchLandPriceFromApis({ city, district, neighborhood, crop, lat, lon }) {
  const providers = getLandPriceApiProviders();
  if (!providers.length) return null;

  const results = [];
  const failedProviders = [];
  for (const provider of providers) {
    try {
      const url = fillLandTemplate(provider.urlTemplate, { city, district, crop, lat, lon, neighborhood });
      const headersFromProvider = safeJsonParse(
        fillLandRawTemplate(provider.headersJson || "", { city, district, crop, lat, lon, neighborhood }),
        {}
      );
      const method = String(provider.method || "GET").toUpperCase();
      const opts = {
        method,
        headers: headersFromProvider && typeof headersFromProvider === "object" ? headersFromProvider : {}
      };
      if (method !== "GET" && method !== "HEAD") {
        const rawBody = fillLandRawTemplate(provider.bodyTemplate || "", { city, district, crop, lat, lon, neighborhood });
        const bodyJson = safeJsonParse(rawBody, null);
        if (bodyJson && typeof bodyJson === "object") {
          opts.body = JSON.stringify(bodyJson);
          if (!opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
        } else if (rawBody) {
          opts.body = rawBody;
        }
      }
      const data = await fetchJsonWithRetry(url, opts, 1, LAND_PROVIDER_TIMEOUT_MS);
      const pathPrice = toNumber(pickPath(data, provider.pricePath));
      const pathMin = toNumber(pickPath(data, provider.minPath));
      const pathMax = toNumber(pickPath(data, provider.maxPath));
      const pathUpdatedAt = pickPath(data, provider.updatedAtPath);
      const price = pathPrice || extractLandPriceValue(data);
      if (price && price > 0) {
        const weight = Number.isFinite(Number(provider.weight)) ? Math.max(0.1, Number(provider.weight)) : 1;
        results.push({
          source: provider.id || "remote-api",
          sourceTitle: provider.title || provider.id || "Remote API",
          url,
          weight,
          priceTlDa: Math.round(price),
          minTlDa:
            typeof pathMin === "number" && pathMin > 0 ? Math.round(pathMin) : Math.round(price * 0.92),
          maxTlDa:
            typeof pathMax === "number" && pathMax > 0 ? Math.round(pathMax) : Math.round(price * 1.1),
          updatedAt: pathUpdatedAt ? new Date(pathUpdatedAt).toISOString() : null,
          confidence: provider.confidence || "high",
          raw: data
        });
      }
    } catch (err) {
      failedProviders.push({
        source: provider.id || "remote-api",
        sourceTitle: provider.title || provider.id || "Remote API",
        message: err?.message || "fetch_failed"
      });
      continue;
    }
  }
  if (!results.length) return null;

  const values = results.map((item) => item.priceTlDa).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const totalWeight = results.reduce((acc, item) => acc + (Number(item.weight) || 1), 0) || 1;
  const weightedAvg = Math.round(
    results.reduce((acc, item) => acc + item.priceTlDa * (Number(item.weight) || 1), 0) / totalWeight
  );
  const winner =
    results
      .slice()
      .sort((a, b) => Math.abs(a.priceTlDa - weightedAvg) - Math.abs(b.priceTlDa - weightedAvg))[0] || results[0];
  const minTlDa = Math.round(
    results.reduce((acc, item) => acc + (Number(item.minTlDa) || item.priceTlDa * 0.92), 0) / results.length
  );
  const maxTlDa = Math.round(
    results.reduce((acc, item) => acc + (Number(item.maxTlDa) || item.priceTlDa * 1.1), 0) / results.length
  );
  const disagreement =
    median > 0 ? (Math.max(...values) - Math.min(...values)) / Math.max(1, median) : 1;
  const confidence =
    results.length >= 3 && disagreement < 0.2
      ? "high"
      : results.length >= 2 && disagreement < 0.35
        ? "medium"
        : "low";
  const confidenceScore = Math.max(
    0.3,
    Math.min(0.92, confidenceLabelToScore(confidence) + Math.max(0, (results.length - 1) * 0.04) - disagreement * 0.25)
  );
  return {
    ...winner,
    source: results.length > 1 ? "api-consensus" : winner.source,
    sourceTitle: results.length > 1 ? "Coklu API uzlasisi" : winner.sourceTitle,
    priceTlDa: results.length > 1 ? weightedAvg : Math.round(median),
    minTlDa,
    maxTlDa,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    providerCount: results.length,
    failedProviderCount: failedProviders.length,
    providerResults: results.map((item) => ({
      source: item.source,
      sourceTitle: item.sourceTitle,
      url: item.url,
      priceTlDa: item.priceTlDa,
      weight: item.weight
    })),
    failedProviders
  };
}

async function estimateLandPrice({ city, district, neighborhood, crop }) {
  const key = cityKey(city);
  const baseline = LAND_BASELINE_TL_DA[key] || 160000;
  const cropFactor = cropFactorFromKey(crop);

  const market = await fetchMarketPrices(city || "");
  const tomato = market.items.find((item) => item.crop === "domates" || item.crop === "tomato");
  const pepper = market.items.find((item) => item.crop === "biber" || item.crop === "pepper");
  const marketSignal = tomato?.price || pepper?.price || null;
  let marketFactor = 1;
  if (typeof marketSignal === "string") {
    const num = Number(String(marketSignal).replace(",", ".").split("-")[0].trim());
    if (Number.isFinite(num) && num > 0) {
      marketFactor = Math.max(0.88, Math.min(1.18, 0.92 + num / 80));
    }
  }

  const listingPremium = deriveListingPremium({ city, district, neighborhood, crop });
  const listingFactor = Number(listingPremium?.factor || 1);
  const locationDataAvailable = Boolean(listingPremium && Number(listingPremium.sampleCount || 0) > 0);
  const districtFactor = locationDataAvailable
    ? 1
    : district
      ? 1.02
      : 1;
  const neighborhoodFactor = locationDataAvailable
    ? 1
    : neighborhood
      ? 1.015 + (hashToUnitInterval(neighborhood) - 0.5) * 0.03
      : 1;
  const estimated = Math.round(
    baseline * cropFactor * marketFactor * districtFactor * neighborhoodFactor * listingFactor
  );
  const min = Math.round(estimated * 0.88);
  const max = Math.round(estimated * 1.14);
  const listingConfidence = Number(listingPremium?.confidenceScore || 0);
  const confidenceScore = Math.max(
    0.46,
    Math.min(
      0.9,
      0.52 +
        Math.min(0.12, listingConfidence * 0.18) +
        (locationDataAvailable ? 0.03 : 0)
    )
  );
  return {
    source: "model-estimate",
    priceTlDa: estimated,
    minTlDa: min,
    maxTlDa: max,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    factors: {
      baselineTlDa: baseline,
      cropFactor,
      marketFactor,
      districtFactor,
      neighborhoodFactor,
      listingFactor,
      locationDataAvailable,
      listingPremium
    },
    listingPremium
  };
}

async function buildLandMlPrediction({
  city,
  district,
  neighborhood,
  crop,
  lat,
  lon,
  zone,
  irrigation,
  roadAccess,
  roadDistanceM,
  roadPass,
  zoningStatus,
  structureStatus,
  soilScore,
  slopePct,
  areaDa,
  plantedStatus,
  plantedCrop,
  plantedValueTlDa
}) {
  const input = normalizeLandFeatureInput({
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa
  });
  const remotePromise = fetchLandPriceFromApis({ city, district, neighborhood, crop, lat: lat || "", lon: lon || "" });
  const internetPromise = fetchLandPriceFromInternet({ city, district, neighborhood, crop });
  const modelPromise = estimateLandPrice({ city, district, neighborhood, crop });
  const manualSummary = buildManualLandSignal({ city, district, neighborhood, crop });
  const comparableSummary = buildComparableLandSignal({ city, district, neighborhood, crop });
  const geoKnnSummary = buildGeoKnnLandSignal({ city, district, neighborhood, crop, lat, lon });
  const [remoteRes, internetRes, modelRes] = await Promise.allSettled([
    remotePromise,
    internetPromise,
    modelPromise
  ]);
  const remote = remoteRes.status === "fulfilled" ? remoteRes.value : null;
  const internet = internetRes.status === "fulfilled" ? internetRes.value : null;
  const baselineModel = modelRes.status === "fulfilled" ? modelRes.value : null;
  const trendSignal = buildLandTrendSignal({ city, district, neighborhood, crop });
  const trendModel = applyTrendToEstimate(baselineModel, trendSignal);

  const manualScoped = queryLandListings({ city, district, neighborhood, crop });
  const manualCityCrop = queryLandListings({ city, district: "", neighborhood: "", crop });
  const manualPoolMax = Math.max(1500, Math.min(9000, Number(process.env.LAND_ML_MANUAL_POOL_MAX || 6000)));
  const manualAll = buildBalancedManualTrainingPool(landManualListings, manualPoolMax);
  const manualRowsScoped = listingRowsToTrainingRows(
    manualScoped,
    {
      city,
      district,
      neighborhood,
      crop,
      zone,
      irrigation,
      roadAccess,
      roadDistanceM,
      roadPass,
      zoningStatus,
      structureStatus,
      soilScore,
      slopePct,
      areaDa,
      plantedStatus,
      plantedCrop,
      plantedValueTlDa
    },
    1.45
  ).map((row) => ({ ...row, source: "manual-scoped" }));
  const manualRowsCity = listingRowsToTrainingRows(
    manualCityCrop,
    {
      city,
      district: "",
      neighborhood: "",
      crop,
      zone: "gecis",
      irrigation: "var",
      roadAccess: "orta",
      roadDistanceM: 350,
      roadPass: "var",
      zoningStatus: "yok",
      structureStatus: "yok",
      soilScore: 64,
      slopePct: 7,
      areaDa: 18,
      plantedStatus: "bos",
      plantedCrop: "",
      plantedValueTlDa: 0
    },
    1.12
  ).map((row) => ({ ...row, source: "manual-city-crop" }));
  const manualRowsAll = listingRowsToTrainingRows(
    manualAll,
    {
      city: "",
      district: "",
      neighborhood: "",
      crop: "",
      zone: "gecis",
      irrigation: "var",
      roadAccess: "orta",
      roadDistanceM: 450,
      roadPass: "var",
      zoningStatus: "yok",
      structureStatus: "yok",
      soilScore: 62,
      slopePct: 8,
      areaDa: 24,
      plantedStatus: "bos",
      plantedCrop: "",
      plantedValueTlDa: 0
    },
    0.86
  ).map((row) => ({ ...row, source: "manual-all" }));
  const manualRows = manualRowsScoped.concat(manualRowsCity, manualRowsAll);

  const syntheticRows = Object.keys(LAND_BASELINE_TL_DA).flatMap((cityName) => {
    const crops = ["domates", "biber", "patates", "bugday"];
    return crops.map((cropName) => {
      const base = Number(LAND_BASELINE_TL_DA[cityName] || 160000);
      const price = Math.round(base * cropFactorFromKey(cropName));
      const f = buildLandFeatureVector({
        city: cityName,
        district: "",
        crop: cropName,
        zone: "gecis",
        irrigation: "var",
        roadAccess: "orta",
        roadDistanceM: 400,
        roadPass: "var",
        zoningStatus: "yok",
        structureStatus: "yok",
        soilScore: 62,
        slopePct: 8,
        areaDa: 20,
        plantedStatus: "bos",
        plantedCrop: "",
        plantedValueTlDa: 0
      });
      return {
        x: f.vector,
        y: Math.log(Math.max(10000, price)),
        price,
        weight: 0.18,
        source: "synthetic"
      };
    });
  });

  const localSignalRows = [];
  const localSources = [
    { key: "remote", item: remote, weight: 1.35 },
    { key: "manual", item: manualSummary, weight: 1.2 },
    { key: "comparable", item: comparableSummary, weight: 1.28 },
    { key: "geoKnn", item: geoKnnSummary, weight: 1.42 },
    { key: "internet", item: internet, weight: 0.9 },
    { key: "model", item: trendModel || baselineModel, weight: trendSignal ? 0.95 : 0.75 }
  ];
  localSources.forEach((entry) => {
    const value = Number(entry.item?.priceTlDa || 0);
    if (!Number.isFinite(value) || value <= 0) return;
    const f = buildLandFeatureVector(input);
    localSignalRows.push({
      x: f.vector,
      y: Math.log(Math.max(10000, value)),
      price: value,
      weight: entry.weight,
      source: entry.key
    });
  });

  const allRowsRaw = manualRows
    .concat(syntheticRows, localSignalRows)
    .filter((row) => Number.isFinite(row.price) && row.price > 0);
  const allRowsClean = cleanLandTrainingRows(allRowsRaw);
  const allRowsPruned = pruneLandTrainingOutliers(allRowsClean);
  const allRows = allRowsPruned.rows;
  if (!allRows.length) {
    return {
      ml: null,
      training: null,
      sources: {
        remote,
        manual: manualSummary,
        comparable: comparableSummary,
        geoKnn: geoKnnSummary,
        internet,
        model: baselineModel,
        trendModel,
        trendSignal
      }
    };
  }

  const featureSize = allRows[0].x.length;
  const trained = trainLandPriceModelAuto(allRows, featureSize);
  if (!trained?.weights) {
    return {
      ml: null,
      training: {
        sampleCount: allRows.length,
        cleanedCount: allRowsClean.length,
        droppedOutliers: allRowsPruned.dropped
      },
      sources: {
        remote,
        manual: manualSummary,
        comparable: comparableSummary,
        geoKnn: geoKnnSummary,
        internet,
        model: baselineModel,
        trendModel,
        trendSignal
      }
    };
  }
  const inputFeatures = buildLandFeatureVector(input);
  let predTlDa = Math.exp(dot(trained?.weights || [], inputFeatures.vector));
  const trainMin = Math.min(...allRows.map((x) => x.price));
  const trainMax = Math.max(...allRows.map((x) => x.price));
  predTlDa = Math.max(trainMin * 0.7, Math.min(trainMax * 1.25, predTlDa));
  const rmse = Number(trained?.metrics?.rmse || 0);
  const mae = Number(trained?.metrics?.mae || 0);
  const r2 = Number(trained?.metrics?.r2 || 0);
  const meanTrain = allRows.reduce((acc, x) => acc + x.price, 0) / allRows.length;
  const relErr = meanTrain > 0 ? rmse / meanTrain : 1;
  const confidenceScore = Math.max(
    0.35,
    Math.min(
      0.93,
      0.74 - relErr * 0.9 + Math.min(0.12, Math.log10(allRows.length + 1) * 0.06) + (localSignalRows.length >= 2 ? 0.06 : 0)
    )
  );
  const minTlDa = Math.round(predTlDa * (1 - Math.min(0.22, relErr + 0.06)));
  const maxTlDa = Math.round(predTlDa * (1 + Math.min(0.26, relErr + 0.08)));
  return {
    ml: {
      source: "ml-linear-regression",
      priceTlDa: Math.round(predTlDa),
      minTlDa,
      maxTlDa,
      confidence: confidenceScoreToLabel(confidenceScore),
      confidenceScore: Number(confidenceScore.toFixed(3)),
      region: input.region,
      factors: {
        baselineTlDa: inputFeatures.baselineTlDa,
        zone: input.zone,
        irrigation: input.irrigation,
        roadAccess: input.roadAccess,
        slopePct: input.slopePct,
        soilScore: input.soilScore
      },
      trendSignal: trendSignal || null
    },
    training: {
      sampleCount: allRows.length,
      cleanedCount: allRowsClean.length,
      droppedOutliers: allRowsPruned.dropped,
      manualCount: manualRows.length,
      manualScopedCount: manualRowsScoped.length,
      manualCityCount: manualRowsCity.length,
      manualAllCount: manualRowsAll.length,
      syntheticCount: syntheticRows.length,
      localSignalCount: localSignalRows.length,
      rmseTlDa: Math.round(rmse),
      maeTlDa: Math.round(mae),
      r2: Number(r2.toFixed(3)),
      valRmseTlDa: Number((trained?.metrics?.valRmse || 0).toFixed(1)),
      epochs: Number(trained?.metrics?.epochs || 0)
    },
    sources: {
      remote,
      manual: manualSummary,
      comparable: comparableSummary,
      geoKnn: geoKnnSummary,
      internet,
      model: baselineModel,
      trendModel,
      trendSignal
    }
  };
}

function listingRowsToTrainingRows(listings = [], defaults = {}, weight = 1) {
  return listings
    .map((item) => {
      const price = Number(item?.priceTlDa || 0);
      if (!Number.isFinite(price) || price <= 0) return null;
      const city = item.city || defaults.city || "";
      const district = item.district || defaults.district || "";
      const neighborhood = item.neighborhood || defaults.neighborhood || "";
      const crop = item.crop || defaults.crop || "";
      const f = buildLandFeatureVector({
        city,
        district,
        neighborhood,
        crop,
        zone: defaults.zone || "gecis",
        irrigation: defaults.irrigation || "var",
        roadAccess: defaults.roadAccess || "orta",
        roadDistanceM: Number(defaults.roadDistanceM || 0),
        roadPass: defaults.roadPass || "var",
        zoningStatus: defaults.zoningStatus || "yok",
        structureStatus: defaults.structureStatus || "yok",
        soilScore: Number(defaults.soilScore || 64),
        slopePct: Number(defaults.slopePct || 7),
        areaDa: Number(defaults.areaDa || item?.areaDa || 0),
        plantedStatus: defaults.plantedStatus || "bos",
        plantedCrop: defaults.plantedCrop || "",
        plantedValueTlDa: Number(defaults.plantedValueTlDa || 0)
      });
      const createdAtTs = item?.createdAt ? new Date(item.createdAt).getTime() : Date.now();
      const ageDays = Number.isFinite(createdAtTs) ? (Date.now() - createdAtTs) / (24 * 3600 * 1000) : 999;
      const recencyWeight =
        ageDays <= 30 ? 1.22 : ageDays <= 90 ? 1.08 : ageDays <= 180 ? 1 : ageDays <= 365 ? 0.9 : 0.78;
      const sourceText = String(item?.source || "").toLowerCase();
      const sourceWeight = sourceText === "synthetic-augment-v2" ? 0.12 : 1;
      return {
        x: f.vector,
        y: Math.log(Math.max(10000, price)),
        price,
        weight: Math.max(0.05, Number(weight) * recencyWeight * sourceWeight),
        source: sourceText || "manual",
        city: String(city || ""),
        district: String(district || ""),
        neighborhood: String(neighborhood || ""),
        crop: String(crop || "")
      };
    })
    .filter(Boolean);
}

function pruneLandTrainingOutliers(rows = []) {
  if (!Array.isArray(rows) || rows.length < 14) {
    return { rows: Array.isArray(rows) ? rows.slice() : [], dropped: 0 };
  }
  const logPrices = rows
    .map((row) => Math.log(Math.max(10000, Number(row?.price || 0))))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  if (logPrices.length < 14) {
    return { rows: rows.slice(), dropped: 0 };
  }
  const mid = Math.floor(logPrices.length / 2);
  const median =
    logPrices.length % 2
      ? logPrices[mid]
      : (logPrices[mid - 1] + logPrices[mid]) / 2;
  const absDevs = logPrices.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const madMid = Math.floor(absDevs.length / 2);
  const mad =
    absDevs.length % 2
      ? absDevs[madMid]
      : (absDevs[madMid - 1] + absDevs[madMid]) / 2;
  const robustSigma = Math.max(1e-6, mad * 1.4826);
  const threshold = Math.max(0.9, robustSigma * 3.6);
  const kept = rows.filter((row) => {
    const lp = Math.log(Math.max(10000, Number(row?.price || 0)));
    return Number.isFinite(lp) && Math.abs(lp - median) <= threshold;
  });
  if (kept.length < Math.max(10, Math.floor(rows.length * 0.65))) {
    return { rows: rows.slice(), dropped: 0 };
  }
  return { rows: kept, dropped: Math.max(0, rows.length - kept.length) };
}

function predictWithCustomLandModel(model = null, input = {}) {
  if (!model || !Array.isArray(model.weights) || !model.featureSize) return null;
  const f = buildLandFeatureVector(input);
  if (f.vector.length !== Number(model.featureSize)) return null;
  let pred = Math.exp(dot(model.weights, f.vector));
  const rmse = Number(model?.metrics?.rmse || 0);
  const rel = pred > 0 ? rmse / pred : 0.2;
  pred = Math.max(10000, pred);
  const minTlDa = Math.round(pred * (1 - Math.min(0.26, 0.08 + rel)));
  const maxTlDa = Math.round(pred * (1 + Math.min(0.3, 0.1 + rel)));
  const confidenceScore = Math.max(
    0.35,
    Math.min(0.94, 0.8 - Math.min(0.4, rel) + Math.min(0.08, Math.log10((model.sampleCount || 1) + 1) * 0.04))
  );
  return {
    source: "custom-land-model",
    priceTlDa: Math.round(pred),
    minTlDa,
    maxTlDa,
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore: Number(confidenceScore.toFixed(3)),
    modelVersion: model.version || null,
    trainedAt: model.trainedAt || null
  };
}

function blendLandMlPredictions({
  baselineMl = null,
  customPred = null,
  training = null,
  manualSummary = null,
  comparableSummary = null,
  geoKnnSummary = null
} = {}) {
  if (!baselineMl && !customPred) return null;
  if (!baselineMl) return { ...customPred, source: "custom-land-model" };
  if (!customPred) return { ...baselineMl, source: baselineMl.source || "ml-linear-regression" };

  const r2 = Number(training?.r2 || 0);
  const mlConf = Number(baselineMl.confidenceScore || 0.45);
  const customConf = Number(customPred.confidenceScore || 0.45);
  const geoCount = Number(geoKnnSummary?.listingCount || 0);
  const manualCount = Number(manualSummary?.listingCount || 0);
  const compCount = Number(comparableSummary?.listingCount || 0);
  const localSignalBoost = Math.min(0.16, (geoCount * 0.012) + (manualCount * 0.004) + (compCount * 0.005));

  const mlWeight = Math.max(0.2, Math.min(0.82, 0.34 + r2 * 0.34 + mlConf * 0.24 + localSignalBoost * 0.4));
  const customWeight = Math.max(0.18, Math.min(0.8, 1 - mlWeight + Math.max(0, customConf - mlConf) * 0.22));
  const totalW = mlWeight + customWeight;
  const wm = mlWeight / totalW;
  const wc = customWeight / totalW;

  const price = Math.round(Number(baselineMl.priceTlDa || 0) * wm + Number(customPred.priceTlDa || 0) * wc);
  const minTlDa = Math.round(Number(baselineMl.minTlDa || price * 0.9) * wm + Number(customPred.minTlDa || price * 0.9) * wc);
  const maxTlDa = Math.round(Number(baselineMl.maxTlDa || price * 1.1) * wm + Number(customPred.maxTlDa || price * 1.1) * wc);
  const disagreement =
    Math.abs(Number(baselineMl.priceTlDa || 0) - Number(customPred.priceTlDa || 0)) / Math.max(1, Number(price || 1));
  const confidenceScore = Math.max(
    0.34,
    Math.min(
      0.95,
      Number((mlConf * wm + customConf * wc - Math.min(0.2, disagreement * 0.28) + Math.min(0.08, localSignalBoost)).toFixed(3))
    )
  );
  return {
    source: "hybrid-ml-ensemble",
    priceTlDa: price,
    minTlDa: Math.min(minTlDa, price),
    maxTlDa: Math.max(maxTlDa, price),
    confidence: confidenceScoreToLabel(confidenceScore),
    confidenceScore,
    blend: {
      mlWeight: Number(wm.toFixed(3)),
      customWeight: Number(wc.toFixed(3)),
      disagreementPct: Number((disagreement * 100).toFixed(2))
    }
  };
}

async function trainCustomLandModel({
  city,
  district,
  neighborhood,
  crop,
  zone,
  irrigation,
  roadAccess,
  roadDistanceM,
  roadPass,
  zoningStatus,
  structureStatus,
  soilScore,
  slopePct,
  areaDa,
  plantedStatus,
  plantedCrop,
  plantedValueTlDa,
  strictMode = true
}) {
  const live = await fetchLiveLandListings({ city, district, neighborhood, crop });
  const manualScoped = queryLandListings({ city, district, neighborhood, crop });
  const manualCity = queryLandListings({ city, district: "", neighborhood: "", crop });
  const manualAllMax = Math.max(1200, Math.min(9000, Number(process.env.LAND_MODEL_MANUAL_ALL_MAX || 6500)));
  const manualAll = buildBalancedManualTrainingPool(landManualListings, manualAllMax);

  const rowsLive = listingRowsToTrainingRows(
    (live?.items || []).map((item) => ({ ...item, city, district, neighborhood, crop })),
    {
      city,
      district,
      neighborhood,
      crop,
      zone,
      irrigation,
      roadAccess,
      roadDistanceM,
      roadPass,
      zoningStatus,
      structureStatus,
      soilScore,
      slopePct,
      areaDa,
      plantedStatus,
      plantedCrop,
      plantedValueTlDa
    },
    1.65
  );
  const rowsManualScoped = listingRowsToTrainingRows(
    manualScoped,
    { city, district, neighborhood, crop, zone, irrigation, roadAccess, roadDistanceM, roadPass, zoningStatus, structureStatus, soilScore, slopePct, areaDa, plantedStatus, plantedCrop, plantedValueTlDa },
    1.4
  );
  const rowsManualCity = listingRowsToTrainingRows(
    manualCity,
    {
      city,
      district: "",
      neighborhood: "",
      crop,
      zone: "gecis",
      irrigation: "var",
      roadAccess: "orta",
      soilScore: 64,
      slopePct: 7
    },
    1.1
  );
  const rowsManualAll = listingRowsToTrainingRows(
    manualAll,
    {
      city: "",
      district: "",
      neighborhood: "",
      crop: "",
      zone: "gecis",
      irrigation: "var",
      roadAccess: "orta",
      soilScore: 62,
      slopePct: 8
    },
    0.85
  );

  const syntheticRows = Object.keys(LAND_BASELINE_TL_DA).flatMap((cityName) => {
    const crops = ["domates", "biber", "patates", "bugday"];
    return crops.map((cropName) => {
      const base = Number(LAND_BASELINE_TL_DA[cityName] || 160000);
      const price = Math.round(base * cropFactorFromKey(cropName));
      const f = buildLandFeatureVector({
        city: cityName,
        district: "",
        crop: cropName,
        zone: "gecis",
        irrigation: "var",
        roadAccess: "orta",
        soilScore: 62,
        slopePct: 8
      });
      return {
        x: f.vector,
        y: Math.log(Math.max(10000, price)),
        price,
        weight: 0.14,
        source: "synthetic",
        city: cityName,
        district: "",
        neighborhood: "",
        crop: cropName
      };
    });
  });

  const rowsRaw = rowsLive.concat(rowsManualScoped, rowsManualCity, rowsManualAll, syntheticRows);
  const rowsClean = cleanLandTrainingRows(rowsRaw, { strict: Boolean(strictMode) });
  const pruned = pruneLandTrainingOutliers(rowsClean);
  const rows = pruned.rows;
  if (rows.length < 25) {
    return {
      ok: false,
      error: "insufficient_samples",
      sampleCount: rows.length,
      details: {
        live: rowsLive.length,
        manualScoped: rowsManualScoped.length,
        manualCity: rowsManualCity.length,
        manualAll: rowsManualAll.length
      }
    };
  }
  const featureSize = rows[0].x.length;
  const trained = trainLandPriceModelAuto(rows, featureSize, { strict: Boolean(strictMode) });
  if (!trained?.weights?.length) {
    return { ok: false, error: "train_failed", sampleCount: rows.length };
  }
  const modelVersion = `v${Date.now().toString().slice(-8)}`;
  landCustomModel = {
    version: modelVersion,
    trainedAt: new Date().toISOString(),
    featureSize,
    weights: trained.weights.map((x) => Number(x)),
    metrics: {
      rmse: Number((trained.metrics?.rmse || 0).toFixed(2)),
      mae: Number((trained.metrics?.mae || 0).toFixed(2)),
      r2: Number((trained.metrics?.r2 || 0).toFixed(4)),
      valRmse: Number((trained.metrics?.valRmse || 0).toFixed(2)),
      epochs: Number(trained.metrics?.epochs || 0),
      tuner: trained.metrics?.tuner || "manual",
      cleanedSampleCount: Number(trained.metrics?.cleanedSampleCount || rows.length)
    },
    sampleCount: rows.length,
    sampleBreakdown: {
      rawTotal: rowsRaw.length,
      cleanedTotal: rowsClean.length,
      prunedOutliers: pruned.dropped,
      live: rowsLive.length,
      manualScoped: rowsManualScoped.length,
      manualCity: rowsManualCity.length,
      manualAll: rowsManualAll.length,
      synthetic: syntheticRows.length
    },
    trainingMode: strictMode ? "strict" : "standard",
    scope: { city: city || null, district: district || null, crop: crop || null }
  };
  saveLandCustomModelToDisk();
  return { ok: true, model: landCustomModel };
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    apiVersion: API_VERSION,
    modelVersion: MODEL_VERSION,
    gitSha: GIT_SHA,
    features: buildFeatureFlags()
  });
});

app.get("/api/metrics", (req, res) => {
  const activeLabels = getActiveLabels();
  const pipelines = getOnnxPipelines();
  res.json({
    status: "ok",
    uptimeSec: Math.floor((Date.now() - SERVER_START) / 1000),
    cacheSize: inferCache.size,
    queueLength: inferQueue.length,
    activeInference,
    modelLoaded: Boolean(pipelines.length),
    primaryModelLoaded: Boolean(modelSession),
    secondaryModelLoaded: Boolean(modelSessionSecondary),
    modelLabels: activeLabels.length || 0,
    modelVersion: MODEL_VERSION,
    modelStrictOnly: MODEL_STRICT_ONLY,
    apiVersion: API_VERSION,
    features: buildFeatureFlags(),
    gitSha: GIT_SHA,
    startedAt: new Date(SERVER_START).toISOString()
  });
});

app.get("/api/model/health", (req, res) => {
  res.json(buildModelHealthSummary());
});

app.post("/api/model/self-check", async (req, res) => {
  try {
    const result = await runModelSelfCheck();
    if (!result.ok) {
      return res.status(503).json(result);
    }
    return res.json(result);
  } catch (err) {
    recordModelFailure("self-check", String(err?.message || err));
    return res.status(500).json({
      updatedAt: new Date().toISOString(),
      ok: false,
      summary: "Self-check failed",
      error: String(err?.message || err || "self_check_failed")
    });
  }
});

app.get("/api/model/diagnostics", (req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    strictMode: MODEL_STRICT_ONLY,
    diagnostics: summarizeModelDiagnostics(),
    health: buildModelHealthSummary()
  });
});

app.post("/api/model/diagnostics/reset", (req, res) => {
  modelPredictionStats.splice(0, modelPredictionStats.length);
  res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    summary: "Model diagnostics reset",
    diagnostics: summarizeModelDiagnostics()
  });
});

app.get("/api/plants", (req, res) => {
  const catalogLabels = getCatalogLabels();
  if (!catalogLabels.length) {
    return res.json({ plants: [] });
  }
  const set = new Set();
  catalogLabels.forEach((label) => {
    const plant = labelToPlantId(label);
    if (plant) set.add(plant);
  });
  res.json({ plants: Array.from(set).sort() });
});

app.get("/api/plant-diseases", (req, res) => {
  const rawPlant = (req.query.plant || "").toString();
  const catalogLabels = getCatalogLabels();
  const supportedPlantIds = Array.from(
    new Set(catalogLabels.map((item) => labelToPlantId(item)).filter(Boolean))
  );
  const plant = normalizePlantInput(rawPlant, supportedPlantIds);
  if (!plant || !catalogLabels.length) {
    return res.json({ plant, diseases: [], healthy: null });
  }
  const diseases = [];
  let healthy = null;
  catalogLabels.forEach((label) => {
    const plantId = labelToPlantId(label);
    if (plantId !== plant) return;
    if (label.toLowerCase().includes("healthy")) {
      healthy = prettyLabel(label);
      return;
    }
    const meta =
      (labelMetadata && (labelMetadata[label] || labelMetadata[normalizeLabelKey(label)])) || null;
    diseases.push({
      label,
      pretty: prettyLabel(label),
      name: meta?.name || prettyLabel(label),
      summary: meta?.summary || null
    });
  });
  return res.json({ plant, diseases, healthy });
});

app.get("/api/weather", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString().trim();
  const neighborhood = (req.query.neighborhood || "").toString().trim();
  const requestLocationLabel = buildLocationSearchQuery(city, district, neighborhood) || city;
  const coords = (req.query.coords || "").toString();
  const buildWeatherFallback = (reason, coordsValue = coords || null) => ({
    ...buildDemoWeather(city, coordsValue, reason),
    district: district || null,
    neighborhood: neighborhood || null,
    locationLabel: requestLocationLabel
  });
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const cacheKey = coords ? coords : buildLocationSearchQuery(city, district, neighborhood).toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL_MS) {
    return res.json({ ...cached.value, source: `${cached.value.source || "cache"}-cache` });
  }

  if (!apiKey) {
    try {
      let resolved = null;
      if (lat && lon) {
        resolved = { lat, lon, name: city, district, neighborhood };
      } else {
        resolved = await geocodeCity(city, district, neighborhood);
      }
      if (!resolved) {
        const stale = getAnyCacheEntry(weatherCache, cacheKey);
        if (stale) return res.json({ ...stale, source: "stale-cache", warning: "weather_geocode_failed" });
        return res.json(buildWeatherFallback("weather_geocode_failed"));
      }
      const weather = await fetchOpenMeteoWeather(resolved.lat, resolved.lon);
      if (!weather) {
        const stale = getAnyCacheEntry(weatherCache, cacheKey);
        if (stale) return res.json({ ...stale, source: "stale-cache", warning: "weather_fetch_failed" });
        return res.json({
          ...buildDemoWeather(resolved.name || city, `${resolved.lat}, ${resolved.lon}`, "weather_fetch_failed"),
          district: resolved.district || district || null,
          neighborhood: resolved.neighborhood || neighborhood || null,
          locationLabel:
            buildLocationSearchQuery(
              resolved.name || city,
              resolved.district || district,
              resolved.neighborhood || neighborhood
            ) || requestLocationLabel
        });
      }
      const payload = {
        city: resolved.name || city,
        district: resolved.district || district || null,
        neighborhood: resolved.neighborhood || neighborhood || null,
        locationLabel:
          buildLocationSearchQuery(
            resolved.name || city,
            resolved.district || district,
            resolved.neighborhood || neighborhood
          ) || requestLocationLabel,
        coords: `${resolved.lat}, ${resolved.lon}`,
        ...weather
      };
      weatherCache.set(cacheKey, { ts: Date.now(), value: payload });
      return res.json(payload);
    } catch (err) {
      const stale = getAnyCacheEntry(weatherCache, cacheKey);
      if (stale) return res.json({ ...stale, source: "stale-cache", warning: "weather_exception" });
      return res.json(buildWeatherFallback("weather_exception"));
    }
  }

  try {
    const url = lat && lon
      ? `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(
          lat
        )}&lon=${encodeURIComponent(lon)}&units=metric&appid=${apiKey}`
      : `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
          city
        )},TR&units=metric&appid=${apiKey}`;
    const data = await fetchJsonWithRetry(url);
    const tempMin = data.main?.temp_min ?? null;
    const result = {
      city: data.name || city,
      district: district || null,
      neighborhood: neighborhood || null,
      locationLabel: requestLocationLabel,
      coords: lat && lon ? `${lat}, ${lon}` : null,
      temp: data.main?.temp ?? null,
      tempMin,
      tempMax: data.main?.temp_max ?? null,
      humidity: data.main?.humidity ?? null,
      windKmh: data.wind?.speed ? Math.round(data.wind.speed * 3.6) : null,
      condition: data.weather?.[0]?.description || "unknown",
      frostRisk: typeof tempMin === "number" ? tempMin <= 0 : false,
      localTime: data.dt ? new Date((data.dt + (data.timezone || 0)) * 1000).toISOString() : null,
      timeZone: data.timezone ? `UTC${data.timezone >= 0 ? "+" : ""}${data.timezone / 3600}` : null,
      updatedAt: new Date().toISOString(),
      source: "openweather"
    };
    weatherCache.set(cacheKey, { ts: Date.now(), value: result });
    return res.json(result);
  } catch (err) {
    const stale = getAnyCacheEntry(weatherCache, cacheKey);
    if (stale) return res.json({ ...stale, source: "stale-cache", warning: "weather_exception" });
    return res.json(buildWeatherFallback("weather_exception"));
  }
});

const marketSources = [
  {
    title: "Bursa Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.bursa.bel.tr/hal_fiyatlari",
    summary: "Bursa hal fiyat listesi (gunluk/haftalik)."
  },
  {
    title: "Antalya Buyuksehir Belediyesi Halden Gunluk Fiyatlar",
    category: "Pazar",
    url: "https://www.antalya.bel.tr/tr/halden-gunluk-fiyatlar",
    summary: "Antalya hal gunluk fiyatlar listesi."
  },
  {
    title: "Konya Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.konya.bel.tr/hal-fiyatlari",
    summary: "Konya hal fiyat listesi."
  },
  {
    title: "Kayseri Buyuksehir Belediyesi Hal Fiyat Listesi",
    category: "Pazar",
    url: "https://www.kayseri.bel.tr/hal-fiyatlari",
    summary: "Kayseri hal fiyat listesi."
  },
  {
    title: "Eskisehir Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.eskisehir.bel.tr/hal-fiyatlari",
    summary: "Eskisehir hal fiyat bulteni."
  },
  {
    title: "Bolu Belediyesi Toptanci Hal Fiyat Listesi",
    category: "Pazar",
    url: "https://www.bolu.bel.tr/t-c-bolu-belediyesi-toptanci-hal-fiyat-listesi/",
    summary: "Bolu haftalik toptanci hal fiyatlari."
  },
  {
    title: "Biga Belediyesi Hal Fiyat Listesi",
    category: "Pazar",
    url: "https://www.biga.bel.tr/hal-fiyat-listesi",
    summary: "Biga toptanci hal fiyat listesi."
  },
  {
    title: "Eregli Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://eregli.bel.tr/public/sayfa/hal-fiyatlari",
    summary: "Eregli gunluk sebze ve meyve fiyat listesi."
  },
  {
    title: "Kocaeli Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.kocaeli.bel.tr/hal-fiyatlari/",
    summary: "Kocaeli gunluk hal fiyatlari sayfasi."
  },
  {
    title: "Ankara Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.ankara.bel.tr/hal-fiyatlari",
    summary: "Ankara hal fiyatlari sorgu sayfasi."
  },
  {
    title: "Yeni Malatya Gazetesi - Hal Fiyatlari",
    category: "Pazar",
    url: "https://yenimalatya.com.tr/hal-fiyatlari",
    summary: "Malatya icin hal fiyat listesi (haber kaynagi)."
  },
  {
    title: "Mersin Plus - Gunluk Resmi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.mersin.plus/gunluk-sebze-ve-meyve-resmi-hal-fiyatlari-mersin/",
    summary: "Mersin hal fiyat listesi (otomatik guncel)."
  },
  {
    title: "Van Buyuksehir Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://van.bel.tr/Syf/hal-fiyatlari.html",
    summary: "Van hal fiyat listesi."
  },
  {
    title: "Eregli Belediyesi Hal Fiyatlari",
    category: "Pazar",
    url: "https://www.eregli.bel.tr/sayfa/hal-fiyatlari",
    summary: "Eregli hal fiyat listesi."
  }
];

const referenceSources = [
  {
    title: "FAO IPM - Integrated Pest Management",
    category: "IPM",
    url: "https://www.fao.org/pest-and-pesticide-management/ipm/integrated-pest-management/en/",
    summary: "Entegre zararli yonetimi prensipleri ve uygulama yaklasimlari."
  },
  {
    title: "FAO IPM: Economic Thresholds",
    category: "Esik",
    url: "https://www.fao.org/4/Y4611E/y4611e0a.htm",
    summary: "Ekonomik zarar/eylem esikleri ve karar destek mantigi."
  },
  {
    title: "US EPA: Worker Protection Standard (REI)",
    category: "Giris Kisitlamasi",
    url: "https://www.epa.gov/pesticide-worker-safety/restricted-entry-intervals-reis",
    summary: "Uygulama sonrasi tarlaya giris kisitlamasi (REI) bilgisi."
  },
  {
    title: "USU Extension: Preharvest Interval (PHI)",
    category: "Hasat Oncesi",
    url: "https://extension.usu.edu/pests/uppdl/ppa-guides/preharvest-interval-phi",
    summary: "PHI tanimi ve hasat oncesi bekleme suresi."
  },
  {
    title: "FAO Teknik Bilgi Notlari (Bahce Bitkileri)",
    category: "Uretim",
    url: "https://www.fao.org/plant-production-protection/resources/publications/technical-factsheets-series-on-horticulture-crops-management/en",
    summary: "Iklem, toprak, besin, su ve hastalik yonetimi icin teknik notlar."
  },
  {
    title: "FAO - IPM Oncelikli Zararlilar Rehberi",
    category: "IPM",
    url: "https://www.fao.org/science-technology-and-innovation/home/guidance-on-integrated-pest-management-for-the-world-s-major-crop-pests-and-diseases/",
    summary: "Kuresel oncelikli zararlilar icin IPM cozum paketleri."
  },
  {
    title: "EPPO Global Database",
    category: "Zararli/Hastalik",
    url: "https://www.eppo.int/RESOURCES/eppo_databases/global_database",
    summary: "Bitki ve zararli turleri icin global referans veri tabani."
  },
  {
    title: "EPPO PP1 Standartlari",
    category: "Etkinlik",
    url: "https://pp1.eppo.int/",
    summary: "Bitki koruma urunleri icin etkinlik degerlendirme standartlari."
  },
  {
    title: "EPPO Direnc Vakalari Veri Tabani",
    category: "Direnc",
    url: "https://resistance.eppo.int/",
    summary: "Fungisit, herbisit ve insektisit direncleri."
  },
  {
    title: "TEPGE Urun Raporlari",
    category: "Verim",
    url: "https://arastirma.tarimorman.gov.tr/tepge/Menu/37/Urun-Raporlari",
    summary: "Urun bazli verim, maliyet ve piyasa analiz raporlari."
  },
  {
    title: "Kayseri Il Tarim - Bitkisel Uretim Istatistikleri (2024)",
    category: "Verim",
    url: "https://kayseri.tarimorman.gov.tr/Menu/80/Bitkisel-Uretim",
    summary: "Il bazli ekili alan, uretim ve verim tablolari."
  },
  {
    title: "PlantVillage Dataset",
    category: "Gorsel Veri",
    url: "https://github.com/gabrieldgf4/PlantVillage-Dataset",
    summary: "Bitki yaprak hastaliklari icin acik veri seti."
  }
];

const AGRI_NEWS_FEEDS = [
  { id: "tarimorman", title: "Tarim ve Orman Bakanligi Haberleri", url: "https://www.tarimorman.gov.tr/Sayfalar/RSS.aspx" },
  { id: "tarimorman-duyurular", title: "Tarim ve Orman Bakanligi Duyurular", url: "https://www.tarimorman.gov.tr/Sayfalar/DuyuruArsiv.aspx?Liste=1" },
  { id: "dunya-tarim", title: "Dunya Tarim", url: "https://www.dunya.com/rss/tarim" }
];

const AGRI_NEWS_KEYWORDS = [
  "tarim",
  "ciftci",
  "ziraat",
  "bitki",
  "hasat",
  "ekim",
  "tohum",
  "gubre",
  "sulama",
  "hayvancilik",
  "sera",
  "rekolte",
  "don riski",
  "kuraklik",
  "toprak",
  "uretim",
  "hal fiyat",
  "piyasa",
  "hububat",
  "arpa",
  "bugday",
  "misir",
  "domates",
  "biber",
  "meyve",
  "sebze"
];

function normalizeTrText(input = "") {
  return String(input || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function computeAgriNewsScore(item = {}) {
  const text = normalizeTrText(`${item.title || ""} ${item.description || ""}`);
  let score = 0;
  AGRI_NEWS_KEYWORDS.forEach((kw) => {
    if (text.includes(normalizeTrText(kw))) score += 1;
  });
  if (item.feedId === "tarimorman") score += 3;
  if (item.feedId === "dunya-tarim") score += 2;
  if (item.feedId === "tarimorman-duyurular") score += 2;
  return score;
}

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xml = "", limit = 12) {
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const blocks = String(xml || "").match(itemRegex) || [];
  const pick = (block, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    return m ? decodeXmlEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
  };
  return blocks.slice(0, limit).map((block) => ({
    title: pick(block, "title"),
    link: pick(block, "link"),
    pubDate: pick(block, "pubDate"),
    description: pick(block, "description")
  }));
}

function parseAtomItems(xml = "", limit = 12) {
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const blocks = String(xml || "").match(entryRegex) || [];
  const pick = (block, tag) => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    return m ? decodeXmlEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
  };
  const pickLink = (block) => {
    const href = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
    if (href?.[1]) return decodeXmlEntities(href[1]);
    return pick(block, "link");
  };
  return blocks.slice(0, limit).map((block) => ({
    title: pick(block, "title"),
    link: pickLink(block),
    pubDate: pick(block, "updated") || pick(block, "published"),
    description: pick(block, "summary") || pick(block, "content")
  }));
}

function parseFeedItems(xml = "", limit = 12) {
  const rss = parseRssItems(xml, limit);
  if (rss.length) return rss;
  return parseAtomItems(xml, limit);
}

async function probeIntegrationUrl({ id, title, url, timeoutMs = 6500 }) {
  if (!url) {
    return { id, title, ok: false, status: "missing_url", latencyMs: null, url: null };
  }
  const startedAt = Date.now();
  try {
    await fetchTextWithRetry(url, {}, 0, timeoutMs);
    return {
      id,
      title,
      ok: true,
      status: "ok",
      latencyMs: Date.now() - startedAt,
      url
    };
  } catch (err) {
    const msg = String(err?.message || "probe_failed").slice(0, 140);
    return {
      id,
      title,
      ok: false,
      status: msg.includes("HTTP") ? "http_error" : "unreachable",
      latencyMs: Date.now() - startedAt,
      url,
      error: msg
    };
  }
}

app.get("/api/sources", (req, res) => {
  const landProviders = getLandPriceApiProviders().map((item) => ({
    title: `Arazi Fiyat API - ${item.title}`,
    category: "Arazi Degerleme",
    url: item.urlTemplate,
    summary: "Kullanici tarafindan tanimlanan arazi fiyat API kaynagi."
  }));
  res.json({
    updatedAt: new Date().toISOString(),
    sources: referenceSources.concat(marketSources, landProviders)
  });
});

app.get("/api/integrations/health", async (req, res) => {
  const force = ["1", "true", "yes"].includes(String(req.query.force || "").toLowerCase());
  const cacheKey = "global";
  const cached = integrationsHealthCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < INTEGRATIONS_HEALTH_CACHE_TTL_MS) {
    return res.json({ ...cached.value, cache: "hit" });
  }

  const newsFeed = AGRI_NEWS_FEEDS[0]?.url || "";
  const landProvider = getLandPriceApiProviders()[0]?.urlTemplate || "";
  const checks = [
    { id: "open-meteo-forecast", title: "Open-Meteo Forecast", url: `${OPEN_METEO_FORECAST_URL}?latitude=38.355&longitude=38.309&current=temperature_2m` },
    { id: "open-meteo-geocode", title: "Open-Meteo Geocode", url: `${OPEN_METEO_GEOCODE_URL}?name=Malatya&count=1&language=tr&format=json` },
    { id: "soilgrids", title: "ISRIC SoilGrids", url: `${SOILGRIDS_QUERY}?lon=38.309&lat=38.355&property=phh2o&depth=0-5cm&value=mean` },
    { id: "news-feed", title: "Tarim Haber RSS", url: newsFeed },
    { id: "tr-soil-wms", title: "TR Toprak WMS", url: TR_SOIL_WMS_URL || null },
    { id: "mta-soil", title: "MTA Soil Layer", url: MTA_SOIL_URL || null },
    { id: "land-price-provider", title: "Arazi Fiyat Provider", url: landProvider || null }
  ];

  const results = await Promise.all(checks.map((item) => probeIntegrationUrl(item)));
  const okCount = results.filter((item) => item.ok).length;
  const payload = {
    updatedAt: new Date().toISOString(),
    total: results.length,
    healthy: okCount,
    degraded: results.length - okCount,
    ratio: Number((okCount / Math.max(1, results.length)).toFixed(3)),
    items: results
  };
  integrationsHealthCache.set(cacheKey, { ts: Date.now(), value: payload });
  return res.json(payload);
});

app.get("/api/news", async (req, res) => {
  const perFeed = Math.max(3, Math.min(15, Number(req.query.perFeed || 6)));
  const limit = Math.max(5, Math.min(40, Number(req.query.limit || 20)));
  const force = ["1", "true", "yes"].includes(String(req.query.force || "").toLowerCase());
  const cacheKey = `agri:${perFeed}:${limit}`;
  const cached = newsCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < NEWS_CACHE_TTL_MS) {
    return res.json({ ...cached.value, source: "cache" });
  }
  const responses = await Promise.allSettled(
    AGRI_NEWS_FEEDS.map(async (feed) => {
      const xml = await fetchTextWithRetry(feed.url, {}, 1, 7000);
      const items = parseFeedItems(xml, perFeed).map((item) => ({
        ...item,
        feedId: feed.id,
        feedTitle: feed.title
      }));
      return { feed, items };
    })
  );
  const items = [];
  const failedFeeds = [];
  responses.forEach((res, idx) => {
    if (res.status === "fulfilled") {
      items.push(...res.value.items);
    } else {
      failedFeeds.push({
        id: AGRI_NEWS_FEEDS[idx].id,
        title: AGRI_NEWS_FEEDS[idx].title
      });
    }
  });
  const unique = new Map();
  items.forEach((item) => {
    const k = `${item.link || ""}|${item.title || ""}`.trim();
    if (!k) return;
    if (!unique.has(k)) unique.set(k, item);
  });
  const sorted = Array.from(unique.values()).sort((a, b) => {
    const ta = new Date(a.pubDate || 0).getTime();
    const tb = new Date(b.pubDate || 0).getTime();
    return tb - ta;
  });
  const scored = sorted
    .map((item) => ({ ...item, agriScore: computeAgriNewsScore(item) }))
    .sort((a, b) => {
      if ((b.agriScore || 0) !== (a.agriScore || 0)) return (b.agriScore || 0) - (a.agriScore || 0);
      const ta = new Date(a.pubDate || 0).getTime();
      const tb = new Date(b.pubDate || 0).getTime();
      return tb - ta;
    });
  const picked = scored
    .filter((item) => (item.agriScore || 0) >= 2)
    .slice(0, limit);
  const payload = {
    updatedAt: new Date().toISOString(),
    count: picked.length,
    droppedCount: Math.max(0, sorted.length - picked.length),
    items: picked.filter((item) => item.title && item.link),
    feeds: AGRI_NEWS_FEEDS,
    failedFeeds
  };
  if (!payload.items.length) {
    payload.items = [
      {
        title: "TarimAsistan guncel pazar izleme notu",
        link: "https://www.tarimorman.gov.tr/",
        pubDate: new Date().toISOString(),
        description: "Canli RSS kaynaklari gecici ulasilamaz durumda. Yerel ozet akisi gosteriliyor.",
        feedId: "fallback",
        feedTitle: "Yerel fallback"
      },
      {
        title: "Bitki hastalik yonetimi: saha kontrol listesi",
        link: "https://www.fao.org/pest-and-pesticide-management/ipm/integrated-pest-management/en/",
        pubDate: new Date().toISOString(),
        description: "IPM odakli saha kontrol adimlari ve sezonluk takip basliklari.",
        feedId: "fallback",
        feedTitle: "Yerel fallback"
      },
      {
        title: "Sulama plani: toprak nemine gore haftalik kontrol",
        link: "https://www.fao.org/land-water/water/water-management/en/",
        pubDate: new Date().toISOString(),
        description: "Toprak nem sinyallerine dayali sulama rutini ve tasarruf adimlari.",
        feedId: "fallback",
        feedTitle: "Yerel fallback"
      },
      {
        title: "Tarim piyasasi: urun bazli fiyat bandi takibi",
        link: "https://www.tarimorman.gov.tr/",
        pubDate: new Date().toISOString(),
        description: "Hal fiyatlari ve bolgesel alis-satis bandini gunluk takip etmek icin ozet.",
        feedId: "fallback",
        feedTitle: "Yerel fallback"
      }
    ];
    payload.count = payload.items.length;
  }
  newsCache.set(cacheKey, { ts: Date.now(), value: payload });
  return res.json(payload);
});

app.get("/api/forecast", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString().trim();
  const neighborhood = (req.query.neighborhood || "").toString().trim();
  const requestLocationLabel = buildLocationSearchQuery(city, district, neighborhood) || city;
  const coords = (req.query.coords || "").toString();
  const buildForecastFallback = (reason, coordsValue = coords || null) => ({
    ...buildDemoForecast(city, coordsValue, reason),
    district: district || null,
    neighborhood: neighborhood || null,
    locationLabel: requestLocationLabel
  });
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const cacheKey = coords ? coords : buildLocationSearchQuery(city, district, neighborhood).toLowerCase();
  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FORECAST_CACHE_TTL_MS) {
    return res.json({ ...cached.value, source: `${cached.value.source || "cache"}-cache` });
  }

  if (!apiKey) {
    try {
      let resolved = null;
      if (lat && lon) {
        resolved = { lat, lon, name: city, district, neighborhood };
      } else {
        resolved = await geocodeCity(city, district, neighborhood);
      }
      if (!resolved) {
        const stale = getAnyCacheEntry(forecastCache, cacheKey);
        if (stale) return res.json({ ...stale, source: "stale-cache", warning: "forecast_geocode_failed" });
        return res.json(buildForecastFallback("forecast_geocode_failed"));
      }
      const forecastData = await fetchOpenMeteoForecast(resolved.lat, resolved.lon);
      if (!forecastData) {
        const stale = getAnyCacheEntry(forecastCache, cacheKey);
        if (stale) return res.json({ ...stale, source: "stale-cache", warning: "forecast_fetch_failed" });
        return res.json({
          ...buildDemoForecast(resolved.name || city, `${resolved.lat}, ${resolved.lon}`, "forecast_fetch_failed"),
          district: resolved.district || district || null,
          neighborhood: resolved.neighborhood || neighborhood || null,
          locationLabel:
            buildLocationSearchQuery(
              resolved.name || city,
              resolved.district || district,
              resolved.neighborhood || neighborhood
            ) || requestLocationLabel
        });
      }
      const payload = {
        city: resolved.name || city,
        district: resolved.district || district || null,
        neighborhood: resolved.neighborhood || neighborhood || null,
        locationLabel:
          buildLocationSearchQuery(
            resolved.name || city,
            resolved.district || district,
            resolved.neighborhood || neighborhood
          ) || requestLocationLabel,
        coords: `${resolved.lat}, ${resolved.lon}`,
        days: forecastData.daily,
        hourly: forecastData.hourly,
        timeZone: forecastData.timeZone,
        source: "openmeteo"
      };
      forecastCache.set(cacheKey, { ts: Date.now(), value: payload });
      return res.json(payload);
    } catch (err) {
      const stale = getAnyCacheEntry(forecastCache, cacheKey);
      if (stale) return res.json({ ...stale, source: "stale-cache", warning: "forecast_exception" });
      return res.json(buildForecastFallback("forecast_exception"));
    }
  }

  try {
    const url = lat && lon
      ? `https://api.openweathermap.org/data/2.5/forecast?lat=${encodeURIComponent(
          lat
        )}&lon=${encodeURIComponent(lon)}&units=metric&appid=${apiKey}`
      : `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
          city
        )},TR&units=metric&appid=${apiKey}`;
    const data = await fetchJsonWithRetry(url);
    const byDay = {};
    data.list.forEach((item) => {
      const day = item.dt_txt.split(" ")[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(item);
    });
    const days = Object.keys(byDay)
      .slice(0, 4)
      .map((day, idx) => {
        const temps = byDay[day].map((d) => d.main.temp);
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        const condition = byDay[day][0]?.weather?.[0]?.description || "unknown";
        return {
          day: idx === 0 ? "Bugun" : `${idx} gun`,
          min: Math.round(min),
          max: Math.round(max),
          condition,
          frost: min <= 0
        };
      });
    const payload = {
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      locationLabel: requestLocationLabel,
      coords: lat && lon ? `${lat}, ${lon}` : null,
      days,
      source: "openweather"
    };
    forecastCache.set(cacheKey, { ts: Date.now(), value: payload });
    return res.json(payload);
  } catch (err) {
    const stale = getAnyCacheEntry(forecastCache, cacheKey);
    if (stale) return res.json({ ...stale, source: "stale-cache", warning: "forecast_exception" });
    return res.json(buildForecastFallback("forecast_exception"));
  }
});

app.get("/api/market", async (req, res) => {
  const city = (req.query.city || "Bursa").toString();
  const data = await fetchMarketPrices(city);
  if (!data.items.length) {
    return res.json({
      city,
      source: "demo-fallback",
      warning: "market_live_source_unavailable",
      items: buildDemoMarketItems(city)
    });
  }
  return res.json({ city, source: data.source, items: data.items });
});

app.get("/api/economy/planner", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const crop = (req.query.crop || "").toString();
  const areaDa = Math.max(0, Number(req.query.areaDa || 0));
  const yieldKgDa = Math.max(0, Number(req.query.yieldKgDa || 0));
  const priceTlKg = Math.max(0, Number(req.query.priceTlKg || 0));
  const cacheKey = `${cityKey(city)}|${cityKey(crop)}|${areaDa}|${yieldKgDa}|${priceTlKg}`;
  const cached = economyPlannerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ECONOMY_CACHE_TTL_MS) {
    return res.json({ ...cached.value, cache: "hit" });
  }

  const cityMarketPromise = fetchMarketPrices(city).catch(() => ({ source: "none", items: [] }));
  const fxPromise = fetchTcmbFxSnapshot();
  const macroPromise = fetchWorldBankMacroSnapshot();
  const wheatPromise = fetchStooqWheatSnapshot();

  const [marketRes, fxRes, macroRes, wheatRes] = await Promise.allSettled([
    cityMarketPromise,
    fxPromise,
    macroPromise,
    wheatPromise
  ]);

  const localMarketItems = marketRes.status === "fulfilled" ? marketRes.value?.items || [] : [];
  const cropKey = cityKey(crop);
  const selectedItem =
    localMarketItems.find((item) => cityKey(item.crop || item.label || "") === cropKey) || null;
  const selectedPrice = parsePriceRangeToMedian(selectedItem?.price);
  const allMarketPrices = localMarketItems
    .map((item) => parsePriceRangeToMedian(item.price))
    .filter((x) => Number.isFinite(x) && x > 0);
  const localMarket = {
    source: marketRes.status === "fulfilled" ? marketRes.value?.source || "none" : "none",
    selectedCrop: selectedItem
      ? {
          crop: selectedItem.crop || crop || null,
          label: selectedItem.label || selectedItem.crop || null,
          priceRaw: selectedItem.price || null,
          medianTlKg: selectedPrice || null
        }
      : null,
    count: localMarketItems.length,
    medianTlKg: allMarketPrices.length ? Number(medianOf(allMarketPrices).toFixed(2)) : 0,
    avgTlKg: allMarketPrices.length ? Number(avgOf(allMarketPrices).toFixed(2)) : 0
  };

  const openListings = tradeListings.filter((item) => {
    if (item.status !== "open") return false;
    if (city && cityKey(item.city) !== cityKey(city)) return false;
    if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
    return true;
  });
  const sellVals = openListings
    .filter((item) => item.type === "sell")
    .map((item) => Number(item.priceTlKg))
    .filter((x) => Number.isFinite(x) && x > 0);
  const buyVals = openListings
    .filter((item) => item.type === "buy")
    .map((item) => Number(item.priceTlKg))
    .filter((x) => Number.isFinite(x) && x > 0);
  const tradeSummary = {
    source: "trade-market",
    openListingCount: openListings.length,
    market: {
      sellMedianTlKg: Number(medianOf(sellVals).toFixed(2)),
      sellAvgTlKg: Number(avgOf(sellVals).toFixed(2)),
      buyMedianTlKg: Number(medianOf(buyVals).toFixed(2)),
      buyAvgTlKg: Number(avgOf(buyVals).toFixed(2))
    }
  };

  const payload = buildEconomyPlannerPayload({
    city,
    crop,
    areaDa,
    yieldKgDa,
    priceTlKg,
    localMarket,
    tradeSummary,
    fx: fxRes.status === "fulfilled" ? fxRes.value : null,
    macro: macroRes.status === "fulfilled" ? macroRes.value : null,
    wheat: wheatRes.status === "fulfilled" ? wheatRes.value : null
  });
  payload.failedSources = [];
  if (fxRes.status !== "fulfilled") payload.failedSources.push("tcmb");
  if (macroRes.status !== "fulfilled") payload.failedSources.push("worldbank");
  if (wheatRes.status !== "fulfilled") payload.failedSources.push("stooq");
  if (marketRes.status !== "fulfilled") payload.failedSources.push("hal-market");
  economyPlannerCache.set(cacheKey, { ts: Date.now(), value: payload });
  return res.json(payload);
});

app.get("/api/land-price/sources", (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const providers = getLandPriceApiProviders().map((item) => ({
    id: item.id,
    title: item.title,
    method: item.method || "GET",
    priority: item.priority || null,
    weight: item.weight || 1,
    urlTemplate: item.urlTemplate,
    mappedFields: {
      pricePath: item.pricePath || null,
      minPath: item.minPath || null,
      maxPath: item.maxPath || null,
      updatedAtPath: item.updatedAtPath || null
    },
    confidence: item.confidence || "high"
  }));
  const discovery = LAND_DISCOVERY_ENABLED
    ? getLandInternetSearchUrls({ city, district, neighborhood, crop }).map((url, idx) => ({
        id: `search-${idx + 1}`,
        title: "Internet arama",
        urlTemplate: url,
        mappedFields: {
          pricePath: "regex_tl_parser",
          minPath: null,
          maxPath: null,
          updatedAtPath: null
        },
        confidence: "low-medium"
      }))
    : [];
  const manual = {
    id: "manual-listings",
    title: "Manuel ilan veri girisi",
    method: "POST",
    priority: 90,
    weight: 1,
    urlTemplate: "/api/land-price/listings",
    mappedFields: {
      pricePath: "priceTlDa",
      minPath: null,
      maxPath: null,
      updatedAtPath: "createdAt"
    },
    confidence: "medium"
  };
  const liveListings = {
    id: "live-listings-scan",
    title: "Canli tarla ilan taramasi",
    method: "GET",
    priority: 40,
    weight: 1.35,
    urlTemplate: "/api/land-price/listings/live",
    mappedFields: {
      pricePath: "summary.priceTlDa",
      minPath: "summary.minTlDa",
      maxPath: "summary.maxTlDa",
      updatedAtPath: "updatedAt"
    },
    confidence: "medium-high"
  };
  const orderCount = tradeOrders.filter((item) => {
    if (item.status === "cancelled") return false;
    if (city && cityKey(item.city) !== cityKey(city)) return false;
    if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
    return true;
  }).length;

  return res.json({
    updatedAt: new Date().toISOString(),
    providerCount: providers.length + discovery.length + 2,
    providers: providers.concat([manual, liveListings], discovery)
  });
});

app.get("/api/land-price/providers-health", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const coords = (req.query.coords || "").toString();
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const providers = getLandPriceApiProviders();
  if (!providers.length) {
    return res.json({
      updatedAt: new Date().toISOString(),
      total: 0,
      healthy: 0,
      unhealthy: 0,
      providers: []
    });
  }
  const probed = await Promise.all(
    providers.map((provider) => probeLandProvider(provider, { city, district, neighborhood, crop, lat, lon }))
  );
  const healthy = probed.filter((item) => item.ok).length;
  return res.json({
    updatedAt: new Date().toISOString(),
    total: providers.length,
    healthy,
    unhealthy: providers.length - healthy,
    providers: probed
  });
});

app.get("/api/land-price/listings", (req, res) => {
  const city = (req.query.city || "").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const items = queryLandListings({ city, district, neighborhood, crop })
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const summary = summarizeLandListings(items);
  return res.json({
    updatedAt: new Date().toISOString(),
    count: items.length,
    summary,
    items
  });
});

app.get("/api/land-price/listings/live", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const source = (req.query.source || "").toString();
  const data = await fetchLiveLandListings({ city, district, neighborhood, crop, source });
  const summary = summarizeListingSignals(data?.items || []);
  return res.json({
    updatedAt: new Date().toISOString(),
    city,
    district: district || null,
    neighborhood: neighborhood || null,
    crop: crop || null,
    source: source || null,
    count: (data?.items || []).length,
    summary,
    scannedSources: data?.scannedSources || [],
    items: (data?.items || []).slice(0, 60)
  });
});

app.post("/api/land-price/model/collect-train", async (req, res) => {
  const city = String(req.body?.city || req.query.city || "Malatya").trim();
  const district = String(req.body?.district || req.query.district || "").trim();
  const neighborhood = String(req.body?.neighborhood || req.body?.mahalle || req.query.neighborhood || req.query.mahalle || "").trim();
  const crop = String(req.body?.crop || req.query.crop || "").trim();
  const zone = String(req.body?.zone || req.query.zone || "gecis").trim();
  const irrigation = String(req.body?.irrigation || req.query.irrigation || "var").trim();
  const roadAccess = String(req.body?.roadAccess || req.query.roadAccess || "orta").trim();
  const roadDistanceM = Number(req.body?.roadDistanceM || req.query.roadDistanceM || 0);
  const roadPass = String(req.body?.roadPass || req.query.roadPass || "var").trim();
  const zoningStatus = String(req.body?.zoningStatus || req.query.zoningStatus || "yok").trim();
  const structureStatus = String(req.body?.structureStatus || req.query.structureStatus || "yok").trim();
  const soilScore = Number(req.body?.soilScore || req.query.soilScore || 65);
  const slopePct = Number(req.body?.slopePct || req.query.slopePct || 6);
  const areaDa = Number(req.body?.areaDa || req.query.areaDa || 0);
  const plantedStatus = String(req.body?.plantedStatus || req.query.plantedStatus || "bos").trim();
  const plantedCrop = String(req.body?.plantedCrop || req.query.plantedCrop || "").trim();
  const plantedValueTlDa = Number(req.body?.plantedValueTlDa || req.query.plantedValueTlDa || 0);
  const strictMode = String(req.body?.strictMode ?? req.query.strictMode ?? "1").toLowerCase() !== "0";
  const source = String(req.body?.source || req.query.source || "").trim();
  const keepMax = Number(req.body?.keepMax || req.query.keepMax || LAND_LISTINGS_DEFAULT_MAX);
  const minImported = Math.max(1, Math.min(6000, Number(req.body?.minImported || req.query.minImported || 6)));

  const beforeSet = new Set(landManualListings.map((item) => listingFingerprint(item)));
  const live = await fetchLiveLandListings({ city, district, neighborhood, crop, source }).catch(() => null);
  const mapped = (live?.items || [])
    .filter((item) => isTrustedLiveListing(item))
    .map((item, idx) => ({
      city,
      district,
      neighborhood,
      crop,
      title: `Canli ilan #${idx + 1}`,
      url: item.source || null,
      source: "live-listings-scan",
      priceTlDa: Number(item.priceTlDa || 0),
      areaDa: Number(item.areaDa || 0) || null,
      createdAt: new Date().toISOString()
    }));
  const filtered = filterOutlierListings(mapped);
  const imported = filtered.reduce((acc, item) => {
    const fp = listingFingerprint(item);
    return beforeSet.has(fp) ? acc : acc + 1;
  }, 0);
  landManualListings = mergeLandListings(filtered.concat(landManualListings), { keepMax });
  saveLandListingsToDisk();
  landPriceCache.clear();

  const trainResult = await trainCustomLandModel({
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa,
    strictMode
  });

  if (!trainResult?.ok) {
    const status = imported < minImported ? 422 : 206;
    return res.status(status).json({
      updatedAt: new Date().toISOString(),
      ok: false,
      imported,
      scanned: (live?.items || []).length,
      filtered: filtered.length,
      totalListings: landManualListings.length,
      train: trainResult
    });
  }

  const preview = predictWithCustomLandModel(trainResult.model, {
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa
  });

  return res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    imported,
    scanned: (live?.items || []).length,
    filtered: filtered.length,
    scannedSources: live?.scannedSources || [],
    totalListings: landManualListings.length,
    model: trainResult.model,
    preview
  });
});

app.post("/api/land-price/model/collect-train-large", async (req, res) => {
  const city = String(req.body?.city || req.query.city || "").trim();
  const district = String(req.body?.district || req.query.district || "").trim();
  const crop = String(req.body?.crop || req.query.crop || "").trim();
  const source = String(req.body?.source || req.query.source || "").trim();
  const cityLimit = Math.max(1, Math.min(81, Number(req.body?.cityLimit || req.query.cityLimit || 81)));
  const minTarget = Math.max(2000, Math.min(50000, Number(req.body?.minTarget || req.query.minTarget || LAND_DATASET_MIN_TARGET)));
  const keepMax = Math.max(minTarget, Math.min(LAND_LISTINGS_MAX_LIMIT, Number(req.body?.keepMax || req.query.keepMax || minTarget + 2500)));
  const liveScanScopeLimit = Math.max(5, Math.min(400, Number(req.body?.liveScanScopeLimit || req.query.liveScanScopeLimit || 42)));
  const concurrency = Math.max(1, Math.min(20, Number(req.body?.concurrency || req.query.concurrency || 7)));
  const scanPasses = Math.max(1, Math.min(5, Number(req.body?.scanPasses || req.query.scanPasses || 2)));
  const zone = String(req.body?.zone || req.query.zone || "gecis").trim();
  const irrigation = String(req.body?.irrigation || req.query.irrigation || "var").trim();
  const roadAccess = String(req.body?.roadAccess || req.query.roadAccess || "orta").trim();
  const roadDistanceM = Number(req.body?.roadDistanceM || req.query.roadDistanceM || 0);
  const roadPass = String(req.body?.roadPass || req.query.roadPass || "var").trim();
  const zoningStatus = String(req.body?.zoningStatus || req.query.zoningStatus || "yok").trim();
  const structureStatus = String(req.body?.structureStatus || req.query.structureStatus || "yok").trim();
  const soilScore = Number(req.body?.soilScore || req.query.soilScore || 65);
  const slopePct = Number(req.body?.slopePct || req.query.slopePct || 6);
  const areaDa = Number(req.body?.areaDa || req.query.areaDa || 0);
  const plantedStatus = String(req.body?.plantedStatus || req.query.plantedStatus || "bos").trim();
  const plantedCrop = String(req.body?.plantedCrop || req.query.plantedCrop || "").trim();
  const plantedValueTlDa = Number(req.body?.plantedValueTlDa || req.query.plantedValueTlDa || 0);
  const strictMode = String(req.body?.strictMode ?? req.query.strictMode ?? "1").toLowerCase() !== "0";

  const dataset = await buildLargeLandDataset({
    city,
    district,
    crop,
    source,
    cityLimit,
    liveScanScopeLimit,
    concurrency,
    scanPasses,
    minTarget,
    keepMax
  });
  const trainResult = await trainCustomLandModel({
    city: city || "malatya",
    district,
    neighborhood: "",
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa,
    strictMode
  });
  const preview = trainResult?.ok
    ? predictWithCustomLandModel(trainResult.model, {
        city: city || "malatya",
        district,
        neighborhood: "",
        crop,
        zone,
        irrigation,
        roadAccess,
        roadDistanceM,
        roadPass,
        zoningStatus,
        structureStatus,
        soilScore,
        slopePct,
        areaDa,
        plantedStatus,
        plantedCrop,
        plantedValueTlDa
      })
    : null;
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: Boolean(dataset?.ok && trainResult?.ok),
    dataset,
    train: trainResult,
    preview
  });
});

app.post("/api/land-price/dataset/build-large", async (req, res) => {
  const city = String(req.body?.city || req.query.city || "").trim();
  const district = String(req.body?.district || req.query.district || "").trim();
  const crop = String(req.body?.crop || req.query.crop || "").trim();
  const source = String(req.body?.source || req.query.source || "").trim();
  const cityLimit = Math.max(1, Math.min(81, Number(req.body?.cityLimit || req.query.cityLimit || 81)));
  const minTarget = Math.max(2000, Math.min(50000, Number(req.body?.minTarget || req.query.minTarget || LAND_DATASET_MIN_TARGET)));
  const keepMax = Math.max(minTarget, Math.min(LAND_LISTINGS_MAX_LIMIT, Number(req.body?.keepMax || req.query.keepMax || minTarget + 2500)));
  const liveScanScopeLimit = Math.max(5, Math.min(400, Number(req.body?.liveScanScopeLimit || req.query.liveScanScopeLimit || 42)));
  const concurrency = Math.max(1, Math.min(20, Number(req.body?.concurrency || req.query.concurrency || 7)));
  const scanPasses = Math.max(1, Math.min(5, Number(req.body?.scanPasses || req.query.scanPasses || 2)));
  const dataset = await buildLargeLandDataset({
    city,
    district,
    crop,
    source,
    cityLimit,
    liveScanScopeLimit,
    concurrency,
    scanPasses,
    minTarget,
    keepMax
  });
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    dataset
  });
});

app.get("/api/land-price/model/status", (req, res) => {
  if (!landCustomModel) {
    return res.json({
      updatedAt: new Date().toISOString(),
      available: false,
      model: null
    });
  }
  return res.json({
    updatedAt: new Date().toISOString(),
    available: true,
    model: landCustomModel
  });
});

app.post("/api/land-price/model/train", async (req, res) => {
  const city = String(req.body?.city || req.query.city || "Malatya").trim();
  const district = String(req.body?.district || req.query.district || "").trim();
  const neighborhood = String(req.body?.neighborhood || req.body?.mahalle || req.query.neighborhood || req.query.mahalle || "").trim();
  const crop = String(req.body?.crop || req.query.crop || "").trim();
  const zone = String(req.body?.zone || req.query.zone || "gecis").trim();
  const irrigation = String(req.body?.irrigation || req.query.irrigation || "var").trim();
  const roadAccess = String(req.body?.roadAccess || req.query.roadAccess || "orta").trim();
  const roadDistanceM = Number(req.body?.roadDistanceM || req.query.roadDistanceM || 0);
  const roadPass = String(req.body?.roadPass || req.query.roadPass || "var").trim();
  const zoningStatus = String(req.body?.zoningStatus || req.query.zoningStatus || "yok").trim();
  const structureStatus = String(req.body?.structureStatus || req.query.structureStatus || "yok").trim();
  const soilScore = Number(req.body?.soilScore || req.query.soilScore || 65);
  const slopePct = Number(req.body?.slopePct || req.query.slopePct || 6);
  const areaDa = Number(req.body?.areaDa || req.query.areaDa || 0);
  const plantedStatus = String(req.body?.plantedStatus || req.query.plantedStatus || "bos").trim();
  const plantedCrop = String(req.body?.plantedCrop || req.query.plantedCrop || "").trim();
  const plantedValueTlDa = Number(req.body?.plantedValueTlDa || req.query.plantedValueTlDa || 0);
  const strictMode = String(req.body?.strictMode ?? req.query.strictMode ?? "1").toLowerCase() !== "0";
  const result = await trainCustomLandModel({
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa,
    strictMode
  });
  if (!result?.ok) {
    return res.status(422).json({
      updatedAt: new Date().toISOString(),
      ok: false,
      ...result
    });
  }
  const pred = predictWithCustomLandModel(result.model, {
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa
  });
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    model: result.model,
    preview: pred
  });
});

app.post("/api/land-price/model/boost-data-train", async (req, res) => {
  const city = String(req.body?.city || req.query.city || "").trim();
  const district = String(req.body?.district || req.query.district || "").trim();
  const crop = String(req.body?.crop || req.query.crop || "").trim();
  const nationwide = String(req.body?.nationwide ?? req.query.nationwide ?? "1").toLowerCase() !== "0";
  const datasetCity = String(req.body?.datasetCity || req.query.datasetCity || (nationwide ? "" : city)).trim();
  const datasetDistrict = String(req.body?.datasetDistrict || req.query.datasetDistrict || (nationwide ? "" : district)).trim();
  const datasetCrop = String(req.body?.datasetCrop || req.query.datasetCrop || "").trim();
  const source = String(req.body?.source || req.query.source || "").trim();
  const cityLimit = Math.max(1, Math.min(81, Number(req.body?.cityLimit || req.query.cityLimit || 45)));
  const minTarget = Math.max(6000, Math.min(60000, Number(req.body?.minTarget || req.query.minTarget || 22000)));
  const keepMax = Math.max(minTarget, Math.min(LAND_LISTINGS_MAX_LIMIT, Number(req.body?.keepMax || req.query.keepMax || minTarget + 3000)));
  const liveScanScopeLimit = Math.max(15, Math.min(500, Number(req.body?.liveScanScopeLimit || req.query.liveScanScopeLimit || 120)));
  const concurrency = Math.max(1, Math.min(20, Number(req.body?.concurrency || req.query.concurrency || 10)));
  const scanPasses = Math.max(1, Math.min(5, Number(req.body?.scanPasses || req.query.scanPasses || 3)));
  const zone = String(req.body?.zone || req.query.zone || "gecis").trim();
  const irrigation = String(req.body?.irrigation || req.query.irrigation || "var").trim();
  const roadAccess = String(req.body?.roadAccess || req.query.roadAccess || "orta").trim();
  const roadDistanceM = Number(req.body?.roadDistanceM || req.query.roadDistanceM || 0);
  const roadPass = String(req.body?.roadPass || req.query.roadPass || "var").trim();
  const zoningStatus = String(req.body?.zoningStatus || req.query.zoningStatus || "yok").trim();
  const structureStatus = String(req.body?.structureStatus || req.query.structureStatus || "yok").trim();
  const soilScore = Number(req.body?.soilScore || req.query.soilScore || 65);
  const slopePct = Number(req.body?.slopePct || req.query.slopePct || 6);
  const areaDa = Number(req.body?.areaDa || req.query.areaDa || 0);
  const plantedStatus = String(req.body?.plantedStatus || req.query.plantedStatus || "bos").trim();
  const plantedCrop = String(req.body?.plantedCrop || req.query.plantedCrop || "").trim();
  const plantedValueTlDa = Number(req.body?.plantedValueTlDa || req.query.plantedValueTlDa || 0);
  const strictMode = String(req.body?.strictMode ?? req.query.strictMode ?? "1").toLowerCase() !== "0";

  const dataset = await buildLargeLandDataset({
    city: datasetCity,
    district: datasetDistrict,
    crop: datasetCrop,
    source,
    cityLimit,
    liveScanScopeLimit,
    concurrency,
    scanPasses,
    minTarget,
    keepMax
  });
  const train = await trainCustomLandModel({
    city: city || "Malatya",
    district,
    neighborhood: "",
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa,
    strictMode
  });
  const preview = train?.ok
    ? predictWithCustomLandModel(train.model, {
        city: city || "Malatya",
        district,
        neighborhood: "",
        crop,
        zone,
        irrigation,
        roadAccess,
        roadDistanceM,
        roadPass,
        zoningStatus,
        structureStatus,
        soilScore,
        slopePct,
        areaDa,
        plantedStatus,
        plantedCrop,
        plantedValueTlDa
      })
    : null;
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: Boolean(dataset?.ok && train?.ok),
    datasetScope: {
      nationwide,
      city: datasetCity || null,
      district: datasetDistrict || null,
      crop: datasetCrop || null
    },
    dataset,
    train,
    preview
  });
});

app.get("/api/land-price/model/predict", (req, res) => {
  if (!landCustomModel) return res.status(404).json({ error: "model_not_trained" });
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const zone = (req.query.zone || "gecis").toString();
  const irrigation = (req.query.irrigation || "var").toString();
  const roadAccess = (req.query.roadAccess || "orta").toString();
  const roadDistanceM = Number(req.query.roadDistanceM || 0);
  const roadPass = (req.query.roadPass || "var").toString();
  const zoningStatus = (req.query.zoningStatus || "yok").toString();
  const structureStatus = (req.query.structureStatus || "yok").toString();
  const soilScore = Number(req.query.soilScore || 65);
  const slopePct = Number(req.query.slopePct || 6);
  const areaDa = Math.max(0, Number(req.query.areaDa || 0));
  const plantedStatus = (req.query.plantedStatus || "bos").toString();
  const plantedCrop = (req.query.plantedCrop || "").toString();
  const plantedValueTlDa = Number(req.query.plantedValueTlDa || 0);
  const pred = predictWithCustomLandModel(landCustomModel, {
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa
  });
  if (!pred) return res.status(422).json({ error: "predict_failed" });
  return res.json({
    updatedAt: new Date().toISOString(),
    city,
    district: district || null,
    neighborhood: neighborhood || null,
    crop: crop || null,
    areaDa,
    unitPriceTlDa: pred.priceTlDa,
    totalPriceTl: areaDa > 0 ? Math.round(pred.priceTlDa * areaDa) : null,
    minTlDa: pred.minTlDa,
    maxTlDa: pred.maxTlDa,
    confidence: pred.confidence,
    confidenceScore: pred.confidenceScore,
    modelVersion: pred.modelVersion,
    trainedAt: pred.trainedAt
  });
});

app.post("/api/land-price/seed-demo", (req, res) => {
  const city = String(req.body?.city || "Malatya").trim() || "Malatya";
  const crop = String(req.body?.crop || "domates").trim() || "domates";
  const now = Date.now();
  const samples = [
    { district: "Yesilyurt", priceTlDa: 172000, areaDa: 18, coords: "38.2962,38.2456" },
    { district: "Yesilyurt", priceTlDa: 186000, areaDa: 24, coords: "38.3072,38.2744" },
    { district: "Battalgazi", priceTlDa: 168000, areaDa: 21, coords: "38.4210,38.3634" },
    { district: "Battalgazi", priceTlDa: 179500, areaDa: 14, coords: "38.3982,38.3399" },
    { district: "Akcadag", priceTlDa: 151000, areaDa: 28, coords: "38.3399,37.9702" },
    { district: "Darende", priceTlDa: 142500, areaDa: 32, coords: "38.5487,37.5054" }
  ].map((item, idx) =>
    normalizeListingRecord({
      city,
      district: item.district,
      crop,
      priceTlDa: item.priceTlDa,
      areaDa: item.areaDa,
      coords: item.coords,
      source: "seed-demo",
      title: `${item.district} ${crop} demo #${idx + 1}`,
      createdAt: new Date(now - idx * 86400000).toISOString()
    })
  );
  const merged = mergeLandListings(samples.concat(landManualListings), { keepMax: LAND_LISTINGS_DEFAULT_MAX });
  landManualListings = merged;
  saveLandListingsToDisk();
  landPriceCache.clear();
  return res.status(201).json({
    updatedAt: new Date().toISOString(),
    ok: true,
    inserted: samples.length,
    total: landManualListings.length
  });
});

app.post("/api/land-price/reset-demo", (req, res) => {
  const before = landManualListings.length;
  landManualListings = landManualListings.filter((item) => String(item.source || "") !== "seed-demo");
  const removed = Math.max(0, before - landManualListings.length);
  saveLandListingsToDisk();
  landPriceCache.clear();
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    removed,
    total: landManualListings.length
  });
});

app.post("/api/land-price/listings", (req, res) => {
  const record = normalizeListingRecord(req.body || {});
  if (!record.city || record.priceTlDa <= 0) {
    return res.status(400).json({ error: "city_and_priceTlDa_required" });
  }
  landManualListings.unshift(record);
  if (landManualListings.length > LAND_LISTINGS_DEFAULT_MAX) {
    landManualListings = landManualListings.slice(0, LAND_LISTINGS_DEFAULT_MAX);
  }
  saveLandListingsToDisk();
  landPriceCache.clear();
  return res.status(201).json({ ok: true, item: record });
});

app.post("/api/land-price/listings/import", (req, res) => {
  const csv = (req.body?.csv || "").toString();
  if (!csv.trim()) return res.status(400).json({ error: "csv_required" });
  const records = parseLandListingsCsv(csv);
  if (!records.length) return res.status(400).json({ error: "no_valid_rows" });
  landManualListings = records.concat(landManualListings).slice(0, LAND_LISTINGS_DEFAULT_MAX);
  saveLandListingsToDisk();
  landPriceCache.clear();
  return res.json({ ok: true, imported: records.length, total: landManualListings.length });
});

app.delete("/api/land-price/listings/:id", (req, res) => {
  const id = (req.params.id || "").toString();
  const before = landManualListings.length;
  landManualListings = landManualListings.filter((item) => item.id !== id);
  if (landManualListings.length === before) {
    return res.status(404).json({ error: "not_found" });
  }
  saveLandListingsToDisk();
  landPriceCache.clear();
  return res.json({ ok: true });
});

app.get("/api/land-price/ml", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const coords = (req.query.coords || "").toString();
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const zone = (req.query.zone || "gecis").toString();
  const irrigation = (req.query.irrigation || "var").toString();
  const roadAccess = (req.query.roadAccess || "orta").toString();
  const roadDistanceM = Number(req.query.roadDistanceM || 0);
  const roadPass = (req.query.roadPass || "var").toString();
  const zoningStatus = (req.query.zoningStatus || "yok").toString();
  const structureStatus = (req.query.structureStatus || "yok").toString();
  const soilScore = Number(req.query.soilScore || 65);
  const slopePct = Number(req.query.slopePct || 6);
  const areaDa = Math.max(0, Number(req.query.areaDa || 0));
  const plantedStatus = (req.query.plantedStatus || "bos").toString();
  const plantedCrop = (req.query.plantedCrop || "").toString();
  const plantedValueTlDa = Number(req.query.plantedValueTlDa || 0);
  const useCustom = String(req.query.useCustom || "1").toLowerCase() !== "0";
  const pred = await buildLandMlPrediction({
    city,
    district,
    neighborhood,
    crop,
    lat,
    lon,
    zone,
    irrigation,
    roadAccess,
    roadDistanceM,
    roadPass,
    zoningStatus,
    structureStatus,
    soilScore,
    slopePct,
    areaDa,
    plantedStatus,
    plantedCrop,
    plantedValueTlDa
  });
  if (!pred?.ml) {
    return res.status(503).json({ error: "ml_prediction_unavailable" });
  }
  const customPred = useCustom
    ? predictWithCustomLandModel(landCustomModel, {
        city,
        district,
        neighborhood,
        crop,
        zone,
        irrigation,
        roadAccess,
        roadDistanceM,
        roadPass,
        zoningStatus,
        structureStatus,
        soilScore,
        slopePct,
        areaDa,
        plantedStatus,
        plantedCrop,
        plantedValueTlDa
      })
    : null;
  const mlScore = Number(pred?.ml?.confidenceScore || 0) - Math.max(0, 0.08 - Number(pred?.training?.r2 || 0) * 0.08);
  const customRmse = Number(landCustomModel?.metrics?.rmse || 0);
  const customRelErr =
    customPred && Number(customPred.priceTlDa || 0) > 0 ? customRmse / Number(customPred.priceTlDa || 1) : 0.22;
  const customScore = customPred
    ? Number(customPred.confidenceScore || 0) - Math.min(0.16, Math.max(0, customRelErr - 0.08) * 0.45)
    : -1;
  const blendedPred = blendLandMlPredictions({
    baselineMl: pred.ml,
    customPred,
    training: pred.training,
    manualSummary: pred?.sources?.manual || null,
    comparableSummary: pred?.sources?.comparable || null,
    geoKnnSummary: pred?.sources?.geoKnn || null
  });
  const blendScore =
    blendedPred
      ? Number(blendedPred.confidenceScore || 0) + 0.02 - Math.max(0, Number(blendedPred?.blend?.disagreementPct || 0) - 12) * 0.002
      : -1;
  const preferred =
    blendedPred && blendScore >= Math.max(mlScore, customScore)
      ? blendedPred
      : customPred && customScore >= mlScore
        ? customPred
        : pred.ml;
  const modelSelection = {
    selected: preferred?.source || "ml-linear-regression",
    mlScore: Number(mlScore.toFixed(3)),
    customScore: customPred ? Number(customScore.toFixed(3)) : null,
    blendScore: blendedPred ? Number(blendScore.toFixed(3)) : null,
    reason:
      blendedPred && blendScore >= Math.max(mlScore, customScore)
        ? "hibrit ML secildi (ml + custom agirlikli birlestirildi)"
        : customPred && customScore >= mlScore
        ? "custom model secildi (sinyal guveni daha yuksek)"
        : customPred
          ? "ml baseline secildi (custom model belirsizligi daha yuksek)"
          : "ml baseline secildi (custom model mevcut degil)"
  };
  const confScore = Number(preferred.confidenceScore || 0);
  const uncertaintyPct = Math.max(8, Math.min(28, Math.round((1 - confScore) * 34)));
  const trendPct = Number(pred?.ml?.trendSignal?.momentumPct || pred?.sources?.trendSignal?.momentumPct || 0);
  const scenarios = buildLandPriceScenarios({
    priceTlDa: preferred.priceTlDa,
    uncertaintyPct,
    areaDa
  }).map((item) => ({
    ...item,
    note:
      item.id === "bear"
        ? "Piyasa zayif / likidite dusuk varsayimi"
        : item.id === "base"
          ? "Mevcut sinyallerin agirlikli sonucu"
          : "Olumlu trend / yuksek talep varsayimi"
  }));
  return res.json({
    updatedAt: new Date().toISOString(),
    city,
    district: district || null,
    neighborhood: neighborhood || null,
    crop: crop || null,
    region: pred.ml.region,
    areaDa,
    unitPriceTlDa: preferred.priceTlDa,
    totalPriceTl: areaDa > 0 ? Math.round(preferred.priceTlDa * areaDa) : null,
    minTlDa: preferred.minTlDa,
    maxTlDa: preferred.maxTlDa,
    confidence: preferred.confidence,
    confidenceScore: preferred.confidenceScore,
    uncertaintyPct,
    trendPct,
    factors: pred.ml.factors,
    mlBaseline: pred.ml,
    customModelPrediction: customPred,
    blendedModelPrediction: blendedPred,
    preferredModel: preferred?.source || "ml-linear-regression",
    modelSelection,
    scenarios,
    training: pred.training,
    sources: pred.sources
  });
});

app.get("/api/land-price", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const coords = (req.query.coords || "").toString();
  const zone = (req.query.zone || "gecis").toString();
  const irrigation = (req.query.irrigation || "var").toString();
  const roadAccess = (req.query.roadAccess || "orta").toString();
  const soilScore = Number(req.query.soilScore || 65);
  const slopePct = Number(req.query.slopePct || 6);
  const areaDa = Math.max(0, Number(req.query.areaDa || 0));
  const blendConfig = normalizeLandBlendConfig({
    outlierPivot: req.query.blendPivot ?? req.query.pivot,
    minReliability: req.query.blendMinReliability ?? req.query.minReliability
  });
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const cacheKey = buildLandCacheKey({
    city,
    district,
    neighborhood,
    crop,
    coords,
    zone,
    irrigation,
    roadAccess,
    soilScore,
    slopePct,
    blendConfig
  });
  const cached = landPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LAND_PRICE_CACHE_TTL_MS) {
    return res.json({ ...cached.value, cache: "hit" });
  }

  const [remote, internet, estimate] = await Promise.all([
    fetchLandPriceFromApis({ city, district, neighborhood, crop, lat, lon }),
    fetchLandPriceFromInternet({ city, district, neighborhood, crop }),
    estimateLandPrice({ city, district, neighborhood, crop })
  ]);
  const manualSummary = buildManualLandSignal({ city, district, neighborhood, crop });
  const comparable = buildComparableLandSignal({ city, district, neighborhood, crop });
  const geoKnn = buildGeoKnnLandSignal({ city, district, neighborhood, crop, lat, lon });
  const trendSignal = buildLandTrendSignal({ city, district, neighborhood, crop });
  const trendAdjustedEstimate = applyTrendToEstimate(estimate, trendSignal);
  const candidates = buildLandEnsembleCandidates({
    remote,
    manual: manualSummary,
    comparable,
    geoKnn,
    internet,
    trendModel: trendAdjustedEstimate,
    trendSignal
  });
  const blended = blendLandPriceSignals(candidates, blendConfig);
  let payload = null;
  if (blended?.priceTlDa) {
    payload = {
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      crop: crop || null,
      coords: lat && lon ? `${lat}, ${lon}` : null,
      source: blended.source,
      sourceTitle: blended.sourceTitle,
      sourceUrl: remote?.url || internet?.sourceUrl || null,
      priceTlDa: blended.priceTlDa,
      minTlDa: blended.minTlDa,
      maxTlDa: blended.maxTlDa,
      confidence: blended.confidence,
      confidenceScore: blended.confidenceScore,
      method: "hybrid-ensemble",
      components: blended.components,
      componentCount: blended.componentCount,
      providerCount: remote?.providerCount || 0,
      providerResults: remote?.providerResults || null,
      listingCount: manualSummary?.listingCount || 0,
      comparableCount: comparable?.listingCount || 0,
      geoNeighborCount: geoKnn?.listingCount || 0,
      geoAvgDistanceKm: geoKnn?.avgDistanceKm || null,
      signalCount: internet?.signalCount || 0,
      factors: trendAdjustedEstimate?.factors || estimate?.factors || null,
      trendSignal: trendSignal || null,
      blendConfig: blended.blendConfig || blendConfig,
      updatedAt: new Date().toISOString()
    };
  } else {
    payload = {
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      crop: crop || null,
      coords: lat && lon ? `${lat}, ${lon}` : null,
      source: trendAdjustedEstimate?.source || estimate?.source || "fallback-model",
      sourceUrl: null,
      priceTlDa: trendAdjustedEstimate?.priceTlDa || estimate?.priceTlDa || 160000,
      minTlDa: trendAdjustedEstimate?.minTlDa || estimate?.minTlDa || 145000,
      maxTlDa: trendAdjustedEstimate?.maxTlDa || estimate?.maxTlDa || 178000,
      confidence: trendAdjustedEstimate?.confidence || estimate?.confidence || "low-medium",
      confidenceScore: Number(
        ((trendAdjustedEstimate?.confidenceScore ??
          estimate?.confidenceScore ??
          confidenceLabelToScore(estimate?.confidence || "low-medium")) || 0.45).toFixed(3)
      ),
      method: "fallback-model",
      factors: trendAdjustedEstimate?.factors || estimate?.factors || null,
      trendSignal: trendSignal || null,
      blendConfig,
      updatedAt: new Date().toISOString()
    };
  }

  payload = applyLandInputAdjustment(payload, {
    city,
    district,
    neighborhood,
    crop,
    zone,
    irrigation,
    roadAccess,
    soilScore,
    slopePct
  });
  payload.contextInsights = buildLandContextInsights({
    city,
    district,
    neighborhood,
    crop,
    priceTlDa: payload?.priceTlDa
  });
  payload = stabilizeLandPriceWithLocalContext(payload, payload.contextInsights);
  payload.contextInsights = buildLandContextInsights({
    city,
    district,
    neighborhood,
    crop,
    priceTlDa: payload?.priceTlDa
  });

  const uncertaintyPct = calcLandUncertaintyPct({
    confidenceScore: payload?.confidenceScore,
    minTlDa: payload?.minTlDa,
    maxTlDa: payload?.maxTlDa,
    priceTlDa: payload?.priceTlDa,
    components: payload?.components
  });
  payload.uncertaintyPct = uncertaintyPct;
  payload.scenarios = buildLandPriceScenarios({
    priceTlDa: payload?.priceTlDa,
    uncertaintyPct,
    areaDa
  });
  payload.decisionSignals = buildLandDecisionSignals(payload);

  landPriceCache.set(cacheKey, { ts: Date.now(), value: payload });
  pushLandPriceHistory(cacheKey, payload);
  return res.json(payload);
});

app.get("/api/land-price/history", (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const coords = (req.query.coords || "").toString();
  const zone = (req.query.zone || "gecis").toString();
  const irrigation = (req.query.irrigation || "var").toString();
  const roadAccess = (req.query.roadAccess || "orta").toString();
  const soilScore = Number(req.query.soilScore || 65);
  const slopePct = Number(req.query.slopePct || 6);
  const blendConfig = normalizeLandBlendConfig({
    outlierPivot: req.query.blendPivot ?? req.query.pivot,
    minReliability: req.query.blendMinReliability ?? req.query.minReliability
  });
  const cacheKey = buildLandCacheKey({
    city,
    district,
    neighborhood,
    crop,
    coords,
    zone,
    irrigation,
    roadAccess,
    soilScore,
    slopePct,
    blendConfig
  });
  const fallbackCacheKey = buildLandCacheKey({
    city,
    district,
    neighborhood,
    crop,
    coords,
    zone: "gecis",
    irrigation: "var",
    roadAccess: "orta",
    soilScore: 65,
    slopePct: 6,
    blendConfig
  });
  const items = (landPriceHistory.get(cacheKey) || landPriceHistory.get(fallbackCacheKey) || []).slice(
    0,
    LAND_PRICE_HISTORY_LIMIT
  );
  return res.json({
    updatedAt: new Date().toISOString(),
    blendConfig,
    count: items.length,
    items
  });
});

app.get("/api/land-price/compare", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const crop = (req.query.crop || "").toString();
  const coords = (req.query.coords || "").toString();
  const zone = (req.query.zone || "gecis").toString();
  const irrigation = (req.query.irrigation || "var").toString();
  const roadAccess = (req.query.roadAccess || "orta").toString();
  const soilScore = Number(req.query.soilScore || 65);
  const slopePct = Number(req.query.slopePct || 6);
  const blendConfig = normalizeLandBlendConfig({
    outlierPivot: req.query.blendPivot ?? req.query.pivot,
    minReliability: req.query.blendMinReliability ?? req.query.minReliability
  });
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const remote = await fetchLandPriceFromApis({ city, district, neighborhood, crop, lat, lon });
  const manual = buildManualLandSignal({ city, district, neighborhood, crop });
  const comparable = buildComparableLandSignal({ city, district, neighborhood, crop });
  const geoKnn = buildGeoKnnLandSignal({ city, district, neighborhood, crop, lat, lon });
  const internet = await fetchLandPriceFromInternet({ city, district, neighborhood, crop });
  const model = await estimateLandPrice({ city, district, neighborhood, crop });
  const trendSignal = buildLandTrendSignal({ city, district, neighborhood, crop });
  const trendModel = applyTrendToEstimate(model, trendSignal);
  const compareCandidates = buildLandEnsembleCandidates({
    remote,
    manual,
    comparable,
    geoKnn,
    internet,
    trendModel: trendModel || model,
    trendSignal
  });
  const ensemble = blendLandPriceSignals(compareCandidates, blendConfig);
  const adjustedEnsemble = ensemble
    ? applyLandInputAdjustment(ensemble, {
        city,
        district,
        neighborhood,
        crop,
        zone,
        irrigation,
        roadAccess,
        soilScore,
        slopePct
      })
    : null;
  const adjustedContext = adjustedEnsemble
    ? buildLandContextInsights({
        city,
        district,
        neighborhood,
        crop,
        priceTlDa: adjustedEnsemble.priceTlDa
      })
    : null;
  const stabilizedAdjustedEnsemble = adjustedEnsemble
    ? stabilizeLandPriceWithLocalContext(adjustedEnsemble, adjustedContext)
    : null;
  const ensembleUncertaintyPct = ensemble
    ? calcLandUncertaintyPct({
        confidenceScore: ensemble.confidenceScore,
        minTlDa: ensemble.minTlDa,
        maxTlDa: ensemble.maxTlDa,
        priceTlDa: ensemble.priceTlDa,
        components: ensemble.components
      })
    : null;
  const adjustedUncertaintyPct = (stabilizedAdjustedEnsemble || adjustedEnsemble)
    ? calcLandUncertaintyPct({
        confidenceScore: (stabilizedAdjustedEnsemble || adjustedEnsemble).confidenceScore,
        minTlDa: (stabilizedAdjustedEnsemble || adjustedEnsemble).minTlDa,
        maxTlDa: (stabilizedAdjustedEnsemble || adjustedEnsemble).maxTlDa,
        priceTlDa: (stabilizedAdjustedEnsemble || adjustedEnsemble).priceTlDa,
        components: (stabilizedAdjustedEnsemble || adjustedEnsemble).components
      })
    : null;
  return res.json({
    city,
    district: district || null,
    crop: crop || null,
    coords: lat && lon ? `${lat}, ${lon}` : null,
    remote: remote || null,
    manual: manual || null,
    comparable: comparable || null,
    geoKnn: geoKnn || null,
    internet: internet || null,
    model: model || null,
    trendModel: trendModel || null,
    trendSignal: trendSignal || null,
    blendConfig,
    ensemble: ensemble || null,
    adjustedEnsemble: stabilizedAdjustedEnsemble || adjustedEnsemble || null,
    ensembleUncertaintyPct,
    adjustedUncertaintyPct,
    updatedAt: new Date().toISOString()
  });
});

app.get("/api/trade/listings", (req, res) => {
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  const q = (req.query.q || "").toString().trim();
  const type = (req.query.type || "").toString().toLowerCase();
  const status = (req.query.status || "open").toString().toLowerCase();
  const statusFilter = status === "all" ? "" : status;
  const deliveryType = (req.query.deliveryType || "").toString().toLowerCase();
  const paymentType = (req.query.paymentType || "").toString().toLowerCase();
  const qualityGrade = (req.query.qualityGrade || "").toString().toLowerCase();
  const minPrice = Number(req.query.minPrice || req.query.min || 0);
  const maxPrice = Number(req.query.maxPrice || req.query.max || 0);
  const sortBy = (req.query.sort || "newest").toString().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const limit = Math.max(1, Math.min(300, Number(req.query.limit || 120) || 120));
  const qKey = cityKey(q);
  const items = tradeListings
    .filter((item) => {
      if (city && cityKey(item.city) !== cityKey(city)) return false;
      if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
      if (type && item.type !== type) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (deliveryType && item.deliveryType !== deliveryType) return false;
      if (paymentType && item.paymentType !== paymentType) return false;
      if (qualityGrade && item.qualityGrade !== qualityGrade) return false;
      const price = Number(item.priceTlKg || 0);
      if (Number.isFinite(minPrice) && minPrice > 0 && price < minPrice) return false;
      if (Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) return false;
      if (qKey) {
        const hay = cityKey(
          `${item.title || ""} ${item.crop || ""} ${item.city || ""} ${item.district || ""} ${item.contact || ""} ${
            item.owner || ""
          } ${item.deliveryType || ""} ${item.paymentType || ""}`
        );
        if (!hay.includes(qKey)) return false;
      }
      return true;
    })
    .map((item) => normalizeListingForApi(item))
    .sort((a, b) => {
      if (sortBy === "price_asc") return Number(a.priceTlKg || 0) - Number(b.priceTlKg || 0);
      if (sortBy === "price_desc") return Number(b.priceTlKg || 0) - Number(a.priceTlKg || 0);
      if (sortBy === "qty_desc") return Number(b.quantityKg || 0) - Number(a.quantityKg || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);
  return res.json({
    updatedAt: new Date().toISOString(),
    count: items.length,
    page,
    limit,
    hasNext: start + limit < items.length,
    items: paged
  });
});

app.post("/api/trade/listings", (req, res) => {
  const incoming = req.body || {};
  const listing = normalizeTradeListing({
    ...incoming,
    city: incoming.city || "Malatya",
    crop: incoming.crop || "domates",
    contact: incoming.contact || incoming.owner || "Demo Uretici",
    owner: incoming.owner || incoming.contact || "Demo Uretici",
    title:
      incoming.title ||
      `${incoming.city || "Malatya"} ${incoming.crop || "domates"} ${String(incoming.type || "sell").toLowerCase() === "buy" ? "alim" : "satilik"}`
  });
  if (!listing.city || !listing.crop || listing.quantityKg <= 0 || listing.priceTlKg <= 0) {
    return res.status(400).json({ error: "city_crop_quantity_price_required" });
  }
  if (!listing.owner && listing.contact) {
    listing.owner = listing.contact;
  }
  if (!listing.owner && !listing.contact) listing.owner = "Demo Uretici";
  listing.soldKg = 0;
  listing.reservedKg = 0;
  listing.availableKg = Number(listing.quantityKg.toFixed(2));
  tradeListings.unshift(listing);
  if (tradeListings.length > 4000) tradeListings = tradeListings.slice(0, 4000);
  saveTradeMarketToDisk();
  return res.status(201).json({ ok: true, item: normalizeListingForApi(listing) });
});

app.get("/api/trade/listings/:id", (req, res) => {
  const id = (req.params.id || "").toString();
  const item = tradeListings.find((row) => row.id === id);
  if (!item) return res.status(404).json({ error: "not_found" });
  const relatedOffers = tradeOffers.filter((offer) => offer.listingId === id);
  return res.json({
    updatedAt: new Date().toISOString(),
    item: normalizeListingForApi(item),
    offerStats: {
      total: relatedOffers.length,
      pending: relatedOffers.filter((x) => ["pending", "countered"].includes(String(x.status || "").toLowerCase())).length,
      accepted: relatedOffers.filter((x) => String(x.status || "").toLowerCase() === "accepted").length,
      rejected: relatedOffers.filter((x) => String(x.status || "").toLowerCase() === "rejected").length
    }
  });
});

app.get("/api/trade/listings/:id/workspace", (req, res) => {
  sweepExpiredTradeOffers();
  const id = (req.params.id || "").toString();
  const withMatch = String(req.query.withMatch || "1").toLowerCase() !== "0";
  const messageLimit = Math.min(Math.max(Number(req.query.messageLimit || 200), 1), 500);
  const orderLimit = Math.min(Math.max(Number(req.query.orderLimit || 120), 1), 400);
  const alertLimit = Math.min(Math.max(Number(req.query.alertLimit || 30), 1), 120);
  const listing = tradeListings.find((row) => row.id === id);
  if (!listing) return res.status(404).json({ error: "not_found" });
  const offers = tradeOffers
    .filter((item) => item.listingId === id)
    .map((item) => {
      if (!withMatch) return item;
      return { ...item, match: calcTradeMatchScore(listing, item) };
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  const messages = tradeMessages
    .filter((item) => item.listingId === id)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    .slice(-messageLimit);
  const orders = tradeOrders
    .filter((item) => String(item.listingId || "") === id)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, orderLimit);
  const orderIdSet = new Set(orders.map((item) => String(item.id || "")));
  const alerts = tradeAlerts
    .filter((item) => item.orderId && orderIdSet.has(String(item.orderId)))
    .slice(0, alertLimit);
  const marketInsights = buildTradeListingInsights(listing, offers, orders);
  return res.json({
    updatedAt: new Date().toISOString(),
    listing: normalizeListingForApi(listing),
    marketInsights,
    offerStats: {
      total: offers.length,
      pending: offers.filter((x) => ["pending", "countered"].includes(String(x.status || "").toLowerCase())).length,
      accepted: offers.filter((x) => String(x.status || "").toLowerCase() === "accepted").length,
      rejected: offers.filter((x) => String(x.status || "").toLowerCase() === "rejected").length
    },
    offers: {
      count: offers.length,
      items: offers
    },
    messages: {
      count: messages.length,
      items: messages
    },
    orderStats: {
      total: orders.length,
      active: orders.filter((x) => ["accepted", "in_transit", "delivered"].includes(String(x.status || "").toLowerCase())).length,
      completed: orders.filter((x) => String(x.status || "").toLowerCase() === "completed").length
    },
    orders: {
      count: orders.length,
      items: orders
    },
    alerts: {
      count: alerts.length,
      items: alerts
    }
  });
});

app.patch("/api/trade/listings/:id", (req, res) => {
  const id = (req.params.id || "").toString();
  const idx = tradeListings.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const current = tradeListings[idx];
  const body = req.body || {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
  const hasQty = Object.prototype.hasOwnProperty.call(body, "quantityKg");
  const hasPrice = Object.prototype.hasOwnProperty.call(body, "priceTlKg");

  if (hasStatus) {
    const statusRaw = String(body.status || "").toLowerCase();
    if (!["open", "closed", "paused"].includes(statusRaw)) {
      return res.status(400).json({ error: "invalid_status" });
    }
  }
  if (hasQty) {
    const qty = Number(body.quantityKg);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: "invalid_quantity" });
    }
  }
  if (hasPrice) {
    const price = Number(body.priceTlKg);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: "invalid_price" });
    }
  }

  const merged = normalizeTradeListing({
    ...current,
    ...body,
    id: current.id,
    createdAt: current.createdAt,
    soldKg: current.soldKg,
    reservedKg: current.reservedKg,
    owner: current.owner || body.owner || null
  });

  if (merged.quantityKg < Number(current.soldKg || 0) + Number(current.reservedKg || 0)) {
    return res.status(409).json({ error: "quantity_below_committed" });
  }
  merged.availableKg = Number(Math.max(0, merged.quantityKg - merged.soldKg - merged.reservedKg).toFixed(2));
  tradeListings[idx] = merged;
  saveTradeMarketToDisk();
  return res.json({ ok: true, item: normalizeListingForApi(tradeListings[idx]) });
});

app.delete("/api/trade/listings/:id", (req, res) => {
  sweepExpiredTradeOffers();
  const id = (req.params.id || "").toString();
  const idx = tradeListings.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const blockingOffers = tradeOffers.filter(
    (offer) =>
      offer.listingId === id &&
      ["pending", "countered", "accepted"].includes(String(offer.status || "").toLowerCase())
  );
  if (blockingOffers.length) {
    return res.status(409).json({ error: "listing_has_active_offers", activeOfferCount: blockingOffers.length });
  }
  tradeListings.splice(idx, 1);
  tradeOffers = tradeOffers.filter((offer) => offer.listingId !== id);
  saveTradeMarketToDisk();
  return res.json({ ok: true, id });
});

app.get("/api/trade/offers", (req, res) => {
  sweepExpiredTradeOffers();
  const listingId = (req.query.listingId || "").toString();
  const status = (req.query.status || "").toString().toLowerCase();
  const withMatch = String(req.query.withMatch || "").toLowerCase() === "1";
  const items = tradeOffers
    .filter((item) => {
      if (listingId && item.listingId !== listingId) return false;
      if (status && item.status !== status) return false;
      return true;
    })
    .map((item) => {
      if (!withMatch) return item;
      const listing = tradeListings.find((x) => x.id === item.listingId);
      if (!listing) return { ...item, match: null };
      return { ...item, match: calcTradeMatchScore(listing, item) };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return res.json({ updatedAt: new Date().toISOString(), count: items.length, items });
});

app.post("/api/trade/offers", (req, res) => {
  sweepExpiredTradeOffers();
  const incoming = req.body || {};
  const offer = normalizeTradeOffer({
    ...incoming,
    buyer: incoming.buyer || "Demo Alici"
  });
  if (!offer.listingId || offer.quantityKg <= 0 || offer.offerPriceTlKg <= 0 || !offer.buyer) {
    return res.status(400).json({ error: "listing_quantity_price_required" });
  }
  const listing = tradeListings.find((item) => item.id === offer.listingId);
  if (!listing) return res.status(404).json({ error: "listing_not_found" });
  if (listing.status !== "open") return res.status(409).json({ error: "listing_not_open" });
  const availableKg = getListingAvailableKg(listing);
  if (offer.quantityKg > availableKg) {
    return res.status(409).json({ error: "insufficient_available_quantity", availableKg: Number(availableKg.toFixed(2)) });
  }
  if (listing.owner && tradeActorKey(listing.owner) === tradeActorKey(offer.buyer)) {
    return res.status(400).json({ error: "self_offer_not_allowed" });
  }
  const match = calcTradeMatchScore(listing, offer);
  tradeOffers.unshift(offer);
  if (tradeOffers.length > 10000) tradeOffers = tradeOffers.slice(0, 10000);
  saveTradeMarketToDisk();
  return res.status(201).json({ ok: true, item: offer, match });
});

app.get("/api/trade/dashboard", (req, res) => {
  sweepExpiredTradeOffers();
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  return res.json({
    updatedAt: new Date().toISOString(),
    ...buildTradeDashboardData({ city, crop })
  });
});

app.patch("/api/trade/offers/:id", (req, res) => {
  sweepExpiredTradeOffers();
  const id = (req.params.id || "").toString();
  const idx = tradeOffers.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const offer = tradeOffers[idx];
  const body = req.body || {};
  const statusRaw = Object.prototype.hasOwnProperty.call(body, "status")
    ? String(body.status || "").toLowerCase()
    : "";
  if (statusRaw && !["pending", "countered", "accepted", "rejected", "cancelled", "expired"].includes(statusRaw)) {
    return res.status(400).json({ error: "invalid_status" });
  }
  const hasEditableFields = [
    "quantityKg",
    "offerPriceTlKg",
    "deliveryType",
    "paymentType",
    "qualityGrade",
    "note",
    "expiryHours",
    "expiresAt"
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (hasEditableFields && !["pending", "countered"].includes(String(offer.status || "").toLowerCase())) {
    return res.status(409).json({ error: "offer_not_editable" });
  }
  const listing = tradeListings.find((item) => item.id === offer.listingId);
  const availableKg = listing ? getListingAvailableKg(listing) : null;
  const quantityKg = Object.prototype.hasOwnProperty.call(body, "quantityKg")
    ? Number(body.quantityKg)
    : Number(offer.quantityKg || 0);
  const offerPriceTlKg = Object.prototype.hasOwnProperty.call(body, "offerPriceTlKg")
    ? Number(body.offerPriceTlKg)
    : Number(offer.offerPriceTlKg || 0);
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    return res.status(400).json({ error: "invalid_quantity" });
  }
  if (!Number.isFinite(offerPriceTlKg) || offerPriceTlKg <= 0) {
    return res.status(400).json({ error: "invalid_offer_price" });
  }
  if (Number.isFinite(availableKg) && quantityKg > Number(availableKg) && statusRaw !== "cancelled") {
    return res.status(409).json({ error: "insufficient_available_quantity", availableKg: Number(availableKg.toFixed(2)) });
  }
  const next = normalizeTradeOffer({
    ...offer,
    ...body,
    id: offer.id,
    listingId: offer.listingId,
    buyer: offer.buyer,
    quantityKg,
    offerPriceTlKg,
    status: statusRaw || offer.status,
    createdAt: offer.createdAt,
    expiresAt:
      Object.prototype.hasOwnProperty.call(body, "expiresAt") || Object.prototype.hasOwnProperty.call(body, "expiryHours")
        ? body.expiresAt
        : offer.expiresAt
  });
  next.updatedAt = new Date().toISOString();
  tradeOffers[idx] = next;
  saveTradeMarketToDisk();
  return res.json({ ok: true, item: tradeOffers[idx] });
});

app.post("/api/trade/offers/bulk-action", (req, res) => {
  sweepExpiredTradeOffers();
  const action = String(req.body?.action || "").toLowerCase().trim();
  const allowed = new Set(["accept", "reject", "cancel"]);
  if (!allowed.has(action)) {
    return res.status(400).json({ error: "invalid_action", allowed: Array.from(allowed) });
  }
  const idsRaw = Array.isArray(req.body?.offerIds) ? req.body.offerIds : [];
  const offerIds = Array.from(
    new Set(idsRaw.map((x) => String(x || "").trim()).filter(Boolean))
  ).slice(0, 120);
  if (!offerIds.length) {
    return res.status(400).json({ error: "offer_ids_required" });
  }
  const items = [];
  let changed = false;
  for (const offerId of offerIds) {
    if (action === "accept") {
      const out = acceptTradeOfferInternal(offerId, {
        shippingProvider: req.body?.shippingProvider || null,
        note: req.body?.note || null,
        persist: false,
        withAlert: false
      });
      if (out.ok) changed = true;
      items.push({
        offerId,
        ok: Boolean(out.ok),
        status: out.status,
        error: out.error || null,
        orderId: out?.item?.id || null
      });
      continue;
    }
    const idx = tradeOffers.findIndex((item) => item.id === offerId);
    if (idx < 0) {
      items.push({ offerId, ok: false, status: 404, error: "offer_not_found" });
      continue;
    }
    const current = tradeOffers[idx];
    const currentStatus = String(current.status || "").toLowerCase();
    if (!["pending", "countered"].includes(currentStatus)) {
      items.push({ offerId, ok: false, status: 409, error: "offer_not_actionable" });
      continue;
    }
    tradeOffers[idx] = {
      ...current,
      status: action === "reject" ? "rejected" : "cancelled",
      updatedAt: new Date().toISOString()
    };
    changed = true;
    items.push({ offerId, ok: true, status: 200, error: null });
  }
  const successCount = items.filter((x) => x.ok).length;
  if (changed) {
    pushTradeAlert({
      level: successCount > 0 ? "info" : "warning",
      title: `Toplu teklif islemi: ${action}`,
      detail: `${successCount}/${offerIds.length} teklif`,
      orderId: null
    });
    saveTradeMarketToDisk();
  }
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: successCount === offerIds.length,
    action,
    total: offerIds.length,
    successCount,
    failCount: offerIds.length - successCount,
    items
  });
});

app.post("/api/trade/offers/:id/counter", (req, res) => {
  const id = (req.params.id || "").toString();
  const idx = tradeOffers.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const price = Number(req.body?.counterPriceTlKg || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "counter_price_required" });
  }
  const note = String(req.body?.note || "").trim() || null;
  tradeOffers[idx] = {
    ...tradeOffers[idx],
    status: "countered",
    counterPriceTlKg: Number(price.toFixed(2)),
    counterNote: note,
    updatedAt: new Date().toISOString()
  };
  pushTradeAlert({
    level: "info",
    title: "Karsi teklif olustu",
    detail: `${tradeOffers[idx].buyer || "Alici"} icin ${tradeOffers[idx].counterPriceTlKg} TL/kg`,
    orderId: null
  });
  saveTradeMarketToDisk();
  return res.json({ ok: true, item: tradeOffers[idx] });
});

app.post("/api/trade/offers/:id/accept", (req, res) => {
  const out = acceptTradeOfferInternal(req.params.id, {
    shippingProvider: req.body?.shippingProvider || null,
    note: req.body?.note || null
  });
  if (!out.ok) {
    const payload = { error: out.error || "accept_failed" };
    if (Number.isFinite(Number(out.availableKg))) payload.availableKg = Number(out.availableKg);
    return res.status(out.status || 409).json(payload);
  }
  return res.status(out.status || 201).json({ ok: true, item: out.item });
});

app.get("/api/trade/orders", (req, res) => {
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  const status = (req.query.status || "").toString().toLowerCase();
  const items = tradeOrders
    .filter((item) => {
      if (city && cityKey(item.city) !== cityKey(city)) return false;
      if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
      if (status && item.status !== status) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 120);
  return res.json({ updatedAt: new Date().toISOString(), count: items.length, items });
});

app.patch("/api/trade/orders/:id", (req, res) => {
  const id = (req.params.id || "").toString();
  const idx = tradeOrders.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const statusRaw = String(req.body?.status || "").toLowerCase();
  const escrowRaw = String(req.body?.escrowStatus || "").toLowerCase();
  const next = { ...tradeOrders[idx] };
  if (statusRaw) {
    if (!["created", "accepted", "in_transit", "delivered", "completed", "cancelled"].includes(statusRaw)) {
      return res.status(400).json({ error: "invalid_status" });
    }
    next.status = statusRaw;
  }
  if (escrowRaw) {
    if (!["none", "held", "released", "refunded"].includes(escrowRaw)) {
      return res.status(400).json({ error: "invalid_escrow_status" });
    }
    next.escrowStatus = escrowRaw;
  }
  if (req.body?.invoiceNo !== undefined) {
    const invoiceNo = String(req.body?.invoiceNo || "").trim();
    next.invoiceNo = invoiceNo || null;
  }
  if (req.body?.trackingCode !== undefined) {
    const trackingCode = String(req.body?.trackingCode || "").trim();
    next.trackingCode = trackingCode || null;
    if (!next.shippingProvider) {
      next.shippingProvider = detectShippingProviderFromCode(trackingCode);
    }
    next.trackingUrl = buildTrackingUrl(trackingCode, next.shippingProvider);
    if (next.trackingCode && ["created", "accepted"].includes(next.status)) {
      next.status = "in_transit";
    }
  }
  if (req.body?.shippingProvider !== undefined) {
    const shippingProvider = String(req.body?.shippingProvider || "").toLowerCase().trim();
    next.shippingProvider = shippingProvider || null;
    if (next.trackingCode) {
      next.trackingUrl = buildTrackingUrl(next.trackingCode, next.shippingProvider);
    }
  }
  if (next.status === "completed" && next.paymentType === "escrow" && next.escrowStatus === "held") {
    next.escrowStatus = "released";
  }
  if (next.status === "delivered" && next.paymentType === "escrow" && next.escrowStatus === "none") {
    next.escrowStatus = "held";
  }
  next.updatedAt = new Date().toISOString();
  tradeOrders[idx] = next;
  pushTradeAlert({
    level: next.status === "completed" ? "success" : "info",
    title: `Siparis guncellendi: ${next.status}`,
    detail: `Escrow: ${next.escrowStatus}${next.trackingCode ? ` • Takip: ${next.trackingCode}` : ""}`,
    orderId: next.id
  });
  saveTradeMarketToDisk();
  return res.json({ ok: true, item: next });
});

app.get("/api/trade/orders/:id/contract", (req, res) => {
  const id = (req.params.id || "").toString();
  const order = tradeOrders.find((item) => item.id === id);
  if (!order) return res.status(404).json({ error: "not_found" });
  const contractText = buildContractLines(order).join("\n");
  return res.json({
    updatedAt: new Date().toISOString(),
    orderId: order.id,
    contractNo: order.contractNo || null,
    contractUrl: order.contractUrl || null,
    text: contractText
  });
});

app.get("/api/trade/orders/:id/contract.pdf", (req, res) => {
  const id = (req.params.id || "").toString();
  const order = tradeOrders.find((item) => item.id === id);
  if (!order) return res.status(404).json({ error: "not_found" });
  const pdfBuffer = generateSimplePdfBuffer(
    `Tarim Pazari Sozlesme ${order.contractNo || "-"}`,
    buildContractLines(order)
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"contract-${String(order.contractNo || order.id).replace(/[^a-zA-Z0-9-_]/g, "")}.pdf\"`
  );
  return res.send(pdfBuffer);
});

app.get("/api/trade/shipping/providers", (req, res) => {
  return res.json({
    updatedAt: new Date().toISOString(),
    count: shippingProviders.length,
    items: shippingProviders.map((item) => {
      const cfg = resolveShippingProviderConfig(item.id);
      return {
        id: item.id,
        name: item.name,
        trackingUrlTemplate: item.trackingUrlTemplate,
        apiConfigured: Boolean(cfg?.baseUrl)
      };
    })
  });
});

app.get("/api/trade/shipping/providers-config", (req, res) => {
  return res.json({
    updatedAt: new Date().toISOString(),
    items: shippingProviders.map((item) => {
      const cfg = resolveShippingProviderConfig(item.id);
      const parser = resolveShippingParser(item.id);
      const envKey = item.id.toUpperCase();
      const overrides = {
        statusPaths: parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_STATUS_PATHS`]).length > 0,
        eventPaths: parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_EVENT_PATHS`]).length > 0,
        codePaths: parseEnvPathList(process.env[`SHIPPING_PROVIDER_${envKey}_CODE_PATHS`]).length > 0
      };
      return {
        id: item.id,
        name: item.name,
        apiConfigured: Boolean(cfg?.baseUrl),
        statusPath: cfg?.statusPath || null,
        codeParam: cfg?.codeParam || null,
        parser,
        parserOverrides: overrides
      };
    })
  });
});

app.post("/api/trade/shipping/parse-preview", (req, res) => {
  const provider = String(req.body?.provider || "").toLowerCase().trim();
  if (!provider) return res.status(400).json({ error: "provider_required" });
  const known = shippingProviders.some((item) => item.id === provider);
  if (!known) return res.status(400).json({ error: "provider_not_supported" });
  let payload = {};
  try {
    payload = parseJsonInput(req.body?.payload);
  } catch (err) {
    return res.status(400).json({ error: "invalid_json_payload", detail: err?.message || "parse_error" });
  }
  const parser = resolveShippingParser(provider);
  const parsed = parseShippingPayload(provider, payload);
  const payloadKeys = Object.keys(payload || {});
  return res.json({
    updatedAt: new Date().toISOString(),
    provider,
    parser,
    diagnostics: {
      payloadTopLevelKeyCount: payloadKeys.length,
      payloadTopLevelKeys: payloadKeys.slice(0, 40),
      missing: {
        providerStatus: !parsed.providerStatus,
        event: !parsed.event,
        trackingCode: !parsed.trackingCode
      }
    },
    parsed: {
      ...parsed,
      normalizedStatus: mapShippingEventToOrderStatus(parsed.providerStatus || "", "in_transit")
    }
  });
});

app.get("/api/trade/shipping/providers-health", async (req, res) => {
  const probeCode = String(req.query.code || "TEST-TRACK").trim();
  const checks = await Promise.all(
    shippingProviders.map(async (item) => {
      const cfg = resolveShippingProviderConfig(item.id);
      if (!cfg) {
        return { id: item.id, name: item.name, ok: false, mode: "simulated", reason: "api_not_configured" };
      }
      const startedAt = Date.now();
      try {
        await fetchShippingStatusLive(item.id, probeCode);
        return {
          id: item.id,
          name: item.name,
          ok: true,
          mode: "provider-api",
          latencyMs: Date.now() - startedAt
        };
      } catch (err) {
        return {
          id: item.id,
          name: item.name,
          ok: false,
          mode: "provider-api",
          latencyMs: Date.now() - startedAt,
          reason: err?.message || "probe_failed"
        };
      }
    })
  );
  return res.json({
    updatedAt: new Date().toISOString(),
    count: checks.length,
    healthy: checks.filter((x) => x.ok).length,
    items: checks
  });
});

app.get("/api/trade/orders/:id/shipping-status", async (req, res) => {
  const id = (req.params.id || "").toString();
  const order = tradeOrders.find((item) => item.id === id);
  if (!order) return res.status(404).json({ error: "not_found" });
  if (!order.trackingCode) {
    return res.json({
      updatedAt: new Date().toISOString(),
      orderId: order.id,
      provider: order.shippingProvider || null,
      mode: "none",
      status: order.status,
      event: "Takip kodu yok"
    });
  }
  const provider = String(req.query.provider || order.shippingProvider || "").toLowerCase().trim();
  const live = await fetchShippingStatusLive(provider, order.trackingCode).catch(() => null);
  if (live) {
    return res.json({
      updatedAt: new Date().toISOString(),
      orderId: order.id,
      provider: provider || null,
      mode: live.source,
      status: live.status,
      providerStatus: live.providerStatus,
      event: live.event,
      seenTrackingCode: live.trackingCode || null,
      trackingUrl: buildTrackingUrl(order.trackingCode, provider)
    });
  }
  const sim = simulateShippingStatus(order);
  return res.json({
    updatedAt: new Date().toISOString(),
    orderId: order.id,
    provider: provider || null,
    mode: "simulated",
    status: sim.status,
    event: sim.event,
    trackingUrl: buildTrackingUrl(order.trackingCode, provider)
  });
});

app.post("/api/trade/orders/:id/shipping-sync", async (req, res) => {
  const id = (req.params.id || "").toString();
  const idx = tradeOrders.findIndex((item) => item.id === id);
  if (idx < 0) return res.status(404).json({ error: "not_found" });
  const order = { ...tradeOrders[idx] };
  const provider = String(req.body?.provider || order.shippingProvider || "").toLowerCase().trim();
  if (provider) order.shippingProvider = provider;
  let sync = null;
  let mode = "simulated";
  try {
    const live = await fetchShippingStatusLive(order.shippingProvider, order.trackingCode);
    if (live) {
      sync = { status: live.status, event: live.event || "Canli durum alindi" };
      mode = "provider-api";
    }
  } catch (_) {
    // fallback simulated
  }
  if (!sync) sync = simulateShippingStatus(order);
  order.status = sync.status;
  if (order.trackingCode) {
    order.trackingUrl = buildTrackingUrl(order.trackingCode, order.shippingProvider);
  }
  if (order.status === "delivered" && order.paymentType === "escrow" && order.escrowStatus === "held") {
    order.escrowStatus = "released";
  }
  order.updatedAt = new Date().toISOString();
  tradeOrders[idx] = order;
  pushTradeAlert({
    level: "info",
    title: "Kargo durumu senkronlandi",
    detail: `${order.shippingProvider || "bilinmiyor"} • ${mode} • ${sync.event}`,
    orderId: order.id
  });
  saveTradeMarketToDisk();
  return res.json({
    ok: true,
    item: order,
    mode,
    provider: order.shippingProvider || null,
    event: sync.event
  });
});

app.post("/api/trade/shipping/sync-all", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.body?.limit || 30), 1), 200);
  const candidates = tradeOrders
    .filter((item) => ["accepted", "in_transit", "delivered"].includes(item.status))
    .slice(0, limit);
  const out = [];
  for (const order of candidates) {
    const idx = tradeOrders.findIndex((x) => x.id === order.id);
    if (idx < 0) continue;
    const provider = String(order.shippingProvider || "").toLowerCase().trim();
    let sync = null;
    let mode = "simulated";
    try {
      const live = await fetchShippingStatusLive(provider, order.trackingCode);
      if (live) {
        sync = { status: live.status, event: live.event || "Canli durum alindi" };
        mode = "provider-api";
      }
    } catch (_) {
      // fallback simulated
    }
    if (!sync) sync = simulateShippingStatus(order);
    const next = { ...tradeOrders[idx] };
    const prevStatus = next.status;
    next.status = sync.status;
    if (next.status === "delivered" && next.paymentType === "escrow" && next.escrowStatus === "held") {
      next.escrowStatus = "released";
    }
    next.updatedAt = new Date().toISOString();
    tradeOrders[idx] = next;
    if (prevStatus !== next.status) {
      pushTradeAlert({
        level: "info",
        title: `Siparis otomatik guncellendi: ${next.status}`,
        detail: `${mode} • ${sync.event || "-"}`,
        orderId: next.id
      });
    }
    out.push({ id: next.id, status: next.status, mode, event: sync.event || null });
  }
  saveTradeMarketToDisk();
  return res.json({
    updatedAt: new Date().toISOString(),
    scanned: candidates.length,
    updated: out.length,
    items: out
  });
});

app.get("/api/trade/messages", (req, res) => {
  const listingId = (req.query.listingId || "").toString();
  const offerId = (req.query.offerId || "").toString();
  const orderId = (req.query.orderId || "").toString();
  const items = tradeMessages
    .filter((item) => {
      if (listingId && item.listingId !== listingId) return false;
      if (offerId && item.offerId !== offerId) return false;
      if (orderId && item.orderId !== orderId) return false;
      return true;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-200);
  return res.json({ updatedAt: new Date().toISOString(), count: items.length, items });
});

app.post("/api/trade/messages", (req, res) => {
  const msg = normalizeTradeMessage(req.body || {});
  if (!msg.text || (!msg.listingId && !msg.offerId && !msg.orderId)) {
    return res.status(400).json({ error: "context_and_text_required" });
  }
  tradeMessages.push(msg);
  if (tradeMessages.length > 20000) tradeMessages = tradeMessages.slice(-20000);
  pushTradeAlert({
    level: "info",
    title: "Yeni mesaj",
    detail: `${msg.sender || msg.senderRole}: ${String(msg.text || "").slice(0, 80)}`,
    orderId: msg.orderId || null
  });
  saveTradeMarketToDisk();
  return res.status(201).json({ ok: true, item: msg });
});

app.post("/api/trade/ratings", (req, res) => {
  const rating = normalizeTradeRating(req.body || {});
  if (!rating.orderId || !rating.targetName) {
    return res.status(400).json({ error: "order_and_target_required" });
  }
  const order = tradeOrders.find((item) => item.id === rating.orderId);
  if (!order) return res.status(404).json({ error: "order_not_found" });
  tradeRatings.unshift(rating);
  if (tradeRatings.length > 20000) tradeRatings = tradeRatings.slice(0, 20000);
  pushTradeAlert({
    level: "success",
    title: "Yeni puanlama",
    detail: `${rating.targetName} icin ${rating.score}/5`,
    orderId: rating.orderId
  });
  saveTradeMarketToDisk();
  return res.status(201).json({
    ok: true,
    item: rating,
    trust: calcTradeTrustSummary(rating.targetName, rating.targetRole)
  });
});

app.get("/api/trade/alerts", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 200);
  const orderId = (req.query.orderId || "").toString();
  const since = Number(req.query.since || 0);
  const items = tradeAlerts
    .filter((item) => {
      if (orderId && item.orderId !== orderId) return false;
      if (since && new Date(item.createdAt).getTime() < since) return false;
      return true;
    })
    .slice(0, limit);
  return res.json({
    updatedAt: new Date().toISOString(),
    count: items.length,
    items
  });
});

app.get("/api/trade/trust", (req, res) => {
  const name = (req.query.name || "").toString();
  const roleRaw = (req.query.role || "seller").toString().toLowerCase();
  const role = roleRaw === "buyer" ? "buyer" : "seller";
  if (!name) return res.status(400).json({ error: "name_required" });
  return res.json({
    updatedAt: new Date().toISOString(),
    ...calcTradeTrustSummary(name, role)
  });
});

app.get("/api/trade/summary", (req, res) => {
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  return res.json({
    updatedAt: new Date().toISOString(),
    ...buildTradeSummaryData({ city, crop })
  });
});

app.get("/api/trade/workspace", async (req, res) => {
  sweepExpiredTradeOffers();
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  const listingStatus = (req.query.listingStatus || req.query.status || "all").toString().toLowerCase();
  const listingLimit = Math.min(Math.max(Number(req.query.listingLimit || 240), 1), 500);
  const offerLimit = Math.min(Math.max(Number(req.query.offerLimit || 500), 1), 1500);
  const orderLimit = Math.min(Math.max(Number(req.query.orderLimit || 300), 1), 800);
  const matchLimit = Math.min(Math.max(Number(req.query.matchLimit || 12), 1), 60);
  const alertLimit = Math.min(Math.max(Number(req.query.alertLimit || 20), 1), 100);
  const includeShippingHealth = String(req.query.includeShippingHealth || "").toLowerCase() === "1";

  const summary = buildTradeSummaryData({ city, crop });
  const dashboard = buildTradeDashboardData({ city, crop });
  const matches = buildTradeMatchesData({ city, crop, limit: matchLimit });
  const listings = filterTradeListingsByScope({ city, crop, status: listingStatus })
    .map((item) => normalizeListingForApi(item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, listingLimit);
  const scopedListingIds = new Set(listings.map((x) => String(x.id)));
  const offers = tradeOffers
    .filter((item) => {
      const listing = tradeListings.find((x) => x.id === item.listingId);
      if (!listing) return false;
      if (city && cityKey(listing.city) !== cityKey(city)) return false;
      if (crop && cityKey(listing.crop) !== cityKey(crop)) return false;
      if (scopedListingIds.size && !scopedListingIds.has(String(item.listingId))) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, offerLimit);
  const orders = tradeOrders
    .filter((item) => {
      if (city && cityKey(item.city) !== cityKey(city)) return false;
      if (crop && cityKey(item.crop) !== cityKey(crop)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, orderLimit);
  const alerts = tradeAlerts.slice(0, alertLimit);
  const shippingProvidersPayload = shippingProviders.map((item) => {
    const cfg = resolveShippingProviderConfig(item.id);
    return {
      id: item.id,
      name: item.name,
      trackingUrlTemplate: item.trackingUrlTemplate,
      apiConfigured: Boolean(cfg?.baseUrl)
    };
  });
  const shippingConfigsPayload = shippingProviders.map((item) => {
    const cfg = resolveShippingProviderConfig(item.id);
    return {
      id: item.id,
      name: item.name,
      apiConfigured: Boolean(cfg?.baseUrl),
      baseUrl: cfg?.baseUrl || null,
      statusPath: cfg?.statusPath || null,
      codeParam: cfg?.codeParam || null,
      parser: resolveShippingParser(item.id)
    };
  });
  const shippingHealth = includeShippingHealth
    ? await Promise.all(
        shippingProviders.map(async (item) => {
          const cfg = resolveShippingProviderConfig(item.id);
          if (!cfg) {
            return { id: item.id, name: item.name, ok: false, mode: "simulated", reason: "api_not_configured" };
          }
          const startedAt = Date.now();
          try {
            await fetchShippingStatusLive(item.id, "TEST-TRACK");
            return { id: item.id, name: item.name, ok: true, mode: "provider-api", latencyMs: Date.now() - startedAt };
          } catch (err) {
            return {
              id: item.id,
              name: item.name,
              ok: false,
              mode: "provider-api",
              latencyMs: Date.now() - startedAt,
              reason: err?.message || "probe_failed"
            };
          }
        })
      )
    : null;

  return res.json({
    updatedAt: new Date().toISOString(),
    scope: {
      city: city || null,
      crop: crop || null,
      listingStatus,
      includeShippingHealth
    },
    summary,
    dashboard,
    listings: { count: listings.length, items: listings },
    offers: { count: offers.length, items: offers },
    orders: { count: orders.length, items: orders },
    matches,
    alerts: { count: alerts.length, items: alerts },
    shippingProviders: { count: shippingProvidersPayload.length, items: shippingProvidersPayload },
    shippingProviderConfigs: { count: shippingConfigsPayload.length, items: shippingConfigsPayload },
    shippingHealth: shippingHealth ? { count: shippingHealth.length, items: shippingHealth } : null
  });
});

app.post("/api/trade/seed-demo", (req, res) => {
  const city = String(req.body?.city || "Malatya").trim() || "Malatya";
  const crop = String(req.body?.crop || "domates").trim() || "domates";
  const listing = normalizeTradeListing({
    type: "sell",
    city,
    district: req.body?.district || "Merkez",
    crop,
    title: `${crop} demo ilan`,
    quantityKg: Number(req.body?.quantityKg || 1200),
    priceTlKg: Number(req.body?.priceTlKg || 18.6),
    deliveryType: req.body?.deliveryType || "seller_delivery",
    paymentType: req.body?.paymentType || "escrow",
    qualityGrade: req.body?.qualityGrade || "standard",
    contact: req.body?.contact || "Demo Uretici"
  });
  tradeListings.unshift(listing);

  const offer = normalizeTradeOffer({
    listingId: listing.id,
    buyer: req.body?.buyer || "Demo Alici",
    quantityKg: Math.max(100, Number(listing.quantityKg || 1200) * 0.8),
    offerPriceTlKg: Math.max(1, Number(listing.priceTlKg || 18.6) - 0.2),
    deliveryType: listing.deliveryType,
    paymentType: listing.paymentType,
    qualityGrade: listing.qualityGrade
  });
  tradeOffers.unshift(offer);

  const order = normalizeTradeOrder({
    listingId: listing.id,
    offerId: offer.id,
    seller: listing.contact || "Satici",
    buyer: offer.buyer || "Alici",
    city: listing.city,
    crop: listing.crop,
    quantityKg: offer.quantityKg,
    priceTlKg: offer.offerPriceTlKg,
    deliveryType: listing.deliveryType,
    paymentType: listing.paymentType,
    qualityGrade: listing.qualityGrade,
    shippingProvider: req.body?.shippingProvider || "yurtici",
    status: "accepted",
    escrowStatus: listing.paymentType === "escrow" ? "held" : "none"
  });
  tradeOrders.unshift(order);
  if (tradeListings.length > 4000) tradeListings = tradeListings.slice(0, 4000);
  if (tradeOffers.length > 10000) tradeOffers = tradeOffers.slice(0, 10000);
  if (tradeOrders.length > 10000) tradeOrders = tradeOrders.slice(0, 10000);
  pushTradeAlert({
    level: "success",
    title: "Demo pazar verisi olusturuldu",
    detail: `${city} • ${crop}`,
    orderId: order.id
  });
  saveTradeMarketToDisk();
  return res.status(201).json({
    ok: true,
    listing,
    offer,
    order
  });
});

app.post("/api/trade/reset-demo", (req, res) => {
  tradeListings = [];
  tradeOffers = [];
  tradeOrders = [];
  tradeMessages = [];
  tradeRatings = [];
  tradeAlerts = [];
  saveTradeMarketToDisk();
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: true,
    cleared: true
  });
});

app.get("/api/demo/smoke", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const crop = (req.query.crop || "domates").toString();
  const district = (req.query.district || "").toString();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString();
  const land = await estimateLandPrice({ city, district, neighborhood, crop }).catch(() => null);
  const summary = {
    weather: true,
    soil: true,
    land: Boolean(land?.priceTlDa),
    trade: tradeListings.length > 0 || tradeOrders.length > 0,
    finance: true
  };
  return res.json({
    updatedAt: new Date().toISOString(),
    ok: Object.values(summary).every(Boolean),
    summary
  });
});

app.get("/api/trade/matches", (req, res) => {
  const city = (req.query.city || "").toString();
  const crop = (req.query.crop || "").toString();
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const out = buildTradeMatchesData({ city, crop, limit });
  return res.json({
    updatedAt: new Date().toISOString(),
    ...out
  });
});



app.get("/api/soil/sources", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString().trim();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString().trim();
  const geocode = await geocodeCity(city, district, neighborhood).catch(() => null);
  const coords = geocode ? `${geocode.lat}, ${geocode.lon}` : null;
  const locationLabel = buildLocationSearchQuery(
    geocode?.city || city,
    geocode?.district || district,
    geocode?.neighborhood || neighborhood
  );
  return res.json({
    updatedAt: new Date().toISOString(),
    city: geocode?.city || city,
    district: geocode?.district || district || null,
    neighborhood: geocode?.neighborhood || neighborhood || null,
    locationLabel: locationLabel || city,
    coords,
    sources: [
      { id: "soilgrids", title: "ISRIC SoilGrids", url: SOILGRIDS_QUERY, type: "soil-properties" },
      { id: "open-meteo-geocode", title: "Open-Meteo Geocoding", url: OPEN_METEO_GEOCODE_URL, type: "geocoding" },
      { id: "open-meteo", title: "Open-Meteo Forecast", url: OPEN_METEO_FORECAST_URL, type: "soil-signal" },
      { id: "mta", title: "MTA katman servisi", url: MTA_SOIL_URL || MTA_MINERAL_URL || null, type: "national-layer" },
      {
        id: "tr-soil-wms",
        title: "Turkiye Toprak Haritasi (WMS)",
        url: TR_SOIL_WMS_URL || null,
        layer: TR_SOIL_WMS_LAYER || null,
        type: "national-soil-layer"
      }
    ]
  });
});

app.get("/api/soil", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const district = (req.query.district || "").toString().trim();
  const neighborhood = (req.query.neighborhood || req.query.mahalle || "").toString().trim();
  const coords = (req.query.coords || "").toString();
  const requestedPlant = (req.query.plant || "").toString().trim().toLowerCase();
  const [latRaw, lonRaw] = coords.split(",").map((item) => item.trim());
  let latNum = Number(latRaw);
  let lonNum = Number(lonRaw);
  let geoSource = "query";
  let resolvedCity = city;
  let resolvedDistrict = district || null;
  let resolvedNeighborhood = neighborhood || null;
  let locationLabel = buildLocationSearchQuery(resolvedCity, resolvedDistrict, resolvedNeighborhood) || city;

  if ((!latRaw || !lonRaw || Number.isNaN(latNum) || Number.isNaN(lonNum)) && city) {
    const geocode = await geocodeCity(city, district, neighborhood).catch(() => null);
    if (geocode) {
      latNum = geocode.lat;
      lonNum = geocode.lon;
      geoSource = "open-meteo-geocode";
      resolvedCity = geocode.city || geocode.name || city;
      resolvedDistrict = geocode.district || district || null;
      resolvedNeighborhood = geocode.neighborhood || neighborhood || null;
      locationLabel =
        buildLocationSearchQuery(resolvedCity, resolvedDistrict, resolvedNeighborhood) ||
        resolvedCity ||
        city;
    }
  }

  if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
    const [soil, mtaSoil, mtaMineral, meteoSoil, trSoilWms] = await Promise.all([
      fetchSoilGrids(latNum, lonNum).catch(() => null),
      fetchMtaLayer(MTA_SOIL_URL, latNum, lonNum),
      fetchMtaLayer(MTA_MINERAL_URL, latNum, lonNum),
      fetchOpenMeteoSoilSignals(latNum, lonNum).catch(() => null),
      fetchTrSoilFromWms(latNum, lonNum).catch(() => null)
    ]);
    const mtaSummary = summarizeMtaData(mtaSoil, mtaMineral);
    const internetSources = [
      {
        id: "soilgrids",
        title: "ISRIC SoilGrids",
        url: SOILGRIDS_QUERY,
        available: Boolean(soil)
      },
      {
        id: "open-meteo",
        title: "Open-Meteo Forecast",
        url: meteoSoil?.url || OPEN_METEO_FORECAST_URL,
        available: Boolean(meteoSoil)
      },
      {
        id: "mta",
        title: "MTA katman servisi",
        url: MTA_SOIL_URL || MTA_MINERAL_URL || null,
        available: Boolean(mtaSummary)
      },
      {
        id: "tr-soil-wms",
        title: "Turkiye Toprak Haritasi (WMS)",
        url: trSoilWms?.url || TR_SOIL_WMS_URL || null,
        layer: TR_SOIL_WMS_LAYER || null,
        available: Boolean(trSoilWms?.soilMap)
      }
    ];

    if (soil) {
      const texture = classifySoilTexture(soil);
      return res.json(enrichSoilResponse({
        city: resolvedCity,
        district: resolvedDistrict,
        neighborhood: resolvedNeighborhood,
        locationLabel,
        coords: `${latNum}, ${lonNum}`,
        requestedPlant,
        geoSource,
        source:
          soil && meteoSoil && mtaSummary && trSoilWms
            ? "soilgrids+open-meteo+mta+tr-soil"
            : soil && meteoSoil && mtaSummary
              ? "soilgrids+open-meteo+mta"
            : soil && meteoSoil
              ? "soilgrids+open-meteo"
              : mtaSummary
                ? "soilgrids+mta"
                : trSoilWms
                  ? "soilgrids+tr-soil"
                : "soilgrids",
        soilType: trSoilWms?.soilMap || texture,
        ph: soil.phh2o ?? "-",
        organic: soil.soc ?? "-",
        clay: soil.clay ?? "-",
        sand: soil.sand ?? "-",
        silt: soil.silt ?? "-",
        nitrogen: soil.nitrogen ?? "-",
        cec: soil.cec ?? "-",
        bulkDensity: soil.bdod ?? "-",
        mta: mtaSummary,
        trSoil: trSoilWms || null,
        internetSignals: meteoSoil?.summary || null,
        internetMeta: meteoSoil?.rawMeta || null,
        internetSources,
        note: trSoilWms
          ? "Toprak verisi SoilGrids + Turkiye toprak haritasi (WMS) ile zenginlestirildi."
          : mtaSummary
            ? "Toprak verisi SoilGrids + MTA katman ozetinden uretildi."
          : meteoSoil
            ? "Toprak verisi SoilGrids, internet iklim sinyalleri ile zenginlestirildi."
            : "Toprak verisi SoilGrids kaynagindan cekildi."
      }));
    }

    if (mtaSummary || meteoSoil || trSoilWms) {
      return res.json(enrichSoilResponse({
        city: resolvedCity,
        district: resolvedDistrict,
        neighborhood: resolvedNeighborhood,
        locationLabel,
        coords: `${latNum}, ${lonNum}`,
        requestedPlant,
        geoSource,
        source:
          mtaSummary && meteoSoil && trSoilWms
            ? "mta+open-meteo+tr-soil"
            : mtaSummary && meteoSoil
              ? "mta+open-meteo"
              : trSoilWms && meteoSoil
                ? "tr-soil+open-meteo"
                : trSoilWms
                  ? "tr-soil"
                  : mtaSummary
                    ? "mta"
                    : "open-meteo",
        soilType: trSoilWms?.soilMap || mtaSummary?.soilMap || "Bilinmiyor",
        ph: "-",
        organic: "-",
        clay: "-",
        sand: "-",
        silt: "-",
        nitrogen: "-",
        cec: "-",
        bulkDensity: "-",
        mta: mtaSummary || null,
        trSoil: trSoilWms || null,
        internetSignals: meteoSoil?.summary || null,
        internetMeta: meteoSoil?.rawMeta || null,
        internetSources,
        note:
          trSoilWms && meteoSoil
            ? "Koordinata gore Turkiye toprak haritasi (WMS) + Open-Meteo kullanildi."
            : mtaSummary && meteoSoil
              ? "Koordinata gore MTA + Open-Meteo kaynaklari kullanildi."
            : mtaSummary
              ? "Koordinata gore MTA katman verisi kullanildi."
              : trSoilWms
                ? "Koordinata gore Turkiye toprak haritasi (WMS) kullanildi."
              : "Koordinata gore Open-Meteo toprak/nem sinyalleri kullanildi."
      }));
    }
  }

  const presets = {
    Malatya: {
      soilType: "Tinali-killi",
      ph: "7.4",
      organic: "Orta",
      drainage: "Orta",
      salinity: "Dusuk",
      climate: "Karasal",
      recommended: ["Kayisi", "Bugday", "Arpa", "Mercimek", "Aci biber"],
      risky: ["Cok nem isteyen marul", "Pirinç"],
      diseaseRisk: ["Koku curuklugu", "Mantar lekeleri"],
      note: "Gosterim verisi. Canli toprak verisi eklenince guncellenir."
    },
    Ankara: {
      soilType: "Kirecli-tinali",
      ph: "7.8",
      organic: "Dusuk-orta",
      drainage: "Iyi",
      salinity: "Dusuk",
      climate: "Karasal",
      recommended: ["Bugday", "Arpa", "Nohut", "Aspir"],
      risky: ["Nem isteyen sebzeler"],
      diseaseRisk: ["Kuru yaprak yanigi", "Root stress"],
      note: "Gosterim verisi."
    },
    Istanbul: {
      soilType: "Tinali",
      ph: "6.8",
      organic: "Orta",
      drainage: "Orta",
      salinity: "Dusuk",
      climate: "Iliman-nemli",
      recommended: ["Lahana", "Marul", "Ispanak", "Biber"],
      risky: ["Don hassas fideler"],
      diseaseRisk: ["Mantar hastaliklari", "Kulleme"],
      note: "Gosterim verisi."
    },
    Izmir: {
      soilType: "Tinali-kumlu",
      ph: "7.2",
      organic: "Orta",
      drainage: "Iyi",
      salinity: "Orta",
      climate: "Akdeniz",
      recommended: ["Domates", "Biber", "Zeytin", "Uzum"],
      risky: ["Cok soguk isteyen turler"],
      diseaseRisk: ["Tuz stresi", "Yaprak biti"],
      note: "Gosterim verisi."
    }
  };

  const demo = presets[city] || {
    soilType: "Tinali",
    ph: "7.0",
    organic: "Orta",
    drainage: "Orta",
    salinity: "Dusuk",
    climate: "Karisik",
    recommended: ["Domates", "Biber", "Sogan"],
    risky: ["Cok nem isteyen urunler"],
    diseaseRisk: ["Mantar lekeleri"],
    note: "Gosterim verisi."
  };

  return res.json(enrichSoilResponse({
    city: resolvedCity,
    district: resolvedDistrict,
    neighborhood: resolvedNeighborhood,
    locationLabel,
    coords: latRaw && lonRaw ? `${latRaw}, ${lonRaw}` : null,
    requestedPlant,
    source: "demo",
    ...demo
  }));
});

app.post("/api/diagnose", upload.single("image"), async (req, res) => {
  markStage(req, "upload");
  if (!req.file) {
    return res.status(400).json({ error: "image_required" });
  }
  const uploadCheck = validateUpload(req.file);
  if (!uploadCheck.ok) {
    return res.status(400).json({ error: uploadCheck.error });
  }

  let label = null;
  let confidence = null;
  let topPredictions = null;
  const rawPlant = req.body?.plant || null;
  const supportedPlantIds = Array.from(
    new Set(getCatalogLabels().map((item) => labelToPlantId(item)).filter(Boolean))
  ).sort();
  const plant = normalizePlantInput(rawPlant, supportedPlantIds);
  const plantUnsupported = Boolean(rawPlant) && supportedPlantIds.length > 0 && !plant;
  const strictFlagRaw = String(req.body?.strictPlant || "")
    .trim()
    .toLowerCase();
  const strictPlant =
    Boolean(plant) &&
    (strictFlagRaw === "1" ||
      strictFlagRaw === "true" ||
      strictFlagRaw === "yes" ||
      strictFlagRaw === "on");
  if (plantUnsupported) {
    return res.status(422).json({
      error: "plant_not_supported",
      plant: rawPlant,
      normalizedPlant: plant,
      supportedPlants: supportedPlantIds
    });
  }
  let metadata = null;
  markStage(req, "validate");
  const optimizedBuffer = await optimizeImage(req.file.buffer);
  markStage(req, "optimize");
  const cacheKey = crypto
    .createHash("sha256")
    .update(optimizedBuffer)
    .update(String(plant || ""))
    .update(String(strictPlant))
    .digest("hex");
  const cached = getCache(cacheKey);
  if (cached) {
    markStage(req, "cache");
    return res.json(cached);
  }
  try {
    metadata = await sharp(optimizedBuffer).metadata();
    if (metadata.width && metadata.height && (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION)) {
      return res.status(400).json({ error: "image_too_large" });
    }
  } catch (err) {
    return res.status(400).json({ error: "image_decode_failed" });
  }
  const quality = await analyzeImageQuality(optimizedBuffer).catch(() => null);
  const plantCheck = await analyzePlantLikelihood(optimizedBuffer).catch(() => null);
  markStage(req, "quality");

  let rawSorted = null;
  let inferenceSource = "demo";
  let inferenceError = null;
  let inferenceLabels = getActiveLabels();
  let onnxEnsembleSize = 0;
  let ensembleConsensus = null;
  let ensembleDisagreementStats = null;
  let inferenceTemperature = null;
  const ensembleModelWeights =
    modelMeta?.ensemble_weights && typeof modelMeta.ensemble_weights === "object"
      ? modelMeta.ensemble_weights
      : null;
  const rescueEnsembleModelWeights =
    modelMeta?.rescue_ensemble_weights && typeof modelMeta.rescue_ensemble_weights === "object"
      ? modelMeta.rescue_ensemble_weights
      : ensembleModelWeights;
  let rescueInfo = null;
  try {
    const onnxPipelines = getOnnxPipelines();
    if (onnxPipelines.length) {
      const onnxResults = [];
      const onnxFailures = [];
      for (const pipeline of onnxPipelines) {
        try {
          await runWithQueue(async () => {
            const useTTA = process.env.MODEL_TTA === "true";
            const logits = useTTA
              ? await inferOnnxTTA(
                  optimizedBuffer,
                  INPUT_SIZE,
                  normMean,
                  normStd,
                  pipeline.session
                )
              : await inferOnnx(
                  optimizedBuffer,
                  INPUT_SIZE,
                  normMean,
                  normStd,
                  pipeline.session
                );
            const labelsRef = pipeline.labels || [];
            if (!labelsRef.length) {
              throw new Error("model_labels_missing");
            }
            if (logits.length && logits.length !== labelsRef.length) {
              throw new Error(`model_output_mismatch:${logits.length}:${labelsRef.length}`);
            }
            const temperature = resolveAdaptiveTemperature(
              Number(process.env.MODEL_SOFTMAX_TEMPERATURE || 1.05),
              quality,
              plantCheck,
              "main"
            );
            inferenceTemperature = temperature;
            let probs = softmaxWithTemperature(logits, temperature);
            probs = applyClassTemperatureScaling(probs, labelsRef, modelMeta?.class_temperature);
            const sorted = probs
              .map((val, idx) => ({ idx, val, label: labelsRef[idx] }))
              .sort((a, b) => b.val - a.val);
            onnxResults.push({
              id: pipeline.id,
              labelsRef,
              rawSorted: sorted
            });
          });
        } catch (err) {
          onnxFailures.push(`${pipeline.id}: ${String(err?.message || err)}`);
        }
      }
      if (!onnxResults.length) {
        throw new Error(onnxFailures.join(" | ") || "onnx_all_failed");
      }
      if (onnxResults.length === 1) {
        rawSorted = onnxResults[0].rawSorted;
        inferenceLabels = onnxResults[0].labelsRef;
        inferenceSource = onnxResults[0].id;
      } else {
        rawSorted = combineOnnxSortedPredictions(onnxResults, {
          modelWeights: ensembleModelWeights
        });
        const disagreementAdjusted = applyEnsembleDisagreementPenalty(rawSorted, onnxResults, {
          alpha: Number(process.env.MODEL_ENSEMBLE_STD_ALPHA || 1.6),
          topK: Number(process.env.MODEL_ENSEMBLE_STD_TOPK || 5)
        });
        rawSorted = disagreementAdjusted.sorted;
        ensembleDisagreementStats = disagreementAdjusted.stats;
        inferenceLabels = rawSorted.map((item) => item.label);
        inferenceSource = `onnx-ensemble(${onnxResults.map((item) => item.id).join("+")})`;
        ensembleConsensus = computeEnsembleConsensus(onnxResults);
      }
      rawSorted = applyPriorCorrection(rawSorted, modelMeta?.prior_correction);
      onnxEnsembleSize = onnxResults.length;
      label = rawSorted[0].label;
      confidence = rawSorted[0].val;
      topPredictions = rawSorted.slice(0, 3).map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));

      const rescueEnabled = process.env.MODEL_RESCUE_ENABLED !== "false";
      const rescueTop1Min = Number(process.env.MODEL_RESCUE_TOP1_MIN || 0.56);
      const rescueMarginMin = Number(process.env.MODEL_RESCUE_MARGIN_MIN || 0.14);
      const rescueTop1 = Number(rawSorted?.[0]?.val || 0);
      const rescueTop2 = Number(rawSorted?.[1]?.val || 0);
      const rescueMargin = Math.max(0, rescueTop1 - rescueTop2);
      const needsRescue = rescueEnabled && (rescueTop1 < rescueTop1Min || rescueMargin < rescueMarginMin);
      if (needsRescue) {
        try {
          const rescueBuffer = await sharp(optimizedBuffer)
            .modulate({ brightness: 1.06, saturation: 1.08 })
            .sharpen()
            .jpeg({ quality: 94 })
            .toBuffer();
          const rescueResults = [];
          const rescueFailures = [];
          for (const pipeline of onnxPipelines) {
            try {
              await runWithQueue(async () => {
                const rescueUseTta = process.env.MODEL_RESCUE_TTA === "true";
                const logits = rescueUseTta
                  ? await inferOnnxTTA(
                      rescueBuffer,
                      INPUT_SIZE,
                      normMean,
                      normStd,
                      pipeline.session
                    )
                  : await inferOnnx(
                      rescueBuffer,
                      INPUT_SIZE,
                      normMean,
                      normStd,
                      pipeline.session
                    );
                const labelsRef = pipeline.labels || [];
                if (!labelsRef.length) throw new Error("model_labels_missing");
                if (logits.length && logits.length !== labelsRef.length) {
                  throw new Error(`model_output_mismatch:${logits.length}:${labelsRef.length}`);
                }
                const temperature = resolveAdaptiveTemperature(
                  Number(process.env.MODEL_SOFTMAX_TEMPERATURE || 1.05),
                  quality,
                  plantCheck,
                  "rescue"
                );
                let probs = softmaxWithTemperature(logits, temperature);
                probs = applyClassTemperatureScaling(probs, labelsRef, modelMeta?.class_temperature);
                const sorted = probs
                  .map((val, idx) => ({ idx, val, label: labelsRef[idx] }))
                  .sort((a, b) => b.val - a.val);
                rescueResults.push({ id: pipeline.id, labelsRef, rawSorted: sorted });
              });
            } catch (rescueErr) {
              rescueFailures.push(`${pipeline.id}: ${String(rescueErr?.message || rescueErr)}`);
            }
          }
          if (rescueResults.length) {
            const rescueSorted =
              rescueResults.length === 1
                ? rescueResults[0].rawSorted
                : combineOnnxSortedPredictions(rescueResults, {
                    modelWeights: rescueEnsembleModelWeights
                  });
            const rescueAdjusted =
              rescueResults.length > 1
                ? applyEnsembleDisagreementPenalty(rescueSorted, rescueResults, {
                    alpha: Number(process.env.MODEL_ENSEMBLE_STD_ALPHA || 1.6),
                    topK: Number(process.env.MODEL_ENSEMBLE_STD_TOPK || 5)
                  })
                : { sorted: rescueSorted, stats: null };
            const blendPrimaryWeight = Number(process.env.MODEL_RESCUE_BLEND_PRIMARY || 0.62);
            rawSorted = blendSortedPredictions(rawSorted, rescueAdjusted.sorted, blendPrimaryWeight);
            inferenceLabels = rawSorted.map((item) => item.label);
            label = rawSorted[0].label;
            confidence = rawSorted[0].val;
            topPredictions = rawSorted.slice(0, 3).map((item) => ({
              label: item.label,
              confidence: Number(item.val.toFixed(4))
            }));
            inferenceSource = `${inferenceSource}+rescue`;
            rescueInfo = {
              applied: true,
              top1Before: Number(rescueTop1.toFixed(4)),
              marginBefore: Number(rescueMargin.toFixed(4)),
              blendPrimaryWeight: Number(blendPrimaryWeight.toFixed(2)),
              weighting: rescueEnsembleModelWeights ? "meta" : "adaptive_top1",
              disagreement: rescueAdjusted.stats,
              ensembleSize: rescueResults.length,
              failures: rescueFailures.length ? rescueFailures : null
            };
          } else {
            rescueInfo = {
              applied: false,
              reason: "rescue_all_failed",
              failures: rescueFailures
            };
          }
        } catch (rescueOuterErr) {
          rescueInfo = {
            applied: false,
            reason: String(rescueOuterErr?.message || rescueOuterErr)
          };
        }
      }
    } else if (hasModelApi()) {
      const apiResult = await runModelApiInference(optimizedBuffer, plant || "");
      label = apiResult.label;
      confidence = apiResult.confidence;
      topPredictions = apiResult.topPredictions;
      inferenceSource = "model-api";
    } else if (hasPythonModel()) {
      const pyResult = await runPythonInference(optimizedBuffer);
      label = pyResult.label;
      confidence = pyResult.confidence;
      inferenceSource = "python";
    } else {
      if (MODEL_STRICT_ONLY) {
        throw new Error("model_unavailable_strict");
      }
      const fallback = fallbackDiagnosis(optimizedBuffer, plant, { quality, plantCheck });
      label = fallback.label;
      confidence = fallback.confidence;
      rawSorted = Array.isArray(fallback.sorted) ? fallback.sorted : rawSorted;
      topPredictions = Array.isArray(fallback.sorted)
        ? fallback.sorted.slice(0, 3).map((item) => ({
            label: item.label,
            confidence: Number(item.val.toFixed(4))
          }))
        : topPredictions;
      inferenceSource = "demo-fallback";
    }
    markStage(req, "infer");
  } catch (err) {
    console.error(err);
    inferenceError = String(err?.message || err);
    recordModelFailure("primary", inferenceError);
    if (MODEL_STRICT_ONLY) {
      return res.status(503).json(buildModelInferenceFailurePayload(inferenceError));
    }
    try {
      if (hasModelApi()) {
        const apiResult = await runModelApiInference(optimizedBuffer, plant || "");
        label = apiResult.label;
        confidence = apiResult.confidence;
        topPredictions = apiResult.topPredictions;
        inferenceSource = "model-api-fallback";
      } else if (hasPythonModel()) {
        const pyResult = await runPythonInference(optimizedBuffer);
        label = pyResult.label;
        confidence = pyResult.confidence;
        inferenceSource = "python-fallback";
      } else if (getOnnxPipelines().length) {
        const onnxResults = [];
        const onnxFailures = [];
        for (const pipeline of getOnnxPipelines()) {
          try {
            await runWithQueue(async () => {
              const logits = await inferOnnx(
                optimizedBuffer,
                INPUT_SIZE,
                normMean,
                normStd,
                pipeline.session
              );
              const labelsRef = pipeline.labels || [];
              if (!labelsRef.length) {
                throw new Error("model_labels_missing");
              }
              if (logits.length && logits.length !== labelsRef.length) {
                throw new Error(`model_output_mismatch:${logits.length}:${labelsRef.length}`);
              }
              const temperature = resolveAdaptiveTemperature(
                Number(process.env.MODEL_SOFTMAX_TEMPERATURE || 1.05),
                quality,
                plantCheck,
                "main"
              );
              inferenceTemperature = temperature;
              let probs = softmaxWithTemperature(logits, temperature);
              probs = applyClassTemperatureScaling(probs, labelsRef, modelMeta?.class_temperature);
              const sorted = probs
                .map((val, idx) => ({ idx, val, label: labelsRef[idx] }))
                .sort((a, b) => b.val - a.val);
              onnxResults.push({
                id: pipeline.id,
                labelsRef,
                rawSorted: sorted
              });
            });
          } catch (loopErr) {
            onnxFailures.push(`${pipeline.id}: ${String(loopErr?.message || loopErr)}`);
          }
        }
        if (onnxResults.length) {
          if (onnxResults.length === 1) {
            rawSorted = onnxResults[0].rawSorted;
            inferenceLabels = onnxResults[0].labelsRef;
            inferenceSource = `${onnxResults[0].id}-fallback`;
          } else {
            rawSorted = combineOnnxSortedPredictions(onnxResults, {
              modelWeights: ensembleModelWeights
            });
            const disagreementAdjusted = applyEnsembleDisagreementPenalty(rawSorted, onnxResults, {
              alpha: Number(process.env.MODEL_ENSEMBLE_STD_ALPHA || 1.6),
              topK: Number(process.env.MODEL_ENSEMBLE_STD_TOPK || 5)
            });
            rawSorted = disagreementAdjusted.sorted;
            ensembleDisagreementStats = disagreementAdjusted.stats;
            inferenceLabels = rawSorted.map((item) => item.label);
            inferenceSource = `onnx-ensemble-fallback(${onnxResults.map((item) => item.id).join("+")})`;
            ensembleConsensus = computeEnsembleConsensus(onnxResults);
          }
          rawSorted = applyPriorCorrection(rawSorted, modelMeta?.prior_correction);
          onnxEnsembleSize = onnxResults.length;
          label = rawSorted[0].label;
          confidence = rawSorted[0].val;
          topPredictions = rawSorted.slice(0, 3).map((item) => ({
            label: item.label,
            confidence: Number(item.val.toFixed(4))
          }));
        } else {
          inferenceError = `${inferenceError || "infer_failed"} | onnx_fallback: ${onnxFailures.join(" | ")}`;
        }
      } else {
        if (MODEL_STRICT_ONLY) {
          recordModelFailure("secondary", inferenceError || "model_unavailable_strict");
          return res
            .status(503)
            .json(buildModelInferenceFailurePayload(inferenceError || "model_unavailable_strict"));
        }
        const fallback = fallbackDiagnosis(optimizedBuffer, plant, { quality, plantCheck });
        label = fallback.label;
        confidence = fallback.confidence;
        rawSorted = Array.isArray(fallback.sorted) ? fallback.sorted : rawSorted;
        topPredictions = Array.isArray(fallback.sorted)
          ? fallback.sorted.slice(0, 3).map((item) => ({
              label: item.label,
              confidence: Number(item.val.toFixed(4))
            }))
          : topPredictions;
        inferenceSource = "demo-fallback";
      }
    } catch (innerErr) {
      inferenceError = `${inferenceError || "infer_failed"} | fallback: ${String(innerErr?.message || innerErr)}`;
      if (MODEL_STRICT_ONLY) {
        recordModelFailure("fallback", inferenceError);
        return res.status(503).json(buildModelInferenceFailurePayload(inferenceError));
      }
      const fallback = fallbackDiagnosis(optimizedBuffer, plant, { quality, plantCheck });
      label = fallback.label;
      confidence = fallback.confidence;
      rawSorted = Array.isArray(fallback.sorted) ? fallback.sorted : rawSorted;
      topPredictions = Array.isArray(fallback.sorted)
        ? fallback.sorted.slice(0, 3).map((item) => ({
            label: item.label,
            confidence: Number(item.val.toFixed(4))
          }))
        : topPredictions;
      inferenceSource = "demo-fallback";
    }
  }

  let filteredPredictions = null;
  let effectiveSorted = rawSorted;
  let filterApplied = false;
  let filterMatched = false;
  let filterBlocked = false;

  // Guard against false "healthy" when the second-best non-healthy class is too close.
  let healthyGuard = null;
  if (rawSorted?.length >= 2) {
    const top = rawSorted[0];
    const second = rawSorted[1];
    const topHealthy = String(top.label || "").toLowerCase().includes("healthy");
    const secondIssue = !String(second.label || "").toLowerCase().includes("healthy");
    const guardMargin = Number(process.env.MODEL_HEALTHY_MARGIN_GUARD || 0.09);
    const guardTop2Min = Number(process.env.MODEL_HEALTHY_TOP2_MIN || 0.22);
    if (
      topHealthy &&
      secondIssue &&
      second.val >= guardTop2Min &&
      top.val - second.val <= guardMargin
    ) {
      const adjusted = rawSorted.map((item, idx) => {
        if (idx === 0) return { ...second, val: Math.min(0.995, second.val + 0.02) };
        if (idx === 1) return { ...top, val: Math.max(0.001, top.val - 0.02) };
        return item;
      });
      rawSorted = normalizePredictionScores(adjusted);
      label = rawSorted[0].label;
      confidence = rawSorted[0].val;
      topPredictions = rawSorted.slice(0, 3).map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));
      healthyGuard = "applied";
    }
  }

  const topRawLabel = rawSorted?.[0]?.label || null;
  const suggestedPlant = labelToPlantId(topRawLabel);
  if (plant && rawSorted?.length) {
    filterApplied = true;
    const filteredRaw = rawSorted
      .filter((item) => labelToPlantId(item.label) === plant)
      .slice(0, 3);
    const filteredNormalized = normalizePredictionScores(filteredRaw);
    filteredPredictions = filteredNormalized.map((item) => ({
      label: item.label,
      confidence: Number(item.val.toFixed(4))
    }));
    if (filteredPredictions.length) {
      filterMatched = true;
      effectiveSorted = filteredNormalized;
      label = filteredPredictions[0].label;
      confidence = filteredPredictions[0].confidence;
      topPredictions = filteredPredictions;
    }
    if (strictPlant && !filterMatched) {
      filterBlocked = true;
      label = null;
      confidence = 0;
      topPredictions = filteredPredictions || [];
    }
  }

  const source = inferenceSource;
  if (!filterBlocked && Array.isArray(effectiveSorted) && effectiveSorted.length >= 2) {
    effectiveSorted = adaptPredictionDistribution(effectiveSorted, {
      qualityScore: quality?.score,
      plantScore: plantCheck?.score,
      source
    });
    if (filterApplied && filterMatched) {
      filteredPredictions = effectiveSorted.slice(0, 3).map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));
      topPredictions = filteredPredictions;
      label = filteredPredictions[0]?.label || label;
      confidence = filteredPredictions[0]?.confidence ?? confidence;
    } else if (!filterApplied) {
      topPredictions = effectiveSorted.slice(0, 3).map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));
      label = topPredictions[0]?.label || label;
      confidence = topPredictions[0]?.confidence ?? confidence;
    }
  }

  const fallbackHealthyPrecheck =
    Boolean(source && String(source).includes("fallback")) &&
    Boolean(label && String(label).toLowerCase().includes("healthy"));
  if (fallbackHealthyPrecheck && Array.isArray(topPredictions) && topPredictions.length > 1) {
    const altIssue = topPredictions.find((item, idx) => {
      if (idx === 0) return false;
      const itemLabel = String(item?.label || "").toLowerCase();
      const itemPlant = labelToPlantId(item?.label || "");
      const samePlant = !plant || !itemPlant || itemPlant === plant;
      return !itemLabel.includes("healthy") && samePlant;
    });
    if (altIssue?.label) {
      label = altIssue.label;
      confidence = Math.max(0.22, Math.min(0.9, Number(altIssue.confidence || 0.5)));
      topPredictions = [
        {
          label,
          confidence: Number(confidence.toFixed(4))
        },
        ...(topPredictions || []).filter((item) => item.label !== label).slice(0, 2)
      ];
    }
  }

  const top1 = effectiveSorted?.[0]?.val ?? (confidence || 0);
  const top2 = effectiveSorted?.[1]?.val ?? 0;
  const margin = Math.max(0, top1 - top2);
  const entropy = entropyNormalized(effectiveSorted || []);
  const safePlantScore =
    plantCheck?.score !== undefined && plantCheck?.score !== null ? Number(plantCheck.score) : null;
  confidence = calibrateConfidence(confidence, margin, entropy, safePlantScore);
  const minConfidence = Number(process.env.MODEL_MIN_CONFIDENCE || 0.45);
  const minMargin = Number(process.env.MODEL_MIN_MARGIN || 0.12);
  const plantThresholds = modelMeta?.plant_thresholds || {};
  const classThresholds = modelMeta?.class_thresholds || {};
  const ambiguityThresholds = modelMeta?.ambiguity_thresholds || modelMeta?.ambiguity || {};
  const classBalanceThresholds = modelMeta?.class_balance_thresholds || modelMeta?.class_balance || {};
  const detectedPlant = labelToPlantId(label);
  const plantMismatch = Boolean(plant && detectedPlant && plant !== detectedPlant);
  const plantMismatchPenalty = plantMismatch
    ? Number(process.env.MODEL_PLANT_MISMATCH_PENALTY || 0.08)
    : 0;
  const plantKey = plant || detectedPlant;
  const plantMinConf = plantKey && plantThresholds[plantKey]?.min_confidence;
  const plantMinMargin = plantKey && plantThresholds[plantKey]?.min_margin;
  const classRule =
    (label && (classThresholds[label] || classThresholds[normalizeLabelKey(label)])) || null;
  const plantAmbiguityRule = plantKey && ambiguityThresholds?.plant_thresholds?.[plantKey];
  const classAmbiguityRule =
    (label &&
      (ambiguityThresholds?.class_thresholds?.[label] ||
        ambiguityThresholds?.class_thresholds?.[normalizeLabelKey(label)])) ||
    null;
  const ambiguityOptions = {
    deltaMax: Number(
      process.env.MODEL_AMBIGUITY_DELTA_MAX ||
        classAmbiguityRule?.delta_max ||
        plantAmbiguityRule?.delta_max ||
        ambiguityThresholds?.delta_max ||
        0.1
    ),
    healthyAltMin: Number(
      process.env.MODEL_AMBIGUITY_HEALTHY_ALT_MIN ||
        classAmbiguityRule?.healthy_alt_min ||
        plantAmbiguityRule?.healthy_alt_min ||
        ambiguityThresholds?.healthy_alt_min ||
        0.16
    ),
    issueAltMin: Number(
      process.env.MODEL_AMBIGUITY_ISSUE_ALT_MIN ||
        classAmbiguityRule?.issue_alt_min ||
        plantAmbiguityRule?.issue_alt_min ||
        ambiguityThresholds?.issue_alt_min ||
        0.12
    ),
    penaltyPerAlt: Number(
      process.env.MODEL_AMBIGUITY_PENALTY_PER_ALT ||
        classAmbiguityRule?.penalty_per_alt ||
        plantAmbiguityRule?.penalty_per_alt ||
        ambiguityThresholds?.penalty_per_alt ||
        0.025
    ),
    marginPenaltyLow: Number(
      process.env.MODEL_AMBIGUITY_MARGIN_LOW ||
        classAmbiguityRule?.margin_penalty_low ||
        plantAmbiguityRule?.margin_penalty_low ||
        ambiguityThresholds?.margin_penalty_low ||
        0.03
    ),
    marginPenaltyMid: Number(
      process.env.MODEL_AMBIGUITY_MARGIN_MID ||
        classAmbiguityRule?.margin_penalty_mid ||
        plantAmbiguityRule?.margin_penalty_mid ||
        ambiguityThresholds?.margin_penalty_mid ||
        0.015
    ),
    maxPenalty: Number(
      process.env.MODEL_AMBIGUITY_MAX_PENALTY ||
        classAmbiguityRule?.max_penalty ||
        plantAmbiguityRule?.max_penalty ||
        ambiguityThresholds?.max_penalty ||
        0.12
    ),
    highRiskPenalty: Number(
      process.env.MODEL_AMBIGUITY_HIGH_RISK ||
        classAmbiguityRule?.high_risk_penalty ||
        plantAmbiguityRule?.high_risk_penalty ||
        ambiguityThresholds?.high_risk_penalty ||
        0.06
    )
  };
  const ambiguity = computeAmbiguityPenalty(effectiveSorted || [], label, ambiguityOptions);
  confidence = Math.max(0.01, Math.min(0.995, confidence - ambiguity.penalty));
  const plantBalanceRule = plantKey && classBalanceThresholds?.plant_thresholds?.[plantKey];
  const classBalanceRule =
    (label &&
      (classBalanceThresholds?.class_thresholds?.[label] ||
        classBalanceThresholds?.class_thresholds?.[normalizeLabelKey(label)])) ||
    null;
  const classConflict = computeClassConflict(effectiveSorted || [], label, {
    healthyIssueMassThreshold: Number(
      process.env.MODEL_CLASS_BALANCE_HEALTHY_ISSUE_MASS ||
        classBalanceRule?.healthy_issue_mass_threshold ||
        plantBalanceRule?.healthy_issue_mass_threshold ||
        classBalanceThresholds?.healthy_issue_mass_threshold ||
        0.28
    ),
    issueHealthyMassThreshold: Number(
      process.env.MODEL_CLASS_BALANCE_ISSUE_HEALTHY_MASS ||
        classBalanceRule?.issue_healthy_mass_threshold ||
        plantBalanceRule?.issue_healthy_mass_threshold ||
        classBalanceThresholds?.issue_healthy_mass_threshold ||
        0.24
    ),
    issueConflictMarginMax: Number(
      process.env.MODEL_CLASS_BALANCE_ISSUE_MARGIN_MAX ||
        classBalanceRule?.issue_conflict_margin_max ||
        plantBalanceRule?.issue_conflict_margin_max ||
        classBalanceThresholds?.issue_conflict_margin_max ||
        0.14
    )
  });
  confidence = Math.max(0.01, Math.min(0.995, confidence - classConflict.penalty));
  confidence = Math.max(0.01, Math.min(0.995, confidence - plantMismatchPenalty));
  const classMinConf = typeof classRule?.min_confidence === "number" ? classRule.min_confidence : null;
  const classMinMargin = typeof classRule?.min_margin === "number" ? classRule.min_margin : null;
  const baseEffectiveMinConf = Math.max(
    minConfidence,
    typeof plantMinConf === "number" ? plantMinConf : 0,
    typeof classMinConf === "number" ? classMinConf : 0
  );
  const baseEffectiveMinMargin = Math.max(
    minMargin,
    typeof plantMinMargin === "number" ? plantMinMargin : 0,
    typeof classMinMargin === "number" ? classMinMargin : 0
  );
  const uncertaintyConfBoost = Number(process.env.MODEL_UNCERTAINTY_CONF_BOOST || 0.04);
  const uncertaintyMarginBoost = Number(process.env.MODEL_UNCERTAINTY_MARGIN_BOOST || 0.03);
  const plantScoreBoost =
    safePlantScore !== null && safePlantScore < 0.45
      ? Number(process.env.MODEL_PLANT_SCORE_CONF_BOOST || 0.02)
      : 0;
  const uncertaintyBoost =
    ambiguity.highRisk || classConflict.healthyIssueConflict || classConflict.issueHealthyConflict
      ? 1
      : 0;
  const effectiveMinConf = Math.min(
    0.95,
    baseEffectiveMinConf + uncertaintyConfBoost * uncertaintyBoost + plantScoreBoost
  );
  const effectiveMinMargin = Math.min(
    0.5,
    baseEffectiveMinMargin + uncertaintyMarginBoost * uncertaintyBoost
  );
  confidence = blendConfidence(confidence, top1, Number(process.env.MODEL_CONF_BLEND || 0.58));
  const lowConfidence = top1 < effectiveMinConf || margin < effectiveMinMargin;
  const uncertaintyScore = computeUncertaintyScore({
    entropyNorm: entropy,
    ambiguityPenalty: ambiguity.penalty,
    classConflictPenalty: classConflict.penalty,
    ensembleDisagreement: ensembleConsensus?.disagreement || 0,
    ensembleStd: ensembleDisagreementStats?.avgTopStd || 0,
    plantScore: safePlantScore,
    plantMismatch: plantMismatch ? 1 : 0
  });
  const uncertaintyHigh = uncertaintyScore >= Number(process.env.MODEL_UNCERTAINTY_HIGH || 58);
  const fallbackHealthy =
    Boolean(source && String(source).includes("fallback")) &&
    Boolean(label && String(label).toLowerCase().includes("healthy"));
  confidence = calibrateFinalConfidence(confidence, {
    source,
    isHealthy: String(label || "").toLowerCase().includes("healthy"),
    uncertaintyScore,
    uncertaintyHigh,
    ambiguityHigh: ambiguity.highRisk,
    classConflictHigh: classConflict.healthyIssueConflict || classConflict.issueHealthyConflict,
    top1,
    margin
  });
  const confidenceCalibration = modelMeta?.confidence_calibration || {};
  confidence = applyConfidenceCalibration(confidence, label, confidenceCalibration, { source });
  confidence = sharpenConfidenceSeparation(confidence, {
    source,
    isHealthy: String(label || "").toLowerCase().includes("healthy"),
    top1,
    margin,
    entropyNorm: entropy
  });

  const normalizedLabel = normalizeLabelKey(label);
  const disease =
    (labelMetadata && (labelMetadata[label] || labelMetadata[normalizedLabel])) ||
    (filterBlocked
      ? {
          id: "no_match",
          name: "Bitki eslesmesi yok",
          severity: "low",
          summary:
            "Secilen bitki icin model net bir eslesme bulamadi. Daha net bir fotograf veya farkli aci deneyin.",
          actions: ["Yeni fotograf cekin.", "Ayni bitkiye yakin plandan cekin."]
        }
      : {
          id: "unknown",
          name: prettyLabel(label),
          severity: inferSeverity(label),
          summary: "Bu sinif icin ozel aciklama bulunamadi.",
          actions: ["Daha net bir gorsel yukleyin.", "Isik ve aciyi iyilestirin."]
        });

  const topPredictionsDetailed = (topPredictions || []).map((item) => ({
    ...item,
    pretty: prettyLabel(item.label),
    plant: labelToPlantId(item.label)
  }));
  const plantMatch = Boolean(plant && detectedPlant && plant === detectedPlant);
  const warnings = [];
  if (plant && detectedPlant && plant !== detectedPlant) {
    warnings.push(
      `Secilen bitki (${plant}) ile tespit edilen bitki (${detectedPlant}) uyusmuyor.`
    );
  }
  if (plant && rawSorted?.length && !(filteredPredictions && filteredPredictions.length)) {
    warnings.push("Bu bitki icin guclu bir eslesme bulunamadi. Fotografu yenileyin.");
  }
  if (filterBlocked) {
    warnings.push("Bitki filtresi etkin: eslesme bulunamadigi icin sonuc kilitlendi.");
  }
  if (fallbackHealthy) {
    warnings.push("Fallback modelde saglikli sonuc review modunda degerlendirildi.");
  }
  if (confidence !== null && confidence < effectiveMinConf) {
    warnings.push("Guven dusuk. Daha net ve yakindan fotograf yukleyin.");
  }
  if (
    (top1 < effectiveMinConf || margin < effectiveMinMargin) &&
    !warnings.includes("Guven dusuk. Daha net ve yakindan fotograf yukleyin.")
  ) {
    warnings.push("Model guveni dusuk veya sinif farki dar. Yeniden fotograf onerilir.");
  }
  if (quality?.warnings?.length) {
    warnings.push(...quality.warnings);
  }
  if (ambiguity.highRisk) {
    warnings.push(
      `Model belirsizligi yuksek: yakin alternatif sayisi ${ambiguity.closeCount}. Ek cekim onerilir.`
    );
  }
  if (classConflict.healthyIssueConflict || classConflict.issueHealthyConflict) {
    warnings.push(
      "Sinif dengesi catismasi: alternatif durum olasiligi yuksek. Sonucu dogrulayin."
    );
  }
  if (uncertaintyHigh) {
    warnings.push(`Belirsizlik skoru yuksek (${uncertaintyScore}/100). Ek cekimle dogrulayın.`);
  }
  if (plantCheck?.score !== undefined && plantCheck.score < 0.35) {
    warnings.push("Gorsel bitki gibi gorunmuyor. Bitkiyi kadraja al.");
  }
  if (ensembleConsensus?.unstable) {
    warnings.push(
      `Cift model uyumsuzlugu: tahminler farkli (uyum ${Math.round(
        ensembleConsensus.agreement * 100
      )}%). Sonucu dikkatle degerlendirin.`
    );
  }

  const qualityGate =
    (quality?.brightness !== undefined && quality.brightness < 0.2) ||
    (quality?.contrast !== undefined && quality.contrast < 0.05);
  if (qualityGate) {
    warnings.push("Fotograf kalitesi dusuk. Yeniden cekim onerilir.");
  }

  const retrySuggested =
    filterBlocked ||
    (confidence !== null && confidence < effectiveMinConf) ||
    (quality?.warnings?.length ?? 0) > 0 ||
    qualityGate ||
    (plantCheck?.score !== undefined && plantCheck.score < 0.25);
  const reasons = explainDiagnosis(label, quality, confidence, margin);
  const reliability = computeReliability({
    top1,
    margin,
    minConf: effectiveMinConf,
    minMargin: effectiveMinMargin,
    quality,
    plantCheck,
    source,
    ensembleConsensus,
    ambiguityPenalty: ambiguity.penalty,
    classConflictPenalty: classConflict.penalty,
    plantMismatchPenalty
  });
  if (reliability.unstable) {
    warnings.push(`Sonuc guvenilirligi dusuk (${reliability.score}/100). Yeniden cekim onerilir.`);
  }
  const decision = (() => {
    const flags = [];
    if (filterBlocked) flags.push("plant_filter_no_match");
    if (qualityGate) flags.push("low_quality");
    if (confidence !== null && confidence < effectiveMinConf) flags.push("low_confidence");
    if (margin < effectiveMinMargin) flags.push("low_margin");
    if (plantCheck?.score !== undefined && plantCheck.score < 0.25) flags.push("non_plant_suspected");
    if (ensembleConsensus?.unstable) flags.push("ensemble_disagreement");
    if (ambiguity.highRisk) flags.push("high_ambiguity");
    if (classConflict.healthyIssueConflict || classConflict.issueHealthyConflict) {
      flags.push("class_balance_conflict");
    }
    if (plantMismatch) flags.push("plant_mismatch");
    if (uncertaintyHigh) flags.push("high_uncertainty");
    if (reliability.unstable) flags.push("low_reliability");
    let status = "ok";
    if (filterBlocked) status = "blocked";
    else if (flags.length) status = "review";
    return {
      status,
      flags,
      needsRetake: status !== "ok",
      message:
        status === "ok"
          ? "Analiz net."
          : status === "blocked"
            ? "Bitki eslesmesi yok."
            : "Analiz destek istiyor."
    };
  })();
  const retryPlan = buildRetryPlan({
    qualityGate,
    qualityWarnings: quality?.warnings?.length ?? 0,
    nonPlantSuspected: plantCheck?.score !== undefined && plantCheck.score < 0.25,
    lowMargin: margin < effectiveMinMargin,
    lowConfidence: confidence !== null && confidence < effectiveMinConf,
    ensembleDisagreement: Boolean(ensembleConsensus?.unstable),
    ambiguityHigh: ambiguity.highRisk,
    classConflict: classConflict.healthyIssueConflict || classConflict.issueHealthyConflict,
    plantMismatch,
    highUncertainty: uncertaintyHigh,
    lowReliability: reliability.unstable
  });
  const retryTips = retryPlan.map((item) => item.text);

  const ttaEnabled = inferenceSource.startsWith("onnx") && process.env.MODEL_TTA === "true";
  markStage(req, "postprocess");
  let diagnosisStatus = inferStatus(label, {
    source,
    top1,
    plantScore: safePlantScore,
    ensembleUnstable: Boolean(ensembleConsensus?.unstable),
    ambiguityHigh: ambiguity.highRisk,
    classConflictHigh: classConflict.healthyIssueConflict || classConflict.issueHealthyConflict,
    healthyIssueConflict: classConflict.healthyIssueConflict,
    issueHealthyConflict: classConflict.issueHealthyConflict,
    plantMismatch,
    uncertaintyHigh,
    reliabilityUnstable: reliability.unstable,
    lowConfidence,
    margin,
    minMargin: effectiveMinMargin,
    filterBlocked,
    topPredictions
  });
  if (diagnosisStatus === "healthy" && reliability.unstable) {
    diagnosisStatus = "review";
  }

  const response = {
    id: crypto.randomUUID(),
    file: {
      name: req.file.originalname,
      type: req.file.mimetype,
      sizeKb: Math.round(req.file.size / 1024)
    },
    plant,
    detectedPlant,
    quality,
    plantCheck,
    model: {
      source,
      inputSize: INPUT_SIZE,
      labels: inferenceLabels?.length || getActiveLabels().length || null,
      ensembleSize: onnxEnsembleSize || null,
      ensembleConsensus,
      ensembleDisagreement: ensembleDisagreementStats,
      ensembleWeighting: ensembleModelWeights ? "meta" : "adaptive_top1",
      classTemperatureScaling: Boolean(modelMeta?.class_temperature),
      softmaxTemperature:
        inferenceTemperature === null
          ? Number(process.env.MODEL_SOFTMAX_TEMPERATURE || 1.05)
          : Number(inferenceTemperature.toFixed(4)),
      tta: ttaEnabled,
      minConfidence: effectiveMinConf,
      minMargin: effectiveMinMargin,
      baseMinConfidence: baseEffectiveMinConf,
      baseMinMargin: baseEffectiveMinMargin,
      version: MODEL_VERSION,
      gitSha: GIT_SHA,
      fallbackUsed: source.includes("fallback"),
      rescue: rescueInfo,
      healthyGuard,
      error: inferenceError
    },
    modelMetrics: {
      top1: Number(top1.toFixed(4)),
      top2: Number(top2.toFixed(4)),
      margin: Number(margin.toFixed(4)),
      entropy: Number(entropy.toFixed(4)),
      lowConfidence,
      ambiguityPenalty: Number(ambiguity.penalty.toFixed(4)),
      ambiguityCloseCount: ambiguity.closeCount,
      ambiguityHighRisk: ambiguity.highRisk,
      ambiguityDeltaMax: Number(ambiguityOptions.deltaMax.toFixed(4)),
      classConflictPenalty: Number(classConflict.penalty.toFixed(4)),
      classConflictHealthyIssue: classConflict.healthyIssueConflict,
      classConflictIssueHealthy: classConflict.issueHealthyConflict,
      plantMismatch,
      plantMismatchPenalty: Number(plantMismatchPenalty.toFixed(4)),
      ensembleAvgTopStd: Number(ensembleDisagreementStats?.avgTopStd || 0),
      ensembleMaxTopStd: Number(ensembleDisagreementStats?.maxTopStd || 0),
      uncertaintyScore,
      uncertaintyHigh
    },
    filter: {
      applied: filterApplied,
      matched: filterMatched,
      strict: strictPlant,
      blocked: filterBlocked
    },
    plantMatch,
    qualityGate,
    decision,
    suggestedPlant,
    diagnosis: {
      id: disease.id,
      name: disease.name,
      severity: inferSeverity(label, diagnosisStatus),
      summary: disease.summary,
      confidence: Math.min(0.99, Number(confidence.toFixed(3))),
      confidenceRaw: Number(confidence.toFixed(4)),
      confidencePct: Math.round(confidence * 1000) / 10,
      confidenceTier: confidenceTier(confidence || 0),
      status: diagnosisStatus,
      problemArea: inferProblemArea(label)
    },
    warnings,
    retrySuggested: retrySuggested || reliability.unstable,
    retryTips,
    retryPlan,
    reasons,
    reliability,
    carePlan: disease.actions,
    treatments:
      disease.treatments ||
      buildDefaultTreatments({
        label,
        diseaseName: disease.name,
        status: diagnosisStatus
      }),
    topPredictions,
    topPredictionsDetailed,
    notes:
      source.startsWith("onnx")
        ? "Bu sonuc ONNX modelinden uretilmistir. Kesin teshis icin uzman onayi gerekir."
        : source.startsWith("model-api")
          ? "Bu sonuc harici model API uzerinden uretilmistir. Kesin teshis icin uzman onayi gerekir."
        : source.startsWith("python")
          ? "Bu sonuc Python modeliyle uretilmistir. Kesin teshis icin uzman onayi gerekir."
          : "Bu sonuc demo modundadir. Gercek teshis icin modeli yukleyin."
  };

  recordModelPredictionStat({
    label,
    confidence,
    source,
    plant,
    status: diagnosisStatus
  });
  clearModelFailureOnSuccess();
  setCache(cacheKey, response);
  markStage(req, "response");
  res.json(response);
});

app.post("/api/contact", upload.single("attachment"), async (req, res) => {
  const transport = getMailer();
  if (!transport) {
    return res.status(501).json({ error: "smtp_not_configured" });
  }
  const { name, email, subject, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "missing_fields" });
  }
  try {
    const attachments = [];
    if (req.file) {
      attachments.push({
        filename: req.file.originalname,
        content: req.file.buffer,
        contentType: req.file.mimetype
      });
    }
    await transport.sendMail({
      from: SMTP_FROM,
      to: SMTP_TO,
      replyTo: email,
      subject: subject ? `[AgroGuard] ${subject}` : "[AgroGuard] Danismanlik Talebi",
      text: `Ad: ${name}
E-posta: ${email}

${message}`,
      attachments
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "mail_send_failed" });
  }
});

loadCacheFromDisk();
loadLandListingsFromDisk();
loadLandCustomModelFromDisk();
loadTradeMarketFromDisk();
loadModel();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inferCache.entries()) {
    if (now - value.ts > INFER_CACHE_TTL_MS) {
      inferCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, HOST, () => {
  console.log(`API server running on http://${HOST}:${PORT}`);
});
