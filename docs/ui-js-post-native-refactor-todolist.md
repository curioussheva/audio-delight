~/pristine/src $ tree                                   .                                                       ├── app                                                 │   ├── (drawer)                                        │   │   ├── (tabs)                                      │   │   │   ├── _layout.tsx                             │   │   │   ├── analyzer.tsx                            │   │   │   ├── equalizer.tsx                           │   │   │   ├── library.tsx                             │   │   │   └── visualizer.tsx                          │   │   ├── _layout.tsx                                 │   │   ├── about.tsx                                   │   │   ├── playlist.tsx                                │   │   ├── settings.tsx                                │   │   └── song                                        │   │       └── [id].tsx                                │   ├── _layout.tsx                                     │   ├── index.tsx                                       │   ├── onboarding.tsx                                  │   ├── player                                          │   │   └── index.tsx                                   │   └── search.tsx                                      ├── features                                            │   ├── audio                                           │   │   └── api                                         │   │       └── BitDepthVerifier.ts                     │   ├── equalizer                                       │   │   ├── api                                         │   │   │   ├── index.ts                                │   │   │   ├── nativeInterface.ts                      │   │   │   ├── presets.ts                              │   │   │   └── service.ts                              │   │   ├── components                                  │   │   │   ├── Band.tsx                                │   │   │   ├── ControlKnob.tsx                         │   │   │   ├── Graph.tsx                               │   │   │   ├── HorizontalSlider.tsx                    │   │   │   ├── PresetChip.tsx                          │   │   │   ├── ReverbDropdown.tsx                      │   │   │   ├── SavePresetModal.tsx                     │   │   │   └── index.ts                                │   │   ├── constants                                   │   │   │   ├── index.ts                                │   │   │   └── presets.ts                              │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   └── useEqualizer.ts                         │   │   ├── index.ts                                    │   │   ├── store                                       │   │   │   ├── equalizerStore.ts                       │   │   │   └── index.ts                                │   │   └── types.ts                                    │   ├── favorites                                       │   │   ├── api                                         │   │   │   ├── index.ts                                │   │   │   └── service.ts                              │   │   ├── components                                  │   │   │   └── index.ts                                │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   └── useFavorites.ts                         │   │   └── index.ts                                    │   ├── hardware                                        │   │   ├── api                                         │   │   │   ├── USBDACModule.ts                         │   │   │   └── index.ts                                │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   └── useUSBDAC.ts                            │   │   ├── index.ts                                    │   │   └── native                                      │   │       └── index.ts                                │   ├── library                                         │   │   ├── api                                         │   │   │   ├── index.ts                                │   │   │   ├── m3u.ts                                  │   │   │   ├── metadata.ts                             │   │   │   └── scanner.ts                              │   │   ├── components                                  │   │   │   ├── AlbumGrid.tsx                           │   │   │   ├── ArtistList.tsx                          │   │   │   ├── DevDBManager.tsx                        │   │   │   ├── EmptyLibrary.tsx                        │   │   │   ├── EnrichMetadataButton.tsx                │   │   │   ├── EnrichMetadataModal.tsx                 │   │   │   ├── FileFilterBar.tsx                       │   │   │   ├── FileTypeList.tsx                        │   │   │   ├── FilterModal.tsx                         │   │   │   ├── FolderList.tsx                          │   │   │   ├── GenreList.tsx                           │   │   │   ├── LibraryTabBar.tsx                       │   │   │   ├── MetadataSyncModal.tsx                   │   │   │   ├── PlaylistList.tsx                        │   │   │   ├── ScanStatusBar.tsx                       │   │   │   ├── SongListItem.tsx                        │   │   │   └── index.ts                                │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   ├── useLibrary.ts                           │   │   │   ├── useMediaScanner.ts                      │   │   │   ├── useOptimizedLibrary.ts                  │   │   │   └── useScanManager.ts                       │   │   ├── index.ts                                    │   │   ├── native                                      │   │   │   └── MediaStoreModule.ts                     │   │   ├── services                                    │   │   │   ├── BackgroundScanTask.ts                   │   │   │   ├── MetadataEnricher.ts                     │   │   │   ├── OnlineMetadataService.ts                │   │   │   ├── ScanDiffEngine.ts                       │   │   │   ├── ScanQueue.ts                            │   │   │   ├── ScannerService.ts                       │   │   │   └── UnifiedScanService.ts                   │   │   ├── store                                       │   │   │   ├── index.ts                                │   │   │   ├── libraryStore.ts                         │   │   │   └── selectors.ts                            │   │   ├── types                                       │   │   │   └── scan.ts                                 │   │   └── utils                                       │   │       ├── index.ts                                │   │       └── metadataAdapter.ts                      │   ├── player                                          │   │   ├── api                                         │   │   │   ├── engine.ts                               │   │   │   ├── index.ts                                │   │   │   └── playback.ts                             │   │   ├── components                                  │   │   │   ├── AlbumArt.tsx                            │   │   │   ├── AudioPropertyToast.tsx                  │   │   │   ├── Controls.tsx                            │   │   │   ├── FloatingPlayer.tsx                      │   │   │   ├── FullLyricsView.tsx                      │   │   │   ├── LyricPreview.tsx                        │   │   │   ├── OutputSettings.tsx                      │   │   │   ├── PlaybackSpeed.tsx                       │   │   │   ├── QueueManager.tsx                        │   │   │   ├── SleepTimerModal.tsx                     │   │   │   ├── SongMetadata.tsx                        │   │   │   └── index.ts                                │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   ├── useAudioPlayer.ts                       │   │   │   ├── useAudioProgress.ts                     │   │   │   └── useTrackPlayerHandler.ts                │   │   ├── index.ts                                    │   │   ├── store                                       │   │   │   ├── index.ts                                │   │   │   └── playerStore.ts                          │   │   └── utils                                       │   │       └── index.ts                                │   ├── playlist                                        │   │   ├── api                                         │   │   │   ├── index.ts                                │   │   │   └── service.ts                              │   │   ├── components                                  │   │   │   └── index.ts                                │   │   ├── hooks                                       │   │   │   ├── index.ts                                │   │   │   └── usePlaylists.ts                         │   │   ├── index.ts                                    │   │   └── types.ts                                    │   ├── settings                                        │   │   └── store                                       │   │       └── settingsStore.ts                        │   └── visualizer                                      │       ├── api                                         │       │   ├── DSPPipeline.ts                          │       │   ├── analyzer.ts                             │       │   ├── fft.ts                                  │       │   ├── index.ts                                │       │   └── visualizer.ts                           │       ├── components                                  │       │   ├── SpectogramView.tsx                      │       │   ├── SpectrumAnalyzer.tsx                    │       │   └── index.ts                                │       ├── hooks                                       │       │   ├── index.ts                                │       │   └── useAudioAnalyzer.ts                     │       ├── index.ts                                    │       ├── native                                      │       │   ├── NativeDSPModule.ts                      │       │   ├── VisualizerBridge.ts                     │       │   └── index.ts                                │       └── services                                    │           └── VisualizerService.ts                    ├── shared                                              │   ├── components                                      │   │   ├── navigation                                  │   │   │   ├── CustomDrawer.tsx                        │   │   │   └── index.ts                                │   │   └── ui                                          │   │       ├── DynamicBackground.tsx                   │   │       ├── EmptyState.tsx                          │   │       ├── EnhancedProgressBar.tsx                 │   │       ├── LoadingScreen.tsx                       │   │       ├── QualityBadge.tsx                        │   │       ├── ThemePicker.tsx                         │   │       └── index.ts                                │   ├── constants                                       │   │   ├── libraryOptions.ts                           │   │   ├── theme.ts                                    │   │   └── themes                                      │   │       ├── base.ts                                 │   │       ├── cyber.ts                                │   │       ├── dark.ts                                 │   │       ├── index.ts                                │   │       ├── light.ts                                │   │       ├── nature.ts                               │   │       ├── premium.ts                              │   │       └── types.ts                                │   ├── context                                         │   │   └── ThemeContext.tsx                            │   ├── hooks                                           │   │   ├── index.ts                                    │   │   ├── useAudioPermissions.ts                      │   │   ├── useSafePadding.ts                           │   │   ├── useSearch.ts                                │   │   └── useUSBDAC.ts                                │   ├── lib                                             │   │   ├── index.ts                                    │   │   └── sqlite.ts                                   │   ├── styles                                          │   │   └── index.ts                                    │   ├── types                                           │   │   ├── audio-metadata.d.ts                         │   │   ├── audio.ts                                    │   │   ├── dac.ts                                      │   │   ├── dsp.ts                                      │   │   ├── expo-file-system.d.ts                       │   │   ├── globals.d.ts                                │   │   ├── index.ts                                    │   │   └── visualizer.ts                               │   └── utils                                           │       ├── LrcParser.ts                                │       ├── index.ts                                    │       ├── permissions.ts                              │       ├── spacing.ts                                  │       └── time.ts                                     └── specs                                                   ├── MediaStoreModule.ts                                 ├── NativeDSPModule.ts                                  ├── NativePristineAudio.ts                              ├── NativeVisualizerBridge.ts                           └── USBDACModule.ts                                                                                         63 directories, 181 files



