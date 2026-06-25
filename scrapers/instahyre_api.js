// scrapers/instahyre_api.js — Instahyre job search
// Uses Instahyre's public job listing endpoint

const axios = require('axios');
const cheerio = require('cheerio');

const INSTAHYRE_BASE = 'https://www.instahyre.com';

const SEARCH_QUERIES = [
  { designation: 'product analyst', min_exp: 0, max_exp: 3 },
  { designation: 'data analyst', min_exp: 0, max_exp: 3 },
  { designation: 'business analyst', min_exp: 0, max_exp: 3 },
  { designation: 'product manager', min_exp: 0, max_exp: 3 },
  { designation: 'analytics engineer', min_exp: 0, max_exp: 3 },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.instahyre.com/'
};

async function searchInstahyre(roles) {
  console.log('[Instahyre] Starting search...');
  const allJobs = [];
  const seenUrls = new Set();

  for (const search of SEARCH_QUERIES) {
    try {
      const params = new URLSearchParams({
        designation: search.designation,
        min_exp: search.min_exp,
        max_exp: search.max_exp
      });

      const url = `${INSTAHYRE_BASE}/search-jobs/?${params}`;
      const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Find all job cards
      $('.employer-block, [ng-repeat]').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a[id="employer-profile-opportunity"]').attr('href') || '';
        if (!link || seenUrls.has(link)) return;
        seenUrls.add(link);

        // Parse from link URL: /job-428273-lead-android-engineer-at-godaddy-pune/
        const linkMatch = link.match(/\/job-\d+-(.+?)-at-(.+?)-(.+?)\/?$/);
        const titleFromLink = linkMatch ? linkMatch[1].replace(/-/g, ' ') : '';
        const companyFromLink = linkMatch ? linkMatch[2].replace(/-/g, ' ') : '';
        const locationFromLink = linkMatch ? linkMatch[3].replace(/-/g, ' ') : 'India';

        // Also try to get text content
        const textLines = $el.text().split('\n').map(l => l.trim()).filter(l => l.length > 2);
        const title = titleFromLink || textLines[0] || 'Unknown';
        const company = companyFromLink || 'Not mentioned';
        const location = textLines.find(l => l.includes('available in'))?.replace('Job available in', '').trim() || locationFromLink || 'India';

        allJobs.push({
          jobTitle: toTitleCase(title),
          companyName: toTitleCase(company),
          location: toTitleCase(location),
          experience: 'Not mentioned',
          datePosted: 'Not mentioned',
          jobUrl: link.startsWith('http') ? link : `${INSTAHYRE_BASE}${link}`,
          source: 'Instahyre'
        });
      });

      await delay(800);
    } catch (err) {
      console.error(`[Instahyre] Error for "${search.designation}":`, err.message);
    }
  }

  console.log(`[Instahyre] Found ${allJobs.length} jobs`);
  return allJobs;
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchInstahyre };
