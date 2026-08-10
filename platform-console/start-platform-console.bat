@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is required. Install Node.js 20 or newer.
  pause
  exit /b 1
)
node server.mjs
pause
