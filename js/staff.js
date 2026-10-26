'use strict';
/* ExamaTKA — Dasbor staf v2 (admin/pengawas & guru). Akses: index.html#/staff
 * Stabilitas: halaman di-cache (tampil instan saat pindah menu), respons lama dibuang bila sudah pindah menu,
 * filter/pencarian dipertahankan, polling berhenti saat tab browser tersembunyi. */

const ST_STATUS = {
  'Berlangsung': ['ok', 'MENGERJAKAN'], 'Offline': ['warn', 'OFFLINE'], 'Terkunci': ['bad', 'TERKUNCI'], 'Selesai': ['pri', 'SELESAI'],
  'Auto-Submit': ['pri', 'AUTO-SUBMIT'], 'Didiskualifikasi': ['bad', 'DISKUALIFIKASI'], 'Belum Masuk': ['', 'BELUM MASUK']
};
const stPill = s => { const m = ST_STATUS[s] || ['', s]; return `<span class="pill ${m[0]}">${m[1]}</span>`; };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const av = (nama, foto, cls = '') => foto ? `<img class="av ${cls}" ${imgAttr(foto)} alt="">` : `<span class="av ${cls}">${esc(initials(nama))}</span>`;
const fileBase = f => f.name.replace(/\.[^.]+$/, '').trim();

const SOAL_COLS = ['No', 'Tipe', 'Level', 'Stimulus', 'Pertanyaan', 'Opsi', 'Kunci', 'Bobot', 'Rubrik_Essay', 'Skor_Maks'];
const HINT = {
  PG: ['Satu opsi per baris. Huruf A, B, C... otomatis.', 'Satu huruf, mis. B'],
  PGK: ['Satu opsi per baris.', 'Huruf dipisah koma, mis. A,C'],
  BS: ['Satu pernyataan per baris.', 'B atau S tiap pernyataan, dipisah koma, mis. B,S,B'],
  MATCH: ['Satu pasangan per baris: kiri::kanan', ''],
  ESSAY: ['', '']
};

