import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bracket, StandingsTables, SportPill, standingsNote, NAVY } from './ui.jsx';
import { resultOutcome } from './engine.js';
import { t, getLang } from './i18n.js';

// ---------- helpers ----------

// Every match of the tournament in bracket order, with the name of the round or group it belongs to.
export function listMatches(columns) {
  const out = [];
  columns.forEach((c) => c.groups.forEach((g) => g.matches.forEach((m) => out.push({ m: m, section: g.label || '' }))));
  return out;
}

const pad = (n) => (n < 10 ? '0' : '') + n;
export const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

export function fmtDate(iso) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!p) return iso || '';
  const d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
  const vi = getLang() === 'vi';
  const wd = d.toLocaleDateString(vi ? 'vi-VN' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
  return wd.charAt(0).toUpperCase() + wd.slice(1) + ', ' + p[3] + '/' + p[2] + '/' + p[1];
}

// Fill dates and times one match after the other.
export function autoFill(list, startDate, startTime, gap, perDay) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const q = /^(\d{1,2}):(\d{2})$/.exec(startTime);
  if (!p || !q) return null;
  const base = Date.UTC(+p[1], +p[2] - 1, +p[3], +q[1], +q[2]);
  const step = Math.max(1, gap) * 60000;
  const out = {};
  list.forEach((x, i) => {
    const ms = perDay > 0 ? base + Math.floor(i / perDay) * 86400000 + (i % perDay) * step : base + i * step;
    const d = new Date(ms);
    out[x.m.key] = { d: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), h: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) };
  });
  return out;
}

const nameOf = (names, team, label) => (team == null ? label : names[team]);

// ---------- sheets (what ends up in the picture) ----------

