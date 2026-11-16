// Tournament engine: pure functions, no UI. Volleyball, best of 5 sets.
import { t } from './i18n.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ---------- results ----------

// sets: array of [pointsA, pointsB]; blank rows must already be removed.
export function scoreSets(sets) {
  let sa = 0;
  let sb = 0;
  let pa = 0;
  let pb = 0;
  for (const [a, b] of sets) {
    if (a > b) sa++;
    else sb++;
    pa += a;
    pb += b;
  }
  return { sa, sb, pa, pb };
}

// Returns { ok, error, sets, sa, sb } for a list of [a, b] rows (strings or numbers, blanks allowed).
// bo = 3 (first to 2 sets) or 5 (first to 3 sets).
export function validateSets(rows, bo) {
  const best = bo === 3 ? 3 : 5;
  const need = (best + 1) / 2;
  const sets = [];
  for (const r of rows) {
    const aEmpty = r[0] === '' || r[0] == null;
    const bEmpty = r[1] === '' || r[1] == null;
    if (aEmpty && bEmpty) continue;
    if (aEmpty || bEmpty) return { ok: false, error: t('Fill in both scores of each set.') };
    const a = Number(r[0]);
    const b = Number(r[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      return { ok: false, error: t('Scores must be whole numbers.') };
    }
    if (a === b) return { ok: false, error: t('A set cannot end in a tie.') };
    sets.push([a, b]);
  }
  if (sets.length < need) return { ok: false, error: t('Enter at least {n} sets.', { n: need }) };
  if (sets.length > best) return { ok: false, error: t('A best of {n} match has at most {n} sets.', { n: best }) };
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < sets.length; i++) {
    if (sa === need || sb === need) return { ok: false, error: t('The match was already decided before set {n}.', { n: i + 1 }) };
    if (sets[i][0] > sets[i][1]) sa++;
    else sb++;
  }
  if (sa !== need && sb !== need) return { ok: false, error: t('One team must win {n} sets.', { n: need }) };
  return { ok: true, sets: sets, sa: sa, sb: sb };
}

// Football: goals [ga, gb]; in a knockout a level game needs penalties [pa, pb].
export function validateGoals(ga, gb, pa, pb, knockout) {
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  const a = num(ga);
  const b = num(gb);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return { ok: false, error: t('Enter the goals of both teams.') };
  if (a !== b) return { ok: true, goals: [a, b], pen: null };
  if (!knockout) return { ok: true, goals: [a, b], pen: null };
  const x = num(pa);
  const y = num(pb);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return { ok: false, error: t('Level after normal time: enter the penalty shootout score.') };
  if (x === y) return { ok: false, error: t('A penalty shootout cannot end level.') };
  return { ok: true, goals: [a, b], pen: [x, y] };
}

// Score shown for a result and who won ('a', 'b' or null for a draw).
export function resultOutcome(r) {
  if (r.goals) {
    const ga = r.goals[0];
    const gb = r.goals[1];
    let win = null;
    if (ga > gb) win = 'a';
    else if (ga < gb) win = 'b';
    else if (r.pen) win = r.pen[0] > r.pen[1] ? 'a' : 'b';
    return { sa: ga, sb: gb, win: win };
  }
  const s = scoreSets(r.sets);
  return { sa: s.sa, sb: s.sb, win: s.sa > s.sb ? 'a' : 'b' };
}

// ---------- standings ----------

export function emptyRow(t) {
  return { t: t, p: 0, w: 0, d: 0, l: 0, sw: 0, sl: 0, pf: 0, pa: 0, pts: 0 };
}

