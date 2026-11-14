@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare.ps1"
if errorlevel 1 echo Preparation failed. Read the error above.
pause
