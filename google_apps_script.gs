// ═══════════════════════════════════════════════════════════════════════════
// JOB SEARCH AGENT — Google Apps Script
// Runs entirely on Google's cloud servers. No installation needed.
//
// HOW TO DEPLOY:
// 1. Go to https://script.google.com/
// 2. Create new project, paste this entire file
// 3. Click Deploy → New deployment → Web App
// 4. Set "Execute as" = Me, "Who has access" = Anyone
// 5. Click Deploy, copy the Web App URL
// 6. Paste that URL into job_search_ui.html (the SCRIPT_URL variable)
// ═══════════════════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '11jsmc9ctRpoOj0BEwhAA2JTQy46lI5yArINDdjSVhig';
const SHEET_NAME = 'Sheet1';

const HEADERS = [
  'Date Added', 'Job Title', 'Company', 'Location',
  'Experience', 'Date Posted', 'Source', 'Apply Link'
];

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'search';

  if (action === 'search') {
    return handleSearch(e);
  } else if (action === 'status') {
    return makeResponse({ status: 'running', spreadsheetId: SPREADSHEET_ID });
  }

  return makeResponse({ status: 'Job Agent API is ready' });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'upload') {
      const added = writeJobsToSheet(data.jobs || []);
      return makeResponse({ success: true, added });
    }

    // Default: full scrape + write
    return handleSearch(data);
  } catch (err) {
    return makeResponse({ success: false, error: err.message });
  }
}

