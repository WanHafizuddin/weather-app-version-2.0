// Pure URL builders + validation for OpenWeatherMap.
// No fetch and no env access here (key is passed in) so these are unit-testable.

const GEO = 'https://api.openweathermap.org/geo/1.0';
const DATA = 'https://api.openweathermap.org/data/2.5';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ?q=<text> → autocomplete;  ?lat=&lon= → reverse lookup
export function geocodeUrl(query, key) {
  if (!key) throw new HttpError(500, 'Server is missing its API key');
  const { q, lat, lon } = query || {};
  if (q && String(q).trim()) {
    return `${GEO}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${key}`;
  }
  const la = num(lat), lo = num(lon);
  if (la !== null && lo !== null) {
    return `${GEO}/reverse?lat=${la}&lon=${lo}&limit=1&appid=${key}`;
  }
  throw new HttpError(400, 'Provide q, or both lat and lon');
}

export function bundleUrls(query, key) {
  if (!key) throw new HttpError(500, 'Server is missing its API key');
  const la = num(query?.lat), lo = num(query?.lon);
  if (la === null || lo === null) throw new HttpError(400, 'Provide both lat and lon');
  const c = `lat=${la}&lon=${lo}&appid=${key}`;
  return {
    current: `${DATA}/weather?${c}&units=metric`,
    forecast: `${DATA}/forecast?${c}&units=metric`,
    air: `${DATA}/air_pollution?${c}`,
  };
}
