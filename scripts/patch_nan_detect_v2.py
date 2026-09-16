#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')

if 'NaN/Inf detected' in FILE.read_text():
    print("⚠️  Patch sudah ada — skip")
    exit(0)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari baris setelah gain loop (setelah `s *= kGain;` dan `}`)
old = '''    constexpr float kGain = 0.707f;  // -3 dB
    for (float& s : temp) {
        s *= kGain;
    }'''

new = '''    constexpr float kGain = 0.707f;  // -3 dB
    for (float& s : temp) {
        s *= kGain;
    }

    // 🔥 NaN/Inf detection & cleanup
    {
        int nanCount = 0;
        for (float& v : temp) {
            if (std::isnan(v) || std::isinf(v)) {
                nanCount++;
                v = 0.0f;
            }
        }
        static int totalNan = 0;
        totalNan += nanCount;
        if (nanCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "NaN/Inf detected: %d of %zu samples cleaned (total=%d)",
                nanCount, temp.size(), totalNan);
        }
    }'''

if old in c:
    c = c.replace(old, new, 1)
    print("✅ NaN detection ditambahkan setelah gain loop")
else:
    print("⚠️  Pattern gain loop tidak ketemu")
    exit(1)

# Tambah include <cmath> kalau belum ada
if '#include <cmath>' not in c:
    c = c.replace('#include <android/log.h>',
                  '#include <android/log.h>\n#include <cmath>')
    print("✅ #include <cmath> ditambahkan")

FILE.write_text(c)
print("🎉 Patch applied!")
