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
// Aksi baca otomatis diulang 1x (cold start GAS / sinyal putus-nyambung); aksi tulis tidak diulang agar tidak ganda.
const RETRY_OK = /^(admin\.(monitor|peserta|jadwal)|mapel\.list|bank\.(list|pratinjau)|log\.list|rekap|essay\.list|siswa\.ping)$/;
async function api(action, data = {}) {
  const s = Sess.get(), body = JSON.stringify({ action, token: s && s.token, data });
  const tries = RETRY_OK.test(action) ? 2 : 1;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 45000);
    try {
      const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, signal: ctl.signal });
      clearTimeout(to);
      let j;
      try { j = await res.json(); } catch (e) { throw new Error('Respons server tidak valid. Periksa GAS_URL dan deployment.'); }
      if (!j.success) { const err = new Error(j.message || 'Terjadi kesalahan.'); err.code = j.code; err.server = true; if (j.code === 'AUTH') Router.authLost(); throw err; }
      return j.data;
    } catch (e) {
      clearTimeout(to);
      if (e.server) throw e;
      lastErr = e.name === 'AbortError' ? new Error('Server terlalu lama merespons.') : (e.message && /valid/.test(e.message) ? e : new Error('Tidak ada koneksi ke server.'));
      if (i + 1 < tries) await new Promise(r => setTimeout(r, 1200));
    }
  }
  throw lastErr;
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

// ---------- Gambar: pilih file, kecilkan, ubah ke base64 ----------
function pickFiles(accept, multiple) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.multiple = !!multiple;
    i.onchange = () => res([...i.files]); i.oncancel = () => res([]); i.click();
  });
}
function compressImage(file, maxPx = 1200, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res({ b64: c.toDataURL('image/jpeg', q).split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar yang valid: ' + file.name)); };
    img.src = url;
  });
}

// ---------- Excel (SheetJS dimuat saat dibutuhkan) ----------
let _xl;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return _xl || (_xl = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => res(window.XLSX); s.onerror = () => { _xl = null; rej(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  }));
}
async function readTable(file) {
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  const X = await loadXLSX(), wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  return rows.map(r => { const o = {}; Object.keys(r).forEach(k => o[String(k).trim()] = String(r[k]).trim()); return o; });
}
async function saveXLSX(name, sheets) {
  const X = await loadXLSX(), wb = X.utils.book_new();
  sheets.forEach(sh => {
    const ws = X.utils.json_to_sheet(sh.rows, { header: sh.cols });
    ws['!cols'] = sh.cols.map(c => ({ wch: sh.wide && sh.wide[c] ? sh.wide[c] : Math.max(12, c.length + 2) }));
    X.utils.book_append_sheet(wb, ws, sh.name);
  });
  X.writeFile(wb, name);
}
