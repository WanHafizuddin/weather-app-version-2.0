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