# Insight & Todolist — Penyesuaian UI/JS Pasca Perombakan Native

Status per 22 Agustus 2026. Dokumen ini **belum memverifikasi isi file JS/TS/Kotlin** — hanya `tree` struktur yang sudah dilihat. Ini adalah peta risiko + urutan pengecekan, bukan hasil audit. Verifikasi sebenarnya perlu dilakukan per item di bawah (perintah yang disarankan sudah disertakan).

**Koreksi kerangka berpikir (22 Agustus 2026)**: sifat pekerjaan native kemarin bukan cuma "refactor/rename" — ini **pemekaran/splitting** modul. Artinya risiko utamanya bukan "signature mismatch antara JS dan native", tapi **"JS kemungkinan besar tidak tahu modul-modul native ini ada sama sekali"**. Perbandingan skala: `cpp/` punya 242 file dengan puluhan sub-modul (`playback/` sendiri 22 file: `TransportControls`, `PlaybackScheduler`, `PlaybackEventDispatcher`, `PrebufferManager`, `FadeEngine`, `AudioFocusManager`, `NoisyReceiverHandler`, dst; `dsp/immersive/` 5 modul brainwave/binaural/solfeggio), sementara `specs/` di sisi JS **cuma 5 file TS** (`NativeDSPModule`, `NativePristineAudio`, `NativeVisualizerBridge`, `USBDACModule`, `MediaStoreModule`). Kesenjangan skala ini adalah sinyal kuat bahwa banyak kapabilitas native belum pernah punya jalur bridge ke JS — bukan salah, memang belum dikerjakan sampai ke situ.

