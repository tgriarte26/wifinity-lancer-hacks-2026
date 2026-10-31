@echo off
rem Starts Orbit. Sets it up first if needed, and rebuilds only when the code changed.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto setup
if not exist "node_modules\electron\dist\electron.exe" goto setup
if not exist "dist\index.html" goto build

powershell -NoProfile -Command "$d=(Get-Item 'dist\index.html').LastWriteTime; if (Get-ChildItem src,index.html -Recurse -File | Where-Object { $_.LastWriteTime -gt $d } | Select-Object -First 1) { exit 1 } else { exit 0 }"
if errorlevel 1 goto build
goto launch

:build
call npm run build >"%TEMP%\orbit-build.log" 2>&1
if errorlevel 1 (
  start "Orbit" cmd /c "echo Orbit could not build. The details are in %TEMP%\orbit-build.log & echo Send that file to Claude, or run setup.bat. & pause"
  exit /b 1
)

:launch
start "" "node_modules\electron\dist\electron.exe" . --prod %*
exit /b 0

:setup
start "Orbit setup" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
exit /b 0
