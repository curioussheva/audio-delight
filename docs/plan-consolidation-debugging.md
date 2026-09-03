# Plan — Konsolidasi & Debugging Native ⟷ JS/UI

**Status per 3 September 2026**
Dokumen ini menggabungkan hasil inventarisasi JNI, patch audio engine (`PlaybackController → AudioEngine`), dan peta fitur berdasarkan struktur `cpp/` terbaru. Tujuannya: urutan kerja yang jelas dari "pastikan native benar" sampai "sinkronkan ke JS/UI", supaya tidak loncat-loncat.

---

## 🎯 TL;DR

1. Patch 5 file (`AudioCallback.h/.cpp`, `AudioEngine.h/.cpp`, `EngineManager.cpp`) sudah ditulis — **prioritas #1: tempel, build, test suara keluar.**
2. Ada ambiguitas belum terjawab: `PlaybackManager.cpp/.h` muncul di tree tapi `EngineManager` cuma pegang `PlaybackController`. Wajib dikonfirmasi sebelum menganggap wiring ini final.
3. Setelah native solid → baru masuk ke sinkronisasi JS/UI, bukan sebaliknya.

---

## 🔴 Fase A — Selesaikan & Verifikasi Native (WAJIB paling dulu)

### A1. Terapkan patch audio engine

File yang sudah final dan siap tempel (lihat riwayat sesi untuk isi lengkap):

- [ ] `core/AudioCallback.h` — tambah `mPlaybackController`, `mSampleRate` (pakai `kDefaultSampleRate` dari `AudioConstants.h`), `mScratchInterleaved`
- [ ] `core/AudioCallback.cpp` — `onAudioReady()` cabang ke `PlaybackController::render()` kalau tersedia & initialized, fallback ke `AudioBufferController::popStereo()` kalau tidak
- [ ] `core/AudioEngine.h` — tambah `setPlaybackController(...)`, forward-declare `playback::PlaybackController`
- [ ] `core/AudioEngine.cpp` — implementasi `setPlaybackController()`, panggil `mCallback.setSampleRate(...)` di `start()`
- [ ] `manager/EngineManager.cpp` — `start()` memanggil `mPlayback.initialize()` (kalau belum) lalu `mEngine.setPlaybackController(&mPlayback)` sebelum `mEngine.start(...)`

**Setelah tempel:** commit → push → build via GitHub Actions.

### A2. Konfirmasi tidak ada jalur playback ganda (BLOCKER)

Temuan terbaru dari `tree`: ada `playback/PlaybackManager.cpp/.h` yang **belum pernah diverifikasi** — terpisah dari `PlaybackController.cpp/.h` yang baru saja di-wiring ke `AudioCallback`. `EngineManager.h` (sudah di-`cat` langsung) memang cuma punya member `playback::PlaybackController mPlayback`, bukan `PlaybackManager`. Tapi kalau `NativePlaybackModule.cpp` (JNI lama yang sudah dipakai UI player) ternyata memanggil `PlaybackManager` — bukan `EngineManager::get().playback()` — berarti ada **dua orkestrasi playback berbeda** yang bisa saling tabrakan atau membingungkan mana yang benar-benar aktif.

```bash
# Apakah NativePlaybackModule.cpp manggil PlaybackManager atau PlaybackController?
grep -n "PlaybackManager\|PlaybackController\|EngineManager" \
  android/app/src/main/cpp/jni/NativePlaybackModule.cpp

# Apa isi PlaybackManager — dia orkestrasi terpisah atau cuma wrapper lama?
cat android/app/src/main/cpp/playback/PlaybackManager.h

# Apakah PlaybackNativeBridge.kt (custom service baru) manggil yang mana?
cat android/app/src/main/java/com/pristineaudio/playback/PlaybackNativeBridge.kt
```

- [ ] Jalankan 3 command di atas
- [ ] Kalau `PlaybackManager` ternyata dead code / sisa refactor lama → catat untuk dihapus di fase pembersihan
- [ ] Kalau `PlaybackManager` ternyata masih aktif dipanggil dari `NativePlaybackModule.cpp` → **STOP**, ini butuh keputusan arsitektur dulu sebelum lanjut testing (kemungkinan perlu unifikasi ke satu jalur, bukan sekadar patch tambahan)

### A3. Test manual setelah build sukses

- [ ] Play satu lagu → pastikan suara benar-benar keluar dari speaker/headphone
- [ ] Buka app tanpa play apapun (idle state) → pastikan **tetap senyap**, tidak ada noise/glitch dari `PlaybackController::render()` yang dipanggil sebelum ada track ter-load
- [ ] Cek `getUnderruns()` — ingat bahwa `render()` return `void`, jadi underrun counter kemungkinan tidak akurat untuk jalur ini (bukan bug baru, cuma keterbatasan yang perlu diketahui)

---

## 🟡 Fase B — Inventarisasi JNI Final (update dari struktur folder terbaru)

Tree `cpp/` yang baru diupload menunjukkan banyak folder yang belum pernah masuk radar inventarisasi lama: `decoder/`, `devices/`, `dsp/convolution/`, `dsp/headphone/`, `fft/`, `session/`, `usb/`. Sebelum ke JS, petakan dulu semua ini secara faktual.

### B1. Re-grep JNIEXPORT dengan cakupan penuh

```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp > ~/jni_audit/jni_exports_v2.txt
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/ > ~/jni_audit/kotlin_external_v2.txt
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done > ~/jni_audit/ts_specs_v2.txt
```

- [ ] Bandingkan dengan hasil inventarisasi sebelumnya — pastikan tidak ada JNI export baru yang terlewat sejak native module berkembang

### B2. Status folder `fft/` — dipakai atau dead code?

Ada dua sistem visualizer yang berpotensi paralel: `visualizer/VisualizerBuffer` (sudah ke-bridge lewat `getFFTData()` → `NativeVisualizerBridge`) vs `fft/` (`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`, `WaveformVisualizer`) yang belum ada JNI surface sama sekali.

```bash
# Siapa yang instantiate class-class di fft/?
grep -rln "SpectrumVisualizer\|WaveformVisualizer\|SpectrumAnalyzer" android/app/src/main/cpp/ --include="*.cpp" --include="*.h" | grep -v "^android/app/src/main/cpp/fft/"
```

- [ ] Kalau nol hasil di luar folder `fft/` sendiri → kemungkinan besar dead code / belum pernah diintegrasikan ke `AudioCallback` atau `EngineManager`. Catat sebagai backlog, bukan bug.
- [ ] Kalau ada hasil → berarti aktif dipakai, cari tahu di mana titik integrasinya

### B3. Modul besar yang genuinely belum ter-bridge (perlu keputusan prioritas)

| Modul | Lokasi | Status |
|---|---|---|
| Convolution engine (cabinet/room/IR sim) | `dsp/convolution/*` | Nol JNI surface |
| Headphone correction & crossfeed | `dsp/headphone/*` | Nol JNI surface |
| Session management (audio focus, noisy receiver, transport controls source-aware) | `session/*` | Nol JNI surface, tapi kemungkinan sebagian sudah dihandle lewat `MediaSessionManager.kt` di layer Android SDK, bukan custom JNI — perlu dicek |
| USB granular control (clock sync, DAC capabilities detail) | `usb/USBClockSync`, `usb/USBDACCapabilities` | `USBDACModule.ts` ada, tapi kemungkinan besar akses lewat `UsbManager` Android SDK langsung, bukan lewat native ini |
| Convolution/headphone/session — profiling tools | `profiling/*` | Internal/debug, sengaja tidak perlu bridge |

- [ ] Untuk tiap baris di atas, putuskan: prioritas fitur berikutnya, atau backlog resmi (dicatat, tidak dikerjakan sekarang)

### B4. Konfirmasi USB DAC — native atau Android SDK?

```bash
grep -n "USBDeviceManager\|UsbManager\|external fun" \
  android/app/src/main/java/com/pristineaudio/usb/USBDACModule.kt
```

- [ ] Kalau `USBDACModule.kt` murni pakai `android.hardware.usb.UsbManager` tanpa `external fun` sama sekali → `cpp/usb/*` adalah kapabilitas native yang belum pernah dipakai UI, catat di backlog B3

---

## 🟢 Fase C — Sinkronisasi JS/UI (baru mulai setelah Fase A & B clear)

Urutan ini disengaja: percuma menyamakan JS kalau native masih ada ambiguitas jalur playback (`PlaybackController` vs `PlaybackManager`) — bug yang muncul nanti bisa salah didiagnosis sebagai masalah JS padahal akarnya di native.

### C1. Testing manual per fitur

- [ ] **Player** — play/pause/seek/next/previous, queue, shuffle, repeat (bergantung pada Fase A clear)
- [ ] **Equalizer** — band gain, bass boost, presets, virtualizer
- [ ] **Visualizer** — pastikan sumber data jelas (VisualizerBuffer vs fft/, lihat B2)
- [ ] **USB DAC** — device detection, exclusive mode, sample rate switching
- [ ] **Library** — scan, metadata enrichment, media store sync

### C2. Media session & background playback

- [ ] Notifikasi media & kontrol lock screen (via `MediaSessionManager.kt`)
- [ ] Audio focus — pause otomatis saat panggilan masuk / app lain minta fokus
- [ ] Noisy receiver — pause otomatis saat headphone dicabut
- [ ] Verifikasi apakah `session/AudioFocusManager.cpp` dkk native benar-benar dipakai, atau `MediaSessionManager.kt` handle semua ini di layer Kotlin/Android SDK (lihat B3)

### C3. Pembersihan RNTP total (dari roadmap sebelumnya, tetap relevan)

