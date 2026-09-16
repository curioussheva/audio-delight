#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Sisipkan NaN check setelah temp.resize
old = '''                temp.resize(converted * channels);'''

new = '''                temp.resize(converted * channels);

                // 🔥 NaN/Inf detection
                int nanCount = 0;
                for (float& v : temp) {
                    if (std::isnan(v) || std::isinf(v)) {
                        nanCount++;
                        v = 0.0f;
                    }
                }
                if (nanCount > 0) {
                    __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                        "NaN/Inf detected: %d of %zu samples cleaned",
                        nanCount, temp.size());
                }'''

if old in c and 'NaN/Inf detected' not in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ NaN detection ditambahkan")
else:
    print("⚠️  Pattern tidak ketemu atau sudah ada")

# Tambah include <cmath>
if '#include <cmath>' not in c:
    c = FILE.read_text()
    c = c.replace('#include <android/log.h>', 
                  '#include <android/log.h>\n#include <cmath>')
    FILE.write_text(c)
    print("✅ #include <cmath> ditambahkan")
