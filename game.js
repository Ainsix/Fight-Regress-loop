/* =====================================================
   Fight Regress Loop — game.js
   Roguelike auto-battle bergaya "Backpack".

   Alur singkat:
   1. Klik "Mulai Game" -> tas muncul dengan Pedang & Perisai.
   2. Musuh muncul bergelombang; item di tas bekerja otomatis
      sesuai cooldown masing-masing (serang / perisai / sembuh).
   3. Tiap JEDA_ITEM detik, satu item acak diambil dari POOL_ITEM.
   4. Item bisa dipindah (drag ke slot lain) atau dibuang
      (drag keluar kotak tas).
   ===================================================== */

"use strict";

/* =====================================================
   1. PENGATURAN (ubah angka di sini untuk menyetel game)
   ===================================================== */
const KOLOM = 7;              // lebar tas (jumlah kolom)
const BARIS = 5;              // tinggi tas (jumlah baris)
const JEDA_ITEM = 8;          // detik antar item acak
const MAKS_ANTRIAN = 3;       // item yang boleh menunggu kalau tas penuh
const HP_PEMAIN = 100;
const PERISAI_MAKS = 40;      // batas perisai yang bisa ditumpuk
const JEDA_GELOMBANG = 1.5;   // detik jeda sebelum musuh berikutnya
const LAJU_TICK_MS = 100;     // game diperbarui tiap 100 ms


/* =====================================================
   2. DATA: POOL ITEM & TIPE MUSUH
   ===================================================== */

/*
  POOL_ITEM = semua item yang bisa didapat secara acak.
  Untuk menambah item baru, cukup tambah satu objek di sini:
    kode     : nama unik (huruf kecil)
    nama,ikon: tampilan
    w, h     : ukuran di tas (jumlah slot lebar x tinggi)
    warna    : "R, G, B" untuk warna kotak item
    efek     : "serang" | "perisai" | "sembuh"
    nilai    : besar damage / perisai / penyembuhan
    cooldown : detik antar aktivasi
    bobot    : peluang muncul (makin besar makin sering)
*/
const POOL_ITEM = [
  { kode: "pedang",  nama: "Pedang",  ikon: "⚔️", w: 1, h: 2, warna: "220, 80, 80",   efek: "serang",  nilai: 8,  cooldown: 1.5, bobot: 5 },
  { kode: "perisai", nama: "Perisai", ikon: "🛡️", w: 2, h: 2, warna: "70, 130, 220",  efek: "perisai", nilai: 10, cooldown: 2.5, bobot: 4 },
  { kode: "ramuan",  nama: "Ramuan",  ikon: "🧪", w: 1, h: 1, warna: "60, 180, 100",  efek: "sembuh",  nilai: 6,  cooldown: 3,   bobot: 4 },
  { kode: "belati",  nama: "Belati",  ikon: "🗡️", w: 1, h: 1, warna: "200, 120, 60",  efek: "serang",  nilai: 3,  cooldown: 0.7, bobot: 5 },
  { kode: "busur",   nama: "Busur",   ikon: "🏹", w: 2, h: 1, warna: "170, 90, 200",  efek: "serang",  nilai: 5,  cooldown: 1,   bobot: 3 },
  { kode: "palu",    nama: "Palu",    ikon: "🔨", w: 2, h: 2, warna: "230, 190, 60",  efek: "serang",  nilai: 16, cooldown: 3,   bobot: 2 },
  { kode: "jubah",   nama: "Jubah",   ikon: "🧥", w: 1, h: 2, warna: "90, 170, 200",  efek: "perisai", nilai: 5,  cooldown: 2,   bobot: 3 },
  { kode: "apel",    nama: "Apel",    ikon: "🍎", w: 1, h: 1, warna: "220, 70, 90",   efek: "sembuh",  nilai: 3,  cooldown: 2,   bobot: 4 },
  { kode: "bom",     nama: "Bom",     ikon: "💣", w: 1, h: 1, warna: "150, 150, 150", efek: "serang",  nilai: 22, cooldown: 6,   bobot: 1 },
];

/* Musuh diambil berurutan lalu berulang; HP & serangannya naik tiap gelombang.
   Seni ASCII ditulis dengan String.raw supaya tanda \ tidak dianggap karakter khusus.
   Penutup ` ditaruh di baris baru agar \ di ujung baris tidak "memakan" penutupnya. */
