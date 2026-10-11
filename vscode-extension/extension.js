"use strict";
/**
 * Testwright — VS Code extension.
 *
 * Runs the Playwright test in the active editor HEADED, so you watch it on your
 * machine — the IDE sibling of the GitHub-Actions runner and the local companion.
 * It writes a tiny throwaway project (config + your spec + the sample fixtures),
 * launches Chromium with a fake camera/mic stream, and runs `playwright test
 * --headed` in an integrated terminal. Upload tools work via the bundled fixtures
 * (setInputFiles('fixtures/…')); camera tools work via the fake stream.
 *
 * No marketplace account needed to try it: press F5 in this folder to launch an
 * Extension Development Host, or package with `vsce package` and install the .vsix.
 */

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const CONFIG_TS = `import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
const FX = path.resolve('fixtures');
const mediaArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (fs.existsSync(path.join(FX, 'fake-camera.y4m'))) mediaArgs.push('--use-file-for-fake-video-capture=' + path.join(FX, 'fake-camera.y4m'));
if (fs.existsSync(path.join(FX, 'fake-audio.wav'))) mediaArgs.push('--use-file-for-fake-audio-capture=' + path.join(FX, 'fake-audio.wav'));
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  reporter: [['line']],
  use: { headless: false, trace: 'retain-on-failure', launchOptions: { slowMo: 250, args: mediaArgs } },
});
`;

// A self-contained runner so we send ONE command to the terminal (no cross-shell
// chaining): it installs @playwright/test + Chromium on first run, then runs headed.
function runnerJs(pwVersion) {
  return `"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const run = (c, a) => spawnSync(c, a, { stdio: "inherit", shell: process.platform === "win32" });
if (!fs.existsSync("node_modules/@playwright/test")) {
  console.log("Testwright: installing @playwright/test@${pwVersion} (first run only)…");
  if (!fs.existsSync("package.json")) run("npm", ["init", "-y"]);
  run("npm", ["i", "-D", "@playwright/test@${pwVersion}"]);
  console.log("Testwright: installing Chromium…");
  run("npx", ["playwright", "install", "chromium"]);
}
console.log("Testwright: running the test headed — watch the browser window…");
const r = run("npx", ["playwright", "test", "--headed", "--workers=1"]);
process.exit(r.status || 0);
`;
}

function activate(context) {
  const cmd = vscode.commands.registerCommand("testwright.runHeaded", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Testwright: open a Playwright test file first.");
      return;
    }
    const doc = editor.document;
    const code = doc.getText();
    if (!/\btest\s*\(/.test(code)) {
      vscode.window.showErrorMessage("Testwright: the active file has no Playwright test().");
      return;
    }
    await doc.save().then(undefined, () => {});

    const pwVersion =
      vscode.workspace.getConfiguration("testwright").get("playwrightVersion") || "1.55.0";

    // Run workspace: a .testwright dir next to the file's workspace folder (so the
    // npm install persists between runs), else a temp dir.
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const base = wsFolder ? wsFolder.uri.fsPath : require("os").tmpdir();
    const runDir = path.join(base, ".testwright");
    try {
      fs.mkdirSync(path.join(runDir, "tests"), { recursive: true });
      fs.writeFileSync(path.join(runDir, "tests", "generated.spec.ts"), code);
      fs.writeFileSync(path.join(runDir, "playwright.config.ts"), CONFIG_TS);
      fs.writeFileSync(path.join(runDir, "tw-run.js"), runnerJs(pwVersion));
      // Copy the bundled fixtures so setInputFiles('fixtures/…') + fake-media resolve.
      const fxSrc = path.join(context.extensionPath, "fixtures");
      if (fs.existsSync(fxSrc))
        fs.cpSync(fxSrc, path.join(runDir, "fixtures"), { recursive: true });
    } catch (e) {
      vscode.window.showErrorMessage("Testwright: could not prepare the run — " + e.message);
      return;
    }

    const term = vscode.window.createTerminal({ name: "Testwright", cwd: runDir });
    term.show(true);
    term.sendText("node tw-run.js");
  });

  context.subscriptions.push(cmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
