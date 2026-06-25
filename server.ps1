# ═══════════════════════════════════════════════════════════════════════
# Job Search Agent — PowerShell Backend Server
# Run this with: powershell -ExecutionPolicy Bypass -File server.ps1
# Then open job_search_ui.html in Chrome
# ═══════════════════════════════════════════════════════════════════════

$PORT = 3000
$APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzTcviZHYe6Eq9QR_vzVyIuvpBsAiawAwTPUSFwURqVN8W8y4AbS72W66ZgylwR1tg/exec'

$HEADERS = @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    'Accept'     = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    'Accept-Language' = 'en-US,en;q=0.9'
}

$VALID_KEYWORDS = @(
    'product analyst','data analyst','business analyst','product manager',
    'growth analyst','analytics engineer','business intelligence','bi analyst',
    'decision scientist','product operations','consumer insights',
    'associate product manager','assistant product manager','wfm analyst',
    'workforce management','resource planning analyst','quantitative analyst',
    'product data analyst','user analytics','digital analyst'
)

$EXCL_LOCATIONS = @('usa','united states','uk','united kingdom','canada','australia','singapore','dubai','uae','germany','france','london','new york','toronto','sydney')

# ── HELPER: CORS RESPONSE ────────────────────────────────────────────────
function Send-Response {
    param($Context, $Body, $StatusCode = 200)
    $response = $Context.Response
    $response.StatusCode = $StatusCode
    $response.ContentType = 'application/json'
    $response.Headers.Add('Access-Control-Allow-Origin', '*')
    $response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    $response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# ── SCRAPER: NAUKRI (reads from browser_cache.json) ─────────────────────
function Scrape-Naukri {
    $cacheFile = Join-Path $PSScriptRoot 'browser_cache.json'
    
    if (-not (Test-Path $cacheFile)) {
        Write-Host "  [WARNING] Naukri: browser_cache.json not found." -ForegroundColor Yellow
        Write-Host "     Run browser_scraper.ps1 first to populate the cache." -ForegroundColor Yellow
        return @()
    }
    
    try {
        $cache = Get-Content $cacheFile -Raw | ConvertFrom-Json
        
        # Check if cache is expired (older than 3 hours)
        if ($cache.expires) {
            $expiry = [datetime]::Parse($cache.expires)
            if ([datetime]::Now -gt $expiry) {
                Write-Host "  [WARNING] Naukri cache expired (from $($cache.timestamp)). Re-run browser_scraper.ps1." -ForegroundColor Yellow
            } else {
                Write-Host "  [SUCCESS] Naukri: Using browser cache from $($cache.timestamp)" -ForegroundColor Green
            }
        }
        
        if ($cache.naukri -and $cache.naukri.Count -gt 0) {
            Write-Host "  -> Loaded $($cache.naukri.Count) Naukri jobs from cache" -ForegroundColor Green
            return $cache.naukri
        } else {
            Write-Host "  [WARNING] Naukri cache is empty." -ForegroundColor Yellow
            return @()
        }
    } catch {
        Write-Host "  [ERROR] Naukri cache read error: $_" -ForegroundColor Red
        return @()
    }
}

# ── SCRAPER: LINKEDIN (Guest API) ────────────────────────────────────────
function Scrape-LinkedIn {
    param(
        [string]$SelectedTitle,
        [string]$SelectedLocation
    )
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()

    $keywords = @()
    if ($SelectedTitle) {
        $keywords += $SelectedTitle
    } else {
        $keywords = @(
            'product analyst','data analyst','business analyst',
            'product manager','growth analyst','analytics engineer',
            'decision scientist','business intelligence analyst',
            'associate product manager'
        )
    }

    $locationParam = "India"
    if ($SelectedLocation) {
        $locationParam = $SelectedLocation
    }

    foreach ($kw in $keywords) {
        try {
            $encoded = [Uri]::EscapeDataString($kw)
            $encodedLoc = [Uri]::EscapeDataString($locationParam)
            $url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=$encoded&location=$encodedLoc&f_TPR=r604800&f_E=1,2&sortBy=DD&start=0"
            Write-Host "  LinkedIn: $kw in $locationParam"

            $liHeaders = $HEADERS.Clone()
            $liHeaders['Referer'] = 'https://www.linkedin.com/jobs/search/'

            $resp = Invoke-WebRequest -Uri $url -Headers $liHeaders -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            $html = $resp.Content

            # Extract job data via regex from HTML cards
            $titles    = [regex]::Matches($html, 'class="base-search-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*</h3>')
            $companies = [regex]::Matches($html, 'class="base-search-card__subtitle[^"]*"[^>]*>\s*<a[^>]*>\s*([\s\S]*?)\s*</a>')
            $locs      = [regex]::Matches($html, 'class="job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*</span>')
            $dates     = [regex]::Matches($html, 'datetime="([^"]+)"')
            $links     = [regex]::Matches($html, 'href="(https://[^"]*?linkedin\.com/jobs/view/[^"?]+)')

            for ($i = 0; $i -lt $titles.Count; $i++) {
                $title   = [regex]::Replace($titles[$i].Groups[1].Value, '<[^>]+>', '').Trim()
                $company = if ($companies.Count -gt $i) { [regex]::Replace($companies[$i].Groups[1].Value, '<[^>]+>', '').Trim() } else { 'Not mentioned' }
                $loc     = if ($locs.Count -gt $i) { [regex]::Replace($locs[$i].Groups[1].Value, '<[^>]+>', '').Trim() } else { $locationParam }
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
            }

            Write-Host "    → $($jobs.Count) total LinkedIn jobs so far"
            Start-Sleep -Milliseconds 600
        } catch {
            Write-Host "    LinkedIn error [$kw]: $_" -ForegroundColor Yellow
        }
    }

    return $jobs
}

# ── SCRAPER: INDEED ──────────────────────────────────────────────────────
function Scrape-Indeed {
    param(
        [string]$SelectedTitle,
        [string]$SelectedLocation
    )
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()

    $queries = @()
    if ($SelectedTitle) {
        $queries += $SelectedTitle.Replace(' ', '+')
    } else {
        $queries = @(
            'product+analyst','data+analyst','business+analyst',
            'product+manager','growth+analyst','analytics+engineer',
            'associate+product+manager','decision+scientist'
        )
    }

    $locationParam = "India"
    if ($SelectedLocation) {
        $locationParam = $SelectedLocation
    }

    foreach ($q in $queries) {
        try {
            $encodedLoc = [Uri]::EscapeDataString($locationParam)
            $url = "https://in.indeed.com/jobs?q=$q&l=$encodedLoc&fromage=7&sort=date"
            Write-Host "  Indeed: $q in $locationParam"

            $indHeaders = $HEADERS.Clone()
            $indHeaders['Referer'] = 'https://in.indeed.com/'

            $resp = Invoke-WebRequest -Uri $url -Headers $indHeaders -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            $html = $resp.Content

            # Extract job cards
            $titleMatches   = [regex]::Matches($html, 'data-testid="jobTitle"[^>]*><a[^>]*>(?:<span[^>]*>)?(.*?)(?:</span>)?</a>')
            $companyMatches = [regex]::Matches($html, 'data-testid="company-name"[^>]*>(.*?)</[a-z]+>')
            $locMatches     = [regex]::Matches($html, 'data-testid="text-location"[^>]*>(.*?)</[a-z]+>')
            $dateMatches    = [regex]::Matches($html, 'data-testid="myJobsStateDate"[^>]*>(.*?)</[a-z]+>')
            $jkMatches      = [regex]::Matches($html, 'data-jk="([^"]+)"')

            for ($i = 0; $i -lt $titleMatches.Count; $i++) {
                $title   = [regex]::Replace($titleMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim()
                $company = if ($companyMatches.Count -gt $i) { [regex]::Replace($companyMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim() } else { 'Not mentioned' }
                $loc     = if ($locMatches.Count -gt $i)    { [regex]::Replace($locMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim() }    else { $locationParam }
                $date    = if ($dateMatches.Count -gt $i)   { [regex]::Replace($dateMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim() }   else { 'Not mentioned' }
                $jk      = if ($jkMatches.Count -gt $i)     { $jkMatches[$i].Groups[1].Value }                                            else { '' }
                $link    = if ($jk) { "https://in.indeed.com/viewjob?jk=$jk" } else { "https://in.indeed.com/jobs?q=$q&l=$encodedLoc" }

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
                    source      = 'Indeed'
                }
            }

            Write-Host "    → $($jobs.Count) total Indeed jobs so far"
            Start-Sleep -Milliseconds 800
        } catch {
            Write-Host "    Indeed error [$q]: $_" -ForegroundColor Yellow
        }
    }

    return $jobs
}

# ── SCRAPER: SHINE.COM ───────────────────────────────────────────────────
function Scrape-Shine {
    param(
        [string]$SelectedTitle,
        [string]$SelectedLocation
    )
    $jobs = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new()

    $keywords = @()
    if ($SelectedTitle) {
        $keywords += $SelectedTitle
    } else {
        $keywords = @(
            'product analyst', 'data analyst', 'business analyst',
            'product manager', 'growth analyst', 'analytics engineer',
            'associate product manager'
        )
    }

    foreach ($kw in $keywords) {
        try {
            $kwDash = $kw.Replace(' ', '-')
            $kwEsc = [Uri]::EscapeDataString($kw)

            if ($SelectedLocation) {
                $locDash = $SelectedLocation.Replace(' ', '-').ToLower()
                $url = "https://www.shine.com/job-search/$kwDash-jobs-in-$locDash?q=$kwEsc&limit=20&offset=0"
                Write-Host "  Shine: $kw in $SelectedLocation"
            } else {
                $url = "https://www.shine.com/job-search/$kwDash-jobs?q=$kwEsc&limit=20&offset=0"
                Write-Host "  Shine: $kw"
            }

            $resp = Invoke-WebRequest -Uri $url -Headers $HEADERS -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
            $html = $resp.Content

            $jsonMatch = [regex]::Match($html, 'window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});</script>')
            if ($jsonMatch.Success) {
                try {
                    $state = ConvertFrom-Json $jsonMatch.Groups[1].Value
                    $jobList = if ($state.jobList) { $state.jobList } else { $state.jobs }
                    if (-not $jobList) { $jobList = $state.jobSearch.jobList }

                    foreach ($job in $jobList) {
                        $jobId = if ($job.id) { $job.id } else { $job.jobId }
                        if (-not $jobId -or $seen.Contains($jobId)) { continue }
                        $null = $seen.Add($jobId)

                        $title = if ($job.title) { $job.title } else { $job.jobTitle }
                        $company = if ($job.company) { $job.company } else { $job.companyName }
                        $loc = if ($job.location) { $job.location } else { $job.city }
                        
                        $exp = 'Not mentioned'
                        if ($job.minExp -ne $null) {
                            $exp = "$($job.minExp)-$($job.maxExp) Yrs"
                        }

                        $jobUrl = if ($job.url) { $job.url } else { "https://www.shine.com$($job.slug)" }

                        $jobs += @{
                            jobTitle    = $title.Trim()
                            companyName = if ($company) { $company.Trim() } else { 'Not mentioned' }
                            location    = if ($loc) { $loc.Trim() } else { 'India' }
                            experience  = $exp
                            datePosted  = if ($job.postedOn) { $job.postedOn } else { 'Not mentioned' }
                            jobUrl      = $jobUrl
                            source      = 'Shine'
                        }
                    }
                } catch {
                    # Fall through to regex
                }
            }

            # Fallback regex if no jobs found
            if ($jobs.Count -eq 0) {
                $titleMatches = [regex]::Matches($html, 'class="jobTitle[^"]*"[^>]*><a[^>]*>(.*?)</a>')
                $compMatches = [regex]::Matches($html, 'class="companyName[^"]*"[^>]*>(.*?)</(?:span|div|a)>')
                
                $count = [Math]::Min($titleMatches.Count, $compMatches.Count)
                for ($i = 0; $i -lt $count; $i++) {
                    $title = [regex]::Replace($titleMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim()
                    $company = [regex]::Replace($compMatches[$i].Groups[1].Value, '<[^>]+>', '').Trim()
                    
                    if (-not $title) { continue }
                    $key = "$title|$company".ToLower()
                    if ($seen.Contains($key)) { continue }
                    $null = $seen.Add($key)

                    $jobs += @{
                        jobTitle    = $title
                        companyName = if ($company) { $company } else { 'Not mentioned' }
                        location    = if ($SelectedLocation) { $SelectedLocation } else { 'India' }
                        experience  = 'Not mentioned'
                        datePosted  = 'Not mentioned'
                        jobUrl      = $url
                        source      = 'Shine'
                    }
                }
            }

            Start-Sleep -Milliseconds 600
        } catch {
            Write-Host "    Shine error [$kw]: $_" -ForegroundColor Yellow
        }
    }
    return $jobs
}

# ── SCRAPER: INSTAHYRE (reads from browser_cache.json) ──────────────────
function Scrape-Instahyre {
    $cacheFile = Join-Path $PSScriptRoot 'browser_cache.json'
    
    if (-not (Test-Path $cacheFile)) {
        Write-Host "  [WARNING] Instahyre: browser_cache.json not found." -ForegroundColor Yellow
        Write-Host "     Run browser_scraper.ps1 first to populate the cache." -ForegroundColor Yellow
        return @()
    }
    
    try {
        $cache = Get-Content $cacheFile -Raw | ConvertFrom-Json
        
        # Check if cache is expired (older than 3 hours)
        if ($cache.expires) {
            $expiry = [datetime]::Parse($cache.expires)
            if ([datetime]::Now -gt $expiry) {
                Write-Host "  [WARNING] Instahyre cache expired (from $($cache.timestamp)). Re-run browser_scraper.ps1." -ForegroundColor Yellow
            } else {
                Write-Host "  [SUCCESS] Instahyre: Using browser cache from $($cache.timestamp)" -ForegroundColor Green
            }
        }
        
        if ($cache.instahyre -and $cache.instahyre.Count -gt 0) {
            Write-Host "  -> Loaded $($cache.instahyre.Count) Instahyre jobs from cache" -ForegroundColor Green
            return $cache.instahyre
        } else {
            Write-Host "  [WARNING] Instahyre cache is empty." -ForegroundColor Yellow
            return @()
        }
    } catch {
        Write-Host "  [ERROR] Instahyre cache read error: $_" -ForegroundColor Red
        return @()
    }
}

# ── SCRAPER: INTERNSHALA ─────────────────────────────────────────────────
function Scrape-Internshala {
    $cacheFile = Join-Path $PSScriptRoot 'browser_cache.json'
    
    if (-not (Test-Path $cacheFile)) {
        Write-Host "  [WARNING] Internshala: browser_cache.json not found." -ForegroundColor Yellow
        Write-Host "     Run browser_scraper.ps1 first to populate the cache." -ForegroundColor Yellow
        return @()
    }
    
    try {
        $cache = Get-Content $cacheFile -Raw | ConvertFrom-Json
        
        # Check if cache is expired (older than 3 hours)
        if ($cache.expires) {
            $expiry = [datetime]::Parse($cache.expires)
            if ([datetime]::Now -gt $expiry) {
                Write-Host "  [WARNING] Internshala cache expired (from $($cache.timestamp)). Re-run browser_scraper.ps1." -ForegroundColor Yellow
            } else {
                Write-Host "  [SUCCESS] Internshala: Using browser cache from $($cache.timestamp)" -ForegroundColor Green
            }
        }
        
        if ($cache.internshala -and $cache.internshala.Count -gt 0) {
            Write-Host "  -> Loaded $($cache.internshala.Count) Internshala jobs from cache" -ForegroundColor Green
            return $cache.internshala
        } else {
            Write-Host "  [WARNING] Internshala cache is empty." -ForegroundColor Yellow
            return @()
        }
    } catch {
        Write-Host "  [ERROR] Internshala cache read error: $_" -ForegroundColor Red
        return @()
    }
}

# ── FILTER ───────────────────────────────────────────────────────────────
function Match-JobTitle {
    param(
        [string]$jobTitle,
        [string]$selectedRole
    )
    if (-not $jobTitle) { return $false }
    $title = $jobTitle.ToLower()

    if (-not $selectedRole) {
        # Default fallback checking VALID_KEYWORDS
        foreach ($kw in $script:VALID_KEYWORDS) {
            if ($title.Contains($kw)) { return $true }
        }
        return $false
    }

    $role = $selectedRole.ToLower()

    # If it's an exact substring, always match
    if ($title.Contains($role)) { return $true }

    switch ($role) {
        "software engineer" {
            $positive = @("software", "sde", "developer", "programmer", "frontend", "backend", "full stack", "fullstack", "ios", "android", "java", "python", "c++", "golang", "net", "node", "react", "app engineer", "application engineer", "web engineer", "mtech fresher")
            $negative = @("data", "ml", "machine learning", "ai", "cloud", "devops", "sre", "security", "cyber", "qa", "test", "civil", "mechanical", "electrical", "network", "system admin", "support", "analytics")
            
            $hasPos = $false
            foreach ($p in $positive) { if ($title.Contains($p)) { $hasPos = $true; break } }
            if ($title.Contains("engineer") -and -not $hasPos) {
                $hasPos = $true
            }
            if (-not $hasPos) { return $false }
            foreach ($n in $negative) { if ($title.Contains($n)) { return $false } }
            return $true
        }
        "full stack developer" {
            $positive = @("full stack", "fullstack", "mern", "mean", "full-stack")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "data scientist" {
            $positive = @("data scientist", "data science", "machine learning scientist", "ai scientist", "applied scientist")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "data analyst" {
            $positive = @("data analyst", "data analytics", "analytics analyst", "decision scientist", "product analyst", "growth analyst", "operations analyst", "business intelligence analyst")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "bi analyst" {
            $positive = @("bi analyst", "business intelligence", "power bi", "tableau", "looker", "qlik", "bi engineer")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "machine learning engineer" {
            $positive = @("machine learning", "ml engineer", "ml developer", "computer vision", "nlp", "ai engineer", "deep learning", "artificial intelligence engineer", "mlops")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "data engineer" {
            $positive = @("data engineer", "etl", "big data", "data pipeline", "spark", "hadoop", "data warehouse")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "cloud engineer" {
            $positive = @("cloud engineer", "aws engineer", "azure engineer", "gcp engineer", "cloud architect", "cloud developer", "cloud platform")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "devops engineer" {
            $positive = @("devops", "site reliability", "sre", "platform engineer", "ci/cd", "release engineer", "systems engineer")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "cybersecurity analyst" {
            $positive = @("cybersecurity", "cyber security", "information security", "security analyst", "soc analyst", "pentester", "ethical hacker", "security engineer", "secops")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "marketing analyst" {
            $positive = @("marketing analyst", "digital marketing", "seo analyst", "sem analyst", "growth marketing", "marketing coordinator")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "bda" {
            $positive = @("bda", "business development", "inside sales", "sales development", "sdr", "bde", "client relation", "sales associate")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "human resources officer" {
            $positive = @("human resources", "hr ", " recruiter", "talent acquisition", "hr officer", "hr generalist", "hr executive", "people operations")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "sales representative" {
            $positive = @("sales", "account executive", "business development", "sales rep", "sales executive", "sales agent")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        "business analyst" {
            $positive = @("business analyst", "ba ", "business analysis", "functional analyst", "system analyst", "systems analyst", "product analyst")
            foreach ($p in $positive) { if ($title.Contains($p)) { return $true } }
            return $false
        }
        default {
            return $title.Contains($role)
        }
    }
}

function Apply-Filters {
    param(
        $jobs,
        [string]$SelectedTitle,
        [string]$SelectedLocation,
        [string]$SelectedExperience
    )
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $result = @()

    foreach ($job in $jobs) {
        if ($job -eq $null) { continue }

        # 1. Job Title Match
        if (-not (Match-JobTitle -jobTitle $job.jobTitle -selectedRole $SelectedTitle)) { continue }


        # 2. Location Match
        if ($SelectedLocation) {
            $ll = $job.location.ToLower()
            $sl = $SelectedLocation.ToLower()
            if ($sl -eq "bengaluru") {
                if (-not ($ll.Contains("bengaluru") -or $ll.Contains("bangalore"))) { continue }
            } else {
                if (-not $ll.Contains($sl)) { continue }
            }
        } else {
            # Exclude non-India/spam locations
            $ll = $job.location.ToLower()
            $excluded = $false
            foreach ($e in $EXCL_LOCATIONS) { if ($ll.Contains($e)) { $excluded = $true; break } }
            if ($excluded) { continue }
        }

        # 3. Experience Match
        if ($SelectedExperience) {
            $expStr = $job.experience.ToLower()
            $matchExp = $true
            $parts = $SelectedExperience.Split('-')
            if ($parts.Count -eq 2) {
                $selMin = [int]$parts[0]
                $selMax = [int]$parts[1]

                if ($expStr -and $expStr -ne "not mentioned") {
                    if ($expStr.Contains("fresher") -or $expStr.Contains("entry") -or $expStr.Contains("intern")) {
                        $jobMin = 0
                        $jobMax = 0
                    } else {
                        $rangeMatch = [regex]::Match($expStr, '(\d+)\s*[-–to\s]+\s*(\d+)')
                        if ($rangeMatch.Success) {
                            $jobMin = [int]$rangeMatch.Groups[1].Value
                            $jobMax = [int]$rangeMatch.Groups[2].Value
                        } else {
                            $singleMatch = [regex]::Match($expStr, '^(\d+)')
                            if ($singleMatch.Success) {
                                $jobMin = [int]$singleMatch.Groups[1].Value
                                $jobMax = $jobMin
                            } else {
                                $jobMin = 0
                                $jobMax = 0
                            }
                        }
                    }

                    if (-not ($jobMin -le $selMax -and $jobMax -ge $selMin)) {
                        $matchExp = $false
                    }
                }
            }
            if (-not $matchExp) { continue }
        }

        # Deduplication
        $key = "$($job.jobTitle)|$($job.companyName)".ToLower()
        if ($seen.Contains($key)) { continue }
        $null = $seen.Add($key)

        $result += $job
    }

    return $result
}

# ── DATE FORMAT ──────────────────────────────────────────────────────────
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

# ── CONVERT TO JSON ──────────────────────────────────────────────────────
function To-Json {
    param($obj)
    return $obj | ConvertTo-Json -Depth 10 -Compress
}

# ── MAIN SEARCH ──────────────────────────────────────────────────────────
function Run-Search {
    param(
        [string]$SelectedTitle,
        [string]$SelectedLocation,
        [string]$SelectedExperience
    )
    $allJobs = @()
    $log = @()

    # Naukri
    Write-Host "`n[SEARCH] Scraping Naukri..." -ForegroundColor Cyan
    try {
        $nJobs = @(Scrape-Naukri)
        $allJobs += $nJobs
        $log += @{ portal='Naukri'; found=$nJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] Naukri: $($nJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='Naukri'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] Naukri failed: $_" -ForegroundColor Red
    }

    # LinkedIn
    Write-Host "`n[SEARCH] Scraping LinkedIn..." -ForegroundColor Cyan
    try {
        $lJobs = @(Scrape-LinkedIn -SelectedTitle $SelectedTitle -SelectedLocation $SelectedLocation)
        $allJobs += $lJobs
        $log += @{ portal='LinkedIn'; found=$lJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] LinkedIn: $($lJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='LinkedIn'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] LinkedIn failed: $_" -ForegroundColor Red
    }

    # Indeed
    Write-Host "`n[SEARCH] Scraping Indeed..." -ForegroundColor Cyan
    try {
        $iJobs = @(Scrape-Indeed -SelectedTitle $SelectedTitle -SelectedLocation $SelectedLocation)
        $allJobs += $iJobs
        $log += @{ portal='Indeed'; found=$iJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] Indeed: $($iJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='Indeed'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] Indeed failed: $_" -ForegroundColor Red
    }

    # Shine
    Write-Host "`n[SEARCH] Scraping Shine..." -ForegroundColor Cyan
    try {
        $sJobs = @(Scrape-Shine -SelectedTitle $SelectedTitle -SelectedLocation $SelectedLocation)
        $allJobs += $sJobs
        $log += @{ portal='Shine'; found=$sJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] Shine: $($sJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='Shine'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] Shine failed: $_" -ForegroundColor Red
    }

    # Instahyre
    Write-Host "`n[SEARCH] Scraping Instahyre..." -ForegroundColor Cyan
    try {
        $ihJobs = @(Scrape-Instahyre)
        $allJobs += $ihJobs
        $log += @{ portal='Instahyre'; found=$ihJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] Instahyre: $($ihJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='Instahyre'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] Instahyre failed: $_" -ForegroundColor Red
    }

    # Internshala
    Write-Host "`n[SEARCH] Scraping Internshala..." -ForegroundColor Cyan
    try {
        $isJobs = @(Scrape-Internshala -SelectedTitle $SelectedTitle -SelectedLocation $SelectedLocation)
        $allJobs += $isJobs
        $log += @{ portal='Internshala'; found=$isJobs.Count; status='ok' }
        Write-Host "  [SUCCESS] Internshala: $($isJobs.Count) jobs" -ForegroundColor Green
    } catch {
        $log += @{ portal='Internshala'; found=0; status='error'; error="$_" }
        Write-Host "  [ERROR] Internshala failed: $_" -ForegroundColor Red
    }

    # Filter
    $filtered = @(Apply-Filters -jobs $allJobs -SelectedTitle $SelectedTitle -SelectedLocation $SelectedLocation -SelectedExperience $SelectedExperience)

    $result = @{
        success  = $true
        total    = $allJobs.Count
        filtered = $filtered.Count
        jobs     = $filtered
        log      = $log
    }

    return To-Json $result
}

# ── HTTP SERVER ──────────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$PORT/")
$listener.Start()

Write-Host @"

  ==========================================
      Job Search Agent Server
      Running on http://localhost:$PORT
      Open job_search_ui.html in Chrome
  ==========================================

"@ -ForegroundColor Cyan

Write-Host "  Waiting for requests... (Ctrl+C to stop)`n" -ForegroundColor Gray

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $path = $req.Url.AbsolutePath

        Write-Host "[$([datetime]::Now.ToString('HH:mm:ss'))] $($req.HttpMethod) $path" -ForegroundColor DarkGray

        # OPTIONS preflight
        if ($req.HttpMethod -eq 'OPTIONS') {
            Send-Response $context '{}'
            continue
        }

        switch ($path) {
            '/api/health' {
                Send-Response $context '{"status":"ok","server":"PowerShell Job Agent"}'
            }

            '/api/search' {
                $titles = ""
                $locations = ""
                $experience = ""
                if ($req.Url.Query) {
                    $queryStr = $req.Url.Query.TrimStart('?')
                    $pairs = $queryStr.Split('&')
                    foreach ($pair in $pairs) {
                        $parts = $pair.Split('=')
                        if ($parts.Count -eq 2) {
                            $key = [Uri]::UnescapeDataString($parts[0]).Replace('+', ' ')
                            $val = [Uri]::UnescapeDataString($parts[1]).Replace('+', ' ')
                            if ($key -eq "titles") { $titles = $val }
                            elseif ($key -eq "locations") { $locations = $val }
                            elseif ($key -eq "experience") { $experience = $val }
                        }
                    }
                }
                Write-Host "`n  🚀 Starting filtered job search (Title: '$titles', Loc: '$locations', Exp: '$experience')...`n" -ForegroundColor Yellow
                $json = Run-Search -SelectedTitle $titles -SelectedLocation $locations -SelectedExperience $experience
                Write-Host "`n  ✅ Search complete. Sending results.`n" -ForegroundColor Green
                Send-Response $context $json
            }

            '/api/upload' {
                # Read body
                $reader = New-Object System.IO.StreamReader($req.InputStream)
                $body = $reader.ReadToEnd()
                $reader.Close()

                try {
                    $targetUrl = $APPS_SCRIPT_URL
                    try {
                        $jsonBody = ConvertFrom-Json $body
                        if ($jsonBody.appsScriptUrl) {
                            $targetUrl = $jsonBody.appsScriptUrl
                        }
                    } catch {}

                    # Forward to Apps Script
                    $uploadResp = Invoke-WebRequest -Uri $targetUrl `
                        -Method POST `
                        -Body $body `
                        -ContentType 'application/json' `
                        -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
                    $uploadResult = $uploadResp.Content
                } catch {
                    $uploadResult = '{"added":0,"error":"' + "$_".Replace('"','\"') + '"}'
                }

                Send-Response $context $uploadResult
            }

            default {
                Send-Response $context '{"error":"Not found"}' 404
            }
        }
    } catch {
        if ($_.Exception.Message -notmatch 'thread abort|listener') {
            Write-Host "Server error: $_" -ForegroundColor Red
        }
    }
}
