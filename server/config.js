/**
 * Central config for AgroGuard API server.
 * All env-based values and constants in one place.
 */
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5001);
const NODE_ENV = process.env.NODE_ENV || "development";
const API_VERSION = process.env.API_VERSION || "2026.02.15";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 25000);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

const ROOT_DIR = path.join(__dirname);
const MODEL_DIR = path.join(ROOT_DIR, "model");
const DATA_DIR = path.join(ROOT_DIR, "data");

const MODEL_PATH = path.join(MODEL_DIR, "model.onnx");
const LABELS_PATH = path.join(MODEL_DIR, "labels.json");
const META_PATH = path.join(MODEL_DIR, "labels_meta.json");
const MODEL_META_PATH = path.join(MODEL_DIR, "model_meta.json");

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEO = "https://geocoding-api.open-meteo.com/v1/search";
const SOILGRIDS_QUERY = "https://rest.isric.org/soilgrids/v2.0/properties/query";

const LOG_TO_FILE = process.env.LOG_TO_FILE === "true";
const LOG_FILE = process.env.LOG_FILE || path.join(ROOT_DIR, "logs", "server.log");
const LOG_JSON = process.env.LOG_JSON === "true";

module.exports = {
  HOST,
  PORT,
  NODE_ENV,
  API_VERSION,
  REQUEST_TIMEOUT_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  ROOT_DIR,
  MODEL_DIR,
  DATA_DIR,
  MODEL_PATH,
  LABELS_PATH,
  META_PATH,
  MODEL_META_PATH,
  OPEN_METEO_FORECAST,
  OPEN_METEO_GEO,
  SOILGRIDS_QUERY,
  LOG_TO_FILE,
  LOG_FILE,
  LOG_JSON
};
