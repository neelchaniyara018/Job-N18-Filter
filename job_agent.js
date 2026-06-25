// job_agent.js — Main Daily Job Search Agent Orchestrator
// Searches 5 job portals, filters results, deduplicates, writes to Google Sheets

require('dotenv').config();
const puppeteer = require('puppeteer');
const config = require('./config');
const { filterJobs, getTodayString } = require('./filters');
const { getExistingJobKeys, ensureHeaderRow, appendJobs } = require('./sheets_helper');
const { scrapeNaukri } = require('./scraper_naukri');
const { scrapeIndeed } = require('./scraper_indeed');
const { scrapeInstahyre } = require('./scraper_instahyre');
const { scrapeWellfound } = require('./scraper_wellfound');
const { scrapePMJobs } = require('./scraper_pmjobs');

// Delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

// Log with timestamp
function log(msg) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${msg}`);
}

async function runAgent() {
  const startTime = Date.now();
  log('🚀 Daily Job Search Agent started');
  log(`📅 Run date: ${getTodayString()}`);
  log(`📋 Searching ${config.JOB_TITLES.length} job titles across 5 portals`);
  console.log('='.repeat(60));

  // Stats tracking
  const stats = {
    Naukri: 0,
    Indeed: 0,
    Instahyre: 0,
    Wellfound: 0,
    PMJobs: 0,
    total: 0,
    skipped: 0
  };

  // Launch browser (headless by default, set headless: false for debugging)
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
  } catch (err) {
    log(`❌ Failed to launch browser: ${err.message}`);
    log('💡 Make sure Puppeteer is installed: npm install');
    process.exit(1);
  }

  // Step 1: Initialize Google Sheets
  log('\n📊 Initializing Google Sheets connection...');
  let existingKeys;
  try {
    await ensureHeaderRow();
    existingKeys = await getExistingJobKeys();
  } catch (err) {
    log(`❌ Google Sheets error: ${err.message}`);
    log('💡 Check your credentials/service_account.json file');
    await browser.close();
    process.exit(1);
  }

  // All jobs collected this run
  const allCollectedJobs = [];

  // Create a browser page
  const page = await browser.newPage();

  // Set user agent and other headers to avoid bot detection
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  await page.setViewport({ width: 1366, height: 768 });

  // ═══════════════════════════════════════════════════
  // SITE 1: NAUKRI.COM
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🌐 SITE 1/5: Naukri.com');
  log('═'.repeat(60));

  const naukriJobs = [];
  for (const title of config.JOB_TITLES) {
    const jobs = await scrapeNaukri(page, title);
    naukriJobs.push(...jobs);
    await delay(config.DELAY_BETWEEN_REQUESTS);
  }
  log(`📊 Naukri total raw: ${naukriJobs.length} jobs`);
  allCollectedJobs.push(...naukriJobs);
  await delay(config.DELAY_BETWEEN_SITES);

  // ═══════════════════════════════════════════════════
  // SITE 2: INDEED INDIA
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🌐 SITE 2/5: Indeed India');
  log('═'.repeat(60));

  const indeedJobs = [];
  for (const title of config.JOB_TITLES) {
    const jobs = await scrapeIndeed(page, title);
    indeedJobs.push(...jobs);
    await delay(config.DELAY_BETWEEN_REQUESTS);
  }
  log(`📊 Indeed total raw: ${indeedJobs.length} jobs`);
  allCollectedJobs.push(...indeedJobs);
  await delay(config.DELAY_BETWEEN_SITES);

  // ═══════════════════════════════════════════════════
  // SITE 3: INSTAHYRE
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🌐 SITE 3/5: Instahyre');
  log('═'.repeat(60));

  const instahyreJobs = [];
  for (const title of config.JOB_TITLES) {
    const jobs = await scrapeInstahyre(page, title);
    instahyreJobs.push(...jobs);
    await delay(config.DELAY_BETWEEN_REQUESTS);
  }
  log(`📊 Instahyre total raw: ${instahyreJobs.length} jobs`);
  allCollectedJobs.push(...instahyreJobs);
  await delay(config.DELAY_BETWEEN_SITES);

  // ═══════════════════════════════════════════════════
  // SITE 4: WELLFOUND
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🌐 SITE 4/5: Wellfound');
  log('═'.repeat(60));

  const wellfoundJobs = [];
  for (const title of config.JOB_TITLES) {
    const jobs = await scrapeWellfound(page, title);
    wellfoundJobs.push(...jobs);
    await delay(config.DELAY_BETWEEN_REQUESTS);
  }
  log(`📊 Wellfound total raw: ${wellfoundJobs.length} jobs`);
  allCollectedJobs.push(...wellfoundJobs);
  await delay(config.DELAY_BETWEEN_SITES);

  // ═══════════════════════════════════════════════════
  // SITE 5: PRODUCTMANAGEMENTJOBS.COM
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🌐 SITE 5/5: ProductManagementJobs.com');
  log('═'.repeat(60));

  // Search specific PM-related titles only
  const pmTitles = config.JOB_TITLES.filter(t =>
    t.toLowerCase().includes('product') ||
    t.toLowerCase().includes('analyst') ||
    t.toLowerCase().includes('manager')
  );

  const pmJobs = [];
  for (const title of pmTitles) {
    const jobs = await scrapePMJobs(page, title);
    pmJobs.push(...jobs);
    await delay(config.DELAY_BETWEEN_REQUESTS);
  }
  log(`📊 PMJobs total raw: ${pmJobs.length} jobs`);
  allCollectedJobs.push(...pmJobs);

  await page.close();
  await browser.close();

  // ═══════════════════════════════════════════════════
  // FILTER AND DEDUPLICATE
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('🔍 Applying filters and deduplication...');
  log('═'.repeat(60));

  log(`📊 Total raw jobs collected: ${allCollectedJobs.length}`);

  const filteredJobs = filterJobs(allCollectedJobs, existingKeys);

  // Per-source stats
  for (const job of filteredJobs) {
    if (stats[job.source] !== undefined) stats[job.source]++;
  }
  stats.total = filteredJobs.length;
  stats.skipped = allCollectedJobs.length - filteredJobs.length;

  // ═══════════════════════════════════════════════════
  // WRITE TO GOOGLE SHEETS
  // ═══════════════════════════════════════════════════
  log('\n' + '═'.repeat(60));
  log('📝 Writing to Google Sheets...');
  log('═'.repeat(60));

  const written = await appendJobs(filteredJobs);

  // ═══════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  log('\n' + '═'.repeat(60));
  log('📊 DAILY JOB AGENT — RUN SUMMARY');
  log('═'.repeat(60));
  log(`🗓️  Run Date: ${getTodayString()}`);
  log(`⏱️  Total Time: ${elapsed} minutes`);
  log('');
  log('📈 Jobs found per source:');
  log(`  • Naukri     : ${stats.Naukri}`);
  log(`  • Indeed     : ${stats.Indeed}`);
  log(`  • Instahyre  : ${stats.Instahyre}`);
  log(`  • Wellfound  : ${stats.Wellfound}`);
  log(`  • PMJobs     : ${stats.PMJobs}`);
  log('');
  log(`📋 Total raw collected  : ${allCollectedJobs.length}`);
  log(`🔍 Filtered/skipped     : ${stats.skipped}`);
  log(`✅ New jobs added today : ${written}`);
  log('');
  log(`🔗 Sheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}`);
  log('═'.repeat(60));

  // Save summary to log file
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

  const logEntry = {
    date: getTodayString(),
    timestamp: new Date().toISOString(),
    rawCollected: allCollectedJobs.length,
    filtered: stats.skipped,
    added: written,
    perSource: {
      Naukri: stats.Naukri,
      Indeed: stats.Indeed,
      Instahyre: stats.Instahyre,
      Wellfound: stats.Wellfound,
      PMJobs: stats.PMJobs
    }
  };

  const logFile = path.join(logsDir, `run_${getTodayString().replace(/-/g, '_')}.json`);
  fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
  log(`📄 Run log saved: ${logFile}`);
}

// Run the agent
runAgent().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
