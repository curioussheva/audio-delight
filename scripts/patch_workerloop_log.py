#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('android/app/src/main/cpp/decoder/DecoderWorker.cpp')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Tambah log di loop
old = '''        auto result = decoder_->decode(chunkSize_);

        if (result.status == DecodeStatus::Success) {'''

new = '''        auto result = decoder_->decode(chunkSize_);

        // 🔥 DEBUG: log tiap 100 loop untuk trace
        static int loopCount = 0;
        loopCount++;
        if (loopCount % 100 == 0) {
            __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
                "loop #%d: status=%d, frames=%u",
                loopCount, (int)result.status, result.framesDecoded);
        }

        if (result.status == DecodeStatus::Success) {'''

if old in c and 'loop #%d' not in c:
    c = c.replace(old, new, 1)
    print("✅ Log loop ditambahkan")
else:
    print("⚠️  Pattern tidak ketemu")

# Log EOF & Error
old_eof = '''        } else if (result.status == DecodeStatus::EndOfStream) {
            if (eofCallback_) eofCallback_();
            break;'''

new_eof = '''        } else if (result.status == DecodeStatus::EndOfStream) {
            __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                "EOF reached, exiting loop");
            if (eofCallback_) eofCallback_();
            break;'''

if old_eof in c:
    c = c.replace(old_eof, new_eof, 1)
    print("✅ Log EOF ditambahkan")

old_err = '''            if (errorCallback_) errorCallback_(result.errorMessage);
            break;'''

new_err = '''            __android_log_print(ANDROID_LOG_ERROR, "DecoderWorker",
                "Error: %s", result.errorMessage.c_str());
            if (errorCallback_) errorCallback_(result.errorMessage);
            break;'''

if old_err in c:
    c = c.replace(old_err, new_err, 1)
    print("✅ Log Error ditambahkan")

# Log exit
old_exit = '''    running_.store(false);
}'''

new_exit = '''    __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
        "workerLoop EXITED");
    running_.store(false);
}'''

if old_exit in c:
    c = c.replace(old_exit, new_exit, 1)
    print("✅ Log exit ditambahkan")

FILE.write_text(c)
print("🎉 Selesai!")
