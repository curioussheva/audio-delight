#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
original = c

# === FIX 1: Pause decoder kalau queue penuh ===
old_cb = '''decoderWorker_->setDecodeCallback(
    [this](decoder::DecodeResult&& result) {
        if (pcmQueue_ && !result.samples.empty()) {
            pcmQueue_->write(
                result.samples.data(),
                result.samples.size()
            );
        }
    }
);'''

new_cb = '''decoderWorker_->setDecodeCallback(
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

if old_cb in c:
    c = c.replace(old_cb, new_cb, 1)
    print("✅ Fix 1: pause decoder on full queue")
else:
    print("⚠️  Fix 1 pattern tidak ketemu")

# === FIX 2: Resume decoder kalau queue low ===
old_render = '''    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);

    // 🔥 SAFETY NET: cleanup NaN/Inf di render'''

new_render = '''    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);

    // 🔥 FLOW CONTROL: resume decoder kalau queue low
    if (pcmQueue_ && decoderWorker_) {
        size_t avail = pcmQueue_->availableFrames();
        size_t cap = pcmQueue_->capacityFrames();
        if (avail < cap * 30 / 100 && decoderWorker_->isPaused()) {
            decoderWorker_->resume();
        }
    }

    // 🔥 SAFETY NET: cleanup NaN/Inf di render'''

if old_render in c:
    c = c.replace(old_render, new_render, 1)
    print("✅ Fix 2: resume decoder on low queue")
else:
    print("⚠️  Fix 2 pattern tidak ketemu")

if c != original:
    FILE.write_text(c)
    print("🎉 Patch flow control selesai!")
else:
    print("❌ Tidak ada perubahan")
    shutil.copy2(f"{FILE}.bak_{ts}", FILE)
