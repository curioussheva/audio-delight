#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/CMakeLists.txt')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari CMAKE_CXX_FLAGS_DEBUG dan ganti -O0 → -O2
old = 'set(CMAKE_CXX_FLAGS_DEBUG   "${CMAKE_CXX_FLAGS_DEBUG} -O0 -g3 -fno-omit-frame-pointer")'
new = 'set(CMAKE_CXX_FLAGS_DEBUG   "${CMAKE_CXX_FLAGS_DEBUG} -O2 -g3 -fno-omit-frame-pointer")  # 🔥 -O2 untuk speed'

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Debug: -O0 → -O2")
else:
    # Cari pattern alternatif
    import re
    pattern = r'set\(CMAKE_CXX_FLAGS_DEBUG.*\)'
    match = re.search(pattern, c)
    if match:
        c = re.sub(pattern, new, c, count=1)
        FILE.write_text(c)
        print("✅ Debug: -O0 → -O2 (via regex)")
    else:
        print("⚠️  Pattern tidak ketemu")

# Verifikasi
print("")
print("=== CMake debug flags ===")
