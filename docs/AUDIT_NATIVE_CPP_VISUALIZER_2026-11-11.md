# Audit Native C++ — Section visualizer (2026-11-11)

Section `visualizer/`: 2 file, 167 baris (`VisualizerBuffer.h` 43,
`VisualizerBuffer.cpp` 124). Audit 4 track paralel read-only +
verifikasi ulang parent (file dibaca langsung, `AudioCallback.cpp`
call site, harness repo `scripts/test_visualizer_buffer.cpp`).

## Ringkasan

**0 BLOCKER, 2 MAJOR (keduanya laten), 4 minor, 2 dugaan.**

## Liveness — hidup dan dipakai penuh

Rantai lengkap: `write()` jalur utama `core/AudioCallback.cpp:362`
+ jalur fallback `:164` (mutually exclusive — satu write per
callback, tanpa double-write) → member `core/AudioCallback.h:100` →
`read()` via `core/AudioEngine.cpp:295-303` (`getVisualizerData`) →
JNI `NativeVisualizerModule.cpp:18-54` (`kVisualizerSize = 2048`,
buffer stack 2048) → Kotlin `NativeVisualizerBridge.kt:124-160`
(`getFFTData`, tolak bila `< FFT_SIZE = 2048`, `computeSpectrum` +
`mapToLogBins`) → TS `VisualizerService.ts:391-392,396` (polling
50 ms). Build: glob `visualizer/*.cpp` terkompilasi
(`CMakeLists.txt:83,210`).
**Mati:** `mBufferB` (`VisualizerBuffer.h:42`) + `mWriteBuffer`
(`:44`) — grep seluruh `cpp/`: **tak ada satu pun `store()` ke
`mWriteBuffer`**; hanya `load()` di `VisualizerBuffer.cpp:30` dan
`:97`. Buffer B 8 KB tak pernah ditulis maupun dibaca — sisa desain
double-buffer yang gagal (lihat B3) dan tak pernah dibersihkan.
Kelas `fft/SpectrumVisualizer`/`fft/WaveformVisualizer` adalah kelas
lain dan tak memakai `VisualizerBuffer`.

## MAJOR

### V-M1 — Visualizer menerima data pra-sanitasi; NaN/Inf bisa lolos ke FFT dan JS (laten)
`VisualizerBuffer.cpp:50-60`: `write()` campur `left[i]/right[i]`
apa adanya, tanpa sanitasi. `core/AudioCallback.cpp:355-362`
(utama) dan `:157-164` (fallback): loop sanitize baca `l =
mLeft[i]`, panggil `sanitizeOutput(l)`, tulis hasil ke
`interleaved[i*2]`/`output[i*2]` — **`mLeft[i]/mRight[i]` sendiri
tak pernah di-update** (terverifikasi baca langsung) — lalu
`mVisualizer.write(mLeft, mRight, numFrames)` dipanggil dengan
buffer belum disanitasi. Nilai yang jalur output sendiri anggap
"secara fisik mustahil" (NaN/Inf, `|x|>2`) tetap masuk visualizer.
Hilir tanpa guard: grep `isNaN|isFinite` di
`NativeVisualizerBridge.kt` = 0; `mapToLogBins()` (`:292`) pakai
`linear.coerceAtLeast(1e-9f)` — untuk NaN, `NaN < 1e-9f` false
sehingga **NaN lolos utuh**, `db = NaN`, `normalized =
NaN.coerceIn(0.0, 1.0)` tetap NaN; grep `NaN|isFinite` di
`VisualizerService.ts` = 0. Satu sample NaN → 128 bin NaN sampai
ke JS. Jujur dicatat: pemicu (NaN benar-benar muncul di
`mLeft/mRight` di device) **belum terbukti** — itu yang membuatnya
laten. Fix (MUDAH): sanitasi di dalam `VisualizerBuffer::write()`
(NaN/Inf/`|x|>2` → `0.0f`, ikut aturan `sanitizeOutput`);
alternatif: tulis hasil sanitize kembali ke `mLeft/mRight` di
`AudioCallback`; tambahan murah: guard `isNaN` di `computeSpectrum`/
`mapToLogBins` Kotlin.

