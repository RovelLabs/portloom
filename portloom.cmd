@echo off
setlocal
cd /d "%~dp0"

if exist "node_modules" (
  node "%~dp0bin\portloom.js" %*
) else (
  echo [Portloom] Installing dependencies for first launch...
  call npm install --production
  node "%~dp0bin\portloom.js" %*
)