const St = {
  u: null, kode: null, mapel: [], page: null, timer: null, tk: null, navTok: 0, cache: {}, sig: {},
  ui: { f: 'Semua', q: '', pq: '', pr: '', pinShow: false, essayF: 'Perlu Ditinjau', essayKey: null },
  d: null, logL: [], bankL: [], eList: [], pAll: [], rows: [], tokEnd: 0, edUrl: '', edPrev: '',

  // ================= AWAL =================
  start() {
    const s = Sess.get();
    document.addEventListener('click', e => { const t = e.target.closest('[data-s]'); if (t) this.act(t.dataset.s, t.dataset, t); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.u && this.page === 'live') this.go('live'); });
    if (s && (s.role === 'admin' || s.role === 'guru')) { this.u = s; this.boot(); } else this.loginView();
  },

  loginView(err) {
    $('#root').innerHTML = `<div class="m"><div class="brand mt16"><div class="logo">E</div><div><h1 style="font-size:22px">ExamaTKA Hub</h1><div class="xs mut">Masuk guru / admin pengawas</div></div></div>
      <form id="sf"><label class="f" for="un">Username</label><input class="inp" id="un" autocomplete="username" required>
      <label class="f" for="pn">PIN</label><input class="inp" id="pn" type="password" autocomplete="current-password" required>
      ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}<button class="btn pri block mt16">Masuk</button></form>
      <p class="xs mt16" style="text-align:center"><a href="#/" style="color:var(--mut)">← Halaman peserta ujian</a></p></div>`;
    $('#sf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api('login.staff', { username: $('#un').value, pin: $('#pn').value }); Sess.set(r); this.u = r; this.boot(); }
      catch (x) { this.loginView(x.message); }
    };
  },

  setTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('exama_theme', t); const b = $('#thm'); if (b) b.textContent = t === 'dark' ? '☀ Mode terang' : '☾ Mode gelap'; },

  async boot() {
    $('#root').innerHTML = '<div class="spin"></div>';
    try { this.mapel = await api('mapel.list'); } catch (e) { return this.loginView(e.message); }
    const ak = this.mapel.find(m => m.status === 'Aktif'); this.kode = this.kode || (ak || this.mapel[0] || {}).kode || null;
    const adm = this.u.role === 'admin';
    const nav = adm ? [['live', 'Live Proctoring'], ['peserta', 'Data Peserta & Kartu'], ['bank', 'Bank Soal'], ['essay', 'Koreksi Essay AI'], ['log', 'Audit Pelanggaran'], ['rekap', 'Rekap Nilai'], ['jadwal', 'Sesi & Token']]
      : [['bank', 'Bank Soal'], ['essay', 'Koreksi Essay AI'], ['rekap', 'Rekap Nilai'], ['log', 'Log Pelanggaran']];
    const th = document.documentElement.getAttribute('data-theme');
    $('#root').innerHTML = `<div class="shell"><nav class="side"><div class="brand" style="margin-bottom:12px"><div class="logo">E</div><b class="num">ExamaTKA</b></div>
      <div class="card sm" style="margin-bottom:8px"><b>${esc(this.u.nama)}</b><div class="xs mut">${adm ? 'Admin / Pengawas' : 'Guru'}</div></div>
      ${nav.map(n => `<a data-s="go" data-p="${n[0]}">${n[1]}</a>`).join('')}
      <div class="grow"></div><a data-s="theme" id="thm" class="theme">${th === 'dark' ? '☀ Mode terang' : '☾ Mode gelap'}</a><a data-s="out">Keluar</a></nav>
      <main class="main"><div class="row mt8" style="margin-bottom:16px"><label class="xs mut" for="mp">UJIAN / MAPEL</label>
      <select class="inp" id="mp" style="max-width:380px;min-height:38px">${this.mapel.map(m => `<option value="${esc(m.kode)}" ${m.kode === this.kode ? 'selected' : ''}>${esc(m.nama)} (${esc(m.kode)})${m.status === 'Aktif' ? ' ● aktif' : ''}</option>`).join('')}</select></div>
      <div id="pg"></div></main></div>`;
    $('#mp').onchange = e => { this.kode = e.target.value; this.go(this.page); };
    let last = ''; try { last = sessionStorage.getItem('exama_pg') || ''; } catch (e) { }
    this.go(nav.some(n => n[0] === last) ? last : nav[0][0]);
  },

  // ================= NAVIGASI STABIL =================
  pages() {
    const k = this.kode;
    return {
      live: { load: () => api('admin.monitor', { kode: k }), draw: d => this.drawLive(d), poll: MONITOR_MS },
      peserta: { load: () => api('admin.peserta'), draw: d => this.drawPeserta(d), global: true },
      bank: { load: () => api('bank.list', { kode: k }), draw: d => this.drawBank(d) },
      essay: { load: () => api('essay.list', { kode: k }), draw: d => this.drawEssay(d) },
      log: { load: () => api('log.list', { kode: k }), draw: d => this.drawLog(d) },
      rekap: { load: () => api('rekap', { kode: k }), draw: d => this.drawRekap(d) },
      jadwal: { load: () => api('admin.jadwal'), draw: d => this.drawJadwal(d), global: true }
    };
  },

  go(p) {
    clearInterval(this.timer); clearInterval(this.tk); this.timer = this.tk = null;
    const tok = ++this.navTok; this.page = p;
    try { sessionStorage.setItem('exama_pg', p); } catch (e) { }
    $$('.side a[data-p]').forEach(a => a.classList.toggle('on', a.dataset.p === p));
    const P = this.pages()[p]; if (!P) return;
    if (!this.kode && !P.global) { $('#pg').innerHTML = '<div class="card mut">Belum ada ujian/mapel. Admin membuatnya di menu Sesi & Token.</div>'; return; }
    const key = p + '|' + (P.global ? '' : this.kode), hit = this.cache[key];
    let drawn = false;
    if (hit) { this.draw(P, hit); drawn = true; } else $('#pg').innerHTML = '<div class="spin"></div>';
    const run = async () => {
      try {
        const d = await P.load();
        if (tok !== this.navTok) return; // sudah pindah menu: buang respons lama
        const sg = JSON.stringify(d), changed = this.sig[key] !== sg;
        this.cache[key] = d; this.sig[key] = sg;
        if (!drawn || changed) { this.draw(P, d); drawn = true; }
      } catch (e) {
        if (tok !== this.navTok) return;
        if (!drawn) $('#pg').innerHTML = `<div class="err">${esc(e.message)}</div><button class="btn mt16" data-s="retry">Coba lagi</button>`;
        else if (!P.poll) toast(e.message, 'bad');
      }
    };
    run();
    if (P.poll) this.timer = setInterval(() => { if (!document.hidden && tok === this.navTok) run(); }, P.poll);
  },
  draw(P, d) {
    const y = window.scrollY;
    try { P.draw(d); } catch (e) { console.error(e); $('#pg').innerHTML = `<div class="err">Tampilan gagal dimuat: ${esc(e.message)}</div>`; }
    if (!P.poll) window.scrollTo(0, y);
  },
  inval() { this.cache = {}; this.sig = {}; },
  reload() { this.inval(); this.go(this.page); },

  modal(html) { $('#ov').innerHTML = `<div class="modal" data-s="mclose"><div class="box" onclick="event.stopPropagation()">${html}</div></div>`; },
  close() { $('#ov').innerHTML = ''; },
  head(t, sub, btns) { return `<div class="top"><div><h1 style="font-size:24px">${t}</h1><div class="mut sm">${sub || ''}</div></div><div class="row wrap">${btns || ''}</div></div>`; },
  kpis(a) { return `<div class="kpis">${a.map(k => `<div class="card kpi"><span class="xs mut">${k[0].toUpperCase()}</span><b class="${k[2] || ''}">${k[1]}</b></div>`).join('')}</div>`; },

  // Jalankan banyak pekerjaan berurutan dengan progres (unggah foto/gambar massal)
  async batch(judul, items) {
    this.modal(`<h2>${esc(judul)}</h2><div class="prog mt16"><i id="bp"></i></div><p class="sm mut mt8" id="bt">0 / ${items.length}</p><div id="bl" class="sm"></div><button class="btn block mt16" data-s="x" id="bx" disabled>Tutup</button>`);
    let ok = 0; const gagal = [];
    for (let i = 0; i < items.length; i++) {
      try { await items[i].fn(); ok++; } catch (e) { gagal.push(`${esc(items[i].label)}: ${esc(e.message)}`); }
      if (!$('#bp')) return;
      $('#bp').style.width = Math.round((i + 1) / items.length * 100) + '%'; $('#bt').textContent = `${i + 1} / ${items.length} — berhasil ${ok}`;
    }
    if ($('#bl')) { $('#bl').innerHTML = gagal.length ? `<div class="err">${gagal.slice(0, 15).join('<br>')}</div>` : '<div class="ok mt8">Semua berhasil.</div>'; $('#bx').disabled = false; }
    return ok;
  },

  // ================= AKSI =================
  async act(a, ds, el) {
    try {
      if (a === 'go') this.go(ds.p);
      else if (a === 'retry') this.reload();
      else if (a === 'out') { try { await api('logout'); } catch (e) { } Sess.clear(); location.reload(); }
      else if (a === 'theme') this.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      else if (a === 'mclose' || a === 'x') this.close();
      // --- live
      else if (a === 'tab') { this.ui.f = ds.v; this.grid(); $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ds.v)); }
      else if (a === 'unb') this.unblockModal(ds.n);
      else if (a === 'unbgo') { await api('admin.unblock', { nisn: ds.n, kode: this.kode, tambahMenit: $('#tm2').value, alasan: $('#al').value }); this.close(); toast('Kunci dibuka & strike direset', 'ok'); this.reload(); }
      else if (a === 'bc') this.modal(`<h2>Broadcast ke peserta</h2><label class="f" for="bm">Pesan</label><textarea class="inp" id="bm" maxlength="200"></textarea><label class="opt mt8"><input type="checkbox" id="bsr"><span class="sm">Bunyikan sirene di semua perangkat siswa</span></label><div class="row mt16"><button class="btn grow" data-s="x">Batal</button><button class="btn pri grow" data-s="bcgo">Kirim</button></div>`);
      else if (a === 'bcgo') { await api('admin.broadcast', { pesan: $('#bm').value, sirene: $('#bsr').checked }); this.close(); toast('Broadcast terkirim', 'ok'); }
      else if (a === 'pause') { const on = !this.d.pause; await api('admin.pause', { on }); toast(on ? 'Layar siswa dijeda' : 'Jeda dicabut', 'ok'); this.reload(); }
      else if (a === 'tok') { const r = await api('admin.token', { kode: this.kode }); toast('Token baru: ' + r.token, 'ok'); this.reload(); }
      else if (a === 'snap') download(`snapshot_${this.kode}_${Date.now()}.csv`, toCSV(this.d.siswa.map(s => ({ NISN: s.nisn, Nama: s.nama, Rombel: s.rombel, Meja: s.meja, Status: s.status, Terjawab: s.terjawab, Total: s.total, Pelanggaran: s.strike, Nilai: s.nilai }))));
      // --- peserta
      else if (a === 'rpin') { const r = await api('admin.resetPin', { nisn: ds.n }); this.modal(`<h2>PIN baru</h2><div class="card num" style="font-size:36px;text-align:center;letter-spacing:.2em">${esc(r.pin)}</div><button class="btn pri block mt16" data-s="x">Selesai</button>`); this.inval(); this.go('peserta'); }
      else if (a === 'padd') await this.pesertaSimpan();
      else if (a === 'pedit') { const s = this.pAll.find(x => x.NISN === ds.n); ['pn1', 'pn2', 'pn3', 'pn4'].forEach((id, i) => $('#' + id).value = [s.NISN, s.Nama, s.Rombel, s.No_Meja][i]); $('#pn5').value = ''; $('#pn2').focus(); }
      else if (a === 'pshow') { this.ui.pinShow = !this.ui.pinShow; el.textContent = this.ui.pinShow ? '🙈 Sembunyikan PIN' : '👁 Tampilkan PIN'; this.pBody(); }
      else if (a === 'ppin') { if (!confirm('Buat PIN baru untuk SEMUA peserta yang PIN-nya belum tersimpan? PIN lama mereka tidak berlaku lagi.')) return; const r = await api('admin.pinMassal'); toast(r.dibuat + ' PIN dibuat', 'ok'); this.reload(); }
      else if (a === 'ptpl') await saveXLSX('templat_peserta.xlsx', [{ name: 'Peserta', cols: ['NISN', 'Nama', 'Rombel', 'No_Meja', 'PIN'], rows: [{ NISN: '0068000001', Nama: 'Contoh Siswa Satu', Rombel: 'XII MIPA 1', No_Meja: 'R01-PC01', PIN: '' }, { NISN: '0068000002', Nama: 'Contoh Siswa Dua', Rombel: 'XII MIPA 1', No_Meja: 'R01-PC02', PIN: '' }], wide: { Nama: 30 } },
        { name: 'Petunjuk', cols: ['Petunjuk'], rows: [{ Petunjuk: 'Hapus 2 baris contoh, isi data peserta mulai baris 2.' }, { Petunjuk: 'Format kolom NISN sebagai TEKS agar angka 0 di depan tidak hilang.' }, { Petunjuk: 'Kolom PIN boleh kosong: sistem membuat PIN acak 6 angka.' }], wide: { Petunjuk: 80 } }]);
      else if (a === 'pimp') await this.pesertaImpor();
      else if (a === 'pfoto') await this.fotoMassal();
      else if (a === 'pfoto1') { const [f] = await pickFiles('image/*'); if (!f) return; const c = await compressImage(f, 400, .8); await api('admin.fotoSiswa', { nisn: ds.n, b64: c.b64, mime: c.mime }); toast('Foto tersimpan', 'ok'); this.reload(); }
      else if (a === 'pkartu') this.kartu(this.pFiltered());
      else if (a === 'pkartu1') this.kartu(this.pAll.filter(x => x.NISN === ds.n));
      // --- jadwal
      else if (a === 'jsave') await this.jadwalSimpan();
      // --- log
      else if (a === 'bap') this.bapModal(ds.id);
      else if (a === 'bapgo') { await api('admin.resolve', { logId: ds.id, keputusan: $('input[name=kp]:checked').value, catatan: $('#bc').value, tambahMenit: $('#bt').value }); this.close(); toast('Keputusan tersimpan', 'ok'); this.reload(); }
      // --- bank soal
      else if (a === 'bnew') this.soalModal(null);
      else if (a === 'bedit') this.soalModal(ds.id);
      else if (a === 'bdel') { if (!confirm('Hapus soal ini?')) return; await api('bank.hapus', { kode: this.kode, id: ds.id }); toast('Soal dihapus', 'ok'); this.reload(); }
      else if (a === 'bgam1') { const [f] = await pickFiles('image/*'); if (!f) return; toast('Mengunggah gambar...'); const c = await compressImage(f); const r = await api('upload.gambar', { kode: this.kode, b64: c.b64, mime: c.mime }); await api('bank.gambar', { kode: this.kode, id: ds.id, url: r.url }); toast('Gambar tersimpan di Google Drive', 'ok'); this.reload(); }
      else if (a === 'bgam') await this.gambarMassal();
      else if (a === 'btpl') await this.templatSoal();
      else if (a === 'bimp') await this.soalImpor();
      else if (a === 'prev') this.pratinjau();
      else if (a === 'sync') this.soalSync();
      else if (a === 'sgup') { const [f] = await pickFiles('image/*'); if (!f) return; toast('Mengunggah gambar...'); const c = await compressImage(f); const r = await api('upload.gambar', { kode: this.kode, b64: c.b64, mime: c.mime }); this.edUrl = r.url; this.edPrev = 'data:' + c.mime + ';base64,' + c.b64; this.soalGambar(); toast('Gambar terunggah', 'ok'); }
      else if (a === 'sgdel') { this.edUrl = ''; this.edPrev = ''; this.soalGambar(); }
      else if (a === 'ssave') await this.soalSimpan(ds.id);
      // --- essay
      else if (a === 'es') { this.ui.essayKey = ds.k; this.essayDraw(); }
      else if (a === 'esf') { this.ui.essayF = ds.v; this.essayDraw(); }
      else if (a === 'essv') { await api('essay.simpan', { kode: this.kode, key: ds.k, skor: $('#sk').value, catatan: $('#ck').value }); toast('Skor tersimpan', 'ok'); this.reload(); }
      else if (a === 'esall') { const r = await api('essay.setujuiAI', { kode: this.kode }); toast(r.disetujui + ' skor AI disetujui', 'ok'); this.reload(); }
      else if (a === 'esai') { el.disabled = true; const r = await api('essay.nilaiAI', { kode: this.kode }); toast(r.pesan || r.diproses + ' jawaban dinilai AI', r.pesan ? 'bad' : 'ok'); el.disabled = false; this.reload(); }
      else if (a === 'csv') download(ds.n + '.csv', toCSV(this.rows, ds.c ? ds.c.split('|') : null));
    } catch (e) { toast(e.message, 'bad'); if (el && el.disabled) el.disabled = false; }
  },

  // ================= LIVE =================
  drawLive(d) {
    this.d = d; const s = d.setting, L = d.siswa, c = k => L.filter(x => x.status === k).length;
    let host = $('#lvg');
    if (!host || host.dataset.k !== this.kode) {
      $('#pg').innerHTML = `<div class="top"><div><h1 style="font-size:24px">Live proctoring & ruang pengawas</h1><div class="mut sm">Diperbarui otomatis tiap ${MONITOR_MS / 1000} detik</div></div>
        <div class="row wrap"><span class="pill" id="stp"></span><div class="tokbox"><span id="tkn">------</span><small id="tkc"></small></div><button class="btn sm" data-s="tok">Token baru</button><button class="btn pri" data-s="bc">Broadcast</button><button class="btn warn" data-s="pause" id="pz"></button><button class="btn" data-s="snap">Snapshot CSV</button></div></div>
        <div id="kp"></div><div class="row wrap"><div class="tabs">${['Semua', 'Berlangsung', 'Terkunci', 'Offline', 'Selesai', 'Belum Masuk'].map(t => `<button data-s="tab" data-v="${t}" class="${t === this.ui.f ? 'on' : ''}">${t}</button>`).join('')}</div>
        <input class="inp grow" id="sq" placeholder="Cari nama / NISN / meja" style="max-width:300px;min-height:38px" value="${esc(this.ui.q)}"></div>
        <div class="split" style="grid-template-columns:1fr 320px"><div class="stn" id="lvg" data-k="${esc(this.kode)}"></div><div class="card"><b class="num">Log pelanggaran terbaru</b><div id="lg" class="col mt8"></div></div></div>`;
      $('#sq').oninput = e => { this.ui.q = e.target.value; this.grid(); };
    }
    const on = s.Status === 'Aktif';
    $('#stp').className = 'pill ' + (on ? 'ok' : ''); $('#stp').textContent = on ? 'SESI BERLANGSUNG' : 'SESI DITUTUP';
    $('#tkn').textContent = s.Token_Aktif || '------'; $('#pz').textContent = d.pause ? 'Cabut jeda' : 'Kunci sementara';
    this.tokEnd = d.tokenSisa != null ? Date.now() + d.tokenSisa * 1000 : 0;
    if (!this.tk) this.tk = setInterval(() => { const e = $('#tkc'); if (!e) return; e.textContent = this.tokEnd ? 'berganti dalam ' + fmtDur((this.tokEnd - Date.now()) / 1000) : 'token manual'; }, 1000);
    $('#kp').innerHTML = this.kpis([['Total peserta', L.length], ['Mengerjakan', c('Berlangsung'), 'ok'], ['Terkunci', c('Terkunci'), 'bad'], ['Offline', c('Offline'), 'warn'], ['Selesai', L.filter(x => ['Selesai', 'Auto-Submit', 'Didiskualifikasi'].includes(x.status)).length], ['Memanggil', L.filter(x => x.memanggil).length, 'warn']]);
    $('#lg').innerHTML = d.log.length ? d.log.map(l => `<div class="sm" style="border-bottom:1px solid var(--line);padding-bottom:6px"><span class="num ${l.Strike >= 3 ? 'bad' : 'warn'}">${fmtT(l.Timestamp)}</span> <b>${esc(l.Nama)}</b><br><span class="mut">${esc(l.Jenis)} · strike ${l.Strike}</span></div>`).join('') : '<div class="mut sm">Belum ada pelanggaran.</div>';
    this.grid();
  },
  grid() {
    const host = $('#lvg'); if (!host || !this.d) return;
    const q = this.ui.q.toLowerCase(), now = this.d.serverNow;
    const L = this.d.siswa.filter(x => (this.ui.f === 'Semua' || x.status === this.ui.f) && (!q || (x.nama + x.nisn + x.meja).toLowerCase().includes(q)))
      .sort((a, b) => (b.memanggil - a.memanggil) || (b.status === 'Terkunci') - (a.status === 'Terkunci'));
    host.innerHTML = L.map(x => `<div class="card ${x.status === 'Terkunci' ? 'lock' : x.strike ? 'wn' : ''}"><div class="row between">${stPill(x.status)}<span class="xs mut num">${esc(x.meja)}</span></div>
      <div class="row mt8">${av(x.nama, x.foto)}<div><b>${esc(x.nama)}</b> ${x.memanggil ? '<span class="pill warn">MEMANGGIL</span>' : ''}<div class="xs mut">NISN ${esc(x.nisn)} · ${esc(x.rombel)}</div></div></div>
      ${x.status === 'Belum Masuk' ? '' : `<div class="bar"><i style="width:${x.total ? x.terjawab / x.total * 100 : 0}%"></i></div><div class="row between xs"><span>${x.terjawab}/${x.total} soal</span><span class="${x.strike ? 'warn' : 'mut'}">strike ${x.strike}</span><span class="mut">${x.sisaDetik != null ? 'sisa ' + fmtDur(x.sisaDetik) : x.nilai != null ? 'nilai ' + (+x.nilai).toFixed(1) : ''}</span></div>${x.ping && !['Selesai', 'Auto-Submit'].includes(x.status) ? `<div class="xs mut">ping ${Math.max(0, Math.round((now - x.ping) / 1000))} dtk lalu</div>` : ''}`}
      ${x.status === 'Terkunci' || x.memanggil ? `<button class="btn ok sm block mt8" data-s="unb" data-n="${esc(x.nisn)}">Buka kunci</button>` : ''}</div>`).join('') || '<div class="mut">Tidak ada peserta pada filter ini.</div>';
  },
  unblockModal(n) {
    const x = this.d.siswa.find(s => s.nisn === n);
    this.modal(`<h2>Buka kunci: ${esc(x.nama)}</h2><p class="sm mut">Strike direset ke 0. Jawaban tetap utuh.</p><label class="f" for="tm2">Kompensasi tambahan waktu</label>
      <select class="inp" id="tm2"><option value="0">Tanpa tambahan</option><option>5</option><option>10</option><option>15</option></select>
      <label class="f" for="al">Alasan validasi</label><input class="inp" id="al" placeholder="mis. kendala teknis / koneksi terputus"><div class="row mt16"><button class="btn grow" data-s="x">Batal</button><button class="btn ok grow" data-s="unbgo" data-n="${esc(n)}">Buka kunci sekarang</button></div>`);
  },

  // ================= PESERTA, PIN, FOTO, KARTU =================
  drawPeserta(L) {
    this.pAll = L; this.rows = L.map(s => ({ NISN: s.NISN, Nama: s.Nama, Rombel: s.Rombel, No_Meja: s.No_Meja, PIN: s.PIN_Teks }));
    const roms = [...new Set(L.map(s => s.Rombel).filter(Boolean))].sort(), kosong = L.filter(s => !s.PIN_Teks).length;
    $('#pg').innerHTML = this.head('Data peserta & kartu ujian', `${L.length} peserta${kosong ? ` · <span class="warn">${kosong} belum punya PIN tersimpan</span>` : ''}`,
      `<button class="btn" data-s="ptpl">Templat Excel</button><button class="btn" data-s="pimp">Impor Excel/CSV</button><button class="btn" data-s="pfoto">Foto massal</button>${kosong ? '<button class="btn warn" data-s="ppin">Buat PIN yang kosong</button>' : ''}<button class="btn" data-s="csv" data-n="peserta" data-c="NISN|Nama|Rombel|No_Meja|PIN">Ekspor</button><button class="btn pri" data-s="pkartu">Cetak kartu</button>`) +
      `<div class="split" style="grid-template-columns:1fr 320px"><div><div class="row wrap" style="margin-bottom:12px"><input class="inp grow" id="pq" placeholder="Cari NISN / nama" value="${esc(this.ui.pq)}" style="min-height:40px">
      <select class="inp" id="pr" style="width:auto;min-height:40px"><option value="">Semua rombel</option>${roms.map(r => `<option ${r === this.ui.pr ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <button class="btn sm" data-s="pshow">${this.ui.pinShow ? '🙈 Sembunyikan PIN' : '👁 Tampilkan PIN'}</button></div>
      <div class="tw"><table><thead><tr><th></th><th>NISN</th><th>NAMA</th><th>ROMBEL</th><th>MEJA</th><th>PIN</th><th></th></tr></thead><tbody id="pt"></tbody></table></div><div class="xs mut mt8" id="pc"></div></div>
      <div class="card"><h3>Tambah / ubah peserta</h3><label class="f" for="pn1">NISN</label><input class="inp" id="pn1" inputmode="numeric"><label class="f" for="pn2">Nama lengkap</label><input class="inp" id="pn2">
      <label class="f" for="pn3">Rombel</label><input class="inp" id="pn3"><label class="f" for="pn4">No. meja / PC</label><input class="inp" id="pn4"><label class="f" for="pn5">PIN (kosong = acak / tidak diubah)</label><input class="inp" id="pn5" maxlength="8" inputmode="numeric">
      <button class="btn pri block mt16" data-s="padd">Simpan</button><p class="xs mut mt8">Foto: tombol "Foto" di baris peserta, atau "Foto massal" (nama file = NISN, mis. 0068192341.jpg).</p></div></div>`;
    $('#pq').oninput = e => { this.ui.pq = e.target.value; this.pBody(); };
    $('#pr').onchange = e => { this.ui.pr = e.target.value; this.pBody(); };
    this.pBody();
  },
  pFiltered() { const q = this.ui.pq.toLowerCase(); return this.pAll.filter(s => (!this.ui.pr || s.Rombel === this.ui.pr) && (!q || (s.Nama + s.NISN).toLowerCase().includes(q))); },
  pBody() {
    const f = this.pFiltered(), tb = $('#pt'); if (!tb) return;
    tb.innerHTML = f.slice(0, 400).map(s => `<tr><td>${av(s.Nama, s.Foto)}</td><td class="num">${esc(s.NISN)}</td><td>${esc(s.Nama)} ${s.Status_Kunci ? '<span class="pill bad">TERKUNCI</span>' : ''}</td><td>${esc(s.Rombel)}</td><td>${esc(s.No_Meja)}</td>
      <td class="num">${s.PIN_Teks ? (this.ui.pinShow ? esc(s.PIN_Teks) : '••••••') : '<span class="mut">—</span>'}</td>
      <td><div class="row wrap"><button class="btn sm" data-s="pfoto1" data-n="${esc(s.NISN)}">Foto</button><button class="btn sm" data-s="pkartu1" data-n="${esc(s.NISN)}">Kartu</button><button class="btn sm" data-s="pedit" data-n="${esc(s.NISN)}">Ubah</button><button class="btn sm" data-s="rpin" data-n="${esc(s.NISN)}">Reset PIN</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="mut">Tidak ada peserta.</td></tr>';
    $('#pc').textContent = `Menampilkan ${Math.min(400, f.length)} dari ${f.length} peserta${f.length > 400 ? ' (persempit dengan pencarian)' : ''}.`;
  },
  async pesertaSimpan() {
    const r = await api('admin.pesertaSimpan', { NISN: $('#pn1').value, Nama: $('#pn2').value, Rombel: $('#pn3').value, No_Meja: $('#pn4').value, PIN: $('#pn5').value });
    this.modal(`<h2>Tersimpan</h2>${r.pin ? `<p class="sm mut">PIN peserta:</p><div class="card num" style="font-size:36px;text-align:center;letter-spacing:.2em">${esc(r.pin)}</div>` : '<p>Data peserta diperbarui.</p>'}<button class="btn pri block mt16" data-s="x">Selesai</button>`);
    this.reload();
  },
  async pesertaImpor() {
    const [f] = await pickFiles('.xlsx,.xls,.csv'); if (!f) return;
    const rows = await readTable(f);
    const r = await api('admin.pesertaImpor', { rows });
    this.modal(`<h2>Impor selesai</h2><p>${r.berhasil.length} peserta masuk, ${r.error.length} gagal.</p>${r.error.length ? `<div class="err">${r.error.slice(0, 12).map(x => `Baris ${x.baris}: ${esc(x.pesan)}`).join('<br>')}</div>` : ''}
      <p class="sm mut mt8">PIN peserta dapat dilihat di tabel (tombol "Tampilkan PIN") dan tercetak di kartu.</p><button class="btn pri block mt8" data-s="x">Tutup</button>`);
    this.reload();
  },
  async fotoMassal() {
    const files = await pickFiles('image/*', true); if (!files.length) return;
    const ada = new Set(this.pAll.map(s => s.NISN));
    const items = files.map(f => ({
      label: f.name, fn: async () => {
        const n = fileBase(f); if (!ada.has(n)) throw new Error('nama file bukan NISN terdaftar');
        const c = await compressImage(f, 400, .8); await api('admin.fotoSiswa', { nisn: n, b64: c.b64, mime: c.mime });
      }
    }));
    await this.batch('Unggah foto peserta', items); this.reload();
  },
  async kartu(list) {
    if (!list.length) return toast('Tidak ada peserta untuk dicetak.', 'bad');
    const w = window.open('', '_blank'); if (!w) return toast('Pop-up diblokir browser. Izinkan pop-up untuk situs ini.', 'bad');
    w.document.write('<p style="font:14px sans-serif;padding:20px">Menyiapkan kartu...</p>');
    let sekolah = 'ExamaTKA'; try { sekolah = (await apiGet('publicInfo')).sekolah; } catch (e) { }
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    list = await Promise.all(list.map(async s => {
      let f = s.Foto || '';
      if (f.startsWith('gas:')) { try { f = await Img.get(f.slice(4)); } catch (e) { f = ''; } }
      return Object.assign({}, s, { Foto: f });
    }));
    const cards = list.map(s => `<div class="k"><div class="h"><b>${esc(sekolah)}</b><span>KARTU PESERTA UJIAN</span></div><div class="b"><div class="f">${s.Foto ? `<img src="${esc(s.Foto)}" referrerpolicy="no-referrer" alt="">` : '<i>FOTO</i>'}</div>
      <div class="d"><div class="n">${esc(s.Nama)}</div><table><tr><td>NISN</td><td>: <b>${esc(s.NISN)}</b></td></tr><tr><td>Rombel</td><td>: ${esc(s.Rombel)}</td></tr><tr><td>Meja/PC</td><td>: ${esc(s.No_Meja)}</td></tr><tr><td>PIN</td><td>: <b class="pin">${esc(s.PIN_Teks) || '-'}</b></td></tr></table></div></div>
      <div class="u">${esc(url)} · Token ujian diberikan pengawas di ruang</div></div>`).join('');
    w.document.open();
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kartu Peserta Ujian</title><style>
      @page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;font:12px Arial,sans-serif;color:#111}
      .bar{padding:10px;background:#eef2ff;display:flex;gap:12px;align-items:center}.bar button{padding:8px 16px;font-weight:700;cursor:pointer}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:5mm;padding:5mm}.k{border:1.5px solid #333;border-radius:6px;height:58mm;padding:3mm;page-break-inside:avoid;display:flex;flex-direction:column}
      .h{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #333;padding-bottom:2mm;font-size:10px}.h span{font-weight:700;color:#4338ca}
      .b{display:flex;gap:3mm;flex:1;padding-top:2mm}.f{width:24mm;height:32mm;border:1px solid #999;display:grid;place-items:center;color:#999;overflow:hidden;flex:0 0 auto}.f img{width:100%;height:100%;object-fit:cover}
      .n{font-weight:700;font-size:13px;margin-bottom:2mm}td{padding:.6mm 1mm 0 0;font-size:11px;vertical-align:top}.pin{font:700 16px 'Courier New',monospace;letter-spacing:2px}.u{font-size:8px;color:#555;border-top:1px dashed #999;padding-top:1.5mm}
      @media print{.bar{display:none}.g{padding:0}}</style></head><body><div class="bar"><button onclick="print()">🖨 Cetak</button><span>${list.length} kartu · pilih ukuran A4, skala 100%</span></div><div class="g">${cards}</div></body></html>`);
    w.document.close();
  },

  // ================= JADWAL / TOKEN =================
  drawJadwal(L) {
    const s = L.find(x => x.Kode_Mapel === this.kode) || {};
    $('#pg').innerHTML = this.head('Pengaturan sesi & token', 'Satu ujian aktif pada satu waktu. Mengaktifkan ujian lain menutup yang sebelumnya.') +
      `<div class="split" style="grid-template-columns:1fr 1fr"><div class="card"><h3>Konfigurasi ${esc(s.Kode_Mapel || 'baru')}</h3>
      <label class="f" for="j0">Kode mapel (huruf/angka/strip) — ubah untuk membuat ujian baru</label><input class="inp" id="j0" value="${esc(s.Kode_Mapel || this.kode || '')}">
      <label class="f" for="j1">Nama ujian</label><input class="inp" id="j1" value="${esc(s.Nama_Ujian || '')}">
      <div class="row"><div class="grow"><label class="f" for="j2">Durasi (menit)</label><input class="inp" id="j2" inputmode="numeric" value="${esc(s.Durasi_Menit || 90)}"></div><div class="grow"><label class="f" for="j3">Batas pelanggaran</label><input class="inp" id="j3" inputmode="numeric" value="${esc(s.Batas_Pelanggaran || 3)}"></div></div>
      <div class="row"><div class="grow"><label class="f" for="j4">Status</label><select class="inp" id="j4"><option ${s.Status !== 'Aktif' ? 'selected' : ''}>Tutup</option><option ${s.Status === 'Aktif' ? 'selected' : ''}>Aktif</option></select></div>
      <div class="grow"><label class="f" for="j5">Token berganti tiap (menit, 0=manual)</label><input class="inp" id="j5" inputmode="numeric" value="${esc(s.Auto_Refresh_Menit === undefined || s.Auto_Refresh_Menit === '' ? 5 : s.Auto_Refresh_Menit)}"></div></div>
      <div class="row"><div class="grow"><label class="f" for="j6">Acak urutan soal</label><select class="inp" id="j6"><option ${s.Acak_Soal !== 'Tidak' ? 'selected' : ''}>Ya</option><option ${s.Acak_Soal === 'Tidak' ? 'selected' : ''}>Tidak</option></select></div>
      <div class="grow"><label class="f" for="j7">Tampilkan nilai ke siswa</label><select class="inp" id="j7"><option ${s.Tampilkan_Nilai === 'Ya' ? 'selected' : ''}>Ya</option><option ${s.Tampilkan_Nilai !== 'Ya' ? 'selected' : ''}>Tidak</option></select></div></div>
      <label class="opt mt8"><input type="checkbox" id="j8"><span class="sm">Mulai ulang timer serentak sekarang (saat disimpan sebagai Aktif)</span></label>
      <button class="btn pri block mt16" data-s="jsave">Simpan konfigurasi</button></div>
      <div class="card"><h3>Token sesi</h3><div class="tokbox mt8" style="font-size:36px">${esc(s.Token_Aktif || '------')}</div>
      <button class="btn block mt8" data-s="tok">Rilis token baru sekarang</button><p class="xs mut mt8">Token otomatis berganti sesuai menit di samping. Token lama masih diterima 60 detik. Siswa yang sedang mengerjakan atau terputus tetap bisa lanjut tanpa token.</p>
      <h3 class="mt16">Semua ujian</h3>${L.map(x => `<div class="row between sm" style="padding:6px 0;border-top:1px solid var(--line)"><span>${esc(x.Nama_Ujian)} <span class="mut">(${esc(x.Kode_Mapel)})</span></span><span class="pill ${x.Status === 'Aktif' ? 'ok' : ''}">${x.Status === 'Aktif' ? 'AKTIF' : 'TUTUP'}</span></div>`).join('')}</div></div>`;
  },
  async jadwalSimpan() {
    const r = await api('admin.jadwalSimpan', { Kode_Mapel: $('#j0').value, Nama_Ujian: $('#j1').value, Durasi_Menit: $('#j2').value, Batas_Pelanggaran: $('#j3').value, Status: $('#j4').value, Auto_Refresh_Menit: $('#j5').value, Acak_Soal: $('#j6').value, Tampilkan_Nilai: $('#j7').value, mulaiSekarang: $('#j8').checked });
    toast('Konfigurasi tersimpan', 'ok'); this.kode = r.Kode_Mapel; this.inval(); this.boot();
  },

  // ================= LOG & BAP =================
  drawLog(L) {
    this.logL = L; this.rows = L.map(l => ({ ID: l.ID, Waktu: fmtD(l.Timestamp), NISN: l.NISN, Nama: l.Nama, Jenis: l.Jenis, Detail: l.Detail, Durasi: l.Durasi_Detik, Strike: l.Strike, Status: l.Status_Resolusi, Keputusan: l.Keputusan, Catatan: l.Catatan_Pengawas }));
    const n = k => L.filter(l => k.test(l.Status_Resolusi)).length, adm = this.u.role === 'admin';
    $('#pg').innerHTML = this.head('Audit log pelanggaran', 'Catatan forensik dari server (waktu server, bukan jam perangkat siswa)', `<button class="btn" data-s="csv" data-n="log_pelanggaran">Ekspor CSV</button>`) +
      this.kpis([['Total insiden', L.length], ['Terkunci', n(/^Terkunci/), 'bad'], ['Sanggahan masuk', n(/Sanggahan/), 'warn'], ['Selesai ditangani', n(/Di-unblock|Diskualifikasi|Ditoleransi/), 'ok']]) +
      `<div class="tw"><table><thead><tr><th>WAKTU</th><th>PESERTA</th><th>JENIS</th><th>STRIKE</th><th>STATUS</th><th></th></tr></thead><tbody>${L.map(l => `<tr class="${/Terkunci|Sanggahan/.test(l.Status_Resolusi) ? 'hl' : ''}"><td class="num">${fmtD(l.Timestamp)}<br><span class="xs mut">${esc(l.ID)}</span></td><td><b>${esc(l.Nama)}</b><br><span class="xs mut">${esc(l.NISN)} · ${esc(l.Rombel)} · ${esc(l.No_Meja)}</span></td><td>${esc(l.Jenis)}<br><span class="xs mut">${esc(l.Detail)}${l.Durasi_Detik ? ' · ' + l.Durasi_Detik + ' dtk' : ''}</span></td><td class="num">${l.Strike}</td><td><span class="pill ${/Terkunci/.test(l.Status_Resolusi) ? 'bad' : /Sanggahan|Peringatan/.test(l.Status_Resolusi) ? 'warn' : 'ok'}">${esc(l.Status_Resolusi)}</span></td><td>${adm ? `<button class="btn sm" data-s="bap" data-id="${esc(l.ID)}">BAP</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="mut">Belum ada pelanggaran.</td></tr>'}</tbody></table></div>`;
  },
  bapModal(id) {
    const l = this.logL.find(x => x.ID === id), ada = l.Keputusan;
    this.modal(`<h2>Berita Acara Pelanggaran Digital</h2><p class="sm mut">${esc(l.ID)} · ${fmtD(l.Timestamp)}</p>
      <div class="card mt8"><b>${esc(l.Nama)}</b> <span class="mut sm">NISN ${esc(l.NISN)} · ${esc(l.Rombel)} · meja ${esc(l.No_Meja)}</span><div class="sm mt8">${esc(l.Jenis)} — ${esc(l.Detail)} ${l.Durasi_Detik ? '(' + l.Durasi_Detik + ' detik)' : ''}<br>Strike ke-${l.Strike} · perangkat: <span class="mut">${esc(l.Device)}</span></div></div>
      ${l.Sanggahan_Teks ? `<div class="card mt8" style="border-color:var(--warn)"><b class="warn sm">Sanggahan siswa (${esc(l.Sanggahan_Kategori)})</b><p class="sm mt8">${esc(l.Sanggahan_Teks)}</p><div class="xs mut">Meja: ${esc(l.Sanggahan_Meja)}</div></div>` : '<p class="sm mut mt8">Tidak ada sanggahan dari siswa.</p>'}
      ${ada ? `<div class="card mt8 ok sm">Sudah diputuskan: <b>${esc(l.Status_Resolusi)}</b> oleh ${esc(l.Diputuskan_Oleh)}. ${esc(l.Catatan_Pengawas)}</div>` : `
      <label class="f">Keputusan pengawas</label>
      <label class="opt"><input type="radio" name="kp" value="unblock" checked><span class="sm"><b>Unblock bersyarat</b> — reset strike, lanjut mengerjakan</span></label>
      <label class="opt"><input type="radio" name="kp" value="toleransi"><span class="sm"><b>Toleransi penuh</b> — gangguan teknis, bukan kesalahan siswa</span></label>
      <label class="opt"><input type="radio" name="kp" value="diskualifikasi"><span class="sm bad"><b>Diskualifikasi</b> — ujian dibatalkan, nilai 0</span></label>
      <label class="f" for="bt">Tambah waktu</label><select class="inp" id="bt"><option value="0">0 menit</option><option>5</option><option>10</option><option>15</option></select>
      <label class="f" for="bc">Catatan berita acara</label><textarea class="inp" id="bc" maxlength="400"></textarea>`}
      <div class="row mt16"><button class="btn grow" data-s="x">Tutup</button>${ada ? '' : `<button class="btn pri grow" data-s="bapgo" data-id="${esc(id)}">Eksekusi keputusan</button>`}</div>`);
  },

  // ================= REKAP =================
  drawRekap(L) {
    this.rows = L.map(r => Object.assign({}, r, { Waktu_Mulai: fmtD(r.Waktu_Mulai), Waktu_Submit: fmtD(r.Waktu_Submit) }));
    const sel = L.filter(r => r.Status !== 'Berlangsung' && r.Status !== 'Terkunci'), avg = sel.length ? sel.reduce((a, r) => a + Number(r.Nilai_Akhir || 0), 0) / sel.length : 0;
    $('#pg').innerHTML = this.head('Rekap nilai', `${L.length} peserta · rata-rata nilai selesai ${avg.toFixed(1)}`, `<button class="btn pri" data-s="csv" data-n="rekap_${esc(this.kode)}">Ekspor CSV</button>`) +
      `<div class="tw"><table><thead><tr><th>NISN</th><th>NAMA</th><th>ROMBEL</th><th>STATUS</th><th>OBJEKTIF</th><th>ESSAY</th><th>NILAI</th><th>PELANGGARAN</th></tr></thead><tbody>${L.map(r => `<tr><td class="num">${esc(r.NISN)}</td><td>${esc(r.Nama)}</td><td>${esc(r.Rombel)}</td><td>${stPill(r.Status)}</td><td class="num">${r.Skor_Otomatis === '' ? '-' : (+r.Skor_Otomatis).toFixed(1)}</td><td class="num">${r.Skor_Essay === '' ? '-' : (+r.Skor_Essay).toFixed(1)}</td><td class="num"><b>${r.Nilai_Akhir === '' ? '-' : (+r.Nilai_Akhir).toFixed(1)}</b></td><td class="num">${r.Pelanggaran}</td></tr>`).join('') || '<tr><td colspan="8" class="mut">Belum ada hasil.</td></tr>'}</tbody></table></div>`;
  },

  // ================= BANK SOAL =================
  drawBank(L) {
    this.bankL = L; const cnt = {}; L.forEach(q => cnt[q.Tipe] = (cnt[q.Tipe] || 0) + 1);
    $('#pg').innerHTML = this.head('Bank soal 5 tipe', `${L.length} butir · ${Object.keys(cnt).map(k => k + ' ' + cnt[k]).join(' · ') || 'kosong'}`,
      `<button class="btn pri" data-s="bnew">+ Tambah soal</button><button class="btn" data-s="btpl">Templat Excel</button><select class="inp" id="im" style="width:auto;min-height:44px"><option value="tambah">Impor: tambahkan</option><option value="ganti">Impor: ganti semua</option></select><button class="btn" data-s="bimp">Impor Excel/CSV</button><button class="btn" data-s="bgam">Gambar massal</button><button class="btn" data-s="prev">Pratinjau</button>`) +
      `<p class="xs mut" style="margin:-8px 0 12px">Gambar diunggah ke Google Drive otomatis. Saat ujian berlangsung, bank soal dikunci.</p><div id="ir"></div>
      <div class="tw"><table><thead><tr><th>NO</th><th>GAMBAR</th><th>TIPE</th><th>SOAL</th><th>KUNCI</th><th>BOBOT</th><th></th></tr></thead><tbody>${L.map(q => `<tr><td class="num">${q.No}</td><td>${q.Gambar_Tampil ? `<img class="thumb" ${imgAttr(q.Gambar_Tampil)} alt="">` : '<span class="mut xs">—</span>'}</td>
        <td><span class="pill pri">${esc(q.Tipe)}</span><div class="xs mut">${esc(q.Level)}</div></td><td>${esc(String(q.Pertanyaan).slice(0, 130))}</td><td class="sm">${q.Tipe === 'ESSAY' ? '<span class="pill warn">RUBRIK AI</span>' : q.Tipe === 'MATCH' ? '<span class="mut">pasangan</span>' : esc(q.Kunci)}</td><td class="num">${q.Bobot}</td>
        <td><div class="row wrap"><button class="btn sm" data-s="bedit" data-id="${esc(q.ID)}">Edit</button><button class="btn sm" data-s="bgam1" data-id="${esc(q.ID)}">Gambar</button><button class="btn sm bad" data-s="bdel" data-id="${esc(q.ID)}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="mut">Belum ada soal. Klik "Tambah soal" atau impor dari Excel.</td></tr>'}</tbody></table></div>`;
  },
  async templatSoal() {
    await saveXLSX('templat_bank_soal.xlsx', [
      { name: 'Soal', cols: SOAL_COLS, wide: { Stimulus: 40, Pertanyaan: 40, Opsi: 50, Rubrik_Essay: 50 }, rows: [
        { No: 1, Tipe: 'PG', Level: 'SEDANG', Stimulus: 'Teks bacaan / data (opsional)', Pertanyaan: 'Contoh pilihan ganda?', Opsi: 'Opsi A|Opsi B|Opsi C|Opsi D', Kunci: 'B', Bobot: 2 },
        { No: 2, Tipe: 'PGK', Level: 'SEDANG', Pertanyaan: 'Pilih semua yang benar', Opsi: 'Pernyataan 1|Pernyataan 2|Pernyataan 3|Pernyataan 4', Kunci: 'A,C', Bobot: 2.5 },
        { No: 3, Tipe: 'BS', Level: 'HOTS', Pertanyaan: 'Tentukan Benar/Salah tiap pernyataan', Opsi: 'Pernyataan 1|Pernyataan 2|Pernyataan 3', Kunci: 'B,S,B', Bobot: 3 },
        { No: 4, Tipe: 'MATCH', Level: 'SEDANG', Pertanyaan: 'Jodohkan', Opsi: 'Kiri 1::Kanan 1|Kiri 2::Kanan 2|Kiri 3::Kanan 3', Kunci: '', Bobot: 3 },
        { No: 5, Tipe: 'ESSAY', Level: 'HOTS', Pertanyaan: 'Jelaskan ...', Rubrik_Essay: 'Indikator 1 (4 poin): ... Indikator 2 (4 poin): ... Indikator 3 (2 poin): ...', Bobot: 10, Skor_Maks: 10 }] },
      { name: 'Petunjuk', cols: ['Kolom', 'Cara pengisian'], wide: { Kolom: 16, 'Cara pengisian': 90 }, rows: [
        { Kolom: 'Tipe', 'Cara pengisian': 'PG, PGK, BS, MATCH, atau ESSAY' },
        { Kolom: 'Opsi', 'Cara pengisian': 'Pisahkan dengan tanda | (garis tegak). Tanpa huruf A/B di depan. MATCH: kiri::kanan|kiri::kanan' },
        { Kolom: 'Kunci', 'Cara pengisian': 'PG: satu huruf (B). PGK: huruf dipisah koma (A,C). BS: B atau S dipisah koma (B,S,B). MATCH & ESSAY: kosong' },
        { Kolom: 'Bobot', 'Cara pengisian': 'Poin soal. PGK/BS/MATCH mendapat skor parsial.' },
        { Kolom: 'Rubrik_Essay', 'Cara pengisian': 'Wajib untuk ESSAY: indikator dan poinnya, dipakai AI untuk menilai.' },
        { Kolom: 'Gambar', 'Cara pengisian': 'Tidak diisi di Excel. Setelah impor, unggah lewat tombol "Gambar" per soal atau "Gambar massal" (nama file = nomor soal, mis. 12.jpg).' }] }]);
  },
  async soalImpor() {
    const [f] = await pickFiles('.xlsx,.xls,.csv'); if (!f) return;
    const mode = $('#im').value;
    if (mode === 'ganti' && !confirm('Ganti SELURUH bank soal ' + this.kode + '? Soal lama dihapus.')) return;
    const rows = await readTable(f);
    const r = await api('bank.impor', { kode: this.kode, mode, rows });
    toast(r.masuk + ' soal masuk' + (r.error.length ? ', ' + r.error.length + ' ditolak' : ''), r.error.length ? 'bad' : 'ok');
    this.reload();
    if (r.error.length) setTimeout(() => { const e = $('#ir'); if (e) e.innerHTML = `<div class="err"><b>Baris ditolak:</b><br>${r.error.slice(0, 15).map(x => `Baris ${x.baris}: ${esc(x.pesan)}`).join('<br>')}</div>`; }, 600);
  },
  async gambarMassal() {
    const files = await pickFiles('image/*', true); if (!files.length) return;
    const byNo = {}; this.bankL.forEach(q => byNo[Number(q.No)] = q);
    const items = files.map(f => ({
      label: f.name, fn: async () => {
        const m = f.name.match(/^\s*(\d+)/); if (!m || !byNo[+m[1]]) throw new Error('nama file harus diawali nomor soal');
        const c = await compressImage(f); const r = await api('upload.gambar', { kode: this.kode, b64: c.b64, mime: c.mime });
        await api('bank.gambar', { kode: this.kode, id: byNo[+m[1]].ID, url: r.url });
      }
    }));
    await this.batch('Unggah gambar soal ke Google Drive', items); this.reload();
  },
  async pratinjau() {
    const L = await api('bank.pratinjau', { kode: this.kode });
    this.modal(`<div class="row between"><h2>Pratinjau (${L.length} butir)</h2><button class="btn sm" data-s="x">Tutup</button></div>${L.map(q => `<div class="card mt8"><span class="pill pri">${TIPE[q.tipe] || q.tipe}</span> <span class="xs mut">${q.bobot} poin</span>${q.stimulus ? `<p class="sm mut mt8">${esc(q.stimulus)}</p>` : ''}${q.gambar ? `<img class="qimg" ${imgAttr(q.gambar)} alt="">` : ''}<p class="mt8"><b>${q.no}.</b> ${esc(q.tanya)}</p><ul class="sm mut" style="padding-left:18px">${(q.opsi || q.kiri || []).map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>`).join('')}`);
  },

  // --- editor satu soal
  soalModal(id) {
    const q = id ? this.bankL.find(x => x.ID === id) : { Tipe: 'PG', Level: 'SEDANG', Bobot: 1, Opsi: '', Stimulus: '', Pertanyaan: '', Kunci: '', Rubrik_Essay: '', Skor_Maks: '', URL_Gambar: '' };
    this.edUrl = q.URL_Gambar || ''; this.edPrev = q.Gambar_Tampil || '';
    const opt = (arr, v) => arr.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
    this.modal(`<h2>${id ? 'Edit soal ' + q.No : 'Tambah soal baru'}</h2>
      <div class="row"><div class="grow"><label class="f" for="st">Tipe soal</label><select class="inp" id="st">${opt(['PG', 'PGK', 'BS', 'MATCH', 'ESSAY'], q.Tipe)}</select></div>
      <div class="grow"><label class="f" for="sl">Level</label><select class="inp" id="sl">${opt(['MUDAH', 'SEDANG', 'HOTS'], q.Level)}</select></div>
      <div class="grow"><label class="f" for="sb">Bobot (poin)</label><input class="inp" id="sb" inputmode="decimal" value="${esc(q.Bobot)}"></div></div>
      <label class="f" for="ss">Stimulus / teks bacaan (opsional)</label><textarea class="inp" id="ss" style="min-height:80px">${esc(q.Stimulus)}</textarea>
      <label class="f">Gambar / diagram (opsional, diunggah ke Google Drive)</label><div id="sgm"></div>
      <label class="f" for="sp">Pertanyaan</label><textarea class="inp" id="sp" style="min-height:80px">${esc(q.Pertanyaan)}</textarea>
      <div id="sbo"><label class="f" for="so" id="sol">Opsi</label><textarea class="inp" id="so" style="min-height:110px">${esc(String(q.Opsi || '').split('|').join('\n'))}</textarea></div>
      <div id="sbk"><label class="f" for="sk2" id="skl">Kunci</label><input class="inp" id="sk2" value="${esc(q.Kunci)}"></div>
      <div id="sbr"><label class="f" for="sr">Rubrik penilaian essay (indikator & poin) — dibaca AI</label><textarea class="inp" id="sr" style="min-height:90px">${esc(q.Rubrik_Essay)}</textarea>
      <label class="f" for="sm2">Skor maksimal essay</label><input class="inp" id="sm2" inputmode="decimal" value="${esc(q.Skor_Maks)}"></div>
      <div class="row mt16"><button class="btn grow" data-s="x">Batal</button><button class="btn pri grow" data-s="ssave" data-id="${esc(id || '')}">Simpan soal</button></div>`);
    $('#st').onchange = () => this.soalSync(); this.soalSync(); this.soalGambar();
  },
  soalSync() {
    const t = $('#st').value, h = HINT[t];
    $('#sbo').classList.toggle('hide', t === 'ESSAY'); $('#sbk').classList.toggle('hide', t === 'MATCH' || t === 'ESSAY'); $('#sbr').classList.toggle('hide', t !== 'ESSAY');
    $('#sol').textContent = 'Opsi — ' + h[0]; $('#skl').textContent = 'Kunci — ' + h[1];
  },
  soalGambar() {
    $('#sgm').innerHTML = this.edUrl ? `<div class="row"><img class="thumb" style="width:120px;height:80px" ${imgAttr(this.edPrev || this.edUrl)} alt=""><button class="btn sm" data-s="sgup">Ganti</button><button class="btn sm bad" data-s="sgdel">Hapus</button></div>`
      : `<button class="btn block" data-s="sgup">Pilih & unggah gambar (JPG/PNG)</button>`;
  },
  async soalSimpan(id) {
    const t = $('#st').value, soal = {
      Tipe: t, Level: $('#sl').value, Bobot: $('#sb').value, Stimulus: $('#ss').value, Pertanyaan: $('#sp').value, URL_Gambar: this.edUrl,
      Opsi: $('#so').value.split('\n').map(x => x.trim()).filter(Boolean).join('|'), Kunci: $('#sk2').value, Rubrik_Essay: $('#sr').value, Skor_Maks: $('#sm2').value
    };
    await api('bank.simpan', { kode: this.kode, id: id || '', soal });
    this.close(); toast('Soal tersimpan', 'ok'); this.reload();
  },

  // ================= KOREKSI ESSAY =================
  drawEssay(E) {
    this.eList = E;
    $('#pg').innerHTML = this.head('Koreksi essay AI', 'AI menilai terhadap rubrik; guru meninjau yang ambigu lalu mengunci skor', `<button class="btn" data-s="esai">Jalankan penilaian AI</button><button class="btn pri" data-s="esall">Setujui semua skor AI yakin</button>`) + '<div id="es"></div>';
    this.essayDraw();
  },
  essayDraw() {
    const E = this.eList, F = ['Semua', 'Menunggu AI', 'Perlu Ditinjau', 'Dinilai AI', 'Disetujui AI', 'Ditinjau Guru', 'Gagal'], host = $('#es'); if (!host) return;
    const L = E.filter(e => this.ui.essayF === 'Semua' || e.Status_Koreksi === this.ui.essayF), e = E.find(x => x.Key === this.ui.essayKey) || L[0];
    const sc = x => x.Skor_Guru !== '' ? x.Skor_Guru : x.Skor_AI;
    host.innerHTML = `<div class="tabs">${F.map(f => `<button data-s="esf" data-v="${f}" class="${f === this.ui.essayF ? 'on' : ''}">${f} (${f === 'Semua' ? E.length : E.filter(x => x.Status_Koreksi === f).length})</button>`).join('')}</div>
      <div class="split"><div>${L.map(x => `<div class="item ${e && x.Key === e.Key ? 'on' : ''}" data-s="es" data-k="${esc(x.Key)}"><div class="row between"><b class="sm">${esc(x.Nama)}</b><span class="num sm">${sc(x) === '' ? '-' : sc(x)}/${x.Skor_Maks}</span></div><div class="xs mut">Soal ${x.No} · ${esc(x.Rombel)}</div><div class="xs warn">${esc(x.Status_Koreksi)}</div></div>`).join('') || '<div class="mut">Tidak ada jawaban pada filter ini.</div>'}</div>
      <div>${e ? `<div class="card"><span class="pill pri">SOAL ${e.No}</span> <span class="pill">MAKS ${e.Skor_Maks}</span><p class="mt8"><b>${esc(e.Pertanyaan)}</b></p><details class="mt8"><summary class="sm mut">Rubrik</summary><p class="sm mt8">${esc(e.Rubrik)}</p></details></div>
      <div class="card mt8"><b class="sm">Jawaban ${esc(e.Nama)}</b><p class="mt8" style="white-space:pre-wrap">${esc(e.Jawaban) || '<span class="mut">(kosong)</span>'}</p></div>
      <div class="card mt8"><b class="sm">Penilaian AI</b> <span class="num ${e.Skor_AI === '' ? 'mut' : 'ok'}">${e.Skor_AI === '' ? 'belum' : e.Skor_AI + ' / ' + e.Skor_Maks}</span><p class="sm mut mt8">${esc(e.Alasan_AI) || 'Menunggu penilaian AI.'}</p></div>
      <div class="card mt8"><b class="sm">Skor final guru</b><div class="row mt8"><input class="inp num" id="sk" type="number" step="0.5" min="0" max="${e.Skor_Maks}" value="${esc(sc(e))}" style="max-width:120px"><span class="mut">/ ${e.Skor_Maks}</span></div>
      <label class="f" for="ck">Catatan untuk siswa (opsional)</label><input class="inp" id="ck" value="${esc(e.Catatan_Guru)}"><button class="btn ok block mt16" data-s="essv" data-k="${esc(e.Key)}">Simpan & kunci skor</button></div>` : '<div class="card mut">Pilih jawaban di sebelah kiri.</div>'}</div></div>`;
  }
};
const Staff = St;
