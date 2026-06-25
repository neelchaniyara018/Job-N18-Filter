// config.js — Job Agent Configuration
module.exports = {
  // Google Sheet ID (from URL)
  SPREADSHEET_ID: '11jsmc9ctRpoOj0BEwhAA2JTQy46lI5yArINDdjSVhig',
  SHEET_NAME: 'Sheet1',

  // Credentials file path (Google Service Account JSON)
  CREDENTIALS_PATH: './credentials/service_account.json',

  // Job titles to search
  JOB_TITLES: [
    'Product Analyst',
    'Data Analyst',
    'Business Analyst',
    'Product Manager',
    'Growth Analyst',
    'Analytics Engineer',
    'WFM Analyst',
    'Workforce Management Analyst',
    'Resource Planning Analyst',
    'Business Intelligence Analyst',
    'Decision Scientist',
    'Product Operations Analyst',
    'Product Data Analyst',
    'Consumer Insights Analyst',
    'Customer Analytics Analyst'
  ],

  // Valid India locations (lowercase for matching)
  VALID_LOCATIONS: [
    'ahmedabad', 'surat', 'vadodara', 'rajkot', 'gandhinagar', 'baroda',
    'mumbai', 'pune', 'delhi', 'new delhi', 'noida', 'gurugram', 'gurgaon',
    'bangalore', 'bengaluru', 'hyderabad', 'jaipur', 'indore',
    'remote', 'work from home', 'wfh', 'pan india', 'india', 'anywhere in india',
    'chennai', 'kolkata', 'chandigarh', 'bhopal', 'lucknow', 'kochi',
    'coimbatore', 'nagpur', 'patna', 'agra', 'thane', 'navi mumbai'
  ],

  // Max experience in years
  MAX_EXPERIENCE_YEARS: 3,

  // Max days old for postings
  MAX_DAYS_OLD: 7,

  // Scraping delays (ms) to avoid bot detection
  DELAY_BETWEEN_REQUESTS: 2000,
  DELAY_BETWEEN_SITES: 5000,

  // Sheet column order
  COLUMNS: [
    'Date Posted',
    'Company Name',
    'Job Title',
    'Location',
    'Experience Required',
    'Job Link',
    'Source',
    'Date Added'
  ]
};