### V-M2 — `write(frames < 0)` menggerakkan `mWritePos` mundur, korupsi posisi ring (laten, TERBUKTI harness)
`VisualizerBuffer.cpp:62-65`: `mWritePos.store(pos + frames,
release)` dieksekusi tanpa syarat, di luar loop. Bila `frames < 0`,
loop tak jalan tapi posisi mundur. Harness
(`/tmp/test_vizbuf_neg.cpp`, g++ `-O2`): tulis pola 0..99 →
`read(4)` = `96 97 98 99`; sesudah `write(..., -3)` → `read(4)` =
**`93 94 95 96`** (posisi mundur 3; write berikutnya menimpa 3
sample yang sudah dipublikasi). `write(0)` terbukti no-op yang
benar. Saat ini tak terjangkau: `onAudioReady` guard `numFrames <=
0` → early return (`AudioCallback.cpp:54-56`) dan `numFrames >
1920` → early return (`:57-59`) sebelum kedua call site — tapi
guard itu berada di file lain. Fix (MUDAH): `if (frames <= 0)
return;` di awal `write()`; sekalian `if (!left || !right)
return;` + clamp `read(size)`.

## Minor (V-m1…V-m4)

- **V-m1 — `read(size > kSize)` kembalikan jendela berulang, tanpa
  clamp (laten, TERBUKTI harness).** `VisualizerBuffer.cpp:104-118`:
  tanpa validasi `size`. `(pos - size + i) & kMask` selalu
  in-bounds (bukan OOB) — tapi jendela lebih besar dari ring berisi
  data sama dua kali. Harness: sesudah tulis 2048 sample berbeda,
  `read(4096)` hasilkan **2048/2048 posisi terduplikasi**.
  `read(0)`/`read(-5)` no-op tanpa crash. Saat ini tak terjangkau:
  satu-satunya pemanggil JNI `kVisualizerSize = 2048` selalu sama
  dengan `kSize`. Fix: `size = std::min(size, (int32_t)kSize)` atau
  `assert` (gabung V-M2).
- **V-m2 — Tearing lap-around TERBUKTI nyata, tapi jarang; komentar
  B3 terlalu kuat.** `VisualizerBuffer.cpp:86-88` klaim tearing
  "tidak terjadi untuk salinan 2048 float" — tidak tepat: reader
  ter-preempt di tengah copy lebih dari satu putaran ring (2048
  sample = 42,7 ms @ 48 kHz) mungkin di UI thread Android. Harness
  stress realtime (writer 48 kHz, 480 frame/10 ms, 3 detik): **29
  jendela robek dari 718.959 read (0,004%)**, diskontinuitas tepat
  **±2047/±2049** (satu putaran ring). Pada polling produksi 20/s ≈
  1 frame robek per ~21 menit — dampak hanya satu frame FFT glitch,
  sembuh sendiri di poll berikutnya. Jadi **minor, bukan MAJOR**.
  Fix (opsional): terima saja, atau double-snapshot `mWritePos`
  sebelum/sesudah copy dan ulangi bila berubah ≥ 1 putaran.
  DITAMPUNG.
- **V-m3 — Magic number + konstanta 2048 terduplikasi di 3 tempat
  tanpa ikatan compile-time.** `0.5f` mixdown
  (`VisualizerBuffer.cpp:57-60`) tanpa nama; `2048` di
  `VisualizerBuffer::kSize` (`VisualizerBuffer.h:16`), JNI
  `kVisualizerSize` (`NativeVisualizerModule.cpp:31`), Kotlin
  `FFT_SIZE` (`NativeVisualizerBridge.kt:66`) — hanya diikat
  komentar, tanpa `static_assert`. Drift seperti ini **sudah pernah
  terjadi** (B2: JNI 256 vs buffer 2048, diperbaiki 2026-11-10).
  Fix (MUDAH): `static_assert(kVisualizerSize ==
  VisualizerBuffer::kSize)` di JNI; Kotlin sudah dijaga check
  `samples.size < FFT_SIZE`.
- **V-m4 — `mBufferB` + `mWriteBuffer` mati (dead code, 8 KB
  sia-sia).** Desain double-buffer sudah tak berfungsi sejak B3;
  tersisa member mati + `load()` tak berguna
  (`VisualizerBuffer.cpp:30,97`). Fix (MUDAH): hapus keduanya,
  jadikan `mBufferA` satu-satunya buffer (atau implementasikan
  double-buffer benar dengan flip per jendela penuh, bukan per
  `write()` — komentar `:91-95` sudah menjelaskan kenapa flip
  per-write salah).

