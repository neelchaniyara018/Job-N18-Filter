# Import server.ps1 functions by dot sourcing (except the listener loop)
# To avoid the listener loop, we can just copy-paste the Match-JobTitle and Apply-Filters functions

$VALID_KEYWORDS = @(
    'product analyst','data analyst','business analyst','product manager',
    'growth analyst','analytics engineer','business intelligence','bi analyst',
    'decision scientist','product operations','consumer insights',
    'associate product manager','assistant product manager','wfm analyst',
    'workforce management','resource planning analyst','quantitative analyst',
    'product data analyst','user analytics','digital analyst'
)

$EXCL_LOCATIONS = @('usa','united states','uk','united kingdom','canada','australia','singapore','dubai','uae','germany','france','london','new york','toronto','sydney')

function Match-JobTitle {
    param(
        [string]$jobTitle,
        [string]$selectedRole
    )
    if (-not $jobTitle) { return $false }
    $title = $jobTitle.ToLower()

    if (-not $selectedRole) {
        foreach ($kw in $VALID_KEYWORDS) {
            if ($title.Contains($kw)) { return $true }
        }
        return $false
    }

    $role = $selectedRole.ToLower()

    if ($title.Contains($role)) { return $true }

    switch ($role) {
        "data analyst" {
            $positive = @("data analyst", "data analytics", "analytics analyst", "decision scientist", "product analyst", "growth analyst", "operations analyst", "business intelligence analyst")
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

        Write-Host "Checking: $($job.jobTitle) | $($job.location) | $($job.experience)"

        # 1. Job Title Match
        if (-not (Match-JobTitle -jobTitle $job.jobTitle -selectedRole $SelectedTitle)) {
            Write-Host "  -> Failed Title Match" -ForegroundColor Red
            continue
        }

        # 2. Location Match
        if ($SelectedLocation) {
            $ll = $job.location.ToLower()
            $sl = $SelectedLocation.ToLower()
            if ($sl -eq "bengaluru") {
                if (-not ($ll.Contains("bengaluru") -or $ll.Contains("bangalore"))) {
                    Write-Host "  -> Failed Location Match (Bengaluru)" -ForegroundColor Red
                    continue
                }
            } else {
                if (-not $ll.Contains($sl)) {
                    Write-Host "  -> Failed Location Match ($SelectedLocation)" -ForegroundColor Red
                    continue
                }
            }
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
            if (-not $matchExp) {
                Write-Host "  -> Failed Experience Match ($expStr vs $SelectedExperience)" -ForegroundColor Red
                continue
            }
        }

        Write-Host "  [MATCHED!]" -ForegroundColor Green
        $result += $job
    }

    return $result
}

# Test data
$cache = Get-Content browser_cache.json -Raw | ConvertFrom-Json
$nDataAnalyst = $cache.naukri | Where-Object { $_.jobTitle -like "*data analyst*" }
$res = Apply-Filters -jobs $nDataAnalyst -SelectedTitle "Data Analyst" -SelectedLocation "Bengaluru" -SelectedExperience "0-2"
Write-Host "Matched Count: $($res.Count)"
