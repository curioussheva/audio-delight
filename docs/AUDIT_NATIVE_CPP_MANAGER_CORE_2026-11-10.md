# Audit Native C++ — manager + core (2026-11-10)

Deep audit per section, dimulai dari inti app. 4 track paralel (read-only),
temuan kunci diverifikasi ulang dengan grep/baca kode sebelum ditulis di sini.
Status tiap temuan: **TERVERIFIKASI** (dicek langsung) atau **DUGAAN** (butuh
pengukuran/pengujian lanjutan). Belum ada yang diperbaiki — perbaikan menunggu
pilihan csheva, satu per satu.

Ruang lingkup: `manager/EngineManager.{h,cpp}` (926 baris) + `core/` (28 file):
`AudioEngine`, `AudioPipeline`, `AudioState`, `AudioStreamController`,
`AudioCallback`, `DeviceRateDetector`, `AudioBufferController`, `RingBuffer`,
`ImmersiveStage`, `DSPProcessingGate`, `AudioModeManager`, `AudioMetrics`,
`AudioConfig`, `AudioConstants`, `AudioTypes`, `DSPConfig`, `EngineStats`.

## BLOCKER

### B1 — Self-deadlock: 3 method publik mengunci `mMutex` lalu memanggil `reopenStreamPreservingPlayback()` yang mengunci `mMutex` lagi (TERVERIFIKASI)
- `mMutex` adalah `std::mutex` biasa, bukan rekursif — `manager/EngineManager.h:256` (`mutable std::mutex mMutex;`).
- `reopenStreamPreservingPlayback()` mengunci di `manager/EngineManager.cpp:579` (`std::lock_guard<std::mutex> lock(mMutex);`).
- Tiga pemanggil memegang lock yang sama saat memanggil: `setRequestedDeviceId()` (lock `:361` → reopen `:411`), `onDeviceRemoved()` (lock `:667` → reopen `:707`), `setExclusiveMode()` (lock `:889` → reopen `:905`).
- Double-lock `std::mutex` non-rekursif dari thread yang sama = hang selamanya. Ketiganya hanya deadlock saat engine sedang berjalan — itulah kenapa belum pernah teramati: toggle exclusive selama ini terjadi saat restore mode di boot (engine belum jalan), pilih device saat paused. Jalur hidup dari JNI: `setExclusiveMode` ← `jni/NativeDSPModule.cpp:207` (toggle exclusive dari Settings); `setRequestedDeviceId` ← `jni/NativeDeviceModule.cpp:142` (pilih DAC); `onDeviceRemoved` ← `jni/NativeDeviceModule.cpp:98` (AudioDeviceCallback Kotlin, jalan di **main thread** via main looper → deadlock di sini = ANR). Jadi: cabut headset/DAC sambil main musik, atau ganti device / toggle exclusive sambil main musik → app hang.
- Desain yang benar sudah ada di sebelahnya: `runStreamRecovery()` memanggil reopen di `:561` **tanpa** memegang lock (komentar di sana eksplisit). Arah perbaikan: jadikan reopen versi "lock sudah dipegang" dengan pre-condition terdokumentasi, atau lepas lock sebelum memanggil reopen di ketiga method itu.

## MAJOR

### M1 — Bug M1 TERKONFIRMASI di layer manager: tidak ada jalur yang membuka ulang stream saat track ganti laju (TERVERIFIKASI)
- `EngineManager::start()` early-return kalau stream sudah jalan (`EngineManager.cpp:95-99`).
- `PlaybackController::loadTrack()` hanya memanggil `setFileSampleRate(track.sampleRate)` (`playback/PlaybackController.cpp:189`) — tidak ada reopen, tidak ada `setRequestedSampleRate`.
- `setRequestedSampleRate()` punya **0 caller** di seluruh tree (hanya deklarasi + komentar di `EngineManager.h`).
- `reopenStreamPreservingPlayback()` punya **0 caller eksternal** — hanya 4 situs internal (`:411` device, `:561` recovery, `:707` removed, `:905` exclusive).
- `getControllerAndStartEngine()` (`jni/NativePlaybackModule.cpp:42-64`): kalau engine sudah running, `start()` dilewati sepenuhnya; laju file baru hanya tersimpan di controller dan tidak pernah dibaca ulang.
- Perbaikan ada di layer JNI/playback (deteksi perubahan laju saat track advance → `setRequestedSampleRate` + reopen), bukan di EngineManager sendiri.

