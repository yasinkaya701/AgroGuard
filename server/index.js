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
  req._timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "request_timeout" });
    }
  }, REQUEST_TIMEOUT_MS);
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
const LABELS_PATH = path.join(__dirname, "model", "labels.json");
const META_PATH = path.join(__dirname, "model", "labels_meta.json");
const PYTHON_INFER = path.join(__dirname, "python_infer.py");
const PYTHON_BIN =
  process.env.PYTHON_BIN || path.join(process.env.HOME || "", ".venv", "bin", "python");
const PT_PATH = path.join(__dirname, "model", "model.pt");
const INPUT_SIZE = Number(process.env.MODEL_INPUT_SIZE || modelMeta?.img_size || 128);
const normMean = modelMeta?.norm_mean || [0.485, 0.456, 0.406];
const normStd = modelMeta?.norm_std || [0.229, 0.224, 0.225];
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const SOILGRIDS_QUERY = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const MAX_CONCURRENT_INFER = Number(process.env.MAX_CONCURRENT_INFER || 2);
const inferQueue = [];
let activeInference = 0;
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "AgroGuard <no-reply@agroguard.local>";
const SMTP_TO = process.env.SMTP_TO || "gs7016903@gmail.com";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK === "true";

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
let labels = null;
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

const inferCache = new Map();
const INFER_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;

const CACHE_FILE = path.join(__dirname, "cache", "infer_cache.json");
const CACHE_PERSIST = process.env.CACHE_PERSIST === "true";

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

async function loadModel() {
  if (!fs.existsSync(MODEL_PATH) || !fs.existsSync(LABELS_PATH)) {
    console.warn("Model or labels not found. API will run in demo mode.");
    return;
  }
  labels = JSON.parse(fs.readFileSync(LABELS_PATH, "utf-8"));
  if (fs.existsSync(META_PATH)) {
    labelMetadata = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  }
  modelSession = await ort.InferenceSession.create(MODEL_PATH);
  console.log("ONNX model loaded.");
}

function hasPythonModel() {
  return fs.existsSync(PYTHON_INFER) && fs.existsSync(PT_PATH) && fs.existsSync(PYTHON_BIN);
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

async function preprocessFromSharp(sharpImg, size, mean, std) {
  const { data } = await sharpImg
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

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

async function inferOnnx(buffer, size, mean, std) {
  const inputData = await preprocessImage(buffer, size, mean, std);
  const tensor = new ort.Tensor("float32", inputData, [1, 3, size, size]);
  const outputs = await modelSession.run({ input: tensor });
  return Array.from(outputs.logits.data);
}

async function inferOnnxTTA(buffer, size, mean, std) {
  const original = await inferOnnx(buffer, size, mean, std);
  const flippedInput = await preprocessFromSharp(sharp(buffer).flop(), size, mean, std);
  const flippedTensor = new ort.Tensor("float32", flippedInput, [1, 3, size, size]);
  const flippedOutputs = await modelSession.run({ input: flippedTensor });
  const flipped = Array.from(flippedOutputs.logits.data);
  return original.map((val, idx) => (val + flipped[idx]) / 2);
}

async function analyzeImageQuality(buffer) {
  const size = 96;
  const { data } = await sharp(buffer)
    .resize(size, size, { fit: "inside" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

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
  const { data } = await sharp(buffer)
    .resize(size, size, { fit: "inside" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

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

function fallbackDiagnosis(buffer) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const seed = parseInt(hash.slice(0, 8), 16);
  const labelKeys = Object.keys(labelMetadata).length ? Object.keys(labelMetadata) : ["unknown"];
  const pick = labelKeys[seed % labelKeys.length];
  return { label: pick, confidence: 0.62 + (seed % 20) / 100 };
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
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const map = {
    apple: "apple",
    blueberry: "blueberry",
    cherry: "cherry",
    cherry_including_sour: "cherry",
    corn: "corn",
    maize: "corn",
    corn_maize: "corn",
    grape: "grape",
    orange: "orange",
    peach: "peach",
    pepper_bell: "pepper",
    pepper: "pepper",
    potato: "potato",
    raspberry: "raspberry",
    soybean: "soybean",
    squash: "squash",
    strawberry: "strawberry",
    tomato: "tomato"
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

function inferSeverity(label) {
  if (!label) return "low";
  return label.toLowerCase().includes("healthy") ? "low" : "medium";
}

function inferStatus(label) {
  if (!label) return "unknown";
  return label.toLowerCase().includes("healthy") ? "healthy" : "issue";
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

function parseSoilGrids(json) {
  const layers = json?.properties?.layers || [];
  const pickDepths = ["0-5cm", "5-15cm"];
  const result = {};
  layers.forEach((layer) => {
    const name = layer.name;
    const dFactor = layer?.unit_measure?.d_factor || 1;
    const depths = layer.depths || [];
    const values = depths
      .filter((d) => pickDepths.includes(d?.name))
      .map((d) => d?.values?.mean)
      .filter((v) => typeof v === "number");
    if (!values.length) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    result[name] = Number((mean / dFactor).toFixed(2));
  });
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

  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const json = await response.json();
  const parsed = parseSoilGrids(json);
  soilCache.set(key, { ts: Date.now(), value: parsed });
  return parsed;
}

async function geocodeCity(city) {
  const key = city.toLowerCase().trim();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) return cached.value;
  const url = `${OPEN_METEO_GEO}?name=${encodeURIComponent(city)}&count=1&language=tr`;
  let data = null;
  try {
    data = await fetchJsonWithRetry(url);
  } catch (err) {
    return null;
  }
  const result = data.results?.[0];
  if (!result) return null;
  const payload = {
    name: result.name,
    lat: result.latitude,
    lon: result.longitude
  };
  geoCache.set(key, { ts: Date.now(), value: payload });
  return payload;
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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/metrics", (req, res) => {
  res.json({
    status: "ok",
    uptimeSec: Math.floor((Date.now() - SERVER_START) / 1000),
    cacheSize: inferCache.size,
    queueLength: inferQueue.length,
    activeInference,
    modelLoaded: Boolean(modelSession && labels),
    modelLabels: labels?.length || 0,
    modelVersion: MODEL_VERSION,
    gitSha: GIT_SHA,
    startedAt: new Date(SERVER_START).toISOString()
  });
});

app.get("/api/plants", (req, res) => {
  if (!labels || !labels.length) {
    return res.json({ plants: [] });
  }
  const set = new Set();
  labels.forEach((label) => {
    const plant = labelToPlantId(label);
    if (plant) set.add(plant);
  });
  res.json({ plants: Array.from(set).sort() });
});

app.get("/api/plant-diseases", (req, res) => {
  const plant = (req.query.plant || "").toString();
  if (!plant || !labels || !labels.length) {
    return res.json({ plant, diseases: [], healthy: null });
  }
  const diseases = [];
  let healthy = null;
  labels.forEach((label) => {
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
  const coords = (req.query.coords || "").toString();
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const cacheKey = coords ? coords : city.toLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL_MS) {
    return res.json({ ...cached.value, source: `${cached.value.source || "cache"}-cache` });
  }

  if (!apiKey) {
    try {
      let resolved = null;
      if (lat && lon) {
        resolved = { lat, lon, name: city };
      } else {
        resolved = await geocodeCity(city);
      }
      if (!resolved) {
        return res.status(502).json({ error: "weather_geocode_failed" });
      }
      const weather = await fetchOpenMeteoWeather(resolved.lat, resolved.lon);
      if (!weather) {
        if (cached) return res.json({ ...cached.value, source: "cache" });
        return res.status(502).json({ error: "weather_fetch_failed" });
      }
      const payload = {
        city: resolved.name || city,
        coords: `${resolved.lat}, ${resolved.lon}`,
        ...weather
      };
      weatherCache.set(cacheKey, { ts: Date.now(), value: payload });
      return res.json(payload);
    } catch (err) {
      if (cached) return res.json({ ...cached.value, source: "cache" });
      return res.status(500).json({ error: "weather_exception" });
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
    if (cached) return res.json({ ...cached.value, source: "cache" });
    return res.status(500).json({ error: "weather_exception" });
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

app.get("/api/sources", (req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    sources: referenceSources.concat(marketSources)
  });
});

app.get("/api/forecast", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const coords = (req.query.coords || "").toString();
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const cacheKey = coords ? coords : city.toLowerCase();
  const cached = forecastCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FORECAST_CACHE_TTL_MS) {
    return res.json({ ...cached.value, source: `${cached.value.source || "cache"}-cache` });
  }

  if (!apiKey) {
    try {
      let resolved = null;
      if (lat && lon) {
        resolved = { lat, lon, name: city };
      } else {
        resolved = await geocodeCity(city);
      }
      if (!resolved) {
        return res.status(502).json({ error: "forecast_geocode_failed" });
      }
      const forecastData = await fetchOpenMeteoForecast(resolved.lat, resolved.lon);
      if (!forecastData) {
        if (cached) return res.json({ ...cached.value, source: "cache" });
        return res.status(502).json({ error: "forecast_fetch_failed" });
      }
      const payload = {
        city: resolved.name || city,
        coords: `${resolved.lat}, ${resolved.lon}`,
        days: forecastData.daily,
        hourly: forecastData.hourly,
        timeZone: forecastData.timeZone,
        source: "openmeteo"
      };
      forecastCache.set(cacheKey, { ts: Date.now(), value: payload });
      return res.json(payload);
    } catch (err) {
      if (cached) return res.json({ ...cached.value, source: "cache" });
      return res.status(500).json({ error: "forecast_exception" });
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
      coords: lat && lon ? `${lat}, ${lon}` : null,
      days,
      source: "openweather"
    };
    forecastCache.set(cacheKey, { ts: Date.now(), value: payload });
    return res.json(payload);
  } catch (err) {
    if (cached) return res.json({ ...cached.value, source: "cache" });
    return res.status(500).json({ error: "forecast_exception" });
  }
});

app.get("/api/market", async (req, res) => {
  const city = (req.query.city || "Bursa").toString();
  const data = await fetchMarketPrices(city);
  if (!data.items.length) {
    return res.json({ city, source: data.source || "none", items: [] });
  }
  return res.json({ city, source: data.source, items: data.items });
});



app.get("/api/soil", async (req, res) => {
  const city = (req.query.city || "Malatya").toString();
  const coords = (req.query.coords || "").toString();
  const [lat, lon] = coords.split(",").map((item) => item.trim());
  const latNum = Number(lat);
  const lonNum = Number(lon);

  if (lat && lon && !Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
    try {
      const soil = await fetchSoilGrids(latNum, lonNum);
      if (soil) {
        const texture = classifySoilTexture(soil);
        return res.json({
          city,
          coords: `${latNum}, ${lonNum}`,
          source: "soilgrids",
          soilType: texture,
          ph: soil.phh2o ?? "-",
          organic: soil.soc ?? "-",
          clay: soil.clay ?? "-",
          sand: soil.sand ?? "-",
          silt: soil.silt ?? "-",
          nitrogen: soil.nitrogen ?? "-",
          cec: soil.cec ?? "-",
          bulkDensity: soil.bdod ?? "-",
          note: "Toprak verisi SoilGrids kaynagindan cekildi."
        });
      }
    } catch (err) {
      return res.status(502).json({ error: "soil_fetch_failed" });
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

  return res.json({
    city,
    coords: lat && lon ? `${lat}, ${lon}` : null,
    source: "demo",
    ...demo
  });
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
  const plant = req.body?.plant || null;
  const strictPlant = Boolean(plant);
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
  try {
    if (modelSession && labels) {
      await runWithQueue(async () => {
        const useTTA = process.env.MODEL_TTA === "true";
        const logits = useTTA
          ? await inferOnnxTTA(optimizedBuffer, INPUT_SIZE, normMean, normStd)
          : await inferOnnx(optimizedBuffer, INPUT_SIZE, normMean, normStd);
        if (labels && logits.length && logits.length !== labels.length) {
          throw new Error(`model_output_mismatch:${logits.length}:${labels.length}`);
        }
        const probs = softmax(logits);
        rawSorted = probs
          .map((val, idx) => ({ idx, val, label: labels[idx] }))
          .sort((a, b) => b.val - a.val);
        label = rawSorted[0].label;
        confidence = rawSorted[0].val;
        topPredictions = rawSorted.slice(0, 3).map((item) => ({
          label: item.label,
          confidence: Number(item.val.toFixed(4))
        }));
      });
    } else if (hasPythonModel()) {
      const pyResult = await runPythonInference(optimizedBuffer);
      label = pyResult.label;
      confidence = pyResult.confidence;
    } else {
      const fallback = fallbackDiagnosis(optimizedBuffer);
      label = fallback.label;
      confidence = fallback.confidence;
    }
    markStage(req, "infer");
  } catch (err) {
    console.error(err);
    if (!ALLOW_FALLBACK) {
      return res.status(500).json({
        error: "model_inference_failed",
        detail: String(err?.message || err)
      });
    }
    try {
      if (hasPythonModel()) {
        const pyResult = await runPythonInference(optimizedBuffer);
        label = pyResult.label;
        confidence = pyResult.confidence;
      } else if (modelSession && labels) {
        await runWithQueue(async () => {
          const logits = await inferOnnx(optimizedBuffer, INPUT_SIZE, normMean, normStd);
          if (labels && logits.length && logits.length !== labels.length) {
            throw new Error(`model_output_mismatch:${logits.length}:${labels.length}`);
          }
          const probs = softmax(logits);
          rawSorted = probs
            .map((val, idx) => ({ idx, val, label: labels[idx] }))
            .sort((a, b) => b.val - a.val);
          label = rawSorted[0].label;
          confidence = rawSorted[0].val;
          topPredictions = rawSorted.slice(0, 3).map((item) => ({
            label: item.label,
            confidence: Number(item.val.toFixed(4))
          }));
        });
      } else {
        const fallback = fallbackDiagnosis(optimizedBuffer);
        label = fallback.label;
        confidence = fallback.confidence;
      }
    } catch (innerErr) {
      const fallback = fallbackDiagnosis(optimizedBuffer);
      label = fallback.label;
      confidence = fallback.confidence;
    }
  }

  let filteredPredictions = null;
  let filterApplied = false;
  let filterMatched = false;
  let filterBlocked = false;
  const topRawLabel = rawSorted?.[0]?.label || null;
  const suggestedPlant = labelToPlantId(topRawLabel);
  if (plant && rawSorted?.length) {
    filterApplied = true;
    filteredPredictions = rawSorted
      .filter((item) => labelToPlantId(item.label) === plant)
      .slice(0, 3)
      .map((item) => ({
        label: item.label,
        confidence: Number(item.val.toFixed(4))
      }));
    if (filteredPredictions.length) {
      filterMatched = true;
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

  const top1 = rawSorted?.[0]?.val ?? (confidence || 0);
  const top2 = rawSorted?.[1]?.val ?? 0;
  const margin = Math.max(0, top1 - top2);
  const minConfidence = Number(process.env.MODEL_MIN_CONFIDENCE || 0.45);
  const minMargin = Number(process.env.MODEL_MIN_MARGIN || 0.12);
  const plantThresholds = modelMeta?.plant_thresholds || {};
  const plantKey = plant || detectedPlant;
  const plantMinConf = plantKey && plantThresholds[plantKey]?.min_confidence;
  const plantMinMargin = plantKey && plantThresholds[plantKey]?.min_margin;
  const effectiveMinConf = typeof plantMinConf === "number" ? plantMinConf : minConfidence;
  const effectiveMinMargin = typeof plantMinMargin === "number" ? plantMinMargin : minMargin;
  const lowConfidence = top1 < minConfidence || margin < minMargin;

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

  const detectedPlant = labelToPlantId(label);
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
  if (plantCheck?.score !== undefined && plantCheck.score < 0.35) {
    warnings.push("Gorsel bitki gibi gorunmuyor. Bitkiyi kadraja al.");
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
  const retryTips = [
    "Yapragi yakin plandan cekin.",
    "Iyi isik (gunesli ama patlamayan) ortam secin.",
    "Arka plan sade olsun.",
    "Birden fazla aci deneyin."
  ];
  const reasons = explainDiagnosis(label, quality, confidence, margin);
  const decision = (() => {
    const flags = [];
    if (filterBlocked) flags.push("plant_filter_no_match");
    if (qualityGate) flags.push("low_quality");
    if (confidence !== null && confidence < effectiveMinConf) flags.push("low_confidence");
    if (margin < effectiveMinMargin) flags.push("low_margin");
    if (plantCheck?.score !== undefined && plantCheck.score < 0.25) flags.push("non_plant_suspected");
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

  const source = modelSession && labels ? "onnx" : hasPythonModel() ? "python" : "demo";
  const ttaEnabled = modelSession && labels && process.env.MODEL_TTA === "true";
  markStage(req, "postprocess");
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
      labels: labels?.length || null,
      tta: ttaEnabled,
      minConfidence: effectiveMinConf,
      minMargin: effectiveMinMargin,
      baseMinConfidence: minConfidence,
      baseMinMargin: minMargin,
      version: MODEL_VERSION,
      gitSha: GIT_SHA
    },
    modelMetrics: {
      top1: Number(top1.toFixed(4)),
      top2: Number(top2.toFixed(4)),
      margin: Number(margin.toFixed(4)),
      lowConfidence
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
      severity: disease.severity,
      summary: disease.summary,
      confidence: Math.min(0.99, Number(confidence.toFixed(2))),
      confidenceRaw: Number(confidence.toFixed(4)),
      confidencePct: Math.round(confidence * 1000) / 10,
      confidenceTier: confidenceTier(confidence || 0),
      status: inferStatus(label),
      problemArea: inferProblemArea(label)
    },
    warnings,
    retrySuggested,
    retryTips,
    reasons,
    carePlan: disease.actions,
    treatments: disease.treatments || null,
    topPredictions,
    topPredictionsDetailed,
    notes:
      source === "onnx"
        ? "Bu sonuc ONNX modelinden uretilmistir. Kesin teshis icin uzman onayi gerekir."
        : source === "python"
          ? "Bu sonuc Python modeliyle uretilmistir. Kesin teshis icin uzman onayi gerekir."
          : "Bu sonuc demo modundadir. Gercek teshis icin modeli yukleyin."
  };

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
