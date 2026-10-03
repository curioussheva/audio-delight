# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)

---

## 🔴 FASE 1 — Hub Inti (WAJIB diperbaiki, jangan di-exclude)

File-file ini dipakai oleh banyak modul lain — kalau di-exclude dari build,
menyebabkan linker error di tempat lain yang justru sudah live.

| File | Dipakai oleh |
|---|---|
| `manager/EngineManager.cpp` | 5 file JNI: `NativePristineAudio`, `NativeDSPModule`, `NativeVisualizerModule`, `NativeAudioFeed`, `NativePlaybackModule` |
| `playback/PlaybackController.cpp` | `NativePlaybackModule.cpp`, `EngineManager.cpp/.h` |
| `decoder/DecoderFactory.cpp` | `PrebufferManager.h/.cpp` |
| `dsp/DSPChain.cpp` | `core/AudioPipeline.h/.cpp` (member `mDSP`) |

**Error yang sudah terdeteksi (dari scan `scripts/check.sh` sebelumnya):**
- `DSPChain.cpp:64` — no member `applyConfig` in `DSPGraph`
- `EngineManager.cpp:166` — no member `setImmersiveEnabled` in `AudioEngine`
- `PlaybackController.cpp:182` — no member `FFmpegDecoder` in namespace `decoder`
- `DecoderFactory.cpp` — belum di-scan langsung, cek dulu di awal fase ini

**Urutan kerja disarankan:** mulai dari `DSPChain.cpp` (paling dekat dengan kerjaan
Fase 0, dan `AudioPipeline` sudah menunggunya), lalu `EngineManager.cpp`,
baru `PlaybackController.cpp` dan `DecoderFactory.cpp`.

**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang (perlu cek dependency dulu sebelum diputuskan)

Belum dikonfirmasi apakah "leaf" (aman ditunda) atau ada yang bergantung ke sana.
Cek dengan pola:
```bash
grep -rln "NamaClass\b" android/app/src/main/cpp --include=*.cpp --include=*.h | grep -v "path/file/itu/sendiri"
```

- `decoder/AudioDecoder.cpp`
- `decoder/PCMDecoder.cpp`
- `decoder/DecoderWorker.cpp`
- `playback/PlaybackManager.cpp`
- `session/TransportControls.cpp` — perlu desain `TransportResult` enum +
  kemungkinan `PlaybackEventDispatcher` (lihat catatan Fase 3)
- `jni/NativeVisualizerModule.cpp` — bergantung ke `AudioEngine::getVisualizerData`
  yang belum ada

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class besar yang belum diimplementasikan sama sekali** (ditemukan saat investigasi
Grup A, bukan sekadar rename):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Ini butuh keputusan desain, bukan tebakan — didiskusikan saat masuk fase ini.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).







############# Update 1 #################

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)

---

## 🔴 FASE 1 — Hub Inti (WAJIB diperbaiki, jangan di-exclude)

File-file ini dipakai oleh banyak modul lain — kalau di-exclude dari build,
menyebabkan linker error di tempat lain yang justru sudah live.

| File | Dipakai oleh |
|---|---|
| `manager/EngineManager.cpp` | 5 file JNI: `NativePristineAudio`, `NativeDSPModule`, `NativeVisualizerModule`, `NativeAudioFeed`, `NativePlaybackModule` |
| `playback/PlaybackController.cpp` | `NativePlaybackModule.cpp`, `EngineManager.cpp/.h` |
| `decoder/DecoderFactory.cpp` | `PrebufferManager.h/.cpp` |
| `dsp/DSPChain.cpp` | `core/AudioPipeline.h/.cpp` (member `mDSP`) |

**Error yang sudah terdeteksi (dari scan `scripts/check.sh` sebelumnya):**
- ~~`DSPChain.cpp:64` — no member `applyConfig` in `DSPGraph`~~ →
  **DIKONFIRMASI**: `DSPChain.cpp` sudah benar & lengkap (dicek manual, kode rapi).
  Akar masalah ada di **`dsp/graph/DSPGraph.h`/`.cpp`** — dikonfirmasi via
  `grep -n "applyConfig" cpp/dsp/graph/DSPGraph.h` = kosong. `DSPGraph` perlu
  method `applyConfig`, dan kemungkinan juga `addNode`, `clear`, `prepare`,
  `process` (dipanggil dari `DSPChain::buildGraph()`/`prepare()`/`process()`) —
  cek semua saat mulai fase ini.
- `EngineManager.cpp:166` — no member `setImmersiveEnabled` in `AudioEngine` →
  **DIKONFIRMASI** via grep `AudioEngine.h` = kosong, method memang belum ada.
  Perlu ditambahkan ke `AudioEngine` (bukan rename).
- `NativeVisualizerModule.cpp:38` — no member `getVisualizerData` in `AudioEngine` →
  sama, dikonfirmasi belum ada, perlu ditambahkan.
- `PlaybackController.cpp:182` — no member `FFmpegDecoder` in namespace `decoder`
- `DecoderFactory.cpp` — belum di-scan langsung, cek dulu di awal fase ini

**Urutan kerja disarankan:** mulai dari `DSPGraph.h/.cpp` (bukan `DSPChain.cpp` —
itu sudah beres), lalu `AudioEngine` (tambah `setImmersiveEnabled` +
`getVisualizerData`), baru `PlaybackController.cpp` dan `DecoderFactory.cpp`.

**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang (perlu cek dependency dulu sebelum diputuskan)

Belum dikonfirmasi apakah "leaf" (aman ditunda) atau ada yang bergantung ke sana.
Cek dengan pola:
```bash
grep -rln "NamaClass\b" android/app/src/main/cpp --include=*.cpp --include=*.h | grep -v "path/file/itu/sendiri"
```

- `decoder/AudioDecoder.cpp`
- `decoder/PCMDecoder.cpp` — **FIX CEPAT DIKONFIRMASI**: `DecodeStatus` enum di
  `DecoderTypes.h` cuma punya `Success` & `EndOfStream` (tidak ada `Eof`).
  Kode di `PCMDecoder.cpp`/`AudioDecoder.cpp` kemungkinan salah sebut
  `DecodeStatus::Eof` → harusnya `DecodeStatus::EndOfStream`. Juga cek
  `AudioFormat::bitsPerSample` (mungkin field beda nama) dan pemakaian
  `AudioFormat::SampleFormat` (enum `SampleFormat` sudah top-level di
  `DecoderTypes.h` baris 13, bukan nested di `AudioFormat` — kemungkinan cukup
  hapus prefix `AudioFormat::` di call site).
- `decoder/DecoderWorker.cpp`
- `playback/PlaybackManager.cpp`
- `jni/NativeVisualizerModule.cpp` — bergantung ke `AudioEngine::getVisualizerData`
  yang belum ada (lihat Fase 1, sudah dikonfirmasi belum ada di header)

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).




############# Update 2 ##############

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp` + `.h`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioState.h` (tambahan `immersiveEnabled` flag)
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)
- `dsp/graph/DSPNode.h` (tambahan virtual `applyConfig(const DSPConfig&)`)
- `dsp/graph/DSPGraph.h` + `.cpp` (tambahan `applyConfig`, loop ke semua node)
- `dsp/tone/EQNode.h` + `.cpp` (override `applyConfig` → set band gain + bass boost)
- `dsp/tone/GainNode.h` + `.cpp` (override `applyConfig` → hitung gain L/R dari
  masterGain + balance)
- `dsp/dynamics/LimiterNode.h` + `.cpp` (override `applyConfig` → toggle enable)
- `dsp/spatial/StereoWidenerNode.h` + `.cpp` (override `applyConfig` → set width)
- `dsp/DSPChain.cpp` (tidak diubah — sudah benar dari awal, akar masalah ada
  di `DSPGraph`)
- `manager/EngineManager.cpp` (bersih otomatis setelah `AudioEngine` dilengkapi)
- `jni/NativeVisualizerModule.cpp` (bersih otomatis setelah visualizer path
  dibangun)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)
- **Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode`**
  (base + 4 turunan) dan `DSPGraph`, supaya `DSPChain::applyConfig()` (yang
  sudah lebih dulu benar) punya implementasi nyata untuk dipanggil
- **Ditambahkan `AudioEngine::setImmersiveEnabled()`** — cuma set flag di
  `AudioState`, belum tersambung ke efek DSP nyata karena
  `AudioPipeline::processImmersive()` sendiri masih placeholder (lihat Fase 3)
- **Dibangun jalur visualizer baru dari nol**: `AudioCallback` sekarang punya
  member `VisualizerBuffer mVisualizer`, ditulis tiap callback
  (`mVisualizer.write(mLeft, mRight, numFrames)`), diexpose lewat
  `AudioCallback::visualizerBuffer()`, dipanggil dari
  `AudioEngine::getVisualizerData()`. Sebelumnya `VisualizerBuffer` sama sekali
  tidak dipakai di manapun selain file dirinya sendiri.

---

## 🔴 FASE 1 — Hub Inti (WAJIB diperbaiki, jangan di-exclude)

**Sudah selesai:** `DSPChain.cpp`/`DSPGraph`, `EngineManager.cpp`,
`NativeVisualizerModule.cpp`, `AudioEngine::setImmersiveEnabled/getVisualizerData`
— lihat Fase 0.

**Masih tersisa:**

| File | Dipakai oleh |
|---|---|
| `playback/PlaybackController.cpp` | `NativePlaybackModule.cpp`, `EngineManager.cpp/.h` |
| `decoder/DecoderFactory.cpp` | `PrebufferManager.h/.cpp` |

**Error yang sudah terdeteksi (dari scan `scripts/check.sh` terakhir):**
- `PlaybackController.cpp:182` — no member `FFmpegDecoder` in namespace `decoder`
- `DecoderFactory.cpp` — belum di-scan langsung, cek dulu di awal fase ini

**Urutan kerja disarankan:** `PlaybackController.cpp` dulu (satu error tunggal,
kemungkinan cuma cek apakah `FFmpegDecoder` memang belum diimplementasikan atau
nama class-nya beda), baru `DecoderFactory.cpp`.

**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang (perlu cek dependency dulu sebelum diputuskan)

Belum dikonfirmasi apakah "leaf" (aman ditunda) atau ada yang bergantung ke sana.
Cek dengan pola:
```bash
grep -rln "NamaClass\b" android/app/src/main/cpp --include=*.cpp --include=*.h | grep -v "path/file/itu/sendiri"
```

- `decoder/AudioDecoder.cpp`
- `decoder/PCMDecoder.cpp` — **FIX CEPAT DIKONFIRMASI**: `DecodeStatus` enum di
  `DecoderTypes.h` cuma punya `Success` & `EndOfStream` (tidak ada `Eof`).
  Kode di `PCMDecoder.cpp`/`AudioDecoder.cpp` kemungkinan salah sebut
  `DecodeStatus::Eof` → harusnya `DecodeStatus::EndOfStream`. Juga cek
  `AudioFormat::bitsPerSample` (mungkin field beda nama) dan pemakaian
  `AudioFormat::SampleFormat` (enum `SampleFormat` sudah top-level di
  `DecoderTypes.h` baris 13, bukan nested di `AudioFormat` — kemungkinan cukup
  hapus prefix `AudioFormat::` di call site).
- `decoder/DecoderWorker.cpp`
- `playback/PlaybackManager.cpp`
- `jni/NativeVisualizerModule.cpp` — bergantung ke `AudioEngine::getVisualizerData`
  yang belum ada (lihat Fase 1, sudah dikonfirmasi belum ada di header)

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).


########### Update 3 ###########

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp` + `.h`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioState.h` (tambahan `immersiveEnabled` flag)
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)
- `dsp/graph/DSPNode.h` (tambahan virtual `applyConfig(const DSPConfig&)`)
- `dsp/graph/DSPGraph.h` + `.cpp` (tambahan `applyConfig`, loop ke semua node)
- `dsp/tone/EQNode.h` + `.cpp` (override `applyConfig` → set band gain + bass boost)
- `dsp/tone/GainNode.h` + `.cpp` (override `applyConfig` → hitung gain L/R dari
  masterGain + balance)
- `dsp/dynamics/LimiterNode.h` + `.cpp` (override `applyConfig` → toggle enable)
- `dsp/spatial/StereoWidenerNode.h` + `.cpp` (override `applyConfig` → set width)
- `dsp/DSPChain.cpp` (tidak diubah — sudah benar dari awal, akar masalah ada
  di `DSPGraph`)
- `manager/EngineManager.cpp` (bersih otomatis setelah `AudioEngine` dilengkapi)
- `jni/NativeVisualizerModule.cpp` (bersih otomatis setelah visualizer path
  dibangun)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)
- **Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode`**
  (base + 4 turunan) dan `DSPGraph`, supaya `DSPChain::applyConfig()` (yang
  sudah lebih dulu benar) punya implementasi nyata untuk dipanggil