### M2 — `EngineManager::start()` mengabaikan `bool` return `AudioEngine::start()` → kegagalan buka stream diam-diam (TERVERIFIKASI)
- `AudioEngine::start` mengembalikan `bool` (`core/AudioEngine.h:45`); `false` kalau `mStreamController.open()` atau `.start()` gagal. `EngineManager::start()` memanggil tanpa memeriksa hasilnya, lalu tetap log "start: hasil" dan return void. JNI `getControllerAndStartEngine()` mencatat "engine started" tanpa syarat dan tidak pernah mengecek `isRunning()` sesudah start; `nativePlay` lanjut ke `controller->play()` yang bisa sukses di level decoder → UI "playing" tanpa suara.

### M3 — `render()` mengambil mutex di tiap callback, `stopDecoder()` menahannya melewati join thread + close decoder → dropout di tiap ganti track (TERVERIFIKASI, durasi DUGAAN)
- `playback/PlaybackController.cpp:382` — `render()` (dari `AudioCallback::onAudioReady`, `core/AudioCallback.cpp:66`) mengambil `std::lock_guard<std::recursive_mutex> decoderLock(decoderMutex_)` pada **setiap** callback.
- `playback/PlaybackController.cpp:764` — `stopDecoder()` memegang lock yang sama sambil memanggil `decoderWorker_->stop()`; `decoder/DecoderWorker.cpp:73-80` (`stop()`) melakukan `workerThread_.join()` lalu `decoder_->close()` di dalam lock itu.
- `stopDecoder()` dipanggil dari `loadTrack()` (`PlaybackController.cpp:173,286`) — jadi di setiap ganti track, audio thread yang sedang render harus menunggu join thread decoder (file I/O + FFmpeg close) selesai.
- Nuansa: lock-nya `recursive_mutex` (bukan `std::mutex`), jadi tidak ada risiko self-deadlock di sini — risikonya adalah audio thread ter-block oleh thread lain. Komentar di `:380-381` dan `:761-763` menjelaskan lock ini sengaja (fix 2026-10-09: cegah audio thread melihat pointer setengah-reset). Durasi stall belum diukur.

### M4 — Data race `mStream` (shared_ptr tanpa proteksi) antara Oboe error thread dan JS thread (TERVERIFIKASI dari kode, window sempit)
- `mStream` adalah `std::shared_ptr<oboe::AudioStream>` biasa, tanpa mutex (`core/AudioStreamController.h:185-187`).
- Penulis: `onErrorAfterClose()` melakukan `mStream.reset()` (`core/AudioStreamController.cpp:602`) — jalan di thread error Oboe saat device dicabut.
- Pembaca bersamaan: `actualSampleRate()` (`:417-418`, `mStream ? mStream->getSampleRate() : mSampleRate`) dan `actualDeviceId()` (`:425-431`, `mStream->getDeviceId()`) — dipanggil dari JS thread via JNI (`jni/NativeDSPModule.cpp:255`, `jni/NativeDeviceModule.cpp:171`).
- Baca shared_ptr balapan dengan reset = UB, potensi crash. Window sempit (perlu disconnect berbarengan dengan getter/start), jadi MAJOR bukan BLOCKER. `mRunning`/`mExclusive`/cache atomik lainnya aman — hanya `mStream` yang tidak.

### M5 — `EngineStats` seluruhnya nilai default palsu di produksi, padahal API-nya live sampai JS (TERVERIFIKASI, 3 track sepakat)
- `AudioMetrics::getStats()` menyalin 10 field ke `EngineStats`; API live lewat `jni/NativePristineAudio.cpp:111,124,138` → `NativePristineAudio.kt` → `src/specs/NativePristineAudio.ts:9-11`.
- Tapi `updateLatencyMs`, `updateCallbackTimeMs`, `updateCpuLoad`, `updateSampleRate`, `updateChannelCount`: **0 call site** di seluruh `cpp/`. `setDSPEnabled`/`setExclusiveMode` (metrics): 0 caller. `recordOverrun`: 0 caller. `recordUnderrun` + `updateBufferedSamples` hanya di jalur fallback yang mati (lihat M8).
- Akibatnya `getStats()` selalu mengembalikan `latencyMs=0`, `callbackTimeMs=0`, `cpuLoad=0`, `sampleRate=48000`, `channelCount=2`, `exclusiveMode=false`, `dspEnabled=true`, `underruns/overruns/bufferedSamples=0` — apa pun kondisi nyata stream. `render()` juga tidak pernah mencatat underrun (PCMQueue short read diam-diam), jadi kelaparan queue di jalur live tidak terlihat. Pola "tampak tersedia padahal tidak ada" yang sama seperti yang diperingatkan `AGENTS.md`.
- `AudioMetrics::reset()` juga tidak me-reset 4 field terakhir.