const TIPE_MUSUH = [
  { nama: "Slime", art: String.raw`
  .--.
 ( oo )
 (____)
` },
  { nama: "Goblin", art: String.raw`
 /\_/\
( o.o )
 /| |\
` },
  { nama: "Kerangka", art: String.raw`
  .-.
 (o o)
 /|=|\
  / \
` },
  { nama: "Orc", art: String.raw`
 ,___,
 [O_O]
 /|#|\
  | |
` },
  { nama: "Naga", art: String.raw`
  __/\__
 <(o  o)>
   \WW/
` },
];


/* =====================================================
   3. ELEMEN HTML & STATUS GAME
   ===================================================== */
const $ = (id) => document.getElementById(id);

const hutan         = $("hutan");
const backpack      = $("backpack");
const arena         = $("arena");
const layarMenu     = $("layar-menu");
const layarGame     = $("layar-game");
const hud           = $("hud");
const logEl         = $("log");
const overlay       = $("overlay");
const pesanKeluar   = $("pesan-keluar");
const petarungMusuh = $("petarung-musuh");
const tubuhPemain   = $("tubuh-pemain");
const tubuhMusuh    = $("tubuh-musuh");

// data tas (diisi saat game dimulai)
let daftarItem = [];          // semua item yang ada di tas
let idTerakhir = 0;           // penghitung id unik item
const refItem = new Map();    // id item -> { el, cd } (untuk update bar cooldown)

// status drag & drop
let sedangDrag = null;        // { item, geserBaris, geserKolom }

// status permainan (dibuat ulang tiap mulaiGame)
let game = null;
let timerGame = null;
let waktuTerakhir = 0;


/* =====================================================
   4. FUNGSI BANTU
   ===================================================== */
const dua = (n) => String(n).padStart(2, "0");

// 75 detik -> "01:15"
const formatWaktu = (detik) =>
  dua(Math.floor(detik / 60)) + ":" + dua(Math.floor(detik % 60));

const cariPool = (kode) => POOL_ITEM.find((it) => it.kode === kode);

// Pilih satu item acak dari POOL_ITEM, item dengan bobot besar lebih sering muncul
function ambilItemAcak() {
  const total = POOL_ITEM.reduce((jumlah, it) => jumlah + it.bobot, 0);
  let acak = Math.random() * total;

  for (const it of POOL_ITEM) {
    acak -= it.bobot;
    if (acak < 0) return it;
  }
  return POOL_ITEM[POOL_ITEM.length - 1];
}

// Memutar ulang animasi CSS pada elemen (dipakai efek kena serang & item aktif)
function animasi(elemen, kelas) {
  if (!elemen) return;
  elemen.classList.remove(kelas);
  void elemen.offsetWidth;      // paksa browser menghitung ulang agar animasi bisa diulang
  elemen.classList.add(kelas);
}

// Tambah satu baris ke log, simpan 5 baris terakhir saja
function catat(teks) {
  const li = document.createElement("li");
  li.textContent = teks;
  logEl.appendChild(li);
  while (logEl.children.length > 5) {
    logEl.removeChild(logEl.firstChild);
  }
}


/* =====================================================
   5. LATAR HUTAN ASCII
   ===================================================== */

// Membuat teks 1 pohon berdasarkan tingginya
function buatPohon(tinggi) {
  let teks = "";

  // daun: makin ke bawah makin lebar
  for (let i = 1; i <= tinggi; i++) {
    const spasi = " ".repeat(tinggi - i);
    const daun = "@".repeat(i * 2 - 1);
    teks += spasi + `<span class="daun">${daun}</span>\n`;
  }

  // batang: 2 baris
  const spasiBatang = " ".repeat(tinggi - 2);
  teks += (spasiBatang + `<span class="batang">***</span>\n`).repeat(2);

  return teks;
}

// Menaruh banyak pohon di posisi, ukuran, dan keburaman acak
function tanamHutan(jumlah) {
  for (let i = 0; i < jumlah; i++) {
    const pohon = document.createElement("pre");
    pohon.className = "pohon";
    pohon.innerHTML = buatPohon(Math.floor(Math.random() * 5) + 4);

    pohon.style.left = Math.random() * 95 + "%";
    pohon.style.fontSize = Math.random() * 8 + 8 + "px";
    pohon.style.opacity = Math.random() * 0.4 + 0.5;   // 0.5 - 0.9

    hutan.appendChild(pohon);
  }
}


