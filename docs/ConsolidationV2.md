📄 consolidationv2.md — Revisi

# Plan — Konsolidasi & Debugging Native ⟷ JS/UI

**Status per 15 September 2026 (rev 2)**
Dokumen ini menggabungkan hasil debugging audio engine (PlaybackController → AudioEngine → Oboe),
inventarisasi JNI, roadmap fitur, dan insight dari analisis pasar audiophile.
Menggantikan `plan-consolidation-debugging.md` yang sudah terlalu panjang.

---

## 🎯 TL;DR

1. **Audio engine sudah menghasilkan suara** — `readSamples=X/X`, decoder FFmpeg sukses decode.
   Ini terobosan terbesar dari sesi debugging.
2. **Masalah terakhir: distorsi audio** karena sample rate mismatch antar layer.
   Fix sementara: **hardcode 48000** (match device native mayoritas Android).
3. **Target market**: user budget audiophile yang sadar tuning, tapi tidak mau root HP.
4. **Positioning**: "DAP tanpa root" — DSP built-in, Oboe exclusive, AutoEQ import, tanpa Wavelet/V4A.
5. **Backlog jangka panjang**: dynamic sample rate, bit-perfect USB DAC (Android 14+), 
   3-mode processing, signal path visualization.

---

## 📊 Konteks Pasar (Insight dari Analisis Audiophile)

### Dua Persona User Target

**Persona A — Budget Rookie (mayoritas)**
- Pakai HP mid-range (POCO, Redmi, Samsung A-series)
- IEM entry-mid (GK Kunten, KZ, Moondrop Chu)
- Player: AIMP, Musicolet
- DSP: Wavelet (non-root) atau V4A (root, tapi minoritas)
- Butuh: tuning mudah, hasil nyata, tidak ribet

**Persona B — Advanced Audiophile (minoritas)**
- Pakai HP flagship atau dedicated DAP
- IEM mid-high atau headphone
- USB DAC eksternal
- Sadar sample rate, bit-perfect, chain audio
- Butuh: transparansi, kontrol, USB DAC support

**Kesimpulan**: PristineAudio harus **melayani kedua persona**, tapi fokus v1.0 ke **Persona A**.

### Positioning Strategis

| Aspek | Wavelet | V4A | **PristineAudio** |
|-------|:---:|:---:|:---:|
| Butuh Root | ❌ | ✅ | ❌ |
| DSP Built-in | ✅ | ✅ | ✅ |
| Oboe Exclusive | ❌ | ❌ | ✅ |
| AutoEQ Import | ⚠️ Manual | ✅ Manual | ✅ Built-in |
| Signal Path UI | ❌ | ❌ | ✅ |
| USB DAC Bit-Perfect | ❌ | ⚠️ Root-only | ✅ (Fase 3+) |

**Posisi unik**: **DAP tanpa root, DSP built-in, USB DAC ready.**

---

## ✅ Yang Sudah Selesai

### A. Native Engine — WIRING

| Item | Status | Bukti |
|------|:---:|-------|
| Patch wiring `PlaybackController → AudioEngine` | ✅ | Build sukses |
| Fix linker `PlaybackMetrics.cpp` | ✅ | File dibuat |
| `PlaybackController::play()` load track | ✅ | Log `play(): SUCCESS` |
| Konfirmasi tidak ada jalur ganda | ✅ | `PlaybackManager` = dead code |
| `JNI_OnLoad` → `EngineManager::start()` | ✅ | Log `PristineJNI` |
| `libpristine-audio.so` load | ✅ | Via `System.loadLibrary` |

### B. Build & Environment

| Item | Status | Bukti |
|------|:---:|-------|
| `newArchEnabled=true` + `enableBridgeless=true` | ✅ | 3 file konsisten |
| `expo-dev-client` downgrade ke SDK 55 | ✅ | `~55.0.40` |
| Fix tema `MainActivity` AppCompat | ✅ | Tidak crash |
| Bundle embed di APK | ✅ | `DUMMY` di bundle |
| Standard `ReactNativeHost` | ✅ | Tanpa Expo wrapper |
| Bersihkan RNTP | ✅ | Manifest, gradle, maven |

### C. Audio Pipeline — **BREAKTHROUGH**

| Item | Status | Bukti |
|------|:---:|-------|
| JS → Native bridge | ✅ | `setQueue()`, `play()` |
| `PlaybackController::play()` | ✅ | `play(): SUCCESS` |
| `loadTrack()` | ✅ | `startDecoder=true` |
| FFmpeg buka file | ✅ | `onOpen: success` |
| FFmpeg decode frame | ✅ | `framesDecoded=5015` |
| FFmpeg resample | ✅ | `setupResampler` jalan |
| Decoder push ke `pcmQueue_` | ✅ | `readSamples=X/X` |
| Oboe kirim ke speaker | ✅ | `requestStart returned 0` |
| **Audio keluar** | ✅ | **Terbukti (meski distorsi)** |

### D. Layout & UI

| Item | Status |
|------|:---:|
| `(drawer)/_layout.tsx` → `<Drawer>` | ✅ |
| `(drawer)/(tabs)/_layout.tsx` → `<Tabs>` | ✅ |
| Root `_layout.tsx` disederhanakan | ✅ |
| `index.tsx` onboarding redirect | ✅ |
| FloatingPlayer dirender | ✅ |

---

## 🔴 Blocker Saat Ini

### 1. Audio Distorsi — Sample Rate Mismatch

**Gejala**: Suara mesin, rhythm tidak jelas, mati setelah beberapa detik.

**Root cause**: Double resampling.
```

MP3 44100 → FFmpeg resample ke 44100
→ Oboe internal 44100
→ Device native 48000
→ Oboe resample realtime 44100 → 48000 (qual=Medium) ❌

```

**Fix sementara (in progress via CI)**: Hardcode **48000** di:
- `AudioConstants.h` → `kDefaultSampleRate = 48000`
- `AudioStreamController.cpp` → `builder.setSampleRate(48000)`
- `DecoderTypes.h` → `targetSampleRate = 48000`

**Verifikasi di log**: `OboeAudio: rate: 48000 to 48000`

### 2. Audio Berhenti Setelah 18 Detik

**Kemungkinan**: File test durasi 18 detik habis, decoder EOF, queue kosong.

**Belum di-debug** — fokus dulu ke distorsi.

### 3. Console Error `NativePlaybackModule`

**Status**: Sudah fix dengan `@ReactMethod(isBlockingSynchronousMethod = true)`.

---

## 🚀 Roadmap Berikutnya (Prioritas Berurutan)

### Prioritas 1 — Konfirmasi Audio Jernih (SEKARANG)

- [ ] Tunggu CI Build Dev APK selesai
- [ ] Download & install APK di HP B
- [ ] Test dummy autoplay (10 detik)
- [ ] Cek log: `OboeAudio: rate: 48000 to 48000`
- [ ] Cek log: `readSamples=X/X`
- [ ] **Dengarkan**: jernih? rhythm jelas? bertahan?

**Kalau jernih** → Prioritas 2
**Kalau masih distorsi** → cek perf mode, buffer size, format I32 vs FLOAT

### Prioritas 2 — Test Manual Play dari UI

- [ ] Tap lagu di library (bukan dummy autoplay)
- [ ] Test **play/pause** dari floating player
- [ ] Test **next/previous**
- [ ] Test **seek** (drag progress bar)
- [ ] Konfirmasi floating player muncul dengan metadata
- [ ] Test **buka full player** dari floating player

### Prioritas 3 — Test Multi-Format

- [ ] MP3 (sudah ✅)
- [ ] FLAC (test `Two Steps From Hell - Wild Heart.flac`)
- [ ] M4A/AAC (kalau ada)
- [ ] Konfirmasi decoder handle semua format

### Prioritas 4 — Stabilitas Playback

