/**
 * ExamaTKA — Kode.gs
 * Backend REST API (Google Apps Script) untuk frontend GitHub Pages.
 * Isi file ini: konfigurasi, router doGet/doPost, sesi, util Sheets/Cache, setup.
 * Logika ujian, admin, guru, dan koreksi essay AI ada di Modul.gs.
 */

const APP_NAME = 'ExamaTKA';

const CONFIG = {
  get SPREADSHEET_ID() { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); },
  get ROOT_FOLDER_ID() { return PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID'); },
  get UPLOADS_FOLDER() { return PropertiesService.getScriptProperties().getProperty('UPLOADS_FOLDER'); },
  get EXPORTS_FOLDER() { return PropertiesService.getScriptProperties().getProperty('EXPORTS_FOLDER'); },
  NISN_LEN: 10,              // NISN resmi 10 digit; dipakai memulihkan angka nol yang hilang
  SESSION_TTL: 21600,        // 6 jam (batas maksimum CacheService)
  PING_OFFLINE_MS: 45000     // lewat ini tanpa ping = dianggap offline
};

// Skema kolom tiap tab (urutan = urutan kolom di Google Sheets)
const SCHEMA = {
  AppConfig:        ['key', 'value', 'keterangan'],
  Konfigurasi:      ['key', 'value'],
  Data_Pengguna:    ['Username', 'Nama', 'Role', 'PIN_Hash', 'Mapel'],
  Data_Siswa:       ['NISN', 'Nama', 'Rombel', 'PIN_Hash', 'No_Meja', 'Status_Kunci', 'PIN_Teks', 'Foto_URL'],
  Bank_Soal:        ['ID', 'Kode_Mapel', 'No', 'Tipe', 'Level', 'Stimulus', 'URL_Gambar', 'Pertanyaan', 'Opsi', 'Kunci', 'Bobot', 'Rubrik_Essay', 'Skor_Maks'],
  Pengaturan_Ujian: ['Kode_Mapel', 'Nama_Ujian', 'Durasi_Menit', 'Token_Aktif', 'Token_Dibuat', 'Status', 'Acak_Soal', 'Tampilkan_Nilai', 'Batas_Pelanggaran', 'Auto_Refresh_Menit', 'Waktu_Mulai_Global', 'Token_Lama'],
  Hasil_Ujian:      ['NISN', 'Nama', 'Rombel', 'No_Meja', 'Kode_Mapel', 'Jawaban_JSON', 'Skor_Otomatis', 'Skor_Essay', 'Nilai_Akhir', 'Skor_Maks_Total', 'Jumlah_Pelanggaran', 'Waktu_Mulai', 'Waktu_Submit', 'Status', 'Terakhir_Ping', 'Terjawab', 'Tambahan_Menit', 'Rincian_JSON'],
  Hasil_Essay:      ['Key', 'NISN', 'Nama', 'Rombel', 'Kode_Mapel', 'ID_Soal', 'Jawaban', 'Bobot', 'Skor_Maks', 'Skor_AI', 'Alasan_AI', 'Skor_Guru', 'Catatan_Guru', 'Status_Koreksi', 'Percobaan'],
  Log_Pelanggaran:  ['ID', 'Timestamp', 'NISN', 'Nama', 'Rombel', 'No_Meja', 'Kode_Mapel', 'Jenis', 'Detail', 'Durasi_Detik', 'Strike', 'Device', 'Status_Resolusi', 'Sanggahan_Kategori', 'Sanggahan_Teks', 'Sanggahan_Meja', 'Keputusan', 'Catatan_Pengawas', 'Diputuskan_Oleh']
};

// Kolom yang harus berformat teks agar angka nol di depan (NISN) tidak hilang
const TEXT_COLS = {
  Data_Siswa: ['NISN', 'No_Meja', 'PIN_Teks'], Data_Pengguna: ['Username'],
  Hasil_Ujian: ['NISN'], Hasil_Essay: ['NISN'], Log_Pelanggaran: ['NISN']
};

