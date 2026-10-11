#!/bin/bash
# Testwright Companion — macOS double-click launcher (zero typing).
#
# How to use: double-click this file. It starts the companion; keep the window
# open and go back to the Testwright Run stage, pick "Run Live" and click.
# First run downloads the companion + a browser (once); later runs are instant.
#
# Requires Node.js (https://nodejs.org). If you see "command not found: npx",
# install Node first, then double-click this again.
cd "$(dirname "$0")" || exit 1
clear
echo "Starting Testwright Companion… (first run sets things up, please wait)"
echo
exec npx -y @airaml/testwright-companion@latest
