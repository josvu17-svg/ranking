import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSets, buildSwiss, buildGroups, knockoutFromSeeds, swissPreview, formatStats, standingsFor, roundRobin } from '../src/engine.js';

const S30 = [[25, 20], [25, 18], [25, 22]];

test('validateSets', () => {
  assert.equal(validateSets([[25, 20], [25, 18]]).ok, false);
  assert.equal(validateSets([[25, 20], [25, 18], [25, 22]]).ok, true);
  assert.equal(validateSets([[25, 20], [25, 18], [25, 22], [20, 25]]).ok, false);
  assert.equal(validateSets([[25, 20], [20, 25], [25, 20], [20, 25], [15, 12]]).sa, 3);
});

test('validateSets best of 3', () => {
  assert.equal(validateSets([[25, 20], [25, 18]], 3).ok, true);
  assert.equal(validateSets([[25, 20], [20, 25], [15, 12]], 3).ok, true);
  assert.equal(validateSets([[25, 20], [25, 18], [25, 10]], 3).ok, false);
  assert.equal(validateSets([[25, 20]], 3).ok, false);
});

test('bo3 points: 2-1 gives 2/1, 2-0 gives 3/0', () => {
  let rows = standingsFor([0, 1], [{ a: 0, b: 1, result: { bo: 3, sets: [[25, 20], [20, 25], [15, 10]] } }]);
  assert.equal(rows[0].pts, 2);
  assert.equal(rows[1].pts, 1);
  rows = standingsFor([0, 1], [{ a: 0, b: 1, result: { bo: 3, sets: [[25, 20], [25, 10]] } }]);
  assert.equal(rows[0].pts, 3);
  assert.equal(rows[1].pts, 0);
});

test('round robin of 4 has 3 rounds of 2', () => {
  const r = roundRobin([0, 1, 2, 3]);
  assert.equal(r.length, 3);
  r.forEach((x) => assert.equal(x.length, 2));
});

// Plays every pending match: lower index team wins 3-0.
function playAll(n, kind, extra) {
  const results = {};
  for (let guard = 0; guard < 80; guard++) {
    const s = kind === 'swiss' ? buildSwiss(n, results) : buildGroups(extra.order, extra.G, extra.per, results);
    const ms = [];
    if (kind === 'swiss') {
      s.rounds.forEach((r) => r.groups.forEach((g) => g.matches.forEach((m) => ms.push(m))));
      if (s.knockout) s.knockout.columns.forEach((c) => c.matches.forEach((m) => ms.push(m)));
    } else {
      s.rounds.forEach((pg) => pg.forEach((x) => x.forEach((m) => ms.push(m))));
      s.knockout.columns.forEach((c) => c.matches.forEach((m) => ms.push(m)));
    }
    const todo = ms.filter((m) => !m.result && m.a !== null && m.b !== null);
    if (!todo.length) return { s, results };
    todo.forEach((m) => {
      results[m.key] = { a: m.a, b: m.b, sets: m.a < m.b ? S30 : S30.map(([x, y]) => [y, x]) };
    });
  }
  throw new Error('did not finish');
}