- [ ] `pnpm remove react-native-track-player`
- [ ] Hapus deklarasi tipe di `globals.d.ts`
- [ ] Hapus `scripts/patch-pristine.sh` dan `scripts/custom-rntp/`
- [ ] Hapus langkah patch dari workflow CI
- [ ] Hapus referensi di `app.json`
- [ ] Konfirmasi ulang `RNTP_ENABLED` — pencarian sebelumnya nol hasil di `src/`, `.gradle`, `.json`, `.properties`, `.env*`; kemungkinan ada di lokasi lain yang belum tercakup pola grep

```bash
grep -rn "RNTP_ENABLED" . 2>/dev/null | grep -v node_modules
```

### C4. Bridge baru untuk kapabilitas prioritas (hasil keputusan B3)

- [ ] Tambah `external fun` di Kotlin untuk fungsi native yang diputuskan jadi prioritas
- [ ] Tambah/lengkapi TS spec di `src/specs/`
- [ ] Pakai di `features/` yang relevan
- [ ] Termasuk item lama yang masih orphan: `setProcessingMode` (chain C++ sudah lengkap, tinggal 1 baris `external fun` + `@ReactMethod` wrapper di `NativeDSPModule.kt`)

---

## 📋 Catatan Silang Referensi

| Item | Ditemukan di sesi | Status |
|---|---|---|
| `NativeAudioFeed.cpp` (`feedFloatBuffer`/`feedPCM16Buffer`) | Investigasi JNI awal | Target class-nya `OboeAudioProcessor` (RNTP fork). Kemungkinan besar sudah tidak dipakai sejak `RNTP_ENABLED = false`. Kandidat dihapus bareng C3, bukan ditambal. |
| `NativeDeviceModule.nativeGetDevices()` stub kosong | Sesi lama (31 Agustus) | Belum diverifikasi ulang — cek lagi di Fase C1 saat testing USB DAC / device list |
| `initPlaybackModule()` di `OnLoad.cpp` | Sesi lama | Ternyata pola wiring pindah ke `EngineManager::start()`, bukan `OnLoad.cpp` — sudah ditangani di Fase A1 |
| `PlaybackManager.cpp/.h` | Tree terbaru (sesi ini) | **Belum diverifikasi — lihat A2, blocker potensial** |

---

## Urutan Eksekusi Ringkas

```
A1 (tempel patch) → A2 (konfirmasi PlaybackManager, BLOCKER) → A3 (test suara)
        ↓ (setelah A clear)
B1 (re-inventarisasi JNI) → B2 (status fft/) → B3 (putuskan prioritas) → B4 (USB DAC)
        ↓ (setelah B clear)
C1 (testing per fitur) → C2 (media session) → C3 (bersihkan RNTP) → C4 (bridge baru)
```

Jangan loncat ke Fase C sebelum A2 terjawab — kalau ada dua jalur playback yang tabrakan, testing UI di Fase C bisa menghasilkan bug yang membingungkan (kadang jalan kadang tidak, tergantung fitur mana yang secara tidak sengaja pakai jalur mana).

---

Update 1 

---

# Plan — Konsolidasi & Debugging Native ⟷ JS/UI

**Status per 3 September 2026**
Dokumen ini menggabungkan hasil inventarisasi JNI, patch audio engine (`PlaybackController → AudioEngine`), dan peta fitur berdasarkan struktur `cpp/` terbaru. Tujuannya: urutan kerja yang jelas dari "pastikan native benar" sampai "sinkronkan ke JS/UI", supaya tidak loncat-loncat.

---

## 🎯 TL;DR

1. Patch 5 file (`AudioCallback.h/.cpp`, `AudioEngine.h/.cpp`, `EngineManager.cpp`) sudah ditulis — **prioritas #1: tempel, build, test suara keluar.**
2. Ada ambiguitas belum terjawab: `PlaybackManager.cpp/.h` muncul di tree tapi `EngineManager` cuma pegang `PlaybackController`. Wajib dikonfirmasi sebelum menganggap wiring ini final.
3. Setelah native solid → baru masuk ke sinkronisasi JS/UI, bukan sebaliknya.

---

## 🔴 Fase A — Selesaikan & Verifikasi Native (WAJIB paling dulu)

### A1. Terapkan patch audio engine

File yang sudah final dan siap tempel (lihat riwayat sesi untuk isi lengkap):

- [ ] `core/AudioCallback.h` — tambah `mPlaybackController`, `mSampleRate` (pakai `kDefaultSampleRate` dari `AudioConstants.h`), `mScratchInterleaved`
- [ ] `core/AudioCallback.cpp` — `onAudioReady()` cabang ke `PlaybackController::render()` kalau tersedia & initialized, fallback ke `AudioBufferController::popStereo()` kalau tidak
- [ ] `core/AudioEngine.h` — tambah `setPlaybackController(...)`, forward-declare `playback::PlaybackController`
- [ ] `core/AudioEngine.cpp` — implementasi `setPlaybackController()`, panggil `mCallback.setSampleRate(...)` di `start()`
- [ ] `manager/EngineManager.cpp` — `start()` memanggil `mPlayback.initialize()` (kalau belum) lalu `mEngine.setPlaybackController(&mPlayback)` sebelum `mEngine.start(...)`

**Setelah tempel:** commit → push → build via GitHub Actions.

### A2. Konfirmasi tidak ada jalur playback ganda — ✅ SELESAI (3 September 2026)

**Hasil verifikasi:**

- `NativePlaybackModule.cpp` (JNI lama, dipakai UI player) memakai `pristine::EngineManager::get().playback()` — singleton yang sama persis yang di-wiring ke `AudioCallback` di Fase A1. Ada auto-start engine (`EngineManager::get().start()`) di `getController()` kalau engine belum jalan saat `play()` dipanggil.
- `PlaybackManager.cpp/.h` **dikonfirmasi dead code** — `grep -rl` di seluruh `cpp/` dan `java/` nol hasil pemanggilan di luar file definisinya sendiri (cuma muncul di `compile_commands.json`, itu artefak build). Class ini punya `PlaybackController` sendiri (`unique_ptr`) — kalau sampai dipakai, akan jadi instance kedua yang terpisah dari singleton `EngineManager::mPlayback` dan tidak akan pernah bersuara. Untungnya tidak dipakai.
- `NativePlaybackModule.kt` method `*FromService()` (`playFromService()`, dst) dikonfirmasi cuma wrapper tipis ke `external fun` dasar yang sama (`playFromService() = nativePlay()`) — bukan jalur terpisah, cuma entry point ganda (JS via `@ReactMethod`, Kotlin service via `PlaybackNativeBridge`) yang berujung ke fungsi JNI yang sama.
- `initPlaybackModule()` (fungsi lama yang dulu dicurigai "tidak pernah dipanggil") ternyata tidak masalah — `getController()` di `NativePlaybackModule.cpp` punya fallback lazy-init sendiri, jadi fungsi itu vestigial tapi tidak berbahaya.

**Kesimpulan: satu singleton `PlaybackController`, satu jalur JNI, tidak ada tabrakan. Patch Fase A1 aman ditempel.**

`PlaybackManager.cpp/.h` dicatat di backlog pembersihan (Fase C3 / catatan silang referensi di bawah).

### A3. Test manual setelah build sukses

- [ ] Play satu lagu → pastikan suara benar-benar keluar dari speaker/headphone
- [ ] Buka app tanpa play apapun (idle state) → pastikan **tetap senyap**, tidak ada noise/glitch dari `PlaybackController::render()` yang dipanggil sebelum ada track ter-load
- [ ] Cek `getUnderruns()` — ingat bahwa `render()` return `void`, jadi underrun counter kemungkinan tidak akurat untuk jalur ini (bukan bug baru, cuma keterbatasan yang perlu diketahui)

---

## 🟡 Fase B — Inventarisasi JNI Final (update dari struktur folder terbaru)

Tree `cpp/` yang baru diupload menunjukkan banyak folder yang belum pernah masuk radar inventarisasi lama: `decoder/`, `devices/`, `dsp/convolution/`, `dsp/headphone/`, `fft/`, `session/`, `usb/`. Sebelum ke JS, petakan dulu semua ini secara faktual.

### B1. Re-grep JNIEXPORT dengan cakupan penuh

```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp > ~/jni_audit/jni_exports_v2.txt
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/ > ~/jni_audit/kotlin_external_v2.txt
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done > ~/jni_audit/ts_specs_v2.txt
```

- [ ] Bandingkan dengan hasil inventarisasi sebelumnya — pastikan tidak ada JNI export baru yang terlewat sejak native module berkembang

### B2. Status folder `fft/` — dipakai atau dead code?

Ada dua sistem visualizer yang berpotensi paralel: `visualizer/VisualizerBuffer` (sudah ke-bridge lewat `getFFTData()` → `NativeVisualizerBridge`) vs `fft/` (`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`, `WaveformVisualizer`) yang belum ada JNI surface sama sekali.

```bash
# Siapa yang instantiate class-class di fft/?
grep -rln "SpectrumVisualizer\|WaveformVisualizer\|SpectrumAnalyzer" android/app/src/main/cpp/ --include="*.cpp" --include="*.h" | grep -v "^android/app/src/main/cpp/fft/"
```

- [ ] Kalau nol hasil di luar folder `fft/` sendiri → kemungkinan besar dead code / belum pernah diintegrasikan ke `AudioCallback` atau `EngineManager`. Catat sebagai backlog, bukan bug.
- [ ] Kalau ada hasil → berarti aktif dipakai, cari tahu di mana titik integrasinya

### B3. Modul besar yang genuinely belum ter-bridge (perlu keputusan prioritas)

