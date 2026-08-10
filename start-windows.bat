@echo off
setlocal

echo Checking for Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is not installed.
  echo Download and install it from: https://nodejs.org/
  pause
  exit /b 1
)

echo Installing dependencies...
call npm ci
if %errorlevel% neq 0 (
  echo npm ci failed.
  pause
  exit /b 1
)

echo.
echo Starting Shy Webpage...
echo Open this URL in your browser: http://localhost:5173
echo Press Ctrl+C to stop the server.
echo.

call npm run dev
