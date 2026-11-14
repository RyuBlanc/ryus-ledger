@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
if errorlevel 1 echo Build failed. No completed APK is being claimed.
pause
