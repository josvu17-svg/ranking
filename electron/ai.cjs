// Gemini helper. Runs in the main process so the API key never reaches the web page.
const fs = require('fs');
const path = require('path');

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const TIMEOUT_MS = 15000; // per model: a silent model is skipped
let lastGood = null;

const SYSTEM_LINES = [
  'You turn a short description of a village sports tournament into settings for a tournament app. Users write in any language, usually Vietnamese or English. ALWAYS write every text field of your answer (name, summary, unsupported) in the OUTPUT LANGUAGE named in the request (English by default), whatever language the user wrote in.',
  'Teams: 2 to 64. Volleyball matches are best of 3 or best of 5 sets. In football, draws are allowed except in knockout games, which go to penalties; there is no Swiss format for football.',
  '',
  'The app has three ready-made formats. Use one of them only when it matches the request exactly:',
  '- "swiss": Swiss stage, volleyball only, exactly 4, 8 or 16 teams. Teams play until they have 2 wins (qualify) or 2 losses (out), then the qualified teams play a knockout.',
  '- "groups": group stage + playoffs. Exactly 2, 4, 8 or 16 groups, everyone plays everyone once in the group, the top 2 of every group go to a knockout. No third-place match.',
  '- "single": plain single elimination for 2 to 64 teams, no third-place match.',
  '',
  'For everything else use format "custom" and describe it with these building blocks (the app builds and runs it):',
  '- stage: "league" = all teams in ONE table, everyone plays everyone (like the Premier League). "groups" = several groups of round robin. "knockout" = single elimination only.',
  '- legs: 1 = every pair plays once, 2 = every pair plays twice (home and away).',
  '- groups: number of groups (any number from 2, only for stage "groups").',
  '- advance: how many teams of each group go to the playoff (only for stage "groups").',
  '- wildcards: extra teams that go on as the best teams of the next place, e.g. the best two third-placed teams (only for stage "groups").',
  '- qualify: how many top teams of the league table go to the playoff (only for stage "league").',
  '- playoff: true if a knockout bracket follows the league or the groups. If the league table alone decides the winner, false.',
  '- third_place: true if the knockout also has a third-place match.',
  '- name: a polished, professional competition title in the OUTPUT LANGUAGE, 2 to 3 words, at most 24 characters, Title Case. It should sound like the name of a real tournament format and hint at its structure, e.g. "Premier League", "Top 4 Championship", "Group Masters", "Grand Finals Cup", "Champions Series". Never use "+" or "&", never a plain description such as "League + Playoff" or "Round robin with top 4", and no quotes.',
  '',
  'Not supported at all: double elimination, Page playoff, aggregate two-leg knockout ties, custom point systems, rest days or dates. Pick the closest supported thing, and say what is missing in "unsupported". Use format "none" only if nothing fits.',
  'Rules for your answer:',
  '- Use 0 (or false) for anything the user did not state. Never invent numbers. Do not change the number of teams.',
  '- A league with no playoff is format "custom", stage "league", playoff false.',
  '- "summary": one or two short English sentences describing what the app will build.',
  '- "unsupported": empty string when everything asked for is supported, otherwise a short English sentence.'
];
const SYSTEM = SYSTEM_LINES.join('\n');
// Vietnamese needs the same rules but an explicit instruction about terminology.
const SYSTEM_VI = SYSTEM + '\nWhen the output language is Vietnamese, write natural, professional Vietnamese used in sports tournaments: "vòng bảng", "loại trực tiếp", "tứ kết", "bán kết", "chung kết", "tranh hạng ba", "vòng Thụy Sĩ", "lượt đi và lượt về", "đội xuất sắc nhất ở hạng ba". The "name" must sound like a real tournament title, at most 3 words and 24 characters, for example "Giải Ngoại Hạng", "Vô Địch Top 4", "Cúp Tinh Hoa", "Đại Chiến Vòng Bảng", "Chung Kết Tổng". Never use "+" or "&", and never a plain description such as "Vòng tròn + Playoff top 4".';

const MSG = {
  en: {
    badKey: () => 'The API key was not accepted. Check it and save it again.',
    refused: (c) => 'The API key was refused (' + c + '). Check that it is valid and allowed to use the Gemini API.',
    quota: () => 'Gemini says the free quota is used up for now. Wait a minute and try again.',
    server: () => 'Gemini is having a problem right now. Try again in a moment.',
    other: (c, m) => 'Gemini returned an error (' + c + ')' + (m ? ': ' + m : '.'),
    offline: (why) => 'No internet connection, or Gemini cannot be reached' + why + '.',
    unreadable: () => 'Gemini answered in a form the app could not read. Try again.',
    silent: (sec, list) => 'Gemini did not answer within ' + sec + ' seconds (' + list + '). The service may be busy. Try again in a minute, or check your internet, VPN or firewall.',
    nomodel: (list) => 'This key cannot use any Gemini Flash model I tried (' + list + '). Create a new key in Google AI Studio and try again.',
    needKey: () => 'Add your Gemini API key first.',
    needText: () => 'Describe your tournament first.'
  },
  vi: {
    badKey: () => 'Khóa API không được chấp nhận. Hãy kiểm tra và lưu lại khóa.',
    refused: (c) => 'Khóa API bị từ chối (' + c + '). Hãy kiểm tra khóa còn hiệu lực và được phép dùng Gemini API.',
    quota: () => 'Gemini báo đã hết hạn mức miễn phí tạm thời. Vui lòng đợi một phút rồi thử lại.',
    server: () => 'Gemini đang gặp sự cố. Vui lòng thử lại sau ít phút.',
    other: (c, m) => 'Gemini trả về lỗi (' + c + ')' + (m ? ': ' + m : '.'),
    offline: (why) => 'Không có kết nối Internet hoặc không thể truy cập Gemini' + why + '.',
    unreadable: () => 'Gemini trả lời ở định dạng ứng dụng không đọc được. Vui lòng thử lại.',
    silent: (sec, list) => 'Gemini không phản hồi trong ' + sec + ' giây (' + list + '). Dịch vụ có thể đang quá tải. Hãy thử lại sau một phút, hoặc kiểm tra Internet, VPN, tường lửa.',
    nomodel: (list) => 'Khóa này không dùng được mô hình Gemini Flash nào đã thử (' + list + '). Hãy tạo khóa mới trong Google AI Studio rồi thử lại.',
    needKey: () => 'Vui lòng thêm khóa Gemini API trước.',
    needText: () => 'Vui lòng mô tả giải đấu trước.'
  }
};
const M = (lang) => MSG[lang === 'vi' ? 'vi' : 'en'];

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    format: { type: 'STRING', enum: ['swiss', 'groups', 'single', 'custom', 'none'] },
    name: { type: 'STRING' },
    teams: { type: 'INTEGER' },
    groups: { type: 'INTEGER' },
    teams_per_group: { type: 'INTEGER' },
    best_of: { type: 'INTEGER' },
    stage: { type: 'STRING', enum: ['league', 'groups', 'knockout', 'none'] },
    legs: { type: 'INTEGER' },
    advance: { type: 'INTEGER' },
    wildcards: { type: 'INTEGER' },
    qualify: { type: 'INTEGER' },
    playoff: { type: 'BOOLEAN' },
    third_place: { type: 'BOOLEAN' },
    summary: { type: 'STRING' },
    unsupported: { type: 'STRING' }
  },
  required: ['format', 'name', 'teams', 'groups', 'teams_per_group', 'best_of', 'stage', 'legs', 'advance', 'wildcards', 'qualify', 'playoff', 'third_place', 'summary', 'unsupported']
};

function friendly(status, body, lang) {
  const m = M(lang);
  const msg = body && body.error && body.error.message ? body.error.message : '';
  if (status === 400 && /api key/i.test(msg)) return m.badKey();
  if (status === 401 || status === 403) return m.refused(status);
  if (status === 429) return m.quota();
  if (status >= 500) return m.server();
  return m.other(status, msg);
}

