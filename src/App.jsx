import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Header, SportPill, Bracket, ScoreModal, ArrowRight, Sparkle, VolleyballIcon, FootballIcon, NAVY } from './ui.jsx';
import { buildGroups, buildPlan, buildSwiss, knockoutFromSeeds, swissAllowed, formatStats, LETTERS } from './engine.js';
import { swissColumns, swissPreviewColumns, groupsColumns, singleColumns, planColumns } from './adapters.js';
import { swissHtml } from './staticPages.js';
import { normalizeSpec } from './aiSpec.js';
import { t as tr, aiLanguage } from './i18n.js';
import { useLang } from './lang.jsx';
import { ScheduleModal, ExportRunner, PrintRunner, ImagePreview, listMatches } from './schedule.jsx';
import { makeBackup, parseBackup } from './backup.js';
import { saveBlob, pickText } from './files.js';

const SAMPLES = ['Thôn Đông', 'Thôn Tây', 'Thôn Nam', 'Thôn Bắc', 'Xóm Chùa', 'Xóm Chợ', 'Xóm Đình', 'Xóm Giữa', 'Làng Hạ', 'Làng Thượng', 'Làng Trung', 'Làng Mới', 'Cầu Đất', 'Đồng Xuân', 'Gò Cát', 'Bãi Sậy'];
export const KEY = 'ranking.v1';

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 64;
const ORDER_LEN = 160;
const GROUP_COUNTS = [2, 4, 8, 16];
const MAX_PER = 8;

const identity = () => {
  const a = [];
  for (let i = 0; i < ORDER_LEN; i++) a.push(i < 8 ? i : null);
  return a;
};

const DEFAULT = { customs: [], sorder: null, sport: 'volleyball', bo: 5, raw: '8', names: SAMPLES.slice(), sel: 'swiss', G: 2, per: 4, order: identity(), tournament: null };

// Brings saved data (from this device or from a backup file) into the shape the app expects.
function normalize(raw) {
  const d = Object.assign({}, DEFAULT, raw);
  // Older saves kept one AI format in plan / planName: move it into the list.
  if (d.plan && !(d.customs || []).length) {
    d.customs = [{ id: 'old', name: d.planName || 'Custom', plan: d.plan }];
    if (d.sel === 'plan') d.sel = 'c:old';
  }
  if (d.sel === 'plan') d.sel = 'groups';
  delete d.plan;
  delete d.planName;
  if (!Array.isArray(d.customs)) d.customs = [];
  if (!Array.isArray(d.names)) d.names = SAMPLES.slice();
  if (!Array.isArray(d.order) || d.order.length !== ORDER_LEN) d.order = identity();
  return d;
}

export function load() {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY));
    if (s && s.v === 1) return normalize(s.data);
  } catch (e) { /* ignore */ }
  return DEFAULT;
}

function save(data) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ v: 1, data: data })); } catch (e) { /* ignore */ }
}

const clampN = (raw) => {
  const p = parseInt(raw, 10);
  return isNaN(p) ? 4 : Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, p));
};

function layoutOrder(teams, G, per) {
  const base = Math.floor(teams.length / G);
  const extra = teams.length % G;
  const out = [];
  for (let i = 0; i < ORDER_LEN; i++) out.push(null);
  let k = 0;
  for (let g = 0; g < G; g++) {
    const size = Math.min(per, base + (g < extra ? 1 : 0));
    for (let i = 0; i < size; i++) out[g * per + i] = teams[k++];
  }
  while (k < teams.length) {
    const p = out.indexOf(null, G * per);
    out[p === -1 ? ORDER_LEN - 1 : p] = teams[k++];
  }
  return out;
}

function defaultLayout(n) {
  let G = 2;
  while (G < 16 && Math.ceil(n / G) > 5) G *= 2;
  return { G: G, per: Math.ceil(n / G) };
}

function range(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  return a;
}

// ---------- describe your own (AI) ----------

const examples = () => [
  { label: tr('Groups + semifinals'), text: tr('8 teams split into 2 groups of 4. Every team plays each other once. The top 2 from each group go to the semifinals, then the final.') },
  { label: tr('Knockout'), text: tr('12 teams, straight knockout, best of 3 sets, the winner goes through.') },
  { label: tr('Swiss'), text: tr('16 teams. Keep playing until a team has 2 wins or 2 losses, then the qualified teams play a knockout.') }
];

// A team without a name shows "Team N" in the current language (also for tournaments saved before).
const isDefaultName = (x, i) => { const m = /^(?:Team|Đội) (\d+)$/.exec(String(x || '').trim()); return !String(x || '').trim() || (!!m && Number(m[1]) === i + 1); };
export const teamLabel = (x, i) => (isDefaultName(x, i) ? tr('Team {n}', { n: i + 1 }) : String(x).trim());
export const shownNames = (tn) => tn.names.map(teamLabel);

function planSummary(res) {
  const b = buildPlan(res.n, res.plan, {}, 'volleyball', null);
  let total = 0;
  b.rounds.forEach((pg) => pg.forEach((ms) => { total += ms.length; }));
  if (b.knockout) b.knockout.columns.forEach((c) => { total += c.matches.length; });
  return tr('{n} matches', { n: total });
}