### M6 — Mode switching terfragmentasi: `AudioModeManager` mati, flag `dspEnabled` mati, dua jalur callback memakai gerbang berbeda (TERVERIFIKASI)
- `AudioModeManager` 0 caller — satu-satunya referensi di `cpp/` + `jni/` adalah `#include` di `core/AudioEngine.h:14`; `AudioEngine` tidak punya member/pemanggilan ke kelas itu. Padahal kelas inilah satu-satunya tempat yang menjaga konsistensi mode ↔ flag (`setMode` menyetel `setProcessingMode` + `setDSPEnabled(false)` untuk BitPerfect, `true` untuk DSP/Immersive).
- Flag `mDSPEnabled` praktis selalu `false`: default `false` (`core/AudioState.h:466`); satu-satunya penulis lain `EngineManager::setDSPEnabled` ← JNI ← Kotlin ← TS — dan `setDSPEnabled(` tidak punya satu pun call site di `src/` (hanya deklarasi).
- Dua jalur di `AudioCallback::onAudioReady` memakai gerbang berbeda: jalur utama memanggil pipeline hanya berdasarkan `DSPProcessingGate::enabled()` (`core/AudioCallback.cpp:79`) — flag `dspEnabled` diabaikan; jalur fallback `if (mState.isDSPEnabled())` (`:108`) — yang karena poin di atas berarti pipeline tidak pernah jalan di jalur fallback.
- Dampak user di jalur utama hari ini: nihil (gate yang mengatur, dan gate hidup). Risikonya: siapa pun yang mengandalkan `isDSPEnabled()` / `AudioModeManager` untuk mode switching akan mendapat perilaku diam-diam salah; `DSPParameters.dspEnabled` ditulis tiap buffer tapi tidak dibaca di mana pun (write-only).

### M7 — Immersive timpang: brainwave tidak pernah jalan, keempat parameter tidak bisa diubah user, flag enable write-only (TERVERIFIKASI — konfirmasi M4 audit lama)
- `core/ImmersiveStage.cpp:108`: `if (params.brainwaveFreq > 0.0f)` — gerbang stage ke-4. Default `mBrainwaveFreq{0.0f}` (`core/AudioState.h:507`; solfeggio 528 Hz, resonance 0.5).
- 0 caller TS untuk `setBrainwaveFreq` / `setSolfeggioFreq` / `setResonanceIntensity` / `setImmersiveEnabled` di luar deklarasi. Rantai native lengkap (JNI → EngineManager → AudioEngine → AudioState) tapi tidak ada yang memanggil dari JS.
- `AudioState::isImmersiveEnabled()` write-only: setter + getter ada (`AudioState.h:88-98`), **0 pembaca** di luar `AudioState.h`; `AudioPipeline::process()` switch hanya pada `processingMode`, tidak membaca flag itu. `setImmersiveEnabled(true)` tidak mengubah suara apa pun.
- `BinauralRenderer` dorman sesuai dokumentasi (bukan bug): `mBinaural` hanya di-`reset()`, `process()` tidak pernah dipanggil.

### M8 — `DeviceRateDetector::refresh()` mahal + basi + dibaca tanpa lock (TERVERIFIKASI)
- (a) `refresh()` jalan di SETIAP `EngineManager::start()` tanpa syarat (`manager/EngineManager.cpp:125`), lalu SEKALI LAGI di `AudioEngine::start()` kalau rate tidak diketahui (`core/AudioEngine.cpp:76`). Ditambah `AudioDeviceManager::refreshDevices()` kalau ada device diminta — sampai 3 enumerasi JNI penuh (binder `AudioManager.getDevices` + per-device `getSampleRates`) per start, semua di JS thread. `start()` hanya jalan saat start/reopen, bukan per track — biayanya terbatas, tapi redundan.
- (b) Hasil bisa basi: tidak ada refresh saat device hot-plug — callback device di JNI hanya memanggil `mgr.refreshDevices()`, tidak pernah `DeviceRateDetector::refresh()` — padahal header-nya sendiri bilang "panggil refresh() saat engine start atau saat device berubah". Jalur reopen juga tidak me-refresh.
- (c) `supportedRates()`/`pickBestRate()`/`supportsRate()`/`isBitPerfectFor()`/`activeDeviceName()` membaca `gRates`/`gDeviceName`/`gIsUsb` TANPA `gMutex`, sementara `refresh()` memutasinya di bawah lock. Race secara teori; laten dalam praktik (semua caller yang diketahui di JS thread).

