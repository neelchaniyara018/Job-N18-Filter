// scraper_naukri.js — Naukri.com scraper
const config = require('./config');

/**
 * Scrape Naukri.com for a given job title
 * @param {Object} page - Puppeteer page object
 * @param {string} jobTitle - Job title to search for
 * @returns {Array} - Array of job objects
 */
async function scrapeNaukri(page, jobTitle) {
  const jobs = [];
  const urlTitle = jobTitle.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');
  const searchUrl = `https://www.naukri.com/${urlTitle}-jobs-in-india?experience=0,3`;

  console.log(`  🔍 Naukri: Searching "${jobTitle}"...`);

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll down to load more results
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Extract job cards
    const extractedJobs = await page.evaluate((title) => {
      const jobCards = document.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, [data-job-id]');
      const results = [];

      jobCards.forEach(card => {
        try {
          // Job title
          const titleEl = card.querySelector('.title, .jobTitle, [class*="title"], a[title]');
          const jobTitle = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';

          // Company
          const compEl = card.querySelector('.comp-name, .companyName, [class*="company"]');
          const company = compEl ? compEl.textContent.trim() : '';

          // Location
          const locEl = card.querySelector('.loc, .location, .locWdth, [class*="location"]');
          const location = locEl ? locEl.textContent.trim() : '';

          // Experience
          const expEl = card.querySelector('.exp, .experience, .expwdth, [class*="exp"]');
          const experience = expEl ? expEl.textContent.trim() : '';

          // Date
          const dateEl = card.querySelector('.job-post-day, .date, [class*="date"], .time');
          const datePosted = dateEl ? dateEl.textContent.trim() : '';

          // Link
          const linkEl = card.querySelector('a.title, a.jobTitle, a[href*="/job-listings"]');
          let link = linkEl ? linkEl.getAttribute('href') : '';
          if (link && !link.startsWith('http')) link = 'https://www.naukri.com' + link;

          if (jobTitle && company && link) {
            results.push({ jobTitle, company, location, experience, datePosted, link });
          }
        } catch (e) {}
      });

      return results;
    }, jobTitle);

    for (const j of extractedJobs) {
      jobs.push({
        title: j.jobTitle,
        company: j.company,
        location: j.location || 'India',
        experience: j.experience || 'Not mentioned',
        datePosted: j.datePosted || 'Not mentioned',
        link: j.link,
        source: 'Naukri'
      });
    }

    // Try page 2 if < 10 results
    if (jobs.length < 10) {
      try {
        const nextBtn = await page.$('.pagination-next, button[aria-label="Next"], a[aria-label="Next"]');
        if (nextBtn) {
          await nextBtn.click();
          await new Promise(r => setTimeout(r, 3000));

          const moreJobs = await page.evaluate(() => {
            const cards = document.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple');
            return Array.from(cards).map(card => {
              const titleEl = card.querySelector('.title, .jobTitle, [class*="title"]');
              const compEl = card.querySelector('.comp-name, .companyName');
              const locEl = card.querySelector('.loc, .location');
              const expEl = card.querySelector('.exp, .experience');
              const dateEl = card.querySelector('.job-post-day, .date');
              const linkEl = card.querySelector('a.title, a.jobTitle');
              return {
                jobTitle: titleEl ? titleEl.textContent.trim() : '',
                company: compEl ? compEl.textContent.trim() : '',
                location: locEl ? locEl.textContent.trim() : '',
                experience: expEl ? expEl.textContent.trim() : '',
                datePosted: dateEl ? dateEl.textContent.trim() : '',
                link: linkEl ? linkEl.getAttribute('href') : ''
              };
            }).filter(j => j.jobTitle && j.company);
          });

          for (const j of moreJobs) {
            let link = j.link || '';
            if (link && !link.startsWith('http')) link = 'https://www.naukri.com' + link;
            jobs.push({
              title: j.jobTitle,
              company: j.company,
              location: j.location || 'India',
              experience: j.experience || 'Not mentioned',
              datePosted: j.datePosted || 'Not mentioned',
              link,
              source: 'Naukri'
            });
          }
        }
      } catch (e) {}
    }

    console.log(`  📋 Naukri: Found ${jobs.length} results for "${jobTitle}"`);
  } catch (err) {
    console.error(`  ❌ Naukri error for "${jobTitle}": ${err.message}`);
  }

  return jobs;
}

module.exports = { scrapeNaukri };
