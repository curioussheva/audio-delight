#!/usr/bin/env python3
"""
Fix flow control + filter:
1. Data drop detection (check write return)
2. Tighter hysteresis: pause 70%, resume 50%
3. Revert filter 256 → 128
4. Revert cutoff 0.95 → 0.97
"""

from pathlib import Path
from datetime import datetime
import shutil

PC = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
FF = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
for f in [PC, FF]:
    shutil.copy2(f, f"{f}.bak_{ts}")
    print(f"✅ Backup: {f}.bak_{ts}")

# ============================================================
# Fix 1 + 2: PlaybackController.cpp
# ============================================================
c = PC.read_text()
original = c

# --- Fix 1 + 2: callback + hysteresis ---
old_cb = '''        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );

                    // 🔥 FLOW CONTROL: pause decoder kalau queue hampir penuh
                    size_t avail = pcmQueue_->availableFrames();
                    size_t cap = pcmQueue_->capacityFrames();
                    if (avail > cap * 80 / 100) {
                        if (decoderWorker_) {
                            decoderWorker_->pause();
                            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                "Decoder PAUSED (queue %zu%% full)",
                                100 * avail / cap);
                        }
                    }
                }
            }
        );'''

new_cb = '''        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    size_t written = pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );

                    // 🔥 FIX 1: detect data drop (silent overflow)
                    if (written < result.samples.size()) {
                        static int dropCount = 0;
                        dropCount++;
                        if (dropCount % 20 == 0) {
                            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                                "DATA DROP: wrote %zu/%zu (queue %zu/%zu) [total drops=%d]",
                                written, result.samples.size(),
                                pcmQueue_->availableFrames(),
                                pcmQueue_->capacityFrames(),
                                dropCount);
                        }
                    }

                    // 🔥 FIX 2: pause decoder kalau queue 70% (turun dari 80%)
                    size_t avail = pcmQueue_->availableFrames();
                    size_t cap = pcmQueue_->capacityFrames();
                    if (avail > cap * 70 / 100) {
                        if (decoderWorker_ && !decoderWorker_->isPaused()) {
                            decoderWorker_->pause();
                            static int pauseCount = 0;
                            pauseCount++;
                            if (pauseCount % 20 == 0) {
                                __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                    "Decoder PAUSED (queue %zu%% full) [total pauses=%d]",
                                    100 * avail / cap, pauseCount);
                            }
                        }
                    }
                }
            }
        );'''

if old_cb in c:
    c = c.replace(old_cb, new_cb, 1)
    print("✅ Fix 1+2: data drop detection + pause 70%")
else:
    print("⚠️  Callback pattern tidak ketemu")

# --- Fix 2b: Resume threshold 30% → 50% ---
old_resume = '''    // 🔥 FLOW CONTROL: resume decoder kalau queue low
    if (pcmQueue_ && decoderWorker_) {
        size_t avail = pcmQueue_->availableFrames();
        size_t cap = pcmQueue_->capacityFrames();
        if (avail < cap * 30 / 100 && decoderWorker_->isPaused()) {
            decoderWorker_->resume();
        }
    }'''

new_resume = '''    // 🔥 FIX 2: resume decoder kalau queue 50% (naik dari 30%)
    if (pcmQueue_ && decoderWorker_) {
        size_t avail = pcmQueue_->availableFrames();
        size_t cap = pcmQueue_->capacityFrames();
        if (avail < cap * 50 / 100 && decoderWorker_->isPaused()) {
            decoderWorker_->resume();
        }
    }'''

if old_resume in c:
    c = c.replace(old_resume, new_resume, 1)
    print("✅ Fix 2b: resume threshold 30% → 50%")
else:
    print("⚠️  Resume pattern tidak ketemu")

if c != original:
    PC.write_text(c)
    print("✅ PlaybackController.cpp updated")

# ============================================================
# Fix 3 + 4: Revert filter 256 → 128, cutoff 0.95 → 0.97
# ============================================================
c = FF.read_text()
original = c

# Revert filter_size
if 'av_opt_set_int(swrCtx_, "filter_size", 256, 0);' in c:
    c = c.replace(
        'av_opt_set_int(swrCtx_, "filter_size", 256, 0);',
        'av_opt_set_int(swrCtx_, "filter_size", 128, 0);',
        1
    )
    print("✅ Fix 3: filter_size 256 → 128")

# Revert cutoff
if 'av_opt_set_double(swrCtx_, "cutoff", 0.95, 0);' in c:
    c = c.replace(
        'av_opt_set_double(swrCtx_, "cutoff", 0.95, 0);',
        'av_opt_set_double(swrCtx_, "cutoff", 0.97, 0);',
        1
    )
    print("✅ Fix 4: cutoff 0.95 → 0.97")

# Update log message
c = c.replace(
    'filter_size=256, cutoff=0.95, dither=0.5',
    'filter_size=128, cutoff=0.97, dither=0.5'
)

if c != original:
    FF.write_text(c)
    print("✅ FFmpegDecoder.cpp updated")

print("")
print("🎉 Semua fix selesai!")
