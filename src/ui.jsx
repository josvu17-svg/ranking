import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { validateSets, validateGoals, resultOutcome } from './engine.js';
import { t } from './i18n.js';
import { LangSwitch, useLang } from './lang.jsx';

export const NAVY = '#0F2F8C';

export function ArrowLeft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke={NAVY} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

export function ArrowRight({ size = 20, color = '#FFFFFF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
}

export function Sparkle({ size = 14, color = NAVY }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill={color} /></svg>
  );
}

export function VolleyballIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}><circle cx="24" cy="24" r="21" fill="#FFFFFF" stroke={NAVY} strokeWidth="3" /><path d="M24 3C21 13 23 21 33 27M4 18C13 16 21 19 25 26M41 13C34 16 29 21 28 30M9 38C14 31 21 28 31 30" stroke={NAVY} strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
  );
}

export function FootballIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}><circle cx="24" cy="24" r="21" fill="#FFFFFF" stroke={NAVY} strokeWidth="3" /><polygon points="24,15 32,21 29,31 19,31 16,21" fill={NAVY} /><path d="M24 15V4M32 21l10-4M29 31l6 9M19 31l-6 9M16 21L6 17" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" fill="none" /></svg>
  );
}

// Fixed 1440x810 stage scaled to fit the window.
export function Stage({ children, noSwitch }) {
  const [scale, setScale] = useState(1);
  const [portrait, setPortrait] = useState(false);
  useLang();
  useEffect(() => {
    const fit = () => {
      setScale(Math.min(window.innerWidth / 1440, window.innerHeight / 810));
      setPortrait(window.innerWidth < 800 && window.innerHeight > window.innerWidth);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="win">
      {portrait ? (
        <div role="alert" style={{ position: 'absolute', left: 0, top: 0, right: 0, zIndex: 20, boxSizing: 'border-box', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: '#0F2F8C', color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}><rect x="7" y="2.5" width="10" height="19" rx="2" stroke="#fff" strokeWidth="2" fill="none" /><path d="M20 8c2 2 2 6 0 8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          <span>{t('Rotate your phone sideways for the best view.')}</span>
        </div>
      ) : null}
      <div className="stage" style={{ transform: 'scale(' + scale + ')' }}>
        <img className="bg" src="./bg.jpg" alt="" aria-hidden="true" />
        {children}
        {noSwitch ? null : <div style={{ position: 'absolute', right: 64, top: 24, zIndex: 4 }}><LangSwitch /></div>}
      </div>
    </div>
  );
}

export function Header({ back, backLabel, title, sub, right }) {
  return (
    <>
      {back ? (
        <button type="button" className="back" onClick={back}>
          <ArrowLeft />
          <span>{backLabel || t('Back')}</span>
        </button>
      ) : null}
      <h1 className="h1">{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
      <div className="topright">{right}</div>
    </>
  );
}

export function SportPill({ sport }) {
  const fb = sport === 'football';
  return (
    <div className="chipbtn" style={{ cursor: 'default' }}>
      {fb ? <FootballIcon /> : <VolleyballIcon />}
      <span>{fb ? t('Football') : t('Volleyball')}</span>
    </div>
  );
}

// ---------- bracket ----------

const TAG_W = 36;
const NAME_W = 112;
const SET_W = 28;
const TOTAL_W = 34;

function cardWidth(m) {
  if (!m.result) return 220;
  if (m.result.goals) return TAG_W + NAME_W + TOTAL_W + (m.result.pen ? TOTAL_W : 0);
  const bo = m.result.bo === 3 ? 3 : 5;
  return TAG_W + NAME_W + bo * SET_W + TOTAL_W;
}

function MatchBox({ m, names, onOpen, onPick, picked }) {
  const r = m.result;
  const s = r ? resultOutcome(r) : null;
  const nameOf = (t) => (t == null ? null : names[t]);
  const canOpen = onOpen && m.a != null && m.b != null;
  const bo = r ? (r.bo === 3 ? 3 : 5) : 0;
  const nameCell = (name, label, win, lose, row, team) => {
    const placeholder = name == null;
    const pickable = !!onPick && !placeholder;
    const on = pickable && picked === team;
    return (
      <div key={'n' + row} onClick={pickable ? (e) => { e.stopPropagation(); onPick(team); } : undefined} style={{ minWidth: 0, padding: '0 10px', display: 'flex', alignItems: 'center', borderBottom: row === 0 ? '1px solid #E3ECFA' : 'none', cursor: pickable ? 'pointer' : undefined, background: on ? '#BFD3F5' : undefined }} title={pickable ? t('Click, then click another team to swap places') : undefined}>
        <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 13, fontWeight: placeholder ? 500 : lose ? 600 : 700, fontStyle: placeholder ? 'italic' : 'normal', color: placeholder ? '#3F5688' : lose ? '#5B6F9C' : NAVY }} title={placeholder ? label : name}>{placeholder ? label : name}</span>
      </div>
    );
  };
  const cellBase = (row) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #E3ECFA', borderBottom: row === 0 ? '1px solid #E3ECFA' : 'none', fontSize: 13 });
  const cells = [];
  [0, 1].forEach((row) => {
    const mine = row === 0 ? s && s.sa : s && s.sb;
    const theirs = row === 0 ? s && s.sb : s && s.sa;
    const side = row === 0 ? 'a' : 'b';
    const win = !!(s && s.win === side);
    const lose = !!(s && s.win && s.win !== side);
    cells.push(nameCell(nameOf(row === 0 ? m.a : m.b), row === 0 ? m.labelA : m.labelB, win, lose, row, row === 0 ? m.a : m.b));
    if (r && r.goals) {
      cells.push(<div key={'g' + row} style={Object.assign({ background: win ? '#E1ECFC' : '#F4F8FE', color: NAVY, fontWeight: 800, fontSize: 14 }, cellBase(row))}>{mine}</div>);
      if (r.pen) cells.push(<div key={'p' + row} title={t('Penalty shootout')} style={Object.assign({ color: win ? NAVY : '#5B6F9C', fontWeight: win ? 700 : 500, fontStyle: 'italic' }, cellBase(row))}>({r.pen[row]})</div>);
    } else if (r) {
      for (let i = 0; i < bo; i++) {
        const set = r.sets[i];
        const mineP = set ? set[row] : null;
        const otherP = set ? set[1 - row] : null;
        const took = set && mineP > otherP;
        cells.push(<div key={'s' + row + i} style={Object.assign({ color: took ? NAVY : '#5B6F9C', fontWeight: took ? 700 : 500 }, cellBase(row))}>{set ? mineP : ''}</div>);
      }
      cells.push(<div key={'t' + row} style={Object.assign({ background: win ? '#E1ECFC' : '#F4F8FE', color: NAVY, fontWeight: 800, fontSize: 14 }, cellBase(row))}>{mine}</div>);
    } else {
      cells.push(<div key={'t' + row} style={Object.assign({ width: 34, color: '#3F5688', fontWeight: 700 }, cellBase(row))}>–</div>);
    }
  });
  const cols = r && r.goals ? '1fr ' + TOTAL_W + 'px' + (r.pen ? ' ' + TOTAL_W + 'px' : '') : r ? '1fr repeat(' + bo + ', ' + SET_W + 'px) ' + TOTAL_W + 'px' : '1fr 34px';
  const props = canOpen ? {
    className: 'mbox click',
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpen(m),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(m); } },
    'aria-label': t('Enter result for {a} against {b}', { a: nameOf(m.a), b: nameOf(m.b) })
  } : { className: 'mbox' };
  return (
    <div {...props} data-mk={m.key} style={{ width: cardWidth(m) }}>
      <div style={{ flex: 'none', width: TAG_W, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r ? '#D3E3FB' : '#E1ECFC', fontSize: 12, fontWeight: 700 }}>{m.no}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: cols, gridTemplateRows: '1fr 1fr' }}>{cells}</div>
    </div>
  );
}