// ============================================
// ENTRY POINTS
// ============================================

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'publicInfo';
    if (action === 'publicInfo') return out_({ success: true, data: publicInfo_() });
    if (action === 'gambar') return out_({ success: true, data: ambilGambar_(e.parameter.id) }); // gambar via backend bila Drive tidak boleh dibagikan publik
    return out_({ success: false, message: 'Action tidak dikenal' });
  } catch (err) {
    return out_({ success: false, message: err.message });
  }
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const route = getRoutes_()[p.action];
    if (!route) throw new Error('Action tidak dikenal: ' + p.action);
    let sess = null;
    if (route.roles) {
      sess = getSession_(p.token);
      if (!sess) return out_({ success: false, code: 'AUTH', message: 'Sesi berakhir atau akun dipakai di perangkat lain. Silakan masuk lagi.' });
      if (route.roles.indexOf(sess.role) < 0) return out_({ success: false, code: 'FORBIDDEN', message: 'Akses ditolak.' });
    }
    const data = route.fn(p.data || {}, sess);
    return out_({ success: true, data: data, serverTime: Date.now() });
  } catch (err) {
    return out_({ success: false, message: err.message });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// SESI (CacheService) & PIN
// ============================================

function newSession_(info) {
  const t = Utilities.getUuid().replace(/-/g, '');
  cput_('sess_' + t, info, CONFIG.SESSION_TTL);
  // Satu akun siswa = satu sesi aktif: login baru menggantikan yang lama
  if (info.role === 'siswa') cput_('act_' + info.id, t, CONFIG.SESSION_TTL);
  return t;
}

function getSession_(t) {
  if (!t) return null;
  const s = cget_('sess_' + t);
  if (!s) return null;
  if (s.role === 'siswa' && cget_('act_' + s.id) !== t) return null;
  return s;
}

function hashPin_(pin) {
  const salt = PropertiesService.getScriptProperties().getProperty('PIN_SALT') || '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + String(pin), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomPin_() { return String(Math.floor(100000 + Math.random() * 900000)); }

// ============================================
// UTIL SHEETS
// ============================================

function sheet_(name) { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name); }

// Sheets bisa mengubah "0068192341" menjadi angka 68192341. Pulihkan sebagai teks 10 digit saat dibaca.
function normVal_(name, key, v) {
  if (typeof v === 'number' && (TEXT_COLS[name] || []).indexOf(key) >= 0) {
    let t = String(v);
    if (key === 'NISN' && t.length < CONFIG.NISN_LEN) t = ('0000000000' + t).slice(-CONFIG.NISN_LEN);
    return t;
  }
  return v;
}

function rows_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const h = v[0];
  return v.slice(1).map(function (r, i) {
    const o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = normVal_(name, k, r[j]); });
    return o;
  }).filter(function (o) { return String(o[h[0]]) !== ''; });
}

function getRowObj_(name, row) {
  const h = SCHEMA[name];
  const v = sheet_(name).getRange(row, 1, 1, h.length).getValues()[0];
  const o = { _row: row };
  h.forEach(function (k, i) { o[k] = normVal_(name, k, v[i]); });
  return o;
}

// Tulis dengan format teks lebih dulu agar NISN/PIN/No_Meja tidak diubah Sheets menjadi angka
function appendRow_(name, obj) {
  const sh = sheet_(name), h = SCHEMA[name], row = sh.getLastRow() + 1;
  (TEXT_COLS[name] || []).forEach(function (c) { sh.getRange(row, h.indexOf(c) + 1).setNumberFormat('@'); });
  sh.getRange(row, 1, 1, h.length).setValues([h.map(function (k) { return obj[k] === undefined ? '' : obj[k]; })]);
}