function Describe({ sport, data, n, patch, go }) {
  const { lang } = useLang();
  const EX = useMemo(examples, [lang]);
  const bridge = typeof window !== 'undefined' && window.ranking && window.ranking.ai ? window.ranking.ai : null;
  const [text, setText] = useState(() => examples()[0].text);
  const lastEx = React.useRef(0);
  const [hasKey, setHasKey] = useState(null);
  const [keyIn, setKeyIn] = useState('');
  const [editKey, setEditKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState(null);
  const [fmtName, setFmtName] = useState('');
  useEffect(() => {
    let live = true;
    if (bridge) bridge.status().then((r) => { if (live) setHasKey(!!r.hasKey); }).catch(() => { if (live) setHasKey(false); });
    return () => { live = false; };
  }, []);
  const saveKey = async () => {
    if (!keyIn.trim()) return;
    await bridge.setKey(keyIn.trim());
    setKeyIn('');
    setHasKey(true);
    setEditKey(false);
    setError('');
  };
  const generate = async () => {
    if (!bridge || busy) return;
    setBusy(true);
    setError('');
    const r = await bridge.describe({ text: text, sport: sport, teams: n, lang: aiLanguage() }).catch(() => ({ ok: false, error: tr('Something went wrong. Try again.') }));
    setBusy(false);
    if (!r.ok) { setRes(null); setError(r.error); return; }
    const spec = normalizeSpec(r.spec, sport, n);
    if (!spec.ok) { setRes(null); setError(spec.message); return; }
    setFmtName(spec.format === 'custom' ? spec.name : '');
    setRes(spec);
  };
  const use = () => {
    if (!res) return;
    const p = { sorder: null, raw: String(res.n), sel: res.format };
    if (res.format === 'custom') {
      // Every AI format is saved under the name the user gives it, so several can be compared.
      const id = Date.now().toString(36);
      p.customs = (data.customs || []).concat([{ id: id, name: fmtName.trim(), plan: res.plan }]);
      p.sel = 'c:' + id;
    }
    if (res.format === 'groups') {
      p.G = res.G;
      p.per = res.per;
      p.order = layoutOrder(range(res.n), res.G, res.per);
    }
    if (res.bo) p.bo = res.bo;
    patch(p);
    go('formats');
  };
  const showKeyBox = bridge && (hasKey === false || editKey);
  const chip = (t) => <span key={t} className="tag">{t}</span>;
  const label = { fontSize: 12, lineHeight: '16px', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' };
  return (
    <>
      <Header back={() => go('formats')} title={tr('Describe your format')} sub={tr('Describe how your tournament runs and the AI sets it up for you.')} right={<SportPill sport={sport} />} />
      <div className="panel" style={{ left: 64, top: 168, width: 480, height: 592, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: '28px', fontWeight: 700 }}>{tr('Describe your tournament')}</h2>
        <textarea aria-label={tr('Describe your tournament format')} value={text} onChange={(e) => setText(e.target.value)} style={{ boxSizing: 'border-box', width: '100%', height: 150, padding: 16, resize: 'none', background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 20, fontFamily: 'inherit', fontSize: 16, lineHeight: '24px', fontWeight: 500, color: NAVY }} />
        <div style={label}>{tr('Or start from an example')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
          {EX.map((x, xi) => (
            <button key={xi} type="button" onClick={() => setText(x.text)} style={{ height: 38, padding: '0 14px', background: '#FFFFFF', border: '1px solid #BFD3F5', borderRadius: 19, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: NAVY, cursor: 'pointer' }}>{x.label}</button>
          ))}
        </div>
        {showKeyBox ? (
          <div style={{ boxSizing: 'border-box', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 16 }}>
            <div style={label}>{tr('Gemini API key')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" aria-label={tr('Gemini API key')} value={keyIn} onChange={(e) => setKeyIn(e.target.value)} placeholder={tr('Paste your key here')} style={{ boxSizing: 'border-box', flex: 1, minWidth: 0, height: 40, padding: '0 12px', background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 12, fontSize: 14, color: NAVY }} />
              <button type="button" className="ghost" onClick={saveKey} style={{ height: 40 }}>{tr('Save key')}</button>
            </div>
            <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: '#3F5688' }}>{tr('The key is stored only on this device.')}</div>
          </div>
        ) : null}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="primary" onClick={generate} disabled={!bridge || hasKey !== true || busy || !text.trim()} style={{ width: '100%', height: 60, borderRadius: 22, fontSize: 19 }}>
            <Sparkle size={22} color="#FFFFFF" />
            <span>{busy ? tr('Thinking…') : tr('Generate format')}</span>
          </button>
          <div style={{ textAlign: 'center', fontSize: 13, lineHeight: '18px', fontWeight: 500, color: '#3F5688' }}>
            {!bridge ? tr('AI is not available here.') : hasKey ? <span>{tr('Uses your Gemini key and needs internet.')} <a href="#" onClick={(e) => { e.preventDefault(); setEditKey(!editKey); }} style={{ color: NAVY, fontWeight: 700 }}>{tr('Change key')}</a></span> : tr('Add your Gemini API key to start.')}
          </div>
        </div>
      </div>
      <div className="panel" style={{ left: 576, top: 168, width: 800, height: 592, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {res ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 700 }}>{res.name}</h2>
              <span className="tag" style={{ height: 28, gap: 6, background: '#E1ECFC', border: 0 }}><Sparkle size={14} /><span>{tr('AI generated')}</span></span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {chip(tr('{n} teams', { n: res.n }))}
              {res.format === 'groups' ? chip(tr('{g} groups of up to {p}', { g: res.G, p: res.per })) : null}
              {res.format === 'custom' ? chip(res.plan.stage === 'league' ? (res.plan.legs === 2 ? tr('Double round robin') : tr('Round robin')) : res.plan.stage === 'groups' ? tr('{g} groups', { g: res.plan.groups }) : tr('Knockout')) : null}
              {res.format === 'custom' && res.plan.playoff ? chip(tr('Playoff')) : null}
              {res.format === 'custom' && res.plan.thirdPlace ? chip(tr('Third-place match')) : null}
              {res.bo && sport !== 'football' ? chip(tr('Best of {n}', { n: res.bo })) : null}
              {res.format === 'custom' ? chip(planSummary(res)) : null}
              {res.format === 'custom' ? null : chip(formatStats(res.format, res.n, { G: res.G, per: res.per }).split(' · ')[0])}
            </div>
            {res.summary ? <div style={{ boxSizing: 'border-box', padding: '16px 18px', background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 18, fontSize: 17, lineHeight: '26px', fontWeight: 600, color: '#2F4A86' }}>{res.summary}</div> : null}
            {res.notes.length ? (
              <div className="scroll" style={{ maxHeight: 180, overflowY: 'auto', boxSizing: 'border-box', padding: '14px 18px', background: '#FFF8E6', border: '1px solid #F0DDA8', borderRadius: 18, fontSize: 15, lineHeight: '22px', fontWeight: 500, color: '#6B4E00' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{tr('Please note')}</div>
                {res.notes.map((x, i) => <div key={i}>• {x}</div>)}
              </div>
            ) : null}
            <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: '#3F5688' }}>{tr('On the next screen you can still change group sizes, move teams and see the full diagram before you start.')}</div>
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {res.format === 'custom' ? (
              <div style={{ boxSizing: 'border-box', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 18 }}>
                <label htmlFor="fmtname" style={label}>{tr('Name this format')}</label>
                <input id="fmtname" type="text" maxLength={24} value={fmtName} onChange={(e) => setFmtName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && fmtName.trim()) use(); }} placeholder={tr('Format name')} style={{ boxSizing: 'border-box', width: '100%', height: 40, padding: '0 12px', border: '1.5px solid #BFD3F5', borderRadius: 12, fontSize: 16, fontWeight: 600, color: NAVY }} />
                <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: '#3F5688' }}>{tr('Suggested by the AI. Rename it if you like, so you can tell your formats apart. You can delete it later.')}</div>
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="ghost" onClick={generate} disabled={busy} style={{ height: 52, padding: '0 26px', borderWidth: 2 }}>{tr('Regenerate')}</button>
              <button type="button" className="primary" onClick={use} disabled={res.format === 'custom' && !fmtName.trim()} style={{ height: 52, padding: '0 28px', borderRadius: 20, fontSize: 17 }}><span>{tr('Use this format')}</span><ArrowRight size={22} /></button>
            </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: '0 60px' }}>
            <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E1ECFC', borderRadius: 32 }}><Sparkle size={34} /></div>
            {error ? (
              <div style={{ fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#B42318' }}>{error}</div>
            ) : (
              <>
                <div style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>{tr('Your format will show up here')}</div>
                <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 500, color: '#3F5688' }}>{tr('Write how many teams there are, how groups work and how the winner is decided. The AI picks the closest format the app supports and tells you anything it cannot do.')}</div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- tournament build ----------

export function buildAll(t) {
  const n = t.n;
  if (t.format === 'swiss') {
    const b = buildSwiss(n, t.results);
    const matches = [];
    b.rounds.forEach((r) => r.groups.forEach((g) => g.matches.forEach((m) => matches.push(m))));
    if (b.knockout) b.knockout.columns.forEach((c) => c.matches.forEach((m) => matches.push(m)));
    const adv = b.advancers;
    return {
      columns: swissColumns(b),
      tables: [{ name: tr('Swiss stage'), rows: b.table, highlight: (r) => b.finished && adv.indexOf(r.t) !== -1 }],
      tableNote: b.finished ? tr('Teams with {k} wins advance', { k: b.k }) : tr('Updates after every result'),
      champion: b.knockout ? b.knockout.champion : null,
      matches: matches
    };
  }
  if (t.format === 'groups') {
    const b = buildGroups(t.cfg.order, t.cfg.G, t.cfg.per, t.results, t.sport);
    const matches = [];
    b.rounds.forEach((pg) => pg.forEach((ms) => ms.forEach((m) => matches.push(m))));
    b.knockout.columns.forEach((c) => c.matches.forEach((m) => matches.push(m)));
    return {
      columns: groupsColumns(b),
      tables: b.tables.map((rows, g) => ({ name: tr('Group {g}', { g: LETTERS[g] }), rows: rows, highlight: (r, i) => i < 2 })),
      tableNote: tr('Top 2 of each group advance'),
      champion: b.knockout.champion,
      matches: matches
    };
  }
  if (t.format === 'plan') {
    const plan = t.cfg.plan;
    const b = buildPlan(n, plan, t.results, t.sport, null);
    const matches = [];
    b.rounds.forEach((pg) => pg.forEach((ms) => ms.forEach((m) => matches.push(m))));
    if (b.knockout) b.knockout.columns.forEach((c) => c.matches.forEach((m) => matches.push(m)));
    const adv = plan.stage === 'groups' ? plan.advance : plan.playoff ? plan.qualify : 0;
    const note = !plan.playoff ? tr('Updates after every result') : plan.stage === 'groups' ? tr('Top {n} of each group advance', { n: adv }) + (plan.wildcards ? tr(', plus the best {w} of the next place', { w: plan.wildcards }) : '') : tr('Top {n} advance to the playoff', { n: adv });
    return {
      columns: planColumns(b, plan, shownNames(t)),
      tables: plan.stage === 'knockout' ? null : b.tables.map((rows, g) => ({ name: b.G > 1 ? tr('Group {g}', { g: LETTERS[g] }) : tr('League table'), rows: rows, highlight: (r, i) => i < adv })),
      tableNote: note,
      champion: b.champion,
      matches: matches
    };
  }
  const ko = knockoutFromSeeds(t.cfg && t.cfg.order && t.cfg.order.length === n ? t.cfg.order : range(n), 'K', t.results);
  const matches = [];
  ko.columns.forEach((c) => c.matches.forEach((m) => matches.push(m)));
  return { columns: singleColumns(ko, shownNames(t)), tables: null, champion: ko.champion, matches: matches };
}

function prune(t) {
  const b = buildAll(t);
  const keep = {};
  b.matches.forEach((m) => { if (m.result) keep[m.key] = t.results[m.key]; });
  return Object.assign({}, t, { results: keep });
}

// ---------- app ----------

export default function App() {
  const { lang } = useLang();
  const [data, setData] = useState(load);
  const [nav, setNav] = useState({ stack: ['landing'], i: 0 });
  const screen = nav.stack[nav.i];
  useEffect(() => { save(data); }, [data]);
  const patch = (p) => setData((d) => Object.assign({}, d, p));
  const n = clampN(data.raw);
  const names = useMemo(() => range(n).map((i) => teamLabel(data.names[i], i)), [data.names, n, lang]);

  const go = (s) => setNav((h) => (h.stack[h.i] === s ? h : { stack: h.stack.slice(0, h.i + 1).concat(s), i: h.i + 1 }));
  // Mouse side buttons work like a browser: back closes an open dialog first, then goes to the previous screen.
  useEffect(() => {
    let lastStep = 0;
    const step = (dir) => {
      const now = Date.now();
      if (now - lastStep < 250) return; // the same click can arrive twice (mouse event + Windows app-command)
      lastStep = now;
      if (dir < 0 && window.__rankingClose) { window.__rankingClose(); return; }
      setNav((h) => {
        const i = h.i + dir;
        return i < 0 || i >= h.stack.length ? h : { stack: h.stack, i: i };
      });
    };
    const onMouse = (e) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.type === 'mouseup') step(e.button === 3 ? -1 : 1);
    };
    const onAux = (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); };
    const onCmd = (e) => step(e.detail);
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('mousedown', onMouse);
    window.addEventListener('auxclick', onAux);
    window.addEventListener('ranking-nav', onCmd);
    return () => {
      window.removeEventListener('mouseup', onMouse);
      window.removeEventListener('mousedown', onMouse);
      window.removeEventListener('auxclick', onAux);
      window.removeEventListener('ranking-nav', onCmd);
    };
  }, []);
  const onNav = (e) => {
    const a = e.target.closest && e.target.closest('[data-nav]');
    if (a) { e.preventDefault(); go(a.getAttribute('data-nav')); }
  };

  const backup = () => { const f = makeBackup(data); saveBlob(new Blob([f.text], { type: 'application/json' }), f.name); };
  const restore = () => pickText('.json,application/json', (text) => {
    const raw = parseBackup(text);
    let nd = null;
    if (raw) {
      try {
        nd = normalize(raw);
        if (nd.tournament) buildAll(nd.tournament);
      } catch (e) { nd = null; }
    }
    if (!nd) { window.alert(tr('This is not a Ranking backup file.')); return; }
    if (!window.confirm(tr('Replace everything on this device with this backup?'))) return;
    setData(nd);
    window.alert(tr('Backup restored.'));
  });

  let body;
  if (screen === 'landing') body = <Landing sport={data.sport} setSport={(v) => patch({ sport: v })} hasSaved={!!data.tournament} onContinue={() => go('teams')} onResume={() => go('tournament')} onBackup={backup} onRestore={restore} />;
  else if (screen === 'teams') body = <Teams sport={data.sport} data={data} n={n} patch={patch} go={go} />;
  else if (screen === 'formats') body = <Formats sport={data.sport} data={data} n={n} names={names} patch={patch} go={go} />;
  else if (screen === 'explain') body = <div onClick={onNav} dangerouslySetInnerHTML={{ __html: translateHtml(swissHtml) }} />;
  else if (screen === 'describe') body = <Describe sport={data.sport} data={data} n={n} patch={patch} go={go} />;
  else body = <Tournament sport={data.sport} data={data} patch={patch} go={go} />;
  return <Stage>{body}</Stage>;
}