| Modul | Lokasi | Status |
|---|---|---|
| Convolution engine (cabinet/room/IR sim) | `dsp/convolution/*` | Nol JNI surface |
| Headphone correction & crossfeed | `dsp/headphone/*` | Nol JNI surface |
| Session management (audio focus, noisy receiver, transport controls source-aware) | `session/*` | Nol JNI surface, tapi kemungkinan sebagian sudah dihandle lewat `MediaSessionManager.kt` di layer Android SDK, bukan custom JNI — perlu dicek |
| USB granular control (clock sync, DAC capabilities detail) | `usb/USBClockSync`, `usb/USBDACCapabilities` | `USBDACModule.ts` ada, tapi kemungkinan besar akses lewat `UsbManager` Android SDK langsung, bukan lewat native ini |
| Convolution/headphone/session — profiling tools | `profiling/*` | Internal/debug, sengaja tidak perlu bridge |

- [ ] Untuk tiap baris di atas, putuskan: prioritas fitur berikutnya, atau backlog resmi (dicatat, tidak dikerjakan sekarang)

### B4. Konfirmasi USB DAC — native atau Android SDK?

```bash
grep -n "USBDeviceManager\|UsbManager\|external fun" \
  android/app/src/main/java/com/pristineaudio/usb/USBDACModule.kt
```

- [ ] Kalau `USBDACModule.kt` murni pakai `android.hardware.usb.UsbManager` tanpa `external fun` sama sekali → `cpp/usb/*` adalah kapabilitas native yang belum pernah dipakai UI, catat di backlog B3

---

## 🟢 Fase C — Sinkronisasi JS/UI (baru mulai setelah Fase A & B clear)

Urutan ini disengaja: percuma menyamakan JS kalau native masih ada ambiguitas jalur playback (`PlaybackController` vs `PlaybackManager`) — bug yang muncul nanti bisa salah didiagnosis sebagai masalah JS padahal akarnya di native.

### C1. Testing manual per fitur

- [ ] **Player** — play/pause/seek/next/previous, queue, shuffle, repeat (bergantung pada Fase A clear)
- [ ] **Equalizer** — band gain, bass boost, presets, virtualizer
- [ ] **Visualizer** — pastikan sumber data jelas (VisualizerBuffer vs fft/, lihat B2)
- [ ] **USB DAC** — device detection, exclusive mode, sample rate switching
- [ ] **Library** — scan, metadata enrichment, media store sync

### C2. Media session & background playback

- [ ] Notifikasi media & kontrol lock screen (via `MediaSessionManager.kt`)
- [ ] Audio focus — pause otomatis saat panggilan masuk / app lain minta fokus
- [ ] Noisy receiver — pause otomatis saat headphone dicabut
- [ ] Verifikasi apakah `session/AudioFocusManager.cpp` dkk native benar-benar dipakai, atau `MediaSessionManager.kt` handle semua ini di layer Kotlin/Android SDK (lihat B3)

### C3. Pembersihan RNTP total (dari roadmap sebelumnya, tetap relevan)

- [ ] `pnpm remove react-native-track-player`
- [ ] Hapus deklarasi tipe di `globals.d.ts`
- [ ] Hapus `scripts/patch-pristine.sh` dan `scripts/custom-rntp/`
- [ ] Hapus langkah patch dari workflow CI
- [ ] Hapus referensi di `app.json`
- [ ] Konfirmasi ulang `RNTP_ENABLED` — pencarian sebelumnya nol hasil di `src/`, `.gradle`, `.json`, `.properties`, `.env*`; kemungkinan ada di lokasi lain yang belum tercakup pola grep

```bash
grep -rn "RNTP_ENABLED" . 2>/dev/null | grep -v node_modules
```

### C4. Bridge baru untuk kapabilitas prioritas (hasil keputusan B3)

- [ ] Tambah `external fun` di Kotlin untuk fungsi native yang diputuskan jadi prioritas
- [ ] Tambah/lengkapi TS spec di `src/specs/`
- [ ] Pakai di `features/` yang relevan
- [ ] Termasuk item lama yang masih orphan: `setProcessingMode` (chain C++ sudah lengkap, tinggal 1 baris `external fun` + `@ReactMethod` wrapper di `NativeDSPModule.kt`)

---

## 📋 Catatan Silang Referensi

| Item | Ditemukan di sesi | Status |
|---|---|---|
| `NativeAudioFeed.cpp` (`feedFloatBuffer`/`feedPCM16Buffer`) | Investigasi JNI awal | Target class-nya `OboeAudioProcessor` (RNTP fork). Kemungkinan besar sudah tidak dipakai sejak `RNTP_ENABLED = false`. Kandidat dihapus bareng C3, bukan ditambal. |
| `NativeDeviceModule.nativeGetDevices()` stub kosong | Sesi lama (31 Agustus) | Belum diverifikasi ulang — cek lagi di Fase C1 saat testing USB DAC / device list |
| `initPlaybackModule()` di `OnLoad.cpp` | Sesi lama | Ternyata pola wiring pindah ke `EngineManager::start()`, bukan `OnLoad.cpp` — sudah ditangani di Fase A1 |
| `PlaybackManager.cpp/.h` | Tree terbaru (sesi ini) | ✅ Dikonfirmasi dead code (A2) — punya `PlaybackController` sendiri, terpisah dari singleton `EngineManager`. Kandidat dihapus di Fase C3. |

---

## Urutan Eksekusi Ringkas

```
A1 (tempel patch) → A2 ✅ selesai → A3 (test suara) ← KITA DI SINI
        ↓ (setelah A clear)
B1 (re-inventarisasi JNI) → B2 (status fft/) → B3 (putuskan prioritas) → B4 (USB DAC)
        ↓ (setelah B clear)
C1 (testing per fitur) → C2 (media session) → C3 (bersihkan RNTP) → C4 (bridge baru)
```

Jangan loncat ke Fase C sebelum A2 terjawab — kalau ada dua jalur playback yang tabrakan, testing UI di Fase C bisa menghasilkan bug yang membingungkan (kadang jalan kadang tidak, tergantung fitur mana yang secara tidak sengaja pakai jalur mana).

---

Update 2

---
...
# Plan — Konsolidasi & Debugging Native ⟷ JS/UI

**Status per 3 September 2026 (update 2)**
Dokumen ini menggabungkan hasil inventarisasi JNI, patch audio engine (`PlaybackController → AudioEngine`), fix rantai bug realtime playback, dan insight arsitektur Processing Mode (BitPerfect/DSP/Immersive) yang ditemukan saat investigasi bit-perfect. Tujuannya: urutan kerja yang jelas dari "pastikan native benar" sampai "sinkronkan ke JS/UI", supaya tidak loncat-loncat.

---

## 🎯 TL;DR

1. Patch wiring `PlaybackController → AudioEngine` sudah ditempel dan **build sukses** setelah dua putaran perbaikan (lihat A1).
2. Audio **masih belum bersuara** setelah build sukses — root cause ditemukan: `PlaybackController::play()` tidak pernah memuat track ke decoder. Fix sudah ditulis (A1.3), **belum di-build/test ulang**.
3. Temuan arsitektur baru: mode **Immersive** dibangun penuh di native (enum, pipeline, parameter granular) tapi **tidak pernah diekspos ke UI** — onboarding cuma punya 2 pilihan (bit-perfect/dsp), bukan 3. Lihat bagian baru "Insight — Arsitektur Processing Mode".
4. Ditemukan juga: status *exclusive mode* audio stream (`AudioStreamController::isExclusive()`) sudah dihitung akurat di native tapi **tidak pernah sampai ke JS** — user tidak pernah tahu apakah bit-perfect yang mereka pilih benar-benar exclusive atau diam-diam fallback ke shared mode.
5. Copy onboarding/settings untuk transparansi bit-perfect vs DAC sudah didraft (tahap rancangan, **belum ditempel ke kode** — insight only, sesuai permintaan).

---

## 🔴 Fase A — Selesaikan & Verifikasi Native (WAJIB paling dulu)

### A1. Terapkan patch audio engine — ✅ DITEMPEL, ✅ BUILD SUKSES (setelah 2 putaran fix)

File yang ditempel (lihat riwayat sesi untuk isi lengkap):

- [x] `core/AudioCallback.h` — tambah `mPlaybackController`, `mSampleRate` (pakai `kDefaultSampleRate` dari `AudioConstants.h`), `mScratchInterleaved`
- [x] `core/AudioCallback.cpp` — `onAudioReady()` cabang ke `PlaybackController::render()` kalau tersedia & initialized, fallback ke `AudioBufferController::popStereo()` kalau tidak
- [x] `core/AudioEngine.h` — tambah `setPlaybackController(...)`, forward-declare `playback::PlaybackController`
- [x] `core/AudioEngine.cpp` — implementasi `setPlaybackController()`, panggil `mCallback.setSampleRate(...)` di `start()`
- [x] `manager/EngineManager.cpp` — `start()` memanggil `mPlayback.initialize()` (kalau belum) lalu `mEngine.setPlaybackController(&mPlayback)` sebelum `mEngine.start(...)`

### A1.1 Linker error putaran pertama — ✅ FIXED

Build pertama gagal di linking (bukan compile) — `--gc-sections` sebelumnya membuang `MetricsCollector` karena `PlaybackController::render()` tidak pernah benar-benar dipanggil siapa pun sebelum patch A1. Begitu `render()` tersambung, linker butuh implementasi `MetricsCollector` yang **tidak pernah ditulis** (`PlaybackMetrics.h` ada, `.cpp`-nya tidak pernah eksis — dikonfirmasi lewat `find` dan cek `CMakeLists.txt` GLOB_RECURSE, bukan masalah registrasi build).

- [x] File baru `playback/PlaybackMetrics.cpp` ditulis lengkap (constructor, semua counter/gauge pakai `memory_order_relaxed`, EMA latency, `snapshot()`) dan ditempel
- [x] Tidak perlu ubah `CMakeLists.txt` — `GLOB_RECURSE "playback/*.cpp"` otomatis pick up file baru
- [x] Build kedua: **sukses**, `libpristine-audio.so` ter-link tanpa error

