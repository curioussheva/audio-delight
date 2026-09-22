#!/data/data/com.termux/files/usr/bin/python3
"""Tambah getDuration() dari native → JS. Edit 4 file."""
from pathlib import Path

ROOT = Path.home() / "pristine"
changes = 0

# ══════════════════════════════════════════════════
# 1. src/specs/NativePlaybackService.ts
# ══════════════════════════════════════════════════
F1 = ROOT / "src/specs/NativePlaybackService.ts"
src = F1.read_text()
if "getDuration(" in src:
    print("⏭️  Spec already has getDuration")
else:
    old = "  getPosition(): Promise<number>;"
    new = "  getPosition(): Promise<number>;\n  getDuration(): Promise<number>;"
    if old in src:
        src = src.replace(old, new, 1)
        F1.write_text(src)
        print("✅ [1/4] Spec: getDuration() declared")
        changes += 1
    else:
        print("❌ [1/4] Spec pattern tidak match")

# ══════════════════════════════════════════════════
# 2. PlaybackNativeBridge.kt
# ══════════════════════════════════════════════════
F2 = ROOT / "android/app/src/main/java/com/pristineaudio/playback/PlaybackNativeBridge.kt"
src = F2.read_text()
if "getDuration" in src:
    print("⏭️  Bridge already has getDuration")
else:
    old = """    fun getPosition(): Long {
        return NativePlaybackModule.instance?.getPositionFromService()?.toLong() ?: 0L
    }"""
    new = """    fun getPosition(): Long {
        return NativePlaybackModule.instance?.getPositionFromService()?.toLong() ?: 0L
    }

    fun getDuration(): Double {
        return NativePlaybackModule.instance?.getDurationFromService() ?: 0.0
    }"""
    if old in src:
        src = src.replace(old, new, 1)
        F2.write_text(src)
        print("✅ [2/4] Bridge: getDuration() added")
        changes += 1
    else:
        print("❌ [2/4] Bridge pattern tidak match")

# ══════════════════════════════════════════════════
# 3. NativePlaybackService.kt
# ══════════════════════════════════════════════════
F3 = ROOT / "android/app/src/main/java/com/pristineaudio/playback/NativePlaybackService.kt"
src = F3.read_text()
if "fun getDuration" in src:
    print("⏭️  Service already has getDuration")
else:
    # Cari method getPosition sebagai anchor
    import re
    m = re.search(r'(@ReactMethod[\s\S]{0,200}?fun getPosition\([^)]*\)[^{]*\{[^}]*\})', src)
    if m:
        anchor = m.group(1)
        new_method = anchor + '''

    @ReactMethod
    fun getDuration(promise: Promise) {
        try {
            val dur = PlaybackNativeBridge.getDuration()
            promise.resolve(dur)
        } catch (e: Exception) {
            promise.reject("GET_DURATION_FAILED", e)
        }
    }'''
        src = src.replace(anchor, new_method, 1)
        F3.write_text(src)
        print("✅ [3/4] Service: @ReactMethod getDuration added")
        changes += 1
    else:
        print("❌ [3/4] Service anchor getPosition tidak ditemukan")

# ══════════════════════════════════════════════════
# 4. NativePlaybackModule.kt
# ══════════════════════════════════════════════════
F4 = ROOT / "android/app/src/main/java/com/pristineaudio/audio/NativePlaybackModule.kt"
src = F4.read_text()
if "getDurationFromService" in src:
    print("⏭️  Module already has getDurationFromService")
else:
    old = "    fun getPositionFromService(): Double = nativeGetPosition().toDouble()"
    new = """    fun getPositionFromService(): Double = nativeGetPosition().toDouble()
    fun getDurationFromService(): Double {
        // Native getDuration belum ada, fallback 0.0
        // TODO: tambah nativeGetDuration() di JNI
        return 0.0
    }"""
    if old in src:
        src = src.replace(old, new, 1)
        F4.write_text(src)
        print("✅ [4/4] Module: getDurationFromService added (fallback 0.0)")
        changes += 1
    else:
        print("❌ [4/4] Module pattern tidak match")

print(f"\n{'='*50}\nTotal: {changes}/4")
if changes < 4:
    print("⚠️  Ada yang gagal — cek manual") 