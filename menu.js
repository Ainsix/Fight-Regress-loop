const hutan = document.getElementById("hutan");

// Membuat teks 1 pohon berdasarkan tingginya
function buatPohon(tinggi) {
  let html = "";

  // bagian daun: makin ke bawah makin lebar
  for (let i = 1; i <= tinggi; i++) {
    const spasi = " ".repeat(tinggi - i);
    const daun  = "@".repeat(i * 2 - 1);
    html += spasi + `<span class="daun">${daun}</span>\n`;
  }

  // bagian batang: 2 baris
  const spasiBatang = " ".repeat(tinggi - 2);
  html += (spasiBatang + `<span class="batang">***</span>\n`).repeat(2);

  return html;
}

// Menaruh banyak pohon di posisi acak
function tanamHutan(jumlah) {
  for (let i = 0; i < jumlah; i++) {
    const pohon = document.createElement("pre");
    pohon.className = "pohon";

    const tinggi = Math.floor(Math.random() * 5) + 4;   // tinggi 4-8 baris
    pohon.innerHTML = buatPohon(tinggi);

    pohon.style.left = Math.random() * 95 + "%";         // posisi kiri acak
    pohon.style.fontSize = (Math.random() * 8 + 8) + "px"; // ukuran 8-16px
    pohon.style.opacity = Math.random() * 0.9 + 0.6;     // 0.2-0.5

    hutan.appendChild(pohon);
  }
}

tanamHutan(20); 