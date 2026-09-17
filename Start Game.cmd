@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NBA After Hours
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer, then run this launcher again.
  pause
  exit /b 1
)
if not exist dist\index.html (
  if not exist node_modules call npm install
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server.mjs --open
pause