### A1.2 Bug baru ditemukan setelah build sukses: audio tetap tidak keluar

App boot lancar, log `💎 [AudioEngine] Custom Oboe Engine Ready` muncul, scan library sukses, `playSong()` terpanggil — tapi tidak ada suara. Ditelusuri lewat rantai pemanggilan aktual (`engine.ts` → `NativePlaybackService` → `PlaybackNativeBridge` → `NativePlaybackModule.kt` → JNI → `EngineManager::get().playback()`), ditemukan:

- `nativeSetQueue()` cuma mengisi `TrackQueue` (`setTracks()`, yang mereset `mCurrentIndex = 0` — dikonfirmasi lewat `TrackQueue.cpp`), **tidak pernah memanggil `loadTrack()`**
- `PlaybackController::play()` (versi lama) cuma `playing_.store(true)` + `decoderWorker_->resume()` — tapi `decoderWorker_` **hanya dibuat di `startDecoder()`**, yang cuma dipanggil dari `loadTrack()`, yang cuma dipanggil dari `next()`/`previous()`
- JS (`playerStore.ts`) cuma memanggil `setQueue()` lalu `play()` — tidak pernah `next()`/`skipTo()` untuk memicu load track pertama
- Kesimpulan: kontrak "isi queue → play → otomatis mulai dari track pertama" **tidak pernah diimplementasikan** di native. `pcmQueue_` selalu kosong, `render()` selalu mengeluarkan silence.

### A1.3 Fix `PlaybackController::play()` — ✅ DITULIS, ⏳ BELUM DI-BUILD/TEST

```cpp
bool PlaybackController::play() {
    if (!initialized_.load(std::memory_order_acquire))
        return false;

    if (!decoderWorker_) {
        if (!queue_) return false;

        auto track = queue_->current();
        if (!track) return false;

        if (!loadTrack(*track)) {
            return false;
        }
    }

    playing_.store(true, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->resume();
    }

    return true;
}
```

Logika: kalau `decoderWorker_` belum ada (belum pernah ada track dimuat), ambil track aktif dari `queue_->current()` (index 0 setelah `setTracks()`), `loadTrack()` dulu (di dalamnya memanggil `startDecoder()`), baru resume. Kalau `decoderWorker_` sudah ada (kasus pause→play biasa), perilaku lama tidak berubah.

- [ ] Tempel ke `PlaybackController::play()` (ganti method yang ada)
- [ ] Commit → push → build via CI
- [ ] Test: play track pertama kali dari UI kosong (belum pernah play sebelumnya) — kasus ini yang paling mungkin gagal kalau ada masalah lanjutan
- [ ] Catatan: `loadTrack()` → `startDecoder()` membuat `DecoderWorker` async di thread terpisah — ada kemungkinan jeda singkat antara `play()` dan PCM pertama masuk `pcmQueue_`. Kalau ada jeda wajar, bukan bug baru. Kalau tetap tidak bersuara, cek log `decoderWorker_->start(track.uri, 0.0)` — apakah FFmpeg berhasil membuka file.

### A2. Konfirmasi tidak ada jalur playback ganda — ✅ SELESAI (3 September 2026)

**Hasil verifikasi:**

- `NativePlaybackModule.cpp` (JNI lama, dipakai UI player) memakai `pristine::EngineManager::get().playback()` — singleton yang sama persis yang di-wiring ke `AudioCallback` di Fase A1. Ada auto-start engine (`EngineManager::get().start()`) di `getController()` kalau engine belum jalan saat `play()` dipanggil.
- `PlaybackManager.cpp/.h` **dikonfirmasi dead code** — `grep -rl` di seluruh `cpp/` dan `java/` nol hasil pemanggilan di luar file definisinya sendiri (cuma muncul di `compile_commands.json`, itu artefak build). Class ini punya `PlaybackController` sendiri (`unique_ptr`) — kalau sampai dipakai, akan jadi instance kedua yang terpisah dari singleton `EngineManager::mPlayback` dan tidak akan pernah bersuara. Untungnya tidak dipakai.
- `NativePlaybackModule.kt` method `*FromService()` (`playFromService()`, dst) dikonfirmasi cuma wrapper tipis ke `external fun` dasar yang sama (`playFromService() = nativePlay()`) — bukan jalur terpisah, cuma entry point ganda (JS via `@ReactMethod`, Kotlin service via `PlaybackNativeBridge`) yang berujung ke fungsi JNI yang sama.
- `initPlaybackModule()` (fungsi lama yang dulu dicurigai "tidak pernah dipanggil") ternyata tidak masalah — `getController()` di `NativePlaybackModule.cpp` punya fallback lazy-init sendiri, jadi fungsi itu vestigial tapi tidak berbahaya.

**Kesimpulan: satu singleton `PlaybackController`, satu jalur JNI, tidak ada tabrakan. Patch Fase A1 aman ditempel.**

`PlaybackManager.cpp/.h` dicatat di backlog pembersihan (Fase C3 / catatan silang referensi di bawah).

### A3. Test manual setelah build sukses — ⏳ MENUNGGU fix A1.3

- [ ] Play satu lagu → pastikan suara benar-benar keluar dari speaker/headphone
- [ ] Buka app tanpa play apapun (idle state) → pastikan **tetap senyap**, tidak ada noise/glitch dari `PlaybackController::render()` yang dipanggil sebelum ada track ter-load
- [ ] Cek `getUnderruns()` — ingat bahwa `render()` return `void`, jadi underrun counter kemungkinan tidak akurat untuk jalur ini (bukan bug baru, cuma keterbatasan yang perlu diketahui)

---

## 🔵 Insight — Arsitektur Processing Mode (BitPerfect / DSP / Immersive)

Ditemukan saat menelusuri pertanyaan "apakah mode bit-perfect kemarin benar-benar aktif". Ini bukan bug dari patch A1 — ini gap desain lama yang independen, dicatat sebagai temuan arsitektur untuk keputusan berikutnya, **belum ada perubahan kode**.

### Status per layer

| Layer | Status |
|---|---|
| **Native enum** (`AudioTypes.h`) | ✅ Lengkap: `ProcessingMode { BitPerfect=0, DSP=1, Immersive=2 }`, tiga nilai setara |
| **Native pipeline** (`cpp/modes/`) | ✅ Lengkap: `BitPerfectPipeline`, `DSPPipeline`, `ImmersivePipeline` — standalone class (sengaja tanpa inheritance untuk hindari vtable overhead di realtime thread) |
| **Native chain JNI→Kotlin→TS** untuk `setProcessingMode` | ⚠️ **Orphan** — chain C++ lengkap (`JNI → EngineManager::setProcessingMode → AudioEngine → AudioState`), tapi nol `external fun` di Kotlin, nol method di `NativeDSPModule.ts` spec |
| **JS type system** (`onboarding.tsx`) | ❌ `type AudioMode = "bit-perfect" \| "dsp"` — immersive **tidak ada** sebagai nilai yang valid secara type |
| **JS UI** (onboarding) | ❌ Cuma 2 `<ModeCard>` dirender (Bit-Perfect, DSP). Tidak ada pilihan ketiga untuk Immersive |
| **JS pemanggilan native** (`DSPPipeline.ts` — file JS terpisah dari Kotlin `NativeDSPModule`) | ⚠️ `setProcessingMode(mode: "bit-perfect" \| "dsp")` **tidak pernah memanggil** `NativeDSPModule.setProcessingMode()` (yang orphan). Isinya cuma: toggle `USBDACService.setExclusiveMode()` + `NativeDSPModule.releaseAllFX()` (melepas Android AudioEffect session) |
| **Immersive parameter granular** (`setImmersiveEnabled`, `setSolfeggioFreq`, `setBrainwaveFreq`) | ❌ Ada di spec TS dan Kotlin, tapi **nol pemanggilan** di seluruh `src/` — dikonfirmasi lewat grep menyeluruh |

### Kesimpulan

1. **Immersive bukan sub-fitur DSP** — secara desain dia mode ke-3 yang setara (enum, pipeline terpisah). Tapi secara implementasi JS saat ini, dia **dead selection**: tidak bisa dipilih, dan seandainya bisa, parameternya tidak pernah terkirim ke native.
2. **`mState.processingMode()` di C++ kemungkinan besar tidak pernah berubah dari nilai default sejak boot** — karena tidak ada satu pun jalur JS yang memanggil `setProcessingMode`. Pipeline yang benar-benar aktif saat ini adalah pipeline default (kemungkinan `BitPerfect`, nilai enum 0), terlepas dari mode apa yang dipilih user saat onboarding.
3. **"Bit-Perfect" pilihan user saat onboarding TIDAK menyentuh `ProcessingMode` sama sekali** — dia cuma melepas Android AudioEffect + (kalau ada USB DAC) minta exclusive USB. Fix realtime playback di A1.3 berjalan **independen dari mode manapun** — aman dilanjutkan tanpa menunggu isu ini selesai.

### Temuan tambahan: status *exclusive* audio stream tidak pernah sampai ke UI

`AudioStreamController::open()` **sudah jujur** mengecek hasil aktual dari Oboe:
```cpp
mSharingMode = mStream->getSharingMode();
mExclusive.store(mSharingMode == oboe::SharingMode::Exclusive, ...);
```
Ini bukan asumsi buta — kalau device menolak exclusive mode untuk jalur headphone/speaker internal (umum terjadi, tergantung HAL vendor), `isExclusive()` akan mengembalikan `false` yang akurat. **Tapi method ini tidak pernah diekspos lewat JNI ke JS.** User tidak pernah tahu apakah bit-perfect yang mereka pilih benar-benar exclusive, atau diam-diam fallback ke shared mode (yang berarti ada resample + gain scaling oleh AudioFlinger mixer — bukan bit-perfect murni).

