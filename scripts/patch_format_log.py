#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")

c = FILE.read_text()

# Log format di frame pertama
old = '''            const int outSamples = swr_get_out_samples(swrCtx_, frame_->nb_samples) + 256;'''

new = '''            static bool formatLogged = false;
            if (!formatLogged) {
                __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                    "FORMAT CHECK: codecCtx_->sample_fmt=%d, frame_->format=%d, codecCtx_->sample_rate=%d, frame_->sample_rate=%d, nb_samples=%d",
                    codecCtx_->sample_fmt, frame_->format,
                    codecCtx_->sample_rate, frame_->sample_rate,
                    frame_->nb_samples);
                formatLogged = true;
            }

            const int outSamples = swr_get_out_samples(swrCtx_, frame_->nb_samples) + 256;'''

if old in c and 'FORMAT CHECK' not in c:
    c = c.replace(old, new, 1)
    FILE.write_text(c)
    print("✅ Format log ditambahkan")
else:
    print("⚠️  Pattern tidak ketemu atau sudah ada")
