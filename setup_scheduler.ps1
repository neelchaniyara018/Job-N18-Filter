# setup_scheduler.ps1 — Automated Task Scheduler Setup for Daily Job Agent
# Run this script as Administrator to set up the daily 6 PM IST schedule

$taskName = "DailyJobAgent"
$agentDir = "c:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent"
$batchFile = "$agentDir\run_agent.bat"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Daily Job Agent — Scheduler Setup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "❌ Please run this script as Administrator!" -ForegroundColor Red
    Write-Host "   Right-click PowerShell → 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if task already exists
$existing = schtasks /query /tn $taskName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "⚠️  Task '$taskName' already exists. Removing it first..." -ForegroundColor Yellow
    schtasks /delete /tn $taskName /f | Out-Null
}

# Create the scheduled task
# 6 PM IST = 18:00 local time (assuming system is set to IST)
Write-Host "📅 Creating scheduled task '$taskName'..." -ForegroundColor Green
Write-Host "   • Schedule: Daily at 6:00 PM IST (18:00)" -ForegroundColor White
Write-Host "   • Action: $batchFile" -ForegroundColor White
Write-Host ""

$result = schtasks /create `
    /tn $taskName `
    /tr "`"$batchFile`"" `
    /sc daily `
    /st 18:00 `
    /rl HIGHEST `
    /f 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Task '$taskName' created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Task details:" -ForegroundColor Cyan
    schtasks /query /tn $taskName /fo LIST
} else {
    Write-Host "❌ Failed to create task: $result" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The agent will run automatically every day at 6:00 PM IST." -ForegroundColor White
Write-Host ""
Write-Host "To run it NOW manually:" -ForegroundColor Yellow
Write-Host "  schtasks /run /tn `"$taskName`"" -ForegroundColor White
Write-Host ""
Write-Host "To check last run status:" -ForegroundColor Yellow
Write-Host "  schtasks /query /tn `"$taskName`" /fo LIST /v" -ForegroundColor White
Write-Host ""
Write-Host "To view run logs:" -ForegroundColor Yellow
Write-Host "  notepad `"$agentDir\logs\latest_run.log`"" -ForegroundColor White
Write-Host ""