- **Ditambahkan `AudioEngine::setImmersiveEnabled()`** — cuma set flag di
  `AudioState`, belum tersambung ke efek DSP nyata karena
  `AudioPipeline::processImmersive()` sendiri masih placeholder (lihat Fase 3)
- **Dibangun jalur visualizer baru dari nol**: `AudioCallback` sekarang punya
  member `VisualizerBuffer mVisualizer`, ditulis tiap callback
  (`mVisualizer.write(mLeft, mRight, numFrames)`), diexpose lewat
  `AudioCallback::visualizerBuffer()`, dipanggil dari
  `AudioEngine::getVisualizerData()`. Sebelumnya `VisualizerBuffer` sama sekali
  tidak dipakai di manapun selain file dirinya sendiri.

---

## ✅ FASE 1 — SELESAI SEPENUHNYA

Semua hub inti sudah diperbaiki dan diverifikasi bersih:
- `dsp/graph/DSPGraph.h/.cpp`, `dsp/DSPChain.cpp` (lihat Fase 0)
- `manager/EngineManager.cpp`
- `jni/NativeVisualizerModule.cpp`
- `decoder/DecoderFactory.cpp`
- `decoder/StreamResampler.cpp` / `.h`
- `playback/PlaybackController.cpp` / `.h`

**Perubahan kunci:**
- **Bug include besar**: `decoder/StreamResampler.h` punya path salah
  (`../dsp/resampler/LinearResampler.h` → seharusnya `../resampler/LinearResampler.h`).
  Broken include ini menyebabkan efek domino — banyak error "unknown type"/
  "no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp`
  yang **bukan bug nyata**, cuma akibat parse gagal di tengah jalan.
  **Pelajaran**: selalu cek baris `pp_file_not_found` di output mentah clangd
  dulu sebelum percaya daftar error lain di file yang sama —
  `scripts/check.sh` saat ini tidak menangkap kategori ini (filter grep-nya
  cuma `no_member|error:|undeclared`). Perlu update filter script ke depannya.
- `playback/PlaybackController.h`: `metrics_` salah tipe — dideklarasikan
  `shared_ptr<PlaybackMetrics>` (struct data pasif, tanpa method) padahal
  seharusnya `shared_ptr<MetricsCollector>` (class dengan method
  `recordFrameRendered`, dll — keduanya didefinisikan di file yang sama,
  `PlaybackMetrics.h`)
- `PlaybackController.cpp::startDecoder()`: didesain ulang sesuai API
  `DecoderWorker` yang sebenarnya (callback-based via `setDecodeCallback(
  std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback`
  yang tidak pernah ada). `DecodeResult::samples` (vector<float>) ditulis
  langsung ke `pcmQueue_` dari dalam callback.
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::
  Playing/Paused)` (state pakai enum, bukan bool), `setTrack()`→
  `setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` ke `PlaybackController.cpp`
  (class-nya sudah ada dari awal, cuma belum di-include — bukan belum
  diimplementasikan)



**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang (perlu cek dependency dulu sebelum diputuskan, DAN
## cek dulu apakah errornya real atau efek domino broken include seperti
## temuan Fase 1 — jalankan `clangd --check` mentah tanpa filter dulu)

Belum dikonfirmasi apakah "leaf" (aman ditunda) atau ada yang bergantung ke sana.
Cek dengan pola:
```bash
grep -rln "NamaClass\b" android/app/src/main/cpp --include=*.cpp --include=*.h | grep -v "path/file/itu/sendiri"
```

- `decoder/AudioDecoder.cpp`
- `decoder/PCMDecoder.cpp` — **FIX CEPAT DIKONFIRMASI**: `DecodeStatus` enum di
  `DecoderTypes.h` cuma punya `Success` & `EndOfStream` (tidak ada `Eof`).
  Kode di `PCMDecoder.cpp`/`AudioDecoder.cpp` kemungkinan salah sebut
  `DecodeStatus::Eof` → harusnya `DecodeStatus::EndOfStream`. Juga cek
  `AudioFormat::bitsPerSample` (mungkin field beda nama) dan pemakaian
  `AudioFormat::SampleFormat` (enum `SampleFormat` sudah top-level di
  `DecoderTypes.h` baris 13, bukan nested di `AudioFormat` — kemungkinan cukup
  hapus prefix `AudioFormat::` di call site).
- `decoder/DecoderWorker.cpp`
- `playback/PlaybackManager.cpp`
- `jni/NativeVisualizerModule.cpp` — bergantung ke `AudioEngine::getVisualizerData`
  yang belum ada (lihat Fase 1, sudah dikonfirmasi belum ada di header)

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).



######## Update 4 ########


# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp` + `.h`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioState.h` (tambahan `immersiveEnabled` flag)
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)
- `dsp/graph/DSPNode.h` (tambahan virtual `applyConfig(const DSPConfig&)`)
- `dsp/graph/DSPGraph.h` + `.cpp` (tambahan `applyConfig`, loop ke semua node)
- `dsp/tone/EQNode.h` + `.cpp` (override `applyConfig` → set band gain + bass boost)
- `dsp/tone/GainNode.h` + `.cpp` (override `applyConfig` → hitung gain L/R dari
  masterGain + balance)
- `dsp/dynamics/LimiterNode.h` + `.cpp` (override `applyConfig` → toggle enable)
- `dsp/spatial/StereoWidenerNode.h` + `.cpp` (override `applyConfig` → set width)
- `dsp/DSPChain.cpp` (tidak diubah — sudah benar dari awal, akar masalah ada
  di `DSPGraph`)
- `manager/EngineManager.cpp` (bersih otomatis setelah `AudioEngine` dilengkapi)
- `jni/NativeVisualizerModule.cpp` (bersih otomatis setelah visualizer path
  dibangun)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)
- **Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode`**
  (base + 4 turunan) dan `DSPGraph`, supaya `DSPChain::applyConfig()` (yang
  sudah lebih dulu benar) punya implementasi nyata untuk dipanggil
- **Ditambahkan `AudioEngine::setImmersiveEnabled()`** — cuma set flag di
  `AudioState`, belum tersambung ke efek DSP nyata karena
  `AudioPipeline::processImmersive()` sendiri masih placeholder (lihat Fase 3)
- **Dibangun jalur visualizer baru dari nol**: `AudioCallback` sekarang punya
  member `VisualizerBuffer mVisualizer`, ditulis tiap callback
  (`mVisualizer.write(mLeft, mRight, numFrames)`), diexpose lewat
  `AudioCallback::visualizerBuffer()`, dipanggil dari
  `AudioEngine::getVisualizerData()`. Sebelumnya `VisualizerBuffer` sama sekali
  tidak dipakai di manapun selain file dirinya sendiri.

---

## ✅ FASE 1 — SELESAI SEPENUHNYA

Semua hub inti sudah diperbaiki dan diverifikasi bersih:
- `dsp/graph/DSPGraph.h/.cpp`, `dsp/DSPChain.cpp` (lihat Fase 0)
- `manager/EngineManager.cpp`
- `jni/NativeVisualizerModule.cpp`
- `decoder/DecoderFactory.cpp`
- `decoder/StreamResampler.cpp` / `.h`
- `playback/PlaybackController.cpp` / `.h`

**Perubahan kunci:**
- **Bug include besar**: `decoder/StreamResampler.h` punya path salah
  (`../dsp/resampler/LinearResampler.h` → seharusnya `../resampler/LinearResampler.h`).
  Broken include ini menyebabkan efek domino — banyak error "unknown type"/
  "no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp`
  yang **bukan bug nyata**, cuma akibat parse gagal di tengah jalan.
  **Pelajaran**: selalu cek baris `pp_file_not_found` di output mentah clangd
  dulu sebelum percaya daftar error lain di file yang sama —
  `scripts/check.sh` saat ini tidak menangkap kategori ini (filter grep-nya
  cuma `no_member|error:|undeclared`). Perlu update filter script ke depannya.
- `playback/PlaybackController.h`: `metrics_` salah tipe — dideklarasikan
  `shared_ptr<PlaybackMetrics>` (struct data pasif, tanpa method) padahal
  seharusnya `shared_ptr<MetricsCollector>` (class dengan method
  `recordFrameRendered`, dll — keduanya didefinisikan di file yang sama,
  `PlaybackMetrics.h`)
- `PlaybackController.cpp::startDecoder()`: didesain ulang sesuai API
  `DecoderWorker` yang sebenarnya (callback-based via `setDecodeCallback(
  std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback`
  yang tidak pernah ada). `DecodeResult::samples` (vector<float>) ditulis
  langsung ke `pcmQueue_` dari dalam callback.
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::
  Playing/Paused)` (state pakai enum, bukan bool), `setTrack()`→
  `setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` ke `PlaybackController.cpp`
  (class-nya sudah ada dari awal, cuma belum di-include — bukan belum
  diimplementasikan)



**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang

**Hasil scan tanpa filter (clangd mentah) — peta akurat per 20 Agustus 2026:**

### Bug include baru ditemukan (root cause, domino effect — cek & fix DULU
### sebelum menilai file-file ini "banyak error")

1. **`DecodedChunk` unknown type** — muncul di 4 file: `decoder/AudioDecoder.cpp`,
   `decoder/PCMDecoder.cpp`, `decoder/DecoderWorker.cpp`,
   `playback/PlaybackManager.cpp`. Cari dulu di mana `DecodedChunk` seharusnya
   didefinisikan (`decoder/DecoderTypes.h`? atau file terpisah yang belum ada/
   salah include).
2. **`FFTTypes.h' file not found`** — muncul di 3 file: `fft/FFTPlan.cpp`,
   `FFTProcessor.cpp`, `SpectrumAnalyzer.cpp`. **DIDUGA KUAT typo nama file** —
   file asli di project bernama `fft/FFTypes.h` (satu huruf T), tapi kode
   nge-include `"FFTTypes.h"` (dua huruf T). Cek dulu, kalau benar tinggal fix
   nama include-nya (atau rename filenya, pilih salah satu konsisten).
