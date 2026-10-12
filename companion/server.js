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
const os = require("os");
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

// The run dir MUST live outside any node_modules tree: Node (>=22) refuses to
// strip TypeScript types for .ts files under node_modules
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and when installed via npx this
// package sits inside node_modules — so writing the throwaway config/spec next to
// it made Playwright's config load crash. The OS temp dir is always outside it.
const RUN_DIR = path.join(os.tmpdir(), "testwright-run");

// Resolve the real node_modules root (where @playwright/test actually lives) and
// the Playwright CLI inside it. npx hoists deps to a sibling node_modules, not
// into the package dir, so we locate it via require.resolve rather than __dirname.
const PW_ENTRY = require.resolve("@playwright/test");
const _NM_MARK = path.sep + "node_modules" + path.sep;
const NM_ROOT = PW_ENTRY.slice(0, PW_ENTRY.lastIndexOf(_NM_MARK) + _NM_MARK.length - 1);
const PW_BIN = path.join(NM_ROOT, ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright");

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
  const r = spawnSync(PW_BIN, ["install", "chromium"], {
    cwd: __dirname, stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("playwright install chromium failed");
  browsersReady = true;
}

function writeProject(code, mode) {
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(RUN_DIR, "tests"), { recursive: true });
  // Link the real node_modules in so `import { defineConfig } from '@playwright/test'`
  // (and the spec's imports) resolve from the temp dir. The dir itself is NOT under a
  // node_modules path, so Node's TS type-stripping is allowed here (unlike the old
  // in-package location). Fall back to a copy if the platform disallows symlinks.
  const nmLink = path.join(RUN_DIR, "node_modules");
  try {
    fs.symlinkSync(NM_ROOT, nmLink, "junction");
  } catch {
    try { fs.cpSync(NM_ROOT, nmLink, { recursive: true }); } catch { /* best effort */ }
  }
  // In slow mode, hold the final frame a few seconds after the test so a short run
  // doesn't vanish before you can see it (slowMo only paces the steps, not the end).
  const spec = mode === "slow"
    ? code + "\ntest.afterEach(async ({ page }) => { await page.waitForTimeout(3500); });\n"
    : code;
  fs.writeFileSync(path.join(RUN_DIR, "tests", "generated.spec.ts"), spec);
  // Copy the sample fixtures next to the spec so a file-upload tool's
  // setInputFiles('fixtures/…') and the camera/mic fake-media file flags below
  // resolve (cwd is RUN_DIR when the test runs). No-op if none are shipped.
  const fxSrc = path.join(__dirname, "fixtures");
  if (fs.existsSync(fxSrc))
    fs.cpSync(fxSrc, path.join(RUN_DIR, "fixtures"), { recursive: true });
  // Headed so the user watches it live; keep a trace for after-the-fact replay.
  // Same synthetic camera/mic stream as CI so upload/camera tools run here too.
  fs.writeFileSync(
    path.join(RUN_DIR, "playwright.config.ts"),
    [
      "import { defineConfig } from '@playwright/test';",
      "import path from 'node:path';",
      "import fs from 'node:fs';",
      "const FX = path.resolve('fixtures');",
      "const mediaArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];",
      "if (fs.existsSync(path.join(FX, 'fake-camera.y4m'))) mediaArgs.push('--use-file-for-fake-video-capture=' + path.join(FX, 'fake-camera.y4m'));",
      "if (fs.existsSync(path.join(FX, 'fake-audio.wav'))) mediaArgs.push('--use-file-for-fake-audio-capture=' + path.join(FX, 'fake-audio.wav'));",
      "export default defineConfig({",
      "  testDir: './tests',",
      "  timeout: 60000,",
      "  reporter: [['json', { outputFile: 'results.json' }], ['line']],",
      "  use: {",
      "    headless: false,",
      "    trace: 'retain-on-failure',",
      `    launchOptions: { slowMo: ${mode === "slow" ? 1500 : 250}, args: mediaArgs },`,
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
    const args = ["test", "--headed", "--workers=1"];
    const child = spawn(PW_BIN, args, { cwd: RUN_DIR, env: process.env });
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
