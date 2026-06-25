// browser_scraper.js — Uses Chrome DevTools MCP to scrape jobs via existing browser session
// This script collects jobs from the browser and saves them to a JSON file
// The Google Sheets upload happens via the sheets_uploader.js script

const fs = require('fs');
const path = require('path');

// All collected jobs will be saved here
const OUTPUT_FILE = path.join(__dirname, 'collected_jobs.json');

const config = require('./config');
const { isDateValid, isLocationValid, isExperienceValid, getTodayString, getJobKey } = require('./filters');

// Job titles to search
const JOB_TITLES = config.JOB_TITLES;

// Read jobs from file (set by browser session)
function loadJobs() {
  if (fs.existsSync(OUTPUT_FILE)) {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  }
  return [];
}

// Filter and process loaded jobs
function processJobs(rawJobs, existingKeys) {
  const seenKeys = new Set(existingKeys);
  const filtered = [];
  
  for (const job of rawJobs) {
    if (!isLocationValid(job.location)) continue;
    if (!isExperienceValid(job.experience)) continue;
    if (!isDateValid(job.datePosted)) continue;
    
    const key = getJobKey(job);
    if (seenKeys.has(key)) continue;
    
    seenKeys.add(key);
    job.dateAdded = getTodayString();
    filtered.push(job);
  }
  
  return filtered;
}

module.exports = { loadJobs, processJobs, OUTPUT_FILE };