// Translates the text nodes of the static "How does Swiss stage work?" page.
function translateHtml(html) {
  return html.replace(/>([^<>]+)</g, (m, txt) => {
    const k = txt.trim();
    if (!k) return m;
    return '>' + txt.replace(k, tr(k)) + '<';
  });
}

// ---------- landing ----------

function Landing({ onContinue, onResume, hasSaved, sport, setSport, onBackup, onRestore }) {
  const [open, setOpen] = useState(false);
  const label = sport === 'football' ? tr('Football') : tr('Volleyball');
  return (
    <div style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', paddingTop: 120, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 style={{ margin: '0 0 44px 0', fontSize: 128, lineHeight: 1, fontStyle: 'italic', fontWeight: 800, letterSpacing: -3, color: NAVY }}>Ranking</h1>
      <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={tr('Choose a sport')} style={{ boxSizing: 'border-box', width: '100%', height: 84, padding: '0 26px', display: 'flex', alignItems: 'center', gap: 20, background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 28, cursor: 'pointer', textAlign: 'left', boxShadow: '0 10px 30px rgba(15,47,140,0.12)' }}>
          {sport === 'football' ? <FootballIcon size={44} /> : <VolleyballIcon size={44} />}
          <span style={{ flex: 1, fontSize: 28, fontWeight: 600, color: NAVY }}>{label}</span>
          <span style={{ width: 1, height: 44, background: '#D3E0F7' }} />
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><path d="M5 9l7 7 7-7" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {open ? (
          <div role="listbox" style={{ boxSizing: 'border-box', width: '100%', padding: 8, display: 'flex', flexDirection: 'column', gap: 4, background: '#FFFFFF', border: '1px solid #CBDCF7', borderRadius: 28, boxShadow: '0 14px 34px rgba(15,47,140,0.14)' }}>
            {[['football', tr('Football'), FootballIcon], ['volleyball', tr('Volleyball'), VolleyballIcon]].map(([id, lab, Icon]) => (
              <button key={id} type="button" role="option" aria-selected={sport === id} onClick={() => { setSport(id); setOpen(false); }} style={{ boxSizing: 'border-box', width: '100%', height: 68, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 20, background: sport === id ? '#E1ECFC' : 'transparent', border: 0, borderRadius: 20, cursor: 'pointer', textAlign: 'left' }}>
                <Icon size={40} />
                <span style={{ fontSize: 24, fontWeight: 600, color: NAVY }}>{lab}</span>
              </button>
            ))}
          </div>
        ) : null}
          <>
            <button type="button" className="primary" onClick={onContinue} style={{ marginTop: 20, width: '100%', height: 76, borderRadius: 28, fontSize: 26, letterSpacing: 0.3, boxShadow: '0 12px 28px rgba(15,47,140,0.28)', gap: 14 }}>
              <span>{hasSaved ? tr('New tournament') : tr('Continue')}</span>
              <ArrowRight size={28} />
            </button>
            {hasSaved ? (
              <button type="button" onClick={onResume} style={{ height: 60, background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 24, fontSize: 20, fontWeight: 700, color: NAVY, cursor: 'pointer' }}>{tr('Resume saved tournament')}</button>
            ) : null}
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button type="button" className="ghost soft" onClick={onBackup} title={tr('Saves your teams, formats and tournament to a file.')}>{tr('Back up')}</button>
              <button type="button" className="ghost soft" onClick={onRestore} title={tr('Opens a backup file and restores it on this device.')}>{tr('Restore')}</button>
            </div>
          </>
      </div>
    </div>
  );
}

