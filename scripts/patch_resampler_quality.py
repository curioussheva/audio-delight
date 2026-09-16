#!/usr/bin/env python3
"""
Upgrade FFmpeg resampler quality untuk 44100→48000.
Tambah: filter_size=128, dither_method=triangular_highpass.
"""

from pathlib import Path
from datetime import datetime
import shutil
import sys

FILE = Path('android/app/src/main/cpp/decoder/FFmpegDecoder.cpp')

if not FILE.exists():
    print(f"❌ File not found: {FILE}")
    sys.exit(1)

ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
original = c

# 1. Tambah include
if '#include <libavutil/opt.h>' not in c:
    c = c.replace(
        '#include <libavutil/samplefmt.h>',
        '#include <libavutil/samplefmt.h>\n#include <libavutil/opt.h>'
    )
    print("✅ Include libavutil/opt.h ditambahkan")
else:
    print("⚠️  Include sudah ada")

# 2. Ganti setupResampler dengan versi upgrade
old_func = '''    swr_alloc_set_opts2(
        &swrCtx_,
        &stereo,
        AV_SAMPLE_FMT_FLT,
        config().targetSampleRate,   // ← ubah dari codecCtx_->sample_rate menjadi targetSampleRate
        &codecCtx_->ch_layout,
        codecCtx_->sample_fmt,
        codecCtx_->sample_rate,
        0,
        nullptr);

    return swr_init(swrCtx_) >= 0;'''

new_func = '''    int ret = swr_alloc_set_opts2(
        &swrCtx_,
        &stereo,
        AV_SAMPLE_FMT_FLT,
        config().targetSampleRate,
        &codecCtx_->ch_layout,
        codecCtx_->sample_fmt,
        codecCtx_->sample_rate,
        0,
        nullptr);

    if (ret < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "swr_alloc_set_opts2 failed: %d", ret);
        return false;
    }

    // 🔥 FIX: Upgrade resampler quality (default terlalu rendah → distorsi)
    av_opt_set_int(swrCtx_, "filter_size", 128, 0);        // default 32 → 128
    av_opt_set_int(swrCtx_, "linear_interp", 0, 0);
    av_opt_set_int(swrCtx_, "dither_method", SWR_DITHER_TRIANGULAR_HIGHPASS, 0);
    av_opt_set_double(swrCtx_, "dither_scale", 1.0, 0);

    int init_ret = swr_init(swrCtx_);
    __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                        "setupResampler: swr_init ret=%d (filter_size=128, dither=triangular)",
                        init_ret);
    return init_ret >= 0;'''

if old_func in c:
    c = c.replace(old_func, new_func)
    print("✅ setupResampler upgrade (filter_size=128, dither)")
else:
    print("⚠️  Pattern tidak ketemu — cek manual")

if c != original:
    FILE.write_text(c)
    print("🎉 Fix applied!")
else:
    shutil.copy2(f"{FILE}.bak_{ts}", FILE)
    print("♻️  Restored from backup")