### M9 — `start()` memegang `mMutex` sepanjang operasi binder + `openStream` (TERVERIFIKASI)
- Lock di `EngineManager.cpp:66` dipegang melintasi `AudioDeviceManager::refreshDevices()` (JNI binder), `DeviceRateDetector::refresh()` (JNI binder), `mPlayback.initialize()` (alokasi PCMQueue 8 MB), dan `mEngine.start()` → Oboe `openStream` (binder AAudio). Selama jendela ini semua operasi manager lain yang butuh `mMutex` ikut antre. Konsisten dengan latensi tap-to-play ~1,5 dtk. Bukan deadlock (tidak ada urutan lock terbalik — `AudioDeviceManager` tidak pernah memanggil `EngineManager`; `PlaybackController` tidak punya referensi `EngineManager`), tapi risiko stall.

## Dead code — terverifikasi 0 caller
- `AudioModeManager` (class lengkap) — 0 caller; hanya `#include` di `AudioEngine.h:14`.
- `AudioConfig` — class + singleton, 0 referensi; `getInstance()` dideklarasi (`core/AudioConfig.h:25`) tapi **tidak pernah didefinisikan** (tidak ada `AudioConfig.cpp`) — jebakan link bagi siapa pun yang memanggilnya.
- `EngineManager::play()` (`:728`), `pause()` (`:733`), `stop()` (`:710`), `getStats()`, `setRequestedSampleRate()`, accessor `requestedSampleRate()` — 0 caller. Konsekuensi: engine tidak pernah di-stop lewat manager (hanya `mEngine.stop()` di dalam `reopen()`); JNI memakai `gPlaybackController` / `engine()` langsung.
- `AudioStreamController::restart()` (`:344`), `isOpen()`, `stream()`, `sampleRate()`/`channelCount()`/`format()`/`api()`/`performanceMode()`/`sharingMode()` (hanya `framesPerBurst()` dipakai).
- `DSPProcessingGate::buildDefault()` — 0 caller. `ImmersiveStage::isPrepared()` — 0 caller. `RingBuffer::pushInterleavedStereo`/`popInterleavedStereo` — 0 caller. `AudioBufferController::underruns()`/`overruns()`/`freeFrames()`/`resetMetrics()` — 0 caller.
- `DSPConfig.immersiveEnabled`/`.solfeggioFreq`/`.brainwaveFreq`/`.resonanceIntensity`/`.convolverEnabled` — tidak pernah dibaca; `applyDSPConfig()` bahkan tidak menyalinnya. `AudioPipeline::mSampleRate`/`mMaxFrames` — hanya ditulis, tidak dibaca. `AudioCallback::mScratchInterleaved` (~15 KB) — hanya di-`memset` di konstruktor.
- 9 tipe mati di `AudioTypes.h` (`StreamState`, `VisualizerMode`, `OutputDeviceType`, `StereoFrame`, `AudioBufferView`, `InterleavedBufferView`, `LatencyInfo`, `EngineConfig`, `AudioDeviceInfo` yang `[[deprecated]]`), 12 konstanta mati di `AudioConstants.h` (termasuk `kEqFrequencies`, `kSolfeggioFreqs` — frekuensi EQ/Solfeggio ternyata hidup di tempat lain, kemungkinan hardcode).
- Jalur fallback `AudioCallback` (tanpa `PlaybackController`) praktis mati: `setPlaybackController` hanya pernah dipanggil sekali dengan `&mPlayback` (`EngineManager.cpp:179`), tidak pernah `nullptr`; `pushData` hanya dari JNI legacy tanpa consumer TS. Satu controller + satu cabang callback + satu API JNI jadi dead weight.