// ---------- teams ----------

function Teams({ data, n, patch, go, sport }) {
  const fb = sport === 'football';
  const parsed = parseInt(data.raw, 10);
  const valid = !isNaN(parsed) && parsed >= MIN_TEAMS && parsed <= MAX_TEAMS;
  const recFmt = n < 4 || (fb && n <= 5) ? 'single' : fb ? 'groups' : swissAllowed(n) ? 'swiss' : 'groups';
  const recName = recFmt === 'swiss' ? tr('Swiss stage') : recFmt === 'single' ? tr('Single elimination') : tr('Group stage + Playoffs');
  const lay = defaultLayout(n);
  const recText = formatStats(recFmt, n, { G: lay.G, per: lay.per }).split(' · ').slice(0, 2).join(' · ');
  const recText2 = tr('{stats} in total.', { stats: recText });
  const filled = data.names.slice(0, n).filter((x) => x && x.trim()).length;
  const setNames = (names) => patch({ names: names });
  const cont = () => {
    const l = defaultLayout(n);
    patch({ sorder: null, raw: String(n), sel: recFmt, G: l.G, per: l.per, order: layoutOrder(range(n), l.G, l.per) });
    go('formats');
  };
  const sq = { flex: 'none', width: 64, height: 64, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 32, cursor: 'pointer' };
  return (
    <>
      <Header back={() => go('landing')} title={tr('Add your teams')} sub={tr('Enter how many teams play and what they are called. We will suggest the best format.')} right={<SportPill sport={sport} />} />
      <div className="panel" style={{ left: 64, top: 168, width: 480, height: 592, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>{tr('Number of teams')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button type="button" aria-label={tr('Remove one team')} style={sq} onClick={() => patch({ raw: String(Math.max(MIN_TEAMS, n - 1)) })}>
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke={NAVY} strokeWidth="2.8" fill="none" strokeLinecap="round" /></svg>
          </button>
          <input type="number" inputMode="numeric" min={MIN_TEAMS} max={MAX_TEAMS} aria-label={tr('Number of teams')} value={data.raw} onChange={(e) => patch({ raw: e.target.value })} onBlur={() => patch({ raw: String(n) })} style={{ boxSizing: 'border-box', width: 200, height: 104, padding: 0, textAlign: 'center', background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 26, fontSize: 72, fontStyle: 'italic', fontWeight: 800, color: NAVY }} />
          <button type="button" aria-label={tr('Add one team')} style={sq} onClick={() => patch({ raw: String(Math.min(MAX_TEAMS, n + 1)) })}>
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke={NAVY} strokeWidth="2.8" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ height: 20, textAlign: 'center', fontSize: 14, lineHeight: '20px', fontWeight: 600, color: valid ? '#3F5688' : '#B42318' }}>{valid ? tr('Type a number or use + and −') : tr('Enter a number from {a} to {b}', { a: MIN_TEAMS, b: MAX_TEAMS })}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          {[4, 8, 12, 16, 32, 64].map((v) => (
            <button key={v} type="button" onClick={() => patch({ raw: String(v) })} style={{ minWidth: 56, height: 48, padding: '0 16px', background: v === n ? NAVY : '#FFFFFF', color: v === n ? '#FFFFFF' : NAVY, border: '2px solid ' + NAVY, borderRadius: 24, fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>{v}</button>
          ))}
        </div>
        <div style={{ boxSizing: 'border-box', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14, background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 20 }}>
          <div style={{ flex: 'none', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E1ECFC', borderRadius: 20 }}><Sparkle size={22} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' }}>{tr('Our suggestion')}</div>
            <div style={{ marginTop: 2, fontSize: 20, lineHeight: '26px', fontWeight: 700 }}>{recName}</div>
            <div style={{ marginTop: 2, fontSize: 14, lineHeight: '20px', fontWeight: 500, color: '#2F4A86' }}>{recText2}</div>
          </div>
        </div>
        <button type="button" className="primary" onClick={cont} style={{ marginTop: 'auto', width: '100%', height: 68, padding: '0 28px', borderRadius: 24, fontSize: 22, letterSpacing: 0.3, gap: 12, boxShadow: '0 12px 28px rgba(15,47,140,0.28)' }}>
          <span>{tr('Continue')}</span>
          <ArrowRight size={26} />
        </button>
      </div>
      <div className="panel" style={{ left: 576, top: 168, width: 800, height: 592, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ flex: 'none', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: '28px', fontWeight: 700 }}>{tr('Team names')}</h2>
            <span style={{ height: 28, boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', border: '1px solid #BFD3F5', borderRadius: 14, fontSize: 13, fontWeight: 600, color: '#3F5688' }}>{tr('{a} of {b} named', { a: filled, b: n })}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ghost" onClick={() => setNames(SAMPLES.slice())}>{tr('Use sample names')}</button>
            <button type="button" className="ghost soft" onClick={() => setNames(SAMPLES.map(() => ''))}>{tr('Clear all')}</button>
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 46, gap: '8px 20px', alignContent: 'start' }}>
          {range(n).map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 'none', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 17, background: '#E1ECFC', fontSize: 14, fontWeight: 700 }}>{i + 1}</span>
              <input type="text" value={data.names[i] || ''} placeholder={tr('Team {n}', { n: i + 1 })} aria-label={tr('Name of team {n}', { n: i + 1 })} onChange={(e) => { const nn = data.names.slice(); nn[i] = e.target.value; setNames(nn); }} style={{ boxSizing: 'border-box', flex: 1, minWidth: 0, height: 46, padding: '0 16px', background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 14, fontSize: 16, fontWeight: 600, color: NAVY }} />
            </div>
          ))}
        </div>
        <div style={{ flex: 'none', fontSize: 14, lineHeight: '20px', fontWeight: 500, color: '#3F5688' }}>{tr('Names appear in the match diagrams on the next step. You can change them later.')}</div>
      </div>
    </>
  );
}

