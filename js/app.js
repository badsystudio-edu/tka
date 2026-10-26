'use strict';
/* ExamaTKA — Router + alur siswa (login → ujian → selesai) */

const Router = {
  start() {
    addEventListener('hashchange', () => location.reload());
    if (location.hash.startsWith('#/staff')) Staff.start(); else Siswa.start();
  },
  authLost() {
    Sess.clear(); toast('Sesi berakhir atau akun dipakai di perangkat lain.', 'bad');
    setTimeout(() => location.reload(), 1500);
  }
};

const TIPE = { PG: 'Pilihan Ganda', PGK: 'PG Kompleks', BS: 'Benar / Salah', MATCH: 'Menjodohkan', ESSAY: 'Essay' };
const TIPE_HINT = { PG: 'Pilih 1 opsi yang tepat', PGK: 'Pilih semua opsi yang benar', BS: 'Tentukan Benar atau Salah tiap pernyataan', MATCH: 'Pasangkan tiap butir dengan jawabannya', ESSAY: 'Tulis jawaban uraian' };
const KATEGORI = [
  ['popup', 'Pop-up OS / sistem tak terduga', 'Peringatan baterai, update OS, atau notifikasi antivirus.'],
  ['wifi', 'Kendala Wi-Fi / roaming jaringan', 'Sinyal lab drop atau perpindahan IP router.'],
  ['gesture', 'Salah sentuh / gestur navigasi HP', 'Swipe tepi layar memicu Recent Apps/Back tanpa sengaja.'],
  ['pengawas', 'Didampingi pengawas meja', 'Pengawas ada di meja saya saat perangkat bermasalah.']
];

const Siren = {
  ctx: null,
  unlock() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume(); } catch (e) { } },
  play(sec = 4) {
    if (!this.ctx || Siswa.S.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.type = 'square'; g.gain.value = .12; o.connect(g); g.connect(this.ctx.destination);
    for (let i = 0; i < sec * 2; i++) o.frequency.setValueAtTime(i % 2 ? 900 : 600, t + i * .5);
    o.start(); o.stop(t + sec);
  }
};

