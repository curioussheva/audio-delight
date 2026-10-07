
═══════════════════════════════════════════════════════════════
DECODER/RESAMPLER CONSISTENCY ANALYSIS
═══════════════════════════════════════════════════════════════

## ARCHITECTURE OVERVIEW

pristine audio pipeline memiliki 2 layer resampling:

1. **FFmpegDecoder (SwrContext)** - libswresample, high-quality
   - Input:  codecCtx_->sample_rate (native file rate, e.g. 44100)
   - Output: config().targetSampleRate (stream rate, e.g. 48000)
   - Status: ✅ ACTIVE (dipakai di runtime)

2. **StreamResampler (LinearResampler)** - custom DSP
   - Input:  inputFormat_.sampleRate
   - Output: outputFormat_.sampleRate
   - Status: ❌ DEAD CODE (needsResampling() selalu false)

═══════════════════════════════════════════════════════════════
FINDINGS
═══════════════════════════════════════════════════════════════

### 1. StreamResampler adalah DEAD CODE ✅ VERIFIED

**Root cause:**
```cpp
// AudioDecoder::refreshFormats() (line 216-223)
inputFormat_ = onGetInputFormat();  // native rate (44100)
if (!outputFormat_.isValid()) {
    outputFormat_ = inputFormat_;   // copy native rate (44100)
}

// AudioDecoder::needsResampling() (line 160-165)
return inputFormat_.sampleRate != outputFormat_.sampleRate;
// → 44100 != 44100 → FALSE
```

**Impact:**
- `setTargetFormat()` tidak pernah dipanggil di codebase
- `needsResampling()` selalu return false
- `applyResampling()` tidak pernah eksekusi
- StreamResampler + LinearResampler tidak terpakai

**Evidence:**
```bash
$ grep -rn "setTargetFormat" android/app/src/main/cpp/ src/
android/app/src/main/cpp/decoder/AudioDecoder.cpp:153:void AudioDecoder::setTargetFormat(
# HANYA definisi, TIDAK ADA PEMANGGIL
```

═══════════════════════════════════════════════════════════════

### 2. SEMANTIC INCONSISTENCY ⚠️  MEDIUM RISK

**Problem:**
`FFmpegDecoder::onGetInputFormat()` return native file rate (44100),
TAPI PCM sudah resampled ke stream rate (48000) oleh SwrContext.

**Code:**
```cpp
// FFmpegDecoder::onGetInputFormat() (line 397-403)
AudioFormat FFmpegDecoder::onGetInputFormat() const {
    AudioFormat format;
    if (!codecCtx_) return format;
    
    format.sampleRate = codecCtx_->sample_rate;  // ❌ Native rate (44100)
    // PCM actual sudah 48000 dari swr_convert()
    return format;
}
```

**Current impact:**
Tidak menyebabkan bug karena `inputFormat_` tidak dipakai untuk timing.
PlaybackController pakai `streamSampleRate_` (atomic<uint32_t>) yang
di-set langsung dari stream, bukan dari decoder.

**Risk:**
Jika future code rely on `inputFormat_.sampleRate` untuk timing/sync,
akan dapat metadata salah (44100 bukan 48000).

═══════════════════════════════════════════════════════════════

### 3. HARDCODED 48000 BUG 🔴 HIGH SEVERITY

**Location:** PlaybackController.cpp:262

```cpp
bool PlaybackController::seekTo(double seconds) {
    // ...
    clock_->seekToSeconds(seconds, 48000);  // ❌ HARDCODED
    // ...
}
```

**Impact:**
Seek timing salah untuk file non-48kHz.

**Example:**
- File FLAC 44.1kHz, duration 3:00 (180 detik)
- Total frames = 180 * 44100 = 7,938,000
- User seek ke 1:30 (90 detik)

**Actual:**
```
clock_->seekToFrame(90 * 48000) = 4,320,000 frames
```

**Expected:**
```
clock_->seekToFrame(90 * 44100) = 3,969,000 frames
```

**Result:** Seek ke posisi salah (109 detik bukan 90 detik)

═══════════════════════════════════════════════════════════════

### 4. MULTIPLE HARDCODED 48000 ⚠️  CODE SMELL

**Locations:**
```
android/app/src/main/cpp/playback/PlaybackController.cpp:262
android/app/src/main/cpp/playback/SchedulerTypes.h:41, 44
android/app/src/main/cpp/playback/PrebufferManager.h:38
android/app/src/main/cpp/playback/PrebufferManager.cpp:251
android/app/src/main/cpp/playback/DecodedAudioQueue.h:17
```

**Pattern:**
Default fallback 48000 tersebar di banyak file.
Tidak konsisten pakai `streamSampleRate()`.

═══════════════════════════════════════════════════════════════
RECOMMENDATIONS
═══════════════════════════════════════════════════════════════

### Priority 1: FIX hardcoded 48000 di seekTo() — ✅ SELESAI (commit `ebaa24b0b`)

> Diperbaiki 2026-10-07 sebelum pesan ini difinalkan. Lihat
> [`RATE_CHAIN_AUDIT.md`](./RATE_CHAIN_AUDIT.md) §4 untuk verifikasi.


```cpp
// PlaybackController.cpp:262
bool PlaybackController::seekTo(double seconds) {
    decoderWorker_->pause();
    pcmQueue_->clear();
-   clock_->seekToSeconds(seconds, 48000);
+   clock_->seekToSeconds(seconds, streamSampleRate());
    bool ok = decoderWorker_->seek(seconds);
    decoderWorker_->resume();
    return ok;
}
```

### Priority 2: Remove dead code StreamResampler

StreamResampler + LinearResampler tidak pernah aktif.
Hapus untuk clarity (atau implement proper jika memang diperlukan).

**Files to remove:**
- `android/app/src/main/cpp/decoder/StreamResampler.{h,cpp}`
- `android/app/src/main/cpp/resampler/LinearResampler.{h,cpp}`
- `AudioDecoder::applyResampling()`
- `AudioDecoder::needsResampling()`
- `AudioDecoder::setTargetFormat()`

### Priority 3: Fix semantic inconsistency

**Option A (minimal):** Fix onGetInputFormat()
```cpp
AudioFormat FFmpegDecoder::onGetInputFormat() const {
    AudioFormat format;
    if (!codecCtx_) return format;
    
-   format.sampleRate = codecCtx_->sample_rate;
+   format.sampleRate = config().targetSampleRate;  // post-resampled
    format.channels = codecCtx_->ch_layout.nb_channels;
    return format;
}
```

**Option B (better):** Separate native vs output format
```cpp
// Add to AudioDecoder.h
virtual AudioFormat onGetNativeFormat() const = 0;
virtual AudioFormat onGetOutputFormat() const = 0;
```

═══════════════════════════════════════════════════════════════
IMPACT ASSESSMENT
═══════════════════════════════════════════════════════════════

**Bug 3 (hardcoded 48000):**
- Severity: HIGH
- User-visible: YES (seek tidak akurat di file non-48kHz)
- Frequency: SETIAP seek di file 44.1/88.2/96/192kHz
- Fix complexity: LOW (1 line)

**Issue 2 (semantic inconsistency):**
- Severity: MEDIUM
- User-visible: NO (saat ini)
- Risk: Future bugs jika code baru rely on inputFormat_
- Fix complexity: LOW-MEDIUM

**Issue 1 (dead code):**
- Severity: LOW
- User-visible: NO
- Impact: Code clarity, maintenance burden
- Fix complexity: MEDIUM (hapus banyak file)

═══════════════════════════════════════════════════════════════
