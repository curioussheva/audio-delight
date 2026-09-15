#!/usr/bin/env python3
"""
Fix: PCMQueue capacity harus power of 2.
48000 * 10 = 480000 bukan 2^n → mask rusak → readSamples=0
Ganti ke 1<<19 = 524288 (power of 2).
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
HEADER = Path('android/app/src/main/cpp/playback/PCMQueue.h')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = f"{FILE}.bak_{ts}"
shutil.copy2(FILE, backup)
print(f"✅ Backup: {backup}")

c = FILE.read_text()
original = c

# Fix 1: Ganti capacity
old = "pcmQueue_ = std::make_shared<PCMQueue>(48000 * 10);"
new = """// 2^19 = 524288 float samples = ~5.5 sec stereo @ 48kHz
    // WAJIB power of 2: PCMQueue pakai bitmask, bukan modulo!
    pcmQueue_ = std::make_shared<PCMQueue>(1 << 19);"""

if old in c:
    c = c.replace(old, new)
    print("✅ Fix: capacity 480000 → 524288 (2^19)")
else:
    # Cari pattern lain
    import re
    pattern = r'pcmQueue_ = std::make_shared<PCMQueue>\([^)]+\);'
    if re.search(pattern, c):
        c = re.sub(pattern,
                   '''// 2^19 = 524288 float samples = ~5.5 sec stereo @ 48kHz
    // WAJIB power of 2: PCMQueue pakai bitmask, bukan modulo!
    pcmQueue_ = std::make_shared<PCMQueue>(1 << 19);''',
                   c, count=1)
        print("✅ Fix: capacity → 1<<19 (via regex)")
    else:
        print("⚠️  Pattern tidak ketemu, cek manual")

if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Fix applied!")
else:
    print("")
    print("⚠️  Tidak ada perubahan")
    shutil.copy2(backup, FILE)
