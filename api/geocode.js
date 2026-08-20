import { geocodeUrl, HttpError } from '../lib/owm.js';

export default async function handler(req, res) {
  try {
    const url = geocodeUrl(req.query, process.env.API_KEY);
    const r = await fetch(url);
    if (!r.ok) throw new HttpError(r.status || 502, 'Geocoding request failed');
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}
