# Koreksi Headphone & Impor Preset EQ

**Status:** rancangan — belum ada kode jalur produksi
**Tanggal:** 2026-10-10
**Asal:** diangkat dari `docs/archive/ConsolidationV2.md` F2/F3 (15 Sep), dengan
keputusan operator 2026-10-10.

---

## 1. Tujuan

Menerapkan profil koreksi headphone/IEM dari Squiglink (dan format sekelasnya)
langsung di pipeline Oboe milik Pristine — tanpa Wavelet, tanpa V4A, tanpa root.

## 2. Mengapa ini bukan sekadar "lebih mudah"

`docs/archive/ConsolidationV2.md` mencatat posisi Wavelet/V4A:

```
Player (AudioTrack)
     ↓
AudioFlinger Mixer  ← V4A/Wavelet inject DI SINI (AudioEffect API)
     ↓
Audio HAL → DAC
```

Keduanya **userspace, di luar proses player**. Konsekuensi yang dicatat di
dokumen itu:

- kalau volume < 100%, sample **sudah di-scale sebelum DSP**
- notifikasi/alarm ter-mix dengan musik

Pipeline Pristine berada **sebelum** mixer, di dalam proses sendiri. Jadi
"built-in" di sini berarti koreksi diterapkan pada PCM yang belum tersentuh
mixer — bukan sekadar UI yang lebih rapi.

Diferensiasi yang sudah ditetapkan: **AutoEQ Import — Wavelet ⚠️ Manual ·
V4A ✅ Manual · PristineAudio ✅ Built-in**.

## 3. Keputusan operator (2026-10-10)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Format impor pertama | **Parametrik** (AutoEQ/Squiglink) |
| 2 | Graphic EQ 127-band | **Ya, didukung juga** — jaring pengaman untuk model yang tidak terdaftar, dan supaya expert yang melakukan koreksi langsung **sekaligus** tuning di Squiglink tetap bisa. Preset standar juga boleh. Keduanya bisa aktif. |
| 3 | Database profil | **Sebatas model populer** — bukan katalog lengkap |
| 4 | Angkat F2/F3 ke `docs/` | Ya (dokumen ini) |
| 5 | `loadProfile()` `return true` palsu | Perbaiki sekarang → `return false` |

**Catatan soal #2.** Dua mesin bisa aktif bersamaan: parametrik untuk preset
presisi, graphic untuk kurva yang tidak punya padanan parametrik. Ini bukan
duplikasi — keduanya masuk ke cascade biquad yang sama, hanya beda cara
mendapatkan koefisien.

## 4. Tiga format, satu mesin

| Format | Bentuk data | Cara dapat koefisien | Prioritas |
|---|---|---|---|
| **Parametrik** (AutoEQ/Squiglink) | `Fc / Q / Gain / tipe` — `PK`, `LSC`, `HSC` | hitung saat runtime | **P1** |
| **Graphic EQ** (gaya Wavelet) | gain di grid frekuensi tetap (127 band) | turunkan koefisien dari kurva | P2 |
| **Viper DDC** (`.vdc`) | 5 float per filter (`b0,b1,b2,a1,a2`) | sudah jadi, tapi **statis** | P3 — opsional |

**Biaya CPU** (5 mult/sample/biquad × 2 ch @ 48 kHz):

| Pendekatan | Filter | Mult/detik | State |
|---|---|---|---|
| Graphic 127-band | 127 | **61.0 M** | 6.9 KB |
| Parametrik | 5-16 | **2.4-7.7 M** | ~0.5 KB |

127-band **8-25× lebih mahal**, dan kurang akurat: `Fc` dibulatkan ke grid 127
titik, jadi filter presisi (mis. notch 6.3 kHz) meleset. Karena itu parametrik
jadi P1, dan graphic dipakai sebagai pelengkap — persis alasan operator di #2.

**Keunggulan kita atas Viper DDC.** `.vdc` menyimpan koefisien **statis**,
sehingga hanya punya dua set: 44100 dan 48000. Kita menghitung koefisien saat
runtime dengan laju stream **nyata** (`EQNode::prepare(sampleRate)` — jalur ini
baru diperbaiki 2026-10-10). Jadi berlaku untuk 44.1 / 48 / 88.2 / 96 / 176.4 /
192 kHz tanpa tabel tambahan.

## 5. Posisi di chain

**Keputusan: koreksi headphone SEBELUM user EQ 10-band** (bukan menggantikannya).

Alasannya: koreksi headphone adalah **netralisasi alat** — tujuannya membuat
headphone mendekati target, bukan selera. User EQ di atasnya adalah **selera**.
Urutan ini juga yang dipakai AutoEQ + Equalizer APO di desktop: koreksi dulu,
tuning kemudian. Kalau dibalik, user menuning di atas respons yang masih cacat,
lalu tiap ganti headphone tuning-nya harus diulang dari nol.