/* =====================================================
   6. TAS: ATURAN PENEMPATAN ITEM
   ===================================================== */

// Membuat item nyata dari templat di POOL_ITEM, lengkap dengan posisi & cooldown
function buatItem(templat, baris, kolom) {
  idTerakhir++;
  return { ...templat, id: idTerakhir, baris, kolom, sisaCd: templat.cooldown };
}

// Apakah dua item saling menimpa?
function bertabrakan(a, b) {
  return (
    a.kolom < b.kolom + b.w && a.kolom + a.w > b.kolom &&
    a.baris < b.baris + b.h && a.baris + a.h > b.baris
  );
}

// Apakah item muat di dalam tas dan tidak menimpa item lain di posisi ini?
function bisaDitaruh(item, baris, kolom) {
  if (baris < 0 || kolom < 0) return false;
  if (baris + item.h > BARIS || kolom + item.w > KOLOM) return false;

  const calon = { ...item, baris, kolom };
  return !daftarItem.some(
    (lain) => lain.id !== item.id && bertabrakan(calon, lain)
  );
}

// Cari posisi kosong pertama (kiri-atas ke kanan-bawah); null kalau tas penuh
function cariTempatKosong(templat) {
  const probe = { w: templat.w, h: templat.h, id: -1 };

  for (let b = 0; b <= BARIS - templat.h; b++) {
    for (let k = 0; k <= KOLOM - templat.w; k++) {
      if (bisaDitaruh(probe, b, k)) return { baris: b, kolom: k };
    }
  }
  return null;
}

// Masukkan item ke tas. Mengembalikan true kalau berhasil, false kalau tas penuh
function tambahItem(templat) {
  const tempat = cariTempatKosong(templat);
  if (!tempat) return false;

  daftarItem.push(buatItem(templat, tempat.baris, tempat.kolom));
  gambarTas();
  return true;
}

// Item yang menunggu tempat dicoba dimasukkan lagi (dipanggil saat ada ruang baru)
function isiDariAntrian() {
  if (!game) return;

  game.antrian = game.antrian.filter((templat) => {
    const berhasil = tambahItem(templat);
    if (berhasil) catat("🎁 " + templat.ikon + " " + templat.nama + " masuk ke tas");
    return !berhasil;       // yang belum berhasil tetap menunggu
  });
}

// Buang item dari tas (dipanggil saat item diseret keluar kotak)
function buangItem(item) {
  daftarItem = daftarItem.filter((it) => it.id !== item.id);
  catat("🗑️ Membuang " + item.ikon + " " + item.nama);
}


/* =====================================================
   7. TAS: MENGGAMBAR TAMPILAN DARI DATA
   ===================================================== */
function gambarTas() {
  // Jangan bangun ulang saat item sedang diseret (drag akan terputus).
  // Tampilan digambar ulang oleh selesaiDrag().
  if (sedangDrag) return;

  backpack.innerHTML = "";
  refItem.clear();

  // catat slot mana dimiliki item yang mana
  const pemilikSlot = {};
  for (const item of daftarItem) {
    for (let b = item.baris; b < item.baris + item.h; b++) {
      for (let k = item.kolom; k < item.kolom + item.w; k++) {
        pemilikSlot[b + "," + k] = item;
      }
    }
  }

  // lapisan bawah: slot (yang dipakai item diberi warna item itu)
  for (let b = 0; b < BARIS; b++) {
    for (let k = 0; k < KOLOM; k++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.baris = b;
      slot.dataset.kolom = k;
      slot.style.gridRow = b + 1;
      slot.style.gridColumn = k + 1;

      const pemilik = pemilikSlot[b + "," + k];
      if (pemilik) {
        slot.classList.add("terisi");
        slot.style.setProperty("--warna", pemilik.warna);
      }
      backpack.appendChild(slot);
    }
  }

  // lapisan atas: item, meregang sesuai ukurannya
  for (const item of daftarItem) {
    const el = document.createElement("div");
    el.className = "item";
    el.textContent = item.ikon;
    el.title = item.nama + " (" + item.w + "×" + item.h + ", " + item.w * item.h + " slot)";
    el.style.setProperty("--warna", item.warna);
    el.style.gridRow = (item.baris + 1) + " / span " + item.h;
    el.style.gridColumn = (item.kolom + 1) + " / span " + item.w;
    el.style.fontSize = "calc(var(--ukuran-slot) * " + 0.55 * Math.min(item.w, item.h) + ")";
    el.draggable = true;
    el.addEventListener("dragstart", (e) => mulaiDrag(e, item));

    // label ukuran di pojok
    const label = document.createElement("span");
    label.className = "ukuran";
    label.textContent = item.w + "×" + item.h;
    el.appendChild(label);

    // bar cooldown di dasar item
    const cd = document.createElement("span");
    cd.className = "cd";
    el.appendChild(cd);

    backpack.appendChild(el);
    refItem.set(item.id, { el, cd });
  }

  perbaruiCooldown();
}

// Mengisi bar cooldown tiap item (tanpa menggambar ulang seluruh tas)
function perbaruiCooldown() {
  for (const item of daftarItem) {
    const ref = refItem.get(item.id);
    if (!ref) continue;                  // item baru yang belum digambar

    const terisi = 1 - item.sisaCd / item.cooldown;
    const rasio = Math.min(1, Math.max(0, terisi));
    ref.cd.style.transform = "scaleX(" + rasio + ")";
  }
}


/* =====================================================
   8. DRAG & DROP: PINDAH ITEM & BUANG ITEM
   ===================================================== */

// Cari slot yang ada di bawah kursor (item di atasnya diabaikan)
function slotDiBawah(e) {
  return document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => el.classList.contains("slot"));
}

// Saat item mulai diseret: catat bagian item yang sedang dipegang
function mulaiDrag(e, item) {
  e.dataTransfer.setData("text/plain", String(item.id));   // wajib untuk Firefox
  e.dataTransfer.effectAllowed = "move";

  const slot = slotDiBawah(e);
  sedangDrag = {
    item,
    geserBaris: slot ? Number(slot.dataset.baris) - item.baris : 0,
    geserKolom: slot ? Number(slot.dataset.kolom) - item.kolom : 0,
  };
  document.body.classList.add("sedang-drag");
}

// Dipanggil setelah drag berakhir (berhasil, gagal, atau dibatalkan)
function selesaiDrag() {
  if (!sedangDrag) return;

  sedangDrag = null;
  document.body.classList.remove("sedang-drag");
  isiDariAntrian();        // mungkin ada ruang baru untuk item yang menunggu
  gambarTas();             // samakan tampilan dengan data
}

// Drop di dalam tas: pindahkan item kalau muat
backpack.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
});

backpack.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();       // supaya tidak dianggap "keluar kotak"
  if (!sedangDrag) return;

  const { item, geserBaris, geserKolom } = sedangDrag;
  const slot = slotDiBawah(e);

  if (slot) {
    // posisi baru pojok kiri atas = slot tujuan dikurangi bagian yang dipegang
    const baris = Number(slot.dataset.baris) - geserBaris;
    const kolom = Number(slot.dataset.kolom) - geserKolom;

    if (bisaDitaruh(item, baris, kolom)) {
      item.baris = baris;
      item.kolom = kolom;
    }
  }
  selesaiDrag();
});

// Drop di mana pun di luar tas = buang item
document.addEventListener("dragover", (e) => {
  if (sedangDrag) e.preventDefault();      // izinkan drop di seluruh halaman
});

document.addEventListener("drop", (e) => {
  if (!sedangDrag) return;
  e.preventDefault();
  buangItem(sedangDrag.item);
  selesaiDrag();
});

// Cadangan: drag dibatalkan (tombol Esc / dilepas di luar jendela)
document.addEventListener("dragend", selesaiDrag);


/* =====================================================
   9. PERTARUNGAN OTOMATIS
   ===================================================== */

// Serangan ke musuh
function lukaiMusuh(damage) {
  if (!game.musuh) return;
  game.musuh.hp = Math.max(0, game.musuh.hp - damage);
  animasi(tubuhMusuh, "kena");
}

// Serangan ke pemain: perisai menyerap dulu, sisanya mengurangi HP
function lukaiPemain(damage) {
  const diserap = Math.min(game.pemain.perisai, damage);
  game.pemain.perisai -= diserap;
  game.pemain.hp = Math.max(0, game.pemain.hp - (damage - diserap));
  animasi(tubuhPemain, "kena");
}

