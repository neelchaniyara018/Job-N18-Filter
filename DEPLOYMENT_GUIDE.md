# 🚀 Deployment Guide — Job Hunterz N18

This guide outlines every single step to host the **Job Hunterz N18** web application on **Vercel** and connect it to a **Supabase** database.

---

## ── STAGE 1: SUPABASE DATABASE SETUP ──

Supabase acts as our cloud database to store scraped job listings from Naukri.com and Instahyre.

1. **Sign Up / Log In**:
   - Go to [Supabase.com](https://supabase.com) and click **Start your project** or sign in with GitHub/Email.

2. **Create a New Project**:
   - Click **New project** and select your organization.
   - Configure project details:
     - **Name**: `Job Hunterz N18 DB`
     - **Database Password**: (Create a strong password and save it)
     - **Region**: Choose a location closest to your target area (e.g., `South Asia (Mumbai)` or `Singapore`).
     - **Pricing Plan**: Select the **Free Tier**.
   - Click **Create new project** and wait 1–2 minutes for the database to provision.

3. **Initialize the Database Schema**:
   - In the left sidebar of the Supabase dashboard, click on the **SQL Editor** icon (represented by `SQL` or a terminal symbol).
   - Click **New query** (or **New blank query**).
   - Open the file [supabase_schema.sql](file:///c:/Users/neel.chaniyara/Downloads/Neel%20Ai/Daily%20Job%20Agent/supabase_schema.sql) in your local code editor.
   - Copy the entire SQL code (Ctrl+A, Ctrl+C).
   - Paste the code into the Supabase SQL editor.
   - Click the **Run** button at the bottom right.
   - You should see the message: `Success. No rows returned.`
   - In the left sidebar, click the **Table Editor** (grid icon) and verify that the `jobs` table exists.

4. **Retrieve API Credentials**:
   - Click the **Project Settings** (gear icon) at the bottom of the left sidebar.
   - Click on **API** in the settings menu.
   - Under the **Project API keys** section, copy the following values:
     - **Project URL** (looks like: `https://xyzabc.supabase.co`) -> This will be your **`SUPABASE_URL`**.
     - **anon public key** (looks like: `eyJhbGci...`) -> This will be your **`SUPABASE_ANON_KEY`**.
     - *Save both keys in a temporary notepad.*

---

## ── STAGE 2: SCRAPERAPI SETUP ──

Our cloud scraper functions run on Vercel serverless instances, which can get blocked by portals like Naukri.com. We route these requests through ScraperAPI to bypass bot detection.

1. **Get a Free Key**:
   - Go to [ScraperAPI.com](https://www.scraperapi.com) and click **Sign Up**.
   - Fill in your details. The free plan provides **5,000 free credits** per month.
2. **Copy API Key**:
   - From your ScraperAPI dashboard, copy the **API Key** (looks like a 32-character hex string).
   - *Save this key in your notepad as `SCRAPER_API_KEY`.*

---

## ── STAGE 3: HOSTING ON VERCEL ──

Vercel will host our frontend HTML file (`index.html`) and execute our search and scraping API logic (`api/search.js` and `api/scrape.js`).

### Method A: Deploy via GitHub (Recommended & Simplest)

1. **Create a GitHub Repository**:
   - Go to [GitHub.com](https://github.com) and log in.
   - Click **New** to create a repository.
   - Name it `job-hunterz-n18`.
   - Set it to **Private** (recommended to keep your scraper keys secure).
   - Do NOT add a README, `.gitignore`, or license. Click **Create repository**.

2. **Push Code to GitHub**:
   - Open a terminal or PowerShell window in your local project folder (`C:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent`).
   - Run the following commands to push your project:
     ```bash
     git init
     git add .
     git commit -m "Initial commit for Job Hunterz N18"
     git branch -M main
     git remote add origin https://github.com/YOUR_GITHUB_USERNAME/job-hunterz-n18.git
     git push -u origin main
     ```
     *(Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username).*

3. **Import to Vercel**:
   - Go to [Vercel.com](https://vercel.com) and sign in using your GitHub account.
   - On the dashboard, click **Add New...** → **Project**.
   - Under "Import Git Repository", locate your `job-hunterz-n18` repository and click **Import**.

4. **Configure Environment Variables**:
   - In the Vercel project configuration page, expand the **Environment Variables** section.
   - Add the following three keys:
     1. **Key**: `SUPABASE_URL` | **Value**: (Paste your Supabase URL)
     2. **Key**: `SUPABASE_ANON_KEY` | **Value**: (Paste your Supabase anon public key)
     3. **Key**: `SCRAPER_API_KEY` | **Value**: (Paste your ScraperAPI key)
   - Click **Add** after entering each key-value pair.

5. **Deploy**:
   - Click the **Deploy** button.
   - Vercel will build your project and generate a live URL (e.g., `https://job-hunterz-n18.vercel.app`).

---

### Method B: Deploy via Vercel CLI (No Git Required)

1. **Install Node.js & CLI**:
   - Make sure you have Node.js installed.
   - Open PowerShell and install the Vercel CLI globally:
     ```powershell
     npm install -g vercel
     ```

2. **Log In to Vercel**:
   - In your command line, run:
     ```powershell
     vercel login
     ```
   - Select your preferred login method (GitHub, GitLab, or Email) and follow the browser prompts to authenticate.

3. **Deploy from Project Directory**:
   - In PowerShell, verify you are inside the project folder:
     ```powershell
     cd "C:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent"
     ```
   - Deploy by running:
     ```powershell
     vercel
     ```
   - Follow the prompts:
     - *Set up and deploy?* **Yes**
     - *Which scope?* (Select your personal account)
     - *Link to existing project?* **No**
     - *What name?* `job-hunterz-n18`
     - *In which directory is code located?* Press Enter (`./`)
     - *Want to modify settings?* **No**
   - Wait for Vercel to inspect the files. It will deploy a **Preview** version.

4. **Add Environment Variables**:
   - Run the following commands in PowerShell to upload your environment variables:
     ```powershell
     vercel env add SUPABASE_URL production
     # Paste your Supabase URL when prompted
     
     vercel env add SUPABASE_ANON_KEY production
     # Paste your Supabase anon key when prompted
     
     vercel env add SCRAPER_API_KEY production
     # Paste your ScraperAPI key when prompted
     ```

5. **Deploy to Production**:
   - Finalize deployment by pushing all files and variables live:
     ```powershell
     vercel --prod
     ```
   - Vercel will output your live URL (e.g., `https://job-hunterz-n18.vercel.app`).

---

## ── STAGE 4: SETUP AUTOMATIC DAILY SCRAPING (CRON JOB) ──

Instead of manually clicking Search, we can make Vercel run the scraper function in the background every day to fetch jobs from Naukri & Instahyre and save them to Supabase.

1. **Cron Configuration**:
   - We have configured a cron job inside `vercel.json`. It will tell Vercel to ping `/api/scrape` every morning at 2:00 AM UTC.
2. **Enable Cron in Vercel**:
   - If you deployed via Git (Method A), Vercel automatically reads the cron configuration from `vercel.json` and schedules it.
   - You can monitor your cron history under the **Settings** → **Cron Jobs** tab on your Vercel project dashboard.

---

## ── STAGE 5: TESTING YOUR DEPLOYED SITE ──

1. Open your production URL (e.g. `https://job-hunterz-n18.vercel.app`) in your browser.
2. The navbar will show **Cloud Mode** in gold status.
3. Click the **Search All Job Portals** button.
4. The site will fetch Naukri & Instahyre jobs directly from Supabase, while fetching LinkedIn & Internshala in real-time, displaying them instantly in the results table.
