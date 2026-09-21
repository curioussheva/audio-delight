#!/usr/bin/env python3
"""
Fix 15 TypeScript errors (kecuali spec NativePlaybackService).
"""
from pathlib import Path
from datetime import datetime
import shutil

ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# ═══════════════════════════════════════════════════════════
# Fix 1: equalizer.tsx — hapus import LIST_BOTTOM_PADDING
# ═══════════════════════════════════════════════════════════
F1 = Path('src/app/(drawer)/(tabs)/equalizer.tsx')
shutil.copy2(F1, f"{F1}.bak_{ts}")
c = F1.read_text()

# Hapus import
c = c.replace(
    'import LIST_BOTTOM_PADDING from "@/app/(drawer)/(tabs)/_layout";\n',
    ''
)

# Tambah definisi lokal (kalau belum ada)
if 'const LIST_BOTTOM_PADDING' not in c:
    # Sisipkan setelah "export default function"
    import re
    c = re.sub(
        r'(export default function \w+\(\) \{)',
        r'const LIST_BOTTOM_PADDING = 100;\n\n\1',
        c, count=1
    )

F1.write_text(c)
print(f"✅ Fix 1: {F1}")

# ═══════════════════════════════════════════════════════════
# Fix 2: playlist.tsx — hapus favoriteCount
# ═══════════════════════════════════════════════════════════
F2 = Path('src/app/(drawer)/playlist.tsx')
shutil.copy2(F2, f"{F2}.bak_{ts}")
c = F2.read_text()

c = c.replace(
    'const { playlists, favoriteCount, createPlaylist, deletePlaylist, importM3UPaths } =',
    'const { playlists, createPlaylist, deletePlaylist, importM3UPaths } ='
)
F2.write_text(c)
print(f"✅ Fix 2: {F2}")

# ═══════════════════════════════════════════════════════════
# Fix 3: USBDACModule.ts — cast ke any
# ═══════════════════════════════════════════════════════════
F3 = Path('src/features/hardware/api/USBDACModule.ts')
shutil.copy2(F3, f"{F3}.bak_{ts}")
c = F3.read_text()

c = c.replace('result?.success ?? true, active: result?.active ?? enabled',
              '(result as any)?.success ?? true, active: (result as any)?.active ?? enabled')
c = c.replace('sampleRate: s?.sampleRate', 'sampleRate: (s as any)?.sampleRate')
c = c.replace('bitDepth: s?.bitDepth', 'bitDepth: (s as any)?.bitDepth')
c = c.replace('exclusiveModeRecommended: s?.exclusiveModeRecommended',
              'exclusiveModeRecommended: (s as any)?.exclusiveModeRecommended')
c = c.replace('bufferSize: s?.bufferSize', 'bufferSize: (s as any)?.bufferSize')
c = c.replace('dsdMode: s?.dsdMode', 'dsdMode: (s as any)?.dsdMode')
c = c.replace('return result?.sessionId ?? 0;', 'return (result as any)?.sessionId ?? 0;')

F3.write_text(c)
print(f"✅ Fix 3: {F3}")

# ═══════════════════════════════════════════════════════════
# Fix 4: MediaStoreModule.ts — cast songs
# ═══════════════════════════════════════════════════════════
F4 = Path('src/features/library/native/MediaStoreModule.ts')
shutil.copy2(F4, f"{F4}.bak_{ts}")
c = F4.read_text()

c = c.replace(
    'const songs = await MediaStoreModule.queryAudioFiles();\n        return songs.find((song: NativeSong) => song.uri === uri) || null;',
    'const songs = (await MediaStoreModule.queryAudioFiles()) as NativeSong[];\n        return songs.find((song) => song.uri === uri) ?? null;'
)
F4.write_text(c)
print(f"✅ Fix 4: {F4}")

print("")
print("🎉 All TS fixes applied (kecuali spec NativePlaybackService)")
print("⚠️  Manual: Fix spec NativePlaybackService.ts")