- [ ] Play 5-10 menit → cek `readSamples` stabil
- [ ] Play → pause → play → cek buffer recovery
- [ ] Play → next → next → cek queue handling
- [ ] Cek underrun/glitch

### Prioritas 5 — Fase B: Inventarisasi JNI Final

- [ ] Re-grep `JNIEXPORT` di `jni/*.cpp` (cakupan penuh)
- [ ] Konfirmasi status folder `fft/` — dipakai atau dead code?
- [ ] Keputusan prioritas untuk modul belum ter-bridge:
  - `dsp/convolution/*` (cabinet/room/IR sim)
  - `dsp/headphone/*` (crossfeed, correction)
  - `session/*` (audio focus, noisy receiver)
  - `usb/*` (clock sync, DAC capabilities)
- [ ] Konfirmasi USB DAC — native atau Android SDK?

### Prioritas 6 — Fase C: Sinkronisasi UI

- [ ] **Processing Mode 3-mode setara**: Exclusive / DSP / Immersive
  - Patch 7 file sudah dirancang (lihat sesi sebelumnya)
  - Chain C++ lengkap, orphan di Kotlin/TS
- [ ] **Media session**: notifikasi, lock screen, audio focus, noisy receiver
- [ ] **Pembersihan RNTP total**: `pnpm remove react-native-track-player`,
  `globals.d.ts`, `scripts/patch-pristine.sh`, `app.json`, workflow CI
- [ ] **Expose `AudioStreamController::isExclusive()`** ke JS
- [ ] **`setProcessingMode` orphan** — 1 baris `external fun` + TS spec

---

## 💎 Fitur Pembeda (Insight Audiophile)

Fitur-fitur ini **berdasarkan analisis mendalam target market** audiophile Indonesia
(artikel Wavelet & V4A) dan **tidak ada di player Android lain**.

### F1. Signal Path Visualization (⭐⭐⭐⭐⭐)

**Ide**: Tampilkan chain audio real-time di UI.

```

┌─────────────────────────────┐
│  PristineAudio Signal Path  │
├─────────────────────────────┤
│  FLAC 44.1/16               │
│      ↓                      │
│  Decoder (FFmpeg)           │
│      ↓                      │
│  DSP: [AutoEQ ON] [EQ OFF]  │
│      ↓                      │
│  Oboe: [Exclusive] [48k]    │
│      ↓                      │
│  Output: USB DAC / Speaker  │
└─────────────────────────────┘

```

**Effort**: 3-5 hari
**Nilai**: User audiophile sangat menghargai transparansi ini

### F2. AutoEQ Profile Import (⭐⭐⭐⭐⭐)

**Ide**: Import AutoEQ profile dari Squiglink tanpa perlu Wavelet.

**Alur**:
1. User pilih IEM (mis. "GK Kunten") dari database
2. App fetch AutoEQ profile
3. Apply ke DSP internal
4. Tampilkan preview curve

**Effort**: 5-7 hari
**Nilai**: Shortcut untuk tuning yang tepat, high-value feature

### F3. Sample Rate Indicator + Warning (⭐⭐⭐⭐)

**Ide**: Tampilkan perbedaan sample rate file vs output.

```

🔒 Bit-Perfect        — File 44100 = Output 44100
⚠️ Resampled          — File 44100 → Output 48000
🎵 High-Fidelity      — DSP aktif, output stabil

```

**Effort**: 2-3 hari
**Nilai**: Edukasi user + transparansi

### F4. USB DAC Auto-Detect + Bit-Perfect Toggle (⭐⭐⭐⭐⭐)

**Ide**: Deteksi USB DAC, baca capability, reconfigure Oboe.

**Alur**:
1. User colok USB DAC via OTG
2. App deteksi via `UsbManager` + `AudioDeviceInfo`
3. Baca `getSampleRates()` & `getChannelCounts()`
4. Reconfigure Oboe ke rate DAC
5. Tampilkan: **"🔒 Bit-Perfect dengan [Nama DAC]"**

**Effort**: 1-2 minggu
**Nilai**: **Killer feature** untuk audiophile

### F5. Volume Slider Warning (⭐⭐⭐)

**Ide**: Warning saat user turunkan volume software (mengubah bit).

**Effort**: 1 hari
**Nilai**: Edukasi audiophile

### F6. AudioEffect Conflict Detection (⭐⭐⭐⭐)

**Ide**: Deteksi Wavelet/V4A/JamesDSP aktif, tawarkan nonaktifkan.

**Alur**:
1. Saat PristineAudio start → cek `AudioEffect` aktif
2. Kalau Wavelet/V4A terdeteksi → tampilkan warning
3. Tawarkan nonaktifkan sementara

**Effort**: 2-3 hari
**Nilai**: Mencegah double-processing

### F7. Reference Track Playlist (⭐⭐)

**Ide**: Template playlist berisi track untuk test tuning.

Kategori:
- Vocal (Norah Jones, Adele)
- Acoustic (Eric Clapton Unplugged)
- Bass-heavy (Billie Eilish, Hans Zimmer)
- Classical (Beethoven Symphony 5)
- Electronic (Daft Punk)
- Cymbal detail (Dave Brubeck)

**Effort**: 1 hari (konten)
**Nilai**: Membantu user tuning

---

## 📋 Backlog Jangka Panjang (Audiophile & Optimalisasi)

### Dynamic Sample Rate Detection (v1.1)

**Ide**: Baca native rate device saat init, set internal rate = native.

```cpp
builder.setSampleRate(0);  // device pilih native
builder.openStream(stream);
int32_t nativeRate = stream->getSampleRate();
// Propagate ke DecoderTypes, AudioCallback
```

Effort: ~3-5 hari
Manfaat: Setiap device dapat native rate → tidak ada resample di Oboe

Sample Rate Switching Per-Track (v1.2)

Ide: Saat user ganti lagu, baca rate file, reconfigure Oboe.

Effort: ~1 minggu
Manfaat: File 96000 FLAC diputar tanpa resample turun

Bit-Perfect via AudioMixerAttributes (v2.0)

Ide: Bypass Android mixer + match exact rate file → DAC.

Butuh:

· Android 14+ API
· USB DAC eksternal
· File lossless (FLAC/WAV/DSD)
· Volume software 100%
· DSP bypass total
· Sample rate file ≤ DAC capability

Effort: ~2-3 minggu
Manfaat: Bit-perfect sejati untuk user audiophile

Realita:

· Bukan: HP highend + Android 14+ = otomatis bit-perfect
· Adalah: USB DAC + Android 14+ + file lossless + API implementation
· Fallback: High-Fidelity (resampled) untuk internal speaker/headphone
· Deteksi otomatis: Cek USB DAC → tawarkan Bit-Perfect Mode

3-Mode Processing (Fase C)

Mode processingMode exclusiveMode immersiveEnabled Android FX
Exclusive BitPerfect (0) true false released
DSP DSP (1) false false aktif
Immersive Immersive (2) false true released

Patch 7 file (siap tempel dari sesi sebelumnya):

1. NativeDSPModule.kt
2. NativeDSPModule.ts
3. engine.ts — applyProcessingMode()
4. playerStore.ts
5. _layout.tsx — migrasi AsyncStorage
6. onboarding.tsx — 3 mode card
7. settings.tsx — modal picker

Modul Belum Ter-bridge (Backlog Resmi)

