#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil, re

FILE = Path('src/app/_layout.tsx')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

new_uri = 'const testUri = "/storage/0403-0201/Music/New Age/Enya_-_Dark_Sky_Island.flac";'
pattern = r'const testUri = "[^"]+";'

if re.search(pattern, c):
    c = re.sub(pattern, new_uri, c, count=1)
    FILE.write_text(c)
    print("✅ testUri diubah ke Enya - Dark Sky Island.flac")
else:
    print("⚠️  Pattern tidak ketemu")
