// scrapers/naukri_api.js — Naukri.com JSON API scraper
// Uses Naukri's internal search API with proper headers

const axios = require('axios');

const NAUKRI_API = 'https://www.naukri.com/jobapi/v3/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'appid': '109',
  'systemid': '109',
  'x-http-method-override': 'GET',
  'Referer': 'https://www.naukri.com/',
  'Origin': 'https://www.naukri.com'
};

// Map keywords to Naukri search queries
const NAUKRI_SEARCHES = [
  { keyword: 'product analyst', expMin: 0, expMax: 3 },
  { keyword: 'data analyst', expMin: 0, expMax: 3 },
  { keyword: 'business analyst', expMin: 0, expMax: 3 },
  { keyword: 'product manager', expMin: 0, expMax: 3 },
  { keyword: 'growth analyst', expMin: 0, expMax: 3 },
  { keyword: 'analytics engineer', expMin: 0, expMax: 3 },
  { keyword: 'business intelligence analyst', expMin: 0, expMax: 3 },
  { keyword: 'decision scientist', expMin: 0, expMax: 3 },
  { keyword: 'product operations analyst', expMin: 0, expMax: 3 },
  { keyword: 'wfm analyst', expMin: 0, expMax: 3 },
];

async function searchNaukri(roles) {
  console.log('[Naukri] Starting search...');
  const allJobs = [];
  const seenUrls = new Set();

  for (const search of NAUKRI_SEARCHES) {
    try {
      const params = new URLSearchParams({
        noOfResults: 30,
        urlType: 'search_by_key_loc',
        searchType: 'adv',
        keyword: search.keyword,
        pageNo: 1,
        experience: search.expMin,
        k: search.keyword,
        seoKey: search.keyword.replace(/ /g, '-') + '-jobs',
        src: 'jobsearchDesk',
        latLong: '',
      });

      const url = `${NAUKRI_API}?${params}`;
      const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000
      });

      const data = response.data;
      const jobList = data?.jobDetails || data?.jobs || [];

      for (const job of jobList) {
        const jobUrl = job.jdURL || job.jobLink || '';
        if (seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        // Parse experience
        const expMin = job.experienceText?.split('-')[0]?.trim() || job.minExp || '';
        const expMax = job.experienceText?.split('-')[1]?.split(' ')[0]?.trim() || job.maxExp || '';
        const experience = expMin || expMax ? `${expMin}-${expMax} Yrs` : 'Not mentioned';

        allJobs.push({
          jobTitle: job.title || job.jobTitle || 'Unknown',
          companyName: job.companyName || job.company || 'Unknown',
          location: Array.isArray(job.placeholders)
            ? job.placeholders.find(p => p.type === 'location')?.label || 'India'
            : (job.location || 'India'),
          experience: experience,
          datePosted: job.footerPlaceholderLabel || job.postDate || 'Not mentioned',
          jobUrl: jobUrl.startsWith('http') ? jobUrl : `https://www.naukri.com${jobUrl}`,
          source: 'Naukri'
        });
      }

      // Rate limit
      await delay(500);
    } catch (err) {
      console.error(`[Naukri] Error for "${search.keyword}":`, err.message);
    }
  }

  console.log(`[Naukri] Found ${allJobs.length} jobs`);
  return allJobs;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchNaukri };
