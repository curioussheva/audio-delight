#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Pattern PERSIS dengan indentasi 8 spasi
old = '''        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );
                }
            }
        );'''

new = '''        decoderWorker_->setDecodeCallback(
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

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Fix 1: pause decoder on full queue")
else:
    print("⚠️  Pattern masih tidak match")
    exit(1)

print("🎉 Patch selesai!")
