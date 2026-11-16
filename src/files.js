// Saving and opening files, in the Windows app and in a phone browser.
export async function saveBlob(blob, name) {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare && typeof File === 'function') {
    const file = new File([blob], name, { type: blob.type });
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

// Opens the file picker and hands the file's text to done.
export function pickText(accept, done) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.style.display = 'none';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    inp.remove();
    if (!f) return;
    const r = new FileReader();
    r.onload = () => done(String(r.result || ''));
    r.onerror = () => done('');
    r.readAsText(f);
  };
  document.body.appendChild(inp);
  inp.click();
}
