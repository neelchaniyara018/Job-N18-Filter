# daily_run.ps1 - Daily Job Search Agent PowerShell Script
# This script runs the job agent using PowerShell (no Node.js required)
# Scheduled to run at 6 PM IST daily via Windows Task Scheduler
# Rewritten to support syncing results directly to Supabase Cloud Database

$SCRIPT_DIR = "c:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent"
$LOG_DIR = "$SCRIPT_DIR\logs"
$TODAY = (Get-Date).ToString("dd-MM-yyyy")
$LOG_FILE = "$LOG_DIR\run_$($TODAY.Replace('-','_')).log"

# Create logs directory
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }

function Log($msg) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $msg"
  Write-Host $line
  Add-Content -Path $LOG_FILE -Value $line
}

function Format-Date {
    param($iso)
    try {
        $d = [datetime]::Parse($iso)
        $days = ([datetime]::Now - $d).Days
        if ($days -eq 0) { return 'Today' }
        if ($days -eq 1) { return '1 day ago' }
        if ($days -le 7) { return "$days days ago" }
        if ($days -le 14) { return '1 week ago' }
        return '2+ weeks ago'
    } catch { return 'Not mentioned' }
}

function Scrape-LinkedIn {
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()

    $keywords = @(
        'product analyst','data analyst','business analyst',
        'product manager','growth analyst','analytics engineer',
        'decision scientist','business intelligence analyst',
        'associate product manager'
    )

    $headers = @{
        'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
        'Accept'     = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        'Accept-Language' = 'en-US,en;q=0.9'
        'Referer'    = 'https://www.linkedin.com/jobs/search/'
    }

    foreach ($kw in $keywords) {
        try {
            $encoded = [Uri]::EscapeDataString($kw)
            $url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=$encoded&location=India&f_TPR=r604800&f_E=1,2&sortBy=DD&start=0"
            Log "  LinkedIn: Searching '$kw'..."

            $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            $html = $resp.Content

            # Extract job data via regex from HTML cards
            $titles    = [regex]::Matches($html, 'class="base-search-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*</h3>')
            $companies = [regex]::Matches($html, 'class="base-search-card__subtitle[^"]*"[^>]*>\s*<a[^>]*>\s*([\s\S]*?)\s*</a>')
            $locs      = [regex]::Matches($html, 'class="job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*</span>')
            $dates     = [regex]::Matches($html, 'datetime="([^"]+)"')
            $links     = [regex]::Matches($html, 'href="(https://[^"]*?linkedin\.com/jobs/view/[^"?]+)')

            $currentCount = 0
            for ($i = 0; $i -lt $titles.Count; $i++) {
                $title   = [regex]::Replace($titles[$i].Groups[1].Value, '<[^>]+>', '').Trim()
                $company = if ($companies.Count -gt $i) { [regex]::Replace($companies[$i].Groups[1].Value, '<[^>]+>', '').Trim() } else { 'Not mentioned' }
                $loc     = if ($locs.Count -gt $i) { [regex]::Replace($locs[$i].Groups[1].Value, '<[^>]+>', '').Trim() } else { 'India' }
                $link    = if ($links.Count -gt $i) { $links[$i].Groups[1].Value } else { 'https://www.linkedin.com/jobs' }
                $date    = if ($dates.Count -gt $i) { Format-Date $dates[$i].Groups[1].Value } else { 'Not mentioned' }

                if (-not $title) { continue }
                $key = "$title|$company".ToLower()
                if ($seen.Contains($key)) { continue }
                $null = $seen.Add($key)

                $jobs += @{
                    jobTitle    = $title
                    companyName = $company
                    location    = $loc
                    experience  = 'Not mentioned'
                    datePosted  = $date
                    jobUrl      = $link
                    source      = 'LinkedIn'
                }
                $currentCount++
            }

            Log "    -> Found $currentCount LinkedIn jobs (Total LinkedIn: $($jobs.Count))"
            Start-Sleep -Milliseconds 600
        } catch {
            Log "    LinkedIn error [$kw]: $_"
        }
    }

    return $jobs
}

Log "=============================="
Log "Daily Job Agent Started"
Log "Date: $TODAY"
Log "=============================="

# --- LOAD ENV VARIABLES ---
$envFile = "$SCRIPT_DIR\.env"
$supabaseUrl = ""
$supabaseKey = ""

if (Test-Path $envFile) {
  Log "Loading local environment variables..."
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $pcs = $line.Split("=", 2)
      $key = $pcs[0].Trim()
      $val = $pcs[1].Trim()
      
      # Strip quotes if present
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
      
      [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
  $supabaseUrl = [System.Environment]::GetEnvironmentVariable("SUPABASE_URL", "Process")
  $supabaseKey = [System.Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY", "Process")
}

# --- SUPABASE SYNC DIRECT SCRAPING ---
if ($supabaseUrl -and $supabaseKey) {
  Log "[OK] Supabase credentials found. Proceeding with Cloud DB Sync..."
  
  # Step 1: Run browser scraper (Chrome) to update cache for Naukri & Instahyre
  Log "[STEP 1/3] Running browser scraper for Naukri and Instahyre..."
  try {
    Push-Location $SCRIPT_DIR
    & "$SCRIPT_DIR\browser_scraper.ps1"
    Pop-Location
    Log "   Browser scraper completed."
  } catch {
    Log "[ERROR] Browser scraper failed: $_"
  }
  
  $cacheFile = "$SCRIPT_DIR\browser_cache.json"
  $scrapedJobs = @()
  
  # Step 2: Load Naukri & Instahyre from browser cache
  if (Test-Path $cacheFile) {
    Log "[STEP 2/3] Loading Naukri and Instahyre from browser cache..."
    try {
      $cache = Get-Content $cacheFile -Raw | ConvertFrom-Json
      if ($cache.naukri) {
        foreach ($j in $cache.naukri) {
          $scrapedJobs += @{
            jobTitle    = $j.jobTitle
            companyName = $j.companyName
            location    = $j.location
            experience  = $j.experience
            datePosted  = $j.datePosted
            jobUrl      = $j.jobUrl
            source      = 'Naukri'
          }
        }
        Log "   Loaded $($cache.naukri.Count) Naukri jobs from cache."
      }
      if ($cache.instahyre) {
        foreach ($j in $cache.instahyre) {
          $scrapedJobs += @{
            jobTitle    = $j.jobTitle
            companyName = $j.companyName
            location    = $j.location
            experience  = $j.experience
            datePosted  = $j.datePosted
            jobUrl      = $j.jobUrl
            source      = 'Instahyre'
          }
        }
        Log "   Loaded $($cache.instahyre.Count) Instahyre jobs from cache."
      }
    } catch {
      Log "[ERROR] Cache read failed: $_"
    }
  } else {
    Log "[WARNING] browser_cache.json not found. Skipping Naukri/Instahyre upload."
  }

  # Step 3: Scrape LinkedIn Guest API
  Log "[STEP 3/3] Scraping LinkedIn live (using residential connection)..."
  $linkedinJobs = Scrape-LinkedIn
  foreach ($j in $linkedinJobs) {
    $scrapedJobs += $j
  }
  Log "   Scraped $($linkedinJobs.Count) LinkedIn jobs."

  # Step 4: Map & Deduplicate jobs before uploading to database
  if ($scrapedJobs.Count -gt 0) {
    Log "Deduplicating and formatting $($scrapedJobs.Count) total jobs..."
    
    $uniqueJobs = @{}
    foreach ($j in $scrapedJobs) {
      $url = $j.jobUrl
      if ($url) {
        # Check title filter match (India roles only, experience 0-3 Yrs)
        $titleLower = $j.jobTitle.ToLower()
        $isMatch = $titleLower.Contains("analyst") -or $titleLower.Contains("manager")
        if ($isMatch) {
          # Map to Supabase DB schema keys
          $uniqueJobs[$url] = @{
            job_url      = $url
            job_title    = $j.jobTitle.Trim()
            company_name = $j.companyName.Trim()
            location     = $j.location.Trim()
            experience   = $j.experience.Trim()
            date_posted  = $j.datePosted.Trim()
            source       = $j.source
          }
        }
      }
    }
    
    $deduplicated = $uniqueJobs.Values | ForEach-Object { [PSCustomObject]$_ }
    Log "Cleaned down to $($deduplicated.Count) filtered jobs for database upload."
    
    # Step 5: Upload to Supabase Rest API (resolution=merge-duplicates)
    if ($deduplicated.Count -gt 0) {
      Log "Syncing to Supabase cloud database..."
      $supabaseEndpoint = "$($supabaseUrl.TrimEnd('/'))/rest/v1/jobs"
      
      $chunkSize = 100
      $upsertedCount = 0
      
      for ($i = 0; $i -lt $deduplicated.Count; $i += $chunkSize) {
        $chunk = $deduplicated[$i..([Math]::Min($i + $chunkSize - 1, $deduplicated.Count - 1))]
        
        try {
          $bodyJson = $chunk | ConvertTo-Json -Depth 10 -Compress
          
          $headers = @{
            'apikey'        = $supabaseKey
            'Authorization' = "Bearer $supabaseKey"
            'Prefer'        = 'resolution=merge-duplicates'
          }
          
          $response = Invoke-RestMethod -Method Post -Uri $supabaseEndpoint -Headers $headers -Body $bodyJson -ContentType "application/json" -TimeoutSec 30
          $upsertedCount += $chunk.Count
        } catch {
          Log "[ERROR] Supabase Chunk Upsert Failed: $_"
          if ($_.Exception.Response) {
             $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
             $errBody = $reader.ReadToEnd()
             Log "   Error Body: $errBody"
          }
        }
      }
      Log "Successfully synced $upsertedCount jobs to Supabase Cloud Database."
    }
  } else {
    Log "[INFO] No jobs found to sync."
  }
} else {
  Log "[WARNING] Supabase URL/Key not found in .env. Skipping cloud database sync."
}

# --- LEGACY BACKWARD COMPATIBILITY BEHAVIOR ---
# Run only if Supabase sync was skipped (i.e. keys not found)
if (-not ($supabaseUrl -and $supabaseKey)) {
  Log "Running local fallback checks..."

  # Open the upload dashboard in browser
  $DASHBOARD_URL = "file:///$($SCRIPT_DIR.Replace('\','/').Replace(' ','%20'))/index.html"
  Log "Opening browser dashboard..."
  try {
    $browsers = @(
      "C:\Program Files\Google\Chrome\Application\chrome.exe",
      "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
      "C:\Program Files\Mozilla Firefox\firefox.exe"
    )
    $browser = $null
    foreach ($b in $browsers) {
      if (Test-Path $b) { $browser = $b; break }
    }
    if ($browser) {
      Start-Process $browser $DASHBOARD_URL
    } else {
      Start-Process $DASHBOARD_URL
    }
  } catch {
    Log "Warning: Could not open browser dashboard."
  }

  # Check if Node.js is present
  $nodeExe = $null
  try {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
  } catch {}

  if ($nodeExe) {
    Log "Found Node.js. Running job_agent.js for Google Sheets updates..."
    try {
      Push-Location $SCRIPT_DIR
      & $nodeExe "$SCRIPT_DIR\job_agent.js" 2>&1 | ForEach-Object { Log $_ }
      Pop-Location
    } catch {
      Log "[ERROR] job_agent.js execution failed: $_"
    }
  } else {
    Log "Node.js not installed. (Google Sheets sync skipped)"
  }
} else {
  Log "Supabase sync completed successfully. Skipping local manual dashboard launch."
}

Log "=============================="
Log "Daily Job Agent Complete"
Log "=============================="
