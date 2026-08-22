# Changelog Build `pristine-audio` — Arsip Detail

Arsip lengkap tiap fix yang sudah dilakukan, dikelompokkan per root-cause/kategori (bukan per tanggal). Untuk status aktif dan sisa pekerjaan, lihat `build-fix-status.md`. Dokumen ini untuk referensi "kenapa dulu di-fix begini" saja.

Filter script `scripts/check.sh` final: `grep -E "^E\[" | grep -v "IncludeCleaner" | grep -v "    tweak:"`. Versi lama (`no_member|error:|undeclared`) tidak menangkap banyak kategori error clangd lain (`unknown_typename`, `pp_file_not_found`, `bound_member_function`, `typecheck_*`, dst) — beberapa klaim "0 error" di awal proyek ternyata tidak akurat karena ini, dan sudah dikoreksi ulang dengan filter final.

---

## FASE 0 — Migrasi API dasar (selesai di awal proyek)

- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` → `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` → `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`), supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare) di beberapa file awal
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
- Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode` (base + 4 turunan) dan `DSPGraph`
- Ditambahkan `AudioEngine::setImmersiveEnabled()` — set flag di `AudioState`, belum tersambung ke efek DSP nyata
- Dibangun jalur visualizer baru dari nol: `AudioCallback::mVisualizer` (`VisualizerBuffer`), diexpose lewat `AudioCallback::visualizerBuffer()`, dipanggil dari `AudioEngine::getVisualizerData()`
- File bersih: `core/AudioEngine.cpp/.h`, `AudioCallback.cpp/.h`, `AudioPipeline.cpp/.h`, `AudioModeManager.cpp`, `AudioStreamController.cpp`, `AudioBufferController.cpp`, `AudioState.h`, `AudioTypes.h`, `PlaybackScheduler.cpp` (parsial), `dsp/graph/DSPNode.h`, `DSPGraph.h/.cpp`, `dsp/tone/EQNode.h/.cpp` (versi awal), `dsp/tone/GainNode.h/.cpp`, `dsp/dynamics/LimiterNode.h/.cpp`, `dsp/spatial/StereoWidenerNode.h/.cpp`, `manager/EngineManager.cpp` (versi awal), `jni/NativeVisualizerModule.cpp`

---

## FASE 1 — Hub inti decoder/playback (selesai, dengan koreksi regresi)

### `dsp/graph/DSPGraph` + `dsp/DSPChain.cpp`
Root cause: `DSPGraph` belum punya method `applyConfig`. `DSPChain.cpp` sendiri sudah benar dari awal.

### `decoder/StreamResampler.h` — bug include path
`../dsp/resampler/LinearResampler.h` seharusnya `../resampler/LinearResampler.h`. Broken include menyebabkan efek domino: banyak error "unknown type"/"no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp` yang bukan bug nyata, cuma akibat parse gagal di tengah jalan.

### `playback/PlaybackController.h/.cpp`
- `metrics_` salah tipe: `shared_ptr<PlaybackMetrics>` (struct data pasif) → seharusnya `shared_ptr<MetricsCollector>` (class dengan method `recordFrameRendered`, dll)
- `startDecoder()`: didesain ulang sesuai API `DecoderWorker` sebenarnya (callback-based via `setDecodeCallback(std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback` yang tidak pernah ada)
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::Playing/Paused)`, `setTrack()`→`setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` yang hilang

### Regresi ditemukan & diperbaiki (efek filter lama yang buta)
- `core/AudioModeManager.cpp` — pola atomic API lama (`state.processingMode.store()` dkk) yang lolos dari migrasi Fase 0
- `usb/USBClockSync.h` — kurang `#include <cstdint>`
- `playback/PlaybackController.cpp/.h` — method publik `metrics()`/`initialize()` masih pakai tipe lama `PlaybackMetrics`

### `DecodedChunk` — klaim "8 file kena" TIDAK AKURAT
Scan ulang menunjukkan `DecodedChunk` hanya dipakai di `StreamResampler.h`/`.cpp`. Root cause: struct `PCMView`/`DecodedChunk` **sudah ada** di `decoder/DecoderTypes.h` (dalam `namespace pristine::decoder`), tapi `StreamResampler` berada di `namespace pristine` (level luar) sehingga butuh qualifier `decoder::DecodedChunk`. Sempat salah menambahkan struct baru yang ternyata duplikat sebelum ketahuan — pelajaran: selalu grep definisi existing dulu.

---

## FASE 2 — Detail per file/root-cause

### Decoder

**`decoder/DecoderWorker.cpp` — ditulis ulang total**
File lama ditulis melawan API header yang sudah lama berubah:

| Dipakai di `.cpp` lama | Yang ada di header |
|---|---|
| `IDecoder` | `AudioDecoder` |
| `ChunkCallback` | `DecodeCallback` |
| `shouldStop_` | `stopRequested_` |
| `cv_` | `pauseCv_` |
| `chunkCb_`/`errorCb_`/`eofCb_` | `decodeCallback_`/`errorCallback_`/`eofCallback_` |
| `notifyError(...)` | (tidak dideklarasikan di header) |
| `getCurrentPosition()` | `getPositionSeconds()` |

Ditulis ulang mengikuti header asli. Juga ditambahkan implementasi `isRunning()`/`isPaused()` yang dideklarasikan di header tapi tidak pernah diimplementasikan (potential linker error, tidak kena clangd single-file check).

**`decoder/AudioDecoder.cpp` — 3 fix**
- Designated initializer `{.status = ..., .errorMessage = ...}` gagal karena `DecodeResult` sekarang move-only (copy ctor `= delete`) sehingga bukan aggregate → diganti assignment field eksplisit
- `DecodeStatus::Eof` → `DecodeStatus::EndOfStream`
- `applyResampling()` ditulis ulang mengikuti API baru `StreamResampler::process(const DecodedChunk&, DecodedChunk&)` (sebelumnya masih pakai signature lama 3-argumen). Ditulis defensif — build `std::vector<float>` baru dari hasil, bukan assign langsung ke buffer yang berpotensi alias dengan memory asal

**`decoder/PCMDecoder.cpp` — beberapa fix**
- `DecodeStatus::Eof` → `EndOfStream`
- `AudioFormat::bitsPerSample` tidak ada (cuma method `bytesPerSample()` turunan `sampleFormat` enum) → ditambahkan member privat `bitsPerSample_` di `PCMDecoder`
- `AudioFormat::SampleFormat::*` → `SampleFormat::*` (enum top-level di `namespace pristine::decoder`, bukan nested di `AudioFormat`)
- **Masalah desain lebih dalam**: `PCMDecoder` mendeklarasikan `onGetCapabilities()`/`onGetDuration()` dengan `override`, padahal base class `AudioDecoder` tidak punya virtual dengan nama itu — base punya 5 pure virtual **publik**: `isSeekable()`, `getCapabilities()`, `getPositionSeconds()`, `getPositionFrames()`, `getDurationSeconds()`. `PCMDecoder` tidak pernah meng-override kelimanya (abstract class, tidak bisa `new`). Fix: rename + tambah implementasi baru untuk `isSeekable()` (selalu `true`), `getPositionSeconds()`, `getPositionFrames()` (diturunkan dari `currentFrame_`/`format_.sampleRate`)

**`decoder/DecoderFactory.cpp` — constructor mismatch**
`FFmpegDecoder` dan `PCMDecoder` hanya punya constructor default, padahal dipanggil dengan `(config)` dan base `AudioDecoder` didesain menerima `DecodeConfig`. Ditambahkan constructor forwarding `explicit XxxDecoder(const DecodeConfig& config = {}) : AudioDecoder(config) {}` ke keduanya. Juga fix `AudioFormat::SampleFormat` → `SampleFormat` di `FFmpegDecoder.h`/`.cpp`.

**Limitation lingkungan**: `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ada di Termux lokal. Fix kode (SampleFormat prefix, constructor forwarding) sudah diterapkan dan benar secara sintaks berdasarkan review manual, tapi tidak bisa diverifikasi 100% lokal.

---

### DSP — root cause `dsp/BiquadFilter.h` (5 file domino + 1 terpisah)

**Temuan**: `dsp/BiquadFilter.h` berisi copy/paste lama dari class `EQProcessor` (versi outdated, tanpa `mBandEnabled`/`mBassEnabled`), bukan definisi `BiquadFilter`. File ini bahkan self-include dirinya sendiri. Class `BiquadFilter` sebenarnya **tidak pernah dideklarasikan** di manapun — sehingga `EQProcessor.h` yang asli (sudah benar & lengkap) gagal resolve `BiquadFilter mLeft[kBands]` dkk.

**Fix**: `BiquadFilter.h` ditulis ulang total berdasarkan interface yang dipanggil dari `EQProcessor.cpp`:
- `setCoefficients()`, `getCoefficients()`, `setPeakingEQ()`, `setLowShelf()` — sudah ada implementasinya di `BiquadFilter.cpp` (RBJ Audio EQ Cookbook)
- `process(float) -> float` dan `reset()` — belum pernah diimplementasikan di manapun, ditulis baru inline sebagai Direct Form II Transposed biquad (state `z1`/`z2`)

**Dampak domino** — 4 file langsung bersih otomatis: `dsp/BiquadFilter.cpp`, `dsp/EQProcessor.cpp`, `dsp/DSPChain.cpp`, `dsp/tone/EQNode.cpp`

**Fix terpisah**: `dsp/headphone/CrossfeedProcessor.cpp` — `CrossfeedProcessor.h` kurang `#include <cstdint>` untuk `int32_t`.

---

### `PlaybackController` unqualified (6 file, termasuk 1 regresi bertumpuk)

**Temuan**: `PlaybackController` di `namespace pristine::playback`, tapi `manager/EngineManager.h`/`.cpp` dan turunannya (JNI files) pakai tanpa qualifier `playback::`.

**Regresi bertumpuk di `manager/EngineManager.cpp`** — 3 masalah berbeda sekaligus:
1. Qualifier `PlaybackController` — fix di `.h` (getter, member) dan `.cpp` (return type)
2. Regresi atomic API (pola sama seperti `AudioModeManager.cpp`) — `mState.exclusiveMode.load(...)`/`mState.processingMode.store(...)` gaya atomic mentah, padahal `AudioState` sudah dimigrasi ke method encapsulated di Fase 0. Fix: `mState.exclusiveMode()` / `mState.setProcessingMode(mode)` / `mState.setExclusiveMode(enabled)`
3. Constructor mismatch desain — `EngineManager()` memanggil `mPlayback(mEngine)`, mengasumsikan `PlaybackController` menerima `AudioEngine&`. Ternyata `PlaybackController` self-contained (state/clock/decoder worker internal, `render()` dipanggil dari luar dengan buffer mentah), constructor default saja. Fix: `mPlayback()`.

**Dampak domino JNI** — 4 dari 5 file bersih otomatis: `NativePristineAudio.cpp`, `NativeDSPModule.cpp`, `NativeVisualizerModule.cpp`, `NativeAudioFeed.cpp`

**Sisa 1 file butuh fix tambahan — `jni/NativePlaybackModule.cpp`**:
- Qualifier di 2 tempat (variabel global, parameter `initPlaybackModule()`)
- `seekTo(uint64_t ms)` tidak ada; `PlaybackController` cuma punya `seek(double seconds)` → fix konversi `positionMs / 1000.0`
- `getState().getPositionMs(48000)` → method yang benar `state()` return `shared_ptr<PlaybackState>` → posisi dari `state()->getPosition().positionMs` (`PlaybackPosition::positionMs` sudah dalam ms langsung)
- `getState().getStatus()` → `state()->getStatus()`

