// scrapers/internshala_api.js — Internshala job search scraper
// Uses Internshala's HTML listing pages

const axios = require('axios');
const cheerio = require('cheerio');

async function searchInternshala(roles, selectedLocation) {
  console.log('[Internshala] Starting search...');
  const allJobs = [];
  const seenUrls = new Set();

  let searches = [];
  if (roles && roles.length > 0) {
    searches = roles.map(r => r.replace(/ /g, '-').toLowerCase());
  } else {
    searches = [
      'product-analyst', 'data-analyst', 'business-analyst',
      'product-manager', 'growth-analyst', 'analytics-engineer'
    ];
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://internshala.com/'
  };

  for (const s of searches) {
    try {
      let url = `https://internshala.com/jobs/${s}-jobs-in-india/`;
      if (selectedLocation) {
        const locDash = selectedLocation.replace(/ /g, '-').toLowerCase();
        url = `https://internshala.com/jobs/${s}-jobs-in-${locDash}/`;
      }

      const response = await axios.get(url, {
        headers: headers,
        timeout: 15000
      });

      const html = response.data;
      const $ = cheerio.load(html);

      $('.individual_internship').each((_, el) => {
        const $el = $(el);
        const titleEl = $el.find('a.job-title-href');
        const title = titleEl ? titleEl.text().trim() : '';
        const href = titleEl ? titleEl.attr('href') : '';
        if (!title || !href) return;

        const jobUrl = href.startsWith('http') ? href : `https://internshala.com${href}`;
        if (seenUrls.has(jobUrl)) return;
        seenUrls.add(jobUrl);

        const company = $el.find('.company-name').text().trim() || 'Not mentioned';
        const location = $el.find('.locations').text().trim() || selectedLocation || 'India';

        let experience = 'Not mentioned';
        $el.find('.row-1-item').each((_, item) => {
          const text = $(item).text().trim();
          if (text.includes('year') || text.includes('yr') || text.includes('fresher')) {
            experience = text;
          }
        });

        const datePosted = $el.find('.detail-row-2, .status-inactive, .status-active').first().text().trim().replace(/\n/g, ' ') || 'Not mentioned';

        allJobs.push({
          jobTitle: title,
          companyName: company,
          location: location,
          experience: experience,
          datePosted: datePosted,
          jobUrl: jobUrl,
          source: 'Internshala'
        });
      });

      // Politeness delay
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`[Internshala] Error for "${s}":`, err.message);
    }
  }

  console.log(`[Internshala] Found ${allJobs.length} jobs`);
  return allJobs;
}

module.exports = { searchInternshala };
