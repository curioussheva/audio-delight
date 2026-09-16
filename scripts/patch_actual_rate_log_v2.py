#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/core/AudioStreamController.cpp')

if 'OPEN RESULT' in FILE.read_text():
    print("⚠️  Patch sudah ada — skip")
    exit(0)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari dan sisipkan setelah mStream = std::move(stream);
old = """    mStream =
        std::move(stream);"""

new = """    mStream =
        std::move(stream);

    // 🔥 DEBUG: log actual stream rate
    {
        int32_t actualRate = mStream ? mStream->getSampleRate() : 0;
        int32_t actualFrames = mStream ? mStream->getFramesPerBurst() : 0;
        __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
            "OPEN RESULT: ACTUAL rate=%d, framesPerBurst=%d",
            actualRate, actualFrames);
        if (actualRate != 48000) {
            __android_log_print(ANDROID_LOG_ERROR, "AudioStreamController",
                "RATE MISMATCH! Actual=%d (expected 48000), ratio %.2fx",
                actualRate, (float)actualRate / 48000.0f);
        }
    }"""

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Log OPEN RESULT ditambahkan (setelah mStream valid)")
else:
    print("⚠️  Pattern `mStream = std::move(stream);` tidak ketemu")
    exit(1)