## Dugaan (V-d1…V-d2)

- **V-d1 — Apakah NaN/Inf benar-benar pernah mencapai
  `mLeft/mRight` di device?** Belum terbukti. `sanitizeOutput` ada
  karena nilai mustahil pernah muncul ("bit pattern malloc
  garbage", `AudioCallback.h`), tapi sumbernya decoder vs node DSP
  tak bisa diputuskan dari section ini. Perlu instrumentasi/logcat.
  Jika terbukti, V-M1 naik dari laten menjadi hidup.
- **V-d2 — Verifikasi race formal via ThreadSanitizer belum
  berhasil:** TSan gagal start di VM ini (`FATAL:
  ThreadSanitizer: unexpected memory mapping`) — masalah
  environment. Bukti thread-safety yang ada: penalaran
  release/acquire + harness stress realtime (0 crash, 0,004%
  robek, 0 jendela 0.0 pasca-warmup). TSan layak dicoba di mesin
  lain / GH.

## Yang SEHAT di section ini

- **B3 TERBUKTI diperbaiki.** Tes repo
  `scripts/test_visualizer_buffer.cpp`: **6/6 PASS**; ulangan
  ASan+UBSan bersih. `read()` baca buffer yang sama dengan
  `write()` (`VisualizerBuffer.cpp:97-101`); komentar B3 (`:74-95`)
  akurat menjelaskan kenapa logika "buffer kebalikan" salah dan
  kenapa flip per-`write()` juga salah.
- **Tak ada OOB dalam kelas ini.** Indexing write (`:53-56`) dan
  read (`:113-116`) selalu `& kMask`; aritmetika `uint32_t`
  membungkus konsisten modulo 2048. `write()` 3000 frame sekaligus
  terbukti benar (tes repo [4]); `read()` sebelum ada data
  kembalikan nol (tes [3]).
- **Protokol single-writer + release/acquire sound.** `write()`
  muat `mWritePos` relaxed (aman: satu writer), simpan `release`
  sesudah tulis buffer; `read()` muat `acquire` sebelum salin.
  Stress realtime: tak ada crash, tearing 0,004%.
- **Pemakaian disiplin di call site.** `numFrames` di-guard `0 <
  numFrames ≤ 1920` (`AudioCallback.cpp:54-59`); `mLeft/mRight`
  berukuran `kMaxFramesPerCallback` (1920); JNI pakai buffer stack
  2048 yang pas; Kotlin tolak buffer pendek.
- **Tak ada alokasi/lock di jalur realtime.** `write()`/`read()`
  hanya loop + atomic — layak untuk audio thread.
- **Komentar B3 jujur dan bisa diverifikasi** (menyebut commit
  `9848ed0d`, menjelaskan koreksi atas rekomendasi P0 yang salah,
  merujuk ke tes) — kecuali klaim "tidak terjadi" pada tearing
  (lihat V-m2).

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul)

- **V-M1** — commit `f9e42a27` (tes ikut disesuaikan + ditambah [5]/[6], commit `0c0a93bf`, 9/9 PASS): sanitasi di `VisualizerBuffer::write()`
  (NaN/Inf/`|x|>2` → `0.0f`).
- **V-M2** — commit `79e15e35`: `if (frames <= 0 || !left || !right)
  return;` di awal `write()` + clamp `read(size)` ke `kSize`.
- **V-m4** — commit `c4c7ac99`: hapus `mBufferB` + `mWriteBuffer`
  (header + ctor + kedua `load()`), `mBufferA` satu-satunya buffer.
- **V-m3** — commit `bb2c1e12`: `static_assert(kVisualizerSize ==
  VisualizerBuffer::kSize)` di JNI + beri nama konstanta mixdown
  `0.5f`.

### DITAMPUNG buat sesi berikut

- V-m2 (tearing lap-around): terima saja, atau double-snapshot
  `mWritePos`.
- V-d1 (instrumentasi NaN di device), V-d2 (TSan di mesin lain).