export function applyResult(rowA, rowB, result) {
  rowA.p++;
  rowB.p++;
  if (result.goals) {
    const ga = result.goals[0];
    const gb = result.goals[1];
    rowA.pf += ga;
    rowA.pa += gb;
    rowB.pf += gb;
    rowB.pa += ga;
    if (ga > gb) { rowA.w++; rowB.l++; rowA.pts += 3; }
    else if (ga < gb) { rowB.w++; rowA.l++; rowB.pts += 3; }
    else { rowA.d++; rowB.d++; rowA.pts += 1; rowB.pts += 1; }
    return;
  }
  const s = scoreSets(result.sets);
  // A win in a deciding set (3-2 in Bo5, 2-1 in Bo3) gives 2 points, the loser gets 1.
  const close = s.sa + s.sb === (result.bo === 3 ? 3 : 5);
  rowA.sw += s.sa;
  rowA.sl += s.sb;
  rowB.sw += s.sb;
  rowB.sl += s.sa;
  rowA.pf += s.pa;
  rowA.pa += s.pb;
  rowB.pf += s.pb;
  rowB.pa += s.pa;
  if (s.sa > s.sb) {
    rowA.w++;
    rowB.l++;
    rowA.pts += close ? 2 : 3;
    rowB.pts += close ? 1 : 0;
  } else {
    rowB.w++;
    rowA.l++;
    rowB.pts += close ? 2 : 3;
    rowA.pts += close ? 1 : 0;
  }
}

export function compareRows(x, y, sport) {
  if (sport === 'football') {
    return y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || y.w - x.w || x.t - y.t;
  }
  return (
    y.pts - x.pts ||
    y.w - x.w ||
    (y.sw - y.sl) - (x.sw - x.sl) ||
    (y.pf - y.pa) - (x.pf - x.pa) ||
    x.t - y.t
  );
}

// matches: [{ a, b, result: {sets}|null }]
export function standingsFor(teamIds, matches, sport) {
  const rows = teamIds.map(emptyRow);
  const get = (t) => rows.filter((r) => r.t === t)[0];
  for (const m of matches) {
    if (!m.result) continue;
    const ra = get(m.a);
    const rb = get(m.b);
    if (ra && rb) applyResult(ra, rb, m.result);
  }
  rows.sort((x, y) => compareRows(x, y, sport));
  return rows;
}

// ---------- results lookup ----------
// results[key] = { a, b, sets }. A result only counts while the participants still match.
function lookup(results, key, a, b) {
  const r = results[key];
  if (!r) return null;
  if (r.a === a && r.b === b) return r;
  return null;
}

function winnerOf(r) {
  return resultOutcome(r).win;
}

// ---------- round robin ----------
export function roundRobin(ids) {
  let t = ids.slice();
  if (t.length % 2) t.push(null);
  const n = t.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i];
      const b = t[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    t = [t[0], t[n - 1]].concat(t.slice(1, n - 1));
  }
  return rounds;
}

// ---------- knockout ----------

function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) {
      next.push(s);
      next.push(n + 1 - s);
    }
    order = next;
  }
  return order;
}

function roundName(count) {
  if (count === 2) return t('Final');
  if (count === 4) return t('Semifinals');
  if (count === 8) return t('Quarterfinals');
  return t('Round of {n}', { n: count, h: count / 2 });
}

// slots: array in bracket order (adjacent pairs meet). Each slot: {team:number|null, label:string} or null for a bye.
// Returns { columns:[{name, matches:[{key,a,b,labelA,labelB,result,round}]}], champion }
export function knockoutFromSlots(slots, prefix, results) {
  const columns = [];
  let cur = slots.slice();
  let champion = null;
  let round = 0;
  while (cur.length > 1) {
    round++;
    const next = [];
    const matches = [];
    const byes = [];
    for (let i = 0; i < cur.length; i += 2) {
      const x = cur[i];
      const y = cur[i + 1];
      if (!x || !y) {
        const adv = x || y;
        if (adv) {
          next.push(adv);
          if (adv.team !== null) byes.push(adv.team);
        } else next.push(null);
        continue;
      }
      const key = prefix + round + '-' + (matches.length + 1);
      const r = lookup(results, key, x.team, y.team);
      const m = { key: key, a: x.team, b: y.team, labelA: x.label, labelB: y.label, result: r, round: round, srcA: x.from, srcB: y.from, ko: true, pos: i / 2 };
      matches.push(m);
      if (r && winnerOf(r)) next.push({ team: winnerOf(r) === 'a' ? x.team : y.team, label: '', from: key });
      else next.push({ team: null, label: t('Winner of {m}', { m: '{' + key + '}' }), from: key });
    }
    columns.push({ name: roundName(cur.length), final: cur.length === 2, round: round, matches: matches, byes: byes });
    cur = next;
  }
  if (cur[0] && cur[0].team !== null) champion = cur[0].team;
  return { columns: columns, champion: champion };
}

