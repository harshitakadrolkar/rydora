@echo off
title RYDORA - keep this window open
cd /d "%~dp0"
echo ==========================================
echo   RYDORA - Intelligent Ride Matching
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed.
  echo Install the LTS version from https://nodejs.org then run this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo Node.js %%v found.
if not exist "server\node_modules" (
  echo.
  echo First run: installing packages. This takes 2-4 minutes, please wait...
  call npm install
  call npm --prefix server install
  call npm --prefix client install
)
if not exist "client\dist\index.html" (
  echo.
  echo Building the website...
  call npm --prefix client run build
)
echo.
echo Closing any older RYDORA still running on port 5000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>nul
echo.
echo Starting RYDORA... your browser will open at http://localhost:5000
echo KEEP THIS WINDOW OPEN while using the website. Close it to stop.
echo.
start "" cmd /c "timeout /t 8 >nul && start http://localhost:5000"
call npm --prefix server start
pause
