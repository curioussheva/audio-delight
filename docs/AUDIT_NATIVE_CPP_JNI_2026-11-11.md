# Audit Native C++ — Section jni (2026-11-11)

Section `jni/`: 12 file, 1.466 baris. Audit 4 track paralel read-only
+ verifikasi ulang parent atas klaim kunci (J-M1, J-M2, J-M3) dari kode
+ + logcat #12. File JNI tidak bisa dikompilasi lokal (butuh jni.h/fbjni/
Oboe/FFmpeg) — verifikasi via GH build.

## Ringkasan

**0 BLOCKER, 5 MAJOR (2 HIDUP), 12 minor, 4 dugaan.**

## MAJOR

### J-M1 — Repeat All ↔ One TERTUKAR di boundary JNI (HIDUP, TERBUKTI kode)
`NativePlaybackModule.cpp:194-197` meng-cast `jint mode` mentah ke
`RepeatMode` tanpa pemetaan. Enum C++ satu-satunya
(`playback/PlaybackTypes.h:18-22`): `Off=0, One=1, All=2` — sama
dengan konstanta Android (`REPEAT_MODE_ONE=1, ALL=2`). Dua peta TS
bilang sebaliknya: `engine.ts:26-30` (`{off:0, all:1, track:2}`) dan
`playerStore.ts:863-864` (`"0=off, 1=all, 2=track"`). Jadi UI
"Repeat All" → native `One`, UI "Repeat One" → native `All`;
`MediaSessionManager.kt:220-224` mengikuti peta TS (1→ALL, 2→ONE),
jadi lock screen sepakat dengan UI — dan ketiganya bertentangan
dengan engine.
Dampak nyata: auto-advance EOF terbalik — "Repeat One" di UI
malah maju ke lagu berikut (native `All`), "Repeat All" malah
mengulang lagu yang sama (native `One`).
**KOREKSI P-M5:** bukti device P-M5 (logcat #9, Next di bawah
"Repeat One" → lagu BERGANTI) TETAP SAH — `PlaybackController::next()`
memakai `advanceManual()` yang maju satu langkah apa pun repeat
mode-nya (mid-queue; cek `TrackQueue.cpp:149-171`). Yang rusak
adalah semantik EOF, bukan tombol Next.
**KOREKSI MEMORY:** entri "native repeat 0=Off, 1=All, 2=One" SALAH.
Yang benar: C++ `Off=0, One=1, All=2`; peta TS-nya yang terbalik.
Fix (MUDAH): satu sumber kebenaran — betulkan kedua peta TS
(`all:2, track:1`) + `when` Kotlin (1→ONE, 2→ALL) + guard range
di JNI (tolak nilai di luar 0–2). Tes ulang device sesudahnya:
EOF di bawah Repeat One harus mengulang lagu yang sama, di bawah
Repeat All harus maju/wrap.

### J-M2 — Lazy-load dikalahkan DT_NEEDED; mekanisme cold-start freeze TERJAWAB (HIDUP)
`OnLoad.cpp` hanya dikompilasi ke `libappmodules.so`
(`CMakeLists.txt:352-354`); `libpristine-audio.so` tidak punya
`JNI_OnLoad`. 4 init call (`OnLoad.cpp:69,73,77,80`) hanya menyimpan
pointer JavaVM (idempotent, assignment saja). `CMakeLists.txt:427-434`
me-link `pristine-audio` ke `appmodules` → DT_NEEDED. RN memuat
`libappmodules.so` secara eager saat React init
(`MainApplication.kt:36` `loadReactNative(this)`) — loader menarik
`libpristine-audio.so` + closure FFmpeg di cold start juga, jadi
`ensureLoaded()` (lazy-load 2026-11-10) no-op. Konsisten dengan
logcat #12 (cold start tetap 98+124 frame skip) dan menjelaskan
kenapa lazy-load tidak menyembuhkan freeze.
Komentar `OnLoad.cpp:13-18` menyesatkan secara mekanisme: DT_NEEDED
berasal dari direktif link eksplisit, bukan dari 4 call itu
(menghapus call saja tidak memutusnya).
**Jalan keluar (2 langkah, DITAMPUNG — struktural, bukan perbaikan
mudah):** (a) beri `libpristine-audio.so` `JNI_OnLoad`-nya sendiri
yang menyimpan 4 pointer JavaVM; (b) hapus `pristine-audio` dari
`target_link_libraries(appmodules)` + hapus kebutuhan
`PRISTINE_EXPORT` untuk 4 simbol itu. Prasyarat BELUM terverifikasi:
codegen hasil build harus dipastikan tidak mereferensi simbol
pristine-audio (pendukung: template codegen membuat provider
mengembalikan SpecJSI generated → modul Kotlin, bukan kelas C++
handwritten). Baris framework RN yang dikutip track
(`DefaultSoLoader.kt:18` dkk.) TIDAK terverifikasi lokal (file
framework, bukan di repo) — konfirmasi via logcat device (J-d1):
urutan `JNI_OnLoad — EngineManager siap` vs
`pristine-audio loaded (lazy, first native use)`. Komentar lazy-load
di 6 file Kotlin (`NativeLibrary.kt:8-33` dkk.) mengklaim load "saat
pertama ada panggilan native" — klaim itu salah selama DT_NEEDED ada.

