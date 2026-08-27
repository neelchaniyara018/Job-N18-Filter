# 🚀 Step-by-Step Guide: Deploy Job Hunterz N18 to Vercel from GitHub

This guide walks you through deploying your **Job Hunterz N18** agent to **Vercel** via **GitHub** in under 5 minutes.

---

## 📋 Prerequisites Checklist

Before you start, make sure you have:
1. A **GitHub account** ([github.com](https://github.com))
2. A **Vercel account** ([vercel.com](https://vercel.com)) — sign in with your GitHub account
3. Git installed on your computer ([git-scm.com](https://git-scm.com))

---

## ── STEP 1: Initialize Git and Push to GitHub ──

1. Open **PowerShell** or **Terminal** on your computer.
2. Navigate to your project directory:
   ```powershell
   cd "C:\Users\neel.chaniyara\Downloads\Neel Ai\Daily Job Agent"
   ```

3. Create a **New Repository on GitHub**:
   - Go to [github.com/new](https://github.com/new)
   - **Repository Name**: `job-hunterz-n18`
   - **Visibility**: Choose **Private** (recommended) or **Public**
   - Leave "Add a README", ".gitignore", and "License" **UNCHECKED** (we already have them)
   - Click **Create repository**

4. Push your local files to GitHub:
   ```powershell
   # 1. Initialize git
   git init

   # 2. Stage all files (.gitignore will protect your secrets)
   git add .

   # 3. Commit files
   git commit -m "Initial commit - Job Hunterz N18"

   # 4. Set main branch
   git branch -M main

   # 5. Link to your GitHub repo (replace YOUR_USERNAME with your GitHub username)
   git remote add origin https://github.com/YOUR_USERNAME/job-hunterz-n18.git

   # 6. Push to GitHub
   git push -u origin main
   ```

---

## ── STEP 2: Import & Deploy on Vercel ──

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click the **Add New...** button in the top right → select **Project**.
3. Under **Import Git Repository**, find `job-hunterz-n18` and click **Import**.
4. Configure your project:
   - **Project Name**: `job-hunterz-n18` (default)
   - **Framework Preset**: `Other` (default)
   - **Root Directory**: `./` (default)

5. **Set Environment Variables** (Optional, for Supabase & ScraperAPI cloud caching):
   - Expand the **Environment Variables** accordion.
   - Add the following keys if you use Supabase / ScraperAPI:
     - `SUPABASE_URL`: *(Your Supabase project URL)*
     - `SUPABASE_ANON_KEY`: *(Your Supabase anon key)*
     - `SCRAPER_API_KEY`: *(Your ScraperAPI token)*

6. Click **Deploy**! 🚀
   - Vercel will build your project in ~30 seconds and provide your live link:
   - Example: `https://job-hunterz-n18.vercel.app`

---

## ── STEP 3: How Automatic Updates Work ──

Whenever you make improvements or changes to your project code:
```powershell
git add .
git commit -m "Update search UI and scrapers"
git push
```
Vercel will **automatically detect the push and redeploy** your live website in seconds!

---

## ── Project Files Overview for Vercel ──

- **`index.html`**: The main user interface with glassmorphic styling, filter dropdowns, and search controls.
- **`vercel.json`**: Directs API routes (`/api/search`, `/api/scrape`, `/api/upload`) to Vercel Serverless Functions.
- **`package.json`**: Automatically informs Vercel which Node.js dependencies to install.
- **`api/search.js`**: Cloud search pipeline executing scraping across portals.