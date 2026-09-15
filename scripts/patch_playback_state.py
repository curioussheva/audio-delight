#!/usr/bin/env python3
"""
Patch PlaybackController.cpp:
1. Update state di play()/pause()/stop()
2. Reset decoderWorker_ saat startDecoder gagal
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = f"{FILE}.bak_{ts}"
shutil.copy2(FILE, backup)
print(f"✅ Backup: {backup}")

c = FILE.read_text()
original = c

# --- Fix 1: play() ---
old_play = """    playing_.store(true, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->resume();
    }"""
new_play = """    playing_.store(true, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    if (decoderWorker_) {
        decoderWorker_->resume();
    }"""
if old_play in c:
    c = c.replace(old_play, new_play)
    print("✅ Fix 1: play() update state")
else:
    print("⚠️  Fix 1: pattern play() tidak ketemu")

# --- Fix 2: pause() ---
old_pause = """bool PlaybackController::pause() {
    playing_.store(false, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->pause();
    }"""
new_pause = """bool PlaybackController::pause() {
    playing_.store(false, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    if (decoderWorker_) {
        decoderWorker_->pause();
    }"""
if old_pause in c:
    c = c.replace(old_pause, new_pause)
    print("✅ Fix 2: pause() update state")
else:
    print("⚠️  Fix 2: pattern pause() tidak ketemu")

# --- Fix 3: stop() ---
old_stop = """    pcmQueue_->clear();
    clock_->reset();

    return true;
}"""
new_stop = """    pcmQueue_->clear();
    clock_->reset();
    updatePlaybackState();  // 🔥 FIX

    return true;
}"""
if old_stop in c:
    c = c.replace(old_stop, new_stop, 1)
    print("✅ Fix 3: stop() update state")
else:
    print("⚠️  Fix 3: pattern stop() tidak ketemu")

# --- Fix 4: startDecoder() reset on failure ---
old_startdec = """        bool ok = decoderWorker_->start(track.uri, 0.0);
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): ok=%d, uri=%s",
                            ok ? 1 : 0, track.uri.c_str());
        return ok;"""
new_startdec = """        bool ok = decoderWorker_->start(track.uri, 0.0);
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): ok=%d, uri=%s",
                            ok ? 1 : 0, track.uri.c_str());

        if (!ok) {
            // 🔥 FIX: reset decoder on failure
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "startDecoder(): FAILED, resetting decoderWorker_");
            decoderWorker_.reset();
        }

        return ok;"""
if old_startdec in c:
    c = c.replace(old_startdec, new_startdec)
    print("✅ Fix 4: startDecoder() reset on failure")
else:
    print("⚠️  Fix 4: pattern startDecoder() tidak ketemu")

# --- Save ---
if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Patch 1-4 applied!")
    print("   Next: cek API PlaybackClock untuk Fix 5 (position)")
else:
    print("")
    print("⚠️  Tidak ada perubahan")
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
