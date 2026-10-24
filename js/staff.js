'use strict';
/* ExamaTKA — Dasbor staf (admin/pengawas & guru). Akses: index.html#/staff */

const ST_STATUS = {
  'Berlangsung': ['ok', 'MENGERJAKAN'], 'Offline': ['warn', 'OFFLINE'], 'Terkunci': ['bad', 'TERKUNCI'], 'Selesai': ['pri', 'SELESAI'],
  'Auto-Submit': ['pri', 'AUTO-SUBMIT'], 'Didiskualifikasi': ['bad', 'DISKUALIFIKASI'], 'Belum Masuk': ['', 'BELUM MASUK']
};
const stPill = s => { const m = ST_STATUS[s] || ['', s]; return `<span class="pill ${m[0]}">${m[1]}</span>`; };

const St = {
  u: null, page: null, kode: null, mapel: [], timer: null, d: null, f: 'Semua', q: '', eList: [], essayKey: null, essayF: 'Perlu Ditinjau',

  start() {
    const s = Sess.get();
    if (s && (s.role === 'admin' || s.role === 'guru')) { this.u = s; this.boot(); } else this.loginView();
    document.addEventListener('click', e => { const t = e.target.closest('[data-s]'); if (t) this.act(t.dataset.s, t.dataset, t); });
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

  async boot() {
    $('#root').innerHTML = '<div class="spin"></div>';
    try { this.mapel = await api('mapel.list'); } catch (e) { return this.loginView(e.message); }
    const ak = this.mapel.find(m => m.status === 'Aktif'); this.kode = (ak || this.mapel[0] || {}).kode;
    const adm = this.u.role === 'admin';
    const nav = adm ? [['live', 'Live Proctoring'], ['peserta', 'Data Peserta'], ['log', 'Audit Pelanggaran'], ['rekap', 'Rekap Nilai'], ['jadwal', 'Pengaturan Sesi & Token']]
      : [['bank', 'Bank Soal'], ['essay', 'Koreksi Essay AI'], ['rekap', 'Rekap Nilai'], ['log', 'Log Pelanggaran']];
    $('#root').innerHTML = `<div class="shell"><nav class="side"><div class="brand" style="margin-bottom:12px"><div class="logo">E</div><b class="num">ExamaTKA</b></div>
      <div class="card sm" style="margin-bottom:8px"><b>${esc(this.u.nama)}</b><div class="xs mut">${adm ? 'Admin / Pengawas' : 'Guru'}</div></div>
      ${nav.map(n => `<a data-s="go" data-p="${n[0]}" id="n_${n[0]}">${n[1]}</a>`).join('')}
      <div class="grow"></div><a data-s="out">Keluar</a></nav><main class="main"><div class="row mt8" style="margin-bottom:16px"><label class="xs mut" for="mp">UJIAN / MAPEL</label>
      <select class="inp" id="mp" style="max-width:380px;min-height:38px">${this.mapel.map(m => `<option value="${esc(m.kode)}" ${m.kode === this.kode ? 'selected' : ''}>${esc(m.nama)} (${esc(m.kode)})${m.status === 'Aktif' ? ' ● aktif' : ''}</option>`).join('')}</select></div>
      <div id="pg"></div></main></div>`;
    $('#mp').onchange = e => { this.kode = e.target.value; this.go(this.page); };
    this.go(nav[0][0]);
  },

  go(p) {
    clearInterval(this.timer); this.page = p; this.d = null;
    $$('.side a').forEach(a => a.classList.toggle('on', a.id === 'n_' + p));
    $('#pg').innerHTML = '<div class="spin"></div>';
    this[p]().catch(e => { $('#pg').innerHTML = `<div class="err">${esc(e.message)}</div>`; });
  },

  modal(html) { $('#ov').innerHTML = `<div class="modal" data-s="mclose"><div class="box" onclick="event.stopPropagation()">${html}</div></div>`; },
  close() { $('#ov').innerHTML = ''; },
  head(t, sub, btns) { return `<div class="top"><div><h1 style="font-size:24px">${t}</h1><div class="mut sm">${sub || ''}</div></div><div class="row wrap">${btns || ''}</div></div>`; },

  async act(a, ds, el) {
    try {
      if (a === 'go') this.go(ds.p);
      else if (a === 'out') { try { await api('logout'); } catch (e) { } Sess.clear(); location.reload(); }
      else if (a === 'mclose' || a === 'x') this.close();
      else if (a === 'tab') { this.f = ds.v; this.grid(); $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ds.v)); }
      else if (a === 'unb') this.unblockModal(ds.n);
      else if (a === 'unbgo') { await api('admin.unblock', { nisn: ds.n, kode: this.kode, tambahMenit: $('#tm2').value, alasan: $('#al').value }); this.close(); toast('Kunci dibuka & strike direset', 'ok'); this.refresh(); }
      else if (a === 'bc') this.modal(`<h2>Broadcast ke peserta</h2><label class="f" for="bm">Pesan</label><textarea class="inp" id="bm" maxlength="200"></textarea><label class="opt mt8"><input type="checkbox" id="bsr"><span class="sm">Bunyikan sirene di semua perangkat siswa</span></label><div class="row mt16"><button class="btn grow" data-s="x">Batal</button><button class="btn pri grow" data-s="bcgo">Kirim</button></div>`);
      else if (a === 'bcgo') { await api('admin.broadcast', { pesan: $('#bm').value, sirene: $('#bsr').checked }); this.close(); toast('Broadcast terkirim', 'ok'); }
      else if (a === 'pause') { const on = !this.d.pause; await api('admin.pause', { on }); toast(on ? 'Layar siswa dijeda' : 'Jeda dicabut', 'ok'); this.refresh(); }
      else if (a === 'tok') { const r = await api('admin.token', { kode: this.kode }); toast('Token baru: ' + r.token, 'ok'); this.page === 'live' ? this.refresh() : this.go(this.page); }
      else if (a === 'snap') { download(`snapshot_${this.kode}_${Date.now()}.csv`, toCSV(this.d.siswa.map(s => ({ NISN: s.nisn, Nama: s.nama, Rombel: s.rombel, Meja: s.meja, Status: s.status, Terjawab: s.terjawab, Total: s.total, Pelanggaran: s.strike, Nilai: s.nilai })))); }
      else if (a === 'rpin') { const r = await api('admin.resetPin', { nisn: ds.n }); this.modal(`<h2>PIN baru</h2><p class="mut sm">Tampil sekali. Catat dan berikan ke peserta.</p><div class="card num" style="font-size:36px;text-align:center;letter-spacing:.2em">${esc(r.pin)}</div><button class="btn pri block mt16" data-s="x">Selesai</button>`); }
      else if (a === 'padd') await this.pesertaTambah();
      else if (a === 'jsave') await this.jadwalSimpan();
      else if (a === 'bap') this.bapModal(ds.id);
      else if (a === 'bapgo') { await api('admin.resolve', { logId: ds.id, keputusan: $('input[name=kp]:checked').value, catatan: $('#bc').value, tambahMenit: $('#bt').value }); this.close(); toast('Keputusan tersimpan', 'ok'); this.go('log'); }
      else if (a === 'bank') this.go('bank');
      else if (a === 'prev') this.pratinjau();
      else if (a === 'tmpl') this.templat();
      else if (a === 'es') { this.essayKey = ds.k; this.essayDraw(); }
      else if (a === 'esf') { this.essayF = ds.v; this.essayDraw(); }
      else if (a === 'essv') { await api('essay.simpan', { kode: this.kode, key: ds.k, skor: $('#sk').value, catatan: $('#ck').value }); toast('Skor tersimpan', 'ok'); this.essayLoad(true); }
      else if (a === 'esall') { const r = await api('essay.setujuiAI', { kode: this.kode }); toast(r.disetujui + ' skor AI disetujui', 'ok'); this.essayLoad(); }
      else if (a === 'esai') { el.disabled = true; const r = await api('essay.nilaiAI', { kode: this.kode }); toast(r.pesan || r.diproses + ' jawaban dinilai AI', r.pesan ? 'bad' : 'ok'); this.essayLoad(); }
      else if (a === 'csv') download(ds.n + '.csv', toCSV(this.rows, ds.c ? ds.c.split('|') : null));
    } catch (e) { toast(e.message, 'bad'); }
  },
  refresh() { if (this.page === 'live') api('admin.monitor', { kode: this.kode }).then(d => { this.d = d; this.drawLive(); }).catch(() => { }); },

  // ================= ADMIN: LIVE =================
  async live() {
    const load = async () => { this.d = await api('admin.monitor', { kode: this.kode }); this.drawLive(); };
    await load(); this.timer = setInterval(() => load().catch(() => { }), MONITOR_MS);
  },
  drawLive() {
    const d = this.d, s = d.setting, L = d.siswa, c = k => L.filter(x => x.status === k).length;
    if (!$('#lvg')) $('#pg').innerHTML = this.head('Live proctoring & ruang pengawas', 'Pembaruan otomatis tiap 10 detik', `<span class="pill ${s.Status === 'Aktif' ? 'ok' : ''}">${s.Status === 'Aktif' ? 'SESI BERLANGSUNG' : 'SESI DITUTUP'}</span>
      <span class="card num" style="padding:8px 14px;font-size:20px;letter-spacing:.15em" id="tkn"></span><button class="btn sm" data-s="tok">Token baru</button><button class="btn pri" data-s="bc">Broadcast</button><button class="btn warn" data-s="pause" id="pz"></button><button class="btn" data-s="snap">Snapshot CSV</button>`) +
      `<div class="kpis" id="kp"></div><div class="row wrap"><div class="tabs">${['Semua', 'Berlangsung', 'Terkunci', 'Offline', 'Selesai', 'Belum Masuk'].map(t => `<button data-s="tab" data-v="${t}" class="${t === this.f ? 'on' : ''}">${t}</button>`).join('')}</div>
      <input class="inp grow" id="sq" placeholder="Cari nama / NISN / meja" style="max-width:300px;min-height:38px" value="${esc(this.q)}"></div>
      <div class="split" style="grid-template-columns:1fr 320px"><div class="stn" id="lvg"></div><div class="card"><b class="num">Log pelanggaran terbaru</b><div id="lg" class="col mt8"></div></div></div>`;
    $('#sq').oninput = e => { this.q = e.target.value; this.grid(); };
    $('#tkn').textContent = s.Token_Aktif || '------'; $('#pz').textContent = d.pause ? 'Cabut jeda' : 'Kunci sementara';
    $('#kp').innerHTML = [['Total peserta', L.length, ''], ['Mengerjakan', c('Berlangsung'), 'ok'], ['Terkunci', c('Terkunci'), 'bad'], ['Offline', c('Offline'), 'warn'], ['Selesai', L.filter(x => ['Selesai', 'Auto-Submit', 'Didiskualifikasi'].includes(x.status)).length, ''], ['Memanggil', L.filter(x => x.memanggil).length, 'warn']]
      .map(k => `<div class="card kpi"><span class="xs mut">${k[0].toUpperCase()}</span><b class="${k[2]}">${k[1]}</b></div>`).join('');
    $('#lg').innerHTML = d.log.length ? d.log.map(l => `<div class="sm" style="border-bottom:1px solid var(--line);padding-bottom:6px"><span class="num ${l.Strike >= 3 ? 'bad' : 'warn'}">${fmtT(l.Timestamp)}</span> <b>${esc(l.Nama)}</b><br><span class="mut">${esc(l.Jenis)} · strike ${l.Strike}</span></div>`).join('') : '<div class="mut sm">Belum ada pelanggaran.</div>';
    this.grid();
  },
  grid() {
    const q = this.q.toLowerCase(), now = this.d.serverNow;
    const L = this.d.siswa.filter(x => (this.f === 'Semua' || x.status === this.f) && (!q || (x.nama + x.nisn + x.meja).toLowerCase().includes(q)))
      .sort((a, b) => (b.memanggil - a.memanggil) || (b.status === 'Terkunci') - (a.status === 'Terkunci'));
    $('#lvg').innerHTML = L.map(x => `<div class="card ${x.status === 'Terkunci' ? 'lock' : x.strike ? 'wn' : ''}"><div class="row between">${stPill(x.status)}<span class="xs mut num">${esc(x.meja)}</span></div>
      <b style="display:block;margin-top:8px">${esc(x.nama)} ${x.memanggil ? '<span class="pill warn">MEMANGGIL</span>' : ''}</b><div class="xs mut">NISN ${esc(x.nisn)} · ${esc(x.rombel)}</div>
      ${x.status === 'Belum Masuk' ? '' : `<div class="bar"><i style="width:${x.total ? x.terjawab / x.total * 100 : 0}%"></i></div><div class="row between xs"><span>${x.terjawab}/${x.total} soal</span><span class="${x.strike ? 'warn' : 'mut'}">strike ${x.strike}</span><span class="mut">${x.sisaDetik != null ? 'sisa ' + fmtDur(x.sisaDetik) : x.nilai != null ? 'nilai ' + (+x.nilai).toFixed(1) : ''}</span></div>${x.ping && x.status !== 'Selesai' ? `<div class="xs mut">ping ${Math.max(0, Math.round((now - x.ping) / 1000))} dtk lalu</div>` : ''}`}
      ${x.status === 'Terkunci' || x.memanggil ? `<button class="btn ok sm block mt8" data-s="unb" data-n="${esc(x.nisn)}">Buka kunci</button>` : ''}</div>`).join('') || '<div class="mut">Tidak ada peserta pada filter ini.</div>';
  },
  unblockModal(n) {
    const x = this.d.siswa.find(s => s.nisn === n);
    this.modal(`<h2>Buka kunci: ${esc(x.nama)}</h2><p class="sm mut">Strike direset ke 0. Jawaban tetap utuh.</p><label class="f" for="tm2">Kompensasi tambahan waktu</label>
      <select class="inp" id="tm2"><option value="0">Tanpa tambahan</option><option>5</option><option>10</option><option>15</option></select>
      <label class="f" for="al">Alasan validasi</label><input class="inp" id="al" placeholder="mis. kendala teknis / koneksi terputus"><div class="row mt16"><button class="btn grow" data-s="x">Batal</button><button class="btn ok grow" data-s="unbgo" data-n="${esc(n)}">Buka kunci sekarang</button></div>`);
  },

  // ================= ADMIN: PESERTA =================
  async peserta() {
    const L = await api('admin.peserta'); this.rows = L; this.d = L;
    $('#pg').innerHTML = this.head('Data peserta ujian', `${L.length} peserta terdaftar`, `<label class="btn"><input type="file" id="imp" accept=".csv" hidden>Impor CSV</label><button class="btn" data-s="csv" data-n="peserta" data-c="NISN|Nama|Rombel|No_Meja">Ekspor</button>`) +
      `<div class="split" style="grid-template-columns:1fr 320px"><div><input class="inp" id="pq" placeholder="Cari NISN / nama / rombel" style="margin-bottom:12px"><div class="tw"><table><thead><tr><th>NISN</th><th>NAMA</th><th>ROMBEL</th><th>MEJA</th><th>STATUS</th><th></th></tr></thead><tbody id="pt"></tbody></table></div></div>
      <div class="card"><h3>Tambah / ubah peserta</h3><label class="f" for="pn1">NISN</label><input class="inp" id="pn1" inputmode="numeric"><label class="f" for="pn2">Nama lengkap</label><input class="inp" id="pn2">
      <label class="f" for="pn3">Rombel</label><input class="inp" id="pn3"><label class="f" for="pn4">No. meja / PC</label><input class="inp" id="pn4"><label class="f" for="pn5">PIN (kosong = acak / tidak diubah)</label><input class="inp" id="pn5" maxlength="6" inputmode="numeric">
      <button class="btn pri block mt16" data-s="padd">Simpan</button><p class="xs mut mt8">Format CSV impor: NISN, Nama, Rombel, No_Meja, PIN (opsional).</p></div></div>`;
    const draw = () => { const q = $('#pq').value.toLowerCase(); $('#pt').innerHTML = L.filter(s => (s.Nama + s.NISN + s.Rombel).toLowerCase().includes(q)).slice(0, 300).map(s => `<tr><td class="num">${esc(s.NISN)}</td><td>${esc(s.Nama)}</td><td>${esc(s.Rombel)}</td><td>${esc(s.No_Meja)}</td><td>${s.Status_Kunci ? '<span class="pill bad">TERKUNCI</span>' : ''}</td><td><button class="btn sm" data-s="rpin" data-n="${esc(s.NISN)}">Reset PIN</button></td></tr>`).join(''); };
    $('#pq').oninput = draw; draw();
    $('#imp').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const r = await api('admin.pesertaImpor', { rows: parseCSV(await f.text()) });
        this.modal(`<h2>Impor selesai</h2><p>${r.berhasil.length} peserta masuk, ${r.error.length} gagal.</p>${r.error.length ? `<div class="err">${r.error.slice(0, 10).map(x => `Baris ${x.baris}: ${esc(x.pesan)}`).join('<br>')}</div>` : ''}
          <p class="sm warn mt8">PIN hanya tampil sekarang. Unduh daftar PIN lalu simpan aman.</p><button class="btn pri block mt8" id="dl">Unduh daftar PIN (CSV)</button><button class="btn block mt8" data-s="x">Tutup</button>`);
        $('#dl').onclick = () => download('pin_peserta.csv', toCSV(r.berhasil)); this.go('peserta');
      } catch (x) { toast(x.message, 'bad'); }
    };
  },
  async pesertaTambah() {
    const r = await api('admin.pesertaSimpan', { NISN: $('#pn1').value, Nama: $('#pn2').value, Rombel: $('#pn3').value, No_Meja: $('#pn4').value, PIN: $('#pn5').value });
    this.modal(`<h2>Tersimpan</h2>${r.pin ? `<p class="sm mut">PIN peserta (tampil sekali):</p><div class="card num" style="font-size:36px;text-align:center;letter-spacing:.2em">${esc(r.pin)}</div>` : '<p>Data peserta diperbarui.</p>'}<button class="btn pri block mt16" data-s="x">Selesai</button>`);
    this.go('peserta');
  },

  // ================= ADMIN: JADWAL / TOKEN =================
  async jadwal() {
    const L = await api('admin.jadwal'), s = L.find(x => x.Kode_Mapel === this.kode) || {};
    $('#pg').innerHTML = this.head('Pengaturan sesi & token', 'Satu ujian aktif pada satu waktu. Mengaktifkan ujian lain menutup yang sebelumnya.') +
      `<div class="split" style="grid-template-columns:1fr 1fr"><div class="card"><h3>Konfigurasi ${esc(s.Kode_Mapel || 'baru')}</h3>
      <label class="f" for="j0">Kode mapel (huruf/angka/strip)</label><input class="inp" id="j0" value="${esc(s.Kode_Mapel || this.kode || '')}">
      <label class="f" for="j1">Nama ujian</label><input class="inp" id="j1" value="${esc(s.Nama_Ujian || '')}">
      <div class="row"><div class="grow"><label class="f" for="j2">Durasi (menit)</label><input class="inp" id="j2" inputmode="numeric" value="${esc(s.Durasi_Menit || 90)}"></div><div class="grow"><label class="f" for="j3">Batas pelanggaran</label><input class="inp" id="j3" inputmode="numeric" value="${esc(s.Batas_Pelanggaran || 3)}"></div></div>
      <div class="row"><div class="grow"><label class="f" for="j4">Status</label><select class="inp" id="j4"><option ${s.Status !== 'Aktif' ? 'selected' : ''}>Tutup</option><option ${s.Status === 'Aktif' ? 'selected' : ''}>Aktif</option></select></div>
      <div class="grow"><label class="f" for="j5">Rotasi token (menit, 0=manual)</label><input class="inp" id="j5" inputmode="numeric" value="${esc(s.Auto_Refresh_Menit || 0)}"></div></div>
      <div class="row"><div class="grow"><label class="f" for="j6">Acak urutan soal</label><select class="inp" id="j6"><option ${s.Acak_Soal !== 'Tidak' ? 'selected' : ''}>Ya</option><option ${s.Acak_Soal === 'Tidak' ? 'selected' : ''}>Tidak</option></select></div>
      <div class="grow"><label class="f" for="j7">Tampilkan nilai ke siswa</label><select class="inp" id="j7"><option ${s.Tampilkan_Nilai === 'Ya' ? 'selected' : ''}>Ya</option><option ${s.Tampilkan_Nilai !== 'Ya' ? 'selected' : ''}>Tidak</option></select></div></div>
      <label class="opt mt8"><input type="checkbox" id="j8"><span class="sm">Mulai ulang timer serentak sekarang (saat disimpan sebagai Aktif)</span></label>
      <button class="btn pri block mt16" data-s="jsave">Simpan konfigurasi</button></div>
      <div class="card"><h3>Token sesi</h3><div class="card num" style="font-size:40px;text-align:center;letter-spacing:.25em;margin:12px 0">${esc(s.Token_Aktif || '------')}</div>
      <button class="btn block" data-s="tok">Rilis token baru</button><p class="xs mut mt8">Token baru tidak mengeluarkan siswa yang sedang mengerjakan. Siswa yang terputus tetap bisa lanjut tanpa token.</p>
      <h3 class="mt16">Semua ujian</h3>${L.map(x => `<div class="row between sm" style="padding:6px 0;border-top:1px solid var(--line)"><span>${esc(x.Nama_Ujian)} <span class="mut">(${esc(x.Kode_Mapel)})</span></span>${stPill(x.Status === 'Aktif' ? 'Berlangsung' : 'Belum Masuk').replace('MENGERJAKAN', 'AKTIF').replace('BELUM MASUK', 'TUTUP')}</div>`).join('')}</div></div>`;
  },
  async jadwalSimpan() {
    const r = await api('admin.jadwalSimpan', { Kode_Mapel: $('#j0').value, Nama_Ujian: $('#j1').value, Durasi_Menit: $('#j2').value, Batas_Pelanggaran: $('#j3').value, Status: $('#j4').value, Auto_Refresh_Menit: $('#j5').value, Acak_Soal: $('#j6').value, Tampilkan_Nilai: $('#j7').value, mulaiSekarang: $('#j8').checked });
    toast('Konfigurasi tersimpan', 'ok'); this.kode = r.Kode_Mapel; this.mapel = await api('mapel.list'); this.boot();
  },

  // ================= LOG & BAP =================
  async log() {
    const L = await api('log.list', { kode: this.kode }); this.d = L; this.rows = L.map(l => ({ ID: l.ID, Waktu: fmtD(l.Timestamp), NISN: l.NISN, Nama: l.Nama, Jenis: l.Jenis, Detail: l.Detail, Durasi: l.Durasi_Detik, Strike: l.Strike, Status: l.Status_Resolusi, Keputusan: l.Keputusan, Catatan: l.Catatan_Pengawas }));
    const n = k => L.filter(l => k.test(l.Status_Resolusi)).length, adm = this.u.role === 'admin';
    $('#pg').innerHTML = this.head('Audit log pelanggaran', 'Catatan forensik dari server (waktu server, bukan jam perangkat siswa)', `<button class="btn" data-s="csv" data-n="log_pelanggaran">Ekspor CSV</button>`) +
      `<div class="kpis">${[['Total insiden', L.length, ''], ['Terkunci', n(/^Terkunci/), 'bad'], ['Sanggahan masuk', n(/Sanggahan/), 'warn'], ['Selesai ditangani', n(/Di-unblock|Diskualifikasi|Ditoleransi/), 'ok']].map(k => `<div class="card kpi"><span class="xs mut">${k[0].toUpperCase()}</span><b class="${k[2]}">${k[1]}</b></div>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>WAKTU</th><th>PESERTA</th><th>JENIS</th><th>STRIKE</th><th>STATUS</th><th></th></tr></thead><tbody>${L.map(l => `<tr class="${/Terkunci|Sanggahan/.test(l.Status_Resolusi) ? 'hl' : ''}"><td class="num">${fmtD(l.Timestamp)}<br><span class="xs mut">${esc(l.ID)}</span></td><td><b>${esc(l.Nama)}</b><br><span class="xs mut">${esc(l.NISN)} · ${esc(l.Rombel)} · ${esc(l.No_Meja)}</span></td><td>${esc(l.Jenis)}<br><span class="xs mut">${esc(l.Detail)}${l.Durasi_Detik ? ' · ' + l.Durasi_Detik + ' dtk' : ''}</span></td><td class="num">${l.Strike}</td><td><span class="pill ${/Terkunci/.test(l.Status_Resolusi) ? 'bad' : /Sanggahan|Peringatan/.test(l.Status_Resolusi) ? 'warn' : 'ok'}">${esc(l.Status_Resolusi)}</span></td><td>${adm ? `<button class="btn sm" data-s="bap" data-id="${esc(l.ID)}">BAP</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="mut">Belum ada pelanggaran.</td></tr>'}</tbody></table></div>`;
  },
  bapModal(id) {
    const l = this.d.find(x => x.ID === id), ada = l.Keputusan;
    this.modal(`<h2>Berita Acara Pelanggaran Digital</h2><p class="sm mut">${esc(l.ID)} · ${fmtD(l.Timestamp)}</p>
      <div class="card mt8"><b>${esc(l.Nama)}</b> <span class="mut sm">NISN ${esc(l.NISN)} · ${esc(l.Rombel)} · meja ${esc(l.No_Meja)}</span><div class="sm mt8">${esc(l.Jenis)} — ${esc(l.Detail)} ${l.Durasi_Detik ? '(' + l.Durasi_Detik + ' detik)' : ''}<br>Strike ke-${l.Strike} · perangkat: <span class="mut">${esc(l.Device)}</span></div></div>
      ${l.Sanggahan_Teks ? `<div class="card mt8" style="border-color:var(--warn-bg)"><b class="warn sm">Sanggahan siswa (${esc(l.Sanggahan_Kategori)})</b><p class="sm mt8">${esc(l.Sanggahan_Teks)}</p><div class="xs mut">Meja: ${esc(l.Sanggahan_Meja)}</div></div>` : '<p class="sm mut mt8">Tidak ada sanggahan dari siswa.</p>'}
      ${ada ? `<div class="card mt8 ok sm">Sudah diputuskan: <b>${esc(l.Status_Resolusi)}</b> oleh ${esc(l.Diputuskan_Oleh)}. ${esc(l.Catatan_Pengawas)}</div>` : `
      <label class="f">Keputusan pengawas</label>
      <label class="opt"><input type="radio" name="kp" value="unblock" checked><span class="sm"><b>Unblock bersyarat</b> — reset strike, lanjut mengerjakan</span></label>
      <label class="opt"><input type="radio" name="kp" value="toleransi"><span class="sm"><b>Toleransi penuh</b> — gangguan teknis, bukan kesalahan siswa</span></label>
      <label class="opt"><input type="radio" name="kp" value="diskualifikasi"><span class="sm bad"><b>Diskualifikasi</b> — ujian dibatalkan, nilai 0</span></label>
      <div class="row"><div class="grow"><label class="f" for="bt">Tambah waktu</label><select class="inp" id="bt"><option value="0">0 menit</option><option>5</option><option>10</option><option>15</option></select></div></div>
      <label class="f" for="bc">Catatan berita acara</label><textarea class="inp" id="bc" maxlength="400"></textarea>`}
      <div class="row mt16"><button class="btn grow" data-s="x">Tutup</button>${ada ? '' : `<button class="btn pri grow" data-s="bapgo" data-id="${esc(id)}">Eksekusi keputusan</button>`}</div>`);
  },

  // ================= REKAP =================
  async rekap() {
    const L = await api('rekap', { kode: this.kode }); this.rows = L.map(r => Object.assign({}, r, { Waktu_Mulai: fmtD(r.Waktu_Mulai), Waktu_Submit: fmtD(r.Waktu_Submit) }));
    const sel = L.filter(r => r.Status !== 'Berlangsung' && r.Status !== 'Terkunci'), avg = sel.length ? sel.reduce((a, r) => a + Number(r.Nilai_Akhir || 0), 0) / sel.length : 0;
    $('#pg').innerHTML = this.head('Rekap nilai', `${L.length} peserta · rata-rata nilai selesai ${avg.toFixed(1)}`, `<button class="btn pri" data-s="csv" data-n="rekap_${esc(this.kode)}">Ekspor CSV</button>`) +
      `<div class="tw"><table><thead><tr><th>NISN</th><th>NAMA</th><th>ROMBEL</th><th>STATUS</th><th>OBJEKTIF</th><th>ESSAY</th><th>NILAI</th><th>PELANGGARAN</th></tr></thead><tbody>${L.map(r => `<tr><td class="num">${esc(r.NISN)}</td><td>${esc(r.Nama)}</td><td>${esc(r.Rombel)}</td><td>${stPill(r.Status)}</td><td class="num">${r.Skor_Otomatis === '' ? '-' : (+r.Skor_Otomatis).toFixed(1)}</td><td class="num">${r.Skor_Essay === '' ? '-' : (+r.Skor_Essay).toFixed(1)}</td><td class="num"><b>${r.Nilai_Akhir === '' ? '-' : (+r.Nilai_Akhir).toFixed(1)}</b></td><td class="num">${r.Pelanggaran}</td></tr>`).join('') || '<tr><td colspan="8" class="mut">Belum ada hasil.</td></tr>'}</tbody></table></div>`;
  },

  // ================= GURU: BANK SOAL =================
  async bank() {
    const L = await api('bank.list', { kode: this.kode }); this.d = L; const cnt = {}; L.forEach(q => cnt[q.Tipe] = (cnt[q.Tipe] || 0) + 1);
    $('#pg').innerHTML = this.head('Bank soal 5 tipe', `${L.length} butir · ${Object.keys(cnt).map(k => k + ' ' + cnt[k]).join(' · ') || 'kosong'}`, `<button class="btn" data-s="tmpl">Unduh templat CSV</button><button class="btn" data-s="prev">Pratinjau tampilan siswa</button>
      <select class="inp" id="im" style="width:auto;min-height:44px"><option value="tambah">Tambahkan</option><option value="ganti">Ganti seluruh bank</option></select><label class="btn pri"><input type="file" id="ib" accept=".csv" hidden>Impor CSV</label>`) +
      `<div id="ir"></div><div class="tw"><table><thead><tr><th>NO</th><th>TIPE</th><th>SOAL</th><th>KUNCI</th><th>BOBOT</th></tr></thead><tbody>${L.map(q => `<tr><td class="num">${q.No}<br><span class="xs mut">${esc(q.ID)}</span></td><td><span class="pill pri">${esc(q.Tipe)}</span><div class="xs mut">${esc(q.Level)}</div></td><td>${esc(String(q.Pertanyaan).slice(0, 140))}</td><td class="sm">${q.Tipe === 'ESSAY' ? '<span class="pill warn">RUBRIK AI</span>' : q.Tipe === 'MATCH' ? '<span class="mut">pasangan di Opsi</span>' : esc(q.Kunci)}</td><td class="num">${q.Bobot}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">Belum ada soal. Unduh templat, isi, lalu impor.</td></tr>'}</tbody></table></div>`;
    $('#ib').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if ($('#im').value === 'ganti' && !confirm('Ganti SELURUH bank soal ' + this.kode + '? Soal lama dihapus.')) return;
      try {
        const r = await api('bank.impor', { kode: this.kode, mode: $('#im').value, rows: parseCSV(await f.text()) });
        toast(r.masuk + ' soal masuk' + (r.error.length ? ', ' + r.error.length + ' ditolak' : ''), r.error.length ? 'bad' : 'ok');
        await this.bank(); if (r.error.length) $('#ir').innerHTML = `<div class="err">${r.error.slice(0, 12).map(x => `Baris ${x.baris}: ${esc(x.pesan)}`).join('<br>')}</div>`;
      } catch (x) { toast(x.message, 'bad'); }
    };
  },
  templat() {
    const c = ['No', 'Tipe', 'Level', 'Stimulus', 'URL_Gambar', 'Pertanyaan', 'Opsi', 'Kunci', 'Bobot', 'Rubrik_Essay', 'Skor_Maks'];
    download('templat_bank_soal.csv', toCSV([
      { No: 1, Tipe: 'PG', Level: 'SEDANG', Stimulus: 'Teks bacaan / data', Pertanyaan: 'Contoh pilihan ganda?', Opsi: 'Opsi A|Opsi B|Opsi C|Opsi D', Kunci: 'B', Bobot: 2 },
      { No: 2, Tipe: 'PGK', Level: 'SEDANG', Pertanyaan: 'Pilih semua yang benar', Opsi: 'Pernyataan 1|Pernyataan 2|Pernyataan 3|Pernyataan 4', Kunci: 'A,C', Bobot: 2.5 },
      { No: 3, Tipe: 'BS', Level: 'HOTS', Pertanyaan: 'Tentukan Benar/Salah', Opsi: 'Pernyataan 1|Pernyataan 2|Pernyataan 3', Kunci: 'B,S,B', Bobot: 3 },
      { No: 4, Tipe: 'MATCH', Level: 'SEDANG', Pertanyaan: 'Jodohkan', Opsi: 'Kiri 1::Kanan 1|Kiri 2::Kanan 2|Kiri 3::Kanan 3', Kunci: '', Bobot: 3 },
      { No: 5, Tipe: 'ESSAY', Level: 'HOTS', Pertanyaan: 'Jelaskan ...', Rubrik_Essay: 'Indikator 1 (4 poin): ... Indikator 2 (4 poin): ... Indikator 3 (2 poin): ...', Bobot: 10, Skor_Maks: 10 }
    ], c));
  },
  async pratinjau() {
    const L = await api('bank.pratinjau', { kode: this.kode });
    this.modal(`<div class="row between"><h2>Pratinjau (${L.length} butir)</h2><button class="btn sm" data-s="x">Tutup</button></div>${L.map(q => `<div class="card mt8"><span class="pill pri">${TIPE[q.tipe] || q.tipe}</span> <span class="xs mut">${q.bobot} poin</span>${q.stimulus ? `<p class="sm mut mt8">${esc(q.stimulus)}</p>` : ''}${q.gambar ? `<img class="qimg" src="${esc(q.gambar)}" alt="">` : ''}<p class="mt8"><b>${q.no}.</b> ${esc(q.tanya)}</p><ul class="sm mut" style="padding-left:18px">${(q.opsi || q.kiri || []).map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>`).join('')}`);
  },

  // ================= GURU: KOREKSI ESSAY =================
  async essay() {
    $('#pg').innerHTML = this.head('Koreksi essay AI', 'AI menilai terhadap rubrik; guru meninjau yang ambigu lalu mengunci skor', `<button class="btn" data-s="esai">Jalankan penilaian AI</button><button class="btn pri" data-s="esall">Setujui semua skor AI yakin</button>`) + '<div id="es"></div>';
    await this.essayLoad();
  },
  async essayLoad(keep) {
    this.eList = await api('essay.list', { kode: this.kode });
    if (!keep || !this.eList.find(e => e.Key === this.essayKey)) this.essayKey = null; this.essayDraw();
  },
  essayDraw() {
    const E = this.eList, F = ['Semua', 'Menunggu AI', 'Perlu Ditinjau', 'Dinilai AI', 'Disetujui AI', 'Ditinjau Guru', 'Gagal'];
    const L = E.filter(e => this.essayF === 'Semua' || e.Status_Koreksi === this.essayF), e = E.find(x => x.Key === this.essayKey) || L[0];
    const sc = x => x.Skor_Guru !== '' ? x.Skor_Guru : x.Skor_AI;
    $('#es').innerHTML = `<div class="tabs">${F.map(f => `<button data-s="esf" data-v="${f}" class="${f === this.essayF ? 'on' : ''}">${f} (${f === 'Semua' ? E.length : E.filter(x => x.Status_Koreksi === f).length})</button>`).join('')}</div>
      <div class="split"><div>${L.map(x => `<div class="item ${e && x.Key === e.Key ? 'on' : ''}" data-s="es" data-k="${esc(x.Key)}"><div class="row between"><b class="sm">${esc(x.Nama)}</b><span class="num sm">${sc(x) === '' ? '-' : sc(x)}/${x.Skor_Maks}</span></div><div class="xs mut">Soal ${x.No} · ${esc(x.Rombel)}</div><div class="xs warn">${esc(x.Status_Koreksi)}</div></div>`).join('') || '<div class="mut">Tidak ada jawaban pada filter ini.</div>'}</div>
      <div>${e ? `<div class="card"><span class="pill pri">SOAL ${e.No}</span> <span class="pill">MAKS ${e.Skor_Maks}</span><p class="mt8"><b>${esc(e.Pertanyaan)}</b></p><details class="mt8"><summary class="sm mut">Rubrik</summary><p class="sm mt8">${esc(e.Rubrik)}</p></details></div>
      <div class="card mt8"><b class="sm">Jawaban ${esc(e.Nama)}</b><p class="mt8" style="white-space:pre-wrap">${esc(e.Jawaban) || '<span class="mut">(kosong)</span>'}</p></div>
      <div class="card mt8"><b class="sm">Penilaian AI</b> <span class="num ${e.Skor_AI === '' ? 'mut' : 'ok'}">${e.Skor_AI === '' ? 'belum' : e.Skor_AI + ' / ' + e.Skor_Maks}</span><p class="sm mut mt8">${esc(e.Alasan_AI) || 'Menunggu penilaian AI.'}</p></div>
      <div class="card mt8"><b class="sm">Skor final guru</b><div class="row mt8"><input class="inp num" id="sk" type="number" step="0.5" min="0" max="${e.Skor_Maks}" value="${esc(sc(e))}" style="max-width:120px"><span class="mut">/ ${e.Skor_Maks}</span></div>
      <label class="f" for="ck">Catatan untuk siswa (opsional)</label><input class="inp" id="ck" value="${esc(e.Catatan_Guru)}"><button class="btn ok block mt16" data-s="essv" data-k="${esc(e.Key)}">Simpan & kunci skor</button></div>` : '<div class="card mut">Pilih jawaban di sebelah kiri.</div>'}</div></div>`;
  }
};
const Staff = St;
