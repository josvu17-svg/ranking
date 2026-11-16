// Backup file: everything the app keeps on this device (teams, formats, tournament, schedule) as one small JSON file.
// The Gemini key is NOT part of it.
export function makeBackup(data) {
  const day = new Date().toISOString().slice(0, 10);
  return { text: JSON.stringify({ app: 'ranking', v: 1, saved: new Date().toISOString(), data: data }, null, 1), name: 'ranking-backup-' + day + '.json' };
}

// Returns the saved data, or null when the text is not a Ranking backup.
export function parseBackup(text) {
  try {
    const o = JSON.parse(text);
    if (o && o.app === 'ranking' && o.v === 1 && o.data && typeof o.data === 'object' && !Array.isArray(o.data)) return o.data;
  } catch (e) { /* not JSON */ }
  return null;
}
