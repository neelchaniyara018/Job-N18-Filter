# 📂 Project Files Guide — Job Hunterz N18

This document lists all the files currently active and working in the latest version of the project, as well as the unused files that can be safely archived or deleted.

---

## ── 1. ACTIVE & USEFUL FILES ──

These files form the core of the web application, local automation scripts, cloud APIs, and database setup.

### 🌐 Frontend & User Interface
- **[index.html](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/index.html)**: The primary, redesigned SaaS dark-themed web app interface for the user dashboard.
- **[job_search_ui.html](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/job_search_ui.html)**: An alternative UI page, synced with the same modern dark design, features, and brand name.
- **[config.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/config.js)**: Configuration settings shared by local JavaScript scraping modules.
- **[filters.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/filters.js)**: Holds the filter algorithms (experience 0-3y limit, keyword matches, location checks) used to clean scraped results.

### ☁️ Cloud Hosting & Serverless Functions (Vercel & Supabase)
- **[vercel.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/vercel.json)**: Configures Vercel deployment routes, serverless memory/timeout rules, and the daily cron scraping scheduler.
- **[supabase_schema.sql](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/supabase_schema.sql)**: SQL script to initialize the Supabase database table (`jobs`), indexes, and Row Level Security (RLS) policies.
- **[api/search.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/api/search.js)**: Cloud search serverless function (fetches Naukri/Instahyre from Supabase, scrapes LinkedIn/Internshala dynamically).
- **[api/scrape.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/api/scrape.js)**: Cloud scraping serverless function (runs via Vercel Cron to scrape Naukri/Instahyre via ScraperAPI).
- **[api/upload.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/api/upload.js)**: Cloud uploading endpoint forwarding job sheets submissions.

### 💻 Local Server & Node Backends
- **[server.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/server.ps1)**: The active PowerShell-based HTTP backend server providing API endpoints (`/api/search`, `/api/health`, `/api/upload`) locally.
- **[server.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/server.js)**: An alternative Node.js-based backend server.
- **[package.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/package.json)**: Project dependencies manifest for Node.js modules.
- **[.env](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/.env)**: Environment variables file for local setups (storing API keys, URLs).

### ⚙️ Local Scraper & Automation Modules
- **[scrapers/naukri_api.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scrapers/naukri_api.js)**: API-based scraper module for Naukri.
- **[scrapers/linkedin_api.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scrapers/linkedin_api.js)**: Scraper module targeting LinkedIn guest searches.
- **[scrapers/instahyre_api.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scrapers/instahyre_api.js)**: API scraper module for Instahyre.
- **[browser_scraper.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/browser_scraper.ps1)**: Browser automation scraper (opens local Chrome, scrapes Naukri/Instahyre, and generates `browser_cache.json`).
- **[browser_scraper.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/browser_scraper.js)**: Injected browser scraper script.
- **[browser_cache.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/browser_cache.json)**: Local database cache file storing scraped jobs from Naukri & Instahyre.
- **[scraper_naukri.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraper_naukri.js)**: Local backup scraper script for Naukri.
- **[scraper_instahyre.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraper_instahyre.js)**: Local backup scraper script for Instahyre.

### 📝 Google Sheets Integration
- **[google_apps_script.gs](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/google_apps_script.gs)**: Google Apps Script to paste into your script editor to receive job postings.
- **[sheets_helper.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/sheets_helper.js)**: Node.js library module to format and insert jobs into Google Sheets.
- **[upload_to_sheets.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/upload_to_sheets.js)**: Script that reads scraping result files and manually uploads them to Google Sheets.
- **[write_to_sheets.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/write_to_sheets.ps1)**: PowerShell helper script calling Node.js sheets script.

### 🚀 Launchers & Schedulers
- **[start.bat](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/start.bat)**: Double-click script to launch the local PowerShell backend server.
- **[run_agent.bat](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/run_agent.bat)**: Windows batch shortcut executing the daily scraper agent.
- **[run_browser_scraper.bat](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/run_browser_scraper.bat)**: Windows batch shortcut executing the local browser cache populate tool.
- **[daily_run.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/daily_run.ps1)**: Daily scraper runner task automation script.
- **[setup_scheduler.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/setup_scheduler.ps1)**: Script to schedule the daily job search agent to run in Windows Task Scheduler automatically.

### ℹ️ Project Documentation
- **[DEPLOYMENT_GUIDE.md](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/DEPLOYMENT_GUIDE.md)**: Live Vercel cron and Supabase database hosting instructions.
- **[SETUP_GUIDE.md](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/SETUP_GUIDE.md)**: Guide on configuring the Google Apps Script spreadsheet integration.

---

## ── 2. OPTIONAL / DEVELOPMENT DIRECTORY ──

- **[extension/](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/extension/)** (Folder containing `manifest.json`, `background.js`, `index.html`, `icons`, and `HOW_TO_INSTALL.txt`):
  - *Status*: Optional. This Chrome extension can be loaded locally to help trigger manual scrapes directly from your browser toolbar. It is not required if you use Vercel Cloud or the Local Server dashboard.

---

## ── 3. UNUSED / DEPRECATED FILES ──

These files belong to retired scraper platforms, old data logs, or temporary scripts. They can be safely deleted or archived.

### ❌ Retired/Removed Portal Scrapers
- **[scrapers/indeed_rss.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scrapers/indeed_rss.js)**: Retired. (Indeed was removed from the project).
- **[scrapers/adzuna_api.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scrapers/adzuna_api.js)**: Retired. (Adzuna portal is no longer in the active grid).
- **[scraper_indeed.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraper_indeed.js)**: Old standalone scraper file for Indeed.
- **[scraper_pmjobs.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraper_pmjobs.js)**: Standalone scraper for ProductManagementJobs.com (removed).
- **[scraper_wellfound.js](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraper_wellfound.js)**: Standalone scraper for Wellfound/AngelList (removed).

### ❌ Legacy Dashboard & Testing
- **[upload_dashboard.html](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/upload_dashboard.html)**: Deprecated manual dashboard. (Its functionality is now handled dynamically by `index.html`).
- **[test_scraper_api.ps1](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/test_scraper_api.ps1)**: A temporary script used to debug ScraperAPI connections.

### ❌ Legacy Temporary Cache JSON Files
- **[scraped_jobs_2026_06_11.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraped_jobs_2026_06_11.json)**: Old temporary scraped results.
- **[scraped_jobs_master.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraped_jobs_master.json)**: Old backup master cache.
- **[scraped_jobs_naukri_indeed.json](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/scraped_jobs_naukri_indeed.json)**: Cached database containing old Indeed scraping results.
