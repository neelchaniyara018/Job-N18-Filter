@echo off
title Browser Scraper - Naukri & Instahyre
color 0E

echo.
echo  ╔════════════════════════════════════════════════╗
echo  ║  🌐 Browser Scraper for Naukri & Instahyre     ║
echo  ║  This fetches fresh jobs using real Chrome     ║
echo  ╚════════════════════════════════════════════════╝
echo.
echo  This will:
echo  1. Open Chrome temporarily (you'll see it)
echo  2. Navigate to Naukri and Instahyre
echo  3. Extract all job listings automatically
echo  4. Save results to browser_cache.json
echo  5. Close Chrome when done
echo.
echo  Takes about 3-5 minutes. Please wait...
echo.

cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -NoProfile -File browser_scraper.ps1

echo.
echo  ✅ Done! Now run start.bat to start the main server
echo     and refresh your job_search_ui.html page.
echo.
pause
