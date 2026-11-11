# Analisis Spektral Offline — Deteksi File Hi-Res/Lossless Palsu (2026-11-11)

Tab Analyzer sebelumnya **hanya menebak dari metadata**: codec + bitrate +
ekstensi + rumus teori. `estimatedSpectralCutoffHz` adalah nilai **tabel**
(MP3 128 → 16000, lossless → 22050), `estimatedDynamicRangeDb` adalah rumus
`6.02N + 1.76` — bukan hasil ukur. FLAC palsu dari MP3 lolos sebagai
lossless, dan saat `getAudioMetadata` throw, tab menampilkan
"STUDIO MASTER AUTHENTIC" (default `isFake=false`).

Dokumen ini mencatat perbaikan 2026-11-11: (1) analyzer bisa jalan lagi,
(2) cutoff + LSB **diukur** dari sampel hasil decode via FFT native.

## 1. Perbaikan analyzer yang rusak

**Root cause.** `@missingcore/audio-metadata` v1.3.0 melakukan
`require('expo-file-system')` (entry utama SDK 54) di
`src/libs/expo-file-system.ts:60`, lalu `fs.ts:47` mengakses
`ExpoFileSystem.EncodingType.Base64`. Entry utama SDK 54 tidak mengekspor
`EncodingType` → throw untuk **semua** file ("Audio analysis failed",
logcat #9/#10/#13).

**Fix: pnpm patch (bukan patch-package).** `patch-package` 8.0.1 tidak
mendukung pnpm (hanya lockfile npm/yarn) — CLI-nya gagal total di repo ini.
Dipakai mekanisme native pnpm:

- `patches/@missingcore__audio-metadata@1.3.0.patch` — `require(...)` →
  `require('expo-file-system/legacy')` di `src/` (yang dipakai Metro via
  field `react-native`) dan `lib/module/` (field `main`).
- `package.json`: `patchedDependencies`.
- Verifikasi: `git apply --check` bersih; hasil apply identik byte-per-byte
  dengan `node_modules` yang diubah.
- **Termux: jalankan `pnpm install` setelah pull** supaya patch diterapkan
  ke `node_modules` (lockfile diperbarui pnpm sendiri).

**Fallback + kejujuran (JS-only).** `analyzer.ts`: `getAudioMetadata()`
dibungkus try/catch — kalau tetap gagal, analisis jalan dengan estimasi
(ekstensi + ukuran/durasi) + warning eksplisit + flag `metadataFailed`.
`analyzer.tsx`: gagal/belum ada hasil sekarang tampil
"TIDAK DAPAT DIVERIFIKASI", bukan "STUDIO MASTER AUTHENTIC".

## 2. Analisis FFT native

### Rantai

```
TS spectralAnalysis.ts
  -> spec NativeAnalyzerModule.analyzeFile(uri)
  -> audio/NativeAnalyzerModule.kt (@ReactMethod, NAME sama)
  -> JNI nativeAnalyzeFile [jni/NativeAnalyzerModule.cpp]
  -> pristine::analyzer::analyzeFile(path) [decoder/AudioFileAnalyzer]
       -> FFmpegDecoder (decode, laju asli) + FFTPlan (FFT 8192)
  <- JSON string
```

Dicek tiap hop sebelum commit (pelajaran retune: method harus ada di modul
yang JS panggil, dan `external fun` harus punya pemanggil — bukan sekadar
definisi).

### Algoritme (`decoder/AudioFileAnalyzer.{h,cpp}`)

- **Two-pass open.** Pass 1 (target default) baca laju input + durasi.
  Pass 2 buka lagi dengan target = laju input, stereo — `setTargetFormat()`
  **sebelum** `open()`. Kalau file di-resample, cutoff yang terukur adalah
  cutoff filter resampler, bukan cutoff file.
- **5 jendela** (10/30/50/70/90% durasi) × FFT 8192 Hann; spektrum per-bin
  diambil **MAX** antar-jendela. Jendela < 4096 frame dilewati; seek gagal
  dilewati (bukan gagal total).
- **Cutoff terukur:** bin tertinggi di atas ambang **-60 dB relatif**
  terhadap puncak spektrum. Dither 16-bit (~-93 dBFS, putih) tidak
  terhitung selama jendela terkeras mendekati 0 dBFS. Puncak < 0,5
  (satuan magnitude bin, ≈ -72 dBFS) → "terlalu senyap", bukan cutoff 0.
- **Rasio LSB-16:** fraksi sampel kanal kiri yang tepat di grid 16-bit
  (`x·32768` bulat). Padding 16-bit → ~1,0; 24-bit asli → ~0. Mono-mix
  **tidak** dipakai untuk tes ini ((L+R)/2 menggeser grid). Syarat:
  decode di laju asli, `dither=none`, tanpa resample.
- Instans decoder milik analyzer sepenuhnya — tidak mengganggu playback.

### Verdict (`spectralVerdict.ts`, murni, Jest)

| Verdict | Aturan |
|---|---|
| `upsample` | mengaku > 48 kHz, cutoff < 24 kHz |
| `lossy-source` | wadah lossless, cutoff < 18 kHz |
| `padding` | mengaku 24-bit, LSB-16 > 0,99 |
| `consistent` | tidak ada temuan |
| `unmeasured` | FFT tidak jalan |

Semua verdict "terduga", bukan vonis. UI menampilkan pengukuran
("konten berhenti di X kHz") + dugaan.

### Integrasi

- `analyzer.ts`: FFT best-effort di `analyzeSong`; kalau berhasil,
  `estimatedSpectralCutoffHz` = nilai terukur, `analysisMethod = "fft"`;
  tabel codec/bitrate hanya fallback. Temuan FFT masuk `warnings`.
- `BitDepthVerifier.ts`: verdict FFT mengalahkan heuristik; padding
  mengoreksi `realDepth` ke 16 + `fakeReason`; spectral diteruskan ke UI.
- `analyzer.tsx`: kartu baru **SPEKTRUM TERUKUR (FFT)** — cutoff, LSB-16,
  Peak/RMS, jumlah jendela — + `fakeReason` di bawah status.

## 3. Status verifikasi (2026-11-11)

- Harness C++ `scripts/test_audio_file_analyzer.cpp`: **14/14 PASS**
  (cutoff 20 kHz + 22,05 kHz tepat satu bin; lantai -100 dB tidak
  terhitung; grid 16-bit → 1,0; 24-bit asli → 0,0057).
- `g++ -fsyntax-only` untuk `AudioFileAnalyzer.cpp`: lolos (menangkap
  satu bug nyata: `getDurationSeconds()` protected di `FFmpegDecoder` —
  diakses via referensi base class).
- `tsc --noEmit`: 0 error. `npx jest`: **200/200 PASS** (13 suite).
- **Belum diverifikasi:** kompilasi JNI + Kotlin (butuh GH build),
  perilaku di device (cutoff/LSB pada file asli vs palsu), dan patch
  pnpm diterapkan di Termux (`pnpm install`).

## 4. Tes device (APK berikut)

1. `pnpm install` di Termux setelah pull (patch lib diterapkan), lalu
   sync + Metro.
2. Buka tab Analyzer pada file FLAC 24/96 **asli**: kartu SPEKTRUM
   TERUKUR muncul, cutoff > 22 kHz, verdict konsisten.
3. File FLAC 24/96 hasil **upsample dari CD 44,1 kHz**: cutoff ~22,0 kHz,
   status UPSCALE DETECTED + alasan upsample.
4. File FLAC dari **MP3 320k**: cutoff ~20 kHz atau di bawahnya,
   verdict lossy-source.
5. File 24-bit **padding dari 16-bit**: LSB-16 ~100%, realDepth 16.
6. File yang metadata-nya gagal dibaca: status TIDAK DAPAT
   DIVERIFIKASI (bukan AUTHENTIC), analisis tetap menampilkan estimasi
   + warning.
7. Lagu diputar seperti biasa selama analisis — playback tidak terganggu.

## 5. Crash logcat #14 (2026-11-11 17:09) — heap OOB di pengisian jendela

**Hasil tes APK 77156899 (logcat #14, 17:03–17:14 WIB):** analisis
berhasil untuk 01 (24/96), 03 (upsample), 04 (MP3→FLAC), 05 (padding)
— `analyzeFile selesai (168 karakter)` — tapi aplikasi **crash
(SIGSEGV) saat menganalisis 02-asli-1644-chirp** (44,1 kHz/16-bit),
15 ms sesudah frame pertama di-decode. Tombstone: `signal 11
(SIGSEGV), code 2 (SEGV_ACCERR)`, fault addr tag `0xb4` (MTE),
PC di dalam `FFTPlan::forward()` — tepatnya di salinan bit-reversal
(`ldr w8, [x1, x8, lsl #2]`, indeks dari tabel).

**Root cause (bukan di FFTPlan):** loop pengisian jendela menulis
melewati `windowed[8192]`:

```cpp
std::vector<float> windowed(kFftSize, 0.0f);      // 8192
for (size_t i = 0; i < mono.size(); ++i)           // mono bisa 9216!
    windowed[i] = mono[i] * hannWindow(i, kFftSize);
```

`decode()` mengembalikan frame UTUH: satu frame FLAC 44,1 kHz =
4608 sampel, jadi dua panggilan memberi mono 4608 + 4608 = 9216 —
1024 float (4 KB) melewati akhir vector. File 96 kHz lolos karena
frame-nya 8192 sampel (mono tepat 8192). Tulis OOB itu menimpa
alokasi heap di sebelahnya (tabel bit-reversal / buffer spektrum),
lalu `forward()` membaca indeks sampah → alamat liar → MTE fault.
File 05 (frame 4608 juga) selamat karena korupsi heap itu
non-deterministik — bug-nya sama, hasilnya beda.

**Fix:** clamp pengisian ke `kFftSize` (`framesToUse =
min(mono.size(), kFftSize)`); kelebihan frame dibuang. Disertai
disassembly tombstone (capstone, `.so` dari APK) + aritmetika frame
sebagai bukti. Harness host tidak menangkap ini karena loop
open/seek/decode memang tidak pernah dijalankan di host (butuh
libav* — lihat catatan di `scripts/test_audio_file_analyzer.cpp`).

**Sisa dari logcat #14:** error metadata Base64 MASIH muncul (6×) —
patch pnpm belum aktif di Termux (kemungkinan `pnpm install` belum
dijalankan); fallback-lah yang menyelamatkan analisis. Verdict yang
tampil di layar untuk 01/03/04/05 tidak tercatat di log — perlu
konfirmasi csheva.

## Commit

- `978ea1a6` — patch pnpm lib audio-metadata + `patchedDependencies`.
- `4ed7eb73` — fallback metadata + jangan default AUTHENTIC.
- `ca937819` — C++ `AudioFileAnalyzer` + harness.
- `158a37c6` — wiring JNI + Kotlin + spec.
- `1ba79c24` — verdict FFT + integrasi TS + UI tab Analyzer.
