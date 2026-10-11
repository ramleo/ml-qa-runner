@echo off
REM Testwright Companion - Windows double-click launcher (zero typing).
REM
REM How to use: double-click this file. It starts the companion; keep the window
REM open and go back to the Testwright Run stage, pick "Run Live" and click.
REM First run downloads the companion + a browser (once); later runs are instant.
REM
REM Requires Node.js (https://nodejs.org). If you see "'npx' is not recognized",
REM install Node first, then double-click this again.
title Testwright Companion
echo Starting Testwright Companion... (first run sets things up, please wait)
echo.
call npx -y @airaml/testwright-companion@latest
echo.
echo Companion stopped. Press any key to close.
pause >nul
