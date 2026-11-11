# Audit Native C++ — Section utils (2026-11-11)

Section `utils/`: 6 file, 259 baris (`DenormalFix.h` 9,
`AlignedBuffer.h` 15, `AudioMath.h` 18, `ScopedTrace.h` 23,
`Logger.h` 75, `SIMD.h` 119). Audit 4 track paralel read-only +
verifikasi ulang parent (grep `#include` repo-wide, `DenormalFix.h`
+ `AudioConstants.h:62` dibaca langsung, CMakeLists PCH/glob).
Harness g++ standalone di `/tmp` untuk klaim perilaku (host x86 —
jalur NEON tak bisa dieksekusi lokal, lihat U-D1).

## Ringkasan

**0 BLOCKER, 6 MAJOR, 9 minor, 4 dugaan. Hampir seluruh section mati.**

## Liveness — hampir seluruhnya mati

Grep `#include` basename keenam header di seluruh repo = **0 hit**.
`utils/` berisi 0 file `.cpp`; GLOB `CMakeLists.txt:73-84` tak
mencakup `utils/*.cpp`. **5 dari 6 header tak pernah dikompilasi
sama sekali.** Satu-satunya yang masuk build adalah `AudioMath.h` —
itu pun hanya sebagai precompiled header (`CMakeLists.txt:287`),
bukan karena dipakai. File-file utils terakhir disentuh commit
`30252b45` 2026-05-30 — praktis fosil sejak repo dibuat. Kebalikan
pitfall AGENTS.md: file-file ini justru **tidak terkompilasi sama
sekali**, jadi error sintaks di dalamnya akan lolos CI diam-diam.

| Simbol | Status | Bukti |
|---|---|---|
| `zapDenormal` (`DenormalFix.h:6`) | MATI | 0 caller. Satu-satunya penyebutan lain komentar historis `core/AudioCallback.cpp:315` ("dulu di sini ada `softClip(zapDenormal(x))`", fix 2026-10-10, sudah dicabut). Pengganti hidup: `AudioCallback::sanitizeOutput` (`:369`) + `sanitizeInline` (`dsp/Limiter.h:127`), keduanya pakai `kDenormalThreshold = 1e-30f` (`AudioConstants.h:62`) |
| `AlignedBuffer` (`AlignedBuffer.h:6`) | MATI | 0 caller; tak pernah dikompilasi |
| `dbToLinear`/`linearToDb`/`pristine::clamp` (`AudioMath.h:7,11,15`) | MATI di C++ | 0 caller C++ (semua pemakai `clamp(` pakai `std::clamp`). TS punya salinan sendiri yang HIDUP: `src/shared/types/dsp.ts:182-186` — implementasi terpisah, bukan binding |
| `ScopedTrace` (`ScopedTrace.h:8`) | MATI | 0 caller |
| `Logger.h` (makro `LOGV/D/I/W/E/F`) | MATI | 0 `#include`; 6 file mendefinisikan makro LOG* lokal sendiri (lihat U-M2) |
| `pristine::simd::applyGain`/`applyStereoGain` (`SIMD.h:30,70`) | MATI | 0 caller. Duplikat skalar `pristine::applyGain` (`decoder/DecoderUtils.h:56`, `.cpp:173`) **juga 0 caller** — begitu pula `zeroBuffer`. Seluruh jalur gain-processing native tak dipakai siapa pun |

## MAJOR

- **U-M1 — 5 dari 6 header mati dan tak pernah dikompilasi (dead
  code tak terawasi).** Bukti: grep `#include` = 0 hit; 0 file
  `.cpp` di `utils/`; GLOB tak memuat `utils/*.cpp`; tak ada test
  `scripts/test_*.cpp` menyentuh utils. Fix: putuskan per file —
  hapus, atau hidupkan dengan pemakai + test. DIKERJAKAN 2026-11-11
  untuk yang sudah jelas digantikan (`DenormalFix.h`, `AlignedBuffer.h`,
  `ScopedTrace.h` — commit `ddf49d25`). DITAMPUNG: keputusan
  hapus-vs-hidupkan untuk `Logger.h`/`SIMD.h`/`AudioMath.h` butuh
  pilihan csheva.
