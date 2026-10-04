// ===== 1. HUTAN (latar pohon ASCII) =====
const hutan = document.getElementById("hutan");

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

tanamHutan(20);


// ===== 2. PENGATURAN TAS =====
const KOLOM = 7;
const BARIS = 4;
const backpack = document.getElementById("backpack");

// kirim ukuran ke CSS, jadi cukup ubah angka di sini saja
backpack.style.setProperty("--kolom", KOLOM);
backpack.style.setProperty("--baris", BARIS);


// ===== 3. DATA ITEM =====
// katalog: bentuk tiap jenis item (w = lebar, h = tinggi)
const KATALOG = {
  pedang:  { nama: "Pedang",  ikon: "⚔️", w: 1, h: 2 },
  perisai: { nama: "Perisai", ikon: "🛡️", w: 2, h: 2 },
  ramuan:  { nama: "Ramuan",  ikon: "🧪", w: 1, h: 1 },
};

let idTerakhir = 0;
function buatItem(tipe, baris, kolom) {
  idTerakhir++;
  return { id: idTerakhir, ...KATALOG[tipe], baris, kolom };
}

// isi tas sekarang
const daftarItem = [
  buatItem("pedang", 0, 0),
  buatItem("perisai", 0, 2),
  buatItem("ramuan", 3, 0),
];


// ===== 4. ATURAN PENEMPATAN =====
// apakah dua item saling menimpa?
function bertabrakan(a, b) {
  return (
    a.kolom < b.kolom + b.w && a.kolom + a.w > b.kolom &&
    a.baris < b.baris + b.h && a.baris + a.h > b.baris
  );
}

// apakah item muat dan tidak menimpa item lain di posisi ini?
function bisaDitaruh(item, baris, kolom) {
  if (baris < 0 || kolom < 0) return false;
  if (baris + item.h > BARIS || kolom + item.w > KOLOM) return false;

  const calon = { ...item, baris, kolom };
  return !daftarItem.some(
    (lain) => lain.id !== item.id && bertabrakan(calon, lain)
  );
}


// ===== 5. GAMBAR TAS DARI DATA =====
function gambarTas() {
  backpack.innerHTML = "";

  // catat: slot mana dimiliki item yang mana
  const pemilikSlot = {};
  for (const item of daftarItem) {
    for (let b = item.baris; b < item.baris + item.h; b++) {
      for (let k = item.kolom; k < item.kolom + item.w; k++) {
        pemilikSlot[b + "," + k] = item;
      }
    }
  }

  // lapisan bawah: slot (yang dipakai item diberi warna)
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

  // lapisan atas: item
  for (const item of daftarItem) {
    const el = document.createElement("div");
    el.className = "item";
    el.textContent = item.ikon;
    el.title = item.nama + " memakan " + item.w * item.h + " slot (" + item.w + "×" + item.h + ")";
    el.style.setProperty("--warna", item.warna);
    el.style.gridRow = (item.baris + 1) + " / span " + item.h;
    el.style.gridColumn = (item.kolom + 1) + " / span " + item.w;
    el.style.fontSize = Math.min(item.w, item.h) * 1.6 + "rem";
    el.draggable = true;
    el.addEventListener("dragstart", (e) => mulaiDrag(e, item));

    // label ukuran di pojok
    const label = document.createElement("span");
    label.className = "ukuran";
    label.textContent = item.w + "×" + item.h;
    el.appendChild(label);

    backpack.appendChild(el);
  }
}


// ===== 6. DRAG & DROP =====
let sedangDrag = null;

// cari slot yang ada di bawah kursor (item di atasnya diabaikan)
function slotDiBawah(e) {
  return document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => el.classList.contains("slot"));
}

// saat item diangkat: catat bagian mana dari item yang dipegang
function mulaiDrag(e, item) {
  e.dataTransfer.setData("text/plain", String(item.id));
  e.dataTransfer.effectAllowed = "move";

  const slot = slotDiBawah(e);
  sedangDrag = {
    item,
    geserBaris: slot ? Number(slot.dataset.baris) - item.baris : 0,
    geserKolom: slot ? Number(slot.dataset.kolom) - item.kolom : 0,
  };
}


backpack.addEventListener("dragover", (e) => e.preventDefault());

backpack.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!sedangDrag) return;

  const slot = slotDiBawah(e);
  if (!slot) return;

  const { item, geserBaris, geserKolom } = sedangDrag;
  // posisi baru pojok kiri atas = slot tujuan dikurangi bagian yang dipegang
  const baris = Number(slot.dataset.baris) - geserBaris;
  const kolom = Number(slot.dataset.kolom) - geserKolom;

  if (bisaDitaruh(item, baris, kolom)) {
    item.baris = baris;
    item.kolom = kolom;
    gambarTas();
  }
  sedangDrag = null;
});

gambarTas();

// ===== 4. PINDAH ITEM (ubah data, lalu gambar ulang) =====
function pindahItem(asalB, asalK, tujuB, tujuK) {
  const item = isiTas[asalB][asalK];
  isiTas[asalB][asalK] = isiTas[tujuB][tujuK];  // kalau tujuan terisi, otomatis tukar
  isiTas[tujuB][tujuK] = item;
  gambarTas();
}

gambarTas();