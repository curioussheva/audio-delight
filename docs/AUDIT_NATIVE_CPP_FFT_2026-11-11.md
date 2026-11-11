# Audit Native C++ — Section fft (2026-11-11)

Section `fft/`: 11 file, 446 baris. Audit baca-semua-file + grep pemakai +
2 harness (`scripts/test_fft_analyzer.cpp`).

## Ringkasan

**0 BLOCKER, 3 MAJOR (semua dormant), 11 minor, 2 dugaan.**

Satu-satunya kode fft/ yang HIDUP adalah `FFTPlan` (+ `FFTypes.h`),
dipakai `playback/PitchShifter` (retune Fase R). Seluruh rantai spektrum
(`FFTProcessor` → `SpectrumAnalyzer` → `SpectrumVisualizer`) dan
`WaveformVisualizer` punya **0 caller** di luar `fft/` — mati total, tapi
tetap terkompilasi. Visualizer yang hidup di device TIDAK memakai section
ini: ia memakai FFT bawaan Android (`android.media.audiofx.Visualizer`,
128 bin dari 2048 point) lewat `NativeVisualizerBridge`, dan
`src/features/visualizer/api/fft.ts` hanya post-processing data itu.

**KOREKSI terhadap klaim lama:** "ada 3 implementasi FFT, hanya immersive
yang pakai FFTPlan" — SALAH. Yang benar: hanya ada SATU implementasi FFT
C++ (`FFTPlan`). `FFTConvolver` (dsp/convolution, 15 baris) tidak punya
kode FFT sama sekali (cuma `prepare`/`reset`, tanpa `process()`).
Implementasi FFT ketiga yang hidup adalah FFT bawaan Android (sistem),
bukan C++.

## MAJOR

### F-M1 — `SpectrumAnalyzer::feed()` heap-buffer-overflow WRITE (dormant, TERBUKTI harness + ASan)
`SpectrumAnalyzer.cpp:14` menulis `mRingBuffer[mWritePos++]` SEBELUM cek
batas, dan cap-nya menahan `mWritePos` di `mFFTSize` — jadi SETIAP sampel
yang di-feed sesudah buffer penuh menulis `mRingBuffer[2048]` (di luar
`0..2047`), bukan sekali saja. ASan: `heap-buffer-overflow WRITE of size 4`
di `feed()`, 0 byte setelah region 8192 byte, `SpectrumAnalyzer.cpp:14`.
Harness: isi 2048 sampel (penuh persis) lalu feed 16 lagi → abort.
Kalau kelas ini pernah dapat caller, ini crasher/corrupter heap.
Fix (mudah): buang sampel baru kalau buffer sudah penuh (early return),
jangan menulis melewati akhir. Desain aslinya memang "tunggu sampai
diproses" — fix ini sesuai desain.

### F-M2 — `FFTProcessor::process()` merusak input FFT lewat `reinterpret_cast` (dormant, TERBUKTI harness)
`FFTProcessor.cpp:24` memanggil
`mPlan.forward(reinterpret_cast<const float*>(mBuffer.data()), mBuffer.data())`.
`forward()` membaca input sebagai array REAL sepanjang `mFFTSize`, padahal
yang dikasih adalah buffer Complex (interleaved real,imag) — jadi yang
di-FFT adalah `[x0,0,x1,0,...]`: setengah frame pertama disisipi nol.
Harness (input DC, N=2048): `mag[0]=511.8` (harusnya 1023.5),
`mag[1024 Nyquist]=511.8` (harusnya 0.0); referensi benar (FFTPlan
langsung di array real): `mag[0]=1023.5`, Nyquist `0.0`. Puncak Nyquist
palsu sebesar puncak DC. Komentar `// forward FFT (stub)` di baris itu
sudah basi (FFTPlan-nya nyata sejak lama). Caller mana pun akan dapat
spektrum yang salah. Fix (mudah): jendela ke buffer real terpisah, lalu
`forward(realIn, mBuffer)`.

### F-M3 — Seluruh rantai spektrum fft/ mati (struktural, 0 caller)
`FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`,
`WaveformVisualizer`: grep repo-wide = 0 pemakai di luar `fft/` sendiri
(`SpectrumAnalyzer` hanya dipakai `SpectrumVisualizer::Impl` — yang juga
mati). Pola yang sama dengan stub terkompilasi di section lain
(AGENTS.md): kelas tampak tersedia padahal tidak ada yang memakai.
Di dalamnya:
- `WaveformVisualizer::feed()` KOSONG (stub) dan `getWaveform()` mengembalikan
  buffer NOL selamanya; `onUpdate()` stub.
- `SpectrumVisualizer`: thread update tidak pernah di-start, callback
  tidak pernah dipanggil (`onUpdate()` cuma menyimpan callback + komentar
  "start thread etc. (stub)"), member `latestSpectrum`/`running`/
  `updateThread`/`updateIntervalMs` tidak pernah dipakai.
Keputusan (hapus rantai mati vs biarkan) ditampung buat sesi berikut —
bukan perbaikan mudah satu baris, dan penghapusan 4 kelas sekaligus
adalah keputusan desain.

## Minor (f-m1…f-m11)

