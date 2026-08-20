# Weather App Vercel Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Express/EJS weather app into a Vercel-native static site with `/api` serverless functions, a glassmorphism UI, and new features (forecast, rich details, °C/°F toggle, geolocation, dynamic background, worldwide search, AQI).

**Architecture:** Static frontend (`index.html` + `style.css` + `app.js`) plus two Vercel serverless functions (`api/geocode.js`, `api/bundle.js`) that proxy OpenWeatherMap free-tier endpoints and keep the API key server-side. Pure logic is isolated into two ESM modules (`lib/owm.js`, `lib/weather-utils.js`) so it can be unit-tested with Node's built-in test runner. No runtime dependencies (Node 18+ global `fetch`).

**Tech Stack:** Vanilla JS (ESM), Leaflet (map, no key), Vercel serverless functions, OpenWeatherMap free-tier APIs, Node built-in `node:test`.

## Global Constraints

- Runtime: **Node >= 18** (global `fetch`, `node:test`). Applies to functions and tests.
- Module system: **ESM** everywhere (`package.json` has `"type": "module"`).
- **No runtime dependencies.** Dev/test uses only built-in `node:test`. Leaflet loads from CDN in the browser.
- OpenWeatherMap: **free-tier endpoints only** — `geo/1.0/direct`, `geo/1.0/reverse`, `data/2.5/weather`, `data/2.5/forecast`, `data/2.5/air_pollution`.
- API key is read **only** server-side via `process.env.API_KEY`; it must never appear in any browser payload or static file.
- Temperatures fetched in **metric**; °C↔°F conversion happens **client-side** (no re-fetch).
- Geolocation denied/unavailable → default to **Kuala Lumpur** (lat 3.1390, lon 101.6869).

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | ESM, `test` script (`node --test`), no runtime deps |
| `lib/owm.js` | Server-side pure URL builders + input validation (`HttpError`, `geocodeUrl`, `bundleUrls`) |
| `api/geocode.js` | Serverless handler: autocomplete / reverse geocode |
| `api/bundle.js` | Serverless handler: current + forecast + air in one response |
| `lib/weather-utils.js` | Client-side pure formatting/aggregation (temp, wind, AQI, emoji, forecast grouping, background) |
| `index.html` | Markup only; loads Leaflet + `app.js` module |
| `style.css` | Glassmorphism styling + dynamic-background hook |
| `app.js` | Browser orchestration: search/autocomplete, fetch, render, map, geolocation, unit toggle, toasts |
| `test/owm.test.js` | Unit tests for `lib/owm.js` |
| `test/api.test.js` | Handler tests for `api/*.js` (mocked `fetch`) |
| `test/weather-utils.test.js` | Unit tests for `lib/weather-utils.js` |
| `README.md` | Features + Vercel deploy note |

**Removed:** `index.js`, `views/`, `public/`.

---

## Task 1: Project scaffold & cleanup

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Delete: `index.js`, `views/index.ejs`, `public/style.css` (and the now-empty `views/`, `public/`)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean Vercel-native skeleton; `npm test` runs `node --test`.

- [ ] **Step 1: Replace `package.json`**

```json
{
  "name": "weather-app",
  "version": "2.1.0",
  "private": true,
  "type": "module",
  "description": "Glassmorphism weather app on Vercel (OpenWeatherMap)",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test",
    "dev": "vercel dev"
  }
}
```

- [ ] **Step 2: Update `.gitignore`**

Ensure it contains exactly these lines (keep `.env` and `node_modules/`, add `.vercel`):

```
/.env
node_modules/
.vercel
```

- [ ] **Step 3: Delete the old Express app and template folders**

```bash
git rm index.js views/index.ejs public/style.css
```
(Run `rmdir views public` afterward if the folders remain and are empty.)

- [ ] **Step 4: Verify the test runner is wired (no tests yet is fine)**

Run: `npm test`
Expected: exits 0 with a message indicating 0 tests found (Node prints `tests 0`). No crash.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold Vercel-native structure, remove Express app"
```

---

## Task 2: Server URL builders (`lib/owm.js`)

**Files:**
- Create: `lib/owm.js`
- Test: `test/owm.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class HttpError extends Error { status: number }`
  - `geocodeUrl(query: {q?, lat?, lon?}, key: string) → string` (throws `HttpError`)
  - `bundleUrls(query: {lat, lon}, key: string) → { current: string, forecast: string, air: string }` (throws `HttpError`)

- [ ] **Step 1: Write the failing test**

Create `test/owm.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodeUrl, bundleUrls, HttpError } from '../lib/owm.js';