### J-M3 — `feedPCM16Buffer` global-buffer-overflow (laten, 0 caller)
`NativeAudioFeed.cpp:63-79`: `static float temp[8192];` lalu loop
`temp[i] = src[i]/32768.0f` untuk `samples = size/2` tanpa batas —
`size > 16384` byte → tulis lewat `temp[8191]`. Overflow-nya global
(BSS), merusak global tetangga diam-diam; `static` juga = race bila
dua thread memanggil bersamaan. `feedFloatBuffer` (`:18-44`) punya
gap sejenis: tanpa cek kapasitas, arti `size` ambigu (byte vs
sample). 0 caller repo-wide (`OboeAudioProcessor` tidak ada di
Kotlin/Java/TS) — file tetap terkompilasi (`CMakeLists.txt:90`).
Fix (MUDAH): hapus file dari build (0 caller — pola hapus yang aman).

### J-M4 — Kelas TurboModule C++ `NativePristineAudio.h` mati, stale, metodenya tak terdefinisi
`NativePristineAudio.h:17-18,32-110`: 14 override (`startEngine`,
`setEqBand`, …) tanpa satu pun `.cpp` implementasi; 0 file
meng-include header ini (terverifikasi grep); provider yang dipakai
adalah hasil codegen (`PristineAudioSpec_ModuleProvider` →
`NativePristineAudioSpecJSI` generated → modul Kotlin). Isi header
stale vs spec: 8 metode DSP tidak ada di
`src/specs/NativePristineAudio.ts`, dan tidak punya `pushAudio` yang
ada di spec. Pemakaian = gagal link (vtable undefined). Modul
Kotlin `NativePristineAudio.kt` + `.cpp`-nya juga mati end-to-end
(0 pemanggil TS; spec tidak di-import) — penghapusan Kotlin-nya
DITAMPUNG (butuh edit registrasi `PristineAudioPackage.kt:22`).
Fix (MUDAH): hapus header (+ `.cpp` + baris CMake).

### J-M5 — Nol pengecekan exception JNI di seluruh 12 file
`grep ExceptionCheck|ExceptionOccurred|ExceptionClear` di `jni/` =
0 hit (cek exception yang ada tinggal di luar section ini:
`NativeEventEmitter.cpp`, `ContentUriResolver.cpp`,
`DeviceRateDetector.cpp`, `AudioDeviceManager.cpp`). Situs terburuk:
`nativeGetQueue` (`NativePlaybackModule.cpp:212,218` — `FindClass`
tak dicek lalu dipakai di `NewObjectArray`; `NewStringUTF` tak dicek);
`nativeGetDevices` (`NativeDeviceModule.cpp:17-26` — fallback
`FindClass("java/lang/Object")` dipanggil dengan exception masih
pending); `nativeSetQueue` (`:250` — `GetArrayLength(uris)` tanpa
null-check); `nativePushAudio` (moot — file dihapus J-M4).
Fix (MUDAH): guard null + `ExceptionClear` di 3 situs di atas dulu.

## Minor (J-m1…J-m12)

- **J-m1:** Sisa DV-M3 — `nativeOnDeviceAdded` tetap memanggil
  `notifyDeviceAdded(d)` dengan descriptor default bila id tak
  ditemukan. Fix: `return` sebelum `notifyDeviceAdded`.