- **U-M2 — `Logger.h` mati, 6 file menduplikasi makro LOG* lokal
  dengan semantik berbeda.** 6 file:
  `core/DeviceRateDetector.cpp:12-14`,
  `decoder/ContentUriResolver.cpp:13-15`,
  `devices/AudioDeviceManager.cpp:7-10`, `fft/FFTPlan.cpp:17-19`,
  `jni/NativeDSPModule.cpp:16`, `resampler/SincResampler.cpp:8`.
  Drift yang sudah terjadi: `FFTPlan.cpp:17-19` gate `LOGD` pada
  `PRISTINE_HAVE_LIBLOG` (no-op tanpa liblog),
  `AudioDeviceManager.cpp:7`/`SincResampler.cpp:8`/
  `NativeDSPModule.cpp:16` definisikan `LOGD` tanpa gate (tetap log
  di release), `DeviceRateDetector.cpp`/`ContentUriResolver.cpp`
  bahkan tak definisikan `LOGD` (hanya `LOGI/W/E`). Akibatnya
  perilaku log debug di release tak konsisten antar file — persis
  yang `Logger.h:20-28` (LOGV/LOGD no-op di `NDEBUG`) dirancang
  mencegah. Risiko tambahan: TU yang include `Logger.h` sekaligus
  definisikan `LOGD` lokal kena redefinition — dan `CMakeLists.txt`
  memasang `-Wno-macro-redefined`, yang menutupi persis konflik ini.
  Fix: hapuskan 6 definisi lokal, semua file include
  `utils/Logger.h`; atau hapus `Logger.h` dan dokumentasikan pola
  lokal sebagai keputusan sadar (tapi satukan semantik LOGD di
  release). DITAMPUNG (keputusan).
- **U-M3 — `SIMD.h` mati; duplikat skalar `DecoderUtils::applyGain`
  juga mati.** `pristine::simd::applyGain/applyStereoGain` 0 caller;
  `pristine::applyGain` (`DecoderUtils.h:56`, `.cpp:173-186`) juga
  0 caller — grep `applyGain|zeroBuffer` di luar kedua file definisi
  = kosong. Jalur gain NEON (yang dioptimasi) tak dipakai; pemakai
  masa depan yang mengambil `DecoderUtils::applyGain` diam-diam
  dapat jalur skalar lambat. Fix: satu sumber kebenaran — hapus
  `DecoderUtils::applyGain` dan arahkan pemakai ke
  `pristine::simd::applyGain`, atau hapus `SIMD.h` bila gain memang
  dikerjakan di tempat lain (mis. `dsp/GainProcessor.h`).
  DITAMPUNG (keputusan).
- **U-M4 — `ScopedTrace.h` tidak RT-safe dan tidak di-gate release
  (laten, berbahaya bila dipakai di audio thread).**
  `ScopedTrace.h:10-17`: konstruktor selalu `__android_log_print`
  + simpan `std::string mName` (alokasi heap potensial), destruktor
  log lagi — total 2 logcat write per scope, tanpa gate `NDEBUG`
  (berbeda dengan `Logger.h`). Harness (stub `android/log.h` di
  `/tmp`, kompilasi `-DNDEBUG`): `ScopedTrace` tetap hasilkan delta
  `log_calls = 2` di build release — terbukti tak ada gate. Dua
  `__android_log_print` di real-time audio callback = risiko
  blokir/xrun. Fix: hapus file ini (0 caller) — DIKERJAKAN
  2026-11-11 (commit `ddf49d25`, gabung U-M1).