export function knockoutFromSeeds(seeds, prefix, results, labels) {
  const m = seeds.length;
  let size = 1;
  while (size < m) size *= 2;
  const mk = (i) => ({ team: seeds[i], label: (labels && labels[i]) || '' });
  if (size === m || m < 3) {
    const order = seedOrder(size);
    return knockoutFromSlots(order.map((s) => (s <= m ? mk(s - 1) : null)), prefix, results);
  }
  // Not a power of two: only the lowest seeds play a first round (M1, M2, ...). The winner of
  // M1 meets a bye team in the next round's first match, the winner of M2 in the second, and so on.
  const half = size / 2;
  const pre = m - half;
  const byeIdx = [];
  for (let i = 0; i < half - pre; i++) byeIdx.push(i);
  const playIdx = [];
  for (let i = half - pre; i < m; i++) playIdx.push(i);
  const pair = (j) => [mk(playIdx[j]), mk(playIdx[playIdx.length - 1 - j])];
  const slots = [];
  const withBye = Math.min(pre, byeIdx.length);
  for (let j = 0; j < withBye; j++) slots.push(...pair(j), mk(byeIdx[j]), null);
  // More first-round winners than bye teams: the remaining winners meet each other.
  for (let j = withBye; j + 1 < pre; j += 2) slots.push(...pair(j), ...pair(j + 1));
  const rest = byeIdx.slice(withBye);
  for (let j = 0; j < Math.floor(rest.length / 2); j++) slots.push(mk(rest[j]), null, mk(rest[rest.length - 1 - j]), null);
  return knockoutFromSlots(slots, prefix, results);
}

// ---------- groups + playoffs ----------

// "1st Group A", "2nd place", "Best 3rd place": one dictionary entry per ordinal so each language can phrase it.
const SUF = { 1: 'st', 2: 'nd', 3: 'rd' };
const ordKey = (i, pre, post) => pre + (SUF[i] ? i + SUF[i] : '{n}th') + post;
export const groupSeed = (i, g) => t(ordKey(i, '', ' Group {g}'), { n: i, g: g });
export const placeLabel = (i) => t(ordKey(i, '', ' place'), { n: i });
export const bestPlaceLabel = (i) => t(ordKey(i, 'Best ', ' place'), { n: i });

export function buildGroups(order, G, per, results, sport) {
  const groups = [];
  for (let g = 0; g < G; g++) groups.push(order.slice(g * per, (g + 1) * per).filter((x) => x !== null && x !== undefined));
  const rds = groups.map(roundRobin);
  const nR = Math.max.apply(null, rds.map((x) => x.length).concat([0]));
  const rounds = [];
  for (let r = 0; r < nR; r++) {
    const perGroup = [];
    for (let g = 0; g < G; g++) {
      const ms = (rds[g][r] || []).map((p, i) => {
        const key = 'G' + (g + 1) + '-R' + (r + 1) + '-' + (i + 1);
        return { key: key, a: p[0], b: p[1], result: lookup(results, key, p[0], p[1]), group: g };
      });
      perGroup.push(ms);
    }
    rounds.push(perGroup);
  }
  const allGroupMatches = [];
  rounds.forEach((pg) => pg.forEach((ms) => ms.forEach((m) => allGroupMatches.push(m))));
  const tables = groups.map((ids, g) => standingsFor(ids, allGroupMatches.filter((m) => m.group === g), sport));
  const complete = groups.map((ids, g) => allGroupMatches.filter((m) => m.group === g).every((m) => m.result));
  const slot = (g, rank) => {
    const label = groupSeed(rank + 1, LETTERS[g]);
    if (complete[g] && tables[g][rank]) return { team: tables[g][rank].t, label: label };
    return { team: null, label: label };
  };
  // Groups are paired (A-B, C-D, ...): A1 meets B2 and B1 meets A2, in opposite halves of the bracket.
  const half1 = [];
  const half2 = [];
  for (let g = 0; g + 1 < G; g += 2) {
    half1.push(slot(g, 0), slot(g + 1, 1));
    half2.push(slot(g + 1, 0), slot(g, 1));
  }
  const slots = half1.concat(half2);
  const ko = knockoutFromSlots(slots, 'P', results);
  return { groups: groups, rounds: rounds, tables: tables, complete: complete, knockout: ko };
}

// ---------- league (everyone plays everyone once) ----------

