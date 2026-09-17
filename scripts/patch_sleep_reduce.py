#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/DecoderWorker.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")

c = FILE.read_text()
old = 'std::this_thread::sleep_for(std::chrono::microseconds(100));'
new = 'std::this_thread::sleep_for(std::chrono::microseconds(50));'

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Sleep 100us → 50us")
else:
    print("⚠️  Pattern tidak ketemu")