// ---------- formats ----------

function Formats({ data, n, names, patch, go, sport }) {
  const { lang } = useLang();
  const fb = sport === 'football';
  const { G, per, order } = data;
  const customs = data.customs || [];
  const cust = String(data.sel).indexOf('c:') === 0 ? customs.filter((c) => 'c:' + c.id === data.sel)[0] || null : null;
  const sel = (fb && data.sel === 'swiss') || (String(data.sel).indexOf('c:') === 0 && !cust) ? 'groups' : data.sel;
  const isPlan = !!cust;
  const planKo = isPlan && cust.plan.stage === 'knockout';
  const removeCustom = (c) => {
    if (!window.confirm(tr('Delete the format "{name}"?', { name: c.name }))) return;
    patch({ customs: customs.filter((x) => x.id !== c.id), sel: data.sel === 'c:' + c.id ? (fb ? 'groups' : 'swiss') : data.sel });
  };
  const [swap, setSwap] = useState(null);
  const slots = G * per;
  const teamsInSlots = range(slots).map((i) => order[i]);
  const placed = teamsInSlots.filter((x) => x !== null && x !== undefined);
  const unplaced = [];
  for (let p = slots; p < order.length; p++) if (order[p] !== null && order[p] !== undefined) unplaced.push(p);
  const groupSizes = range(G).map((g) => range(per).filter((i) => order[g * per + i] !== null && order[g * per + i] !== undefined).length);
  const groupsValid = unplaced.length === 0 && placed.length === n && groupSizes.every((s) => s >= 2);
  let groupsMsg;
  let groupsBad = true;
  let suggest = [];
  if (n < 2 * G) {
    groupsMsg = tr('{g} groups need at least {m} teams, but you have {n}.', { g: G, m: 2 * G, n: n });
    suggest = [];
  } else if (slots < n) {
    groupsMsg = tr('{g} groups of {p} only fit {s} teams, but you have {n}. Try:', { g: G, p: per, s: slots, n: n });
    suggest = GROUP_COUNTS.map((g) => ({ G: g, per: Math.ceil(n / g) })).filter((s) => s.per <= MAX_PER && s.per >= 2 && s.G * 2 <= n).slice(0, 3);
  } else if (!groupsValid) {
    groupsMsg = unplaced.length ? tr('Some teams are not placed in a group yet. Swap them in.') : tr('Every group needs at least 2 teams.');
  } else {
    groupsBad = false;
    groupsMsg = tr('All {n} teams are placed. Rename a team, or use the swap buttons to move teams between places.', { n: n });
  }
  const setLayout = (g, p) => { setSwap(null); patch({ G: g, per: p, order: layoutOrder(placed.concat(unplaced.map((q) => order[q])).sort((a, b) => a - b), g, p) }); };
  const shuffle = () => {
    const a = range(n);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    setSwap(null);
    patch({ order: layoutOrder(a, G, per) });
  };
  const doSwap = (pos) => {
    if (swap === null) { setSwap(pos); return; }
    if (swap === pos) { setSwap(null); return; }
    const o = order.slice();
    const t = o[pos];
    o[pos] = o[swap];
    o[swap] = t;
    setSwap(null);
    patch({ order: o });
  };
  const sord = data.sorder && data.sorder.length === n ? data.sorder : range(n);
  const [pick, setPick] = useState(null);
  const pickTeam = (t) => {
    if (pick === null) { setPick(t); return; }
    if (pick !== t) {
      const o = sord.slice();
      const a = o.indexOf(pick);
      const b = o.indexOf(t);
      o[a] = t;
      o[b] = pick;
      patch({ sorder: o });
    }
    setPick(null);
  };
  const shuffleNames = () => {
    if (sel === 'single') {
      const o = sord.slice();
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; }
      setPick(null);
      patch({ sorder: o });
      return;
    }
    const cur = range(n).map((i) => data.names[i] || '');
    for (let i = cur.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = cur[i]; cur[i] = cur[j]; cur[j] = t; }
    patch({ names: cur.concat(data.names.slice(n)) });
  };
  const renameTeam = (t, val) => {
    const nn = data.names.slice();
    nn[t] = val;
    patch({ names: nn });
  };

  const swissOk = swissAllowed(n);
  const groupsStats = useMemo(() => {
    if (!groupsValid) return tr('Choose a valid layout');
    const b = buildGroups(order, G, per, {});
    let total = 0;
    b.rounds.forEach((pg) => pg.forEach((ms) => { total += ms.length; }));
    b.knockout.columns.forEach((c) => { total += c.matches.length; });
    const minPlay = Math.min.apply(null, groupSizes) - 1;
    return tr('{m} matches · {r} rounds · min. {k} matches each', { m: total, r: b.rounds.length + b.knockout.columns.length, k: minPlay });
  }, [order, G, per, n, groupsValid, lang]);
  const customStats = useMemo(() => customs.map((c) => {
    const b = buildPlan(n, c.plan, {}, sport, null);
    let total = 0;
    b.rounds.forEach((pg) => pg.forEach((ms) => { total += ms.length; }));
    if (b.knockout) b.knockout.columns.forEach((x) => { total += x.matches.length; });
    return tr('{m} matches · {r} rounds', { m: total, r: b.rounds.length + (b.knockout ? b.knockout.columns.length : 0) });
  }), [customs, n, sport, lang]);
  const customTabs = customs.map((c, i) => ({ id: 'c:' + c.id, name: c.name, stats: customStats[i], rec: false, custom: c }));
  const tabs = (fb ? [
    { id: 'groups', name: tr('Group stage + Playoffs'), stats: groupsStats, rec: n > 5 },
    { id: 'single', name: tr('Single elimination'), stats: formatStats('single', n, {}), rec: n <= 5 }
  ] : [
    { id: 'swiss', name: tr('Swiss stage'), stats: swissOk ? formatStats('swiss', n, {}) : tr('Needs 4, 8 or 16 teams'), rec: swissOk },
    { id: 'groups', name: tr('Group stage + Playoffs'), stats: groupsStats, rec: !swissOk },
    { id: 'single', name: tr('Single elimination'), stats: formatStats('single', n, {}), rec: false }
  ]).concat(customTabs);
  // Widths are computed (not left to flex) so every change can be animated: all boxes share the row
  // equally at first and shrink together as formats are added; at the minimum the row scrolls sideways.
  const ROW_W = 1312;
  const GAP = 12;
  const MIN_TAB = 200;
  const k = tabs.length;
  const evenW = (ROW_W - GAP * k) / (k + 1);
  const descW = Math.round(Math.max(190, Math.min(320, evenW)));
  const tabW = Math.floor(Math.max(MIN_TAB, (ROW_W - descW - GAP - GAP * (k - 1)) / k));
  const needScroll = k * tabW + GAP * (k - 1) > ROW_W - descW - GAP;
  const seen = React.useRef(null);
  const isNewTab = (id) => !!seen.current && !seen.current.has(id);
  useEffect(() => { seen.current = new Set(tabs.map((c) => c.id)); });
  const tabsRef = React.useRef(null);
  useEffect(() => {
    const row = tabsRef.current;
    const el = row && row.querySelector('[data-tab="' + data.sel + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [data.sel, customs.length]);

  const columns = useMemo(() => {
    if (sel === 'swiss' && swissOk) return swissPreviewColumns(n);
    if (sel === 'single') return singleColumns(knockoutFromSeeds(sord, 'K', {}), names);
    if (isPlan) return planColumns(buildPlan(n, cust.plan, {}, sport, null), cust.plan, names);
    return [];
  }, [sel, n, swissOk, names.join('|'), sord.join(','), cust, sport, lang]);

  const startTournament = () => {
    const cfg = { G: G, per: per, order: order.slice() };
    const fresh = { sport: sport, format: isPlan ? 'plan' : sel, n: n, names: range(n).map((i) => (data.names[i] || '').trim()), cfg: sel === 'groups' ? cfg : sel === 'single' ? { order: sord.slice() } : isPlan ? { plan: cust.plan } : null, planName: isPlan ? cust.name : '', results: {} };
    const old = data.tournament;
    let t = fresh;
    if (old && old.sport === sport && old.format === fresh.format && old.n === n && JSON.stringify(old.names) === JSON.stringify(fresh.names) && JSON.stringify(old.cfg) === JSON.stringify(fresh.cfg)) t = old;
    else if (old && old.sport === sport && old.format === fresh.format && old.n === n) t = prune(Object.assign({}, fresh, { results: old.results, schedule: old.schedule }));
    patch({ tournament: t });
    go('tournament');
  };
  const useOk = sel === 'groups' ? groupsValid : sel === 'swiss' ? swissOk : true;

  return (
    <>
      <Header back={() => go('teams')} title={tr('Pick a format')} sub={tr('Our suggestions for {n} teams, best fit first.', { n: n }) + ' ' + (fb ? tr('Draws are allowed in the group stage; knockout matches go to penalties.') : tr('Pick 3 or 5 sets for each match when you enter its score.'))} right={<><SportPill sport={sport} /><button type="button" className="chipbtn" style={{ paddingLeft: 18 }} onClick={() => go('teams')}>{tr('{n} teams', { n: n })}</button></>} />
      <div style={{ position: 'absolute', left: 64, top: 148, width: ROW_W, height: 94, display: 'flex', gap: GAP }}>
        <div className="scroll" ref={tabsRef} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', paddingTop: 16, display: 'flex', gap: GAP, overflowX: needScroll ? 'auto' : 'hidden', overflowY: 'hidden' }}>
        {tabs.map((c) => (
          <div key={c.id} data-tab={c.id} className={'tabbox' + (isNewTab(c.id) ? ' tabin' : '')} style={{ position: 'relative', flex: 'none', width: tabW, height: 72 }}>
          <button type="button" aria-pressed={sel === c.id} onClick={() => { setSwap(null); patch({ sel: c.id }); }} style={{ position: 'relative', boxSizing: 'border-box', width: '100%', minWidth: 0, height: 72, padding: c.custom ? '8px 34px 0 20px' : '8px 20px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, background: sel === c.id ? '#E1ECFC' : 'rgba(255,255,255,0.94)', border: sel === c.id ? '2px solid ' + NAVY : '1px solid #CBDCF7', borderRadius: 20, textAlign: 'left', color: NAVY, cursor: 'pointer', boxShadow: '0 8px 22px rgba(15,47,140,0.1)', opacity: c.id === 'swiss' && !swissOk ? 0.7 : 1 }}>
            <span title={c.name} style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: tabs.length > 3 ? 16 : 19, lineHeight: '24px', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.rec ? (
              <span style={{ position: 'absolute', top: -14, right: 16, height: 22, boxSizing: 'border-box', padding: '0 9px', display: 'flex', alignItems: 'center', gap: 5, background: NAVY, color: '#FFFFFF', border: '2px solid #FFFFFF', borderRadius: 11, fontSize: 11, fontWeight: 700, boxShadow: '0 2px 8px rgba(15,47,140,0.3)' }}>
                <Sparkle size={11} color="#FFFFFF" /><span>{tr('Recommended')}</span>
              </span>
            ) : null}
            <span title={c.stats} style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, lineHeight: '18px', fontWeight: 600, color: '#2F4A86' }}>{c.stats}</span>
          </button>
          {c.custom ? (
            <button type="button" aria-label={tr('Delete this format')} title={tr('Delete this format')} onClick={() => removeCustom(c.custom)} style={{ position: 'absolute', top: 6, right: 8, width: 22, height: 22, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '1px solid #BFD3F5', borderRadius: 11, cursor: 'pointer' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={NAVY} strokeWidth="3.2" fill="none" strokeLinecap="round" /></svg>
            </button>
          ) : null}
          </div>
        ))}
        </div>
        <button type="button" onClick={() => go('describe')} style={{ boxSizing: 'border-box', flex: 'none', width: descW, height: 72, marginTop: 16, padding: '0 16px', overflow: 'hidden', transition: 'width .4s cubic-bezier(.4,0,.2,1)', display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.7)', border: '2px dashed #5B86DB', borderRadius: 20, textAlign: 'left', color: NAVY, cursor: 'pointer' }}>
          {descW >= 230 ? <Sparkle size={26} /> : null}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 17, lineHeight: '22px', fontWeight: 700 }}>{tr('Describe your own')}</span>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, lineHeight: '18px', fontWeight: 500, color: '#2F4A86' }}>{tr('Tell the AI how you want to play')}</span>
          </span>
        </button>
      </div>

      <div className="panel" style={{ left: 64, top: 252, width: 1312, height: 518, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sel === 'groups' ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', gap: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{tr('Groups')}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {GROUP_COUNTS.map((v) => (
                    <button key={v} type="button" onClick={() => setLayout(v, Math.min(MAX_PER, Math.max(2, Math.ceil(n / v))))} style={{ minWidth: 52, height: 44, padding: '0 16px', background: v === G ? NAVY : '#FFFFFF', color: v === G ? '#FFFFFF' : NAVY, border: '2px solid ' + NAVY, borderRadius: 22, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>{v}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{tr('Teams per group')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" aria-label={tr('Fewer teams per group')} onClick={() => setLayout(G, Math.max(2, per - 1))} style={{ width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 22, cursor: 'pointer' }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke={NAVY} strokeWidth="2.8" fill="none" strokeLinecap="round" /></svg></button>
                  <span style={{ minWidth: 44, textAlign: 'center', fontSize: 28, fontStyle: 'italic', fontWeight: 800 }}>{per}</span>
                  <button type="button" aria-label={tr('More teams per group')} onClick={() => setLayout(G, Math.min(MAX_PER, per + 1))} style={{ width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '2px solid ' + NAVY, borderRadius: 22, cursor: 'pointer' }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke={NAVY} strokeWidth="2.8" fill="none" strokeLinecap="round" /></svg></button>
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button type="button" className="ghost" onClick={shuffle}>{tr('Draw randomly')}</button>
                <button type="button" className="ghost soft" onClick={() => { setSwap(null); patch({ order: layoutOrder(range(n), G, per) }); }}>{tr('In entered order')}</button>
              </div>
            </div>
            <div style={{ flex: 'none', height: 40, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, background: groupsBad ? '#FFF4F2' : '#F4F8FE', border: '1px solid ' + (groupsBad ? '#F3C2BC' : '#CBDCF7'), borderRadius: 14, fontSize: 14, fontWeight: 600, color: groupsBad ? '#B42318' : '#2F4A86' }}>
              <span>{groupsMsg}</span>
              {suggest.map((s) => (
                <button key={s.G + 'x' + s.per} type="button" onClick={() => setLayout(s.G, s.per)} style={{ height: 28, padding: '0 14px', background: NAVY, border: 0, borderRadius: 14, fontSize: 13, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}>{tr('{g} groups of {n}', { g: s.G, n: s.per })}</button>
              ))}
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(G, 4) + ', minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
                {range(G).map((g) => (
                  <div key={g} style={{ minWidth: 0, boxSizing: 'border-box', padding: 10, background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 18 }}>
                    <div style={{ height: 34, boxSizing: 'border-box', padding: '0 8px 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: NAVY, color: '#FFFFFF', borderRadius: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{tr('Group {g}', { g: LETTERS[g] })}</span>
                      <span style={{ height: 22, boxSizing: 'border-box', padding: '0 9px', display: 'flex', alignItems: 'center', background: '#FFFFFF', color: NAVY, borderRadius: 11, fontSize: 12, fontWeight: 700 }}>{groupSizes[g]} / {per}</span>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {range(per).map((i) => {
                        const pos = g * per + i;
                        const t = order[pos];
                        const empty = t === null || t === undefined;
                        const on = swap === pos;
                        return (
                          <div key={i} style={{ boxSizing: 'border-box', height: 34, padding: '0 4px 0 6px', display: 'flex', alignItems: 'center', gap: 8, background: on ? '#E1ECFC' : '#FFFFFF', border: on ? '2px solid ' + NAVY : '1px solid #D3E0F7', borderRadius: 10 }}>
                            <span style={{ flex: 'none', width: 28, fontSize: 12, fontWeight: 700, color: '#3F5688' }}>{LETTERS[g]}{i + 1}</span>
                            <input type="text" value={empty ? '' : (data.names[t] || '')} placeholder={empty ? tr('Empty place') : tr('Team {n}', { n: t + 1 })} disabled={empty} aria-label={tr('Team name')} onChange={(e) => renameTeam(t, e.target.value)} style={{ boxSizing: 'border-box', flex: 1, minWidth: 0, height: 26, padding: '0 6px', background: 'transparent', border: 0, fontSize: 14, fontWeight: 600, color: NAVY }} />
                            <button type="button" aria-label={tr('Swap this place')} onClick={() => doSwap(pos)} style={{ flex: 'none', width: 28, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? NAVY : '#E1ECFC', border: 0, borderRadius: 8, cursor: 'pointer' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" stroke={on ? '#FFFFFF' : NAVY} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {unplaced.length ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#3F5688' }}>{tr('Not placed yet')}</span>
                  {unplaced.map((p) => (
                    <button key={p} type="button" onClick={() => doSwap(p)} style={{ height: 32, padding: '0 14px', background: swap === p ? '#E1ECFC' : '#FFFFFF', border: swap === p ? '2px solid ' + NAVY : '1px solid #BFD3F5', borderRadius: 16, fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}>{data.names[order[p]] || tr('Team {n}', { n: order[p] + 1 })}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : sel === 'swiss' && !swissOk ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 18, fontWeight: 600, color: '#2F4A86' }}>
            {tr('Swiss stage works with exactly 4, 8 or 16 teams. You have {n} teams, so try Group stage + Playoffs or Single elimination.', { n: n })}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
            <div style={{ flex: 'none', width: 250, boxSizing: 'border-box', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 18 }}>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' }}>{tr('Teams')}</span>
                <button type="button" className="ghost" onClick={shuffleNames} style={{ height: 30, padding: '0 12px', fontSize: 13 }}>{tr('Draw randomly')}</button>
              </div>
              <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(sel === 'single' ? sord : range(n)).map((t, i) => (
                  <div key={t} style={{ flex: 'none', boxSizing: 'border-box', height: 34, padding: '0 4px 0 6px', display: 'flex', alignItems: 'center', gap: 8, background: pick === t ? '#E1ECFC' : '#FFFFFF', border: pick === t ? '2px solid ' + NAVY : '1px solid #D3E0F7', borderRadius: 10 }}>
                    <span style={{ flex: 'none', width: 24, fontSize: 12, fontWeight: 700, color: '#3F5688' }}>{i + 1}</span>
                    <input type="text" value={data.names[t] || ''} placeholder={tr('Team {n}', { n: t + 1 })} aria-label={tr('Name of team at place {n}', { n: i + 1 })} onChange={(e) => renameTeam(t, e.target.value)} style={{ boxSizing: 'border-box', flex: 1, minWidth: 0, height: 26, padding: '0 6px', background: 'transparent', border: 0, fontSize: 14, fontWeight: 600, color: NAVY }} />
                    {sel === 'single' ? (
                      <button type="button" aria-label={tr('Swap this team')} onClick={() => pickTeam(t)} style={{ flex: 'none', width: 28, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: pick === t ? NAVY : '#E1ECFC', border: 0, borderRadius: 8, cursor: 'pointer' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" stroke={pick === t ? '#FFFFFF' : NAVY} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <Bracket columns={columns} names={names} onPick={sel === 'single' ? pickTeam : undefined} picked={pick} justify={sel === 'single' || planKo ? 'center' : 'space-between'} colGap={sel === 'single' || planKo ? 100 : 24} />
          </div>
        )}
        <div style={{ flex: 'none', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 20 }}>
          {sel === 'swiss' ? (
            <button type="button" onClick={() => go('explain')} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, fontSize: 15, fontWeight: 600, color: NAVY, cursor: 'pointer', textDecoration: 'underline' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke={NAVY} strokeWidth="2.2" fill="none" /><path d="M12 11v6" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="7.5" r="1.4" fill={NAVY} /></svg>
              <span>{tr('How does Swiss stage work?')}</span>
            </button>
          ) : null}
          <button type="button" className="primary" disabled={!useOk} onClick={startTournament} style={{ height: 52, padding: '0 26px' }}>
            <span>{tr('Use this format')}</span>
            <ArrowRight />
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- tournament ----------

function Tournament({ data, patch, go }) {
  const { lang } = useLang();
  const sport = data.tournament && data.tournament.sport === 'football' ? 'football' : 'volleyball';
  const fb = sport === 'football';
  const t = data.tournament;
  const [open, setOpen] = useState(null);
  const [sched, setSched] = useState(false);
  const [menu, setMenu] = useState(false);
  const [exp, setExp] = useState(null);
  const [img, setImg] = useState(null);
  const [prn, setPrn] = useState(null);
  const hist = useRef({ past: [], future: [] });
  const kb = useRef(null);
  const b = useMemo(() => (t ? buildAll(t) : null), [t, lang]);
  useEffect(() => {
    window.__rankingClose = open ? () => setOpen(null) : sched ? () => setSched(false) : img ? () => setImg(null) : null;
    return () => { window.__rankingClose = null; };
  }, [open, sched, img]);
  useEffect(() => {
    const h = (e) => { if (kb.current) kb.current(e); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  if (!t) {
    return (
      <>
        <Header back={() => go('landing')} title={tr('No tournament yet')} />
      </>
    );
  }
  const title = t.format === 'swiss' ? tr('Swiss stage') : t.format === 'groups' ? tr('Group stage + Playoffs') : t.format === 'plan' ? (t.planName || tr('Custom format')) : tr('Single elimination');
  const tnames = shownNames(t);
  const koLike = t.format === 'single' || (t.format === 'plan' && t.cfg.plan.stage === 'knockout');
  const played = b.matches.filter((m) => m.result).length;
  // Every change to the results can be undone and redone (the schedule is not part of it).
  const setResults = (results) => {
    const next = prune(Object.assign({}, t, { results: results }));
    if (JSON.stringify(next.results) !== JSON.stringify(t.results)) {
      hist.current.past.push(t.results);
      if (hist.current.past.length > 80) hist.current.past.shift();
      hist.current.future = [];
    }
    patch({ tournament: next });
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    const prev = h.past.pop();
    h.future.push(t.results);
    patch({ tournament: Object.assign({}, t, { results: prev }) });
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    const nxt = h.future.pop();
    h.past.push(t.results);
    patch({ tournament: Object.assign({}, t, { results: nxt }) });
  };
  kb.current = (e) => {
    if (!(e.ctrlKey || e.metaKey) || open || sched || img || prn) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = (e.key || '').toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  };
  const canUndo = hist.current.past.length > 0;
  const canRedo = hist.current.future.length > 0;
  const saveResult = (m, res) => {
    if (fb) setResults(Object.assign({}, t.results, { [m.key]: { a: m.a, b: m.b, goals: res.goals, pen: res.pen || null } }));
    else {
      patch({ bo: res.bo });
      setResults(Object.assign({}, t.results, { [m.key]: { a: m.a, b: m.b, sets: res.sets, bo: res.bo } }));
    }
    setOpen(null);
  };
  const clearResult = (m) => {
    const r = Object.assign({}, t.results);
    delete r[m.key];
    setResults(r);
    setOpen(null);
  };
  const openBoard = () => {
    window.open(window.location.href.split('#')[0] + '#standings', 'ranking-standings', 'popup,width=1280,height=720');
  };
  const reset = () => {
    if (window.confirm(tr('Delete all results and start this tournament again?'))) setResults({});
  };
  const sub = t.format === 'groups' ? tr('{g} groups, then playoffs. Click a match to enter its result.', { g: t.cfg.G }) : tr('Click a match to enter its result. Choose 3 or 5 sets for each match.');
  const subFb = t.format === 'groups' ? tr('{g} groups, then playoffs. Click a match to enter its score.', { g: t.cfg.G }) : tr('Click a match to enter its score. Level knockout games need a penalty shootout.');
  return (
    <>
      <Header back={() => go('formats')} backLabel={tr('Edit teams')} title={title} sub={fb ? subFb : sub} right={<><SportPill sport={sport} /><div className="chipbtn" style={{ cursor: 'default' }}>{tr('{n} teams', { n: t.n })}</div></>} />
      <div className="panel" style={{ left: 64, top: 164, width: 1312, height: 606, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ flex: 'none', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="ghost soft" onClick={undo} disabled={!canUndo} aria-label={tr('Undo')} title={tr('Undo') + ' (Ctrl+Z)'} style={{ width: 44, padding: 0, justifyContent: 'center', opacity: canUndo ? 1 : 0.4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12" transform="translate(0 -4)" stroke={NAVY} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="ghost soft" onClick={redo} disabled={!canRedo} aria-label={tr('Redo')} title={tr('Redo') + ' (Ctrl+Y)'} style={{ width: 44, padding: 0, justifyContent: 'center', opacity: canRedo ? 1 : 0.4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l5 5-5 5M20 12H10a6 6 0 000 12" transform="translate(0 -4)" stroke={NAVY} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="tag">{played === 1 ? tr('{n} result entered', { n: played }) : tr('{n} results entered', { n: played })}</span>
            {fb ? <span className="tag">{t.format === 'single' ? tr('Penalties if level') : tr('Draws allowed in groups')}</span> : <span className="tag">{tr('3 or 5 sets per match')}</span>}
            {b.champion !== null && b.champion !== undefined ? (
              <span style={{ height: 32, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, background: NAVY, color: '#FFFFFF', borderRadius: 16, fontSize: 14, fontWeight: 700 }}>
                <Sparkle size={14} color="#FFFFFF" />
                <span>{tr('Champion: {name}', { name: tnames[b.champion] })}</span>
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ghost soft" onClick={() => setSched(true)}>{tr('Match schedule')}</button>
            <div style={{ position: 'relative' }}>
              <button type="button" className="ghost soft" aria-haspopup="menu" aria-expanded={menu} disabled={!!exp} onClick={() => setMenu(!menu)}>{exp ? tr('Making the image…') : tr('Save image / Print')}</button>
              {menu ? (
                <>
                  <div onClick={() => setMenu(false)} style={{ position: 'fixed', left: -2000, top: -2000, width: 6000, height: 6000, zIndex: 3 }} />
                  <div role="menu" style={{ position: 'absolute', right: 0, top: 50, zIndex: 4, minWidth: 240, padding: 6, background: '#FFFFFF', border: '1.5px solid ' + NAVY, borderRadius: 16, boxShadow: '0 12px 30px rgba(15,47,140,0.25)' }}>
                    {[['img', tr('Save image')], ['print', tr('Print')]].map((sec) => (
                      <div key={sec[0]}>
                        <div style={{ padding: '8px 14px 2px', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#3F5688' }}>{sec[1]}</div>
                        {[['bracket', tr('Bracket')]].concat(b.tables ? [['standings', tr('Standings')]] : []).concat([['schedule', tr('Match schedule')]]).map((o) => (
                          <button key={o[0]} type="button" role="menuitem" onClick={() => { setMenu(false); if (o[0] === 'schedule' && !Object.keys(t.schedule || {}).length) setSched(true); else if (sec[0] === 'img') setExp(o[0]); else setPrn(o[0]); }} style={{ display: 'block', width: '100%', height: 40, padding: '0 14px', textAlign: 'left', background: 'transparent', border: 0, borderRadius: 10, fontSize: 15, fontWeight: 700, color: NAVY, cursor: 'pointer' }}>{o[1]}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <button type="button" className="ghost soft" onClick={reset}>{tr('Reset results')}</button>
            {b.tables ? (
              <button type="button" className="primary" onClick={openBoard} style={{ height: 44, padding: '0 20px', borderRadius: 22, fontSize: 15 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" stroke="#FFFFFF" strokeWidth="2.8" fill="none" strokeLinecap="round" /></svg>
                <span>{tr('Standings screen')}</span>
              </button>
            ) : null}
          </div>
        </div>
        <Bracket columns={b.columns} names={tnames} onOpen={(m) => setOpen(m)} justify={koLike ? 'center' : 'space-between'} colGap={koLike ? 120 : t.format === 'swiss' ? 44 : 24} />
      </div>
      {sched ? <ScheduleModal list={listMatches(b.columns)} names={tnames} schedule={t.schedule || {}} onChange={(sc) => patch({ tournament: Object.assign({}, t, { schedule: sc }) })} onSaveImage={() => { setSched(false); setExp('schedule'); }} onPrint={() => { setSched(false); setPrn('schedule'); }} onClose={() => setSched(false)} /> : null}
      {exp ? <ExportRunner key={exp} kind={exp} b={b} names={tnames} sport={sport} title={title} schedule={t.schedule || {}} bracketProps={{ justify: koLike ? 'center' : 'space-between', colGap: koLike ? 120 : t.format === 'swiss' ? 44 : 24 }} onDone={(url) => { setImg({ url: url, name: 'ranking-' + exp + '-' + new Date().toISOString().slice(0, 10) + '.png' }); setExp(null); }} onFail={() => { setExp(null); window.alert(tr('Could not create the image.')); }} /> : null}
      {prn ? <PrintRunner key={prn} kind={prn} b={b} names={tnames} sport={sport} title={title} schedule={t.schedule || {}} bracketProps={{ justify: koLike ? 'center' : 'space-between', colGap: koLike ? 120 : t.format === 'swiss' ? 44 : 24 }} onDone={() => setPrn(null)} /> : null}
      {img ? <ImagePreview url={img.url} name={img.name} onSave={() => import('./exporter.js').then((m) => m.saveImage(img.url, img.name))} onClose={() => setImg(null)} /> : null}
      {open ? <ScoreModal key={open.key} sport={sport} match={open} names={tnames} defaultBo={data.bo} onSave={(res) => saveResult(open, res)} onClear={() => clearResult(open)} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
