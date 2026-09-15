#!/usr/bin/env python3
"""
Fix 5: Update position & duration di PlaybackState saat render()
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

# ============================================================
# Fix 5a: render() - update state position + duration
# ============================================================
old_render = """    clock_->advanceFrames(frames);

    if (metrics_) {
        metrics_->recordFrameRendered(frames);
    }"""

new_render = """    clock_->advanceFrames(frames);

    // 🔥 FIX: sync position & duration ke state (untuk JS getPosition)
    if (state_ && clock_ && sampleRate > 0) {
        uint64_t framesPos = clock_->positionFrames();
        uint64_t msPos = (framesPos * 1000ULL) / sampleRate;
        state_->setPosition(msPos);

        uint64_t framesDur = clock_->durationFrames();
        if (framesDur > 0) {
            uint64_t msDur = (framesDur * 1000ULL) / sampleRate;
            state_->setDuration(msDur);
        }
    }

    if (metrics_) {
        metrics_->recordFrameRendered(frames);
    }"""

if old_render in c:
    c = c.replace(old_render, new_render)
    print("✅ Fix 5a: render() update position + duration")
else:
    print("⚠️  Fix 5a: pattern render() tidak ketemu")

# ============================================================
# Fix 5b: loadTrack() - set duration saat load track
# ============================================================
old_load = """    stopDecoder();
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();"""

new_load = """    stopDecoder();
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();

    // 🔥 FIX: set duration dari metadata track
    if (state_ && track.durationMs > 0) {
        state_->setDuration(static_cast<uint64_t>(track.durationMs));
    }"""

if old_load in c:
    c = c.replace(old_load, new_load)
    print("✅ Fix 5b: loadTrack() set duration")
else:
    print("⚠️  Fix 5b: pattern loadTrack() tidak ketemu — cek nama field duration")

# ============================================================
# Save
# ============================================================
if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Fix 5 applied!")
else:
    print("")
    print("⚠️  Tidak ada perubahan")
    shutil.copy2(backup, FILE)
    print("♻️  Restored from backup")
