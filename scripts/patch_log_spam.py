#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

old = '''    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "render readSamples=%zu/%zu (frames=%u ch=%u)",
                        readSamples, requestedSamples, frames, channels);'''

new = '''    // 🔥 SPAM CONTROL: log hanya tiap 5000 render
    static int renderCount = 0;
    renderCount++;
    if (renderCount % 5000 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "render readSamples=%zu/%zu (frames=%u ch=%u)",
                            readSamples, requestedSamples, frames, channels);
    }'''

if old in c:
    c = c.replace(old, new)
    FILE.write_text(c)
    print("✅ Log readSamples → hanya tiap 5000 render (tahan berjam-jam)")
else:
    print("⚠️  Pattern tidak ketemu — cek manual")
