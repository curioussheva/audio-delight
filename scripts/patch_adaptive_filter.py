#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari baris filter_size, ganti dengan adaptive
old = 'av_opt_set_int(swrCtx_, "filter_size", 128, 0);'

new = '''// 🔥 Adaptive filter: filter lebih kecil untuk file >48k (CPU heavy)
    int filterSize = codecCtx_->sample_rate > 48000 ? 64 : 128;
    av_opt_set_int(swrCtx_, "filter_size", filterSize, 0);'''

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Adaptive filter: 64 (>48k) / 128 (≤48k)")
else:
    print("⚠️  Pattern tidak ketemu")
