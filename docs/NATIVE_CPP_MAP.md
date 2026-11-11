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
`spatial/` (2), `dynamics/` (2). **Audit 2026-11-11 (`AUDIT_NATIVE_CPP_DSP_2026-11-11.md`): 0 blocker + 15 major — 3 HIDUP (reopen stream hapus setting DSP; limiter 2× di mode DSP; HarmonicExciter suntik DC offset di default immersive) + 45 minor + dead code ~28/62 file. M6 dikoreksi: rantai DSP HIDUP (gerbangnya ProcessingMode, bukan dspEnabled). M7 diperhalus: solfeggio+harmonic+spatial-depth hidup dengan default; yang mati brainwave + spatial-width. Konvolusi mati end-to-end; `SincResampler`-style stub berulang (BinauralRenderer, FFTResonanceAnalyzer, CrossfeedProcessor, HeadphoneCorrection lama).**

### 5. resampler — 8 file
`AudioResampler`, `SincResampler` (SINC_FAST/MEDIUM/BEST),
`LinearResampler`, `ResamplerTypes.h`, `SRCQuality.h`. Kecil dan
fokus; terkait langsung dengan M2. **Audit 2026-11-11 (`AUDIT_NATIVE_CPP_RESAMPLER_2026-11-11.md`): 0 blocker + 6 major (semua laten) — `SincResampler` ternyata stub linear (bukan solusi M2), satu-satunya resample produksi adalah swr FFmpeg; `LinearResampler` punya bug carry fase +1 frame/batas.**

### 6. fft — 11 file
`FFTPlan`, `FFTProcessor`, `SpectrumAnalyzer`, `SpectrumVisualizer`,
`WaveformVisualizer`. **Audit 2026-11-11 (`AUDIT_NATIVE_CPP_FFT_2026-11-11.md`): 0 blocker + 3 major (semua dormant) + 11 minor. Hidup hanya `FFTPlan` (dipakai PitchShifter/retune); rantai spektrum + WaveformVisualizer 0 caller. F-M1 OOB write di `feed()` TERBUKTI ASan; F-M2 `reinterpret_cast` di `FFTProcessor::process()` TERBUKTI harness (puncak Nyquist palsu 511.8). Keduanya diperbaiki 2026-11-11 (84246cda, f15336b4) + harness. KOREKSI: klaim "3 FFT" SALAH — cuma ada 1 implementasi FFT C++ (FFTPlan); FFTConvolver tanpa kode FFT; FFT visualizer yang hidup itu bawaan Android (system Visualizer), bukan C++.**

### 7. devices — 5 file
`AudioDeviceManager.cpp` (413), `AudioDeviceDescriptor`,
`DeviceCapabilities`, `DeviceTypes.h`. Enumerasi device + DAC USB;
jalur ini sudah diverifikasi tersambung dan jujur (Track 2).
**Audit 2026-11-11 (`AUDIT_NATIVE_CPP_DEVICES_2026-11-11.md`): 0 blocker + 4 major (1 HIDUP: DV-M1 double-reopen race saat unplug — TERBUKTI logcat #12, reopen #2 simpan 0.0s; DV-M2 data race log-loop refreshDevices; DV-M3 nativeOnDeviceAdded oper descriptor kosong; DV-M4 mapDeviceType salah — HDMI_EARC itu 29 bukan 9) + 9 minor. Semua yang mudah diperbaiki 2026-11-11 (d90e914b, eb2369c0, 5ed3e73c, 86255a9d, 1617dc68 — seek() ikut geser state). KOREKSI: komentar ⚠️ lama di header SALAH — wiring setDeviceId hidup sejak fix 2026-10-07. DITAMPUNG: DV-M1 (c) dedup dua jalur reopen + minor dv-m2…dv-m9; M8 tetap terbuka.**

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
