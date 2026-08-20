# Weather App v2.0 → Vercel Refresh — Design

**Date:** 2026-08-20
**Status:** Approved for planning

## Overview

Refresh the existing Node/Express + EJS weather app into a **Vercel-native**
static site with serverless API functions, a **glassmorphism UI**, and a set of
new features. The OpenWeatherMap API key stays server-side. All new data uses
OpenWeatherMap **free-tier** endpoints.

The user will handle the Vercel account setup and deployment themselves; this
project makes the code deploy-ready and provides a short deploy note.

## Goals

- Deploy cleanly on **Vercel** (static frontend + `/api` serverless functions).
- Modern **glassmorphism** UI, keeping an interactive map.
- New features: 5-day/hourly forecast, rich current details, °C/°F toggle,
  "use my location", dynamic weather background, worldwide city search with
  autocomplete, and Air Quality Index (AQI).

## Non-goals

- Favorites / recent searches (explicitly deferred).
- Any paid OpenWeatherMap tier (One Call 3.0, etc.).
- A test framework (project has none; not added for this scope).
- Server-side rendering (the current app renders a static page with no dynamic
  server data, so EJS/Express are removed).

## Architecture (Vercel-native)

Replace the single long-running Express server with **static files + two
serverless functions**. Node 18+ on Vercel provides a global `fetch`, so there
are **no runtime dependencies**.

| Path | Type | Purpose |
|---|---|---|
| `/` (`index.html`) | Static | The single page |
| `/style.css`, `/app.js` | Static | Styling + frontend logic |
| `/api/geocode.js` | Serverless fn | City autocomplete (direct) + reverse lookup |
| `/api/bundle.js` | Serverless fn | current + 5-day forecast + AQI in one response |

- Key handling: functions read `process.env.API_KEY`; it is **never** sent to
  the browser. On Vercel it is set as an Environment Variable.
- `vercel.json` is added only if custom routing/headers turn out to be needed;
  Vercel auto-detects `/api` functions and static assets.

### Removed

- `express`, `ejs`, `node-fetch`, and junk deps (`fetch`, `init`, `module`).
- `views/` and `public/` folders (flattened to project root).
- All dead/commented code in the old `index.js`, including the leaked API key
  in comments (still in git history — user may rotate the key if desired).

## API contracts

### `GET /api/geocode`

Two modes:

- **Direct (autocomplete):** `?q=<text>` →
  proxies `geo/1.0/direct?q=<text>&limit=5`.
  Returns the raw array: `[{ name, lat, lon, country, state? }, ...]`.
- **Reverse (map click fallback):** `?lat=<n>&lon=<n>` →
  proxies `geo/1.0/reverse?lat&lon&limit=1`. Returns a 1-element array.

Errors → `res.status(4xx/5xx).json({ error })`. Missing params → `400`.

### `GET /api/bundle`

`?lat=<n>&lon=<n>` (required). Calls three endpoints **in parallel** with
`units=metric`:

- `data/2.5/weather` (current)
- `data/2.5/forecast` (5-day / 3-hour, 40 entries)
- `data/2.5/air_pollution` (AQI 1–5 + components)

Returns:

```json
{
  "current":  { /* raw current-weather JSON, includes name, coord, sys.sunrise/sunset */ },
  "forecast": { /* raw forecast JSON: list[] of 3-hourly entries */ },
  "air":      { /* raw air_pollution JSON: list[0].main.aqi + components */ }
}
```

If any single upstream call fails, that key is set to `null` and the others
still return (partial render is better than total failure). Total failure (all
three) → `502`.

## Frontend

### Files

- `index.html` — markup only (no inline `<script>` beyond loading `/app.js`).
- `style.css` — full glassmorphism rewrite.
- `app.js` — split into small, single-purpose functions:
  - `geocode(query)` / `reverseGeocode(lat, lon)` — call `/api/geocode`
  - `loadWeather(lat, lon, label?)` — call `/api/bundle`, orchestrate render
  - `renderCurrent(current)` — big temp, condition, feels-like, detail chips
  - `renderAir(air)` — color-coded AQI badge
  - `renderForecast(forecast)` — daily 5-card strip + today hourly row
  - `setBackground(current)` — dynamic gradient from condition + day/night
  - `initMap()` / `setMarker(lat, lon)` — Leaflet map + click-to-search
  - `setUnits(unit)` — °C/°F toggle (client-side conversion, no re-fetch)
  - `showToast(msg)` / skeleton helpers — feedback states

