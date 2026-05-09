@echo off
cd /d "%~dp0"

echo Starting server with Hot Reload (browser-sync)...
echo Files will automatically reload on save.

REM Run browser-sync:
REM --server: Current directory
REM --files: Watch all files
REM --port: 8081
REM --browser: Chrome Incognito
npx --yes browser-sync start --server --files "**/*" --port 8081 --browser "chrome" --arguments "--incognito"

pause
