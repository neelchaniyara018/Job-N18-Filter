// scrapers/adzuna_api.js — Adzuna Jobs API
// Free API: register at https://developer.adzuna.com/
// Set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env file

const axios = require('axios');

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs/in/search/1';

const SEARCH_QUERIES = [
  'product analyst',
  'data analyst',
  'business analyst',
  'product manager',
  'growth analyst',
  'analytics engineer',
  'business intelligence analyst',
  'decision scientist',
  'wfm analyst',
  'product operations analyst',
  'associate product manager'
];

async function searchAdzuna(roles) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.log('[Adzuna] No API key configured. Skipping. (Set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env)');
    return [];
  }

  console.log('[Adzuna] Starting search...');
  const allJobs = [];
  const seenIds = new Set();

  for (const query of SEARCH_QUERIES) {
    try {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: 20,
        what: query,
        where: 'india',
        max_days_old: 7,
        sort_by: 'date',
        content_type: 'application/json'
      });

      const response = await axios.get(`${ADZUNA_BASE}?${params}`, {
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
      });

      const jobs = response.data?.results || [];

      for (const job of jobs) {
        const jobId = job.id || job.redirect_url;
        if (seenIds.has(jobId)) continue;
        seenIds.add(jobId);

        // Parse location
        const location = [
          job.location?.area?.[job.location.area.length - 1],
          job.location?.display_name
        ].filter(Boolean)[0] || 'India';

        // Parse date
        const created = job.created ? formatDate(job.created) : 'Not mentioned';

        allJobs.push({
          jobTitle: job.title || 'Unknown',
          companyName: job.company?.display_name || 'Not mentioned',
          location,
          experience: 'Not mentioned',
          datePosted: created,
          jobUrl: job.redirect_url || job.adref || '',
          source: 'Adzuna'
        });
      }

      await delay(300);
    } catch (err) {
      console.error(`[Adzuna] Error for "${query}":`, err.message);
    }
  }

  console.log(`[Adzuna] Found ${allJobs.length} jobs`);
  return allJobs;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return `${Math.floor(diffDays / 7)} week(s) ago`;
  } catch {
    return 'Not mentioned';
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchAdzuna };
