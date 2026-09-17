#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil, re

HDR = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.h')
CPP = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
for f in [HDR, CPP]:
    shutil.copy2(f, f"{f}.bak_{ts}")

hc = HDR.read_text()
if 'scratchBuffer_' not in hc:
    hc = hc.replace('private:',
        'private:\n    std::vector<float> scratchBuffer_;  // 🔥 reusable\n', 1)
    HDR.write_text(hc)
    print("✅ Header: scratchBuffer_ ditambahkan")

cc = CPP.read_text()

old = '''            std::vector<float> temp(
                outSamples * channels);

            uint8_t* out[] = {
                reinterpret_cast<uint8_t*>(temp.data())
            };'''

new = '''            const size_t neededSize = static_cast<size_t>(outSamples) * channels;
            if (scratchBuffer_.size() < neededSize) {
                scratchBuffer_.resize(neededSize * 2);
            }
            float* temp = scratchBuffer_.data();

            uint8_t* out[] = {
                reinterpret_cast<uint8_t*>(temp)
            };'''

if old in cc:
    cc = cc.replace(old, new, 1)
    print("✅ onDecode: scratchBuffer")
else:
    print("⚠️  Pattern utama tidak ketemu")

# Hapus temp.resize
cc = cc.replace('                temp.resize(converted * channels);\n', '')

# Fix insert
old_insert = '''                result.samples.insert(
                    result.samples.end(),
                    temp.begin(),
                    temp.end());'''
new_insert = '''                result.samples.insert(
                    result.samples.end(),
                    temp,
                    temp + converted * channels);'''
if old_insert in cc:
    cc = cc.replace(old_insert, new_insert, 1)
    print("✅ insert pakai pointer")

CPP.write_text(cc)
print("🎉 Selesai!")