export function buildLeague(n, results, sport) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(i);
  const rds = roundRobin(ids);
  const rounds = rds.map((pairs, r) => ({
    round: r + 1,
    matches: pairs.map((p, i) => {
      const key = 'L-R' + (r + 1) + '-' + (i + 1);
      return { key: key, a: p[0], b: p[1], result: lookup(results, key, p[0], p[1]) };
    })
  }));
  const all = [];
  rounds.forEach((r) => r.matches.forEach((m) => all.push(m)));
  const table = standingsFor(ids, all, sport);
  const complete = all.length > 0 && all.every((m) => m.result);
  return { rounds: rounds, table: table, complete: complete, champion: complete ? table[0].t : null };
}

// ---------- custom plan (built from an AI description) ----------
//
// plan = { stage: 'league' | 'groups' | 'knockout',
//          legs: 1 | 2,              league/groups: single or double round robin
//          groups: G,                 groups only (any number >= 2)
//          advance: k,                groups only: how many per group go on
//          wildcards: w,              groups only: best (k+1)th placed teams that also go on
//          qualify: q,                league only: how many go to the playoff
//          playoff: boolean,          knockout after the league / groups
//          thirdPlace: boolean }      play a third-place match in the knockout


function addThirdPlace(ko, results) {
  const cols = ko.columns;
  if (cols.length < 2) return null;
  const semi = cols[cols.length - 2].matches;
  if (semi.length !== 2) return null;
  const loser = (m) => {
    const w = m.result ? winnerOf(m.result) : null;
    if (!w) return null;
    return w === 'a' ? m.b : m.a;
  };
  const a = loser(semi[0]);
  const b = loser(semi[1]);
  const m = { key: 'P3', a: a, b: b, labelA: t('Loser of {m}', { m: '{' + semi[0].key + '}' }), labelB: t('Loser of {m}', { m: '{' + semi[1].key + '}' }), result: lookup(results, 'P3', a, b), round: cols.length, ko: true, third: true, pos: 1 };
  cols[cols.length - 1].matches.push(m);
  return m;
}

export function buildPlan(n, plan, results, sport, order) {
  const ids = [];
  const given = order && order.length === n ? order : null;
  for (let i = 0; i < n; i++) ids.push(given ? given[i] : i);
  if (plan.stage === 'knockout') {
    const ko = knockoutFromSeeds(ids, 'K', results);
    const third = plan.thirdPlace ? addThirdPlace(ko, results) : null;
    return { G: 0, groups: [], rounds: [], tables: [], complete: [], knockout: ko, champion: ko.champion, third: third, thirdTeam: third && third.result ? (winnerOf(third.result) === 'a' ? third.a : third.b) : null };
  }
  const G = plan.stage === 'groups' ? Math.max(2, plan.groups) : 1;
  const groups = [];
  const base = Math.floor(n / G);
  const extra = n % G;
  let k = 0;
  for (let g = 0; g < G; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups.push(ids.slice(k, k + size));
    k += size;
  }
  const rds = groups.map((gr) => {
    const r = roundRobin(gr);
    return plan.legs === 2 ? r.concat(r.map((rd) => rd.map((p) => [p[1], p[0]]))) : r;
  });
  const nR = Math.max.apply(null, rds.map((x) => x.length).concat([0]));
  const rounds = [];
  for (let r = 0; r < nR; r++) {
    const perGroup = [];
    for (let g = 0; g < G; g++) {
      perGroup.push((rds[g][r] || []).map((p, i) => {
        const key = 'G' + (g + 1) + '-R' + (r + 1) + '-' + (i + 1);
        return { key: key, a: p[0], b: p[1], result: lookup(results, key, p[0], p[1]), group: g };
      }));
    }
    rounds.push(perGroup);
  }
  const all = [];
  rounds.forEach((pg) => pg.forEach((ms) => ms.forEach((m) => all.push(m))));
  const tables = groups.map((gr, g) => standingsFor(gr, all.filter((m) => m.group === g), sport));
  const complete = groups.map((gr, g) => all.filter((m) => m.group === g).every((m) => m.result));
  let knockout = null;
  let third = null;
  if (plan.playoff) {
    const seeds = [];
    const labels = [];
    const push = (row, label) => { seeds.push(row ? row.t : null); labels.push(label); };
    if (G === 1) {
      const Q = Math.min(plan.qualify || 2, n);
      for (let i = 0; i < Q; i++) push(complete[0] ? tables[0][i] : null, placeLabel(i + 1));
    } else {
      const adv = Math.max(1, plan.advance || 2);
      for (let r = 0; r < adv; r++) {
        for (let g = 0; g < G; g++) push(complete[g] ? tables[g][r] : null, groupSeed(r + 1, LETTERS[g]));
      }
      const w = plan.wildcards || 0;
      if (w > 0) {
        const done = complete.every((c) => c);
        const pool = done ? tables.map((t) => t[adv]).filter(Boolean).sort((x, y) => compareRows(x, y, sport)) : [];
        for (let i = 0; i < w; i++) push(done ? pool[i] : null, bestPlaceLabel(adv + 1));
      }
    }
    knockout = knockoutFromSeeds(seeds, 'P', results, labels);
    if (plan.thirdPlace) third = addThirdPlace(knockout, results);
  }
  let champion = null;
  if (knockout) champion = knockout.champion;
  else if (G === 1 && complete[0] && tables[0][0]) champion = tables[0][0].t;
  return { G: G, groups: groups, rounds: rounds, tables: tables, complete: complete, knockout: knockout, champion: champion, third: third, thirdTeam: third && third.result ? (winnerOf(third.result) === 'a' ? third.a : third.b) : null };
}