// Efek tiap jenis item
const EFEK = {
  serang:  (item) => lukaiMusuh(item.nilai),
  perisai: (item) => {
    game.pemain.perisai = Math.min(PERISAI_MAKS, game.pemain.perisai + item.nilai);
  },
  sembuh:  (item) => {
    game.pemain.hp = Math.min(game.pemain.hpMaks, game.pemain.hp + item.nilai);
  },
};

function aktifkanItem(item) {
  EFEK[item.efek](item);

  const ref = refItem.get(item.id);
  if (ref) animasi(ref.el, "aktif");
}

// Musuh baru; HP dan serangan naik tiap gelombang
function munculkanMusuh() {
  const g = game.gelombang;
  const tipe = TIPE_MUSUH[(g - 1) % TIPE_MUSUH.length];
  const hp = Math.round(40 * 1.35 ** (g - 1));

  game.musuh = {
    nama: tipe.nama,
    hp,
    hpMaks: hp,
    serangan: Math.round(5 * 1.25 ** (g - 1)),
    jeda: 1.6,
    sisaCd: 1.6,
  };

  tubuhMusuh.textContent = tipe.art.replace(/^\n|\n$/g, "");
  catat("⚠️ Gelombang " + g + ": " + tipe.nama + " muncul!");
}

function musuhKalah() {
  catat("💀 " + game.musuh.nama + " kalah!");
  game.musuh = null;
  game.gelombang++;
  game.jedaGelombang = JEDA_GELOMBANG;

  // hadiah: pulih 25% HP
  const pulih = Math.round(game.pemain.hpMaks * 0.25);
  game.pemain.hp = Math.min(game.pemain.hpMaks, game.pemain.hp + pulih);
}

// Satu langkah pertarungan: item pemain bekerja, lalu musuh menyerang
function jalankanPertarungan(dt) {
  // 1) setiap item menghitung mundur cooldown-nya
  for (const item of daftarItem) {
    item.sisaCd -= dt;
    if (item.sisaCd <= 0) {
      aktifkanItem(item);
      item.sisaCd += item.cooldown;
    }
  }
  if (game.musuh.hp <= 0) {
    musuhKalah();
    return;
  }

  // 2) musuh menyerang tiap jedanya
  game.musuh.sisaCd -= dt;
  if (game.musuh.sisaCd <= 0) {
    lukaiPemain(game.musuh.serangan);
    game.musuh.sisaCd += game.musuh.jeda;
  }
}


/* =====================================================
   10. TIMER ITEM ACAK
   ===================================================== */

// Hitung mundur; saat habis, pemain mendapat satu item acak dari pool
function hitungMundurItemBaru(dt) {
  game.sisaItemBaru -= dt;
  if (game.sisaItemBaru > 0) return;

  game.sisaItemBaru = JEDA_ITEM;
  beriItemAcak();
}

function beriItemAcak() {
  const templat = ambilItemAcak();
  const nama = templat.ikon + " " + templat.nama;

  if (tambahItem(templat)) {
    catat("🎁 Dapat item: " + nama);
  } else if (game.antrian.length < MAKS_ANTRIAN) {
    game.antrian.push(templat);
    catat("🎒 Tas penuh! " + nama + " menunggu. Buang atau rapikan item untuk memberi ruang.");
  } else {
    catat("❌ Tas dan antrian penuh, " + nama + " hilang");
  }
}


/* =====================================================
   11. TAMPILAN HUD, HP, DAN TIMER
   ===================================================== */

// Mengisi bar (lebar + atribut aksesibilitas)
function isiBar(barEl, isiEl, nilai, maks) {
  const persen = maks > 0 ? Math.round((nilai / maks) * 100) : 0;
  isiEl.style.width = persen + "%";
  barEl.setAttribute("aria-valuenow", persen);
}

