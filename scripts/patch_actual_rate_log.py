#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/core/AudioStreamController.cpp')
if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
original = c

# Cari baris setelah openStream
import re
pattern = r'(builder\.openStream\([^)]+\))'
match = re.search(pattern, c)

if match and 'OPEN RESULT' not in c:
    old = match.group(1)
    new = old + '''

    // 🔥 DEBUG: log actual stream rate
    {
        int32_t actualRate = mStream ? mStream->getSampleRate() : 0;
        int32_t actualFrames = mStream ? mStream->getFramesPerBurst() : 0;
        __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
            "OPEN RESULT: ACTUAL rate=%d, framesPerBurst=%d",
            actualRate, actualFrames);
        if (actualRate != 48000) {
            __android_log_print(ANDROID_LOG_ERROR, "AudioStreamController",
                "❌ RATE MISMATCH! Actual=%d (expected 48000), ratio %.2fx",
                actualRate, (float)actualRate / 48000.0f);
        }
    }'''
    c = c.replace(old, new, 1)
    print("✅ Log actual rate ditambahkan")

if c != original:
    FILE.write_text(c)
    print("🎉 Patch applied!")
else:
    print("⚠️  Pattern tidak ketemu atau log sudah ada")
