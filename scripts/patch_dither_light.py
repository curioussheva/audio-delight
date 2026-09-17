#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
old = 'av_opt_set_int(swrCtx_, "filter_size", 128, 0);'
new = 'av_opt_set_int(swrCtx_, "filter_size", 32, 0);  // 🔥 light CPU'

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ filter_size 128 → 32 (CPU 4x lebih ringan)")
else:
    print("⚠️  Pattern tidak ketemu")