- **U-M5 — `AlignedBuffer.h` melanggar prakondisi
  `std::aligned_alloc` + overflow ukuran tak dicek (laten).**
  `AlignedBuffer.h:8-9`: `std::aligned_alloc(alignment, size *
  sizeof(T))` tanpa validasi. Per C++17, `size` wajib kelipatan
  `alignment` dan `alignment` wajib power-of-two — kalau tidak, UB.
  Harness: `AlignedBuffer<float>(4, 24)`/`(4, 12)`/`(4, 0)` →
  **THROW `bad_alloc`** (glibc tolak alignment non-power-of-two);
  `(3, 16)`/`(5, 16)`/`(1, 16)` (size 12/20/4 byte, bukan kelipatan
  16) → di glibc host **tidak** throw (glibc/bionic membulatkan
  secara praktik) — UB-nya benign di glibc/bionic, tapi tetap UB
  menurut standar dan bisa pecah di allocator lain. Cacat kedua yang
  lebih nyata: `size * sizeof(T)` dapat overflow `size_t` untuk
  `size` besar → alokasi mengecil → heap overflow saat dipakai; tak
  ada `size()`/pelacakan ukuran; `operator->` (`:11`) kembalikan
  `T*` — semantik aneh untuk kelas buffer. Fix: hapus file ini
  (0 caller) — DIKERJAKAN 2026-11-11 (commit `ddf49d25`, gabung U-M1).
- **U-M6 — `DenormalFix.h:7` threshold `1e-15f` salah dan
  bertentangan dengan keputusan codebase sendiri.**
  `return std::fabs(x) < 1e-15f ? 0.0f : x;`. Harness:
  `zapDenormal(1e-20f) = 0` padahal `std::fpclassify(1e-20f) ==
  FP_NORMAL` (normal terkecil `FLT_MIN ≈ 1.1754944e-38`) — fungsi
  ini membunuh sinyal **normal** 15 orde magnitudo di atas denormal,
  bukan denormal. Kontradiksi internal (terverifikasi baca langsung):
  `core/AudioConstants.h:62` + komentarnya menyatakan eksplisit
  "Ambang 1e-15 berarti setiap sample dengan magnitudo di bawah
  1e-15 dipaksa ke nol — yaitu decay reverb, ekor ambience, dan
  fade-out panjang... Audible sebagai tail yang 'hilang'. 1e-30f
  aman" — dan live code sudah memakai `1e-30f`
  (`AudioCallback.cpp:378`, `Limiter.h:141`). File ini mati sehingga
  tak ada dampak runtime hari ini, tapi siapa pun yang "menghidupkan
  kembali" util ini akan mengembalikan bug tail-hilang yang sudah
  diperbaiki 2026-10-10. Fix: hapus file — DIKERJAKAN 2026-11-11
  (commit `ddf49d25`, gabung U-M1).

## Minor (U-m1…U-m9)

- **U-m1 — `AudioMath.h:12` epsilon `1e-12f` tanpa nama merusak
  inversi di level sangat rendah + tak konsisten dengan TS.**
  Harness: `linearToDb(dbToLinear(-240)) = -233.9794` (error **+6,02
  dB**); `linearToDb(0) = -240`, sedangkan TS
  `src/shared/types/dsp.ts:186` (`20 * Math.log10(linear)`, tanpa
  epsilon) beri `-Infinity`. Round-trip di `-100 dB` masih tepat
  (error 0), dampak praktis kecil — tapi C++ dan TS berjanji
  berbeda. DITAMPUNG (tergantung nasib `AudioMath.h`).
- **U-m2 — `Logger.h` tidak ada trailing newline → warning
  `-Wall`.** `od -c` ekor file berakhir di `)` tanpa `\n` (76
  baris, `wc -l` = 75); kompilasi host `g++ -Wall` reproduksi
  `Logger.h:71:19: warning: backslash-newline at end of file`.
  Makro `LOGF` sendiri terbukti berfungsi (harness: 6/6 log di
  debug, 4/4 di release). Fix (MUDAH): tambah newline di akhir file.
- **U-m3 — `AudioMath.h:15` `pristine::clamp` membungkam NaN dan
  membayangi `std::clamp`.** Harness: `clamp(NaN, 0, 1) = 0`
  (diam-diam, tanpa sinyal). Parameter bernama `min`/`max` juga
  membayangi makro `std::min/max` di platform yang
  mendefinisikannya. 0 caller, laten. DITAMPUNG (tergantung nasib
  `AudioMath.h`).
- **U-m4 — `SIMD.h:44,89` bound `i <= count - 4` overflow untuk
  `count == INT32_MIN`.** `count - 4` overflow signed (UB) pada
  nilai ekstrem itu; untuk `count` negatif biasa loop aman (harness:
  `count = 0` dan `-3` tak menulis apa pun). Murni pedantik. Fix
  (MUDAH): tulis `i + 4 <= count`.
- **U-m5 — `SIMD.h` tidak punya jalur x86.** `CMakeLists.txt`
  definisikan `X86_SSE=1`/`X86_AVX2=1` untuk `x86_64`/`x86`, tapi
  `SIMD.h:12-20` hanya mengenal NEON → fallback skalar di emulator
  x86. Benar secara hasil, lambat saja. DITAMPUNG.
- **U-m6 — `Logger.h:71` `LOGF` bernama FATAL tapi tidak abort.**
  Harness: program tetap hidup setelah `LOGF(...)`. Nama
  menyesatkan — pemanggil bisa mengira eksekusi berhenti. Fix
  (MUDAH): dokumentasikan, atau pakai `__android_log_assert`.
- **U-m7 — `AudioMath.h` di PCH (`CMakeLists.txt:287`) padahal
  0 pemakai.** Setiap sentuhan pada file ini me-rebuild seluruh TU.
  DITAMPUNG (tergantung nasib `AudioMath.h`).
- **U-m8 — `ScopedTrace.h:14` `mStart` di-assign di badan
  konstruktor, bukan init-list; log entry dicetak sebelum `mStart`
  diset.** Durasi terukur mengecualikan waktu log entry — sepele,
  tapi inkonsisten. MOOT (file dihapus U-M4).
- **U-m9 — Magic number tanpa nama:** `1e-15f` (`DenormalFix.h:7`),
  `1e-12f` (`AudioMath.h:12`), `16` (`AlignedBuffer.h:8`, default
  alignment), `"Trace"` (`ScopedTrace.h:11,16`). Yang hidup
  (`kDenormalThreshold`, `kLimiterThreshold` di `AudioConstants.h:62`)
  sudah bernama dengan benar — utils tak mengikuti pola itu.
  MOOT untuk file yang dihapus.

## Dugaan (U-D1…U-D4)

- **U-D1 — Jalur NEON `SIMD.h:36-58,78-103` belum terbukti benar
  saat dieksekusi.** Harness lokal tak mungkin: host x86 tak punya
  `<arm_neon.h>`, `PRISTINE_SIMD_NEON=0` di host. Code-reading:
  bound loop + tail loop benar, `vld1q_f32`/`vst1q_f32` legal pada
  buffer tak-aligned di ARMv8. Perlu verifikasi via GH build
  (kompilasi arm64) + eksekusi di device/emulator.
- **U-D2 — Tak ada pemakai utils dari Kotlin/TS/JNI.** Grep Kotlin
  + TS: nol. Satu-satunya kemiripan nama adalah implementasi TS
  mandiri di `src/shared/types/dsp.ts:182-186` — bukan binding.
  Terkonfirmasi sejauh grep; binding JNI baru akan mengubah ini.
- **U-D3 — `-Wno-macro-redefined` di `CMakeLists.txt` mungkin
  ditambahkan untuk menutupi konflik makro LOG (U-M2).** Belum
  dibuktikan via `git blame`; hanya korelasi.