test('swiss 8 teams: 13 matches and a champion', () => {
  const { s } = playAll(8, 'swiss');
  let total = 0;
  s.rounds.forEach((r) => r.groups.forEach((g) => { total += g.matches.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 13);
  assert.equal(s.advancers.length, 4);
  assert.equal(s.knockout.champion, 0);
});

test('swiss 16 teams: 40 matches', () => {
  const { s } = playAll(16, 'swiss');
  let total = 0;
  s.rounds.forEach((r) => r.groups.forEach((g) => { total += g.matches.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 40);
});

test('swiss 4 teams: 6 matches', () => {
  const { s } = playAll(4, 'swiss');
  let total = 0;
  s.rounds.forEach((r) => r.groups.forEach((g) => { total += g.matches.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 6);
});

test('swiss preview matches stats', () => {
  assert.match(formatStats('swiss', 8, {}), /^13 matches/);
  assert.match(formatStats('swiss', 16, {}), /^40 matches/);
  assert.match(formatStats('swiss', 4, {}), /^6 matches/);
});

test('groups 2x4 = 15 matches, champion decided', () => {
  const { s } = playAll(8, 'groups', { order: [0, 1, 2, 3, 4, 5, 6, 7], G: 2, per: 4 });
  let total = 0;
  s.rounds.forEach((pg) => pg.forEach((x) => { total += x.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 15);
  assert.equal(s.knockout.champion, 0);
  assert.match(formatStats('groups', 8, { G: 2, per: 4 }), /^15 matches/);
});

test('groups 4x2 = 11 matches', () => {
  const { s } = playAll(8, 'groups', { order: [0, 1, 2, 3, 4, 5, 6, 7], G: 4, per: 2 });
  let total = 0;
  s.rounds.forEach((pg) => pg.forEach((x) => { total += x.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 11);
});

test('single elimination with byes (6 teams = 5 matches)', () => {
  const ko = knockoutFromSeeds([0, 1, 2, 3, 4, 5], 'K', {});
  const total = ko.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 5);
  assert.equal(ko.columns[0].matches.length, 2);
});

test('stale results are ignored when participants change', () => {
  const results = { 'K1-1': { a: 9, b: 9, sets: S30 } };
  const ko = knockoutFromSeeds([0, 1, 2, 3], 'K', results);
  assert.equal(ko.columns[0].matches[0].result, null);
});

test('points: 3-2 win gives 2/1', () => {
  const rows = standingsFor([0, 1], [{ a: 0, b: 1, result: { sets: [[25, 20], [20, 25], [25, 20], [20, 25], [15, 10]] } }]);
  assert.equal(rows[0].pts, 2);
  assert.equal(rows[1].pts, 1);
});

// ---------- football ----------
import { validateGoals, resultOutcome } from '../src/engine.js';

test('football: draw gives 1 point each, win gives 3', () => {
  const rows = standingsFor([0, 1, 2], [
    { a: 0, b: 1, result: { goals: [1, 1] } },
    { a: 0, b: 2, result: { goals: [2, 0] } }
  ], 'football');
  assert.equal(rows[0].t, 0);
  assert.equal(rows[0].pts, 4);
  assert.equal(rows.find((r) => r.t === 1).pts, 1);
  assert.equal(rows.find((r) => r.t === 1).d, 1);
});

test('football tie-break: goal difference before wins', () => {
  const rows = standingsFor([0, 1, 2, 3], [
    { a: 0, b: 2, result: { goals: [5, 0] } },
    { a: 1, b: 3, result: { goals: [1, 0] } }
  ], 'football');
  assert.equal(rows[0].t, 0);
});

test('football validateGoals: knockout draw needs penalties', () => {
  assert.equal(validateGoals(1, 1, '', '', true).ok, false);
  assert.equal(validateGoals(1, 1, 4, 4, true).ok, false);
  assert.equal(validateGoals(1, 1, 5, 4, true).ok, true);
  assert.equal(validateGoals(1, 1, '', '', false).ok, true);
  assert.equal(validateGoals(2, 1, '', '', true).pen, null);
});

test('football knockout: penalties decide the winner', () => {
  assert.equal(resultOutcome({ goals: [1, 1], pen: [3, 4] }).win, 'b');
  const results = { 'K1-1': { a: 0, b: 3, goals: [0, 0], pen: [5, 3] }, 'K1-2': { a: 1, b: 2, goals: [2, 1] } };
  const ko = knockoutFromSeeds([0, 1, 2, 3], 'K', results);
  assert.equal(ko.columns[1].matches[0].a, 0);
  assert.equal(ko.columns[1].matches[0].b, 1);
});

test('football groups: draws allowed, group finishes', () => {
  const order = [0, 1, 2, 3, 4, 5, 6, 7];
  const results = {};
  for (let guard = 0; guard < 30; guard++) {
    const s = buildGroups(order, 2, 4, results, 'football');
    const ms = [];
    s.rounds.forEach((pg) => pg.forEach((x) => x.forEach((m) => ms.push(m))));
    s.knockout.columns.forEach((c) => c.matches.forEach((m) => ms.push(m)));
    const todo = ms.filter((m) => !m.result && m.a !== null && m.b !== null);
    if (!todo.length) { assert.equal(s.knockout.champion, 0); return; }
    todo.forEach((m) => { results[m.key] = { a: m.a, b: m.b, goals: m.ko ? [1, 1] : [m.a < m.b ? 1 : 0, m.a < m.b ? 0 : 1], pen: m.ko ? (m.a < m.b ? [4, 3] : [3, 4]) : null }; });
  }
  throw new Error('did not finish');
});

test('groups scale: 8 groups of 4 = 32 teams, 63-... matches and a champion', () => {
  const order = [];
  for (let i = 0; i < 32; i++) order.push(i);
  const { s } = playAll(32, 'groups', { order: order, G: 8, per: 4 });
  let total = 0;
  s.rounds.forEach((pg) => pg.forEach((x) => { total += x.length; }));
  total += s.knockout.columns.reduce((q, c) => q + c.matches.length, 0);
  assert.equal(total, 8 * 6 + 15);
  assert.equal(s.knockout.champion, 0);
  assert.match(formatStats('groups', 32, { G: 8, per: 4 }), /^63 matches/);
});

test('single elimination works for any size 2..64', () => {
  for (let n = 2; n <= 64; n++) {
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(i);
    const ko = knockoutFromSeeds(ids, 'K', {});
    assert.equal(ko.columns.reduce((q, c) => q + c.matches.length, 0), n - 1);
  }
});

test('single elimination with byes: winner of M1 meets a bye team in M5, M2 in M6...', () => {
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push(i);
  const ko = knockoutFromSeeds(ids, 'K', {});
  assert.equal(ko.columns[0].matches.length, 4);
  const r16 = ko.columns[1].matches;
  for (let j = 0; j < 4; j++) {
    assert.equal(r16[j].srcA, ko.columns[0].matches[j].key);
    assert.notEqual(r16[j].b, null);
  }
  assert.equal(r16[4].srcA, undefined);
  assert.equal(ko.columns.reduce((q, c) => q + c.matches.length, 0), 19);
});

import { normalizeSpec } from '../src/aiSpec.js';

test('AI spec: valid groups answer is kept', () => {
  const r = normalizeSpec({ format: 'groups', teams: 8, groups: 2, teams_per_group: 4, best_of: 3, summary: 's', unsupported: '' }, 'volleyball', 8);
  assert.equal(r.ok, true);
  assert.deepEqual([r.format, r.n, r.G, r.per, r.bo], ['groups', 8, 2, 4, 3]);
});

test('AI spec: swiss with 10 teams falls back with a note', () => {
  const r = normalizeSpec({ format: 'swiss', teams: 10, groups: 0, teams_per_group: 0, best_of: 0, summary: '', unsupported: '' }, 'volleyball', 8);
  assert.equal(r.format, 'groups');
  assert.ok(r.notes.length > 0);
  assert.equal(r.bo, null);
});

test('AI spec: football never gets swiss; 3 groups becomes 4; unknown format is refused', () => {
  assert.equal(normalizeSpec({ format: 'swiss', teams: 8, summary: '', unsupported: '' }, 'football', 8).format, 'groups');
  const r = normalizeSpec({ format: 'groups', teams: 12, groups: 3, teams_per_group: 4, summary: '', unsupported: '' }, 'volleyball', 12);
  assert.equal(r.G, 4);
  assert.equal(r.per, 3);
  assert.equal(normalizeSpec({ format: 'none', summary: 'x', unsupported: 'double elimination' }, 'volleyball', 8).ok, false);
});

import { buildPlan } from '../src/engine.js';

function playPlan(n, plan, sport) {
  const results = {};
  for (let guard = 0; guard < 200; guard++) {
    const b = buildPlan(n, plan, results, sport || 'volleyball', null);
    const ms = [];
    b.rounds.forEach((pg) => pg.forEach((x) => x.forEach((m) => ms.push(m))));
    if (b.knockout) b.knockout.columns.forEach((c) => c.matches.forEach((m) => ms.push(m)));
    const todo = ms.filter((m) => !m.result && m.a !== null && m.b !== null && m.a !== undefined && m.b !== undefined);
    if (!todo.length) return { b, total: ms.length };
    todo.forEach((m) => { results[m.key] = { a: m.a, b: m.b, sets: m.a < m.b ? S30 : S30.map(([x, y]) => [y, x]) }; });
  }
  throw new Error('did not finish');
}

test('plan: 5-team league has 10 matches and a champion', () => {
  const { b, total } = playPlan(5, { stage: 'league', legs: 1, playoff: false });
  assert.equal(total, 10);
  assert.equal(b.champion, 0);
});

test('plan: double round robin of 4 has 12 matches', () => {
  assert.equal(playPlan(4, { stage: 'league', legs: 2, playoff: false }).total, 12);
});

test('plan: league + top 4 playoff with third place = 10 + 2 + 1 + 1', () => {
  const { b, total } = playPlan(5, { stage: 'league', legs: 1, qualify: 4, playoff: true, thirdPlace: true });
  assert.equal(total, 10 + 4);
  assert.equal(b.champion, 0);
  assert.ok(b.thirdTeam !== null);
});

test('plan: 12 teams, 3 groups, top 2 + 2 wildcards = 8 in the knockout', () => {
  const { b, total } = playPlan(12, { stage: 'groups', groups: 3, legs: 1, advance: 2, wildcards: 2, playoff: true, thirdPlace: false });
  assert.equal(total, 3 * 6 + 7);
  assert.equal(b.champion !== null, true);
});

test('plan: knockout with third place', () => {
  const { b, total } = playPlan(8, { stage: 'knockout', thirdPlace: true });
  assert.equal(total, 8);
  assert.ok(b.thirdTeam !== null);
});

test('AI custom spec is validated', async () => {
  const { normalizeSpec } = await import('../src/aiSpec.js');
  const r = normalizeSpec({ format: 'custom', name: 'League', teams: 5, stage: 'league', legs: 1, playoff: false, qualify: 4, third_place: true, groups: 0, advance: 0, wildcards: 0, summary: 's', unsupported: '' }, 'volleyball', 5);
  assert.equal(r.ok, true);
  assert.equal(r.plan.thirdPlace, false);
  assert.equal(r.plan.qualify, 0);
  const g = normalizeSpec({ format: 'custom', teams: 12, stage: 'groups', groups: 3, advance: 2, wildcards: 2, playoff: true, third_place: true, legs: 1, summary: '', unsupported: '' }, 'volleyball', 12);
  assert.deepEqual([g.plan.groups, g.plan.advance, g.plan.wildcards, g.plan.thirdPlace], [3, 2, 2, true]);
});

import { setLang, t as tt } from '../src/i18n.js';
import { VI } from '../src/vi.js';
import { buildPlan as bp2 } from '../src/engine.js';

test('Vietnamese: ordinal labels, round names and validation messages exist', () => {
  setLang('vi');
  try {
    assert.equal(knockoutFromSeeds([0, 1, 2, 3], 'K', {}).columns[0].name, 'Bán kết');
    assert.equal(knockoutFromSeeds([0, 1, 2, 3, 4, 5, 6, 7], 'K', {}).columns[0].name, 'Tứ kết');
    assert.equal(knockoutFromSeeds(Array.from({ length: 16 }, (_, i) => i), 'K', {}).columns[0].name, 'Vòng 1/8');
    assert.match(validateSets([['25', '20']], 5).error, /ít nhất 3 set/);
    const b = bp2(8, { stage: 'groups', legs: 1, groups: 2, advance: 2, wildcards: 0, qualify: 0, playoff: true, thirdPlace: false }, {}, 'volleyball', null);
    assert.equal(b.knockout.columns[0].matches[0].labelA, 'Nhất bảng A');
    for (const k of ['1st', '2nd', '3rd', '{n}th']) assert.ok(VI[k + ' Group {g}'] && VI[k.replace('{n}th', '{n}th') + ' place'.replace('', '')] !== undefined);
    for (const k of ['Best 2nd place', 'Best 3rd place', 'Best {n}th place']) assert.ok(VI[k]);
  } finally { setLang('en'); }
  assert.equal(tt('Final'), 'Final');
  assert.equal(tt('Winner of {m}', { m: '{K1-1}' }), 'Winner of {K1-1}');
});
