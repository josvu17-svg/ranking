// In the Windows app the AI runs in the main process (window.ranking). In a browser (phone) there is no
// such bridge, so this one calls Gemini straight from the page. The key stays in this device's storage.
import ai from '../electron/ai.cjs';

const KEY = 'ranking.geminiKey';
const MODEL_KEY = 'ranking.geminiModel';
const read = () => { try { return window.localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };

export function installWebBridge() {
  if (typeof window === 'undefined' || window.ranking) return;
  const M = (lang, k) => (lang === 'Vietnamese'
    ? { key: 'Vui lòng thêm khóa Gemini API trước.', text: 'Vui lòng mô tả giải đấu trước.' }
    : { key: 'Add your Gemini API key first.', text: 'Describe your tournament first.' })[k];
  window.ranking = {
    ai: {
      status: async () => ({ hasKey: !!read() }),
      setKey: async (k) => {
        const v = String(k || '').trim();
        if (v.length < 10) return { ok: false };
        try { window.localStorage.setItem(KEY, v); } catch (e) { return { ok: false }; }
        try { window.localStorage.removeItem(MODEL_KEY); } catch (e) { /* ignore */ }
        ai.resetCache();
        return { ok: true };
      },
      clearKey: async () => { try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } return { ok: true }; },
      describe: async (p) => {
        const key = read();
        if (!key) return { ok: false, error: M(p && p.lang, 'key') };
        if (!p || !String(p.text || '').trim()) return { ok: false, error: M(p && p.lang, 'text') };
        let model = null;
        try { model = window.localStorage.getItem(MODEL_KEY); } catch (e) { /* ignore */ }
        const r = await ai.callGemini(key, p.text, { sport: p.sport, teams: p.teams, lang: p.lang, model: model });
        try { if (r.ok && r.model) window.localStorage.setItem(MODEL_KEY, r.model); } catch (e) { /* ignore */ }
        return r;
      }
    }
  };
}
