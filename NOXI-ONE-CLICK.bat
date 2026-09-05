@echo off
setlocal
cd /d "%~dp0"
title NOXI one-click setup

echo.
echo   NOXI

echo [1/3] Checking setup...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet.
  echo Opening the official Node.js download page.
  start "" "https://nodejs.org/en/download"
  echo Install the LTS version, then double-click this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [2/3] First-time setup...
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\setup.ps1"
  if errorlevel 1 goto :failed
) else (
  echo [2/3] Existing private setup found.
  if not exist "node_modules" (
    call npm install
    if errorlevel 1 goto :failed
  )
)

echo [3/3] Starting NOXI...
start "NOXI" cmd /k "cd /d "%~dp0" && npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo NOXI should now be open in your browser.
echo You can close this window.
exit /b 0

:failed
echo.
echo Setup stopped because something failed. Leave this window open so the error can be read.
pause
exit /b 1
