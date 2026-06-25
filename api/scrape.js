// api/scrape.js — Cloud Scraper for Naukri & Instahyre
// Scrapes job listings via ScraperAPI and upserts them to Supabase.
// Runs automatically via Vercel Cron or on demand.

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ success: false, error: 'Supabase credentials missing in environment variables.' });
  }
  if (!SCRAPER_API_KEY) {
    return res.status(500).json({ success: false, error: 'SCRAPER_API_KEY missing in environment variables.' });
  }

  const { portal } = req.query || {};
  const targetPortal = portal ? portal.toLowerCase().trim() : null;

  console.log(`[SCRAPE] Starting scraping execution (filter: ${targetPortal || 'none'})...`);

  const keywords = [
    'product analyst', 'data analyst', 'business analyst',
    'product manager', 'growth analyst', 'analytics engineer',
    'business intelligence analyst', 'decision scientist'
  ];

  const instahyreUrls = [
    "https://www.instahyre.com/search-jobs/?designation=product+analyst&min_exp=0&max_exp=3",
    "https://www.instahyre.com/search-jobs/?designation=data+analyst&min_exp=0&max_exp=3",
    "https://www.instahyre.com/search-jobs/?designation=business+analyst&min_exp=0&max_exp=3",
    "https://www.instahyre.com/search-jobs/?designation=product+manager&min_exp=0&max_exp=3",
    "https://www.instahyre.com/search-jobs/?designation=analytics+engineer&min_exp=0&max_exp=3"
  ];

  const allJobs = [];
  const log = [];

  // ScraperAPI has a concurrency limit of 5 requests for the free tier.
  // We will run scraping requests in batches of 4 URLs.
  const batchSize = 4;

  try {
    // ── SCRAPE NAUKRI ────────────────────────────────────────────────────────
    if (!targetPortal || targetPortal === 'naukri') {
      console.log(`[SCRAPE] Fetching ${keywords.length} Naukri keywords via JSON API...`);
      for (let i = 0; i < keywords.length; i += batchSize) {
        const batch = keywords.slice(i, i + batchSize);
        console.log(`[SCRAPE] Naukri Keyword Batch ${Math.floor(i / batchSize) + 1}...`);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (kw) => {
            const naukriApiUrl = 'https://www.naukri.com/jobapi/v3/search?' + [
              'noOfResults=30',
              'urlType=search_by_key_loc',
              'searchType=adv',
              'keyword=' + encodeURIComponent(kw),
              'pageNo=1',
              'experience=0',
              'k=' + encodeURIComponent(kw),
              'seoKey=' + encodeURIComponent(kw.replace(/ /g, '-') + '-jobs'),
              'src=jobsearchDesk'
            ].join('&');
            
            const apiURL = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&keep_headers=true&url=${encodeURIComponent(naukriApiUrl)}`;
            const response = await fetch(apiURL, {
              headers: {
                'Accept': 'application/json',
                'appid': '109',
                'systemid': '109',
                'x-http-method-override': 'GET',
                'Referer': 'https://www.naukri.com/',
                'Origin': 'https://www.naukri.com'
              },
              signal: AbortSignal.timeout(25000)
            });
            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(`HTTP ${response.status} - ${errBody}`);
            }
            const data = await response.json();
            
            const jobList = data?.jobDetails || data?.jobs || [];
            const parsedJobs = [];
            
            for (const job of jobList) {
              const jobUrl = job.jdURL || job.jobLink || '';
              if (!jobUrl) continue;
              
              const fullUrl = jobUrl.startsWith('http') ? jobUrl : `https://www.naukri.com${jobUrl}`;
              
              // Parse experience
              const expMin = job.experienceText?.split('-')[0]?.trim() || job.minExp || '';
              const expMax = job.experienceText?.split('-')[1]?.split(' ')[0]?.trim() || job.maxExp || '';
              const experience = expMin || expMax ? `${expMin}-${expMax} Yrs` : 'Not mentioned';
              
              // Location
              let location = 'India';
              if (Array.isArray(job.placeholders)) {
                location = job.placeholders.find(p => p.type === 'location')?.label || 'India';
              } else if (job.location) {
                location = job.location;
              }
              
              parsedJobs.push({
                jobUrl: fullUrl,
                jobTitle: (job.title || job.jobTitle || 'Unknown').trim(),
                companyName: (job.companyName || job.company || 'Unknown').trim(),
                location: location.trim(),
                experience: experience,
                datePosted: (job.footerPlaceholderLabel || job.postDate || 'Not mentioned').trim(),
                source: 'Naukri'
              });
            }
            return parsedJobs;
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            allJobs.push(...result.value);
          } else if (result.status === 'rejected') {
            console.error('[SCRAPE] Naukri keyword scrape failed:', result.reason.message);
          }
        }
      }
      console.log(`[SCRAPE] Scraped Naukri. Jobs gathered so far: ${allJobs.length}`);
    } else {
      console.log('[SCRAPE] Skipping Naukri as requested.');
    }

    // ── SCRAPE INSTAHYRE ─────────────────────────────────────────────────────
    if (!targetPortal || targetPortal === 'instahyre') {
      console.log(`[SCRAPE] Fetching ${instahyreUrls.length} Instahyre pages in batches...`);
      for (let i = 0; i < instahyreUrls.length; i += batchSize) {
        const batch = instahyreUrls.slice(i, i + batchSize);
        console.log(`[SCRAPE] Instahyre Batch ${Math.floor(i / batchSize) + 1}...`);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (url) => {
            const apiURL = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true`;
            const response = await fetch(apiURL, { signal: AbortSignal.timeout(25000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            return parseInstahyreHtml(html);
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            allJobs.push(...result.value);
          } else if (result.status === 'rejected') {
            console.error('[SCRAPE] Instahyre page scrape failed:', result.reason.message);
          }
        }
      }
      console.log(`[SCRAPE] Scraped Instahyre. Total jobs collected: ${allJobs.length}`);
    } else {
      console.log('[SCRAPE] Skipping Instahyre as requested.');
    }

    console.log(`[SCRAPE] Scrape complete. Total jobs collected: ${allJobs.length}`);

    if (allJobs.length === 0) {
      return res.status(200).json({ success: true, count: 0, message: 'No jobs found to save.' });
    }

    // ── UPLOAD / UPSERT TO SUPABASE ──────────────────────────────────────────
    const mappedForDb = allJobs.map(j => ({
      job_url: j.jobUrl,
      job_title: j.jobTitle,
      company_name: j.companyName,
      location: j.location,
      experience: j.experience,
      date_posted: j.datePosted,
      source: j.source
    }));

    // Deduplicate by job_url to prevent PostgreSQL ON CONFLICT error 21000
    const uniqueJobsMap = new Map();
    for (const job of mappedForDb) {
      if (job.job_url) {
        uniqueJobsMap.set(job.job_url, job);
      }
    }
    const deduplicatedJobs = Array.from(uniqueJobsMap.values());

    console.log(`[SUPABASE] Upserting ${deduplicatedJobs.length} unique jobs to database (filtered from ${mappedForDb.length})...`);
    const supabaseEndpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/jobs`;
    
    // We split into chunks of 100 to avoid request body size limits in Supabase
    const chunkSize = 100;
    let upsertedCount = 0;

    for (let i = 0; i < deduplicatedJobs.length; i += chunkSize) {
      const chunk = deduplicatedJobs.slice(i, i + chunkSize);
      const dbResponse = await fetch(supabaseEndpoint, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(chunk)
      });

      if (!dbResponse.ok) {
        const errorText = await dbResponse.text();
        throw new Error(`Supabase Upsert Failed: HTTP ${dbResponse.status} - ${errorText}`);
      }
      upsertedCount += chunk.length;
    }

    console.log(`[SUPABASE] Successfully upserted ${upsertedCount} unique jobs.`);
    
    return res.status(200).json({
      success: true,
      scrapedCount: allJobs.length,
      upsertedCount: upsertedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[SCRAPE] Fatal Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── NAUKRI PARSER (Node.js regex equivalent of PowerShell) ────────────────
function parseNaukriHtml(html) {
  const jobs = [];
  // Match the job card container
  const cardRegex = /class="srp-jobtuple-wrapper"[\s\S]*?<\/div>/g;
  let match;
  
  while ((match = cardRegex.exec(html)) !== null) {
    const snippet = match[0];
    
    const titleM = snippet.match(/class="title[^"]*"[^>]*title="([^"]+)"/);
    const hrefM = snippet.match(/class="title[^"]*"[^>]*href="([^"]+)"/);
    const compM = snippet.match(/class="[^"]*?comp-name[^"]*"[^>]*>(.*?)<\/a>/);
    const locM = snippet.match(/<span[^>]*?class="[^"]*?locWdth[^"]*"[^>]*>(.*?)<\/span>/);
    const expM = snippet.match(/<span[^>]*?class="[^"]*?expwdth[^"]*"[^>]*>(.*?)<\/span>/);
    const dateM = snippet.match(/<span[^>]*?class="[^"]*?job-post-day[^"]*"[^>]*>(.*?)<\/span>/);

    if (titleM && hrefM) {
      const cleanString = (str) => {
        if (!str) return '';
        // Strip HTML tags and entities
        return str
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
      };

      jobs.push({
        jobUrl: hrefM[1].trim(),
        jobTitle: cleanString(titleM[1]),
        companyName: cleanString(compM ? compM[1] : 'Not mentioned'),
        location: cleanString(locM ? locM[1] : 'India'),
        experience: cleanString(expM ? expM[1] : 'Not mentioned'),
        datePosted: cleanString(dateM ? dateM[1] : 'Not mentioned'),
        source: 'Naukri'
      });
    }
  }
  return jobs;
}

// ── INSTAHYRE PARSER (JSON-LD ItemList parser) ───────────────────────────
function parseInstahyreHtml(html) {
  const jobs = [];
  // Regex to match the JSON-LD script containing the ItemList
  const scriptRegex = /<script type="application\/ld\+json">(\{[\s\S]*?"@type"\s*:\s*"ItemList"[\s\S]*?\})<\/script>/g;
  const scriptMatch = scriptRegex.exec(html);
  
  if (scriptMatch) {
    try {
      const jsonObj = JSON.parse(scriptMatch[1]);
      const itemList = jsonObj.itemListElement || [];
      
      for (const item of itemList) {
        const name = item.name || '';
        const url = item.url || '';
        if (name && url) {
          // Name format is: "Job Title at Company Name"
          const parts = name.split(' at ');
          const title = parts[0].trim();
          const company = parts.length > 1 ? parts[1].trim() : 'Not mentioned';
          
          // Location is extracted from the last word in the URL before trailing slash
          const urlClean = url.replace(/\/$/, '');
          const urlParts = urlClean.split('-');
          let location = urlParts[urlParts.length - 1] || 'India';
          // Capitalize first letter
          location = location.charAt(0).toUpperCase() + location.slice(1);

          jobs.push({
            jobUrl: url.trim(),
            jobTitle: title,
            companyName: company,
            location: location,
            experience: '0-3 Yrs',
            datePosted: 'Not mentioned',
            source: 'Instahyre'
          });
        }
      }
    } catch (e) {
      console.error('[PARSER] Instahyre JSON-LD Parse Error:', e.message);
    }
  }
  return jobs;
}