Beda dengan `USBDACModule.isExclusiveModeActive()` yang sudah ada di JS — itu status akses hardware USB DAC di level Android, terpisah dari `AudioStreamController::isExclusive()` yang status stream Oboe internal.

### Keputusan yang perlu diambil (belum dieksekusi — insight only)

- [ ] **Immersive**: kerjakan sekarang (bikin `external fun` + TS spec + UI card ke-3 di onboarding) atau backlog resmi?
- [ ] **`setProcessingMode` orphan**: sambungkan sekarang (chain C++ sudah siap, tinggal jembatan Kotlin+TS+panggilan JS) atau tunda?
- [ ] **Transparansi bit-perfect**: ekspos `AudioStreamController::isExclusive()` ke JS sebagai indikator real-time ("Bit-Perfect Aktif" vs "Fallback ke Shared Mode"), bukan cuma janji di teks onboarding
- [ ] **Copy onboarding & settings** (draf di bawah, siap tempel kalau sudah diputuskan):

  > **Bit-Perfect Mode** — Output tanpa pemrosesan tambahan. Kemurnian bit terjamin penuh dengan USB DAC — lewat speaker/headphone jack bawaan, mode ini tetap mencoba jalur eksklusif namun kemurnian bit tidak selalu terjamin karena bergantung dukungan hardware masing-masing perangkat.

  Disclaimer tambahan: *"Bit-Perfect bekerja maksimal dengan USB DAC. Tanpa DAC, sistem akan tetap mencoba jalur eksklusif lewat headphone/speaker bawaan, tapi hasilnya bergantung pada dukungan hardware perangkat kamu."*

---

## 🟡 Fase B — Inventarisasi JNI Final (update dari struktur folder terbaru)

Tree `cpp/` yang baru diupload menunjukkan banyak folder yang belum pernah masuk radar inventarisasi lama: `decoder/`, `devices/`, `dsp/convolution/`, `dsp/headphone/`, `fft/`, `session/`, `usb/`. Sebelum ke JS, petakan dulu semua ini secara faktual.

### B1. Re-grep JNIEXPORT dengan cakupan penuh

```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp > ~/jni_audit/jni_exports_v2.txt
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/ > ~/jni_audit/kotlin_external_v2.txt
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done > ~/jni_audit/ts_specs_v2.txt
```

- [ ] Bandingkan dengan hasil inventarisasi sebelumnya — pastikan tidak ada JNI export baru yang terlewat sejak native module berkembang

### B2. Status folder `fft/` — dipakai atau dead code?

Ada dua sistem visualizer yang berpotensi paralel: `visualizer/VisualizerBuffer` (sudah ke-bridge lewat `getFFTData()` → `NativeVisualizerBridge`) vs `fft/` (`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`, `WaveformVisualizer`) yang belum ada JNI surface sama sekali.

```bash
# Siapa yang instantiate class-class di fft/?
grep -rln "SpectrumVisualizer\|WaveformVisualizer\|SpectrumAnalyzer" android/app/src/main/cpp/ --include="*.cpp" --include="*.h" | grep -v "^android/app/src/main/cpp/fft/"
```

- [ ] Kalau nol hasil di luar folder `fft/` sendiri → kemungkinan besar dead code / belum pernah diintegrasikan ke `AudioCallback` atau `EngineManager`. Catat sebagai backlog, bukan bug.
- [ ] Kalau ada hasil → berarti aktif dipakai, cari tahu di mana titik integrasinya

### B3. Modul besar yang genuinely belum ter-bridge (perlu keputusan prioritas)

| Modul | Lokasi | Status |
|---|---|---|
| Convolution engine (cabinet/room/IR sim) | `dsp/convolution/*` | Nol JNI surface |
| Headphone correction & crossfeed | `dsp/headphone/*` | Nol JNI surface |
| Session management (audio focus, noisy receiver, transport controls source-aware) | `session/*` | Nol JNI surface, tapi kemungkinan sebagian sudah dihandle lewat `MediaSessionManager.kt` di layer Android SDK, bukan custom JNI — perlu dicek |
| USB granular control (clock sync, DAC capabilities detail) | `usb/USBClockSync`, `usb/USBDACCapabilities` | `USBDACModule.ts` ada, tapi kemungkinan besar akses lewat `UsbManager` Android SDK langsung, bukan lewat native ini |
| Convolution/headphone/session — profiling tools | `profiling/*` | Internal/debug, sengaja tidak perlu bridge |

- [ ] Untuk tiap baris di atas, putuskan: prioritas fitur berikutnya, atau backlog resmi (dicatat, tidak dikerjakan sekarang)

### B4. Konfirmasi USB DAC — native atau Android SDK?

```bash
grep -n "USBDeviceManager\|UsbManager\|external fun" \
  android/app/src/main/java/com/pristineaudio/usb/USBDACModule.kt
```

- [ ] Kalau `USBDACModule.kt` murni pakai `android.hardware.usb.UsbManager` tanpa `external fun` sama sekali → `cpp/usb/*` adalah kapabilitas native yang belum pernah dipakai UI, catat di backlog B3

---

## 🟢 Fase C — Sinkronisasi JS/UI (baru mulai setelah Fase A & B clear)

Urutan ini disengaja: percuma menyamakan JS kalau native masih ada ambiguitas jalur playback (`PlaybackController` vs `PlaybackManager`) — bug yang muncul nanti bisa salah didiagnosis sebagai masalah JS padahal akarnya di native.

### C1. Testing manual per fitur

- [ ] **Player** — play/pause/seek/next/previous, queue, shuffle, repeat (bergantung pada Fase A clear)
- [ ] **Equalizer** — band gain, bass boost, presets, virtualizer
- [ ] **Visualizer** — pastikan sumber data jelas (VisualizerBuffer vs fft/, lihat B2)
- [ ] **USB DAC** — device detection, exclusive mode, sample rate switching
- [ ] **Library** — scan, metadata enrichment, media store sync

### C2. Media session & background playback

- [ ] Notifikasi media & kontrol lock screen (via `MediaSessionManager.kt`)
- [ ] Audio focus — pause otomatis saat panggilan masuk / app lain minta fokus
- [ ] Noisy receiver — pause otomatis saat headphone dicabut
- [ ] Verifikasi apakah `session/AudioFocusManager.cpp` dkk native benar-benar dipakai, atau `MediaSessionManager.kt` handle semua ini di layer Kotlin/Android SDK (lihat B3)

### C3. Pembersihan RNTP total (dari roadmap sebelumnya, tetap relevan)

- [ ] `pnpm remove react-native-track-player`
- [ ] Hapus deklarasi tipe di `globals.d.ts`
- [ ] Hapus `scripts/patch-pristine.sh` dan `scripts/custom-rntp/`
- [ ] Hapus langkah patch dari workflow CI
- [ ] Hapus referensi di `app.json`
- [ ] Konfirmasi ulang `RNTP_ENABLED` — pencarian sebelumnya nol hasil di `src/`, `.gradle`, `.json`, `.properties`, `.env*`; kemungkinan ada di lokasi lain yang belum tercakup pola grep

```bash
grep -rn "RNTP_ENABLED" . 2>/dev/null | grep -v node_modules
```

### C4. Bridge baru untuk kapabilitas prioritas (hasil keputusan B3)

- [ ] Tambah `external fun` di Kotlin untuk fungsi native yang diputuskan jadi prioritas
- [ ] Tambah/lengkapi TS spec di `src/specs/`
- [ ] Pakai di `features/` yang relevan
- [ ] Termasuk item lama yang masih orphan: `setProcessingMode` (chain C++ sudah lengkap, tinggal 1 baris `external fun` + `@ReactMethod` wrapper di `NativeDSPModule.kt`)
- [ ] Sambungkan Immersive sebagai mode ke-3 di UI (kalau diputuskan dikerjakan — lihat Insight Processing Mode di atas): update `type AudioMode`, tambah `<ModeCard>` ketiga, sambungkan `setImmersiveEnabled`/`setSolfeggioFreq`/`setBrainwaveFreq`
- [ ] Ekspos `AudioStreamController::isExclusive()` ke JS (JNI baru + spec) sebagai indikator real-time status bit-perfect, kalau diputuskan dikerjakan

---

## 📋 Catatan Silang Referensi

| Item | Ditemukan di sesi | Status |
|---|---|---|
| `NativeAudioFeed.cpp` (`feedFloatBuffer`/`feedPCM16Buffer`) | Investigasi JNI awal | Target class-nya `OboeAudioProcessor` (RNTP fork). Kemungkinan besar sudah tidak dipakai sejak `RNTP_ENABLED = false`. Kandidat dihapus bareng C3, bukan ditambal. |
| `NativeDeviceModule.nativeGetDevices()` stub kosong | Sesi lama (31 Agustus) | Belum diverifikasi ulang — cek lagi di Fase C1 saat testing USB DAC / device list |
| `initPlaybackModule()` di `OnLoad.cpp` | Sesi lama | Ternyata pola wiring pindah ke `EngineManager::start()`, bukan `OnLoad.cpp` — sudah ditangani di Fase A1 |
| `PlaybackManager.cpp/.h` | Tree terbaru (sesi ini) | ✅ Dikonfirmasi dead code (A2) — punya `PlaybackController` sendiri, terpisah dari singleton `EngineManager`. Kandidat dihapus di Fase C3. |
| `playback/PlaybackMetrics.cpp` tidak pernah eksis | Sesi ini (A1.1) | ✅ Fixed — file baru ditulis, linker sukses |
| `PlaybackController::play()` tidak memuat track | Sesi ini (A1.2) | ✅ Fix ditulis (A1.3), ⏳ belum di-build/test |
| `setProcessingMode` orphan chain | Sesi lama, dikonfirmasi ulang lebih dalam sesi ini | Chain C++ lengkap, nol jembatan Kotlin/TS. Kini terbukti ini juga penyebab mode Immersive dead-selection. Lihat Insight Processing Mode. |
| `AudioStreamController::isExclusive()` tidak sampai ke JS | Sesi ini (Insight Processing Mode) | Status akurat di native, nol eksposur JNI/JS. Kandidat fitur transparansi bit-perfect. |

