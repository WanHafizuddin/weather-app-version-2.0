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

test('bundle returns 502 when all three upstream calls fail', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const res = fakeRes();
  await bundle({ query: { lat: '3.1', lon: '101.6' } }, res);
  assert.equal(res.statusCode, 502);
  assert.ok(res.body.error);
});
