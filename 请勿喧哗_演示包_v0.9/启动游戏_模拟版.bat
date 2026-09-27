@echo off
chcp 65001 >nul
title Qing Wu Xuan Hua - Launcher (Simulated Demo)
cd /d "%~dp0"

echo.
echo  ==============================================
echo    Qing Wu Xuan Hua - one-click start
echo    Mode: SIMULATED demo, no camera needed
echo  ==============================================
echo.

rem ---- 1. Clean up any leftover old server process on port 8765 ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
  echo  [cleanup] Old server on port 8765 found, PID=%%p, stopping it...
  taskkill /f /pid %%p >nul 2>&1
)

rem ---- 2. Open the browser automatically a moment after the server is up ----
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8765'"

rem ---- 3. Start the simulated server (closing this window = exiting the game) ----
echo.
echo  Starting the simulated server, the browser will open automatically...
echo  This mode needs no camera; use the test panel to simulate gestures.
echo  Close this window to fully exit the game.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_sim_windows.ps1"

echo.
echo  Server stopped. Press any key to close this window...
pause >nul
