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
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || "AgroGuard/1.0 (contact: gs7016903@gmail.com)";
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
const SOIL_GEO_TIMEOUT_MS = Number(process.env.SOIL_GEO_TIMEOUT_MS || 7000);
const SOIL_SOURCE_TIMEOUT_MS = Number(process.env.SOIL_SOURCE_TIMEOUT_MS || 5000);

const marketCache = new Map();
const MARKET_CACHE_TTL_MS = 30 * 60 * 1000;
const MARKET_FETCH_TIMEOUT_MS = Number(process.env.MARKET_FETCH_TIMEOUT_MS || 2200);
const newsCache = new Map();
const NEWS_CACHE_TTL_MS = Number(process.env.NEWS_CACHE_TTL_MS || 5 * 60 * 1000);
const anomalyIntelCache = new Map();
const ANOMALY_INTEL_CACHE_TTL_MS = Number(process.env.ANOMALY_INTEL_CACHE_TTL_MS || 30 * 60 * 1000);
const integrationsHealthCache = new Map();
const INTEGRATIONS_HEALTH_CACHE_TTL_MS = Number(process.env.INTEGRATIONS_HEALTH_CACHE_TTL_MS || 2 * 60 * 1000);
const landPriceCache = new Map();
const LAND_PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HACKHATON_ROOT = (process.env.HACKHATON_ROOT || path.join(os.homedir(), "Hackhaton")).trim();
const HACKHATON_OUTPUT_ROOT = path.join(HACKHATON_ROOT, "output");
const HACKHATON_CACHE_TTL_MS = Number(process.env.HACKHATON_CACHE_TTL_MS || 2 * 60 * 1000);
const hackhatonCache = new Map();
const irrigationClimateCache = new Map();
const longTermClimateCache = new Map();
const LONGTERM_CLIMATE_CACHE_TTL_MS = Number(process.env.LONGTERM_CLIMATE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const GDELT_DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const CHRONICLING_AMERICA_SEARCH_URL = "https://chroniclingamerica.loc.gov/search/pages/results/";
const landPriceHistory = new Map();
const LAND_PRICE_HISTORY_LIMIT = Number(process.env.LAND_PRICE_HISTORY_LIMIT || 40);
const LAND_DISCOVERY_ENABLED = process.env.LAND_DISCOVERY_ENABLED !== "false";
const LAND_DISCOVERY_TIMEOUT_MS = Number(process.env.LAND_DISCOVERY_TIMEOUT_MS || 6500);
const LAND_DISCOVERY_MAX_SOURCES = Number(process.env.LAND_DISCOVERY_MAX_SOURCES || 5);
const LAND_DISCOVERY_FAST_TIMEOUT_MS = Number(process.env.LAND_DISCOVERY_FAST_TIMEOUT_MS || 1300);
const LAND_DISCOVERY_FAST_MAX_SOURCES = Number(process.env.LAND_DISCOVERY_FAST_MAX_SOURCES || 2);
const LAND_PROVIDER_TIMEOUT_MS = Number(process.env.LAND_PROVIDER_TIMEOUT_MS || 7000);
const LAND_PRICE_REMOTE_BUDGET_MS = Number(process.env.LAND_PRICE_REMOTE_BUDGET_MS || 1800);
const LAND_PRICE_INTERNET_BUDGET_MS = Number(process.env.LAND_PRICE_INTERNET_BUDGET_MS || 1800);
const LAND_PRICE_FAST_MODE_DEFAULT = process.env.LAND_PRICE_FAST_MODE !== "false";
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
const SUPERAPP_RUNTIME_FILE = path.join(__dirname, "data", "superapp_runtime.json");
let landManualListings = [];
let landCustomModel = null;
const TRADE_MARKET_FILE = path.join(__dirname, "data", "trade_market.json");
let tradeListings = [];
let tradeOffers = [];
let tradeOrders = [];
let tradeMessages = [];
let tradeRatings = [];
let tradeAlerts = [];
let superAppRuntimeState = null;

const SUPERAPP_MODULE_CATALOG = [
  { id: "smart_farm", title: "AI Vision" },
  { id: "climate_risk", title: "Iklim risk" },
  { id: "soil_fertilizer", title: "Toprak + gubre" },
  { id: "smart_irrigation", title: "Akilli sulama" },
  { id: "field_logbook", title: "Tarla gunlugu" },
  { id: "market_price", title: "Pazar/fiyat" },
  { id: "fintech", title: "Finans destekleri" },
  { id: "ecommerce", title: "E-ticaret" },
  { id: "ai_chatbot", title: "AI danisman" },
  { id: "yield_profit", title: "Verim/karlilik" },
  { id: "satellite_drone", title: "Uydu + drone" },
  { id: "community_training", title: "Topluluk/egitim" },
  { id: "logistics_storage", title: "Lojistik/depolama" },
  { id: "carbon_sustainability", title: "Karbon/surdurulebilirlik" }
];

const IRRIGATION_METHOD_LIBRARY = {
  damla: { key: "damla", label: "Damla", efficiency: 0.9, window: "06:00-08:00" },
  yagmurlama: { key: "yagmurlama", label: "Yagmurlama", efficiency: 0.75, window: "05:30-07:30" },
  salma: { key: "salma", label: "Salma", efficiency: 0.6, window: "04:30-06:30" }
};

const IRRIGATION_WATER_SOURCE_LIBRARY = {
  baraj_kanal: {
    key: "baraj_kanal",
    label: "Baraj / kanal",
    aliases: ["baraj", "kanal", "surface", "yuzey"],
    defaultNightSharePct: 65,
    notes: ["Merkezi dagitim ve mevsimsel kisit riski daha yuksek."]
  },
  kuyu: {
    key: "kuyu",
    label: "Kuyu / pompaj",
    aliases: ["kuyu", "yeralti", "pompaj", "groundwater"],
    defaultNightSharePct: 78,
    notes: ["Enerji maliyeti ve pompa saati baskisi ana kisit."]
  },
  karma: {
    key: "karma",
    label: "Karma kaynak",
    aliases: ["karma", "mixed", "hibrit"],
    defaultNightSharePct: 72,
    notes: ["Kaynaklar arasi gecis esneklik saglar ama planlama gerektirir."]
  }
};

const IRRIGATION_CROP_LIBRARY = {
  domates: {
    key: "domates",
    label: "Domates",
    aliases: ["domates", "tomato"],
    defaultPlantingMonthDay: "04-15",
    seasonLengthDays: 170,
    stageLengths: { initial: 30, development: 40, mid: 60, late: 40 },
    kc: { initial: 0.6, mid: 1.15, end: 0.8 },
    rootDepthM: 0.9,
    depletionFraction: 0.4,
    notes: ["FAO crop profile: rooting depth 0.7-1.5 m", "FAO example depletion fraction p ~0.40"]
  },
  misir: {
    key: "misir",
    label: "Misir",
    aliases: ["misir", "corn", "maize"],
    defaultPlantingMonthDay: "05-01",
    seasonLengthDays: 150,
    stageLengths: { initial: 25, development: 30, mid: 55, late: 40 },
    kc: { initial: 0.35, mid: 1.2, end: 0.6 },
    rootDepthM: 1.0,
    depletionFraction: 0.55,
    notes: ["FAO crop profile: rooting depth 0.6-2.0 m", "FAO depletion fraction p ~0.55"]
  },
  aycicegi: {
    key: "aycicegi",
    label: "Aycicegi",
    aliases: ["aycicegi", "sunflower"],
    defaultPlantingMonthDay: "05-01",
    seasonLengthDays: 140,
    stageLengths: { initial: 20, development: 30, mid: 50, late: 40 },
    kc: { initial: 0.4, mid: 1.15, end: 0.35 },
    rootDepthM: 1.2,
    depletionFraction: 0.45,
    notes: ["Hackhaton crop calendar stage lengths", "Sunflower root depth is treated as deep-rooted field crop"]
  },
  bag_uzum: {
    key: "bag_uzum",
    label: "Bag / Uzum",
    aliases: ["bag_uzum", "uzum", "grape", "vineyard"],
    defaultPlantingMonthDay: "04-01",
    seasonLengthDays: 210,
    stageLengths: { initial: 30, development: 50, mid: 90, late: 40 },
    kc: { initial: 0.3, mid: 0.85, end: 0.45 },
    rootDepthM: 1.1,
    depletionFraction: 0.5,
    notes: ["Hackhaton crop calendar stage lengths", "Perennial vineyard schedule uses seasonal Kc envelope"]
  },
  bugday_kislik: {
    key: "bugday_kislik",
    label: "Bugday (kislik)",
    aliases: ["bugday_kislik", "bugday", "wheat", "winter_wheat"],
    defaultPlantingMonthDay: "11-01",
    seasonLengthDays: 240,
    stageLengths: { initial: 30, development: 60, mid: 90, late: 60 },
    kc: { initial: 0.4, mid: 1.15, end: 0.25 },
    rootDepthM: 1.0,
    depletionFraction: 0.55,
    notes: ["Hackhaton crop calendar stage lengths", "FAO wheat profile typically uses p around 0.55"]
  }
};

const IRRIGATION_RESEARCH_REFS = [
  {
    id: "fao56-single-kc",
    title: "FAO-56: single crop coefficient approach",
    url: "https://www.fao.org/4/X0490E/x0490e0b.htm",
    note: "ETc = Kc x ET0"
  },
  {
    id: "fao56-scheduling",
    title: "FAO-56: irrigation scheduling and soil water balance",
    url: "https://www.fao.org/4/X0490E/x0490e0e.htm",
    note: "TAW, RAW and root-zone depletion"
  },
  {
    id: "cropwat",
    title: "FAO CROPWAT",
    url: "https://www.fao.org/land-water/databases-and-software/cropwat/en/",
    note: "Daily soil water balance used for irrigation planning"
  },
  {
    id: "open-meteo-et0",
    title: "Open-Meteo docs",
    url: "https://open-meteo.com/en/docs",
    note: "Daily et0_fao_evapotranspiration forecast variable"
  }
];

const IRRIGATION_REFERENCE_SCENARIOS = {
  dry: {
    key: "dry",
    label: "Kuru yil",
    et0Field: "et0P75",
    precipField: "precipP25",
    note: "Yuksek evaporasyon ve zayif yagis senaryosu"
  },
  normal: {
    key: "normal",
    label: "Normal yil",
    et0Field: "et0Mean",
    precipField: "precipMedian",
    note: "Cok yilli median yagis ve ortalama ET0"
  },
  wet: {
    key: "wet",
    label: "Nemli yil",
    et0Field: "et0P25",
    precipField: "precipP75",
    note: "Dusuk ET0 ve yuksek yagis senaryosu"
  }
};

function buildDefaultSuperAppRuntime() {
  const modules = {};
  SUPERAPP_MODULE_CATALOG.forEach((item) => {
    modules[item.id] = {
      id: item.id,
      title: item.title,
      status: "ready",
      runCount: 0,
      lastRunAt: null,
      lastResult: null
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    modules
  };
}

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

function loadSuperAppRuntimeFromDisk() {
  try {
    if (!fs.existsSync(SUPERAPP_RUNTIME_FILE)) {
      superAppRuntimeState = buildDefaultSuperAppRuntime();
      return;
    }
    const raw = fs.readFileSync(SUPERAPP_RUNTIME_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const base = buildDefaultSuperAppRuntime();
    if (parsed && parsed.modules && typeof parsed.modules === "object") {
      Object.keys(base.modules).forEach((id) => {
        if (parsed.modules[id] && typeof parsed.modules[id] === "object") {
          base.modules[id] = { ...base.modules[id], ...parsed.modules[id], id };
        }
      });
    }
    base.updatedAt = parsed?.updatedAt || new Date().toISOString();
    superAppRuntimeState = base;
  } catch (_) {
    superAppRuntimeState = buildDefaultSuperAppRuntime();
  }
}

function saveSuperAppRuntimeToDisk() {
  try {
    if (!superAppRuntimeState) superAppRuntimeState = buildDefaultSuperAppRuntime();
    fs.mkdirSync(path.dirname(SUPERAPP_RUNTIME_FILE), { recursive: true });
    fs.writeFileSync(SUPERAPP_RUNTIME_FILE, JSON.stringify(superAppRuntimeState, null, 2));
  } catch (_) {
    // ignore
  }
}

function runSuperAppModuleSimulation(moduleId, payload = {}) {
  const nowIso = new Date().toISOString();
  const city = String(payload.city || "Malatya");
  const responses = {
    smart_farm: { healthIndex: 78, anomaly: "dusuk", zone: "parsel-3", note: "AI Vision calisti" },
    climate_risk: { frostRisk: false, hailRisk: "dusuk", rainMm5d: 11, city },
    soil_fertilizer: { npkGap: { n: "orta", p: "dusuk", k: "normal" }, plan: "N agirlikli gubreleme" },
    smart_irrigation: { moisture: 0.24, recommendation: "36 saat sonra damla sulama", autoWindow: "06:00-07:10" },
    field_logbook: { entriesToday: 3, photos: 5, latest: "Yaprak kontrolu kaydedildi" },
    market_price: { medianTlKg: 18.7, spreadPct: 4.2, listingCount: 42 },
    fintech: { grantWindowOpen: true, activeCredits: 2, insuranceQuote: "hazir" },
    ecommerce: { suppliers: 17, bestBasketDeltaPct: -6.3, qrCheck: "ok" },
    ai_chatbot: { answerQuality: "iyi", responseMs: 940, topic: "ekim zamani" },
    yield_profit: { grossTl: 780000, netTl: 218000, roiPct: 39 },
    satellite_drone: { ndviMean: 0.63, weakAreaPct: 9.5, parcel: "A-12" },
    community_training: { forumPosts: 14, liveSessions: 2, qaOpen: 6 },
    logistics_storage: { coldStorageFillPct: 71, matchCount: 4, etaHours: 6 },
    carbon_sustainability: { waterReportReady: true, carbonKgCo2e: 4210, certificateStep: "hazirlik" }
  };
  return {
    ok: true,
    moduleId,
    ranAt: nowIso,
    output: responses[moduleId] || { message: "Module simulation completed" }
  };
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

function runWithTimeoutFallback(taskOrPromise, timeoutMs = 3000, fallbackValue = null) {
  const budgetMs = Math.max(200, Number(timeoutMs || 0));
  const taskPromise =
    typeof taskOrPromise === "function"
      ? Promise.resolve().then(() => taskOrPromise())
      : Promise.resolve(taskOrPromise);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallbackValue);
    }, budgetMs);
    taskPromise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
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

function buildUnavailableWeather(city, coords = null, reason = null, extra = {}) {
  return {
    city,
    coords,
    temp: null,
    tempMin: null,
    tempMax: null,
    humidity: null,
    windKmh: null,
    windGustKmh: null,
    precipitationMm: null,
    cloudCoverPct: null,
    condition: null,
    frostRisk: false,
    localTime: null,
    timeZone: "Europe/Istanbul",
    updatedAt: new Date().toISOString(),
    source: "unavailable",
    live: false,
    warning: reason || "canli_veri_alinamadi",
    ...extra
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

function buildUnavailableForecast(city, coords = null, reason = null, extra = {}) {
  return {
    city,
    coords,
    days: [],
    hourly: [],
    timeZone: "Europe/Istanbul",
    source: "unavailable",
    live: false,
    warning: reason || "canli_tahmin_alinamadi",
    ...extra
  };
}

function buildUnavailableSoil(city, coords = null, reason = null, extra = {}) {
  return {
    city,
    coords,
    source: "unavailable",
    live: false,
    scopeLevel: "city",
    soilType: null,
    ph: null,
    organic: null,
    clay: null,
    sand: null,
    silt: null,
    nitrogen: null,
    cec: null,
    bulkDensity: null,
    recommended: [],
    risky: [],
    diseaseRisk: [],
    internetSources: [],
    internetSignals: null,
    plantSuitability: [],
    managementPlan: null,
    soilHealth: null,
    soilIndices: null,
    note: reason || "canli_toprak_verisi_alinamadi",
    warning: reason || "canli_toprak_verisi_alinamadi",
    ...extra
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

function resolveHealthyIssueConflict(sortedItems = [], ctx = {}) {
  if (!Array.isArray(sortedItems) || sortedItems.length < 2) {
    return {
      applied: false,
      reason: "insufficient_predictions",
      sorted: Array.isArray(sortedItems) ? sortedItems : []
    };
  }
  const top = sortedItems[0];
  const topLabel = String(top?.label || "").toLowerCase();
  const topIsHealthy = topLabel.includes("healthy");
  if (!topIsHealthy) {
    return {
      applied: false,
      reason: "top_not_healthy",
      sorted: sortedItems
    };
  }

  const plant = ctx?.plant ? String(ctx.plant) : null;
  const source = String(ctx?.source || "");
  const issueCandidates = sortedItems
    .slice(1, 6)
    .filter((item) => !String(item?.label || "").toLowerCase().includes("healthy"))
    .filter((item) => {
      if (!plant) return true;
      const itemPlant = labelToPlantId(item?.label || "");
      return !itemPlant || itemPlant === plant;
    });
  if (!issueCandidates.length) {
    return {
      applied: false,
      reason: "no_issue_candidate",
      sorted: sortedItems
    };
  }

  const bestIssue = issueCandidates.reduce((best, row) =>
    Number(row?.val || 0) > Number(best?.val || 0) ? row : best
  );
  const issueMass = issueCandidates.reduce((acc, row) => acc + Number(row?.val || 0), 0);
  const topVal = Number(top?.val || 0);
  const issueVal = Number(bestIssue?.val || 0);
  const margin = Math.max(0, topVal - issueVal);

  const sourceIsFallback = source.includes("fallback");
  const issueMassMinBase = Number(process.env.MODEL_HEALTHY_ISSUE_MASS_REVIEW || 0.36);
  const issueAltMinBase = Number(process.env.MODEL_HEALTHY_ISSUE_ALT_REVIEW || 0.2);
  const issueMarginMaxBase = Number(process.env.MODEL_HEALTHY_ISSUE_MARGIN_REVIEW || 0.1);
  const issueMassMin = Math.max(0.2, issueMassMinBase - (sourceIsFallback ? 0.05 : 0));
  const issueAltMin = Math.max(0.12, issueAltMinBase - (sourceIsFallback ? 0.03 : 0));
  const issueMarginMax = Math.min(0.24, issueMarginMaxBase + (sourceIsFallback ? 0.04 : 0));

  const shouldOverride =
    issueVal >= issueAltMin && issueMass >= issueMassMin && margin <= issueMarginMax;

  if (!shouldOverride) {
    return {
      applied: false,
      reason: "threshold_not_met",
      issueMass: Number(issueMass.toFixed(4)),
      issueTop: Number(issueVal.toFixed(4)),
      margin: Number(margin.toFixed(4)),
      sorted: sortedItems
    };
  }

  const marginPressure = clamp01(1 - margin / Math.max(issueMarginMax, 0.01));
  const massPressure = clamp01(issueMass / Math.max(issueMassMin, 0.001));
  const lift = Math.min(0.07, Math.max(0.015, 0.012 + marginPressure * 0.03 + massPressure * 0.01));
  const adjusted = sortedItems.map((row) => {
    if (row.label === top.label) return { ...row, val: Math.max(1e-6, Number(row.val || 0) - lift) };
    if (row.label === bestIssue.label) return { ...row, val: Number(row.val || 0) + lift };
    return row;
  });
  const normalized = normalizePredictionScores(adjusted).sort((a, b) => b.val - a.val);
  const swapped = String(normalized?.[0]?.label || "") === String(bestIssue?.label || "");

  return {
    applied: swapped,
    reason: swapped ? "healthy_issue_override" : "insufficient_swap_gain",
    originalTopLabel: top.label,
    overrideLabel: bestIssue.label,
    issueMass: Number(issueMass.toFixed(4)),
    issueTop: Number(issueVal.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    thresholds: {
      issueMassMin: Number(issueMassMin.toFixed(4)),
      issueAltMin: Number(issueAltMin.toFixed(4)),
      issueMarginMax: Number(issueMarginMax.toFixed(4))
    },
    sorted: normalized
  };
}

function buildConfidenceProfile(ctx = {}) {
  const top1 = clamp01(Number(ctx.top1 || 0));
  const top2 = clamp01(Number(ctx.top2 || 0));
  const margin = clamp01(Number(ctx.margin || 0));
  const entropy = clamp01(Number(ctx.entropy || 0));
  const uncertainty = clamp01((Number(ctx.uncertaintyScore || 0) || 0) / 100);
  const reliability = clamp01((Number(ctx.reliabilityScore || 0) || 0) / 100);
  const quality = clamp01(
    ctx.qualityScore === null || ctx.qualityScore === undefined ? 0.62 : Number(ctx.qualityScore)
  );
  const plantScore = clamp01(
    ctx.plantScore === null || ctx.plantScore === undefined ? 0.62 : Number(ctx.plantScore)
  );
  const separationNorm = clamp01((margin - 0.03) / 0.28);
  const topNorm = clamp01((top1 - 0.28) / 0.56);
  const entropyNorm = clamp01(1 - entropy);
  const uncertaintyNorm = clamp01(1 - uncertainty);

  let score =
    topNorm * 24 +
    separationNorm * 20 +
    entropyNorm * 12 +
    reliability * 22 +
    uncertaintyNorm * 12 +
    quality * 5 +
    plantScore * 5;

  if (ctx.ambiguityHigh) score -= 8;
  if (ctx.classConflict) score -= 9;
  if (ctx.plantMismatch) score -= 8;
  if (ctx.source && String(ctx.source).includes("fallback")) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons = [];
  const blockers = [];
  if (topNorm >= 0.72) reasons.push("Top1 olasiligi yuksek.");
  if (separationNorm >= 0.65) reasons.push("Sinif ayrimi net.");
  if (entropyNorm >= 0.62) reasons.push("Tahmin dagilimi odakli.");
  if (reliability >= 0.75) reasons.push(`Guvenilirlik guclu (${Math.round(reliability * 100)}/100).`);
  if (!reasons.length) reasons.push("Model sonucu orta seviye belirginlikte.");

  if (ctx.lowConfidence) blockers.push("Top1/margin esigi asilmadi.");
  if (ctx.uncertaintyHigh) blockers.push(`Belirsizlik skoru yuksek (${Number(ctx.uncertaintyScore || 0)}/100).`);
  if (ctx.ambiguityHigh) blockers.push("Yakin alternatif siniflar var.");
  if (ctx.classConflict) blockers.push("Healthy/issue sinif dengesi catismasi var.");
  if (ctx.plantMismatch) blockers.push("Secilen bitki ile tespit uyumsuz.");
  if (ctx.source && String(ctx.source).includes("fallback")) blockers.push("Fallback kaynakli sonuc.");

  const band = score >= 75 ? "strong" : score >= 55 ? "medium" : "weak";
  return {
    score,
    band,
    reasons: reasons.slice(0, 4),
    blockers: blockers.slice(0, 5),
    summary:
      band === "strong"
        ? "Model ayirimi guclu."
        : band === "medium"
          ? "Model ayirimi orta seviye."
          : "Model ayirimi zayif, ek dogrulama gerekli.",
    factors: {
      top1: Number(top1.toFixed(4)),
      top2: Number(top2.toFixed(4)),
      margin: Number(margin.toFixed(4)),
      entropy: Number(entropy.toFixed(4)),
      reliability: Number((reliability * 100).toFixed(1)),
      uncertainty: Number((uncertainty * 100).toFixed(1)),
      quality: Number((quality * 100).toFixed(1)),
      plantScore: Number((plantScore * 100).toFixed(1))
    }
  };
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
      const depthName = d?.label || d?.name;
      const raw = d?.values?.mean;
      if (!trackedDepths.includes(depthName) || typeof raw !== "number") return;
      depthProfile[name][depthName] = Number((raw / dFactor).toFixed(2));
    });
    const values = depths
      .filter((d) => pickDepths.includes(d?.label || d?.name))
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

function hasSoilGridSignal(data = null) {
  if (!data || typeof data !== "object") return false;
  return ["phh2o", "soc", "clay", "sand", "silt", "nitrogen", "cec", "bdod"].some((key) =>
    Number.isFinite(Number(data[key]))
  );
}

async function fetchSoilGridsPoint(lat, lon) {
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
  return parseSoilGrids(json);
}

function buildSoilProbePoints(lat, lon) {
  const radii = [0, 0.006, 0.012, 0.02];
  const offsets = [];
  radii.forEach((radius) => {
    if (radius === 0) {
      offsets.push([0, 0]);
      return;
    }
    offsets.push(
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [radius, -radius],
      [-radius, radius],
      [-radius, -radius]
    );
  });
  const seen = new Set();
  return offsets
    .map(([dLat, dLon]) => ({
      lat: Number((Number(lat) + dLat).toFixed(6)),
      lon: Number((Number(lon) + dLon).toFixed(6))
    }))
    .filter((point) => {
      const key = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchSoilGrids(lat, lon) {
  const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const cached = soilCache.get(key);
  if (cached && Date.now() - cached.ts < SOIL_CACHE_TTL_MS) return cached.value;

  const probePoints = buildSoilProbePoints(lat, lon);
  let best = null;
  for (const point of probePoints) {
    const parsed = await fetchSoilGridsPoint(point.lat, point.lon);
    if (!parsed) continue;
    const sampleDistanceKm = haversineKm({ lat, lon }, point) || 0;
    const enriched = {
      ...parsed,
      samplePoint: {
        lat: point.lat,
        lon: point.lon,
        distanceKm: Number(sampleDistanceKm.toFixed(2))
      }
    };
    if (hasSoilGridSignal(parsed)) {
      soilCache.set(key, { ts: Date.now(), value: enriched });
      return enriched;
    }
    if (!best) best = enriched;
  }
  if (best) {
    soilCache.set(key, { ts: Date.now(), value: best });
  }
  return best;
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

function stdOf(values = []) {
  const nums = values.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
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

function extractAddressField(address = {}, keys = []) {
  if (!address || typeof address !== "object") return "";
  for (const key of keys) {
    const value = String(address[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function scoreNominatimResult(result, city = "", district = "", neighborhood = "") {
  const searchHay =
    cityKey(result?.display_name || "") +
    " " +
    cityKey(result?.name || "") +
    " " +
    cityKey(JSON.stringify(result?.address || {}));
  let score = Number(result?.importance || 0) * 100;
  if (city && searchHay.includes(cityKey(city))) score += 40;
  if (district && searchHay.includes(cityKey(district))) score += 55;
  if (neighborhood && searchHay.includes(cityKey(neighborhood))) score += 70;
  const placeRank = Number(result?.place_rank || 0);
  if (placeRank >= 20 && neighborhood) score += 8;
  if (placeRank >= 10 && district) score += 6;
  return score;
}

async function fetchNominatimGeocode(city, district = "", neighborhood = "") {
  const neighborhoodVariants = Array.from(
    new Set(
      [
        neighborhood,
        neighborhood && !/mah/i.test(String(neighborhood || ""))
          ? `${String(neighborhood).trim()} Mahallesi`
          : null
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
  const segments = [
    ...neighborhoodVariants.map((item) => [item, district, city]),
    [district, city],
    [city]
  ];
  const queryCandidates = Array.from(
    new Set(
      segments.flatMap((parts) => {
        const cleanParts = parts
          .map((item) => String(item || "").trim())
          .filter(Boolean);
        if (!cleanParts.length) return [];
        const titleParts = cleanParts.map((item) => toTurkishTitleCase(item));
        const asciiParts = titleParts.map((item) => toTurkishAscii(item));
        return [
          [...cleanParts, "Turkey"].join(", "),
          [...titleParts, "Turkey"].join(", "),
          [...asciiParts, "Turkey"].join(", "),
          [...cleanParts, "Türkiye"].join(", "),
          [...titleParts, "Türkiye"].join(", ")
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean);
      })
    )
  );
  for (const query of queryCandidates) {
    const key = `nominatim:${cityKey(query)}`;
    const cached = geoCache.get(key);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) return cached.value;
    try {
      const url = new URL(NOMINATIM_SEARCH_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("countrycodes", "tr");
      url.searchParams.set("accept-language", "tr");
      const data = await fetchJsonWithRetry(
        url.toString(),
        {
          headers: {
            accept: "application/json",
            "accept-language": "tr",
            "user-agent": NOMINATIM_USER_AGENT
          }
        },
        1,
        4500
      );
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) continue;
      const best = rows
        .slice()
        .sort((a, b) => scoreNominatimResult(b, city, district, neighborhood) - scoreNominatimResult(a, city, district, neighborhood))[0];
      const lat = Number(best?.lat);
      const lon = Number(best?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const address = best?.address || {};
      const resolvedNeighborhood =
        extractAddressField(address, ["quarter", "neighbourhood", "suburb", "hamlet", "village"]) ||
        neighborhood ||
        null;
      const resolvedDistrict =
        extractAddressField(address, ["town", "city_district", "district", "county", "municipality"]) ||
        district ||
        null;
      const resolvedCity =
        extractAddressField(address, ["province", "city", "state", "town"]) ||
        city ||
        null;
      const payload = {
        name: resolvedCity || city || best?.name || null,
        lat,
        lon,
        city: resolvedCity ? toTurkishTitleCase(resolvedCity) : city || null,
        district: resolvedDistrict ? toTurkishTitleCase(resolvedDistrict) : district || null,
        neighborhood: resolvedNeighborhood ? toTurkishTitleCase(resolvedNeighborhood.replace(/\s+mahallesi$/i, "")) : neighborhood || null,
        geoSource: "nominatim-geocode",
        displayName: String(best?.display_name || "").trim() || null
      };
      geoCache.set(key, { ts: Date.now(), value: payload });
      return payload;
    } catch (_) {
      // try next candidate
    }
  }
  return null;
}

function hackhatonPathExists(targetPath = "") {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch (_) {
    return false;
  }
}

function hackhatonStatSafe(targetPath = "") {
  try {
    return fs.statSync(targetPath);
  } catch (_) {
    return null;
  }
}

function hackhatonReadJsonSafe(targetPath = "") {
  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    try {
      return JSON.parse(raw);
    } catch (_) {
      let inString = false;
      let escaped = false;
      let normalized = "";
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (inString) {
          normalized += ch;
          if (escaped) {
            escaped = false;
          } else if (ch === "\\") {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          normalized += ch;
          continue;
        }
        if (raw.startsWith("NaN", i)) {
          normalized += "null";
          i += 2;
          continue;
        }
        if (raw.startsWith("-Infinity", i)) {
          normalized += "null";
          i += 8;
          continue;
        }
        if (raw.startsWith("Infinity", i)) {
          normalized += "null";
          i += 7;
          continue;
        }
        normalized += ch;
      }
      return JSON.parse(normalized);
    }
  } catch (_) {
    return null;
  }
}

function hackhatonReadTextSafe(targetPath = "", maxLen = 1200) {
  try {
    return String(fs.readFileSync(targetPath, "utf-8") || "").slice(0, maxLen);
  } catch (_) {
    return "";
  }
}

function hackhatonReadFullTextSafe(targetPath = "") {
  try {
    return String(fs.readFileSync(targetPath, "utf-8") || "");
  } catch (_) {
    return "";
  }
}

function hackhatonParseCsvLine(line = "") {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values.map((item) => String(item || "").trim());
}

function hackhatonReadCsvRowsSafe(targetPath = "", maxRows = 5000) {
  try {
    const text = String(fs.readFileSync(targetPath, "utf-8") || "");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\r/g, ""))
      .filter((line) => line.trim().length);
    if (!lines.length) return [];
    const headers = hackhatonParseCsvLine(lines[0]).map((item) => String(item || "").replace(/^\uFEFF/, "").trim());
    return lines.slice(1, maxRows + 1).map((line) => {
      const cells = hackhatonParseCsvLine(line);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx] != null ? cells[idx] : "";
      });
      return row;
    });
  } catch (_) {
    return [];
  }
}

function normalizeHackhatonRelativePath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..")
    .join("/");
}

function toHackhatonOutputRelative(absPath = "") {
  if (!absPath) return null;
  const relative = path.relative(HACKHATON_OUTPUT_ROOT, absPath);
  if (!relative || relative.startsWith("..")) return null;
  return relative.split(path.sep).join("/");
}

function toHackhatonRootRelative(absPath = "") {
  if (!absPath) return null;
  const relative = path.relative(HACKHATON_ROOT, absPath);
  if (!relative || relative.startsWith("..")) return null;
  return relative.split(path.sep).join("/");
}

function resolveHackhatonOutputFile(relativePath = "") {
  const safeRelative = normalizeHackhatonRelativePath(relativePath);
  if (!safeRelative) return null;
  const absolute = path.resolve(HACKHATON_OUTPUT_ROOT, safeRelative);
  const relativeCheck = path.relative(HACKHATON_OUTPUT_ROOT, absolute);
  if (!relativeCheck || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) return null;
  const stat = hackhatonStatSafe(absolute);
  if (!stat || !stat.isFile()) return null;
  return absolute;
}

function resolveHackhatonRootFile(relativePath = "") {
  const safeRelative = normalizeHackhatonRelativePath(relativePath);
  if (!safeRelative) return null;
  const absolute = path.resolve(HACKHATON_ROOT, safeRelative);
  const relativeCheck = path.relative(HACKHATON_ROOT, absolute);
  if (!relativeCheck || relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) return null;
  const stat = hackhatonStatSafe(absolute);
  if (!stat || !stat.isFile()) return null;
  return absolute;
}

function hackhatonAssetRef(absPath = "") {
  const relativePath = toHackhatonOutputRelative(absPath);
  if (!relativePath) return null;
  return {
    file: relativePath,
    url: `/api/hackhaton/file?file=${encodeURIComponent(relativePath)}`
  };
}

function hackhatonRootAssetRef(absPath = "") {
  const relativePath = toHackhatonRootRelative(absPath);
  if (!relativePath) return null;
  return {
    file: relativePath,
    url: `/api/hackhaton/root-file?file=${encodeURIComponent(relativePath)}`
  };
}

function hackhatonListDirs(rootPath = "") {
  try {
    return fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const absPath = path.join(rootPath, entry.name);
        const stat = hackhatonStatSafe(absPath);
        return {
          name: entry.name,
          path: absPath,
          mtimeMs: stat?.mtimeMs || 0
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return [];
  }
}

function findLatestHackhatonRun({ prefixes = [], requiredFile = "model_suite_summary.json" } = {}) {
  if (!hackhatonPathExists(HACKHATON_OUTPUT_ROOT)) return null;
  const normalizedPrefixes = prefixes.map((item) => String(item || "").trim()).filter(Boolean);
  const dirs = hackhatonListDirs(HACKHATON_OUTPUT_ROOT);
  return (
    dirs.find((entry) => {
      if (normalizedPrefixes.length && !normalizedPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
        return false;
      }
      return requiredFile ? hackhatonPathExists(path.join(entry.path, requiredFile)) : true;
    }) || null
  );
}

function hackhatonFindFileInDir(rootPath = "", predicate = () => false) {
  try {
    return (
      fs
        .readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(rootPath, entry.name))
        .find((filePath) => predicate(path.basename(filePath), filePath)) || null
    );
  } catch (_) {
    return null;
  }
}

function hackhatonFindChart(runPath = "", modelKey = "", variable = "") {
  const chartsDir = path.join(runPath, modelKey, "charts");
  if (!hackhatonPathExists(chartsDir)) return null;
  const varKey = String(variable || "").toLowerCase();
  const preferred = hackhatonFindFileInDir(chartsDir, (name) => {
    const n = String(name || "").toLowerCase();
    return (
      n.endsWith(".png") &&
      n.includes(varKey) &&
      !n.includes("regime_probs") &&
      !n.includes("diagnostics") &&
      !n.includes("components")
    );
  });
  if (preferred) return preferred;
  return hackhatonFindFileInDir(chartsDir, (name) => String(name || "").toLowerCase().includes(varKey));
}

function hackhatonFindReportJson(runPath = "", modelKey = "", variable = "") {
  const reportsDir = path.join(runPath, modelKey, "reports");
  if (!hackhatonPathExists(reportsDir)) return null;
  const varKey = String(variable || "").toLowerCase();
  const filePath = hackhatonFindFileInDir(
    reportsDir,
    (name) => String(name || "").toLowerCase().endsWith(".json") && String(name || "").toLowerCase().includes(varKey)
  );
  if (!filePath) return null;
  return hackhatonReadJsonSafe(filePath);
}

function hackhatonModelLabel(key = "") {
  const normalized = String(key || "").trim();
  const map = {
    quant: "Quant",
    prophet: "Prophet",
    strong: "Strong Ensemble",
    analog: "Analog",
    prophet_ultra: "Prophet Ultra",
    literature: "Literature",
    stable_consensus: "Stable Consensus"
  };
  return map[normalized] || normalized || "-";
}

function hackhatonVariableLabel(key = "") {
  const normalized = String(key || "").trim();
  const map = {
    temp: "Sicaklik",
    humidity: "Nem",
    precip: "Yagis",
    pressure: "Basinc"
  };
  return map[normalized] || normalized || "-";
}

function hackhatonScoreText(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(2);
}

function hackhatonExcerpt(text = "", maxLen = 260) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function hackhatonDecodeHtml(text = "") {
  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hackhatonStripHtml(html = "") {
  return hackhatonDecodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function hackhatonExtractPresentationSlides(htmlPath = "", maxSlides = 24) {
  const html = hackhatonReadFullTextSafe(htmlPath);
  if (!html) return [];
  const baseDir = path.dirname(htmlPath);
  const sections = html.match(/<section[\s\S]*?<\/section>/gi) || [];
  return sections.slice(0, maxSlides).map((section, idx) => {
    const titleMatch = section.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const imgMatches = Array.from(section.matchAll(/<img[^>]*src=["']([^"']+)["']/gi));
    const imgSrc = imgMatches[0]?.[1] || "";
    const cleanTitle = hackhatonStripHtml(titleMatch?.[1] || `Slayt ${idx + 1}`);
    const absoluteImg = imgSrc ? path.resolve(baseDir, imgSrc) : null;
    return {
      id: `slide-${idx + 1}`,
      order: idx + 1,
      title: cleanTitle || `Slayt ${idx + 1}`,
      excerpt: hackhatonExcerpt(hackhatonStripHtml(section), 220),
      image: absoluteImg ? hackhatonAssetRef(absoluteImg) : null
    };
  });
}

function getHackhatonCacheEntry(key = "") {
  const entry = hackhatonCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > HACKHATON_CACHE_TTL_MS) {
    hackhatonCache.delete(key);
    return null;
  }
  return entry.value;
}

function setHackhatonCacheEntry(key = "", value = null) {
  hackhatonCache.set(key, { ts: Date.now(), value });
  return value;
}

function buildHackhatonScope(city = "", district = "", neighborhood = "") {
  return {
    city: city || null,
    district: district || null,
    neighborhood: neighborhood || null,
    locationLabel: buildLocationSearchQuery(city, district, neighborhood) || city || "Turkiye"
  };
}

function findFirstExistingHackhatonPath(paths = []) {
  return paths.find((item) => item && hackhatonPathExists(item)) || null;
}

function resolveClimateAnomalyBundle() {
  const preferredRun = findFirstExistingHackhatonPath([
    path.join(HACKHATON_OUTPUT_ROOT, "yeni_model_newdata_20260307_035819"),
    path.join(HACKHATON_OUTPUT_ROOT, "yeni_model_newdata_20260307_034620"),
    findLatestHackhatonRun({ prefixes: ["yeni_model_newdata_"], requiredFile: "quant_index_history_only.csv" })?.path
  ]);
  const continuousRoot = findFirstExistingHackhatonPath([
    path.join(HACKHATON_OUTPUT_ROOT, "extreme_events", "news", "continuous"),
    path.join(HACKHATON_OUTPUT_ROOT, "hackhaton_final_package_2026-03-06_quant", "output", "extreme_events", "news", "continuous")
  ]);
  return {
    historyCsv: findFirstExistingHackhatonPath([
      path.join(preferredRun || "", "anomalies", "all_variables_anomalies_history_only.csv")
    ]),
    enrichedCsv: findFirstExistingHackhatonPath([
      path.join(HACKHATON_OUTPUT_ROOT, "extreme_events", "news", "tum_asiri_olaylar_haber_enriched.csv"),
      path.join(HACKHATON_OUTPUT_ROOT, "extreme_events", "news_expanded_v3_relaxed", "tum_asiri_olaylar_haber_enriched.csv")
    ]),
    continuousCsv: continuousRoot ? path.join(continuousRoot, "surekli_anomali_haber_aylik.csv") : null,
    continuousOverviewPng: continuousRoot ? path.join(continuousRoot, "surekli_anomali_haber_overview.png") : null,
    continuousRoot,
    quantRun: preferredRun,
    quantChartsDir: preferredRun ? path.join(preferredRun, "charts_real_qc_anom_1912_2023") : null
  };
}

function normalizeClimateAnomalyRecord(row = {}, mode = "history") {
  const rawDate =
    String(row.center_time || row.start_time || row.ds || row.context_ds || "")
      .trim()
      .slice(0, 10);
  if (!rawDate) return null;
  const date = new Date(`${rawDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const variable = cityKey(row.variable || "");
  if (!["temp", "humidity", "precip", "pressure"].includes(variable)) return null;
  const actual = toFiniteNumber(row.actual || row.max_value || row.value);
  const expected = toFiniteNumber(row.expected);
  const residual = toFiniteNumber(row.residual);
  const zscore = toFiniteNumber(row.zscore || row.context_zscore);
  const robustZ = toFiniteNumber(row.robust_zscore || row.context_robust_zscore);
  const severityScore =
    toFiniteNumber(row.peak_severity_score) ||
    Math.max(
      Math.abs(Number(robustZ || 0)),
      Math.abs(Number(zscore || 0)),
      Math.abs(Number(residual || 0))
    );
  return {
    id: String(row.event_id || `${variable}-${rawDate}-${mode}`),
    date: rawDate,
    year: date.getUTCFullYear(),
    variable,
    variableLabel: hackhatonVariableLabel(variable),
    sourceMode: mode,
    actual,
    expected,
    residual,
    zscore,
    robustZScore: robustZ,
    severityScore: Number(Number(severityScore || 0).toFixed(3)),
    severityLevel: String(row.severity_level || row.anomaly_type_tr || "anomali").trim(),
    anomalyType: String(row.anomaly_type_tr || row.context_anomaly_type_tr || row.severity_level || "anomali").trim(),
    causePrimary: String(row.cause_primary || row.context_cause_primary || row.quant_cause_primary || "").trim(),
    causeDetails: String(row.cause_details_tr || row.context_cause_details_tr || "").trim(),
    localPatternHint: String(row.local_climate_hint || row.context_local_pattern_hint || "").trim(),
    globalEventMatch: String(row.global_event_match || row.context_global_event_match || "").trim(),
    localEventMatch: String(row.local_event_match || row.context_local_event_match || "").trim(),
    confidence: String(row.cause_confidence || row.context_cause_confidence || row.internet_confidence || "").trim(),
    newsTitle: String(row.top_headline || row.news_headline_match || "").trim(),
    newsSource: String(row.top_headline_source || row.news_source_match || "").trim(),
    newsUrl: String(row.top_headline_url || row.news_url_match || "").trim(),
    newsHazard: String(row.top_headline_hazard || row.news_hazard_match || "").trim(),
    newsMatchScore: toFiniteNumber(row.top_headline_match_score || row.news_match_score) || 0,
    newsMatchCount: Number(row.news_match_count || row.source_count || 0),
    internetSummary: String(row.internet_cause_summary || "").trim()
  };
}

function loadClimateAnomalyHistory(bundle = null) {
  const filePath = bundle?.historyCsv;
  if (!filePath) return [];
  return hackhatonReadCsvRowsSafe(filePath, 30000)
    .map((row) => normalizeClimateAnomalyRecord(row, "history"))
    .filter(Boolean)
    .sort((a, b) => {
      const da = new Date(`${a.date}T00:00:00Z`).getTime();
      const db = new Date(`${b.date}T00:00:00Z`).getTime();
      return da - db;
    });
}

function loadClimateEventNewsRows(bundle = null) {
  const filePath = bundle?.enrichedCsv;
  if (!filePath) return [];
  return hackhatonReadCsvRowsSafe(filePath, 15000)
    .map((row) => normalizeClimateAnomalyRecord(row, "event-news"))
    .filter(Boolean)
    .sort((a, b) => Number(b.newsMatchScore || 0) - Number(a.newsMatchScore || 0));
}

function loadClimateContinuousRows(bundle = null) {
  const filePath = bundle?.continuousCsv;
  if (!filePath) return [];
  return hackhatonReadCsvRowsSafe(filePath, 12000)
    .map((row) => {
      const month = String(row.month || "").trim().slice(0, 10);
      const variable = cityKey(row.variable || "");
      if (!month || !variable) return null;
      return {
        month,
        variable,
        variableLabel: hackhatonVariableLabel(variable),
        monthlyEventCount: Number(row.monthly_event_count || 0),
        monthlyMaxSeverity: Number(Number(row.monthly_max_severity || 0).toFixed(2)),
        newsCount: Number(row.news_count || 0),
        newsMaxScore: Number(Number(row.news_max_score || 0).toFixed(2)),
        severityNorm: Number(Number(row.severity_norm || 0).toFixed(3)),
        severityEma: Number(Number(row.severity_ema || 0).toFixed(3))
      };
    })
    .filter(Boolean);
}

function pickClimateAnomalyCharts(bundle = null, variable = "temp") {
  const quantChartsDir = bundle?.quantChartsDir || "";
  const varKey = cityKey(variable || "temp");
  const currentChart = quantChartsDir
    ? findFirstExistingHackhatonPath([
        path.join(quantChartsDir, `${varKey}_monthly_real_qc_1912-01-01_to_2023-12-31.png`)
      ])
    : null;
  const currentCsv = quantChartsDir
    ? findFirstExistingHackhatonPath([
        path.join(quantChartsDir, `${varKey}_monthly_real_qc_1912-01-01_to_2023-12-31.csv`)
      ])
    : null;
  const quantProjection = findFirstExistingHackhatonPath([
    varKey === "temp" ? path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "05_sicaklik_quant_2035.png") : "",
    varKey === "humidity" ? path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "06_nem_quant_2035.png") : "",
    varKey === "precip" ? path.join(HACKHATON_OUTPUT_ROOT, "analog_pattern_package", "charts", "precip_monthly_analog_to_2035.png") : "",
    varKey === "pressure" ? path.join(HACKHATON_OUTPUT_ROOT, "analog_pattern_package", "charts", "pressure_yearly_analog_to_2035.png") : ""
  ]);
  const continuousVarChart = bundle?.continuousRoot
    ? findFirstExistingHackhatonPath([
        path.join(bundle.continuousRoot, `surekli_anomali_haber_${varKey}.png`)
      ])
    : null;
  return [
    currentChart
      ? {
          id: `${varKey}-history-chart`,
          title: `${hackhatonVariableLabel(varKey)} tarihsel seri`,
          subtitle: "1912-2023 QC seri",
          asset: hackhatonAssetRef(currentChart),
          csv: currentCsv ? hackhatonAssetRef(currentCsv) : null
        }
      : null,
    continuousVarChart
      ? {
          id: `${varKey}-news-chart`,
          title: `${hackhatonVariableLabel(varKey)} surekli anomali + haber`,
          subtitle: "Aylik siddet ve haber eslesme",
          asset: hackhatonAssetRef(continuousVarChart)
        }
      : null,
    quantProjection
      ? {
          id: `${varKey}-projection-chart`,
          title: `${hackhatonVariableLabel(varKey)} quant/projeksiyon`,
          subtitle: "Hackhaton paketinden ileri gorunum",
          asset: hackhatonAssetRef(quantProjection)
        }
      : null
  ].filter(Boolean);
}

function buildClimateAnomalyKeywordSet(record = null) {
  const variable = cityKey(record?.variable || "");
  const baseMap = {
    temp: {
      archive: "heat wave",
      query: ["heat wave", "temperature", "cold wave", "weather", "agriculture"]
    },
    humidity: {
      archive: "humidity",
      query: ["humidity", "fog", "moisture", "weather", "agriculture"]
    },
    precip: {
      archive: "flood",
      query: ["flood", "heavy rain", "storm", "weather", "agriculture"]
    },
    pressure: {
      archive: "storm",
      query: ["storm", "pressure", "barometer", "weather", "agriculture"]
    }
  };
  const base = baseMap[variable] || baseMap.temp;
  const dynamic = [record?.causePrimary, record?.anomalyType, record?.localPatternHint]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return {
    archive: base.archive,
    query: [...new Set([...dynamic, ...base.query])]
  };
}

function severityTierFromScore(score = 0) {
  const numeric = Number(score || 0);
  if (numeric >= 8) return "kritik";
  if (numeric >= 4) return "yuksek";
  if (numeric >= 2) return "orta";
  return "izleme";
}

function describeClimateStress(record = null) {
  const variable = cityKey(record?.variable || "");
  const residual = Number(record?.residual || 0);
  const positive = residual >= 0;
  const map = {
    temp: positive
      ? { id: "heat_stress", title: "Isi stresi", effect: "Transpirasyon ve yaprak yanigi baskisi artar.", signal: "Sicaklik norm ustu" }
      : { id: "cold_stress", title: "Soguk stresi", effect: "Gelisim yavaslar, doku hasari ve don hassasiyeti artar.", signal: "Sicaklik norm alti" },
    humidity: positive
      ? { id: "fungal_humidity", title: "Asiri nem baskisi", effect: "Mantar hastaliklari ve yaprak islakligi riski artar.", signal: "Nem norm ustu" }
      : { id: "dry_air", title: "Kuru hava stresi", effect: "Terleme ve su kaybi hizlanir.", signal: "Nem norm alti" },
    precip: positive
      ? { id: "excess_rain", title: "Asiri yagis baskisi", effect: "Kok bogulmasi, erozyon ve tarlaya giris kaybi yaratir.", signal: "Yagis norm ustu" }
      : { id: "rain_deficit", title: "Yagis acigi", effect: "Toprak su acigi ve verim kaybi riski artar.", signal: "Yagis norm alti" },
    pressure: positive
      ? { id: "high_pressure_block", title: "Yuksek basinc rejimi", effect: "Duragan ve kuru hava penceresi uzayabilir.", signal: "Basinc norm ustu" }
      : { id: "low_pressure_instability", title: "Dusuk basinc dalgasi", effect: "Firtina, ani yagis ve ruzgar degisimi artabilir.", signal: "Basinc norm alti" }
  };
  return map[variable] || { id: "mixed", title: "Karisik stres", effect: "Birden fazla iklim sinyali birlikte oynuyor.", signal: "Karma anomali" };
}

function buildClimateAgrobotPlaybook({ record = null, cropKey = "domates" } = {}) {
  if (!record) return null;
  const crop = getIrrigationCropConfig(cropKey);
  const focusDate = String(record.date || "").slice(0, 10);
  const now = focusDate ? new Date(`${focusDate}T00:00:00Z`) : new Date();
  const plantingDate = getDefaultIrrigationPlantingDate(crop.key, now);
  const plantingTs = new Date(`${plantingDate}T00:00:00Z`);
  const dayAfterPlant = Number.isFinite(plantingTs.getTime())
    ? Math.floor((now - plantingTs) / 86400000) + 1
    : null;
  const stage = getIrrigationStage(dayAfterPlant, crop);
  const stress = describeClimateStress(record);
  const severityTier = severityTierFromScore(record.severityScore);
  const isInSeason = Boolean(stage?.inSeason);
  const actionMap = {
    heat_stress: {
      immediate: ["Sulama vardiyasini sabah erken pencereye cek.", "Yapraktan uygulamalari sicak saatten cikar.", "Gunes yanigi riski olan bloklari oncele."],
      week: ["Parcali sulama planla.", "Toprak ust katman nemini gunluk izle.", "Hasat varsa serin saatlere kaydir."],
      checks: ["ET0 / ETc", "Yaprak sicakligi", "Solar zarar"]
    },
    cold_stress: {
      immediate: ["Don hassas bloklar icin gece protokolunu hazirla.", "Serbest su birakan uygulamalari kritik geceye tasima.", "Fide ve hassas kisimlarda koruma tedbiri ac."],
      week: ["Soguk sonrasi doku hasarini tara.", "Fenoloji kaymasini kayda al.", "Asiri sulama ile soguk riskini buyutme."],
      checks: ["Min sicaklik", "Don saati", "Yaprak nekrozu"]
    },
    fungal_humidity: {
      immediate: ["Yaprak islakligini uzatan uygulamalari azalt.", "Canopy hava akisini ac.", "Mantar belirtileri icin scouting frekansini arttir."],
      week: ["Koruyucu programi gozden gecir.", "Su birikimi olan noktayi bosalt.", "Riskli bloklari etiketle."],
      checks: ["Yaprak islakligi", "Nem", "Leke / mildiyo"]
    },
    dry_air: {
      immediate: ["Kuru ve ruzgarli pencerede sulama onde olsun.", "Hassas bloklarda gun ortasi saha isini azalt.", "Bitki turgorunu gozle teyit et."],
      week: ["Debi uniformitesini kontrol et.", "Yuzey buharlasma kaybini azalt.", "Yapraktan uygulamayi serin saate kaydir."],
      checks: ["VPD", "Yaprak kivrilmasi", "Toprak yuzeyi"]
    },
    excess_rain: {
      immediate: ["Tarlaya giris ve agir ekipman planini durdur.", "Drenaj cikislarini ac.", "Kok bogulmasi riski olan bloklari oncele."],
      week: ["Yagis sonrasi hastalik taramasini hizlandir.", "Hasat kalitesini partiler bazinda ayir.", "Sikisma olusmayan ilk pencerede yeniden planla."],
      checks: ["Su birikimi", "Yatma", "Erozyon"]
    },
    rain_deficit: {
      immediate: ["Sulama takvimini gercek nemle siklastir.", "Kritik fenoloji bloklarini onceliklendir.", "Su tuketen yan uygulamalari kis."],
      week: ["Parcali sulamaya gec.", "Riskli bloklari etiketle.", "Kuru sicak ruzgar pencerelerini izle."],
      checks: ["RAW doluluk", "Kok bolgesi nemi", "Bitki turgoru"]
    },
    high_pressure_block: {
      immediate: ["Uzayan kuru pencereyi operasyon lehine kullan.", "Havalandirma ve toz kontrolunu ac.", "Kuruma etkisini hassas bloklarda izle."],
      week: ["Tuzluluk ve kabuklasma riskine bak.", "Sabah pencerelerini operasyon slotu yap.", "Sulama ile sogutmayi ayri degerlendir."],
      checks: ["Basinc trendi", "Gunduz sicakligi", "Yuzey kuruma"]
    },
    low_pressure_instability: {
      immediate: ["Firtina ve ani yagis icin saha ekibini uyar.", "Ilaclama ve hasadi pencereye gore kaydir.", "Acik ekipman ve depo alanini koru."],
      week: ["Hastalik ve yatma takibini siklastir.", "Parsel lojistigini riskli saatlerden cikar.", "Acil durum listesini guncelle."],
      checks: ["Basinc dususu", "Ruzgar gust", "Konvektif yagis"]
    },
    mixed: {
      immediate: ["Kritik bloklarda saha turu yap.", "Canli hava ve toprak verisini birlikte kontrol et.", "24 saatlik pencereye gore planini yenile."],
      week: ["Sulama, ilaclama ve hasadi ayni tabloda toparla.", "Riskli parselleri notla.", "Bir sonraki pencere icin aksiyon listesi hazirla."],
      checks: ["Saha notu", "Canli hava", "Toprak nemi"]
    }
  };
  const pack = actionMap[stress.id] || actionMap.mixed;
  const stageNote = isInSeason ? `${crop.label} icin ${stage.label} evresi` : `${crop.label} icin sezon disi / planlama evresi`;
  return {
    crop: {
      key: crop.key,
      label: crop.label,
      plantingDate,
      stage: stage.label,
      inSeason: isInSeason
    },
    stress: {
      id: stress.id,
      title: stress.title,
      signal: stress.signal,
      effect: stress.effect,
      severityTier
    },
    summary: `${stageNote}; ${stress.title.toLowerCase()} baskisi ${severityTier} seviyede.`,
    immediateActions: pack.immediate,
    weekActions: pack.week,
    fieldChecks: pack.checks,
    agronomicNote: record.causePrimary || record.localPatternHint || record.globalEventMatch || stress.effect
  };
}

function buildClimateImpactMatrix({ record = null, cropKey = "domates" } = {}) {
  if (!record) return [];
  const crop = getIrrigationCropConfig(cropKey);
  const stress = describeClimateStress(record);
  const severityTier = severityTierFromScore(record.severityScore);
  const profileMap = {
    heat_stress: {
      irrigation: ["kritik", "Su cekisi artar; ET0 ve kok bolgesi nemi gunluk izlenmeli."],
      disease: ["orta", "Isi stresi bitkiyi zayiflatir; leke ve yaniklik scouting'i siklasmali."],
      spraying: ["yuksek", "Oglen uygulamalarini kes; serin saat penceresi kullan."],
      field_access: ["dusuk", "Tarlaya giris acik ama saha ekibi sicak stresine karsi planlanmali."],
      harvest: ["orta", "Hasat varsa sabah ve aksam lotlarina kaydir."]
    },
    cold_stress: {
      irrigation: ["dusuk", "Asiri sulama soguk hasarini buyutebilir; kontrollu git."],
      disease: ["orta", "Soguk doku zedelenmesi sonrasi ikincil enfeksiyon riski izlenmeli."],
      spraying: ["orta", "Don gecesi ve hemen sonrasinda uygulama stresi artabilir."],
      field_access: ["orta", "Sabah erken don ve buzlanma varsa ekipman gecikmeli girmeli."],
      harvest: ["orta", "Kalite kaybi ve fenoloji kaymasi lot takibini gerektirir."]
    },
    fungal_humidity: {
      irrigation: ["dusuk", "Fazla su vermek yerine canopy nemini azaltmaya odaklan."],
      disease: ["kritik", "Mantar hastaligi baskisi artar; scouting ve koruyucu program onde."],
      spraying: ["yuksek", "Yaprak islakligi ve ruzgar durumuna gore pencere sec."],
      field_access: ["orta", "Islak saha operasyonda sikişma ve bulaşma riski yaratir."],
      harvest: ["orta", "Nemli lotlari ayir; kalite sinifi dusmesin."]
    },
    dry_air: {
      irrigation: ["yuksek", "Terleme baskisi artar; debi ve uniformite tekrar kontrol edilmeli."],
      disease: ["dusuk", "Mantar baskisi zayiflar ama akar/zararli baskisi artabilir."],
      spraying: ["orta", "Ucuculuk ve fitotoksite icin serin pencere kullan."],
      field_access: ["dusuk", "Saha acik; toz ve pulverizasyon kontrolu yeterli."],
      harvest: ["orta", "Turgor dususu kaliteyi etkileyebilir."]
    },
    excess_rain: {
      irrigation: ["orta", "Planli eventleri frenle; kok bogulmasi ve drenaj oncelikli."],
      disease: ["kritik", "Yuksek yaprak islakligi ve sicrama enfeksiyonu riski var."],
      spraying: ["kritik", "Pencere daralir; yagis arasi kisa slotlar degerli."],
      field_access: ["kritik", "Ekipman girisi ve tasima lojistigi en buyuk risk."],
      harvest: ["yuksek", "Hasat kalitesi, ezilme ve depo riski artar."]
    },
    rain_deficit: {
      irrigation: ["kritik", "Su acigi birikir; kritik fenoloji bloklari onceliklendirilmeli."],
      disease: ["dusuk", "Mantar baskisi zayiflar, ancak stres kaynakli fizyolojik sorun artabilir."],
      spraying: ["orta", "Serin saat pencereleri korunmali."],
      field_access: ["dusuk", "Saha operasyonu acik; ana sorun su planlamasi."],
      harvest: ["orta", "Irilik ve doluluk kaybi olabilir."]
    },
    high_pressure_block: {
      irrigation: ["yuksek", "Kuru pencere uzarsa sulama operasyonu ana eksene doner."],
      disease: ["dusuk", "Yaprak islakligi genelde dusuk; mantar baskisi gorece zayif."],
      spraying: ["dusuk", "Stabil pencere operasyon icin avantaj olabilir."],
      field_access: ["dusuk", "Saha genelde acik ve lojistik elverisli."],
      harvest: ["orta", "Gunduz isi birikimi kaliteyi etkileyebilir."]
    },
    low_pressure_instability: {
      irrigation: ["orta", "Ani yagislar ve ruzgar sebebiyle sulama slotlari sik degisir."],
      disease: ["yuksek", "Nem + yagis kombinasyonu hastalik baskisini yukseltebilir."],
      spraying: ["kritik", "Ruzgar ve konvektif yagis nedeniyle uygulama penceresi kirilgan."],
      field_access: ["yuksek", "Tarlaya giris ve sevkiyat saat bazli planlanmali."],
      harvest: ["yuksek", "Yagma, ruzgar ve yatma etkisi hasadi zorlar."]
    },
    mixed: {
      irrigation: ["orta", "Canli hava ve toprakla birlikte guncel karar ver."],
      disease: ["orta", "Birden fazla risk ayni anda oynuyor."],
      spraying: ["orta", "Pencereyi her gun yeniden kontrol et."],
      field_access: ["orta", "Operasyon takvimi esnek olmali."],
      harvest: ["orta", "Lot bazli kalite kontrolu onde."]
    }
  };
  const domainLabels = {
    irrigation: "Sulama",
    disease: "Hastalik",
    spraying: "Ilaclama",
    field_access: "Tarla erisimi",
    harvest: "Hasat"
  };
  const selected = profileMap[stress.id] || profileMap.mixed;
  return Object.entries(selected).map(([key, value]) => ({
    id: key,
    label: domainLabels[key] || key,
    level: value[0],
    headline: `${crop.label} icin ${stress.title.toLowerCase()} etkisi`,
    detail: value[1],
    severityTier
  }));
}

function buildClimateMonthProfile(rows = [], variable = "temp") {
  const months = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    label: `${String(idx + 1).padStart(2, "0")}`,
    anomalyCount: 0,
    newsHits: 0,
    maxSeverity: 0,
    avgSeverity: 0
  }));
  const buckets = new Map(months.map((item) => [item.month, { ...item, scores: [] }]));
  rows
    .filter((item) => item.variable === variable)
    .forEach((item) => {
      const month = Number(String(item.date || "").slice(5, 7));
      const bucket = buckets.get(month);
      if (!bucket) return;
      bucket.anomalyCount += 1;
      if (item.newsTitle || Number(item.newsMatchScore || 0) > 0) bucket.newsHits += 1;
      bucket.maxSeverity = Math.max(bucket.maxSeverity, Number(item.severityScore || 0));
      if (Number.isFinite(Number(item.severityScore))) bucket.scores.push(Number(item.severityScore));
    });
  return Array.from(buckets.values()).map((item) => ({
    month: item.month,
    label: item.label,
    anomalyCount: item.anomalyCount,
    newsHits: item.newsHits,
    maxSeverity: Number(item.maxSeverity.toFixed(2)),
    avgSeverity: item.scores.length ? Number((avgOf(item.scores) || 0).toFixed(2)) : 0
  }));
}

function buildClimateAnalogEvents(rows = [], selected = null, maxItems = 6) {
  if (!selected?.date || !selected?.variable) return [];
  const selectedDate = new Date(`${selected.date}T00:00:00Z`);
  if (Number.isNaN(selectedDate.getTime())) return [];
  const selectedMonth = selectedDate.getUTCMonth() + 1;
  const selectedSignal = Math.sign(Number(selected.residual || selected.zscore || selected.robustZScore || 0));
  const monthDistance = (a, b) => {
    const diff = Math.abs(a - b);
    return Math.min(diff, 12 - diff);
  };
  return rows
    .filter((item) => item.variable === selected.variable && item.date !== selected.date)
    .map((item) => {
      const itemDate = new Date(`${item.date}T00:00:00Z`);
      const itemMonth = itemDate.getUTCMonth() + 1;
      const signal = Math.sign(Number(item.residual || item.zscore || item.robustZScore || 0));
      const sameDirection = signal !== 0 && selectedSignal !== 0 ? signal === selectedSignal : null;
      return {
        ...item,
        dayDistance: Math.abs(itemDate.getTime() - selectedDate.getTime()) / 86400000,
        monthDistance: monthDistance(selectedMonth, itemMonth),
        sameDirection
      };
    })
    .filter((item) => item.monthDistance <= 1 || item.dayDistance <= 45)
    .sort((a, b) => {
      if (a.monthDistance !== b.monthDistance) return a.monthDistance - b.monthDistance;
      if (a.sameDirection !== b.sameDirection) return a.sameDirection ? -1 : 1;
      if (Number(b.newsMatchScore || 0) !== Number(a.newsMatchScore || 0)) return Number(b.newsMatchScore || 0) - Number(a.newsMatchScore || 0);
      return Number(b.severityScore || 0) - Number(a.severityScore || 0);
    })
    .slice(0, maxItems)
    .map((item) => ({
      id: item.id,
      date: item.date,
      year: item.year,
      anomalyType: item.anomalyType,
      severityScore: item.severityScore,
      causePrimary: item.causePrimary || item.localPatternHint || item.globalEventMatch || item.anomalyType,
      localPatternHint: item.localPatternHint,
      globalEventMatch: item.globalEventMatch,
      sameDirection: item.sameDirection,
      newsTitle: item.newsTitle || "",
      monthDistance: item.monthDistance
    }));
}

function buildClimateContextWindow(rows = [], selected = null, windowDays = 60, maxItems = 16) {
  if (!selected?.date) return [];
  const selectedDate = new Date(`${selected.date}T00:00:00Z`);
  if (Number.isNaN(selectedDate.getTime())) return [];
  return rows
    .map((item) => {
      const itemDate = new Date(`${item.date}T00:00:00Z`);
      return {
        ...item,
        dayOffset: Math.round((itemDate.getTime() - selectedDate.getTime()) / 86400000)
      };
    })
    .filter((item) => Math.abs(item.dayOffset) <= windowDays)
    .sort((a, b) => {
      if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
      return Number(b.severityScore || 0) - Number(a.severityScore || 0);
    })
    .slice(0, maxItems)
    .map((item) => ({
      id: item.id,
      date: item.date,
      variable: item.variable,
      variableLabel: item.variableLabel,
      anomalyType: item.anomalyType,
      severityScore: item.severityScore,
      dayOffset: item.dayOffset,
      causePrimary: item.causePrimary || item.anomalyType
    }));
}

function buildClimateCompoundEvents(rows = [], selected = null, windowDays = 10, maxItems = 8) {
  if (!selected?.date) return [];
  const selectedTs = new Date(`${selected.date}T00:00:00Z`).getTime();
  if (!Number.isFinite(selectedTs)) return [];
  const filtered = rows
    .map((item) => {
      const ts = new Date(`${item.date}T00:00:00Z`).getTime();
      if (!Number.isFinite(ts)) return null;
      const dayOffset = Math.round((ts - selectedTs) / 86400000);
      if (Math.abs(dayOffset) > windowDays) return null;
      return { ...item, ts, dayOffset };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
  const clusters = [];
  filtered.forEach((item) => {
    const current = clusters[clusters.length - 1];
    if (!current || Math.abs(item.ts - current.lastTs) > 2 * 86400000) {
      clusters.push({
        items: [item],
        firstTs: item.ts,
        lastTs: item.ts
      });
      return;
    }
    current.items.push(item);
    current.lastTs = item.ts;
  });
  return clusters
    .map((bucket) => ({
      id: `compound-${bucket.items[0]?.date || "window"}`,
      date:
        bucket.items
          .slice()
          .sort((a, b) => Math.abs(a.dayOffset) - Math.abs(b.dayOffset))[0]?.date || bucket.items[0]?.date || "",
      dayOffset:
        bucket.items
          .slice()
          .sort((a, b) => Math.abs(a.dayOffset) - Math.abs(b.dayOffset))[0]?.dayOffset ?? 0,
      startDate: bucket.items[0]?.date || "",
      endDate: bucket.items[bucket.items.length - 1]?.date || "",
      variableCount: new Set(bucket.items.map((item) => item.variable)).size,
      variables: [...new Set(bucket.items.map((item) => item.variable))].map((item) => hackhatonVariableLabel(item)),
      maxSeverity: Number(Math.max(...bucket.items.map((item) => Number(item.severityScore || 0))).toFixed(2)),
      newsHits: bucket.items.filter((item) => item.newsTitle || Number(item.newsMatchScore || 0) > 0).length,
      headline:
        bucket.items
          .slice()
          .sort((a, b) => Number(b.severityScore || 0) - Number(a.severityScore || 0))
          .slice(0, 3)
          .map((item) => `${item.variableLabel}: ${item.anomalyType}`)
          .join(" • ") || "Bilesik olay penceresi"
    }))
    .sort((a, b) => {
      if (b.variableCount !== a.variableCount) return b.variableCount - a.variableCount;
      if (Math.abs(a.dayOffset) !== Math.abs(b.dayOffset)) return Math.abs(a.dayOffset) - Math.abs(b.dayOffset);
      return Number(b.maxSeverity || 0) - Number(a.maxSeverity || 0);
    })
    .slice(0, maxItems);
}

function buildClimateCouplingMatrix(rows = [], selectedVariable = "temp") {
  const normalizedVariable = cityKey(selectedVariable || "temp");
  const baseRows = rows
    .filter((item) => item.variable === normalizedVariable)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!baseRows.length) return [];
  const otherVariables = ["temp", "humidity", "precip", "pressure"].filter((item) => item !== normalizedVariable);
  return otherVariables
    .map((otherVariable) => {
      const otherRows = rows
        .filter((item) => item.variable === otherVariable)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!otherRows.length) {
        return {
          id: `coupling-${normalizedVariable}-${otherVariable}`,
          variable: otherVariable,
          variableLabel: hackhatonVariableLabel(otherVariable),
          matchRatePct: 0,
          meanLagDays: null,
          meanSeverity: null,
          strongestDate: null,
          strongestSeverity: null
        };
      }
      const matches = [];
      baseRows.forEach((baseRow) => {
        const baseTs = new Date(`${baseRow.date}T00:00:00Z`).getTime();
        const nearest = otherRows.reduce((best, candidate) => {
          const candidateTs = new Date(`${candidate.date}T00:00:00Z`).getTime();
          const lagDays = Math.round((candidateTs - baseTs) / 86400000);
          if (Math.abs(lagDays) > 7) return best;
          if (!best || Math.abs(lagDays) < Math.abs(best.lagDays)) {
            return { lagDays, row: candidate };
          }
          if (Math.abs(lagDays) === Math.abs(best.lagDays) && Number(candidate.severityScore || 0) > Number(best.row.severityScore || 0)) {
            return { lagDays, row: candidate };
          }
          return best;
        }, null);
        if (nearest) matches.push(nearest);
      });
      const strongest = matches
        .slice()
        .sort((a, b) => Number(b.row?.severityScore || 0) - Number(a.row?.severityScore || 0))[0] || null;
      return {
        id: `coupling-${normalizedVariable}-${otherVariable}`,
        variable: otherVariable,
        variableLabel: hackhatonVariableLabel(otherVariable),
        matchRatePct: Number(((matches.length / Math.max(1, baseRows.length)) * 100).toFixed(1)),
        meanLagDays: matches.length ? Number((avgOf(matches.map((item) => item.lagDays)) || 0).toFixed(1)) : null,
        meanSeverity: matches.length ? Number((avgOf(matches.map((item) => Number(item.row?.severityScore || 0))) || 0).toFixed(2)) : null,
        strongestDate: strongest?.row?.date || null,
        strongestSeverity: strongest ? Number(Number(strongest.row?.severityScore || 0).toFixed(2)) : null
      };
    })
    .sort((a, b) => Number(b.matchRatePct || 0) - Number(a.matchRatePct || 0));
}

function buildClimateDecadeProfile(rows = [], variable = "temp", selected = null) {
  const buckets = new Map();
  rows
    .filter((item) => item.variable === variable)
    .forEach((item) => {
      const year = Number(item.year || String(item.date || "").slice(0, 4));
      if (!Number.isFinite(year)) return;
      const decadeStart = Math.floor(year / 10) * 10;
      const bucket = buckets.get(decadeStart) || {
        id: `decade-${decadeStart}`,
        decadeStart,
        decadeEnd: decadeStart + 9,
        label: `${decadeStart}'ler`,
        anomalyCount: 0,
        newsHits: 0,
        meanSeverityValues: [],
        maxSeverity: 0,
        peakDate: null
      };
      bucket.anomalyCount += 1;
      if (item.newsTitle || Number(item.newsMatchScore || 0) > 0) bucket.newsHits += 1;
      const severity = Number(item.severityScore || 0);
      if (Number.isFinite(severity)) {
        bucket.meanSeverityValues.push(severity);
        if (severity >= bucket.maxSeverity) {
          bucket.maxSeverity = severity;
          bucket.peakDate = item.date;
        }
      }
      buckets.set(decadeStart, bucket);
    });
  const selectedYear = Number(selected?.year || String(selected?.date || "").slice(0, 4));
  return Array.from(buckets.values())
    .sort((a, b) => a.decadeStart - b.decadeStart)
    .map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      decadeStart: bucket.decadeStart,
      decadeEnd: bucket.decadeEnd,
      anomalyCount: bucket.anomalyCount,
      newsHits: bucket.newsHits,
      meanSeverity: bucket.meanSeverityValues.length ? Number((avgOf(bucket.meanSeverityValues) || 0).toFixed(2)) : 0,
      maxSeverity: Number(Number(bucket.maxSeverity || 0).toFixed(2)),
      peakDate: bucket.peakDate,
      isSelectedDecade:
        Number.isFinite(selectedYear) && selectedYear >= bucket.decadeStart && selectedYear <= bucket.decadeEnd
    }));
}

function buildClimateSourceBoard({
  variablePool = [],
  localMatches = [],
  liveNews = [],
  archiveNews = [],
  selected = null
} = {}) {
  const selectedYear = Number(selected?.year || String(selected?.date || "").slice(0, 4));
  const years = variablePool
    .map((item) => Number(item.year || String(item.date || "").slice(0, 4)))
    .filter((item) => Number.isFinite(item));
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const localRows = variablePool.filter((item) => item.sourceMode === "event-news");
  const historyRows = variablePool.filter((item) => item.sourceMode === "history");
  const rangeText = minYear && maxYear ? `${minYear}-${maxYear}` : "-";
  return [
    {
      id: "source-history",
      label: "Hackhaton history",
      status: historyRows.length ? "aktif" : "yok",
      count: historyRows.length,
      coverage: rangeText,
      note: "Temel tarihsel anomali serisi"
    },
    {
      id: "source-local",
      label: "Hackhaton olay eslesmesi",
      status: localRows.length ? "aktif" : "sinirli",
      count: localMatches.length,
      coverage: localRows.length ? `${localRows.length} zenginlestirilmis olay` : "Yerel eslesme sinirli",
      note: "Anomali ile olay/haber baglamini birlestirir"
    },
    {
      id: "source-gdelt",
      label: "GDELT",
      status: liveNews.length ? "aktif" : "sinirli",
      count: liveNews.length,
      coverage: selectedYear >= 2015 ? "2015+" : "Bu tarih icin dogrudan kapsam zayif",
      note: liveNews.length ? "Modern haber ve web baglami" : "Secili tarih modern acik haber taramasina tam uymuyor"
    },
    {
      id: "source-loc",
      label: "Chronicling America",
      status: archiveNews.length ? "aktif" : "sinirli",
      count: archiveNews.length,
      coverage: selectedYear >= 1900 && selectedYear <= 1963 ? "1900-1963" : "Secili tarih LOC araligi disinda",
      note: archiveNews.length ? "Gazete arsivi baglami bulundu" : "Gazete arsivinde dogrudan eslesme cikmadi"
    }
  ];
}

function buildClimateTriggerBoard({
  selected = null,
  couplingMatrix = [],
  monthProfile = [],
  compoundEvents = [],
  playbook = null,
  impactMatrix = []
} = {}) {
  if (!selected) return [];
  const selectedMonth = Number(String(selected.date || "").slice(5, 7));
  const seasonal = monthProfile.find((item) => item.month === selectedMonth) || null;
  const strongestCoupling = couplingMatrix[0] || null;
  const criticalImpact = impactMatrix.find((item) => ["kritik", "yuksek"].includes(String(item.level || "").toLowerCase())) || null;
  const compound = compoundEvents.find((item) => Number(item.variableCount || 0) >= 2) || null;
  const fieldChecks = Array.isArray(playbook?.fieldChecks) ? playbook.fieldChecks.filter(Boolean) : [];
  return [
    {
      id: "trigger-core",
      title: `${selected.variableLabel || "Anomali"} esigi`,
      priority: Number(selected.severityScore || 0) >= 6 ? "high" : "medium",
      condition: `${selected.anomalyType || "Anomali"} tekrarlandiginda sahayi 24 saat icinde yeniden tara`,
      detail: `${selected.date} olayinda skor ${Number(selected.severityScore || 0).toFixed(2)} ve sapma ${selected.actual ?? "-"} / ${selected.expected ?? "-"}.`
    },
    strongestCoupling
      ? {
          id: "trigger-coupling",
          title: `${strongestCoupling.variableLabel} ile eslik izle`,
          priority: Number(strongestCoupling.matchRatePct || 0) >= 18 ? "high" : "watch",
          condition:
            strongestCoupling.meanLagDays == null
              ? "Eszamanli sinyal"
              : strongestCoupling.meanLagDays < -1
                ? `${Math.abs(strongestCoupling.meanLagDays)} gun once bu degiskeni izle`
                : strongestCoupling.meanLagDays > 1
                  ? `${strongestCoupling.meanLagDays} gun sonra ikinci dalga bekle`
                  : "Ayni pencere icinde birlikte izle",
          detail: `Tarihsel eslik orani %${strongestCoupling.matchRatePct}; ortalama skor ${strongestCoupling.meanSeverity ?? "-"}.`
        }
      : null,
    seasonal
      ? {
          id: "trigger-seasonal",
          title: `Mevsimsellik: ${seasonal.label}. ay`,
          priority: seasonal.maxSeverity >= 6 || seasonal.anomalyCount >= 10 ? "medium" : "watch",
          condition: `${seasonal.anomalyCount} kayit / ${seasonal.newsHits} haber vurusuyla tekrar eden pencere`,
          detail: `Aylik ortalama siddet ${seasonal.avgSeverity}; maksimum ${seasonal.maxSeverity}.`
        }
      : null,
    compound
      ? {
          id: "trigger-compound",
          title: "Bilesik olay alarmi",
          priority: Number(compound.variableCount || 0) >= 3 ? "high" : "medium",
          condition: `${compound.startDate}${compound.endDate && compound.endDate !== compound.startDate ? ` -> ${compound.endDate}` : ""} arasinda ${compound.variableCount} degisken oynuyor`,
          detail: compound.headline
        }
      : null,
    criticalImpact
      ? {
          id: "trigger-impact",
          title: `${criticalImpact.label} etkisi`,
          priority: criticalImpact.level === "kritik" ? "high" : "medium",
          condition: `${criticalImpact.label.toLowerCase()} tarafinda operasyonu siklastir`,
          detail: criticalImpact.detail
        }
      : null,
    fieldChecks.length
      ? {
          id: "trigger-checks",
          title: "Saha check listesi",
          priority: "planning",
          condition: "Her turda ayni sinyalleri not et",
          detail: fieldChecks.slice(0, 3).join(" • ")
        }
      : null
  ].filter(Boolean).slice(0, 5);
}

function buildClimateActionQueue({
  selected = null,
  playbook = null,
  impactMatrix = [],
  localMatches = [],
  liveNews = [],
  archiveNews = [],
  compoundEvents = []
} = {}) {
  if (!selected) return [];
  const tasks = [];
  (playbook?.immediateActions || []).slice(0, 3).forEach((item, idx) => {
    tasks.push({
      id: `queue-now-${idx}`,
      horizon: "24 saat",
      priority: idx === 0 ? "high" : "medium",
      title: item,
      detail: playbook?.stress?.title || playbook?.summary || "Secili anomali icin dogrudan saha aksiyonu."
    });
  });
  (playbook?.weekActions || []).slice(0, 2).forEach((item, idx) => {
    tasks.push({
      id: `queue-week-${idx}`,
      horizon: "7 gun",
      priority: "planning",
      title: item,
      detail: playbook?.crop?.label ? `${playbook.crop.label} icin haftalik aksiyon.` : "Haftalik planlama aksiyonu."
    });
  });
  impactMatrix
    .filter((item) => ["kritik", "yuksek"].includes(String(item.level || "").toLowerCase()))
    .slice(0, 3)
    .forEach((item, idx) => {
      tasks.push({
        id: `queue-impact-${idx}`,
        horizon: "48 saat",
        priority: item.level === "kritik" ? "high" : "medium",
        title: `${item.label} tarafini kapat`,
        detail: item.detail
      });
    });
  const topCompound = compoundEvents.find((item) => Number(item.variableCount || 0) >= 2) || null;
  if (topCompound) {
    tasks.push({
      id: "queue-compound",
      horizon: "24-72 saat",
      priority: Number(topCompound.variableCount || 0) >= 3 ? "high" : "medium",
      title: "Bilesik olay penceresine gore parcelleme yap",
      detail: `${topCompound.date} penceresinde ${topCompound.variableCount} degisken ayni anda oynuyor: ${topCompound.variables.join(", ")}.`
    });
  }
  const evidence = localMatches[0] || liveNews[0] || archiveNews[0] || null;
  if (evidence) {
    tasks.push({
      id: "queue-evidence",
      horizon: "Bugun",
      priority: "watch",
      title: "Olay baglamini saha notuna isle",
      detail: evidence.title || evidence.description || evidence.summary || "Secili olay icin baglam kaydi olustur."
    });
  }
  const priorityRank = { high: 0, medium: 1, planning: 2, watch: 3 };
  return tasks
    .sort((a, b) => (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99))
    .slice(0, 8);
}

function buildClimateRegimeSignals({ selected = null, analogs = [], localMatches = [] } = {}) {
  const patterns = [
    { id: "enso", label: "ENSO / El Nino", match: /enso|el nino|la nina/i },
    { id: "nao", label: "NAO", match: /\bnao\b/i },
    { id: "med", label: "Akdeniz siklonu", match: /akdeniz|siklon/i },
    { id: "blocking", label: "Blokaj / basinc rejimi", match: /blok|blocking|basinc/i },
    { id: "drought", label: "Kuraklik", match: /kurak|yagis acigi|dry/i },
    { id: "flood", label: "Sel / asiri yagis", match: /sel|flood|asiri yagis|heavy rain/i },
    { id: "storm", label: "Firtina / instabilite", match: /firtina|storm|konvektif|instabil/i },
    { id: "heat", label: "Isi dalgasi", match: /isi|heat|sicak/i },
    { id: "cold", label: "Soguk / don", match: /soguk|don|cold|frost/i }
  ];
  const texts = [
    selected?.causePrimary,
    selected?.causeDetails,
    selected?.localPatternHint,
    selected?.globalEventMatch,
    selected?.internetSummary,
    ...analogs.flatMap((item) => [item.causePrimary, item.localPatternHint, item.globalEventMatch]),
    ...localMatches.flatMap((item) => [item.title, item.summary, item.hazard])
  ].map((item) => String(item || "").trim()).filter(Boolean);
  return patterns
    .map((pattern) => {
      const hits = texts.filter((text) => pattern.match.test(text));
      return {
        id: pattern.id,
        label: pattern.label,
        count: hits.length,
        sample: hits[0] ? hackhatonExcerpt(hits[0], 96) : ""
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function buildClimateAnomalyStoryline({ selected = null, analogs = [], localMatches = [], liveNews = [], archiveNews = [] } = {}) {
  if (!selected) return null;
  const selectedLabel = `${selected.date} ${selected.variableLabel?.toLowerCase() || "anomali"}`;
  const analog = analogs[0] || null;
  const local = localMatches[0] || null;
  const external = liveNews[0] || archiveNews[0] || null;
  return {
    headline: `${selectedLabel} penceresinde ${String(selected.anomalyType || "anormallik").toLowerCase()}`,
    summary:
      selected.causeDetails ||
      selected.causePrimary ||
      selected.localPatternHint ||
      selected.globalEventMatch ||
      "Nedensel aciklama sinirli; istatistiksel sapma guclu.",
    bullets: [
      analog
        ? `${analog.year} analogu: ${analog.anomalyType} (${hackhatonScoreText(analog.severityScore)})`
        : "Guclu analog yil bulunamadi.",
      local
        ? `Yerel eslesme: ${hackhatonExcerpt(local.title || local.summary || "", 88)}`
        : "Yerel olay eslesmesi zayif.",
      external
        ? `Harici baglam: ${hackhatonExcerpt(external.title || external.description || "", 88)}`
        : "Harici haber baglami su an sinirli."
    ]
  };
}

function buildGdeltDateToken(dateText = "", endOfDay = false) {
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 0);
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

async function fetchGdeltContextNews({ record = null, city = "", limit = 5 } = {}) {
  const year = Number(String(record?.date || "").slice(0, 4));
  if (!Number.isFinite(year) || year < 2015) return [];
  const start = buildGdeltDateToken(record.date);
  const end = buildGdeltDateToken(record.date, true);
  if (!start || !end) return [];
  const keywords = buildClimateAnomalyKeywordSet(record);
  const query = `${keywords.query.slice(0, 4).join(" OR ")}${city ? ` AND ${city}` : ""}`;
  const url =
    `${GDELT_DOC_API_URL}?query=${encodeURIComponent(query)}` +
    `&mode=ArtList&maxrecords=${Math.max(3, Math.min(8, Number(limit) || 5))}` +
    `&format=json&sort=DateDesc&startdatetime=${start}&enddatetime=${end}`;
  try {
    const json = await fetchJsonWithRetry(url, { headers: { accept: "application/json" } }, 0, 7000);
    const articles = Array.isArray(json?.articles) ? json.articles : [];
    return articles.slice(0, limit).map((item, idx) => ({
      id: `gdelt-${idx}`,
      title: String(item.title || item.seendate || "GDELT haber").trim(),
      link: String(item.url || "").trim(),
      source: String(item.domain || item.sourceCountry || "GDELT").trim(),
      description: hackhatonExcerpt(item.socialimage || item.seendate || "", 120),
      score: toFiniteNumber(item.seendate) || null,
      provider: "gdelt",
      date: String(item.seendate || "").slice(0, 8)
    })).filter((item) => item.link);
  } catch (_) {
    return [];
  }
}

async function fetchChroniclingAmericaContext({ record = null, limit = 5 } = {}) {
  const year = Number(String(record?.date || "").slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 1963) return [];
  const keyword = buildClimateAnomalyKeywordSet(record).archive;
  const url =
    `${CHRONICLING_AMERICA_SEARCH_URL}?andtext=${encodeURIComponent(keyword)}` +
    `&dateFilterType=yearRange&date1=${year}&date2=${year}&rows=${Math.max(3, Math.min(8, Number(limit) || 5))}&searchType=basic&format=json`;
  try {
    const json = await fetchJsonWithRetry(url, { headers: { accept: "application/json" } }, 0, 7000);
    const items = Array.isArray(json?.items) ? json.items : [];
    return items.slice(0, limit).map((item, idx) => ({
      id: `loc-${idx}`,
      title: String(item.title || item.headline || item.id || "Arsiv gazete kaydi").trim(),
      link: String(item.url || item.id || "").trim(),
      source: String(item.title || "Chronicling America").trim(),
      description: hackhatonExcerpt(item.snippet || item.city || item.state || keyword, 140),
      provider: "chronicling-america",
      date: String(item.date || "").trim()
    })).filter((item) => item.link);
  } catch (_) {
    return [];
  }
}

async function buildClimateAnomalyIntelPayload({
  city = "",
  district = "",
  neighborhood = "",
  variable = "all",
  date = "",
  crop = "domates",
  limit = 10
} = {}) {
  const scope = buildHackhatonScope(city, district, neighborhood);
  const varKey = cityKey(variable || "all") || "all";
  const safeDate = String(date || "").trim().slice(0, 10);
  const safeLimit = Math.max(4, Math.min(16, Number(limit) || 10));
  const normalizedCrop = normalizeIrrigationCropKey(crop || "domates");
  const cacheKey = `anomaly-intel:${scope.locationLabel}:${varKey}:${safeDate}:${safeLimit}:${normalizedCrop}`;
  const cached = anomalyIntelCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ANOMALY_INTEL_CACHE_TTL_MS) {
    return cached.value;
  }

  const bundle = resolveClimateAnomalyBundle();
  const historyRows = loadClimateAnomalyHistory(bundle);
  const eventRows = loadClimateEventNewsRows(bundle);
  const continuousRows = loadClimateContinuousRows(bundle);
  if (!historyRows.length && !eventRows.length) {
    const payload = {
      updatedAt: new Date().toISOString(),
      available: false,
      error: "climate_anomaly_bundle_missing",
      scope
    };
    anomalyIntelCache.set(cacheKey, { ts: Date.now(), value: payload });
    return payload;
  }

  const mergedRows = [...historyRows, ...eventRows];
  const variablePool = varKey === "all" ? mergedRows : mergedRows.filter((item) => item.variable === varKey);
  const targetTs = safeDate ? new Date(`${safeDate}T00:00:00Z`).getTime() : null;
  const rankedRows = variablePool
    .slice()
    .sort((a, b) => {
      if (targetTs != null) {
        const da = Math.abs(new Date(`${a.date}T00:00:00Z`).getTime() - targetTs);
        const db = Math.abs(new Date(`${b.date}T00:00:00Z`).getTime() - targetTs);
        if (da !== db) return da - db;
      }
      if (Number(b.newsMatchScore || 0) !== Number(a.newsMatchScore || 0)) {
        return Number(b.newsMatchScore || 0) - Number(a.newsMatchScore || 0);
      }
      return Number(b.severityScore || 0) - Number(a.severityScore || 0);
    });
  const selected = rankedRows[0] || mergedRows[0] || null;
  const selectedVariable = selected?.variable || (varKey === "all" ? "temp" : varKey);
  const topAnomalies = (varKey === "all" ? mergedRows : variablePool)
    .slice()
    .sort((a, b) => Number(b.severityScore || 0) - Number(a.severityScore || 0))
    .slice(0, safeLimit);
  const selectedTs = selected ? new Date(`${selected.date}T00:00:00Z`).getTime() : null;
  const localMatches = eventRows
    .filter((item) => item.variable === selectedVariable)
    .filter((item) => {
      if (selectedTs == null) return true;
      return Math.abs(new Date(`${item.date}T00:00:00Z`).getTime() - selectedTs) <= 45 * 86400000;
    })
    .sort((a, b) => {
      if (Number(b.newsMatchScore || 0) !== Number(a.newsMatchScore || 0)) {
        return Number(b.newsMatchScore || 0) - Number(a.newsMatchScore || 0);
      }
      return Number(b.severityScore || 0) - Number(a.severityScore || 0);
    })
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      date: item.date,
      title: item.newsTitle || item.causePrimary || item.anomalyType,
      source: item.newsSource || "Hackhaton eslesme",
      link: item.newsUrl || "",
      hazard: item.newsHazard || item.variableLabel,
      score: item.newsMatchScore || item.severityScore,
      summary: item.internetSummary || item.causeDetails || item.globalEventMatch || item.localEventMatch || item.localPatternHint
    }));
  const [liveNews, archiveNews] = await Promise.all([
    fetchGdeltContextNews({ record: selected, city, limit: 5 }),
    fetchChroniclingAmericaContext({ record: selected, limit: 5 })
  ]);
  const analogEvents = buildClimateAnalogEvents(variablePool, selected, 6);
  const timeline = continuousRows
    .filter((item) => item.variable === selectedVariable)
    .slice(-180);
  const contextWindow = buildClimateContextWindow(mergedRows, selected, 60, 18);
  const monthProfile = buildClimateMonthProfile(mergedRows, selectedVariable);
  const regimeSignals = buildClimateRegimeSignals({ selected, analogs: analogEvents, localMatches });
  const compoundEvents = buildClimateCompoundEvents(mergedRows, selected, 10, 8);
  const couplingMatrix = buildClimateCouplingMatrix(mergedRows, selectedVariable);
  const agrobotPlaybook = buildClimateAgrobotPlaybook({ record: selected, cropKey: normalizedCrop });
  const agrobotImpactMatrix = buildClimateImpactMatrix({ record: selected, cropKey: normalizedCrop });
  const decadeProfile = buildClimateDecadeProfile(mergedRows, selectedVariable, selected);
  const sourceBoard = buildClimateSourceBoard({
    variablePool,
    localMatches,
    liveNews,
    archiveNews,
    selected
  });
  const triggerBoard = buildClimateTriggerBoard({
    selected,
    couplingMatrix,
    monthProfile,
    compoundEvents,
    playbook: agrobotPlaybook,
    impactMatrix: agrobotImpactMatrix
  });
  const actionQueue = buildClimateActionQueue({
    selected,
    playbook: agrobotPlaybook,
    impactMatrix: agrobotImpactMatrix,
    localMatches,
    liveNews,
    archiveNews,
    compoundEvents
  });
  const storyline = buildClimateAnomalyStoryline({
    selected,
    analogs: analogEvents,
    localMatches,
    liveNews,
    archiveNews
  });
  const variableStats = ["temp", "humidity", "precip", "pressure"].map((key) => {
    const rows = mergedRows.filter((item) => item.variable === key);
    const top = rows.slice().sort((a, b) => Number(b.severityScore || 0) - Number(a.severityScore || 0))[0] || null;
    const newsHits = rows.filter((item) => item.newsTitle).length;
    return {
      key,
      label: hackhatonVariableLabel(key),
      anomalyCount: rows.length,
      newsHits,
      topDate: top?.date || null,
      topSeverity: top ? Number(Number(top.severityScore || 0).toFixed(2)) : null
    };
  });
  const payload = {
    updatedAt: new Date().toISOString(),
    available: true,
    live: true,
    scope: {
      ...scope,
      dataMode: "hackhaton-history-plus-live-news",
      note: "Arsiv anomali serisi bolgesel Hackhaton iklim verisidir; haber eslesmeleri ucretsiz acik kaynaklardan cekilir."
    },
    selectedVariable,
    selectedDate: selected?.date || safeDate || null,
    selectedAnomaly: selected,
    agrobotPlaybook,
    agrobotImpactMatrix,
    variables: variableStats,
    topAnomalies,
    analogEvents,
    contextWindow,
    monthProfile,
    regimeSignals,
    compoundEvents,
    couplingMatrix,
    decadeProfile,
    sourceBoard,
    triggerBoard,
    actionQueue,
    storyline,
    timeline,
    charts: [
      bundle?.continuousOverviewPng
        ? {
            id: "continuous-overview",
            title: "Surekli anomali genel gorunumu",
            subtitle: "Aylik siddet ve haber eslesme",
            asset: hackhatonAssetRef(bundle.continuousOverviewPng)
          }
        : null,
      ...pickClimateAnomalyCharts(bundle, selectedVariable)
    ].filter(Boolean),
    localMatches,
    liveNews,
    archiveNews,
    evidenceSummary: {
      historyRows: variablePool.length,
      topWindowRows: topAnomalies.length,
      chartCount: [
        bundle?.continuousOverviewPng,
        ...pickClimateAnomalyCharts(bundle, selectedVariable).map((item) => item?.asset)
      ].filter(Boolean).length,
      localMatchCount: localMatches.length,
      liveNewsCount: liveNews.length,
      archiveNewsCount: archiveNews.length,
      analogCount: analogEvents.length,
      contextCount: contextWindow.length,
      compoundCount: compoundEvents.length,
      decadeCount: decadeProfile.length,
      triggerCount: triggerBoard.length,
      queueCount: actionQueue.length,
      confidence:
        localMatches.length >= 3 || liveNews.length >= 2
          ? "guclu"
          : topAnomalies.length >= 4
            ? "orta"
            : "sinirli"
    },
    sources: [
      { id: "hackhaton-history", title: "Hackhaton anomaly history", url: bundle?.historyCsv ? `/api/hackhaton/file?file=${encodeURIComponent(toHackhatonOutputRelative(bundle.historyCsv) || "")}` : null },
      { id: "hackhaton-news", title: "Hackhaton enriched anomaly/news", url: bundle?.enrichedCsv ? `/api/hackhaton/file?file=${encodeURIComponent(toHackhatonOutputRelative(bundle.enrichedCsv) || "")}` : null },
      { id: "gdelt", title: "GDELT DOC 2 API", url: "https://www.gdeltproject.org/" },
      { id: "loc", title: "Library of Congress Chronicling America", url: "https://chroniclingamerica.loc.gov/" }
    ].filter((item) => item.url)
  };
  anomalyIntelCache.set(cacheKey, { ts: Date.now(), value: payload });
  return payload;
}

function normalizeAgrobotChatText(input = "") {
  return normalizeTrText(String(input || "")).replace(/\s+/g, " ").trim();
}

function mapAgrobotCropKey({ crop = "", plant = "" } = {}) {
  const raw = normalizeAgrobotChatText(crop || plant);
  if (!raw) return "domates";
  const map = {
    tomato: "domates",
    domates: "domates",
    biber: "domates",
    pepper: "domates",
    corn: "misir",
    maize: "misir",
    misir: "misir",
    grape: "bag_uzum",
    uzum: "bag_uzum",
    bag: "bag_uzum",
    wheat: "bugday_kislik",
    bugday: "bugday_kislik",
    sunflower: "aycicegi",
    aycicegi: "aycicegi"
  };
  return normalizeIrrigationCropKey(map[raw] || raw || "domates");
}

function detectAgrobotTopics(message = "") {
  const text = normalizeAgrobotChatText(message);
  const topics = {
    disease: /hast|zararli|teshis|yaprak|leke|ilac|fung|mantar|saglikli/.test(text),
    irrigation: /sula|sulama|et0|etc|evapo|transpir|su ver|su butce|nem acigi|baraj|kuyu|vardiya/.test(text),
    soil: /toprak|ph|kil|kum|organik|gubre|npk|ec |tuzluluk|verimlilik/.test(text),
    anomaly: /anom|risk|neden|niye|don|sicak|yagis|basinc|kurak|olay|esik|tetik/.test(text),
    market: /pazar|hal|fiyat|mazot|motorin|akaryakit|sat|satis|alim|teklif|piyasa/.test(text),
    weather: /hava|sicak|ruzgar|nem|yagis|don|tahmin|iklim/.test(text),
    summary: /bugun|ozet|plan|ne yap|once ne|simdi ne/.test(text)
  };
  if (!Object.values(topics).some(Boolean)) topics.summary = true;
  return {
    ...topics,
    primary:
      topics.disease ? "disease" :
      topics.irrigation ? "irrigation" :
      topics.soil ? "soil" :
      topics.market ? "market" :
      topics.anomaly ? "anomaly" :
      topics.weather ? "weather" :
      "summary"
  };
}

function buildAgrobotChatSuggestions({ cropLabel = "", topics = {}, hasDiagnosis = false } = {}) {
  const base = [
    "Bugun ne yapmaliyim?",
    "Sulama takvimini ozetle",
    "ET0 riskini anlat",
    "Baraj baskisiyla sulama plani ver",
    "Anomaliyi acikla",
    "Toprak risklerini soyle",
    "Mazot ve pazar durumunu ozetle"
  ];
  if (hasDiagnosis) {
    base.unshift("Bu hastalik sonucu ne anlama geliyor?");
  }
  if (cropLabel) {
    base.unshift(`${cropLabel} icin haftalik plan ver`);
  }
  if (topics.market) {
    base.unshift("Satmak icin uygun urun ne?");
  }
  return Array.from(new Set(base)).slice(0, 5);
}

function buildAgrobotChatHighlights({
  diagnosisPack = null,
  anomalyIntel = null,
  irrigation = null,
  soilReport = null,
  marketLive = null
} = {}) {
  const cards = [];
  const diagnosisName = diagnosisPack?.diagnosis?.name || "";
  if (diagnosisName) {
    cards.push({
      id: "diagnosis",
      label: "Teshis",
      value: diagnosisName,
      tone: diagnosisPack?.diagnosis?.status === "risk" ? "danger" : diagnosisPack?.diagnosis?.status === "review" ? "warning" : "ok"
    });
  }
  if (anomalyIntel?.selectedAnomaly?.variableLabel) {
    cards.push({
      id: "anomaly",
      label: "Anomali",
      value: `${anomalyIntel.selectedAnomaly.variableLabel} • ${anomalyIntel.selectedDate || "-"}`,
      tone: "danger"
    });
  }
  if (irrigation?.summary) {
    cards.push({
      id: "irrigation",
      label: "Sulama",
      value: irrigation.summary.nextIrrigationDate || irrigation.summary.currentStage || "-",
      tone: irrigation?.alertBundle?.level === "high" ? "danger" : irrigation?.alertBundle?.level === "elevated" ? "warning" : irrigation.summary.nextIrrigationDate ? "ok" : "info"
    });
  }
  if (irrigation?.hourlyEvapoCommand?.summary?.shiftGainPct != null) {
    cards.push({
      id: "et0",
      label: "ET0",
      value: `%${irrigation.hourlyEvapoCommand.summary.shiftGainPct} vardiya kazanci`,
      tone: irrigation.hourlyEvapoCommand.summary.shiftGainPct >= 4 ? "warning" : "info"
    });
  }
  if (soilReport?.soilType || soilReport?.ph) {
    cards.push({
      id: "soil",
      label: "Toprak",
      value: `${soilReport.soilType || "profil"} • pH ${soilReport.ph || "-"}`,
      tone: "info"
    });
  }
  const fuelItem = Array.isArray(marketLive?.fuel?.items) ? marketLive.fuel.items[0] : null;
  if (fuelItem?.price) {
    cards.push({
      id: "fuel",
      label: "Mazot",
      value: `${fuelItem.price} ${fuelItem.unit || ""}`.trim(),
      tone: "warning"
    });
  }
  return cards.slice(0, 5);
}

function buildAgrobotActionables({ irrigation = null, anomalyIntel = null, marketLive = null } = {}) {
  const items = [];
  const irrigationTasks = Array.isArray(irrigation?.taskDrafts) ? irrigation.taskDrafts : [];
  irrigationTasks.slice(0, 3).forEach((task) => {
    items.push({
      id: `irrigation-${task.id}`,
      lane: task.lane || "24s",
      title: task.title,
      detail: task.detail,
      severity: task.severity || "watch",
      source: "sulama"
    });
  });
  const anomalyActions = Array.isArray(anomalyIntel?.actionQueue) ? anomalyIntel.actionQueue : [];
  anomalyActions.slice(0, 2).forEach((task) => {
    items.push({
      id: `anomaly-${task.id}`,
      lane: "72s",
      title: task.title,
      detail: task.detail,
      severity: task.priority || "watch",
      source: "anomali"
    });
  });
  const marketFuel = Array.isArray(marketLive?.fuel?.items)
    ? marketLive.fuel.items.find((item) => /mazot|motorin/i.test(String(item.label || item.product || "")))
    : null;
  if (marketFuel?.price) {
    items.push({
      id: "market-fuel",
      lane: "hafta",
      title: "Mazot maliyetini plana ekle",
      detail: `${marketFuel.label || "Mazot"} ${marketFuel.price} ${marketFuel.unit || ""}`.trim(),
      severity: "watch",
      source: "pazar"
    });
  }
  return items.slice(0, 5);
}

function buildAgrobotDiseaseSection({ diagnosisPack = null, actionPlan = null } = {}) {
  const diagnosis = diagnosisPack?.diagnosis || null;
  if (!diagnosis?.name) return null;
  const bullets = [
    `Teshis: ${diagnosis.name} (${diagnosis.status || "bilinmiyor"})`,
    diagnosisPack?.confidenceProfile?.summary || null,
    ...(Array.isArray(actionPlan?.today) ? actionPlan.today.slice(0, 2) : []),
    ...(Array.isArray(diagnosisPack?.warnings) ? diagnosisPack.warnings.slice(0, 2) : [])
  ].filter(Boolean);
  return {
    id: "disease",
    title: "Teshis yorumu",
    bullets
  };
}

function buildAgrobotIrrigationSection({ irrigation = null } = {}) {
  if (!irrigation?.available) return null;
  const topPriority = Array.isArray(irrigation?.priorityBoard) ? irrigation.priorityBoard[0] : null;
  const topTask = Array.isArray(irrigation?.taskDrafts) ? irrigation.taskDrafts[0] : null;
  const topHook = Array.isArray(irrigation?.et0ResearchPack?.decisionHooks) ? irrigation.et0ResearchPack.decisionHooks[0] : null;
  const bullets = [
    irrigation?.alertBundle?.headline ? `${irrigation.alertBundle.headline} ${irrigation.alertBundle.actions?.[0] || ""}`.trim() : null,
    irrigation?.actionPlan?.headline ? `${irrigation.actionPlan.headline} ${irrigation.actionPlan.detail || ""}`.trim() : null,
    irrigation?.summary?.nextIrrigationDate
      ? `Siradaki event: ${irrigation.summary.nextIrrigationDate} • ${irrigation.summary.nextIrrigationGrossMm || 0} mm • ${irrigation.summary.nextIrrigationGrossM3 || 0} m3`
      : `Kampanya: ${irrigation.summary?.campaignStatus || "-"}`,
    irrigation?.hourlyEvapoCommand?.bestWindows?.[0]
      ? `En iyi pencere: ${irrigation.hourlyEvapoCommand.bestWindows[0].label || irrigation.hourlyEvapoCommand.bestWindows[0].windowLabel || irrigation.hourlyEvapoCommand.bestWindows[0].window || "-"}`
      : null,
    irrigation?.waterSupplyAdvisor?.mode
      ? `Su kaynagi modu: ${irrigation.waterSupplyAdvisor.mode} • haftalik tavan ${irrigation.waterSupplyAdvisor.weeklyCapM3 || 0} m3`
      : null,
    topHook ? `${topHook.title}: ${topHook.detail}` : null,
    topPriority ? `${topPriority.title}: ${topPriority.detail}` : null,
    topTask ? `${topTask.title}: ${topTask.detail}` : null
  ].filter(Boolean);
  return {
    id: "irrigation",
    title: "Sulama karari",
    bullets: bullets.slice(0, 6)
  };
}

function buildAgrobotSoilSection({ soilReport = null } = {}) {
  if (!soilReport) return null;
  const bullets = [
    `Toprak: ${soilReport.soilType || "profil yok"} • pH ${soilReport.ph || "-"} • organik ${soilReport.organic || "-"}`,
    Array.isArray(soilReport.recommended) && soilReport.recommended.length
      ? `Onerilen urunler: ${soilReport.recommended.slice(0, 3).join(", ")}`
      : null,
    Array.isArray(soilReport.diseaseRisk) && soilReport.diseaseRisk.length
      ? `Toprak kaynakli risk: ${soilReport.diseaseRisk.slice(0, 2).join(", ")}`
      : null
  ].filter(Boolean);
  return {
    id: "soil",
    title: "Toprak yorumu",
    bullets
  };
}

function buildAgrobotAnomalySection({ anomalyIntel = null } = {}) {
  if (!anomalyIntel?.selectedAnomaly) return null;
  const selected = anomalyIntel.selectedAnomaly;
  const bullets = [
    `${selected.date} tarihinde ${selected.variableLabel || "iklim"} tarafinda ${selected.anomalyType || "anomali"} goruldu.`,
    selected.causeDetails || selected.causePrimary || selected.localPatternHint || null,
    anomalyIntel?.triggerBoard?.[0]
      ? `${anomalyIntel.triggerBoard[0].title}: ${anomalyIntel.triggerBoard[0].condition}`
      : null,
    anomalyIntel?.actionQueue?.[0]
      ? `${anomalyIntel.actionQueue[0].title}: ${anomalyIntel.actionQueue[0].detail}`
      : null
  ].filter(Boolean);
  return {
    id: "anomaly",
    title: "Anomali yorumu",
    bullets
  };
}

function buildAgrobotMarketSection({ marketLive = null, cropLabel = "" } = {}) {
  if (!marketLive?.live) return null;
  const fuelItem = Array.isArray(marketLive?.fuel?.items) ? marketLive.fuel.items.find((item) => /mazot|motorin/i.test(String(item.label || item.product || ""))) || marketLive.fuel.items[0] : null;
  const boardItem = Array.isArray(marketLive?.board) ? marketLive.board[0] : null;
  const bullets = [
    fuelItem?.price ? `Akaryakit: ${fuelItem.label || fuelItem.product || "Mazot"} ${fuelItem.price} ${fuelItem.unit || ""}`.trim() : null,
    boardItem ? `Pazar: ${boardItem.label || boardItem.crop || cropLabel || "urun"} ${boardItem.priceTlKg || boardItem.minTlKg || "-"} TL/kg civari.` : null,
    Array.isArray(marketLive?.warnings) && marketLive.warnings.length ? `Uyari: ${marketLive.warnings.join(" • ")}` : null
  ].filter(Boolean);
  return {
    id: "market",
    title: "Pazar ozeti",
    bullets
  };
}

function buildAgrobotSummarySection({
  city = "",
  district = "",
  neighborhood = "",
  cropLabel = "",
  weather = null,
  diagnosisPack = null,
  anomalyIntel = null,
  irrigation = null
} = {}) {
  const locationLabel = buildLocationSearchQuery(city, district, neighborhood) || city || "Parsel";
  const bullets = [
    `${locationLabel} icin ${cropLabel || "urun"} odakli karar ozeti.`,
    weather?.temp != null
      ? `Anlik hava: ${weather.temp} C • nem ${weather.humidity ?? "-"} • ruzgar ${weather.windKmh ?? "-"} km/s`
      : null,
    diagnosisPack?.diagnosis?.name ? `Teshis sinyali: ${diagnosisPack.diagnosis.name}` : null,
    anomalyIntel?.selectedAnomaly
      ? `${anomalyIntel.selectedAnomaly.variableLabel || "Iklim"} anomalisi: ${(anomalyIntel.selectedAnomaly.anomalyType || "-").replace(/_/g, " ")} • ${anomalyIntel.selectedDate || anomalyIntel.selectedAnomaly.date || "-"}`
      : null,
    irrigation?.summary?.nextIrrigationDate ? `Siradaki sulama: ${irrigation.summary.nextIrrigationDate}` : null
  ].filter(Boolean);
  return {
    id: "summary",
    title: "Durum ozeti",
    bullets
  };
}

function buildAgrobotAnswerText({ primaryTopic = "summary", sections = [], cropLabel = "" } = {}) {
  const firstSection = sections[0] || null;
  const firstLine = firstSection?.bullets?.[0] || `${cropLabel || "Parsel"} icin ozet hazirlandi.`;
  const secondLine = firstSection?.bullets?.[1] || null;
  const thirdLine = sections[1]?.bullets?.[0] || null;
  const normalizeSentence = (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };
  return [firstLine, secondLine, thirdLine]
    .filter(Boolean)
    .map(normalizeSentence)
    .join(" ");
}

async function buildAgrobotChatPayload({
  message = "",
  city = "Malatya",
  district = "",
  neighborhood = "",
  plant = "",
  crop = "",
  weather = null,
  soilReport = null,
  diagnosisPack = null,
  actionPlan = null
} = {}) {
  const topics = detectAgrobotTopics(message);
  const cropKey = mapAgrobotCropKey({ crop, plant });
  const cropConfig = getIrrigationCropConfig(cropKey);
  const cropLabel = cropConfig?.label || plant || crop || "Urun";
  const needsAnomaly = topics.summary || topics.anomaly || topics.weather || topics.irrigation;
  const needsIrrigation = topics.summary || topics.irrigation || topics.weather;
  const needsMarket = topics.market || /mazot|motorin|fiyat|pazar|hal/.test(normalizeAgrobotChatText(message));

  const [anomalyIntel, irrigation, marketLive] = await Promise.all([
    needsAnomaly
      ? buildClimateAnomalyIntelPayload({ city, district, neighborhood, crop: cropKey, limit: 6 }).catch(() => null)
      : Promise.resolve(null),
    needsIrrigation
      ? buildIrrigationCalendarPayload({
          city,
          district,
          neighborhood,
          crop: cropKey,
          plantingDate: getDefaultIrrigationPlantingDate(cropKey),
          areaHa: 1,
          efficiency: 0.9,
          method: "damla",
          waterSource: "baraj_kanal",
          horizonDays: 14
        }).catch(() => null)
      : Promise.resolve(null),
    needsMarket
      ? fetchMarketLiveIntel({ city, district, crop: cropKey }).catch(() => null)
      : Promise.resolve(null)
  ]);

  const sections = [];
  if (topics.summary) {
    sections.push(
      buildAgrobotSummarySection({
        city,
        district,
        neighborhood,
        cropLabel,
        weather,
        diagnosisPack,
        anomalyIntel,
        irrigation
      })
    );
  }
  if (topics.disease || topics.summary) sections.push(buildAgrobotDiseaseSection({ diagnosisPack, actionPlan }));
  if (topics.irrigation || topics.summary || topics.weather) sections.push(buildAgrobotIrrigationSection({ irrigation }));
  if (topics.soil || topics.summary) sections.push(buildAgrobotSoilSection({ soilReport }));
  if (topics.anomaly || topics.summary || topics.weather) sections.push(buildAgrobotAnomalySection({ anomalyIntel }));
  if (topics.market) sections.push(buildAgrobotMarketSection({ marketLive, cropLabel }));

  const cleanedSections = sections.filter(Boolean).map((item) => ({
    ...item,
    bullets: (item.bullets || []).filter(Boolean).slice(0, 4)
  })).filter((item) => item.bullets.length);

  const highlights = buildAgrobotChatHighlights({
    diagnosisPack,
    anomalyIntel,
    irrigation,
    soilReport,
    marketLive
  });
  const actionables = buildAgrobotActionables({
    irrigation,
    anomalyIntel,
    marketLive
  });

  return {
    updatedAt: new Date().toISOString(),
    available: true,
    live: true,
    topic: topics.primary,
    locationLabel: buildLocationSearchQuery(city, district, neighborhood) || city,
    crop: {
      key: cropKey,
      label: cropLabel
    },
    answer: buildAgrobotAnswerText({
      primaryTopic: topics.primary,
      sections: cleanedSections,
      cropLabel
    }),
    sections: cleanedSections,
    highlights,
    actionables,
    suggestions: buildAgrobotChatSuggestions({
      cropLabel,
      topics,
      hasDiagnosis: Boolean(diagnosisPack?.diagnosis?.name)
    }),
    sources: [
      weather?.source ? { id: "weather", title: "Canli hava", detail: weather.source } : null,
      soilReport?.source ? { id: "soil", title: "Toprak", detail: soilReport.source } : null,
      anomalyIntel?.scope?.dataMode ? { id: "anomaly", title: "Anomali intel", detail: anomalyIntel.scope.dataMode } : null,
      irrigation?.source ? { id: "irrigation", title: "Sulama", detail: irrigation.source } : null,
      marketLive?.produce?.source ? { id: "market", title: "Pazar", detail: marketLive.produce.source } : null
    ].filter(Boolean)
  };
}

function buildHackhatonModelSuitePayload({ city = "", district = "", neighborhood = "" } = {}) {
  const scope = buildHackhatonScope(city, district, neighborhood);
  const cacheKey = `model-suite:${scope.locationLabel}`;
  const cached = getHackhatonCacheEntry(cacheKey);
  if (cached) return cached;

  const primaryRun =
    findLatestHackhatonRun({ prefixes: ["model_suite_realistic_"], requiredFile: "model_suite_summary.json" }) ||
    findLatestHackhatonRun({ prefixes: ["stability_smoke_"], requiredFile: "model_suite_summary.json" });

  if (!primaryRun) {
    return setHackhatonCacheEntry(cacheKey, {
      updatedAt: new Date().toISOString(),
      scope,
      available: false,
      error: "hackhaton_model_suite_not_found"
    });
  }

  const summaryPath = path.join(primaryRun.path, "model_suite_summary.json");
  const summaryMdPath = path.join(primaryRun.path, "model_suite_summary.md");
  const summary = hackhatonReadJsonSafe(summaryPath) || {};
  const robustSummary =
    hackhatonReadJsonSafe(path.join(primaryRun.path, "robust_selection", "robust_model_selection_summary.json")) ||
    summary?.robust_selection?.summary ||
    null;
  const healthSummary =
    summary?.health_suite?.summary ||
    hackhatonReadJsonSafe(path.join(primaryRun.path, "health", "health_suite_summary.json")) ||
    null;

  const selectedModels = Array.isArray(robustSummary?.selected_models)
    ? robustSummary.selected_models
    : Array.isArray(robustSummary?.selectedModels)
      ? robustSummary.selectedModels
      : Array.isArray(summary?.robust_selection?.summary?.selected_models)
        ? summary.robust_selection.summary.selected_models
        : [];

  const modelCards = selectedModels.map((item, idx) => {
    const modelKey = String(item.model_key || item.modelKey || "").trim();
    const variable = String(item.variable || "").trim();
    const chartPath = hackhatonFindChart(primaryRun.path, modelKey, variable);
    return {
      id: `${modelKey || "model"}-${variable || idx}`,
      modelKey,
      modelLabel: hackhatonModelLabel(modelKey),
      variable,
      variableLabel: hackhatonVariableLabel(variable),
      frequency: item.frequency || item.preferred_frequency || "-",
      score: Number(item.score_total || 0),
      rmse: Number(item.rmse || 0),
      confidence: Number(item.confidence || 0),
      grade: item.confidence_grade || item.confidenceGrade || "-",
      metricSource: item.metric_source || item.metricSource || "-",
      chart: hackhatonAssetRef(chartPath)
    };
  });

  const healthModels = Array.isArray(healthSummary?.results)
    ? healthSummary.results.map((item, idx) => ({
        id: `${item.model || idx}`,
        modelKey: item.model || "",
        modelLabel: hackhatonModelLabel(item.model),
        status: item.status || "unknown",
        relativeRisk: Number(item.future_mean_rr || 0),
        highRiskShare: Number(item.future_high_risk_share || 0),
        heatIndex: Number(item.future_mean_heat_index_c || 0),
        outputDir: item.output_dir || ""
      }))
    : [];

  const topReports = ["temp", "humidity", "precip", "pressure"]
    .map((variable) => {
      const selected =
        selectedModels.find((item) => String(item.variable || "").trim() === variable) ||
        {};
      const modelKey = String(selected.model_key || "").trim() || "quant";
      const report = hackhatonFindReportJson(primaryRun.path, modelKey, variable);
      const chartPath =
        report?.chart_png ||
        report?.regime_probs_png ||
        hackhatonFindChart(primaryRun.path, modelKey, variable);
      return {
        id: `${modelKey}-${variable}-report`,
        modelKey,
        modelLabel: hackhatonModelLabel(modelKey),
        variable,
        variableLabel: hackhatonVariableLabel(variable),
        rmse: Number(report?.cv_rmse || report?.rmse || selected.rmse || 0),
        coverage: Number(report?.monthly_coverage || report?.coverage || 0),
        bias: Number(report?.cv_bias || report?.bias_abs || 0),
        chart: hackhatonAssetRef(chartPath),
        chartFile: toHackhatonOutputRelative(chartPath),
        forecastFile: toHackhatonOutputRelative(report?.forecast_csv || selected.forecast_csv || ""),
        raw: report || null
      };
    })
    .filter((item) => item.chart || item.forecastFile || item.raw);

  const payload = {
    updatedAt: new Date().toISOString(),
    available: true,
    scope,
    run: {
      name: primaryRun.name,
      path: primaryRun.path
    },
    summary: {
      observationsOriginal: summary?.observations_original || null,
      observationsUsed: summary?.observations_used || null,
      stabilization: summary?.stabilization || null,
      modelsRequested: summary?.models_requested || [],
      modelsOk: summary?.models_ok || [],
      modelsFailed: summary?.models_failed || []
    },
    selectedModels: modelCards,
    healthModels,
    reportCards: topReports,
    narratives: [
      {
        id: "model-suite-summary",
        title: "Model Suite Ozet",
        type: "markdown",
        file: toHackhatonOutputRelative(summaryMdPath),
        excerpt: hackhatonExcerpt(hackhatonReadTextSafe(summaryMdPath, 800))
      },
      {
        id: "robust-selection-summary",
        title: "Robust Model Secimi",
        type: "markdown",
        file: toHackhatonOutputRelative(path.join(primaryRun.path, "robust_selection", "robust_model_selection_summary.md")),
        excerpt: hackhatonExcerpt(
          hackhatonReadTextSafe(path.join(primaryRun.path, "robust_selection", "robust_model_selection_summary.md"), 800)
        )
      },
      {
        id: "health-suite-summary",
        title: "Health Suite Ozet",
        type: "markdown",
        file: toHackhatonOutputRelative(path.join(primaryRun.path, "health", "health_suite_summary.md")),
        excerpt: hackhatonExcerpt(
          hackhatonReadTextSafe(path.join(primaryRun.path, "health", "health_suite_summary.md"), 800)
        )
      }
    ].filter((item) => item.file || item.excerpt)
  };

  return setHackhatonCacheEntry(cacheKey, payload);
}

function buildHackhatonDashboardPayload({ city = "", district = "", neighborhood = "" } = {}) {
  const scope = buildHackhatonScope(city, district, neighborhood);
  const cacheKey = `dashboard:${scope.locationLabel}`;
  const cached = getHackhatonCacheEntry(cacheKey);
  if (cached) return cached;

  const modelSuite = buildHackhatonModelSuitePayload({ city, district, neighborhood });
  const presentationHtmlPath = path.join(HACKHATON_OUTPUT_ROOT, "presentation", "eto_analizi_v4.html");
  const presentationSlides = hackhatonExtractPresentationSlides(presentationHtmlPath, 24);
  const documents = [
    {
      id: "hackhaton-final-report",
      title: "Hackhaton Final Raporu",
      type: "pdf",
      file: toHackhatonOutputRelative(path.join(HACKHATON_OUTPUT_ROOT, "pdf", "Hackhaton_Final_Raporu_2026-03-05.pdf"))
    },
    {
      id: "health-brief",
      title: "Yonetici Brif Tek Sayfa",
      type: "pdf",
      file: toHackhatonOutputRelative(path.join(HACKHATON_OUTPUT_ROOT, "health_impact", "yonetici_brif_tek_sayfa_latest.pdf"))
    },
    {
      id: "eto-analysis",
      title: "ET0 Analizi Sunumu",
      type: "pdf",
      file: toHackhatonOutputRelative(path.join(HACKHATON_OUTPUT_ROOT, "presentation", "eto_analizi_v4.pdf"))
    },
    {
      id: "eto-analysis-html",
      title: "ET0 Analizi HTML Sunum",
      type: "html",
      file: toHackhatonOutputRelative(presentationHtmlPath)
    },
    {
      id: "presentation-html",
      title: "Presentation HTML",
      type: "html",
      file: toHackhatonOutputRelative(path.join(HACKHATON_OUTPUT_ROOT, "presentation", "presentation.html"))
    }
  ]
    .filter((item) => item.file)
    .map((item) => ({
      ...item,
      asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, item.file))
    }));

  const visuals = Array.isArray(modelSuite?.reportCards)
    ? modelSuite.reportCards
        .filter((item) => item.chart)
        .map((item, idx) => ({
          id: `visual-${idx}-${item.variable}`,
          title: `${item.variableLabel} gorunumu`,
          subtitle: `${item.modelLabel} • RMSE ${hackhatonScoreText(item.rmse)}`,
          variable: item.variable,
          modelLabel: item.modelLabel,
          chart: item.chart
        }))
    : [];

  const gemGallery = [
    {
      id: "best-annual-trends",
      title: "Yillik Trendler + Su Stresi",
      subtitle: "Yagis, sicaklik ve su stresi tek panoda",
      group: "En Iyi Grafikler",
      file: path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "01_yillik_trendler_yagis_sicaklik_su_stresi.png")
    },
    {
      id: "best-drought-spi12",
      title: "SPI12 Kuraklik Izleme",
      subtitle: "Kuraklik sinyalini zaman ekseninde gosterir",
      group: "En Iyi Grafikler",
      file: path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "02_spi12_kuraklik_izleme.png")
    },
    {
      id: "best-risk-rates",
      title: "Donemsel Risk Oranlari",
      subtitle: "Risk dagilimi ve siddet orani",
      group: "En Iyi Grafikler",
      file: path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "03_donemsel_risk_oranlari.png")
    },
    {
      id: "best-quant-temp",
      title: "Sicaklik Quant 2035",
      subtitle: "2035 ufkunda quant tabanli sicaklik gorunumu",
      group: "En Iyi Grafikler",
      file: path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "05_sicaklik_quant_2035.png")
    },
    {
      id: "best-solar-potential",
      title: "Gunes Potansiyeli 2035",
      subtitle: "Enerji ve sulama planlama icin solar gorunum",
      group: "En Iyi Grafikler",
      file: path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "08_gunes_potansiyeli_2035_pro.png")
    },
    {
      id: "spreadsheet-ml-performance",
      title: "ML Performans Ozet",
      subtitle: "Spreadsheet pipeline egitim performansi",
      group: "Spreadsheet",
      file: path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "ml_performans.png")
    },
    {
      id: "spreadsheet-et0-source-map",
      title: "ET0 Kaynak Haritasi",
      subtitle: "Kaynak dagilimi ve ET0 doldurma mantigi",
      group: "Spreadsheet",
      file: path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "et0_kaynak_haritasi_1987.png")
    },
    {
      id: "spreadsheet-cmip6",
      title: "CMIP6 Projeksiyon",
      subtitle: "Uzun vadeli iklim projeksiyon paneli",
      group: "Spreadsheet",
      file: path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "cmip6_projeksiyon.png")
    }
  ]
    .map((item) => ({
      ...item,
      asset: hackhatonAssetRef(item.file)
    }))
    .filter((item) => item.asset);

  const trainingSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "meteoroloji_model_egitim_genisletilmis_ozet.json")
  );
  const completionSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "et0_completion_summary_1987.json")
  );
  const irrigationValidation = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "irrigation_crop_ml_validation_1987.json")
  );
  const datasetHighlights = [
    trainingSummary
      ? {
          id: "dataset-training",
          title: "Meteoroloji egitim matrisi",
          summary: "1918-2019 genisletilmis egitim matrisi ve tum degiskenler doldurulmus durumda.",
          metrics: [
            { label: "Ham satir", value: String(trainingSummary.input_obs_graph_rows || "-") },
            { label: "Zaman damgasi", value: String(trainingSummary.expanded_wide_timestamps || "-") },
            { label: "Degisken", value: Array.isArray(trainingSummary.variables) ? String(trainingSummary.variables.length) : "-" }
          ]
        }
      : null,
    completionSummary
      ? {
          id: "dataset-et0",
          title: "ET0 tamamlama ozeti",
          summary: "1987 yilinda yerel sicaklik/nem ile tamamlanmis ET0 uretimi.",
          metrics: [
            { label: "Gun sayisi", value: String(completionSummary.coverage?.days_total || "-") },
            { label: "Yillik ET0", value: `${Number(completionSummary.et0?.completed_year_sum_mm || 0).toFixed(1)} mm` },
            { label: "Gunluk ortalama", value: `${Number(completionSummary.et0?.completed_daily_mean_mm || 0).toFixed(2)} mm` }
          ]
        }
      : null,
    irrigationValidation
      ? {
          id: "dataset-irrigation-validation",
          title: "Sulama ML validasyonu",
          summary: irrigationValidation.all_passed
            ? "Formul ve tahmin kontrolleri gecti."
            : "Bazi validasyon adimlari kontrol gerektiriyor.",
          metrics: [
            { label: "Tum kontroller", value: irrigationValidation.all_passed ? "PASS" : "CHECK" },
            { label: "Gunluk akış", value: irrigationValidation.checks?.daily_non_empty ? "OK" : "ERR" },
            { label: "Liderboard", value: irrigationValidation.checks?.ml_leaderboard_non_empty ? "OK" : "ERR" }
          ]
        }
      : null
  ].filter(Boolean);

  const formatMetric = (value, digits = 1, suffix = "") => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    return `${numeric.toFixed(digits)}${suffix}`;
  };
  const formatSignedMetric = (value, digits = 1, suffix = "") => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(digits)}${suffix}`;
  };

  const et0AccuracyRows = hackhatonReadCsvRowsSafe(path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "et0_ml_accuracy_1987.csv"));
  const bestEt0Row =
    et0AccuracyRows.find((row) => /gradient/i.test(String(row?.model || ""))) || et0AccuracyRows[0] || null;

  const playbooks = [
    {
      id: "playbook-model-suite",
      title: "Model Suite Orkestrasyonu",
      subtitle: "Quant, Prophet, Strong, robust selection ve health suite tek akis.",
      category: "Forecast Stack",
      filePath: path.join(HACKHATON_ROOT, "MODEL_SUITE_KULLANIM.md"),
      metrics: [
        { label: "Cekirdek", value: "9 model" },
        { label: "Secim", value: "robust arbitration" },
        { label: "Health", value: "entegre" }
      ]
    },
    {
      id: "playbook-et0-ml",
      title: "ET0 ML + Sulama Rehberi",
      subtitle: "Evapotranspirasyon tahmini, sulama planlama ve model dogrulama.",
      category: "Sulama",
      filePath: path.join(HACKHATON_ROOT, "ET_ML_KULLANIM.md"),
      metrics: [
        { label: "En iyi model", value: bestEt0Row?.model || "Gradient Boosting" },
        { label: "R2", value: bestEt0Row ? `${formatMetric(bestEt0Row.r2_pct, 1, "%")}` : "-" },
        { label: "RMSE", value: bestEt0Row ? `${formatMetric(bestEt0Row.rmse_mm_day, 3, " mm/gun")}` : "-" }
      ]
    },
    {
      id: "playbook-water-decision",
      title: "Su Karar Destek Akisi",
      subtitle: "Senaryolu rezervuar, erken uyari ve dashboard pipeline rehberi.",
      category: "Su Yonetimi",
      filePath: path.join(HACKHATON_ROOT, "MODEL_DECISION_DASHBOARD_KULLANIM.md"),
      metrics: [
        { label: "Ufuk", value: "60 ay" },
        { label: "Senaryo", value: "7 akıs" },
        { label: "Alert", value: "JSON + Slack" }
      ]
    },
    {
      id: "playbook-solar",
      title: "Solar + Enerji Literaturi",
      subtitle: "FAO-56, PVWatts ve 2024-2026 guncel review notlari.",
      category: "Enerji",
      filePath: path.join(HACKHATON_ROOT, "SOLAR_MODEL_LITERATURE.md"),
      metrics: [
        { label: "Referans", value: "FAO-56 + PVWatts" },
        { label: "Yayin", value: "2024-2026" },
        { label: "Yaklasim", value: "physics + ML" }
      ]
    },
    {
      id: "playbook-strong",
      title: "Strong Ensemble Rehberi",
      subtitle: "Prophet, ETS, SARIMA ve naive tabanli hibrit tahmin akisi.",
      category: "Ensemble",
      filePath: path.join(HACKHATON_ROOT, "STRONG_MODEL_KULLANIM.md"),
      metrics: [
        { label: "CV", value: "rolling" },
        { label: "Aile", value: "5 model" },
        { label: "Final", value: "agirlikli ensemble" }
      ]
    },
    {
      id: "playbook-prophet",
      title: "Prophet Hiperparametre Rehberi",
      subtitle: "Auto-tune, holdout ve multi-series iklim tahmin notlari.",
      category: "Forecasting",
      filePath: path.join(HACKHATON_ROOT, "PROPHET_KULLANIM.md"),
      metrics: [
        { label: "Tune", value: "auto" },
        { label: "Backtest", value: "4 split" },
        { label: "Fallback", value: "seasonal naive" }
      ]
    }
  ]
    .map((item) => ({
      ...item,
      asset: hackhatonRootAssetRef(item.filePath),
      excerpt: hackhatonExcerpt(hackhatonReadTextSafe(item.filePath, 1400), 340)
    }))
    .filter((item) => item.excerpt || item.asset);

  const droughtPeriodRows = hackhatonReadCsvRowsSafe(path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "period_summary.csv"));
  const droughtBaseline = droughtPeriodRows.find((row) => String(row?.period || "") === "1988-2018") || null;
  const droughtFuture = droughtPeriodRows.find((row) => String(row?.period || "") === "2026-2035") || null;
  const earlyWarningRows = hackhatonReadCsvRowsSafe(path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "early_warning_dashboard.csv"));
  const droughtCalendarRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "future_alert_calendar_monthly.csv"),
    18
  );
  const droughtRiskYearRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "top_risk_years_wsi.csv"),
    12
  );
  const droughtLagRows = hackhatonReadCsvRowsSafe(path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "meteo_hydro_lag_summary.csv"));
  const droughtReliabilityRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "spi_reliability_diagnostics.csv"),
    120
  );
  const droughtPrecipDeltaPct =
    droughtBaseline && droughtFuture
      ? (Number(droughtFuture.annual_precip_mm_mean || 0) / Math.max(1e-9, Number(droughtBaseline.annual_precip_mm_mean || 0)) - 1) * 100
      : null;
  const droughtWaterBalanceDelta =
    droughtBaseline && droughtFuture
      ? Number(droughtFuture.annual_water_balance_mm_mean || 0) - Number(droughtBaseline.annual_water_balance_mm_mean || 0)
      : null;
  const droughtDryMonthDeltaPp =
    droughtBaseline && droughtFuture
      ? (Number(droughtFuture.dry_month_rate || 0) - Number(droughtBaseline.dry_month_rate || 0)) * 100
      : null;
  const droughtLagSpi12 =
    droughtLagRows.find((row) => String(row?.period || "") === "1988-2035" && String(row?.meteo_index || "") === "spi12") ||
    droughtLagRows.find((row) => String(row?.meteo_index || "") === "spi12") ||
    null;
  const droughtReliability =
    droughtReliabilityRows.find((row) => String(row?.index_type || "") === "SPI" && String(row?.scale_months || "") === "12") ||
    droughtReliabilityRows[0] ||
    null;
  const droughtIntel = {
    title: "Kuraklik + Su Butcesi Istihbarati",
    subtitle: "1988-2018 referansina gore 2026-2035 sinyal, erken uyari ve risk ozeti.",
    cards: [
      droughtPrecipDeltaPct != null
        ? {
            id: "drought-precip",
            label: "Yillik yagis degisimi",
            value: formatSignedMetric(droughtPrecipDeltaPct, 1, "%"),
            detail: "2026-2035 vs 1988-2018"
          }
        : null,
      droughtWaterBalanceDelta != null
        ? {
            id: "drought-water-balance",
            label: "Su dengesi farki",
            value: formatSignedMetric(droughtWaterBalanceDelta, 1, " mm"),
            detail: "P - PET yillik ortalama"
          }
        : null,
      droughtDryMonthDeltaPp != null
        ? {
            id: "drought-dry-rate",
            label: "Kuru ay orani",
            value: formatSignedMetric(droughtDryMonthDeltaPp, 1, " puan"),
            detail: "P20 altindaki ay payi"
          }
        : null,
      droughtLagSpi12
        ? {
            id: "drought-lag",
            label: "Meteo -> hidro gecikme",
            value: `${droughtLagSpi12.best_lag_months || "-"} ay`,
            detail: `SPI12 corr ${formatMetric(droughtLagSpi12.best_corr, 2)}`
          }
        : null,
      droughtReliability
        ? {
            id: "drought-reliability",
            label: "SPI/SPEI guvenilirligi",
            value: `${formatMetric(droughtReliability.reliability_score_0_100, 0)}/100`,
            detail: String(droughtReliability.reliability_label || "yuksek")
          }
        : null
    ].filter(Boolean),
    documents: [
      {
        id: "drought-report-core",
        title: "Kuraklik ve Su Kaynaklari Analizi",
        subtitle: "Temel donem karsilastirma raporu",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "analysis", "kuraklik_su_kaynaklari_analizi.md")
      },
      {
        id: "drought-report-advanced",
        title: "Gelismis Kuraklik + Su Analizi",
        subtitle: "SPI/SPEI, su butcesi, trend ve guvenilirlik detaylari",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "gelismis_kuraklik_su_analizi.md")
      },
      {
        id: "drought-report-plain",
        title: "Halk Dili Ozet",
        subtitle: "Karar verici ve saha ekibi icin sade yorum",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "analysis_gelismis", "halk_dili_ozet.md")
      }
    ]
      .map((item) => ({
        ...item,
        asset: hackhatonAssetRef(item.filePath),
        excerpt: hackhatonExcerpt(hackhatonReadTextSafe(item.filePath, 1200), 280)
      }))
      .filter((item) => item.asset || item.excerpt),
    visuals: [
      {
        id: "drought-visual-trends",
        title: "Yillik trendler",
        subtitle: "Yagis, sicaklik ve su stresi ayni panelde",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "01_yillik_trendler_yagis_sicaklik_su_stresi.png"))
      },
      {
        id: "drought-visual-spi12",
        title: "SPI12 kuraklik izleme",
        subtitle: "Kuraklik sinyalinin zaman ekseni",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "02_spi12_kuraklik_izleme.png"))
      },
      {
        id: "drought-visual-risk-rates",
        title: "Donemsel risk oranlari",
        subtitle: "Risk siddeti ve dagilimi",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "03_donemsel_risk_oranlari.png"))
      },
      {
        id: "drought-visual-news",
        title: "Olay siddeti + haber paneli",
        subtitle: "Olay etkisi ve haber temelli saha paneli",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "en_iyi_grafikler_2026-03-05", "04_olay_siddet_haber_dashboard.png"))
      }
    ].filter((item) => item.asset),
    alertCalendar: droughtCalendarRows.slice(0, 6).map((row) => ({
      id: `alert-${row.timestamp}`,
      month: String(row.timestamp || "").slice(0, 7),
      riskLevel: row.risk_level || "-",
      riskScore: formatMetric(row.risk_score, 1),
      dryProb: formatMetric(Number(row.dry_prob || 0) * 100, 0, "%"),
      hotProb: formatMetric(Number(row.hot_prob || 0) * 100, 0, "%")
    })),
    riskYears: droughtRiskYearRows.slice(0, 5).map((row) => ({
      id: `risk-year-${row.year}`,
      year: row.year || "-",
      waterStress: formatMetric(row.water_stress_index, 2),
      classLabel: row.wsi_class || "-",
      droughtClass: row.de_martonne_class || "-",
      precip: `${formatMetric(row.precip_total_mm, 0)} mm`
    })),
    indicatorNotes: earlyWarningRows.slice(0, 4).map((row) => ({
      id: `indicator-${row.indicator}`,
      indicator: row.indicator || "-",
      baseline: formatMetric(Number(row.baseline || 0) * (String(row.indicator || "").includes("_rate") ? 100 : 1), String(row.indicator || "").includes("_rate") ? 1 : 2, String(row.indicator || "").includes("_rate") ? "%" : ""),
      future: formatMetric(Number(row.future || 0) * (String(row.indicator || "").includes("_rate") ? 100 : 1), String(row.indicator || "").includes("_rate") ? 1 : 2, String(row.indicator || "").includes("_rate") ? "%" : ""),
      note: row.note || ""
    }))
  };

  const waterDecisionRunSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "run_summary.json")
  );
  const waterDecisionScenarioSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "scenario_summary.json")
  );
  const waterDecisionExpectedRisk = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "expected_risk_summary.json")
  );
  const waterDecisionDynamicSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "dynamic_threshold_summary.json")
  );
  const waterDecisionCalibration = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "calibration_summary.json")
  );
  const waterDecisionInterval = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "interval_calibration_summary.json")
  );
  const waterDecisionPublicReport = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "public_report_summary.json")
  );
  const waterDecisionBaselineSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "baseline_selected_strategy_summary.json")
  );
  const waterDecisionNewSummary = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "new_selected_strategy_summary.json")
  );
  const waterDecisionAlertsWindow = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "alerts_2026_03_2027_02.json")
  );
  const waterDecisionAlertsMulti = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "alerts_multi_scenario.json")
  );
  const waterDecisionStrategyRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "new_selected_strategy_all.csv"),
    40
  )
    .map((row) => ({
      series: row.series || "-",
      strategy: row.strategy || "-",
      rmse: Number(row.rmse),
      mae: Number(row.mae),
      smape: Number(row.smape),
      rmseRecent: Number(row.rmse_recent),
      stability: Number(row.rmse_split_std),
      score: Number(row.score_total)
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => a.score - b.score);
  const waterDecisionWorstStrategyRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "new_selected_strategy_worst6.csv"),
    12
  )
    .map((row) => ({
      series: row.series || "-",
      strategy: row.strategy || "-",
      rmse: Number(row.rmse),
      mae: Number(row.mae),
      smape: Number(row.smape),
      rmseRecent: Number(row.rmse_recent),
      stability: Number(row.rmse_split_std),
      score: Number(row.score_total)
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score);
  const waterDecisionHistoricalRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "istanbul_dam_monthly_history.csv"),
    400
  )
    .map((row) => ({
      ds: String(row.ds || "").slice(0, 10),
      overallMeanPct: Number(row.overall_mean) * 100
    }))
    .filter((row) => row.ds && Number.isFinite(row.overallMeanPct));
  const waterDecisionTimelineRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "story_overall_timeline_weighted.csv"),
    120
  )
    .map((row) => ({
      ds: String(row.ds || "").slice(0, 10),
      expectedPct: Number(row.expected_yhat_pct)
    }))
    .filter((row) => row.ds && Number.isFinite(row.expectedPct));
  const waterDecisionScenarioDynamicRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "scenario_dynamic_risk_summary.csv"),
    200
  )
    .map((row) => ({
      scenario: row.scenario || "-",
      series: row.series || "-",
      strategy: row.strategy || "-",
      riskLevel: String(row.risk_level || "low").toLowerCase(),
      monthsBelowWarning: Number(row.months_below_warning),
      monthsBelowCritical: Number(row.months_below_critical),
      meanProbBelowWarningPct: Number(row.mean_prob_below_warning_pct),
      meanProbBelowCriticalPct: Number(row.mean_prob_below_critical_pct),
      meanGapToWarningPct: Number(row.mean_gap_to_warning_pct),
      worstWarningMonth: String(row.worst_warning_month || "").slice(0, 7),
      worstForecastPct: Number(row.worst_forecast_pct)
    }))
    .filter((row) => row.scenario && row.series);
  const waterDecisionDropMatchRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "istanbul_baraj_ani_dusus_gercek_olay_eslesme.csv"),
    30
  );
  const waterDecisionVerifiedEventRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "istanbul_baraj_gercek_olaylar_dogrulanmis.csv"),
    30
  );
  const waterDecisionExpectedRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "expected_risk_summary.csv"),
    40
  )
    .sort((a, b) => Number(b.expected_prob_below_40_pct || 0) - Number(a.expected_prob_below_40_pct || 0))
    .slice(0, 5);
  const waterDecisionRiskRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "risk_summary_2026_03_to_2027_02.csv"),
    40
  )
    .sort((a, b) => Number(b.mean_prob_below_40_pct || 0) - Number(a.mean_prob_below_40_pct || 0))
    .slice(0, 5);
  const waterDecisionHistoricalLatest =
    waterDecisionHistoricalRows.length > 0 ? waterDecisionHistoricalRows[waterDecisionHistoricalRows.length - 1] : null;
  const waterDecisionHistoricalMin = waterDecisionHistoricalRows.reduce(
    (minRow, row) => (!minRow || row.overallMeanPct < minRow.overallMeanPct ? row : minRow),
    null
  );
  const waterDecisionHistoricalMax = waterDecisionHistoricalRows.reduce(
    (maxRow, row) => (!maxRow || row.overallMeanPct > maxRow.overallMeanPct ? row : maxRow),
    null
  );
  const waterDecisionHistoricalAverage =
    waterDecisionHistoricalRows.length > 0
      ? waterDecisionHistoricalRows.reduce((sum, row) => sum + row.overallMeanPct, 0) / waterDecisionHistoricalRows.length
      : null;
  const waterDecisionOutlookRows = waterDecisionTimelineRows.slice(0, 12);
  const waterDecisionOutlookMin = waterDecisionOutlookRows.reduce(
    (minRow, row) => (!minRow || row.expectedPct < minRow.expectedPct ? row : minRow),
    null
  );
  const waterDecisionOutlookAverage =
    waterDecisionOutlookRows.length > 0
      ? waterDecisionOutlookRows.reduce((sum, row) => sum + row.expectedPct, 0) / waterDecisionOutlookRows.length
      : null;
  const waterDecisionMetricLiftPct = (baselineValue, newValue) => {
    const baselineNumeric = Number(baselineValue);
    const newNumeric = Number(newValue);
    if (!Number.isFinite(baselineNumeric) || !Number.isFinite(newNumeric) || baselineNumeric === 0) return null;
    return ((baselineNumeric - newNumeric) / baselineNumeric) * 100;
  };
  const waterDecisionRiskPriority = { high: 0, medium: 1, low: 2 };
  const waterDecisionScenarioHotspots = waterDecisionScenarioDynamicRows.reduce((acc, row) => {
    const key = row.scenario;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  Object.keys(waterDecisionScenarioHotspots).forEach((scenario) => {
    waterDecisionScenarioHotspots[scenario].sort((a, b) => {
      const priorityDelta = (waterDecisionRiskPriority[a.riskLevel] ?? 99) - (waterDecisionRiskPriority[b.riskLevel] ?? 99);
      if (priorityDelta !== 0) return priorityDelta;
      return (b.meanProbBelowWarningPct || 0) - (a.meanProbBelowWarningPct || 0);
    });
  });
  const waterDecisionScenarioMatrix = Object.entries(waterDecisionAlertsMulti?.counts_by_scenario || {})
    .map(([scenario, counts]) => {
      const hotspot = waterDecisionScenarioHotspots[scenario]?.[0] || null;
      return {
        id: `water-scenario-${scenario}`,
        scenario,
        high: Number(counts?.high || 0),
        medium: Number(counts?.medium || 0),
        low: Number(counts?.low || 0),
        total: Number(counts?.total || 0),
        pressureScore: Number(counts?.high || 0) * 2 + Number(counts?.medium || 0),
        topSeries: hotspot?.series || "-",
        topRiskLevel: hotspot?.riskLevel || "low",
        topWorstMonth: hotspot?.worstWarningMonth || "-",
        topWorstFill: Number.isFinite(hotspot?.worstForecastPct) ? `${formatMetric(hotspot.worstForecastPct, 1)}%` : "-"
      };
    })
    .sort((a, b) => b.pressureScore - a.pressureScore || a.scenario.localeCompare(b.scenario));
  const waterDecisionAlertsFeed = Array.isArray(waterDecisionAlertsWindow?.alerts)
    ? waterDecisionAlertsWindow.alerts
        .map((row, index) => ({
          id: `water-alert-feed-${row.series || index}`,
          series: row.series || "-",
          strategy: row.strategy || "-",
          riskLevel: String(row.risk_level || "low").toLowerCase(),
          monthsBelow40: row.months_below_40 ?? "-",
          meanRisk: `${formatMetric(row.mean_probability_below_40_pct, 1)}%`,
          meanForecast: `${formatMetric(row.mean_forecast_pct, 1)}%`,
          worstMonth: String(row.worst_month || "").slice(0, 7),
          worstFill: `${formatMetric(row.worst_forecast_pct, 1)}%`
        }))
        .sort((a, b) => {
          const priorityDelta = (waterDecisionRiskPriority[a.riskLevel] ?? 99) - (waterDecisionRiskPriority[b.riskLevel] ?? 99);
          if (priorityDelta !== 0) return priorityDelta;
          return Number.parseFloat(b.meanRisk) - Number.parseFloat(a.meanRisk);
        })
        .slice(0, 8)
    : [];
  const waterDecisionDropEvents = [
    ...waterDecisionDropMatchRows.map((row, index) => ({
      id: `water-drop-match-${row.sira || index}`,
      eventDate: String(row.olay_tarihi || row.dusus_tarihi || "").slice(0, 10),
      kind: "Ani dusus eslesmesi",
      title: row.olay_basligi || "Eslesen olay bulunamadi.",
      source: row.kaynak || "-",
      hazard: row.tehlike_tipi || "-",
      dropScore: formatSignedMetric(row.dusus_puan, 1, " puan"),
      summary: hackhatonExcerpt(row.olay_basligi || "", 150),
      url: row.url || ""
    })),
    ...waterDecisionVerifiedEventRows.map((row, index) => ({
      id: `water-drop-verified-${index}`,
      eventDate: String(row.event_date || "").slice(0, 10),
      kind: "Dogrulanmis arsiv olayi",
      title: row.event_title || "Arsiv kaydi",
      source: row.source_name || "-",
      hazard: "baraj seviyesi",
      dropScore: "-",
      summary: hackhatonExcerpt(row.event_summary || "", 150),
      url: row.source_url || ""
    }))
  ]
    .filter((row) => row.eventDate && row.title)
    .sort((a, b) => String(b.eventDate).localeCompare(String(a.eventDate)))
    .slice(0, 10);
  const waterDecisionStrategyPulse =
    waterDecisionNewSummary || waterDecisionBaselineSummary
      ? {
          headline:
            waterDecisionMetricLiftPct(waterDecisionBaselineSummary?.rmse_mean, waterDecisionNewSummary?.rmse_mean) > 0
              ? "Secili strateji seti baseline'a gore iyilesmis."
              : "Secili strateji seti baseline ile benzer seviyede.",
          rmseLiftPct: waterDecisionMetricLiftPct(waterDecisionBaselineSummary?.rmse_mean, waterDecisionNewSummary?.rmse_mean),
          maeLiftPct: waterDecisionMetricLiftPct(waterDecisionBaselineSummary?.mae_mean, waterDecisionNewSummary?.mae_mean),
          smapeLiftPct: waterDecisionMetricLiftPct(waterDecisionBaselineSummary?.smape_mean, waterDecisionNewSummary?.smape_mean),
          ensembleSharePct: Number(waterDecisionNewSummary?.ensemble_share || waterDecisionBaselineSummary?.ensemble_share) * 100,
          seriesCount: Number(waterDecisionNewSummary?.n_series || waterDecisionBaselineSummary?.n_series || 0),
          recentRmse: Number(waterDecisionNewSummary?.rmse_recent_mean),
          stabilityStd: Number(waterDecisionNewSummary?.rmse_split_std_mean)
        }
      : null;
  const waterDecisionHistorySummary =
    waterDecisionHistoricalLatest || waterDecisionOutlookMin || waterDecisionHistoricalMin
      ? {
          latestObservedMonth: waterDecisionHistoricalLatest?.ds ? waterDecisionHistoricalLatest.ds.slice(0, 7) : "-",
          latestObservedPct: waterDecisionHistoricalLatest?.overallMeanPct,
          historicalMeanPct: waterDecisionHistoricalAverage,
          historicalMinMonth: waterDecisionHistoricalMin?.ds ? waterDecisionHistoricalMin.ds.slice(0, 7) : "-",
          historicalMinPct: waterDecisionHistoricalMin?.overallMeanPct,
          historicalMaxMonth: waterDecisionHistoricalMax?.ds ? waterDecisionHistoricalMax.ds.slice(0, 7) : "-",
          historicalMaxPct: waterDecisionHistoricalMax?.overallMeanPct,
          outlookMinMonth: waterDecisionOutlookMin?.ds ? waterDecisionOutlookMin.ds.slice(0, 7) : "-",
          outlookMinPct: waterDecisionOutlookMin?.expectedPct,
          outlookAvgPct: waterDecisionOutlookAverage,
          outlookDeltaPct:
            Number.isFinite(waterDecisionOutlookAverage) && Number.isFinite(waterDecisionHistoricalLatest?.overallMeanPct)
              ? waterDecisionOutlookAverage - waterDecisionHistoricalLatest.overallMeanPct
              : null,
          reportWindow:
            waterDecisionPublicReport?.window_start && waterDecisionPublicReport?.window_end
              ? `${String(waterDecisionPublicReport.window_start).slice(0, 7)} -> ${String(waterDecisionPublicReport.window_end).slice(0, 7)}`
              : null
        }
      : null;
  const waterDecision = {
    title: "Su Karar Destek Paketi",
    subtitle: "Senaryolu rezervuar, erken uyari ve kalibrasyon ciktilari.",
    cards: [
      waterDecisionExpectedRisk?.overall
        ? {
            id: "water-expected-fill",
            label: "Beklenen sistem dolulugu",
            value: `${formatMetric(waterDecisionExpectedRisk.overall.expected_mean_yhat_pct, 1)}%`,
            detail: `${waterDecisionExpectedRisk.window_start || "2026-03"} -> ${waterDecisionExpectedRisk.window_end || "2027-02"}`
          }
        : null,
      waterDecisionExpectedRisk?.overall
        ? {
            id: "water-risk-below-40",
            label: "P(<40)",
            value: `${formatMetric(waterDecisionExpectedRisk.overall.expected_prob_below_40_pct, 1)}%`,
            detail: `${formatMetric(waterDecisionExpectedRisk.overall.expected_months_lt40, 1)} ay esit beklenen risk`
          }
        : null,
      waterDecisionDynamicSummary
        ? {
            id: "water-dynamic-risk",
            label: "Dinamik yuksek risk ayi",
            value: `${waterDecisionDynamicSummary.threshold_high_risk_months || "-"} ay`,
            detail: `%${formatMetric(waterDecisionDynamicSummary.threshold_high_prob, 0)} ustu kritik olasilik`
          }
        : null,
      waterDecisionInterval?.overall
        ? {
            id: "water-coverage",
            label: "Kalibre coverage",
            value: `${formatMetric(waterDecisionInterval.overall.coverage_after_pct, 1)}%`,
            detail: `hedef ${formatMetric(waterDecisionInterval.target_coverage_pct, 0)}% • scale ${formatMetric(
              waterDecisionInterval.overall.interval_scale_factor,
              2
            )}x`
          }
        : null,
      waterDecisionRunSummary
        ? {
            id: "water-horizon",
            label: "Tahmin ufku",
            value: `${waterDecisionRunSummary.forecast_horizon_months || "-"} ay`,
            detail: `${waterDecisionScenarioSummary?.scenario_count || "-"} senaryo • ${
              waterDecisionRunSummary.enable_stacked_ensemble ? "stacked" : "single"
            }`
          }
        : null
    ].filter(Boolean),
    dashboards: [
      {
        id: "water-dashboard-v2",
        title: "Karar Destek HTML",
        subtitle: "Senaryo secimli dashboard v2",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "dashboard_v2.html"))
      },
      {
        id: "water-dashboard-classic",
        title: "Klasik Dashboard",
        subtitle: "Ilk HTML karar destek paneli",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "dashboard.html"))
      }
    ].filter((item) => item.asset),
    documents: [
      {
        id: "water-doc-summary",
        title: "Karar Destek Ozeti",
        subtitle: "Risk siralamasi ve operasyonel ozet",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "KARAR_DESTEK_OZETI.md")
      },
      {
        id: "water-doc-story",
        title: "Hikaye Ozeti",
        subtitle: "Senaryo agirliklari ve beklenen en kritik seriler",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "HIKAYE_OZETI.md")
      },
      {
        id: "water-doc-literature",
        title: "Sonuc Ozeti + Literatur Kontrolu",
        subtitle: "Literaturle uyum ve sonuc yorumu",
        filePath: path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "SONUC_OZETI_VE_LITERATUR_KONTROLU.md")
      }
    ]
      .map((item) => ({
        ...item,
        asset: hackhatonAssetRef(item.filePath),
        excerpt: hackhatonExcerpt(hackhatonReadTextSafe(item.filePath, 1200), 280)
      }))
      .filter((item) => item.asset || item.excerpt),
    visuals: [
      {
        id: "water-visual-heatmap",
        title: "Risk heatmap P(<40)",
        subtitle: "Seri bazli dusuk doluluk riski",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "risk_heatmap_prob_below_40.png"))
      },
      {
        id: "water-visual-scenario",
        title: "overall_mean senaryo karsilastirma",
        subtitle: "Dry vs wet senaryolarin gorunumu",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "overall_mean_scenario_compare.png"))
      },
      {
        id: "water-visual-timeline",
        title: "Agirlikli zaman cizgisi",
        subtitle: "Beklenen sistem dolulugu zaman akisi",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "story_overall_timeline_weighted.png"))
      },
      {
        id: "water-visual-gap",
        title: "Esik gap heatmap",
        subtitle: "Dinamik uyarilara gore acik/kapama farki",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "story_expected_gap_heatmap.png"))
      },
      {
        id: "water-visual-top-risk",
        title: "Senaryo bazli en riskli seriler",
        subtitle: "Her senaryoda baskin riskli rezervuarlar",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "top_risk_compare_by_scenario.png"))
      },
      {
        id: "water-visual-pack",
        title: "Story visual pack",
        subtitle: "Sunumda kullanilan toplu baraj gorsel paketi",
        asset: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "story_visual_pack.png"))
      }
    ].filter((item) => item.asset),
    scenarioWeights: Array.isArray(waterDecisionExpectedRisk?.weights)
      ? waterDecisionExpectedRisk.weights.slice(0, 5).map((row) => ({
          id: `water-weight-${row.scenario}`,
          scenario: row.scenario || "-",
          weight: `${formatMetric(Number(row.weight || 0) * 100, 1)}%`,
          score: formatMetric(row.weight_score, 0)
        }))
      : [],
    criticalSeries: waterDecisionExpectedRows.map((row) => ({
      id: `water-critical-${row.series}`,
      series: row.series || "-",
      expectedRisk: `${formatMetric(row.expected_prob_below_40_pct, 1)}%`,
      meanFill: `${formatMetric(row.expected_mean_yhat_pct, 1)}%`,
      highRisk: `${formatMetric(Number(row.prob_high_risk || 0) * 100, 1)}%`
    })),
    alertSeries: waterDecisionRiskRows.map((row) => ({
      id: `water-alert-${row.series}`,
      series: row.series || "-",
      monthsLt40: row.months_lt40 || "-",
      meanRisk: `${formatMetric(row.mean_prob_below_40_pct, 1)}%`,
      worstMonth: String(row.worst_month || "").slice(0, 7),
      worstFill: `${formatMetric(row.worst_yhat_pct, 1)}%`
    })),
    strategyPulse: waterDecisionStrategyPulse
      ? {
          headline: waterDecisionStrategyPulse.headline,
          rmseLift: Number.isFinite(waterDecisionStrategyPulse.rmseLiftPct)
            ? formatSignedMetric(waterDecisionStrategyPulse.rmseLiftPct, 1, "%")
            : "-",
          maeLift: Number.isFinite(waterDecisionStrategyPulse.maeLiftPct)
            ? formatSignedMetric(waterDecisionStrategyPulse.maeLiftPct, 1, "%")
            : "-",
          smapeLift: Number.isFinite(waterDecisionStrategyPulse.smapeLiftPct)
            ? formatSignedMetric(waterDecisionStrategyPulse.smapeLiftPct, 1, "%")
            : "-",
          ensembleShare: Number.isFinite(waterDecisionStrategyPulse.ensembleSharePct)
            ? `${formatMetric(waterDecisionStrategyPulse.ensembleSharePct, 0)}%`
            : "-",
          seriesCount: Number.isFinite(waterDecisionStrategyPulse.seriesCount) ? String(waterDecisionStrategyPulse.seriesCount) : "-",
          recentRmse: Number.isFinite(waterDecisionStrategyPulse.recentRmse)
            ? formatMetric(waterDecisionStrategyPulse.recentRmse, 3)
            : "-",
          stabilityStd: Number.isFinite(waterDecisionStrategyPulse.stabilityStd)
            ? formatMetric(waterDecisionStrategyPulse.stabilityStd, 3)
            : "-"
        }
      : null,
    historySummary: waterDecisionHistorySummary
      ? {
          latestObservedMonth: waterDecisionHistorySummary.latestObservedMonth,
          latestObserved: Number.isFinite(waterDecisionHistorySummary.latestObservedPct)
            ? `${formatMetric(waterDecisionHistorySummary.latestObservedPct, 1)}%`
            : "-",
          historicalMean: Number.isFinite(waterDecisionHistorySummary.historicalMeanPct)
            ? `${formatMetric(waterDecisionHistorySummary.historicalMeanPct, 1)}%`
            : "-",
          historicalMin: Number.isFinite(waterDecisionHistorySummary.historicalMinPct)
            ? `${formatMetric(waterDecisionHistorySummary.historicalMinPct, 1)}%`
            : "-",
          historicalMinMonth: waterDecisionHistorySummary.historicalMinMonth,
          historicalMax: Number.isFinite(waterDecisionHistorySummary.historicalMaxPct)
            ? `${formatMetric(waterDecisionHistorySummary.historicalMaxPct, 1)}%`
            : "-",
          historicalMaxMonth: waterDecisionHistorySummary.historicalMaxMonth,
          outlookMin: Number.isFinite(waterDecisionHistorySummary.outlookMinPct)
            ? `${formatMetric(waterDecisionHistorySummary.outlookMinPct, 1)}%`
            : "-",
          outlookMinMonth: waterDecisionHistorySummary.outlookMinMonth,
          outlookAvg: Number.isFinite(waterDecisionHistorySummary.outlookAvgPct)
            ? `${formatMetric(waterDecisionHistorySummary.outlookAvgPct, 1)}%`
            : "-",
          outlookDelta: Number.isFinite(waterDecisionHistorySummary.outlookDeltaPct)
            ? formatSignedMetric(waterDecisionHistorySummary.outlookDeltaPct, 1, " puan")
            : "-",
          reportWindow: waterDecisionHistorySummary.reportWindow || "-"
        }
      : null,
    historyTimeline: waterDecisionHistoricalRows.slice(-18).map((row, index) => ({
      id: `water-history-${index}-${row.ds}`,
      month: row.ds.slice(0, 7),
      fillPct: Number(row.overallMeanPct.toFixed(1))
    })),
    outlookTimeline: waterDecisionOutlookRows.map((row, index) => ({
      id: `water-outlook-${index}-${row.ds}`,
      month: row.ds.slice(0, 7),
      fillPct: Number(row.expectedPct.toFixed(1))
    })),
    scenarioMatrix: waterDecisionScenarioMatrix,
    alertsFeed: waterDecisionAlertsFeed,
    dropEvents: waterDecisionDropEvents,
    strategyBoard: waterDecisionStrategyRows.slice(0, 6).map((row) => ({
      id: `water-strategy-${row.series}`,
      series: row.series,
      strategy: row.strategy,
      score: formatMetric(row.score, 3),
      rmse: formatMetric(row.rmse, 3),
      recent: Number.isFinite(row.rmseRecent) ? formatMetric(row.rmseRecent, 3) : "-",
      stability: Number.isFinite(row.stability) ? formatMetric(row.stability, 3) : "-"
    })),
    watchlist: waterDecisionWorstStrategyRows.slice(0, 6).map((row) => ({
      id: `water-watch-${row.series}`,
      series: row.series,
      strategy: row.strategy,
      score: formatMetric(row.score, 3),
      rmse: formatMetric(row.rmse, 3),
      smape: Number.isFinite(row.smape) ? `${formatMetric(row.smape, 1)}%` : "-"
    })),
    calibration: waterDecisionCalibration?.overall
      ? {
          auc40: formatMetric(waterDecisionCalibration.overall.auc_thr1, 2),
          brier40: formatMetric(waterDecisionCalibration.overall.brier_thr1, 3),
          intervalGap: formatSignedMetric(waterDecisionCalibration.overall.interval_coverage_gap_pct, 1, " puan")
        }
      : null
  };

  const presentation = {
    title: "ET0 Analizi Sunum Paketi",
    subtitle: "Aktinograf, ET0, kuraklik ve su butcesi slaytlari",
    html: hackhatonAssetRef(presentationHtmlPath),
    pdf: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "presentation", "eto_analizi_v4.pdf")),
    alternateHtml: hackhatonAssetRef(path.join(HACKHATON_OUTPUT_ROOT, "presentation", "presentation.html")),
    slides: presentationSlides.filter((item) => item.image || item.excerpt),
    slideCount: presentationSlides.length
  };
  const longTermClimate = buildLongTermClimateSeries();
  const hybridClimate = buildHybridClimateSeries();

  const payload = {
    updatedAt: new Date().toISOString(),
    available: Boolean(modelSuite?.available || playbooks.length || droughtIntel.cards.length || waterDecision.cards.length || documents.length),
    scope,
    hero: {
      title: "Hackhaton Iklim Dashboard",
      subtitle: `${scope.locationLabel} icin model suite, tarim playbook kutuphanesi ve su karar destek vitrini`
    },
    visuals,
    documents,
    presentation,
    gemGallery,
    datasetHighlights,
    longTermClimate,
    hybridClimate,
    playbooks,
    droughtIntel,
    waterDecision,
    narratives: modelSuite?.narratives || [],
    modelSuite
  };

  return setHackhatonCacheEntry(cacheKey, payload);
}

function normalizeIrrigationCropKey(value = "") {
  const raw = cityKey(value);
  if (!raw) return "domates";
  for (const crop of Object.values(IRRIGATION_CROP_LIBRARY)) {
    const aliases = [crop.key, ...(crop.aliases || [])].map((item) => cityKey(item));
    if (aliases.includes(raw)) return crop.key;
  }
  return IRRIGATION_CROP_LIBRARY[raw] ? raw : "domates";
}

function resolveIrrigationMethod(value = "") {
  const key = cityKey(value);
  return IRRIGATION_METHOD_LIBRARY[key] || IRRIGATION_METHOD_LIBRARY.damla;
}

function resolveIrrigationWaterSource(value = "") {
  const key = cityKey(value);
  if (!key) return IRRIGATION_WATER_SOURCE_LIBRARY.baraj_kanal;
  for (const source of Object.values(IRRIGATION_WATER_SOURCE_LIBRARY)) {
    const aliases = [source.key, ...(source.aliases || [])].map((item) => cityKey(item));
    if (aliases.includes(key)) return source;
  }
  return IRRIGATION_WATER_SOURCE_LIBRARY.baraj_kanal;
}

function getIrrigationCropConfig(value = "") {
  return IRRIGATION_CROP_LIBRARY[normalizeIrrigationCropKey(value)] || IRRIGATION_CROP_LIBRARY.domates;
}

function getDefaultIrrigationPlantingDate(cropKey = "", now = new Date()) {
  const crop = getIrrigationCropConfig(cropKey);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const baseYear = crop.key === "bugday_kislik" && currentMonth <= 6 ? currentYear - 1 : currentYear;
  return `${baseYear}-${crop.defaultPlantingMonthDay}`;
}

function getIrrigationStage(dayAfterPlant, crop) {
  const numericDay = Number(dayAfterPlant);
  if (!Number.isFinite(numericDay) || numericDay < 1 || numericDay > Number(crop.seasonLengthDays || 0)) {
    return { id: "off_season", label: "Sezon disi", kc: 0, inSeason: false };
  }
  const initial = Number(crop.stageLengths?.initial || 0);
  const development = Number(crop.stageLengths?.development || 0);
  const mid = Number(crop.stageLengths?.mid || 0);
  const late = Number(crop.stageLengths?.late || 0);
  const boundary1 = initial;
  const boundary2 = initial + development;
  const boundary3 = initial + development + mid;
  const boundary4 = initial + development + mid + late;
  if (numericDay <= boundary1) {
    return { id: "initial", label: "Baslangic", kc: Number(crop.kc.initial || 0), inSeason: true };
  }
  if (numericDay <= boundary2) {
    const fraction = (numericDay - boundary1) / Math.max(1, development);
    const kcValue = Number(crop.kc.initial || 0) + fraction * (Number(crop.kc.mid || 0) - Number(crop.kc.initial || 0));
    return { id: "development", label: "Gelisim", kc: Number(kcValue.toFixed(3)), inSeason: true };
  }
  if (numericDay <= boundary3) {
    return { id: "mid", label: "Orta sezon", kc: Number(crop.kc.mid || 0), inSeason: true };
  }
  if (numericDay <= boundary4) {
    const fraction = (numericDay - boundary3) / Math.max(1, late);
    const kcValue = Number(crop.kc.mid || 0) + fraction * (Number(crop.kc.end || 0) - Number(crop.kc.mid || 0));
    return { id: "late", label: "Gec sezon", kc: Number(kcValue.toFixed(3)), inSeason: true };
  }
  return { id: "off_season", label: "Sezon disi", kc: 0, inSeason: false };
}

function computeSolarRaMjM2Day(doy = 1, latitudeDeg = 41.01) {
  const latRad = (Math.PI / 180) * Number(latitudeDeg || 41.01);
  const j = Number(doy || 1);
  const gsc = 0.082;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * j);
  const solarDec = 0.409 * Math.sin((2 * Math.PI / 365) * j - 1.39);
  const wsArg = Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(solarDec)));
  const ws = Math.acos(wsArg);
  return (24 * 60 / Math.PI) * gsc * dr * (
    ws * Math.sin(latRad) * Math.sin(solarDec) +
    Math.cos(latRad) * Math.cos(solarDec) * Math.sin(ws)
  );
}

function saturationVaporPressureKpa(tempC = 0) {
  const numeric = Number(tempC);
  if (!Number.isFinite(numeric)) return null;
  return 0.6108 * Math.exp((17.27 * numeric) / (numeric + 237.3));
}

function computePercentile(values = [], pct = 0.5) {
  const arr = values.map((item) => Number(item)).filter((item) => Number.isFinite(item)).sort((a, b) => a - b);
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  const rank = Math.max(0, Math.min(arr.length - 1, pct * (arr.length - 1)));
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return arr[lower];
  const weight = rank - lower;
  return arr[lower] * (1 - weight) + arr[upper] * weight;
}

function buildWideDailyClimateNormals() {
  const cacheKey = "wide-daily-climate";
  const cached = irrigationClimateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 12 * 60 * 60 * 1000) {
    return cached.value;
  }
  const wideCsvPath = path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "meteoroloji_model_egitim_wide_genisletilmis_filled.csv");
  const rows = hackhatonReadCsvRowsSafe(wideCsvPath, 60000);
  if (!rows.length) {
    const empty = { available: false, error: "wide_climate_csv_missing" };
    irrigationClimateCache.set(cacheKey, { ts: Date.now(), value: empty });
    return empty;
  }

  const byDate = new Map();
  rows.forEach((row) => {
    const dateText = String(row.ds || row.timestamp || "").trim().slice(0, 10);
    if (!dateText) return;
    const date = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const entry = byDate.get(dateText) || {
      date: dateText,
      year: date.getUTCFullYear(),
      monthDay: `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      doy: Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / 86400000),
      temp: [],
      humidity: [],
      pressure: [],
      solar: [],
      wind: [],
      precip: []
    };
    const temp = toFiniteNumber(row.temp);
    const humidity = toFiniteNumber(row.humidity);
    const pressure = toFiniteNumber(row.pressure);
    const solar = toFiniteNumber(row.solar);
    const wind = toFiniteNumber(row.wind_speed);
    const precip = toFiniteNumber(row.precip);
    if (temp !== null) entry.temp.push(temp);
    if (humidity !== null) entry.humidity.push(humidity);
    if (pressure !== null) entry.pressure.push(pressure);
    if (solar !== null) entry.solar.push(solar);
    if (wind !== null) entry.wind.push(wind);
    if (precip !== null) entry.precip.push(precip);
    byDate.set(dateText, entry);
  });

  const dailyRows = Array.from(byDate.values())
    .map((entry) => ({
      date: entry.date,
      year: entry.year,
      monthDay: entry.monthDay,
      doy: entry.doy,
      Tmean: avgOf(entry.temp),
      Tmax: entry.temp.length ? Math.max(...entry.temp) : null,
      Tmin: entry.temp.length ? Math.min(...entry.temp) : null,
      rh_mean: avgOf(entry.humidity),
      U2raw: avgOf(entry.wind),
      RsRaw: avgOf(entry.solar),
      pRaw: avgOf(entry.pressure),
      Praw: entry.precip.reduce((sum, item) => sum + item, 0)
    }))
    .filter((row) => row.Tmean !== null && row.Tmax !== null && row.Tmin !== null);

  if (!dailyRows.length) {
    const empty = { available: false, error: "wide_climate_daily_empty" };
    irrigationClimateCache.set(cacheKey, { ts: Date.now(), value: empty });
    return empty;
  }

  const pressureMedian = computePercentile(dailyRows.map((row) => row.pRaw), 0.5);
  const windP90 = computePercentile(dailyRows.map((row) => row.U2raw), 0.9);
  const solarMedian = computePercentile(dailyRows.map((row) => row.RsRaw), 0.5);
  const elevationM = 39.0;
  const pFallback = 101.3 * ((293.0 - 0.0065 * elevationM) / 293.0) ** 5.26;

  dailyRows.forEach((row) => {
    const pKpa = row.pRaw == null
      ? pFallback
      : pressureMedian !== null && pressureMedian > 200
        ? row.pRaw / 10
        : row.pRaw;
    const u2 = row.U2raw == null
      ? 2
      : windP90 !== null && windP90 > 15
        ? row.U2raw / 3.6
        : row.U2raw;
    let rs = row.RsRaw;
    if (rs == null) rs = null;
    else if (solarMedian !== null && solarMedian > 50) rs = rs * 0.0864;
    else if (solarMedian !== null && solarMedian < 1.5) rs = rs * 3.6;
    const ra = computeSolarRaMjM2Day(row.doy, 41.01);
    const rso = (0.75 + 2e-5 * elevationM) * ra;
    const rsClamped = rs == null ? null : Math.min(Math.max(rs, 0), rso);
    const esTmax = saturationVaporPressureKpa(row.Tmax);
    const esTmin = saturationVaporPressureKpa(row.Tmin);
    const es = esTmax !== null && esTmin !== null ? 0.5 * (esTmax + esTmin) : null;
    const rhMean = row.rh_mean == null ? 60 : Math.max(1, Math.min(100, row.rh_mean));
    const ea = es == null ? null : (rhMean / 100) * es;
    const delta = row.Tmean == null
      ? null
      : 4098 * (0.6108 * Math.exp((17.27 * row.Tmean) / (row.Tmean + 237.3))) / ((row.Tmean + 237.3) ** 2);
    const gamma = 0.000665 * pKpa;
    const tmaxK = row.Tmax + 273.16;
    const tminK = row.Tmin + 273.16;
    const rsRso = rsClamped == null || rso <= 0 ? 0 : Math.max(0, Math.min(1, rsClamped / rso));
    const rns = rsClamped == null ? 0 : 0.77 * rsClamped;
    const rnl = ea == null
      ? 0
      : 4.903e-9 * (((tmaxK ** 4) + (tminK ** 4)) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * rsRso - 0.35);
    const rn = rns - rnl;
    const num = delta == null || es == null || ea == null
      ? null
      : 0.408 * delta * rn + gamma * (900 / (row.Tmean + 273)) * Math.max(0.1, Math.min(20, u2)) * (es - ea);
    const den = delta == null ? null : delta + gamma * (1 + 0.34 * Math.max(0.1, Math.min(20, u2)));
    const et0 = num == null || den == null || den <= 0 ? null : Math.max(0, num / den);
    row.pKpa = Number(pKpa.toFixed(3));
    row.U2 = Number(Math.max(0.1, Math.min(20, u2)).toFixed(3));
    row.Rs = rsClamped == null ? null : Number(rsClamped.toFixed(3));
    row.P = Number((row.Praw || 0).toFixed(3));
    row.ET0 = et0 == null ? null : Number(et0.toFixed(3));
  });

  const monthDayMap = new Map();
  dailyRows.forEach((row) => {
    if (row.ET0 == null) return;
    const bucket = monthDayMap.get(row.monthDay) || {
      monthDay: row.monthDay,
      years: new Set(),
      et0: [],
      precip: [],
      tempMean: [],
      rh: []
    };
    bucket.years.add(row.year);
    bucket.et0.push(row.ET0);
    bucket.precip.push(row.P || 0);
    if (row.Tmean != null) bucket.tempMean.push(row.Tmean);
    if (row.rh_mean != null) bucket.rh.push(row.rh_mean);
    monthDayMap.set(row.monthDay, bucket);
  });

  const normals = new Map();
  Array.from(monthDayMap.values()).forEach((bucket) => {
    normals.set(bucket.monthDay, {
      monthDay: bucket.monthDay,
      sampleYears: bucket.years.size,
      et0Mean: Number((avgOf(bucket.et0) || 0).toFixed(3)),
      et0P25: Number((computePercentile(bucket.et0, 0.25) || 0).toFixed(3)),
      et0P75: Number((computePercentile(bucket.et0, 0.75) || 0).toFixed(3)),
      precipP25: Number((computePercentile(bucket.precip, 0.25) || 0).toFixed(3)),
      precipMean: Number((avgOf(bucket.precip) || 0).toFixed(3)),
      precipMedian: Number((computePercentile(bucket.precip, 0.5) || 0).toFixed(3)),
      precipP75: Number((computePercentile(bucket.precip, 0.75) || 0).toFixed(3)),
      rainyDayRate: Number((((bucket.precip.filter((item) => Number(item) > 0.1).length) / Math.max(1, bucket.precip.length)) * 100).toFixed(1)),
      tempP25: Number((computePercentile(bucket.tempMean, 0.25) || 0).toFixed(2)),
      tempMean: Number((avgOf(bucket.tempMean) || 0).toFixed(2)),
      tempP75: Number((computePercentile(bucket.tempMean, 0.75) || 0).toFixed(2)),
      rhMean: Number((avgOf(bucket.rh) || 0).toFixed(1))
    });
  });

  const years = dailyRows.map((row) => row.year).filter((item) => Number.isFinite(item));
  const payload = {
    available: true,
    periodStart: Math.min(...years),
    periodEnd: Math.max(...years),
    dayCount: dailyRows.length,
    normals
  };
  irrigationClimateCache.set(cacheKey, { ts: Date.now(), value: payload });
  return payload;
}

function computeLinearTrend(points = []) {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 2) return null;
  const n = clean.length;
  const sumX = clean.reduce((sum, p) => sum + p.x, 0);
  const sumY = clean.reduce((sum, p) => sum + p.y, 0);
  const sumXY = clean.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = clean.reduce((sum, p) => sum + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denom) || denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return ["1", "true", "yes", "y", "t"].includes(text);
}

function buildHybridYearlySeriesFromMonthly(rows = [], {
  actualKey = "actual",
  forecastKey = "yhat",
  forecastFlag = "is_forecast",
  agg = "mean"
} = {}) {
  const yearMap = new Map();
  rows.forEach((row) => {
    const dateText = String(row.ds || row.timestamp || row.date || "").trim().slice(0, 10);
    if (!dateText) return;
    const date = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const year = date.getUTCFullYear();
    const actual = toFiniteNumber(row[actualKey]);
    const forecast = toFiniteNumber(row[forecastKey]);
    const isForecast = parseBoolean(row[forecastFlag]) || actual == null;
    if (actual == null && forecast == null) return;
    const bucket = yearMap.get(year) || {
      year,
      actualSum: 0,
      actualCount: 0,
      forecastSum: 0,
      forecastCount: 0
    };
    if (!isForecast && actual != null) {
      bucket.actualSum += actual;
      bucket.actualCount += 1;
    } else if (forecast != null) {
      bucket.forecastSum += forecast;
      bucket.forecastCount += 1;
    }
    yearMap.set(year, bucket);
  });
  const yearly = Array.from(yearMap.values())
    .sort((a, b) => a.year - b.year)
    .map((row) => {
      const totalCount = row.actualCount + row.forecastCount;
      const coverageRatio = totalCount ? row.actualCount / totalCount : 0;
      const totalSum = row.actualSum + row.forecastSum;
      const value = agg === "sum"
        ? totalSum
        : totalCount
          ? totalSum / totalCount
          : null;
      const isForecastYear = row.actualCount === 0 || coverageRatio < 0.7;
      return {
        year: row.year,
        value: value == null ? null : Number(value.toFixed(3)),
        coverageRatio: Number(coverageRatio.toFixed(2)),
        isForecastYear
      };
    })
    .filter((row) => Number.isFinite(row.year) && row.value != null);
  if (!yearly.length) return null;
  const years = yearly.map((row) => row.year);
  const values = yearly.map((row) => row.value);
  const forecastStartIndex = yearly.findIndex((row) => row.isForecastYear);
  const actualEndYear = yearly.slice().reverse().find((row) => !row.isForecastYear)?.year || null;
  const coverageAvg = yearly.reduce((sum, row) => sum + row.coverageRatio, 0) / yearly.length;
  return {
    years,
    values,
    forecastStartIndex,
    actualEndYear,
    coverageAvg: Number(coverageAvg.toFixed(2))
  };
}

function buildHybridClimateSeries() {
  const tempCsvPath = path.join(
    HACKHATON_OUTPUT_ROOT,
    "model_suite_realistic_1912_20260307_0349",
    "quant",
    "forecasts",
    "temp_monthly_quant_to_2035.csv"
  );
  const precipCsvPath = path.join(
    HACKHATON_OUTPUT_ROOT,
    "model_suite_realistic_1912_20260307_0349",
    "quant",
    "forecasts",
    "precip_monthly_quant_to_2035.csv"
  );
  const tempRows = hackhatonReadCsvRowsSafe(tempCsvPath, 200000);
  const precipRows = hackhatonReadCsvRowsSafe(precipCsvPath, 120000);
  const tempSeries = buildHybridYearlySeriesFromMonthly(tempRows, { agg: "mean" });
  const precipSeries = buildHybridYearlySeriesFromMonthly(precipRows, { agg: "sum" });
  if (!tempSeries && !precipSeries) {
    return { available: false, error: "hybrid_climate_missing" };
  }
  const buildTrendMeta = (series = null, unit = "") => {
    if (!series?.years?.length || !series?.values?.length) return null;
    const endIdx = Number.isFinite(series.forecastStartIndex) && series.forecastStartIndex > 0
      ? series.forecastStartIndex - 1
      : series.values.length - 1;
    const actualYears = series.years.slice(0, endIdx + 1);
    const actualValues = series.values.slice(0, endIdx + 1);
    const points = actualYears.map((year, idx) => ({ x: year, y: actualValues[idx] }));
    const trend = computeLinearTrend(points);
    const perDecade = trend ? Number((trend.slope * 10).toFixed(3)) : null;
    const direction = perDecade == null ? "flat" : perDecade > 0 ? "up" : perDecade < 0 ? "down" : "flat";
    const last10Values = actualValues.slice(Math.max(0, actualValues.length - 10));
    const last10Years = actualYears.slice(Math.max(0, actualYears.length - 10));
    const last10Mean = avgOf(last10Values);
    const last10Std = stdOf(last10Values);
    return {
      trend: {
        perDecade,
        direction,
        unit,
        slopePerYear: trend ? Number(trend.slope.toFixed(4)) : null
      },
      last10: {
        mean: last10Mean == null ? null : Number(last10Mean.toFixed(3)),
        std: last10Std == null ? null : Number(last10Std.toFixed(3)),
        years: last10Years
      }
    };
  };
  const tempMeta = buildTrendMeta(tempSeries, "C");
  const precipMeta = buildTrendMeta(precipSeries, "mm");
  const starts = [tempSeries?.years?.[0], precipSeries?.years?.[0]].filter(Number.isFinite);
  const ends = [
    tempSeries?.years?.[tempSeries?.years?.length - 1],
    precipSeries?.years?.[precipSeries?.years?.length - 1]
  ].filter(Number.isFinite);
  const periodStart = starts.length ? Math.min(...starts) : null;
  const periodEnd = ends.length ? Math.max(...ends) : null;
  const highlights = [
    tempSeries
      ? {
          label: "Sicaklik kapsam",
          value: `${tempSeries.years[0]}-${tempSeries.years[tempSeries.years.length - 1]}`,
          detail: `Gercek veri ${tempSeries.actualEndYear || "-"} • ort. kapsama ${tempSeries.coverageAvg}`
        }
      : null,
    precipSeries
      ? {
          label: "Yagis kapsam",
          value: `${precipSeries.years[0]}-${precipSeries.years[precipSeries.years.length - 1]}`,
          detail: `Gercek veri ${precipSeries.actualEndYear || "-"} • ort. kapsama ${precipSeries.coverageAvg}`
        }
      : null
  ].filter(Boolean);
  return {
    available: true,
    kind: "hybrid-temp-precip",
    periodStart,
    periodEnd,
    temp: tempSeries,
    precip: precipSeries,
    trends: {
      temp: tempMeta?.trend || null,
      precip: precipMeta?.trend || null
    },
    last10: {
      temp: tempMeta?.last10 || null,
      precip: precipMeta?.last10 || null
    },
    highlights,
    sources: [
      { id: "temp", file: toHackhatonOutputRelative(tempCsvPath) },
      { id: "precip", file: toHackhatonOutputRelative(precipCsvPath) }
    ]
  };
}

function buildLongTermClimateSeries() {
  const cacheKey = "longterm-climate-series";
  const cached = longTermClimateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LONGTERM_CLIMATE_CACHE_TTL_MS) return cached.value;

  const sunshineCsvPath = path.join(
    HACKHATON_OUTPUT_ROOT,
    "istanbul_sunshine_proxy",
    "istanbul_monthly_sunshine_radiation_1911_2025.csv"
  );
  const sunshineRows = hackhatonReadCsvRowsSafe(sunshineCsvPath, 200000);
  if (sunshineRows.length) {
    const yearMap = new Map();
    sunshineRows.forEach((row) => {
      const dateText = String(row.timestamp || row.date || row.ds || "").trim().slice(0, 10);
      if (!dateText) return;
      const date = new Date(`${dateText}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return;
      const year = date.getUTCFullYear();
      const bucket = yearMap.get(year) || {
        year,
        monthCount: 0,
        cloudSum: 0,
        cloudCount: 0,
        sunshinePctSum: 0,
        sunshinePctCount: 0,
        sunshineDaySum: 0,
        sunshineDayCount: 0,
        sunshineMonthSum: 0,
        radiationDaySum: 0,
        radiationDayCount: 0,
        radiationMonthSum: 0
      };

      const daysInMonth = toFiniteNumber(row.days_in_month);
      const cloudPct = toFiniteNumber(row.cld_pct);
      const sunshinePct = toFiniteNumber(row.sunp_proxy_pct) ?? toFiniteNumber(row.sunp_pct);
      const sunshineHoursDay = toFiniteNumber(row.sunshine_hours_day_proxy) ?? toFiniteNumber(row.sunshine_hours_day);
      let sunshineHoursMonth = toFiniteNumber(row.sunshine_hours_month_proxy) ?? toFiniteNumber(row.sunshine_hours_month);
      if (sunshineHoursMonth == null && sunshineHoursDay != null && daysInMonth != null) {
        sunshineHoursMonth = sunshineHoursDay * daysInMonth;
      }
      const radiationDay = toFiniteNumber(row.radiation_mj_m2_day_proxy) ?? toFiniteNumber(row.radiation_mj_m2_day);
      let radiationMonth = toFiniteNumber(row.radiation_mj_m2_month_proxy) ?? toFiniteNumber(row.radiation_mj_m2_month);
      if (radiationMonth == null && radiationDay != null && daysInMonth != null) {
        radiationMonth = radiationDay * daysInMonth;
      }

      bucket.monthCount += 1;
      if (cloudPct != null) {
        bucket.cloudSum += cloudPct;
        bucket.cloudCount += 1;
      }
      if (sunshinePct != null) {
        bucket.sunshinePctSum += sunshinePct;
        bucket.sunshinePctCount += 1;
      }
      if (sunshineHoursDay != null) {
        bucket.sunshineDaySum += sunshineHoursDay;
        bucket.sunshineDayCount += 1;
      }
      if (sunshineHoursMonth != null) {
        bucket.sunshineMonthSum += sunshineHoursMonth;
      }
      if (radiationDay != null) {
        bucket.radiationDaySum += radiationDay;
        bucket.radiationDayCount += 1;
      }
      if (radiationMonth != null) {
        bucket.radiationMonthSum += radiationMonth;
      }
      yearMap.set(year, bucket);
    });

    const yearly = Array.from(yearMap.values())
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        year: row.year,
        months: row.monthCount,
        cloudPctMean: Number((row.cloudSum / Math.max(1, row.cloudCount)).toFixed(2)),
        sunshinePctMean: Number((row.sunshinePctSum / Math.max(1, row.sunshinePctCount)).toFixed(2)),
        sunshineHoursDayMean: Number((row.sunshineDaySum / Math.max(1, row.sunshineDayCount)).toFixed(3)),
        sunshineHoursMonthSum: Number(row.sunshineMonthSum.toFixed(1)),
        radiationDayMean: Number((row.radiationDaySum / Math.max(1, row.radiationDayCount)).toFixed(3)),
        radiationMonthSum: Number(row.radiationMonthSum.toFixed(1))
      }))
      .filter((row) => Number.isFinite(row.year));

    if (yearly.length) {
      const years = yearly.map((row) => row.year);
      const series = {
        cloudPct: yearly.map((row) => row.cloudPctMean),
        sunshinePct: yearly.map((row) => row.sunshinePctMean),
        sunshineHoursDay: yearly.map((row) => row.sunshineHoursDayMean),
        sunshineHoursMonth: yearly.map((row) => row.sunshineHoursMonthSum),
        radiationDay: yearly.map((row) => row.radiationDayMean),
        radiationMonth: yearly.map((row) => row.radiationMonthSum)
      };

      const sunshineTrend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.sunshineHoursDayMean })));
      const radiationTrend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.radiationDayMean })));
      const cloudTrend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.cloudPctMean })));
      const endYear = years[years.length - 1];
      const forecastYears = Array.from({ length: 10 }, (_, i) => endYear + i + 1);
      const buildForecast = (trend, digits = 2) =>
        trend
          ? forecastYears.map((yr) => Number((trend.intercept + trend.slope * yr).toFixed(digits)))
          : [];

      const forecast = {
        years: forecastYears,
        sunshineHoursDay: buildForecast(sunshineTrend, 3),
        radiationDay: buildForecast(radiationTrend, 3),
        cloudPct: buildForecast(cloudTrend, 2)
      };

      const highlights = [
        {
          label: "Kapsam",
          value: `${years[0]}-${years[years.length - 1]}`,
          detail: `${years.length} yil • ${yearly.reduce((sum, item) => sum + (item.months || 0), 0)} ay`
        },
        {
          label: "Guneslenme trendi",
          value: sunshineTrend ? `${Number((sunshineTrend.slope * 10).toFixed(3))} saat/gun/10y` : "-",
          detail: "Proxy gunluk saat"
        },
        {
          label: "Radyasyon trendi",
          value: radiationTrend ? `${Number((radiationTrend.slope * 10).toFixed(3))} MJ/10y` : "-",
          detail: "Gunluk MJ/m2"
        },
        {
          label: "Bulutluluk trendi",
          value: cloudTrend ? `${Number((cloudTrend.slope * 10).toFixed(2))} %/10y` : "-",
          detail: "Ortalama bulut"
        }
      ];

      const payload = {
        available: true,
        kind: "sunshine_proxy_1911_2025",
        sourceFile: toHackhatonOutputRelative(sunshineCsvPath),
        periodStart: years[0],
        periodEnd: years[years.length - 1],
        yearCount: years.length,
        years,
        series,
        forecast,
        highlights
      };

      longTermClimateCache.set(cacheKey, { ts: Date.now(), value: payload });
      return payload;
    }
  }

  const wideCsvPath = path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "meteoroloji_model_egitim_wide_genisletilmis_filled.csv");
  const rows = hackhatonReadCsvRowsSafe(wideCsvPath, 120000);
  if (!rows.length) {
    const empty = { available: false, error: "longterm_climate_csv_missing" };
    longTermClimateCache.set(cacheKey, { ts: Date.now(), value: empty });
    return empty;
  }

  const byDate = new Map();
  rows.forEach((row) => {
    const dateText = String(row.ds || row.timestamp || "").trim().slice(0, 10);
    if (!dateText) return;
    const date = new Date(`${dateText}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const entry = byDate.get(dateText) || {
      date: dateText,
      year: date.getUTCFullYear(),
      monthDay: `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
      doy: Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / 86400000),
      temp: [],
      humidity: [],
      pressure: [],
      solar: [],
      wind: [],
      precip: []
    };
    const temp = toFiniteNumber(row.temp);
    const humidity = toFiniteNumber(row.humidity);
    const pressure = toFiniteNumber(row.pressure);
    const solar = toFiniteNumber(row.solar);
    const wind = toFiniteNumber(row.wind_speed);
    const precip = toFiniteNumber(row.precip);
    if (temp !== null) entry.temp.push(temp);
    if (humidity !== null) entry.humidity.push(humidity);
    if (pressure !== null) entry.pressure.push(pressure);
    if (solar !== null) entry.solar.push(solar);
    if (wind !== null) entry.wind.push(wind);
    if (precip !== null) entry.precip.push(precip);
    byDate.set(dateText, entry);
  });

  const dailyRows = Array.from(byDate.values())
    .map((entry) => ({
      date: entry.date,
      year: entry.year,
      monthDay: entry.monthDay,
      doy: entry.doy,
      Tmean: avgOf(entry.temp),
      Tmax: entry.temp.length ? Math.max(...entry.temp) : null,
      Tmin: entry.temp.length ? Math.min(...entry.temp) : null,
      rh_mean: avgOf(entry.humidity),
      U2raw: avgOf(entry.wind),
      RsRaw: avgOf(entry.solar),
      pRaw: avgOf(entry.pressure),
      Praw: entry.precip.reduce((sum, item) => sum + item, 0)
    }))
    .filter((row) => row.Tmean !== null && row.Tmax !== null && row.Tmin !== null);

  if (!dailyRows.length) {
    const empty = { available: false, error: "longterm_climate_daily_empty" };
    longTermClimateCache.set(cacheKey, { ts: Date.now(), value: empty });
    return empty;
  }

  const pressureMedian = computePercentile(dailyRows.map((row) => row.pRaw), 0.5);
  const windP90 = computePercentile(dailyRows.map((row) => row.U2raw), 0.9);
  const solarMedian = computePercentile(dailyRows.map((row) => row.RsRaw), 0.5);
  const elevationM = 39.0;
  const pFallback = 101.3 * ((293.0 - 0.0065 * elevationM) / 293.0) ** 5.26;

  dailyRows.forEach((row) => {
    const pKpa = row.pRaw == null
      ? pFallback
      : pressureMedian !== null && pressureMedian > 200
        ? row.pRaw / 10
        : row.pRaw;
    const u2 = row.U2raw == null
      ? 2
      : windP90 !== null && windP90 > 15
        ? row.U2raw / 3.6
        : row.U2raw;
    let rs = row.RsRaw;
    if (rs == null) rs = null;
    else if (solarMedian !== null && solarMedian > 50) rs = rs * 0.0864;
    else if (solarMedian !== null && solarMedian < 1.5) rs = rs * 3.6;
    const ra = computeSolarRaMjM2Day(row.doy, 41.01);
    const rso = (0.75 + 2e-5 * elevationM) * ra;
    const rsClamped = rs == null ? null : Math.min(Math.max(rs, 0), rso);
    const esTmax = saturationVaporPressureKpa(row.Tmax);
    const esTmin = saturationVaporPressureKpa(row.Tmin);
    const es = esTmax !== null && esTmin !== null ? 0.5 * (esTmax + esTmin) : null;
    const rhMean = row.rh_mean == null ? 60 : Math.max(1, Math.min(100, row.rh_mean));
    const ea = es == null ? null : (rhMean / 100) * es;
    const delta = row.Tmean == null
      ? null
      : 4098 * (0.6108 * Math.exp((17.27 * row.Tmean) / (row.Tmean + 237.3))) / ((row.Tmean + 237.3) ** 2);
    const gamma = 0.000665 * pKpa;
    const tmaxK = row.Tmax + 273.16;
    const tminK = row.Tmin + 273.16;
    const rsRso = rsClamped == null || rso <= 0 ? 0 : Math.max(0, Math.min(1, rsClamped / rso));
    const rns = rsClamped == null ? 0 : 0.77 * rsClamped;
    const rnl = ea == null
      ? 0
      : 4.903e-9 * (((tmaxK ** 4) + (tminK ** 4)) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * rsRso - 0.35);
    const rn = rns - rnl;
    const num = delta == null || es == null || ea == null
      ? null
      : 0.408 * delta * rn + gamma * (900 / (row.Tmean + 273)) * Math.max(0.1, Math.min(20, u2)) * (es - ea);
    const den = delta == null ? null : delta + gamma * (1 + 0.34 * Math.max(0.1, Math.min(20, u2)));
    const et0 = num == null || den == null || den <= 0 ? null : Math.max(0, num / den);
    row.pKpa = Number(pKpa.toFixed(3));
    row.U2 = Number(Math.max(0.1, Math.min(20, u2)).toFixed(3));
    row.Rs = rsClamped == null ? null : Number(rsClamped.toFixed(3));
    row.P = Number((row.Praw || 0).toFixed(3));
    row.ET0 = et0 == null ? null : Number(et0.toFixed(3));
  });

  const yearMap = new Map();
  dailyRows.forEach((row) => {
    const year = row.year;
    if (!Number.isFinite(year)) return;
    const bucket = yearMap.get(year) || {
      year,
      count: 0,
      tempSum: 0,
      humiditySum: 0,
      pressureSum: 0,
      windSum: 0,
      precipSum: 0,
      et0Sum: 0
    };
    bucket.count += 1;
    if (Number.isFinite(row.Tmean)) bucket.tempSum += row.Tmean;
    if (Number.isFinite(row.rh_mean)) bucket.humiditySum += row.rh_mean;
    if (Number.isFinite(row.pKpa)) bucket.pressureSum += row.pKpa;
    if (Number.isFinite(row.U2)) bucket.windSum += row.U2;
    if (Number.isFinite(row.P)) bucket.precipSum += row.P;
    if (Number.isFinite(row.ET0)) bucket.et0Sum += row.ET0;
    yearMap.set(year, bucket);
  });

  const yearly = Array.from(yearMap.values())
    .sort((a, b) => a.year - b.year)
    .map((row) => ({
      year: row.year,
      tempMeanC: Number((row.tempSum / Math.max(1, row.count)).toFixed(2)),
      humidityMean: Number((row.humiditySum / Math.max(1, row.count)).toFixed(1)),
      pressureMeanKpa: Number((row.pressureSum / Math.max(1, row.count)).toFixed(2)),
      windMeanMs: Number((row.windSum / Math.max(1, row.count)).toFixed(2)),
      precipSumMm: Number(row.precipSum.toFixed(1)),
      et0SumMm: Number(row.et0Sum.toFixed(1)),
      et0MeanMm: Number((row.et0Sum / Math.max(1, row.count)).toFixed(3))
    }));

  if (!yearly.length) {
    const empty = { available: false, error: "longterm_climate_yearly_empty" };
    longTermClimateCache.set(cacheKey, { ts: Date.now(), value: empty });
    return empty;
  }

  const years = yearly.map((row) => row.year);
  const series = {
    tempMeanC: yearly.map((row) => row.tempMeanC),
    precipSumMm: yearly.map((row) => row.precipSumMm),
    et0SumMm: yearly.map((row) => row.et0SumMm),
    et0MeanMm: yearly.map((row) => row.et0MeanMm),
    humidityMean: yearly.map((row) => row.humidityMean),
    pressureMeanKpa: yearly.map((row) => row.pressureMeanKpa),
    windMeanMs: yearly.map((row) => row.windMeanMs)
  };

  const tempTrend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.tempMeanC })));
  const et0Trend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.et0MeanMm })));
  const precipTrend = computeLinearTrend(yearly.map((row) => ({ x: row.year, y: row.precipSumMm })));
  const endYear = years[years.length - 1];
  const forecastYears = Array.from({ length: 10 }, (_, i) => endYear + i + 1);

  const buildForecast = (trend) =>
    trend
      ? forecastYears.map((yr) => Number((trend.intercept + trend.slope * yr).toFixed(2)))
      : [];

  const forecast = {
    years: forecastYears,
    tempMeanC: buildForecast(tempTrend),
    et0MeanMm: buildForecast(et0Trend),
    precipSumMm: buildForecast(precipTrend)
  };

  const highlights = [
    {
      label: "Kapsam",
      value: `${years[0]}-${years[years.length - 1]}`,
      detail: `${years.length} yil • ${dailyRows.length} gun`
    },
    {
      label: "Sicaklik trendi",
      value: tempTrend ? `${Number((tempTrend.slope * 10).toFixed(2))} C/10y` : "-",
      detail: "Lineer trend"
    },
    {
      label: "ET0 trendi",
      value: et0Trend ? `${Number((et0Trend.slope * 10).toFixed(3))} mm/gun/10y` : "-",
      detail: "Lineer trend"
    },
    {
      label: "Yagis trendi",
      value: precipTrend ? `${Number((precipTrend.slope * 10).toFixed(1))} mm/10y` : "-",
      detail: "Yillik toplam trendi"
    }
  ];

  const payload = {
    available: true,
    kind: "wide_climate_derived",
    periodStart: years[0],
    periodEnd: years[years.length - 1],
    yearCount: years.length,
    years,
    series,
    forecast,
    highlights
  };

  longTermClimateCache.set(cacheKey, { ts: Date.now(), value: payload });
  return payload;
}

function getIrrigationScenarioConfig(scenarioKey = "normal") {
  return IRRIGATION_REFERENCE_SCENARIOS[scenarioKey] || IRRIGATION_REFERENCE_SCENARIOS.normal;
}

function buildWideSeasonScenario({
  climate,
  crop,
  plantingDate = "",
  areaHa = 1,
  efficiency = 0.9,
  scenarioKey = "normal"
} = {}) {
  if (!climate?.available || !crop) return null;
  const scenario = getIrrigationScenarioConfig(scenarioKey);
  const startDate = new Date(`${plantingDate || getDefaultIrrigationPlantingDate(crop.key)}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;
  const weeklyMap = new Map();
  let seasonEtcMm = 0;
  let seasonNetMm = 0;
  let seasonGrossMm = 0;
  let seasonGrossM3 = 0;
  let peakWeeklyM3 = 0;
  let peakWeekId = null;
  const coverageSamples = [];

  for (let offset = 0; offset < Number(crop.seasonLengthDays || 0); offset += 1) {
    const day = new Date(startDate);
    day.setUTCDate(day.getUTCDate() + offset);
    const monthDay = `${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
    const normal = climate.normals.get(monthDay);
    const stage = getIrrigationStage(offset + 1, crop);
    if (!normal || !stage.inSeason) continue;
    const et0Mm = Number(normal?.[scenario.et0Field] ?? normal.et0Mean ?? 0);
    const precipitationMm = Number(normal?.[scenario.precipField] ?? normal.precipMedian ?? 0);
    const effectiveRainMm = Number((Math.max(0, precipitationMm) * 0.8).toFixed(2));
    const etcMm = Number((Math.max(0, et0Mm) * stage.kc).toFixed(2));
    const netMm = Number(Math.max(0, etcMm - effectiveRainMm).toFixed(2));
    const grossMm = Number((netMm / Math.max(0.35, Number(efficiency || 0.9))).toFixed(2));
    const grossM3 = Number((grossMm * Number(areaHa || 1) * 10).toFixed(0));
    const tempMean = Number(normal.tempMean || 0);
    const weekLabel = getIsoWeekLabel(day.toISOString().slice(0, 10));
    const bucket = weeklyMap.get(weekLabel) || {
      weekLabel,
      weekStart: day.toISOString().slice(0, 10),
      weekEnd: day.toISOString().slice(0, 10),
      etcMm: 0,
      netMm: 0,
      grossMm: 0,
      grossM3: 0,
      effectiveRainMm: 0,
      meanKcSamples: [],
      tempSamples: [],
      sampleYears: []
    };
    seasonEtcMm += etcMm;
    seasonNetMm += netMm;
    seasonGrossMm += grossMm;
    seasonGrossM3 += grossM3;
    coverageSamples.push(Number(normal.sampleYears || 0));
    bucket.weekEnd = day.toISOString().slice(0, 10);
    bucket.etcMm += etcMm;
    bucket.netMm += netMm;
    bucket.grossMm += grossMm;
    bucket.grossM3 += grossM3;
    bucket.effectiveRainMm += effectiveRainMm;
    bucket.meanKcSamples.push(stage.kc);
    bucket.tempSamples.push(tempMean);
    bucket.sampleYears.push(Number(normal.sampleYears || 0));
    weeklyMap.set(weekLabel, bucket);
  }

  const weekly = Array.from(weeklyMap.values()).map((bucket) => {
    const grossM3 = Number(bucket.grossM3.toFixed(0));
    if (grossM3 > peakWeeklyM3) {
      peakWeeklyM3 = grossM3;
      peakWeekId = bucket.weekLabel;
    }
    return {
      weekLabel: bucket.weekLabel,
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekEnd,
      etcMm: Number(bucket.etcMm.toFixed(1)),
      netMm: Number(bucket.netMm.toFixed(1)),
      grossMm: Number(bucket.grossMm.toFixed(1)),
      grossM3,
      effectiveRainMm: Number(bucket.effectiveRainMm.toFixed(1)),
      meanKc: Number((avgOf(bucket.meanKcSamples) || 0).toFixed(2)),
      meanTempC: Number((avgOf(bucket.tempSamples) || 0).toFixed(1)),
      sampleYears: Math.max(...bucket.sampleYears, 0)
    };
  });

  return {
    key: scenario.key,
    label: scenario.label,
    note: scenario.note,
    summary: {
      seasonEtcMm: Number(seasonEtcMm.toFixed(1)),
      seasonNetMm: Number(seasonNetMm.toFixed(1)),
      seasonGrossMm: Number(seasonGrossMm.toFixed(1)),
      seasonGrossM3: Number(seasonGrossM3.toFixed(0)),
      peakWeekId,
      peakWeeklyM3,
      coverageYearsMin: coverageSamples.length ? Math.min(...coverageSamples) : 0,
      coverageYearsMax: coverageSamples.length ? Math.max(...coverageSamples) : 0
    },
    weekly
  };
}

function buildForecastIrrigationAnomaly(scheduleRows = [], climate = null) {
  if (!Array.isArray(scheduleRows) || !scheduleRows.length || !climate?.available) return null;
  let et0ForecastMm = 0;
  let et0NormalMm = 0;
  let etcForecastMm = 0;
  let etcNormalMm = 0;
  let rainForecastMm = 0;
  let rainNormalMm = 0;
  let tempDeltaTotal = 0;
  let humidityDeltaTotal = 0;
  let coverageDays = 0;
  let inSeasonDays = 0;
  let stressDays = 0;
  let reliefDays = 0;
  const dayRows = [];

  scheduleRows.forEach((row) => {
    const date = new Date(`${String(row.date).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return;
    const monthDay = `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const normal = climate.normals.get(monthDay);
    if (!normal) return;
    coverageDays += 1;
    const et0Normal = Number(normal.et0Mean || 0);
    const etcNormal = Number((et0Normal * Number(row.kc || 0)).toFixed(2));
    const rainNormal = Number(normal.precipMedian || 0);
    const tempDelta = Number((Number(row.tempMean ?? 0) - Number(normal.tempMean || 0)).toFixed(2));
    const humidityDelta = row.humidityMean == null ? null : Number((Number(row.humidityMean) - Number(normal.rhMean || 0)).toFixed(1));
    const et0Delta = Number((Number(row.et0Mm || 0) - et0Normal).toFixed(2));
    const rainDelta = Number((Number(row.precipitationMm || 0) - rainNormal).toFixed(2));
    const inSeason = Boolean(row.inSeason);
    const stressScore = !inSeason
      ? 0
      : (Number(row.et0Mm || 0) >= Number(normal.et0P75 || et0Normal) ? 1 : 0) +
        (tempDelta >= 2 ? 1 : 0) +
        (Number(row.precipitationMm || 0) < Number(normal.precipP25 || rainNormal) ? 1 : 0);
    const reliefScore = !inSeason
      ? 0
      : (Number(row.precipitationMm || 0) >= Number(normal.precipP75 || rainNormal) ? 1 : 0) +
        (tempDelta <= -1.5 ? 1 : 0);
    if (inSeason) inSeasonDays += 1;
    if (stressScore >= 2) stressDays += 1;
    if (reliefScore >= 1) reliefDays += 1;
    et0ForecastMm += Number(row.et0Mm || 0);
    et0NormalMm += et0Normal;
    etcForecastMm += Number(row.etcMm || 0);
    etcNormalMm += etcNormal;
    rainForecastMm += Number(row.precipitationMm || 0);
    rainNormalMm += rainNormal;
    tempDeltaTotal += tempDelta;
    if (humidityDelta != null) humidityDeltaTotal += humidityDelta;
    dayRows.push({
      date: row.date,
      stage: row.stage,
      et0DeltaMm: et0Delta,
      tempDeltaC: tempDelta,
      rainDeltaMm: rainDelta,
      stressScore,
      reliefScore
    });
  });

  if (!coverageDays) return null;
  const et0DeltaMm = Number((et0ForecastMm - et0NormalMm).toFixed(1));
  const rainDeltaMm = Number((rainForecastMm - rainNormalMm).toFixed(1));
  const etcDeltaMm = Number((etcForecastMm - etcNormalMm).toFixed(1));
  const anomalyLevel =
    inSeasonDays === 0
      ? "planning"
      : stressDays >= 4 || et0DeltaMm >= 8
        ? "high"
        : stressDays >= 2 || et0DeltaMm >= 4 || rainDeltaMm <= -8
          ? "elevated"
          : reliefDays >= 3 || rainDeltaMm >= 10
            ? "relief"
            : "normal";
  const headlineMap = {
    planning: "Kampanya henuz aktif degil; referans sezonu izle.",
    high: "Onumuzdeki pencere normalden daha susuz.",
    elevated: "Sulama baskisi normalin ustunde.",
    relief: "Yagis ve serinlik sulama baskisini yumusatiyor.",
    normal: "Tahmin, cok yilli banda yakin gidiyor."
  };
  return {
    level: anomalyLevel,
    headline: headlineMap[anomalyLevel],
    coverageDays,
    inSeasonDays,
    et0ForecastMm: Number(et0ForecastMm.toFixed(1)),
    et0NormalMm: Number(et0NormalMm.toFixed(1)),
    et0DeltaMm,
    etcForecastMm: Number(etcForecastMm.toFixed(1)),
    etcNormalMm: Number(etcNormalMm.toFixed(1)),
    etcDeltaMm,
    rainForecastMm: Number(rainForecastMm.toFixed(1)),
    rainNormalMm: Number(rainNormalMm.toFixed(1)),
    rainDeltaMm,
    meanTempDeltaC: Number((tempDeltaTotal / coverageDays).toFixed(1)),
    meanHumidityDeltaPct: Number((humidityDeltaTotal / coverageDays).toFixed(1)),
    stressDays,
    reliefDays,
    daily: dayRows
  };
}

function buildIrrigationActionPlan({
  summary = null,
  anomaly = null,
  irrigationMethod = null,
  crop = null,
  waterSupplyAdvisor = null
} = {}) {
  if (summary?.campaignStatus === "planlama") {
    return {
      priority: "planning",
      headline: "Kampanya henuz baslamadi.",
      detail: `${crop?.label || "Urun"} icin dikim oncesi penceredesin. Cok yilli referans ve anomali merkezini kullanarak ilk sulama haftasini planla.`,
      reason: anomaly?.headline || "14 gunluk tahmin dikim oncesi pencereyi gosteriyor."
    };
  }
  const nextDate = String(summary?.nextIrrigationDate || "").trim();
  if (nextDate) {
    const sourceNote =
      waterSupplyAdvisor?.reductionPct > 0
        ? ` Kaynak modu nedeniyle etkin doz tavani ~%${waterSupplyAdvisor.reductionPct} kisitla okunmali.`
        : "";
    return {
      priority:
        waterSupplyAdvisor?.mode === "critical"
          ? "high"
          : anomaly?.level === "high" || waterSupplyAdvisor?.mode === "tight"
            ? "elevated"
            : "planned",
      headline: `${nextDate} tarihinde sulama penceresi var.`,
      detail: `${summary?.nextIrrigationGrossMm || 0} mm brut (${summary?.nextIrrigationGrossM3 || 0} m3) uygula. ${irrigationMethod?.window || "Sabah penceresi"} onerilir.${sourceNote}`,
      reason: anomaly?.headline || `${crop?.label || "Urun"} icin RAW esigi tetiklendi.`
    };
  }
  if (waterSupplyAdvisor?.mode === "critical" || waterSupplyAdvisor?.mode === "tight") {
    return {
      priority: waterSupplyAdvisor.mode === "critical" ? "high" : "elevated",
      headline: "Su kaynagi kisit modunda.",
      detail: `${waterSupplyAdvisor.detail || "Haftalik tahsisi parcala."} Gece payini %${waterSupplyAdvisor.recommendedNightSharePct || 70} ustune cek.`,
      reason: waterSupplyAdvisor.sourceContext || "Su kaynagi alarmi sulama planini daraltiyor."
    };
  }
  if (anomaly?.level === "high" || anomaly?.level === "elevated") {
    return {
      priority: anomaly.level,
      headline: "Sulama baskisi yukseliyor.",
      detail: "Esik henuz asilmasa da depo hizla bosalabilir. Parsel nemini gunluk izle ve event penceresini acik tut.",
      reason: anomaly.headline
    };
  }
  if (anomaly?.level === "relief") {
    return {
      priority: "relief",
      headline: "Yagis baskiyi yumusatiyor.",
      detail: "Planli event yoksa sulamayi aceleye getirme. Toprak ust katmanini tekrar olc.",
      reason: anomaly.headline
    };
  }
  return {
    priority: "watch",
    headline: "Takvim stabil.",
    detail: "Su anda zorunlu event yok. Haftalik ozet ve anomali kartini takip et.",
    reason: anomaly?.headline || "Cok yilli band ile tahmin birbirine yakin."
  };
}

function shiftIsoDateDays(dateText = "", deltaDays = 0) {
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(dateText || "").slice(0, 10);
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
  return date.toISOString().slice(0, 10);
}

function buildIrrigationStageBoard(scheduleRows = []) {
  const stageMap = new Map();
  scheduleRows
    .filter((row) => row.inSeason)
    .forEach((row) => {
      const key = row.stageKey || row.stage || "stage";
      const existing = stageMap.get(key) || {
        id: key,
        label: row.stage || key,
        dayCount: 0,
        etcMm: 0,
        grossMm: 0,
        effectiveRainMm: 0,
        eventCount: 0,
        kcSamples: [],
        peakDailyEtcMm: 0,
        peakDailyGrossMm: 0
      };
      existing.dayCount += 1;
      existing.etcMm += Number(row.etcMm || 0);
      existing.grossMm += Number(row.irrigationGrossMm || 0);
      existing.effectiveRainMm += Number(row.effectiveRainMm || 0);
      existing.eventCount += row.eventType === "sula" ? 1 : 0;
      existing.kcSamples.push(Number(row.kc || 0));
      existing.peakDailyEtcMm = Math.max(existing.peakDailyEtcMm, Number(row.etcMm || 0));
      existing.peakDailyGrossMm = Math.max(existing.peakDailyGrossMm, Number(row.irrigationGrossMm || 0));
      stageMap.set(key, existing);
    });
  const order = ["initial", "development", "mid", "late"];
  return Array.from(stageMap.values())
    .map((item) => ({
      ...item,
      etcMm: Number(item.etcMm.toFixed(1)),
      grossMm: Number(item.grossMm.toFixed(1)),
      effectiveRainMm: Number(item.effectiveRainMm.toFixed(1)),
      meanKc: Number((avgOf(item.kcSamples) || 0).toFixed(2)),
      peakDailyEtcMm: Number(item.peakDailyEtcMm.toFixed(1)),
      peakDailyGrossMm: Number(item.peakDailyGrossMm.toFixed(1))
    }))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

function buildIrrigationTaskBoard({
  scheduleRows = [],
  summary = null,
  anomaly = null,
  irrigationMethod = null,
  crop = null
} = {}) {
  const tasks = [];
  const nextEvents = scheduleRows.filter((row) => row.eventType === "sula").slice(0, 3);
  nextEvents.forEach((row, idx) => {
    tasks.push({
      id: `irrigation-event-${row.date}-${idx}`,
      date: row.date,
      priority: idx === 0 ? "high" : "medium",
      title: `${row.date} sulama eventini hazirla`,
      detail: `${row.irrigationGrossMm} mm brut • ${row.irrigationGrossM3} m3 • ${row.stage} • ${irrigationMethod?.window || "Sabah penceresi"}`
    });
  });
  if (summary?.campaignStatus === "planlama") {
    tasks.unshift(
      {
        id: "plan-1",
        date: "-",
        priority: "planning",
        title: "Dikim ve ilk event haftasini kilitle",
        detail: `${crop?.label || "Urun"} icin sezon acilisi once operasyon haftasini belirle.`
      },
      {
        id: "plan-2",
        date: "-",
        priority: "planning",
        title: "Debi ve uniformite testi yap",
        detail: `${irrigationMethod?.label || "Sulama"} hattinda basinc ve debi kaybini saha notuna isle.`
      }
    );
  } else if (anomaly?.level === "high" || anomaly?.level === "elevated") {
    tasks.push({
      id: "stress-followup",
      date: scheduleRows[0]?.date || "-",
      priority: anomaly.level,
      title: "Kok bolgesi nem teyidi yap",
      detail: "Tahmin normalin ustunde su baskisi gosteriyor; kritik bloklari elle teyit et."
    });
  } else if (!nextEvents.length) {
    tasks.push({
      id: "watch-1",
      date: scheduleRows[0]?.date || "-",
      priority: "watch",
      title: "Gunluk izleme modunu koru",
      detail: "Zorunlu event yok; tahmin ve kok bolgesi dolulugunu takip et."
    });
  }
  return tasks.slice(0, 5);
}

function buildIrrigationPlantingShiftBoard({
  climate = null,
  crop = null,
  plantingDate = "",
  areaHa = 1,
  efficiency = 0.9
} = {}) {
  if (!climate?.available || !crop) return [];
  const variants = [
    { id: "early", label: "Erken", shiftDays: -14 },
    { id: "base", label: "Baz", shiftDays: 0 },
    { id: "late", label: "Gec", shiftDays: 14 }
  ];
  const rows = variants
    .map((variant) => {
      const shiftedDate = shiftIsoDateDays(plantingDate, variant.shiftDays);
      const scenario = buildWideSeasonScenario({
        climate,
        crop,
        plantingDate: shiftedDate,
        areaHa,
        efficiency,
        scenarioKey: "normal"
      });
      if (!scenario?.summary) return null;
      return {
        id: variant.id,
        label: variant.label,
        shiftDays: variant.shiftDays,
        plantingDate: shiftedDate,
        seasonGrossMm: Number(scenario.summary.seasonGrossMm || 0),
        seasonGrossM3: Number(scenario.summary.seasonGrossM3 || 0),
        peakWeekId: scenario.summary.peakWeekId || "-",
        peakWeeklyM3: Number(scenario.summary.peakWeeklyM3 || 0)
      };
    })
    .filter(Boolean);
  const bestGross = rows.length ? Math.min(...rows.map((item) => item.seasonGrossMm)) : null;
  return rows.map((item) => ({
    ...item,
    isBest: bestGross != null && item.seasonGrossMm === bestGross
  }));
}

function buildIrrigationDepletionTrace(scheduleRows = [], tawMm = 0, rawMm = 0) {
  return scheduleRows.slice(0, 14).map((row) => {
    const depletionMm = Number(row.depletionAfterMm || 0);
    const depletionPct = rawMm > 0 ? Number(((depletionMm / rawMm) * 100).toFixed(0)) : 0;
    const storagePct = tawMm > 0 ? Number((Math.max(0, 1 - depletionMm / tawMm) * 100).toFixed(0)) : 0;
    return {
      id: row.id,
      date: row.date,
      dayLabel: row.dayLabel,
      stage: row.stage,
      eventType: row.eventType,
      depletionMm,
      depletionPct,
      storagePct,
      effectiveRainMm: Number(row.effectiveRainMm || 0),
      irrigationGrossMm: Number(row.irrigationGrossMm || 0),
      risk: depletionMm >= rawMm ? "alarm" : depletionMm >= rawMm * 0.85 ? "watch" : "normal"
    };
  });
}

function estimateVpdKpa(tempMean = null, humidityMean = null) {
  const temp = Number(tempMean);
  const rh = Number(humidityMean);
  if (!Number.isFinite(temp) || !Number.isFinite(rh)) return null;
  const es = saturationVaporPressureKpa(temp);
  if (!Number.isFinite(es)) return null;
  return Number(Math.max(0, es * (1 - Math.max(1, Math.min(100, rh)) / 100)).toFixed(2));
}

function classifyEvapoDriver({
  tempMean = null,
  humidityMean = null,
  windMaxKmh = null,
  shortwaveMjM2 = null,
  precipitationMm = null,
  et0Mm = null,
  normalEt0Mm = null
} = {}) {
  const vpdKpa = estimateVpdKpa(tempMean, humidityMean);
  const solarScore = Number(shortwaveMjM2 || 0) >= 18 ? 2 : Number(shortwaveMjM2 || 0) >= 12 ? 1 : 0;
  const heatScore = Number(tempMean || 0) >= 30 ? 2 : Number(tempMean || 0) >= 24 ? 1 : 0;
  const windScore = Number(windMaxKmh || 0) >= 28 ? 2 : Number(windMaxKmh || 0) >= 18 ? 1 : 0;
  const dryAirScore = Number(vpdKpa || 0) >= 1.6 ? 2 : Number(vpdKpa || 0) >= 1.1 ? 1 : 0;
  const rainRelief = Number(precipitationMm || 0) >= 6;
  const etGap = Number(et0Mm || 0) - Number(normalEt0Mm || 0);
  let driverId = "balanced";
  let label = "Dengeli talep";
  let note = "ET0 suruculeri dengeli ilerliyor.";
  if (rainRelief) {
    driverId = "rain_relief";
    label = "Yagis rahatlatmasi";
    note = "Yagis gunluk talebi yumusatiyor.";
  } else if (heatScore + solarScore >= 3 && heatScore + solarScore >= windScore + dryAirScore) {
    driverId = "heat_solar";
    label = "Isi + radyasyon";
    note = "Guneslenme ve sicaklik ET0 talebini yukari cekiyor.";
  } else if (windScore + dryAirScore >= 3) {
    driverId = "dry_wind";
    label = "Kuru hava + ruzgar";
    note = "Advectif kuruma ve ruzgar ET0 baskisini artiriyor.";
  } else if (solarScore >= 2) {
    driverId = "solar";
    label = "Radyasyon yuklu";
    note = "Net radyasyon etkisi belirgin.";
  }
  const risk =
    rainRelief
      ? "relief"
      : etGap >= 1.5 || Number(vpdKpa || 0) >= 1.8
        ? "high"
        : etGap >= 0.7 || Number(vpdKpa || 0) >= 1.2
          ? "watch"
          : "normal";
  return {
    driverId,
    label,
    note,
    risk,
    vpdKpa
  };
}

function buildEvapotranspirationProfile({
  scheduleRows = [],
  climate = null,
  crop = null
} = {}) {
  if (!Array.isArray(scheduleRows) || !scheduleRows.length) return null;
  let totalEt0Mm = 0;
  let totalEtcMm = 0;
  let totalShortwaveMjM2 = 0;
  let totalRainMm = 0;
  let totalEffectiveRainMm = 0;
  let vpdSum = 0;
  let vpdCount = 0;
  let highVpdDays = 0;
  let highEtDays = 0;
  const driverMix = new Map();
  let peakEt0Row = null;
  let peakEtcRow = null;

  const daily = scheduleRows.map((row) => {
    const date = new Date(`${String(row.date).slice(0, 10)}T00:00:00Z`);
    const monthDay = Number.isNaN(date.getTime())
      ? null
      : `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const normal = monthDay && climate?.normals instanceof Map ? climate.normals.get(monthDay) : null;
    const normalEt0Mm = Number(normal?.et0Mean || 0);
    const driver = classifyEvapoDriver({
      tempMean: row.tempMean,
      humidityMean: row.humidityMean,
      windMaxKmh: row.windMaxKmh,
      shortwaveMjM2: row.shortwaveMjM2,
      precipitationMm: row.precipitationMm,
      et0Mm: row.et0Mm,
      normalEt0Mm
    });
    totalEt0Mm += Number(row.et0Mm || 0);
    totalEtcMm += Number(row.etcMm || 0);
    totalShortwaveMjM2 += Number(row.shortwaveMjM2 || 0);
    totalRainMm += Number(row.precipitationMm || 0);
    totalEffectiveRainMm += Number(row.effectiveRainMm || 0);
    if (Number.isFinite(Number(driver.vpdKpa))) {
      vpdSum += Number(driver.vpdKpa);
      vpdCount += 1;
      if (Number(driver.vpdKpa) >= 1.6) highVpdDays += 1;
    }
    if (Number(row.et0Mm || 0) >= Math.max(normalEt0Mm + 1, Number(normal?.et0P75 || 0))) highEtDays += 1;
    driverMix.set(driver.label, (driverMix.get(driver.label) || 0) + 1);
    if (!peakEt0Row || Number(row.et0Mm || 0) > Number(peakEt0Row.et0Mm || 0)) peakEt0Row = row;
    if (!peakEtcRow || Number(row.etcMm || 0) > Number(peakEtcRow.etcMm || 0)) peakEtcRow = row;
    return {
      id: row.id,
      date: row.date,
      dayLabel: row.dayLabel,
      stage: row.stage,
      kc: Number(row.kc || 0),
      et0Mm: Number(row.et0Mm || 0),
      etcMm: Number(row.etcMm || 0),
      normalEt0Mm: Number(normalEt0Mm.toFixed(2)),
      et0DeltaMm: Number((Number(row.et0Mm || 0) - normalEt0Mm).toFixed(2)),
      tempMean: row.tempMean,
      humidityMean: row.humidityMean,
      windMaxKmh: row.windMaxKmh,
      shortwaveMjM2: Number(Number(row.shortwaveMjM2 || 0).toFixed(1)),
      precipitationMm: Number(row.precipitationMm || 0),
      effectiveRainMm: Number(row.effectiveRainMm || 0),
      vpdKpa: driver.vpdKpa,
      driver: driver.label,
      driverId: driver.driverId,
      driverNote: driver.note,
      risk: driver.risk
    };
  });

  const dominantDriver = Array.from(driverMix.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const kcCurve = daily
    .filter((row) => row.kc > 0)
    .map((row) => ({ date: row.date, stage: row.stage, kc: row.kc, etcMm: row.etcMm }));

  return {
    summary: {
      totalEt0Mm: Number(totalEt0Mm.toFixed(1)),
      totalEtcMm: Number(totalEtcMm.toFixed(1)),
      totalShortwaveMjM2: Number(totalShortwaveMjM2.toFixed(1)),
      totalRainMm: Number(totalRainMm.toFixed(1)),
      totalEffectiveRainMm: Number(totalEffectiveRainMm.toFixed(1)),
      meanVpdKpa: vpdCount ? Number((vpdSum / vpdCount).toFixed(2)) : null,
      highVpdDays,
      highEtDays,
      peakEt0Date: peakEt0Row?.date || null,
      peakEt0Mm: peakEt0Row ? Number(Number(peakEt0Row.et0Mm || 0).toFixed(2)) : null,
      peakEtcDate: peakEtcRow?.date || null,
      peakEtcMm: peakEtcRow ? Number(Number(peakEtcRow.etcMm || 0).toFixed(2)) : null,
      dominantDriver: dominantDriver ? { label: dominantDriver[0], days: dominantDriver[1] } : null,
      cropLabel: crop?.label || "Urun"
    },
    daily,
    kcCurve,
    explainers: [
      { id: "et0", label: "ET0", detail: "Referans atmosferik talep; Open-Meteo FAO ET0 kullanilir." },
      { id: "etc", label: "ETc", detail: "Bitki talebi = ET0 x Kc." },
      { id: "vpd", label: "VPD", detail: "Yaklasik buhar basincli acik; kuru hava stresini temsil eder." },
      { id: "driver", label: "Surucu", detail: "Radyasyon, isi, ruzgar ve yagis etkisini heuristik olarak etiketler." }
    ]
  };
}

const ET0_MONTH_LABELS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];

function buildEt0SeasonalProfile(climate = null) {
  if (!climate?.available || !(climate.normals instanceof Map)) return [];
  const months = ET0_MONTH_LABELS.map((label, idx) => ({
    month: idx + 1,
    label,
    days: 0,
    sampleYears: Infinity,
    et0TotalMm: 0,
    precipTotalMm: 0,
    tempMeanSum: 0,
    rhMeanSum: 0
  }));
  climate.normals.forEach((normal, monthDay) => {
    const month = Number(String(monthDay || "").slice(0, 2));
    if (!Number.isFinite(month) || month < 1 || month > 12) return;
    const bucket = months[month - 1];
    bucket.days += 1;
    bucket.et0TotalMm += Number(normal?.et0Mean || 0);
    bucket.precipTotalMm += Number(normal?.precipMean ?? normal?.precipMedian ?? 0);
    bucket.tempMeanSum += Number(normal?.tempMean || 0);
    bucket.rhMeanSum += Number(normal?.rhMean || 0);
    const sampleYears = Number(normal?.sampleYears || 0);
    if (sampleYears > 0) bucket.sampleYears = Math.min(bucket.sampleYears, sampleYears);
  });
  return months.map((bucket) => {
    const deficitMm = bucket.et0TotalMm - bucket.precipTotalMm;
    return {
      month: bucket.month,
      label: bucket.label,
      et0TotalMm: Number(bucket.et0TotalMm.toFixed(1)),
      precipTotalMm: Number(bucket.precipTotalMm.toFixed(1)),
      deficitMm: Number(deficitMm.toFixed(1)),
      meanDailyEt0Mm: bucket.days ? Number((bucket.et0TotalMm / bucket.days).toFixed(2)) : 0,
      meanTempC: bucket.days ? Number((bucket.tempMeanSum / bucket.days).toFixed(1)) : null,
      rhMean: bucket.days ? Number((bucket.rhMeanSum / bucket.days).toFixed(1)) : null,
      sampleYears: Number.isFinite(bucket.sampleYears) ? bucket.sampleYears : 0,
      pressureBand:
        deficitMm >= 110 ? "cok yuksek" : deficitMm >= 70 ? "yuksek" : deficitMm >= 35 ? "orta" : "dusuk"
    };
  });
}

function buildEt0ScenarioComparison(referenceCampaign = null) {
  const scenarios = Array.isArray(referenceCampaign?.scenarios) ? referenceCampaign.scenarios : [];
  if (!scenarios.length) return [];
  const normal = scenarios.find((item) => item.key === "normal") || scenarios[0];
  const normalGrossM3 = Number(normal?.summary?.seasonGrossM3 || 0);
  return scenarios.map((item) => {
    const seasonGrossM3 = Number(item?.summary?.seasonGrossM3 || 0);
    return {
      key: item.key,
      label: item.label,
      note: item.note,
      seasonGrossM3,
      seasonGrossMm: Number(item?.summary?.seasonGrossMm || 0),
      seasonEtcMm: Number(item?.summary?.seasonEtcMm || 0),
      peakWeeklyM3: Number(item?.summary?.peakWeeklyM3 || 0),
      peakWeekId: item?.summary?.peakWeekId || "-",
      deltaFromNormalM3: Number((seasonGrossM3 - normalGrossM3).toFixed(0))
    };
  });
}

function buildEt0TrendSnapshot({
  evapotranspirationProfile = null,
  summary = null,
  anomaly = null,
  seasonalProfile = [],
  waterSupplyAdvisor = null
} = {}) {
  const horizonNormalEt0Mm = Array.isArray(evapotranspirationProfile?.daily)
    ? evapotranspirationProfile.daily.reduce((sum, row) => sum + Number(row.normalEt0Mm || 0), 0)
    : 0;
  const totalEt0Mm = Number(evapotranspirationProfile?.summary?.totalEt0Mm || 0);
  const totalEtcMm = Number(evapotranspirationProfile?.summary?.totalEtcMm || 0);
  const rainCoverPct = totalEtcMm > 0 ? Number((((Number(summary?.horizonEffectiveRainMm || 0)) / totalEtcMm) * 100).toFixed(1)) : 0;
  const peakMonth = seasonalProfile.slice().sort((a, b) => Number(b.et0TotalMm || 0) - Number(a.et0TotalMm || 0))[0] || null;
  const deficitMonths = seasonalProfile.filter((item) => Number(item.deficitMm || 0) >= 70).length;
  return [
    {
      id: "horizon-et0",
      label: "14 gunluk ET0",
      value: `${Number(totalEt0Mm.toFixed(1))} mm`,
      detail: `${Number((totalEt0Mm - horizonNormalEt0Mm).toFixed(1)) >= 0 ? "+" : ""}${Number((totalEt0Mm - horizonNormalEt0Mm).toFixed(1))} mm normale gore`
    },
    {
      id: "rain-cover",
      label: "Yagis karsilama",
      value: `%${rainCoverPct}`,
      detail: `${Number(summary?.horizonEffectiveRainMm || 0).toFixed(1)} mm etkin yagis • ${Number(totalEtcMm.toFixed(1))} mm ETc`
    },
    {
      id: "peak-season",
      label: "Sezon zirvesi",
      value: peakMonth?.label || "-",
      detail: peakMonth ? `${peakMonth.et0TotalMm} mm/ay ET0 • acik ${peakMonth.deficitMm} mm` : "Mevsimsel profil hazir degil"
    },
    {
      id: "source-mode",
      label: "Su kaynagi modu",
      value: waterSupplyAdvisor?.mode || "normal",
      detail: anomaly?.headline || waterSupplyAdvisor?.headline || "Kaynak ve anomali baskisi birlikte okunur"
    },
    {
      id: "high-vpd",
      label: "Yuksek VPD gunu",
      value: `${Number(evapotranspirationProfile?.summary?.highVpdDays || 0)}`,
      detail: `${Number(evapotranspirationProfile?.summary?.highEtDays || 0)} yuksek ET gunu • ${deficitMonths} kritik ay`
    }
  ];
}

function buildEt0DecisionHooks({
  evapotranspirationProfile = null,
  summary = null,
  anomaly = null,
  waterSupplyAdvisor = null,
  irrigationMethod = null,
  waterSource = null,
  scenarioComparison = [],
  seasonalProfile = []
} = {}) {
  const hooks = [];
  const horizonNormalEt0Mm = Array.isArray(evapotranspirationProfile?.daily)
    ? evapotranspirationProfile.daily.reduce((sum, row) => sum + Number(row.normalEt0Mm || 0), 0)
    : 0;
  const horizonDeltaMm = Number(Number(evapotranspirationProfile?.summary?.totalEt0Mm || 0) - horizonNormalEt0Mm);
  const rainCoverPct =
    Number(evapotranspirationProfile?.summary?.totalEtcMm || 0) > 0
      ? (((Number(summary?.horizonEffectiveRainMm || 0)) / Number(evapotranspirationProfile.summary.totalEtcMm || 1)) * 100)
      : 0;
  const dryScenario = scenarioComparison.find((item) => item.key === "dry") || null;
  const normalScenario = scenarioComparison.find((item) => item.key === "normal") || null;
  const stressMonths = seasonalProfile
    .slice()
    .sort((a, b) => Number(b.deficitMm || 0) - Number(a.deficitMm || 0))
    .slice(0, 3)
    .map((item) => item.label);

  if (horizonDeltaMm >= 3 || Number(evapotranspirationProfile?.summary?.highEtDays || 0) >= 3) {
    hooks.push({
      id: "et0-above-normal",
      title: "ET0 baskisi normale gore yuksek",
      detail: `Bu pencerede atmosferik talep ${Number(horizonDeltaMm.toFixed(1))} mm yukarida. ${irrigationMethod?.label || "Sulama"} icin gece/sabah bandini koru.`,
      tone: "risk"
    });
  }
  if (rainCoverPct <= 20) {
    hooks.push({
      id: "rain-cover-low",
      title: "Yagis talebi tasimiyor",
      detail: `Etkin yagis ETc'nin yalnizca %${Number(rainCoverPct.toFixed(1))}'ini karsiliyor. Event aralarini yagis beklentisiyle uzatma.`,
      tone: "alert"
    });
  }
  if (waterSupplyAdvisor?.mode === "critical" || waterSupplyAdvisor?.mode === "tight") {
    hooks.push({
      id: "source-tight",
      title: "Kaynak baskisi aktif",
      detail: `${waterSource?.label || "Su kaynagi"} modu ${waterSupplyAdvisor.mode}. Sonraki event tavani ${waterSupplyAdvisor.nextEventCapM3 || 0} m3 civari okunmali.`,
      tone: "risk"
    });
  }
  if (dryScenario && normalScenario && dryScenario.deltaFromNormalM3 > 0) {
    hooks.push({
      id: "dry-year-gap",
      title: "Kuru yil farki hazirlanmali",
      detail: `Kuru yil senaryosu normalin ustune ${dryScenario.deltaFromNormalM3} m3 ek su istiyor. ${stressMonths.join(" / ") || "zirve aylar"} icin yedek vardiya planla.`,
      tone: "watch"
    });
  }
  if (anomaly?.level === "high" || anomaly?.stressDays >= 3) {
    hooks.push({
      id: "anomaly-coupling",
      title: "Anomali ile birlikte okumaya devam et",
      detail: `${anomaly?.headline || "Yuksek ET / yagis acigi sinyali"} bu periyotta fenolojiye gore sulama araligini daraltabilir.`,
      tone: "watch"
    });
  }
  if (!hooks.length) {
    hooks.push({
      id: "stable-window",
      title: "ET0 penceresi kontrollu",
      detail: "Mevcut horizon normal banda yakin. Standart vardiya ve izleme akisi korunabilir.",
      tone: "ok"
    });
  }
  return hooks.slice(0, 5);
}

function buildEt0ReservoirBridge({
  seasonalProfile = [],
  summary = null,
  waterSupplyAdvisor = null,
  scenarioComparison = []
} = {}) {
  const stressMonths = seasonalProfile
    .slice()
    .sort((a, b) => Number(b.deficitMm || 0) - Number(a.deficitMm || 0))
    .slice(0, 4);
  const dryScenario = scenarioComparison.find((item) => item.key === "dry") || null;
  const normalScenario = scenarioComparison.find((item) => item.key === "normal") || null;
  const extraM3 = dryScenario && normalScenario ? Number(dryScenario.seasonGrossM3 || 0) - Number(normalScenario.seasonGrossM3 || 0) : 0;
  return {
    headline:
      waterSupplyAdvisor?.mode === "critical"
        ? "Baraj / tahsis baskisi ET0 penceresi ile cakisiyor."
        : stressMonths.length
          ? `${stressMonths.map((item) => item.label).join(" / ")} ET0-acik penceresi rezervuar icin kritik okunmali.`
          : "Rezervuar baglantisi icin sezonluk profil hazir.",
    triggerCards: [
      {
        id: "critical-window",
        label: "Kritik pencere",
        value: stressMonths.length ? stressMonths.map((item) => item.label).join(" / ") : "-",
        detail: stressMonths.length ? `${stressMonths[0].deficitMm} mm'ye kadar aylik acik` : "Aylik ET0-acik profili hazir degil"
      },
      {
        id: "next-event",
        label: "Sonraki event",
        value: `${Number(summary?.nextIrrigationGrossM3 || 0)} m3`,
        detail: `${Number(summary?.nextIrrigationGrossMm || 0).toFixed(1)} mm brut doz`
      },
      {
        id: "dry-gap",
        label: "Kuru yil farki",
        value: `${Number(extraM3.toFixed(0))} m3`,
        detail: "Dry - normal sezon brut su farki"
      },
      {
        id: "source-mode",
        label: "Kaynak modu",
        value: waterSupplyAdvisor?.mode || "normal",
        detail: waterSupplyAdvisor?.detail || "Kaynak kisiti su anda belirgin degil"
      }
    ]
  };
}

function buildIrrigationPriorityBoard({
  summary = null,
  anomaly = null,
  hourlyEvapoCommand = null,
  evapotranspirationProfile = null,
  waterSupplyAdvisor = null,
  et0ResearchPack = null,
  irrigationMethod = null,
  crop = null
} = {}) {
  const priorities = [];
  const nextDate = summary?.nextIrrigationDate || null;
  if (nextDate) {
    priorities.push({
      id: "next-event",
      level: "high",
      title: "Siradaki sulama event'i kilitlenmeli",
      metric: `${summary?.nextIrrigationGrossM3 || 0} m3`,
      detail: `${nextDate} icin ${summary?.nextIrrigationGrossMm || 0} mm brut doz bekleniyor. ${irrigationMethod?.window || "Sabah"} penceresini bloke et.`
    });
  }
  if (hourlyEvapoCommand?.summary?.shiftGainPct != null) {
    priorities.push({
      id: "shift-gain",
      level: Number(hourlyEvapoCommand.summary.shiftGainPct) >= 4 ? "elevated" : "watch",
      title: "Saat kaydirma kazanci",
      metric: `%${hourlyEvapoCommand.summary.shiftGainPct}`,
      detail: `Ogleden ${hourlyEvapoCommand.summary.bestWindowLabel || "-"} bandina gecis, buharlasma kaybini dusurur.`
    });
  }
  if (waterSupplyAdvisor?.mode === "critical" || waterSupplyAdvisor?.mode === "tight") {
    priorities.push({
      id: "source-pressure",
      level: "high",
      title: "Su kaynagi baskisi",
      metric: `${waterSupplyAdvisor.weeklyCapM3 || 0} m3/hafta`,
      detail: `${waterSupplyAdvisor.headline || "Kaynak baskisi aktif."} Sonraki event tavani ${waterSupplyAdvisor.nextEventCapM3 || 0} m3.`
    });
  }
  const topHook = Array.isArray(et0ResearchPack?.decisionHooks) ? et0ResearchPack.decisionHooks[0] : null;
  if (topHook) {
    priorities.push({
      id: "et0-hook",
      level: topHook.tone === "risk" || topHook.tone === "alert" ? "high" : topHook.tone === "watch" ? "elevated" : "watch",
      title: topHook.title,
      metric: `${crop?.label || "Urun"} • ${summary?.campaignStatus || "-"}`,
      detail: topHook.detail
    });
  }
  if (anomaly?.headline) {
    priorities.push({
      id: "anomaly",
      level: anomaly?.level === "high" ? "high" : anomaly?.level === "elevated" ? "elevated" : "watch",
      title: "Anomali eslesmesi",
      metric: `${anomaly?.stressDays || 0} stres gunu`,
      detail: anomaly.headline
    });
  }
  if (evapotranspirationProfile?.summary?.peakEtcDate) {
    priorities.push({
      id: "peak-etc",
      level: "watch",
      title: "Peak ETc gunu",
      metric: `${evapotranspirationProfile.summary.peakEtcMm || 0} mm`,
      detail: `${evapotranspirationProfile.summary.peakEtcDate} tarihinde bitki talebi zirveye cikiyor.`
    });
  }
  return priorities.slice(0, 5);
}

function buildIrrigationAlertBundle({
  summary = null,
  anomaly = null,
  hourlyEvapoCommand = null,
  waterSupplyAdvisor = null,
  priorityBoard = []
} = {}) {
  const top = Array.isArray(priorityBoard) ? priorityBoard[0] : null;
  const level =
    waterSupplyAdvisor?.mode === "critical" || anomaly?.level === "high"
      ? "high"
      : waterSupplyAdvisor?.mode === "tight" || anomaly?.level === "elevated"
        ? "elevated"
        : summary?.nextIrrigationDate
          ? "watch"
          : "normal";
  const cards = [
    {
      id: "mode",
      label: "Risk modu",
      value: level,
      detail: top?.title || "Sulama akisi dengeli."
    },
    {
      id: "best-window",
      label: "En iyi pencere",
      value: hourlyEvapoCommand?.summary?.bestWindowLabel || "-",
      detail:
        hourlyEvapoCommand?.summary?.shiftGainPct != null
          ? `Kayip kazanci %${hourlyEvapoCommand.summary.shiftGainPct}`
          : "Saatlik pencere sinyali bekleniyor"
    },
    {
      id: "source",
      label: "Kaynak",
      value: waterSupplyAdvisor?.mode || "normal",
      detail: waterSupplyAdvisor?.detail || "Ek kisit yok"
    }
  ];
  const actions = [
    top?.detail || null,
    summary?.nextIrrigationDate ? `${summary.nextIrrigationDate} icin ekipman ve vardiya planini sabitle.` : null,
    waterSupplyAdvisor?.reductionPct ? `Dozu yaklasik %${waterSupplyAdvisor.reductionPct} kisacak alternatif plan hazirla.` : null,
    hourlyEvapoCommand?.summary?.bestWindowLabel ? `Uygulamayi ${hourlyEvapoCommand.summary.bestWindowLabel} penceresine kaydir.` : null
  ].filter(Boolean).slice(0, 4);
  return {
    level,
    headline:
      level === "high"
        ? "Sulama operasyonu yuksek dikkat gerektiriyor."
        : level === "elevated"
          ? "Sulama operasyonu baski altinda."
          : level === "watch"
            ? "Sulama akisi izleme modunda."
            : "Sulama akisi kontrollu.",
    cards,
    actions
  };
}

function buildIrrigationTaskDrafts({
  summary = null,
  hourlyEvapoCommand = null,
  waterSupplyAdvisor = null,
  priorityBoard = []
} = {}) {
  const tasks = [];
  if (summary?.nextIrrigationDate) {
    tasks.push({
      id: "lock-next-irrigation",
      lane: "bugun",
      title: "Sonraki sulama eventini kilitle",
      detail: `${summary.nextIrrigationDate} icin ${summary.nextIrrigationGrossM3 || 0} m3 doz ve ekip planini onayla.`,
      severity: "high"
    });
  }
  if (hourlyEvapoCommand?.summary?.bestWindowLabel) {
    tasks.push({
      id: "shift-window",
      lane: "24s",
      title: "Uygulama saatini kaydir",
      detail: `${hourlyEvapoCommand.summary.bestWindowLabel} en verimli slot olarak gorunuyor.`,
      severity: hourlyEvapoCommand.summary.shiftGainPct >= 4 ? "elevated" : "watch"
    });
  }
  if (waterSupplyAdvisor?.mode === "critical" || waterSupplyAdvisor?.mode === "tight") {
    tasks.push({
      id: "source-cap",
      lane: "72s",
      title: "Kaynak kisiti planini uygula",
      detail: `Haftalik guvenli tavan ${waterSupplyAdvisor.weeklyCapM3 || 0} m3. Zone bazli tahsisle ilerle.`,
      severity: "high"
    });
  }
  const top = Array.isArray(priorityBoard) ? priorityBoard[0] : null;
  if (top?.id === "et0-hook") {
    tasks.push({
      id: "et0-watch",
      lane: "72s",
      title: "ET0 baskisini izleyip yeniden hesapla",
      detail: top.detail,
      severity: top.level
    });
  }
  return tasks.slice(0, 5);
}

function buildEt0PresentationResearchPack({
  climate = null,
  evapotranspirationProfile = null,
  summary = null,
  anomaly = null,
  waterSupplyAdvisor = null,
  irrigationMethod = null,
  waterSource = null,
  referenceCampaign = null
} = {}) {
  const sourcePath = "/Users/yasinkaya/Downloads/ET0_Analizi_v5.pptx";
  const seasonalProfile = buildEt0SeasonalProfile(climate);
  const scenarioComparison = buildEt0ScenarioComparison(referenceCampaign);
  const trendSnapshot = buildEt0TrendSnapshot({
    evapotranspirationProfile,
    summary,
    anomaly,
    seasonalProfile,
    waterSupplyAdvisor
  });
  const decisionHooks = buildEt0DecisionHooks({
    evapotranspirationProfile,
    summary,
    anomaly,
    waterSupplyAdvisor,
    irrigationMethod,
    waterSource,
    scenarioComparison,
    seasonalProfile
  });
  const reservoirBridge = buildEt0ReservoirBridge({
    seasonalProfile,
    summary,
    waterSupplyAdvisor,
    scenarioComparison
  });
  return {
    title: "ET0 Analizi v5",
    sourcePath,
    cards: [
      {
        id: "series",
        label: "Veri serisi",
        value: "~50 yil",
        detail: "1975-2024 kapsami • ~11.000 gunluk kayit"
      },
      {
        id: "trend",
        label: "Uzun donem trend",
        value: "+1.42 mm/yil",
        detail: "Sunum ozetine gore artan ET0 baskisi"
      },
      {
        id: "summer-share",
        label: "Yaz payi",
        value: "%46",
        detail: "Haz-Agu donemi yillik ET0'nun neredeyse yarisi"
      },
      {
        id: "peak-month",
        label: "Peak ay",
        value: "Haziran",
        detail: "Yaklasik 146.3 mm/ay"
      },
      {
        id: "forecast-window",
        label: "Kantil ongoru",
        value: "2005-2036",
        detail: "Harmonik + trend, taban yukseliyor"
      },
      {
        id: "hourly-opportunity",
        label: "Saatlik firsat",
        value: "%8-15",
        detail: "Saatlik ET0 gunluk yaklasima gore daha hassas olabilir"
      }
    ],
    formulaNotes: [
      "FAO-56 Penman-Monteith gunluk ET0 omurgasi kullanilir.",
      "Gunluk olcekte G = 0 varsayimi FAO-56 standart yaklasimidir.",
      "Ruzgar verisi yoksa sunumda belirtildigi gibi u2 = 2.0 m/s fallback kullanilabilir.",
      "Buhar basinci tarafinda arsiv/yeni istasyon ayrimi veri kalitesine gore yorumlanmali."
    ],
    irrigationApplications: [
      "ETc = Kc x ET0 ile bitki ihtiyaci gunluk hesaplanir.",
      "NIR = ETc - Peffective - toprak nemi degisimi mantigi sulama tetigine baglanir.",
      "Toprak nemi kritik esigin altina indiginde sulama event'i tetiklenir.",
      "Sunumdaki beklenti: iyi kurgu ile %20-40 su tasarrufu."
    ],
    reservoirApplications: [
      "Haziran-Eylul ET0 > yagis penceresi rezervuar stresi icin kritik kabul edilir.",
      "Doluluk %40 altina indiginde ET0 etkisi daha belirleyici yorumlanir.",
      "Sunumdaki yorum: ET0 artisi kritik donemi dekadlar icinde uzatabilir."
    ],
    hourlyOpportunity: [
      "Gunluk hesap pratik ama gun ici Delta degisimini gizler.",
      "Saatlik sicaklik/radyasyon/nem varsa saatlik ET0 daha dogru pencereleme verir.",
      "Mevcut uygulamadaki saatlik komuta modulu bu ihtiyaca operasyonel bir cevap verir."
    ],
    slideHighlights: [
      { id: "s2", title: "FAO Penman-Monteith denklemi", note: "Referans yuzey ve degiskenler netlestirildi." },
      { id: "s3", title: "Sabitler ve gerekceler", note: "G=0, u2 fallback, hibrit ea yaklasimi." },
      { id: "s5", title: "Yillik trend", note: "30 yillik pencerede robust artis sinyali." },
      { id: "s7", title: "Uygulama alanlari", note: "Sulama, baraj, iklim senaryosu." },
      { id: "s9", title: "Saatlik ET0 firsati", note: "Gun ici farklari daha iyi yakalama potansiyeli." }
    ],
    seasonalProfile,
    scenarioComparison,
    trendSnapshot,
    decisionHooks,
    reservoirBridge
  };
}

function getIrrigationDaypart(hour = 0) {
  const h = Number(hour);
  if (h >= 0 && h <= 5) return { key: "night", label: "Gece", window: "00:00-05:59" };
  if (h >= 6 && h <= 10) return { key: "morning", label: "Sabah", window: "06:00-10:59" };
  if (h >= 11 && h <= 16) return { key: "midday", label: "Ogle", window: "11:00-16:59" };
  if (h >= 17 && h <= 21) return { key: "evening", label: "Aksam", window: "17:00-21:59" };
  return { key: "late", label: "Gec gece", window: "22:00-23:59" };
}

function buildHourlyEvapoCommand({
  forecastPack = null,
  irrigationMethod = null,
  waterSupplyAdvisor = null
} = {}) {
  const hourlyRows = Array.isArray(forecastPack?.hourly) ? forecastPack.hourly.slice(0, 48) : [];
  if (!hourlyRows.length) return null;
  const methodLossBase = {
    damla: 0.12,
    yagmurlama: 0.2,
    salma: 0.26
  };
  const sourcePenalty = waterSupplyAdvisor?.mode === "critical" ? 8 : waterSupplyAdvisor?.mode === "tight" ? 4 : 0;
  const scoredRows = hourlyRows
    .map((row) => {
      const timeText = String(row.time || "");
      const date = timeText.slice(0, 10);
      const hour = Number(timeText.slice(11, 13));
      if (!date || !Number.isFinite(hour)) return null;
      const daypart = getIrrigationDaypart(hour);
      const vpdKpa = estimateVpdKpa(row.tempC, row.humidityPct);
      let pressureScore = 10;
      const precipProb = Number.isFinite(Number(row.precipitationProb)) ? Number(row.precipitationProb) : null;
      if (Number(row.tempC || 0) >= 33) pressureScore += 22;
      else if (Number(row.tempC || 0) >= 28) pressureScore += 12;
      if (Number(vpdKpa || 0) >= 1.8) pressureScore += 24;
      else if (Number(vpdKpa || 0) >= 1.2) pressureScore += 12;
      if (Number(row.windKmh || 0) >= 25) pressureScore += 18;
      else if (Number(row.windKmh || 0) >= 15) pressureScore += 9;
      if (Number(row.shortwaveWm2 || 0) >= 520) pressureScore += 24;
      else if (Number(row.shortwaveWm2 || 0) >= 240) pressureScore += 10;
      if (Number(row.precipitationMm || 0) >= 0.6) pressureScore -= 18;
      if (precipProb != null) {
        if (precipProb >= 70) pressureScore -= 12;
        else if (precipProb >= 40) pressureScore -= 6;
      }
      if (daypart.key === "midday") pressureScore += 6;
      if (daypart.key === "night" || daypart.key === "late") pressureScore -= 4;
      pressureScore = Math.max(0, Math.min(100, pressureScore + sourcePenalty));
      const lossBase = methodLossBase[irrigationMethod?.key] ?? 0.12;
      const methodLossPct = Number((lossBase * (pressureScore / 100) * 100).toFixed(1));
      const status =
        pressureScore >= 70 ? "avoid" : pressureScore >= 45 ? "watch" : Number(row.precipitationMm || 0) >= 1.2 ? "rain" : "ideal";
      return {
        id: `${date}-${hour}`,
        date,
        time: timeText.slice(11, 16),
        hour,
        daypartKey: daypart.key,
        daypartLabel: daypart.label,
        daypartWindow: daypart.window,
        tempC: Number.isFinite(row.tempC) ? Number(Number(row.tempC).toFixed(1)) : null,
        humidityPct: Number.isFinite(row.humidityPct) ? Number(Number(row.humidityPct).toFixed(0)) : null,
        windKmh: Number.isFinite(row.windKmh) ? Number(Number(row.windKmh).toFixed(0)) : null,
        precipitationMm: Number.isFinite(row.precipitationMm) ? Number(Number(row.precipitationMm).toFixed(1)) : null,
        precipitationProb: precipProb,
        shortwaveWm2: Number.isFinite(row.shortwaveWm2) ? Number(Number(row.shortwaveWm2).toFixed(0)) : null,
        vpdKpa,
        pressureScore,
        methodLossPct,
        status
      };
    })
    .filter(Boolean);

  const windowMap = new Map();
  scoredRows.forEach((row) => {
    const key = `${row.date}-${row.daypartKey}`;
    const bucket = windowMap.get(key) || {
      id: key,
      date: row.date,
      daypartKey: row.daypartKey,
      daypartLabel: row.daypartLabel,
      window: row.daypartWindow,
      scores: [],
      losses: [],
      temps: [],
      winds: [],
      vpds: [],
      precipTotal: 0
    };
    bucket.scores.push(Number(row.pressureScore || 0));
    bucket.losses.push(Number(row.methodLossPct || 0));
    bucket.temps.push(Number(row.tempC || 0));
    bucket.winds.push(Number(row.windKmh || 0));
    bucket.vpds.push(Number(row.vpdKpa || 0));
    bucket.precipTotal += Number(row.precipitationMm || 0);
    windowMap.set(key, bucket);
  });
  const windows = Array.from(windowMap.values()).map((bucket) => ({
    id: bucket.id,
    date: bucket.date,
    daypart: bucket.daypartLabel,
    window: bucket.window,
    pressureScore: Number((avgOf(bucket.scores) || 0).toFixed(0)),
    methodLossPct: Number((avgOf(bucket.losses) || 0).toFixed(1)),
    meanTempC: Number((avgOf(bucket.temps) || 0).toFixed(1)),
    meanWindKmh: Number((avgOf(bucket.winds) || 0).toFixed(0)),
    meanVpdKpa: Number((avgOf(bucket.vpds) || 0).toFixed(2)),
    precipTotalMm: Number(bucket.precipTotal.toFixed(1)),
    status:
      (avgOf(bucket.scores) || 0) >= 70
        ? "avoid"
        : (avgOf(bucket.scores) || 0) >= 45
          ? "watch"
          : bucket.precipTotal >= 1.2
            ? "rain"
            : "ideal"
  }));
  const bestWindows = windows
    .slice()
    .sort((a, b) => a.pressureScore - b.pressureScore || a.methodLossPct - b.methodLossPct)
    .slice(0, 4);
  const avoidWindows = windows
    .slice()
    .sort((a, b) => b.pressureScore - a.pressureScore || b.methodLossPct - a.methodLossPct)
    .slice(0, 4);
  const middayRows = windows.filter((row) => row.daypart === "Ogle");
  const middayLossPct = middayRows.length ? Number((avgOf(middayRows.map((row) => row.methodLossPct)) || 0).toFixed(1)) : null;
  const bestLossPct = bestWindows.length ? Number((avgOf(bestWindows.map((row) => row.methodLossPct)) || 0).toFixed(1)) : null;
  const topHours = scoredRows
    .slice()
    .sort((a, b) => b.pressureScore - a.pressureScore || b.methodLossPct - a.methodLossPct)
    .slice(0, 6)
    .map((row) => ({
      id: `peak-${row.id}`,
      date: row.date,
      time: row.time,
      pressureScore: row.pressureScore,
      methodLossPct: row.methodLossPct,
      vpdKpa: row.vpdKpa,
      tempC: row.tempC,
      windKmh: row.windKmh
    }));

  return {
    summary: {
      bestWindowLabel: bestWindows[0] ? `${bestWindows[0].date} • ${bestWindows[0].daypart}` : "-",
      bestWindowScore: bestWindows[0]?.pressureScore ?? 0,
      worstWindowLabel: avoidWindows[0] ? `${avoidWindows[0].date} • ${avoidWindows[0].daypart}` : "-",
      worstWindowScore: avoidWindows[0]?.pressureScore ?? 0,
      middayLossPct,
      bestLossPct,
      shiftGainPct:
        Number.isFinite(middayLossPct) && Number.isFinite(bestLossPct)
          ? Number((middayLossPct - bestLossPct).toFixed(1))
          : null
    },
    bestWindows,
    avoidWindows,
    topHours,
    windows
  };
}

function buildIrrigationWindowGuidance(scheduleRows = [], irrigationMethod = null) {
  const inSeasonRows = Array.isArray(scheduleRows) ? scheduleRows.filter((row) => row.inSeason) : [];
  const scoredRows = inSeasonRows.map((row) => {
    let score = row.eventType === "sula" ? 68 : 54;
    const notes = [];
    if (Number(row.precipitationMm || 0) >= 8) {
      score -= 26;
      notes.push("yagis pencereyi bozuyor");
    } else if (Number(row.precipitationMm || 0) >= 3) {
      score -= 12;
      notes.push("hafif yagis var");
    } else {
      score += 4;
    }
    if (Number(row.windMaxKmh || 0) >= 30) {
      score -= 18;
      notes.push("ruzgar yuksek");
    } else if (Number(row.windMaxKmh || 0) >= 20) {
      score -= 8;
      notes.push("ruzgar orta");
    } else {
      score += 4;
    }
    if (Number(row.tempMax || 0) >= 35 || Number(row.tempMean || 0) >= 30) {
      score -= 14;
      notes.push("isi baskisi var");
    } else if (Number(row.tempMax || 0) <= 29 && Number(row.tempMean || 0) <= 24) {
      score += 5;
    }
    if (irrigationMethod?.key === "yagmurlama" && Number(row.humidityMean || 0) >= 85) {
      score -= 10;
      notes.push("nem yuksek");
    }
    if (row.eventType === "izle" && Number(row.depletionAfterMm || 0) >= Number(row.rawThresholdMm || 0) * 0.85) {
      score += 6;
      notes.push("esik yaklasiyor");
    }
    const level = score >= 66 ? "ideal" : score >= 48 ? "uygun" : "kacin";
    return {
      date: row.date,
      dayLabel: row.dayLabel,
      stage: row.stage,
      eventType: row.eventType,
      grossMm: row.irrigationGrossMm,
      grossM3: row.irrigationGrossM3,
      score: Math.max(0, Math.min(100, Math.round(score))),
      level,
      window: irrigationMethod?.window || "Sabah",
      detail:
        notes.join(" • ") ||
        (row.eventType === "sula" ? "RAW esigi nedeniyle pencere aktif." : "Ikincil risk sinyali dusuk."),
      tempBand: row.tempBand
    };
  });
  return {
    bestWindows: scoredRows.slice().sort((a, b) => b.score - a.score).slice(0, 3),
    avoidWindows: scoredRows
      .filter((item) => item.level === "kacin" || Number(item.score) <= 42)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
  };
}

function buildIrrigationWaterSupplyAdvisor({
  city = "",
  waterSource = null,
  irrigationMethod = null,
  crop = null,
  summary = null,
  anomaly = null,
  scheduleRows = [],
  weekly = [],
  referenceCampaign = null
} = {}) {
  const resolvedSource = waterSource || IRRIGATION_WATER_SOURCE_LIBRARY.baraj_kanal;
  const cityNormalized = cityKey(city);
  const formatLocalMetric = (value, digits = 1, suffix = "") => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    return `${numeric.toFixed(digits)}${suffix}`;
  };
  const modePriority = { critical: 3, tight: 2, watch: 1, normal: 0 };
  const modeConfig = {
    normal: {
      label: "normal",
      reductionPct: 0,
      weeklyCutPct: 0,
      headline: "Su kaynagi tarafinda ek bir kisit sinyali yok."
    },
    watch: {
      label: "watch",
      reductionPct: 8,
      weeklyCutPct: 5,
      headline: "Su kaynagi izleme moduna gecti."
    },
    tight: {
      label: "tight",
      reductionPct: 15,
      weeklyCutPct: 12,
      headline: "Su kaynagi baskili; haftalik tahsisi daralt."
    },
    critical: {
      label: "critical",
      reductionPct: 25,
      weeklyCutPct: 18,
      headline: "Su kaynagi kritik; korumali ve parcali sulama uygula."
    }
  };
  const stageSensitivity = {
    initial: 0.7,
    development: 0.85,
    mid: 0.35,
    late: 1.0
  };
  const zoneTemplates = {
    normal: [
      { id: "zone-core", label: "Ana blok", sharePct: 45, deficitPct: 0, note: "Standart program." },
      { id: "zone-support", label: "Destek blok", sharePct: 35, deficitPct: 0, note: "Standart program." },
      { id: "zone-buffer", label: "Buffer blok", sharePct: 20, deficitPct: 0, note: "Standart program." }
    ],
    watch: [
      { id: "zone-core", label: "Ana blok", sharePct: 45, deficitPct: 0, note: "Verim bloğunu koru." },
      { id: "zone-support", label: "Destek blok", sharePct: 35, deficitPct: 6, note: "Kisa sureli hafif deficit uygulanabilir." },
      { id: "zone-buffer", label: "Buffer blok", sharePct: 20, deficitPct: 12, note: "Yagis varsa bu bolgeyi ertele." }
    ],
    tight: [
      { id: "zone-core", label: "Ana blok", sharePct: 45, deficitPct: 0, note: "Meyve/yuksek degerli bloklar tam korunur." },
      { id: "zone-support", label: "Destek blok", sharePct: 35, deficitPct: 12, note: "Aralikli deficit uygulanir." },
      { id: "zone-buffer", label: "Buffer blok", sharePct: 20, deficitPct: 25, note: "Zorunlu olmadikca son vardiyaya kalir." }
    ],
    critical: [
      { id: "zone-core", label: "Ana blok", sharePct: 50, deficitPct: 0, note: "Sadece cekirdek verim alani tam beslenir." },
      { id: "zone-support", label: "Destek blok", sharePct: 30, deficitPct: 18, note: "Kok bolgesi teyidiyle parcali sulama." },
      { id: "zone-buffer", label: "Buffer blok", sharePct: 20, deficitPct: 35, note: "Gece vardiyasina veya yagis penceresine kaydir." }
    ]
  };

  let mode = "normal";
  let sourceContext = resolvedSource.notes?.[0] || "";
  let detail = resolvedSource.label;

  if (resolvedSource.key === "baraj_kanal" && cityNormalized === "istanbul") {
    const expectedRisk = hackhatonReadJsonSafe(
      path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "expected_risk_summary.json")
    );
    const alerts = hackhatonReadJsonSafe(
      path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "alerts_2026_03_2027_02.json")
    );
    const timelineRows = hackhatonReadCsvRowsSafe(
      path.join(HACKHATON_OUTPUT_ROOT, "istanbul_dam_forecast_decision", "story_overall_timeline_weighted.csv"),
      24
    )
      .map((row) => ({
        ds: String(row.ds || "").slice(0, 10),
        expectedPct: Number(row.expected_yhat_pct)
      }))
      .filter((row) => row.ds && Number.isFinite(row.expectedPct));
    const overallRiskPct = Number(expectedRisk?.overall?.expected_prob_below_40_pct || 0);
    const highCount = Number(alerts?.counts?.high || 0);
    const mediumCount = Number(alerts?.counts?.medium || 0);
    const worstOutlook = timelineRows.reduce(
      (minRow, row) => (!minRow || row.expectedPct < minRow.expectedPct ? row : minRow),
      null
    );
    if (overallRiskPct >= 45 || highCount >= 3) mode = "critical";
    else if (overallRiskPct >= 30 || highCount >= 1) mode = "tight";
    else if (overallRiskPct >= 20 || mediumCount >= 3) mode = "watch";
    sourceContext = `Istanbul baraj karar destegi • P(<40): ${formatLocalMetric(overallRiskPct, 1)}%`;
    detail = worstOutlook
      ? `${String(worstOutlook.ds).slice(0, 7)} icin beklenen dip ${formatLocalMetric(worstOutlook.expectedPct, 1)}%`
      : "Baraj paneli ile entegre su kisit sinyali";
  } else if (resolvedSource.key === "kuyu") {
    if (anomaly?.level === "high" && irrigationMethod?.key === "salma") mode = "critical";
    else if (anomaly?.level === "high" || anomaly?.level === "elevated") mode = "tight";
    else if (irrigationMethod?.key === "salma") mode = "watch";
    sourceContext = "Kuyu/pompaj icin ana baski enerji saati ve pompa uniformitesi.";
    detail = irrigationMethod?.key === "salma" ? "Dusuk verimli yontem nedeniyle pompaj saati artar." : "Gece vardiyasi ve debi takibiyle baski yonetilir.";
  } else {
    const seasonalSpreadMm = Number(referenceCampaign?.scenarios?.find((item) => item.key === "dry")?.summary?.seasonGrossMm || 0) -
      Number(referenceCampaign?.scenarios?.find((item) => item.key === "wet")?.summary?.seasonGrossMm || 0);
    if (anomaly?.level === "high" && seasonalSpreadMm >= 140) mode = "tight";
    else if (anomaly?.level === "high" || seasonalSpreadMm >= 100) mode = "watch";
    sourceContext = "Karma kaynak; basincli haftalarda kaynaklar arasi gecis plani gerekir.";
    detail = seasonalSpreadMm ? `Kuru-nemli sezon farki ${formatLocalMetric(seasonalSpreadMm, 1)} mm.` : "Senaryo farki sinirli.";
  }

  if (modePriority[anomaly?.level === "high" ? "watch" : "normal"] > modePriority[mode]) {
    mode = anomaly?.level === "high" ? "watch" : mode;
  }

  const config = modeConfig[mode] || modeConfig.normal;
  const nextEvent = Array.isArray(scheduleRows) ? scheduleRows.find((row) => row.eventType === "sula") || null : null;
  const planningFallbackEventM3 = Number(referenceCampaign?.summary?.peakWeeklyM3 || 0);
  const baseEventM3 = Number(nextEvent?.irrigationGrossM3 || weekly?.[0]?.grossM3 || planningFallbackEventM3 || 0);
  const recommendedNightSharePct = Math.max(
    55,
    Math.min(88, Number(resolvedSource.defaultNightSharePct || 70) + (mode === "critical" ? 6 : mode === "tight" ? 3 : 0))
  );
  const eventAdjustments = Array.isArray(scheduleRows)
    ? scheduleRows
        .filter((row) => row.eventType === "sula")
        .slice(0, 4)
        .map((row) => {
          const stageFactor = stageSensitivity[row.stageKey] ?? 0.8;
          const effectiveReductionPct = Number((config.reductionPct * stageFactor).toFixed(1));
          const adjustedGrossMm = Number((Number(row.irrigationGrossMm || 0) * (1 - effectiveReductionPct / 100)).toFixed(1));
          const adjustedGrossM3 = Number((Number(row.irrigationGrossM3 || 0) * (1 - effectiveReductionPct / 100)).toFixed(0));
          return {
            id: `water-adjust-${row.id}`,
            date: row.date,
            stage: row.stage,
            baseGrossMm: Number(row.irrigationGrossMm || 0),
            adjustedGrossMm,
            baseGrossM3: Number(row.irrigationGrossM3 || 0),
            adjustedGrossM3,
            reductionPct: effectiveReductionPct,
            note:
              effectiveReductionPct > 0
                ? `${row.stage} evresinde ${effectiveReductionPct}% kisitli uygula, gece payini artir.`
                : "Tam event uygula; kisit gerekli degil."
          };
        })
    : [];
  const weeklyAllocation = Array.isArray(weekly) && weekly.length
    ? weekly.slice(0, 3).map((row, index) => ({
        id: `water-week-${row.weekLabel}-${index}`,
        weekLabel: row.weekLabel,
        baseGrossM3: Number(row.grossM3 || 0),
        adjustedGrossM3: Number((Number(row.grossM3 || 0) * (1 - config.weeklyCutPct / 100)).toFixed(0)),
        baseGrossMm: Number(row.grossMm || 0),
        adjustedGrossMm: Number((Number(row.grossMm || 0) * (1 - config.weeklyCutPct / 100)).toFixed(1)),
        eventCount: Number(row.irrigationEvents || 0)
      }))
    : referenceCampaign?.summary?.peakWeekId
      ? [
          {
            id: "water-week-planning",
            weekLabel: referenceCampaign.summary.peakWeekId,
            baseGrossM3: Number(referenceCampaign.summary.peakWeeklyM3 || 0),
            adjustedGrossM3: Number((Number(referenceCampaign.summary.peakWeeklyM3 || 0) * (1 - config.weeklyCutPct / 100)).toFixed(0)),
            baseGrossMm: Number(referenceCampaign.summary.peakWeeklyMm || 0),
            adjustedGrossMm: Number((Number(referenceCampaign.summary.peakWeeklyMm || 0) * (1 - config.weeklyCutPct / 100)).toFixed(1)),
            eventCount: 1
          }
        ]
      : [];
  const firstPositiveWeeklyAllocation = weeklyAllocation.find((row) => Number(row.adjustedGrossM3 || 0) > 0) || null;
  const zonePlan = (zoneTemplates[mode] || zoneTemplates.normal).map((zone) => ({
    ...zone,
    suggestedGrossM3: Number((baseEventM3 * (zone.sharePct / 100) * (1 - zone.deficitPct / 100)).toFixed(0))
  }));
  const triggers = [
    config.headline,
    sourceContext,
    detail,
    irrigationMethod?.key === "salma" ? "Salma sulamada bu kisit daha fazla kayip uretir; damla/yagmurlama onceliklendir." : null,
    nextEvent ? `${nextEvent.date} eventi icin gece payini en az %${recommendedNightSharePct} tut.` : null
  ].filter(Boolean);

  return {
    mode,
    source: {
      key: resolvedSource.key,
      label: resolvedSource.label
    },
    headline: config.headline,
    detail,
    sourceContext,
    reductionPct: config.reductionPct,
    weeklyCutPct: config.weeklyCutPct,
    recommendedNightSharePct,
    weeklyCapM3:
      firstPositiveWeeklyAllocation?.adjustedGrossM3 ?? Number((baseEventM3 * (1 - config.weeklyCutPct / 100)).toFixed(0)),
    nextEventCapM3: eventAdjustments[0]?.adjustedGrossM3 ?? Number((baseEventM3 * (1 - config.reductionPct / 100)).toFixed(0)),
    zonePlan,
    weeklyAllocation,
    eventAdjustments,
    triggers
  };
}

function buildIrrigationAgrobotGuide({
  scheduleRows = [],
  summary = null,
  anomaly = null,
  crop = null,
  irrigationMethod = null,
  soilProfile = null,
  referenceCampaign = null,
  waterSupplyAdvisor = null
} = {}) {
  const windows = buildIrrigationWindowGuidance(scheduleRows, irrigationMethod);
  const nextEvent = Array.isArray(scheduleRows) ? scheduleRows.find((row) => row.eventType === "sula") || null : null;
  const modeMap = {
    planning: {
      tone: "planning",
      title: "Planlama modu",
      summary: "Sezon acilmadan referans, ilk event ve risk penceresini sabitle."
    },
    high: {
      tone: "high",
      title: "Yuksek su baskisi",
      summary: "Tahmin cok yilli banda gore daha susuz; operasyon pencereni erken ac."
    },
    elevated: {
      tone: "elevated",
      title: "Basincli pencere",
      summary: "Esik hizla dolabilir; saha takibini gundelik hale getir."
    },
    relief: {
      tone: "relief",
      title: "Rahatlatan pencere",
      summary: "Yagis ve serinlik kisa sureli nefes aldiriyor."
    },
    normal: {
      tone: "normal",
      title: "Dengeli akış",
      summary: "Tahmin ile cok yilli normal birbirine yakin gidiyor."
    }
  };
  const mode = modeMap[anomaly?.level || "normal"] || modeMap.normal;
  const scenarios = Array.isArray(referenceCampaign?.scenarios) ? referenceCampaign.scenarios : [];
  const dryScenario = scenarios.find((item) => item.key === "dry");
  const wetScenario = scenarios.find((item) => item.key === "wet");
  const normalScenario = scenarios.find((item) => item.key === "normal");
  const seasonalSpreadMm =
    dryScenario && wetScenario
      ? Number((Number(dryScenario.summary?.seasonGrossMm || 0) - Number(wetScenario.summary?.seasonGrossMm || 0)).toFixed(1))
      : null;
  const watchItems = [
    anomaly?.headline || null,
    Number(soilProfile?.initialDepletionMm || 0) >= Number(soilProfile?.rawMm || 0) * 0.75
      ? "Baslangicta kok bolgesi acik; ilk event pencereni geciktirme."
      : "Baslangic depolama tamponu kabul edilebilir.",
    windows.avoidWindows[0]?.detail ? `${windows.avoidWindows[0].date}: ${windows.avoidWindows[0].detail}` : null,
    waterSupplyAdvisor?.headline ? `Su kaynagi modu: ${waterSupplyAdvisor.headline}` : null
  ].filter(Boolean);
  const todayActions =
    summary?.campaignStatus === "planlama"
      ? [
          `${crop?.label || "Urun"} icin dikim tarihini ve ilk sulama haftasini netlestir.`,
          `${irrigationMethod?.label || "Sulama"} hattinin debi ve uniformitesini test et.`,
          "Toprak nemini sezon acilisindan once referans olarak kaydet."
        ]
      : [
          nextEvent
            ? `${nextEvent.date} icin ${nextEvent.grossMm} mm brut (${nextEvent.grossM3} m3) pencereyi bloke et.`
            : "Bugun zorunlu event yok; nem ve tahmin ekranini takip et.",
          anomaly?.level === "high" || anomaly?.level === "elevated"
            ? "Kritik bloklarda kok bolgesi nemini saha gozlemiyle dogrula."
            : "Sulama vardiyasini mevcut sabah penceresinde tut.",
          windows.bestWindows[0]
            ? `${windows.bestWindows[0].date} en guclu operasyon slotu olarak one cikiyor.`
            : "Bugun icin net operasyon slotu cikmadi."
          ,
          waterSupplyAdvisor?.reductionPct
            ? `Su kaynagi baskisi nedeniyle sonraki eventte yaklasik %${waterSupplyAdvisor.reductionPct} kisit opsiyonu hazir tut.`
            : "Su kaynagi tarafinda ek kisit görünmuyor."
        ].filter(Boolean);
  const weekActions = [
    summary?.irrigationEventCount
      ? `Onumuzdeki 14 gunde ${summary.irrigationEventCount} adet sulama eventi bekleniyor.`
      : "Onumuzdeki 14 gunde zorunlu sulama eventi gorunmuyor.",
    seasonalSpreadMm != null
      ? `Kuru ve nemli yil farki ${seasonalSpreadMm} mm; rezerv planini buna gore tut.`
      : "Senaryo yayilimi sinirli; default banda gore git.",
    normalScenario?.summary?.peakWeekId
      ? `Cok yilli tepe hafta ${normalScenario.summary.peakWeekId}; lojistik ve enerji planini ona gore yap.`
      : "Tepe hafta bilgisi hazir degil.",
    waterSupplyAdvisor?.weeklyCapM3
      ? `Mevcut kaynak modunda bu haftaki guvenli tavan ${waterSupplyAdvisor.weeklyCapM3} m3 civari.`
      : null
  ].filter(Boolean);
  return {
    mode,
    todayActions,
    weekActions,
    watchItems,
    bestWindows: windows.bestWindows,
    avoidWindows: windows.avoidWindows,
    waterBudget: {
      horizonGrossMm: Number(summary?.horizonGrossMm || 0),
      horizonGrossM3: Number(scheduleRows.reduce((sum, row) => sum + Number(row.irrigationGrossM3 || 0), 0).toFixed(0)),
      nextEventGrossMm: Number(summary?.nextIrrigationGrossMm || 0),
      nextEventGrossM3: Number(summary?.nextIrrigationGrossM3 || 0),
      rawMm: Number(soilProfile?.rawMm || 0),
      initialDepletionMm: Number(soilProfile?.initialDepletionMm || 0)
    },
    seasonalSpreadMm,
    seasonalSpreadM3:
      dryScenario && wetScenario
        ? Number((Number(dryScenario.summary?.seasonGrossM3 || 0) - Number(wetScenario.summary?.seasonGrossM3 || 0)).toFixed(0))
        : null
  };
}

function buildWideIrrigationReference(cropKey = "domates", plantingDate = "", areaHa = 1, efficiency = 0.9) {
  const climate = buildWideDailyClimateNormals();
  if (!climate?.available) return null;
  const crop = getIrrigationCropConfig(cropKey);
  const startDate = new Date(`${plantingDate || getDefaultIrrigationPlantingDate(crop.key)}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;
  const referenceYear = startDate.getUTCFullYear();
  const summaryScenario = buildWideSeasonScenario({
    climate,
    crop,
    plantingDate,
    areaHa,
    efficiency,
    scenarioKey: "normal"
  });
  if (!summaryScenario) return null;
  const scenarioKeys = ["dry", "normal", "wet"];
  const scenarios = scenarioKeys
    .map((key) =>
      buildWideSeasonScenario({
        climate,
        crop,
        plantingDate,
        areaHa,
        efficiency,
        scenarioKey: key
      })
    )
    .filter(Boolean);
  const coverageMin = scenarios.length
    ? Math.min(...scenarios.map((item) => Number(item.summary?.coverageYearsMin || 0)).filter((item) => item > 0))
    : 0;
  const coverageMax = scenarios.length
    ? Math.max(...scenarios.map((item) => Number(item.summary?.coverageYearsMax || 0)).filter((item) => item > 0), 0)
    : 0;
  return {
    periodLabel: `${climate.periodStart}-${climate.periodEnd} multi-year normal`,
    sampleYears: Number(summaryScenario.summary.coverageYearsMin || climate.periodEnd - climate.periodStart + 1),
    coverage: {
      yearsMin: coverageMin,
      yearsMax: coverageMax,
      dayCount: climate.dayCount,
      periodStart: climate.periodStart,
      periodEnd: climate.periodEnd
    },
    summary: {
      plantingDate: `${referenceYear}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}-${String(startDate.getUTCDate()).padStart(2, "0")}`,
      seasonEtcMm: summaryScenario.summary.seasonEtcMm,
      seasonGrossMm: summaryScenario.summary.seasonGrossMm,
      seasonGrossM3: summaryScenario.summary.seasonGrossM3,
      peakWeekId: summaryScenario.summary.peakWeekId,
      peakWeeklyM3: summaryScenario.summary.peakWeeklyM3,
      dataQuality: "multi-year-climatology"
    },
    weekly: summaryScenario.weekly,
    scenarios
  };
}

function inferSoilWaterHoldingProfile({ soilType = "", sand = null, clay = null, silt = null } = {}) {
  const normalized = cityKey(soilType);
  if (normalized.includes("kum")) {
    return {
      bucket: "coarse",
      label: "Kumlu / hafif",
      awcMmPerM: 80,
      fieldCapacityTheta: 0.23,
      wiltingPointTheta: 0.09
    };
  }
  if (normalized.includes("kil")) {
    return {
      bucket: "fine",
      label: "Killi / agir",
      awcMmPerM: 180,
      fieldCapacityTheta: 0.38,
      wiltingPointTheta: 0.2
    };
  }
  if (normalized.includes("silt")) {
    return {
      bucket: "medium",
      label: "Siltli / orta",
      awcMmPerM: 155,
      fieldCapacityTheta: 0.32,
      wiltingPointTheta: 0.15
    };
  }
  if (Number.isFinite(Number(sand)) && Number(sand) > 65) {
    return {
      bucket: "coarse",
      label: "Kum egilimli",
      awcMmPerM: 85,
      fieldCapacityTheta: 0.24,
      wiltingPointTheta: 0.1
    };
  }
  if (Number.isFinite(Number(clay)) && Number(clay) > 35) {
    return {
      bucket: "fine",
      label: "Kil egilimli",
      awcMmPerM: 175,
      fieldCapacityTheta: 0.37,
      wiltingPointTheta: 0.2
    };
  }
  return {
    bucket: "medium",
    label: "Tinli / orta",
    awcMmPerM: 140,
    fieldCapacityTheta: 0.31,
    wiltingPointTheta: 0.14
  };
}

function estimateInitialDepletionMm({ topMoisture = null, midMoisture = null, tawMm = 0, soilProfile = null } = {}) {
  const profile = soilProfile || inferSoilWaterHoldingProfile();
  const values = [topMoisture, midMoisture].map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (!values.length) return Number((Math.max(0, tawMm) * 0.35).toFixed(1));
  const theta = values.reduce((sum, item) => sum + item, 0) / values.length;
  const denominator = Math.max(0.01, Number(profile.fieldCapacityTheta || 0.31) - Number(profile.wiltingPointTheta || 0.14));
  const availableFraction = clamp01((theta - Number(profile.wiltingPointTheta || 0.14)) / denominator);
  const depletionFraction = clamp01(1 - availableFraction);
  return Number((Math.max(0, tawMm) * depletionFraction).toFixed(1));
}

function getIsoWeekLabel(dateText = "") {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "Hafta";
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function fetchOpenMeteoIrrigationForecast(lat, lon, horizonDays = 14) {
  const safeHorizon = Math.max(3, Math.min(16, Number(horizonDays) || 14));
  const daily = [
    "temperature_2m_min",
    "temperature_2m_max",
    "temperature_2m_mean",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "shortwave_radiation_sum",
    "et0_fao_evapotranspiration"
  ].join(",");
  const hourly = [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "precipitation",
    "precipitation_probability",
    "shortwave_radiation"
  ].join(",");
  const url =
    `${OPEN_METEO_FORECAST_URL}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&daily=${encodeURIComponent(daily)}&hourly=${encodeURIComponent(hourly)}&forecast_days=${safeHorizon}&timezone=auto`;
  const json = await fetchJsonWithRetry(url, { headers: { accept: "application/json" } }, 1, 9000).catch(() => null);
  if (!json?.daily?.time?.length) return null;
  const elevationM = Number.isFinite(Number(json?.elevation)) ? Number(json.elevation) : 20;
  const rows = json.daily.time.map((date, idx) => {
    const tempMin = toFiniteNumber(json.daily?.temperature_2m_min?.[idx]);
    const tempMax = toFiniteNumber(json.daily?.temperature_2m_max?.[idx]);
    const tempMean = toFiniteNumber(json.daily?.temperature_2m_mean?.[idx]);
    const humidityMean = toFiniteNumber(json.daily?.relative_humidity_2m_mean?.[idx]);
    const windMaxKmh = toFiniteNumber(json.daily?.wind_speed_10m_max?.[idx]);
    const shortwaveMjM2 = toFiniteNumber(json.daily?.shortwave_radiation_sum?.[idx]);
    const precipitationMm = toFiniteNumber(json.daily?.precipitation_sum?.[idx]);
    const precipProbMax = toFiniteNumber(json.daily?.precipitation_probability_max?.[idx]);
    let et0Mm = toFiniteNumber(json.daily?.et0_fao_evapotranspiration?.[idx]);
    let et0Source = et0Mm == null ? "derived" : "open-meteo";
    if (et0Mm == null && tempMin != null && tempMax != null && tempMean != null && shortwaveMjM2 != null) {
      const dateObj = new Date(`${date}T00:00:00Z`);
      const doy = Number.isFinite(dateObj.getTime())
        ? Math.floor((dateObj - new Date(Date.UTC(dateObj.getUTCFullYear(), 0, 0))) / 86400000)
        : null;
      const ra = doy == null ? null : computeSolarRaMjM2Day(doy, Number(lat));
      const rso = ra == null ? null : (0.75 + 2e-5 * elevationM) * ra;
      const rs = shortwaveMjM2;
      const rsClamped = rso == null ? rs : Math.min(Math.max(rs, 0), rso);
      const esTmax = saturationVaporPressureKpa(tempMax);
      const esTmin = saturationVaporPressureKpa(tempMin);
      const es = esTmax !== null && esTmin !== null ? 0.5 * (esTmax + esTmin) : null;
      const rhMean = humidityMean == null ? 60 : Math.max(1, Math.min(100, humidityMean));
      const ea = es == null ? null : (rhMean / 100) * es;
      const delta = tempMean == null
        ? null
        : 4098 * (0.6108 * Math.exp((17.27 * tempMean) / (tempMean + 237.3))) / ((tempMean + 237.3) ** 2);
      const pKpa = 101.3 * ((293.0 - 0.0065 * elevationM) / 293.0) ** 5.26;
      const gamma = 0.000665 * pKpa;
      const tmaxK = tempMax + 273.16;
      const tminK = tempMin + 273.16;
      const rsRso = rso && rso > 0 ? Math.max(0, Math.min(1, rsClamped / rso)) : 0;
      const rns = rsClamped == null ? 0 : 0.77 * rsClamped;
      const rnl = ea == null
        ? 0
        : 4.903e-9 * (((tmaxK ** 4) + (tminK ** 4)) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * rsRso - 0.35);
      const rn = rns - rnl;
      const u2 = windMaxKmh == null ? 2 : Math.max(0.1, Math.min(20, windMaxKmh / 3.6));
      const num = delta == null || es == null || ea == null
        ? null
        : 0.408 * delta * rn + gamma * (900 / (tempMean + 273)) * u2 * (es - ea);
      const den = delta == null ? null : delta + gamma * (1 + 0.34 * u2);
      et0Mm = num == null || den == null || den <= 0 ? null : Number(Math.max(0, num / den).toFixed(3));
    }
    return {
      date,
      et0Mm,
      et0Source,
      precipitationMm,
      precipProbMax,
      tempMin,
      tempMax,
      tempMean,
      humidityMean,
      windMaxKmh,
      shortwaveMjM2
    };
  });
  const hourlyRows = Array.isArray(json?.hourly?.time)
    ? json.hourly.time.slice(0, safeHorizon * 24).map((time, idx) => ({
        time,
        tempC: toFiniteNumber(json.hourly?.temperature_2m?.[idx]),
        humidityPct: toFiniteNumber(json.hourly?.relative_humidity_2m?.[idx]),
        windKmh: toFiniteNumber(json.hourly?.wind_speed_10m?.[idx]),
        precipitationMm: toFiniteNumber(json.hourly?.precipitation?.[idx]),
        precipitationProb: toFiniteNumber(json.hourly?.precipitation_probability?.[idx]),
        shortwaveWm2: toFiniteNumber(json.hourly?.shortwave_radiation?.[idx])
      }))
    : [];
  return {
    url,
    horizonDays: safeHorizon,
    timeZone: json.timezone || null,
    elevation: toFiniteNumber(json.elevation),
    days: rows,
    hourly: hourlyRows
  };
}

function buildHackhatonIrrigationHistoricalExample(cropKey = "domates", plantingDate = "") {
  const normalizedCrop = normalizeIrrigationCropKey(cropKey);
  const weeklyRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "irrigation_weekly_1987.csv"),
    4000
  );
  const comparisonRows = hackhatonReadCsvRowsSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "crop_shift_comparison_1987.csv"),
    400
  );
  const crop = getIrrigationCropConfig(normalizedCrop);
  const plantingShiftTarget = plantingDate
    ? Math.round(
        (new Date(plantingDate) - new Date(`${String(new Date(plantingDate).getFullYear())}-${crop.defaultPlantingMonthDay}`)) /
          86400000
      )
    : 0;
  const candidateShifts = [-15, 0, 15];
  const selectedShift = candidateShifts.reduce((best, item) =>
    Math.abs(item - plantingShiftTarget) < Math.abs(best - plantingShiftTarget) ? item : best
  , 0);
  const referenceWeekly = weeklyRows
    .filter((row) => normalizeIrrigationCropKey(row.crop) === normalizedCrop && Number(row.sowing_shift_days || 0) === selectedShift)
    .slice(0, 12)
    .map((row) => ({
      weekLabel: `${row.iso_year || "1987"}-W${String(row.iso_week || "").padStart(2, "0")}`,
      weekStart: row.week_start || null,
      weekEnd: row.week_end || null,
      etcMm: Number(Number(row.etc_mm_week || 0).toFixed(1)),
      netMm: Number(Number(row.net_mm_week || 0).toFixed(1)),
      grossMm: Number(Number(row.gross_mm_week || 0).toFixed(1)),
      grossM3: Number(Number(row.dose_m3_week || 0).toFixed(0)),
      meanKc: Number(Number(row.mean_kc_week || 0).toFixed(2))
    }));
  const comparisonRow =
    comparisonRows.find(
      (row) => normalizeIrrigationCropKey(row.crop) === normalizedCrop && Number(row.sowing_shift_days || 0) === selectedShift
    ) ||
    comparisonRows.find((row) => normalizeIrrigationCropKey(row.crop) === normalizedCrop) ||
    null;
  const validation = hackhatonReadJsonSafe(
    path.join(HACKHATON_OUTPUT_ROOT, "spreadsheet", "irrigation_crop_ml_validation_1987.json")
  );
  const slides = hackhatonExtractPresentationSlides(
    path.join(HACKHATON_OUTPUT_ROOT, "presentation", "eto_analizi_v4.html"),
    24
  )
    .filter((item) => /sulama|et0|evap|su stresi|kurak|hassas/i.test(`${item.title || ""} ${item.excerpt || ""}`))
    .slice(0, 4);
  return {
    year: 1987,
    selectedShiftDays: selectedShift,
    summary: comparisonRow
      ? {
          plantingDate: comparisonRow.planting_date_shifted || null,
          seasonEtcMm: Number(Number(comparisonRow.season_etc_mm || 0).toFixed(1)),
          seasonGrossMm: Number(Number(comparisonRow.season_gross_irrigation_mm || 0).toFixed(1)),
          seasonGrossM3: Number(Number(comparisonRow.season_gross_irrigation_m3 || 0).toFixed(0)),
          peakWeekId: comparisonRow.peak_week_id || null,
          peakWeeklyM3: Number(Number(comparisonRow.peak_weekly_gross_m3 || 0).toFixed(0)),
          dataQuality: comparisonRow.data_quality_flag || "-"
        }
      : null,
    weekly: referenceWeekly,
    validation:
      validation && typeof validation === "object"
        ? {
            allPassed: Boolean(validation.all_passed),
            checks: validation.checks || {}
          }
        : null,
    slides
  };
}

async function buildIrrigationCalendarPayload({
  city = "",
  district = "",
  neighborhood = "",
  coords = "",
  crop = "domates",
  plantingDate = "",
  areaHa = 1,
  efficiency = null,
  method = "damla",
  waterSource = "baraj_kanal",
  horizonDays = 14,
  strictLive = true,
  seasonPlan = true
} = {}) {
  const scope = buildHackhatonScope(city, district, neighborhood);
  const cropConfig = getIrrigationCropConfig(crop);
  const irrigationMethod = resolveIrrigationMethod(method);
  const irrigationWaterSource = resolveIrrigationWaterSource(waterSource);
  const numericAreaHa = Math.max(0.1, Math.min(500, Number(areaHa) || 1));
  const numericEfficiency = Math.max(
    0.35,
    Math.min(0.98, Number.isFinite(Number(efficiency)) ? Number(efficiency) : irrigationMethod.efficiency)
  );
  const requestedPlantingDate = String(plantingDate || "").trim() || getDefaultIrrigationPlantingDate(cropConfig.key);
  const [latRaw, lonRaw] = String(coords || "").split(",").map((item) => Number(item.trim()));
  let resolved = null;
  if (Number.isFinite(latRaw) && Number.isFinite(lonRaw)) {
    resolved = {
      lat: latRaw,
      lon: lonRaw,
      city,
      district: district || null,
      neighborhood: neighborhood || null,
      geoSource: "query-coords"
    };
  } else {
    resolved =
      (await geocodeCity(city, district, neighborhood).catch(() => null)) ||
      (district ? getDistrictCentroid(city, district) : null);
    if (resolved && !resolved.geoSource) {
      resolved = {
        ...resolved,
        city: resolved.city || toTurkishTitleCase(city),
        district: resolved.district || district || null,
        neighborhood: resolved.neighborhood || neighborhood || null,
        geoSource: "district-centroid"
      };
    }
  }
  if (!resolved?.lat || !resolved?.lon) {
    return {
      updatedAt: new Date().toISOString(),
      available: false,
      error: "irrigation_geocode_failed",
      scope
    };
  }

  const [forecastPack, soilPack, soilSignals] = await Promise.all([
    fetchOpenMeteoIrrigationForecast(resolved.lat, resolved.lon, horizonDays).catch(() => null),
    runWithTimeoutFallback(() => fetchSoilGrids(resolved.lat, resolved.lon).catch(() => null), 4200, null),
    runWithTimeoutFallback(() => fetchOpenMeteoSoilSignals(resolved.lat, resolved.lon).catch(() => null), 4200, null)
  ]);
  if (!forecastPack?.days?.length) {
    return {
      updatedAt: new Date().toISOString(),
      available: false,
      error: "irrigation_forecast_unavailable",
      scope
    };
  }
  const soilGridLive = Boolean(soilPack && hasSoilGridSignal(soilPack));
  const soilSignalsLive = Boolean(
    soilSignals?.summary &&
      (Number.isFinite(soilSignals.summary.moistureTopAvg) ||
        Number.isFinite(soilSignals.summary.moistureMidAvg) ||
        Number.isFinite(soilSignals.summary.evapotranspirationAvg))
  );
  if (strictLive && !soilGridLive && !soilSignalsLive) {
    return {
      updatedAt: new Date().toISOString(),
      available: false,
      error: "irrigation_soil_unavailable",
      scope
    };
  }

  const climateNormals = buildWideDailyClimateNormals();
  const seasonLengthDays = Number(cropConfig.seasonLengthDays || 0);
  const plantingTs = new Date(requestedPlantingDate);
  const firstForecastDate = String(forecastPack.days[0]?.date || "");
  const forecastStartDate = new Date(`${firstForecastDate}T00:00:00Z`);
  const campaignDayStart =
    Number.isFinite(plantingTs.getTime()) && Number.isFinite(forecastStartDate.getTime())
      ? Math.floor((forecastStartDate - plantingTs) / 86400000) + 1
      : null;
  const remainingSeasonDays =
    seasonLengthDays && campaignDayStart != null ? Math.max(0, seasonLengthDays - campaignDayStart + 1) : 0;
  const canExtend =
    Boolean(seasonPlan) &&
    Boolean(climateNormals?.available) &&
    Number.isFinite(remainingSeasonDays) &&
    remainingSeasonDays > forecastPack.days.length;
  const totalScheduleDays = canExtend ? remainingSeasonDays : forecastPack.days.length;
  const extendedClimateRows = [];
  for (let idx = 0; idx < totalScheduleDays; idx += 1) {
    if (idx < forecastPack.days.length) {
      extendedClimateRows.push({ ...forecastPack.days[idx], climateSource: "forecast" });
      continue;
    }
    const dateObj = new Date(forecastStartDate);
    dateObj.setUTCDate(dateObj.getUTCDate() + idx);
    const monthDay = `${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dateObj.getUTCDate()).padStart(2, "0")}`;
    const normal = climateNormals?.normals?.get(monthDay) || null;
    if (!normal) break;
    extendedClimateRows.push({
      date: dateObj.toISOString().slice(0, 10),
      et0Mm: Number(normal.et0Mean || 0),
      et0Source: "climatology",
      precipitationMm: Number(normal.precipMean || 0),
      precipProbMax: Number(normal.rainyDayRate || 0),
      tempMin: Number(normal.tempP25 || normal.tempMean || 0),
      tempMax: Number(normal.tempP75 || normal.tempMean || 0),
      tempMean: Number(normal.tempMean || 0),
      humidityMean: Number(normal.rhMean || 0),
      windMaxKmh: null,
      shortwaveMjM2: null,
      climateSource: "normal"
    });
  }

  const soilProfile = inferSoilWaterHoldingProfile({
    soilType: classifySoilTexture(soilPack || {}),
    sand: soilPack?.sand,
    clay: soilPack?.clay,
    silt: soilPack?.silt
  });
  const tawMm = Number((soilProfile.awcMmPerM * Number(cropConfig.rootDepthM || 1)).toFixed(1));
  const rawMm = Number((tawMm * Number(cropConfig.depletionFraction || 0.5)).toFixed(1));
  const initialDepletionMm = estimateInitialDepletionMm({
    topMoisture: soilSignals?.summary?.moistureTopAvg,
    midMoisture: soilSignals?.summary?.moistureMidAvg,
    tawMm,
    soilProfile
  });
  let depletionMm = initialDepletionMm;
  const refillResidualMm = Number((tawMm * 0.12).toFixed(1));
  const scheduleRows = [];
  const irrigationEvents = [];

  extendedClimateRows.forEach((row, idx) => {
    const date = String(row.date || "");
    const dateObj = new Date(date);
    const dayAfterPlant = Math.floor((dateObj - plantingTs) / 86400000) + 1;
    const stage = getIrrigationStage(dayAfterPlant, cropConfig);
    const et0Mm = Number.isFinite(Number(row.et0Mm)) ? Number(row.et0Mm) : 0;
    const etcMm = stage.inSeason ? Number((et0Mm * stage.kc).toFixed(2)) : 0;
    const precipitationMm = Number.isFinite(Number(row.precipitationMm)) ? Number(row.precipitationMm) : 0;
    const precipProb = Number.isFinite(Number(row.precipProbMax)) ? Number(row.precipProbMax) : null;
    let rainEffFactor = 0.8;
    if (precipProb != null) {
      if (precipProb < 30) rainEffFactor = 0.45;
      else if (precipProb < 55) rainEffFactor = 0.65;
      else if (precipProb < 80) rainEffFactor = 0.8;
      else rainEffFactor = 0.9;
    }
    const effectiveRainMm =
      stage.inSeason && precipitationMm > 0.2 ? Number((Math.max(0, precipitationMm * rainEffFactor)).toFixed(2)) : 0;
    const depletionBeforeMm = depletionMm;
    const depletionAfterClimateMm = Number(
      Math.max(0, Math.min(tawMm, depletionBeforeMm + etcMm - effectiveRainMm)).toFixed(2)
    );
    let irrigationNetMm = 0;
    let irrigationGrossMm = 0;
    let eventType = "izle";
    let reason = stage.inSeason ? "Toprak su acigi izleniyor" : "Kampanya henuz aktif degil";
    if (stage.inSeason && depletionAfterClimateMm >= rawMm) {
      irrigationNetMm = Number(Math.max(0, depletionAfterClimateMm - refillResidualMm).toFixed(2));
      irrigationGrossMm = Number((irrigationNetMm / numericEfficiency).toFixed(2));
      depletionMm = Number(Math.max(0, depletionAfterClimateMm - irrigationNetMm).toFixed(2));
      eventType = "sula";
      reason = `RAW esigi asildi (${depletionAfterClimateMm.toFixed(1)} / ${rawMm.toFixed(1)} mm)`;
      irrigationEvents.push({
        id: `evt-${date}-${idx}`,
        date,
        window: irrigationMethod.window,
        netMm: irrigationNetMm,
        grossMm: irrigationGrossMm,
        grossM3: Number((irrigationGrossMm * numericAreaHa * 10).toFixed(0)),
        stage: stage.label,
        reason
      });
    } else {
      depletionMm = depletionAfterClimateMm;
      if (stage.inSeason && effectiveRainMm > 0) {
        reason = `Yagis etkisi ${effectiveRainMm.toFixed(1)} mm`;
      } else if (stage.inSeason) {
        reason = `Esik alti; kalan depolama ${Math.max(0, rawMm - depletionAfterClimateMm).toFixed(1)} mm`;
      }
    }
    scheduleRows.push({
      id: `day-${date}-${idx}`,
      date,
      dayLabel: idx === 0 ? "Bugun" : idx === 1 ? "Yarin" : `${idx + 1}. gun`,
      isoWeek: getIsoWeekLabel(date),
      dayAfterPlant,
      stage: stage.label,
      stageKey: stage.id,
      inSeason: stage.inSeason,
      kc: Number(stage.kc.toFixed(3)),
      et0Mm: Number(et0Mm.toFixed(2)),
      et0Source: row.et0Source || (row.climateSource === "normal" ? "climatology" : "forecast"),
      etcMm,
      precipitationMm: Number(precipitationMm.toFixed(2)),
      precipProbMax: precipProb,
      effectiveRainMm,
      tempMin: Number.isFinite(Number(row.tempMin)) ? Number(Number(row.tempMin).toFixed(1)) : null,
      tempMax: Number.isFinite(Number(row.tempMax)) ? Number(Number(row.tempMax).toFixed(1)) : null,
      tempMean: Number.isFinite(Number(row.tempMean)) ? Number(Number(row.tempMean).toFixed(1)) : null,
      shortwaveMjM2: Number.isFinite(Number(row.shortwaveMjM2)) ? Number(Number(row.shortwaveMjM2).toFixed(1)) : null,
      depletionBeforeMm: Number(depletionBeforeMm.toFixed(2)),
      depletionAfterMm: Number(depletionMm.toFixed(2)),
      rawThresholdMm: rawMm,
      irrigationNetMm,
      irrigationGrossMm,
      irrigationGrossM3: Number((irrigationGrossMm * numericAreaHa * 10).toFixed(0)),
      tempBand:
        Number.isFinite(Number(row.tempMin)) && Number.isFinite(Number(row.tempMax))
          ? `${Number(row.tempMin).toFixed(0)} / ${Number(row.tempMax).toFixed(0)} C`
          : "-",
      humidityMean: Number.isFinite(Number(row.humidityMean)) ? Number(Number(row.humidityMean).toFixed(0)) : null,
      windMaxKmh: Number.isFinite(Number(row.windMaxKmh)) ? Number(Number(row.windMaxKmh).toFixed(0)) : null,
      eventType,
      reason,
      climateSource: row.climateSource || "forecast"
    });
  });

  const weeklyMap = new Map();
  scheduleRows.forEach((row) => {
    const existing = weeklyMap.get(row.isoWeek) || {
      weekLabel: row.isoWeek,
      grossMm: 0,
      netMm: 0,
      etcMm: 0,
      effectiveRainMm: 0,
      grossM3: 0,
      irrigationEvents: 0
    };
    existing.grossMm += row.irrigationGrossMm;
    existing.netMm += row.irrigationNetMm;
    existing.etcMm += row.etcMm;
    existing.effectiveRainMm += row.effectiveRainMm;
    existing.grossM3 += row.irrigationGrossM3;
    existing.irrigationEvents += row.eventType === "sula" ? 1 : 0;
    weeklyMap.set(row.isoWeek, existing);
  });
  const weekly = Array.from(weeklyMap.values()).map((row) => ({
    ...row,
    grossMm: Number(row.grossMm.toFixed(1)),
    netMm: Number(row.netMm.toFixed(1)),
    etcMm: Number(row.etcMm.toFixed(1)),
    effectiveRainMm: Number(row.effectiveRainMm.toFixed(1)),
    grossM3: Number(row.grossM3.toFixed(0))
  }));

  const normalDays = scheduleRows.filter((row) => row.climateSource === "normal").length;
  const multiYearReference = buildWideIrrigationReference(cropConfig.key, requestedPlantingDate, numericAreaHa, numericEfficiency);
  const historical1987 = buildHackhatonIrrigationHistoricalExample(cropConfig.key, requestedPlantingDate);
  const nextEvent = irrigationEvents[0] || null;
  const campaignDay =
    Number.isFinite(plantingTs.getTime()) ? Math.floor((new Date(forecastPack.days[0].date) - plantingTs) / 86400000) + 1 : null;
  const campaignStatus =
    campaignDay == null
      ? "bilinmiyor"
      : campaignDay < 1
        ? "planlama"
        : campaignDay > Number(cropConfig.seasonLengthDays || 0)
          ? "tamamlandi"
          : "aktif";
  const anomaly = buildForecastIrrigationAnomaly(scheduleRows, climateNormals);
  const summary = {
    campaignStatus,
    campaignDay,
    currentStage: scheduleRows[0]?.stage || "Sezon disi",
    nextIrrigationDate: nextEvent?.date || null,
    nextIrrigationGrossMm: nextEvent?.grossMm || 0,
    nextIrrigationGrossM3: nextEvent?.grossM3 || 0,
    horizonEtcMm: Number(scheduleRows.reduce((sum, row) => sum + row.etcMm, 0).toFixed(1)),
    horizonEffectiveRainMm: Number(scheduleRows.reduce((sum, row) => sum + row.effectiveRainMm, 0).toFixed(1)),
    horizonGrossMm: Number(scheduleRows.reduce((sum, row) => sum + row.irrigationGrossMm, 0).toFixed(1)),
    irrigationEventCount: irrigationEvents.length,
    horizonDays: scheduleRows.length,
    forecastDays: forecastPack.days.length,
    normalDays,
    horizonMode: canExtend ? "season" : "forecast"
  };
  const referenceCampaign = multiYearReference
    ? {
        ...multiYearReference,
        validation: historical1987?.validation || null,
        slides: historical1987?.slides || [],
        historical1987
      }
    : historical1987
      ? {
          periodLabel: "1987 historical example",
          sampleYears: 1,
          summary: historical1987.summary,
          weekly: historical1987.weekly,
          validation: historical1987.validation,
          slides: historical1987.slides,
        historical1987
      }
      : null;
  const waterSupplyAdvisor = buildIrrigationWaterSupplyAdvisor({
    city: resolved.city || city,
    waterSource: irrigationWaterSource,
    irrigationMethod,
    crop: cropConfig,
    summary,
    anomaly,
    scheduleRows,
    weekly,
    referenceCampaign
  });
  const actionPlan = buildIrrigationActionPlan({
    summary,
    anomaly,
    irrigationMethod,
    crop: cropConfig,
    waterSupplyAdvisor
  });
  const stageBoard = buildIrrigationStageBoard(scheduleRows);
  const taskBoard = buildIrrigationTaskBoard({
    scheduleRows,
    summary,
    anomaly,
    irrigationMethod,
    crop: cropConfig
  });
  const plantingShiftBoard = buildIrrigationPlantingShiftBoard({
    climate: climateNormals,
    crop: cropConfig,
    plantingDate: requestedPlantingDate,
    areaHa: numericAreaHa,
    efficiency: numericEfficiency
  });
  const depletionTrace = buildIrrigationDepletionTrace(scheduleRows, tawMm, rawMm);
  const evapotranspirationProfile = buildEvapotranspirationProfile({
    scheduleRows,
    climate: climateNormals,
    crop: cropConfig
  });
  const hourlyEvapoCommand = buildHourlyEvapoCommand({
    forecastPack,
    irrigationMethod,
    waterSupplyAdvisor
  });
  const et0ResearchPack = buildEt0PresentationResearchPack({
    climate: climateNormals,
    evapotranspirationProfile,
    summary,
    anomaly,
    waterSupplyAdvisor,
    irrigationMethod,
    waterSource: irrigationWaterSource,
    referenceCampaign
  });
  const priorityBoard = buildIrrigationPriorityBoard({
    summary,
    anomaly,
    hourlyEvapoCommand,
    evapotranspirationProfile,
    waterSupplyAdvisor,
    et0ResearchPack,
    irrigationMethod,
    crop: cropConfig
  });
  const alertBundle = buildIrrigationAlertBundle({
    summary,
    anomaly,
    hourlyEvapoCommand,
    waterSupplyAdvisor,
    priorityBoard
  });
  const taskDrafts = buildIrrigationTaskDrafts({
    summary,
    hourlyEvapoCommand,
    waterSupplyAdvisor,
    priorityBoard
  });
  const agrobotGuide = buildIrrigationAgrobotGuide({
    scheduleRows,
    summary,
    anomaly,
    crop: cropConfig,
    irrigationMethod,
    soilProfile: {
      ...soilProfile,
      tawMm,
      rawMm,
      initialDepletionMm
    },
    referenceCampaign,
    waterSupplyAdvisor
  });

  return {
    updatedAt: new Date().toISOString(),
    available: true,
    live: true,
    source: "open-meteo-et0+fao56-kc+hackhaton-reference",
    dataQuality: {
      strictLive: Boolean(strictLive),
      forecastLive: true,
      soilGridLive,
      soilSignalsLive,
      et0Source: Array.from(new Set((forecastPack.days || []).map((item) => item.et0Source).filter(Boolean)))
    },
    scope: {
      city: resolved.city || city,
      district: resolved.district || district || null,
      neighborhood: resolved.neighborhood || neighborhood || null,
      locationLabel:
        buildLocationSearchQuery(resolved.city || city, resolved.district || district, resolved.neighborhood || neighborhood) ||
        scope.locationLabel,
      coords: `${resolved.lat}, ${resolved.lon}`,
      geoSource: resolved.geoSource || "open-meteo-geocode"
    },
    crop: {
      key: cropConfig.key,
      label: cropConfig.label,
      plantingDate: requestedPlantingDate,
      seasonLengthDays: cropConfig.seasonLengthDays,
      rootDepthM: cropConfig.rootDepthM,
      depletionFraction: cropConfig.depletionFraction,
      kc: cropConfig.kc,
      stageLengths: cropConfig.stageLengths
    },
    irrigationMethod: {
      key: irrigationMethod.key,
      label: irrigationMethod.label,
      efficiency: Number(numericEfficiency.toFixed(2)),
      window: irrigationMethod.window
    },
    waterSource: {
      key: irrigationWaterSource.key,
      label: irrigationWaterSource.label
    },
    soilProfile: {
      texture: classifySoilTexture(soilPack || {}),
      bucket: soilProfile.bucket,
      label: soilProfile.label,
      tawMm,
      rawMm,
      initialDepletionMm,
      moistureTopAvg: toFiniteNumber(soilSignals?.summary?.moistureTopAvg),
      moistureMidAvg: toFiniteNumber(soilSignals?.summary?.moistureMidAvg)
    },
    summary,
    calendar: scheduleRows,
    weekly,
    events: irrigationEvents,
    anomaly,
    actionPlan,
    waterSupplyAdvisor,
    stageBoard,
    taskBoard,
    plantingShiftBoard,
    depletionTrace,
    evapotranspirationProfile,
    hourlyEvapoCommand,
    et0ResearchPack,
    priorityBoard,
    alertBundle,
    taskDrafts,
    agrobotGuide,
    referenceCampaign,
    assumptions: [
      { label: "Formul", value: "ETc = Kc x ET0" },
      { label: "Esik", value: "RAW = p x TAW" },
      { label: "Etkin yagis", value: "Olasiliga gore 0.45-0.9 x gunluk yagis" },
      { label: "Alan", value: `${numericAreaHa.toFixed(2)} ha` }
    ],
    researchRefs: IRRIGATION_RESEARCH_REFS,
    dataSources: [
      { id: "open-meteo", title: "Open-Meteo Forecast", url: forecastPack.url, type: "daily-et0-forecast" },
      { id: "soilgrids", title: "ISRIC SoilGrids", url: SOILGRIDS_QUERY, type: "soil-capacity" },
      { id: "hackhaton", title: "Hackhaton irrigation bundle", url: "/api/hackhaton/dashboard", type: "reference-campaign" }
    ]
  };
}

async function geocodeCity(city, district = "", neighborhood = "") {
  const exactScopeLookup =
    (neighborhood || district)
      ? await fetchNominatimGeocode(city, district, neighborhood).catch(() => null)
      : null;
  if (exactScopeLookup) {
    return {
      name: exactScopeLookup.city || city || exactScopeLookup.name || null,
      lat: exactScopeLookup.lat,
      lon: exactScopeLookup.lon,
      city: exactScopeLookup.city || city || null,
      district: exactScopeLookup.district || district || null,
      neighborhood: exactScopeLookup.neighborhood || neighborhood || null,
      geoSource: exactScopeLookup.geoSource || "nominatim-geocode",
      displayName: exactScopeLookup.displayName || null
    };
  }
  const directDistrictCentroid = district ? getDistrictCentroid(city, district) : null;
  if (directDistrictCentroid) {
    return {
      name: city || null,
      lat: directDistrictCentroid.lat,
      lon: directDistrictCentroid.lon,
      city: city ? toTurkishTitleCase(city) : null,
      district: district ? toTurkishTitleCase(district) : null,
      neighborhood: neighborhood || null,
      geoSource: "district-centroid"
    };
  }
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
      city: city ? toTurkishTitleCase(city) : result.name || null,
      district: district ? toTurkishTitleCase(district) : null,
      neighborhood: neighborhood || null,
      geoSource: "open-meteo-geocode"
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
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,cloud_cover" +
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
    cloudCoverPct: typeof data.current?.cloud_cover === "number" ? Math.round(data.current.cloud_cover) : null,
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

const LIVE_HAL_MARKET_SOURCES = [
  { id: "bursa-hal", title: "Bursa Hali", url: MARKET_SOURCES.bursa },
  { id: "konya-hal", title: "Konya Hali", url: MARKET_SOURCES.konya },
  { id: "kayseri-hal", title: "Kayseri Hali", url: MARKET_SOURCES.kayseri }
];

const FARM_PRICE_TARGETS = [
  { key: "domates", label: "Domates", aliases: ["domates", "salkim domates", "domates cherry"] },
  { key: "biber", label: "Biber", aliases: ["biber", "kapya biber", "sivri biber", "carliston biber"] },
  { key: "patates", label: "Patates", aliases: ["patates"] },
  { key: "sogan", label: "Sogan", aliases: ["sogan", "kuru sogan"] },
  { key: "salatalik", label: "Salatalik", aliases: ["salatalik", "hiyar", "silor"] },
  { key: "kabak", label: "Kabak", aliases: ["kabak", "sakiz kabak"] },
  { key: "patlican", label: "Patlican", aliases: ["patlican"] },
  { key: "elma", label: "Elma", aliases: ["elma"] },
  { key: "limon", label: "Limon", aliases: ["limon"] },
  { key: "portakal", label: "Portakal", aliases: ["portakal"] },
  { key: "bugday", label: "Bugday", aliases: ["bugday"] },
  { key: "arpa", label: "Arpa", aliases: ["arpa"] },
  { key: "misir", label: "Misir", aliases: ["misir"] }
];

const FUEL_SOURCE_TEMPLATES = [
  {
    key: "motorin",
    label: "Mazot",
    unit: "TL/L",
    priceColumnIndex: 2,
    url: (citySlug) => `https://www.aytemiz.com.tr/akaryakit-fiyatlari/motorin-fiyatlari/${citySlug}-motorin-fiyati`
  },
  {
    key: "benzin",
    label: "Benzin",
    unit: "TL/L",
    priceColumnIndex: 0,
    url: (citySlug) => `https://www.aytemiz.com.tr/akaryakit-fiyatlari/benzin-fiyatlari/${citySlug}-benzin-fiyati`
  }
];

function stripHtmlTags(input = "") {
  return decodeXmlEntities(
    String(input || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|section|article|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureAbsoluteUrl(url = "", baseUrl = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch (_) {
    return raw;
  }
}

function parseTrNumber(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractHtmlRows(html = "") {
  return Array.from(String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
}

function extractHtmlCells(rowHtml = "") {
  return Array.from(String(rowHtml || "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
    .map((match) => stripHtmlTags(match[1]))
    .filter(Boolean);
}

function toSlugTr(value = "") {
  return normalizeTrText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickMarketTarget(label = "", preferredCrop = "") {
  const labelNorm = normalizeTrText(label);
  if (!labelNorm) return null;
  const preferredKey = cityKey(preferredCrop || "");
  const orderedTargets = FARM_PRICE_TARGETS.slice().sort((a, b) => {
    if (a.key === preferredKey) return -1;
    if (b.key === preferredKey) return 1;
    return 0;
  });
  for (const item of orderedTargets) {
    if (item.aliases.some((alias) => labelNorm.includes(normalizeTrText(alias)))) {
      return item;
    }
  }
  return null;
}

function parseHalRowsFromHtml(html = "", source = {}, preferredCrop = "") {
  const rows = extractHtmlRows(html);
  const items = [];
  rows.forEach((rowHtml) => {
    const cells = extractHtmlCells(rowHtml);
    if (cells.length < 2) return;
    const rawLabel = String(cells[0] || "").trim();
    const rawKey = normalizeTrText(rawLabel);
    if (!rawLabel || rawKey.includes("urun") || rawKey.includes("cins") || rawKey.includes("kategori")) return;
    const unitCell = normalizeTrText(String(cells[1] || ""));
    if (unitCell && !/(kg|kğ|adet|ad|bag|bağ|demet)/.test(unitCell)) return;
    const target = pickMarketTarget(rawLabel, preferredCrop);
    if (!target) return;
    const numbers = cells
      .slice(1)
      .flatMap((cell) => (String(cell).match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?/g) || []).map(parseTrNumber))
      .filter((value) => Number.isFinite(value) && value > 0 && value < 5000);
    if (!numbers.length) return;
    const minTlKg = Number(Math.min(...numbers).toFixed(2));
    const maxTlKg = Number(Math.max(...numbers).toFixed(2));
    const priceTlKg = Number(((minTlKg + maxTlKg) / 2).toFixed(2));
    items.push({
      key: target.key,
      label: target.label,
      rawLabel,
      sourceId: source.id || "",
      sourceTitle: source.title || "",
      sourceUrl: source.url || "",
      minTlKg,
      maxTlKg,
      priceTlKg,
      unit: "TL/kg"
    });
  });
  return items;
}

function buildLiveProduceBoard(items = [], preferredCrop = "") {
  const grouped = new Map();
  items.forEach((item) => {
    const key = cityKey(item?.key || item?.label || "");
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  const preferredKeys = [
    cityKey(preferredCrop || ""),
    "domates",
    "biber",
    "patates",
    "sogan",
    "salatalik",
    "kabak",
    "patlican"
  ].filter(Boolean);
  const orderedKeys = Array.from(
    new Set([...preferredKeys, ...Array.from(grouped.keys()).sort((a, b) => (grouped.get(b)?.length || 0) - (grouped.get(a)?.length || 0))])
  );
  return orderedKeys
    .map((key) => {
      const rows = grouped.get(key) || [];
      if (!rows.length) return null;
      const prices = rows.map((row) => Number(row.priceTlKg)).filter((value) => Number.isFinite(value) && value > 0);
      if (!prices.length) return null;
      const first = rows[0];
      const minTlKg = Number(Math.min(...rows.map((row) => Number(row.minTlKg || row.priceTlKg || 0)).filter((v) => v > 0)).toFixed(2));
      const maxTlKg = Number(Math.max(...rows.map((row) => Number(row.maxTlKg || row.priceTlKg || 0)).filter((v) => v > 0)).toFixed(2));
      const priceTlKg = Number(medianOf(prices).toFixed(2));
      const bandPct = priceTlKg > 0 ? Number((((maxTlKg - minTlKg) / priceTlKg) * 100).toFixed(1)) : 0;
      return {
        key,
        label: first.label || first.rawLabel || key,
        symbol: toTurkishAscii(first.label || first.rawLabel || key).toUpperCase().replace(/[^A-Z0-9]+/g, ""),
        priceTlKg,
        minTlKg,
        maxTlKg,
        bandPct,
        sourceCount: rows.length,
        markets: Array.from(new Set(rows.map((row) => row.sourceTitle).filter(Boolean))).slice(0, 4),
        unit: "TL/kg"
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function fetchLiveHalBoard(preferredCrop = "") {
  const key = `produce:${cityKey(preferredCrop || "all")}`;
  const cached = marketCache.get(key);
  if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached.value;

  const results = await Promise.allSettled(
    LIVE_HAL_MARKET_SOURCES.map(async (source) => {
      const html = await fetchTextWithRetry(source.url, {}, 1, Math.max(MARKET_FETCH_TIMEOUT_MS, 5000));
      return { source, items: parseHalRowsFromHtml(html, source, preferredCrop) };
    })
  );

  const rawItems = [];
  const failedSources = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      rawItems.push(...(result.value.items || []));
    } else {
      failedSources.push({
        id: LIVE_HAL_MARKET_SOURCES[idx].id,
        title: LIVE_HAL_MARKET_SOURCES[idx].title,
        url: LIVE_HAL_MARKET_SOURCES[idx].url
      });
    }
  });

  const payload = {
    source: "official-hal-pages",
    items: buildLiveProduceBoard(rawItems, preferredCrop),
    rawItems,
    failedSources,
    sources: LIVE_HAL_MARKET_SOURCES
  };
  marketCache.set(key, { ts: Date.now(), value: payload });
  return payload;
}

function pickFuelRow(cells = [], district = "") {
  const label = String(cells[0] || "").trim();
  const labelKey = cityKey(label);
  if (!labelKey || labelKey.includes("ilce") || labelKey.includes("sube")) return null;
  const prices = cells
    .slice(1)
    .flatMap((cell) => (String(cell).match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?/g) || []).map(parseTrNumber))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
  if (!prices.length) return null;
  const districtKey = cityKey(district || "");
  const score = districtKey && labelKey === districtKey ? 3 : districtKey && labelKey.includes(districtKey) ? 2 : 1;
  return {
    label,
    priceTlL: Number(prices[0].toFixed(2)),
    prices: prices.map((value) => Number(value.toFixed(2))),
    altPrices: prices.slice(1).map((value) => Number(value.toFixed(2))),
    score
  };
}

function extractAytemizFuelRows(html = "", district = "") {
  const tableHtml =
    String(html || "").match(/<table[^>]*id=fuel-price-table[\s\S]*?<\/table>/i)?.[0] || String(html || "");
  return Array.from(tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>)/gi))
    .map((match) => {
      const rowHtml = String(match[1] || "").replace(/&#\d+;/g, " ");
      const label =
        stripHtmlTags(rowHtml.match(/<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] || rowHtml.match(/<td[^>]*>([\s\S]*?)(?=<td|$)/i)?.[1] || "");
      const rowTextWithoutLabel = stripHtmlTags(rowHtml.replace(/<td[^>]*>\s*(?:<div[^>]*>)?[\s\S]*?(?:<\/div>)?(?=<td|$)/i, " "));
      const numericMatches = rowTextWithoutLabel.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?/g) || [];
      const pseudoCells = [label, ...numericMatches];
      return pickFuelRow(pseudoCells, district);
    })
    .filter(Boolean)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function fetchAytemizFuelPrices(city = "", district = "") {
  const citySlug = toSlugTr(city);
  if (!citySlug) {
    return { source: "aytemiz", items: [], warnings: ["fuel_city_missing"] };
  }
  const results = await Promise.allSettled(
    FUEL_SOURCE_TEMPLATES.map(async (fuelType) => {
      const url = fuelType.url(citySlug);
      const html = await fetchTextWithRetry(url, {}, 1, 6500);
      const rows = extractAytemizFuelRows(html, district);
      const best = rows[0];
      if (!best) return null;
      const prices = Array.isArray(best.prices) ? best.prices : [best.priceTlL, ...(best.altPrices || [])];
      const pickedPrice = Number(
        prices[fuelType.priceColumnIndex] || prices[0] || best.priceTlL || 0
      );
      return {
        key: fuelType.key,
        label: fuelType.label,
        unit: fuelType.unit,
        priceTlL: Number(pickedPrice.toFixed(2)),
        district: best.label,
        city,
        source: "aytemiz",
        sourceTitle: "Aytemiz Akaryakit Fiyatlari",
        sourceUrl: url
      };
    })
  );
  const items = [];
  const warnings = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled" && result.value) {
      items.push(result.value);
    } else {
      warnings.push(`fuel_${FUEL_SOURCE_TEMPLATES[idx].key}_unavailable`);
    }
  });
  return { source: "aytemiz", items, warnings };
}

async function fetchMarketLiveIntel({ city = "Malatya", district = "", crop = "" } = {}) {
  const cacheKey = `live:${cityKey(city)}:${cityKey(district)}:${cityKey(crop)}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached.value;

  const [produceResult, fuelResult] = await Promise.allSettled([
    fetchLiveHalBoard(crop),
    fetchAytemizFuelPrices(city, district)
  ]);
  const produce = produceResult.status === "fulfilled"
    ? produceResult.value
    : { source: "official-hal-pages", items: [], failedSources: LIVE_HAL_MARKET_SOURCES, sources: LIVE_HAL_MARKET_SOURCES };
  const fuel = fuelResult.status === "fulfilled"
    ? fuelResult.value
    : { source: "aytemiz", items: [], warnings: ["fuel_fetch_failed"] };
  const warnings = [
    ...(Array.isArray(produce?.failedSources) && produce.failedSources.length ? ["produce_sources_partial"] : []),
    ...(fuel?.warnings || [])
  ];
  const payload = {
    updatedAt: new Date().toISOString(),
    city,
    district: district || null,
    crop: crop || null,
    live: Boolean((Array.isArray(produce?.items) && produce.items.length) || (Array.isArray(fuel?.items) && fuel.items.length)),
    board: Array.isArray(produce?.items) ? produce.items : [],
    produce: {
      items: Array.isArray(produce?.items) ? produce.items : [],
      source: produce?.source || "official-hal-pages",
      failedSources: produce?.failedSources || []
    },
    fuel: {
      items: Array.isArray(fuel?.items) ? fuel.items : [],
      source: fuel?.source || "aytemiz"
    },
    sources: [
      ...LIVE_HAL_MARKET_SOURCES.map((source) => ({ id: source.id, title: source.title, url: source.url })),
      { id: "aytemiz-fuel", title: "Aytemiz Akaryakit Fiyatlari", url: "https://www.aytemiz.com.tr/akaryakit-fiyatlari" }
    ],
    warnings
  };
  marketCache.set(cacheKey, { ts: Date.now(), value: payload });
  return payload;
}

async function fetchMarketPrices(city, crop = "") {
  const key = `${city.toLowerCase()}|${cityKey(crop)}`;
  const cached = marketCache.get(key);
  if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL_MS) return cached.value;

  try {
    const live = await fetchLiveHalBoard(crop);
    if (Array.isArray(live?.items) && live.items.length) {
      const payload = {
        source: live.source,
        items: live.items.map((item) => ({
          crop: item.key,
          label: item.label,
          unit: item.unit,
          price: `${Number(item.minTlKg || item.priceTlKg || 0).toFixed(2)} - ${Number(item.maxTlKg || item.priceTlKg || 0).toFixed(2)}`
        }))
      };
      marketCache.set(key, { ts: Date.now(), value: payload });
      return payload;
    }
  } catch (_) {
    // fall through to legacy city scraping
  }

  const url = MARKET_SOURCES[key];
  if (!url) return { source: "none", items: [] };

  let html = "";
  try {
    html = await fetchTextWithRetry(url, {}, 0, MARKET_FETCH_TIMEOUT_MS);
  } catch (err) {
    const fallback = { source: "error", items: [] };
    marketCache.set(key, { ts: Date.now(), value: fallback });
    return fallback;
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

function toTurkishAscii(value = "") {
  return String(value || "")
    .trim()
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/İ/g, "I")
    .replace(/I/g, "I")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function toTurkishTitleCase(value = "") {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((token) => {
          const lower = token.toLocaleLowerCase("tr-TR");
          if (!lower) return "";
          return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
        })
        .join("-")
    )
    .join(" ");
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
  const quick = Boolean(options?.quick);
  const candidates = quick
    ? [
        {
          name: "fast",
          epochs: 420,
          lr: 0.02,
          lambda: 0.0015,
          huberDelta: 0.1,
          patience: 90,
          valRatio: 0.18
        }
      ]
    : [
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
  const categoryRaw = String(item.category || (item.areaDa || item.zoning || item.parcel ? "land" : "crop")).toLowerCase();
  const category = categoryRaw === "land" ? "land" : "crop";
  const typeRaw = String(item.type || "sell").toLowerCase();
  const type = typeRaw === "buy" ? "buy" : "sell";
  const statusRaw = String(item.status || "open").toLowerCase();
  const status = ["open", "closed", "paused"].includes(statusRaw) ? statusRaw : "open";
  const areaDa = Number(item.areaDa || 0);
  const priceTlDa = Number(item.priceTlDa || 0);
  const quantityKg = Number(item.quantityKg || (category === "land" ? areaDa : 0));
  const priceTlKg = Number(item.priceTlKg || (category === "land" ? priceTlDa : 0));
  const zoning = String(item.zoning || "").trim() || null;
  const parcel = String(item.parcel || "").trim() || null;
  return {
    id,
    category,
    type,
    status,
    city: String(item.city || "").trim(),
    district: String(item.district || "").trim() || null,
    crop: String(item.crop || "").trim(),
    title: String(item.title || "").trim() || null,
    quantityKg: Number.isFinite(quantityKg) && quantityKg > 0 ? Number(quantityKg.toFixed(2)) : 0,
    priceTlKg: Number.isFinite(priceTlKg) && priceTlKg > 0 ? Number(priceTlKg.toFixed(2)) : 0,
    areaDa: Number.isFinite(areaDa) && areaDa > 0 ? Number(areaDa.toFixed(2)) : 0,
    priceTlDa: Number.isFinite(priceTlDa) && priceTlDa > 0 ? Number(priceTlDa.toFixed(2)) : 0,
    zoning,
    parcel,
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

async function fetchLiveLandListings({
  city,
  district,
  neighborhood,
  crop,
  source = "",
  fastMode = false,
  timeoutMs = LAND_DISCOVERY_TIMEOUT_MS,
  maxSources = LAND_DISCOVERY_MAX_SOURCES,
  allowDeepScan = true
}) {
  const perSourceTimeoutMs = Math.max(1200, Number(timeoutMs || LAND_DISCOVERY_TIMEOUT_MS));
  const retries = fastMode ? 0 : 1;
  const sourceCap = Math.max(
    1,
    Math.min(
      20,
      Number(
        maxSources ||
          (fastMode ? LAND_DISCOVERY_FAST_MAX_SOURCES : LAND_DISCOVERY_MAX_SOURCES)
      )
    )
  );
  let urls = getLiveListingUrls({ city, district, neighborhood, crop }).slice(0, sourceCap);
  const discoveryUrls = getLandInternetSearchUrls({ city, district, neighborhood, crop }).slice(
    0,
    sourceCap
  );
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
        retries,
        perSourceTimeoutMs
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
  if (firstPass.length >= (fastMode ? 3 : 8) || !discoveryUrls.length) {
    return {
      items: firstPass.slice(0, 120),
      scannedSources
    };
  }
  if (!allowDeepScan) {
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
        retries,
        perSourceTimeoutMs
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
  if (!fastMode && deduped.length < 6) {
    const docs = await fetchSearchResultDocuments({ city, district, neighborhood, crop }, 12).catch(
      () => []
    );
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

async function fetchLandPriceFromInternet({
  city,
  district,
  neighborhood,
  crop,
  fastMode = LAND_PRICE_FAST_MODE_DEFAULT
}) {
  if (!LAND_DISCOVERY_ENABLED) return null;
  let liveListings = null;
  try {
    liveListings = await runWithTimeoutFallback(
      () =>
        fetchLiveLandListings({
          city,
          district,
          neighborhood,
          crop,
          fastMode: Boolean(fastMode),
          timeoutMs: fastMode ? LAND_DISCOVERY_FAST_TIMEOUT_MS : LAND_DISCOVERY_TIMEOUT_MS,
          maxSources: fastMode ? LAND_DISCOVERY_FAST_MAX_SOURCES : LAND_DISCOVERY_MAX_SOURCES,
          allowDeepScan: !fastMode
        }),
      LAND_PRICE_INTERNET_BUDGET_MS,
      null
    );
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
  if (fastMode) return null;

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
  const remotePromise = runWithTimeoutFallback(
    () => fetchLandPriceFromApis({ city, district, neighborhood, crop, lat: lat || "", lon: lon || "" }),
    LAND_PRICE_REMOTE_BUDGET_MS,
    null
  );
  const internetPromise = runWithTimeoutFallback(
    () => fetchLandPriceFromInternet({ city, district, neighborhood, crop, fastMode: true }),
    LAND_PRICE_INTERNET_BUDGET_MS,
    null
  );
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
  const manualPoolMax = Math.max(
    350,
    Math.min(2400, Number(process.env.LAND_ML_MANUAL_POOL_MAX || 1200))
  );
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

  const inferTrainCap = Math.max(
    350,
    Math.min(2600, Number(process.env.LAND_ML_INFER_MAX_ROWS || 1200))
  );
  const sourcePriority = (source = "") => {
    const key = String(source || "").toLowerCase();
    if (key === "geoKnn" || key === "geoknn") return 9;
    if (key === "manual-scoped") return 8;
    if (key === "remote" || key === "api-consensus") return 7;
    if (key === "comparable") return 6;
    if (key === "internet" || key === "live-listings") return 5;
    if (key === "manual-city-crop") return 4;
    if (key === "manual-all") return 3;
    if (key === "synthetic" || key === "synthetic-augment-v2") return 1;
    return 2;
  };
  const trainRows = allRows
    .slice()
    .sort(
      (a, b) =>
        sourcePriority(b?.source) - sourcePriority(a?.source) ||
        Number(b?.weight || 0) - Number(a?.weight || 0)
    )
    .slice(0, inferTrainCap);
  const featureSize = trainRows[0].x.length;
  const trained = trainLandPriceModelAuto(trainRows, featureSize, { quick: true });
  if (!trained?.weights) {
    return {
      ml: null,
      training: {
        sampleCount: trainRows.length,
        rawSampleCount: allRows.length,
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
  const trainMin = Math.min(...trainRows.map((x) => x.price));
  const trainMax = Math.max(...trainRows.map((x) => x.price));
  predTlDa = Math.max(trainMin * 0.7, Math.min(trainMax * 1.25, predTlDa));
  const rmse = Number(trained?.metrics?.rmse || 0);
  const mae = Number(trained?.metrics?.mae || 0);
  const r2 = Number(trained?.metrics?.r2 || 0);
  const meanTrain = trainRows.reduce((acc, x) => acc + x.price, 0) / trainRows.length;
  const relErr = meanTrain > 0 ? rmse / meanTrain : 1;
  const confidenceScore = Math.max(
    0.35,
    Math.min(
      0.92,
      0.72 -
        relErr * 0.9 +
        Math.min(0.1, Math.log10(trainRows.length + 1) * 0.05) +
        (localSignalRows.length >= 2 ? 0.06 : 0)
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
      sampleCount: trainRows.length,
      rawSampleCount: allRows.length,
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
  const buildWeatherFallback = (reason, coordsValue = coords || null) =>
    buildUnavailableWeather(city, coordsValue, reason, {
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
        return res.json(buildUnavailableWeather(resolved.name || city, `${resolved.lat}, ${resolved.lon}`, "weather_fetch_failed", {
          district: resolved.district || district || null,
          neighborhood: resolved.neighborhood || neighborhood || null,
          locationLabel:
            buildLocationSearchQuery(
              resolved.name || city,
              resolved.district || district,
              resolved.neighborhood || neighborhood
            ) || requestLocationLabel
        }));
      }
      const payload = {
        city: resolved.name || city,
        district: resolved.district || district || null,
        neighborhood: resolved.neighborhood || neighborhood || null,
        live: true,
        geoSource: resolved.geoSource || "open-meteo-geocode",
        scopeLevel: resolved.neighborhood || neighborhood ? "neighborhood" : resolved.district || district ? "district" : "city",
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
      geoSource: lat && lon ? "query" : "openweather-city",
      scopeLevel: district ? "district" : "city",
      locationLabel: requestLocationLabel,
      coords: lat && lon ? `${lat}, ${lon}` : null,
      temp: data.main?.temp ?? null,
      tempMin,
      tempMax: data.main?.temp_max ?? null,
      humidity: data.main?.humidity ?? null,
      windKmh: data.wind?.speed ? Math.round(data.wind.speed * 3.6) : null,
      cloudCoverPct: typeof data.clouds?.all === "number" ? Number(data.clouds.all) : null,
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
  {
    id: "trt-ekonomi-rss",
    title: "TRT Haber Ekonomi",
    type: "rss",
    url: "https://www.trthaber.com/ekonomi_articles.rss"
  },
  {
    id: "aa-yesilhat-tarim",
    title: "AA Yesilhat Tarim",
    type: "html",
    parser: "aa-yesilhat",
    url: "https://www.aa.com.tr/tr/yesilhat/tarim"
  },
  {
    id: "tarim-istatistik",
    title: "Tarim ve Orman Istatistik Portali",
    type: "html",
    parser: "tarim-istatistik",
    url: "https://istatistik.tarimorman.gov.tr/"
  }
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
  "destek",
  "hibe",
  "mazot",
  "motorin",
  "akaryakit",
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
  if (item.feedId === "aa-yesilhat-tarim") score += 4;
  if (item.feedId === "tarim-istatistik") score += 4;
  if (item.feedId === "trt-ekonomi-rss") score += 2;
  if (text.includes("tarim")) score += 2;
  if (text.includes("ciftci") || text.includes("uretici")) score += 2;
  return score;
}

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const value = Number.parseInt(code, 16);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    });
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

function getNewsTimestamp(item = {}) {
  const ts = new Date(item.pubDate || item.observedAt || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function extractHtmlAnchors(html = "") {
  return Array.from(String(html || "").matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)).map((match) => ({
    href: match[2],
    text: stripHtmlTags(match[3]),
    index: match.index || 0
  }));
}

function parseAaYesilhatItems(html = "", limit = 8) {
  const observedAt = new Date().toISOString();
  const unique = new Map();
  extractHtmlAnchors(html)
    .filter((item) => String(item.href || "").includes("/tr/yesilhat/tarim/"))
    .forEach((item) => {
      const title = stripHtmlTags(item.text || "");
      if (!title || title.length < 20) return;
      const link = ensureAbsoluteUrl(item.href, "https://www.aa.com.tr");
      const context = String(html || "").slice(item.index, item.index + 900);
      const description = stripHtmlTags(context).replace(title, "").slice(0, 220).trim();
      const key = `${link}|${title}`;
      if (!unique.has(key)) {
        unique.set(key, {
          title,
          link,
          description,
          observedAt
        });
      }
    });
  return Array.from(unique.values()).slice(0, limit);
}

function parseTarimStatsItems(html = "", limit = 8) {
  const observedAt = new Date().toISOString();
  const unique = new Map();
  const keywords = [
    "tarim",
    "istatistik",
    "rapor",
    "bulten",
    "bitkisel",
    "hayvansal",
    "uretim",
    "destek",
    "fiyat",
    "endeks"
  ];
  extractHtmlAnchors(html).forEach((item) => {
    const title = stripHtmlTags(item.text || "");
    const titleNorm = normalizeTrText(title);
    if (!title || title.length < 12) return;
    if (!keywords.some((kw) => titleNorm.includes(kw))) return;
    const link = ensureAbsoluteUrl(item.href, "https://istatistik.tarimorman.gov.tr/");
    const context = String(html || "").slice(item.index, item.index + 700);
    const description = stripHtmlTags(context).replace(title, "").slice(0, 220).trim();
    const key = `${link}|${title}`;
    if (!unique.has(key)) {
      unique.set(key, {
        title,
        link,
        description,
        observedAt
      });
    }
  });
  return Array.from(unique.values()).slice(0, limit);
}

async function fetchAgriNewsFeedItems(feed, limit) {
  const text = await fetchTextWithRetry(
    feed.url,
    {
      headers:
        feed.type === "rss"
          ? { accept: "application/rss+xml,application/xml,text/xml,*/*" }
          : { accept: "text/html,application/xhtml+xml,*/*" }
    },
    1,
    7000
  );
  let items = [];
  if (feed.type === "rss") {
    items = parseFeedItems(text, limit);
  } else if (feed.parser === "aa-yesilhat") {
    items = parseAaYesilhatItems(text, limit);
  } else if (feed.parser === "tarim-istatistik") {
    items = parseTarimStatsItems(text, limit);
  }
  return items.map((item) => ({
    ...item,
    feedId: feed.id,
    feedTitle: feed.title,
    observedAt: item.observedAt || new Date().toISOString()
  }));
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

app.get("/api/hackhaton/model-suite", (req, res) => {
  const city = String(req.query.city || "Malatya").trim();
  const district = String(req.query.district || "").trim();
  const neighborhood = String(req.query.neighborhood || req.query.mahalle || "").trim();
  const payload = buildHackhatonModelSuitePayload({ city, district, neighborhood });
  if (!payload?.available) {
    return res.status(404).json(payload);
  }
  return res.json(payload);
});

app.get("/api/hackhaton/dashboard", (req, res) => {
  const city = String(req.query.city || "Malatya").trim();
  const district = String(req.query.district || "").trim();
  const neighborhood = String(req.query.neighborhood || req.query.mahalle || "").trim();
  const payload = buildHackhatonDashboardPayload({ city, district, neighborhood });
  if (!payload?.available) {
    return res.status(404).json(payload);
  }
  return res.json(payload);
});

app.get("/api/irrigation/calendar", async (req, res) => {
  const city = String(req.query.city || "Malatya").trim();
  const district = String(req.query.district || "").trim();
  const neighborhood = String(req.query.neighborhood || req.query.mahalle || "").trim();
  const coords = String(req.query.coords || "").trim();
  const crop = String(req.query.crop || "domates").trim();
  const plantingDate = String(req.query.plantingDate || "").trim();
  const areaHa = Number(req.query.areaHa || 1);
  const efficiency = req.query.efficiency == null ? null : Number(req.query.efficiency);
  const method = String(req.query.method || "damla").trim();
  const waterSource = String(req.query.waterSource || "baraj_kanal").trim();
  const horizonDays = Number(req.query.horizonDays || 14);
  const strictLive = String(req.query.strictLive || "1").toLowerCase() !== "0";
  const seasonPlan = String(req.query.seasonPlan || "1").toLowerCase() !== "0";

  const payload = await buildIrrigationCalendarPayload({
    city,
    district,
    neighborhood,
    coords,
    crop,
    plantingDate,
    areaHa,
    efficiency,
    method,
    waterSource,
    horizonDays,
    strictLive,
    seasonPlan
  });
  if (!payload?.available) {
    return res.status(404).json(payload);
  }
  return res.json(payload);
});

app.get("/api/climate/anomaly-intel", async (req, res) => {
  const city = String(req.query.city || "Malatya").trim();
  const district = String(req.query.district || "").trim();
  const neighborhood = String(req.query.neighborhood || req.query.mahalle || "").trim();
  const variable = String(req.query.variable || "all").trim();
  const date = String(req.query.date || "").trim();
  const crop = String(req.query.crop || "domates").trim();
  const limit = Number(req.query.limit || 10);
  const payload = await buildClimateAnomalyIntelPayload({
    city,
    district,
    neighborhood,
    variable,
    date,
    crop,
    limit
  });
  if (!payload?.available) {
    return res.status(404).json(payload);
  }
  return res.json(payload);
});

app.post("/api/agrobot/chat", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = String(body.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "message_required" });
  }
  const city = String(body.city || "Malatya").trim() || "Malatya";
  const district = String(body.district || "").trim();
  const neighborhood = String(body.neighborhood || body.mahalle || "").trim();
  const plant = String(body.plant || body.selectedPlant || "").trim();
  const crop = String(body.crop || "").trim();
  try {
    const payload = await buildAgrobotChatPayload({
      message,
      city,
      district,
      neighborhood,
      plant,
      crop,
      weather: body.weather && typeof body.weather === "object" ? body.weather : null,
      soilReport: body.soilReport && typeof body.soilReport === "object" ? body.soilReport : null,
      diagnosisPack: body.diagnosis && typeof body.diagnosis === "object" ? body.diagnosis : null,
      actionPlan: body.actionPlan && typeof body.actionPlan === "object" ? body.actionPlan : null
    });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      error: "agrobot_chat_failed",
      detail: String(err?.message || err || "unknown_error")
    });
  }
});

app.get("/api/hackhaton/file", (req, res) => {
  const file = String(req.query.file || "").trim();
  const absPath = resolveHackhatonOutputFile(file);
  if (!absPath) {
    return res.status(404).json({ error: "hackhaton_file_not_found" });
  }
  return res.sendFile(absPath);
});

app.get("/api/hackhaton/root-file", (req, res) => {
  const file = String(req.query.file || "").trim();
  const absPath = resolveHackhatonRootFile(file);
  if (!absPath) {
    return res.status(404).json({ error: "hackhaton_root_file_not_found" });
  }
  return res.sendFile(absPath);
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
    AGRI_NEWS_FEEDS.map(async (feed) => ({ feed, items: await fetchAgriNewsFeedItems(feed, perFeed) }))
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
    const k = `${item.link || item.title || ""}`.trim();
    if (!k) return;
    if (!unique.has(k)) {
      unique.set(k, item);
      return;
    }
    const existing = unique.get(k);
    const existingScore = String(existing?.title || "").length + String(existing?.description || "").length;
    const nextScore = String(item?.title || "").length + String(item?.description || "").length;
    if (nextScore > existingScore) unique.set(k, item);
  });
  const sorted = Array.from(unique.values()).sort((a, b) => {
    const ta = getNewsTimestamp(a);
    const tb = getNewsTimestamp(b);
    return tb - ta;
  });
  const scored = sorted
    .map((item) => ({ ...item, agriScore: computeAgriNewsScore(item) }))
    .sort((a, b) => {
      if ((b.agriScore || 0) !== (a.agriScore || 0)) return (b.agriScore || 0) - (a.agriScore || 0);
      const ta = getNewsTimestamp(a);
      const tb = getNewsTimestamp(b);
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
    failedFeeds,
    live: true
  };
  if (!payload.items.length) {
    payload.live = false;
    payload.warning = failedFeeds.length ? "news_live_sources_unavailable" : "news_filtered_empty";
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
  const buildForecastFallback = (reason, coordsValue = coords || null) =>
    buildUnavailableForecast(city, coordsValue, reason, {
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
        return res.json(buildUnavailableForecast(resolved.name || city, `${resolved.lat}, ${resolved.lon}`, "forecast_fetch_failed", {
          district: resolved.district || district || null,
          neighborhood: resolved.neighborhood || neighborhood || null,
          locationLabel:
            buildLocationSearchQuery(
              resolved.name || city,
              resolved.district || district,
              resolved.neighborhood || neighborhood
            ) || requestLocationLabel
        }));
      }
      const payload = {
        city: resolved.name || city,
        district: resolved.district || district || null,
        neighborhood: resolved.neighborhood || neighborhood || null,
        live: true,
        geoSource: resolved.geoSource || "open-meteo-geocode",
        scopeLevel: resolved.neighborhood || neighborhood ? "neighborhood" : resolved.district || district ? "district" : "city",
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
      geoSource: lat && lon ? "query" : "openweather-city",
      scopeLevel: district ? "district" : "city",
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
  const crop = (req.query.crop || "").toString();
  const data = await fetchMarketPrices(city, crop);
  if (!data.items.length) {
    return res.json({
      city,
      crop: crop || null,
      source: "unavailable",
      live: false,
      warning: "market_live_source_unavailable",
      items: []
    });
  }
  return res.json({ city, crop: crop || null, source: data.source, live: true, items: data.items });
});

app.get("/api/market/live", async (req, res) => {
  const city = (req.query.city || "Malatya").toString().trim() || "Malatya";
  const district = (req.query.district || "").toString().trim();
  const crop = (req.query.crop || "").toString().trim();
  const payload = await fetchMarketLiveIntel({ city, district, crop });
  return res.json(payload);
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
  const fastMode = String(req.query.fast || "").toLowerCase() === "0" ? false : true;
  const data = await fetchLiveLandListings({
    city,
    district,
    neighborhood,
    crop,
    source,
    fastMode,
    timeoutMs: fastMode ? LAND_DISCOVERY_FAST_TIMEOUT_MS : LAND_DISCOVERY_TIMEOUT_MS,
    maxSources: fastMode ? LAND_DISCOVERY_FAST_MAX_SOURCES : LAND_DISCOVERY_MAX_SOURCES,
    allowDeepScan: !fastMode
  });
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
  const fastMode = String(req.query.fast || "").toLowerCase() === "0" ? false : LAND_PRICE_FAST_MODE_DEFAULT;
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
    runWithTimeoutFallback(
      () => fetchLandPriceFromApis({ city, district, neighborhood, crop, lat, lon }),
      LAND_PRICE_REMOTE_BUDGET_MS,
      null
    ),
    runWithTimeoutFallback(
      () => fetchLandPriceFromInternet({ city, district, neighborhood, crop, fastMode }),
      LAND_PRICE_INTERNET_BUDGET_MS,
      null
    ),
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
  const manual = buildManualLandSignal({ city, district, neighborhood, crop });
  const comparable = buildComparableLandSignal({ city, district, neighborhood, crop });
  const geoKnn = buildGeoKnnLandSignal({ city, district, neighborhood, crop, lat, lon });
  const [remote, internet, model] = await Promise.all([
    runWithTimeoutFallback(
      () => fetchLandPriceFromApis({ city, district, neighborhood, crop, lat, lon }),
      LAND_PRICE_REMOTE_BUDGET_MS,
      null
    ),
    runWithTimeoutFallback(
      () => fetchLandPriceFromInternet({ city, district, neighborhood, crop, fastMode: true }),
      LAND_PRICE_INTERNET_BUDGET_MS,
      null
    ),
    estimateLandPrice({ city, district, neighborhood, crop })
  ]);
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
  const category = (req.query.category || "").toString().toLowerCase();
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
      if (category && String(item.category || "").toLowerCase() !== category) return false;
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
  const isLandListing = listing.category === "land";
  const qtyOk = isLandListing ? listing.areaDa > 0 : listing.quantityKg > 0;
  const priceOk = isLandListing ? listing.priceTlDa > 0 : listing.priceTlKg > 0;
  if (!listing.city || !listing.crop || !qtyOk || !priceOk) {
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
  const districtCentroid = district ? getDistrictCentroid(city, district) : null;
  const geocode =
    (await geocodeCity(city, district, neighborhood).catch(() => null)) ||
    (districtCentroid
      ? {
          lat: districtCentroid.lat,
          lon: districtCentroid.lon,
          city: toTurkishTitleCase(city),
          district: toTurkishTitleCase(district),
          neighborhood: neighborhood || null,
          geoSource: "district-centroid-fallback"
        }
      : null);
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
    scopeLevel: geocode?.neighborhood || neighborhood ? "neighborhood" : geocode?.district || district ? "district" : "city",
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
  const fastMode = String(req.query.fast || "").toLowerCase() === "0" ? false : true;
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
    const geocode = await runWithTimeoutFallback(
      () => geocodeCity(city, district, neighborhood),
      fastMode ? SOIL_GEO_TIMEOUT_MS : Math.max(3600, SOIL_GEO_TIMEOUT_MS),
      null
    );
    if (geocode) {
      latNum = geocode.lat;
      lonNum = geocode.lon;
      geoSource = geocode.geoSource || "open-meteo-geocode";
      resolvedCity = geocode.city || geocode.name || city;
      resolvedDistrict = geocode.district || district || null;
      resolvedNeighborhood = geocode.neighborhood || neighborhood || null;
      locationLabel =
        buildLocationSearchQuery(resolvedCity, resolvedDistrict, resolvedNeighborhood) ||
        resolvedCity ||
        city;
    }
  }

  if ((Number.isNaN(latNum) || Number.isNaN(lonNum)) && city && district) {
    const districtCentroid = getDistrictCentroid(city, district);
    if (districtCentroid) {
      latNum = districtCentroid.lat;
      lonNum = districtCentroid.lon;
      geoSource = "district-centroid-fallback";
      resolvedCity = toTurkishTitleCase(city);
      resolvedDistrict = toTurkishTitleCase(district);
      resolvedNeighborhood = neighborhood || null;
      locationLabel =
        buildLocationSearchQuery(resolvedCity, resolvedDistrict, resolvedNeighborhood) ||
        resolvedCity ||
        city;
    }
  }

  if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
    const [soil, mtaSoil, mtaMineral, meteoSoil, trSoilWms] = await Promise.all([
      runWithTimeoutFallback(
        () => fetchSoilGrids(latNum, lonNum).catch(() => null),
        fastMode ? SOIL_SOURCE_TIMEOUT_MS : Math.max(4200, SOIL_SOURCE_TIMEOUT_MS),
        null
      ),
      runWithTimeoutFallback(
        () => fetchMtaLayer(MTA_SOIL_URL, latNum, lonNum),
        fastMode ? SOIL_SOURCE_TIMEOUT_MS : Math.max(4200, SOIL_SOURCE_TIMEOUT_MS),
        null
      ),
      runWithTimeoutFallback(
        () => fetchMtaLayer(MTA_MINERAL_URL, latNum, lonNum),
        fastMode ? SOIL_SOURCE_TIMEOUT_MS : Math.max(4200, SOIL_SOURCE_TIMEOUT_MS),
        null
      ),
      runWithTimeoutFallback(
        () => fetchOpenMeteoSoilSignals(latNum, lonNum).catch(() => null),
        fastMode ? SOIL_SOURCE_TIMEOUT_MS : Math.max(4200, SOIL_SOURCE_TIMEOUT_MS),
        null
      ),
      runWithTimeoutFallback(
        () => fetchTrSoilFromWms(latNum, lonNum).catch(() => null),
        fastMode ? SOIL_SOURCE_TIMEOUT_MS : Math.max(4200, SOIL_SOURCE_TIMEOUT_MS),
        null
      )
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
        live: true,
        scopeLevel: resolvedNeighborhood ? "neighborhood" : resolvedDistrict ? "district" : "city",
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
        samplePoint: soil?.samplePoint || null,
        internetSources,
        note: trSoilWms
          ? "Toprak verisi SoilGrids + Turkiye toprak haritasi (WMS) ile zenginlestirildi."
          : soil?.samplePoint?.distanceKm > 0
            ? `SoilGrids tam nokta yerine en yakin veri hucresinden (${soil.samplePoint.distanceKm} km) okundu.`
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
        live: true,
        scopeLevel: resolvedNeighborhood ? "neighborhood" : resolvedDistrict ? "district" : "city",
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

  return res.json(
    buildUnavailableSoil(city, latRaw && lonRaw ? `${latRaw}, ${lonRaw}` : null, "soil_live_sources_unavailable", {
      city: resolvedCity,
      district: resolvedDistrict,
      neighborhood: resolvedNeighborhood,
      scopeLevel: resolvedNeighborhood ? "neighborhood" : resolvedDistrict ? "district" : "city",
      locationLabel,
      requestedPlant
    })
  );
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
  let healthyIssueResolution = null;

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

  if (!filterBlocked && Array.isArray(effectiveSorted) && effectiveSorted.length >= 2) {
    healthyIssueResolution = resolveHealthyIssueConflict(effectiveSorted, {
      plant,
      source
    });
    if (healthyIssueResolution?.applied && Array.isArray(healthyIssueResolution.sorted)) {
      effectiveSorted = healthyIssueResolution.sorted;
      label = effectiveSorted[0]?.label || label;
      confidence = Number(effectiveSorted[0]?.val || confidence || 0);
      topPredictions = effectiveSorted.slice(0, 3).map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));
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

  const retrySuggestedBase =
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
  const confidenceProfile = buildConfidenceProfile({
    top1,
    top2,
    margin,
    entropy,
    uncertaintyScore,
    reliabilityScore: reliability.score,
    qualityScore: quality?.score,
    plantScore: safePlantScore,
    source,
    lowConfidence,
    uncertaintyHigh,
    ambiguityHigh: ambiguity.highRisk,
    classConflict: classConflict.healthyIssueConflict || classConflict.issueHealthyConflict,
    plantMismatch
  });
  if (healthyIssueResolution?.applied) {
    warnings.push("Healthy sonuc issue sinif catismasi nedeniyle tekrar degerlendirildi.");
  }
  if (confidenceProfile.band === "weak") {
    warnings.push("Guven profili zayif: ek cekim ve uzman kontrolu onerilir.");
  }
  if (confidenceProfile.blockers.length) {
    warnings.push(...confidenceProfile.blockers.slice(0, 2));
  }
  const warningsUnique = Array.from(new Set(warnings));
  const retrySuggested = retrySuggestedBase || confidenceProfile.band === "weak";
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
    if (confidenceProfile.band === "weak") flags.push("confidence_profile_weak");
    if (healthyIssueResolution?.applied) flags.push("healthy_issue_override");
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
  if (diagnosisStatus === "healthy" && confidenceProfile.band === "weak") {
    diagnosisStatus = "review";
  }
  if (diagnosisStatus === "issue" && confidenceProfile.band === "weak" && uncertaintyHigh) {
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
      healthyIssueResolution: healthyIssueResolution
        ? {
            applied: Boolean(healthyIssueResolution.applied),
            reason: healthyIssueResolution.reason || null,
            originalTopLabel: healthyIssueResolution.originalTopLabel || null,
            overrideLabel: healthyIssueResolution.overrideLabel || null,
            issueMass: Number(healthyIssueResolution.issueMass || 0),
            issueTop: Number(healthyIssueResolution.issueTop || 0),
            margin: Number(healthyIssueResolution.margin || 0),
            thresholds: healthyIssueResolution.thresholds || null
          }
        : null,
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
      uncertaintyHigh,
      confidenceProfileScore: confidenceProfile.score,
      confidenceProfileBand: confidenceProfile.band
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
    confidenceProfile,
    warnings: warningsUnique,
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

app.get("/api/superapp/modules", (req, res) => {
  if (!superAppRuntimeState) superAppRuntimeState = buildDefaultSuperAppRuntime();
  const items = SUPERAPP_MODULE_CATALOG.map((item) => {
    const runtime = superAppRuntimeState.modules[item.id] || {};
    return {
      id: item.id,
      title: item.title,
      status: runtime.status || "ready",
      runCount: Number(runtime.runCount || 0),
      lastRunAt: runtime.lastRunAt || null,
      lastResult: runtime.lastResult || null
    };
  });
  res.json({
    updatedAt: superAppRuntimeState.updatedAt || new Date().toISOString(),
    count: items.length,
    items
  });
});

app.get("/api/superapp/overview", (req, res) => {
  if (!superAppRuntimeState) superAppRuntimeState = buildDefaultSuperAppRuntime();
  const items = SUPERAPP_MODULE_CATALOG.map((item) => superAppRuntimeState.modules[item.id] || {});
  const active = items.filter((row) => row.lastRunAt).length;
  const idle = items.length - active;
  res.json({
    updatedAt: new Date().toISOString(),
    total: items.length,
    active,
    idle
  });
});

app.post("/api/superapp/modules/:id/run", (req, res) => {
  const id = String(req.params.id || "").trim();
  const exists = SUPERAPP_MODULE_CATALOG.some((item) => item.id === id);
  if (!exists) {
    return res.status(404).json({ ok: false, error: "module_not_found" });
  }
  if (!superAppRuntimeState) superAppRuntimeState = buildDefaultSuperAppRuntime();
  const result = runSuperAppModuleSimulation(id, req.body || {});
  const prev = superAppRuntimeState.modules[id] || { id, title: id, runCount: 0 };
  superAppRuntimeState.modules[id] = {
    ...prev,
    status: "ready",
    runCount: Number(prev.runCount || 0) + 1,
    lastRunAt: result.ranAt,
    lastResult: result
  };
  superAppRuntimeState.updatedAt = result.ranAt;
  saveSuperAppRuntimeToDisk();
  return res.json({
    ok: true,
    module: superAppRuntimeState.modules[id]
  });
});

app.post("/api/superapp/run-all", (req, res) => {
  if (!superAppRuntimeState) superAppRuntimeState = buildDefaultSuperAppRuntime();
  const out = [];
  SUPERAPP_MODULE_CATALOG.forEach((item) => {
    const result = runSuperAppModuleSimulation(item.id, req.body || {});
    const prev = superAppRuntimeState.modules[item.id] || { id: item.id, title: item.title, runCount: 0 };
    superAppRuntimeState.modules[item.id] = {
      ...prev,
      status: "ready",
      runCount: Number(prev.runCount || 0) + 1,
      lastRunAt: result.ranAt,
      lastResult: result
    };
    out.push({ id: item.id, ranAt: result.ranAt });
  });
  superAppRuntimeState.updatedAt = new Date().toISOString();
  saveSuperAppRuntimeToDisk();
  return res.json({
    ok: true,
    updatedAt: superAppRuntimeState.updatedAt,
    count: out.length,
    items: out
  });
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
loadSuperAppRuntimeFromDisk();
loadModel();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inferCache.entries()) {
    if (now - value.ts > INFER_CACHE_TTL_MS) {
      inferCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

const startApiServer = (hostCandidates) => {
  const queue = Array.isArray(hostCandidates)
    ? hostCandidates.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const seen = new Set();
  const hosts = queue.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
  if (!hosts.length) hosts.push("127.0.0.1");

  const tryListen = (idx) => {
    const host = hosts[idx];
    const server = app.listen(PORT, host, () => {
      console.log(`API server running on http://${host}:${PORT}`);
      if (idx > 0) {
        console.warn(`[api] requested host \"${HOST}\" unavailable, fallback host \"${host}\" aktif.`);
      }
    });
    server.on("error", (err) => {
      const fallbackable = (err?.code === "EPERM" || err?.code === "EACCES") && idx + 1 < hosts.length;
      if (fallbackable) {
        console.warn(
          `[api] ${host}:${PORT} icin ${err.code} alindi. ${hosts[idx + 1]} hostu deneniyor.`
        );
        tryListen(idx + 1);
        return;
      }
      console.error(`[api] listen failed on ${host}:${PORT}`, err);
      process.exit(1);
    });
  };

  tryListen(0);
};

startApiServer([HOST, "127.0.0.1"]);
