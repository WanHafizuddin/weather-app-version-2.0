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