## Minor / laten
- **m1** Guard `numFrames <= 0` di `onAudioReady` justru UB kalau terpicu (TERVERIFIKASI): `core/AudioCallback.cpp:49` — `std::memset(output, 0, sizeof(float) * numFrames * 2)` dengan `numFrames` negatif → konversi ke `size_t` raksasa → tulis jauh melewati buffer. Praktiknya tidak terjangkau (Oboe tidak pernah memanggil dengan `numFrames <= 0`), tapi guard-nya sendiri yang akan meledak. Perbaikan sebaris: `return` sebelum `memset` saat `numFrames <= 0`.
- **m2** Log DEBUG per callback di audio thread (TERVERIFIKASI): `core/AudioCallback.cpp:59` (`"using PlaybackController, frames=%d"`) dan `:86` (fallback) di setiap `onAudioReady` — ~50–250 log/detik + IPC ke `logd` di jalur realtime. Plus `PlaybackController.cpp`: tiap callback ke-100 satu pass min/max/mean + log INFO, tiap ke-5000 satu log INFO lagi (debug ketinggalan).
- **m3** `setNativeProcessingMode` tanpa validasi + `switch` tanpa `default` (TERVERIFIKASI): `jni/NativeDSPModule.cpp:150-160` `static_cast<ProcessingMode>(mode)` tanpa cek rentang; `AudioPipeline::process` (`core/AudioPipeline.cpp:60-99`) tidak punya `default:` — nilai di luar 0–2 diam-diam jadi passthrough + limiter, tanpa log.
- **m4** `reopen()` melakukan kerja berat sambil memegang `mMutex` (TERVERIFIKASI): `EngineManager.cpp:577-660` memegang lock melintasi `loadTrack` (FFmpeg I/O), `seek`, `play` — UI stall saat device switch (100 ms–1 dtk+). Bukan deadlock (`loadTrack` tidak callback ke `EngineManager`). Catatan lintas-track: `reopen()` menyimpan `wasRunning`, lalu `stop()` + `start()` tanpa syarat — kalau engine sedang tidak berjalan saat reopen dipanggil, reopen justru **menyalakan** engine (perlu diputuskan disengaja atau bug).
- **m5** `stop()` tidak me-reset `mRequestedSampleRate` / `mRequestedDeviceId` (DUGAAN, rendah): laju/device bertahan melewati siklus stop/start; stale device id bisa menarget device yang sudah dicabut.
- **m6** `AudioEngine::start()` tanpa mutex internal (TERVERIFIKASI, laten): double-start bersamaan dari dua thread bisa lolos dari cek `isRunning()` (`core/AudioEngine.cpp:68`). Aman hari ini karena kedua caller memegang lock manager — tapi keamanan itu milik caller, bukan `AudioEngine` sendiri. Terpisah: `AudioStreamController::start()` mengembalikan `false` tanpa log saat `requestStart()` gagal.
- **m7** Seqlock preset headphone mengasumsikan single writer, tapi penulisnya reachable dari JNI (DUGAAN): konstruksi seqlock benar; tapi dua pemanggilan JNI bersamaan dari thread berbeda bisa menyisipkan dua penulis. Dampak terbatas pada satu buffer.
- **m8** `pushData()` sebelum start pertama tidak dibersihkan (DUGAAN, kecil): `AudioEngine::start()` tidak memanggil `mBufferController.clear()`; data legacy yang di-push sebelum start pertama ikut ter-render.
- **m9** `AudioCallback::sanitizeOutput` (`:271`): sampel `|x|>2.0` di-nol-kan, bukan di-clamp — diskontinuitas (pop) alih-alih clamp.
- **m10** `RingBuffer::clear()` tidak aman terhadap push/pop bersamaan (laten): reset `write` lalu `read` dengan release-store polos; hari ini tidak terjangkau (caller-nya `AudioEngine::reset()` via `stop()`, sesudah `close()`).
- **m11** `RingBuffer::popStereo` all-or-nothing; `push()` menolak `count == free` (1 sample dari 131072 terbuang); `buildStream()` selalu return true (cek `if (!buildStream(...))` mati); `stop()` mengabaikan hasil `requestStop()`; `open()` return true pada DEVICE/RATE MISMATCH dengan warning saja (by design — caller wajib cek `isDeviceHonored()` terpisah).
- **m12** Drift dokumen vs kode (TERVERIFIKASI): komentar `PlaybackController.cpp:34` bilang `2^19` padahal kode `1 << 21` (8 MB); `DSPProcessingGate.h:25` "DEFAULT: false (perilaku lama)" vs kode `#define PRISTINE_DSP_IN_PRODUCTION 1` → default sebenarnya AKTIF; inkonsistensi default mode (`DSPParameters` BitPerfect vs `AudioState`/`DSPConfig` DSP — tidak berdampak karena `updateParameters()` menimpa tiap buffer); log `reopen()` salah label ("tidak ada track aktif" padahal penyebabnya bisa jadi start gagal).