---

## 🎯 TL;DR — Prioritas (direvisi)

1. **Inventarisasi dulu, jangan asumsi.** Buat daftar lengkap semua fungsi `JNIEXPORT` yang benar-benar ter-expose ke Java/Kotlin (itu satu-satunya jalur yang bisa dicapai JS). Bandingkan dengan isi `specs/*.ts`. Selisihnya adalah kapabilitas yang "ada di native tapi gak kelihatan dari JS" — bukan bug untuk diperbaiki, tapi keputusan: perlu dibuatkan bridge baru, atau memang sengaja belum diekspos.
2. **Cek apakah `initPlaybackModule()` pernah dipanggil** dari sisi Kotlin/JNI init (tetap relevan, lihat bagian bawah).
3. **Cek mapping enum `PlaybackStatus`** di TS vs native (tetap relevan).
4. Setelah peta kapabilitas jelas, baru masuk ke penyesuaian detail per fitur.

---

## 🗺️ Langkah 0 — Inventarisasi Permukaan JNI (WAJIB dilakukan duluan)

Sebelum menebak "fitur apa yang belum nyambung", buat peta faktual dulu. Jalankan ini:

**A. Semua fungsi JNIEXPORT yang benar-benar diekspos ke Java (satu-satunya pintu masuk dari sisi JS/Kotlin):**
```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp
```

**B. Semua native module Kotlin yang mendeklarasikan `external fun` (native method declarations — ini yang benar-benar dipanggil dari Kotlin, harus match satu-satu dengan hasil A):**
```bash
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/
```

**C. Semua TurboModule spec di sisi TS (ini yang benar-benar bisa dipanggil dari JS/React):**
```bash
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done
```

**D. Bandingkan tiga hasil di atas.** Buat tabel: nama fungsi native (JNIEXPORT) → ada di Kotlin? → ada di TS spec? → dipakai di `features/`? Fungsi yang berhenti di kolom pertama/kedua (ada di C++ atau Kotlin, tapi gak nyampe ke TS spec) adalah kapabilitas yang **belum ada jalan sama sekali buat dipanggil dari UI**.

