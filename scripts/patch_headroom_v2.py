#!/usr/bin/env python3
"""
Fix v2: Turunkan gain 3 dB setelah resample.
Pattern lebih fleksibel untuk menangani indentasi tidak konsisten.
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = f"{FILE}.bak_{ts}"
shutil.copy2(FILE, backup)
print(f"✅ Backup: {backup}")

lines = FILE.read_text().split('\n')
out_lines = []

inserted = False
for i, line in enumerate(lines):
    out_lines.append(line)

    # Cari baris `temp.resize(converted * channels);`
    stripped = line.strip()
    if not inserted and stripped == 'temp.resize(converted * channels);':
        # Deteksi indentasi baris ini
        indent = line[:len(line) - len(line.lstrip())]

        # Sisipkan gain 3 dB setelah baris ini
        out_lines.append('')
        out_lines.append(f'{indent}// 🔥 FIX: turunkan gain 3 dB untuk headroom')
        out_lines.append(f'{indent}constexpr float kGain = 0.707f;  // -3 dB')
        out_lines.append(f'{indent}for (float& s : temp) {{')
        out_lines.append(f'{indent}    s *= kGain;')
        out_lines.append(f'{indent}}}')

        inserted = True
        print(f"✅ Gain 3 dB disisipkan setelah line {i+1}")
        print(f"   Indentasi: {len(indent)} spasi")

if inserted:
    FILE.write_text('\n'.join(out_lines))
    print("")
    print("🎉 Fix applied!")
else:
    print("")
    print("⚠️  `temp.resize(converted * channels);` tidak ketemu!")
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