## Yang sehat (TERVERIFIKASI)
- Singleton Meyers thread-safe; recovery worker benar (atomik `mRecoveryPending`/`mRecoveryRunning`, coalescing, cap 5 percobaan + jeda 150 ms, lock-free di thread Oboe); tidak ada siklus lock-order (`mMutex` → `AudioDeviceManager::mMutex`, tidak ada jalur balik); matematika `pickBestRateFor` aman (list ter-sort + dedup); disconnect handler dipasang sebelum early-return `isRunning()` dan hanya menjadwalkan recovery tanpa lock; setter DSP/`setProcessingMode` lock-free via atomik `AudioState`.
- Lifecycle `AudioEngine` benar: double-start return `true` lebih awal, `open()` gagal → `false`, `requestStart()` gagal → `close()` + `false`, `setRunning(true)` hanya sesudah stream benar-benar jalan, `stop()` idempotent, destructor memanggilnya; fallback AAudio→OpenSLES lengkap dengan verifikasi device + peringatan mismatch.
- Atomics benar di `AudioState`/`AudioMetrics`; seqlock preset benar (konstruksi); `RingBuffer` push/pop SPSC benar (relaxed/acquire/release, tanpa alokasi, 131072 sample ≈ 1,36 dtk @48k); `PCMQueue::read` tanpa lock/alokasi; `VisualizerBuffer::write` tanpa lock/alokasi; `DSPProcessingGate::enabled()` satu atomic load; `AudioPipeline::process` bersih (tanpa alloc/lock/log).
- `AudioStreamController::open/start/stop`: mismatch device/rate diverifikasi + di-log, rate+device yang diminta dipertahankan saat restart, `onErrorAfterClose` menyalin handler sebelum memanggil. `DeviceRateDetector`: hygiene JNI bagus (ScopedEnv, PushLocalFrame seimbang, exception di-clear, rate di-clamp 8000–768000).
- Pipeline 3 mode dispatch dengan benar di jalur utama; gate DSP hidup (dibaca di callback, bisa dimatikan dari JNI, default build 1) — pipeline memang tersambung ke produksi sejak 2026-10-07.
- Rantai Immersive tersambung benar (`prepare()` dipanggil, `updateParameters()` menyalin semua parameter tiap buffer, 3 dari 4 stage jalan realtime-safe); tidak ada TODO/FIXME/XXX atau stub log+return di `manager/`+`core/`.

## Build (CMakeLists)
- `file(GLOB_RECURSE ... CONFIGURE_DEPENDS)` + 7 file JNI eksplisit + `OnLoad.cpp` di target `appmodules` — total **73 file `.cpp`, semuanya ter-compile, tidak ada satu pun `.cpp` yatim**. `utils/` hanya header (6 `.h`, 0 `.cpp`). Tidak ada `tests/` — **tidak ada test C++ sama sekali**.
- **Konfirmasi independen mekanisme DT_NEEDED** (penyebab lazy-load gagal): target `appmodules` = `jni/OnLoad.cpp` + codegen, dan `target_link_libraries(appmodules ... pristine-audio)`. `OnLoad.cpp:65,69,73,76` memanggil 4 fungsi pristine — persis 4 simbol yang membuat `libappmodules.so` menarik `libpristine-audio.so` saat `loadReactNative`.
- Minor: `target_include_directories` masih mencantumkan `modes`, `usb`, `session`, `profiling` — keempat direktori sudah tidak ada (tidak error, hanya usang). `FFmpegDecoder.cpp` dikeluarkan kondisional bila FFmpeg tidak ada. Eksklusi `tests/*.cpp` vakum.

## Perbaikan 2026-11-10 — DIKERJAKAN (csheva: "rapikan, sesuai rekomendasi")

Enam commit di `fix/ffmpeg-disable-doc`, satu build Dev gabungan di akhir.
Verifikasi kompilasi hanya lewat build GitHub (VM Muse tidak punya NDK).