// ── FULL SEARCH PIPELINE ──────────────────────────────────────────────────
function handleSearch(params) {
  let selectedTitle = '';
  let selectedLocation = '';
  let selectedExperience = '';

  if (params) {
    if (params.parameter) {
      selectedTitle = params.parameter.titles || '';
      selectedLocation = params.parameter.locations || '';
      selectedExperience = params.parameter.experience || '';
    } else {
      selectedTitle = params.titles || params.selectedTitles || '';
      selectedLocation = params.locations || params.selectedLocations || '';
      selectedExperience = params.experience || params.selectedExperiences || '';
    }
  }

  const allJobs = [];
  const log = [];

  // Run all scrapers with parameters
  const scrapers = [
    { name: 'Naukri', fn: function() { return scrapeNaukri(selectedTitle, selectedLocation); } },
    { name: 'Indeed', fn: function() { return scrapeIndeedRSS(selectedTitle, selectedLocation); } },
    { name: 'LinkedIn', fn: function() { return scrapeLinkedIn(selectedTitle, selectedLocation); } },
    { name: 'Shine', fn: function() { return scrapeShine(selectedTitle, selectedLocation); } },
    { name: 'Instahyre', fn: function() { return scrapeInstahyre(selectedTitle, selectedLocation); } },
    { name: 'Internshala', fn: function() { return scrapeInternshala(selectedTitle, selectedLocation); } },
  ];

  for (const scraper of scrapers) {
    try {
      const jobs = scraper.fn();
      log.push({ portal: scraper.name, found: jobs.length, status: 'ok' });
      allJobs.push(...jobs);
    } catch (err) {
      log.push({ portal: scraper.name, found: 0, status: 'error', error: err.message });
    }
  }

  // Filter and deduplicate
  const filtered = applyAllFilters(allJobs, selectedTitle, selectedLocation, selectedExperience);

  // Write to Google Sheet
  let added = 0;
  try {
    added = writeJobsToSheet(filtered);
  } catch (err) {
    log.push({ portal: 'Sheets', status: 'error', error: err.message });
  }

  return makeResponse({
    success: true,
    total: allJobs.length,
    filtered: filtered.length,
    added: added,
    jobs: filtered,
    log: log
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 1 — NAUKRI (JSON API)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeNaukri(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenUrls = {};

  let keywords = [];
  if (selectedTitle) {
    keywords.push(selectedTitle);
  } else {
    keywords = [
      'product analyst', 'data analyst', 'business analyst',
      'product manager', 'growth analyst', 'analytics engineer',
      'business intelligence analyst', 'decision scientist'
    ];
  }

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'appid': '109',
      'systemid': '109',
      'x-http-method-override': 'GET',
      'Referer': 'https://www.naukri.com/',
      'Origin': 'https://www.naukri.com'
    },
    muteHttpExceptions: true
  };

  for (const kw of keywords) {
    try {
      const url = 'https://www.naukri.com/jobapi/v3/search?' + [
        'noOfResults=20',
        'urlType=search_by_key_loc',
        'searchType=adv',
        'keyword=' + encodeURIComponent(kw),
        'pageNo=1',
        'experience=0',
        'k=' + encodeURIComponent(kw),
        'seoKey=' + encodeURIComponent(kw.replace(/ /g, '-') + '-jobs'),
        'src=jobsearchDesk'
      ].join('&');

      const resp = UrlFetchApp.fetch(url, options);
      if (resp.getResponseCode() !== 200) continue;

      const data = JSON.parse(resp.getContentText());
      const list = data.jobDetails || data.jobs || [];

      for (const job of list) {
        const rawUrl = job.jdURL || job.jobLink || '';
        const jobUrl = rawUrl.startsWith('http') ? rawUrl : 'https://www.naukri.com' + rawUrl;
        if (!jobUrl || seenUrls[jobUrl]) continue;
        seenUrls[jobUrl] = true;

        let location = 'India';
        if (Array.isArray(job.placeholders)) {
          const locPh = job.placeholders.find(function(p) { return p.type === 'location'; });
          if (locPh) location = locPh.label || 'India';
        } else if (job.location) {
          location = job.location;
        }

        jobs.push({
          jobTitle: (job.title || job.jobTitle || 'Unknown').trim(),
          companyName: (job.companyName || job.company || 'Unknown').trim(),
          location: location.trim(),
          experience: (job.experienceText || job.minExpLabel || 'Not mentioned').trim(),
          datePosted: (job.footerPlaceholderLabel || job.postDate || 'Not mentioned').trim(),
          jobUrl: jobUrl,
          source: 'Naukri'
        });
      }

      Utilities.sleep(400);
    } catch (err) {
      Logger.log('Naukri error [' + kw + ']: ' + err.message);
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 2 — INDEED (RSS Feed — bypasses CAPTCHA)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeIndeedRSS(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenUrls = {};

  let queries = [];
  if (selectedTitle) {
    queries.push(selectedTitle);
  } else {
    queries = [
      'product analyst', 'data analyst', 'business analyst',
      'product manager', 'growth analyst', 'analytics engineer'
    ];
  }

  const locationParam = selectedLocation || 'India';

  for (const q of queries) {
    try {
      const url = 'https://in.indeed.com/rss?q=' + encodeURIComponent(q) +
        '&l=' + encodeURIComponent(locationParam) + '&fromage=7&sort=date';

      const resp = UrlFetchApp.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)',
          'Accept': 'application/rss+xml,application/xml,text/xml'
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) continue;

      const xml = resp.getContentText();

      try {
        const doc = XmlService.parse(xml);
        const root = doc.getRootElement();
        const channel = root.getChild('channel');
        if (!channel) continue;
        const items = channel.getChildren('item');

        for (const item of items) {
          const title = item.getChildText('title') || '';
          const link = item.getChildText('link') || '';
          const description = item.getChildText('description') || '';
          const pubDate = item.getChildText('pubDate') || '';

          if (!link || seenUrls[link]) continue;
          seenUrls[link] = true;

          const compMatch = description.match(/Company:\s*([^<\n\r]+)/i) ||
            description.match(/<b>Company<\/b>\s*:?\s*([^<]+)/i);
          const locMatch = description.match(/Location:\s*([^<\n\r]+)/i) ||
            description.match(/<b>Location<\/b>\s*:?\s*([^<]+)/i);

          const company = compMatch ? compMatch[1].trim() : 'Not mentioned';
          const location = locMatch ? locMatch[1].trim() : locationParam;

          const cleanTitle = title.split(' - ')[0].trim();

          jobs.push({
            jobTitle: cleanTitle || title,
            companyName: company,
            location: location,
            experience: 'Not mentioned',
            datePosted: parseRSSDate(pubDate),
            jobUrl: link,
            source: 'Indeed'
          });
        }
      } catch (xmlErr) {
        const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        for (const block of itemMatches) {
          const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
            block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
          const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
          const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';

          if (!link || seenUrls[link]) continue;
          seenUrls[link] = true;

          jobs.push({
            jobTitle: title.split(' - ')[0].trim(),
            companyName: 'Not mentioned',
            location: locationParam,
            experience: 'Not mentioned',
            datePosted: parseRSSDate(pubDate),
            jobUrl: link,
            source: 'Indeed'
          });
        }
      }

      Utilities.sleep(400);
    } catch (err) {
      Logger.log('Indeed error [' + q + ']: ' + err.message);
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 3 — LINKEDIN (Public Guest API)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeLinkedIn(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenIds = {};

  let keywords = [];
  if (selectedTitle) {
    keywords.push(selectedTitle);
  } else {
    keywords = [
      'product analyst', 'data analyst', 'business analyst',
      'product manager', 'growth analyst', 'analytics engineer'
    ];
  }

  const locationParam = selectedLocation || 'India';

  for (const kw of keywords) {
    try {
      const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' +
        'keywords=' + encodeURIComponent(kw) +
        '&location=' + encodeURIComponent(locationParam) +
        '&f_TPR=r604800' +
        '&f_E=1,2' +
        '&sortBy=DD' +
        '&start=0';

      const resp = UrlFetchApp.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.linkedin.com/jobs/search/'
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) continue;

      const html = resp.getContentText();

      const jobIdMatches = html.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/g) || [];
      const titleMatches = html.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/g) || [];
      const companyMatches = html.match(/class="base-search-card__subtitle"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g) || [];
      const locationMatches = html.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/g) || [];
      const dateMatches = html.match(/class="job-search-card__listdate[^"]*"[^>]*datetime="([^"]+)"/g) || [];
      const linkMatches = html.match(/href="(https:\/\/[^"]*?linkedin\.com\/jobs\/view\/[^"?]+)/g) || [];

      const count = Math.min(titleMatches.length, linkMatches.length);

      for (let i = 0; i < count; i++) {
        const link = linkMatches[i] ? linkMatches[i].replace('href="', '') : '';
        const jobIdMatch = link.match(/\/jobs\/view\/(\d+)/);
        const jobId = jobIdMatch ? jobIdMatch[1] : link;

        if (!link || seenIds[jobId]) continue;
        seenIds[jobId] = true;

        const title = titleMatches[i] ? titleMatches[i].replace(/<[^>]+>/g, '').trim() : 'Unknown';
        const company = companyMatches[i] ? companyMatches[i].replace(/<[^>]+>/g, '').trim() : 'Not mentioned';
        const location = locationMatches[i] ? locationMatches[i].replace(/<[^>]+>/g, '').trim() : locationParam;
        const dateMatch = dateMatches[i] ? dateMatches[i].match(/datetime="([^"]+)"/) : null;
        const datePosted = dateMatch ? parseISODate(dateMatch[1]) : 'Not mentioned';

        jobs.push({
          jobTitle: title,
          companyName: company,
          location: location,
          experience: 'Not mentioned',
          datePosted: datePosted,
          jobUrl: link,
          source: 'LinkedIn'
        });
      }

      Utilities.sleep(600);
    } catch (err) {
      Logger.log('LinkedIn error [' + kw + ']: ' + err.message);
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 4 — SHINE.COM (JSON API)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeShine(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenIds = {};

  let keywords = [];
  if (selectedTitle) {
    keywords.push(selectedTitle);
  } else {
    keywords = [
      'product analyst', 'data analyst', 'business analyst',
      'product manager', 'growth analyst', 'analytics engineer'
    ];
  }

  for (const kw of keywords) {
    try {
      let url = 'https://www.shine.com/job-search/' + kw.replace(/ /g, '-') + '-jobs?q=' + encodeURIComponent(kw);
      if (selectedLocation) {
        url = 'https://www.shine.com/job-search/' + kw.replace(/ /g, '-') + '-jobs-in-' + selectedLocation.replace(/ /g, '-').toLowerCase() + '?q=' + encodeURIComponent(kw);
      }
      url += '&limit=20&offset=0';

      const resp = UrlFetchApp.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html'
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) continue;

      const html = resp.getContentText();

      const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});<\/script>/);
      if (jsonMatch) {
        try {
          const state = JSON.parse(jsonMatch[1]);
          const jobList = state.jobList || state.jobs || [];

          for (const job of jobList) {
            const jobId = job.id || job.jobId || '';
            if (!jobId || seenIds[jobId]) continue;
            seenIds[jobId] = true;

            jobs.push({
              jobTitle: (job.title || job.jobTitle || '').trim(),
              companyName: (job.company || job.companyName || 'Not mentioned').trim(),
              location: (job.location || job.city || selectedLocation || 'India').trim(),
              experience: (job.minExp !== undefined ? job.minExp + '-' + job.maxExp + ' Yrs' : 'Not mentioned'),
              datePosted: job.postedOn || job.created || 'Not mentioned',
              jobUrl: job.url || job.applyUrl || ('https://www.shine.com' + (job.slug || '')),
              source: 'Shine'
            });
          }
        } catch (parseErr) {
        }
      }

      if (jobs.length === 0) {
        const titleMatches = html.match(/class="jobTitle[^"]*"[^>]*><a[^>]*>([\s\S]*?)<\/a>/g) || [];
        const companyMatches = html.match(/class="companyName[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|a)>/g) || [];

        for (let i = 0; i < titleMatches.length; i++) {
          const title = (titleMatches[i] || '').replace(/<[^>]+>/g, '').trim();
          const company = (companyMatches[i] || '').replace(/<[^>]+>/g, '').trim();
          if (!title) continue;

          jobs.push({
            jobTitle: title,
            companyName: company || 'Not mentioned',
            location: selectedLocation || 'India',
            experience: 'Not mentioned',
            datePosted: 'Not mentioned',
            jobUrl: url,
            source: 'Shine'
          });
        }
      }

      Utilities.sleep(400);
    } catch (err) {
      Logger.log('Shine error [' + kw + ']: ' + err.message);
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 5 — INSTAHYRE (HTML scraping)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeInstahyre(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenUrls = {};

  let designations = [];
  if (selectedTitle) {
    designations.push({ designation: selectedTitle.replace(/ /g, '+'), label: selectedTitle });
  } else {
    designations = [
      { designation: 'product+analyst', label: 'product analyst' },
      { designation: 'data+analyst', label: 'data analyst' },
      { designation: 'business+analyst', label: 'business analyst' },
      { designation: 'product+manager', label: 'product manager' },
      { designation: 'analytics+engineer', label: 'analytics engineer' }
    ];
  }

  for (const search of designations) {
    try {
      const url = 'https://www.instahyre.com/search-jobs/?designation=' + search.designation +
        '&min_exp=0&max_exp=3';

      const resp = UrlFetchApp.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Referer': 'https://www.instahyre.com/'
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) continue;

      const html = resp.getContentText();

      const linkMatches = html.match(/href="(\/job-\d+-[^"]+?)"/g) || [];

      for (const match of linkMatches) {
        const path = match.replace('href="', '').replace('"', '');
        const fullUrl = 'https://www.instahyre.com' + path;

        if (seenUrls[fullUrl]) continue;
        seenUrls[fullUrl] = true;

        const pathMatch = path.match(/\/job-\d+-(.+?)-at-(.+?)-(.+?)\/?$/);
        if (!pathMatch) continue;

        const title = pathMatch[1].replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
        const company = pathMatch[2].replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
        const location = pathMatch[3].replace(/-/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

        jobs.push({
          jobTitle: title,
          companyName: company,
          location: location,
          experience: '0-3 Yrs',
          datePosted: 'Not mentioned',
          jobUrl: fullUrl,
          source: 'Instahyre'
        });
      }

      Utilities.sleep(500);
    } catch (err) {
      Logger.log('Instahyre error [' + search.label + ']: ' + err.message);
    }
  }

  return jobs;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER 6 — INTERNSHALA (HTML scraping)
// ═══════════════════════════════════════════════════════════════════════════
function scrapeInternshala(selectedTitle, selectedLocation) {
  const jobs = [];
  const seenUrls = {};

  let searches = [];
  if (selectedTitle) {
    searches.push(selectedTitle.replace(/ /g, '-').toLowerCase());
  } else {
    searches = [
      'product-analyst', 'data-analyst', 'business-analyst',
      'product-manager', 'growth-analyst', 'analytics-engineer'
    ];
  }

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html'
    },
    muteHttpExceptions: true
  };

  for (const s of searches) {
    try {
      let url;
      if (selectedLocation) {
        const locDash = selectedLocation.replace(/ /g, '-').toLowerCase();
        url = 'https://internshala.com/jobs/' + s + '-jobs-in-' + locDash + '/';
      } else {
        url = 'https://internshala.com/jobs/' + s + '-jobs-in-india/';
      }

      const resp = UrlFetchApp.fetch(url, options);
      if (resp.getResponseCode() !== 200) continue;

      const html = resp.getContentText();

      // Extract using regex
      const titleMatches = html.match(/class="job-title-href[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g) || [];
      const companyMatches = html.match(/class="company-name[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/g) || [];
      const locationMatches = html.match(/class="locations-label[^"]*"[^>]*>([\s\S]*?)<\/span>/g) || [];

      const count = titleMatches.length;

      for (let i = 0; i < count; i++) {
        const titleMatch = titleMatches[i].match(/href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;

        const path = titleMatch[1].trim();
        const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        
        const company = companyMatches[i] ? companyMatches[i].replace(/<[^>]+>/g, '').trim() : 'Not mentioned';
        const location = locationMatches[i] ? locationMatches[i].replace(/<[^>]+>/g, '').trim() : (selectedLocation || 'India');

        const jobUrl = path.startsWith('http') ? path : 'https://internshala.com' + path;

        if (seenUrls[jobUrl]) continue;
        seenUrls[jobUrl] = true;

        jobs.push({
          jobTitle: title,
          companyName: company,
          location: location,
          experience: 'Not mentioned',
          datePosted: 'Not mentioned',
          jobUrl: jobUrl,
          source: 'Internshala'
        });
      }

      Utilities.sleep(500);
    } catch (err) {
      Logger.log('Internshala error [' + s + ']: ' + err.message);
    }
  }

  return jobs;
}

function matchJobTitle(jobTitle, selectedRole) {
  if (!selectedRole) return true;
  const title = (jobTitle || '').toLowerCase();
  const role = selectedRole.toLowerCase();

  if (title.indexOf(role) !== -1) return true;

  switch (role) {
    case 'software engineer': {
      const positive = ['software', 'sde', 'developer', 'programmer', 'frontend', 'backend', 'full stack', 'fullstack', 'ios', 'android', 'java', 'python', 'c++', 'golang', 'net', 'node', 'react', 'app engineer', 'application engineer', 'web engineer', 'mtech fresher'];
      const negative = ['data', 'ml', 'machine learning', 'ai', 'cloud', 'devops', 'sre', 'security', 'cyber', 'qa', 'test', 'civil', 'mechanical', 'electrical', 'network', 'system admin', 'support', 'analytics'];
      
      let hasPos = positive.some(function(p) { return title.indexOf(p) !== -1; });
      if (title.indexOf('engineer') !== -1 && !hasPos) {
        hasPos = true;
      }
      if (!hasPos) return false;
      return !negative.some(function(n) { return title.indexOf(n) !== -1; });
    }
    case 'full stack developer': {
      const positive = ['full stack', 'fullstack', 'mern', 'mean', 'full-stack'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'data scientist': {
      const positive = ['data scientist', 'data science', 'machine learning scientist', 'ai scientist', 'applied scientist'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'data analyst': {
      const positive = ['data analyst', 'data analytics', 'analytics analyst', 'decision scientist', 'product analyst', 'growth analyst', 'operations analyst', 'business intelligence analyst'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'bi analyst': {
      const positive = ['bi analyst', 'business intelligence', 'power bi', 'tableau', 'looker', 'qlik', 'bi engineer'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'machine learning engineer': {
      const positive = ['machine learning', 'ml engineer', 'ml developer', 'computer vision', 'nlp', 'ai engineer', 'deep learning', 'artificial intelligence engineer', 'mlops'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'data engineer': {
      const positive = ['data engineer', 'etl', 'big data', 'data pipeline', 'spark', 'hadoop', 'data warehouse'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'cloud engineer': {
      const positive = ['cloud engineer', 'aws engineer', 'azure engineer', 'gcp engineer', 'cloud architect', 'cloud developer', 'cloud platform'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'devops engineer': {
      const positive = ['devops', 'site reliability', 'sre', 'platform engineer', 'ci/cd', 'release engineer', 'systems engineer'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'cybersecurity analyst': {
      const positive = ['cybersecurity', 'cyber security', 'information security', 'security analyst', 'soc analyst', 'pentester', 'ethical hacker', 'security engineer', 'secops'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'marketing analyst': {
      const positive = ['marketing analyst', 'digital marketing', 'seo analyst', 'sem analyst', 'growth marketing', 'marketing coordinator'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'bda': {
      const positive = ['bda', 'business development', 'inside sales', 'sales development', 'sdr', 'bde', 'client relation', 'sales associate'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'human resources officer': {
      const positive = ['human resources', 'hr ', ' recruiter', 'talent acquisition', 'hr officer', 'hr generalist', 'hr executive', 'people operations'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'sales representative': {
      const positive = ['sales', 'account executive', 'business development', 'sales rep', 'sales executive', 'sales agent'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    case 'business analyst': {
      const positive = ['business analyst', 'ba ', 'business analysis', 'functional analyst', 'system analyst', 'systems analyst', 'product analyst'];
      return positive.some(function(p) { return title.indexOf(p) !== -1; });
    }
    default:
      return title.indexOf(role) !== -1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS — Keyword, Location, Experience, Date
// ═══════════════════════════════════════════════════════════════════════════
function applyAllFilters(jobs, selectedTitle, selectedLocation, selectedExperience) {
  const VALID_KEYWORDS = [
    'product analyst', 'data analyst', 'business analyst', 'product manager',
    'growth analyst', 'analytics engineer', 'wfm analyst', 'workforce management',
    'resource planning', 'business intelligence', 'bi analyst', 'decision scientist'
  ];

  const EXCLUDED_LOCATIONS = [
    'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia',
    'singapore', 'dubai', 'uae', 'germany', 'france', 'london', 'new york'
  ];

  const seenKeys = {};
  const filtered = [];

  for (const job of jobs) {
    if (!job) continue;
    const titleLower = (job.jobTitle || '').toLowerCase();

    // 1. Job Title Match
    if (!matchJobTitle(job.jobTitle, selectedTitle)) continue;

    // 2. Location Match
    const locLower = (job.location || '').toLowerCase();
    if (selectedLocation) {
      const sl = selectedLocation.toLowerCase();
      if (sl === "bengaluru") {
        if (locLower.indexOf("bengaluru") === -1 && locLower.indexOf("bangalore") === -1) continue;
      } else {
        if (locLower.indexOf(sl) === -1) continue;
      }
    } else {
      const isExcluded = EXCLUDED_LOCATIONS.some(function(excl) { return locLower.indexOf(excl) !== -1; });
      if (isExcluded) continue;
    }

    // 3. Experience Match
    if (selectedExperience) {
      const expStr = (job.experience || '').toLowerCase();
      let matchExp = true;
      const parts = selectedExperience.split('-');
      if (parts.length === 2) {
        const selMin = parseInt(parts[0], 10);
        const selMax = parseInt(parts[1], 10);

        if (expStr && expStr !== 'not mentioned') {
          let jobMin = 0;
          let jobMax = 0;

          if (expStr.indexOf('fresher') !== -1 || expStr.indexOf('entry') !== -1 || expStr.indexOf('intern') !== -1) {
            jobMin = 0;
            jobMax = 0;
          } else {
            const rangeMatch = expStr.match(/(\d+)\s*[-–to\s]+\s*(\d+)/);
            if (rangeMatch) {
              jobMin = parseInt(rangeMatch[1], 10);
              jobMax = parseInt(rangeMatch[2], 10);
            } else {
              const singleMatch = expStr.match(/^(\d+)/);
              if (singleMatch) {
                jobMin = parseInt(singleMatch[1], 10);
                jobMax = jobMin;
              }
            }
          }

          if (!(jobMin <= selMax && jobMax >= selMin)) {
            matchExp = false;
          }
        }
      }
      if (!matchExp) continue;
    }

    // 4. Date filter
    const dateStr = (job.datePosted || '').toLowerCase();
    if (dateStr.indexOf('month') !== -1 && dateStr.indexOf('1 month') === -1) continue;

    // 5. Deduplication
    const key = titleLower.trim() + '|' + (job.companyName || '').toLowerCase().trim();
    if (seenKeys[key]) continue;
    seenKeys[key] = true;

    filtered.push(job);
  }

  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS — Write jobs with deduplication
// ═══════════════════════════════════════════════════════════════════════════
function writeJobsToSheet(jobs) {
  if (!jobs || jobs.length === 0) return 0;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

  // Ensure header row
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#1a2235').setFontColor('#ffffff').setFontWeight('bold');
  }

  // Read existing jobs for deduplication
  const existingData = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
  const existingKeys = {};
  for (const row of existingData) {
    const key = (row[1] + '|' + row[2]).toLowerCase().trim(); // title|company
    existingKeys[key] = true;
  }

  // Build new rows
  const today = getTodayDate();
  const newRows = [];

  for (const job of jobs) {
    const key = ((job.jobTitle || '') + '|' + (job.companyName || '')).toLowerCase().trim();
    if (existingKeys[key]) continue;
    existingKeys[key] = true;

    newRows.push([
      today,
      job.jobTitle || '',
      job.companyName || '',
      job.location || '',
      job.experience || '',
      job.datePosted || '',
      job.source || '',
      job.jobUrl || ''
    ]);
  }

  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 8).setValues(newRows);

    // Style rows alternating
    for (let i = 0; i < newRows.length; i++) {
      const rowNum = startRow + i;
      const bg = i % 2 === 0 ? '#0d1525' : '#111f35';
      sheet.getRange(rowNum, 1, 1, 8).setBackground(bg).setFontColor('#e2e8f0');

      // Make job URL clickable
      if (newRows[i][7]) {
        sheet.getRange(rowNum, 8).setFormula('=HYPERLINK("' + newRows[i][7] + '","Apply →")');
      }
    }
  }

  return newRows.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function makeResponse(data) {
  const json = JSON.stringify(data);
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getTodayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return dd + '-' + mm + '-' + yyyy;
}

function parseRSSDate(dateStr) {
  if (!dateStr) return 'Not mentioned';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays <= 7) return diffDays + ' days ago';
    if (diffDays <= 14) return '1 week ago';
    if (diffDays <= 21) return '2 weeks ago';
    if (diffDays <= 31) return '3 weeks ago';
    return '1+ month ago';
  } catch (e) {
    return dateStr;
  }
}

function parseISODate(dateStr) {
  if (!dateStr) return 'Not mentioned';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays <= 7) return diffDays + ' days ago';
    if (diffDays <= 14) return '1 week ago';
    return '2+ weeks ago';
  } catch (e) {
    return 'Not mentioned';
  }
}
