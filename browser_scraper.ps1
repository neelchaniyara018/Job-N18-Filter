# ═══════════════════════════════════════════════════════════════════════
# Browser Scraper — Uses Chrome DevTools Protocol to scrape Naukri & Instahyre
# Run this with: powershell -ExecutionPolicy Bypass -File browser_scraper.ps1
# This script launches Chrome with remote debugging, scrapes jobs, and saves
# results to browser_cache.json for use by server.ps1
# ═══════════════════════════════════════════════════════════════════════

$CACHE_FILE = Join-Path $PSScriptRoot "browser_cache.json"
$CDP_PORT = 9222
$CHROME_PATH = ""

# Find Chrome installation
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)
foreach ($p in $chromePaths) {
    if (Test-Path $p) { $CHROME_PATH = $p; break }
}

if (-not $CHROME_PATH) {
    Write-Host "Chrome not found! Please install Google Chrome." -ForegroundColor Red
    exit 1
}

Write-Host "Chrome found: $CHROME_PATH" -ForegroundColor Green

# ── HELPER: Send CDP Command ──────────────────────────────────────────────
function Send-CDP {
    param(
        [string]$WsUrl,
        [string]$Method,
        [hashtable]$Params = @{},
        [int]$TimeoutSec = 35
    )
    
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource($TimeoutSec * 1000)
    
    try {
        $ws.ConnectAsync([System.Uri]$WsUrl, $cts.Token).Wait($cts.Token)
        
        $id = Get-Random -Minimum 1 -Maximum 99999
        $msg = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait($cts.Token)
        
        # Read response (may need to read multiple frames)
        $buffer = New-Object byte[] 262144  # 256KB buffer
        $result = New-Object System.Text.StringBuilder
        $deadline = [datetime]::Now.AddSeconds($TimeoutSec)
        
        do {
            if ([datetime]::Now -gt $deadline) { break }
            $recv = $ws.ReceiveAsync([System.ArraySegment[byte]]::new($buffer), $cts.Token).Result
            $chunk = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $recv.Count)
            $result.Append($chunk) | Out-Null
            
            if ($recv.EndOfMessage) { break }
        } while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open)
        
        $jsonStr = $result.ToString()
        if ($jsonStr -and $jsonStr.StartsWith('{')) {
            return $jsonStr | ConvertFrom-Json
        }
        return $null
    } catch {
        Write-Host "      CDP Error ($Method): $_" -ForegroundColor DarkRed
        return $null
    } finally {
        try { $ws.Dispose() } catch {}
    }
}

# ── HELPER: Execute JS in tab ────────────────────────────────────────────
function Invoke-ChromeJS {
    param([string]$TabWsUrl, [string]$Script, [int]$TimeoutSec = 35)
    
    $response = Send-CDP -WsUrl $TabWsUrl -Method "Runtime.evaluate" -Params @{
        expression = $Script
        returnByValue = $true
        awaitPromise = $false
    } -TimeoutSec $TimeoutSec
    
    if ($response -and $response.result -and $response.result.result) {
        return $response.result.result.value
    }
    return $null
}

# ── HELPER: Navigate and wait for network idle ─────────────────────────────
function Navigate-And-Wait {
    param([string]$TabWsUrl, [string]$Url, [int]$WaitSec = 8)
    
    # Create a new WebSocket just for navigation
    Send-CDP -WsUrl $TabWsUrl -Method "Page.navigate" -Params @{ url = $Url } | Out-Null
    
    Write-Host "      Waiting $WaitSec seconds for page to load..." -ForegroundColor DarkGray
    Start-Sleep -Seconds $WaitSec
    
    # Verify page loaded
    $title = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script "document.title"
    Write-Host "      Page title: $title" -ForegroundColor DarkGray
}

# ── HELPER: Open new tab ──────────────────────────────────────────────────
function New-ChromeTab {
    param([int]$Port)
    
    # Use CDP to open new tab
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/json/new" -UseBasicParsing -Method PUT
        $tab = $resp.Content | ConvertFrom-Json
        return $tab.webSocketDebuggerUrl
    } catch {
        return $null
    }
}

# ── SCRAPER: NAUKRI via Browser ───────────────────────────────────────────
function Scrape-Naukri-Browser {
    param([string]$TabWsUrl)
    Write-Host "DEBUG: Entered Scrape-Naukri-Browser" -ForegroundColor Magenta
    try {
        $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    
    $urls = @(
        "https://www.naukri.com/product-analyst-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/data-analyst-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/business-analyst-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/product-manager-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/growth-analyst-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/analytics-engineer-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/associate-product-manager-jobs?experience=0&experience=1&experience=2&experience=3",
        "https://www.naukri.com/business-intelligence-analyst-jobs?experience=0&experience=1&experience=2&experience=3"
    )
    
    $extractScript = @'
(function() {
    try {
        const cards = document.querySelectorAll('.srp-jobtuple-wrapper');
        if (cards.length === 0) {
            // Try alternative selectors
            const alt = document.querySelectorAll('article[class*="jobTuple"], .jobTupleHeader');
            if (alt.length === 0) return JSON.stringify({error: 'no cards', count: 0, jobs: []});
        }
        const jobs = [];
        cards.forEach(card => {
            const titleEl = card.querySelector('a.title, a[href*="job-listings"]');
            const title = titleEl ? (titleEl.getAttribute('title') || titleEl.innerText || '').trim() : '';
            const href = titleEl ? titleEl.href : '';
            const company = (card.querySelector('.comp-name') || {innerText:''}).innerText.trim() || 'Not mentioned';
            const location = (card.querySelector('.loc-wrap') || {innerText:''}).innerText.trim() || 'India';
            const exp = (card.querySelector('.exp-wrap') || {innerText:''}).innerText.trim() || 'Not mentioned';
            const date = (card.querySelector('.job-post-day') || {innerText:''}).innerText.trim() || 'Not mentioned';
            if (title && href) {
                jobs.push({
                    jobTitle: title,
                    companyName: company,
                    location: location,
                    experience: exp,
                    datePosted: date,
                    jobUrl: href,
                    source: 'Naukri'
                });
            }
        });
        return JSON.stringify({count: jobs.length, jobs: jobs});
    } catch(e) {
        return JSON.stringify({error: e.message, count: 0, jobs: []});
    }
})();
'@
    
    # First visit Naukri homepage to warm up cookies
    Write-Host "  Warming up Naukri homepage..." -ForegroundColor Gray
    Navigate-And-Wait -TabWsUrl $TabWsUrl -Url "https://www.naukri.com/" -WaitSec 5
    
    foreach ($url in $urls) {
        try {
            Write-Host "  Naukri: $($url.Split('/')[-1].Split('?')[0])" -ForegroundColor Gray
            Navigate-And-Wait -TabWsUrl $TabWsUrl -Url $url -WaitSec 10
            
            # Check if page is loaded properly
            $checkResult = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script '(function(){return JSON.stringify({title:document.title,hasCards:document.querySelectorAll(".srp-jobtuple-wrapper").length,bodyLen:document.body.innerHTML.length});})()'
            if ($checkResult) {
                $check = $checkResult | ConvertFrom-Json
                Write-Host "      Page check: title='$($check.title.Substring(0,[Math]::Min(40,$check.title.Length)))' cards=$($check.hasCards) bodyLen=$($check.bodyLen)" -ForegroundColor DarkGray
                
                # If no cards, wait more
                if ($check.hasCards -eq 0) {
                    Write-Host "      No cards yet, waiting 8 more seconds..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 8
                }
            }
            
            $jsonStr = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script $extractScript
            if ($jsonStr) {
                $parsed = $jsonStr | ConvertFrom-Json
                if ($parsed.error) {
                    Write-Host "      Script error: $($parsed.error)" -ForegroundColor Yellow
                }
                $pageJobs = $parsed.jobs
                if ($pageJobs -and $pageJobs.Count -gt 0) {
                    foreach ($job in $pageJobs) {
                        $key = "$($job.jobTitle)|$($job.companyName)".ToLower()
                        if (-not $seen.Contains($key)) {
                            $null = $seen.Add($key)
                            $jobs += $job
                        }
                    }
                    Write-Host "    -> Found $($pageJobs.Count) jobs (total: $($jobs.Count))" -ForegroundColor Green
                } else {
                    Write-Host "    -> 0 jobs found on this page" -ForegroundColor Yellow
                }
            }
            Start-Sleep -Milliseconds 1500
        } catch {
            Write-Host "    Naukri Browser error: $_" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "DEBUG: Fatal error in Scrape-Naukri-Browser: $_" -ForegroundColor Red
}
return $jobs
}

# ── SCRAPER: INSTAHYRE via Browser ────────────────────────────────────────
function Scrape-Instahyre-Browser {
    param([string]$TabWsUrl)
    
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    
    $urls = @(
        "https://www.instahyre.com/search-jobs/?designation=product+analyst&min_exp=0&max_exp=3",
        "https://www.instahyre.com/search-jobs/?designation=data+analyst&min_exp=0&max_exp=3",
        "https://www.instahyre.com/search-jobs/?designation=business+analyst&min_exp=0&max_exp=3",
        "https://www.instahyre.com/search-jobs/?designation=product+manager&min_exp=0&max_exp=3",
        "https://www.instahyre.com/search-jobs/?designation=analytics+engineer&min_exp=0&max_exp=3"
    )
    
    $extractScript = @'
(function() {
    try {
        const jobs = [];
        // Method 1: Job cards
        const selectors = ['.job-card', '.opportunity-card', '[class*="job-card"]', '[class*="opportunity"]', '.card'];
        let cards = [];
        for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found.length > 2) { cards = Array.from(found); break; }
        }
        
        if (cards.length > 0) {
            cards.forEach(card => {
                const titleEl = card.querySelector('[class*="title"], [class*="role"], h2, h3, strong');
                const title = titleEl ? titleEl.innerText.trim() : '';
                const company = (card.querySelector('[class*="company"]') || {innerText:''}).innerText.trim() || 'Not mentioned';
                const loc = (card.querySelector('[class*="location"], [class*="city"]') || {innerText:''}).innerText.trim() || 'India';
                const exp = (card.querySelector('[class*="exp"]') || {innerText:''}).innerText.trim() || '0-3 Yrs';
                const link = (card.querySelector('a') || {}).href || window.location.href;
                if (title && title.length > 3) {
                    jobs.push({jobTitle: title, companyName: company, location: loc, experience: exp, datePosted: 'Not mentioned', jobUrl: link, source: 'Instahyre'});
                }
            });
        }
        
        // Method 2: Job links from URL patterns
        if (jobs.length === 0) {
            const links = document.querySelectorAll('a[href*="/job-"]');
            const seen = new Set();
            links.forEach(link => {
                const path = link.pathname;
                const match = path.match(/\/job-(\d+)-(.+?)-at-(.+?)-([^\/]+)\/?$/);
                if (match && !seen.has(path)) {
                    seen.add(path);
                    const title = match[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const company = match[3].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    const loc = match[4].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    jobs.push({jobTitle: title, companyName: company, location: loc, experience: '0-3 Yrs', datePosted: 'Not mentioned', jobUrl: link.href, source: 'Instahyre'});
                }
            });
        }
        
        return JSON.stringify({count: jobs.length, jobs: jobs});
    } catch(e) {
        return JSON.stringify({error: e.message, count: 0, jobs: []});
    }
})();
'@
    
    foreach ($url in $urls) {
        try {
            $label = [System.Uri]::new($url).Query.Split('=')[1].Split('&')[0]
            Write-Host "  Instahyre: $label" -ForegroundColor Gray
            Navigate-And-Wait -TabWsUrl $TabWsUrl -Url $url -WaitSec 12
            
            # Check for Cloudflare challenge
            $cfCheck = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script '(function(){return JSON.stringify({title:document.title,isCF:document.title.includes("moment")||document.title.includes("Cloudflare"),bodyLen:document.body.innerHTML.length});})()'
            if ($cfCheck) {
                $cf = $cfCheck | ConvertFrom-Json
                Write-Host "      Page: title='$($cf.title)' isCF=$($cf.isCF)" -ForegroundColor DarkGray
                if ($cf.isCF) {
                    Write-Host "    [WAIT] Cloudflare challenge - waiting 15 more seconds..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 15
                }
            }
            
            $jsonStr = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script $extractScript
            if ($jsonStr) {
                $parsed = $jsonStr | ConvertFrom-Json
                if ($parsed.error) { Write-Host "      Script error: $($parsed.error)" -ForegroundColor Yellow }
                $pageJobs = $parsed.jobs
                if ($pageJobs -and $pageJobs.Count -gt 0) {
                    foreach ($job in $pageJobs) {
                        $key = "$($job.jobTitle)|$($job.companyName)".ToLower()
                        if (-not $seen.Contains($key)) {
                            $null = $seen.Add($key)
                            $jobs += $job
                        }
                    }
                    Write-Host "    -> Found $($pageJobs.Count) jobs (total: $($jobs.Count))" -ForegroundColor Green
                } else {
                    Write-Host "    -> 0 jobs found" -ForegroundColor Yellow
                }
            }
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "    Instahyre error: $_" -ForegroundColor Yellow
        }
    }
    
    return $jobs
}

# ── SCRAPER: INTERNSHALA via Browser ──────────────────────────────────────
function Scrape-Internshala-Browser {
    param([string]$TabWsUrl)
    
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    
    $urls = @(
        "https://internshala.com/jobs/product-analyst-jobs-in-india/",
        "https://internshala.com/jobs/data-analyst-jobs-in-india/",
        "https://internshala.com/jobs/business-analyst-jobs-in-india/",
        "https://internshala.com/jobs/product-manager-jobs-in-india/",
        "https://internshala.com/jobs/growth-analyst-jobs-in-india/",
        "https://internshala.com/jobs/analytics-engineer-jobs-in-india/",
        "https://internshala.com/jobs/associate-product-manager-jobs-in-india/",
        "https://internshala.com/jobs/business-intelligence-analyst-jobs-in-india/"
    )
    
    $extractScript = @'
(function() {
    try {
        const cards = document.querySelectorAll('.individual_internship');
        const jobs = [];
        cards.forEach(card => {
            const titleEl = card.querySelector('a.job-title-href');
            const title = titleEl ? titleEl.innerText.trim() : '';
            const href = titleEl ? titleEl.href : '';
            const companyEl = card.querySelector('.company-name');
            const company = companyEl ? companyEl.innerText.trim() : 'Not mentioned';
            const locEl = card.querySelector('.locations');
            const location = locEl ? locEl.innerText.trim() : 'India';
            
            const row1Items = Array.from(card.querySelectorAll('.row-1-item'));
            let experience = 'Not mentioned';
            row1Items.forEach(item => {
                const text = item.innerText.trim();
                if (text.includes('year') || text.includes('yr') || text.includes('fresher')) {
                    experience = text;
                }
            });
            
            let datePosted = 'Not mentioned';
            const dateEl = card.querySelector('.detail-row-2, .status-inactive, .status-active');
            if (dateEl) {
                datePosted = dateEl.innerText.trim().replace(/\n/g, ' ');
            }
            
            if (title && href) {
                jobs.push({
                    jobTitle: title,
                    companyName: company,
                    location: location,
                    experience: experience,
                    datePosted: datePosted,
                    jobUrl: href,
                    source: 'Internshala'
                });
            }
        });
        return JSON.stringify({count: jobs.length, jobs: jobs});
    } catch(e) {
        return JSON.stringify({error: e.message, count: 0, jobs: []});
    }
})();
'@
    
    foreach ($url in $urls) {
        try {
            $label = $url.Split('/')[-2]
            Write-Host "  Internshala: $label" -ForegroundColor Gray
            Navigate-And-Wait -TabWsUrl $TabWsUrl -Url $url -WaitSec 10
            
            # Check for Cloudflare challenge
            $cfCheck = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script '(function(){return JSON.stringify({title:document.title,isCF:document.title.includes("moment")||document.title.includes("Cloudflare")});})()'
            if ($cfCheck) {
                $cf = $cfCheck | ConvertFrom-Json
                if ($cf.isCF) {
                    Write-Host "    [WAIT] Cloudflare challenge - waiting 15 more seconds..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 15
                }
            }
            
            $jsonStr = Invoke-ChromeJS -TabWsUrl $TabWsUrl -Script $extractScript
            if ($jsonStr) {
                $parsed = $jsonStr | ConvertFrom-Json
                if ($parsed.error) { Write-Host "      Script error: $($parsed.error)" -ForegroundColor Yellow }
                $pageJobs = $parsed.jobs
                if ($pageJobs -and $pageJobs.Count -gt 0) {
                    foreach ($job in $pageJobs) {
                        $key = "$($job.jobTitle)|$($job.companyName)".ToLower()
                        if (-not $seen.Contains($key)) {
                            $null = $seen.Add($key)
                            $jobs += $job
                        }
                    }
                    Write-Host "    -> Found $($pageJobs.Count) jobs (total: $($jobs.Count))" -ForegroundColor Green
                } else {
                    Write-Host "    -> 0 jobs found" -ForegroundColor Yellow
                }
            }
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "    Internshala error: $_" -ForegroundColor Yellow
        }
    }
    
    return $jobs
}

# ── MAIN ─────────────────────────────────────────────────────────────────
function Run-Main {
Write-Host @"

  =================================================
     Browser Scraper - Naukri & Instahyre
     Opens Chrome, scrapes jobs, saves to cache
  =================================================

"@ -ForegroundColor Cyan

# Kill existing Chrome instances with our debug port
Write-Host "Checking for existing Chrome on port $CDP_PORT..." -ForegroundColor Gray
try {
    $existing = Invoke-WebRequest -Uri "http://localhost:$CDP_PORT/json" -UseBasicParsing -TimeoutSec 2
    Write-Host "  Found existing Chrome on port $CDP_PORT - will reuse it" -ForegroundColor Green
    $chromeProc = $null
    $reusingExisting = $true
} catch {
    $reusingExisting = $false
    # Kill stale processes
    Get-Process -Name chrome -ErrorAction SilentlyContinue | Where-Object {
        try { $_.CommandLine -match "remote-debugging-port=$CDP_PORT" } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    
    # Launch Chrome with remote debugging (headed mode - NOT headless)
    $userDataDir = Join-Path $env:TEMP "chrome_scraper_profile_v2"
    Write-Host "Launching Chrome (headed mode) on port $CDP_PORT..." -ForegroundColor Cyan
    Write-Host "(A Chrome window will open - please don't close it)" -ForegroundColor Yellow
    
    # Use --app=about:blank to avoid New Tab page setup
    $chromeArgs = @(
        "--remote-debugging-port=$CDP_PORT",
        "--user-data-dir=`"$userDataDir`"",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-translate",
        "--disable-sync",
        "--disable-background-networking",
        "--safebrowsing-disable-auto-update",
        "--metrics-recording-only",
        "--disable-prompt-on-repost",
        "--window-size=1280,900",
        "--lang=en-US",
        "about:blank"
    )
    $chromeProc = Start-Process -FilePath $CHROME_PATH -ArgumentList $chromeArgs -PassThru
    Write-Host "Chrome PID: $($chromeProc.Id)" -ForegroundColor Gray
    Write-Host "Waiting for Chrome to start..." -ForegroundColor Gray
    Start-Sleep -Seconds 4
}

try {
    # Get available tabs from CDP
    $tabs = (Invoke-WebRequest -Uri "http://localhost:$CDP_PORT/json" -UseBasicParsing).Content | ConvertFrom-Json
    $tab = $tabs | Where-Object { $_.type -eq "page" } | Select-Object -First 1
    
    if (-not $tab) {
        Write-Host "No browser tab found!" -ForegroundColor Red
        exit 1
    }
    
    $wsUrl = $tab.webSocketDebuggerUrl
    Write-Host "Connected to Chrome tab: $($wsUrl.Substring(0, [Math]::Min(70,$wsUrl.Length)))" -ForegroundColor Green
    
    # Enable necessary CDP domains
    Send-CDP -WsUrl $wsUrl -Method "Page.enable" | Out-Null
    Send-CDP -WsUrl $wsUrl -Method "Runtime.enable" | Out-Null
    
    Write-Host ""
    $allJobs = @()
    $log = @()
    
    # Scrape Naukri
    Write-Host "`n[SEARCH] Scraping Naukri via browser..." -ForegroundColor Yellow
    $naukri = @(Scrape-Naukri-Browser -TabWsUrl $wsUrl)
    $allJobs += $naukri
    $log += @{ portal = "Naukri"; found = $naukri.Count; timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
    Write-Host "  [SUCCESS] Naukri: $($naukri.Count) jobs" -ForegroundColor Green
    
    # Scrape Instahyre
    Write-Host "`n[SEARCH] Scraping Instahyre via browser..." -ForegroundColor Yellow
    $instahyre = @(Scrape-Instahyre-Browser -TabWsUrl $wsUrl)
    $allJobs += $instahyre
    $log += @{ portal = "Instahyre"; found = $instahyre.Count; timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
    Write-Host "  [SUCCESS] Instahyre: $($instahyre.Count) jobs" -ForegroundColor Green
    
    # Scrape Internshala
    Write-Host "`n[SEARCH] Scraping Internshala via browser..." -ForegroundColor Yellow
    $internshala = @(Scrape-Internshala-Browser -TabWsUrl $wsUrl)
    $allJobs += $internshala
    $log += @{ portal = "Internshala"; found = $internshala.Count; timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
    Write-Host "  [SUCCESS] Internshala: $($internshala.Count) jobs" -ForegroundColor Green
    
    # Save cache
    $cache = @{
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        expires   = (Get-Date).AddHours(3).ToString("yyyy-MM-dd HH:mm:ss")
        naukri    = $naukri
        instahyre = $instahyre
        internshala = $internshala
        log       = $log
    }
    
    $cache | ConvertTo-Json -Depth 10 | Set-Content -Path $CACHE_FILE -Encoding UTF8
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  [SUCCESS] Cache saved: $CACHE_FILE" -ForegroundColor Green
    Write-Host "    Naukri:      $($naukri.Count) jobs" -ForegroundColor Green
    Write-Host "    Instahyre:   $($instahyre.Count) jobs" -ForegroundColor Green
    Write-Host "    Internshala: $($internshala.Count) jobs" -ForegroundColor Green
    Write-Host "    Total:       $($allJobs.Count) jobs" -ForegroundColor Green
    Write-Host "    Expires:   $($cache.expires)" -ForegroundColor Gray
    Write-Host "================================================" -ForegroundColor Cyan
    
} finally {
    # Only close if WE launched Chrome
    if ($chromeProc -and -not $chromeProc.HasExited -and -not $reusingExisting) {
        Write-Host "`nClosing Chrome..." -ForegroundColor Gray
        $chromeProc.Kill()
        Write-Host "Chrome closed." -ForegroundColor Gray
    } elseif ($reusingExisting) {
        Write-Host "`n(Kept existing Chrome running since we reused it)" -ForegroundColor Gray
    }
}

Write-Host "`n  [SUCCESS] Browser scraping complete! Run start.bat to search jobs." -ForegroundColor Green
}

if ($MyInvocation.InvocationName -ne '.' -and $MyInvocation.InvocationName -ne 'bootstrap.ps1') {
    Run-Main
}
