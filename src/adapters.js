import { t } from './i18n.js';
import { knockoutFromSeeds, swissPreview, numberMatches, swissLimit, resultOutcome, LETTERS } from './engine.js';

const col = (groups, self) => ({ groups: groups, self: self || 'flex-start' });

function koGroup(c, withOuts, extra) {
  const isFinal = c.final;
  const outs = withOuts
    ? isFinal
      ? [[t('Win → Champion'), 'go'], [t('Lose → Runner-up'), 'next']]
      : [[t('Win → Next round'), 'go'], [t('Lose → Out'), 'out']]
    : [];
  return Object.assign({
    label: c.name,
    badge: null,
    matches: c.matches,
    outs: outs,
    note: c.matches.some((m) => m.third) ? t('Lower match: 3rd place') : c.byes && c.byes.length && extra && extra.names ? (c.byes.length > 4 ? t('{n} teams have a bye to the next round.', { n: c.byes.length }) : t('Bye: {names}', { names: c.byes.map((x) => extra.names[x]).join(', ') })) : null
  }, extra && extra.geo ? extra.geo : {});
}

function swissOuts(record, k, round) {
  const [w, l] = record.split('-').map(Number);
  if (round < 3 || (w !== k - 1 && l !== k - 1)) return [];
  return [
    [t('Win → {to}', { to: w + 1 >= k ? t('Playoffs') : (w + 1) + '-' + l }), 'go'],
    [t('Lose → {to}', { to: l + 1 >= k ? t('Out') : w + '-' + (l + 1) }), 'out']
  ];
}

// Real Swiss tournament view.
export function swissColumns(built) {
  const k = built.k;
  const cols = [];
  built.rounds.forEach((r, i) => {
    cols.push(col(r.groups.map((g, gi) => ({
      label: t('Round {n}', { n: r.round }),
      badge: g.record,
      matches: g.matches,
      mt: gi === 0 ? 0 : 14,
      outs: swissOuts(g.record, k, r.round)
    })), i < 2 ? 'flex-start' : 'center'));
  });
  if (!built.finished) {
    const last = built.rounds.length;
    cols.push(col([{
      label: t('Next round'),
      badge: null,
      matches: [],
      note: t('Pairings appear when every match of round {r} has a result. Then the teams with {k} wins play the playoffs.', { r: last, k: k })
    }], 'center'));
  } else if (built.knockout) {
    built.knockout.columns.forEach((c) => cols.push(col([koGroup(c, true)], 'center')));
  }
  numberMatches(cols);
  // Swiss rounds are paired by record, so no lines between them; lines start with the playoffs.
  return withEdges(cols, false);
}

// Projection shown on the "Pick a format" screen.
export function swissPreviewColumns(n, names) {
  const p = swissPreview(n);
  const cols = [];
  let key = 0;
  p.rounds.forEach((r, i) => {
    cols.push(col(r.groups.map((g, gi) => {
      const ms = [];
      for (let j = 0; j < g.matches; j++) {
        key++;
        if (r.round === 1) ms.push({ key: 'p' + key, a: j * 2, b: j * 2 + 1, result: null });
        else ms.push({ key: 'p' + key, a: null, b: null, labelA: t('{rec} team', { rec: g.record }), labelB: t('{rec} team', { rec: g.record }), result: null });
      }
      return { label: t('Round {n}', { n: r.round }), badge: g.record, matches: ms, mt: gi === 0 ? 0 : 14, outs: swissOuts(g.record, p.k, r.round) };
    }), i < 2 ? 'flex-start' : 'center'));
  });
  if (p.advancers >= 2) {
    const seeds = [];
    for (let i = 0; i < p.advancers; i++) seeds.push(null);
    const labels = seeds.map((_, i) => t('Seed {n}', { n: i + 1 }));
    const ko = knockoutFromSeeds(seeds, 'K', {}, labels);
    ko.columns.forEach((c) => cols.push(col([koGroup(c, true)], 'center')));
  }
  numberMatches(cols);
  return withEdges(cols, false);
}

export function groupsColumns(built) {
  const cols = [];
  built.rounds.forEach((pg, r) => {
    cols.push(col(pg.map((ms, g) => ({
      label: t('Round {n}', { n: r + 1 }),
      badge: t('Group {g}', { g: LETTERS[g] }),
      matches: ms,
      mt: g === 0 ? 0 : 10
    })).filter((g) => g.matches.length)));
  });
  built.knockout.columns.forEach((c) => cols.push(col([koGroup(c, true)], 'center')));
  numberMatches(cols);
  return withEdges(cols, false);
}

export function singleColumns(ko, names) {
  // Every match sits at the vertical centre of the slot it belongs to, so lines stay straight
  // and a bracket with byes stays balanced.
  const U = 80;
  const hasThird = ko.columns.some((c) => c.matches.some((m) => m.third));
  const H = Math.pow(2, Math.max(0, ko.columns.length - 1)) * U + (hasThird ? 110 : 0);
  const cols = ko.columns.map((c, r) => {
    const f = Math.pow(2, r);
    const g = koGroup(c, false, { names: names });
    g.abs = { height: H, tops: c.matches.map((m) => (m.third ? (0.5) * U * f - 32 + 110 : (m.pos + 0.5) * U * f - 32)) };
    return col([g], 'flex-start');
  });
  numberMatches(cols);
  return withEdges(cols, false);
}

export function planColumns(b, plan, names) {
  if (plan.stage === 'knockout') return singleColumns(b.knockout, names);
  const cols = [];
  b.rounds.forEach((pg, r) => {
    cols.push(col(pg.map((ms, g) => ({
      label: t('Round {n}', { n: r + 1 }),
      badge: b.G > 1 ? t('Group {g}', { g: LETTERS[g] }) : null,
      matches: ms,
      mt: g === 0 ? 0 : 10
    })).filter((g) => g.matches.length)));
  });
  if (b.knockout) b.knockout.columns.forEach((c) => cols.push(col([koGroup(c, true)], 'center')));
  numberMatches(cols);
  return withEdges(cols, false);
}

export function swissK(n) {
  return swissLimit(n);
}

// Lines between matches. Knockout matches use their explicit sources; with `chain`,
// matches whose teams are known are linked to the previous match each team played.
function withEdges(cols, chain) {
  const last = {};
  const edges = [];
  cols.forEach((col) => {
    col.groups.forEach((g) => g.matches.forEach((m) => {
      if (m.srcA || m.srcB) {
        [m.srcA, m.srcB].forEach((s) => { if (s) edges.push({ from: s, to: m.key, kind: 'win' }); });
      } else if (chain && m.a != null && m.b != null) {
        [m.a, m.b].forEach((t) => {
          const p = last[t];
          if (!p) return;
          // Only the winner's path is drawn; the loser's path would double the lines.
          if (!p.result) return;
          const o = resultOutcome(p.result);
          const winner = o.win === 'a' ? p.a : p.b;
          if (winner === t) edges.push({ from: p.key, to: m.key, kind: 'win' });
        });
      }
    }));
    col.groups.forEach((g) => g.matches.forEach((m) => {
      if (m.a != null) last[m.a] = m;
      if (m.b != null) last[m.b] = m;
    }));
  });
  cols.edges = edges;
  return cols;
}

export function leagueColumns(rounds) {
  const cols = rounds.map((r) => ({ groups: [{ label: t('Round {n}', { n: r.round }), badge: null, matches: r.matches }], self: 'flex-start' }));
  numberMatches(cols);
  cols.edges = [];
  return cols;
}