### Layout (glassmorphism)

A frosted two-panel card on a **dynamic gradient background** that shifts with
weather + day/night:

- **Left — interactive map (Leaflet, no key):** opens centered on Malaysia; a
  single marker moves to the selected place; **clicking anywhere** on the map
  triggers `loadWeather(lat, lon)`.
- **Right — weather panel:**
  - Search input with **debounced autocomplete dropdown** (country/state shown
    to disambiguate) + 📍 "use my location" button + **°C/°F** toggle.
  - **Now:** large temperature, condition text, weather emoji, feels-like.
  - **Detail chips:** humidity, wind, sunrise, sunset, and a color-coded **AQI**
    badge.
  - **Forecast:** horizontal **5-day** strip (icon + hi/lo) and a **today
    hourly** row.

### Data flow / behavior

1. On load: attempt **geolocation** (with permission). If denied/unavailable →
   default to **Kuala Lumpur** (lat 3.1390, lon 101.6869).
2. Typing → debounced (~300ms) `/api/geocode?q=` → dropdown of matches.
3. Selecting a match / clicking the map / geolocation → `/api/bundle` →
   render current + forecast + AQI, move marker, recolor background.
   - Display name from `current.name`; if empty, fall back to reverse geocode
     or coordinates.
4. Temps fetched in **metric** and stored; **°C/°F toggle converts
   client-side**. Wind shown km/h (metric) / mph (imperial).
5. Forecast aggregation (client-side): hourly = next 8 entries (~24h); daily =
   group `list[]` by local date, compute min/max, pick a midday icon → 5 cards.
6. Errors → inline **toast** (not `alert()`); in-flight → **skeleton shimmer**.

### AQI mapping (1–5)

| Value | Label | Color family |
|---|---|---|
| 1 | Good | green |
| 2 | Fair | light green / yellow |
| 3 | Moderate | yellow / orange |
| 4 | Poor | orange / red |
| 5 | Very Poor | red / purple |

### Dynamic background

Gradient chosen from `current.weather[0].main` + day/night (from the icon's
`d`/`n` suffix or sunrise/sunset): Clear-day, Clear-night, Clouds, Rain,
Drizzle, Thunderstorm, Snow, Mist/Fog. Smooth CSS transition between states.

## Deploy notes (handed to user)

- Set Vercel env var **`API_KEY`** = OpenWeatherMap key (Project → Settings →
  Environment Variables). Redeploy after adding.
- Structure Vercel expects is automatic: static files at root, functions in
  `/api`. No build step required.
- `package.json`: `"type": "module"`, `"start"`/`"dev"` optional; no runtime
  deps. Local preview via `vercel dev` if desired.

## Testing / verification (manual)

- Valid city search renders current + forecast + AQI.
- Gibberish search → graceful "not found" toast, no crash.
- Geolocation allow → local weather; deny → Kuala Lumpur default.
- Map click anywhere → weather for that point; marker moves.
- °C/°F toggle converts without re-fetch.
- Partial upstream failure (e.g. AQI null) still renders the rest.
- Functions read `API_KEY` from env; key never appears in browser payloads.

## File change summary

| File | Action |
|---|---|
| `index.html` | **New** (replaces `views/index.ejs`) |
| `style.css` | **New at root** (glassmorphism; replaces `public/style.css`) |
| `app.js` | **New at root** (extracted + expanded frontend logic) |
| `api/geocode.js` | **New** serverless function |
| `api/bundle.js` | **New** serverless function |
| `package.json` | Cleaned: `type:module`, drop express/ejs/node-fetch/junk deps |
| `index.js` | **Removed** |
| `views/`, `public/` | **Removed** |
| `README.md` | Update link/description after deploy |
| `.gitignore` | Keep `.env`, `node_modules/`; add `.vercel` |
