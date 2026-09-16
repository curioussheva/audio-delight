#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil, re

CPP = Path('android/app/src/main/cpp/playback/PlaybackController.cpp')
HDR = Path('android/app/src/main/cpp/playback/PlaybackController.h')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
for f in [CPP, HDR]:
    shutil.copy2(f, f"{f}.bak_{ts}")

# === Header: tambah clearing_ flag ===
hc = HDR.read_text()
if 'std::atomic<bool> clearing_' not in hc:
    hc = re.sub(
        r'(\s+std::shared_ptr<PCMQueue>\s+pcmQueue_;)',
        r'\1\n    std::atomic<bool> clearing_{false};',
        hc, count=1
    )
    HDR.write_text(hc)
    print("✅ Header: clearing_ ditambahkan")
else:
    print("⚠️  Header: sudah ada")

# === CPP: fix loadTrack ===
cc = CPP.read_text()

old_load = '''    stopDecoder();
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();

    bool result = startDecoder(track);'''

new_load = '''    stopDecoder();
    clearing_.store(true, std::memory_order_release);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();

    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);'''

if old_load in cc:
    cc = cc.replace(old_load, new_load, 1)
    print("✅ CPP: loadTrack fixed")
else:
    print("⚠️  CPP: pattern loadTrack tidak ketemu")

# === CPP: fix render ===
old_render = '''    const size_t requestedSamples =
        static_cast<size_t>(frames) * channels;

    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);'''

new_render = '''    const size_t requestedSamples =
        static_cast<size_t>(frames) * channels;

    // 🔥 RACE FIX: output silence saat clearing
    if (clearing_.load(std::memory_order_acquire)) {
        std::fill(output, output + requestedSamples, 0.0f);
        return;
    }

    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);'''

if old_render in cc:
    cc = cc.replace(old_render, new_render, 1)
    print("✅ CPP: render fixed")
else:
    print("⚠️  CPP: pattern render tidak ketemu")

# === Pastikan include thread/chrono ===
if '#include <thread>' not in cc:
    cc = cc.replace('#include <algorithm>',
                    '#include <algorithm>\n#include <thread>\n#include <chrono>')
    print("✅ CPP: include thread/chrono ditambahkan")

CPP.write_text(cc)
print("🎉 Patch selesai!")