function SheetFrame({ title, sub, sport, width, compact, children }) {
  return (
    <div style={{ display: 'inline-block', minWidth: width || 0, boxSizing: 'border-box', padding: '28px 32px 30px', background: '#FFFFFF', color: NAVY, fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 10 : 14, marginBottom: compact ? 14 : 20 }}>
        <h1 style={{ margin: 0, fontSize: compact ? 28 : 38, lineHeight: compact ? '36px' : '46px', fontStyle: 'italic', fontWeight: 800, letterSpacing: -0.5 }}>{title}</h1>
        {sub ? <span style={{ height: 36, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', border: '1.5px solid ' + NAVY, borderRadius: 18, fontSize: 15, fontWeight: 700 }}>{sub}</span> : null}
        <SportPill sport={sport} />
      </div>
      {children}
    </div>
  );
}

// Rounds / groups in bracket order, with the date they share (if any).
export function sections(list) {
  const out = [];
  list.forEach((x) => {
    const last = out[out.length - 1];
    if (last && last.label === x.section) last.items.push(x);
    else out.push({ label: x.section, items: [x] });
  });
  return out;
}
const datesOf = (items, schedule) => {
  const seen = [];
  items.forEach((x) => { const d = (schedule[x.m.key] || {}).d || ''; if (seen.indexOf(d) === -1) seen.push(d); });
  return seen;
};
const shortDate = (iso) => { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return p ? p[3] + '/' + p[2] : ''; };

function ScheduleSheet({ list, names, schedule, sport, title, sub, print }) {
  const sc = (x) => schedule[x.m.key] || {};
  const cell = { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
  return (
    <SheetFrame title={t('Match schedule')} sub={sub || title} sport={sport} width={print ? 700 : 940} compact={print}>
      {sections(list).map((g, gi) => {
        const ds = datesOf(g.items, schedule);
        const one = ds.length === 1 && ds[0] ? ds[0] : '';
        const mixed = ds.filter((d) => d).length > 0 && !one;
        return (
          <div key={gi} style={{ marginTop: gi ? 16 : 0, border: '1px solid #CBDCF7', borderRadius: 14, overflow: 'hidden', background: '#FFFFFF', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <div style={{ height: 40, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: NAVY, color: '#FFFFFF', fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              <span>{g.label}</span>
              {one ? <span style={{ height: 26, boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', background: '#FFFFFF', color: NAVY, borderRadius: 13, fontSize: 12, letterSpacing: 0.3 }}>{fmtDate(one)}</span> : null}
            </div>
            {g.items.map((x, i) => {
              const m = x.m;
              const r = m.result;
              const s = r ? resultOutcome(r) : null;
              const A = nameOf(names, m.a, m.labelA);
              const B = nameOf(names, m.b, m.labelB);
              const win = s ? s.win : null;
              const h = sc(x).h;
              return (
                <div key={m.key} style={{ height: 46, boxSizing: 'border-box', padding: '0 16px', display: 'grid', gridTemplateColumns: '50px minmax(0, 1fr) 76px minmax(0, 1fr) 96px', alignItems: 'center', gap: 8, borderTop: i ? '1px solid #E0EAF9' : 'none', background: i % 2 ? '#F7FAFF' : '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3F5688' }}>{m.no}</span>
                  <span style={Object.assign({ textAlign: 'right', fontWeight: win === 'a' ? 800 : 600, fontStyle: m.a == null ? 'italic' : 'normal' }, cell)}>{A}</span>
                  <span style={{ textAlign: 'center', lineHeight: '15px' }}>
                    {h ? <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>{h}</span> : <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#3F5688' }}>{t('vs')}</span>}
                    {mixed && sc(x).d ? <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#3F5688' }}>{shortDate(sc(x).d)}</span> : null}
                  </span>
                  <span style={Object.assign({ fontWeight: win === 'b' ? 800 : 600, fontStyle: m.b == null ? 'italic' : 'normal' }, cell)}>{B}</span>
                  <span style={{ textAlign: 'right', fontWeight: 800 }}>{s ? s.sa + ' – ' + s.sb + (r.pen ? ' (' + r.pen[0] + '–' + r.pen[1] + ')' : '') : ''}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </SheetFrame>
  );
}

// kind: 'bracket' | 'standings' | 'schedule'
function Sheet({ kind, b, names, sport, title, schedule, bracketProps, print }) {
  if (kind === 'schedule') return <ScheduleSheet list={listMatches(b.columns)} names={names} schedule={schedule || {}} sport={sport} title={title} print={print} />;
  if (kind === 'standings') {
    const one = b.tables.length === 1;
    return (
      <SheetFrame title={t('Standings')} sub={title} sport={sport} width={one ? 760 : 1200}>
        <div style={{ width: one ? 700 : 1136 }}>
          <StandingsTables tables={b.tables} names={names} sport={sport} />
          <div style={{ marginTop: 14, fontSize: 12, lineHeight: '18px', fontWeight: 500, color: '#3F5688' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{b.tableNote}</div>
            <div>{standingsNote(sport)}</div>
          </div>
        </div>
      </SheetFrame>
    );
  }
  const champ = b.champion !== null && b.champion !== undefined ? names[b.champion] : null;
  return (
    <SheetFrame title={t('Bracket')} sub={title} sport={sport}>
      <Bracket columns={b.columns} names={names} natural justify={bracketProps.justify} colGap={bracketProps.colGap} />
      {champ ? <div style={{ marginTop: 18, display: 'inline-flex', height: 40, alignItems: 'center', padding: '0 20px', background: NAVY, color: '#FFFFFF', borderRadius: 20, fontSize: 16, fontWeight: 700 }}>{t('Champion: {name}', { name: champ })}</div> : null}
    </SheetFrame>
  );
}

// Draws the sheet out of sight, takes the picture, then hands over the PNG.
export function ExportRunner(props) {
  const ref = useRef(null);
  const { onDone, onFail } = props;
  useEffect(() => {
    let dead = false;
    const timer = setTimeout(async () => {
      try {
        const mod = await import('./exporter.js');
        const url = await mod.renderPng(ref.current);
        if (!dead) onDone(url);
      } catch (e) {
        if (!dead) onFail(e);
      }
    }, 450);
    return () => { dead = true; clearTimeout(timer); };
  }, []);
  return createPortal(
    <div aria-hidden="true" style={{ position: 'fixed', left: -40000, top: 0, width: 6000 }}>
      <div ref={ref} style={{ display: 'inline-block' }}><Sheet {...props} /></div>
    </div>,
    document.body
  );
}

// Prints the sheet on A4: wide sheets are shrunk to one landscape page, the schedule runs over portrait pages.
export function PrintRunner(props) {
  const { kind, onDone } = props;
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  const [size, setSize] = useState(null);
  const landscape = kind !== 'schedule';
  useEffect(() => {
    let dead = false;
    const after = () => { if (!dead) onDone(); };
    window.addEventListener('afterprint', after);
    const t1 = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const s = landscape && w > 0 && h > 0 ? Math.min(1, 1040 / w, 700 / h) : 1;
      setScale(s);
      setSize({ w: w * s, h: h * s });
      setTimeout(() => { if (!dead) window.print(); }, 250);
    }, 450);
    const t2 = setTimeout(after, 180000);
    return () => { dead = true; clearTimeout(t1); clearTimeout(t2); window.removeEventListener('afterprint', after); };
  }, []);
  return createPortal(
    <div id="print-root">
      <style>{'@media print { @page { size: A4 ' + (landscape ? 'landscape' : 'portrait') + '; margin: 10mm; } }'}</style>
      <div style={landscape && size ? { width: size.w, height: size.h, overflow: 'hidden' } : undefined}>
        <div ref={ref} style={{ display: 'inline-block', transform: 'scale(' + scale + ')', transformOrigin: 'top left' }}><Sheet {...props} print /></div>
      </div>
    </div>,
    document.body
  );
}

// ---------- dialogs ----------

const closeBtn = (onClose) => (
  <button type="button" onClick={onClose} aria-label={t('Close')} style={{ width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: '1.5px solid ' + NAVY, borderRadius: 22, cursor: 'pointer' }}>
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
  </button>
);

export function ImagePreview({ url, name, onSave, onClose }) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={t('Save image')} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }} style={{ left: 170, top: 50, width: 1100, height: 710, padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontStyle: 'italic', fontWeight: 800 }}>{t('Save image')}</h2>
          {closeBtn(onClose)}
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 16, padding: 12 }}>
          <img src={url} alt={name} style={{ margin: 'auto', maxWidth: '100%', height: 'auto', display: 'block', boxShadow: '0 4px 18px rgba(15,47,140,0.18)' }} />
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#3F5688' }}>{t('On a phone you can also press and hold the image.')}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ghost soft" onClick={onClose} style={{ height: 52 }}>{t('Close')}</button>
            <button type="button" className="primary" onClick={onSave} style={{ height: 52, padding: '0 26px' }} autoFocus>{t('Save image')}</button>
          </div>
        </div>
      </div>
    </>
  );
}


const inp = { boxSizing: 'border-box', height: 40, padding: '0 10px', background: '#FFFFFF', border: '1.5px solid #BFD3F5', borderRadius: 12, fontSize: 14, fontWeight: 700, color: NAVY, minWidth: 0 };
const lab = { fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#3F5688' };

export function ScheduleModal({ list, names, schedule, onChange, onSaveImage, onPrint, onClose }) {
  const [start, setStart] = useState(todayIso());
  const [first, setFirst] = useState('08:00');
  const [gap, setGap] = useState('45');
  const [per, setPer] = useState('');
  const any = Object.keys(schedule).some((k) => schedule[k] && (schedule[k].d || schedule[k].h));
  const setMany = (keys, patch) => {
    const next = Object.assign({}, schedule);
    keys.forEach((key) => {
      const cur = Object.assign({}, next[key], patch);
      if (!cur.d && !cur.h) delete next[key]; else next[key] = cur;
    });
    onChange(next);
  };
  const fill = () => {
    if (any && !window.confirm(t('Overwrite the dates and times already entered?'))) return;
    const res = autoFill(list, start, first, parseInt(gap, 10) || 45, parseInt(per, 10) || 0);
    if (res) onChange(res);
  };
  const clearAll = () => { if (window.confirm(t('Clear all dates and times?'))) onChange({}); };
  const secs = sections(list);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={t('Match schedule')} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }} style={{ left: 110, top: 36, width: 1220, height: 738, padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontStyle: 'italic', fontWeight: 800 }}>{t('Match schedule')}</h2>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3F5688', marginTop: 2 }}>{t('Pick one date for each round, then the time of each match. Or fill everything in automatically.')}</div>
          </div>
          {closeBtn(onClose)}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 12, padding: '12px 16px', background: '#F4F8FE', border: '1px solid #CBDCF7', borderRadius: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lab}>{t('Start date')}</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={Object.assign({ width: 170 }, inp)} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lab}>{t('First match at')}</span><input type="time" value={first} onChange={(e) => setFirst(e.target.value)} style={Object.assign({ width: 140 }, inp)} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lab}>{t('Minutes per match')}</span><input type="text" inputMode="numeric" value={gap} onChange={(e) => setGap(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} style={Object.assign({ width: 130 }, inp)} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={lab}>{t('Matches per day')}</span><input type="text" inputMode="numeric" placeholder={t('No limit')} value={per} onChange={(e) => setPer(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} style={Object.assign({ width: 150 }, inp)} /></label>
          <button type="button" className="primary" onClick={fill} style={{ height: 40, padding: '0 20px', borderRadius: 20, fontSize: 14 }}>{t('Fill in all')}</button>
          <span style={{ flex: 1 }} />
          {any ? <button type="button" className="ghost soft" onClick={clearAll} style={{ height: 40 }}>{t('Clear all')}</button> : null}
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #CBDCF7', borderRadius: 16 }}>
          {secs.map((g, gi) => {
            const keys = g.items.map((x) => x.m.key);
            const ds = datesOf(g.items, schedule);
            const one = ds.length === 1 ? ds[0] : '';
            const mixed = ds.length > 1;
            const cols = '56px minmax(0, 1fr) 150px 170px 40px';
            return (
              <div key={gi}>
                <div style={{ height: 52, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: NAVY, color: '#FFFFFF', borderTop: gi ? '1px solid #FFFFFF' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{g.label}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <span>{mixed ? t('Several days') : t('Date for this round')}</span>
                    <input type="date" aria-label={t('Date for this round')} value={one || ''} onChange={(e) => setMany(keys, { d: e.target.value })} style={Object.assign({}, inp, { width: 170, height: 34, border: 0 })} />
                  </label>
                </div>
                {g.items.map((x, i) => {
                  const m = x.m;
                  const s = schedule[m.key] || {};
                  const A = nameOf(names, m.a, m.labelA);
                  const B = nameOf(names, m.b, m.labelB);
                  return (
                    <div key={m.key} style={{ minHeight: 54, boxSizing: 'border-box', padding: '7px 16px', display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', borderTop: '1px solid #E0EAF9', background: i % 2 ? '#F7FAFF' : '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
                      <span className="tag" style={{ height: 26, justifySelf: 'start', padding: '0 10px', fontSize: 12 }}>{m.no}</span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }} title={A + ' ' + t('vs') + ' ' + B}>
                        <span style={{ fontStyle: m.a == null ? 'italic' : 'normal', fontWeight: m.a == null ? 500 : 700 }}>{A}</span>
                        <span style={{ margin: '0 8px', fontSize: 11, color: '#3F5688' }}>{t('vs')}</span>
                        <span style={{ fontStyle: m.b == null ? 'italic' : 'normal', fontWeight: m.b == null ? 500 : 700 }}>{B}</span>
                      </span>
                      <input type="time" aria-label={t('Time')} value={s.h || ''} onChange={(e) => setMany([m.key], { h: e.target.value })} style={inp} />
                      {mixed ? <input type="date" aria-label={t('Date')} value={s.d || ''} onChange={(e) => setMany([m.key], { d: e.target.value })} style={inp} /> : <span />}
                      <button type="button" aria-label={t('Clear date and time')} title={t('Clear date and time')} disabled={!s.h} onClick={() => setMany([m.key], { h: '' })} style={{ width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, borderRadius: 17, cursor: s.h ? 'pointer' : 'default', opacity: s.h ? 1 : 0.25 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke={NAVY} strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="ghost" onClick={onSaveImage} style={{ height: 52 }}>{t('Save image')}</button>
          <button type="button" className="ghost" onClick={onPrint} style={{ height: 52 }}>{t('Print')}</button>
          <button type="button" className="primary" onClick={onClose} style={{ height: 52, padding: '0 28px' }}>{t('Done')}</button>
        </div>
      </div>
    </>
  );
}
