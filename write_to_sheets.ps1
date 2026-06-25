# write_to_sheets.ps1 — PowerShell script to write jobs to Google Sheets
# This uses the Google Sheets API with a Service Account
# 
# PREREQUISITES:
# 1. Create a Google Service Account (see SETUP_GUIDE.md)
# 2. Download the JSON key to credentials/service_account.json
# 3. Share the Google Sheet with the service account email

param(
    [string]$JobsFile = ".\scraped_jobs_master.json",
    [string]$AppsScriptUrl = $env:APPS_SCRIPT_URL
)

$SPREADSHEET_ID = "11jsmc9ctRpoOj0BEwhAA2JTQy46lI5yArINDdjSVhig"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Daily Job Agent — Sheet Uploader" -ForegroundColor Cyan  
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Get today's date
$today = (Get-Date).ToString("dd-MM-yyyy")

# Load jobs file
if (-not (Test-Path $JobsFile)) {
    Write-Host "ERROR: Jobs file not found: $JobsFile" -ForegroundColor Red
    exit 1
}

$jobs = Get-Content $JobsFile -Raw | ConvertFrom-Json
Write-Host "Loaded $($jobs.Count) jobs from: $JobsFile" -ForegroundColor Green

# Add today's date to all jobs
foreach ($job in $jobs) {
    if (-not $job.dateAdded) {
        $job | Add-Member -NotePropertyName dateAdded -NotePropertyValue $today -Force
    }
}

# Method 1: Upload via Google Apps Script Web App
if ($AppsScriptUrl) {
    Write-Host ""
    Write-Host "Uploading via Google Apps Script Web App..." -ForegroundColor Yellow
    
    $body = @{
        jobs = $jobs
    } | ConvertTo-Json -Depth 5
    
    try {
        $response = Invoke-RestMethod -Uri $AppsScriptUrl -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Host "SUCCESS! Added $($response.added) new jobs!" -ForegroundColor Green
        Write-Host "Total jobs in sheet: $($response.total)" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR uploading: $($_.Exception.Message)" -ForegroundColor Red
    }
}
# Method 2: Use service account credentials
elseif (Test-Path "$SCRIPT_DIR\credentials\service_account.json") {
    Write-Host ""
    Write-Host "Uploading via Google Service Account..." -ForegroundColor Yellow
    Write-Host "INFO: Service account path found. Using Node.js uploader..." -ForegroundColor Cyan
    
    # Try to find Node.js
    $nodePaths = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        "$env:APPDATA\nvm\current\node.exe"
    )
    
    $nodeExe = $null
    foreach ($p in $nodePaths) {
        if (Test-Path $p) { $nodeExe = $p; break }
    }
    
    if ($nodeExe) {
        Write-Host "Found Node.js at: $nodeExe" -ForegroundColor Green
        & $nodeExe "$SCRIPT_DIR\upload_to_sheets.js" $JobsFile
    }
    else {
        Write-Host "Node.js not found. Please install it from: https://nodejs.org/" -ForegroundColor Red
        Write-Host "Or set APPS_SCRIPT_URL after deploying the Google Apps Script." -ForegroundColor Yellow
    }
}
else {
    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Yellow
    Write-Host "  SETUP REQUIRED" -ForegroundColor Yellow
    Write-Host "=======================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To write jobs to your Google Sheet, you need to do ONE of:" -ForegroundColor White
    Write-Host ""
    Write-Host "OPTION A (Easiest): Deploy Google Apps Script" -ForegroundColor Cyan
    Write-Host "  1. Go to https://script.google.com/" -ForegroundColor White
    Write-Host "  2. Create new project" -ForegroundColor White
    Write-Host "  3. Copy contents of google_apps_script.gs" -ForegroundColor White
    Write-Host "  4. Click Deploy > New Deployment > Web App" -ForegroundColor White
    Write-Host "  5. Set 'Who has access' to 'Anyone'" -ForegroundColor White
    Write-Host "  6. Copy the Web App URL" -ForegroundColor White
    Write-Host "  7. Run: `$env:APPS_SCRIPT_URL = 'YOUR_URL'; .\write_to_sheets.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "OPTION B: Google Service Account (see SETUP_GUIDE.md)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Meanwhile, here's a summary of collected jobs:" -ForegroundColor Green
    $sources = @{}
    foreach ($job in $jobs) {
        $src = $job.source
        if (-not $sources[$src]) { $sources[$src] = 0 }
        $sources[$src]++
    }
    $sources.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value) jobs" -ForegroundColor White }
    Write-Host "  TOTAL: $($jobs.Count) jobs" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
