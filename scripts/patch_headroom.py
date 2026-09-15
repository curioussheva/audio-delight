#!/usr/bin/env python3
"""
Fix: Turunkan gain 3 dB setelah resample untuk headroom.
Resample 44100→48000 bisa peak > 1.0 → clipping di DAC.
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

c = FILE.read_text()
original = c

old = """            if (converted > 0) {
                temp.resize(converted * channels);

                result.samples.insert("""

new = """            if (converted > 0) {
                temp.resize(converted * channels);

                // 🔥 FIX: turunkan gain 3 dB (0.707x) untuk headroom
                // Resample 44100→48000 bisa peak > 1.0 → clipping di DAC
                constexpr float kGain = 0.707f;  // -3 dB
                for (float& s : temp) {
                    s *= kGain;
                }

                result.samples.insert("""

if old in c:
    c = c.replace(old, new)
    print("✅ Fix: gain 3 dB headroom after resample")
else:
    print("⚠️  Pattern tidak ketemu — cek manual")
    print("   Cari baris: if (converted > 0) { temp.resize(...)")

if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Fix applied!")
else:
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
