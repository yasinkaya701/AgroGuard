#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:5051";
const root = process.cwd();
const outDir = path.join(root, "reports");
const outFile = path.join(outDir, "presentation-check.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const curlRequest = (url, timeoutMs = 8000) => {
  const timeoutSeconds = Math.max(1, Math.floor(timeoutMs / 1000));
  const proc = spawnSync(
    "curl",
    ["-sS", "-m", String(timeoutSeconds), "-w", "\n%{http_code} %{time_total}", url],
    { encoding: "utf-8" }
  );
  if (proc.status !== 0) {
    return {
      ok: false,
      status: 0,
      elapsedMs: timeoutMs,
      payload: null,
      error: String(proc.stderr || proc.stdout || "curl_failed").trim(),
    };
  }
  const output = String(proc.stdout || "");
  const lines = output.trimEnd().split("\n");
  const tail = String(lines.pop() || "0 0").trim();
  const [statusRaw, timeRaw] = tail.split(/\s+/);
  const status = Number(statusRaw || 0);
  const elapsedMs = Math.round(Number(timeRaw || 0) * 1000);
  const body = lines.join("\n");
  let payload = null;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    elapsedMs,
    payload,
    error: "",
  };
};

const curlRequestWithRetry = async (url, timeoutMs = 8000, retries = 4, waitMs = 1200) => {
  let last = null;
  for (let i = 0; i <= retries; i += 1) {
    last = curlRequest(url, timeoutMs);
    if (last.ok) return last;
    if (i < retries) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(waitMs);
    }
  }
  return last;
};

const endpointChecks = [
  { id: "health", label: "Backend health", url: `${API_BASE}/api/health` },
  { id: "metrics", label: "Model metrics", url: `${API_BASE}/api/metrics` },
  { id: "plants", label: "Plant list", url: `${API_BASE}/api/plants` },
  { id: "weather", label: "Weather", url: `${API_BASE}/api/weather?city=Malatya` },
  { id: "soil", label: "Soil", url: `${API_BASE}/api/soil?city=Malatya` },
  { id: "trade", label: "Trade dashboard", url: `${API_BASE}/api/trade/dashboard?city=Malatya&crop=domates` },
  { id: "land", label: "Land price", url: `${API_BASE}/api/land-price?city=Malatya&crop=domates` },
];

const fileChecks = [
  { id: "server-model-onnx", label: "ONNX model", file: "server/model/model.onnx" },
  { id: "server-model-labels", label: "Model labels", file: "server/model/labels.json" },
  { id: "server-model-meta", label: "Model meta", file: "server/model/model_meta.json" },
  { id: "ml-best", label: "ML best checkpoint", file: "ml/artifacts/best.pt" },
];

const waitForHealth = async (retries = 12, waitMs = 1000) => {
  return curlRequestWithRetry(`${API_BASE}/api/health`, 5000, retries, waitMs);
};

const run = async () => {
  let serverProc = null;
  let autoStartedServer = false;

  let health = await waitForHealth(2, 500);
  if (!health.ok) {
    autoStartedServer = true;
    serverProc = spawn(process.execPath, ["server/index.js"], {
      cwd: root,
      stdio: "ignore",
      detached: false,
      env: {
        ...process.env,
        HOST: process.env.HOST || "0.0.0.0",
        PORT: process.env.API_PORT || process.env.PORT || "5051",
      },
    });
    health = await waitForHealth(28, 1000);
  }

  const apiResults = [];
  for (const check of endpointChecks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await curlRequestWithRetry(check.url, 8000, 3, 800);
    apiResults.push({
      ...check,
      ...result,
      detail: result.ok ? `HTTP ${result.status}` : result.error || `HTTP ${result.status}`,
    });
  }

  const fileResults = fileChecks.map((check) => {
    const full = path.join(root, check.file);
    const ok = fs.existsSync(full);
    const sizeBytes = ok ? fs.statSync(full).size : 0;
    return {
      ...check,
      ok,
      sizeBytes,
      detail: ok ? `${Math.round(sizeBytes / 1024)} KB` : "missing",
    };
  });

  const apiPass = apiResults.filter((x) => x.ok).length;
  const filePass = fileResults.filter((x) => x.ok).length;
  const total = apiResults.length + fileResults.length;
  const pass = apiPass + filePass;
  const readiness = Math.round((pass / Math.max(1, total)) * 100);

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    summary: {
      readiness,
      pass,
      total,
      apiPass,
      apiTotal: apiResults.length,
      filePass,
      fileTotal: fileResults.length,
      decision: readiness >= 80 ? "GO" : readiness >= 60 ? "CONDITIONAL_GO" : "HOLD",
    },
    runtime: {
      autoStartedServer,
      serverHealth: health.ok ? "ok" : "unreachable",
    },
    apiChecks: apiResults,
    fileChecks: fileResults,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log(`Presentation readiness: ${report.summary.readiness}/100`);
  console.log(`Decision: ${report.summary.decision}`);
  console.log(`Report: ${path.relative(root, outFile)}`);

  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
  }
};

run();