3. **`dsp/BiquadFilter.cpp`** — `int32_t` unknown type + `BiquadFilter` sendiri
   undeclared di file `.cpp`-nya sendiri → kemungkinan masalah include guard
   atau urutan include di `BiquadFilter.h`. Cek isi headernya.

**Fix ketiga bug include ini dulu, baru scan ulang file-file yang terpengaruh
untuk lihat error asli yang tersisa** — pola `StreamResampler` kemarin
menunjukkan banyak error "hilang" begitu include-nya benar.

### Bug nyata (bukan domino, dikonfirmasi lewat pola errornya)

- `decoder/AudioDecoder.cpp`, `PCMDecoder.cpp`: `DecodeStatus::Eof` →
  kemungkinan besar seharusnya `DecodeStatus::EndOfStream` (rename, sudah
  diduga sejak sesi sebelumnya)
- `PCMDecoder.cpp`: `AudioFormat::bitsPerSample` dan akses
  `AudioFormat::SampleFormat` — field/namespace salah, perlu cek struct
  `AudioFormat` lengkap di `DecoderTypes.h`
- **`dsp/EQProcessor.cpp` — SERIUS**: `redefinition of 'process'`, banyak
  `mismatched_exception_spec` (noexcept tidak cocok dengan `EQProcessor.h`).
  Sinyal kuat: file `.cpp` ini adalah **versi lama yang belum di-update**
  setelah header di-refactor. Kemungkinan perlu ditulis ulang total, bukan
  sekadar rename kecil. (Terpisah dari error `mBandEnabled`/`mBassEnabled`
  yang juga muncul di file yang sama.)
- **`dsp/OutputStage.cpp`**: `GainProcessor` (di `dsp/GainProcessor.h`) dan
  `Limiter` (di `dsp/Limiter.h`) — dua class **terpisah** dari `GainNode`/
  `LimiterNode` yang sudah kita perbaiki di `dsp/graph/` — benar-benar belum
  punya `prepare/reset/setGain/setChannelGain`. Pola sama seperti `DSPNode`
  kemarin, tapi ini hierarchy/class yang beda, perlu dikerjakan terpisah.
- **`playback/PlaybackManager.cpp`**: `setQueue` tidak cocok deklarasi, dan
  constructor `PlaybackScheduler` tidak cocok — **terkait langsung ke
  `PlaybackEventDispatcher` yang belum ada (lihat Fase 3)**. Tidak bisa
  diperbaiki independen sebelum keputusan desain Fase 3 diambil.
- **`profiling/LatencyProfiler.cpp`**: `LatencyProfiler` undeclared di file
  `.cpp` miliknya sendiri — aneh, perlu lihat isi file & headernya langsung.

### ⚠️ Anomali — perlu verifikasi ulang, jangan percaya begitu saja

`session/TransportControls.cpp` menunjukkan **0 error** di scan tanpa filter
ini — padahal sebelumnya dikonfirmasi `TransportResult`/`TransportCommand`/
`PlaybackEventDispatcher` tidak ada definisinya di manapun di project. Ini
tidak konsisten dengan temuan sebelumnya. Kemungkinan: cache clangd stale,
atau ada sesuatu yang berubah tanpa sadar. **Jalankan ulang
`clangd --check=session/TransportControls.cpp` sendirian (bukan dalam loop)
untuk konfirmasi sebelum mengambil kesimpulan apapun soal file ini.**

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).



####### update 5 #######

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp` + `.h`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioState.h` (tambahan `immersiveEnabled` flag)
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)
- `dsp/graph/DSPNode.h` (tambahan virtual `applyConfig(const DSPConfig&)`)
- `dsp/graph/DSPGraph.h` + `.cpp` (tambahan `applyConfig`, loop ke semua node)
- `dsp/tone/EQNode.h` + `.cpp` (override `applyConfig` → set band gain + bass boost)
- `dsp/tone/GainNode.h` + `.cpp` (override `applyConfig` → hitung gain L/R dari
  masterGain + balance)
- `dsp/dynamics/LimiterNode.h` + `.cpp` (override `applyConfig` → toggle enable)
- `dsp/spatial/StereoWidenerNode.h` + `.cpp` (override `applyConfig` → set width)
- `dsp/DSPChain.cpp` (tidak diubah — sudah benar dari awal, akar masalah ada
  di `DSPGraph`)
- `manager/EngineManager.cpp` (bersih otomatis setelah `AudioEngine` dilengkapi)
- `jni/NativeVisualizerModule.cpp` (bersih otomatis setelah visualizer path
  dibangun)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)
- **Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode`**
  (base + 4 turunan) dan `DSPGraph`, supaya `DSPChain::applyConfig()` (yang
  sudah lebih dulu benar) punya implementasi nyata untuk dipanggil
- **Ditambahkan `AudioEngine::setImmersiveEnabled()`** — cuma set flag di
  `AudioState`, belum tersambung ke efek DSP nyata karena
  `AudioPipeline::processImmersive()` sendiri masih placeholder (lihat Fase 3)
- **Dibangun jalur visualizer baru dari nol**: `AudioCallback` sekarang punya
  member `VisualizerBuffer mVisualizer`, ditulis tiap callback
  (`mVisualizer.write(mLeft, mRight, numFrames)`), diexpose lewat
  `AudioCallback::visualizerBuffer()`, dipanggil dari
  `AudioEngine::getVisualizerData()`. Sebelumnya `VisualizerBuffer` sama sekali
  tidak dipakai di manapun selain file dirinya sendiri.

---

## ✅ FASE 1 — SELESAI SEPENUHNYA

Semua hub inti sudah diperbaiki dan diverifikasi bersih:
- `dsp/graph/DSPGraph.h/.cpp`, `dsp/DSPChain.cpp` (lihat Fase 0)
- `manager/EngineManager.cpp`
- `jni/NativeVisualizerModule.cpp`
- `decoder/DecoderFactory.cpp`
- `decoder/StreamResampler.cpp` / `.h`
- `playback/PlaybackController.cpp` / `.h`

**Perubahan kunci:**
- **Bug include besar**: `decoder/StreamResampler.h` punya path salah
  (`../dsp/resampler/LinearResampler.h` → seharusnya `../resampler/LinearResampler.h`).
  Broken include ini menyebabkan efek domino — banyak error "unknown type"/
  "no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp`
  yang **bukan bug nyata**, cuma akibat parse gagal di tengah jalan.
  **Pelajaran**: selalu cek baris `pp_file_not_found` di output mentah clangd
  dulu sebelum percaya daftar error lain di file yang sama —
  `scripts/check.sh` saat ini tidak menangkap kategori ini (filter grep-nya
  cuma `no_member|error:|undeclared`). Perlu update filter script ke depannya.
- `playback/PlaybackController.h`: `metrics_` salah tipe — dideklarasikan
  `shared_ptr<PlaybackMetrics>` (struct data pasif, tanpa method) padahal
  seharusnya `shared_ptr<MetricsCollector>` (class dengan method
  `recordFrameRendered`, dll — keduanya didefinisikan di file yang sama,
  `PlaybackMetrics.h`)
- `PlaybackController.cpp::startDecoder()`: didesain ulang sesuai API
  `DecoderWorker` yang sebenarnya (callback-based via `setDecodeCallback(
  std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback`
  yang tidak pernah ada). `DecodeResult::samples` (vector<float>) ditulis
  langsung ke `pcmQueue_` dari dalam callback.
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::
  Playing/Paused)` (state pakai enum, bukan bool), `setTrack()`→
  `setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` ke `PlaybackController.cpp`
  (class-nya sudah ada dari awal, cuma belum di-include — bukan belum
  diimplementasikan)



**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang

**Hasil scan tanpa filter (clangd mentah) — peta akurat per 20 Agustus 2026:**

### Bug include baru ditemukan (root cause, domino effect — cek & fix DULU
### sebelum menilai file-file ini "banyak error")

1. **`DecodedChunk` unknown type** — muncul di 4 file: `decoder/AudioDecoder.cpp`,
   `decoder/PCMDecoder.cpp`, `decoder/DecoderWorker.cpp`,
   `playback/PlaybackManager.cpp`. Cari dulu di mana `DecodedChunk` seharusnya
   didefinisikan (`decoder/DecoderTypes.h`? atau file terpisah yang belum ada/
   salah include).
2. **`FFTTypes.h' file not found`** — ✅ **DIPERBAIKI**: dikonfirmasi typo nama
   file, `FFTPlan.h` include `"FFTTypes.h"` (2 huruf T) padahal file aslinya
   `FFTypes.h` (1 huruf T). Fix diterapkan. `FFTPlan.cpp` dan
   `SpectrumAnalyzer.cpp` langsung 0 error setelahnya (efek domino terbukti
   lagi). `FFTProcessor.cpp` tersisa 1 error asli: `createHanningWindow`
   undeclared — lihat catatan arsitektur `namespace audio` di bawah.
3. **`dsp/BiquadFilter.cpp`** — `int32_t` unknown type + `BiquadFilter` sendiri
   undeclared di file `.cpp`-nya sendiri → kemungkinan masalah include guard
   atau urutan include di `BiquadFilter.h`. Cek isi headernya.

### 🏛️ CATATAN ARSITEKTUR — KEPUTUSAN DIAMBIL: migrasi `audio::` → `pristine::`

**Keputusan (20 Agustus 2026): namespace akan disatukan jadi `pristine::` saja.**
`audio::` akan dihapus/dimigrasikan sepenuhnya.

**Scope migrasi** (dikonfirmasi via `grep -rln "namespace audio\b"`):
`devices/*`, `usb/*`, `fft/*`, `dsp/immersive/*`,
`dsp/convolution/WindowFunctions.cpp` — belasan file.

**URUTAN EKSEKUSI PENTING — jangan migrasi sekarang.** Migrasi namespace
dilakukan **PALING TERAKHIR**, setelah semua file di area
`dsp/immersive/`, `fft/`, `dsp/convolution/` sudah selesai diperbaiki compile
error-nya masing-masing (Fase 2/3 tuntas dulu). Alasan:
- Migrasi ini sendiri mekanikal (sed rename namespace) tapi butuh verifikasi
  manual: cek referensi eksplisit `audio::SomeType` di file `pristine::` lain,
  cek potensi name collision (`pristine::X` vs `audio::X` beda arti sama nama)
- Kalau dicampur dengan fix compile error yang masih berjalan, sulit
  membedakan "error karena rename namespace" vs "error karena memang belum
  diimplementasikan" — dua masalah bertumpuk, menyulitkan debug

