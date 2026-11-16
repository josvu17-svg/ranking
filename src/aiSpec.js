// Turns what the AI answered into settings the app can really build, and says what was changed.
// The AI only suggests numbers; every rule is checked here.

import { t } from './i18n.js';

const isPow2 = (g) => g >= 2 && g <= 16 && (g & (g - 1)) === 0;
const NAMES = { swiss: 'Swiss stage', groups: 'Group stage + Playoffs', single: 'Single elimination', custom: 'Custom format' };
const nameOf = (f) => t(NAMES[f]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizeSpec(raw, sport, currentTeams) {
  if (!raw || typeof raw !== 'object') return { ok: false, message: t('The AI answer could not be read. Try again.') };
  const summary = String(raw.summary || '').trim();
  const unsupported = String(raw.unsupported || '').trim();
  const notes = [];
  if (!NAMES[raw.format]) {
    return { ok: false, message: unsupported || summary || t('This kind of tournament is not supported yet.') };
  }
  if (raw.format === 'custom') return normalizeCustom(raw, sport, currentTeams, summary, unsupported, notes);
  let format = raw.format;
  let n = Math.round(Number(raw.teams)) || 0;
  if (n < 2 || n > 64) {
    if (n > 64) notes.push(t('The app supports up to 64 teams, so the number of teams was kept at {n}.', { n: currentTeams }));
    n = currentTeams;
  }
  if (format === 'swiss' && sport === 'football') {
    format = 'groups';
    notes.push(t('Football has draws, so Swiss stage is not available. Switched to Group stage + Playoffs.'));
  }
  if (format === 'swiss' && n !== 4 && n !== 8 && n !== 16) {
    format = n >= 4 ? 'groups' : 'single';
    notes.push(t('Swiss stage needs exactly 4, 8 or 16 teams. Switched to {name}.', { name: nameOf(format) }));
  }
  if (format === 'groups' && n < 4) {
    format = 'single';
    notes.push(t('Group stage needs at least 4 teams. Switched to Single elimination.'));
  }
  let G = 0;
  let per = 0;
  if (format === 'groups') {
    G = Math.round(Number(raw.groups)) || 0;
    per = Math.round(Number(raw.teams_per_group)) || 0;
    if (!G && per) G = Math.ceil(n / per);
    if (!G) { G = 2; while (G < 16 && Math.ceil(n / G) > 5) G *= 2; }
    if (!isPow2(G)) {
      let g = 2;
      while (g < 16 && g < G) g *= 2;
      notes.push(t('The playoffs need 2, 4, 8 or 16 groups, so {a} groups became {b}.', { a: G, b: g }));
      G = g;
      per = 0;
    }
    while (G > 2 && G * 2 > n) { G /= 2; per = 0; notes.push(t('Too many groups for {n} teams. Using {g} groups.', { n: n, g: G })); }
    if (per < 2 || per * G < n) per = Math.ceil(n / G);
    if (per > 8) {
      notes.push(t('A group holds at most 8 teams, so more groups were used than you asked for.'));
      while (G < 16 && Math.ceil(n / G) > 8) G *= 2;
      per = Math.ceil(n / G);
    }
  }
  const bo = raw.best_of === 3 || raw.best_of === 5 ? raw.best_of : null;
  const wasBo = bo && sport === 'football' ? null : bo;
  if (unsupported) notes.push(unsupported);
  return { ok: true, format: format, n: n, G: G, per: per, bo: wasBo, summary: summary, notes: notes, name: nameOf(format) };
}

// Used only when the AI gives no usable title.
function fallbackName(plan) {
  if (plan.stage === 'league') return plan.playoff ? t('Top Four Championship') : t('Premier League');
  if (plan.stage === 'groups') return t('Group Masters');
  return t('Knockout Cup');
}

function normalizeCustom(raw, sport, currentTeams, summary, unsupported, notes) {
  let n = Math.round(Number(raw.teams)) || 0;
  if (n < 2 || n > 64) n = currentTeams;
  let stage = raw.stage;
  if (stage !== 'league' && stage !== 'groups' && stage !== 'knockout') {
    return { ok: false, message: unsupported || summary || t('This kind of tournament is not supported yet.') };
  }
  const plan = { stage: stage, legs: raw.legs === 2 ? 2 : 1, playoff: !!raw.playoff, thirdPlace: !!raw.third_place, groups: 0, advance: 0, wildcards: 0, qualify: 0 };
  if (stage === 'league' && n < 3) { stage = plan.stage = 'knockout'; notes.push(t('A league needs at least 3 teams. Using a knockout instead.')); }
  if (stage === 'groups') {
    let G = Math.round(Number(raw.groups)) || 0;
    if (G < 2) G = 2;
    if (n < 4) { stage = plan.stage = 'league'; notes.push(t('Groups need at least 4 teams. Using one league table instead.')); }
    else if (n < 2 * G) { G = Math.floor(n / 2); notes.push(t('Too many groups for {n} teams. Using {g} groups.', { n: n, g: G })); }
    if (stage === 'groups') {
      plan.groups = G;
      const smallest = Math.floor(n / G);
      plan.advance = clamp(Math.round(Number(raw.advance)) || 2, 1, Math.max(1, smallest - 1));
      if (plan.playoff) plan.wildcards = clamp(Math.round(Number(raw.wildcards)) || 0, 0, G - 1);
      if (plan.playoff && G * plan.advance + plan.wildcards < 2) { plan.advance = 2; notes.push(t('A playoff needs at least 2 teams, so 2 teams per group advance.')); }
    }
  }
  if (stage === 'league') {
    if (plan.playoff) plan.qualify = clamp(Math.round(Number(raw.qualify)) || 2, 2, n);
    else plan.playoff = false;
  }
  if (stage === 'knockout') { plan.playoff = false; plan.legs = 1; }
  if (plan.thirdPlace) {
    const q = stage === 'knockout' ? n : stage === 'league' ? plan.qualify : plan.groups * plan.advance + plan.wildcards;
    if ((stage !== 'knockout' && !plan.playoff) || q < 4) { plan.thirdPlace = false; notes.push(t('A third-place match needs a knockout with at least 4 teams, so it was left out.')); }
  }
  if (unsupported) notes.push(unsupported);
  const bo = raw.best_of === 3 || raw.best_of === 5 ? raw.best_of : null;
  const name = String(raw.name || '').replace(/[+&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).trim() || fallbackName(plan);
  return { ok: true, format: 'custom', n: n, plan: plan, name: name, G: 0, per: 0, bo: sport === 'football' ? null : bo, summary: summary, notes: notes };
}