```
PCM dari decoder
     ↓
[Preamp]                      ← wajib, lihat §6
     ↓
[Cascade biquad koreksi]      ← profil headphone (parametrik / graphic)
     ↓
[EQ 10-band user]             ← selera
     ↓
[StereoWidener]
     ↓
[Gain]
     ↓
[Limiter]
     ↓
sanitize → DAC
```

**Hanya di mode DSP/Immersive.** Koreksi mengubah sinyal, jadi **tidak boleh**
aktif di BitPerfect — mode itu berarti nol pemrosesan.

## 6. Preamp wajib

Preset AutoEQ selalu menyertakan preamp negatif (mis. `Preamp: -6.8 dB`) justru
karena band-nya di-boost. Tanpa preamp, puncak gabungan melewati full scale dan
limiter bekerja terus-menerus — terdengar sebagai kompresi, bukan koreksi.

Preamp diterapkan sebagai `GainNode`, bukan sebagai skala manual per-sample,
supaya tetap satu jalur dengan gain lain.

## 7. Data model

```
HeadphoneProfile {
  id          : string        // "moondrop-chu"
  nama        : string        // "Moondrop Chu"
  sumber      : enum          // PARAMETRIC | GRAPHIC | DDC
  preampDb    : float
  filters     : [ { type: PK|LSC|HSC, freqHz, q, gainDb } ]   // parametrik
  graphicBands: [ gainDb x N ]                                 // graphic
  sampleRate  : int           // untuk DDC: 44100 | 48000
}
```

Kapasitas cascade: **16 filter**. AutoEQ biasa mengeluarkan 5-10; 16 memberi
ruang untuk preset yang lebih panjang tanpa alokasi dinamis di audio thread.

## 8. Blocker yang harus ditutup lebih dulu

### 8.1 `BiquadFilter::setHighShelf()` — **SELESAI** (2026-10-10)

Dulu tidak ada, padahal `dsp/filters/ToneControl.h:33` sudah memanggilnya sejak
lama — **error kompilasi laten** yang tidak muncul karena `ToneControl` nol
pemanggil (badan member non-template yang didefinisikan in-class hanya di-emit
kalau odr-used).

Sekarang ada (RBJ cookbook, cerminan `setLowShelf`). Diverifikasi
`scripts/test_highshelf.cpp` — **14/14 lulus**:

| # | Yang diuji | Hasil |
|---|---|---|
| 1 | gain 0 dB = identity | +0.0000 dB; `b0=1`, `b1=a1`, `b2=a2` (kutub-nol meniadakan → `H(z)=1` persis) |
| 2 | boost +6 dB @8 kHz | +5.66 dB di 16 kHz, +0.03 dB di 1 kHz |
| 3 | cut −6 dB @8 kHz | −5.66 dB di 16 kHz |
| 4 | cerminan low shelf | high shelf tidak menyentuh bass; low shelf tidak menyentuh treble |
| 5 | laju 44.1 kHz | +5.74 dB di 16 kHz — benar di laju non-48k |
| 6 | preset AutoEQ `HSC 10000 Hz −2.0 dB Q 0.70` | −1.90 dB di 18 kHz |

Stabilitas diperiksa di semua kasus (kutub di dalam lingkaran satuan:
`|a2| < 1` dan `|a1| < 1 + a2`).

**Sudah diverifikasi juga:** `ToneControl` satu-satunya dari 15 header `dsp/`
yang bermasalah. CMake memakai `GLOB_RECURSE` (`dsp/*.cpp`, `dsp/*/*.cpp`)
sehingga seluruh 24 `.cpp` di `dsp/` ikut dikompilasi.

### 8.2 `HeadphoneCorrection` berbentuk FIR, bukan parametrik

Sekarang: `applyFIR()`, `mFilterLeft: std::vector<float>`, `mFilterRight`.
Itu bentuk untuk **impulse response** (koreksi konvolusi), bukan parametric.
Untuk Squiglink, komponennya harus diubah bentuk menjadi cascade biquad.

`loadProfile()` sekarang `return false` (commit 2026-10-10) — gagal berisik
sampai pemuat profil benar-benar ada.

## 9. Pelacakan status per node

Aturan bukti: **`NYATA` hanya kalau ada jalur pemanggilan dari jalur produksi.**
Bukan "filenya ada".