**Checklist saat waktunya migrasi tiba:**
1. Pastikan semua file di scope sudah 0 error compile dulu (`scripts/check.sh`)
2. `grep -rn "audio::" android/app/src/main/cpp` untuk cari SEMUA qualified
   reference lintas file (bukan cuma `namespace audio {` declaration)
3. Cek collision nama antara `pristine::X` dan `audio::X` sebelum digabung
4. Rename `namespace audio {` → `namespace pristine {` per file
5. Hapus/ganti semua qualified `audio::` reference jadi `pristine::` (atau
   hapus qualifier kalau sudah dalam namespace yang sama)
6. `scripts/check.sh` ulang menyeluruh untuk pastikan tidak ada yang lolos

**`WindowFunctions::hann()`/`blackman()`** (method di class `WindowFunctions`,
`namespace pristine`, di header `dsp/convolution/WindowFunctions.h`)
**DIKONFIRMASI dead code** — tidak pernah dipanggil di manapun
(`grep "WindowFunctions::"` di seluruh project kosong total). Aman dihapus
kapan saja, bukan prioritas.

**Fix minimal untuk `createHanningWindow` (masih PENDING, menunggu keputusan
arsitektur di atas)**: fungsi-fungsi ini (`createHanningWindow`,
`createHammingWindow`, `createBlackmanWindow`, `createRectangularWindow`)
sudah lengkap diimplementasikan di `WindowFunctions.cpp` dalam
`namespace audio`, tapi **tidak pernah dideklarasikan di header manapun** —
makanya `FFTProcessor.cpp` (translation unit terpisah) tidak bisa melihatnya.
Solusi paling minimal: tambahkan deklarasi 4 fungsi itu ke
`WindowFunctions.h` (tetap `namespace audio`, konsisten dengan pemakaian
nyata saat ini), plus tambahkan `#include <vector>` yang hilang di
`WindowFunctions.cpp` (ini penyebab error `std::vector` not found yang
terpisah, di file yang sama).

**Fix ketiga bug include ini dulu, baru scan ulang file-file yang terpengaruh
untuk lihat error asli yang tersisa** — pola `StreamResampler` kemarin
menunjukkan banyak error "hilang" begitu include-nya benar.

### Bug nyata (bukan domino, dikonfirmasi lewat pola errornya)

- `decoder/AudioDecoder.cpp`, `PCMDecoder.cpp`: `DecodeStatus::Eof` →
  kemungkinan besar seharusnya `DecodeStatus::EndOfStream` (rename, sudah
  diduga sejak sesi sebelumnya)
- `PCMDecoder.cpp`: `AudioFormat::bitsPerSample` dan akses
  `AudioFormat::SampleFormat` — field/namespace salah, perlu cek struct
  `AudioFormat` lengkap di `DecoderTypes.h`
- **`dsp/EQProcessor.cpp` — SERIUS**: `redefinition of 'process'`, banyak
  `mismatched_exception_spec` (noexcept tidak cocok dengan `EQProcessor.h`).
  Sinyal kuat: file `.cpp` ini adalah **versi lama yang belum di-update**
  setelah header di-refactor. Kemungkinan perlu ditulis ulang total, bukan
  sekadar rename kecil. (Terpisah dari error `mBandEnabled`/`mBassEnabled`
  yang juga muncul di file yang sama.)
- **`dsp/OutputStage.cpp`**: `GainProcessor` (di `dsp/GainProcessor.h`) dan
  `Limiter` (di `dsp/Limiter.h`) — dua class **terpisah** dari `GainNode`/
  `LimiterNode` yang sudah kita perbaiki di `dsp/graph/` — benar-benar belum
  punya `prepare/reset/setGain/setChannelGain`. Pola sama seperti `DSPNode`
  kemarin, tapi ini hierarchy/class yang beda, perlu dikerjakan terpisah.
- **`playback/PlaybackManager.cpp`**: `setQueue` tidak cocok deklarasi, dan
  constructor `PlaybackScheduler` tidak cocok — **terkait langsung ke
  `PlaybackEventDispatcher` yang belum ada (lihat Fase 3)**. Tidak bisa
  diperbaiki independen sebelum keputusan desain Fase 3 diambil.
- **`profiling/LatencyProfiler.cpp`**: `LatencyProfiler` undeclared di file
  `.cpp` miliknya sendiri — aneh, perlu lihat isi file & headernya langsung.

### ⚠️ Anomali — perlu verifikasi ulang, jangan percaya begitu saja

`session/TransportControls.cpp` menunjukkan **0 error** di scan tanpa filter
ini — padahal sebelumnya dikonfirmasi `TransportResult`/`TransportCommand`/
`PlaybackEventDispatcher` tidak ada definisinya di manapun di project. Ini
tidak konsisten dengan temuan sebelumnya. Kemungkinan: cache clangd stale,
atau ada sesuatu yang berubah tanpa sadar. **Jalankan ulang
`clangd --check=session/TransportControls.cpp` sendirian (bukan dalam loop)
untuk konfirmasi sebelum mengambil kesimpulan apapun soal file ini.**

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).


########## Update 6  ###########

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 19-20 Agustus 2026. Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis),
baru commit & push ke CI setelah benar-benar matang. Tidak perlu terburu-buru push
tiap langkah kecil.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Sudah Selesai (siap push kapan saja, ditahan dulu)

File-file ini sudah diverifikasi bersih via `clangd --check`:

- `core/AudioEngine.cpp` + `.h`
- `core/AudioCallback.cpp` + `.h`
- `core/AudioPipeline.cpp` + `.h`
- `core/AudioModeManager.cpp`
- `core/AudioStreamController.cpp`
- `core/AudioBufferController.cpp`
- `core/AudioState.h` (tambahan `immersiveEnabled` flag)
- `core/AudioTypes.h` (tambahan field `processingMode` di `DSPParameters`)
- `playback/PlaybackScheduler.cpp` (fix parsial: `SchedulerState::PrebufferRequested`)
- `dsp/graph/DSPNode.h` (tambahan virtual `applyConfig(const DSPConfig&)`)
- `dsp/graph/DSPGraph.h` + `.cpp` (tambahan `applyConfig`, loop ke semua node)
- `dsp/tone/EQNode.h` + `.cpp` (override `applyConfig` → set band gain + bass boost)
- `dsp/tone/GainNode.h` + `.cpp` (override `applyConfig` → hitung gain L/R dari
  masterGain + balance)
- `dsp/dynamics/LimiterNode.h` + `.cpp` (override `applyConfig` → toggle enable)
- `dsp/spatial/StereoWidenerNode.h` + `.cpp` (override `applyConfig` → set width)
- `dsp/DSPChain.cpp` (tidak diubah — sudah benar dari awal, akar masalah ada
  di `DSPGraph`)
- `manager/EngineManager.cpp` (bersih otomatis setelah `AudioEngine` dilengkapi)
- `jni/NativeVisualizerModule.cpp` (bersih otomatis setelah visualizer path
  dibangun)

**Perubahan kunci yang sudah diterapkan:**
- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated
  (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` →
  `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` →
  `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`),
  supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare, karena sudah di dalam namespace)
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
  (muncul di 2 file: `AudioPipeline.cpp`, `AudioModeManager.cpp`)
- **Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode`**
  (base + 4 turunan) dan `DSPGraph`, supaya `DSPChain::applyConfig()` (yang
  sudah lebih dulu benar) punya implementasi nyata untuk dipanggil
- **Ditambahkan `AudioEngine::setImmersiveEnabled()`** — cuma set flag di
  `AudioState`, belum tersambung ke efek DSP nyata karena
  `AudioPipeline::processImmersive()` sendiri masih placeholder (lihat Fase 3)
- **Dibangun jalur visualizer baru dari nol**: `AudioCallback` sekarang punya
  member `VisualizerBuffer mVisualizer`, ditulis tiap callback
  (`mVisualizer.write(mLeft, mRight, numFrames)`), diexpose lewat
  `AudioCallback::visualizerBuffer()`, dipanggil dari
  `AudioEngine::getVisualizerData()`. Sebelumnya `VisualizerBuffer` sama sekali
  tidak dipakai di manapun selain file dirinya sendiri.

---

## ⚠️ FASE 1 — DIKOREKSI (klaim "selesai" sebelumnya tidak akurat)

**PENTING**: klaim "Fase 1 selesai sepenuhnya" di update sebelumnya **tidak
akurat**. Filter `scripts/check.sh` versi lama (`no_member|error:|undeclared`)
tidak menangkap banyak kategori error clangd lain (`unknown_typename`,
`pp_file_not_found`, `bound_member_function`, `typecheck_*`, dst), sehingga
beberapa file yang tadinya diklaim "0 error" ternyata masih broken.

**Filter script SUDAH DIPERBAIKI** (final, per 20 Agustus 2026) — sekarang
`scripts/check.sh` pakai `grep -E "^E\[" | grep -v "IncludeCleaner" | grep -v "    tweak:"`
yang menangkap SEMUA kategori error clangd asli, buang noise IncludeCleaner
(soal libavcodec/libavformat FFmpeg yang memang tidak terpasang) dan noise
tweak (ExtractFunction/ExpandDeducedType yang gagal karena struktur kode,
bukan bug). **Semua klaim "0 error" SEBELUM titik ini di riwayat sesi perlu
dianggap tidak terverifikasi — jalankan ulang `scripts/check.sh` dengan
filter baru untuk konfirmasi ulang, jangan percaya begitu saja.**

**Regresi ditemukan & diperbaiki** (efek samping dari filter lama yang buta):
- `core/AudioModeManager.cpp` — ternyata masih ada pola atomic API lama
  (`state.processingMode.store()` dkk) yang lolos dari fix migrasi
  sebelumnya. Sudah diperbaiki, dikonfirmasi 0 error dengan filter baru.
- `usb/USBClockSync.h` — kurang `#include <cstdint>`. Diperbaiki.
- `playback/PlaybackController.cpp`/`.h` — regresi dari patch `metrics_`
  sebelumnya: method publik `metrics()` dan `initialize()` masih pakai tipe
  lama `PlaybackMetrics` padahal member sudah diubah ke `MetricsCollector`.
  Diperbaiki (tapi file ini masih ada error `DecodedChunk` domino yang
  belum di-fix, lihat di bawah).

**Bug include baru ditemukan** (scope lebih besar dari perkiraan sebelumnya):
- `DecodedChunk` — ternyata dipakai di **8 file**, bukan 4:
  `decoder/AudioDecoder.cpp`, `PCMDecoder.cpp`, `DecoderWorker.cpp`,
  `DecoderFactory.cpp`, `playback/PlaybackController.cpp`,
  `PlaybackManager.cpp`, `PrebufferManager.cpp`, dan sumbernya sendiri
  `decoder/StreamResampler.h`. **BELUM DIPERBAIKI** — perlu cari definisi
  yang benar (kemungkinan seharusnya `DecodeResult`, sudah diduga sebelumnya
  tapi belum dikonfirmasi/dieksekusi).
- `playback/PlaybackScheduler.cpp` — `'TransportState.h' file not found`,
  bug include baru, pola sama seperti sebelumnya. **BELUM DIPERBAIKI.**



Semua hub inti sudah diperbaiki dan diverifikasi bersih:
- `dsp/graph/DSPGraph.h/.cpp`, `dsp/DSPChain.cpp` (lihat Fase 0)
- `manager/EngineManager.cpp`
- `jni/NativeVisualizerModule.cpp`
- `decoder/DecoderFactory.cpp`
- `decoder/StreamResampler.cpp` / `.h`
- `playback/PlaybackController.cpp` / `.h`

**Perubahan kunci:**
- **Bug include besar**: `decoder/StreamResampler.h` punya path salah
  (`../dsp/resampler/LinearResampler.h` → seharusnya `../resampler/LinearResampler.h`).
  Broken include ini menyebabkan efek domino — banyak error "unknown type"/
  "no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp`
  yang **bukan bug nyata**, cuma akibat parse gagal di tengah jalan.
  **Pelajaran**: selalu cek baris `pp_file_not_found` di output mentah clangd
  dulu sebelum percaya daftar error lain di file yang sama —
  `scripts/check.sh` saat ini tidak menangkap kategori ini (filter grep-nya
  cuma `no_member|error:|undeclared`). Perlu update filter script ke depannya.
- `playback/PlaybackController.h`: `metrics_` salah tipe — dideklarasikan
  `shared_ptr<PlaybackMetrics>` (struct data pasif, tanpa method) padahal
  seharusnya `shared_ptr<MetricsCollector>` (class dengan method
  `recordFrameRendered`, dll — keduanya didefinisikan di file yang sama,
  `PlaybackMetrics.h`)
- `PlaybackController.cpp::startDecoder()`: didesain ulang sesuai API
  `DecoderWorker` yang sebenarnya (callback-based via `setDecodeCallback(
  std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback`
  yang tidak pernah ada). `DecodeResult::samples` (vector<float>) ditulis
  langsung ke `pcmQueue_` dari dalam callback.
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::
  Playing/Paused)` (state pakai enum, bukan bool), `setTrack()`→
  `setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` ke `PlaybackController.cpp`
  (class-nya sudah ada dari awal, cuma belum di-include — bukan belum
  diimplementasikan)



**Langkah tiap file:**
1. `scripts/check.sh <file>` — lihat semua error
2. Baca header terkait (`.h` dari class yang dikomplain) untuk lihat API sebenarnya
3. Investigasi apakah method yang dipanggil memang belum diimplementasikan (perlu
   ditambahkan) atau cuma salah nama (perlu di-rename)
4. Fix, lalu `scripts/check.sh <file>` ulang sampai bersih

---

## 🟡 FASE 2 — Modul Sedang

**Hasil scan tanpa filter (clangd mentah) — peta akurat per 20 Agustus 2026:**

### Bug include baru ditemukan (root cause, domino effect — cek & fix DULU
### sebelum menilai file-file ini "banyak error")

1. **`DecodedChunk` unknown type** — muncul di 4 file: `decoder/AudioDecoder.cpp`,
   `decoder/PCMDecoder.cpp`, `decoder/DecoderWorker.cpp`,
   `playback/PlaybackManager.cpp`. Cari dulu di mana `DecodedChunk` seharusnya
   didefinisikan (`decoder/DecoderTypes.h`? atau file terpisah yang belum ada/
   salah include).
2. **`FFTTypes.h' file not found`** — ✅ **DIPERBAIKI**: dikonfirmasi typo nama
   file, `FFTPlan.h` include `"FFTTypes.h"` (2 huruf T) padahal file aslinya
   `FFTypes.h` (1 huruf T). Fix diterapkan. `FFTPlan.cpp` dan
   `SpectrumAnalyzer.cpp` langsung 0 error setelahnya (efek domino terbukti
   lagi). `FFTProcessor.cpp` tersisa 1 error asli: `createHanningWindow`
   undeclared — lihat catatan arsitektur `namespace audio` di bawah.
