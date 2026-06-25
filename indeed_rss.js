// scrapers/indeed_rss.js — Indeed India RSS Feed scraper
// RSS feeds bypass Cloudflare/CAPTCHA completely

const axios = require('axios');
const xml2js = require('xml2js');

const INDEED_RSS = 'https://in.indeed.com/rss';

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
  'product operations',
  'associate product manager'
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

async function searchIndeed(roles) {
  console.log('[Indeed] Starting RSS feed scrape...');
  const allJobs = [];
  const seenUrls = new Set();

  for (const query of SEARCH_QUERIES) {
    try {
      const params = new URLSearchParams({
        q: query,
        l: 'India',
        fromage: 7,  // Posted in last 7 days
        sort: 'date'
      });

      const url = `${INDEED_RSS}?${params}`;
      const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000
      });

      const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
      const items = parsed?.rss?.channel?.item || [];
      const itemArray = Array.isArray(items) ? items : [items];

      for (const item of itemArray) {
        const jobUrl = item.link || item.guid || '';
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        // Parse location from description or title
        const title = item.title || '';
        const description = item.description || '';

        // Extract location from description
        const locMatch = description.match(/Location:\s*([^<\n]+)/i) ||
                        description.match(/<b>Location<\/b>:?\s*([^<]+)/i);
        const location = locMatch ? locMatch[1].trim() : extractLocationFromTitle(title);

        // Extract company
        const companyMatch = description.match(/Company:\s*([^<\n]+)/i) ||
                            description.match(/<b>Company<\/b>:?\s*([^<]+)/i) ||
                            title.match(/^(.+?)\s+-\s+/);
        const company = companyMatch ? companyMatch[1].trim() : 'Not mentioned';

        // Parse job title (remove company from title if present)
        const cleanTitle = title.replace(/\s+-\s+.+$/, '').trim();

        // Parse posted date
        const pubDate = item.pubDate || '';
        const datePosted = pubDate ? formatDate(pubDate) : 'Not mentioned';

        allJobs.push({
          jobTitle: cleanTitle || title,
          companyName: company,
          location: location || 'India',
          experience: 'Not mentioned',
          datePosted,
          jobUrl,
          source: 'Indeed'
        });
      }

      await delay(500);
    } catch (err) {
      console.error(`[Indeed] Error for "${query}":`, err.message);
    }
  }

  console.log(`[Indeed] Found ${allJobs.length} jobs`);
  return allJobs;
}

function extractLocationFromTitle(title) {
  const parts = title.split(' - ');
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return 'India';
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
    if (diffDays <= 21) return '2 weeks ago';
    if (diffDays <= 28) return '3 weeks ago';
    return '1+ month ago';
  } catch {
    return dateStr;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchIndeed };
