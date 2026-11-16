// Turns a piece of the page into a PNG. Loaded only when someone saves an image.
// The fonts are put into the picture as data so it looks the same on every device, offline too.
import { toPng } from 'html-to-image';
import l500 from '@fontsource/montserrat/files/montserrat-latin-500-normal.woff2?inline';
import l600 from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff2?inline';
import l700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?inline';
import l800 from '@fontsource/montserrat/files/montserrat-latin-800-italic.woff2?inline';
import x500 from '@fontsource/montserrat/files/montserrat-latin-ext-500-normal.woff2?inline';
import x600 from '@fontsource/montserrat/files/montserrat-latin-ext-600-normal.woff2?inline';
import x700 from '@fontsource/montserrat/files/montserrat-latin-ext-700-normal.woff2?inline';
import x800 from '@fontsource/montserrat/files/montserrat-latin-ext-800-italic.woff2?inline';
import v500 from '@fontsource/montserrat/files/montserrat-vietnamese-500-normal.woff2?inline';
import v600 from '@fontsource/montserrat/files/montserrat-vietnamese-600-normal.woff2?inline';
import v700 from '@fontsource/montserrat/files/montserrat-vietnamese-700-normal.woff2?inline';
import v800 from '@fontsource/montserrat/files/montserrat-vietnamese-800-italic.woff2?inline';

const RANGE = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  ext: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  vi: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'
};
const FACES = [
  ['latin', 500, 'normal', l500], ['latin', 600, 'normal', l600], ['latin', 700, 'normal', l700], ['latin', 800, 'italic', l800],
  ['ext', 500, 'normal', x500], ['ext', 600, 'normal', x600], ['ext', 700, 'normal', x700], ['ext', 800, 'italic', x800],
  ['vi', 500, 'normal', v500], ['vi', 600, 'normal', v600], ['vi', 700, 'normal', v700], ['vi', 800, 'italic', v800]
];
const FONT_CSS = FACES.map((f) => "@font-face{font-family:'Montserrat';font-style:" + f[2] + ';font-weight:' + f[1] + ';src:url(' + f[3] + ") format('woff2');unicode-range:" + RANGE[f[0]] + ';}').join('\n');

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
// Safari draws the first picture without its fonts and images, so it gets one practice run.
const needsWarmup = /Safari|iPhone|iPad/.test(ua) && (!/Chrome\//.test(ua) || /CriOS|FxiOS/.test(ua)) && !/Electron/.test(ua);

export async function renderPng(node) {
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const opts = { pixelRatio: Math.max(1, Math.min(2, 8000 / Math.max(w, h))), backgroundColor: '#FFFFFF', fontEmbedCSS: FONT_CSS, cacheBust: false, width: w, height: h };
  if (needsWarmup) { try { await toPng(node, opts); } catch (e) { /* ignore */ } }
  return toPng(node, opts);
}

export async function saveImage(url, name) {
  const blob = await (await fetch(url)).blob();
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && typeof File === 'function') {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
