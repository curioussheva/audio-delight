#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Spam control untuk resample out
old = '''        __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
            "resample out: min=%.4f max=%.4f mean=%.4f (frames=%d)",
            minV, maxV, meanAbs, converted);'''

new = '''        static int resampleLogCount = 0;
        resampleLogCount++;
        if (resampleLogCount % 500 == 0) {
            __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                "resample out: min=%.4f max=%.4f mean=%.4f (frames=%d)",
                minV, maxV, meanAbs, converted);
        }'''

if old in c and 'resampleLogCount' not in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ resample log spam control")
else:
    print("⚠️  Pattern tidak ketemu")

# Spam control untuk onDecode
old2 = '''    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "onDecode: framesDecoded=%u, status=%d",
                        result.framesDecoded, (int)result.status);'''

new2 = '''    static int decodeLogCount = 0;
    decodeLogCount++;
    if (decodeLogCount % 500 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                            "onDecode: framesDecoded=%u, status=%d",
                            result.framesDecoded, (int)result.status);
    }'''

if old2 in c and 'decodeLogCount' not in c:
    c = c.replace(old2, new2, 1)
    FILE.write_text(c)
    print("✅ onDecode log spam control")
else:
    print("⚠️  onDecode pattern tidak ketemu")
