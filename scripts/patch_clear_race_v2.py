#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

CPP = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(CPP, f"{CPP}.bak_{ts}")
print(f"✅ Backup: {CPP}.bak_{ts}")

c = CPP.read_text()

# Cek apakah loadTrack sudah di-patch
if 'clearing_.store(true' in c:
    print("⚠️  loadTrack sudah dipatch — skip")
    exit(0)

# Pattern 1: tambah clearing_.store(true) setelah stopDecoder()
old1 = '''    stopDecoder();
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();'''

new1 = '''    stopDecoder();
    clearing_.store(true, std::memory_order_release);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();'''

if old1 in c:
    c = c.replace(old1, new1, 1)
    print("✅ clearing_.store(true) ditambahkan")
else:
    print("⚠️  Pattern stopDecoder() tidak ketemu")
    exit(1)

# Pattern 2: tambah clearing_.store(false) setelah startDecoder(track);
old2 = '''    bool result = startDecoder(track);
    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): DONE startDecoder=%s",'''

new2 = '''    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);
    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): DONE startDecoder=%s",'''

if old2 in c:
    c = c.replace(old2, new2, 1)
    print("✅ clearing_.store(false) ditambahkan")
else:
    # Coba pattern alternatif
    old2b = '''    bool result = startDecoder(track);'''
    new2b = '''    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);'''
    if old2b in c:
        c = c.replace(old2b, new2b, 1)
        print("✅ clearing_.store(false) via pattern alternatif")
    else:
        print("⚠️  Pattern startDecoder tidak ketemu")

# Pastikan include thread/chrono
if '#include <thread>' not in c:
    c = c.replace('#include <algorithm>',
                  '#include <algorithm>\n#include <thread>\n#include <chrono>')
    print("✅ include thread/chrono ditambahkan")

CPP.write_text(c)
print("🎉 Patch v2 selesai!")
