@echo off
REM 雙擊或在 cmd 執行：會呼叫 PowerShell 啟動腳本
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
pause
