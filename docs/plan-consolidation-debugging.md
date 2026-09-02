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
