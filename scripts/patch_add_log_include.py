#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/core/AudioStreamController.cpp')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cek apakah sudah ada
if '<android/log.h>' in c:
    print("⚠️  android/log.h sudah ada — skip")
    exit(0)

# Sisipkan setelah include pertama
lines = c.split('\n')
insert_idx = 0
for i, line in enumerate(lines):
    if line.startswith('#include'):
        insert_idx = i
        break

# Sisipkan setelah include pertama (bukan sebelum)
insert_idx += 1

# Cari baris kosong setelah include pertama
while insert_idx < len(lines) and lines[insert_idx].strip() == '':
    insert_idx += 1

lines.insert(insert_idx, '')
lines.insert(insert_idx + 1, '#include <android/log.h>')

FILE.write_text('\n'.join(lines))
print("✅ #include <android/log.h> ditambahkan")
