# Testwright (VS Code)

Run a Testwright-authored Playwright test **headed, from your editor** — the IDE
sibling of the GitHub-Actions runner and the local companion. Open the test, click
▶ **Testwright: Run this test (headed)**, and a real browser opens on your machine so
you can watch it.

Upload and camera tools work too: the extension ships small sample **fixtures** and
launches Chromium with a **fake camera/mic stream**, exactly like CI — so a test can
`setInputFiles('fixtures/…')` or click a capture control and still run.

## Use

1. Open a Playwright test file (`*.spec.ts` / `*.test.ts`) authored in Testwright.
2. Run **Testwright: Run this test (headed)** — from the editor-title ▶ button or the
   Command Palette.
3. First run installs `@playwright/test` + Chromium into a `.testwright/` folder next
   to your project (once); later runs are instant. Watch the browser, read pass/fail
   in the integrated terminal.

Requires [Node.js](https://nodejs.org).

## Settings

- `testwright.playwrightVersion` — `@playwright/test` version to install in the run
  workspace (default `1.55.0`, matched to the CI runner).

## Try it without publishing

- Press **F5** in this folder to launch an Extension Development Host, or
- `npx @vscode/vsce package` → install the generated `.vsix`
  (**Extensions ▸ … ▸ Install from VSIX**).

## How it works

On run it writes a throwaway project to `.testwright/` (a `playwright.config.ts` with
the fake-media launch args, your spec under `tests/`, and the bundled `fixtures/`),
then runs `playwright test --headed` in an integrated terminal. Nothing is uploaded
anywhere; the browser and the run are entirely local.
