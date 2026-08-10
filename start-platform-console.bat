@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Starting the private Optimum Platform Console...
echo Open http://localhost:4174 in your browser.
start "" http://localhost:4174
node platform-console\server.mjs
pause