---

### `dsp/convolution/WindowFunctions.cpp` — quick fix terkonfirmasi
Cuma kurang `#include <vector>` (dipakai `std::vector<float>` di 4 fungsi window, cuma include `<cmath>`/`<algorithm>`). Fungsi `createHanningWindow` dkk masih di `namespace audio` (belum migrasi) — sengaja tidak disentuh, ditunda sampai migrasi namespace.

---

### Resampler — dua hierarchy class yang tidak nyambung

**`resampler/AudioResampler.cpp`**: `dsp::LinearResampler` (dipakai `StreamResampler` di decoder) adalah class standalone/non-polymorphic — tidak ada `virtual`, signature `configure()` berbeda (3× `int32_t`, bukan struct `ResampleSpec`), tidak ada `getDelayInFrames()`. Tapi factory `createResampler()` butuh object polymorphic turunan `AudioResampler`. Fix: dibuat class adapter baru `LinearResamplerAdapter` (anonymous namespace, lokal di file) yang meng-wrap `dsp::LinearResampler`, tanpa mengubah desain aslinya (supaya `StreamResampler` tidak terganggu).

**`resampler/SincResampler.cpp`** — 2 fix:
- Stub fallback di `process()` tidak pernah `#include "LinearResampler.h"` sama sekali — root cause utama (ketahuan lewat error `undeclared identifier 'dsp'` setelah fix qualifier pertama gagal)
- Qualifier `dsp::` hilang + `configure()` dipanggil dengan brace-init 4-field mengikuti `ResampleSpec`, padahal `dsp::LinearResampler::configure()` menerima 3× `int32_t` langsung

**Silent wiring gap**: `createResampler()` tidak dideklarasikan di header manapun, tidak dipanggil dari manapun.

---

### Visualizer pImpl — destructor hilang (2 file, pola identik)

`fft/SpectrumVisualizer.h` dan `fft/WaveformVisualizer.h` sama-sama tidak mendeklarasikan destructor di class, padahal `unique_ptr<Impl>` dengan `Impl` forward-declared **wajib** punya destructor eksplisit dideklarasikan di header (`Impl` masih incomplete type di titik itu). `.cpp` sudah benar menulis `= default` setelah `Impl` lengkap, tapi tanpa deklarasi matching di header itu dianggap "definisi ulang" destructor implisit yang tidak sah. Fix: tambah `~SpectrumVisualizer();` / `~WaveformVisualizer();` ke header.

---

### `jni/NativeDeviceModule.h` — file kosong total (0 byte)

Header di-`#include` tapi isinya benar-benar kosong, sehingga `JNIEXPORT`/`JNICALL`/`JNIEnv` semua gagal resolve. Ditulis ulang mengikuti pola `NativePlaybackModule.h` (`#pragma once` + `#include <jni.h>` + `extern "C"` block + deklarasi 2 fungsi JNI export).

Setelah header fixed, muncul error lanjutan: `AudioDeviceManager` masih di `namespace audio` (bagian scope migrasi yang ditunda), bukan `pristine`. Fix di call site (`pristine::AudioDeviceManager` → `audio::AudioDeviceManager`), tanpa menyentuh migrasi arsitektur.

---

### `modes/` — tiga pipeline class, tiga masalah berbeda

**Keputusan desain (dikonfirmasi bersama)**: `BitPerfectPipeline`/`DSPPipeline`/`ImmersivePipeline` diubah jadi **standalone class**, tidak inherit dari `AudioPipeline`. Alasan: `AudioPipeline` (base) sengaja didesain non-virtual/non-polymorphic untuk hot-path realtime (per catatan Fase 0: "supaya realtime thread tidak sentuh atomic sama sekali"), dan ketiga class ini terkonfirmasi **dead code** — tidak pernah di-construct/dipakai polymorphic di manapun (`grep` hanya menemukan 1 referensi, itu pun cuma komentar di `SolfeggioResonator.h`). Menambah `virtual` ke `AudioPipeline` demi 3 class yang tidak dipakai akan menambah vtable overhead ke jalur realtime tanpa manfaat nyata.

**`modes/BitPerfectPipeline.h`/`.cpp` — file-swap total**
Isi kedua file **benar-benar tertukar** berdasarkan nama file: `.h` berisi implementasi (dengan self-include rusak `#include "BitPerfectPipeline.h"`), `.cpp` berisi deklarasi class dengan `#pragma once`. Ditulis ulang di posisi yang benar + diterapkan desain standalone (hapus `: public AudioPipeline`, hapus `override`, include `AudioTypes.h` langsung untuk `DSPParameters` bukan `AudioPipeline.h`).

**`modes/DSPPipeline.h`/`.cpp`**
Tidak ke-swap, hanya perlu desain standalone (hapus inheritance/override) + 2 fix tambahan:
- `dsp::DSPChain mDSPChain;` → qualifier salah, `DSPChain` ada di `namespace pristine` langsung, bukan `pristine::dsp`. Fix: hapus qualifier.
- `mDSPChain.configure(params, sampleRate)` — method `configure()` tidak ada; yang ada `applyConfig(const DSPConfig&)` dengan struct berbeda dari `DSPParameters`. `DSPParameters` (dipakai pipeline layer, realtime-facing) dan `DSPConfig` (dipakai `DSPChain`/`DSPGraph`, dsp-graph-facing) adalah 2 struct terpisah dengan field yang tidak identik. Ditulis translator manual field-by-field di `updateParameters()` (beberapa field `DSPConfig` seperti `convolverEnabled`/`headphoneCorrectionEnabled`/`immersiveEnabled` tidak punya padanan di `DSPParameters`, dibiarkan default).

**`modes/ImmersivePipeline.h`/`.cpp`**
Desain standalone + qualifier `audio::dsp::` untuk 4 class immersive yang belum migrasi (`BrainwaveGenerator`, `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` — beda dari `SolfeggioResonator` yang sudah di `pristine::dsp`). Setelah qualifier benar, ketemu mismatch API nyata:
- `prepare(sampleRate)` dipanggil untuk 4 class tersebut, padahal **tidak satupun** dari mereka punya method `prepare()` (cuma `SolfeggioResonator` yang punya). Fix: hapus 4 panggilan itu.
- `mBrainwave.setBeatFrequency(params.brainwaveFreq)` — method tidak ada. `BrainwaveGenerator` asli pakai `BrainwaveType` enum diskrit (`DELTA/THETA/ALPHA/BETA/GAMMA`) + `setVolume()`, bukan frequency kontinu Hz. **Keputusan desain (dikonfirmasi)**: tambah mapping Hz→band (helper `mapFrequencyToBrainwaveType()`, band standar psikoakustik: Delta <4Hz, Theta 4-8Hz, Alpha 8-13Hz, Beta 13-30Hz, Gamma 30Hz+), panggil `setType()` + `setVolume(params.resonanceIntensity)` (tidak ada field volume brainwave terpisah di `DSPParameters`, reuse `resonanceIntensity`).
- `mBrainwave.process(left, right, numFrames)` → signature asli `generate(left, right, numFrames, sampleRate)` — beda nama method dan butuh parameter sampleRate tambahan.
- `mBinaural.process(...)` sudah dikomentari di kode asli (`// mBinaural.process(...)`), tidak perlu difix — dibiarkan komentar (signature aslinya juga beda: `process(monoInput, outLeft, outRight, numFrames)`, mono→stereo, bukan in-place stereo).

---

### `profiling/LatencyProfiler.h` — file kosong total (0 byte)

Pola identik dengan `NativeDeviceModule.h`. Header di-`#include` tapi kosong total, sehingga class `LatencyProfiler` undeclared di file `.cpp` miliknya sendiri. `.cpp` sudah lengkap implementasi 3 method (`start()`, `end()`, `getLatencyMs()`) pakai member `mStart`/`mLatencyMs`. Tidak dipakai dari file manapun lain (`grep` hanya menemukan referensi di `compile_commands.json`), jadi header ditulis bebas dari nol berdasarkan `.cpp` tanpa risiko mismatch ke caller.

---

### `dsp/OutputStage.cpp` — dua hierarchy class yang tidak nyambung (mirip resampler)

**Temuan**: `GainProcessor` dan `Limiter` adalah class **stateless murni** — semua method `static`, tidak ada member/instance state, tidak ada file `.cpp` pasangan (semua inline di header). Tapi `OutputStage.cpp` memakainya sebagai instance stateful: `mGain.prepare()`, `mGain.setGain()`, `mGain.process(left,right,numFrames)` tanpa gain value eksplisit (mengharapkan gain tersimpan sebagai state internal).

**Fix**: ditambahkan instance-based API ke kedua class (tanpa menghapus method `static` yang sudah ada, supaya tetap reusable di tempat lain):
- `GainProcessor`: tambah `prepare()` (no-op), `reset()`, `setGain(float)`, `setChannelGain(float, float)`, dan overload `process(left, right, frames)` 3-argumen yang memanggil versi `static` 5-argumen menggunakan `mGainL`/`mGainR` yang tersimpan
- `Limiter`: tambah `prepare()`/`reset()` no-op (softClip memang stateless, tidak butuh apa-apa); method `process()` 3-argumen sudah otomatis cocok karena `static` method bisa dipanggil via instance syntax

**Catatan perilaku (bukan diubah, hanya dicatat)**: `OutputStage::setGain()` dan `setBalance()` sama-sama menulis ke channel-gain state `mGain` secara independen — kalau dipanggil berurutan, panggilan belakangan menimpa yang duluan (bukan digabung/dikalikan). Ini tampaknya memang bagaimana kode aslinya ditulis; dipertahankan apa adanya karena scope kerja adalah membuat compile, bukan me-redesign logic gain/balance.

---

## Item yang masih terbuka

Lihat `build-fix-status.md` untuk daftar aktif dan alasan masing-masing (limitation lingkungan / ditunda arsitektur / blocked Fase 3).



########## update 1 ###########

# Changelog Build `pristine-audio` — Arsip Detail

Arsip lengkap tiap fix yang sudah dilakukan, dikelompokkan per root-cause/kategori (bukan per tanggal). Untuk status aktif dan sisa pekerjaan, lihat `build-fix-status.md`. Dokumen ini untuk referensi "kenapa dulu di-fix begini" saja.

Filter script `scripts/check.sh` final: `grep -E "^E\[" | grep -v "IncludeCleaner" | grep -v "    tweak:"`. Versi lama (`no_member|error:|undeclared`) tidak menangkap banyak kategori error clangd lain (`unknown_typename`, `pp_file_not_found`, `bound_member_function`, `typecheck_*`, dst) — beberapa klaim "0 error" di awal proyek ternyata tidak akurat karena ini, dan sudah dikoreksi ulang dengan filter final.

---

## FASE 0 — Migrasi API dasar (selesai di awal proyek)

- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` → `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` → `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`), supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare) di beberapa file awal
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
- Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode` (base + 4 turunan) dan `DSPGraph`
- Ditambahkan `AudioEngine::setImmersiveEnabled()` — set flag di `AudioState`, belum tersambung ke efek DSP nyata
- Dibangun jalur visualizer baru dari nol: `AudioCallback::mVisualizer` (`VisualizerBuffer`), diexpose lewat `AudioCallback::visualizerBuffer()`, dipanggil dari `AudioEngine::getVisualizerData()`
- File bersih: `core/AudioEngine.cpp/.h`, `AudioCallback.cpp/.h`, `AudioPipeline.cpp/.h`, `AudioModeManager.cpp`, `AudioStreamController.cpp`, `AudioBufferController.cpp`, `AudioState.h`, `AudioTypes.h`, `PlaybackScheduler.cpp` (parsial), `dsp/graph/DSPNode.h`, `DSPGraph.h/.cpp`, `dsp/tone/EQNode.h/.cpp` (versi awal), `dsp/tone/GainNode.h/.cpp`, `dsp/dynamics/LimiterNode.h/.cpp`, `dsp/spatial/StereoWidenerNode.h/.cpp`, `manager/EngineManager.cpp` (versi awal), `jni/NativeVisualizerModule.cpp`

---

## FASE 1 — Hub inti decoder/playback (selesai, dengan koreksi regresi)

### `dsp/graph/DSPGraph` + `dsp/DSPChain.cpp`
Root cause: `DSPGraph` belum punya method `applyConfig`. `DSPChain.cpp` sendiri sudah benar dari awal.

### `decoder/StreamResampler.h` — bug include path
`../dsp/resampler/LinearResampler.h` seharusnya `../resampler/LinearResampler.h`. Broken include menyebabkan efek domino: banyak error "unknown type"/"no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp` yang bukan bug nyata, cuma akibat parse gagal di tengah jalan.

### `playback/PlaybackController.h/.cpp`
- `metrics_` salah tipe: `shared_ptr<PlaybackMetrics>` (struct data pasif) → seharusnya `shared_ptr<MetricsCollector>` (class dengan method `recordFrameRendered`, dll)
- `startDecoder()`: didesain ulang sesuai API `DecoderWorker` sebenarnya (callback-based via `setDecodeCallback(std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback` yang tidak pernah ada)
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::Playing/Paused)`, `setTrack()`→`setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` yang hilang

### Regresi ditemukan & diperbaiki (efek filter lama yang buta)
- `core/AudioModeManager.cpp` — pola atomic API lama (`state.processingMode.store()` dkk) yang lolos dari migrasi Fase 0
- `usb/USBClockSync.h` — kurang `#include <cstdint>`
- `playback/PlaybackController.cpp/.h` — method publik `metrics()`/`initialize()` masih pakai tipe lama `PlaybackMetrics`

### `DecodedChunk` — klaim "8 file kena" TIDAK AKURAT
Scan ulang menunjukkan `DecodedChunk` hanya dipakai di `StreamResampler.h`/`.cpp`. Root cause: struct `PCMView`/`DecodedChunk` **sudah ada** di `decoder/DecoderTypes.h` (dalam `namespace pristine::decoder`), tapi `StreamResampler` berada di `namespace pristine` (level luar) sehingga butuh qualifier `decoder::DecodedChunk`. Sempat salah menambahkan struct baru yang ternyata duplikat sebelum ketahuan — pelajaran: selalu grep definisi existing dulu.

---

## FASE 2 — Detail per file/root-cause

### Decoder

**`decoder/DecoderWorker.cpp` — ditulis ulang total**
File lama ditulis melawan API header yang sudah lama berubah:

| Dipakai di `.cpp` lama | Yang ada di header |
|---|---|
| `IDecoder` | `AudioDecoder` |
| `ChunkCallback` | `DecodeCallback` |
| `shouldStop_` | `stopRequested_` |
| `cv_` | `pauseCv_` |
| `chunkCb_`/`errorCb_`/`eofCb_` | `decodeCallback_`/`errorCallback_`/`eofCallback_` |
| `notifyError(...)` | (tidak dideklarasikan di header) |
| `getCurrentPosition()` | `getPositionSeconds()` |

Ditulis ulang mengikuti header asli. Juga ditambahkan implementasi `isRunning()`/`isPaused()` yang dideklarasikan di header tapi tidak pernah diimplementasikan (potential linker error, tidak kena clangd single-file check).

**`decoder/AudioDecoder.cpp` — 3 fix**
- Designated initializer `{.status = ..., .errorMessage = ...}` gagal karena `DecodeResult` sekarang move-only (copy ctor `= delete`) sehingga bukan aggregate → diganti assignment field eksplisit
- `DecodeStatus::Eof` → `DecodeStatus::EndOfStream`
- `applyResampling()` ditulis ulang mengikuti API baru `StreamResampler::process(const DecodedChunk&, DecodedChunk&)` (sebelumnya masih pakai signature lama 3-argumen). Ditulis defensif — build `std::vector<float>` baru dari hasil, bukan assign langsung ke buffer yang berpotensi alias dengan memory asal

**`decoder/PCMDecoder.cpp` — beberapa fix**
- `DecodeStatus::Eof` → `EndOfStream`
- `AudioFormat::bitsPerSample` tidak ada (cuma method `bytesPerSample()` turunan `sampleFormat` enum) → ditambahkan member privat `bitsPerSample_` di `PCMDecoder`
- `AudioFormat::SampleFormat::*` → `SampleFormat::*` (enum top-level di `namespace pristine::decoder`, bukan nested di `AudioFormat`)
- **Masalah desain lebih dalam**: `PCMDecoder` mendeklarasikan `onGetCapabilities()`/`onGetDuration()` dengan `override`, padahal base class `AudioDecoder` tidak punya virtual dengan nama itu — base punya 5 pure virtual **publik**: `isSeekable()`, `getCapabilities()`, `getPositionSeconds()`, `getPositionFrames()`, `getDurationSeconds()`. `PCMDecoder` tidak pernah meng-override kelimanya (abstract class, tidak bisa `new`). Fix: rename + tambah implementasi baru untuk `isSeekable()` (selalu `true`), `getPositionSeconds()`, `getPositionFrames()` (diturunkan dari `currentFrame_`/`format_.sampleRate`)

**`decoder/DecoderFactory.cpp` — constructor mismatch**
`FFmpegDecoder` dan `PCMDecoder` hanya punya constructor default, padahal dipanggil dengan `(config)` dan base `AudioDecoder` didesain menerima `DecodeConfig`. Ditambahkan constructor forwarding `explicit XxxDecoder(const DecodeConfig& config = {}) : AudioDecoder(config) {}` ke keduanya. Juga fix `AudioFormat::SampleFormat` → `SampleFormat` di `FFmpegDecoder.h`/`.cpp`.

**Limitation lingkungan**: `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ada di Termux lokal. Fix kode (SampleFormat prefix, constructor forwarding) sudah diterapkan dan benar secara sintaks berdasarkan review manual, tapi tidak bisa diverifikasi 100% lokal.

---

### DSP — root cause `dsp/BiquadFilter.h` (5 file domino + 1 terpisah)

**Temuan**: `dsp/BiquadFilter.h` berisi copy/paste lama dari class `EQProcessor` (versi outdated, tanpa `mBandEnabled`/`mBassEnabled`), bukan definisi `BiquadFilter`. File ini bahkan self-include dirinya sendiri. Class `BiquadFilter` sebenarnya **tidak pernah dideklarasikan** di manapun — sehingga `EQProcessor.h` yang asli (sudah benar & lengkap) gagal resolve `BiquadFilter mLeft[kBands]` dkk.

**Fix**: `BiquadFilter.h` ditulis ulang total berdasarkan interface yang dipanggil dari `EQProcessor.cpp`:
- `setCoefficients()`, `getCoefficients()`, `setPeakingEQ()`, `setLowShelf()` — sudah ada implementasinya di `BiquadFilter.cpp` (RBJ Audio EQ Cookbook)
- `process(float) -> float` dan `reset()` — belum pernah diimplementasikan di manapun, ditulis baru inline sebagai Direct Form II Transposed biquad (state `z1`/`z2`)

**Dampak domino** — 4 file langsung bersih otomatis: `dsp/BiquadFilter.cpp`, `dsp/EQProcessor.cpp`, `dsp/DSPChain.cpp`, `dsp/tone/EQNode.cpp`

**Fix terpisah**: `dsp/headphone/CrossfeedProcessor.cpp` — `CrossfeedProcessor.h` kurang `#include <cstdint>` untuk `int32_t`.

---

### `PlaybackController` unqualified (6 file, termasuk 1 regresi bertumpuk)

**Temuan**: `PlaybackController` di `namespace pristine::playback`, tapi `manager/EngineManager.h`/`.cpp` dan turunannya (JNI files) pakai tanpa qualifier `playback::`.

**Regresi bertumpuk di `manager/EngineManager.cpp`** — 3 masalah berbeda sekaligus:
1. Qualifier `PlaybackController` — fix di `.h` (getter, member) dan `.cpp` (return type)
2. Regresi atomic API (pola sama seperti `AudioModeManager.cpp`) — `mState.exclusiveMode.load(...)`/`mState.processingMode.store(...)` gaya atomic mentah, padahal `AudioState` sudah dimigrasi ke method encapsulated di Fase 0. Fix: `mState.exclusiveMode()` / `mState.setProcessingMode(mode)` / `mState.setExclusiveMode(enabled)`
3. Constructor mismatch desain — `EngineManager()` memanggil `mPlayback(mEngine)`, mengasumsikan `PlaybackController` menerima `AudioEngine&`. Ternyata `PlaybackController` self-contained (state/clock/decoder worker internal, `render()` dipanggil dari luar dengan buffer mentah), constructor default saja. Fix: `mPlayback()`.

**Dampak domino JNI** — 4 dari 5 file bersih otomatis: `NativePristineAudio.cpp`, `NativeDSPModule.cpp`, `NativeVisualizerModule.cpp`, `NativeAudioFeed.cpp`

**Sisa 1 file butuh fix tambahan — `jni/NativePlaybackModule.cpp`**:
- Qualifier di 2 tempat (variabel global, parameter `initPlaybackModule()`)
- `seekTo(uint64_t ms)` tidak ada; `PlaybackController` cuma punya `seek(double seconds)` → fix konversi `positionMs / 1000.0`
- `getState().getPositionMs(48000)` → method yang benar `state()` return `shared_ptr<PlaybackState>` → posisi dari `state()->getPosition().positionMs` (`PlaybackPosition::positionMs` sudah dalam ms langsung)
- `getState().getStatus()` → `state()->getStatus()`

---

### `dsp/convolution/WindowFunctions.cpp` — quick fix terkonfirmasi
Cuma kurang `#include <vector>` (dipakai `std::vector<float>` di 4 fungsi window, cuma include `<cmath>`/`<algorithm>`). Fungsi `createHanningWindow` dkk masih di `namespace audio` (belum migrasi) — sengaja tidak disentuh, ditunda sampai migrasi namespace.

---

### Resampler — dua hierarchy class yang tidak nyambung

**`resampler/AudioResampler.cpp`**: `dsp::LinearResampler` (dipakai `StreamResampler` di decoder) adalah class standalone/non-polymorphic — tidak ada `virtual`, signature `configure()` berbeda (3× `int32_t`, bukan struct `ResampleSpec`), tidak ada `getDelayInFrames()`. Tapi factory `createResampler()` butuh object polymorphic turunan `AudioResampler`. Fix: dibuat class adapter baru `LinearResamplerAdapter` (anonymous namespace, lokal di file) yang meng-wrap `dsp::LinearResampler`, tanpa mengubah desain aslinya (supaya `StreamResampler` tidak terganggu).

**`resampler/SincResampler.cpp`** — 2 fix:
- Stub fallback di `process()` tidak pernah `#include "LinearResampler.h"` sama sekali — root cause utama (ketahuan lewat error `undeclared identifier 'dsp'` setelah fix qualifier pertama gagal)
- Qualifier `dsp::` hilang + `configure()` dipanggil dengan brace-init 4-field mengikuti `ResampleSpec`, padahal `dsp::LinearResampler::configure()` menerima 3× `int32_t` langsung

**Silent wiring gap**: `createResampler()` tidak dideklarasikan di header manapun, tidak dipanggil dari manapun.

---

### Visualizer pImpl — destructor hilang (2 file, pola identik)

`fft/SpectrumVisualizer.h` dan `fft/WaveformVisualizer.h` sama-sama tidak mendeklarasikan destructor di class, padahal `unique_ptr<Impl>` dengan `Impl` forward-declared **wajib** punya destructor eksplisit dideklarasikan di header (`Impl` masih incomplete type di titik itu). `.cpp` sudah benar menulis `= default` setelah `Impl` lengkap, tapi tanpa deklarasi matching di header itu dianggap "definisi ulang" destructor implisit yang tidak sah. Fix: tambah `~SpectrumVisualizer();` / `~WaveformVisualizer();` ke header.

---

### `jni/NativeDeviceModule.h` — file kosong total (0 byte)

Header di-`#include` tapi isinya benar-benar kosong, sehingga `JNIEXPORT`/`JNICALL`/`JNIEnv` semua gagal resolve. Ditulis ulang mengikuti pola `NativePlaybackModule.h` (`#pragma once` + `#include <jni.h>` + `extern "C"` block + deklarasi 2 fungsi JNI export).

Setelah header fixed, muncul error lanjutan: `AudioDeviceManager` masih di `namespace audio` (bagian scope migrasi yang ditunda), bukan `pristine`. Fix di call site (`pristine::AudioDeviceManager` → `audio::AudioDeviceManager`), tanpa menyentuh migrasi arsitektur.

---

### `modes/` — tiga pipeline class, tiga masalah berbeda

**Keputusan desain (dikonfirmasi bersama)**: `BitPerfectPipeline`/`DSPPipeline`/`ImmersivePipeline` diubah jadi **standalone class**, tidak inherit dari `AudioPipeline`. Alasan: `AudioPipeline` (base) sengaja didesain non-virtual/non-polymorphic untuk hot-path realtime (per catatan Fase 0: "supaya realtime thread tidak sentuh atomic sama sekali"), dan ketiga class ini terkonfirmasi **dead code** — tidak pernah di-construct/dipakai polymorphic di manapun (`grep` hanya menemukan 1 referensi, itu pun cuma komentar di `SolfeggioResonator.h`). Menambah `virtual` ke `AudioPipeline` demi 3 class yang tidak dipakai akan menambah vtable overhead ke jalur realtime tanpa manfaat nyata.

**`modes/BitPerfectPipeline.h`/`.cpp` — file-swap total**
Isi kedua file **benar-benar tertukar** berdasarkan nama file: `.h` berisi implementasi (dengan self-include rusak `#include "BitPerfectPipeline.h"`), `.cpp` berisi deklarasi class dengan `#pragma once`. Ditulis ulang di posisi yang benar + diterapkan desain standalone (hapus `: public AudioPipeline`, hapus `override`, include `AudioTypes.h` langsung untuk `DSPParameters` bukan `AudioPipeline.h`).

**`modes/DSPPipeline.h`/`.cpp`**
Tidak ke-swap, hanya perlu desain standalone (hapus inheritance/override) + 2 fix tambahan:
- `dsp::DSPChain mDSPChain;` → qualifier salah, `DSPChain` ada di `namespace pristine` langsung, bukan `pristine::dsp`. Fix: hapus qualifier.
- `mDSPChain.configure(params, sampleRate)` — method `configure()` tidak ada; yang ada `applyConfig(const DSPConfig&)` dengan struct berbeda dari `DSPParameters`. `DSPParameters` (dipakai pipeline layer, realtime-facing) dan `DSPConfig` (dipakai `DSPChain`/`DSPGraph`, dsp-graph-facing) adalah 2 struct terpisah dengan field yang tidak identik. Ditulis translator manual field-by-field di `updateParameters()` (beberapa field `DSPConfig` seperti `convolverEnabled`/`headphoneCorrectionEnabled`/`immersiveEnabled` tidak punya padanan di `DSPParameters`, dibiarkan default).

**`modes/ImmersivePipeline.h`/`.cpp`**
Desain standalone + qualifier `audio::dsp::` untuk 4 class immersive yang belum migrasi (`BrainwaveGenerator`, `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` — beda dari `SolfeggioResonator` yang sudah di `pristine::dsp`). Setelah qualifier benar, ketemu mismatch API nyata:
- `prepare(sampleRate)` dipanggil untuk 4 class tersebut, padahal **tidak satupun** dari mereka punya method `prepare()` (cuma `SolfeggioResonator` yang punya). Fix: hapus 4 panggilan itu.
- `mBrainwave.setBeatFrequency(params.brainwaveFreq)` — method tidak ada. `BrainwaveGenerator` asli pakai `BrainwaveType` enum diskrit (`DELTA/THETA/ALPHA/BETA/GAMMA`) + `setVolume()`, bukan frequency kontinu Hz. **Keputusan desain (dikonfirmasi)**: tambah mapping Hz→band (helper `mapFrequencyToBrainwaveType()`, band standar psikoakustik: Delta <4Hz, Theta 4-8Hz, Alpha 8-13Hz, Beta 13-30Hz, Gamma 30Hz+), panggil `setType()` + `setVolume(params.resonanceIntensity)` (tidak ada field volume brainwave terpisah di `DSPParameters`, reuse `resonanceIntensity`).
- `mBrainwave.process(left, right, numFrames)` → signature asli `generate(left, right, numFrames, sampleRate)` — beda nama method dan butuh parameter sampleRate tambahan.
- `mBinaural.process(...)` sudah dikomentari di kode asli (`// mBinaural.process(...)`), tidak perlu difix — dibiarkan komentar (signature aslinya juga beda: `process(monoInput, outLeft, outRight, numFrames)`, mono→stereo, bukan in-place stereo).

---

### `profiling/LatencyProfiler.h` — file kosong total (0 byte)

Pola identik dengan `NativeDeviceModule.h`. Header di-`#include` tapi kosong total, sehingga class `LatencyProfiler` undeclared di file `.cpp` miliknya sendiri. `.cpp` sudah lengkap implementasi 3 method (`start()`, `end()`, `getLatencyMs()`) pakai member `mStart`/`mLatencyMs`. Tidak dipakai dari file manapun lain (`grep` hanya menemukan referensi di `compile_commands.json`), jadi header ditulis bebas dari nol berdasarkan `.cpp` tanpa risiko mismatch ke caller.

---

### `dsp/OutputStage.cpp` — dua hierarchy class yang tidak nyambung (mirip resampler)

**Temuan**: `GainProcessor` dan `Limiter` adalah class **stateless murni** — semua method `static`, tidak ada member/instance state, tidak ada file `.cpp` pasangan (semua inline di header). Tapi `OutputStage.cpp` memakainya sebagai instance stateful: `mGain.prepare()`, `mGain.setGain()`, `mGain.process(left,right,numFrames)` tanpa gain value eksplisit (mengharapkan gain tersimpan sebagai state internal).

**Fix**: ditambahkan instance-based API ke kedua class (tanpa menghapus method `static` yang sudah ada, supaya tetap reusable di tempat lain):
- `GainProcessor`: tambah `prepare()` (no-op), `reset()`, `setGain(float)`, `setChannelGain(float, float)`, dan overload `process(left, right, frames)` 3-argumen yang memanggil versi `static` 5-argumen menggunakan `mGainL`/`mGainR` yang tersimpan
- `Limiter`: tambah `prepare()`/`reset()` no-op (softClip memang stateless, tidak butuh apa-apa); method `process()` 3-argumen sudah otomatis cocok karena `static` method bisa dipanggil via instance syntax

**Catatan perilaku (bukan diubah, hanya dicatat)**: `OutputStage::setGain()` dan `setBalance()` sama-sama menulis ke channel-gain state `mGain` secara independen — kalau dipanggil berurutan, panggilan belakangan menimpa yang duluan (bukan digabung/dikalikan). Ini tampaknya memang bagaimana kode aslinya ditulis; dipertahankan apa adanya karena scope kerja adalah membuat compile, bukan me-redesign logic gain/balance.

---

### `playback/` — Fase 3 direklasifikasi: bukan "belum diimplementasikan", tapi bug konkret level Fase 2

**Koreksi klaim lama**: catatan sebelumnya menyatakan `TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` "belum diimplementasikan sama sekali di manapun, butuh keputusan desain" — klaim ini **tidak akurat**, sama pola dengan beberapa kasus stale-note sebelumnya (`DecodedChunk` 8-file, anomali `TransportControls.cpp`). Kenyataan setelah dicek langsung:

- `TransportResult` (enum: `OK`/`AlreadyInState`/`Error`), `TransportCommand` (enum 10 value: Play/Pause/Stop/Seek/Next/Previous + 4 varian per-source), `TransportRequest`, `CommandSource`, `SourcePolicy` — **semua sudah lengkap** didefinisikan di `session/TransportControls.h`, dengan implementasi matang di `.cpp` (default per-source policy: dedup window, priority, audio-focus requirement, dll)
- `PlaybackEventDispatcher` — **sudah lengkap** diimplementasikan di `playback/PlaybackEvents.h` sebagai observer pattern sederhana (`std::vector<PlaybackEventListener*>` + `dispatch()` overload per event type: `PrebufferRequestedEvent`, `TransitionRequestedEvent`)

Yang benar-benar dibutuhkan cuma beberapa fix konkret:

**1. `playback/TransportState.h` — file yang benar-benar hilang (root cause utama)**
Di-`#include` oleh `PlaybackEvents.h` untuk parameter `virtual void onTransportChanged(TransportState) {}`, tapi filenya memang belum pernah dibuat. Karena `PlaybackStatus` enum (Stopped/Playing/Paused/Buffering/Seeking/Completed/Error) di `PlaybackTypes.h` sudah cukup lengkap untuk keperluan ini, `TransportState` dibuat sebagai **alias**, bukan enum baru terpisah (menghindari 2 enum status paralel yang berpotensi jadi translator-gap baru seperti kasus `DSPParameters`/`DSPConfig`):
```cpp
// playback/TransportState.h
#pragma once
#include "PlaybackTypes.h"
namespace pristine {
using TransportState = playback::PlaybackStatus;
}
```
Catatan: dideklarasikan di `namespace pristine` bare (bukan `pristine::playback`) karena `PlaybackEvents.h` sendiri juga mendeklarasikan `PlaybackEventDispatcher` dkk di `namespace pristine` bare (bukan bug — `pristine::playback` nested di dalam `pristine`, jadi lookup dari file lain yang di `pristine::playback` otomatis nemu ke atas tanpa qualifier, beda dari kasus-kasus qualifier-bug sebelumnya yang selalu antar-sibling-namespace).

**2. `playback/PlaybackScheduler.h` — duplicate member name `state_`**
Header punya 2 member berbeda tipe dengan nama sama persis:
```cpp
std::shared_ptr<PlaybackState> state_;       // di-construct dari constructor param
std::atomic<SchedulerState> state_{SchedulerState::Idle};  // dipakai .store()/.load() di seluruh .cpp
```
`.cpp` secara konsisten memakai `state_.store()/.load()` untuk konsep `SchedulerState` (Idle/Monitoring/PrebufferRequested/dst), sementara `shared_ptr<PlaybackState>` yang di-construct dari parameter constructor **tidak pernah dipakai lagi** setelahnya di file itu — aman di-rename. Fix: rename member `shared_ptr` jadi `playbackState_`, update constructor initializer list yang sesuai.

**3. `playback/TrackQueue.h`/`.cpp` — method `tracks()` belum pernah diimplementasikan**
`PlaybackManager::queue()` (API publik return `std::vector<TrackInfo>`) memanggil `queue_->tracks()`, tapi `TrackQueue` cuma punya `setTracks()` (setter), tidak ada getter untuk ambil seluruh track. Ditambahkan:
```cpp
// header
[[nodiscard]] std::vector<TrackInfo> tracks() const;
// cpp
std::vector<TrackInfo> TrackQueue::tracks() const {
    std::lock_guard lock(mMutex);
    return mTracks;
}
```
**Catatan proses**: percobaan pertama menambahkan implementasi ini via python pattern-match sempat gagal 2x (assertion error, pattern tidak match — kemungkinan whitespace/indentation berbeda dari yang terlihat di terminal paste). Deklarasi header sempat berhasil ter-tambah lebih dulu tanpa implementasi `.cpp`-nya, dan `scripts/check.sh` untuk `TrackQueue.cpp` **tetap melaporkan bersih** meski `tracks()` belum diimplementasikan — karena ini murni deklarasi-tanpa-definisi yang hanya muncul sebagai **linker error**, bukan kena clangd single-translation-unit check (pola sama seperti `isRunning()`/`isPaused()` di `DecoderWorker` sebelumnya). Akhirnya berhasil dengan pendekatan `sed` berbasis nomor baris pasti (`awk 'NR==X {print}'` untuk konfirmasi baris sebelum insert), lebih reliable daripada python string-match untuk kasus format tidak terduga.

**4. `playback/PlaybackManager.h`/`.cpp` — type mismatch + constructor tidak lengkap + urutan member salah**
- `queue_` dideklarasikan `std::unique_ptr<TrackQueue>`, tapi `PlaybackScheduler` constructor butuh `std::shared_ptr<TrackQueue>` — tidak bisa dikonversi langsung. Fix: ubah tipe `queue_` jadi `std::shared_ptr<TrackQueue>`, constructor pakai `std::make_shared` bukan `std::make_unique`.
- Constructor `PlaybackManager()` memanggil `std::make_unique<PlaybackScheduler>()` tanpa argumen sama sekali, padahal `PlaybackScheduler` butuh 3 argumen (`shared_ptr<PlaybackState>`, `shared_ptr<TrackQueue>`, `shared_ptr<PlaybackEventDispatcher>`). `PlaybackState` yang dibutuhkan diambil dari `controller_->state()` (method publik `PlaybackController` yang sudah ada sejak Fase 1, return `shared_ptr<PlaybackState>` internal miliknya).
- Urutan deklarasi member di header awalnya `controller_, queue_, scheduler_, events_` — `scheduler_` butuh `events_` (dan `queue_`) sudah ter-construct duluan, tapi C++ selalu mengonstruksi member sesuai **urutan deklarasi di header**, bukan urutan di initializer list. Fix: reorder jadi `controller_, queue_, events_, scheduler_`.

Constructor final:
```cpp
PlaybackManager::PlaybackManager()
    :
    controller_(std::make_unique<PlaybackController>()),
    queue_(std::make_shared<TrackQueue>()),
    events_(std::make_shared<PlaybackEventDispatcher>()),
    scheduler_(std::make_unique<PlaybackScheduler>(
        controller_->state(),
        queue_,
        events_
    )) {
}
```
**Catatan proses**: patch python untuk constructor ini juga gagal 2x karena pattern-match sensitif terhadap baris kosong antar-member initializer yang tidak konsisten dengan asumsi awal. Akhirnya diselesaikan dengan pendekatan `sed` hapus-range-baris-persis (`5,25d`) lalu insert ulang blok baru — sama seperti kasus `TrackQueue.cpp` di atas, insert berbasis nomor baris yang sudah dikonfirmasi via `awk 'NR==X {print}'` jauh lebih reliable untuk blok multi-baris yang formatnya tidak terduga, dibanding python string pattern-matching.

---

## STATUS FINAL

82 file `.cpp` total di project. **79 file (96%) bersih** menurut `scripts/check.sh`. Sisa 3 file di `build-fix-status.md` — semuanya limitation lingkungan atau ditunda sengaja karena keputusan arsitektur (bukan bug yang belum ditemukan).

---


######### update 2 #########


# Changelog Build `pristine-audio` — Arsip Detail

Arsip lengkap tiap fix yang sudah dilakukan, dikelompokkan per root-cause/kategori (bukan per tanggal). Untuk status aktif dan sisa pekerjaan, lihat `build-fix-status.md`. Dokumen ini untuk referensi "kenapa dulu di-fix begini" saja.

Filter script `scripts/check.sh` final: `grep -E "^E\[" | grep -v "IncludeCleaner" | grep -v "    tweak:"`. Versi lama (`no_member|error:|undeclared`) tidak menangkap banyak kategori error clangd lain (`unknown_typename`, `pp_file_not_found`, `bound_member_function`, `typecheck_*`, dst) — beberapa klaim "0 error" di awal proyek ternyata tidak akurat karena ini, dan sudah dikoreksi ulang dengan filter final.

---

## FASE 0 — Migrasi API dasar (selesai di awal proyek)

- Migrasi API `AudioState` dari raw atomic (`.load()/.store()`) ke method encapsulated (`isRunning()`, `setRunning()`, dst)
- Migrasi `AudioStreamController`: `openStream/startStream/stopStream/closeStream` → `open/start/stop/close`
- Migrasi `AudioBufferController`: `pushData/readData/getReadIndex/getAvailable` → `pushInterleaved/popStereo/availableFrames`
- `AudioPipeline::process()` diubah menerima `DSPParameters` (bukan `AudioState`), supaya realtime thread tidak sentuh atomic sama sekali
- Fix namespace `audio::` → `pristine::` (dan bare) di beberapa file awal
- Fix casing enum `ProcessingMode::BIT_PERFECT/IMMERSIVE` → `BitPerfect/Immersive`
- Ditambahkan `applyConfig(const DSPConfig&)` ke seluruh hierarki `DSPNode` (base + 4 turunan) dan `DSPGraph`
- Ditambahkan `AudioEngine::setImmersiveEnabled()` — set flag di `AudioState`, belum tersambung ke efek DSP nyata
- Dibangun jalur visualizer baru dari nol: `AudioCallback::mVisualizer` (`VisualizerBuffer`), diexpose lewat `AudioCallback::visualizerBuffer()`, dipanggil dari `AudioEngine::getVisualizerData()`
- File bersih: `core/AudioEngine.cpp/.h`, `AudioCallback.cpp/.h`, `AudioPipeline.cpp/.h`, `AudioModeManager.cpp`, `AudioStreamController.cpp`, `AudioBufferController.cpp`, `AudioState.h`, `AudioTypes.h`, `PlaybackScheduler.cpp` (parsial), `dsp/graph/DSPNode.h`, `DSPGraph.h/.cpp`, `dsp/tone/EQNode.h/.cpp` (versi awal), `dsp/tone/GainNode.h/.cpp`, `dsp/dynamics/LimiterNode.h/.cpp`, `dsp/spatial/StereoWidenerNode.h/.cpp`, `manager/EngineManager.cpp` (versi awal), `jni/NativeVisualizerModule.cpp`

---

## FASE 1 — Hub inti decoder/playback (selesai, dengan koreksi regresi)

### `dsp/graph/DSPGraph` + `dsp/DSPChain.cpp`
Root cause: `DSPGraph` belum punya method `applyConfig`. `DSPChain.cpp` sendiri sudah benar dari awal.

### `decoder/StreamResampler.h` — bug include path
`../dsp/resampler/LinearResampler.h` seharusnya `../resampler/LinearResampler.h`. Broken include menyebabkan efek domino: banyak error "unknown type"/"no matching constructor" di `DecoderFactory.cpp` dan `PlaybackController.cpp` yang bukan bug nyata, cuma akibat parse gagal di tengah jalan.

### `playback/PlaybackController.h/.cpp`
- `metrics_` salah tipe: `shared_ptr<PlaybackMetrics>` (struct data pasif) → seharusnya `shared_ptr<MetricsCollector>` (class dengan method `recordFrameRendered`, dll)
- `startDecoder()`: didesain ulang sesuai API `DecoderWorker` sebenarnya (callback-based via `setDecodeCallback(std::function<void(DecodeResult&&)>)`, bukan `setPCMQueue`/`setChunkCallback` yang tidak pernah ada)
- `updatePlaybackState()`: `setPlaying(bool)`→`setStatus(PlaybackStatus::Playing/Paused)`, `setTrack()`→`setCurrentTrack()`
- `metrics_->onAudioRendered()`→`metrics_->recordFrameRendered()`
- Tambah `#include "../decoder/FFmpegDecoder.h"` yang hilang

### Regresi ditemukan & diperbaiki (efek filter lama yang buta)
- `core/AudioModeManager.cpp` — pola atomic API lama (`state.processingMode.store()` dkk) yang lolos dari migrasi Fase 0
- `usb/USBClockSync.h` — kurang `#include <cstdint>`
- `playback/PlaybackController.cpp/.h` — method publik `metrics()`/`initialize()` masih pakai tipe lama `PlaybackMetrics`

### `DecodedChunk` — klaim "8 file kena" TIDAK AKURAT
Scan ulang menunjukkan `DecodedChunk` hanya dipakai di `StreamResampler.h`/`.cpp`. Root cause: struct `PCMView`/`DecodedChunk` **sudah ada** di `decoder/DecoderTypes.h` (dalam `namespace pristine::decoder`), tapi `StreamResampler` berada di `namespace pristine` (level luar) sehingga butuh qualifier `decoder::DecodedChunk`. Sempat salah menambahkan struct baru yang ternyata duplikat sebelum ketahuan — pelajaran: selalu grep definisi existing dulu.

---

## FASE 2 — Detail per file/root-cause

### Decoder

**`decoder/DecoderWorker.cpp` — ditulis ulang total**
File lama ditulis melawan API header yang sudah lama berubah:

| Dipakai di `.cpp` lama | Yang ada di header |
|---|---|
| `IDecoder` | `AudioDecoder` |
| `ChunkCallback` | `DecodeCallback` |
| `shouldStop_` | `stopRequested_` |
| `cv_` | `pauseCv_` |
| `chunkCb_`/`errorCb_`/`eofCb_` | `decodeCallback_`/`errorCallback_`/`eofCallback_` |
| `notifyError(...)` | (tidak dideklarasikan di header) |
| `getCurrentPosition()` | `getPositionSeconds()` |

Ditulis ulang mengikuti header asli. Juga ditambahkan implementasi `isRunning()`/`isPaused()` yang dideklarasikan di header tapi tidak pernah diimplementasikan (potential linker error, tidak kena clangd single-file check).

**`decoder/AudioDecoder.cpp` — 3 fix**
- Designated initializer `{.status = ..., .errorMessage = ...}` gagal karena `DecodeResult` sekarang move-only (copy ctor `= delete`) sehingga bukan aggregate → diganti assignment field eksplisit
- `DecodeStatus::Eof` → `DecodeStatus::EndOfStream`
- `applyResampling()` ditulis ulang mengikuti API baru `StreamResampler::process(const DecodedChunk&, DecodedChunk&)` (sebelumnya masih pakai signature lama 3-argumen). Ditulis defensif — build `std::vector<float>` baru dari hasil, bukan assign langsung ke buffer yang berpotensi alias dengan memory asal

**`decoder/PCMDecoder.cpp` — beberapa fix**
- `DecodeStatus::Eof` → `EndOfStream`
- `AudioFormat::bitsPerSample` tidak ada (cuma method `bytesPerSample()` turunan `sampleFormat` enum) → ditambahkan member privat `bitsPerSample_` di `PCMDecoder`
- `AudioFormat::SampleFormat::*` → `SampleFormat::*` (enum top-level di `namespace pristine::decoder`, bukan nested di `AudioFormat`)
- **Masalah desain lebih dalam**: `PCMDecoder` mendeklarasikan `onGetCapabilities()`/`onGetDuration()` dengan `override`, padahal base class `AudioDecoder` tidak punya virtual dengan nama itu — base punya 5 pure virtual **publik**: `isSeekable()`, `getCapabilities()`, `getPositionSeconds()`, `getPositionFrames()`, `getDurationSeconds()`. `PCMDecoder` tidak pernah meng-override kelimanya (abstract class, tidak bisa `new`). Fix: rename + tambah implementasi baru untuk `isSeekable()` (selalu `true`), `getPositionSeconds()`, `getPositionFrames()` (diturunkan dari `currentFrame_`/`format_.sampleRate`)

**`decoder/DecoderFactory.cpp` — constructor mismatch**
`FFmpegDecoder` dan `PCMDecoder` hanya punya constructor default, padahal dipanggil dengan `(config)` dan base `AudioDecoder` didesain menerima `DecodeConfig`. Ditambahkan constructor forwarding `explicit XxxDecoder(const DecodeConfig& config = {}) : AudioDecoder(config) {}` ke keduanya. Juga fix `AudioFormat::SampleFormat` → `SampleFormat` di `FFmpegDecoder.h`/`.cpp`.

**Limitation lingkungan**: `decoder/FFmpegDecoder.cpp` — `libavformat/avformat.h` tidak ada di Termux lokal. Fix kode (SampleFormat prefix, constructor forwarding) sudah diterapkan dan benar secara sintaks berdasarkan review manual, tapi tidak bisa diverifikasi 100% lokal.

---

### DSP — root cause `dsp/BiquadFilter.h` (5 file domino + 1 terpisah)

**Temuan**: `dsp/BiquadFilter.h` berisi copy/paste lama dari class `EQProcessor` (versi outdated, tanpa `mBandEnabled`/`mBassEnabled`), bukan definisi `BiquadFilter`. File ini bahkan self-include dirinya sendiri. Class `BiquadFilter` sebenarnya **tidak pernah dideklarasikan** di manapun — sehingga `EQProcessor.h` yang asli (sudah benar & lengkap) gagal resolve `BiquadFilter mLeft[kBands]` dkk.

**Fix**: `BiquadFilter.h` ditulis ulang total berdasarkan interface yang dipanggil dari `EQProcessor.cpp`:
- `setCoefficients()`, `getCoefficients()`, `setPeakingEQ()`, `setLowShelf()` — sudah ada implementasinya di `BiquadFilter.cpp` (RBJ Audio EQ Cookbook)
- `process(float) -> float` dan `reset()` — belum pernah diimplementasikan di manapun, ditulis baru inline sebagai Direct Form II Transposed biquad (state `z1`/`z2`)

**Dampak domino** — 4 file langsung bersih otomatis: `dsp/BiquadFilter.cpp`, `dsp/EQProcessor.cpp`, `dsp/DSPChain.cpp`, `dsp/tone/EQNode.cpp`

**Fix terpisah**: `dsp/headphone/CrossfeedProcessor.cpp` — `CrossfeedProcessor.h` kurang `#include <cstdint>` untuk `int32_t`.

---

### `PlaybackController` unqualified (6 file, termasuk 1 regresi bertumpuk)

**Temuan**: `PlaybackController` di `namespace pristine::playback`, tapi `manager/EngineManager.h`/`.cpp` dan turunannya (JNI files) pakai tanpa qualifier `playback::`.

**Regresi bertumpuk di `manager/EngineManager.cpp`** — 3 masalah berbeda sekaligus:
1. Qualifier `PlaybackController` — fix di `.h` (getter, member) dan `.cpp` (return type)
2. Regresi atomic API (pola sama seperti `AudioModeManager.cpp`) — `mState.exclusiveMode.load(...)`/`mState.processingMode.store(...)` gaya atomic mentah, padahal `AudioState` sudah dimigrasi ke method encapsulated di Fase 0. Fix: `mState.exclusiveMode()` / `mState.setProcessingMode(mode)` / `mState.setExclusiveMode(enabled)`
3. Constructor mismatch desain — `EngineManager()` memanggil `mPlayback(mEngine)`, mengasumsikan `PlaybackController` menerima `AudioEngine&`. Ternyata `PlaybackController` self-contained (state/clock/decoder worker internal, `render()` dipanggil dari luar dengan buffer mentah), constructor default saja. Fix: `mPlayback()`.

**Dampak domino JNI** — 4 dari 5 file bersih otomatis: `NativePristineAudio.cpp`, `NativeDSPModule.cpp`, `NativeVisualizerModule.cpp`, `NativeAudioFeed.cpp`

**Sisa 1 file butuh fix tambahan — `jni/NativePlaybackModule.cpp`**:
- Qualifier di 2 tempat (variabel global, parameter `initPlaybackModule()`)
- `seekTo(uint64_t ms)` tidak ada; `PlaybackController` cuma punya `seek(double seconds)` → fix konversi `positionMs / 1000.0`
- `getState().getPositionMs(48000)` → method yang benar `state()` return `shared_ptr<PlaybackState>` → posisi dari `state()->getPosition().positionMs` (`PlaybackPosition::positionMs` sudah dalam ms langsung)
- `getState().getStatus()` → `state()->getStatus()`

---

### `dsp/convolution/WindowFunctions.cpp` — quick fix terkonfirmasi
Cuma kurang `#include <vector>` (dipakai `std::vector<float>` di 4 fungsi window, cuma include `<cmath>`/`<algorithm>`). Fungsi `createHanningWindow` dkk masih di `namespace audio` (belum migrasi) — sengaja tidak disentuh, ditunda sampai migrasi namespace.

---

### Resampler — dua hierarchy class yang tidak nyambung

**`resampler/AudioResampler.cpp`**: `dsp::LinearResampler` (dipakai `StreamResampler` di decoder) adalah class standalone/non-polymorphic — tidak ada `virtual`, signature `configure()` berbeda (3× `int32_t`, bukan struct `ResampleSpec`), tidak ada `getDelayInFrames()`. Tapi factory `createResampler()` butuh object polymorphic turunan `AudioResampler`. Fix: dibuat class adapter baru `LinearResamplerAdapter` (anonymous namespace, lokal di file) yang meng-wrap `dsp::LinearResampler`, tanpa mengubah desain aslinya (supaya `StreamResampler` tidak terganggu).

**`resampler/SincResampler.cpp`** — 2 fix:
- Stub fallback di `process()` tidak pernah `#include "LinearResampler.h"` sama sekali — root cause utama (ketahuan lewat error `undeclared identifier 'dsp'` setelah fix qualifier pertama gagal)
- Qualifier `dsp::` hilang + `configure()` dipanggil dengan brace-init 4-field mengikuti `ResampleSpec`, padahal `dsp::LinearResampler::configure()` menerima 3× `int32_t` langsung

**Silent wiring gap**: `createResampler()` tidak dideklarasikan di header manapun, tidak dipanggil dari manapun.

---

### Visualizer pImpl — destructor hilang (2 file, pola identik)

`fft/SpectrumVisualizer.h` dan `fft/WaveformVisualizer.h` sama-sama tidak mendeklarasikan destructor di class, padahal `unique_ptr<Impl>` dengan `Impl` forward-declared **wajib** punya destructor eksplisit dideklarasikan di header (`Impl` masih incomplete type di titik itu). `.cpp` sudah benar menulis `= default` setelah `Impl` lengkap, tapi tanpa deklarasi matching di header itu dianggap "definisi ulang" destructor implisit yang tidak sah. Fix: tambah `~SpectrumVisualizer();` / `~WaveformVisualizer();` ke header.

---

### `jni/NativeDeviceModule.h` — file kosong total (0 byte)

Header di-`#include` tapi isinya benar-benar kosong, sehingga `JNIEXPORT`/`JNICALL`/`JNIEnv` semua gagal resolve. Ditulis ulang mengikuti pola `NativePlaybackModule.h` (`#pragma once` + `#include <jni.h>` + `extern "C"` block + deklarasi 2 fungsi JNI export).

Setelah header fixed, muncul error lanjutan: `AudioDeviceManager` masih di `namespace audio` (bagian scope migrasi yang ditunda), bukan `pristine`. Fix di call site (`pristine::AudioDeviceManager` → `audio::AudioDeviceManager`), tanpa menyentuh migrasi arsitektur.

---

### `modes/` — tiga pipeline class, tiga masalah berbeda

**Keputusan desain (dikonfirmasi bersama)**: `BitPerfectPipeline`/`DSPPipeline`/`ImmersivePipeline` diubah jadi **standalone class**, tidak inherit dari `AudioPipeline`. Alasan: `AudioPipeline` (base) sengaja didesain non-virtual/non-polymorphic untuk hot-path realtime (per catatan Fase 0: "supaya realtime thread tidak sentuh atomic sama sekali"), dan ketiga class ini terkonfirmasi **dead code** — tidak pernah di-construct/dipakai polymorphic di manapun (`grep` hanya menemukan 1 referensi, itu pun cuma komentar di `SolfeggioResonator.h`). Menambah `virtual` ke `AudioPipeline` demi 3 class yang tidak dipakai akan menambah vtable overhead ke jalur realtime tanpa manfaat nyata.

**`modes/BitPerfectPipeline.h`/`.cpp` — file-swap total**
Isi kedua file **benar-benar tertukar** berdasarkan nama file: `.h` berisi implementasi (dengan self-include rusak `#include "BitPerfectPipeline.h"`), `.cpp` berisi deklarasi class dengan `#pragma once`. Ditulis ulang di posisi yang benar + diterapkan desain standalone (hapus `: public AudioPipeline`, hapus `override`, include `AudioTypes.h` langsung untuk `DSPParameters` bukan `AudioPipeline.h`).

**`modes/DSPPipeline.h`/`.cpp`**
Tidak ke-swap, hanya perlu desain standalone (hapus inheritance/override) + 2 fix tambahan:
- `dsp::DSPChain mDSPChain;` → qualifier salah, `DSPChain` ada di `namespace pristine` langsung, bukan `pristine::dsp`. Fix: hapus qualifier.
- `mDSPChain.configure(params, sampleRate)` — method `configure()` tidak ada; yang ada `applyConfig(const DSPConfig&)` dengan struct berbeda dari `DSPParameters`. `DSPParameters` (dipakai pipeline layer, realtime-facing) dan `DSPConfig` (dipakai `DSPChain`/`DSPGraph`, dsp-graph-facing) adalah 2 struct terpisah dengan field yang tidak identik. Ditulis translator manual field-by-field di `updateParameters()` (beberapa field `DSPConfig` seperti `convolverEnabled`/`headphoneCorrectionEnabled`/`immersiveEnabled` tidak punya padanan di `DSPParameters`, dibiarkan default).

**`modes/ImmersivePipeline.h`/`.cpp`**
Desain standalone + qualifier `audio::dsp::` untuk 4 class immersive yang belum migrasi (`BrainwaveGenerator`, `HarmonicExciter`, `SpatialFieldProcessor`, `BinauralRenderer` — beda dari `SolfeggioResonator` yang sudah di `pristine::dsp`). Setelah qualifier benar, ketemu mismatch API nyata:
- `prepare(sampleRate)` dipanggil untuk 4 class tersebut, padahal **tidak satupun** dari mereka punya method `prepare()` (cuma `SolfeggioResonator` yang punya). Fix: hapus 4 panggilan itu.
- `mBrainwave.setBeatFrequency(params.brainwaveFreq)` — method tidak ada. `BrainwaveGenerator` asli pakai `BrainwaveType` enum diskrit (`DELTA/THETA/ALPHA/BETA/GAMMA`) + `setVolume()`, bukan frequency kontinu Hz. **Keputusan desain (dikonfirmasi)**: tambah mapping Hz→band (helper `mapFrequencyToBrainwaveType()`, band standar psikoakustik: Delta <4Hz, Theta 4-8Hz, Alpha 8-13Hz, Beta 13-30Hz, Gamma 30Hz+), panggil `setType()` + `setVolume(params.resonanceIntensity)` (tidak ada field volume brainwave terpisah di `DSPParameters`, reuse `resonanceIntensity`).
- `mBrainwave.process(left, right, numFrames)` → signature asli `generate(left, right, numFrames, sampleRate)` — beda nama method dan butuh parameter sampleRate tambahan.
- `mBinaural.process(...)` sudah dikomentari di kode asli (`// mBinaural.process(...)`), tidak perlu difix — dibiarkan komentar (signature aslinya juga beda: `process(monoInput, outLeft, outRight, numFrames)`, mono→stereo, bukan in-place stereo).

---

### `profiling/LatencyProfiler.h` — file kosong total (0 byte)

Pola identik dengan `NativeDeviceModule.h`. Header di-`#include` tapi kosong total, sehingga class `LatencyProfiler` undeclared di file `.cpp` miliknya sendiri. `.cpp` sudah lengkap implementasi 3 method (`start()`, `end()`, `getLatencyMs()`) pakai member `mStart`/`mLatencyMs`. Tidak dipakai dari file manapun lain (`grep` hanya menemukan referensi di `compile_commands.json`), jadi header ditulis bebas dari nol berdasarkan `.cpp` tanpa risiko mismatch ke caller.

---

### `dsp/OutputStage.cpp` — dua hierarchy class yang tidak nyambung (mirip resampler)

**Temuan**: `GainProcessor` dan `Limiter` adalah class **stateless murni** — semua method `static`, tidak ada member/instance state, tidak ada file `.cpp` pasangan (semua inline di header). Tapi `OutputStage.cpp` memakainya sebagai instance stateful: `mGain.prepare()`, `mGain.setGain()`, `mGain.process(left,right,numFrames)` tanpa gain value eksplisit (mengharapkan gain tersimpan sebagai state internal).

**Fix**: ditambahkan instance-based API ke kedua class (tanpa menghapus method `static` yang sudah ada, supaya tetap reusable di tempat lain):
- `GainProcessor`: tambah `prepare()` (no-op), `reset()`, `setGain(float)`, `setChannelGain(float, float)`, dan overload `process(left, right, frames)` 3-argumen yang memanggil versi `static` 5-argumen menggunakan `mGainL`/`mGainR` yang tersimpan
- `Limiter`: tambah `prepare()`/`reset()` no-op (softClip memang stateless, tidak butuh apa-apa); method `process()` 3-argumen sudah otomatis cocok karena `static` method bisa dipanggil via instance syntax

**Catatan perilaku (bukan diubah, hanya dicatat)**: `OutputStage::setGain()` dan `setBalance()` sama-sama menulis ke channel-gain state `mGain` secara independen — kalau dipanggil berurutan, panggilan belakangan menimpa yang duluan (bukan digabung/dikalikan). Ini tampaknya memang bagaimana kode aslinya ditulis; dipertahankan apa adanya karena scope kerja adalah membuat compile, bukan me-redesign logic gain/balance.

---

### `playback/` — Fase 3 direklasifikasi: bukan "belum diimplementasikan", tapi bug konkret level Fase 2

**Koreksi klaim lama**: catatan sebelumnya menyatakan `TransportResult`, `TransportCommand`, `PlaybackEventDispatcher` "belum diimplementasikan sama sekali di manapun, butuh keputusan desain" — klaim ini **tidak akurat**, sama pola dengan beberapa kasus stale-note sebelumnya (`DecodedChunk` 8-file, anomali `TransportControls.cpp`). Kenyataan setelah dicek langsung:

- `TransportResult` (enum: `OK`/`AlreadyInState`/`Error`), `TransportCommand` (enum 10 value: Play/Pause/Stop/Seek/Next/Previous + 4 varian per-source), `TransportRequest`, `CommandSource`, `SourcePolicy` — **semua sudah lengkap** didefinisikan di `session/TransportControls.h`, dengan implementasi matang di `.cpp` (default per-source policy: dedup window, priority, audio-focus requirement, dll)
- `PlaybackEventDispatcher` — **sudah lengkap** diimplementasikan di `playback/PlaybackEvents.h` sebagai observer pattern sederhana (`std::vector<PlaybackEventListener*>` + `dispatch()` overload per event type: `PrebufferRequestedEvent`, `TransitionRequestedEvent`)

Yang benar-benar dibutuhkan cuma beberapa fix konkret:

**1. `playback/TransportState.h` — file yang benar-benar hilang (root cause utama)**
Di-`#include` oleh `PlaybackEvents.h` untuk parameter `virtual void onTransportChanged(TransportState) {}`, tapi filenya memang belum pernah dibuat. Karena `PlaybackStatus` enum (Stopped/Playing/Paused/Buffering/Seeking/Completed/Error) di `PlaybackTypes.h` sudah cukup lengkap untuk keperluan ini, `TransportState` dibuat sebagai **alias**, bukan enum baru terpisah (menghindari 2 enum status paralel yang berpotensi jadi translator-gap baru seperti kasus `DSPParameters`/`DSPConfig`):
```cpp
// playback/TransportState.h
#pragma once
#include "PlaybackTypes.h"
namespace pristine {
using TransportState = playback::PlaybackStatus;
}
```
Catatan: dideklarasikan di `namespace pristine` bare (bukan `pristine::playback`) karena `PlaybackEvents.h` sendiri juga mendeklarasikan `PlaybackEventDispatcher` dkk di `namespace pristine` bare (bukan bug — `pristine::playback` nested di dalam `pristine`, jadi lookup dari file lain yang di `pristine::playback` otomatis nemu ke atas tanpa qualifier, beda dari kasus-kasus qualifier-bug sebelumnya yang selalu antar-sibling-namespace).

**2. `playback/PlaybackScheduler.h` — duplicate member name `state_`**
Header punya 2 member berbeda tipe dengan nama sama persis:
```cpp
std::shared_ptr<PlaybackState> state_;       // di-construct dari constructor param
std::atomic<SchedulerState> state_{SchedulerState::Idle};  // dipakai .store()/.load() di seluruh .cpp
```
`.cpp` secara konsisten memakai `state_.store()/.load()` untuk konsep `SchedulerState` (Idle/Monitoring/PrebufferRequested/dst), sementara `shared_ptr<PlaybackState>` yang di-construct dari parameter constructor **tidak pernah dipakai lagi** setelahnya di file itu — aman di-rename. Fix: rename member `shared_ptr` jadi `playbackState_`, update constructor initializer list yang sesuai.

**3. `playback/TrackQueue.h`/`.cpp` — method `tracks()` belum pernah diimplementasikan**
`PlaybackManager::queue()` (API publik return `std::vector<TrackInfo>`) memanggil `queue_->tracks()`, tapi `TrackQueue` cuma punya `setTracks()` (setter), tidak ada getter untuk ambil seluruh track. Ditambahkan:
```cpp
// header
[[nodiscard]] std::vector<TrackInfo> tracks() const;
// cpp
std::vector<TrackInfo> TrackQueue::tracks() const {
    std::lock_guard lock(mMutex);
    return mTracks;
}
```
**Catatan proses**: percobaan pertama menambahkan implementasi ini via python pattern-match sempat gagal 2x (assertion error, pattern tidak match — kemungkinan whitespace/indentation berbeda dari yang terlihat di terminal paste). Deklarasi header sempat berhasil ter-tambah lebih dulu tanpa implementasi `.cpp`-nya, dan `scripts/check.sh` untuk `TrackQueue.cpp` **tetap melaporkan bersih** meski `tracks()` belum diimplementasikan — karena ini murni deklarasi-tanpa-definisi yang hanya muncul sebagai **linker error**, bukan kena clangd single-translation-unit check (pola sama seperti `isRunning()`/`isPaused()` di `DecoderWorker` sebelumnya). Akhirnya berhasil dengan pendekatan `sed` berbasis nomor baris pasti (`awk 'NR==X {print}'` untuk konfirmasi baris sebelum insert), lebih reliable daripada python string-match untuk kasus format tidak terduga.

**4. `playback/PlaybackManager.h`/`.cpp` — type mismatch + constructor tidak lengkap + urutan member salah**
- `queue_` dideklarasikan `std::unique_ptr<TrackQueue>`, tapi `PlaybackScheduler` constructor butuh `std::shared_ptr<TrackQueue>` — tidak bisa dikonversi langsung. Fix: ubah tipe `queue_` jadi `std::shared_ptr<TrackQueue>`, constructor pakai `std::make_shared` bukan `std::make_unique`.
- Constructor `PlaybackManager()` memanggil `std::make_unique<PlaybackScheduler>()` tanpa argumen sama sekali, padahal `PlaybackScheduler` butuh 3 argumen (`shared_ptr<PlaybackState>`, `shared_ptr<TrackQueue>`, `shared_ptr<PlaybackEventDispatcher>`). `PlaybackState` yang dibutuhkan diambil dari `controller_->state()` (method publik `PlaybackController` yang sudah ada sejak Fase 1, return `shared_ptr<PlaybackState>` internal miliknya).
- Urutan deklarasi member di header awalnya `controller_, queue_, scheduler_, events_` — `scheduler_` butuh `events_` (dan `queue_`) sudah ter-construct duluan, tapi C++ selalu mengonstruksi member sesuai **urutan deklarasi di header**, bukan urutan di initializer list. Fix: reorder jadi `controller_, queue_, events_, scheduler_`.

Constructor final:
```cpp
PlaybackManager::PlaybackManager()
    :
    controller_(std::make_unique<PlaybackController>()),
    queue_(std::make_shared<TrackQueue>()),
    events_(std::make_shared<PlaybackEventDispatcher>()),
    scheduler_(std::make_unique<PlaybackScheduler>(
        controller_->state(),
        queue_,
        events_
    )) {
}
```
**Catatan proses**: patch python untuk constructor ini juga gagal 2x karena pattern-match sensitif terhadap baris kosong antar-member initializer yang tidak konsisten dengan asumsi awal. Akhirnya diselesaikan dengan pendekatan `sed` hapus-range-baris-persis (`5,25d`) lalu insert ulang blok baru — sama seperti kasus `TrackQueue.cpp` di atas, insert berbasis nomor baris yang sudah dikonfirmasi via `awk 'NR==X {print}'` jauh lebih reliable untuk blok multi-baris yang formatnya tidak terduga, dibanding python string pattern-matching.

---

## ✅ VALIDASI CI (21 Agustus 2026) — konfirmasi eksternal akurasi kerja `clangd` lokal

Build CI (GitHub Actions, NDK clang++ toolchain asli) dijalankan setelah semua fix di atas. Hasil:

- Build berhasil mengompail **27 dari 144 file target** (`pristine-audio` + dependency) sebelum berhenti di error pertama (perilaku default `ninja`, bukan `make -k`).
- **Satu-satunya kegagalan: `decoder/FFmpegDecoder.cpp`** — persis sesuai prediksi roadmap (`libavformat/avformat.h` tidak ditemukan). Tidak ada file lain yang gagal.
- Semua file yang sempat dikompail sebelum berhenti — termasuk `AudioEngine.cpp`, `AudioModeManager.cpp`, `AudioPipeline.cpp`, `StreamResampler.cpp`, `AudioDecoder.cpp`, `DecoderWorker.cpp`, `BiquadFilter.cpp`, `AudioDeviceManager.cpp`, `PCMDecoder.cpp`, `DecoderFactory.cpp` — **semuanya sukses** di toolchain asli (NDK clang++, bukan clangd standalone Termux). Ini konfirmasi eksternal bahwa metodologi verifikasi `scripts/check.sh` selama proses ini akurat.
- **Temuan baru, di luar scope kerja `.cpp` sebelumnya**: `CMakeLists.txt:164` sudah punya deteksi FFmpeg dengan pesan warning `"FFmpeg not found, decoder will use PCM only"`, tapi `FFmpegDecoder.cpp` tetap dipaksa masuk daftar compile tanpa syarat kondisional — tidak konsisten dengan maksud warning tersebut. **Belum di-fix** (sengaja di-skip untuk sesi ini, dicatat sebagai temuan). Fix yang disarankan: exclude `FFmpegDecoder.cpp` dari target build secara kondisional di `CMakeLists.txt` ketika FFmpeg tidak ditemukan, alih-alih membiarkan build gagal total.
- **Sinyal positif untuk `jni/JSIInstaller.cpp`**: log CMake configure menunjukkan `-- JSI : ReactAndroid::jsi` tersedia untuk target lain (Skia) di environment CI ini — artinya header JSI React Native memang ada di CI (beda dari Termux lokal yang tidak punya). File ini kemungkinan besar akan compile sukses begitu build mencapainya, tapi **belum terverifikasi langsung** karena build berhenti duluan di `FFmpegDecoder.cpp` sebelum sempat sampai ke situ.

**Implikasi untuk status**: 79/82 file yang diklaim bersih di `build-fix-status.md` sekarang punya **bukti eksternal** (bukan cuma klaim `clangd` lokal) untuk minimal 27 file yang berhasil terkompail CI. Sisa file lain (belum tercapai build order) kemungkinan besar juga akan sukses, tapi baru terverifikasi penuh setelah `FFmpegDecoder.cpp` di-exclude dari build.

---

### `CMakeLists.txt` — FFmpeg conditional exclude (22 Agustus 2026)

**Temuan dari log CI**: `add_library(pristine-audio SHARED ${ALL_SRCS})` dipanggil di baris 90, sementara deteksi FFmpeg (pkg-config + manual `find_library` fallback) ada di baris 143-165 — **setelah** target library sudah dibuat. `ALL_SRCS` (hasil `file(GLOB_RECURSE ...)`, termasuk `decoder/FFmpegDecoder.cpp`) sudah "terkunci" ke target sebelum CMake tahu FFmpeg tersedia atau tidak. Warning `"FFmpeg not found, decoder will use PCM only"` sudah ada, tapi tidak act upon — `FFmpegDecoder.cpp` tetap coba dikompail tanpa syarat, menyebabkan build gagal total.

**Fix**: deteksi FFmpeg dipecah jadi 2 bagian:
1. **Sebelum `add_library`** (disisipkan setelah blok exclude test-files yang sudah ada, memakai mekanisme `EXCLUDED_SRCS` yang sama): jalankan pkg-config check + manual `find_library` fallback, simpan hasil ke `PRISTINE_FFMPEG_AVAILABLE` (boolean). Kalau `FALSE`, `decoder/FFmpegDecoder.cpp` ditambahkan ke `EXCLUDED_SRCS` sehingga otomatis ke-`list(REMOVE_ITEM ALL_SRCS ...)` sebelum `add_library` dipanggil.
2. **Setelah `add_library`** (posisi lama tetap dipertahankan, tapi disederhanakan): blok `target_include_directories`/`target_link_libraries`/`target_compile_definitions` untuk FFmpeg sekarang tinggal reuse variabel yang sudah dihitung di langkah 1 (`PRISTINE_FFMPEG_AVAILABLE`, `FFMPEG_FOUND`, `AVCODEC_LIB` dkk), tidak perlu deteksi ulang.

**Catatan proses**: sempat ada residu escape-sequence `\u2014` (em dash) di 2 tempat pesan `message()`/komentar akibat `sed` tidak menginterpretasikan unicode escape — dibersihkan manual jadi `--` biasa setelahnya. Insert/replace blok dilakukan berbasis nomor baris pasti (dikonfirmasi via `cat -n` sebelum tiap edit), bukan python string pattern-matching, karena format multi-baris CMake dengan indentasi bervariasi berisiko gagal match (pelajaran dari kasus `TrackQueue.cpp`/`PlaybackManager.cpp` sebelumnya).

**Catatan penting**: fix ini tidak bisa diverifikasi via `scripts/check.sh` (itu tool `clangd`, beroperasi di level C++ compile-check per file, bukan CMake/build-system level). Verifikasi sebenarnya baru akan terlihat saat CI dijalankan ulang.

---

### Migrasi namespace `audio::` → `pristine::` — SELESAI (22 Agustus 2026)

Dilakukan sesuai urutan yang direncanakan sejak Update 5-9: setelah semua Fase 2/3 tuntas. Total **30 file** dimigrasi dalam 5 batch, dikelompokkan per pola format namespace yang berbeda.

**Persiapan — cross-check sebelum eksekusi:**
1. `grep -rln "namespace audio\b"` — 30 file ditemukan (bertambah dari perkiraan awal "belasan file" di catatan lama)
2. `grep -rn "audio::"` project-wide — hanya 12 titik reference eksternal (qualified access dari file lain), semuanya di `modes/ImmersivePipeline.h/.cpp` (9 titik), `dsp/immersive/FFTResonanceAnalyzer.h` (1 titik), `jni/NativeDeviceModule.cpp` (2 titik)
3. Format namespace ditemukan 2 varian: bare `namespace audio { ... } // namespace audio` (19 file: `devices/*`, `fft/*`, `usb/*`, `WindowFunctions.cpp`) dan nested `namespace audio { namespace dsp { ... }} // namespace` (10 file: `dsp/immersive/*`, tidak termasuk `SolfeggioResonator.h/.cpp` yang sudah lebih dulu benar di `pristine::dsp`)

**Collision check sistematis** (sebelum rename, per checklist):
- `pristine::dsp` sebelum migrasi hanya berisi `SolfeggioResonator` dan `dsp::LinearResampler` — dicek terhadap 6 nama yang akan masuk dari `dsp/immersive/` (`BinauralRenderer`, `BrainwaveGenerator`, `BrainwaveType`, `FFTResonanceAnalyzer`, `HarmonicExciter`, `SpatialFieldProcessor`) — **tidak ada collision**.
- `pristine` bare dicek terhadap 14 nama dari `devices/*`, `fft/*`, `usb/*` (loop per-nama via `grep -rn "^class $name\|^struct $name\|^enum class $name"`) — **1 collision ditemukan**: `AudioDeviceInfo` ada di dua tempat dengan field yang benar-benar berbeda:
  - `pristine::AudioDeviceInfo` (`core/AudioTypes.h`) — untuk engine: `OutputDeviceType type`, `AudioRoute route`, `sampleRate`, `channelCount`, `exclusive`
  - `audio::AudioDeviceInfo` (`devices/AudioDeviceInfo.h`, akan dimigrasi) — untuk device enumeration/listing: `id`/`name` (string), `DeviceType type`, `preferredSampleRate`, `supportsExclusive`

  **Keputusan**: rename yang di `devices/` jadi `AudioDeviceDescriptor` (scope rename dicek dulu via grep — ternyata cuma dipakai internal di 5 file `devices/` sendiri; 1 referensi lain di `jni/NativeDeviceModule.cpp` ternyata string nama class Java untuk JNI lookup, bukan reference tipe C++, jadi tidak perlu disentuh). File `AudioDeviceInfo.h` ikut di-rename jadi `AudioDeviceDescriptor.h` (konsisten sama konvensi project: nama file = nama type) — sempat ada jebakan kecil, `sed` rename isi file otomatis mengubah baris `#include "AudioDeviceInfo.h"` jadi `#include "AudioDeviceDescriptor.h"` sebelum file fisiknya di-rename, sempat menghasilkan include yang menunjuk file tidak ada — langsung diperbaiki dengan `mv` file fisiknya menyusul.

**Eksekusi per batch:**
1. `devices/*` (7 file: `DeviceTypes.h`, `DeviceCapabilities.h`, `AudioDeviceDescriptor.h`, `AudioDeviceManager.h/.cpp`, `AudioRouteManager.h/.cpp`) — bare namespace rename via `sed`, plus fix qualifier di `jni/NativeDeviceModule.cpp` (perlu tetap pakai qualifier eksplisit `pristine::AudioDeviceManager::get()` karena file itu di global scope, JNI `extern "C"` function tidak dibungkus `namespace pristine {}`).
2. `fft/*` (11 file: `FFTPlan.h/.cpp`, `SpectrumAnalyzer.h/.cpp`, `FFTypes.h`, `FFTProcessor.h/.cpp`, `SpectrumVisualizer.h/.cpp`, `WaveformVisualizer.h/.cpp`) — bare namespace rename, collision-check nama class + `using Complex`/`ComplexVector` alias (tidak ada collision).
3. `usb/*` (4 file: `USBDeviceManager.h/.cpp`, `USBStreamSession.h/.cpp`) — bare namespace rename, tidak ada collision (`USBClockSync`/`USBDACCapabilities` yang sudah lebih dulu di `pristine` bare punya nama berbeda).
4. `dsp/convolution/WindowFunctions.cpp` (1 file) — bare namespace rename, **sekaligus menuntaskan fix `createHanningWindow` yang sejak Update 5 sengaja ditunda**: menambahkan deklarasi 4 fungsi (`createHanningWindow`, `createHammingWindow`, `createBlackmanWindow`, `createRectangularWindow`) ke `WindowFunctions.h` (sebelumnya hanya didefinisikan di `.cpp`, tidak pernah dideklarasikan di header manapun — sehingga `FFTProcessor.cpp`, translation unit terpisah, tidak pernah bisa melihatnya meski sudah satu namespace). Include `WindowFunctions.h` ditambahkan ke `FFTProcessor.cpp`.
5. `dsp/immersive/*` (10 file) — nested namespace rename (`namespace audio { namespace dsp {` → `namespace pristine { namespace dsp {`), closing brace `}} // namespace` tidak perlu diubah.

**Fix qualifier di file konsumen (setelah migrasi):**
- `modes/ImmersivePipeline.h/.cpp` — 9 titik `audio::dsp::` → `dsp::` (unqualified, karena `ImmersivePipeline` sendiri di `pristine` bare dan `pristine::dsp` nested di dalamnya)
- `dsp/immersive/FFTResonanceAnalyzer.h` — 1 titik `audio::FFTPlan` → `FFTPlan` bare (karena `FFTResonanceAnalyzer` di `pristine::dsp` dan `FFTPlan` sekarang di `pristine` bare/enclosing, unqualified lookup otomatis nemu ke atas)
- `jni/NativeDeviceModule.cpp` — `audio::AudioDeviceManager` → `pristine::AudioDeviceManager` (tetap qualified karena global scope, bukan dihapus qualifier-nya)

**Hasil akhir**: seluruh 30 file migrasi + 3 file konsumen — semua bersih. Sanity-check menyeluruh project (`scripts/check.sh` tanpa argumen) turun dari 3 file error jadi 2 (kedua sisanya limitation lingkungan murni, tidak terkait migrasi).

---

## STATUS FINAL

82 file `.cpp` total di project. **80 file (98%) bersih** menurut `scripts/check.sh`. Sisa 2 file di `build-fix-status.md` — keduanya murni limitation lingkungan (FFmpeg & React Native JSI headers tidak tersedia di Termux lokal), tidak ada lagi item yang ditunda karena keputusan arsitektur.