| # | Commit | Isi |
|---|---|---|
| B1 | `6bfac80a` | `setRequestedDeviceId` / `onDeviceRemoved` / `setExclusiveMode` kini lepas `mMutex` (`unique_lock` + `unlock()`) sebelum `reopenStreamPreservingPlayback()` — pola yang sama dengan `runStreamRecovery()`. Self-deadlock tertutup. |
| M4 | `b39329da` | `mStream` dilindungi `mStreamMutex` + helper `streamCopy()`; lock tidak pernah dipegang melewati panggilan Oboe, jadi callback error tidak bisa deadlock. |
| M3 | `0975bd81` | `stopDecoder()` memindahkan worker keluar di bawah lock, lalu `join()` di luar lock; `startDecoder()` membuka decoder (FFmpeg `open`) di luar lock, publish hanya saat sukses. `render()` per callback tetap lock singkat. |
| M5 | `132e266f` | Writer `AudioMetrics` diisi: callback time + cpu load per `onAudioReady`, latency dari `stream->getTimestamp()` + `getFramesWritten()` (tiap callback ke-16), underrun di jalur live, overrun di DATA DROP decode, buffered samples, sample rate/channel/exclusive/dsp dari stream nyata. `reset()` kini reset 10 field; default `mDSPEnabled` true→false. Ikut dalam commit: guard memset UB (m1), hapus log DEBUG per callback (m2), hapus blok debug min/max/mean per-100 di `render()`. **Risiko: pemakaian API Oboe `getTimestamp` belum bisa dicek kompilasinya di VM — build CI yang membuktikan.** |
| M1 | `74b889dc` | `PlaybackController` memanggil `trackLoadedListener` di akhir `loadTrack()` sukses; `EngineManager::onTrackLoaded()` membandingkan laju file dengan laju stream berjalan dan memanggil `reopenStreamPreservingPlayback()` bila berbeda. Guard reentransi `mReopening` (RAII) mencegah reopen-di-dalam-reopen. Perilaku reopen yang "menyalakan engine yang sedang mati" sengaja tidak diubah. |
| Dead code | `901915d6` | Hapus `AudioModeManager`, `AudioConfig`, 6 method `EngineManager`, 9 method `AudioStreamController` (+ getter `requestedSampleRate` yang tertinggal merujuk member yang sudah dihapus — ketahuan saat verifikasi grep), `buildDefault`, `isPrepared`, `push/popInterleavedStereo`, 4 method `AudioBufferController` + counter-nya, field mati `DSPConfig`/`AudioPipeline`/`AudioCallback`, 9 tipe mati + 12 konstanta mati (+ mask/Q pendamping). Include `EngineManager.h` tak terpakai di `OnLoad.cpp` + include dir basi di CMakeLists dirapikan. −1.117 baris. |

**Status verifikasi:** perbaikan di atas terverifikasi di level kode (grep 0 caller
sebelum hapus; pola lock diikuti dari `runStreamRecovery`). Bukti jalan di device
**belum ada** — menunggu build Dev + tes device (cabut DAC sambil main, toggle
exclusive sambil main, main track 48 kHz lalu 96 kHz).

## Yang belum dikerjakan

- **M2** `start()` mengabaikan `bool` dari `AudioEngine::start()` — UI bisa menampilkan "playing" tanpa audio.
- **M6** Desain flag/gate mode (`dspEnabled` vs `DSPProcessingGate`) belum dikonsolidasi — baru flag-nya yang dibersihkan lewat M5.
- **M7** Immersive: 4 parameter tidak terjangkau user; `isImmersiveEnabled()` write-only — butuh kerja fitur/UI.
- **M8** `DeviceRateDetector`: refresh 3x per start, tidak pernah refresh saat hot-plug, baca global tanpa mutex.
- **M9** `start()` memegang `mMutex` melewati binder + `openStream` (~1,5 dtk tap-to-play).
- Minor yang tersisa: m3 (validasi `setNativeProcessingMode` + `default:` di switch pipeline), m4 (reopen pegang lock melewati kerja berat — sebagian teratasi B1 untuk 3 caller, tapi `reopen()` sendiri masih lock saat `loadTrack`), m5 (stop tidak reset laju/device yang diminta — catatan: `mRequestedSampleRate` manager sudah dihapus bersama dead code; `mRequestedDeviceId` masih bertahan), m6, m7, m8, m9, m10, m11, m12 (drift dokumen).
- Section C++ berikutnya yang belum diaudit: playback, decoder, dsp, resampler+fft, devices/jni/realtime/visualizer/utils (urutan di `NATIVE_CPP_MAP.md`).