// ---------- swiss stage ----------

export function swissLimit(n) {
  return n <= 8 ? 2 : 3;
}

export function swissAllowed(n) {
  return n === 4 || n === 8 || n === 16;
}

function pairGroup(list, played) {
  // list: team ids in seed order. Try to avoid rematches with simple backtracking.
  const used = list.map(() => false);
  const out = [];
  const go = () => {
    const i = used.indexOf(false);
    if (i === -1) return true;
    used[i] = true;
    for (let j = i + 1; j < list.length; j++) {
      if (used[j]) continue;
      if (played[list[i] + '-' + list[j]]) continue;
      used[j] = true;
      out.push([list[i], list[j]]);
      if (go()) return true;
      out.pop();
      used[j] = false;
    }
    used[i] = false;
    return false;
  };
  if (go()) return out;
  // fallback: allow rematches
  const res = [];
  for (let i = 0; i + 1 < list.length; i += 2) res.push([list[i], list[i + 1]]);
  return res;
}

export function buildSwiss(n, results) {
  const k = swissLimit(n);
  const wins = [];
  const losses = [];
  for (let i = 0; i < n; i++) { wins.push(0); losses.push(0); }
  const played = {};
  const rounds = [];
  const allMatches = [];
  let r = 0;
  let pending = false;
  while (r < 12) {
    r++;
    const active = [];
    for (let i = 0; i < n; i++) if (wins[i] < k && losses[i] < k) active.push(i);
    if (active.length === 0) { r--; break; }
    const byRecord = {};
    active.forEach((t) => {
      const key = wins[t] + '-' + losses[t];
      (byRecord[key] = byRecord[key] || []).push(t);
    });
    const keys = Object.keys(byRecord).sort((x, y) => {
      const [xw, xl] = x.split('-').map(Number);
      const [yw, yl] = y.split('-').map(Number);
      return (yw - xw) || (xl - yl);
    });
    const groups = [];
    let count = 0;
    keys.forEach((key) => {
      const pairs = pairGroup(byRecord[key], played);
      const ms = pairs.map((p, i) => {
        const mk = 'S' + r + '-' + key + '-' + (i + 1);
        const res = lookup(results, mk, p[0], p[1]);
        return { key: mk, a: p[0], b: p[1], result: res, record: key };
      });
      count += ms.length;
      groups.push({ record: key, matches: ms });
    });
    rounds.push({ round: r, groups: groups });
    let done = true;
    groups.forEach((g) => g.matches.forEach((m) => {
      allMatches.push(m);
      if (!m.result) done = false;
    }));
    if (!done) { pending = true; break; }
    groups.forEach((g) => g.matches.forEach((m) => {
      played[m.a + '-' + m.b] = true;
      played[m.b + '-' + m.a] = true;
      if (winnerOf(m.result) === 'a') { wins[m.a]++; losses[m.b]++; }
      else { wins[m.b]++; losses[m.a]++; }
    }));
  }
  const stage = [];
  for (let i = 0; i < n; i++) stage.push(i);
  const table = standingsFor(stage, allMatches);
  const finished = !pending;
  let knockout = null;
  let advancers = [];
  if (finished) {
    advancers = stage.filter((t) => wins[t] >= k);
    const rank = {};
    table.forEach((row, i) => { rank[row.t] = i; });
    advancers.sort((x, y) => (losses[x] - losses[y]) || (rank[x] - rank[y]));
    if (advancers.length >= 2) {
      const labels = advancers.map((t) => wins[t] + '-' + losses[t]);
      knockout = knockoutFromSeeds(advancers, 'K', results, labels);
    }
  }
  return { k: k, rounds: rounds, table: table, wins: wins, losses: losses, finished: finished, advancers: advancers, knockout: knockout };
}