function perbaruiTampilan() {
  const { pemain, musuh } = game;

  // pemain
  isiBar($("bar-pemain"), $("isi-pemain"), pemain.hp, pemain.hpMaks);
  $("teks-hp-pemain").textContent = Math.ceil(pemain.hp) + "/" + pemain.hpMaks;
  $("teks-perisai").textContent = "🛡️ " + pemain.perisai;

  // musuh (disembunyikan saat jeda antar gelombang)
  petarungMusuh.classList.toggle("tersembunyi", !musuh);
  if (musuh) {
    $("nama-musuh").textContent = musuh.nama;
    isiBar($("bar-musuh"), $("isi-musuh"), musuh.hp, musuh.hpMaks);
    $("teks-hp-musuh").textContent = Math.ceil(musuh.hp) + "/" + musuh.hpMaks;
  }

  // HUD
  $("hud-gelombang").textContent = "Gelombang " + game.gelombang;
  $("hud-waktu").textContent = "Waktu " + formatWaktu(game.waktuMain);
  $("hud-timer").textContent = "Item baru dalam " + Math.ceil(game.sisaItemBaru) + " dtk";
  $("bar-item").style.width = (1 - game.sisaItemBaru / JEDA_ITEM) * 100 + "%";

  // antrian item yang menunggu tempat
  const antrianEl = $("hud-antrian");
  antrianEl.hidden = game.antrian.length === 0;
  antrianEl.textContent = "Menunggu tempat: " + game.antrian.map((t) => t.ikon).join(" ");

  perbaruiCooldown();
}


/* =====================================================
   12. ALUR GAME: MULAI, TICK, KALAH, MENU
   ===================================================== */

// Dipanggil tiap LAJU_TICK_MS: satu "detak jantung" game
function tick() {
  // dt = selisih waktu nyata sejak tick sebelumnya (detik)
  const sekarang = performance.now();
  const dt = Math.min((sekarang - waktuTerakhir) / 1000, 0.25);
  waktuTerakhir = sekarang;

  game.waktuMain += dt;
  hitungMundurItemBaru(dt);

  if (game.musuh) {
    jalankanPertarungan(dt);
  } else {
    game.jedaGelombang -= dt;
    if (game.jedaGelombang <= 0) munculkanMusuh();
  }

  perbaruiTampilan();
  if (game.pemain.hp <= 0) gameOver();
}

function hentikanTimer() {
  clearInterval(timerGame);
  timerGame = null;
}

function mulaiGame() {
  hentikanTimer();

  // atur layar: menu hilang, tas dan HUD muncul
  overlay.hidden = true;
  pesanKeluar.hidden = true;
  layarMenu.hidden = true;
  layarGame.hidden = false;
  hud.hidden = false;
  arena.classList.remove("mode-menu");
  document.body.classList.add("bermain");

  // data awal
  daftarItem = [];
  idTerakhir = 0;
  sedangDrag = null;
  logEl.innerHTML = "";
  game = {
    gelombang: 1,
    waktuMain: 0,
    sisaItemBaru: JEDA_ITEM,
    jedaGelombang: 0,
    antrian: [],
    musuh: null,
    pemain: { hp: HP_PEMAIN, hpMaks: HP_PEMAIN, perisai: 0 },
  };

  // item awal: pedang dan perisai
  tambahItem(cariPool("pedang"));
  tambahItem(cariPool("perisai"));
  catat("Pertarungan dimulai! Pedang dan perisai siap.");

  munculkanMusuh();
  perbaruiTampilan();

  waktuTerakhir = performance.now();
  timerGame = setInterval(tick, LAJU_TICK_MS);
}

function gameOver() {
  hentikanTimer();

  $("overlay-judul").textContent = "Kamu Kalah";
  $("overlay-teks").textContent =
    "Gugur di gelombang " + game.gelombang + " setelah bertahan " +
    formatWaktu(game.waktuMain) + " dengan " + daftarItem.length + " item.";
  overlay.hidden = false;
  $("tombol-ulang").focus();
}

function kembaliKeMenu() {
  hentikanTimer();

  overlay.hidden = true;
  layarGame.hidden = true;
  hud.hidden = true;
  layarMenu.hidden = false;
  arena.classList.add("mode-menu");
  petarungMusuh.classList.add("tersembunyi");
  document.body.classList.remove("bermain");
}

// Exit: tab hanya bisa ditutup script kalau dibuka oleh script, jadi beri pesan juga
function keluar() {
  window.close();
  pesanKeluar.hidden = false;
}


/* =====================================================
   13. MEMASANG TOMBOL & MEMULAI HALAMAN
   ===================================================== */
$("tombol-mulai").addEventListener("click", mulaiGame);
$("tombol-ulang").addEventListener("click", mulaiGame);
$("tombol-menu").addEventListener("click", kembaliKeMenu);
$("tombol-exit").addEventListener("click", keluar);

// ukuran tas dikirim ke CSS, jadi cukup ubah KOLOM dan BARIS di atas
backpack.style.setProperty("--kolom", KOLOM);
backpack.style.setProperty("--baris", BARIS);

tanamHutan(20);