function updateRow_(name, row, patch) {
  const h = SCHEMA[name], sh = sheet_(name);
  const rng = sh.getRange(row, 1, 1, h.length);
  const v = rng.getValues()[0];
  Object.keys(patch).forEach(function (k) {
    const i = h.indexOf(k);
    if (i < 0) return;
    if ((TEXT_COLS[name] || []).indexOf(k) >= 0) sh.getRange(row, i + 1).setNumberFormat('@');
    v[i] = patch[k];
  });
  rng.setValues([v]);
}

// ============================================
// UTIL CACHE & LOCK
// ============================================

function C_() { return CacheService.getScriptCache(); }
function cget_(k) { const v = C_().get(k); return v ? JSON.parse(v) : null; }
function cput_(k, o, ttl) { try { C_().put(k, JSON.stringify(o), ttl || 300); } catch (e) { /* nilai terlalu besar: lewati cache */ } }
function cdel_(k) { C_().remove(k); }
function cached_(k, ttl, fn) { let v = cget_(k); if (v !== null) return v; v = fn(); cput_(k, v, ttl); return v; }

function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(waitMs || 10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function yes_(v) { return /^(ya|true|1|yes)$/i.test(String(v).trim()); }
function round2_(n) { return Math.round(Number(n) * 100) / 100; }
function safeJson_(s, def) { try { return s ? JSON.parse(s) : def; } catch (e) { return def; } }

// ============================================
// SETUP — Jalankan SEKALI saat pertama install
// ============================================

function setupAppEnvironment() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SPREADSHEET_ID')) {
    Logger.log('⚠️ Setup sudah pernah dijalankan. Hapus Script Properties dulu jika ingin mengulang.');
    return;
  }
  Logger.log('🚀 Memulai setup ' + APP_NAME + '...');
  props.setProperty('PIN_SALT', Utilities.getUuid());

  const root = DriveApp.createFolder('📁 ' + APP_NAME);
  const uploads = root.createFolder('📂 Uploads (gambar soal)');
  const exportsF = root.createFolder('📂 Exports');
  const ss = SpreadsheetApp.create('🗃️ Database — ' + APP_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);

  props.setProperties({
    SPREADSHEET_ID: ss.getId(), ROOT_FOLDER_ID: root.getId(),
    UPLOADS_FOLDER: uploads.getId(), EXPORTS_FOLDER: exportsF.getId()
  });

  // Buat semua tab + header
  const first = ss.getActiveSheet().setName('AppConfig');
  Object.keys(SCHEMA).forEach(function (name) {
    const sh = name === 'AppConfig' ? first : ss.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]])
      .setFontWeight('bold').setBackground('#4F46E5').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (c) {
      sh.getRange(1, SCHEMA[name].indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  const cfg = sheet_('AppConfig');
  [['APP_NAME', APP_NAME, 'Nama aplikasi'], ['ROOT_FOLDER_ID', root.getId(), 'Folder root Drive'],
   ['UPLOADS_ID', uploads.getId(), 'Folder gambar soal (atur: siapa saja dengan link dapat melihat)'],
   ['EXPORTS_ID', exportsF.getId(), 'Folder ekspor'], ['SPREADSHEET_ID', ss.getId(), 'ID spreadsheet'],
   ['CREATED_AT', new Date().toISOString(), 'Tanggal setup']].forEach(function (r) { cfg.appendRow(r); });

  appendRow_('Konfigurasi', { key: 'nama_sekolah', value: 'SMA Negeri 1 Prestasi Nusantara' });
  appendRow_('Konfigurasi', { key: 'logo_url', value: '' });

  // Data contoh
  const adminPin = randomPin_(), guruPin = randomPin_();
  appendRow_('Data_Pengguna', { Username: 'admin', Nama: 'Admin Ujian', Role: 'admin', PIN_Hash: hashPin_(adminPin), Mapel: '' });
  appendRow_('Data_Pengguna', { Username: 'guru1', Nama: 'Guru Fisika', Role: 'guru', PIN_Hash: hashPin_(guruPin), Mapel: 'FIS-TKA' });
  [['0068192341', 'Ahmad Rizky Pratama', 'XII MIPA 1', 'R01-PC14'], ['0068117283', 'Bima Satria', 'XII MIPA 1', 'R01-PC03'],
   ['0068204912', 'Nadia Faradina', 'XII MIPA 1', 'R01-PC18']].forEach(function (s) {
    appendRow_('Data_Siswa', { NISN: s[0], Nama: s[1], Rombel: s[2], PIN_Hash: hashPin_('123456'), No_Meja: s[3], Status_Kunci: '', PIN_Teks: '123456', Foto_URL: '' });
  });
  appendRow_('Pengaturan_Ujian', { Kode_Mapel: 'FIS-TKA', Nama_Ujian: 'Literasi Membaca & Penalaran Sains (TKA)', Durasi_Menit: 90,
    Token_Aktif: 'TK7AKM', Token_Dibuat: Date.now(), Status: 'Tutup', Acak_Soal: 'Ya', Tampilkan_Nilai: 'Ya', Batas_Pelanggaran: 3, Auto_Refresh_Menit: 5, Waktu_Mulai_Global: '', Token_Lama: '' });
  seedSoal_();

  setupTriggers();

  Logger.log('✅ Setup selesai!');
  Logger.log('   Spreadsheet : ' + ss.getUrl());
  Logger.log('   Folder Drive: ' + root.getUrl());
  Logger.log('   Login admin : admin / ' + adminPin);
  Logger.log('   Login guru  : guru1 / ' + guruPin);
  Logger.log('   Siswa contoh: 0068192341 / 123456 (juga 0068117283, 0068204912)');
  Logger.log('   Token contoh: TK7AKM (ujian FIS-TKA, status Tutup — buka lewat dasbor admin)');
  Logger.log('   ⚠️ Segera ganti PIN contoh. Simpan PIN admin di tempat aman.');
}

/**
 * Pulihkan kolom teks (NISN dll.) yang terlanjur menjadi angka di Sheets (angka nol di depan hilang).
 * Aman dijalankan berulang. Dipanggil otomatis oleh migrasiV2.
 */
function perbaikiNISN() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let n = 0;
  Object.keys(TEXT_COLS).forEach(function (name) {
    const sh = ss.getSheetByName(name), last = sh && sh.getLastRow();
    if (!sh || last < 2) return;
    TEXT_COLS[name].forEach(function (c) {
      const ci = SCHEMA[name].indexOf(c) + 1;
      const rng = sh.getRange(2, ci, last - 1, 1), vals = rng.getValues();
      let ubah = false;
      const baru = vals.map(function (r) {
        const t = normVal_(name, c, r[0]);
        if (t !== r[0]) { ubah = true; n++; }
        return [t];
      });
      rng.setNumberFormat('@');
      if (ubah) rng.setValues(baru);
    });
  });
  return n;
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'gradeEssayBatch' || f === 'rotasiTokenOtomatis') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gradeEssayBatch').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('rotasiTokenOtomatis').timeBased().everyMinutes(1).create(); // token berganti tiap N menit
}

