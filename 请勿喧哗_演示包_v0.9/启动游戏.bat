@echo off
chcp 65001 >nul
title Qing Wu Xuan Hua - Launcher (Real Camera)
cd /d "%~dp0"

echo.
echo  ==============================================
echo    Qing Wu Xuan Hua - one-click start
echo    Mode: REAL camera gesture recognition
echo  ==============================================
echo.

rem ---- 1. Clean up any leftover old server process on port 8765 ----
rem Windows allows several processes to bind the same port; an old
rem SIM_ONLY server would silently steal requests and hide the camera module.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
  echo  [cleanup] Old server on port 8765 found, PID=%%p, stopping it...
  taskkill /f /pid %%p >nul 2>&1
)

rem ---- 2. Open the browser automatically a moment after the server is up ----
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8765'"

rem ---- 3. Start the server (closing this window = exiting the game) ----
echo.
echo  Starting the server, the browser will open automatically...
echo  The page will ask for camera permission: click the consent button.
echo  Close this window to fully exit the game.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_windows.ps1"

echo.
echo  Server stopped. Press any key to close this window...
pause >nul