// Asks Google which models this key can call, and picks the newest "flash" ones.
async function listModels(key, doFetch, limitMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.min(15000, limitMs || 15000));
  try {
    const res = await doFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: ctl.signal });
    const body = await res.json();
    const list = (body.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !/tts|image|live|audio|embed|robotics|computer|thinking|native/.test(n));
    const ver = (n) => { const m = n.match(/^gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const score = (n) => ver(n) * 10 + (/preview|exp/.test(n) ? 0 : 5) - (/lite/.test(n) ? 3 : 0) - (/latest/.test(n) ? 1 : 0);
    list.sort((x, y) => score(y) - score(x));
    return list.slice(0, 6);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(key, text, ctx, fetchImpl, timeoutMs, retried) {
  const doFetch = fetchImpl || fetch;
  const limit = timeoutMs || TIMEOUT_MS;
  const lang = ctx && ctx.lang === 'Vietnamese' ? 'vi' : 'en';
  const prompt = 'OUTPUT LANGUAGE: ' + (lang === 'vi' ? 'Vietnamese' : 'English') + '\nSport: ' + (ctx && ctx.sport === 'football' ? 'football' : 'volleyball') + '\nTeams currently entered in the app: ' + ((ctx && ctx.teams) || 0) + '\n\nDescription:\n' + String(text).slice(0, 2000);
  // A model that worked before is used directly (no model-list round trip). Only when it fails
  // do we list the models this key can use and try those.
  const hint = (ctx && ctx.model) || lastGood;
  let models;
  if (hint && !retried) {
    models = [hint];
  } else {
    models = await listModels(key, doFetch, limit);
    if (!models.length) models = MODELS;
  }
  const tried = [];
  const silent = [];
  for (const model of models) {
    tried.push(model);
    let res;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), limit);
    const send = (thinkingOff) => doFetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: lang === 'vi' ? SYSTEM_VI : SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Thinking is switched off: the answer is a small structured form and thinking only adds seconds.
        generationConfig: Object.assign({ responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.1 }, thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      })
    });
    try {
      res = await send(true);
      if (res.status === 400) res = await send(false); // this model does not accept the thinking setting
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') { silent.push(model); continue; }
      const why = e && (e.cause && e.cause.code ? e.cause.code : e.message) ? ' (' + String(e.cause && e.cause.code ? e.cause.code : e.message).slice(0, 80) + ')' : '';
      return { ok: false, error: M(lang).offline(why) };
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    clearTimeout(timer);
    if (res.status === 404) continue; // this key cannot use that model: try the next one
    if (!res.ok) return { ok: false, error: friendly(res.status, body, lang) };
    try {
      const out = body.candidates[0].content.parts.map((p) => p.text || '').join('');
      lastGood = model;
      return { ok: true, spec: JSON.parse(out), model: model };
    } catch (e) {
      return { ok: false, error: M(lang).unreadable() };
    }
  }
  if (hint && !retried) { lastGood = null; return callGemini(key, text, Object.assign({}, ctx, { model: null }), fetchImpl, timeoutMs, true); }
  if (silent.length) return { ok: false, error: M(lang).silent(Math.round(limit / 1000), silent.join(', ')) };
  return { ok: false, error: M(lang).nomodel(tried.join(', ')) };
}

function register(ipcMain, app, safeStorage, net) {
  const file = () => path.join(app.getPath('userData'), 'ai-key.bin');
  const readKey = () => {
    try {
      const raw = fs.readFileSync(file());
      if (raw.slice(0, 6).toString() === 'plain:') return Buffer.from(raw.slice(6).toString(), 'base64').toString('utf8');
      return safeStorage.decryptString(raw);
    } catch (e) { return null; }
  };
  ipcMain.handle('ai:status', () => ({ hasKey: !!readKey() }));
  ipcMain.handle('ai:setKey', (e, key) => {
    const k = String(key || '').trim();
    if (!k) return { ok: false };
    try {
      fs.mkdirSync(path.dirname(file()), { recursive: true });
      if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(file(), safeStorage.encryptString(k));
      else fs.writeFileSync(file(), 'plain:' + Buffer.from(k, 'utf8').toString('base64'));
      return { ok: true };
    } catch (err) { return { ok: false }; }
  });
  ipcMain.handle('ai:clearKey', () => { try { fs.unlinkSync(file()); } catch (e) { /* ignore */ } return { ok: true }; });
  ipcMain.handle('ai:describe', async (e, p) => {
    const key = readKey();
    const lg = p && p.lang === 'Vietnamese' ? 'vi' : 'en';
    if (!key) return { ok: false, error: M(lg).needKey() };
    if (!p || !String(p.text || '').trim()) return { ok: false, error: M(lg).needText() };
    // net.fetch uses the same network stack as Chrome (system proxy, VPN, antivirus certificates).
    return callGemini(key, p.text, { sport: p.sport, teams: p.teams, lang: p.lang }, net ? net.fetch.bind(net) : undefined);
  });
}

module.exports = { resetCache: () => { lastGood = null; }, callGemini, register, SYSTEM, SCHEMA, MODELS };
