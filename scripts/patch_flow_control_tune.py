#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil
import re

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
original = c

# 1. Perbesar queue 1<<19 → 1<<21
old_q = 'pcmQueue_ = std::make_shared<PCMQueue>(1 << 19)'
new_q = 'pcmQueue_ = std::make_shared<PCMQueue>(1 << 21)  // 🔥 21.8s buffer'
if old_q in c:
    c = c.replace(old_q, new_q, 1)
    print("✅ Queue 1<<19 → 1<<21 (21.8s)")

# 2. Hysteresis: pause 70 → 80
old_p = 'cap * 70 / 100'
new_p = 'cap * 80 / 100'
if old_p in c:
    c = c.replace(old_p, new_p, 1)
    print("✅ Pause threshold 70% → 80%")

# 3. Resume 50 → 40
old_r = 'cap * 50 / 100'
new_r = 'cap * 40 / 100'
if old_r in c:
    c = c.replace(old_r, new_r, 1)
    print("✅ Resume threshold 50% → 40%")

if c != original:
    FILE.write_text(c)
    print("🎉 Patch selesai!")
else:
    print("⚠️ Tidak ada perubahan")
