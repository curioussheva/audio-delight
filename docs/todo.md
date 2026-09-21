📄 todo.md — Priority & Roadmap

```markdown
# TODO — PristineAudio Debug & Feature Roadmap

**Status**: 20 Sep 2026
**Fokus saat ini**: Konsolidasi audio engine + tooling debug

---

## 🎯 TL;DR Prioritas

| # | Task | Effort | Status | Optional? |
|:-:|------|:---:|:---:|:---:|
| 1 | **Library fix** (manual play end-to-end) | 2-4 jam | 🔴 **Priority** | ❌ Wajib |
| 2 | **Visualizer** (waveform + spectrum) | 3-5 hari | 🟡 Tool | ✅ Optional |
| 3 | **AudioConfig UI** (live tuning via JS) | 2-3 hari | 🟢 Nice-to-have | ✅ Optional |

---

## 🔴 PRIORITY #1 — Library Fix (Manual Play)

**Target**: Test manual play dari library — bukan dummy autoplay.

**Kenapa penting**: Debug flow real user (content:// → cache → FFmpeg).

### Steps

- [ ] **Test tap lagu di library**
  - Buka PristineAudio
  - Tap lagu di `(tabs)/library.tsx`
  - Cek console output
  
- [ ] **Verify log flow**
```

▶️ [Player] playSong: "..."
[PERF] filter URIs: Xms (Y/Y valid)
🔍 [DEBUG] URIs dikirim ke native: [...]
[PERF] setQueue: Xms (async=?)
[PERF] play: Xms (async=?)
[PERF] playSong TOTAL: Xms

```

- [ ] **Cek `resolveContentUriToPath` di logcat**
```

NativePlaybackService: resolveContentUriToPath: content://... → /data/.../audio_XXX.mp3
NativePlaybackService: setQueue raw=... path=...

```

- [ ] **Cek native `loadTrack`**
```

PlaybackController: loadTrack(): START uri=/data/.../audio_XXX.mp3
PlaybackController: startDecoder(): ok=?

```

- [ ] **Verify audio keluar**
  - Dengar: audio keluar?
  - Cek `[DIAG]` speed 1.00x?

- [ ] **Verify floating player muncul**
  - Screenshot floating player
  - Play/pause button berfungsi?

- [ ] **Test next/prev**
  - Tekan next → lagu berikutnya play?
  - Tekan prev → kembali lagu sebelumnya?

### Known Issues

- ⚠️ Content:// path belum pernah test end-to-end
- ⚠️ `resolveContentUriToPath` mungkin fail silent (return `content://...` tidak di-resolve)
- ⚠️ Cache cleanup belum ada (bisa numpuk)

### Debug Commands

```bash
# Test content:// resolution
adb logcat | grep -E "resolveContentUri|NativePlaybackService|loadTrack"
```

---

🟡 TOOL #1 — Visualizer (Optional, tapi High Value)

Target: Visual feedback untuk debugging (mata vs log).

Kenapa optional: Bisa dipakai untuk debug future issues, bukan blocker saat ini.

Fase 1: Real-time Indicator (2-4 jam)

☐ Buat src/features/debug/components/AudioIndicator.tsx
☐ Show:
  · Status (PLAYING/PAUSED/STOPPED)
  · Position (ms)
  · Speed (x)
  · Queue level (%)
☐ Integrate di debug screen atau floating overlay

Fase 2: Waveform (1-2 hari)

☐ Native: tambah nativeGetWaveform(samples: Int): FloatArray di JNI
☐ JS: render pakai @shopify/react-native-skia (sudah di package.json)
☐ Draw oscilloscope real-time

Deteksi visual:

· Flat line → silence
· Amplitude > 1.0 → clipping
· Chop → glitch

Fase 3: Spectrum Analyzer (1-2 hari)

☐ Native: FFT bridge nativeGetSpectrum(bands: Int): FloatArray
☐ JS: bar chart 20Hz - 20kHz
☐ 30 FPS update

Deteksi visual:

· Spike di high freq → aliasing (metallic)
· Roll-off cepat → cutoff terlalu agresif

Prioritas

· 🔴 Fase 1 (indicator) — quick win
· 🟡 Fase 2 (waveform) — visual feedback
· 🟢 Fase 3 (spectrum) — advanced

