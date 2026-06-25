// scraper_instahyre.js — Instahyre scraper
/**
 * Scrape Instahyre for a given job title
 * @param {Object} page - Puppeteer page object
 * @param {string} jobTitle - Job title to search for
 * @returns {Array} - Array of job objects
 */
async function scrapeInstahyre(page, jobTitle) {
  const jobs = [];
  const encodedTitle = encodeURIComponent(jobTitle);
  const searchUrl = `https://www.instahyre.com/search-jobs/?designation=${encodedTitle}&location=India`;

  console.log(`  🔍 Instahyre: Searching "${jobTitle}"...`);

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    const pageTitle = await page.title();
    if (pageTitle.toLowerCase().includes('login') || pageTitle.toLowerCase().includes('sign in')) {
      console.log(`  ⚠️ Instahyre: Login wall detected for "${jobTitle}", trying without auth...`);
    }

    // Scroll down
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 700));
    }

    const extractedJobs = await page.evaluate(() => {
      const cardSelectors = [
        '.opportunity-card',
        '.job-card',
        '.search-results-card',
        '[class*="opportunityCard"]',
        '[class*="job-item"]',
        '.card-container'
      ];

      let cards = [];
      for (const sel of cardSelectors) {
        cards = document.querySelectorAll(sel);
        if (cards.length > 0) break;
      }

      const results = [];
      cards.forEach(card => {
        try {
          // Title
          const titleEl = card.querySelector('h2, h3, .job-title, .opportunity-title, [class*="title"]');
          const title = titleEl ? titleEl.textContent.trim() : '';

          // Company
          const compEl = card.querySelector('.company-name, [class*="company"], .employer-name');
          const company = compEl ? compEl.textContent.trim() : '';

          // Location
          const locEl = card.querySelector('.location, [class*="location"], .city');
          const location = locEl ? locEl.textContent.trim() : '';

          // Experience
          const expEl = card.querySelector('.experience, [class*="exp"], .work-experience');
          const experience = expEl ? expEl.textContent.trim() : '';

          // Link
          const linkEl = card.querySelector('a[href*="/job"], a[href*="/opportunity"], a');
          let link = linkEl ? linkEl.getAttribute('href') : '';
          if (link && !link.startsWith('http')) link = 'https://www.instahyre.com' + link;

          if (title && company) {
            results.push({ title, company, location, experience, link });
          }
        } catch (e) {}
      });

      return results;
    });

    for (const j of extractedJobs) {
      jobs.push({
        title: j.title,
        company: j.company,
        location: j.location || 'India',
        experience: j.experience || 'Not mentioned',
        datePosted: 'Not mentioned',
        link: j.link || `https://www.instahyre.com/search-jobs/?designation=${encodedTitle}`,
        source: 'Instahyre'
      });
    }

    console.log(`  📋 Instahyre: Found ${jobs.length} results for "${jobTitle}"`);
  } catch (err) {
    console.error(`  ❌ Instahyre error for "${jobTitle}": ${err.message}`);
  }

  return jobs;
}

module.exports = { scrapeInstahyre };
