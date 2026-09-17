#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# 1. Hapus temp.resize (scratch sudah allocate)
old1 = '    temp.resize(converted * channels);\n'
if old1 in c:
    c = c.replace(old1, '')
    print("✅ Fix 1: temp.resize dihapus")

# 2. Gain loop — range-based → index
old2 = '''    for (float& s : temp) {
        s *= kGain;
    }'''
new2 = '''    for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
        temp[i] *= kGain;
    }'''
if old2 in c:
    c = c.replace(old2, new2, 1)
    print("✅ Fix 2: gain loop index-based")

# 3. NaN cleanup — range-based → index
old3 = '''        for (float& v : temp) {
            if (std::isnan(v) || std::isinf(v)) {
                nanCount++;
                v = 0.0f;
            }
        }'''
new3 = '''        for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
            float& v = temp[i];
            if (std::isnan(v) || std::isinf(v)) {
                nanCount++;
                v = 0.0f;
            }
        }'''
if old3 in c:
    c = c.replace(old3, new3, 1)
    print("✅ Fix 3: NaN cleanup index-based")

# 4. Log temp.size() → converted * channels
old4 = 'nanCount, temp.size(), totalNan);'
new4 = 'nanCount, static_cast<size_t>(converted) * channels, totalNan);'
if old4 in c:
    c = c.replace(old4, new4, 1)
    print("✅ Fix 4: temp.size() → converted*channels")

# 5. !temp.empty() → converted > 0
old5 = '&& !temp.empty())'
new5 = '&& converted > 0)'
if old5 in c:
    c = c.replace(old5, new5, 1)
    print("✅ Fix 5: temp.empty() → converted > 0")

# 6. Debug loop — range-based → index
old6 = '''        for (float v : temp) {
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }'''
new6 = '''        for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
            float v = temp[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }'''
if old6 in c:
    c = c.replace(old6, new6, 1)
    print("✅ Fix 6: debug loop index-based")

# 7. Log temp.size() → converted * channels
old7 = 'float meanAbs = static_cast<float>(sumAbs / temp.size());'
new7 = 'float meanAbs = static_cast<float>(sumAbs / (static_cast<size_t>(converted) * channels));'
if old7 in c:
    c = c.replace(old7, new7, 1)
    print("✅ Fix 7: sumAbs / temp.size()")

FILE.write_text(c)
print("🎉 Semua fix selesai!")
