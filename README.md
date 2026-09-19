# ml-qa-runner

Isolated test-execution runner for **Testwright** — the QA-automation platform in
[AIRaML](https://ml-portfolio-rho.vercel.app). This repo exists only to run
generated Playwright tests on ephemeral GitHub-hosted runners, fully isolated
from the live site and the API.

## How it works

The Testwright `/qa/run` proxy (in the ML-Unified API) dispatches the
[`qa-run`](.github/workflows/qa-run.yml) workflow with the generated test as an
input and a `correlation_id`. The workflow installs Playwright + Chromium, runs
the test single-worker under a bounded config, and uploads `results.json` plus
screenshot / video / trace artifacts. The proxy polls the run by name, reads its
pass/fail conclusion, and downloads the artifacts to return to the UI.

Nothing here holds secrets: the user-supplied test code is passed via an env var
(never interpolated into the shell) and the job runs with `contents: read` only.

Part of the Testwright Phase 2 plan (`docs/QA_PHASE2_RUN_PLAN.md` in ML-Unified).