// Projection of a Swiss stage with placeholders, for the "Pick a format" preview.
export function swissPreview(n) {
  const k = swissLimit(n);
  let counts = { '0-0': n };
  const rounds = [];
  let adv = 0;
  for (let r = 1; r < 12; r++) {
    const keys = Object.keys(counts).filter((key) => counts[key] > 0).sort((x, y) => {
      const [xw, xl] = x.split('-').map(Number);
      const [yw, yl] = y.split('-').map(Number);
      return (yw - xw) || (xl - yl);
    });
    if (!keys.length) break;
    const next = {};
    const groups = [];
    keys.forEach((key) => {
      const [w, l] = key.split('-').map(Number);
      const c = counts[key];
      groups.push({ record: key, matches: Math.floor(c / 2) });
      const h = Math.floor(c / 2);
      const kw = (w + 1) + '-' + l;
      const kl = w + '-' + (l + 1);
      if (w + 1 >= k) adv += h; else next[kw] = (next[kw] || 0) + h;
      if (l + 1 < k) next[kl] = (next[kl] || 0) + h;
    });
    rounds.push({ round: r, groups: groups });
    counts = next;
  }
  const total = rounds.reduce((s, r) => s + r.groups.reduce((q, g) => q + g.matches, 0), 0);
  return { k: k, rounds: rounds, advancers: adv, swissMatches: total };
}

export function knockoutMatchCount(m) {
  return Math.max(0, m - 1);
}

export function formatStats(format, n, cfg) {
  if (format === 'swiss') {
    const p = swissPreview(n);
    const ko = knockoutMatchCount(p.advancers);
    let kr = 0;
    for (let x = 1; x < p.advancers; x *= 2) kr++;
    return t('{m} matches · {r} rounds · min. {k} matches each', { m: p.swissMatches + ko, r: p.rounds.length + kr, k: p.k });
  }
  if (format === 'league') {
    const rounds = n % 2 ? n : n - 1;
    return t('{m} matches · {r} rounds · {k} matches each', { m: n * (n - 1) / 2, r: rounds, k: n - 1 });
  }
  if (format === 'groups') {
    const per = cfg.per;
    const G = cfg.G;
    const gm = G * per * (per - 1) / 2;
    let kr = 0;
    for (let x = 1; x < 2 * G; x *= 2) kr++;
    const rounds = (per % 2 ? per : per - 1) + kr;
    return t('{m} matches · {r} rounds · min. {k} matches each', { m: gm + 2 * G - 1, r: rounds, k: per - 1 });
  }
  let size = 1;
  while (size < n) size *= 2;
  let rounds = 0;
  for (let x = 1; x < size; x *= 2) rounds++;
  return t('{m} matches · {r} rounds · min. 1 match each', { m: n - 1, r: rounds });
}

// Number the matches M1, M2... in column order and resolve "Winner {key}" labels.
export function numberMatches(columns) {
  const no = {};
  let k = 0;
  columns.forEach((c) => c.groups.forEach((g) => g.matches.forEach((m) => { k++; no[m.key] = 'M' + k; m.no = 'M' + k; })));
  const fix = (s) => (s ? s.replace(/\{([^}]+)\}/g, (_, key) => no[key] || key) : s);
  columns.forEach((c) => c.groups.forEach((g) => g.matches.forEach((m) => { m.labelA = fix(m.labelA); m.labelB = fix(m.labelB); })));
  return columns;
}
