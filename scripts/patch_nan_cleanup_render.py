#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cek apakah sudah ada
if 'nanCount > 0' in c and 'render: cleaned' in c:
    print("⚠️  NaN cleanup di render sudah ada")
    exit(0)

# Pattern: setelah readSamples, sebelum clock advance
old = '''    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);'''

new = '''    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);

    // 🔥 SAFETY NET: cleanup NaN/Inf di render (untuk sisa race boundary)
    {
        int nanCount = 0;
        for (size_t i = 0; i < readSamples; ++i) {
            if (std::isnan(output[i]) || std::isinf(output[i])) {
                output[i] = 0.0f;
                nanCount++;
            }
        }
        static int totalNan = 0;
        totalNan += nanCount;
        if (nanCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                "render: cleaned %d NaN samples (total=%d)",
                nanCount, totalNan);
        }
    }'''

if old in c:
    c = c.replace(old, new, 1)
    print("✅ NaN cleanup di render ditambahkan")
else:
    print("⚠️  Pattern tidak ketemu")
    exit(1)

# Pastikan include <cmath>
if '#include <cmath>' not in c:
    c = c.replace('#include <algorithm>',
                  '#include <algorithm>\n#include <cmath>')
    print("✅ include <cmath> ditambahkan")

FILE.write_text(c)
print("🎉 Patch selesai!")
