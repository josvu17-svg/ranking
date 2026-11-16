import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup } from '../src/backup.js';

test('a backup can be read back unchanged', () => {
  const data = { names: ['A', 'B'], sport: 'football', tournament: { format: 'single', n: 2, results: { M1: { a: 0, b: 1, goals: [2, 1] } }, schedule: { M1: { d: '2026-12-01', h: '08:00' } } } };
  const f = makeBackup(data);
  assert.match(f.name, /^ranking-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(parseBackup(f.text), data);
});

test('anything else is rejected', () => {
  assert.equal(parseBackup('not json'), null);
  assert.equal(parseBackup('{}'), null);
  assert.equal(parseBackup(JSON.stringify({ app: 'other', v: 1, data: {} })), null);
  assert.equal(parseBackup(JSON.stringify({ app: 'ranking', v: 1, data: [] })), null);
  assert.equal(parseBackup(JSON.stringify({ app: 'ranking', v: 2, data: {} })), null);
});
