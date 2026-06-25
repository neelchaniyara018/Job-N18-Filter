# 🎯 Job Search Agent — Setup Guide
# This guide gets you up and running in 5 minutes

## ──────────────────────────────────────────────
## STEP 1 — Update the Google Apps Script
## ──────────────────────────────────────────────

1. Go to https://script.google.com/
2. Open your existing project (or click "New Project")
3. DELETE all existing code in the editor (Ctrl+A, then Delete)
4. Open the file: google_apps_script.gs (in this folder)
5. Copy ALL the code (Ctrl+A, Ctrl+C)
6. Paste it into the Apps Script editor (Ctrl+V)
7. Press Ctrl+S to save

## ──────────────────────────────────────────────
## STEP 2 — Deploy as Web App (New Deployment)
## ──────────────────────────────────────────────

1. Click "Deploy" → "New deployment"
   (IMPORTANT: Must be a NEW deployment, not "Manage deployments")
2. Click the gear icon ⚙ → Select "Web App"
3. Fill in the settings:
   - Description: Job Search Agent v2
   - Execute as: Me
   - Who has access: Anyone
4. Click "Deploy"
5. Click "Authorize access" when prompted → Choose your Google account → Allow
6. COPY the Web App URL that appears
   (looks like: https://script.google.com/macros/s/LONG_STRING/exec)

## ──────────────────────────────────────────────
## STEP 3 — Configure the Website
## ──────────────────────────────────────────────

1. Open: job_search_ui.html (double-click it in this folder)
2. The setup modal will appear automatically
3. Paste your Web App URL in Step 4 of the modal
4. Click "Save"
5. Click "Start Searching →"

## ──────────────────────────────────────────────
## DONE! How to use daily:
## ──────────────────────────────────────────────

1. Open job_search_ui.html in your browser
2. Click "Search All Job Portals"
3. Wait ~30-60 seconds while Google scrapes all 5 portals
4. Browse the results with filters
5. New jobs are automatically added to your Google Sheet

## ──────────────────────────────────────────────
## What gets scraped:
## ──────────────────────────────────────────────

Portals:
- Naukri.com (JSON API — most reliable)
- Indeed India (RSS feeds — bypasses CAPTCHA)
- LinkedIn (public jobs API)
- Shine.com (HTML + JSON scraping)
- Instahyre (HTML scraping)

Roles searched:
- Product Analyst, Data Analyst, Business Analyst
- Product Manager, Growth Analyst, Analytics Engineer
- Business Intelligence Analyst, Decision Scientist
- WFM Analyst, Product Operations Analyst
- Associate Product Manager, Assistant Product Manager
- + 10 more variants

Filters applied automatically:
- Experience: 0–3 years maximum
- Location: India only (excludes USA, UK, Canada, etc.)
- Deduplication: same job won't appear twice

## ──────────────────────────────────────────────
## Troubleshooting:
## ──────────────────────────────────────────────

Problem: "Search Failed" error
→ Make sure you created a NEW deployment (not managed existing one)
→ Make sure "Who has access" = Anyone (not "Anyone with Google account")

Problem: Some portals show 0 jobs
→ Normal — some portals may block Google's servers occasionally
→ Naukri and Indeed (RSS) are the most reliable

Problem: Jobs appear but don't get added to Sheet
→ Check that SPREADSHEET_ID in the .gs file matches your sheet ID
→ Your sheet ID is: 11jsmc9ctRpoOj0BEwhAA2JTQy46lI5yArINDdjSVhig