---

## Urutan Eksekusi Ringkas

```
A1 (tempel patch) → A1.1 ✅ fix linker → A1.2 (bug baru ditemukan)
        → A1.3 (fix play() ditulis) → A3 (test suara) ← KITA DI SINI
        ↓ (setelah A clear)
B1 (re-inventarisasi JNI) → B2 (status fft/) → B3 (putuskan prioritas) → B4 (USB DAC)
        ↓ (setelah B clear)
C1 (testing per fitur) → C2 (media session) → C3 (bersihkan RNTP) → C4 (bridge baru,
        termasuk keputusan Immersive & transparansi bit-perfect)
```

Jangan loncat ke Fase C sebelum A3 tuntas (suara benar-benar keluar dan stabil) — kalau masih ada bug di jalur realtime playback, testing UI di Fase C bisa menghasilkan diagnosis yang salah arah.

Insight Processing Mode (BitPerfect/DSP/Immersive) berjalan **paralel**, tidak menghalangi A1.3 — keduanya independen, tapi keputusan soal Immersive & transparansi bit-perfect baiknya diambil sebelum masuk C4 supaya tidak bikin scope creep di tengah bridging kapabilitas lain.

---

Update 3

---

# Plan — Konsolidasi & Debugging Native ⟷ JS/UI

**Status per 3 September 2026 (update 3)**
Dokumen ini menggabungkan hasil inventarisasi JNI, patch audio engine (`PlaybackController → AudioEngine`), fix rantai bug realtime playback, dan insight arsitektur Processing Mode (BitPerfect/DSP/Immersive) yang ditemukan saat investigasi bit-perfect. Tujuannya: urutan kerja yang jelas dari "pastikan native benar" sampai "sinkronkan ke JS/UI", supaya tidak loncat-loncat.

---

## 🎯 TL;DR

1. Patch wiring `PlaybackController → AudioEngine` sudah ditempel dan **build sukses** setelah dua putaran perbaikan (lihat A1).
2. Audio **masih belum bersuara** setelah build sukses — root cause ditemukan: `PlaybackController::play()` tidak pernah memuat track ke decoder. Fix sudah ditulis (A1.3), **belum di-build/test ulang**.
3. Temuan arsitektur baru: mode **Immersive** dibangun penuh di native (enum, pipeline, parameter granular) tapi **tidak pernah diekspos ke UI** — onboarding cuma punya 2 pilihan (bit-perfect/dsp), bukan 3. Lihat bagian baru "Insight — Arsitektur Processing Mode".
4. Ditemukan juga: status *exclusive mode* audio stream (`AudioStreamController::isExclusive()`) sudah dihitung akurat di native tapi **tidak pernah sampai ke JS** — user tidak pernah tahu apakah bit-perfect yang mereka pilih benar-benar exclusive atau diam-diam fallback ke shared mode.
5. Copy onboarding/settings untuk transparansi bit-perfect vs DAC sudah didraft (tahap rancangan, **belum ditempel ke kode** — insight only, sesuai permintaan).

---

## 🔴 Fase A — Selesaikan & Verifikasi Native (WAJIB paling dulu)

### A1. Terapkan patch audio engine — ✅ DITEMPEL, ✅ BUILD SUKSES (setelah 2 putaran fix)

File yang ditempel (lihat riwayat sesi untuk isi lengkap):

- [x] `core/AudioCallback.h` — tambah `mPlaybackController`, `mSampleRate` (pakai `kDefaultSampleRate` dari `AudioConstants.h`), `mScratchInterleaved`
- [x] `core/AudioCallback.cpp` — `onAudioReady()` cabang ke `PlaybackController::render()` kalau tersedia & initialized, fallback ke `AudioBufferController::popStereo()` kalau tidak
- [x] `core/AudioEngine.h` — tambah `setPlaybackController(...)`, forward-declare `playback::PlaybackController`
- [x] `core/AudioEngine.cpp` — implementasi `setPlaybackController()`, panggil `mCallback.setSampleRate(...)` di `start()`
- [x] `manager/EngineManager.cpp` — `start()` memanggil `mPlayback.initialize()` (kalau belum) lalu `mEngine.setPlaybackController(&mPlayback)` sebelum `mEngine.start(...)`

### A1.1 Linker error putaran pertama — ✅ FIXED

Build pertama gagal di linking (bukan compile) — `--gc-sections` sebelumnya membuang `MetricsCollector` karena `PlaybackController::render()` tidak pernah benar-benar dipanggil siapa pun sebelum patch A1. Begitu `render()` tersambung, linker butuh implementasi `MetricsCollector` yang **tidak pernah ditulis** (`PlaybackMetrics.h` ada, `.cpp`-nya tidak pernah eksis — dikonfirmasi lewat `find` dan cek `CMakeLists.txt` GLOB_RECURSE, bukan masalah registrasi build).

- [x] File baru `playback/PlaybackMetrics.cpp` ditulis lengkap (constructor, semua counter/gauge pakai `memory_order_relaxed`, EMA latency, `snapshot()`) dan ditempel
- [x] Tidak perlu ubah `CMakeLists.txt` — `GLOB_RECURSE "playback/*.cpp"` otomatis pick up file baru
- [x] Build kedua: **sukses**, `libpristine-audio.so` ter-link tanpa error

### A1.2 Bug baru ditemukan setelah build sukses: audio tetap tidak keluar

App boot lancar, log `💎 [AudioEngine] Custom Oboe Engine Ready` muncul, scan library sukses, `playSong()` terpanggil — tapi tidak ada suara. Ditelusuri lewat rantai pemanggilan aktual (`engine.ts` → `NativePlaybackService` → `PlaybackNativeBridge` → `NativePlaybackModule.kt` → JNI → `EngineManager::get().playback()`), ditemukan:

- `nativeSetQueue()` cuma mengisi `TrackQueue` (`setTracks()`, yang mereset `mCurrentIndex = 0` — dikonfirmasi lewat `TrackQueue.cpp`), **tidak pernah memanggil `loadTrack()`**
- `PlaybackController::play()` (versi lama) cuma `playing_.store(true)` + `decoderWorker_->resume()` — tapi `decoderWorker_` **hanya dibuat di `startDecoder()`**, yang cuma dipanggil dari `loadTrack()`, yang cuma dipanggil dari `next()`/`previous()`
- JS (`playerStore.ts`) cuma memanggil `setQueue()` lalu `play()` — tidak pernah `next()`/`skipTo()` untuk memicu load track pertama
- Kesimpulan: kontrak "isi queue → play → otomatis mulai dari track pertama" **tidak pernah diimplementasikan** di native. `pcmQueue_` selalu kosong, `render()` selalu mengeluarkan silence.

### A1.3 Fix `PlaybackController::play()` — ✅ DITULIS, ⏳ BELUM DI-BUILD/TEST

```cpp
bool PlaybackController::play() {
    if (!initialized_.load(std::memory_order_acquire))
        return false;

    if (!decoderWorker_) {
        if (!queue_) return false;

        auto track = queue_->current();
        if (!track) return false;

        if (!loadTrack(*track)) {
            return false;
        }
    }

    playing_.store(true, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->resume();
    }

    return true;
}
```

Logika: kalau `decoderWorker_` belum ada (belum pernah ada track dimuat), ambil track aktif dari `queue_->current()` (index 0 setelah `setTracks()`), `loadTrack()` dulu (di dalamnya memanggil `startDecoder()`), baru resume. Kalau `decoderWorker_` sudah ada (kasus pause→play biasa), perilaku lama tidak berubah.

- [ ] Tempel ke `PlaybackController::play()` (ganti method yang ada)
- [ ] Commit → push → build via CI
- [ ] Test: play track pertama kali dari UI kosong (belum pernah play sebelumnya) — kasus ini yang paling mungkin gagal kalau ada masalah lanjutan
- [ ] Catatan: `loadTrack()` → `startDecoder()` membuat `DecoderWorker` async di thread terpisah — ada kemungkinan jeda singkat antara `play()` dan PCM pertama masuk `pcmQueue_`. Kalau ada jeda wajar, bukan bug baru. Kalau tetap tidak bersuara, cek log `decoderWorker_->start(track.uri, 0.0)` — apakah FFmpeg berhasil membuka file.

### A2. Konfirmasi tidak ada jalur playback ganda — ✅ SELESAI (3 September 2026)

**Hasil verifikasi:**

- `NativePlaybackModule.cpp` (JNI lama, dipakai UI player) memakai `pristine::EngineManager::get().playback()` — singleton yang sama persis yang di-wiring ke `AudioCallback` di Fase A1. Ada auto-start engine (`EngineManager::get().start()`) di `getController()` kalau engine belum jalan saat `play()` dipanggil.
- `PlaybackManager.cpp/.h` **dikonfirmasi dead code** — `grep -rl` di seluruh `cpp/` dan `java/` nol hasil pemanggilan di luar file definisinya sendiri (cuma muncul di `compile_commands.json`, itu artefak build). Class ini punya `PlaybackController` sendiri (`unique_ptr`) — kalau sampai dipakai, akan jadi instance kedua yang terpisah dari singleton `EngineManager::mPlayback` dan tidak akan pernah bersuara. Untungnya tidak dipakai.
- `NativePlaybackModule.kt` method `*FromService()` (`playFromService()`, dst) dikonfirmasi cuma wrapper tipis ke `external fun` dasar yang sama (`playFromService() = nativePlay()`) — bukan jalur terpisah, cuma entry point ganda (JS via `@ReactMethod`, Kotlin service via `PlaybackNativeBridge`) yang berujung ke fungsi JNI yang sama.
- `initPlaybackModule()` (fungsi lama yang dulu dicurigai "tidak pernah dipanggil") ternyata tidak masalah — `getController()` di `NativePlaybackModule.cpp` punya fallback lazy-init sendiri, jadi fungsi itu vestigial tapi tidak berbahaya.

