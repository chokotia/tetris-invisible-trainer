@echo off
cd /d "%~dp0"
start python3 -m http.server 8081
timeout /t 1 /nobreak >nul
start chrome --incognito http://localhost:8081/