/**
 * MIGRASI V2 — jalankan SEKALI pada proyek yang sudah ter-setup (tanpa menghapus data).
 * Menambah kolom PIN_Teks, Foto_URL, Token_Lama; token otomatis 5 menit; folder Drive foto & gambar soal.
 */
function migrasiV2() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ['Data_Siswa', 'Pengaturan_Ujian'].forEach(function (name) {
    const sh = ss.getSheetByName(name), want = SCHEMA[name];
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), want.length)).getValues()[0];
    want.forEach(function (col, i) {
      if (have[i] === undefined || have[i] === '') sh.getRange(1, i + 1).setValue(col).setFontWeight('bold').setBackground('#4F46E5').setFontColor('#ffffff');
    });
    (TEXT_COLS[name] || []).forEach(function (c) { sh.getRange(1, want.indexOf(c) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  });
  const nisnFix = perbaikiNISN();
  cdel_('tbl_siswa'); cdel_('tbl_setting');
  let pinDiisi = 0, tokenDiatur = 0;
  const pinContoh = hashPin_('123456');
  rows_('Data_Siswa').forEach(function (s) {
    if (!String(s.PIN_Teks || '').trim() && s.PIN_Hash === pinContoh) { updateRow_('Data_Siswa', s._row, { PIN_Teks: '123456' }); pinDiisi++; }
  });
  rows_('Pengaturan_Ujian').forEach(function (s) {
    if (!(Number(s.Auto_Refresh_Menit) > 0)) { updateRow_('Pengaturan_Ujian', s._row, { Auto_Refresh_Menit: 5 }); tokenDiatur++; }
  });
  getSubFolder_('Foto_Siswa'); getSubFolder_('Gambar_Soal');
  setupTriggers();
  cdel_('tbl_siswa'); cdel_('tbl_setting');
  Logger.log('   NISN/No_Meja dipulihkan menjadi teks: ' + nisnFix + ' sel');
  Logger.log('✅ Migrasi V2 selesai. PIN contoh diisi: ' + pinDiisi + ', ujian diatur token 5 menit: ' + tokenDiatur);
  Logger.log('   Peserta lain: buka dasbor admin > Data Peserta > "Buat PIN yang kosong" agar PIN bisa dilihat/dicetak.');
}

