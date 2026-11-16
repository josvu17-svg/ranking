// Tiny translation layer. The English text is the key; a language adds a dictionary entry
// for it. Placeholders look like {n} and are replaced in a single pass.
import { VI } from './vi.js';
import { EN } from './en.js';

export const LANG_KEY = 'ranking.lang';
const DICT = { en: EN, vi: VI };

function readStored() {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null;
    if (v === 'vi' || v === 'en') return v;
  } catch (e) { /* ignore */ }
  return 'en';
}

let current = readStored();

export const getLang = () => current;

export function setLang(l) {
  current = l === 'vi' ? 'vi' : 'en';
  try { window.localStorage.setItem(LANG_KEY, current); } catch (e) { /* ignore */ }
  try { document.documentElement.lang = current; } catch (e) { /* ignore */ }
}

// Re-read the saved choice (the standings window follows the main window).
export function syncLang() {
  const s = readStored();
  const changed = s !== current;
  current = s;
  try { document.documentElement.lang = current; } catch (e) { /* ignore */ }
  return changed;
}

export function t(key, params) {
  const d = DICT[current];
  let s = d && d[key] !== undefined ? d[key] : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}

// Language of the AI answer, used in the request sent to the main process.
export const aiLanguage = () => (current === 'vi' ? 'Vietnamese' : 'English');