- **U-D4 — `pristine::clamp` + `using namespace pristine` di 4 file
  JNI** (`NativeAudioFeed.cpp:9`, `NativeDSPModule.cpp:23`,
  `NativePristineAudio.cpp:9`, `NativeVisualizerModule.cpp:9`)
  berpotensi menimbulkan ambiguitas `clamp` vs `std::clamp` bila
  ada pemanggil tak-qualified di masa depan. Hari ini tak ada
  pemanggil tak-qualified (grep `clamp(` hanya menemukan
  `std::clamp`), jadi murni risiko masa depan. (Dua dari 4 file
  ini dihapus J-M3/J-M4.)

## Yang SEHAT di section ini

- **Logika skalar SIMD benar (terbukti harness):** `applyGain`
  count 7 (4+3 tail) → `2 4 6 8 10 12 14` tepat; `count = 0` dan
  `-3` aman tanpa tulis; `applyStereoGain` count 5 → `L=0.5, R=6.0`
  tepat. Bound loop NEON benar dari code-reading.
- **Gating `NDEBUG` di `Logger.h:20-28` benar (terbukti harness):**
  debug `LOGV/D/I/W/E/F` = 6 log + 6 evaluasi argumen; release
  (`-DNDEBUG`) = 4 log + 4 evaluasi — argumen `LOGD`/`LOGV` tak
  dievaluasi di release, jadi tak ada cost tersembunyi.
- **`dbToLinear` benar** (rumus `pow(10, db/20)`; round-trip −100 dB
  error 0; `dbToLinear(-inf) = 0`, NaN merambat sebagai NaN).
- **Keputusan threshold denormal yang benar sudah hidup di luar
  section ini:** `kDenormalThreshold = 1e-30f` dengan komentar
  pembenaran lengkap (`AudioConstants.h:62`), dipakai
  `sanitizeOutput`/`sanitizeInline`.
- **Tak ada masalah thread-safety di section ini:** semua fungsi
  stateless/inline tanpa shared mutable state — tak ada baca/tulis
  tanpa lock karena tak ada state yang dibagi. (Satu-satunya state
  adalah member `ScopedTrace`, yang per-instance.)
- **Tak ada stub terkompilasi yang menipu** (kebalikan pitfall
  AGENTS.md): file-file ini tak berpura-pura jalan — mereka memang
  tak jalan dan tak dikompilasi. Bahayanya adalah keheningan, bukan
  janji palsu.
- **Tak ada komentar basi yang bertentangan dengan kode di dalam
  section ini** (komentar basi yang ada justru di luar section:
  komentar `AudioCallback.cpp:315` tentang `zapDenormal` adalah
  catatan historis yang akurat).

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul)

- **U-M1/U-M4/U-M5/U-M6** — commit `ddf49d25`: hapus `DenormalFix.h` +
  `AlignedBuffer.h` + `ScopedTrace.h` (0 caller; DenormalFix
  threshold-nya salah).
- **U-m2** — commit `ccec8d39`: tambah trailing newline di `Logger.h`.
- **U-m4** — commit `ccec8d39`: bound loop SIMD jadi `i + 4 <= count`
  (2 tempat).
- **U-m6** — commit `ccec8d39`: dokumentasikan `LOGF` tidak abort
  (atau ganti `__android_log_assert` — dipilih dokumentasi,
  perilaku dipertahankan).

### DITAMPUNG buat sesi berikut

- Keputusan hapus-vs-hidupkan `Logger.h` / `SIMD.h` /
  `AudioMath.h` (butuh pilihan csheva) — beserta U-M2 (satukan
  makro LOG), U-M3 (satu sumber gain), U-m1, U-m3, U-m5, U-m7.
- U-D1 (verifikasi NEON di device), U-D3 (`git blame`
  `-Wno-macro-redefined`).
