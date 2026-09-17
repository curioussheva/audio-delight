#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('src/app/(drawer)/(tabs)/library.tsx')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari line spesifik
old = 'onPress={() => handleSongPress(item, validSongs)}'

new = '''onPress={() => {
                  // 🔥 FIX: kirim slice sekitar lagu, bukan 1195 lagu semua
                  const idx = validSongs.findIndex((s: any) => s.id === item.id);
                  const start = Math.max(0, idx - 10);
                  const end = Math.min(validSongs.length, idx + 40);
                  handleSongPress(item, validSongs.slice(start, end));
                }}'''

if old in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Fix applied: queue slice 50 lagu")
else:
    print("⚠️  Pattern tidak ketemu")
    print("   Cek manual: cari 'onPress={() => handleSongPress(item, validSongs)}'")