test('geocodeUrl builds a direct search URL from q', () => {
  const url = geocodeUrl({ q: 'Kota Bharu' }, 'KEY');
  assert.match(url, /geo\/1\.0\/direct/);
  assert.match(url, /q=Kota%20Bharu/);
  assert.match(url, /appid=KEY/);
});

test('geocodeUrl builds a reverse URL from lat/lon', () => {
  const url = geocodeUrl({ lat: '6.12', lon: '102.24' }, 'KEY');
  assert.match(url, /geo\/1\.0\/reverse/);
  assert.match(url, /lat=6\.12/);
  assert.match(url, /lon=102\.24/);
});

test('geocodeUrl throws 400 when no usable params', () => {
  assert.throws(() => geocodeUrl({}, 'KEY'), (e) => e instanceof HttpError && e.status === 400);
});

test('geocodeUrl throws 500 when key missing', () => {
  assert.throws(() => geocodeUrl({ q: 'x' }, ''), (e) => e.status === 500);
});

test('bundleUrls returns three metric URLs', () => {
  const u = bundleUrls({ lat: '1.5', lon: '110.3' }, 'KEY');
  assert.match(u.current, /data\/2\.5\/weather.*units=metric/);
  assert.match(u.forecast, /data\/2\.5\/forecast.*units=metric/);
  assert.match(u.air, /data\/2\.5\/air_pollution/);
  assert.ok(!/units=metric/.test(u.air)); // air_pollution has no units param
});

test('bundleUrls throws 400 without lat/lon', () => {
  assert.throws(() => bundleUrls({ lat: 'abc' }, 'KEY'), (e) => e.status === 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/owm.test.js`
Expected: FAIL — cannot import from `../lib/owm.js` (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/owm.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/owm.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/owm.js test/owm.test.js
git commit -m "feat: add OpenWeatherMap URL builders with validation"
```

---

## Task 3: Serverless functions (`api/geocode.js`, `api/bundle.js`)

**Files:**
- Create: `api/geocode.js`
- Create: `api/bundle.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `geocodeUrl`, `bundleUrls`, `HttpError` from `lib/owm.js`.
- Produces (Vercel handler signature `(req, res)` where `req.query` is a parsed object and `res` has chainable `.status(n).json(obj)`):
  - `api/geocode.js` default export → responds `200` with the upstream array, or `{ error }` with the error status.
  - `api/bundle.js` default export → responds `200` with `{ current, forecast, air }` (any may be `null`), `400` on bad params, `502` if all three upstream calls fail.

- [ ] **Step 1: Write the failing test**

Create `test/api.test.js`:

```js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import geocode from '../api/geocode.js';
import bundle from '../api/bundle.js';

const realFetch = globalThis.fetch;
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

beforeEach(() => { process.env.API_KEY = 'TESTKEY'; });
afterEach(() => { globalThis.fetch = realFetch; });

test('geocode returns 200 with upstream data', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ name: 'Ipoh' }] });
  const res = fakeRes();
  await geocode({ query: { q: 'Ipoh' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ name: 'Ipoh' }]);
});

