# GK Audio Lab GK-Kunten — PENDING, bukan preset bawaan

Status 2026-11-15: **belum dibundel**. Folder ini menyimpan data mentah yang
sudah berhasil diambil + hasil analisis konversi, supaya percobaan berikutnya
tidak mengulang spelunking yang sama. JANGAN jadikan file-file di sini preset
tanpa menyelesaikan butir "Yang menghalangi" di bawah.

## Identitas

- **GK Audio Lab GK-Kunten** (KUNTEN asli, BUKAN KUNTEN PRO).
- 1× driver dinamis superlinear 10 mm, 43 Ω, 109 dB/mW, 20 Hz–40 kHz,
  kabel 2-pin 0,78 mm, ~$12,90.
- Review: guiltygamer.com, "GK Kunten review: Raising the bar high,
  keeping the cost low" — grafiknya memakai rig B&K 5128 lawan target JM-1.

## Data mentah (sudah diambil, 2026-11-15)

- Sumber: https://theaudiostore.squig.link/?share=GK_KUNTEN (Squiglink).
- Cara ambil: `data/phone_book.json` situs itu → entri brand "GK",
  phone "KUNTEN", file "GK KUNTEN" → file per-channel
  `data/GK KUNTEN L.txt` dan `data/GK KUNTEN R.txt` (format REW).
- File di folder ini:
  - `GK KUNTEN L.txt` / `GK KUNTEN R.txt` — pengukuran REW asli,
    20 Jan 2026, smoothing 1/12 oktaf, 20 Hz–20 kHz, 481 titik, rig B&K 5128.
  - `gk-kunten-avg-lr.csv` — rata-rata daya (power-average) L/R, format
    CSV AutoEq (`frequency,raw`).
- Selisih L–R: rata-rata 0,49 dB, maks 4,17 dB.

## Yang sudah dicoba (AutoEq 4.1.2 dari source, target default repo)

Semua varian dihitung dengan optimizer AutoEq yang sama dengan 24 preset
bawaan lain (config parametrik default 10 filter). Semuanya DITOLAK karena
koreksinya didominasi selisih rig, bukan IEM-nya:

1. **Langsung ke Harman in-ear 2019** (target yang sama dengan 24 preset
   lain): Preamp −5,9 dB; PK +8,7 dB @ 6652 Hz Q 0,55 dan PK −7,1 dB @
   8996 Hz Q 1,39. Kurva error (raw − target, terpusat) menunjukkan IEM
   mengikuti Harman dalam ±2,5 dB di bawah 2 kHz, tapi ada lembah −8 dB di
   5–7 kHz dan puncak +3,5 dB di 9 kHz — pola itu cocok dengan selisih
   diffuse-field 5128 vs 711 (file `targets/711 5128 delta.csv` AutoEq
   menunjukkan selisih 4–12 dB tepat di 3–7 kHz), bukan dengan IEM-nya.
   Boost +8,7 dB di 6,6 kHz akan mengoreksi resonansi rig, bukan IEM.
2. **Target JM-1 with Harman treble filter** (target native 5128):
   low shelf −10,6 dB @ 105 Hz + high shelf +5,4 dB @ 10 kHz — hasil
   tonal yang sama sekali berbeda (JM-1 adalah target diffuse-field,
   bukan target preferensi seperti Harman). Tidak sebanding dengan 24
   preset lain.
3. **Raw − delta 5128→711, lalu Harman 2019**: high shelf mentok ke rail
   −20,0 dB, low shelf −6,4 dB — optimasi ambruk.
4. **Raw + delta 5128→711, lalu Harman 2019**: PK −7,3 dB @ 2633 Hz,
   HSC +6,6 dB — tetap liar.

## Yang menghalangi

- Tidak ada pengukuran GK-Kunten di AutoEq (0 hasil untuk "Kunten" di
  `results/INDEX.md`, dicek 2026-11-15).
- Satu-satunya data mentah adalah pengukuran B&K 5128; target Harman
  in-ear 2019 didefinisikan untuk rig 711/GRAS RA0045. Konversi 5128→711
  yang andal tidak berhasil divalidasi (keempat varian di atas saling
  bertentangan; tidak ada ground truth berupa hasil AutoEq untuk model
  5128 lain yang bisa dipakai pembanding — data mentah Rtings 5128 tidak
  tersimpan di repo AutoEq).
- Reviewer sendiri menggrafikkan Kunten lawan target JM-1, bukan Harman —
  jadi preset Harman dari data ini juga bertentangan dengan cara reviewer
  menilai IEM ini.

## Yang bisa membuka slot ini

- Pengukuran GK-Kunten (asli) muncul di AutoEq dengan rig 711/GRAS
  (oratory1990/crinacle/dll.) → ambil ParametricEQ.txt-nya seperti 24
  preset lain; ATAU
- csheva memutuskan preset GK-Kunten memakai target JM-1 (target native
  5128) — saat itu varian (2) di atas bisa dipakai ulang, dengan catatan
  targetnya berbeda dari 24 preset lain dan harus ditulis jelas di UI.