const outStyle = (kind, first) => ({
  boxSizing: 'border-box',
  height: 28,
  marginTop: first ? 10 : 4,
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  background: kind === 'go' ? NAVY : kind === 'out' ? '#FFFFFF' : '#E1ECFC',
  color: kind === 'go' ? '#FFFFFF' : kind === 'out' ? '#3F5688' : NAVY,
  border: kind === 'go' ? '0' : kind === 'out' ? '1.5px dashed #8AA5D9' : '1px solid #BFD3F5',
  borderRadius: 14,
  fontSize: 12,
  fontWeight: 700
});

// columns: [{ self, groups: [{ label, badge, mt, gap, offset, matches, outs:[[text,kind]], note }] }]
// columns.edges: [{ from, to, kind: 'win'|'lose' }] draws a line from one match to the next.
export function Bracket({ columns, names, onOpen, onPick, picked, justify = 'space-between', colGap = 24, natural = false }) {
  const boxRef = useRef(null);
  const rowRef = useRef(null);
  const lastRef = useRef('');
  const [paths, setPaths] = useState([]);
  const [box, setBox] = useState({ w: 1260, h: 0 });
  const edges = columns.edges || [];
  const colW = columns.map((col) => Math.max.apply(null, [220].concat(col.groups.reduce((acc, g) => acc.concat(g.matches.map(cardWidth)), []))));
  const natW = colW.reduce((x, y) => x + y, 0) + colGap * Math.max(0, columns.length - 1);
  // Shrink a wide bracket so it fits the panel (never below 62%, then it scrolls).
  const scale = natural ? 1 : Math.max(0.62, Math.min(1, (box.w - 4) / natW));
  const rowW = justify === 'space-between' && !natural ? Math.max(natW, (box.w - 4) / scale) : natW;

  useLayoutEffect(() => {
    const holder = boxRef.current;
    const row = rowRef.current;
    if (!holder || !row) return;
    const w = holder.clientWidth;
    const h = row.offsetHeight;
    if (w !== box.w || h !== box.h) setBox({ w: w, h: h });
    const pos = {};
    row.querySelectorAll('[data-mk]').forEach((el) => {
      let x = 0;
      let y = 0;
      let n = el;
      while (n && n !== row) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      pos[el.getAttribute('data-mk')] = { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
    });
    const next = [];
    const colOf = {};
    columns.forEach((c, ci) => c.groups.forEach((g) => g.matches.forEach((m) => { colOf[m.key] = ci; })));
    edges.forEach((e) => {
      const f = pos[e.from];
      const t = pos[e.to];
      if (!f || !t) return;
      // A line that would run behind a whole column of cards is left out (e.g. a Swiss team
      // that goes straight to the playoffs); the "Win →" pill says where it goes.
      if (colOf[e.to] - colOf[e.from] > 1) return;
      const x1 = f.x + f.w;
      const y1 = f.y + f.h / 2;
      const x2 = t.x;
      const y2 = t.y + t.h / 2;
      if (x2 <= x1) return;
      const xm = x2 - x1 > 30 ? x2 - 12 : (x1 + x2) / 2;
      next.push({ d: 'M ' + x1 + ' ' + y1 + ' H ' + xm + ' V ' + y2 + ' H ' + x2, kind: e.kind });
    });
    const s = JSON.stringify(next);
    if (s !== lastRef.current) { lastRef.current = s; setPaths(next); }
  });
  return (
    <div ref={boxRef} className="scroll" style={{ flex: 1, minHeight: 0, overflow: natural ? 'visible' : 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 'none', margin: 'auto', width: rowW * scale, height: box.h * scale }}>
        <div ref={rowRef} style={{ position: 'absolute', left: 0, top: 0, width: rowW, transform: 'scale(' + scale + ')', transformOrigin: '0 0', display: 'flex', alignItems: 'flex-start', justifyContent: justify, gap: colGap }}>
          <svg aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill="none" stroke={p.kind === 'lose' ? '#9DB6E6' : '#5B86DB'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={p.kind === 'lose' ? '5 4' : undefined} />
            ))}
          </svg>
          {columns.map((col, ci) => (
            <div key={ci} style={{ position: 'relative', zIndex: 1, flex: 'none', width: colW[ci], alignSelf: col.self || 'flex-start' }}>
              {col.groups.map((g, gi) => (
                <div key={gi} style={{ marginTop: g.mt || 0 }}>
                  <div style={{ boxSizing: 'border-box', height: 34, padding: '0 8px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: NAVY, color: '#FFFFFF', borderRadius: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{g.label}</span>
                    {g.badge ? <span style={{ height: 22, boxSizing: 'border-box', padding: '0 9px', display: 'flex', alignItems: 'center', background: '#FFFFFF', color: NAVY, borderRadius: 11, fontSize: 12, fontWeight: 700 }}>{g.badge}</span> : null}
                  </div>
                  {g.abs ? (
                    <div style={{ position: 'relative', height: g.abs.height, marginTop: 8 }}>
                      {g.matches.map((m, mi) => <div key={mi} style={{ position: 'absolute', left: 0, top: g.abs.tops[mi] }}><MatchBox m={m} names={names} onOpen={onOpen} onPick={onPick} picked={picked} /></div>)}
                    </div>
                  ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: g.gap == null ? 8 : g.gap, marginTop: g.offset == null ? 8 : g.offset }}>
                    {g.matches.map((m, mi) => <MatchBox key={mi} m={m} names={names} onOpen={onOpen} onPick={onPick} picked={picked} />)}
                  </div>
                  )}
                  {g.note ? <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#3F5688', lineHeight: '16px', maxWidth: 220 }}>{g.note}</div> : null}
                  {(g.outs || []).map((o, oi) => <div key={oi} style={outStyle(o[1], oi === 0)}>{o[0]}</div>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- modals ----------

export function ScoreModal(props) {
  return props.sport === 'football' ? <FootballModal {...props} /> : <VolleyballModal {...props} />;
}

function FootballModal({ match, names, onSave, onClear, onClose }) {
  const ex = match.result;
  const [g, setG] = useState(ex && ex.goals ? [String(ex.goals[0]), String(ex.goals[1])] : ['', '']);
  const [p, setP] = useState(ex && ex.pen ? [String(ex.pen[0]), String(ex.pen[1])] : ['', '']);
  const clean = (val) => val.replace(/[^0-9]/g, '').slice(0, 2);
  const v = validateGoals(g[0], g[1], p[0], p[1], !!match.ko);
  const level = g[0] !== '' && g[0] === g[1];
  const needPen = !!match.ko && level;
  const anyInput = g[0] !== '' || g[1] !== '';
  const A = names[match.a];
  const B = names[match.b];
  const box = { boxSizing: 'border-box', width: 84, height: 64, textAlign: 'center', fontSize: 30, fontWeight: 800, color: NAVY, background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 16 };
  const small = { boxSizing: 'border-box', width: 72, height: 48, textAlign: 'center', fontSize: 20, fontWeight: 700, color: NAVY, background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 14 };
  let msg = t('Enter the goals of both teams.') + ' ' + (match.ko ? t('If it is level, a penalty shootout decides.') : t('A draw is allowed.'));
  let bad = false;
  if (v.ok) {
    const o = resultOutcome(v);
    const who = o.win === 'a' ? A : B;
    msg = o.win === null ? t('Result: draw {a}-{b}. One point each.', { a: v.goals[0], b: v.goals[1] }) : v.pen ? t('Result: {name} wins on penalties ({a}-{b}).', { name: who, a: v.pen[0], b: v.pen[1] }) : t('Result: {name} wins {a}-{b}.', { name: who, a: Math.max(v.goals[0], v.goals[1]), b: Math.min(v.goals[0], v.goals[1]) });
  } else if (anyInput) { msg = v.error; bad = true; }
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={t('Enter match result')} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && v.ok) { e.preventDefault(); onSave({ goals: v.goals, pen: v.pen }); } }} style={{ left: 420, top: 120, width: 600, padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontStyle: 'italic', fontWeight: 800 }}>{t('Match result')}</h2>
            <span className="tag" style={{ height: 28 }}>{match.no}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} style={{ width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '1.5px solid ' + NAVY, borderRadius: 22, cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 20px 84px 1fr', alignItems: 'center', gap: 12 }}>
          <span style={{ textAlign: 'right', fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{A}</span>
          <input type="text" inputMode="numeric" aria-label={t('Goals of {name}', { name: A })} value={g[0]} onChange={(e) => setG([clean(e.target.value), g[1]])} style={box} autoFocus />
          <span style={{ textAlign: 'center', color: '#3F5688', fontWeight: 700 }}>–</span>
          <input type="text" inputMode="numeric" aria-label={t('Goals of {name}', { name: B })} value={g[1]} onChange={(e) => setG([g[0], clean(e.target.value)])} style={box} />
          <span style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{B}</span>
        </div>
        {needPen ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 20px 72px 1fr', alignItems: 'center', gap: 12 }}>
            <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' }}>{t('Penalties')}</span>
            <input type="text" inputMode="numeric" aria-label={t('Penalties of {name}', { name: A })} value={p[0]} onChange={(e) => setP([clean(e.target.value), p[1]])} style={small} />
            <span style={{ textAlign: 'center', color: '#3F5688', fontWeight: 700 }}>–</span>
            <input type="text" inputMode="numeric" aria-label={t('Penalties of {name}', { name: B })} value={p[1]} onChange={(e) => setP([p[0], clean(e.target.value)])} style={small} />
            <span />
          </div>
        ) : null}
        <div style={{ minHeight: 40, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', background: bad ? '#FFF4F2' : '#F4F8FE', border: '1px solid ' + (bad ? '#F3C2BC' : '#CBDCF7'), borderRadius: 14, fontSize: 14, fontWeight: 600, color: bad ? '#B42318' : '#2F4A86' }}>{msg}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {match.result ? <button type="button" className="ghost soft" onClick={onClear} style={{ height: 52 }}>{t('Clear result')}</button> : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ghost soft" onClick={onClose} style={{ height: 52 }}>{t('Cancel')}</button>
            <button type="button" className="primary" disabled={!v.ok} onClick={() => onSave({ goals: v.goals, pen: v.pen })} style={{ height: 52, padding: '0 26px' }}>{t('Save result')}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function VolleyballModal({ match, names, defaultBo, onSave, onClear, onClose }) {
  const existing = match.result ? match.result.sets : [];
  const [bo, setBo] = useState(match.result && match.result.bo ? match.result.bo : defaultBo || 5);
  const [rows, setRows] = useState(() => {
    const r = [];
    for (let i = 0; i < 5; i++) r.push(existing[i] ? [String(existing[i][0]), String(existing[i][1])] : ['', '']);
    return r;
  });
  const v = validateSets(rows.slice(0, bo), bo);
  const anyInput = rows.some((r) => r[0] !== '' || r[1] !== '');
  const edit = (i, j, val) => {
    const next = rows.map((r) => r.slice());
    next[i][j] = val.replace(/[^0-9]/g, '').slice(0, 2);
    setRows(next);
  };
  const A = names[match.a];
  const B = names[match.b];
  const inputStyle = { boxSizing: 'border-box', width: 72, height: 48, textAlign: 'center', fontSize: 20, fontWeight: 700, color: NAVY, background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 14 };
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={t('Enter match result')} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && v.ok) { e.preventDefault(); onSave({ sets: v.sets, bo: bo }); } }} style={{ left: 420, top: 70, width: 600, padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontStyle: 'italic', fontWeight: 800 }}>{t('Match result')}</h2>
            <span className="tag" style={{ height: 28 }}>{match.no}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} style={{ width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '1.5px solid ' + NAVY, borderRadius: 22, cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' }}>{t('Match format')}</span>
          <div role="group" aria-label={t('Match format')} style={{ display: 'flex', gap: 6 }}>
            {[[3, t('Bo3')], [5, t('Bo5')]].map(([v, lab]) => (
              <button key={v} type="button" aria-pressed={bo === v} onClick={() => setBo(v)} style={{ minWidth: 64, height: 40, padding: '0 16px', background: bo === v ? NAVY : '#FFFFFF', color: bo === v ? '#FFFFFF' : NAVY, border: '2px solid ' + NAVY, borderRadius: 20, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{lab}</button>
            ))}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#3F5688' }}>{bo === 3 ? t('First to 2 sets') : t('First to 3 sets')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 72px 24px 72px 1fr', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700 }}>
          <span />
          <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{A}</span>
          <span />
          <span />
          <span />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{B}</span>
          {rows.slice(0, bo).map((r, i) => (
            <React.Fragment key={i}>
              <span style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#3F5688' }}>{t('Set {n}', { n: i + 1 })}</span>
              <span />
              <input type="text" inputMode="numeric" aria-label={t('Set {n} points of {name}', { n: i + 1, name: A })} value={r[0]} onChange={(e) => edit(i, 0, e.target.value)} style={inputStyle} autoFocus={i === 0} />
              <span style={{ textAlign: 'center', color: '#3F5688' }}>–</span>
              <input type="text" inputMode="numeric" aria-label={t('Set {n} points of {name}', { n: i + 1, name: B })} value={r[1]} onChange={(e) => edit(i, 1, e.target.value)} style={inputStyle} />
              <span />
            </React.Fragment>
          ))}
        </div>
        <div style={{ minHeight: 40, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', background: v.ok ? '#F4F8FE' : anyInput ? '#FFF4F2' : '#F4F8FE', border: '1px solid ' + (v.ok ? '#CBDCF7' : anyInput ? '#F3C2BC' : '#CBDCF7'), borderRadius: 14, fontSize: 14, fontWeight: 600, color: v.ok ? '#2F4A86' : anyInput ? '#B42318' : '#2F4A86' }}>
          {v.ok ? t('Result: {name} wins {a}-{b} in sets.', { name: v.sa > v.sb ? A : B, a: Math.max(v.sa, v.sb), b: Math.min(v.sa, v.sb) }) : anyInput ? v.error : t('Enter the points of each set. Pick the match format above.')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {match.result ? <button type="button" className="ghost soft" onClick={onClear} style={{ height: 52 }}>{t('Clear result')}</button> : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ghost soft" onClick={onClose} style={{ height: 52 }}>{t('Cancel')}</button>
            <button type="button" className="primary" disabled={!v.ok} onClick={() => onSave({ sets: v.sets, bo: bo })} style={{ height: 52, padding: '0 26px' }}>{t('Save result')}</button>
          </div>
        </div>
      </div>
    </>
  );
}

const COLS = '24px minmax(0, 1fr) 46px 34px 34px 36px 36px 50px 52px';
const COLS_FB = '24px minmax(0, 1fr) 46px 32px 32px 32px 36px 36px 40px 52px';

export function StandingsTables({ tables, names, sport }) {
  const fb = sport === 'football';
  const cols = fb ? COLS_FB : COLS;
  return (
    <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: tables.length === 1 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
      {tables.map((tb, ti) => (
        <div key={ti} style={{ border: '1px solid #CBDCF7', borderRadius: 18, overflow: 'hidden', background: '#FFFFFF', alignSelf: 'start' }}>
          <div style={{ height: 38, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', background: NAVY, color: '#FFFFFF', fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{tb.name}</div>
          <div style={{ height: 34, boxSizing: 'border-box', padding: '0 16px', display: 'grid', gridTemplateColumns: cols, alignItems: 'center', background: '#F4F8FE', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#3F5688' }}>
            {(fb ? ['#', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'] : ['#', 'Team', 'P', 'W', 'L', 'SW', 'SL', '+/−', 'Pts']).map((h, i) => <span key={i} title={i > 1 ? t('colt:' + h) : undefined} style={{ minWidth: 0, whiteSpace: 'nowrap' }}>{t('col:' + h)}</span>)}
          </div>
          {tb.rows.map((r, i) => {
            const d = r.pf - r.pa;
            const rank = (tb.start || 0) + i;
            return (
              <div key={r.t} style={{ height: 40, boxSizing: 'border-box', padding: '0 16px', display: 'grid', gridTemplateColumns: cols, alignItems: 'center', background: tb.highlight(r, rank) ? '#E1ECFC' : '#FFFFFF', borderTop: '1px solid #E0EAF9', fontSize: 14, fontWeight: 600 }}>
                <span style={{ fontWeight: 700 }}>{rank + 1}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 700 }}>{names[r.t]}</span>
                {fb ? <><span>{r.p}</span><span>{r.w}</span><span>{r.d}</span><span>{r.l}</span><span>{r.pf}</span><span>{r.pa}</span></> : <><span>{r.p}</span><span>{r.w}</span><span>{r.l}</span><span>{r.sw}</span><span>{r.sl}</span></>}
                <span>{d > 0 ? '+' + d : d}</span>
                <span style={{ fontWeight: 800 }}>{r.pts}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const standingsNote = (sport) => (sport === 'football' ? t('STANDINGS_NOTE_FOOTBALL') : t('STANDINGS_NOTE'));