test('geocode returns 400 on missing params (no fetch call)', async () => {
  globalThis.fetch = async () => { throw new Error('should not be called'); };
  const res = fakeRes();
  await geocode({ query: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
});

test('bundle merges the three upstream responses', async () => {
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => ({ tag: url.includes('forecast') ? 'F' : url.includes('air_pollution') ? 'A' : 'C' }),
  });
  const res = fakeRes();
  await bundle({ query: { lat: '3.1', lon: '101.6' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.current.tag, 'C');
  assert.equal(res.body.forecast.tag, 'F');
  assert.equal(res.body.air.tag, 'A');
});

test('bundle tolerates one failing upstream (air null, still 200)', async () => {
  globalThis.fetch = async (url) => url.includes('air_pollution')
    ? ({ ok: false, status: 500 })
    : ({ ok: true, json: async () => ({ ok: true }) });
  const res = fakeRes();
  await bundle({ query: { lat: '3.1', lon: '101.6' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.air, null);
  assert.ok(res.body.current);
});

test('bundle returns 400 on bad params', async () => {
  const res = fakeRes();
  await bundle({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/api.test.js`
Expected: FAIL — cannot import `../api/geocode.js` / `../api/bundle.js`.

- [ ] **Step 3: Write `api/geocode.js`**

```js
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
```

- [ ] **Step 4: Write `api/bundle.js`**

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/api.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add api/geocode.js api/bundle.js test/api.test.js
git commit -m "feat: add geocode and bundle serverless functions"
```

---

## Task 4: Client weather utilities (`lib/weather-utils.js`)

**Files:**
- Create: `lib/weather-utils.js`
- Test: `test/weather-utils.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all pure, no DOM):
  - `cToF(c: number) → number`
  - `formatTemp(celsius: number, unit: 'metric'|'imperial') → string` (e.g. `"20°C"`)
  - `formatWind(ms: number, unit) → string` (km/h metric, mph imperial)
  - `aqiInfo(aqi: 1..5) → { label: string, color: string }`
  - `weatherEmoji(main: string) → string`
  - `weatherIcon(temp)`—not used; skip.
  - `hourlyFromForecast(forecast, count=8) → [{ time, temp, icon, main }]`
  - `dailyFromForecast(forecast, days=5) → [{ date, min, max, icon, main }]`
  - `backgroundFor(main: string, isDay: boolean) → string` (a CSS gradient)
  - `isDayFromIcon(icon: string) → boolean`

- [ ] **Step 1: Write the failing test**

Create `test/weather-utils.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cToF, formatTemp, formatWind, aqiInfo, weatherEmoji,
  hourlyFromForecast, dailyFromForecast, backgroundFor, isDayFromIcon,
} from '../lib/weather-utils.js';

test('cToF converts correctly', () => {
  assert.equal(cToF(0), 32);
  assert.equal(cToF(100), 212);
});

test('formatTemp respects unit', () => {
  assert.equal(formatTemp(20, 'metric'), '20°C');
  assert.equal(formatTemp(0, 'imperial'), '32°F');
});

test('formatWind respects unit', () => {
  assert.equal(formatWind(10, 'metric'), '36 km/h');
  assert.equal(formatWind(10, 'imperial'), '22 mph');
});

test('aqiInfo maps 1..5 and unknown', () => {
  assert.equal(aqiInfo(1).label, 'Good');
  assert.equal(aqiInfo(5).label, 'Very Poor');
  assert.equal(aqiInfo(99).label, 'Unknown');
});

test('weatherEmoji picks by condition', () => {
  assert.equal(weatherEmoji('Rain'), '🌧️');
  assert.equal(weatherEmoji('Clear'), '☀️');
  assert.equal(weatherEmoji('Clouds'), '☁️');
});

const sampleForecast = {
  list: [
    { dt_txt: '2026-08-20 12:00:00', main: { temp: 30 }, weather: [{ main: 'Clear', icon: '01d' }] },
    { dt_txt: '2026-08-20 15:00:00', main: { temp: 33 }, weather: [{ main: 'Clouds', icon: '02d' }] },
    { dt_txt: '2026-08-21 12:00:00', main: { temp: 28 }, weather: [{ main: 'Rain', icon: '10d' }] },
  ],
};

test('hourlyFromForecast slices the list', () => {
  const h = hourlyFromForecast(sampleForecast, 2);
  assert.equal(h.length, 2);
  assert.equal(h[0].temp, 30);
});

test('dailyFromForecast groups by date with min/max', () => {
  const d = dailyFromForecast(sampleForecast);
  assert.equal(d.length, 2);
  assert.equal(d[0].date, '2026-08-20');
  assert.equal(d[0].min, 30);
  assert.equal(d[0].max, 33);
});

test('backgroundFor returns a gradient string', () => {
  assert.match(backgroundFor('Clear', true), /gradient/);
});

test('isDayFromIcon reads the d/n suffix', () => {
  assert.equal(isDayFromIcon('01d'), true);
  assert.equal(isDayFromIcon('10n'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/weather-utils.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/weather-utils.js`:

```js
// Pure client-side helpers. No DOM access — safe to unit-test in Node.

export function cToF(c) { return c * 9 / 5 + 32; }

export function formatTemp(celsius, unit) {
  const v = unit === 'imperial' ? cToF(celsius) : celsius;
  return `${Math.round(v)}°${unit === 'imperial' ? 'F' : 'C'}`;
}

export function formatWind(ms, unit) {
  return unit === 'imperial'
    ? `${Math.round(ms * 2.236936)} mph`
    : `${Math.round(ms * 3.6)} km/h`;
}

const AQI = {
  1: { label: 'Good', color: '#4caf50' },
  2: { label: 'Fair', color: '#8bc34a' },
  3: { label: 'Moderate', color: '#ffc107' },
  4: { label: 'Poor', color: '#ff9800' },
  5: { label: 'Very Poor', color: '#f44336' },
};
export function aqiInfo(aqi) {
  return AQI[aqi] || { label: 'Unknown', color: '#9e9e9e' };
}

export function weatherEmoji(main = '') {
  const m = String(main).toLowerCase();
  if (m.includes('thunder')) return '⛈️';
  if (m.includes('drizzle')) return '🌦️';
  if (m.includes('rain')) return '🌧️';
  if (m.includes('snow')) return '❄️';
  if (m.includes('clear')) return '☀️';
  if (m.includes('cloud')) return '☁️';
  if (['mist', 'fog', 'haze', 'smoke'].some((x) => m.includes(x))) return '🌫️';
  if (m.includes('tornado')) return '🌪️';
  return '🌡️';
}

export function hourlyFromForecast(forecast, count = 8) {
  if (!forecast || !Array.isArray(forecast.list)) return [];
  return forecast.list.slice(0, count).map((e) => ({
    time: e.dt_txt,
    temp: e.main.temp,
    icon: e.weather?.[0]?.icon,
    main: e.weather?.[0]?.main || '',
  }));
}

export function dailyFromForecast(forecast, days = 5) {
  if (!forecast || !Array.isArray(forecast.list)) return [];
  const byDate = new Map();
  for (const e of forecast.list) {
    const [date, time = ''] = (e.dt_txt || '').split(' ');
    if (!date) continue;
    if (!byDate.has(date)) {
      byDate.set(date, { date, min: Infinity, max: -Infinity, icon: null, main: '' });
    }
    const d = byDate.get(date);
    d.min = Math.min(d.min, e.main.temp);
    d.max = Math.max(d.max, e.main.temp);
    // Prefer the midday reading for the representative icon.
    if (time.startsWith('12') || d.icon === null) {
      d.icon = e.weather?.[0]?.icon || d.icon;
      d.main = e.weather?.[0]?.main || d.main;
    }
  }
  return Array.from(byDate.values()).slice(0, days);
}

export function isDayFromIcon(icon = '') {
  return String(icon).endsWith('d');
}

export function backgroundFor(main = '', isDay = true) {
  const m = String(main).toLowerCase();
  if (m.includes('thunder')) return 'linear-gradient(160deg,#232526,#414345)';
  if (m.includes('rain') || m.includes('drizzle')) return 'linear-gradient(160deg,#3a6073,#16222a)';
  if (m.includes('snow')) return 'linear-gradient(160deg,#e6dada,#a1c4fd)';
  if (['mist', 'fog', 'haze', 'smoke'].some((x) => m.includes(x))) return 'linear-gradient(160deg,#757f9a,#d7dde8)';
  if (m.includes('cloud')) return isDay ? 'linear-gradient(160deg,#8ec5fc,#9bb5c9)' : 'linear-gradient(160deg,#4b6cb7,#182848)';
  if (m.includes('clear')) return isDay ? 'linear-gradient(160deg,#2980b9,#6dd5fa)' : 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)';
  return isDay ? 'linear-gradient(160deg,#8ec5fc,#6dd16d)' : 'linear-gradient(160deg,#141e30,#243b55)';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/weather-utils.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites pass (owm + api + weather-utils).

- [ ] **Step 6: Commit**

```bash
git add lib/weather-utils.js test/weather-utils.test.js
git commit -m "feat: add client weather formatting and aggregation helpers"
```

---

## Task 5: Markup (`index.html`)

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `app.js` (module, loaded at end of body) and Leaflet from CDN.
- Produces: element IDs that `app.js` (Task 7) drives — `map`, `city-input`, `search-btn`, `locate-btn`, `suggestions`, `unit-c`, `unit-f`, `city-name`, `weather-icon`, `temp-display`, `weather-desc`, `feels-like`, `humidity`, `wind`, `sunrise`, `sunset`, `aqi-badge`, `daily`, `hourly`, `weather-panel`, `toast`.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weather</title>
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <main class="app">
    <!-- Left: interactive map -->
    <section class="map-panel">
      <div class="map-title">🗺️ Click anywhere for weather</div>
      <div id="map"></div>
    </section>

    <!-- Right: weather -->
    <section class="weather-panel" id="weather-panel">
      <div class="search-wrap">
        <div class="search-row">
          <input id="city-input" type="text" placeholder="Search any city…" autocomplete="off" />
          <button id="locate-btn" title="Use my location" aria-label="Use my location">📍</button>
          <button id="search-btn">Search</button>
        </div>
        <ul id="suggestions" class="suggestions" style="display:none"></ul>
      </div>

      <div class="units">
        <button id="unit-c" class="active">°C</button>
        <button id="unit-f">°F</button>
      </div>

      <div class="current">
        <h1 id="city-name">—</h1>
        <div id="weather-icon" class="wicon">🗺️</div>
        <div id="temp-display" class="temp">--</div>
        <div id="weather-desc" class="desc">Pick a city or click the map</div>
        <div id="feels-like" class="feels"></div>
      </div>

      <div class="chips">
        <div class="chip"><span class="k">Humidity</span><span id="humidity" class="v">–</span></div>
        <div class="chip"><span class="k">Wind</span><span id="wind" class="v">–</span></div>
        <div class="chip"><span class="k">Sunrise</span><span id="sunrise" class="v">–</span></div>
        <div class="chip"><span class="k">Sunset</span><span id="sunset" class="v">–</span></div>
        <div class="chip aqi"><span class="k">Air</span><span id="aqi-badge" class="badge" style="display:none"></span></div>
      </div>

      <div class="forecast">
        <h3>Next 5 days</h3>
        <div id="daily" class="daily"></div>
        <h3>Hourly</h3>
        <div id="hourly" class="hourly"></div>
      </div>
    </section>
  </main>

  <div id="toast" class="toast"></div>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify it parses and loads statically**

Run: `npx serve . -l 5000` (or any static server) and open `http://localhost:5000`.
Expected: page renders the two panels and the Leaflet map tiles appear (weather is empty until Task 7). No console errors except the missing `/app.js` (added next task) — acceptable at this step.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add glassmorphism page markup"
```

---

## Task 6: Styling (`style.css`)

**Files:**
- Create: `style.css`

**Interfaces:**
- Consumes: the element/class names from `index.html` (Task 5).
- Produces: glassmorphism styling; `body`'s `background` is overwritten at runtime by `app.js` via `backgroundFor(...)`.

- [ ] **Step 1: Create `style.css`**

```css
* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: #1a2233;
  background: linear-gradient(160deg, #8ec5fc, #6dd16d);
  transition: background 0.8s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.app {
  display: flex;
  width: min(1000px, 100%);
  min-height: 560px;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

/* Map */
.map-panel { position: relative; width: 46%; min-height: 100%; }
#map { position: absolute; inset: 0; height: 100%; width: 100%; }
.map-title {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  z-index: 500; background: rgba(255, 255, 255, 0.9);
  padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); white-space: nowrap;
}

/* Weather panel */
.weather-panel { flex: 1; padding: 26px; display: flex; flex-direction: column; gap: 16px; }
.weather-panel.loading { opacity: 0.55; pointer-events: none; }

.search-wrap { position: relative; }
.search-row { display: flex; gap: 8px; }
#city-input {
  flex: 1; padding: 11px 16px; border-radius: 14px; border: none; font-size: 1rem;
  background: rgba(255, 255, 255, 0.75); outline: none;
}
#locate-btn, #search-btn {
  border: none; border-radius: 14px; cursor: pointer; font-size: 1rem; padding: 0 14px;
  background: rgba(255, 255, 255, 0.75); transition: background 0.2s;
}
#search-btn { background: #2980b9; color: #fff; font-weight: 600; }
#search-btn:hover { background: #1f6391; }
#locate-btn:hover { background: rgba(255, 255, 255, 0.95); }

.suggestions {
  list-style: none; margin: 6px 0 0; padding: 6px; position: absolute; z-index: 600;
  left: 0; right: 0; background: rgba(255, 255, 255, 0.98); border-radius: 12px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2); max-height: 240px; overflow-y: auto;
}
.suggestions li { padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 0.92rem; }
.suggestions li:hover { background: #eaf3fb; }

.units { display: flex; gap: 6px; align-self: flex-start; }
.units button {
  border: none; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-weight: 600;
  background: rgba(255, 255, 255, 0.4);
}
.units button.active { background: #2980b9; color: #fff; }

.current { text-align: center; background: rgba(255, 255, 255, 0.28); border-radius: 20px; padding: 22px; }
.current h1 { margin: 0 0 6px; font-size: 1.7rem; }
.wicon { font-size: 3.4rem; line-height: 1; }
.temp { font-size: 3rem; font-weight: 700; margin: 6px 0; }
.desc { text-transform: capitalize; font-size: 1.05rem; }
.feels { opacity: 0.8; font-size: 0.9rem; margin-top: 4px; }

.chips { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.chip {
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255, 255, 255, 0.28); border-radius: 14px; padding: 10px 14px;
}
.chip .k { opacity: 0.75; font-size: 0.85rem; }
.chip .v { font-weight: 700; }
.badge { padding: 3px 10px; border-radius: 12px; color: #fff; font-weight: 700; font-size: 0.8rem; }

.forecast h3 { margin: 6px 0; font-size: 0.95rem; opacity: 0.85; }
.daily, .hourly { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.fcard, .hcard {
  flex: 0 0 auto; min-width: 74px; text-align: center; padding: 10px 8px;
  background: rgba(255, 255, 255, 0.28); border-radius: 14px; font-size: 0.82rem;
}
.fcard img, .hcard img { width: 42px; height: 42px; }
.fcard .fday { display: block; font-weight: 700; margin-bottom: 2px; }

.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
  background: #d64545; color: #fff; padding: 12px 20px; border-radius: 14px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3); opacity: 0; pointer-events: none;
  transition: opacity 0.3s, transform 0.3s;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 820px) {
  .app { flex-direction: column; min-height: auto; }
  .map-panel { width: 100%; height: 260px; }
  #map { position: absolute; }
  .chips { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Visual check**

Reload the static server from Task 5. Expected: frosted two-panel card, gradient background, styled search/units/chips. Map fills the left panel; on mobile width the layout stacks.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: add glassmorphism stylesheet"
```

---

## Task 7: Frontend orchestration (`app.js`)

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `lib/weather-utils.js` exports; `/api/geocode` and `/api/bundle`; Leaflet global `L`; the element IDs from `index.html` (Task 5).
- Produces: the running app behavior (search, autocomplete, map click, geolocation, unit toggle, render, dynamic background, toasts).

- [ ] **Step 1: Create `app.js`**

```js
import {
  formatTemp, formatWind, aqiInfo, weatherEmoji,
  dailyFromForecast, hourlyFromForecast, backgroundFor, isDayFromIcon,
} from '/lib/weather-utils.js';

const DEFAULT = { lat: 3.1390, lon: 101.6869, name: 'Kuala Lumpur' };
const el = (id) => document.getElementById(id);

let unit = 'metric';
let last = null;   // last bundle, for re-render on unit toggle
let lastLabel = '';
let map, marker, debounce;

/* ---------- Map ---------- */
function initMap() {
  map = L.map('map').setView([4.2105, 101.9758], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  map.on('click', (e) => loadWeather(e.latlng.lat, e.latlng.lng));
}
function setMarker(lat, lon) {
  if (marker) marker.setLatLng([lat, lon]);
  else marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 9);
}

/* ---------- Fetch ---------- */
async function geocode(q) {
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
async function loadWeather(lat, lon, label) {
  el('weather-panel').classList.add('loading');
  try {
    const r = await fetch(`/api/bundle?lat=${lat}&lon=${lon}`);
    if (!r.ok) throw new Error('bundle failed');
    last = await r.json();
    lastLabel = label || '';
    render();
    setMarker(lat, lon);
  } catch {
    showToast('Could not load weather. Please try again.');
  } finally {
    el('weather-panel').classList.remove('loading');
  }
}

/* ---------- Render ---------- */
function render() {
  if (!last) return;
  const { current, forecast, air } = last;
  if (current) {
    renderCurrent(current);
    const icon = current.weather?.[0]?.icon || '';
    document.body.style.background = backgroundFor(current.weather?.[0]?.main, isDayFromIcon(icon));
  }
  if (forecast) renderForecast(forecast);
  renderAir(air);
}

function renderCurrent(c) {
  el('city-name').textContent =
    lastLabel || c.name || `${c.coord.lat.toFixed(2)}, ${c.coord.lon.toFixed(2)}`;
  const desc = c.weather?.[0]?.description || '';
  el('weather-icon').textContent = weatherEmoji(c.weather?.[0]?.main);
  el('temp-display').textContent = formatTemp(c.main.temp, unit);
  el('weather-desc').textContent = desc;
  el('feels-like').textContent = `Feels like ${formatTemp(c.main.feels_like, unit)}`;
  el('humidity').textContent = `${c.main.humidity}%`;
  el('wind').textContent = formatWind(c.wind.speed, unit);
  el('sunrise').textContent = fmtTime(c.sys.sunrise, c.timezone);
  el('sunset').textContent = fmtTime(c.sys.sunset, c.timezone);
}

function renderAir(air) {
  const badge = el('aqi-badge');
  const aqi = air?.list?.[0]?.main?.aqi;
  if (!aqi) { badge.style.display = 'none'; return; }
  const info = aqiInfo(aqi);
  badge.style.display = '';
  badge.textContent = info.label;
  badge.style.background = info.color;
}

function renderForecast(forecast) {
  const c = (t) => (unit === 'imperial' ? Math.round(t * 9 / 5 + 32) : Math.round(t));
  el('daily').innerHTML = dailyFromForecast(forecast).map((d) => `
    <div class="fcard">
      <span class="fday">${weekday(d.date)}</span>
      <img alt="" src="https://openweathermap.org/img/wn/${d.icon || '01d'}.png" />
      <span>${c(d.max)}° / ${c(d.min)}°</span>
    </div>`).join('');
  el('hourly').innerHTML = hourlyFromForecast(forecast).map((h) => `
    <div class="hcard">
      <span>${(h.time.split(' ')[1] || '').slice(0, 5)}</span>
      <img alt="" src="https://openweathermap.org/img/wn/${h.icon || '01d'}.png" />
      <span>${formatTemp(h.temp, unit)}</span>
    </div>`).join('');
}

/* ---------- Helpers ---------- */
function fmtTime(unixSec, tzOffsetSec = 0) {
  const d = new Date((unixSec + tzOffsetSec) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
function weekday(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
}
function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ---------- Search + autocomplete ---------- */
function onInput(e) {
  clearTimeout(debounce);
  const q = e.target.value.trim();
  if (q.length < 2) return hideDropdown();
  debounce = setTimeout(async () => showDropdown(await geocode(q)), 300);
}
function showDropdown(results) {
  const dd = el('suggestions');
  if (!results.length) return hideDropdown();
  dd._results = results;
  dd.innerHTML = results.map((r, i) =>
    `<li data-i="${i}">${r.name}${r.state ? ', ' + r.state : ''}, ${r.country}</li>`).join('');
  dd.style.display = '';
}
function hideDropdown() { el('suggestions').style.display = 'none'; }

async function submitSearch() {
  const q = el('city-input').value.trim();
  if (!q) return;
  const results = await geocode(q);
  if (!results.length) return showToast('City not found');
  pick(results[0]);
}
function pick(r) {
  el('city-input').value = r.name;
  hideDropdown();
  loadWeather(r.lat, r.lon, `${r.name}, ${r.country}`);
}

/* ---------- Units ---------- */
function setUnits(u) {
  unit = u;
  el('unit-c').classList.toggle('active', u === 'metric');
  el('unit-f').classList.toggle('active', u === 'imperial');
  render();
}

/* ---------- Geolocation ---------- */
function useMyLocation() {
  if (!navigator.geolocation) return loadWeather(DEFAULT.lat, DEFAULT.lon, DEFAULT.name);
  navigator.geolocation.getCurrentPosition(
    (p) => loadWeather(p.coords.latitude, p.coords.longitude),
    () => loadWeather(DEFAULT.lat, DEFAULT.lon, DEFAULT.name),
  );
}

/* ---------- Wire up ---------- */
function initEvents() {
  el('city-input').addEventListener('input', onInput);
  el('city-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitSearch(); });
  el('search-btn').addEventListener('click', submitSearch);
  el('locate-btn').addEventListener('click', useMyLocation);
  el('unit-c').addEventListener('click', () => setUnits('metric'));
  el('unit-f').addEventListener('click', () => setUnits('imperial'));
  el('suggestions').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) pick(el('suggestions')._results[li.dataset.i]);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) hideDropdown(); });
}

window.addEventListener('load', () => {
  initMap();
  initEvents();
  useMyLocation();
});
```

- [ ] **Step 2: End-to-end manual verification**

This step needs the OpenWeatherMap key, so run with `vercel dev` (or set `API_KEY` in the environment for whatever local function runner is used):

```bash
API_KEY=your_owm_key vercel dev
```
Open the served URL and confirm:
- On load: geolocation prompt → allow shows local weather; deny shows **Kuala Lumpur**.
- Typing 2+ chars shows an autocomplete dropdown; selecting one loads its weather and moves the map marker.
- Clicking anywhere on the map loads weather for that point.
- °C/°F toggle changes all temperatures without a network request (check the Network tab).
- Current details (feels-like, humidity, wind, sunrise/sunset), the 5-day + hourly strips, and the AQI badge all populate.
- The page background changes with the condition/day-night.
- A gibberish search shows the "City not found" toast (no crash).

- [ ] **Step 3: Confirm automated suite still green**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: wire up search, map, forecast, AQI, units, and dynamic background"
```

---

## Task 8: README + deploy note

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: user-facing docs + Vercel deploy steps.

- [ ] **Step 1: Replace `README.md`**

```markdown
# Weather App

A glassmorphism weather app: worldwide city search, an interactive map
(click anywhere), 5-day + hourly forecast, air quality, and a background
that shifts with the weather. Built as static files + Vercel serverless
functions over the OpenWeatherMap free tier.

## Features
- 🔎 Worldwide city search with autocomplete
- 🗺️ Interactive map — click anywhere to get that location's weather
- 📍 "Use my location" (falls back to Kuala Lumpur if denied)
- 🌡️ Current conditions: feels-like, humidity, wind, sunrise/sunset
- 📅 5-day and hourly forecast
- 🌬️ Air Quality Index (color-coded)
- 🔁 °C / °F toggle
- 🎨 Dynamic background by condition + day/night

## Local development
```bash
npm i -g vercel
API_KEY=your_openweathermap_key vercel dev
```

## Tests
```bash
npm test
```

## Deploy (Vercel)
1. Push this repo to GitHub and import it in Vercel (framework preset: **Other**).
2. Add an Environment Variable **`API_KEY`** = your OpenWeatherMap key.
3. Deploy. Static files are served from the root; functions live in `/api`.

> The API key is used only inside `/api` serverless functions and is never
> sent to the browser.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with features and Vercel deploy steps"
```

---

## Self-Review

**1. Spec coverage**
- Vercel static + 2 functions → Tasks 1, 3. ✓
- Remove express/ejs/node-fetch/junk + dead code/leaked key → Task 1 (files deleted wholesale). ✓
- `/api/geocode` (direct + reverse) → Tasks 2, 3. ✓
- `/api/bundle` (current+forecast+air, partial-failure) → Tasks 2, 3. ✓
- Glassmorphism layout, map kept, click-anywhere → Tasks 5, 6, 7. ✓
- Search autocomplete, 📍 location, °C/°F, current details, 5-day+hourly, AQI, dynamic bg → Tasks 4, 5, 6, 7. ✓
- KL default on geolocation denial → Task 7. ✓
- Client-side unit conversion (no re-fetch) → Task 4 (`formatTemp`) + Task 7 (`setUnits` re-renders from cached `last`). ✓
- Toasts instead of `alert()`, loading state → Tasks 6, 7. ✓
- Deploy note (env var, structure) → Task 8. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**3. Type consistency:**
- `geocodeUrl` / `bundleUrls` / `HttpError` signatures match between Task 2 (definition) and Task 3 (use). ✓
- `dailyFromForecast` returns `{date,min,max,icon,main}`; `renderForecast` reads `d.icon`, `d.max`, `d.min`, `d.date`. ✓ (Task 4 test asserts the same shape.)
- `hourlyFromForecast` returns `{time,temp,icon,main}`; `renderForecast` reads `h.time`, `h.icon`, `h.temp`. ✓
- `aqiInfo` returns `{label,color}`; `renderAir` reads both. ✓
- Element IDs listed in Task 5 match every `el('…')` call in Task 7. ✓
- `backgroundFor(main, isDay)` / `isDayFromIcon(icon)` signatures match between Task 4 and Task 7. ✓

No issues found.
