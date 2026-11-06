@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

:: If Sift.exe is present, run native executable directly
if exist "%~dp0Sift.exe" (
    start "" "%~dp0Sift.exe"
    exit /b 0
)

:: Otherwise fallback to finding Node.js
set "NODE_EXE="
if exist "%~dp0node.exe" set "NODE_EXE=%~dp0node.exe"
if exist "%~dp0bin\node.exe" set "NODE_EXE=%~dp0bin\node.exe"
if exist "%LOCALAPPDATA%\Programs\nodejs\node-v24.19.0-win-x64\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node-v24.19.0-win-x64\node.exe"
)
if not defined NODE_EXE (
    where node.exe >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%i in ('where node.exe') do (
            if not defined NODE_EXE set "NODE_EXE=%%i"
        )
    )
)

if not defined NODE_EXE (
    echo [Sift] Node.js not found. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

start "" "%NODE_EXE%" native-host\sift-desktop-host.mjs --no-window
timeout /t 1 /nobreak >nul 2>&1

set "APP_URL=http://127.0.0.1:14205"
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1200,820 --no-first-run
    exit /b 0
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1200,820 --no-first-run
    exit /b 0
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --window-size=1200,820 --no-first-run
    exit /b 0
)
start "" "%APP_URL%"
exit /b 0
