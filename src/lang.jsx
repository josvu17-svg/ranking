import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getLang, setLang as storeLang, syncLang, LANG_KEY } from './i18n.js';

const Ctx = createContext({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setL] = useState(getLang());
  const setLang = useCallback((l) => { storeLang(l); setL(getLang()); }, []);
  useEffect(() => {
    // Another window (main window <-> standings screen) changed the language.
    const follow = () => { if (syncLang()) setL(getLang()); };
    const onStorage = (e) => { if (e.key === LANG_KEY || e.key === null) follow(); };
    window.addEventListener('storage', onStorage);
    const timer = setInterval(follow, 1500);
    try { document.documentElement.lang = getLang(); } catch (e) { /* ignore */ }
    return () => { window.removeEventListener('storage', onStorage); clearInterval(timer); };
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

// Components call this so they re-render when the language changes.
export const useLang = () => useContext(Ctx);

export function LangSwitch({ style }) {
  const { lang, setLang } = useLang();
  const opt = (id, short, full) => (
    <button key={id} type="button" aria-pressed={lang === id} title={full} aria-label={full} onClick={() => setLang(id)} style={{ minWidth: 48, height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: lang === id ? '#0F2F8C' : 'transparent', color: lang === id ? '#FFFFFF' : '#0F2F8C', border: 0, borderRadius: 16, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>{short}</button>
  );
  return (
    <div role="group" aria-label="Language / Ngôn ngữ" style={Object.assign({ height: 40, boxSizing: 'border-box', padding: '0 4px 0 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.95)', border: '1.5px solid #0F2F8C', borderRadius: 20, boxShadow: '0 6px 18px rgba(15,47,140,0.18)' }, style)}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}><circle cx="12" cy="12" r="9" stroke="#0F2F8C" strokeWidth="2" fill="none" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" stroke="#0F2F8C" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
      {opt('en', 'EN', 'English')}
      {opt('vi', 'VI', 'Tiếng Việt')}
    </div>
  );
}
