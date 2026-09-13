# Aturan Gaya Menulis — Anti Bahasa AI

Berlaku untuk semua teks yang dipublikasikan ke pengguna atau audiens: caption
media sosial, headline, subhead, copy landing page, dan salinan produk.
Bahasa AI yang generik merusak kepercayaan pembaca lebih cepat daripada typo.
Ini bukan saran gaya, ini pagar keras — dicek di setiap tempat teks dibuat,
baik oleh model maupun manusia.

Sumber kebenaran untuk implementasinya ada di
[`packages/llm/src/style-rules.ts`](../packages/llm/src/style-rules.ts), yang
disuntikkan ke setiap prompt yang menghasilkan teks untuk publik
(lihat `captionPrompt` di [`caption.ts`](../packages/llm/src/caption.ts) dan
`extractionPrompt` di [`extract.ts`](../packages/llm/src/extract.ts)). Dokumen
ini adalah versi yang bisa dibaca manusia; kalau salah satu berubah, ubah
keduanya.

## 1. Aturan Tanda Baca

- JANGAN pakai em dash (—), en dash (–), atau tanda hubung ganda (--) untuk
  menyambung gagasan. Kalau ingin memperluas satu pemikiran atau menambah
  keterangan, pecah jadi dua kalimat, atau pakai koma/tanda kurung.
- Minimalkan titik koma dan titik dua yang sifatnya retoris atau dramatis
  ("yang perlu kamu tahu:", "intinya:"). Titik dua struktural yang memang
  memisahkan label dan isi (jadwal, skor, daftar poin) masih boleh.

## 2. Nada & Gaya Bahasa

- Kalimat aktif, bukan pasif berlapis ("dilakukan oleh", "telah disampaikan
  oleh"). Boleh pakai bentuk ringkas yang wajar dalam bahasa Indonesia lisan
  selama tetap sesuai nada brand — jangan kaku seperti terjemahan mesin.
- Punya sudut pandang yang jelas dan membumi. Hindari pujian kosong ("luar
  biasa", "sangat menarik", "wajib ditonton") dan bahasa berhati-hati ala
  korporat yang menghindari sikap.
- Pakai detail konkret dan angka/nama spesifik, bukan generalisasi abstrak.

## 3. Struktur Retoris

- Jangan pakai pola antitesis "bukan cuma X, tapi Y" / "bukan hanya soal X,
  ini soal Y" atau variasinya.
- Hindari "rule of three": jangan otomatis merangkai tiga kata sifat atau tiga
  frasa sejajar sekaligus.
- Variasikan panjang kalimat dengan jelas. Setelah kalimat pendek dan tegas,
  boleh disusul kalimat yang lebih panjang dan deskriptif.

## 4. Kosakata Terlarang

Hindari klise/AI-isme berikut dan padanan sejenisnya: *menyelami, permadani,
lanskap, membuka potensi, meningkatkan (dalam arti "elevate"), memberdayakan,
krusial, mulus (seamless), terpenting/paramount, mercusuar (beacon),
menavigasi, tak terbantahkan, di era digital ini, dalam lanskap yang terus
berkembang*.

Lewati basa-basi pembuka ("Dalam postingan ini...", "Berikut adalah...") dan
penutup formulaic ("Kesimpulannya,", "Sebagai penutup,").

## Pengecualian yang disengaja

- Tanda hubung tunggal (-) tidak dilarang: dipakai untuk rentang angka
  informal atau atribusi kutipan pendek ("- Nama Pembalap").
- Simbol dash sebagai penanda "data tidak tersedia" (`DASH` di
  `packages/core/src/format.ts`) bukan tanda baca kalimat, jadi tidak kena
  aturan ini.
- Istilah teknis asing yang memang wajib dipertahankan (lihat voice guide
  per brand, misalnya `brands/f1/voice.ts`) tetap berlaku di atas aturan gaya
  umum ini untuk kosakata domain, bukan untuk tanda baca.
