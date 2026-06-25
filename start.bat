@echo off
title Job Search Agent
color 0B

echo.
echo  ╔════════════════════════════════════════╗
echo  ║   🎯 Job Search Agent — Starting      ║
echo  ╚════════════════════════════════════════╝
echo.
echo  Starting PowerShell scraping server...
echo  (No Node.js needed — uses built-in PowerShell)
echo.

cd /d "%~dp0"

:: Open browser after short delay
start "" /B cmd /c "timeout /t 2 /nobreak >nul && start chrome job_search_ui.html"

:: Start PowerShell server (stays open)
powershell -ExecutionPolicy Bypass -NoProfile -File server.ps1

pause