- **J-m2:** `getController()` tanpa lock (`NativePlaybackModule.cpp:10,22-33`):
  dua thread di panggilan pertama bisa sama-sama melihat pointer
  null + `initialize()` cek `initialized_.load(acquire)` tanpa CAS
  (`PlaybackController.cpp:28-30`) — double init menimpa member
  (queue/clock/state) → split-brain. Fix: `std::once_flag` /
  `call_once` (aman: `initialize()` selalu return true).
- **J-m3:** Setter DSP tanpa validasi nilai (`NativeDSPModule.cpp:32-46,100-330`):
  hanya `band` dicek; `gainDb`/`gain`/`balance`/`width`/`freq`/
  `intensity` mentah; `AudioState.h` simpan tanpa clamp (NaN/±Inf
  lolos ke audio thread). DITAMPUNG (keputusan: clamp di JNI atau
  di `AudioState`).
- **J-m4:** Cast enum tanpa range check (`NativeDSPModule.cpp:158`
  `static_cast<ProcessingMode>(mode)`; hanya 0/1/2). Gabung
  perbaikan J-M1 (guard di JNI).
- **J-m5:** `nativeSetActiveDevice` kembalikan `true` walau engine
  menolak (`NativeDeviceModule.cpp:141-161`): `applied=false` hanya
  di-log; JS promise resolve `true` sementara stream tak pindah.
  Fix: kembalikan `ok && applied`.
- **J-m6:** Header drift — `NativePlaybackModule.h` hanya deklarasi
  9 dari 19 fungsi JNI; `NativeDSPModule.cpp`,
  `NativeVisualizerModule.cpp`, `NativeAudioFeed.cpp` tak punya
  header. DITAMPUNG.
- **J-m7:** Komentar basi (3 tempat): (a) `OnLoad.cpp:13-18` soal
  DT_NEEDED; (b) `NativePlaybackModule.h:30-31` "Call this from
  JNI_OnLoad…" — tak pernah dipanggil, init sudah lazy di
  `getController()`; (c) `NativeEventEmitter.h:19-21` soal init di
  constructor Java — registrasi sudah pindah ke `ensureNativeReady()`
  lazy. Fix: betulkan komentarnya.
- **J-m8:** Magic number: `band >= 10` (`NativeDSPModule.cpp:39`);
  laju `8000..768000` (`NativePlaybackModule.cpp:267-269`); `values[5]`
  status device (`NativeDeviceModule.cpp:199-205`). DITAMPUNG.
- **J-m9:** `nativeGetQueue`/`nativeGetCurrentTrack` tak guard
  `queue()` (`NativePlaybackModule.cpp:210-218,303-310`) sementara
  saudaranya mengecek (`:137,150`). Samakan guard (gabung J-M5).
- **J-m10:** `nativeGetCurrentOutputDevice` tak cek `NewStringUTF`
  (`NativeDeviceModule.cpp:214-222`): null → `NewObject` gagal →
  return null (Kotlin menangani null; tetap tambah `ExceptionCheck`).
- **J-m11:** `nativeGetDevices`: satu nama device buruk meracuni
  seluruh daftar (`NativeDeviceModule.cpp:44-46`): `NewStringUTF`
  tak dicek per iterasi; exception pending → sisa loop no-op, array
  penuh null. Fix: `ExceptionCheck` per iterasi, lewati entri gagal.
  (Bukan leak — ketiga jstring + obj di-`DeleteLocalRef` tiap
  iterasi, terverifikasi.)
- **J-m12:** `initPlaybackModule` + `JSIInstaller` dead code
  terkompilasi, hapus saja (`NativePlaybackModule.cpp:315-317` +
  `.h:31`; `JSIInstaller.cpp` body kosong "future", 0 caller).
  Fix: hapus.

## Dugaan (J-d1…J-d4)

- **J-d1:** Thread & timing pemuatan `libappmodules.so` di device:
  perlu logcat bandingkan timestamp `JNI_OnLoad — EngineManager
  siap` vs `pristine-audio loaded (lazy, first native use)`.
- **J-d2:** Race double-`initialize()` di `getController()` — sudah
  dijawab J-m2 (fix `once_flag`).