- **f-m1:** `FFTPlan.h` komentar basi soal `mCfg` ("Tabel `mCfg` di bawah
  adalah sisa dari rencana memakai kissfft") — tidak ada member `mCfg`
  (membernya `mBitRev`/`mTwiddle`/`mScratch`).
- **f-m2:** `FFTProcessor::mMagnitude` dialokasi di ctor, tidak pernah dipakai
  (`process()` menulis ke parameter output).
- **f-m3:** `SpectrumAnalyzer::mSampleRate` disimpan di ctor, tidak pernah dipakai.
- **f-m4:** `FFTProcessor.h` include `"WindowFunctions.h"` (bare, mengandalkan
  include path global CMakeLists) sementara `.cpp` pakai path relatif
  `../dsp/convolution/WindowFunctions.h` — tidak konsisten; headernya
  sendiri tidak memakai apa pun dari header itu (include tak terpakai).
- **f-m5:** `FFTProcessor::setWindowType()` diam-diam mengabaikan jendela
  yang ukurannya salah (tanpa log/return value).
- **f-m6:** `SpectrumAnalyzer::feed()` tanpa null check `samples` (padahal
  `FFTProcessor::process()` punya).
- **f-m7:** `SpectrumVisualizer` member mati: `latestSpectrum`, `running`
  (atomic, tidak pernah di-set), `updateThread` (tidak pernah di-start/
  join), `updateIntervalMs` (di-set tapi tidak pernah dibaca).
- **f-m8:** `SpectrumVisualizer::feed()` mengalokasi `std::vector<float>`
  per panggilan (alokasi di jalur audio kalau kelas ini hidup).
- **f-m9:** `FFTPlan` tidak thread-safe: `forward()`/`inverse()` berbagi
  `mScratch` — pemanggilan konkuren dari dua thread race. Pemakai hidup
  satu-satunya (PitchShifter) memanggil sekuensial di satu thread, jadi
  laten; kelas tidak punya kontrak thread tertulis. Hal yang sama untuk
  `feed()` vs `getMagnitudeSpectrum()` (tanpa lock).
- **f-m10:** `FFTProcessor` ctor tidak memvalidasi `fftSize` pangkat dua —
  plan tidak valid → `forward()` return dini dan `process()` diam-diam
  mengeluarkan magnitudo dari data time-domain berjendela (sampah).
- **f-m11:** `FFTPlan::forward()`/`inverse()` pada plan tidak valid
  diam-diam return tanpa menulis output — pemanggil wajib cek `isValid()`
  (terdokumentasi di komentar, tapi tetap footgun).

## Yang SEHAT di section ini

- `FFTPlan` sendiri BENAR: radix-2 DIT, forward + inverse
  (konjugasi→forward→konjugasi→/n), twiddle + bit-reversal dihitung sekali
  di ctor, tanpa alokasi di jalur panggil. Sudah TERBUKTI harness retune
  2026-11-11 (round-trip RMS err 0.0000, peak bin 19 untuk 440 Hz @48k,
  phase advance hop 512 = 4.346 rad).
- `FFTPlan` menolak ukuran bukan pangkat dua di ctor (`mSize = 0`) dan
  null-check di `forward()`/`inverse()`.

## Dugaan (F-g1…F-g2)

- **F-g1:** Desain fill-once `SpectrumAnalyzer` (isi → proses → reset)
  menunjukkan ia ditulis untuk model pull yang tidak pernah jadi dipakai.
- **F-g2:** `WaveformVisualizer::feed()` yang kosong menunjukkan tab
  waveform direncanakan tapi tidak pernah diimplementasikan.

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul — fix ini TIDAK masuk build 42962732238 yang sedang jalan dari head c69ef41c; ikut build berikutnya)

- **F-M1** — commit `84246cda`: `feed()` early-return kalau buffer sudah penuh
  (+ null check `samples`, f-m6). Bukti: harness ASan mode `oob` bersih
  (tidak abort).
- **F-M2** — commit `f15336b4`: `process()` jendela ke buffer real `mRealIn`
  lalu `forward(mRealIn, mBuffer)`; komentar `(stub)` yang basi dibuang.
  Bukti: harness T1 — DC → `mag[0]≈1023.5`, Nyquist `≈0.0`.

### DITAMPUNG buat sesi berikut

- F-M3: hapus rantai mati (`FFTProcessor`, `SpectrumAnalyzer`,
  `SpectrumVisualizer`, `WaveformVisualizer`) vs biarkan — keputusan desain.
  (Penghapusan aman ke arah verifikasi: caller yang terlewat bikin CI gagal
  keras. `FFTResonanceAnalyzer` di dsp/ juga mati — lihat DSP-M15.)
- f-m1…f-m11: minor di atas, belum dipilih.
- F-M9/thread-safety: kontrak thread `FFTPlan` (dokumentasi saja vs
  scratch per panggilan).

## Harness

`scripts/test_fft_analyzer.cpp` (T1 FFTProcessor DC, T2 SpectrumAnalyzer OOB).
Compile:
`g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/fft -Iandroid/app/src/main/cpp/dsp/convolution -Iandroid/app/src/main/cpp scripts/test_fft_analyzer.cpp android/app/src/main/cpp/fft/FFTPlan.cpp android/app/src/main/cpp/fft/FFTProcessor.cpp android/app/src/main/cpp/fft/SpectrumAnalyzer.cpp android/app/src/main/cpp/dsp/convolution/WindowFunctions.cpp -o /tmp/test_fft_analyzer`
ASan: tambah `-fsanitize=address -g`, jalankan `/tmp/test_fft_asan oob`.
