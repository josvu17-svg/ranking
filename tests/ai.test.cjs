const test = require('node:test');
const assert = require('node:assert/strict');
const { callGemini, resetCache } = require('../electron/ai.cjs');

const ok = (obj) => ({ status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

test('callGemini sends the key in a header and parses JSON', async () => {
  let seen;
  const r = await callGemini('KEY', '8 teams', { sport: 'volleyball', teams: 8 }, async (url, opt) => { seen = { url, opt }; return ok({ format: 'single' }); });
  assert.equal(r.ok, true);
  assert.equal(r.spec.format, 'single');
  assert.equal(seen.opt.headers['x-goog-api-key'], 'KEY');
  assert.ok(!seen.url.includes('KEY'));
});

test('callGemini maps errors to plain messages and falls back on 404', async () => {
  let calls = 0;
  const r = await callGemini('K', 'x', {}, async (url) => {
    if (!url.includes(':generateContent')) return { status: 500, ok: false, json: async () => ({}) };
    calls++;
    return calls === 1 ? { status: 404, ok: false, json: async () => ({}) } : ok({ format: 'none' });
  });
  assert.equal(r.ok, true);
  assert.equal(calls, 2);
  const bad = await callGemini('K', 'x', {}, async () => ({ status: 429, ok: false, json: async () => ({ error: { message: 'quota' } }) }));
  assert.match(bad.error, /quota/i);
  const off = await callGemini('K', 'x', {}, async () => { throw new Error('net'); });
  assert.match(off.error, /internet/i);
});

test('callGemini gives up when Gemini never answers', async () => {
  const hang = (url, opt) => new Promise((resolve, reject) => { opt.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }); });
  const t = Date.now();
  const r = await callGemini('K', 'x', {}, hang, 50);
  assert.equal(r.ok, false);
  assert.match(r.error, /did not answer/i);
  assert.ok(Date.now() - t < 2000);
});

test('callGemini picks the newest flash model this key can use', async () => {
  resetCache();
  const used = [];
  const list = { models: ['models/gemini-2.5-flash', 'models/gemini-3-flash-preview', 'models/gemini-3-flash', 'models/gemini-2.5-flash-preview-tts', 'models/gemini-2.5-pro', 'models/gemma-4-26b-a4b-it'].map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })) };
  const r = await callGemini('K', 'x', {}, async (url) => {
    if (!url.includes(':generateContent')) return { status: 200, ok: true, json: async () => list };
    used.push(url.split('/models/')[1].split(':')[0]);
    return ok({ format: 'single' });
  });
  assert.equal(r.ok, true);
  assert.deepEqual(used, ['gemini-3-flash']);
});

test('callGemini skips a model that stays silent and uses the next one', async () => {
  resetCache();
  const list = { models: ['models/gemini-3.8-flash', 'models/gemini-3-flash'].map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })) };
  const used = [];
  const r = await callGemini('K', 'x', {}, (url, opt) => {
    if (!url.includes(':generateContent')) return Promise.resolve({ status: 200, ok: true, json: async () => list });
    const m = url.split('/models/')[1].split(':')[0];
    used.push(m);
    if (m === 'gemini-3.8-flash') return new Promise((res, rej) => opt.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); }));
    return Promise.resolve(ok({ format: 'single' }));
  }, 50);
  assert.equal(r.ok, true);
  assert.deepEqual(used, ['gemini-3.8-flash', 'gemini-3-flash']);
});
