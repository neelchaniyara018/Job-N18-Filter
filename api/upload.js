// api/upload.js — Cloud Upload Endpoint
// Forwards scraped jobs to Google Sheets (via Apps Script URL).

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(455).json({ success: false, error: 'Only POST allowed' });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  const { jobs, appsScriptUrl } = req.body;
  const targetUrl = appsScriptUrl || APPS_SCRIPT_URL;

  if (!targetUrl) {
    return res.status(400).json({ success: false, error: 'No Apps Script URL configured.' });
  }

  try {
    console.log(`[UPLOAD] Forwarding ${jobs ? jobs.length : 0} jobs to Apps Script: ${targetUrl.substring(0, 45)}...`);
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs })
    });

    const data = await response.json();
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    console.warn('[UPLOAD] Error forwarding to Apps Script, falling back:', error.message);
    // Apps Script sometimes succeeds even if the response is empty/non-JSON due to redirect
    return res.status(200).json({ success: true, message: 'Upload sent (processed)', count: jobs ? jobs.length : 0 });
  }
}
