// scrapers/linkedin_api.js — LinkedIn Jobs public search
// Uses LinkedIn's public job search API (no auth needed)

const axios = require('axios');

const LINKEDIN_JOBS_API = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

const SEARCHES = [
  { keywords: 'product analyst', location: 'India', f_TPR: 'r604800' },
  { keywords: 'data analyst', location: 'India', f_TPR: 'r604800' },
  { keywords: 'business analyst', location: 'India', f_TPR: 'r604800' },
  { keywords: 'product manager', location: 'India', f_TPR: 'r604800' },
  { keywords: 'growth analyst', location: 'India', f_TPR: 'r604800' },
  { keywords: 'analytics engineer', location: 'India', f_TPR: 'r604800' },
  { keywords: 'business intelligence analyst', location: 'India', f_TPR: 'r604800' },
  { keywords: 'decision scientist', location: 'India', f_TPR: 'r604800' },
  { keywords: 'associate product manager', location: 'India', f_TPR: 'r604800' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.linkedin.com/jobs/search/'
};

async function searchLinkedIn(roles) {
  console.log('[LinkedIn] Starting search...');
  const allJobs = [];
  const seenIds = new Set();

  for (const search of SEARCHES) {
    try {
      const params = new URLSearchParams({
        keywords: search.keywords,
        location: search.location,
        f_TPR: search.f_TPR,  // r604800 = last 7 days in seconds
        f_WT: '1,2,3',        // on-site, remote, hybrid
        sortBy: 'DD',         // date descending
        start: 0,
        count: 25
      });

      const url = `https://www.linkedin.com/jobs/search/?${params}&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0`;

      // Use LinkedIn's jobs HTML endpoint (public, no auth)
      const response = await axios.get(
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(search.keywords)}&location=India&f_TPR=r604800&sortBy=DD`,
        {
          headers: HEADERS,
          timeout: 15000
        }
      );

      // Parse HTML to extract job data
      const html = response.data;
      const jobMatches = html.match(/<li[^>]*class="[^"]*result-card[^"]*"[^>]*>[\s\S]*?<\/li>/g) || [];

      // Try JSON-LD data embedded in page
      const jsonLdMatch = html.match(/<script type="application\/json" data-islands-store="[^"]*">([\s\S]*?)<\/script>/);

      // Parse job cards from HTML
      const titleMatches = html.match(/aria-label="([^"]+)" class="base-card__full-link/g) || [];
      const companyMatches = html.match(/class="hidden-nested-link">([^<]+)<\/a>/g) || [];
      const locationMatches = html.match(/class="job-search-card__location">([^<]+)<\/span>/g) || [];
      const linkMatches = html.match(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"]+)"/g) || [];
      const dateMatches = html.match(/datetime="([^"]+)"/g) || [];

      const count = Math.min(titleMatches.length, linkMatches.length);

      for (let i = 0; i < count; i++) {
        const titleEl = titleMatches[i];
        const title = titleEl?.match(/aria-label="([^"]+)"/)?.[1] || 'Unknown';
        const link = linkMatches[i]?.replace('href="', '')?.replace('"', '') || '';
        const jobId = link.match(/\/jobs\/view\/(\d+)/)?.[1] || link;

        if (!link || seenIds.has(jobId)) continue;
        seenIds.add(jobId);

        const companyEl = companyMatches[i] || '';
        const company = companyEl.replace(/class="hidden-nested-link">/, '').replace('</a>', '').trim();

        const locationEl = locationMatches[i] || '';
        const location = locationEl.replace(/class="job-search-card__location">/, '').replace('</span>', '').trim();

        const dateEl = dateMatches[i] || '';
        const dateStr = dateEl.replace('datetime="', '').replace('"', '');
        const datePosted = dateStr ? formatDate(dateStr) : 'Not mentioned';

        allJobs.push({
          jobTitle: title,
          companyName: company || 'Not mentioned',
          location: location || 'India',
          experience: 'Not mentioned',
          datePosted,
          jobUrl: link,
          source: 'LinkedIn'
        });
      }

      await delay(1000); // Be polite to LinkedIn

    } catch (err) {
      console.error(`[LinkedIn] Error for "${search.keywords}":`, err.message);
    }
  }

  console.log(`[LinkedIn] Found ${allJobs.length} jobs`);
  return allJobs;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 14) return '1 week ago';
    return '2+ weeks ago';
  } catch {
    return 'Not mentioned';
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchLinkedIn };
