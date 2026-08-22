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
