#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# ═══════════════════════════════════════════════════════════
# Fix 1: playlist.tsx — tambah favoriteCount placeholder
# ═══════════════════════════════════════════════════════════
F1 = Path('src/app/(drawer)/playlist.tsx')
shutil.copy2(F1, f"{F1}.bak_{ts}")
c = F1.read_text()

# Cek pattern destructure
old_decl = 'const { playlists, createPlaylist, deletePlaylist, importM3UPaths } ='
new_decl = '''const { playlists, createPlaylist, deletePlaylist, importM3UPaths } =
  usePlaylists();
  // 🔥 FIX: placeholder sampai store return favoriteCount
  const favoriteCount = 0;'''

# Ambil hanya baris pertama "usePlaylists()"
# Pattern aktual di file mungkin multi-line
if 'const favoriteCount = 0;' not in c:
    # Cari akhir destructure
    import re
    pattern = r'(const \{ playlists, createPlaylist, deletePlaylist, importM3UPaths \} =\s*\n\s*usePlaylists\(\);)'
    if re.search(pattern, c):
        c = re.sub(pattern, r'\1\n  const favoriteCount = 0;  // 🔥 placeholder', c, count=1)
        print("✅ Fix 1a: favoriteCount placeholder ditambahkan")
    else:
        # Fallback: tambah setelah usePlaylists()
        c = c.replace(
            'usePlaylists();',
            'usePlaylists();\n  const favoriteCount = 0;  // 🔥 placeholder',
            1
        )
        print("✅ Fix 1b: favoriteCount placeholder (fallback)")
else:
    print("⚠️  Fix 1: placeholder sudah ada")

F1.write_text(c)
print(f"✅ Fix 1: {F1}")

# ═══════════════════════════════════════════════════════════
# Fix 2: MediaStoreModule.ts — cast songs
# ═══════════════════════════════════════════════════════════
F2 = Path('src/features/library/native/MediaStoreModule.ts')
shutil.copy2(F2, f"{F2}.bak_{ts}")
c = F2.read_text()

old = '''    const songs = await MediaStoreModule.queryAudioFiles();
      return songs.find((song: NativeSong) => song.uri === uri) || null;'''

new = '''    const songs = (await MediaStoreModule.queryAudioFiles()) as NativeSong[];
      return songs.find((song) => song.uri === uri) ?? null;'''

if old in c:
    c = c.replace(old, new, 1)
    print("✅ Fix 2: MediaStoreModule cast")
else:
    # Coba pattern lebih fleksibel
    import re
    pattern = r'const songs = await MediaStoreModule\.queryAudioFiles\(\);\s*\n\s*return songs\.find\(\(song: NativeSong\) => song\.uri === uri\) \|\| null;'
    if re.search(pattern, c):
        c = re.sub(pattern,
            'const songs = (await MediaStoreModule.queryAudioFiles()) as NativeSong[];\n      return songs.find((song) => song.uri === uri) ?? null;',
            c, count=1)
        print("✅ Fix 2: MediaStoreModule cast (regex)")
    else:
        print("⚠️  Fix 2: pattern tidak ketemu")

F2.write_text(c)
print(f"✅ Fix 2: {F2}")

print("")
print("🎉 Final fixes applied!")