**Kesimpulan: satu singleton `PlaybackController`, satu jalur JNI, tidak ada tabrakan. Patch Fase A1 aman ditempel.**

`PlaybackManager.cpp/.h` dicatat di backlog pembersihan (Fase C3 / catatan silang referensi di bawah).

### A3. Test manual setelah build sukses — ⏳ MENUNGGU fix A1.3

- [ ] Play satu lagu → pastikan suara benar-benar keluar dari speaker/headphone
- [ ] Buka app tanpa play apapun (idle state) → pastikan **tetap senyap**, tidak ada noise/glitch dari `PlaybackController::render()` yang dipanggil sebelum ada track ter-load
- [ ] Cek `getUnderruns()` — ingat bahwa `render()` return `void`, jadi underrun counter kemungkinan tidak akurat untuk jalur ini (bukan bug baru, cuma keterbatasan yang perlu diketahui)

---

## 🔵 Insight — Arsitektur Processing Mode (BitPerfect / DSP / Immersive)

Ditemukan saat menelusuri pertanyaan "apakah mode bit-perfect kemarin benar-benar aktif". Ini bukan bug dari patch A1 — ini gap desain lama yang independen, dicatat sebagai temuan arsitektur untuk keputusan berikutnya, **belum ada perubahan kode**.

### Status per layer

| Layer | Status |
|---|---|
| **Native enum** (`AudioTypes.h`) | ✅ Lengkap: `ProcessingMode { BitPerfect=0, DSP=1, Immersive=2 }`, tiga nilai setara |
| **Native pipeline** (`cpp/modes/`) | ✅ Lengkap: `BitPerfectPipeline`, `DSPPipeline`, `ImmersivePipeline` — standalone class (sengaja tanpa inheritance untuk hindari vtable overhead di realtime thread) |
| **Native chain JNI→Kotlin→TS** untuk `setProcessingMode` | ⚠️ **Orphan** — chain C++ lengkap (`JNI → EngineManager::setProcessingMode → AudioEngine → AudioState`), tapi nol `external fun` di Kotlin, nol method di `NativeDSPModule.ts` spec |
| **JS type system** (`onboarding.tsx`) | ❌ `type AudioMode = "bit-perfect" \| "dsp"` — immersive **tidak ada** sebagai nilai yang valid secara type |
| **JS UI** (onboarding) | ❌ Cuma 2 `<ModeCard>` dirender (Bit-Perfect, DSP). Tidak ada pilihan ketiga untuk Immersive |
| **JS pemanggilan native** (`DSPPipeline.ts` — file JS terpisah dari Kotlin `NativeDSPModule`) | ⚠️ `setProcessingMode(mode: "bit-perfect" \| "dsp")` **tidak pernah memanggil** `NativeDSPModule.setProcessingMode()` (yang orphan). Isinya cuma: toggle `USBDACService.setExclusiveMode()` + `NativeDSPModule.releaseAllFX()` (melepas Android AudioEffect session) |
| **Immersive parameter granular** (`setImmersiveEnabled`, `setSolfeggioFreq`, `setBrainwaveFreq`) | ❌ Ada di spec TS dan Kotlin, tapi **nol pemanggilan** di seluruh `src/` — dikonfirmasi lewat grep menyeluruh |

### Kesimpulan

1. **Immersive bukan sub-fitur DSP** — secara desain dia mode ke-3 yang setara (enum, pipeline terpisah). Tapi secara implementasi JS saat ini, dia **dead selection**: tidak bisa dipilih, dan seandainya bisa, parameternya tidak pernah terkirim ke native.
2. **`mState.processingMode()` di C++ kemungkinan besar tidak pernah berubah dari nilai default sejak boot** — karena tidak ada satu pun jalur JS yang memanggil `setProcessingMode`. Pipeline yang benar-benar aktif saat ini adalah pipeline default (kemungkinan `BitPerfect`, nilai enum 0), terlepas dari mode apa yang dipilih user saat onboarding.
3. **"Bit-Perfect" pilihan user saat onboarding TIDAK menyentuh `ProcessingMode` sama sekali** — dia cuma melepas Android AudioEffect + (kalau ada USB DAC) minta exclusive USB. Fix realtime playback di A1.3 berjalan **independen dari mode manapun** — aman dilanjutkan tanpa menunggu isu ini selesai.

### Temuan tambahan: status *exclusive* audio stream tidak pernah sampai ke UI

`AudioStreamController::open()` **sudah jujur** mengecek hasil aktual dari Oboe:
```cpp
mSharingMode = mStream->getSharingMode();
mExclusive.store(mSharingMode == oboe::SharingMode::Exclusive, ...);
```
Ini bukan asumsi buta — kalau device menolak exclusive mode untuk jalur headphone/speaker internal (umum terjadi, tergantung HAL vendor), `isExclusive()` akan mengembalikan `false` yang akurat. **Tapi method ini tidak pernah diekspos lewat JNI ke JS.** User tidak pernah tahu apakah bit-perfect yang mereka pilih benar-benar exclusive, atau diam-diam fallback ke shared mode (yang berarti ada resample + gain scaling oleh AudioFlinger mixer — bukan bit-perfect murni).

Beda dengan `USBDACModule.isExclusiveModeActive()` yang sudah ada di JS — itu status akses hardware USB DAC di level Android, terpisah dari `AudioStreamController::isExclusive()` yang status stream Oboe internal.

### Keputusan yang sudah diambil — arsitektur 3 mode setara (3 September 2026)

**Status: desain final, patch ditulis lengkap, belum ditempel ke kode.**

Ditemukan dua concern yang selama ini tercampur di satu switch boolean `isExclusive`, padahal ortogonal:
1. `exclusiveMode` (Oboe `SharingMode`) — soal hardware sharing, JNI **lengkap sampai Kotlin** tapi tidak pernah dipanggil dari JS (`engine.ts` cuma urus FX + USB, tidak pernah panggil `NativeDSPModule.setExclusiveMode()`)
2. `processingMode` (enum `BitPerfect/DSP/Immersive`) — soal pipeline mana yang aktif, orphan total (JNI ada, Kotlin `external fun` tidak ada — sampai sesi ini)

**Desain final 3 mode:**

| Mode | `processingMode` | `exclusiveMode` (Oboe) | `immersiveEnabled` | Android FX |
|---|---|---|---|---|
| **Exclusive** (rename dari "Bit-Perfect") | `BitPerfect` (0) | `true` | `false` | released |
| **DSP** | `DSP` (1) | `false` | `false` | aktif |
| **Immersive** | `Immersive` (2) | `false` | `true` | released |

Immersive sengaja **tidak** exclusive (butuh pipeline pemrosesan, bukan bypass) dan **tidak** menyalakan solfeggio/brainwave freq otomatis (itu kontrol granular terpisah di equalizer/settings).

**Patch yang sudah ditulis (siap tempel, urutan aman dari native → JS):**

1. `NativeDSPModule.kt` — tambah `external fun setNativeProcessingMode(mode: Int)` + `@ReactMethod setProcessingMode(mode: Int)` — menutup orphan chain
2. `src/specs/NativeDSPModule.ts` — tambah `setProcessingMode(mode: number): void`
3. `src/features/player/api/engine.ts` — `type AudioMode = "exclusive" | "dsp" | "immersive"` + method baru `applyProcessingMode(mode)` yang jadi **satu-satunya titik orkestrasi**: memanggil `setProcessingMode` + `setExclusiveMode` + `setImmersiveEnabled` sekaligus, plus `releaseAllFX()` untuk exclusive/immersive
4. `playerStore.ts` — `AudioMode` type di-reexport dari `engine.ts` (single source of truth), `setAudioMode()` diarahkan ke `audioEngine.applyProcessingMode()`
5. `_layout.tsx` — migrasi nilai `AsyncStorage` lama: `"bit-perfect"` → `"exclusive"` saat baca preferensi boot
6. `onboarding.tsx` — `AudioMode` 3 nilai, card ketiga "Immersive Mode" ditambahkan, `handleFinish` diarahkan ke `usePlayerStore.setAudioMode()` (jalur terpusat) menggantikan `DSPPipeline.setProcessingMode()` lama yang parsial
7. `settings.tsx` — switch boolean diganti modal picker 3-opsi dengan edukasi ringkas per mode (pola sama seperti `showEQPicker` yang sudah ada di file), switch DAC "Exclusive Mode" diarahkan buka modal alih-alih toggle langsung

**Belum dieksekusi:**
- [ ] Tempel ketujuh patch di atas
- [ ] Build & test: pastikan `setProcessingMode` dari Kotlin baru tidak crash (native chain sudah dikonfirmasi lengkap: `JNI → EngineManager::setProcessingMode → AudioEngine → AudioState`)
- [ ] Test switching antar 3 mode saat lagu sedang main — pastikan tidak ada glitch/pop di `AudioCallback` saat `mState.processingMode()` berubah di tengah render
- [ ] Verifikasi migrasi `AsyncStorage` bekerja untuk user existing yang sudah pernah pilih `"bit-perfect"`

---

