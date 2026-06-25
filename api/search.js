// api/search.js — Serverless Search Endpoint
// Fetches Naukri/Instahyre from Supabase, dynamically scrapes LinkedIn/Internshala,
// filters all results, and returns them to the frontend.

const VALID_KEYWORDS = [
  'product analyst', 'data analyst', 'business analyst', 'product manager',
  'growth analyst', 'analytics-engineer', 'analytics engineer', 'business intelligence', 'bi analyst',
  'decision scientist', 'product operations', 'consumer insights',
  'associate product manager', 'assistant product manager', 'wfm analyst',
  'workforce management', 'resource planning analyst', 'quantitative analyst',
  'product data analyst', 'user analytics', 'digital analyst'
];

const EXCL_LOCATIONS = [
  'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia', 
  'singapore', 'dubai', 'uae', 'germany', 'france', 'london', 'new york', 
  'toronto', 'sydney'
];

const USER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ success: false, error: 'Supabase credentials missing in environment.' });
  }

  console.log('[SEARCH] Initiating cloud job search...');

  const allJobs = [];
  const log = [];

  try {
    // ── 1. FETCH CACHED PORTALS (Naukri & Instahyre from Supabase) ───────────
    console.log('[SEARCH] Loading Naukri & Instahyre from Supabase...');
    try {
      const supabaseEndpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/jobs?select=*`;
      const dbResponse = await fetch(supabaseEndpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (dbResponse.ok) {
        const cachedJobs = await dbResponse.json();
        
        const naukriJobs = cachedJobs.filter(j => j.source === 'Naukri');
        const instahyreJobs = cachedJobs.filter(j => j.source === 'Instahyre');
        const linkedinJobs = cachedJobs.filter(j => j.source === 'LinkedIn');
        
        // Map keys to match UI expectations
        const mappedNaukri = naukriJobs.map(j => ({
          jobTitle: j.job_title,
          companyName: j.company_name,
          location: j.location,
          experience: j.experience,
          datePosted: j.date_posted,
          jobUrl: j.job_url,
          source: 'Naukri'
        }));
        const mappedInstahyre = instahyreJobs.map(j => ({
          jobTitle: j.job_title,
          companyName: j.company_name,
          location: j.location,
          experience: j.experience,
          datePosted: j.date_posted,
          jobUrl: j.job_url,
          source: 'Instahyre'
        }));
        const mappedLinkedIn = linkedinJobs.map(j => ({
          jobTitle: j.job_title,
          companyName: j.company_name,
          location: j.location,
          experience: j.experience,
          datePosted: j.date_posted,
          jobUrl: j.job_url,
          source: 'LinkedIn'
        }));
 
        allJobs.push(...mappedNaukri);
        allJobs.push(...mappedInstahyre);
        allJobs.push(...mappedLinkedIn);
 
        log.push({ portal: 'Naukri', found: mappedNaukri.length, status: 'ok' });
        log.push({ portal: 'Instahyre', found: mappedInstahyre.length, status: 'ok' });
        log.push({ portal: 'LinkedIn (Cache)', found: mappedLinkedIn.length, status: 'ok' });
        console.log(`[SEARCH] Loaded ${mappedNaukri.length} Naukri, ${mappedInstahyre.length} Instahyre, and ${mappedLinkedIn.length} LinkedIn jobs from Supabase.`);
      } else {
        throw new Error(`DB HTTP ${dbResponse.status}`);
      }
    } catch (dbError) {
      console.error('[SEARCH] Database load failed:', dbError.message);
      log.push({ portal: 'Naukri', found: 0, status: 'error', error: dbError.message });
      log.push({ portal: 'Instahyre', found: 0, status: 'error', error: dbError.message });
      log.push({ portal: 'LinkedIn', found: 0, status: 'error', error: dbError.message });
    }

    // ── 2. DYNAMIC SCRAPING (Internshala in Parallel) ────────────────────────
    console.log('[SEARCH] Scraping Internshala dynamically...');
    const dynamicScrapers = [
      {
        name: 'Internshala',
        fn: () => scrapeInternshala()
      }
    ];

    const scrapeResults = await Promise.allSettled(
      dynamicScrapers.map(async (scraper) => {
        try {
          const jobs = await scraper.fn();
          return jobs || [];
        } catch (err) {
          console.error(`[SEARCH] ${scraper.name} scrape failed:`, err.message);
          throw err;
        }
      })
    );

    scrapeResults.forEach((result, idx) => {
      const scraper = dynamicScrapers[idx];
      if (result.status === 'fulfilled' && result.value) {
        allJobs.push(...result.value);
        log.push({ portal: scraper.name, found: result.value.length, status: 'ok' });
      } else {
        log.push({ portal: scraper.name, found: 0, status: 'error', error: result.reason ? result.reason.message : 'Unknown error' });
      }
    });

    // ── 3. FILTER RESULTS ────────────────────────────────────────────────────
    const filteredJobs = applyFilters(allJobs);
    console.log(`[SEARCH] Total found: ${allJobs.length}, Filtered: ${filteredJobs.length}`);

    return res.status(200).json({
      success: true,
      total: allJobs.length,
      filtered: filteredJobs.length,
      jobs: filteredJobs,
      rawJobs: allJobs, // Temporarily include raw jobs for debugging
      log: log,
      diagnostics: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
        hasScraperApiKey: !!process.env.SCRAPER_API_KEY
      }
    });

  } catch (error) {
    console.error('[SEARCH] Fatal Search Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── LINKEDIN GUEST SCRAPER (JavaScript Regex equivalent of server.ps1) ───
async function scrapeLinkedIn() {
  const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
  const jobs = [];
  const seen = new Set();
  const keywords = [
    'product analyst', 'data analyst', 'business analyst',
    'product manager', 'growth analyst', 'analytics engineer',
    'decision scientist', 'business intelligence analyst',
    'associate product manager'
  ];

  for (const kw of keywords) {
    try {
      const encoded = encodeURIComponent(kw);
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encoded}&location=India&f_TPR=r604800&f_E=1,2&sortBy=DD&start=0`;
      
      const fetchUrl = SCRAPER_API_KEY
        ? `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&keep_headers=true&url=${encodeURIComponent(url)}`
        : url;

      const response = await fetch(fetchUrl, {
        headers: {
          ...USER_HEADERS,
          'Referer': 'https://www.linkedin.com/jobs/search/'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[SCRAPER] LinkedIn fetch failed [${kw}]: HTTP ${response.status} - ${errText}`);
        continue;
      }

      const html = await response.text();
      
      // Parse utilizing Regex
      const titleRegex = /class="base-search-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/g;
      const companyRegex = /class="base-search-card__subtitle[^"]*"[^>]*>\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
      const locRegex = /class="job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/g;
      const dateRegex = /datetime="([^"]+)"/g;
      const linkRegex = /href="(https:\/\/[^"]*?linkedin\.com\/jobs\/view\/[^"?]+)/g;

      // Extract all matches
      const titles = getAllMatches(html, titleRegex);
      const companies = getAllMatches(html, companyRegex);
      const locs = getAllMatches(html, locRegex);
      const dates = getAllMatches(html, dateRegex);
      const links = getAllMatches(html, linkRegex);

      const count = Math.min(titles.length, links.length);
      for (let i = 0; i < count; i++) {
        const title = stripHtml(titles[i]);
        const company = companies[i] ? stripHtml(companies[i]) : 'Not mentioned';
        const loc = locs[i] ? stripHtml(locs[i]) : 'India';
        const link = links[i] ? links[i].trim() : 'https://www.linkedin.com/jobs';
        const dateRaw = dates[i] ? dates[i].trim() : '';
        const date = dateRaw ? formatDate(dateRaw) : 'Not mentioned';

        if (!title) continue;
        const key = `${title}|${company}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        jobs.push({
          jobTitle: title,
          companyName: company,
          location: loc,
          experience: 'Not mentioned',
          datePosted: date,
          jobUrl: link,
          source: 'LinkedIn'
        });
      }
      
      // Avoid rate limits
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.error(`[SCRAPER] LinkedIn error [${kw}]:`, e.message);
    }
  }
  return jobs;
}

// ── INTERNSHALA GUEST SCRAPER (JavaScript Regex equivalent of server.ps1) ──
async function scrapeInternshala() {
  const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
  const jobs = [];
  const seen = new Set();
  const searches = [
    'product-analyst', 'data-analyst', 'business-analyst',
    'product-manager', 'growth-analyst', 'analytics-engineer'
  ];

  for (const s of searches) {
    try {
      const url = `https://internshala.com/jobs/${s}-jobs-in-india/`;
      
      const fetchUrl = SCRAPER_API_KEY
        ? `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`
        : url;

      const response = await fetch(fetchUrl, {
        headers: SCRAPER_API_KEY ? {} : USER_HEADERS,
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) continue;

      const html = await response.text();

      const titleLinkRegex = /class="job-title-href[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
      const companyRegex = /class="company-name[^"]*"[^>]*>(.*?)<\/[a-z]+>/g;
      const locRegex = /class="locations-label[^"]*"[^>]*>(.*?)<\/span>/g;

      // Extract all
      const companies = getAllMatches(html, companyRegex);
      const locs = getAllMatches(html, locRegex);
      
      // Title link regex returns two groups: 1 = url, 2 = title text
      let match;
      let i = 0;
      while ((match = titleLinkRegex.exec(html)) !== null) {
        const link = match[1].trim();
        const title = stripHtml(match[2]);
        const company = companies[i] ? stripHtml(companies[i]) : 'Not mentioned';
        const loc = locs[i] ? stripHtml(locs[i]) : 'India';

        const fullLink = link.startsWith('http') ? link : `https://internshala.com${link}`;
        
        if (title) {
          const key = `${title}|${company}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            jobs.push({
              jobTitle: title,
              companyName: company,
              location: loc || 'India',
              experience: 'Not mentioned',
              datePosted: 'Not mentioned',
              jobUrl: fullLink,
              source: 'Internshala'
            });
          }
        }
        i++;
      }

      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      console.error(`[SCRAPER] Internshala error [${s}]:`, e.message);
    }
  }
  return jobs;
}

// ── UTILS ────────────────────────────────────────────────────────────────
function getAllMatches(html, regex) {
  const matches = [];
  let m;
  // Reset regex index
  regex.lastIndex = 0;
  while ((m = regex.exec(html)) !== null) {
    matches.push(m[1] || m[0]);
  }
  return matches;
}

function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const diffTime = Math.abs(new Date() - d);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 14) return '1 week ago';
    return '2+ weeks ago';
  } catch (e) {
    return 'Not mentioned';
  }
}

function applyFilters(jobs) {
  const seen = new Set();
  const result = [];

  for (const job of jobs) {
    if (!job) continue;
    const tl = job.jobTitle.toLowerCase();
    
    // Keyword match
    const hasKw = VALID_KEYWORDS.some(kw => tl.includes(kw));
    if (!hasKw) continue;

    // Location exclusion
    const ll = job.location.toLowerCase();
    const isExcluded = EXCL_LOCATIONS.some(ex => ll.includes(ex));
    if (isExcluded) continue;

    // Deduplicate
    const key = `${job.jobTitle}|${job.companyName}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push(job);
  }
  return result;
}
