#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/DecoderWorker.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# 1. Tambah include
if '#include <sys/resource.h>' not in c:
    c = c.replace('#include <chrono>',
                  '#include <chrono>\n#include <sys/resource.h>\n#include <pthread.h>\n#include <unistd.h>')
    print("✅ Include sys/resource.h, pthread.h, unistd.h")

# 2. Tambah priority setup di workerLoop() awal
old = '''void DecoderWorker::workerLoop() {
    while (!stopRequested_.load()) {'''

new = '''void DecoderWorker::workerLoop() {
    // 🔥 FIX: Set thread priority ke AUDIO (-16) 
    // Default = 0 (NORMAL). Decoder harus LEBIH TINGGI dari normal
    // untuk mencegah starvation oleh audio callback thread.
    {
        // Prioritas audio untuk decoder (jangan URGENT karena hanya callback Oboe)
        int priority = -16;  // ANDROID_PRIORITY_AUDIO
        pid_t tid = gettid();
        if (setpriority(PRIO_PROCESS, tid, priority) != 0) {
            __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                "setpriority(%d) failed: %s", priority, strerror(errno));
        } else {
            __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
                "Thread priority set to %d (AUDIO)", priority);
        }
        
        // Set CPU affinity untuk hindari migration antar-core
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
    }
    
    __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
        "workerLoop started");
    
    while (!stopRequested_.load()) {'''

if old in c and 'ANDROID_PRIORITY_AUDIO' not in c:
    c = c.replace(old, new, 1)
    print("✅ Priority setup di workerLoop")
else:
    print("⚠️  Pattern workerLoop tidak ketemu atau sudah di-patch")

# 3. Ganti `yield()` dengan microsleep 0.1ms (biar tidak sepenuhnya menyerah)
old3 = '''        // yield ringan biar CPU tidak full spike
        std::this_thread::yield();'''
new3 = '''        // 🔥 FIX: micro-sleep 100us, jangan full yield
        std::this_thread::sleep_for(std::chrono::microseconds(100));'''

if old3 in c:
    c = c.replace(old3, new3, 1)
    print("✅ yield() → microsleep(100us)")

# 4. Tambah include errno.h
if '#include <errno.h>' not in c and '#include <cerrno>' not in c:
    c = c.replace('#include <chrono>', '#include <chrono>\n#include <cerrno>\n#include <cstring>')
    print("✅ Include errno & cstring")

FILE.write_text(c)
print("🎉 Patch selesai!")
