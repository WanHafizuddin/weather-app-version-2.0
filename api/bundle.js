import { bundleUrls, HttpError } from '../lib/owm.js';

async function getJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  let urls;
  try {
    urls = bundleUrls(req.query, process.env.API_KEY);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const [current, forecast, air] = await Promise.all([
    getJson(urls.current),
    getJson(urls.forecast),
    getJson(urls.air),
  ]);

  if (!current && !forecast && !air) {
    return res.status(502).json({ error: 'Upstream weather service failed' });
  }
  res.status(200).json({ current, forecast, air });
}
