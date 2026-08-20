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
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
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