---

🟢 TOOL #2 — AudioConfig UI (Optional)

Target: User bisa tune config tanpa rebuild.

Kenapa optional: Config sekarang hardcoded works, tapi live tuning percepat iterasi.

Fase 1: JNI Setter (4-6 jam)

☐ Kotlin: external fun nativeSetConfig(key: String, value: Double)
☐ C++: dispatch ke PlaybackController::setFilterSize(), dll
☐ Butuh setters di PlaybackController + FFmpegDecoder

Fase 2: Config UI (1-2 hari)

☐ Screen: settings/advanced.tsx
☐ Sliders untuk:
  · Filter size (16-256)
  · Queue capacity (power-of-2)
  · Pause/resume threshold (%)
  · Headroom gain (0-1)
  · Resampler cutoff (0.90-1.0)
  · Dither scale (0-1)
☐ Presets: High / Balanced / Performance / Battery Saver
☐ Save to AsyncStorage

Fase 3: Auto-detect (4-6 jam)

☐ Baca AudioDeviceInfo → set config optimal per device
☐ Save auto-detected config

Config Categories (Full List)

```typescript
{
  filterSize: { low, high },
  queue: { capacityFrames },
  flowControl: { pauseThreshold, resumeThreshold },
  gain: { headroom },
  resampler: { cutoff, ditherScale },
  sampleRate: { target, mode },        // 44100/48000/96000
  oboe: {
    framesPerBurst,                     // 0=auto
    perfMode,                           // low_latency/none/power_saving
    sharingMode,                        // exclusive/shared
    api,                                // auto/aaudio/opensl
  },
  decoder: { chunkSize, gapless, skipSilence },
  experimental: { preloadNextTrack, sampleRateSwitch },
}
```

---

📋 Backlog Lainnya

Native Cleanup

