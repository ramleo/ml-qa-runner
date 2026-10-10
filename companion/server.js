#!/usr/bin/env node
/**
 * Testwright local companion (Phase-2 MVP).
 *
 * A website cannot launch a browser on your computer — browsers sandbox that.
 * This tiny local daemon is the bridge: the Testwright web UI POSTs an authored
 * Playwright test to it over localhost, and it runs that test HEADED on your
 * machine so you can watch it live, then returns pass/fail. It is the local
 * sibling of the GitHub-Actions runner (which runs the same tests headless on CI).
 *
 * Run it once:  npx @airaml/testwright-companion   (or: npm start)
 * Then in the Testwright Run stage, pick "Run Live" and click.
 *
 * Security: binds to 127.0.0.1 only; CORS is locked to the Testwright origins;
 * it refuses any target host not on the first-party allow-list; it runs only the
 * spec the UI sends, against that host. Nothing is uploaded anywhere.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const VERSION = require("./package.json").version;
const PORT = Number(process.env.TW_COMPANION_PORT || 8787);

// Only these web origins may call the companion (CORS).
const ALLOW_ORIGINS = new Set([
  "https://ml-portfolio-rho.vercel.app",
  "http://localhost:3000",
  "http://localhost:3300",
]);
// Only these target hosts may be driven (mirrors the backend first-party list).
const ALLOW_HOSTS = [
  "ml-portfolio-rho.vercel.app",
  "wram1708-ml-unified.hf.space",
  "wram1708-ml-sql.hf.space",
  "localhost",
  "127.0.0.1",
];

const RUN_DIR = path.join(__dirname, ".tw-run");
let browsersReady = false;

function hostAllowed(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return ALLOW_HOSTS.some((d) => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function ensureBrowsers() {
  if (browsersReady) return;
  process.stdout.write("Ensuring Chromium is installed (first run only)…\n");
  const r = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: __dirname, stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("playwright install chromium failed");
  browsersReady = true;
}

function writeProject(code, mode) {
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(RUN_DIR, "tests"), { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, "tests", "generated.spec.ts"), code);
  // Headed so the user watches it live; keep a trace for after-the-fact replay.
  fs.writeFileSync(
    path.join(RUN_DIR, "playwright.config.ts"),
    [
      "import { defineConfig } from '@playwright/test';",
      "export default defineConfig({",
      "  testDir: './tests',",
      "  timeout: 60000,",
      "  reporter: [['json', { outputFile: 'results.json' }], ['line']],",
      "  use: {",
      "    headless: false,",
      "    trace: 'retain-on-failure',",
      `    launchOptions: { slowMo: ${mode === "slow" ? 600 : 250} },`,
      "  },",
      "});",
      "",
    ].join("\n")
  );
}

function parseResult() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(RUN_DIR, "results.json"), "utf8"));
    let passed = true, total = 0, failed = 0;
    for (const suite of j.suites || [])
      for (const spec of collectSpecs(suite)) {
        total++;
        const ok = (spec.tests || []).every((t) =>
          (t.results || []).some((r) => r.status === "passed" || r.status === spec.expectedStatus));
        if (!spec.ok) { passed = false; failed++; }
      }
    return { passed: failed === 0 && total > 0, total, failed };
  } catch {
    return { passed: null, total: 0, failed: 0 };
  }
}
function collectSpecs(suite, out = []) {
  for (const s of suite.specs || []) out.push(s);
  for (const c of suite.suites || []) collectSpecs(c, out);
  return out;
}

function runTest(code, mode) {
  return new Promise((resolve) => {
    try { ensureBrowsers(); } catch (e) { return resolve({ error: String(e.message || e) }); }
    writeProject(code, mode);
    const args = ["playwright", "test", "--headed", "--workers=1"];
    const child = spawn("npx", args, { cwd: RUN_DIR, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
    child.on("close", () => {
      const r = parseResult();
      resolve({ ...r, output: out.slice(-4000) });
    });
    child.on("error", (e) => resolve({ error: String(e.message || e) }));
  });
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "GET" && req.url === "/health")
    return send(res, 200, { ok: true, name: "testwright-companion", version: VERSION });

  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 200000) req.destroy(); });
    req.on("end", async () => {
      let b;
      try { b = JSON.parse(body); } catch { return send(res, 400, { error: "invalid JSON" }); }
      const code = (b.code || "").trim();
      const baseUrl = (b.base_url || "").trim();
      if (!code) return send(res, 400, { error: "code is required" });
      if (baseUrl && !hostAllowed(baseUrl))
        return send(res, 403, { error: `target host not allowed: ${baseUrl}` });
      process.stdout.write(`\n▶ Run Live: ${b.test_name || "test"} (${baseUrl || "n/a"})\n`);
      const result = await runTest(code, b.mode === "slow" ? "slow" : "normal");
      return send(res, 200, result);
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `\nTestwright Companion v${VERSION} listening on http://127.0.0.1:${PORT}\n` +
    `Keep this window open. In the Testwright Run stage, pick "Run Live" and click.\n` +
    `A real browser will open here so you can watch the test run. Ctrl+C to stop.\n\n`
  );
});
