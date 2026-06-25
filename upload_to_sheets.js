// upload_to_sheets.js — Uploads collected jobs to Google Sheets via Apps Script Web App
// Usage: node upload_to_sheets.js [path_to_jobs_json]

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
// After deploying google_apps_script.gs as a Web App, paste the URL here:
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

// Alternative: Direct Google Sheets API (needs service account)
const USE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT === 'true';
const SPREADSHEET_ID = '11jsmc9ctRpoOj0BEwhAA2JTQy46lI5yArINDdjSVhig';
// ==========================

const jobsFile = process.argv[2] || path.join(__dirname, 'scraped_jobs_master.json');

function getTodayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function postData(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    const req = lib.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ raw: responseData });
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function uploadJobsViaAppsScript(jobs) {
  if (!APPS_SCRIPT_URL) {
    console.log('❌ APPS_SCRIPT_URL not set. Please deploy google_apps_script.gs first.');
    console.log('   See SETUP_GUIDE.md for instructions.');
    return 0;
  }
  
  console.log(`📤 Uploading ${jobs.length} jobs to Google Sheets...`);
  const result = await postData(APPS_SCRIPT_URL, { jobs });
  
  if (result.success) {
    console.log(`✅ Successfully added ${result.added} new jobs!`);
    console.log(`📊 Total jobs in sheet: ${result.total}`);
    return result.added;
  } else {
    console.error('❌ Upload failed:', result.error || result);
    return 0;
  }
}

async function uploadJobsViaServiceAccount(jobs) {
  try {
    const { google } = require('googleapis');
    const { getExistingJobKeys, ensureHeaderRow, appendJobs } = require('./sheets_helper');
    
    await ensureHeaderRow();
    const existingKeys = await getExistingJobKeys();
    
    // Add dateAdded
    const today = getTodayDate();
    const jobsWithDate = jobs.map(j => ({ ...j, dateAdded: j.dateAdded || today }));
    
    // Filter duplicates
    const seenKeys = new Set(existingKeys);
    const newJobs = [];
    for (const job of jobsWithDate) {
      const key = `${(job.title||'').toLowerCase().trim()}|${(job.company||'').toLowerCase().trim()}|${(job.link||'').toLowerCase().trim()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        newJobs.push(job);
      }
    }
    
    const written = await appendJobs(newJobs);
    return written;
  } catch (err) {
    console.error('❌ Service account upload failed:', err.message);
    return 0;
  }
}

async function main() {
  console.log('📂 Loading jobs from:', jobsFile);
  
  if (!fs.existsSync(jobsFile)) {
    console.error('❌ Jobs file not found:', jobsFile);
    process.exit(1);
  }
  
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  console.log(`📋 Loaded ${jobs.length} jobs`);
  
  // Add today's date to all jobs
  const today = getTodayDate();
  for (const job of jobs) {
    if (!job.dateAdded) job.dateAdded = today;
  }
  
  let added = 0;
  
  if (USE_SERVICE_ACCOUNT) {
    added = await uploadJobsViaServiceAccount(jobs);
  } else if (APPS_SCRIPT_URL) {
    added = await uploadJobsViaAppsScript(jobs);
  } else {
    console.log('ℹ️  No upload method configured.');
    console.log('   Option 1: Set APPS_SCRIPT_URL environment variable after deploying the Google Apps Script');
    console.log('   Option 2: Set up Google Service Account credentials (see SETUP_GUIDE.md)');
    console.log('');
    console.log('📊 Jobs Summary:');
    const sources = {};
    for (const job of jobs) {
      sources[job.source] = (sources[job.source] || 0) + 1;
    }
    console.log(JSON.stringify(sources, null, 2));
    console.log(`Total jobs collected: ${jobs.length}`);
  }
  
  console.log(`\n✅ Done! Added ${added} new jobs to Google Sheet`);
}

main().catch(console.error);