☐ Hapus playback/PlaybackManager.cpp/.h (dead code)
☐ Hapus jni/NativeAudioFeed.cpp (RNTP fork dead)
☐ Hapus fft/ jika tidak dipakai (kandidat dead code)
☐ Hapus modes/*Pipeline.cpp jika DSPPipeline tidak aktif (dead code)

Fase C — Sinkronisasi UI

☐ Processing Mode 3-mode (Exclusive/DSP/Immersive)
  · Patch 7 file (siap tempel dari sesi lalu)
  · Update onboarding.tsx → 3 mode cards
  · Update settings.tsx → modal picker
☐ Media session (notifikasi, lock screen, audio focus)
☐ Expose isExclusive() ke JS (indikator bit-perfect)
☐ setProcessingMode orphan (chain C++ ada, Kotlin/TS belum)

Pembersihan RNTP Total

☐ pnpm remove react-native-track-player
☐ Hapus globals.d.ts references
☐ Hapus scripts/patch-pristine.sh, scripts/custom-rntp/
☐ Hapus CI patch steps
☐ Cek RNTP_ENABLED di semua file:
  ```bash
  grep -rn "RNTP_ENABLED" . 2>/dev/null | grep -v node_modules
  ```

Long-term Features

☐ FD-based Custom I/O (10-16 hari) — hilangkan cache copy
☐ Dynamic sample rate (v1.1) — baca device native rate
☐ Sample rate switching per-track (v1.2)
☐ Bit-perfect via AudioMixerAttributes (v2.0, Android 14+)
☐ AutoEQ import (Squiglink → DSP chain)

Modul Belum Ter-bridge

☐ dsp/convolution/* — convolution engine
☐ dsp/headphone/* — headphone correction
☐ session/* — cek vs MediaSessionManager.kt
☐ usb/* — cek vs UsbManager SDK

---

🎯 Current Sprint (Fokus Sekarang)

Week 1

Hari 1-2:

· 🔴 Test manual play dari library
· Verify content:// resolution
· Fix issue kalau ada
· Verify floating player

Hari 3-4:

· 🟡 Visualizer Fase 1 — real-time indicator
· Simple UI (queue %, speed, position)

Hari 5-7:

· 🟡 Visualizer Fase 2 — waveform (Skia)
· Commit + screenshot

Week 2

Hari 1-3:

· 🟢 AudioConfig Fase 1 — JNI setter
· Fase 2 — Sliders UI
· Preset buttons

Hari 4-7:

· Fase C — Processing Mode 3-mode
· Media session + audio focus
· Cleanup RNTP

---

📊 Progress Tracker

Audio Engine (Done ✅)

☑ Race condition clearing_
☑ Decoder priority -16
☑ Scratch buffer reuse
☑ Flow control pause/resume (80/40)
☑ Adaptive filter (64/128)
☑ DSP bypass default (root cause chipmunk)
☑ -fno-fast-math
☑ -O2 debug build
☑ Queue 1<<21 (21.8s)
☑ OpenSL test (in progress)

Test Results (Verified ✅)

☑ MP3 44.1k — audio normal, minor noise
☑ Enya 96k — speed 1.00x stabil, glitch "slow/fast" TBD

Tools (In Progress 🟡)

☑ diagnostics.ts — active
☑ testMatrix.ts — active
☑ audioConfig.ts — orphan (dokumentasi)
☑ playerStore.ts — telemetry aktif
☐ Visualizer — belum
☐ Config UI — belum

---

💡 Notes

Prinsip Debugging

1. Top-down dari JS dulu (iterasi cepat)
2. Bottom-up untuk native thread issues
3. Visual feedback = 100x faster dari logcat
4. Test matrix = regression test

Known Issues (Priority)

· 🔴 Library manual play — belum test
· 🟡 Content:// resolution — belum verify
· 🟡 Floating player — belum muncul
· 🟢 OnLoad.cpp clangd fail — false positive (fbjni missing)
· 🟢 Decoder FFmpeg clangd fail — false positive (FFmpeg headers)

Test Files

File Rate Path
MP3 test.mp3 44.1k /storage/emulated/0/Music/test.mp3
FLAC Enya 96k /storage/emulated/0/Music/Enya_-_Dark_Sky_Island.flac
FLAC Leo Rojas 44.1k /storage/emulated/0/Music/The Rose - Leo Rojas.mp3

Global Debug API (dev only)

```
__audioSnapshot()     — 1x snapshot
__audioReport()       — summary events
__audioTestMatrix()   — automated multi-file test
```

---

🚀 Next Action

Sekarang:

1. Test OpenSL + flow tune rebuild (in progress)
2. Verify audio Enya 96k — glitch "slow/fast"?
3. Kalau fixed → commit, lanjut Library fix

Setelah audio stable:

1. Library fix (priority #1)
2. Visualizer (tool)
3. AudioConfig UI (optional)

Milestone: Audio production-ready untuk semua file.

---

Last Updated: 20 Sep 2026
Next Review: Setelah OpenSL test selesai

```

---

## 🎯 Cara Pakai `todo.md`

**Simpan di root project**:
```bash
cd ~/pristine
# Copy-paste konten di atas ke todo.md
```

Update setelah selesai:

· Centang checkbox
· Update status
· Add catatan progress

Commit bersamaan dengan kode:

```bash
git add todo.md
git commit -m "docs: update todo priority + roadmap"
git push origin pristinev2
```

---

📋 Ringkasan Prioritas

# Task Effort Priority
1 Library fix (manual play) 2-4 jam 🔴 Wajib
2 Visualizer (waveform + spectrum) 3-5 hari 🟡 Tool
3 AudioConfig UI (live tuning) 2-3 hari 🟢 Optional

Fokus Sprint 1: Library fix dulu → baru visualizer.

Fokus Sprint 2: Config UI + Processing mode 3-mode.

---

Salin todo.md di atas, commit, dan mulai dari Prioritas #1 (library fix)! 🎯

Setelah OpenSL test selesai, tap lagu di library — kirim log [PERF] + resolveContentUriToPath. 🎵

---


# 📋 Progress TODO — Sesi Debug PristineAudio

## ✅ SELESAI (Priority #1 — Library Fix)
- [x] **Bug 1**: `PlaybackController::play()` — hanya load track baru kalau `decoderWorker_` null → fix bandingkan `track->uri` vs `currentTrack_.uri`
- [x] **Bug 2**: `DecoderWorker::stop()` — early-return kalau `running_` false, `join()` tidak pernah terpanggil → hapus guard tersebut
- [x] **Bug 3**: `TrackQueue::setTracks()` selalu `currentIndex=0`, tidak sesuai slice ±N di `library.tsx` → fix reorder queue di JS (`playerStore.ts`)
- [x] Verifikasi `NativePlaybackModule` vs `NativePlaybackService` — konfirmasi jalur aktif, `NativePlaybackModule` di-backup jadi `.bak` + comment di `PristineAudioPackage.kt`
- [x] Dummy autoplay dihapus dari `_layout.tsx` (tidak perlu lagi, testing pakai data Library asli)
- [x] Audio dari Library **terbukti keluar dengan benar**

## ✅ SELESAI (MediaSession / Lock Screen)
- [x] `MediaSessionManager.kt` — tambah `updateMetadata()` + `updatePlaybackState()`, notifikasi tidak lagi hardcoded
- [x] `PlaybackService.kt` — expose singleton `instance`
- [x] `PlaybackNativeBridge.kt` — forward ke `PlaybackService.instance`
- [x] `NativePlaybackService.kt` — tambah `@ReactMethod` untuk kedua fungsi
- [x] `playerStore.ts` — panggil `updateMetadata`/`updatePlaybackState` setelah play & saat pause/resume

## ✅ SELESAI (Crash Fix)
- [x] `MainActivity.kt` — `super.onCreate(null)` untuk cegah crash `IllegalStateException: Screen fragments should never be restored`

## ✅ SELESAI (Cleanup)
- [x] `ScannerService.ts`, `useMediaScanner.ts` → dijadikan `.bak` (orphan, tidak dipakai)
- [x] `ScanStatusBar.tsx` diaktifkan kembali di `library.tsx`
- [x] `useScanManager.ts` initial scan diaktifkan kembali + wiring progress

## 🔴 PERLU DIKERJAKAN SEKARANG

- [ ] **Fix TypeScript error `Spec` interface** — `src/specs/NativePlaybackService.ts` belum punya deklarasi `updateMetadata`/`updatePlaybackState`, menyebabkan 3 error `tsc` di `playerStore.ts:290,300,374`
- [ ] **Commit revert `ScanDiffEngine.ts`** — kembali ke versi tanpa `BEGIN TRANSACTION` (yang terbukti hang), sudah divalidasi jalan (507 detik, selesai)

## 🟡 DITUNDA / PERLU RISET

- [ ] **Optimasi kecepatan scan** — `BEGIN TRANSACTION` raw SQL terbukti menyebabkan hang. Perlu riset API transaction resmi `react-native-quick-sqlite` (kemungkinan `db.transaction(callback)` bukan raw SQL string) sebelum coba lagi
- [ ] Progress UI di `EmptyLibrary.tsx` + `LibraryTabBar.tsx` — sudah dibuat, **belum divalidasi visual** karena scan sempat gagal berkali-kali (perlu screenshot ulang setelah revert stabil)
- [ ] `clearCache` di `_layout.tsx` — dipanggil dari JS tapi native method belum ada (`NativePlaybackService.kt` belum punya `clearCache`), cache dir bisa numpuk terus

## 🟢 BACKLOG (dari todo.md awal, belum disentuh sesi ini)

- [ ] Native Cleanup — hapus `PlaybackManager.cpp/.h`, `NativeAudioFeed.cpp`, `fft/`, dll (dead code candidates)
- [ ] Visualizer (Fase 1-3: indicator, waveform, spectrum)
- [ ] AudioConfig UI (Fase 1-3: JNI setter, sliders, auto-detect) — `audioConfig.ts` masih orphan/dokumentasi
- [ ] Fase C — Processing Mode 3-mode (Exclusive/DSP/Immersive)
- [ ] Media session audio focus (di luar metadata — interrupsi panggilan telp, dll)
- [ ] Pembersihan RNTP total (`react-native-track-player` sudah tidak dipakai?)
- [ ] Glitch chipmunk di audio dummy Enya (item debug terpisah yang disebut di awal sesi)
- [ ] Cek isi `PlaybackNativeBridge` — sudah pernah dibaca, tapi belum ada audit menyeluruh
- [ ] Komentar header salah di `api/scanner.ts` (`services/LibraryScanner.ts` → seharusnya `api/scanner.ts`)

---

Mau lanjut ke item 🔴 pertama (fix `Spec` interface)?