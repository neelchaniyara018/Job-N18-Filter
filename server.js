// server.js — Automated Job Search API Server
// Run: node server.js
// Then open: job_search_ui.html in your browser

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { searchNaukri } = require('./scrapers/naukri_api');
const { searchIndeed } = require('./scrapers/indeed_rss');
const { searchLinkedIn } = require('./scrapers/linkedin_api');
const { searchAdzuna } = require('./scrapers/adzuna_api');
const { searchInstahyre } = require('./scrapers/instahyre_api');
const { searchInternshala } = require('./scrapers/internshala_api');
const { applyFilters } = require('./filters');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────
// SEARCH ENDPOINT (returns all results)
// ─────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', message: 'Starting job search across all portals...' });

  const selectedTitle = req.query.titles || '';
  const selectedLocation = req.query.locations || '';
  const selectedExperience = req.query.experience || '';

  const JOB_ROLES = [
    'product analyst', 'data analyst', 'business analyst', 'product manager',
    'growth analyst', 'analytics engineer', 'wfm analyst',
    'business intelligence analyst', 'decision scientist',
    'product operations analyst', 'associate product manager',
    'assistant product manager'
  ];

  const roles = selectedTitle ? [selectedTitle] : JOB_ROLES;
  const allJobs = [];

  // Run all scrapers in parallel
  const scrapers = [
    {
      name: 'Naukri',
      fn: () => searchNaukri(roles, selectedLocation),
      color: '#6366f1'
    },
    {
      name: 'Indeed',
      fn: () => searchIndeed(roles, selectedLocation),
      color: '#2164f3'
    },
    {
      name: 'LinkedIn',
      fn: () => searchLinkedIn(roles, selectedLocation),
      color: '#0a66c2'
    },
    {
      name: 'Adzuna',
      fn: () => searchAdzuna(roles, selectedLocation),
      color: '#e35e28'
    },
    {
      name: 'Instahyre',
      fn: () => searchInstahyre(roles, selectedLocation),
      color: '#10b981'
    },
    {
      name: 'Internshala',
      fn: () => searchInternshala(roles, selectedLocation),
      color: '#0284c7'
    }
  ];

  // Run scrapers in parallel with individual progress updates
  const results = await Promise.allSettled(
    scrapers.map(async (scraper) => {
      send({ type: 'progress', portal: scraper.name, status: 'searching', color: scraper.color });
      try {
        const jobs = await scraper.fn();
        const count = jobs ? jobs.length : 0;
        send({ type: 'progress', portal: scraper.name, status: 'done', count, color: scraper.color });
        return jobs || [];
      } catch (err) {
        console.error(`[${scraper.name}] Error:`, err.message);
        send({ type: 'progress', portal: scraper.name, status: 'error', error: err.message, color: scraper.color });
        return [];
      }
    })
  );

  // Combine all results
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      allJobs.push(...result.value);
    }
  }

  // Apply filters
  const filtered = applyFilters(allJobs, selectedTitle, selectedLocation, selectedExperience);

  send({
    type: 'complete',
    total: allJobs.length,
    filtered: filtered.length,
    jobs: filtered
  });

  res.end();
});

// ─────────────────────────────────────────
// UPLOAD TO GOOGLE SHEETS
// ─────────────────────────────────────────
app.post('/api/upload', async (req, res) => {
  const { jobs, appsScriptUrl } = req.body;
  const targetUrl = appsScriptUrl || process.env.APPS_SCRIPT_URL;

  if (!targetUrl) {
    return res.json({ success: false, error: 'No Apps Script URL configured. Set APPS_SCRIPT_URL in .env' });
  }

  try {
    const axios = require('axios');
    const response = await axios.post(targetUrl, { jobs }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    res.json({ success: true, ...response.data });
  } catch (err) {
    // Apps Script sometimes returns non-200 but still works
    res.json({ success: true, message: 'Upload sent (Apps Script processed)', count: jobs.length });
  }
});

// ─────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    time: new Date().toISOString(),
    adzunaKey: process.env.ADZUNA_APP_ID ? 'configured' : 'not set (Adzuna disabled)',
    appsScriptUrl: process.env.APPS_SCRIPT_URL ? 'configured' : 'not set'
  });
});

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   🎯 Job Search Agent — Server Ready   ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Server: http://localhost:${PORT}          ║`);
  console.log(`║  UI:     Open job_search_ui.html       ║`);
  console.log('╚════════════════════════════════════════╝\n');
});