3. **`dsp/BiquadFilter.cpp`** — `int32_t` unknown type + `BiquadFilter` sendiri
   undeclared di file `.cpp`-nya sendiri → kemungkinan masalah include guard
   atau urutan include di `BiquadFilter.h`. Cek isi headernya.

### 🏛️ CATATAN ARSITEKTUR — KEPUTUSAN DIAMBIL: migrasi `audio::` → `pristine::`

**Keputusan (20 Agustus 2026): namespace akan disatukan jadi `pristine::` saja.**
`audio::` akan dihapus/dimigrasikan sepenuhnya.

**Scope migrasi** (dikonfirmasi via `grep -rln "namespace audio\b"`):
`devices/*`, `usb/*`, `fft/*`, `dsp/immersive/*`,
`dsp/convolution/WindowFunctions.cpp` — belasan file.

**URUTAN EKSEKUSI PENTING — jangan migrasi sekarang.** Migrasi namespace
dilakukan **PALING TERAKHIR**, setelah semua file di area
`dsp/immersive/`, `fft/`, `dsp/convolution/` sudah selesai diperbaiki compile
error-nya masing-masing (Fase 2/3 tuntas dulu). Alasan:
- Migrasi ini sendiri mekanikal (sed rename namespace) tapi butuh verifikasi
  manual: cek referensi eksplisit `audio::SomeType` di file `pristine::` lain,
  cek potensi name collision (`pristine::X` vs `audio::X` beda arti sama nama)
- Kalau dicampur dengan fix compile error yang masih berjalan, sulit
  membedakan "error karena rename namespace" vs "error karena memang belum
  diimplementasikan" — dua masalah bertumpuk, menyulitkan debug

**Checklist saat waktunya migrasi tiba:**
1. Pastikan semua file di scope sudah 0 error compile dulu (`scripts/check.sh`)
2. `grep -rn "audio::" android/app/src/main/cpp` untuk cari SEMUA qualified
   reference lintas file (bukan cuma `namespace audio {` declaration)
3. Cek collision nama antara `pristine::X` dan `audio::X` sebelum digabung
4. Rename `namespace audio {` → `namespace pristine {` per file
5. Hapus/ganti semua qualified `audio::` reference jadi `pristine::` (atau
   hapus qualifier kalau sudah dalam namespace yang sama)
6. `scripts/check.sh` ulang menyeluruh untuk pastikan tidak ada yang lolos

**`WindowFunctions::hann()`/`blackman()`** (method di class `WindowFunctions`,
`namespace pristine`, di header `dsp/convolution/WindowFunctions.h`)
**DIKONFIRMASI dead code** — tidak pernah dipanggil di manapun
(`grep "WindowFunctions::"` di seluruh project kosong total). Aman dihapus
kapan saja, bukan prioritas.

**Fix minimal untuk `createHanningWindow` (masih PENDING, menunggu keputusan
arsitektur di atas)**: fungsi-fungsi ini (`createHanningWindow`,
`createHammingWindow`, `createBlackmanWindow`, `createRectangularWindow`)
sudah lengkap diimplementasikan di `WindowFunctions.cpp` dalam
`namespace audio`, tapi **tidak pernah dideklarasikan di header manapun** —
makanya `FFTProcessor.cpp` (translation unit terpisah) tidak bisa melihatnya.
Solusi paling minimal: tambahkan deklarasi 4 fungsi itu ke
`WindowFunctions.h` (tetap `namespace audio`, konsisten dengan pemakaian
nyata saat ini), plus tambahkan `#include <vector>` yang hilang di
`WindowFunctions.cpp` (ini penyebab error `std::vector` not found yang
terpisah, di file yang sama).

**Fix ketiga bug include ini dulu, baru scan ulang file-file yang terpengaruh
untuk lihat error asli yang tersisa** — pola `StreamResampler` kemarin
menunjukkan banyak error "hilang" begitu include-nya benar.

### Bug nyata (bukan domino, dikonfirmasi lewat pola errornya)

- `decoder/AudioDecoder.cpp`, `PCMDecoder.cpp`: `DecodeStatus::Eof` →
  kemungkinan besar seharusnya `DecodeStatus::EndOfStream` (rename, sudah
  diduga sejak sesi sebelumnya)
- `PCMDecoder.cpp`: `AudioFormat::bitsPerSample` dan akses
  `AudioFormat::SampleFormat` — field/namespace salah, perlu cek struct
  `AudioFormat` lengkap di `DecoderTypes.h`
- **`dsp/EQProcessor.cpp` — SERIUS**: `redefinition of 'process'`, banyak
  `mismatched_exception_spec` (noexcept tidak cocok dengan `EQProcessor.h`).
  Sinyal kuat: file `.cpp` ini adalah **versi lama yang belum di-update**
  setelah header di-refactor. Kemungkinan perlu ditulis ulang total, bukan
  sekadar rename kecil. (Terpisah dari error `mBandEnabled`/`mBassEnabled`
  yang juga muncul di file yang sama.)
- **`dsp/OutputStage.cpp`**: `GainProcessor` (di `dsp/GainProcessor.h`) dan
  `Limiter` (di `dsp/Limiter.h`) — dua class **terpisah** dari `GainNode`/
  `LimiterNode` yang sudah kita perbaiki di `dsp/graph/` — benar-benar belum
  punya `prepare/reset/setGain/setChannelGain`. Pola sama seperti `DSPNode`
  kemarin, tapi ini hierarchy/class yang beda, perlu dikerjakan terpisah.
- **`playback/PlaybackManager.cpp`**: `setQueue` tidak cocok deklarasi, dan
  constructor `PlaybackScheduler` tidak cocok — **terkait langsung ke
  `PlaybackEventDispatcher` yang belum ada (lihat Fase 3)**. Tidak bisa
  diperbaiki independen sebelum keputusan desain Fase 3 diambil.
- **`profiling/LatencyProfiler.cpp`**: `LatencyProfiler` undeclared di file
  `.cpp` miliknya sendiri — aneh, perlu lihat isi file & headernya langsung.

### ⚠️ Anomali — perlu verifikasi ulang, jangan percaya begitu saja

`session/TransportControls.cpp` menunjukkan **0 error** di scan tanpa filter
ini — padahal sebelumnya dikonfirmasi `TransportResult`/`TransportCommand`/
`PlaybackEventDispatcher` tidak ada definisinya di manapun di project. Ini
tidak konsisten dengan temuan sebelumnya. Kemungkinan: cache clangd stale,
atau ada sesuatu yang berubah tanpa sadar. **Jalankan ulang
`clangd --check=session/TransportControls.cpp` sendirian (bukan dalam loop)
untuk konfirmasi sebelum mengambil kesimpulan apapun soal file ini.**

---

## 🟢 FASE 3 — Modul Boilerplate (kemungkinan besar leaf, tapi WAJIB dikonfirmasi
## dulu sebelum exclude — pola hari ini menunjukkan "leaf" seringkali ternyata
## dipakai di tempat tak terduga)

- `dsp/BiquadFilter.cpp`
- `dsp/EQProcessor.cpp`
- `dsp/OutputStage.cpp`
- `dsp/convolution/WindowFunctions.cpp` (fix cepat: kemungkinan cuma kurang
  `#include <vector>`)
- `fft/FFTPlan.cpp`
- `fft/FFTProcessor.cpp` (fix cepat: kemungkinan kurang `#include <type_traits>`)
- `fft/SpectrumAnalyzer.cpp` (sama seperti di atas)
- `modes/ImmersivePipeline.cpp` — bergantung ke `BrainwaveGenerator`,
  `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` yang semua
  belum punya `prepare()`/`process()`
- `profiling/LatencyProfiler.cpp`

**Class/tipe besar yang belum diimplementasikan sama sekali** (DIKONFIRMASI via
grep menyeluruh ke seluruh `cpp/` — hanya ditemukan pemakaian, nol definisi):
- `TransportResult` (enum) — dipakai luas di `TransportControls.h/.cpp`
  (return type semua command play/pause/stop/seek/next/previous, promise value)
- `TransportCommand` (tipe, kemungkinan enum) — undeclared di
  `TransportControls.h:114`. Belum digrep detail, cek di awal fase ini.
- `PlaybackEventDispatcher` (class) — dipakai di `PlaybackScheduler.h/.cpp`,
  `PlaybackManager.h/.cpp`

Modul `session/TransportControls`, `playback/PlaybackScheduler`,
`playback/PlaybackManager` sekarang lebih jelas statusnya: **memang belum
selesai ditulis**, bukan sekadar bug rename. Ini butuh keputusan desain
(apa saja value `TransportResult`/`TransportCommand`, bagaimana bentuk event
di `PlaybackEventDispatcher`) — didiskusikan saat masuk fase ini, bukan ditebak.

---

## Catatan proses

- **Jangan** commit/push ke CI sampai minimal Fase 1 selesai — CI hanya berguna
  untuk validasi linking akhir, bukan untuk menemukan compile error yang sudah
  bisa ditemukan lokal via `clangd`.
- Tiap kali menambah file `.cpp` baru, jalankan ulang:
  ```bash
  python scripts/generatecompile.py
  ```
- Kalau ragu apakah suatu file aman di-exclude sementara dari `CMakeLists.txt`,
  selalu cek dependency-nya dulu dengan `grep -rln "NamaClass\b" ...` — jangan
  asumsi "kelihatannya boilerplate" tanpa verifikasi, karena pengalaman hari ini
  menunjukkan hub-hub tak terduga (mis. `EngineManager`, `DSPChain`).



############ Update 7 ############


# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 20-21 Agustus 2026 (Update 7). Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis), baru commit & push ke CI setelah benar-benar matang.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Selesai (tidak berubah dari update sebelumnya)

Lihat Update 6 untuk daftar lengkap. Tidak ada perubahan sesi ini.

---

## ✅ FASE 1 — SELESAI (dikonfirmasi ulang dengan filter script yang sudah diperbaiki)

Semua item Fase 1 (DSPGraph, EngineManager, NativeVisualizerModule, DecoderFactory lama, StreamResampler, PlaybackController) tetap bersih. Regresi `AudioModeManager.cpp`/`USBClockSync.h`/`PlaybackController` yang ditemukan di Update 6 sudah diperbaiki sebelumnya — tidak ada temuan baru di area ini sesi ini.

---

## 🟡 FASE 2 — Progres besar sesi ini (20-21 Agustus 2026)

### ✅ SELESAI sesi ini:

**1. `DecodedChunk` domino — DIKONFIRMASI PALSU, hanya scope kecil**

Klaim planning lama "8 file kena" **tidak akurat** (stale cache, sama pola seperti insiden `TransportControls.cpp` sebelumnya). Scan ulang menunjukkan `DecodedChunk` hanya dipakai di `StreamResampler.h`/`.cpp` (1 tempat pemakaian). Root cause sebenarnya: struct `PCMView`/`DecodedChunk` memang **sudah ada** di `decoder/DecoderTypes.h` (di dalam `namespace pristine::decoder`), tapi `StreamResampler` berada di `namespace pristine` (level luar) sehingga butuh qualifier `decoder::DecodedChunk` — bukan struct yang belum pernah didefinisikan. Fix: tambah qualifier `decoder::` di kedua file.

**Pelajaran**: sempat salah 1x menambahkan struct baru yang ternyata duplikat — selalu grep definisi existing dulu sebelum menyimpulkan "belum ada".

**2. `decoder/DecoderWorker.cpp` — DITULIS ULANG TOTAL**

File `.cpp` lama ditulis melawan API header yang sudah lama berubah:

| Dipakai di `.cpp` lama | Yang ada di header |
|---|---|
| `IDecoder` | `AudioDecoder` |
| `ChunkCallback` | `DecodeCallback` |
| `shouldStop_` | `stopRequested_` |
| `cv_` | `pauseCv_` |
| `chunkCb_`/`errorCb_`/`eofCb_` | `decodeCallback_`/`errorCallback_`/`eofCallback_` |
| `notifyError(...)` | (tidak dideklarasikan di header) |
| `getCurrentPosition()` | `getPositionSeconds()` |

Ditulis ulang mengikuti header asli, termasuk menambahkan implementasi `isRunning()`/`isPaused()` yang dideklarasikan di header tapi tidak pernah diimplementasikan (potential linker error yang tidak kena clangd single-file check).

✅ 0 error.

**3. `decoder/AudioDecoder.cpp` — 3 fix**

- Designated initializer `{.status = ..., .errorMessage = ...}` gagal karena `DecodeResult` sekarang move-only (copy ctor `= delete`) sehingga bukan aggregate lagi → diganti jadi assignment field eksplisit.
- `DecodeStatus::Eof` → `DecodeStatus::EndOfStream` (dugaan lama terkonfirmasi).
- `applyResampling()` ditulis ulang total mengikuti API baru `StreamResampler::process(const DecodedChunk&, DecodedChunk&)` (sebelumnya masih pakai signature lama 3-argumen `(samples, inputFormat, outputFormat)`). Ditulis defensif — build `std::vector<float>` baru dari hasil, bukan assign langsung ke buffer yang berpotensi alias dengan memory asal.

✅ 0 error.

**4. `decoder/PCMDecoder.cpp` — beberapa fix**

- `DecodeStatus::Eof` → `EndOfStream`.
- `AudioFormat::bitsPerSample` — field ini **tidak ada** di struct `AudioFormat` (cuma method `bytesPerSample()` turunan dari enum `sampleFormat`). Ditambahkan member privat baru `bitsPerSample_` di `PCMDecoder` untuk menyimpan raw value dari WAV header.
- `AudioFormat::SampleFormat::*` → `SampleFormat::*` (enum top-level di `namespace pristine::decoder`, bukan nested di `AudioFormat`).
- **Ketemu masalah desain lebih dalam**: `PCMDecoder` mendeklarasikan `onGetCapabilities()`/`onGetDuration()` dengan `override`, padahal base class `AudioDecoder` tidak punya virtual dengan nama itu — base sebenarnya punya 5 pure virtual **publik**: `isSeekable()`, `getCapabilities()`, `getPositionSeconds()`, `getPositionFrames()`, `getDurationSeconds()`. `PCMDecoder` sebelumnya **tidak pernah** meng-override kelimanya, sehingga jadi abstract class (tidak bisa di-`new`). Fix: rename `onGetCapabilities→getCapabilities`, `onGetDuration→getDurationSeconds`, tambah implementasi baru untuk `isSeekable()` (selalu `true` untuk WAV/PCM), `getPositionSeconds()`, `getPositionFrames()` (diturunkan dari `currentFrame_`/`format_.sampleRate`).

✅ 0 error.

**5. `decoder/DecoderFactory.cpp` — constructor mismatch**

`FFmpegDecoder` dan `PCMDecoder` sebelumnya hanya punya constructor default (tanpa argumen), padahal dipanggil dengan `(config)` dan base class `AudioDecoder` didesain menerima `DecodeConfig`. Ditambahkan constructor forwarding:

```cpp
explicit XxxDecoder(const DecodeConfig& config = {}) : AudioDecoder(config) {}
```

ke keduanya. Juga fix `AudioFormat::SampleFormat` → `SampleFormat` di `FFmpegDecoder.h`/`.cpp` (pola sama seperti di `PCMDecoder.cpp`).

**Hasil akhir:** `DecoderFactory.cpp` dan `PCMDecoder.cpp` 0 error. `FFmpegDecoder.cpp` bersih dari sisi kode tapi tidak bisa diverifikasi 100% lokal — lihat catatan limitation di bawah.

### ⚠️ Limitation lingkungan (bukan bug kode)

`FFmpegDecoder.cpp` gagal di-check dengan error `'libavformat/avformat.h' file not found` — FFmpeg headers memang belum terpasang di Termux lokal. Ini beda kategori dari bug include biasa (root-cause domino) — file ini kemungkinan besar akan compile normal di CI yang sudah link FFmpeg. Semua fix kode (`SampleFormat` prefix, constructor forwarding) sudah diterapkan dan sudah benar secara sintaks berdasarkan review manual.

### Sanity-check regresi

Setelah tiap fix besar, `decoder/AudioDecoder.cpp`, `DecoderWorker.cpp`, `PCMDecoder.cpp`, `StreamResampler.cpp` di-scan ulang bersama — semua tetap 0 error, tidak ada regresi silang.

### 🔴 Belum disentuh sesi ini (masih dari Update 5/6):

- **`dsp/BiquadFilter.cpp`** — `int32_t` unknown + class sendiri undeclared di file `.cpp`-nya sendiri, dugaan masalah include guard/urutan include di header.
- **`dsp/EQProcessor.cpp`** — SERIUS, `redefinition of 'process'` + banyak `mismatched_exception_spec`, dugaan kuat versi lama yang belum di-update setelah header refactor.
- **`dsp/OutputStage.cpp`** — `GainProcessor`/`Limiter` (class terpisah dari `GainNode`/`LimiterNode` yang sudah dibenerin di Fase 0) belum punya `prepare/reset/setGain/setChannelGain`.
- **`playback/PlaybackManager.cpp`** — blocked oleh `PlaybackEventDispatcher` yang belum ada (keputusan desain Fase 3).
- **`playback/PlaybackScheduler.cpp`** — `'TransportState.h' file not found`, bug include baru, belum diinvestigasi.
- **`profiling/LatencyProfiler.cpp`** — `LatencyProfiler` undeclared di file `.cpp` miliknya sendiri, belum diinvestigasi.
- **`fft/FFTProcessor.cpp`** — sisa 1 error asli `createHanningWindow` undeclared, fix-nya jelas (tambah deklarasi ke `WindowFunctions.h`) tapi ditunda sampai keputusan migrasi namespace `audio::`→`pristine::` (lihat catatan arsitektur di Update 5).
- **`session/TransportControls.cpp`** — anomali "0 error" yang belum diverifikasi ulang sendirian, masih perlu `clangd --check` terisolasi untuk konfirmasi.

### 🏛️ Catatan arsitektur (belum berubah dari Update 5)

Migrasi namespace `audio::`→`pristine::` tetap ditunda ke paling akhir, setelah semua Fase 2/3 tuntas.

---

## 🟢 FASE 3 — Tidak berubah dari Update 5/6

`TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` masih belum diimplementasikan — butuh keputusan desain sebelum dikerjakan.

---

## Catatan proses (update)