function seedSoal_() {
  const S = [
    ['PG', 'HOTS', 'Gas ideal diatomik mengalami siklus Carnot antara 600 K dan 300 K.', 'Efisiensi maksimum siklus tersebut adalah...', 'A. 25%|B. 50%|C. 75%|D. 100%', 'B', 2, ''],
    ['PGK', 'SEDANG', 'Sebuah generator turbin angin menghasilkan listrik.', 'Pilih SEMUA pernyataan yang benar tentang induksi elektromagnetik.', 'Perubahan fluks menghasilkan ggl|Ggl bertambah bila laju perubahan fluks bertambah|Ggl tidak bergantung jumlah lilitan|Arah arus induksi mengikuti hukum Lenz', 'A,B,D', 2.5, ''],
    ['BS', 'HOTS', 'Evaluasi klaim saintifik terkait satelit GPS.', 'Tentukan Benar atau Salah tiap pernyataan.', 'Waktu satelit berjalan sedikit lebih cepat akibat gravitasi lebih lemah|Dilatasi waktu khusus membuat jam satelit lebih lambat|Koreksi relativitas diperlukan agar posisi GPS akurat', 'B,B,B', 3, ''],
    ['MATCH', 'SEDANG', 'Spektrum gelombang elektromagnetik.', 'Jodohkan jenis gelombang dengan pemanfaatannya.', 'Sinar-X::Radiografi medis|Gelombang mikro::Pemanas makanan|Inframerah::Remote TV|Ultraviolet::Sterilisasi', '', 3, ''],
    ['ESSAY', 'HOTS', 'Efek fotolistrik pada logam cesium.', 'Jelaskan mengapa peningkatan intensitas cahaya tidak menaikkan energi kinetik maksimum fotoelektron.', '', '', 10,
     'Indikator 1 (4 poin): energi kinetik maks hanya bergantung frekuensi (Ek = hf - W0). Indikator 2 (4 poin): intensitas hanya menambah jumlah foton sehingga jumlah elektron, bukan energinya. Indikator 3 (2 poin): menyebut frekuensi ambang/fungsi kerja.']
  ];
  S.forEach(function (s, i) {
    appendRow_('Bank_Soal', { ID: 'FIS-TKA-' + ('000' + (i + 1)).slice(-3), Kode_Mapel: 'FIS-TKA', No: i + 1, Tipe: s[0], Level: s[1],
      Stimulus: s[2], URL_Gambar: '', Pertanyaan: s[3], Opsi: s[4], Kunci: s[5], Bobot: s[6], Rubrik_Essay: s[7], Skor_Maks: s[0] === 'ESSAY' ? s[6] : '' });
  });
}
