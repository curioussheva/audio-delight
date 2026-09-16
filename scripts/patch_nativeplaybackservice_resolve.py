#!/usr/bin/env python3
"""
Fix: resolveContentUriToPath di NativePlaybackService.kt
Ganti query MediaStore + fallback dengan copy-to-cache (reliable, sama seperti NativePlaybackModule).
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/java/com/pristineaudio/playback/NativePlaybackService.kt')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = f"{FILE}.bak_{ts}"
shutil.copy2(FILE, backup)
print(f"✅ Backup: {backup}")

c = FILE.read_text()
original = c

# Cari fungsi resolveContentUriToPath (semua isinya)
import re
pattern = r'private fun resolveContentUriToPath\(uriString: String\): String \{.*?\n    \}'

new_func = '''private fun resolveContentUriToPath(uriString: String): String {
        if (!uriString.startsWith("content://")) return uriString

        return try {
            val resolver = reactApplicationContext.contentResolver
            val uri = android.net.Uri.parse(uriString)

            // 🔥 FIX: langsung copy ke cache (reliable, tanpa MediaStore query)
            val ext = resolver.getType(uri)?.substringAfterLast('/') ?: "cache"
            val file = File(
                reactApplicationContext.cacheDir,
                "audio_${uriString.hashCode()}.$ext"
            )

            if (!file.exists() || file.length() == 0L) {
                val inputStream = resolver.openInputStream(uri)
                    ?: return uriString
                file.outputStream().use { output ->
                    inputStream.copyTo(output)
                }
            }

            android.util.Log.d(
                "NativePlaybackService",
                "resolveContentUriToPath: $uriString → ${file.absolutePath} (${file.length()} bytes)"
            )

            file.absolutePath
        } catch (e: Exception) {
            android.util.Log.e(
                "NativePlaybackService",
                "resolveContentUriToPath failed: $uriString", e
            )
            uriString
        }
    }'''

if re.search(pattern, c, re.DOTALL):
    c = re.sub(pattern, new_func, c, count=1, flags=re.DOTALL)
    print("✅ Fix: resolveContentUriToPath copy-to-cache")
else:
    print("⚠️  Pattern resolveContentUriToPath tidak ketemu")

if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Fix applied!")
else:
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