- **Pola baru dikonfirmasi berulang kali sesi ini**: klaim "N file kena" dari planning lama sering meleset jauh (kasus `DecodedChunk`: klaim 8 file → aktual 1 file). Selalu jalankan grep scope ulang sebelum percaya angka dari sesi sebelumnya.
- **Pola baru**: ketika error `no_member`/`unknown_type` muncul di file `.cpp`, cek dulu apakah struct/method yang dikomplain **sudah ada di namespace lain** (butuh qualifier) sebelum menyimpulkan "belum diimplementasikan". Kasus `DecodedChunk` dan sebelumnya sudah dua kali menjebak dengan pola ini.
- **Pola baru**: ketika class dilaporkan "abstract, tidak bisa di-`new`", cek daftar pure virtual **publik** di base class (bukan cuma yang `protected`/pola `onXxx()`) — kasus `PCMDecoder` ternyata implement nama method yang salah sama sekali, bukan sekadar rename kecil.
- Constructor mismatch (`FFmpegDecoder`/`PCMDecoder` vs base `AudioDecoder(config)`) adalah kategori error baru yang belum tercatat di filter kategori sebelumnya — perlu diwaspadai di file lain juga.


############ Update 8 #############

# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 21 Agustus 2026 (Update 8). Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis), baru commit & push ke CI setelah benar-benar matang.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Selesai (tidak berubah)

Lihat Update 6 untuk daftar lengkap.

---

## ✅ FASE 1 — SELESAI (tidak berubah)

Lihat Update 6/7. Regresi `AudioModeManager.cpp`/`USBClockSync.h`/`PlaybackController` sudah diperbaiki sebelumnya.

---

## 🟡 FASE 2 — Progres besar, dua root-cause fix selesai sesi ini

### ✅ Item dari Update 7 (decoder):
- `DecodedChunk` domino — beres (qualifier `decoder::`)
- `decoder/DecoderWorker.cpp` — ditulis ulang total
- `decoder/AudioDecoder.cpp` — 3 fix (designated-init, `Eof`→`EndOfStream`, `applyResampling` rewrite)
- `decoder/PCMDecoder.cpp` — `bitsPerSample_`, `SampleFormat` prefix, 5 pure-virtual override yang benar
- `decoder/DecoderFactory.cpp` — constructor forwarding + `SampleFormat` prefix

### ✅ BARU sesi ini — Root cause #1: `dsp/BiquadFilter.h` salah isi total

**Temuan**: `dsp/BiquadFilter.h` ternyata berisi copy/paste lama dari class `EQProcessor` (versi outdated, tanpa `mBandEnabled`/`mBassEnabled`), bukan definisi `BiquadFilter`. File ini bahkan self-include dirinya sendiri (`#include "BiquadFilter.h"` di dalam `BiquadFilter.h`). Class `BiquadFilter` yang sebenarnya **tidak pernah dideklarasikan** di manapun — sehingga `EQProcessor.h` yang asli (sudah benar & lengkap) gagal resolve `BiquadFilter mLeft[kBands]` dkk.

**Fix**: `BiquadFilter.h` ditulis ulang total dari nol berdasarkan interface yang benar-benar dipanggil dari `EQProcessor.cpp`:
- `setCoefficients()`, `getCoefficients()`, `setPeakingEQ()`, `setLowShelf()` — sudah ada implementasinya di `BiquadFilter.cpp` (RBJ Audio EQ Cookbook), tinggal dideklarasikan
- `process(float) -> float` dan `reset()` — **belum pernah diimplementasikan di manapun**, ditulis baru inline di header sebagai Direct Form II Transposed biquad (state `z1`/`z2`), konsisten dengan koefisien yang sudah dinormalisasi `a0=1` di `.cpp`

**Dampak domino** — 4 file langsung bersih otomatis setelah fix header:
- ✅ `dsp/BiquadFilter.cpp`
- ✅ `dsp/EQProcessor.cpp`
- ✅ `dsp/DSPChain.cpp`
- ✅ `dsp/tone/EQNode.cpp`

**Fix terpisah (bukan bagian domino, ketemu di scan yang sama)**:
- ✅ `dsp/headphone/CrossfeedProcessor.cpp` — `CrossfeedProcessor.h` kurang `#include <cstdint>` untuk `int32_t`, quick fix.

### ✅ BARU sesi ini — Root cause #2: `PlaybackController` unqualified (6 file, termasuk 1 regresi)

**Temuan**: `PlaybackController` di-declare di `namespace pristine::playback`, tapi `manager/EngineManager.h`/`.cpp` (dan turunannya, semua JNI files) pakai `PlaybackController` tanpa qualifier `playback::`. Pola identik dengan kasus `DecodedChunk` sebelumnya.

**PENTING — regresi ditemukan**: `manager/EngineManager.cpp` yang sebelumnya diklaim "0 error" di Fase 1 ternyata sekarang error lagi. Saat diperbaiki, ketemu **tiga masalah bertumpuk sekaligus** di file yang sama:

1. **Qualifier `PlaybackController`** — fix di `EngineManager.h` (`playback::PlaybackController&` untuk getter, `playback::PlaybackController mPlayback` untuk member) dan `EngineManager.cpp` (return type getter).

2. **Regresi atomic API (pola sama seperti `AudioModeManager.cpp` di Update 6)** — `EngineManager.cpp` masih memanggil `mState.exclusiveMode.load(...)`/`mState.processingMode.store(...)` gaya atomic mentah, padahal `AudioState` (tipe `mState`) sudah dimigrasi ke method encapsulated di Fase 0. Fix: `mState.exclusiveMode()` / `mState.setProcessingMode(mode)` / `mState.setExclusiveMode(enabled)`.

3. **Constructor mismatch desain** — constructor `EngineManager()` memanggil `mPlayback(mEngine)`, mengasumsikan `PlaybackController` menerima `AudioEngine&` di constructor-nya. Ternyata `PlaybackController` didesain **self-contained** (state/clock/decoder worker semua internal, `render()` dipanggil dari luar dengan buffer mentah) dan cuma punya constructor default. Fix: hapus argumen, `mPlayback()`.

**Dampak domino JNI** — setelah `EngineManager.h`/`.cpp` bersih, 4 dari 5 file JNI langsung bersih otomatis:
- ✅ `jni/NativePristineAudio.cpp`
- ✅ `jni/NativeDSPModule.cpp`
- ✅ `jni/NativeVisualizerModule.cpp`
- ✅ `jni/NativeAudioFeed.cpp`

**Sisa 1 file butuh fix tambahan — `jni/NativePlaybackModule.cpp`**:
Selain qualifier (`pristine::PlaybackController*` → `pristine::playback::PlaybackController*`, di 2 tempat: variabel global dan parameter `initPlaybackModule()`), file ini juga manggil method yang tidak pernah ada:
- `seekTo(uint64_t ms)` → tidak ada; `PlaybackController` cuma punya `seek(double seconds)` → fix dengan konversi `positionMs / 1000.0`
- `getState().getPositionMs(48000)` → `getState()` tidak ada (method yang benar adalah `state()` return `shared_ptr<PlaybackState>`); `getPositionMs(int)` juga tidak ada — posisi didapat dari `state()->getPosition().positionMs` (`PlaybackPosition::positionMs` sudah dalam satuan ms langsung, tidak butuh sample rate)
- `getState().getStatus()` → `state()->getStatus()`

**Catatan tambahan**: `initPlaybackModule()` dicek — ternyata **tidak dipanggil dari file manapun** di seluruh project. Bukan compile error (jadi tidak kena `scripts/check.sh`), tapi kemungkinan gap wiring: `gPlaybackController` global di `NativePlaybackModule.cpp` tidak pernah di-set dari inisialisasi engine manapun. Perlu diperiksa saat masuk tahap wiring JNI end-to-end (belum prioritas sekarang).

### Sanity-check regresi (16 file di-scan bersama)

```
manager/EngineManager.cpp, jni/NativePristineAudio.cpp, jni/NativeDSPModule.cpp,
jni/NativeVisualizerModule.cpp, jni/NativeAudioFeed.cpp, jni/NativePlaybackModule.cpp,
dsp/BiquadFilter.cpp, dsp/EQProcessor.cpp, dsp/DSPChain.cpp, dsp/tone/EQNode.cpp,
dsp/headphone/CrossfeedProcessor.cpp, decoder/AudioDecoder.cpp, decoder/DecoderWorker.cpp,
decoder/PCMDecoder.cpp, decoder/DecoderFactory.cpp, decoder/StreamResampler.cpp
```
✅ Semua bersih, tidak ada regresi silang.

### ⚠️ Limitation lingkungan (bukan bug kode, tidak berubah)

`decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ada di Termux lokal.

### 🔴 Belum disentuh (urutan prioritas, dari scan penuh terakhir):

- `resampler/AudioResampler.cpp`/`SincResampler.cpp` — `LinearResampler` butuh qualifier `dsp::` (dugaan, belum diverifikasi)
- `dsp/convolution/WindowFunctions.cpp` — `std::vector` unknown, kemungkinan cuma kurang `#include <vector>` (diduga sejak Update 5, belum dieksekusi)
- `modes/BitPerfectPipeline.cpp`, `DSPPipeline.cpp`, `ImmersivePipeline.cpp` — `override` keyword error, dugaan pola sama seperti `PCMDecoder` (base class pure virtual mismatch), belum diinvestigasi detail
- `dsp/OutputStage.cpp` — `GainProcessor`/`Limiter` belum punya `prepare/reset/setGain/setChannelGain` (real unimplemented, dari Update 5/6)
- `fft/SpectrumVisualizer.cpp`/`WaveformVisualizer.cpp` — `definition_of_implicitly_declared_member` (destructor issue), belum diinvestigasi
- `profiling/LatencyProfiler.cpp` — undeclared identifier di file `.cpp` sendiri, belum diinvestigasi (kemungkinan pola broken-header sama seperti `BiquadFilter.h`/`StreamResampler.h`)
- `playback/PlaybackManager.cpp`/`PlaybackScheduler.cpp` — `TransportState.h` missing; `PlaybackManager.cpp` juga ada `setQueue` mismatch dan constructor `PlaybackScheduler` — blocked oleh keputusan desain `PlaybackEventDispatcher` (Fase 3)
- `fft/FFTProcessor.cpp` — sisa 1 error `createHanningWindow` undeclared, fix jelas tapi ditunda sampai migrasi namespace `audio::`→`pristine::`
- **JNI sisanya**: `jni/JSIInstaller.cpp` (`jsi/jsi.h` not found — kemungkinan **limitation lingkungan**, header React Native JSI belum lengkap di Termux, bukan bug kode); `jni/NativeDeviceModule.cpp` (`JNIEXPORT`/`JNICALL` unknown — kemungkinan kurang `#include <jni.h>`, belum diverifikasi)
- `session/TransportControls.cpp` — anomali "0 error" dari Update 5/6, belum diverifikasi ulang sendirian

### 🏛️ Catatan arsitektur (tidak berubah dari Update 5)

Migrasi namespace `audio::`→`pristine::` tetap ditunda ke paling akhir, setelah semua Fase 2/3 tuntas.

---

## 🟢 FASE 3 — Tidak berubah

`TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` masih belum diimplementasikan — butuh keputusan desain sebelum dikerjakan.

---

## Catatan proses (update)

- **Pola "file salah isi total" muncul lagi** (setelah `StreamResampler.h`/`FFTypes.h` sebelumnya) — kasus `BiquadFilter.h` ini lebih parah: bukan cuma typo path, tapi isi filenya sepenuhnya salah (copy dari class lain + self-include). Root-cause fix di 1 header meng-clear 4 file `.cpp` sekaligus — pola broken-header/domino tetap jadi prioritas investigasi pertama saat banyak file di area yang sama error bersamaan.
- **Pola regresi bertumpuk**: `EngineManager.cpp` yang "sudah bersih" ternyata menyimpan 3 masalah berbeda sekaligus (qualifier, atomic API lama, constructor mismatch desain) yang baru kelihatan satu-satu setelah masalah di depannya diperbaiki. Jangan asumsikan file yang tadinya "0 error" itu benar-benar tuntas — verifikasi ulang tiap kali ada perubahan struktural di file yang di-include-nya.
- **Constructor mismatch** (ditemukan lagi, kali ini soal desain "siapa memegang siapa" bukan cuma soal parameter yang salah) — pola: sebelum menambah parameter constructor untuk "memperbaiki" mismatch, cek dulu apakah desain class yang dituju memang dimaksudkan menerima dependency itu, atau cuma asumsi lama di call site yang sudah usang.
- `initPlaybackModule()` yang tidak pernah dipanggil adalah temuan silent gap (bukan compile error) — perlu daftar terpisah untuk item wiring/integrasi yang tidak akan ketahuan lewat `clangd` saja.


########### Update 9 ############


# Rencana Kerja — Perbaikan Build `pristine-audio`

Status per 21 Agustus 2026 (Update 9). Strategi: perbaiki via `clangd` lokal dulu (cepat, gratis), baru commit & push ke CI setelah benar-benar matang.

**Cara verifikasi di tiap langkah:**
```bash
scripts/check.sh <path/file.cpp>       # cek satu/beberapa file
scripts/check.sh                        # cek semua file (skip oboe/)
```

---

## ✅ FASE 0 — Selesai (tidak berubah)

Lihat Update 6 untuk daftar lengkap.

---

## ✅ FASE 1 — SELESAI (tidak berubah)

Lihat Update 6/7.

---

## 🟡 FASE 2 — Progres berlanjut

### ✅ Item dari Update 7 (decoder):
- `DecodedChunk` domino, `decoder/DecoderWorker.cpp`, `decoder/AudioDecoder.cpp`, `decoder/PCMDecoder.cpp`, `decoder/DecoderFactory.cpp` — lihat Update 7/8 untuk detail.

### ✅ Item dari Update 8 (root-cause fixes besar):
- `dsp/BiquadFilter.h` (root cause, file salah isi total) + 4 file turunan + `CrossfeedProcessor.cpp` — lihat Update 8 untuk detail.
- `PlaybackController` qualifier (6 file, termasuk regresi `EngineManager.cpp` dengan 3 masalah bertumpuk: qualifier, atomic API lama, constructor mismatch desain) — lihat Update 8 untuk detail.

### ✅ BARU sesi ini:

**1. `dsp/convolution/WindowFunctions.cpp` — quick fix terkonfirmasi**

Sesuai dugaan Update 5: cuma kurang `#include <vector>` (dipakai `std::vector<float>` di 4 fungsi window, tapi cuma include `<cmath>`/`<algorithm>`). Fix satu baris, langsung bersih.

Catatan: fungsi `createHanningWindow`/`createHammingWindow`/`createBlackmanWindow`/`createRectangularWindow` di file ini masih berada di `namespace audio` (belum ikut migrasi ke `pristine`), dan `FFTProcessor.cpp` masih belum bisa melihatnya (beda translation unit, belum pernah dideklarasikan di header). Ini **sengaja tidak disentuh** — tetap ditunda sampai keputusan migrasi namespace `audio::`→`pristine::` (lihat catatan arsitektur).

**2. `resampler/AudioResampler.cpp` — masalah desain nyata, bukan sekadar qualifier**

**Temuan**: `dsp::LinearResampler` (dipakai `StreamResampler` di decoder, Fase 1) adalah class standalone/non-polymorphic — tidak ada `virtual`, signature `configure()` berbeda (3× `int32_t` langsung, bukan struct `ResampleSpec`), tidak ada `getDelayInFrames()`. Tapi `AudioResampler.cpp` punya factory `createResampler()` yang butuh object polymorphic turunan abstract class `AudioResampler` (untuk mendukung `unique_ptr<AudioResampler>` dengan beberapa backend: LINEAR/SINC_FAST/SINC_MEDIUM/SINC_BEST). `dsp::LinearResampler` secara langsung **tidak bisa** dipakai di sini — bukan cuma soal namespace, tapi genuinely tidak inherit dari base yang tepat.

**Fix**: dibuat class adapter baru `LinearResamplerAdapter` (anonymous namespace, lokal di `AudioResampler.cpp`) yang meng-wrap `dsp::LinearResampler` dan mengimplementasikan interface `AudioResampler` (`configure(const ResampleSpec&)`, `process(...)`, `reset()`, `getDelayInFrames()` → return `0`, karena interpolasi linear tidak punya lookahead buffer). Pendekatan ini sengaja **tidak mengubah** desain `dsp::LinearResampler` asli, supaya `StreamResampler` (yang sudah diverifikasi bekerja di Fase 1) tidak terganggu.

**3. `resampler/SincResampler.cpp` — 2 fix**

- Stub fallback di `process()` (baris ~82-84) memanggil `LinearResampler` sebagai fallback sederhana, tapi:
  - Tidak pernah `#include "LinearResampler.h"` sama sekali (root cause utama, ketahuan lewat error `undeclared identifier 'dsp'` setelah fix qualifier pertama gagal karena namespace belum diperkenalkan ke translation unit).
  - Qualifier `dsp::` hilang.
  - `configure()` dipanggil dengan brace-init 4-field mengikuti struct `ResampleSpec`, padahal `dsp::LinearResampler::configure()` menerima 3× `int32_t` langsung (bukan struct).
- Fix: tambah `#include "LinearResampler.h"`, qualifikasi `dsp::LinearResampler linear;`, ubah pemanggilan `configure()` jadi 3 argumen terpisah.

### Sanity-check regresi (3 file resampler)

```
resampler/AudioResampler.cpp, resampler/SincResampler.cpp, resampler/LinearResampler.cpp
```
✅ Semua bersih, tidak ada regresi silang.

### Sanity-check menyeluruh sesi sebelumnya (16 file, dari Update 8)
✅ Masih bersih, tidak diulang di sesi ini.

### ⚠️ Limitation lingkungan (bukan bug kode, tidak berubah)

`decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ada di Termux lokal.

### 🕳️ Silent wiring gaps (bukan compile error, tidak kena `clangd` — dicatat terpisah)

Ditemukan 2 fungsi yang sudah diimplementasikan lengkap tapi **tidak pernah dipanggil dari manapun** di seluruh project:
- `initPlaybackModule(pristine::playback::PlaybackController*)` di `jni/NativePlaybackModule.cpp` — `gPlaybackController` global tidak pernah di-set.
- `createResampler(ResamplerType)` di `resampler/AudioResampler.cpp` — tidak dideklarasikan di header manapun, tidak dipanggil dari manapun.

Kedua ini **bukan bug** yang perlu diperbaiki sekarang (dan justru menguntungkan — bebas mengubah tanpa risiko regresi ke caller), tapi perlu diingat saat masuk tahap wiring end-to-end nanti (JNI init sequence, decoder pipeline yang memilih resampler backend).

### 🔴 Belum disentuh (urutan prioritas, dari scan penuh terakhir):

- `modes/BitPerfectPipeline.cpp`, `DSPPipeline.cpp`, `ImmersivePipeline.cpp` — `override` keyword error, dugaan pola sama seperti `PCMDecoder` (base class pure virtual mismatch), belum diinvestigasi detail
- `dsp/OutputStage.cpp` — `GainProcessor`/`Limiter` belum punya `prepare/reset/setGain/setChannelGain` (real unimplemented, dari Update 5/6)
- `fft/SpectrumVisualizer.cpp`/`WaveformVisualizer.cpp` — `definition_of_implicitly_declared_member` (destructor issue), belum diinvestigasi
- `profiling/LatencyProfiler.cpp` — undeclared identifier di file `.cpp` sendiri, belum diinvestigasi (kemungkinan pola broken-header sama seperti `BiquadFilter.h`/`StreamResampler.h`)
- `playback/PlaybackManager.cpp`/`PlaybackScheduler.cpp` — `TransportState.h` missing; `PlaybackManager.cpp` juga ada `setQueue` mismatch dan constructor `PlaybackScheduler` — blocked oleh keputusan desain `PlaybackEventDispatcher` (Fase 3)
- `fft/FFTProcessor.cpp` — sisa 1 error `createHanningWindow` undeclared, fix jelas tapi ditunda sampai migrasi namespace `audio::`→`pristine::`
- **JNI sisanya**: `jni/JSIInstaller.cpp` (`jsi/jsi.h` not found — kemungkinan **limitation lingkungan**, header React Native JSI belum lengkap di Termux, bukan bug kode); `jni/NativeDeviceModule.cpp` (`JNIEXPORT`/`JNICALL` unknown — kemungkinan kurang `#include <jni.h>`, belum diverifikasi)
- `session/TransportControls.cpp` — anomali "0 error" dari Update 5/6, belum diverifikasi ulang sendirian

### 🏛️ Catatan arsitektur (tidak berubah dari Update 5)

Migrasi namespace `audio::`→`pristine::` tetap ditunda ke paling akhir, setelah semua Fase 2/3 tuntas.

---

## 🟢 FASE 3 — Tidak berubah

`TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` masih belum diimplementasikan — butuh keputusan desain sebelum dikerjakan.

---

## Catatan proses (update)

- **Pola baru: dua hierarchy class yang tidak nyambung.** Kasus `dsp::LinearResampler` vs `AudioResampler` interface menunjukkan pola berbeda dari sebelumnya (bukan rename, bukan qualifier hilang, bukan file salah isi) — dua desain arsitektur berbeda yang dibuat terpisah untuk tujuan berbeda (satu untuk realtime hot-path non-polymorphic, satu untuk factory pattern pluggable backend), lalu ada kode yang secara keliru mengasumsikan keduanya bisa dipakai bergantian. Solusi: adapter class, bukan mengubah salah satu desain asli.
- **Pola berulang: "undeclared identifier" bisa berarti include hilang total, bukan cuma qualifier.** Percobaan pertama fix `SincResampler.cpp` (tambah qualifier `dsp::` saja) masih gagal dengan error `use of undeclared identifier 'dsp'` — ternyata `#include "LinearResampler.h"` memang tidak pernah ada di file itu sama sekali. Selalu cek apakah header sumbernya sudah di-include sebelum mengasumsikan qualifier saja cukup.
- **Silent wiring gaps** kini dicatat sebagai kategori terpisah dari compile error — dua ditemukan sejauh ini (`initPlaybackModule`, `createResampler`), kemungkinan ada lebih banyak lagi yang baru akan ketahuan saat tahap integrasi/wiring end-to-end, bukan lewat `clangd` per-file check.
