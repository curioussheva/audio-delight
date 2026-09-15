#!/usr/bin/env python3
"""
Fix: resolveContentUri pakai copy ke cache dir.
detachFd() menyebabkan race condition dengan GC.
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/java/com/pristineaudio/audio/NativePlaybackModule.kt')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = f"{FILE}.bak_{ts}"
shutil.copy2(FILE, backup)
print(f"✅ Backup: {backup}")

c = FILE.read_text()
original = c

old_func = '''    private fun resolveContentUri(uriString: String): String {
        if (!uriString.startsWith("content://")) {
            return uriString
        }
        return try {
            val uri = android.net.Uri.parse(uriString)
            val pfd = reactApplicationContext.contentResolver
                .openFileDescriptor(uri, "r")
            if (pfd != null) {
                val fd = pfd.detachFd()
                "/proc/self/fd/$fd"
            } else {
                uriString
            }
        } catch (e: Exception) {
            uriString
        }
    }'''

new_func = '''    private fun resolveContentUri(uriString: String): String {
        if (!uriString.startsWith("content://")) {
            return uriString
        }

        return try {
            val uri = android.net.Uri.parse(uriString)
            val resolver = reactApplicationContext.contentResolver

            // 🔥 FIX: Copy ke cache dir (reliable, tidak ada race condition GC)
            // detachFd() menyebabkan fd di-close oleh GC sebelum FFmpeg buka
            val cacheDir = reactApplicationContext.cacheDir
            val ext = resolver.getType(uri)?.substringAfterLast('/') ?: "tmp"
            val cacheFile = java.io.File(cacheDir, "track_${uriString.hashCode()}.$ext")

            if (!cacheFile.exists() || cacheFile.length() == 0L) {
                resolver.openInputStream(uri)?.use { input ->
                    cacheFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
            }

            android.util.Log.d(
                "NativePlaybackModule",
                "resolveContentUri: $uriString → ${cacheFile.absolutePath} (${cacheFile.length()} bytes)"
            )

            cacheFile.absolutePath
        } catch (e: Exception) {
            android.util.Log.e(
                "NativePlaybackModule",
                "resolveContentUri failed: $uriString", e
            )
            uriString
        }
    }'''

if old_func in c:
    c = c.replace(old_func, new_func)
    print("✅ Fix: resolveContentUri pakai cache dir")
else:
    print("⚠️  Pattern tidak ketemu — cek manual")

if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Fix applied!")
else:
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
