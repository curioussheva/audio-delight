#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/DecoderWorker.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Blok affinity yang mau dihapus (persis sesuai output)
old_block = '''        // Set CPU affinity untuk hindari migration antar-core
        cpu_set_t cpuset;
        CPU_ZERO(&cpuset);
        int ncpus = sysconf(_SC_NPROCESSORS_ONLN);
        if (ncpus > 2) {
            // Pakai core 2-3 (hindari core 0-1 untuk audio)
            CPU_SET(2, &cpuset);
            if (ncpus > 3) CPU_SET(3, &cpuset);
        }
        if (pthread_setaffinity_np(pthread_self(), sizeof(cpuset), &cpuset) != 0) {
            __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                "setaffinity failed");
        }
'''

if old_block in c:
    c = c.replace(old_block, '', 1)
    print("✅ Blok CPU affinity dihapus")
else:
    print("⚠️  Pattern tidak exact match — coba regex")

    # Fallback: regex
    import re
    pattern = r'\s*// Set CPU affinity.*?setaffinity failed"\);\s*\n\s*\}\n'
    c2 = re.sub(pattern, '\n', c, flags=re.DOTALL)
    if c2 != c:
        c = c2
        print("✅ Blok affinity dihapus via regex")
    else:
        print("❌ Gagal hapus — cek manual")

FILE.write_text(c)
print("🎉 Selesai!")