**E. Modul native besar yang kemungkinan tinggi BELUM punya bridge sama sekali** (dugaan awal berdasarkan tree, perlu dikonfirmasi lewat A-D di atas):
- `session/TransportControls`, `AudioFocusManager`, `AudioSessionManager`, `NoisyReceiverHandler` — command-source-aware transport (Bluetooth/headset/Android Auto/notification), audio focus handling, noisy-receiver (headphone unplug) handling. Kemungkinan besar UI cuma bisa play/pause/seek dasar, belum bisa manfaatkan source-awareness atau auto-pause saat headphone dicabut.
- `playback/PlaybackScheduler`, `PrebufferManager`, `FadeEngine` — crossfade/gapless transition, prebuffering. Kemungkinan UI belum ada kontrol/indikator buat ini (mode transisi, dst).
- `dsp/immersive/*` (`BrainwaveGenerator`, `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer`, `SolfeggioResonator`, `FFTResonanceAnalyzer`) — 6 modul DSP immersive audio. `modes/ImmersivePipeline` yang mengorkestrasi ini kemungkinan besar belum ada satupun endpoint JNI yang expose parameter-parameternya (`solfeggioFreq`, `brainwaveFreq`, `resonanceIntensity`, dst) ke JS.
- `usb/USBClockSync`, `USBDACCapabilities` — clock sync detail dan kapabilitas DAC granular, di luar `USBDACModule.ts` yang sudah ada (perlu cek apakah `USBDACModule.ts` yang ada sekarang sudah cover ini atau baru permukaan dasar).
- `profiling/CPUProfiler`, `DSPBenchmark`, `LatencyProfiler` — kemungkinan besar tools internal/debug, wajar kalau tidak ada bridge ke JS sama sekali (tidak perlu diprioritaskan).

---

## 🔴 Item Prioritas Tinggi — Kemungkinan Benar-Benar Rusak/Belum Nyambung

### 1. Playback bridge — silent wiring gap

**Temuan dari sesi native**: `jni/NativePlaybackModule.cpp` punya variabel global `gPlaybackController` yang harus di-set lewat `initPlaybackModule(PlaybackController*)` sebelum `nativePlay()`/`nativePause()`/`nativeSeek()`/dst bisa berfungsi. Fungsi `initPlaybackModule()` **tidak dipanggil dari file manapun** di seluruh `cpp/`.

**Kemungkinan penyebab**: pemanggilan itu seharusnya terjadi di `jni/Onload.cpp` (JNI_OnLoad, saat native library pertama kali dimuat) atau di constructor `EngineManager`/`NativePristineAudio`, tapi belum pernah ditulis.

**Dampak ke UI**: kalau ini belum di-wire, semua tombol play/pause/seek di `features/player/` akan terlihat "gak ngapa-ngapain" — bukan bug di JS, tapi native belum siap nerima command.

**Cara cek:**
```bash
grep -rn "initPlaybackModule" android/app/src/main/cpp
grep -n "JNI_OnLoad" android/app/src/main/cpp/jni/Onload.cpp
cat android/app/src/main/cpp/jni/Onload.cpp
```

