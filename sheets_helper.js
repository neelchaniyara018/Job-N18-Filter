// sheets_helper.js — Google Sheets read/write helper
const { google } = require('googleapis');
const config = require('./config');
const path = require('path');
const fs = require('fs');

let sheetsClient = null;

/**
 * Initialize Google Sheets API client using Service Account
 */
async function initSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const credPath = path.resolve(config.CREDENTIALS_PATH);
  
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Google Service Account credentials not found at: ${credPath}\n` +
      `Please follow the setup guide in SETUP_GUIDE.md to create credentials.`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  console.log('✅ Google Sheets client initialized');
  return sheetsClient;
}

/**
 * Read all existing rows from the sheet
 * Returns a Set of unique keys (title|company|link) for deduplication
 */
async function getExistingJobKeys() {
  const sheets = await initSheetsClient();
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A:G`
    });

    const rows = response.data.values || [];
    const existingKeys = new Set();

    // Skip header row (row 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 6) {
        // Key: JobTitle|CompanyName|JobLink
        const key = `${(row[2] || '').toLowerCase().trim()}|${(row[1] || '').toLowerCase().trim()}|${(row[5] || '').toLowerCase().trim()}`;
        existingKeys.add(key);
      }
    }

    console.log(`📊 Found ${existingKeys.size} existing jobs in sheet`);
    return existingKeys;
  } catch (err) {
    console.error('Error reading sheet:', err.message);
    return new Set();
  }
}

/**
 * Ensure header row exists in the sheet
 */
async function ensureHeaderRow() {
  const sheets = await initSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A1:H1`
  });

  const firstRow = (response.data.values || [[]])[0] || [];
  
  if (firstRow.length === 0 || firstRow[0] !== 'Date Posted') {
    // Write header
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `${config.SHEET_NAME}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [config.COLUMNS]
      }
    });
    console.log('✅ Header row written');
  } else {
    console.log('✅ Header row already exists');
  }
}

/**
 * Append new job rows to the sheet
 * @param {Array} jobs - Array of job objects
 * @returns {number} - Number of jobs written
 */
async function appendJobs(jobs) {
  if (!jobs || jobs.length === 0) {
    console.log('No new jobs to append');
    return 0;
  }

  const sheets = await initSheetsClient();
  
  const rows = jobs.map(job => [
    job.datePosted || 'Not mentioned',
    job.company || 'Unknown',
    job.title || 'Unknown',
    job.location || 'Not mentioned',
    job.experience || 'Not mentioned',
    job.link || '',
    job.source || '',
    job.dateAdded || getTodayDate()
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SPREADSHEET_ID,
    range: `${config.SHEET_NAME}!A:H`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows
    }
  });

  console.log(`✅ Appended ${rows.length} new jobs to sheet`);
  return rows.length;
}

/**
 * Get today's date as DD-MM-YYYY
 */
function getTodayDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

module.exports = {
  initSheetsClient,
  getExistingJobKeys,
  ensureHeaderRow,
  appendJobs,
  getTodayDate
};