- **J-d3:** Bukti device P-M5 kemungkinan menguji semantik tertukar
  (J-M1) — DIJAWAB: bukti Next manual TETAP SAH; yang perlu tes
  ulang adalah EOF repeat (lihat J-M1).
- **J-d4:** `nativeGetQueue` crash bila `FindClass` gagal — hanya
  bila APK rusak; guard murah (J-M5).

## Yang SEHAT di section ini

- Tidak ada engine start di `JNI_OnLoad` (fix 2026-10-07 bertahan;
  `OnLoad.cpp:84-94` hanya log).
- `nativeSetQueue` teliti: validasi laju `8000..768000`, `rates`
  boleh null/pendek, `GetStringUTFChars` null-safe, `DeleteLocalRef`
  per elemen, `setTracks` sekali di akhir.
- `nativePlay` kembalikan `jboolean` — kegagalan decoder terlihat
  JS; preload track sebelum start menjaga bit-perfect.
- `setPlaybackRate`/`setPitchRatio` divalidasi callee (clamp
  0.5–2.0 + log) — JNI tak perlu validasi ulang.
- Refcount JNI disiplin: `ReleaseStringUTFChars` di semua jalur
  preset/device; `DeleteLocalRef` per objek di `nativeGetDevices`;
  tidak ada kebocoran local ref ditemukan.
- Visualizer: `kVisualizerSize = 2048` bernama + sinkron dengan
  `FFT_SIZE` Kotlin dan `VisualizerBuffer::kSize`; `NewFloatArray`
  null-check; Kotlin `getFFTData` tangkap `Throwable` → null JNI
  jadi promise reject, bukan crash.
- Device jujur: `nativeSetActiveDevice` kembalikan hasil nyata
  manager + teruskan ke engine; `nativeGetActiveDeviceStatus`
  laporkan requested-vs-actual 5 elemen.
- Callback native→JS sehat (`NativeEventEmitter.cpp`): mutex,
  copy-under-lock, `ExceptionCheck` setelah `CallVoidMethod`,
  detach hanya bila attach.
- Build hygiene: `-fvisibility=hidden` + `PRISTINE_EXPORT`
  eksplisit untuk 4 simbol lintas-lib; `OnLoad.cpp` dipisah dari
  `pristine-audio`.

## Perbaikan

### DIKERJAKAN 2026-11-11 (yang mudah; build menyusul)

- **J-M1** — commit `TBD`: betulkan peta TS (`engine.ts`,
  `playerStore.ts`: `all:2, track:1`) + `when` Kotlin
  (1→ONE, 2→ALL) + guard range di JNI `nativeSetRepeatMode`.
  Tes ulang device: EOF Repeat One = ulang lagu sama, Repeat All =
  maju/wrap.
- **J-M3** — commit `TBD`: hapus `jni/NativeAudioFeed.cpp` +
  baris CMake.
- **J-M4** — commit `TBD`: hapus `jni/NativePristineAudio.h` +
  `.cpp` + baris CMake. (Kotlin module + registrasi DITAMPUNG.)
- **J-M5** — commit `TBD`: guard null/exception di `nativeGetQueue`,
  `nativeGetDevices`, `nativeSetQueue` (+ J-m9, J-m10, J-m11 —
  satu tema: hygiene null/exception di getter JNI).
- **J-m1** — commit `TBD`: `nativeOnDeviceAdded` return dini bila
  id tak ditemukan.
- **J-m2** — commit `TBD`: `getController()` pakai
  `std::once_flag`/`call_once`.
- **J-m5** — commit `TBD`: `nativeSetActiveDevice` kembalikan
  `ok && applied`.
- **J-m7** — commit `TBD`: betulkan 3 komentar basi (OnLoad,
  NativePlaybackModule.h, NativeEventEmitter.h).
- **J-m12** — commit `TBD`: hapus `JSIInstaller.h/.cpp` +
  `initPlaybackModule` (decl + def) + baris CMake.

### DITAMPUNG buat sesi berikut

- **J-M2 (cold-start):** rencana 2 langkah di atas + verifikasi
  prasyarat codegen + ukur frame skip sebelum/sesudah di device.
  Ini perbaikan struktural, bukan "mudah".
- J-m3 (validasi setter DSP), J-m6 (header drift), J-m8 (magic
  number), J-m4 (cast ProcessingMode — gabung J-M1 bila dikerjakan).
- Sisa minor/dugaan lain.
