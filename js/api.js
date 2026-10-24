'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const fmtT = ms => { if (!ms) return '-'; const d = new Date(Number(ms)); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
const fmtD = ms => { if (!ms) return '-'; const d = new Date(Number(ms)); return d.toLocaleDateString('id-ID') + ' ' + fmtT(ms); };
const fmtDur = s => { s = Math.max(0, s | 0); const h = (s / 3600) | 0; return (h ? pad(h) + ':' : '') + pad(((s % 3600) / 60) | 0) + ':' + pad(s % 60); };

const Sess = {
  get() { try { return JSON.parse(sessionStorage.getItem('exama') || 'null'); } catch (e) { return null; } },
  set(v) { sessionStorage.setItem('exama', JSON.stringify(v)); },
  clear() { sessionStorage.removeItem('exama'); }
};

// POST wajib text/plain agar tidak memicu CORS preflight yang ditolak GAS
async function api(action, data = {}) {
  const s = Sess.get();
  let res;
  try {
    res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: s && s.token, data }) });
  } catch (e) { throw new Error('Tidak ada koneksi ke server.'); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Respons server tidak valid. Periksa GAS_URL dan deployment.'); }
  if (!j.success) { const err = new Error(j.message || 'Terjadi kesalahan.'); err.code = j.code; if (j.code === 'AUTH') Router.authLost(); throw err; }
  return j.data;
}
async function apiGet(action) {
  const res = await fetch(GAS_URL + '?action=' + action);
  const j = await res.json();
  if (!j.success) throw new Error(j.message);
  return j.data;
}

function toast(msg, type = '') {
  const t = $('#toast'); t.innerHTML = `<div class="toast ${type}">${esc(msg)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.innerHTML = '', 3200);
}

// CSV (dukung kutip, koma, dan baris baru di dalam sel)
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split('\n')[0], sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { r.push(c); c = ''; }
    else if (ch === '\n') { r.push(c.replace(/\r$/, '')); rows.push(r); r = []; c = ''; }
    else c += ch;
  }
  if (c || r.length) { r.push(c.replace(/\r$/, '')); rows.push(r); }
  const h = (rows.shift() || []).map(x => x.trim());
  return rows.filter(x => x.some(v => v.trim())).map(x => { const o = {}; h.forEach((k, i) => o[k] = (x[i] || '').trim()); return o; });
}
function toCSV(rows, cols) {
  cols = cols || Object.keys(rows[0] || {});
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '\uFEFF' + [cols.map(q).join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\r\n');
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
