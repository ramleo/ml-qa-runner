# Testwright Companion

Run a Testwright-authored Playwright test **on your own machine, headed, so you can
watch it live** — the local sibling of the GitHub-Actions runner (which runs the same
tests headless on CI).

A website can't launch a browser on your computer (browsers sandbox that), so this
tiny local daemon is the bridge: the Testwright web UI sends an authored test to it
over `localhost`, and it opens a real browser here and runs the test in front of you.

## Use

```bash
# one-time (and whenever you want to watch):
npx @airaml/testwright-companion
# or, from this folder:
npm install && npm start
```

Leave it running, then in the Testwright **Run** stage pick **Run Live** and click.
A browser window opens on your machine and runs the test; pass/fail comes back to the
web UI. First run downloads Chromium (~once).

## Endpoints (localhost only)

- `GET /health` → `{ ok, name, version }` — the UI pings this to detect the companion.
- `POST /run` `{ code, base_url, test_name, mode }` → runs it headed, returns
  `{ passed, total, failed, output }`.

## Security

- Binds to `127.0.0.1` only.
- CORS locked to the Testwright web origins.
- Refuses any target host not on the first-party allow-list.
- Runs only the spec the UI sends, against that host. Nothing is uploaded anywhere.

Config: `TW_COMPANION_PORT` (default `8787`).
