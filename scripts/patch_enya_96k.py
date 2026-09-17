#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Fix 1: filter_size 128 → 256
old1 = 'av_opt_set_int(swrCtx_, "filter_size", 128, 0);'
new1 = 'av_opt_set_int(swrCtx_, "filter_size", 256, 0);'
if old1 in c:
    c = c.replace(old1, new1, 1)
    print("✅ Fix 1: filter_size 128 → 256")

# Fix 2: tambah cutoff 0.95
old2 = 'av_opt_set_int(swrCtx_, "filter_size", 256, 0);'
new2 = '''av_opt_set_int(swrCtx_, "filter_size", 256, 0);
    av_opt_set_double(swrCtx_, "cutoff", 0.95, 0);  // 🔥 anti-alias lebih agresif'''
if old2 in c:
    c = c.replace(old2, new2, 1)
    print("✅ Fix 2: cutoff 0.95")

# Fix 3: dither_scale 1.0 → 0.5
old3 = 'av_opt_set_double(swrCtx_, "dither_scale", 1.0, 0);'
new3 = 'av_opt_set_double(swrCtx_, "dither_scale", 0.5, 0);  // 🔥 turun dari 1.0'
if old3 in c:
    c = c.replace(old3, new3, 1)
    print("✅ Fix 3: dither_scale 0.5")

# Update log message
c = c.replace('filter_size=128, dither=triangular', 'filter_size=256, cutoff=0.95, dither=0.5')
print("✅ Log message updated")

FILE.write_text(c)
print("🎉 Selesai!")