const Siswa = {
  S: { d: null, ans: {}, ragu: new Set(), cur: 0, end: 0, dirty: false, strike: 0, batas: 3, locked: false, active: false, fs: false, away: null, lastRep: 0, logId: null, sent: {}, bc: 0, muted: false, pending: [], busy: false },

  // ---------- Awal ----------
  async start() {
    document.documentElement.setAttribute('data-theme', 'light'); // siswa: tema terang saja
    const s = Sess.get();
    if (s && s.role === 'siswa') {
      $('#root').innerHTML = '<div class="spin"></div>';
      try { return this.begin(await api('siswa.mulai', { token: '' })); } catch (e) { Sess.clear(); }
    }
    this.login();
  },

  async login(err) {
    let info = { sekolah: 'ExamaTKA', ujian: null };
    try { info = await apiGet('publicInfo'); } catch (e) { err = err || e.message; }
    const u = info.ujian;
    $('#root').innerHTML = `<div class="m">
      <div class="card row"><div class="logo">${info.logo ? `<img src="${esc(info.logo)}" alt="" width="44" height="44">` : 'E'}</div>
        <div><div class="xs mut">Sekolah penyelenggara</div><b>${esc(info.sekolah)}</b></div></div>
      <h1 style="font-size:26px;margin:24px 0 4px">Masuk peserta ujian</h1>
      <p class="mut sm">Verifikasi identitas dan token sesi untuk memulai lembar jawaban digital.</p>
      ${u ? `<div class="card mt16"><span class="pill ok">Ujian dibuka</span><h2 style="font-size:20px;margin:8px 0">${esc(u.nama)}</h2>
        <div class="row sm mut"><span>${u.durasi} menit</span><span>·</span><span>${u.butir} butir</span><span>·</span><span>${u.tipe.map(t => TIPE[t] || t).join(', ')}</span></div></div>`
        : `<div class="card mt16 mut sm">Belum ada ujian yang dibuka. Tunggu arahan pengawas.</div>`}
      <form id="fl" autocomplete="off">
        <label class="f" for="nisn">NISN / Nomor peserta</label><input class="inp num" id="nisn" inputmode="numeric" required>
        <label class="f" for="pin">PIN keamanan (6 angka pada kartu)</label><input class="inp num" id="pin" type="password" inputmode="numeric" maxlength="6" required>
        <label class="f" for="tok">Token ujian dari pengawas</label><input class="inp num" id="tok" maxlength="6" style="letter-spacing:.35em;text-transform:uppercase;text-align:center;font-size:20px" required>
        <div class="card mt16" style="border-color:var(--bad-bg);background:var(--lockbg)"><b class="bad">Protokol keamanan ketat</b>
          <p class="sm mut mt8">Dilarang berpindah aplikasi, membuka tab lain, atau keluar dari layar penuh. Setiap pelanggaran dicatat dan memicu sirene. Melewati batas pelanggaran mengunci akun Anda.</p></div>
        ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
        <button class="btn pri block mt16" id="go" ${u ? '' : 'disabled'}>MULAI KERJAKAN UJIAN</button>
      </form>
      <p class="xs mut mt16" style="text-align:center"><a href="#/staff" style="color:var(--mut)">Masuk sebagai guru / admin</a></p></div>`;
    $('#fl').onsubmit = e => { e.preventDefault(); this.doLogin(); };
  },

  async doLogin() {
    const nisn = $('#nisn').value.trim(), pin = $('#pin').value.trim(), tok = $('#tok').value.trim();
    Siren.unlock(); this.enterFS(); // harus di dalam gestur klik
    const b = $('#go'); b.disabled = true; b.textContent = 'Memverifikasi...';
    try {
      const r = await api('login.siswa', { nisn, pin });
      Sess.set(r);
      this.begin(await api('siswa.mulai', { token: tok }));
    } catch (e) { Sess.clear(); this.login(e.message); }
  },

  enterFS() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().then(() => this.S.fs = true).catch(() => { });
  },

  // ---------- Mulai ujian ----------
  begin(d) {
    const S = this.S; S.d = d; S.strike = d.strike; S.batas = d.batas; S.cur = Math.min(d.cur || 0, d.soal.length - 1);
    S.end = Date.now() + d.sisaDetik * 1000; S.active = true;
    let local = {}; try { local = JSON.parse(localStorage.getItem(this.bk()) || '{}'); } catch (e) { }
    S.ans = Object.assign({}, d.jawaban, local); S.ragu = new Set(S.ans.__ragu || []);
    this.guards(); this.renderExam();
    S.tick = setInterval(() => this.tick(), 1000);
    S.poll = setInterval(() => this.sync(), POLL_MS);
    this.sync(true);
  },
  bk() { return 'exama_' + Sess.get().id + '_' + this.S.d.kode; },
  sisa() { return Math.round((this.S.end - Date.now()) / 1000); },

  tick() {
    const s = this.sisa(), el = $('#tm'); if (!el) return;
    el.textContent = fmtDur(s); el.className = 'timer' + (s < 60 ? ' u' : s < 300 ? ' w' : '');
    if (s <= 0 && this.S.active && !this.S.busy) this.submit(true);
  },

  // ---------- Anti-cheat ----------
  guards() {
    const S = this.S, away = (jenis, detail) => { if (S.active && !S.away) S.away = { t: Date.now(), jenis, detail }; };
    document.addEventListener('visibilitychange', () => document.hidden ? away('Window Blur / Tab', 'Tab atau aplikasi ujian tidak aktif') : this.back());
    addEventListener('blur', () => away('Window Blur / Tab', 'Jendela ujian kehilangan fokus'));
    addEventListener('focus', () => this.back());
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && S.fs && S.active) this.report('Keluar Fullscreen', 'Keluar dari mode layar penuh', 0);
      S.fs = !!document.fullscreenElement || S.fs;
    });
    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart'].forEach(ev => document.addEventListener(ev, e => { if (S.active) e.preventDefault(); }));
    document.addEventListener('keydown', e => { if (S.active && (e.key === 'F12' || (e.ctrlKey && ['c', 'v', 'x', 'u', 'p', 's'].includes(e.key.toLowerCase())) || (e.ctrlKey && e.shiftKey))) { e.preventDefault(); if (e.key === 'F12' || e.shiftKey) this.report('DevTools Shortcut', 'Percobaan membuka alat pengembang', 0); } });
    addEventListener('beforeunload', e => { if (S.active) { e.preventDefault(); e.returnValue = ''; } });
    addEventListener('online', () => this.sync(true));
  },
  back() {
    const S = this.S; if (!S.away || document.hidden) return;
    const a = S.away; S.away = null; const dur = Math.round((Date.now() - a.t) / 1000);
    if (dur >= 1) this.report(a.jenis, a.detail, dur);
  },
  async report(jenis, detail, dur) {
    const S = this.S, now = Date.now();
    if (!S.active || S.locked || now - S.lastRep < 2000) return;
    S.lastRep = now; Siren.play(3);
    const body = { kode: S.d.kode, jenis, detail, durasi: dur, device: navigator.userAgent.slice(0, 100) };
    try {
      const r = await api('siswa.pelanggaran', body);
      S.strike = r.strike; S.batas = r.batas; S.logId = r.logId || S.logId;
      r.terkunci ? this.showLocked() : this.showViolation(jenis, detail, dur);
    } catch (e) { S.pending.push(body); this.showViolation(jenis, detail, dur, true); }
  },

  // ---------- Sinkronisasi ----------
  async sync(force) {
    const S = this.S; if (!S.active) return;
    for (const p of S.pending.splice(0)) { try { const r = await api('siswa.pelanggaran', p); S.strike = r.strike; S.logId = r.logId || S.logId; if (r.terkunci) this.showLocked(); } catch (e) { S.pending.push(p); } }
    const body = { kode: S.d.kode, cur: S.cur };
    if (S.dirty || force) { body.jawaban = this.ansOut(); body.terjawab = S.d.soal.filter(q => this.filled(q)).length; }
    try {
      const r = await api('siswa.ping', body); S.dirty = false; this.setSaved(true);
      S.end = Date.now() + r.sisaDetik * 1000; S.strike = r.strike; S.batas = r.batas;
      if (['Selesai', 'Auto-Submit', 'Didiskualifikasi'].includes(r.status)) return this.submit(true, true);
      if (r.status === 'Terkunci' && !S.locked) this.showLocked();
      if (r.status === 'Berlangsung' && S.locked) { S.locked = false; $('#ov').innerHTML = ''; toast('Kunci dibuka pengawas. Silakan lanjutkan.', 'ok'); this.enterFS(); }
      if (r.bc && r.bc.id !== S.bc) { S.bc = r.bc.id; if (r.bc.sirene) Siren.play(5); this.overlay(`<div class="box"><h2>Pesan pengawas</h2><p class="qtext">${esc(r.bc.pesan || 'Perhatian dari pengawas ruang.')}</p><button class="btn pri block" data-a="close">Mengerti</button></div>`); }
      if (r.pause && !S.paused) { S.paused = true; this.overlay(`<div class="box"><h2>Ujian dijeda sementara</h2><p class="mut">Pengawas menjeda layar. Tunggu instruksi, jangan tutup halaman ini.</p></div>`, true); }
      if (!r.pause && S.paused) { S.paused = false; $('#ov').innerHTML = ''; }
    } catch (e) { this.setSaved(false); }
  },
  setSaved(ok) { const el = $('#sv'); if (el) { el.textContent = ok ? 'Tersimpan' : 'Offline — jawaban aman di perangkat'; el.className = 'xs ' + (ok ? 'ok' : 'warn'); } },
  ansOut() { const a = Object.assign({}, this.S.ans); a.__ragu = [...this.S.ragu]; return a; },
  save() { this.S.dirty = true; try { localStorage.setItem(this.bk(), JSON.stringify(this.ansOut())); } catch (e) { } this.setSaved(false); clearTimeout(this.S.deb); this.S.deb = setTimeout(() => this.sync(), 4000); },
  filled(q) { const a = this.S.ans[q.id]; return !(a === undefined || a === '' || (Array.isArray(a) && !a.some(x => x)) || (a && typeof a === 'object' && !Array.isArray(a) && !Object.values(a).some(x => x))); },

  // ---------- Tampilan ujian ----------
  renderExam() {
    const S = this.S, d = S.d;
    $('#root').innerHTML = `<div class="hud"><div class="row">${(Sess.get() || {}).foto ? `<img class="av" ${imgAttr(Sess.get().foto)} alt="">` : '<div class="logo" style="width:32px;height:32px;font-size:14px">E</div>'}<div><b class="num">${esc((Sess.get() || {}).nama || 'ExamaTKA')}</b><div class="xs ok">● PROCTOR ACTIVE</div></div></div>
      <div class="col" style="align-items:flex-end;gap:2px"><div class="timer" id="tm">${fmtDur(this.sisa())}</div><div id="sv" class="xs ok">Tersimpan</div></div></div>
      <div class="m"><div class="row between"><div><div class="xs mut">NOMOR SOAL</div><b class="num" id="qn"></b></div><span class="pill ${S.strike ? 'warn' : ''}" id="st">Pelanggaran ${S.strike}/${S.batas}</span></div>
      <div class="nav" id="nv"></div><div id="qa"></div></div>
      <div class="dock"><div class="in"><button class="btn" data-a="prev">← Sebelum</button><button class="btn warn" data-a="ragu">⚑ Ragu</button><button class="btn pri" data-a="next" id="nx">Berikut →</button><button class="btn" data-a="grid" aria-label="Daftar soal">▦</button></div></div>`;
    $('#root').onclick = e => { const t = e.target.closest('[data-a]'); if (t) this.act(t.dataset.a, t.dataset); };
    $('#root').oninput = e => { const t = e.target; if (t.dataset.essay) { S.ans[t.dataset.essay] = t.value; this.save(); this.nav(); } };
    $('#root').onchange = e => { const t = e.target; if (t.dataset.m) { const q = S.d.soal[S.cur], o = Object.assign({}, S.ans[q.id] || {}); o[t.dataset.m] = t.value; S.ans[q.id] = o; this.save(); this.nav(); } };
    this.renderQ();
  },

  nav() {
    const S = this.S;
    $('#nv').innerHTML = S.d.soal.map((q, i) => `<button class="qb ${this.filled(q) ? 'a' : ''} ${S.ragu.has(q.id) ? 'r' : ''} ${i === S.cur ? 'c' : ''}" data-a="go" data-i="${i}" aria-label="Soal ${i + 1}">${i + 1}</button>`).join('');
    const c = $('#nv .c'); if (c) c.scrollIntoView({ inline: 'center', block: 'nearest' });
    $('#st').textContent = `Pelanggaran ${S.strike}/${S.batas}`; $('#st').className = 'pill ' + (S.strike ? 'warn' : '');
  },

  renderQ() {
    const S = this.S, q = S.d.soal[S.cur], a = S.ans[q.id], L = i => String.fromCharCode(65 + i), clean = t => esc(t).replace(/^[A-E][.)]\s*/, '');
    let body = '';
    if (q.tipe === 'PG') body = q.opsi.map((o, i) => `<button class="opt ${a === L(i) ? 'on' : ''}" data-a="pg" data-v="${L(i)}"><span class="k num">${L(i)}</span><span>${clean(o)}</span></button>`).join('');
    else if (q.tipe === 'PGK') body = q.opsi.map((o, i) => `<button class="opt ${(a || []).includes(L(i)) ? 'on' : ''}" data-a="pgk" data-v="${L(i)}"><span class="k num">${(a || []).includes(L(i)) ? '✓' : L(i)}</span><span>${clean(o)}</span></button>`).join('');
    else if (q.tipe === 'BS') body = q.opsi.map((o, i) => `<div class="card" style="margin-bottom:8px"><div>${esc(o)}</div><div class="bs">${['B', 'S'].map(v => `<button class="opt ${(a || [])[i] === v ? 'on' : ''}" data-a="bs" data-i="${i}" data-v="${v}">${v === 'B' ? 'Benar' : 'Salah'}</button>`).join('')}</div></div>`).join('');
    else if (q.tipe === 'MATCH') body = q.kiri.map((k, i) => `<div class="card" style="margin-bottom:8px"><div>${esc(k)}</div><select class="inp mt8" data-m="${i}"><option value="">— pilih pasangan —</option>${q.kanan.map(r => `<option ${a && a[i] === r ? 'selected' : ''} value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>`).join('');
    else body = `<textarea class="inp" data-essay="${esc(q.id)}" placeholder="Tulis jawaban Anda di sini..." spellcheck="false">${esc(a || '')}</textarea>`;
    $('#qa').innerHTML = `<div class="row between mt8"><span class="pill pri">${TIPE[q.tipe]}</span><span class="xs mut">${TIPE_HINT[q.tipe]} · ${q.bobot} poin</span></div>
      ${q.stimulus || q.gambar ? `<div class="card mt16"><div class="stim">${esc(q.stimulus).replace(/\n/g, '<br>')}</div>${q.gambar ? `<img class="qimg" ${imgAttr(q.gambar)} alt="Gambar soal ${q.no}">` : ''}</div>` : ''}
      <div class="qtext">${esc(q.tanya).replace(/\n/g, '<br>')}</div>${body}`;
    $('#qn').textContent = `${S.cur + 1} dari ${S.d.soal.length}`;
    $('#nx').textContent = S.cur === S.d.soal.length - 1 ? 'Kirim ✓' : 'Berikut →';
    this.nav(); scrollTo(0, 0);
  },

  act(a, ds) {
    const S = this.S, q = S.d.soal[S.cur], n = S.d.soal.length;
    if (a === 'pg') { S.ans[q.id] = ds.v; this.save(); this.renderQ(); }
    else if (a === 'pgk') { const s = new Set(S.ans[q.id] || []); s.has(ds.v) ? s.delete(ds.v) : s.add(ds.v); S.ans[q.id] = [...s].sort(); this.save(); this.renderQ(); }
    else if (a === 'bs') { const arr = (S.ans[q.id] || []).slice(); while (arr.length < q.opsi.length) arr.push(''); arr[ds.i] = ds.v; S.ans[q.id] = arr; this.save(); this.renderQ(); }
    else if (a === 'go') { S.cur = +ds.i; this.renderQ(); this.sync(); $('#ov').innerHTML = ''; }
    else if (a === 'prev') { if (S.cur > 0) { S.cur--; this.renderQ(); this.sync(); } }
    else if (a === 'next') { if (S.cur < n - 1) { S.cur++; this.renderQ(); this.sync(); } else this.confirm(); }
    else if (a === 'ragu') { S.ragu.has(q.id) ? S.ragu.delete(q.id) : S.ragu.add(q.id); this.save(); this.nav(); toast(S.ragu.has(q.id) ? 'Ditandai ragu-ragu' : 'Tanda ragu dihapus'); }
    else if (a === 'grid') this.overlay(`<div class="box"><div class="row between"><h2>Daftar soal</h2><button class="btn sm" data-a="close">Tutup</button></div>
      <div class="grid5 mt16">${S.d.soal.map((x, i) => `<button class="qb ${this.filled(x) ? 'a' : ''} ${S.ragu.has(x.id) ? 'r' : ''} ${i === S.cur ? 'c' : ''}" data-a="go" data-i="${i}">${i + 1}</button>`).join('')}</div>
      <button class="btn pri block mt16" data-a="confirm">Periksa & kirim jawaban</button></div>`);
    else if (a === 'confirm') this.confirm();
    else if (a === 'close') $('#ov').innerHTML = '';
    else if (a === 'send') this.submit(false);
    else if (a === 'call') { api('siswa.panggil').then(() => toast('Pengawas dipanggil. Tunjukkan layar ini.', 'ok')).catch(e => toast(e.message, 'bad')); }
    else if (a === 'appeal') this.appeal();
    else if (a === 'mute') { S.muted = !S.muted; toast(S.muted ? 'Sirene dibisukan di perangkat ini' : 'Sirene aktif'); }
  },

  overlay(html, full) {
    $('#ov').innerHTML = `<div class="ov ${full ? 'full' : ''}" id="ovb">${html}</div>`;
    $('#ovb').onclick = e => { const t = e.target.closest('[data-a]'); if (t) this.act(t.dataset.a, t.dataset); };
  },

  // ---------- Overlay pelanggaran / kunci / sanggahan ----------
  showViolation(jenis, detail, dur, offline) {
    const S = this.S, sisa = Math.max(0, S.batas - S.strike);
    this.overlay(`<div class="box" style="text-align:center"><div class="ring" style="background:var(--bad-bg);margin:0 auto 12px;border:2px solid var(--bad)">!</div>
      <div class="pill bad">PERINGATAN PELANGGARAN</div><h2 style="margin:12px 0 4px">Pelanggaran terdeteksi</h2>
      <p class="mut sm">Anda keluar dari halaman ujian atau berpindah aplikasi.${offline ? ' (Belum tercatat di server — akan dikirim otomatis.)' : ''}</p>
      <div class="card mt16" style="text-align:left"><div class="row between"><b class="sm">Status pelanggaran</b><b class="warn num">${S.strike} dari ${S.batas}</b></div>
        <div class="bar"><i style="width:${Math.min(100, S.strike / S.batas * 100)}%;background:var(--warn)"></i></div>
        <div class="sm warn">${sisa <= 1 ? 'Pelanggaran berikutnya mengunci akun Anda.' : `Sisa kuota: ${sisa}.`}</div>
        <div class="sm mut mt8">${esc(jenis)}${dur ? ' · ' + dur + ' detik' : ''}<br>${esc(detail)}</div></div>
      <button class="btn pri block hold mt16" id="hd"><i></i><span>TAHAN 3 DETIK UNTUK LANJUT</span></button>
      <div class="row mt8"><button class="btn grow" data-a="call">Panggil pengawas</button>${S.logId ? '<button class="btn warn grow" data-a="appeal">Ajukan sanggahan</button>' : ''}</div></div>`);
    this.holdBtn();
  },
  holdBtn() {
    const b = $('#hd'); if (!b) return; let t;
    const stop = () => { clearTimeout(t); $('i', b).style.transition = 'none'; $('i', b).style.width = '0'; };
    b.onpointerdown = () => { $('i', b).style.transition = 'width 3s linear'; $('i', b).style.width = '100%'; t = setTimeout(() => { $('#ov').innerHTML = ''; this.enterFS(); }, 3000); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
  },
  showLocked() {
    const S = this.S; S.locked = true;
    this.overlay(`<div class="box" style="text-align:center"><div class="ring" style="background:var(--bad-bg);margin:0 auto 12px;border:2px solid var(--bad)">🔒</div>
      <h2 class="bad">Akun terkunci</h2><p class="mut">Batas pelanggaran tercapai. Jawaban Anda tersimpan. Menunggu pengawas membuka kunci — halaman ini akan lanjut otomatis.</p>
      <div class="row mt16">${S.logId && !S.sent[S.logId] ? '<button class="btn warn grow" data-a="appeal">Ajukan sanggahan</button>' : ''}<button class="btn grow" data-a="call">Panggil pengawas</button></div></div>`, true);
  },
  appeal() {
    const S = this.S, meja = (Sess.get() || {}).meja || '';
    this.overlay(`<div class="box"><div class="row between"><h2>Form sanggahan</h2>${S.locked ? '' : '<button class="btn sm" data-a="close">Tutup</button>'}</div>
      <p class="sm mut">Kejadian #${esc(S.logId)}. Satu sanggahan per kejadian, diperiksa pengawas.</p>
      <label class="f">1. Kategori gangguan</label>${KATEGORI.map((k, i) => `<label class="opt"><input type="radio" name="kat" value="${k[0]}" ${i ? '' : 'checked'}><span><b class="sm">${k[1]}</b><br><span class="xs mut">${k[2]}</span></span></label>`).join('')}
      <label class="f" for="kr">2. Kronologi singkat (min. 20 karakter)</label><textarea class="inp" id="kr" maxlength="600"></textarea>
      <label class="f" for="mj">3. Nomor meja</label><input class="inp" id="mj" value="${esc(meja)}">
      <label class="opt mt8"><input type="checkbox" id="jj"><span class="sm">Saya menyatakan keterangan ini benar. Jika terbukti sengaja membuka aplikasi lain, saya bersedia didiskualifikasi.</span></label>
      <div id="ae"></div><button class="btn pri block mt8" id="as">Kirim sanggahan</button></div>`, S.locked);
    $('#as').onclick = async () => {
      if (!$('#jj').checked) return $('#ae').innerHTML = '<div class="err">Centang pernyataan kejujuran.</div>';
      try { await api('siswa.sanggah', { logId: S.logId, kategori: $('input[name=kat]:checked').value, kronologi: $('#kr').value, meja: $('#mj').value }); S.sent[S.logId] = 1; toast('Sanggahan terkirim ke pengawas.', 'ok'); S.locked ? this.showLocked() : $('#ov').innerHTML = ''; }
      catch (e) { $('#ae').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
  },

  // ---------- Kirim & selesai ----------
  confirm() {
    const S = this.S, n = S.d.soal.length, k = S.d.soal.filter(q => !this.filled(q)).length;
    this.overlay(`<div class="box"><h2>Kirim jawaban?</h2><div class="grid5 mt16" style="grid-template-columns:repeat(3,1fr)">
      <div class="card"><b class="num ok">${n - k}</b><div class="xs mut">Terjawab</div></div><div class="card"><b class="num ${k ? 'bad' : ''}">${k}</b><div class="xs mut">Belum dijawab</div></div><div class="card"><b class="num warn">${S.ragu.size}</b><div class="xs mut">Ragu-ragu</div></div></div>
      <p class="sm mut mt16">Setelah dikirim, jawaban tidak dapat diubah.</p><div class="row mt8"><button class="btn grow" data-a="close">Kembali periksa</button><button class="btn pri grow" data-a="send">Kirim sekarang</button></div></div>`);
  },
  async submit(auto, already) {
    const S = this.S; if (S.busy) return; S.busy = true;
    $('#ov').innerHTML = '<div class="ov full"><div class="spin"></div></div>';
    for (let i = 0; i < 4; i++) {
      try { return this.finish(await api('siswa.kirim', { kode: S.d.kode, jawaban: this.ansOut(), auto: !!auto })); }
      catch (e) { if (/sudah|terkunci/i.test(e.message)) { S.busy = false; this.overlay(`<div class="box"><p>${esc(e.message)}</p></div>`); return; } await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
    }
    S.busy = false; this.overlay(`<div class="box"><h2>Gagal mengirim</h2><p class="mut">Koneksi bermasalah. Jawaban aman di perangkat.</p><button class="btn pri block" data-a="send">Coba kirim lagi</button></div>`);
  },
  finish(r) {
    const S = this.S; S.active = false; clearInterval(S.tick); clearInterval(S.poll);
    try { localStorage.removeItem(this.bk()); } catch (e) { }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    $('#ov').innerHTML = '';
    const per = r.per || {}, dq = r.status === 'Didiskualifikasi';
    $('#root').innerHTML = `<div class="m"><div class="card" style="text-align:center"><div class="ring" style="background:${dq ? 'var(--bad-bg)' : 'var(--ok-bg)'};margin:0 auto 12px">${dq ? '✕' : '✓'}</div>
      <h1 style="font-size:24px">${dq ? 'Ujian dibatalkan pengawas' : 'Jawaban berhasil terkirim'}</h1><p class="mut sm mt8">${dq ? 'Hubungi pengawas ruang untuk keterangan.' : 'Jawaban Anda sudah tersimpan aman di server.'}</p></div>
      <div class="card mt16"><div class="xs mut">PESERTA</div><b>${esc(r.nama)}</b><div class="sm mut">NISN ${esc(r.nisn)} · ${esc(r.rombel)}</div><div class="sm mut mt8">${esc(r.mapel)}</div>
        <div class="row wrap mt8 sm"><span class="pill">${r.durasiMenit} menit</span><span class="pill">${r.terjawab}/${r.total} terjawab</span><span class="pill ${r.pelanggaran ? 'warn' : 'ok'}">${r.pelanggaran} pelanggaran</span></div></div>
      ${r.tampil && !dq ? `<div class="card mt16"><div class="xs mut">ESTIMASI NILAI AKHIR</div><div class="row between"><b class="num" style="font-size:40px">${(+r.nilai).toFixed(1)}<span class="mut" style="font-size:16px"> / 100</span></b></div>
        <div class="sm mut">Skor objektif ${(+r.skorObjektif).toFixed(1)} / ${(+r.objMax).toFixed(1)}${r.essayAda ? ' · Essay sedang dikoreksi, nilai dapat berubah.' : ''}</div>
        <div class="col mt16">${Object.keys(per).map(t => `<div class="row between sm"><span>${TIPE[t] || t}</span><span class="num">${t === 'ESSAY' ? 'menunggu koreksi' : `${per[t].benar}/${per[t].total} benar · ${(+per[t].skor).toFixed(1)}/${(+per[t].max).toFixed(1)}`}</span></div>`).join('')}</div></div>`
        : '<div class="card mt16 mut sm">Nilai tidak ditampilkan. Guru akan menyampaikan hasil.</div>'}
      <button class="btn pri block mt16" id="out">Keluar & selesaikan sesi</button></div>`;
    $('#out').onclick = () => { Sess.clear(); location.reload(); };
  }
};
