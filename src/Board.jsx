import React, { useEffect, useMemo, useState } from 'react';
import { Stage, Bracket, StandingsTables, SportPill, standingsNote, NAVY } from './ui.jsx';
import { KEY, load, buildAll, shownNames } from './App.jsx';
import { t as tr } from './i18n.js';
import { LangSwitch, useLang } from './lang.jsx';

// Read-only live screen for a projector or a second monitor.
export default function Board() {
  const { lang } = useLang();
  const [data, setData] = useState(load);
  useEffect(() => {
    let last = window.localStorage.getItem(KEY);
    const refresh = () => {
      const now = window.localStorage.getItem(KEY);
      if (now !== last) { last = now; setData(load()); }
    };
    const onStorage = (e) => { if (e.key === KEY || e.key === null) refresh(); };
    window.addEventListener('storage', onStorage);
    const timer = setInterval(refresh, 1500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(timer); };
  }, []);
  useEffect(() => { document.title = 'Ranking – ' + tr('Standings'); }, [lang]);
  const t = data.tournament;
  const b = useMemo(() => (t ? buildAll(t) : null), [t, lang]);
  const title = !t ? '' : t.format === 'swiss' ? tr('Swiss stage') : t.format === 'groups' ? tr('Group stage + Playoffs') : t.format === 'plan' ? (t.planName || tr('Custom format')) : tr('Single elimination');
  const tnames = t ? shownNames(t) : [];
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };

  let tables = b && b.tables ? b.tables : null;
  if (tables && tables.length === 1 && tables[0].rows.length > 8) {
    const t0 = tables[0];
    const half = Math.ceil(t0.rows.length / 2);
    tables = [
      Object.assign({}, t0, { rows: t0.rows.slice(0, half), start: 0 }),
      Object.assign({}, t0, { name: tr('{name} (continued)', { name: t0.name }), rows: t0.rows.slice(half), start: half })
    ];
  }
  let zoom = 1;
  if (tables) {
    const maxRows = Math.max.apply(null, tables.map((x) => x.rows.length));
    const height = Math.ceil(tables.length / (tables.length === 1 ? 1 : 2)) * (72 + 40 * maxRows) + 18 * Math.max(0, Math.ceil(tables.length / 2) - 1);
    zoom = Math.max(1, Math.min(tables.length === 1 ? 1.4 : t.sport === 'football' ? 1.2 : 1.25, 540 / height));
  }
  const champion = b && b.champion !== null && b.champion !== undefined ? tnames[b.champion] : null;

  return (
    <Stage noSwitch>
      <div style={{ position: 'absolute', left: 64, top: 36, right: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ margin: 0, padding: '0 22px 0 18px', background: 'rgba(255,255,255,0.92)', borderRadius: 18, boxShadow: '0 8px 22px rgba(15,47,140,0.16)', fontSize: 48, lineHeight: '56px', fontStyle: 'italic', fontWeight: 800, letterSpacing: -1, color: NAVY }}>{b && b.tables ? tr('Standings') : tr('Bracket')}</h1>
          {t ? <span style={{ height: 40, boxSizing: 'border-box', padding: '0 18px', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.95)', border: '1.5px solid ' + NAVY, borderRadius: 20, fontSize: 17, fontWeight: 700 }}>{title}</span> : null}
          {champion ? <span style={{ height: 40, boxSizing: 'border-box', padding: '0 18px', display: 'flex', alignItems: 'center', background: NAVY, color: '#FFFFFF', borderRadius: 20, fontSize: 17, fontWeight: 700 }}>{tr('Champion: {name}', { name: champion })}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SportPill sport={t && t.sport} />
          <button type="button" className="chipbtn" style={{ paddingLeft: 18 }} onClick={fullscreen}>{tr('Full screen')}</button>
          <LangSwitch style={{ height: 44, borderRadius: 22 }} />
        </div>
      </div>
      <div className="panel" style={{ left: 64, top: 112, width: 1312, height: 658, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        {!t ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, color: '#2F4A86' }}>{tr('No tournament yet. Start one in the main window and it will show up here.')}</div>
        ) : tables ? (
          <>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ margin: 'auto 0', zoom: zoom }}>
                <StandingsTables tables={tables} names={tnames} sport={t.sport} />
              </div>
            </div>
            <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', gap: 20, fontSize: 13, lineHeight: '19px', fontWeight: 500, color: '#3F5688' }}>
              <span>{standingsNote(t.sport)}</span>
              <span style={{ flex: 'none', fontWeight: 700 }}>{b.tableNote}</span>
            </div>
          </>
        ) : (
          <Bracket columns={b.columns} names={tnames} justify="center" colGap={120} />
        )}
      </div>
    </Stage>
  );
}
