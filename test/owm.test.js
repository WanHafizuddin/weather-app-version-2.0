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
