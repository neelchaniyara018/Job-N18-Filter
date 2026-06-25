@echo off
echo ====================================
echo   Daily Job Search Agent
echo   Running at %DATE% %TIME%
echo ====================================

cd /d "c:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent"

:: Log the run
echo [%DATE% %TIME%] Job Agent Started >> logs\scheduler.log

:: Run the agent
powershell -ExecutionPolicy Bypass -File daily_run.ps1 >> logs\latest_run.log 2>&1

:: Log completion
echo [%DATE% %TIME%] Job Agent Completed >> logs\scheduler.log

echo Done! Check logs\latest_run.log for details.
