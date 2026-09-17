#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# 1. Ganti filter_size 64 → 128
old1 = 'av_opt_set_int(swrCtx_, "filter_size", 64, 0);  // 🔥 light CPU        // default 32 → 128'
new1 = '''// 🔥 filter_size=128 = high quality (default FFmpeg = 32)
    // NOTE: Turunkan ke 32/64 untuk performa di device low-end (fitur optimasi mendatang)
    av_opt_set_int(swrCtx_, "filter_size", 128, 0);'''

if old1 in c:
    c = c.replace(old1, new1, 1)
    print("✅ filter_size 64 → 128")
else:
    # Fallback pattern lain
    import re
    pattern = r'av_opt_set_int\(swrCtx_, "filter_size", \d+, 0\);.*'
    if re.search(pattern, c):
        c = re.sub(pattern,
            '''// 🔥 filter_size=128 = high quality (default FFmpeg = 32)
    // NOTE: Turunkan ke 32/64 untuk performa di device low-end (fitur optimasi mendatang)
    av_opt_set_int(swrCtx_, "filter_size", 128, 0);''',
            c, count=1)
        print("✅ filter_size → 128 (via regex)")

# 2. Fix log message
old2 = '"setupResampler: swr_init ret=%d (filter_size=32, dither=triangular)"'
new2 = '"setupResampler: swr_init ret=%d (filter_size=128, dither=triangular)"'

if old2 in c:
    c = c.replace(old2, new2, 1)
    print("✅ Log message → filter_size=128")
else:
    print("⚠️  Log message tidak ketemu, cek manual")

FILE.write_text(c)
print("🎉 Patch selesai!")