Modul Lokasi Status
Convolution engine dsp/convolution/* Nol JNI surface
Headphone correction dsp/headphone/* Nol JNI surface
Session management session/* Cek MediaSessionManager.kt
USB granular control usb/* Cek UsbManager Android SDK
Profiling tools profiling/* Skip
FFT standalone fft/* Kemungkinan dead code

---

📋 Catatan Silang Referensi

Item Status
PlaybackManager.cpp/.h ✅ Dikonfirmasi dead code, kandidat hapus
PlaybackController::play() fix ✅ Diterapkan
NativePlaybackModule.kt @ReactMethod ✅ Fix
NativeAudioFeed.cpp RNTP fork, kandidat hapus
NativeDeviceModule.nativeGetDevices() Belum diverifikasi
initPlaybackModule() Vestigial, tidak berbahaya
Sample rate hardcode 48000 🟡 Sementara, fix = dynamic
AudioMixerAttributes 🟢 Backlog v2.0
Immersive 3-mode 🟡 Design final, patch siap

---

🛠️ Tooling & Environment

Setup Development

· HP A: Termux + Node.js + Metro + adb (WiFi ADB)
· HP B: PristineAudio + Logcat Reader + test MP3
· Alternatif: Laptop Win 8 + WebADB
· CI: GitHub Actions untuk build APK

Log Filter Debugging

· Logcat Reader app: tag PlaybackController|NativePlaybackModule|PristineJNI|OboeAudio|FFmpeg|AudioCallback
· Termux: adb logcat | grep -E "PlaybackController|OboeAudio|FFmpeg"

File yang Sudah Dimodifikasi (Rekap)

Native C++:

· core/AudioConstants.h — kDefaultSampleRate = 48000
· core/AudioStreamController.cpp — builder.setSampleRate(48000)
· core/AudioEngine.cpp — setSampleRate() di start()
· core/AudioCallback.cpp/.h — cabang ke PlaybackController::render()
· decoder/DecoderTypes.h — targetSampleRate = 48000
· playback/PlaybackController.cpp — logging + fix
· playback/PlaybackMetrics.cpp — file baru
· jni/NativePlaybackModule.cpp — logging
· jni/OnLoad.cpp — EngineManager::start()

Android Kotlin:

· MainApplication.kt — System.loadLibrary
· MainActivity.kt — standard delegate
· NativePlaybackModule.kt — isBlockingSynchronousMethod
· AndroidManifest.xml — AppCompat theme, hapus RNTP

JavaScript:

· app/_layout.tsx — dummy autoplay, 4 route stack
· app/(drawer)/_layout.tsx — <Drawer>
· app/(drawer)/(tabs)/_layout.tsx — <Tabs> + <FloatingPlayer>
· app/index.tsx — onboarding redirect

Build & Config:

· app.json — hapus expo-dev-client, enableBridgeless=true
· android/gradle.properties — new arch + bridgeless
· .gitignore — *.backup_*, *.bak_*

---

🎯 Urutan Eksekusi Ringkas

```
[SEKARANG] Test audio dengan sample rate 48000
     ↓
Konfirmasi audio jernih
     ↓
Prioritas 2: Test manual play dari UI
     ↓
Prioritas 3: Test multi-format (FLAC, M4A)
     ↓
Prioritas 4: Stabilitas playback
     ↓
Fase B: Inventarisasi JNI + keputusan prioritas
     ↓
Fase C: Sinkronisasi UI + 3-mode + media session + cleanup RNTP
     ↓
Fitur pembeda (F1-F7): Signal path, AutoEQ import, Sample rate UI,
                        USB DAC auto-detect, dll
     ↓
v1.1: Dynamic sample rate detection
     ↓
v1.2: Sample rate switching per-track
     ↓
v2.0: Bit-perfect (AudioMixerAttributes + USB DAC)
```

---

📊 Metric Keberhasilan

Metric Target Status
readSamples=X/X stabil ✅ Tercapai
OboeAudio: rate: 48000 to 48000 🟡 Sedang di-test
Audio jernih (tanpa distorsi) 🟡 Sedang di-test
Play bertahan > 60 detik ⏳ Belum di-test
Manual play dari UI berfungsi ⏳ Belum di-test
FLAC dapat diputar ⏳ Belum di-test
Signal Path UI ⏳ Backlog Fase C
AutoEQ import ⏳ Backlog Fase C
USB DAC bit-perfect ⏳ Backlog v2.0

---

💡 Insight Kunci dari Sesi Ini

1. CI vs Local: Debugging audio di CI tidak berguna. WiFi ADB + Logcat Reader jauh lebih cepat.
2. Sample rate consistency: Harus konsisten antar layer. Double resample = distorsi.
   Untuk Android mayoritas, hardcode 48000 = solusi praktis v1.0.
3. Bit-perfect realism: Bukan "HP flagship + Android 14+ = bit-perfect".
   Bit-perfect = USB DAC + Android 14+ + file lossless + API implementation benar.
   95% user tidak akan dengar perbedaan resample 1x.
4. Native log informatif: Level INFO untuk path kritis, bukan DEBUG.
5. Bundle production + embed: Wajib untuk CI test.
6. Target market audiophile Indonesia:
   · Persona A (mayoritas): budget, non-root, Wavelet/AIMP
   · Persona B (minoritas): advanced, USB DAC, bit-perfect
   · PristineAudio posisi: DAP tanpa root + DSP built-in + USB DAC ready
7. Filosofi audiophile sejati: Processing sesedikit mungkin, tepat sasaran.
   EQ untuk koreksi (AutoEQ), bukan untuk memamerkan DSP.

---

🎯 Action Item Segera

Untuk Sesi Berikutnya

1. Test APK baru (48000 sample rate) — konfirmasi audio jernih
2. Kalau jernih: test manual play, next/prev, seek
3. Catat fitur pembeda F1-F7 sebagai backlog Fase C
4. Kalau masih distorsi: debug layer lain (perf mode, buffer, format)

Untuk Repo

☐ Commit consolidationv2.md (revisi ini)
☐ Hapus consolidation.md lama
☐ Update .github/workflows/build-dev-apk.yml dengan embed bundle
☐ Hapus file backup & script debug dari git history (opsional)

---

📚 Referensi Cepat

· Expo SDK: 55.0.30
· React Native: 0.83.10
· New Architecture: enabled + bridgeless
· Hermes: enabled
· NDK: 27.1.12297006
· CMake: 3.22.1
· Oboe: 1.9.0
· FFmpeg: prebuilt
· Sample rate target: 48000 (sementara)

---

📎 Lampiran: Konsep Audiophile Referensi

Chain Audio Android (yang user anggap vs realita)

User anggap:

```
Player → V4A/Wavelet → DAC
```

Realita:

```
Player (AudioTrack)
     ↓
AudioFlinger Mixer ← V4A/Wavelet inject di sini (AudioEffect API)
     ↓
Audio HAL
     ↓
DAC
```

Implikasi:

· V4A/Wavelet userspace, bukan kernel-level
· Kalau volume < 100%, sample sudah di-scale sebelum DSP
· Notifikasi/alarm ter-mix dengan musik (kecuali Airplane Mode)

Sample Rate di Android

Layer Native Rate
MP3/AAC file 44100
FLAC 16/44.1 44100
FLAC 24/96 96000
HP mid-range 48000
HP flagship lama 44100
USB DAC Bervariasi (44.1-384 kHz)
Bluetooth SBC 48000
Bluetooth LDAC 96000

Kesimpulan: Tidak ada rate "universal". Dynamic detection = solusi jangka panjang.

Bit-Perfect Checklist

Untuk klaim "Bit-Perfect Mode" di PristineAudio, semua ini harus terpenuhi:

# Syarat
1 Android 14+
2 USB DAC eksternal terhubung
3 File lossless (FLAC/WAV/DSD)
4 Sample rate file ≤ DAC capability
5 Volume software 100%
6 DSP bypass total
7 Oboe Exclusive sharing mode
8 AudioMixerAttributes BIT_PERFECT via JNI
9 Sample rate switching match file
10 USB DAC expose rate via AudioDeviceInfo

Kalau salah satu tidak terpenuhi → bukan bit-perfect → fallback ke "High-Fidelity Resampled".



---



Dokumen ini = single source of truth untuk semua status, roadmap, backlog, dan insight pasar ke depannya. 🎯