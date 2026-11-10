# Peta Native C++ — PristineAudio

Dibuat 2026-11-10 sebagai persiapan deep audit native C++ per section.
Total **178 file** di `android/app/src/main/cpp/` (tidak termasuk `oboe/`
yang vendored). Angka file = `.cpp` + `.h` per direktori.

## Section

### 1. core — 28 file
Jantung engine: `AudioEngine.{h,cpp}` (483 baris), `AudioPipeline`,
`AudioStreamController` (617), `AudioCallback`, `AudioState.h` (545),
`DeviceRateDetector`, `AudioBufferController`, `ImmersiveStage`,
`RingBuffer.h`, `DSPProcessingGate`, `AudioModeManager`, `AudioMetrics`,
`EngineStats`.
Sudah disentuh: rantai start + callback realtime dinyatakan BERSIH
(2026-11-10). Belum diaudit sistematis: transisi state/mode/rate,
error path, `AudioModeManager` (diduga mati — 0 caller).

### 2. playback — 22 file
`PlaybackController.cpp` (819 — file terbesar ke-2), `TrackQueue` (520),
`PCMQueue`, `DecodedAudioQueue`, `FadeEngine`, `PlaybackClock`,
`PrebufferManager`, `DecoderWorker`, `NativeEventEmitter`,
`PlaybackMetrics`. Jalur putar lagu, antrean, fade, prebuffer, event
native→JS. Paling sedikit diaudit; sisi native dari temuan JS (Search
bypass store, speed placebo) tinggal di sini.

### 3. decoder — 18 file
`FFmpegDecoder.cpp` (648), `PCMDecoder` (441), `DecoderFactory`,
`DecoderWorker`, `AudioDecoder`, `StreamResampler`,
`ContentUriResolver`, `DecoderUtils`. Tempat tinggal bug M1
(bit-perfect hilang saat ganti laju — `reopenStreamPreservingPlayback`
tidak dipanggil saat track advance) dan M2 (resampler produksi =
interpolasi linear; `SincResampler` ada tapi tidak dipakai).

### 4. dsp — 62 file (16 + subdir)
`DSPChain`, `EQProcessor`, `BiquadFilter`/`BiquadCascade`,
`Limiter`, `StereoWidener`, `GainProcessor`, `OutputStage`,
`PresetParser` (435); subdir: `immersive/` (12 — Solfeggio,
Harmonic, Spatial, Brainwave), `convolution/` (12), `headphone/` (6 —
koreksi AutoEQ), `filters/` (5), `tone/` (4), `graph/` (3),
`spatial/` (2), `dynamics/` (2). Jalur mode (bit-perfect/DSP/
immersive) sudah disampel di Track 2 audit — belum diaudit per file.

### 5. resampler — 8 file
`AudioResampler`, `SincResampler` (SINC_FAST/MEDIUM/BEST),
`LinearResampler`, `ResamplerTypes.h`, `SRCQuality.h`. Kecil dan
fokus; terkait langsung dengan M2.

### 6. fft — 11 file
`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`,
`WaveformVisualizer`. Diketahui: 3 FFT, hanya immersive yang memakai
`FFTPlan`; `SpectrumAnalyzer`/`FFTProcessor` 0 caller; ada OOB write
laten di `SpectrumAnalyzer.cpp:feed()`.

### 7. devices — 5 file
`AudioDeviceManager.cpp` (413), `AudioDeviceDescriptor`,
`DeviceCapabilities`, `DeviceTypes.h`. Enumerasi device + DAC USB;
jalur ini sudah diverifikasi tersambung dan jujur (Track 2).

### 8. manager — 2 file
`EngineManager.cpp` (926 — file terbesar), `EngineManager.h`.
Singleton yang memegang semuanya; `start()` memegang `mMutex`
sepanjang start.

### 9. jni — 12 file
`OnLoad.cpp`, `NativePlaybackModule.cpp`, `NativeDSPModule.cpp`,
`NativeDeviceModule.cpp`, `NativeVisualizerModule.cpp`,
`NativePristineAudio.cpp`, `NativeAudioFeed.cpp`, `JSIInstaller.cpp`.
Relevan dengan DT_NEEDED: `OnLoad.cpp` memanggil 4 fungsi
(`setAudioDeviceManagerVm`, `setDeviceRateDetectorVm`,
`ContentUriResolver::init`, `initJavaVm`) yang membuat
`libappmodules.so` menarik `libpristine-audio.so` di startup —
penyebab lazy load gagal (logcat 2026-11-10 17:43).

### 10. visualizer — 2 file
`VisualizerBuffer.{h,cpp}`. Sudah diperbaiki (B3) + dites 6/6 +
terbukti hidup di device. Paling kecil; audit di sini hanya
verifikasi ulang.

### 11. realtime — 2 file
`RealtimeThread.h`, `ThreadPriority.h`. Prioritas thread audio.

### 12. utils — 6 file
Utilitas umum (dienumerasi saat audit section ini).

## Urutan audit yang diusulkan
1. **manager + core — DIPILIH csheva 2026-11-10 ("inti app disini")**
2. playback — jantung pemutaran, paling sedikit diaudit
3. decoder — tempat tinggal M1/M2 (bit-perfect)
4. dsp — terbesar (62 file), butuh dipecah per subdir
5. resampler + fft — kecil, fokus
6. devices, jni, realtime, visualizer, utils — penutup
   (jni termasuk konfirmasi target CMake `OnLoad.cpp` untuk DT_NEEDED)

Satu section per satu, sesuai metode kerja. Tiap section: baca penuh,
temukan (stub/mati/unsafe/inkonsisten) dengan bukti baris, lalu catat
di `docs/AUDIT_2026-11-10.md` atau doc audit C++ tersendiri — baru
perbaiki kalau csheva memilih.
