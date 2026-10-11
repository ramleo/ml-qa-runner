#!/bin/bash
# Testwright Companion — Linux launcher (zero typing).
#
# How to use: make it executable once (chmod +x start-testwright-companion.sh),
# then double-click it (or run ./start-testwright-companion.sh). It starts the
# companion; keep the window open, go to the Testwright Run stage, pick "Run Live".
# First run downloads the companion + a browser (once); later runs are instant.
#
# Requires Node.js (https://nodejs.org). If you see "command not found: npx",
# install Node first, then run this again.
cd "$(dirname "$0")" || exit 1
echo "Starting Testwright Companion… (first run sets things up, please wait)"
echo
exec npx -y @airaml/testwright-companion@latest