## 🟡 Fase B — Inventarisasi JNI Final (update dari struktur folder terbaru)

Tree `cpp/` yang baru diupload menunjukkan banyak folder yang belum pernah masuk radar inventarisasi lama: `decoder/`, `devices/`, `dsp/convolution/`, `dsp/headphone/`, `fft/`, `session/`, `usb/`. Sebelum ke JS, petakan dulu semua ini secara faktual.

### B1. Re-grep JNIEXPORT dengan cakupan penuh

```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp > ~/jni_audit/jni_exports_v2.txt
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/ > ~/jni_audit/kotlin_external_v2.txt
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done > ~/jni_audit/ts_specs_v2.txt
```

- [ ] Bandingkan dengan hasil inventarisasi sebelumnya — pastikan tidak ada JNI export baru yang terlewat sejak native module berkembang

### B2. Status folder `fft/` — dipakai atau dead code?

Ada dua sistem visualizer yang berpotensi paralel: `visualizer/VisualizerBuffer` (sudah ke-bridge lewat `getFFTData()` → `NativeVisualizerBridge`) vs `fft/` (`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`, `WaveformVisualizer`) yang belum ada JNI surface sama sekali.

```bash
# Siapa yang instantiate class-class di fft/?
grep -rln "SpectrumVisualizer\|WaveformVisualizer\|SpectrumAnalyzer" android/app/src/main/cpp/ --include="*.cpp" --include="*.h" | grep -v "^android/app/src/main/cpp/fft/"
```

- [ ] Kalau nol hasil di luar folder `fft/` sendiri → kemungkinan besar dead code / belum pernah diintegrasikan ke `AudioCallback` atau `EngineManager`. Catat sebagai backlog, bukan bug.
- [ ] Kalau ada hasil → berarti aktif dipakai, cari tahu di mana titik integrasinya

### B3. Modul besar yang genuinely belum ter-bridge (perlu keputusan prioritas)

| Modul | Lokasi | Status |
|---|---|---|
| Convolution engine (cabinet/room/IR sim) | `dsp/convolution/*` | Nol JNI surface |
| Headphone correction & crossfeed | `dsp/headphone/*` | Nol JNI surface |
| Session management (audio focus, noisy receiver, transport controls source-aware) | `session/*` | Nol JNI surface, tapi kemungkinan sebagian sudah dihandle lewat `MediaSessionManager.kt` di layer Android SDK, bukan custom JNI — perlu dicek |
| USB granular control (clock sync, DAC capabilities detail) | `usb/USBClockSync`, `usb/USBDACCapabilities` | `USBDACModule.ts` ada, tapi kemungkinan besar akses lewat `UsbManager` Android SDK langsung, bukan lewat native ini |
| Convolution/headphone/session — profiling tools | `profiling/*` | Internal/debug, sengaja tidak perlu bridge |

- [ ] Untuk tiap baris di atas, putuskan: prioritas fitur berikutnya, atau backlog resmi (dicatat, tidak dikerjakan sekarang)

### B4. Konfirmasi USB DAC — native atau Android SDK?

```bash
grep -n "USBDeviceManager\|UsbManager\|external fun" \
  android/app/src/main/java/com/pristineaudio/usb/USBDACModule.kt
```

- [ ] Kalau `USBDACModule.kt` murni pakai `android.hardware.usb.UsbManager` tanpa `external fun` sama sekali → `cpp/usb/*` adalah kapabilitas native yang belum pernah dipakai UI, catat di backlog B3

---

## 🟢 Fase C — Sinkronisasi JS/UI (baru mulai setelah Fase A & B clear)

Urutan ini disengaja: percuma menyamakan JS kalau native masih ada ambiguitas jalur playback (`PlaybackController` vs `PlaybackManager`) — bug yang muncul nanti bisa salah didiagnosis sebagai masalah JS padahal akarnya di native.

### C1. Testing manual per fitur

- [ ] **Player** — play/pause/seek/next/previous, queue, shuffle, repeat (bergantung pada Fase A clear)
- [ ] **Equalizer** — band gain, bass boost, presets, virtualizer
- [ ] **Visualizer** — pastikan sumber data jelas (VisualizerBuffer vs fft/, lihat B2)
- [ ] **USB DAC** — device detection, exclusive mode, sample rate switching
- [ ] **Library** — scan, metadata enrichment, media store sync

### C2. Media session & background playback

- [ ] Notifikasi media & kontrol lock screen (via `MediaSessionManager.kt`)
- [ ] Audio focus — pause otomatis saat panggilan masuk / app lain minta fokus
- [ ] Noisy receiver — pause otomatis saat headphone dicabut
- [ ] Verifikasi apakah `session/AudioFocusManager.cpp` dkk native benar-benar dipakai, atau `MediaSessionManager.kt` handle semua ini di layer Kotlin/Android SDK (lihat B3)

### C3. Pembersihan RNTP total (dari roadmap sebelumnya, tetap relevan)

- [ ] `pnpm remove react-native-track-player`
- [ ] Hapus deklarasi tipe di `globals.d.ts`
- [ ] Hapus `scripts/patch-pristine.sh` dan `scripts/custom-rntp/`
- [ ] Hapus langkah patch dari workflow CI
- [ ] Hapus referensi di `app.json`
- [ ] Konfirmasi ulang `RNTP_ENABLED` — pencarian sebelumnya nol hasil di `src/`, `.gradle`, `.json`, `.properties`, `.env*`; kemungkinan ada di lokasi lain yang belum tercakup pola grep

```bash
grep -rn "RNTP_ENABLED" . 2>/dev/null | grep -v node_modules
```

### C4. Bridge baru untuk kapabilitas prioritas (hasil keputusan B3)

- [ ] Tambah `external fun` di Kotlin untuk fungsi native yang diputuskan jadi prioritas
- [ ] Tambah/lengkapi TS spec di `src/specs/`
- [ ] Pakai di `features/` yang relevan
- [ ] Termasuk item lama yang masih orphan: `setProcessingMode` (chain C++ sudah lengkap, tinggal 1 baris `external fun` + `@ReactMethod` wrapper di `NativeDSPModule.kt`)
- [ ] Sambungkan Immersive sebagai mode ke-3 di UI (kalau diputuskan dikerjakan — lihat Insight Processing Mode di atas): update `type AudioMode`, tambah `<ModeCard>` ketiga, sambungkan `setImmersiveEnabled`/`setSolfeggioFreq`/`setBrainwaveFreq`
- [ ] Ekspos `AudioStreamController::isExclusive()` ke JS (JNI baru + spec) sebagai indikator real-time status exclusive — belum termasuk di patch 3-mode saat ini, masih backlog terpisah

---

## 📋 Catatan Silang Referensi

| Item | Ditemukan di sesi | Status |
|---|---|---|
| `NativeAudioFeed.cpp` (`feedFloatBuffer`/`feedPCM16Buffer`) | Investigasi JNI awal | Target class-nya `OboeAudioProcessor` (RNTP fork). Kemungkinan besar sudah tidak dipakai sejak `RNTP_ENABLED = false`. Kandidat dihapus bareng C3, bukan ditambal. |
| `NativeDeviceModule.nativeGetDevices()` stub kosong | Sesi lama (31 Agustus) | Belum diverifikasi ulang — cek lagi di Fase C1 saat testing USB DAC / device list |
| `initPlaybackModule()` di `OnLoad.cpp` | Sesi lama | Ternyata pola wiring pindah ke `EngineManager::start()`, bukan `OnLoad.cpp` — sudah ditangani di Fase A1 |
| `PlaybackManager.cpp/.h` | Tree terbaru (sesi ini) | ✅ Dikonfirmasi dead code (A2) — punya `PlaybackController` sendiri, terpisah dari singleton `EngineManager`. Kandidat dihapus di Fase C3. |
| `playback/PlaybackMetrics.cpp` tidak pernah eksis | Sesi ini (A1.1) | ✅ Fixed — file baru ditulis, linker sukses |
| `PlaybackController::play()` tidak memuat track | Sesi ini (A1.2) | ✅ Fix ditulis (A1.3), ⏳ belum di-build/test |
| `setProcessingMode` orphan chain | Sesi lama, dikonfirmasi ulang lebih dalam sesi ini | Chain C++ lengkap, nol jembatan Kotlin/TS. Kini terbukti ini juga penyebab mode Immersive dead-selection. Lihat Insight Processing Mode. |
| `AudioStreamController::isExclusive()` tidak sampai ke JS | Sesi ini (Insight Processing Mode) | Status akurat di native, nol eksposur JNI/JS. Kandidat fitur transparansi bit-perfect. |

---

## Urutan Eksekusi Ringkas

```
A1 (tempel patch) → A1.1 ✅ fix linker → A1.2 (bug baru ditemukan)
        → A1.3 (fix play() ditulis) → A3 (test suara) ← KITA DI SINI
        ↓ (setelah A clear)
B1 (re-inventarisasi JNI) → B2 (status fft/) → B3 (putuskan prioritas) → B4 (USB DAC)
        ↓ (setelah B clear)
C1 (testing per fitur) → C2 (media session) → C3 (bersihkan RNTP) → C4 (bridge baru,
        termasuk keputusan Immersive & transparansi bit-perfect)
```

Jangan loncat ke Fase C sebelum A3 tuntas (suara benar-benar keluar dan stabil) — kalau masih ada bug di jalur realtime playback, testing UI di Fase C bisa menghasilkan diagnosis yang salah arah.

Insight Processing Mode (BitPerfect/DSP/Immersive) berjalan **paralel**, tidak menghalangi A1.3 — keduanya independen, tapi keputusan soal Immersive & transparansi bit-perfect baiknya diambil sebelum masuk C4 supaya tidak bikin scope creep di tengah bridging kapabilitas lain.