| Node | Status | Bukti / yang kurang |
|---|---|---|
| `BiquadFilter` (RBJ) | **NYATA** | `setPeakingEQ` + `setLowShelf` dipakai `EQProcessor`; diverifikasi `scripts/test_dsp_wiring.cpp` |
| `BiquadFilter::setHighShelf` | **BELUM** | belum ada — §8.1 |
| `EQProcessor` (10-band) | **NYATA** | tersambung 2026-10-10 (`applyDSPConfig`) |
| `HeadphoneCorrection` | **PUTUS** | nol pemanggil; `loadProfile` → `false` |
| Parser parametrik | **BELUM** | belum ditulis |
| Parser graphic | **BELUM** | belum ditulis |
| Parser `.vdc` | **BELUM** | belum ditulis |
| Storage profil | **BELUM** | belum ada |
| UI pemilihan profil | **BELUM** | belum ada |
| Preamp | **BELUM** | `GainNode` ada, tapi tidak ada yang menyetel preamp |
| Database model populer | **BELUM** | belum ada |

## 10. Tahapan

| Fase | Isi | Prasyarat |
|---|---|---|
| **A** | `setHighShelf()` di `BiquadFilter`; buka error laten `ToneControl` | **✅ SELESAI 2026-10-10** |
| **B** | `BiquadCascade` — 16 biquad, `setFilter(i, type, freq, q, gain)`, preamp | **✅ SELESAI 2026-10-10** |
| **C** | Parser parametrik (AutoEQ/Squiglink `.txt`) | B ✅ |
| **D** | Storage + UI: daftar profil, pilih, aktif/nonaktif | C |
| **E** | Database model populer (kurasi terbatas) | D |
| **F** | Parser graphic EQ 127-band | B ✅ |
| **G** | Parser `.vdc` (opsional) | B ✅ |

### 10.1 Fase A ✅ — `BiquadFilter::setHighShelf()`

RBJ cookbook, cerminan `setLowShelf`. Diverifikasi `scripts/test_highshelf.cpp`
(14/14). Error laten `ToneControl` tertutup.

### 10.2 Fase B ✅ — `dsp/BiquadCascade.{h,cpp}`

Rantai filter: preamp + 16 biquad statis (nol alokasi dinamis — berbeda dari
`HeadphoneCorrection` lama yang memakai `std::vector`).

API:
- `setFilter(index, type, freqHz, q, gainDb, sampleRate)` — `FilterType` =
  `Peaking` / `LowShelf` / `HighShelf`
- `setActiveCount(n)`, `activeCount()`
- `setPreamp(gainDb)`, `preamp()`
- `setSampleRate(rate)` — **menghitung ulang koefisien** seluruh filter
- `process(left, right, frames)`, `reset()`, `clear()`
- `isActive()`, `overflowed()` — preset yang dipotong **ditandai**, bukan
  didiamkan

Diverifikasi `scripts/test_biquad_cascade.cpp` — **16/16 lulus**:

| # | Yang diuji | Hasil |
|---|---|---|
| 1 | kosong = buffer tidak disentuh | bit-exact, `isActive()` false |
| 2 | preamp −6 dB | terukur −6.00 dB |
| 3 | preset AutoEQ 4 filter | preamp mendominasi di 700 Hz (−6.48 dB), 60 Hz +1.37 dB, 16 kHz −8.58 dB |
| 4 | `setSampleRate` 96 kHz | +6.00 dB tetap di 1 kHz; puncak **tidak** bergeser ke 2 kHz |
| 5 | kapasitas 16 | ke-17 ditolak + `overflowed()` true |
| 6 | gain ekstrem (shelf +12, PK −12 Q4, PK +10 Q6, HSC +8) | tetap stabil, tidak meledak |

Regresi: `test_dsp_wiring` 9/9 dan `test_highshelf` 14/14 tetap lulus.

**Belum tersambung.** `BiquadCascade` belum punya pemanggil dari jalur produksi
— statusnya **STUB SIAP**, bukan NYATA. Penyambungannya butuh parser (Fase C)
dan keputusan di mana ia duduk di `DSPChain`.

## 11. Verifikasi yang direncanakan

- Test standalone mengompilasi sumber DSP asli (pola
  `scripts/test_dsp_wiring.cpp`): respons kaskade pada frekuensi uji
  dibandingkan dengan respons yang diharapkan dari `Fc/Q/Gain` preset
- Preset nyata dari Squiglink sebagai fixture
- Pemeriksaan puncak: dengan preamp diterapkan, puncak gabungan ≤ 1.0
- Laju non-48k: koefisien dihitung ulang dengan laju stream nyata, respons
  pada `Fc` tetap benar (ini yang membedakan dari `.vdc`)

---

## Rujukan

- `docs/archive/ConsolidationV2.md` — F2/F3, analisis pasar, chain audio
- `docs/DSP_CHAIN_AUDIT.md` — audit jalur DSP hulu→hilir
- `docs/BOILERPLATE_AND_STUBS.md` — aturan stub (§2) dan pelacakan status
- `docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md` — satu pipeline
- `docs/IDEAS.md` I-12, I-13 — kelas yang belum tersambung