**Kalau memang belum di-wire**, ini bukan tugas "penyesuaian UI" — ini tugas balik ke native dulu (nyambungin `initPlaybackModule` ke lifecycle yang benar, kemungkinan di `Onload.cpp` atau `NativePristineAudio.cpp`'s init function) sebelum `features/player/api/playback.ts` bisa diverifikasi jalan.

---

### 2. `PlaybackStatus` enum — cek kesesuaian angka dengan JS

**Native side** (`playback/PlaybackTypes.h`):
```cpp
enum class PlaybackStatus {
    Stopped,    // 0
    Playing,    // 1
    Paused,     // 2
    Buffering,  // 3
    Seeking,    // 4
    Completed,  // 5
    Error       // 6
};
```
`jni/NativePlaybackModule.cpp::nativeGetStatus()` return `static_cast<jint>(status)` — jadi JS nerima angka 0-6 mentah.

**Cara cek sisi JS:**
```bash
grep -rn "Stopped\|Playing\|Paused\|Buffering\|Seeking\|Completed" src/features/player/
grep -rn "PlaybackStatus\|nativeGetStatus" src/specs/ src/features/player/
```

Kalau ada enum/const mapping angka→status di TS yang urutannya beda dari native (misal JS taruh `Buffering` di index 1), itu bug tersembunyi yang gak akan ketauan dari compile error — cuma ketauan pas testing manual (status ke-mapping salah).

---

## 🟡 Item Prioritas Sedang — Perlu 1x Sanity Check, Kemungkinan Aman

### 3. `AudioDeviceDescriptor` rename — cek apakah nama field bocor ke JS

Native: `devices/AudioDeviceInfo.h` di-rename total jadi `devices/AudioDeviceDescriptor.h`, struct-nya juga di-rename. Tapi field JSON yang di-return ke Java (`nativeGetDevices()` di `jni/NativeDeviceModule.cpp`) masih **stub kosong** (`return env->NewObjectArray(0, deviceClass, nullptr);`) — jadi kemungkinan besar **belum ada data real yang mengalir ke JS sama sekali** buat device info, terlepas dari rename.

**Cara cek:**
```bash
grep -rn "AudioDeviceInfo\|AudioDeviceDescriptor" src/
grep -n "nativeGetDevices" android/app/src/main/cpp/jni/NativeDeviceModule.cpp
```

Kalau `nativeGetDevices()` masih stub kosong, ini juga masuk kategori "belum ada apa-apa buat diuji" dari sisi UI — `features/hardware/api/USBDACModule.ts` kemungkinan besar manggil sesuatu yang balikannya selalu array kosong.

### 4. Namespace migration `audio::`→`pristine::`

**Kemungkinan dampak ke JS: rendah/nol.** Ini murni internal C++, JNI export function names (`Java_com_pristineaudio_audio_...`) gak berubah sama sekali — nama Java package/class di JNI itu string literal yang independen dari C++ namespace. Tidak perlu dicek kecuali ada bukti sebaliknya.

### 5. `DSPPipeline`/`ImmersivePipeline` jadi standalone (bukan lagi inherit `AudioPipeline`)

**Kemungkinan dampak ke JS: rendah.** Ini juga murni internal — `EngineManager`/`AudioPipeline` yang expose ke JNI gak berubah signature publiknya. Tapi worth 1x cek kalau `features/equalizer/` atau `features/visualizer/` manggil sesuatu terkait processing mode yang mungkin berubah behavior (bukan signature).

**Cara cek:**
```bash
grep -rn "ProcessingMode\|BitPerfect\|Immersive" src/features/equalizer/ src/features/visualizer/ src/specs/
```

---

## 🟢 Item Prioritas Rendah — Kemungkinan Besar Tidak Perlu Disentuh

- `createResampler()` unused — resampler pipeline internal decoder, tidak ada jalur JNI yang expose pemilihan resampler backend ke JS. Kemungkinan besar aman diabaikan.
- Fix `dsp/OutputStage.cpp`, `BiquadFilter.h`, dll — DSP internals murni, tidak ada JNI surface langsung.

---

## 📋 Todolist Terstruktur (direvisi)

### Tahap 0 — Inventarisasi Faktual (lihat Langkah 0 di atas — WAJIB paling pertama)

- [ ] Jalankan command A-D di atas, hasilkan tabel: JNIEXPORT → Kotlin `external fun` → TS spec → dipakai di `features/`
- [ ] Dari tabel itu, list semua kapabilitas native yang "mentok" (ada di C++/Kotlin tapi gak sampai TS spec)
- [ ] Untuk tiap kapabilitas yang mentok, putuskan: perlu dibuatkan bridge sekarang, atau memang belum prioritas (dicatat sebagai backlog)

### Tahap 1 — Audit 3 Layer Bridge (untuk modul yang SUDAH punya spec TS)

Untuk modul yang sudah lolos Tahap 0 (punya spec TS), baru cek kesesuaian detail 3 lapis:
```
C++ JNIEXPORT (cpp/jni/*.cpp)  ⟷  Kotlin native decl (java/.../*.kt)  ⟷  TS TurboModule spec (src/specs/*.ts)  ⟷  pemakaian di features/
```

- [ ] `jni/NativePristineAudio.cpp` ⟷ `specs/NativePristineAudio.ts`
- [ ] `jni/NativeDSPModule.cpp` ⟷ `java/.../dsp/NativeDSPModule.kt` ⟷ `specs/NativeDSPModule.ts` ⟷ `features/equalizer/api/nativeInterface.ts`
- [ ] `jni/NativeDeviceModule.cpp` ⟷ (cek apakah ada Kotlin wrapper — dari tree awal sepertinya belum ada) ⟷ `features/hardware/api/USBDACModule.ts`
- [ ] `jni/NativePlaybackModule.cpp` ⟷ (cek apakah ada Kotlin wrapper — dari tree awal sepertinya belum ada) ⟷ `features/player/api/playback.ts`
- [ ] `jni/NativeVisualizerModule.cpp` ⟷ `java/.../visualizer/NativeVisualizerBridge.kt` ⟷ `specs/NativeVisualizerBridge.ts` ⟷ `features/visualizer/native/`
- [ ] `jni/NativeAudioFeed.cpp` ⟷ (cek pemakaiannya — belum jelas dari tree mana yang konsumsi ini)

**Catatan penting**: dari tree yang sudah dilihat, `NativeDeviceModule.cpp` dan `NativePlaybackModule.cpp` **tidak punya pasangan file Kotlin** yang terlihat di `java/com/pristineaudio/` (yang ada cuma `dsp/`, `media/`, `usb/`, `visualizer/` — tidak ada folder `device/` atau `playback/`). Ini sinyal tambahan bahwa dua modul ini kemungkinan **belum ter-bridge ke Kotlin sama sekali**, apalagi ke TS. Perlu dikonfirmasi di Tahap 0.

**Command generik buat tiap pasangan** (ganti nama file):
```bash
grep -n "JNIEXPORT\|Java_com_pristineaudio" android/app/src/main/cpp/jni/NativeXxxModule.cpp
grep -rn "external fun\|@ReactMethod" android/app/src/main/java/com/pristineaudio/
cat src/specs/NativeXxxModule.ts
grep -rln "NativeXxxModule" src/features/
```

### Tahap 2 — Verifikasi 2 Item Spesifik (tetap relevan meski modul sudah ter-bridge)

- [ ] Cek `initPlaybackModule()` wiring (lihat bagian dedicated di bawah). Kalau belum di-wire, ini balik ke kerja native dulu — bukan UI.
- [ ] Cek mapping `PlaybackStatus` enum di TS vs native.

### Tahap 3 — Testing Manual per Fitur (setelah Tahap 0-2 clear)

- [ ] `features/player/` — play/pause/seek/status, dengan asumsi playback bridge sudah nyambung
- [ ] `features/equalizer/` — band gain, bass boost, processing mode switch
- [ ] `features/visualizer/` — spectrum/waveform data flow dari `VisualizerBuffer` (C++) → `NativeVisualizerModule` → `VisualizerBridge.ts`
- [ ] `features/hardware/` — USB DAC device list & selection (kemungkinan besar stub kosong, lihat item prioritas sedang di bawah)

### Tahap 4 — Baru Setelah Semua Di Atas Jelas

- [ ] Untuk kapabilitas native yang "mentok" dari Tahap 0 dan diputuskan perlu di-bridge: buat Kotlin `external fun` (kalau belum ada) → buat/lengkapi TS spec → baru pakai di `features/`
- [ ] Sesuaikan kode JS/TS kalau ada mismatch ketemu di Tahap 1-3
- [ ] Kalau `initPlaybackModule` memang belum di-wire, kembali ke native untuk nambahin pemanggilannya (kemungkinan di `Onload.cpp` atau init sequence `NativePristineAudio`)

---

## Catatan

Dokumen ini dibuat tanpa membaca isi file JS/TS/Kotlin — murni dari pengetahuan perubahan native (dicatat lengkap di `build-fix-changelog.md`) dan struktur `tree` yang sudah dilihat. Setiap klaim "kemungkinan besar" di atas perlu dikonfirmasi lewat command yang disarankan sebelum diasumsikan benar.

---
---

Berikut adalah versi terbaru dari ui-js-post-native-refactor-todolist.md yang sudah diperbarui sesuai kemajuan per 31 Agustus 2026.

---
---

Insight & Todolist — Penyesuaian UI/JS Pasca Perombakan Native

Status per 31 Agustus 2026
Dokumen ini sudah memverifikasi build native sukses dan mencatat error runtime pertama yang muncul (RNTP UnsatisfiedLinkError). Fokus sekarang beralih ke integrasi JS/TS dan verifikasi runtime.

---

🎯 TL;DR — Prioritas (direvisi 31 Agustus 2026)

1. Build native sudah selesai — libappmodules.so terproduksi, tidak ada error CMake/C++.
2. Masalah runtime pertama: RNTP — react-native-track-player belum ter-load native library-nya (UnsatisfiedLinkError). Harus diperbaiki sebelum fitur player bisa berjalan.
3. Lakukan inventarisasi bridge (Langkah 0 di bawah) — Petakan JNIEXPORT → Kotlin external fun → TS spec → pemakaian di features/.
4. Perbaiki gap yang ditemukan — Terutama untuk modul yang belum punya TS spec atau Kotlin wrapper.
5. Testing manual per fitur — Setelah semua terhubung, verifikasi Equalizer, Visualizer, USB DAC, Library, Player.

---

🗺️ Langkah 0 — Inventarisasi Permukaan JNI (WAJIB dilakukan duluan)

Jalankan command berikut untuk memetakan gap antara native dan JS:

A. Semua fungsi JNIEXPORT yang diekspos ke Java:

```bash
grep -rn "JNIEXPORT" android/app/src/main/cpp/jni/*.cpp
```

B. Semua native module Kotlin dengan external fun:

```bash
grep -rn "external fun" android/app/src/main/java/com/pristineaudio/
```

C. Semua TurboModule spec di TS:

```bash
for f in src/specs/*.ts; do echo "=== $f ==="; cat "$f"; done
```

D. Bandingkan hasil A, B, C. Buat tabel: nama fungsi native → ada di Kotlin? → ada di TS spec? → dipakai di features/? Fungsi yang berhenti di kolom pertama/kedua adalah kapabilitas yang belum terjangkau dari UI.

E. Modul native yang kemungkinan besar belum ter-bridge:

· session/TransportControls, AudioFocusManager, AudioSessionManager, NoisyReceiverHandler
· playback/PlaybackScheduler, PrebufferManager, FadeEngine
· dsp/immersive/* (BrainwaveGenerator, HarmonicExciter, SpatialFieldProcessor, BinauralRenderer, SolfeggioResonator, FFTResonanceAnalyzer)
· usb/USBClockSync, USBDACCapabilities
· profiling/CPUProfiler, DSPBenchmark, LatencyProfiler (kemungkinan internal, tidak perlu bridge)

---

🔴 Item Prioritas Tinggi — Perlu Penanganan Segera

0. Error Runtime: react-native-track-player (RNTP)

Gejala:

```
java.lang.UnsatisfiedLinkError: No implementation found for void com.lovegaoshi.kotlinaudio.player.AudioPlayer.nativeInitEngine(int, int)
```

Penyebab:
Library native RNTP tidak ter-load atau tidak ter-link dengan benar dalam mode New Architecture.

Langkah perbaikan:

· Cek package RNTP terdaftar di MainApplication.kt.
· Pastikan System.loadLibrary("react-native-track-player") dipanggil.
· Periksa apakah RNTP versi yang digunakan mendukung New Architecture. Jika tidak, pertimbangkan update atau nonaktifkan New Architecture untuk modul tersebut.

---

1. Playback bridge — initPlaybackModule wiring

Temuan: jni/NativePlaybackModule.cpp membutuhkan initPlaybackModule(PlaybackController*) sebelum fungsi playback lain bisa berfungsi. Fungsi ini kemungkinan belum dipanggil di Onload.cpp.

Cara cek:

```bash
grep -rn "initPlaybackModule" android/app/src/main/cpp
cat android/app/src/main/cpp/jni/Onload.cpp
```

Jika belum di-wire, ini harus diperbaiki di sisi native terlebih dahulu.

---

2. Mapping enum PlaybackStatus

Native:

```cpp
enum class PlaybackStatus {
    Stopped, Playing, Paused, Buffering, Seeking, Completed, Error
};
```

Cek di TS:

```bash
grep -rn "PlaybackStatus\|nativeGetStatus" src/specs/ src/features/player/
```

Pastikan urutan angka sesuai.

---

🟡 Item Prioritas Sedang — Sanity Check

3. AudioDeviceDescriptor dan stub nativeGetDevices()

NativeDeviceModule.cpp masih mengembalikan array kosong. Perlu dipastikan apakah UI sudah siap menerima data device yang sebenarnya.

Cara cek:

```bash
grep -rn "AudioDeviceInfo\|AudioDeviceDescriptor" src/
grep -n "nativeGetDevices" android/app/src/main/cpp/jni/NativeDeviceModule.cpp
```

4. Namespace migration audio:: → pristine::

Tidak berdampak langsung ke JS selama JNI export names tetap. Tidak perlu dicek kecuali ada bukti masalah.

5. DSPPipeline/ImmersivePipeline standalone

Tidak berdampak langsung, tapi perlu 1x cek pada fitur yang bergantung pada mode processing.

Cara cek:

```bash
grep -rn "ProcessingMode\|BitPerfect\|Immersive" src/features/equalizer/ src/features/visualizer/ src/specs/
```

---

🟢 Item Prioritas Rendah

· createResampler() unused — tidak perlu disentuh.
· Fix dsp/OutputStage.cpp, BiquadFilter.h — internal DSP, tidak ada JNI surface.

---

📋 Todolist Terstruktur (update 31 Agustus 2026)

Tahap 0 — Verifikasi Runtime Awal

☐ Selesaikan error RNTP (UnsatisfiedLinkError)
☐ Pastikan aplikasi bisa start tanpa crash
☐ Cek logcat untuk error PlatformConstants atau TurboModule

Tahap 1 — Inventarisasi Faktual

☐ Jalankan command A-D, buat tabel gap
☐ Tentukan kapabilitas yang perlu di-bridge

Tahap 2 — Audit Bridge untuk Modul yang Sudah Punya Spec

☐ NativeDSPModule
☐ NativeVisualizerBridge
☐ USBDACModule
☐ MediaStoreModule

Tahap 3 — Verifikasi Item Spesifik

☐ initPlaybackModule wiring
☐ Mapping PlaybackStatus

Tahap 4 — Testing Manual

☐ Player: play/pause/seek
☐ Equalizer: band gain, presets
☐ Visualizer: spectrum data
☐ USB DAC: device list
☐ Library: scan and load files

---

Catatan

Dokumen ini diperbarui berdasarkan build native yang sudah sukses dan error runtime pertama (RNTP). Semua langkah di atas harus dilakukan untuk memastikan integrasi penuh antara native dan UI/JS.

---

---

Insight & Todolist — Penyesuaian UI/JS Pasca Perombakan Native

Status per 1 September 2026
Build native sukses, error RNTP sudah di-bypass, aplikasi bisa booting tanpa crash. Fokus sekarang: menyelesaikan penggantian RNTP dengan custom playback service berbasis Oboe.

---

🎯 TL;DR — Prioritas (revisi 1 September 2026)

1. ✅ Build native stabil, libappmodules.so terproduksi, FFmpeg terintegrasi.
2. ✅ RNTP dinonaktifkan sementara (RNTP_ENABLED = false) → aplikasi tidak crash saat startup.
3. 🔄 Sedang membangun custom playback service (PlaybackService, MediaSessionManager, PlaybackNativeBridge) untuk menggantikan RNTP secara permanen.
4. Selanjutnya: sambungkan custom service ke UI/JS, lalu hapus ketergantungan RNTP.
5. Testing manual fitur player, equalizer, visualizer, dll.

---

📊 Kondisi Terkini

Komponen Status
NativePlaybackModule (Oboe bridge) ✅ Aktif, sudah punya queue management
PlaybackService (Foreground) 🔄 Sedang dibuat
MediaSessionManager 🔄 Sedang dibuat
PlaybackNativeBridge 🔄 Sedang dibuat
NativePlaybackService (TurboModule) 🔄 Sedang dibuat
RNTP ⏸️ Dinonaktifkan sementara (RNTP_ENABLED = false)
FFmpeg ✅ Terintegrasi, FFmpegDecoder aktif
UI/JS 🔄 Masih menggunakan RNTP guard, belum migrasi penuh

---

🔴 Langkah Selanjutnya

1. Selesaikan custom playback service

☐ Pastikan PlaybackService.kt, MediaSessionManager.kt, PlaybackNativeBridge.kt, dan NativePlaybackService.kt sudah benar dan terdaftar.
☐ Hubungkan PlaybackNativeBridge dengan NativePlaybackModule.instance agar kontrol dari service berfungsi.
☐ Daftarkan NativePlaybackService di USBDACPackage.
☐ Tambahkan spec TS src/specs/NativePlaybackService.ts.

2. Migrasi UI dari RNTP ke custom service

☐ Ganti pemanggilan TrackPlayer.play(), pause(), seekTo(), dll. di engine.ts dengan NativePlaybackService.
☐ Update useAudioPlayer.ts dan useTrackPlayerHandler.ts untuk memakai custom service.
☐ Hapus RNTP_ENABLED guard setelah migrasi selesai.
☐ Hapus dependensi react-native-track-player dari package.json.

3. Testing manual

☐ Player: play/pause/seek/next/previous
☐ Notifikasi media dan kontrol lock screen
☐ Audio focus (pause saat panggilan masuk)
☐ Queue management (shuffle, repeat)
☐ Integrasi equalizer dan visualizer

---

🧾 Checklist Terbaru

☑ Build native sukses
☑ FFmpeg terintegrasi
☑ RNTP dinonaktifkan sementara
☑ Aplikasi booting tanpa crash
☐ Custom playback service selesai
☐ UI/JS migrasi ke custom service
☐ RNTP dihapus
☐ Testing fitur player lengkap

---

Dokumen ini akan terus diperbarui seiring progres migrasi. Silakan commit jika sudah sesuai.