
"""Fix track-change hang: 3 patch di PlaybackController.cpp + DecoderWorker.cpp"""
import re
from pathlib import Path

CPP = Path.home() / "pristine/android/app/src/main/cpp"
PC  = CPP / "playback/PlaybackController.cpp"
DW  = CPP / "decoder/DecoderWorker.cpp"

changes = 0

# ============================================================
# FIX #1 — loadTrack: reset state position juga (fix speed -6.56x)
# ============================================================
src = PC.read_text()
old1 = "    currentTrack_ = track;\n    pcmQueue_->clear();\n    clock_->reset();\n"
new1 = ("    currentTrack_ = track;\n"
        "    pcmQueue_->clear();\n"
        "    clock_->reset();\n"
        "    if (state_) state_->setPosition(0);  // 🔥 FIX: reset posisi state juga\n")
if old1 in src:
    src = src.replace(old1, new1, 1)
    print("✅ Fix #1 applied: loadTrack state_->setPosition(0)")
    changes += 1
else:
    print("❌ Fix #1 FAILED: pattern loadTrack tidak match — cek manual")

# ============================================================
# FIX #2 — play(): guard decoderWorker_ null setelah needsLoad block
# ============================================================
old2 = (
    "        if (!loadTrack(*track)) {\n"
    '            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",\n'
    '                                "play(): FAILED - loadTrack returned false");\n'
    "            return false;\n"
    "        }\n"
    "    }\n"
)
new2 = (
    "        if (!loadTrack(*track)) {\n"
    '            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",\n'
    '                                "play(): FAILED - loadTrack returned false");\n'
    "            return false;\n"
    "        }\n"
    "    }\n"
    "\n"
    "    // 🔥 FIX: guard decoderWorker_ null (startDecoder bisa gagal silent)\n"
    "    if (!decoderWorker_) {\n"
    '        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",\n'
    '                            "play(): FAILED - decoderWorker_ null after needsLoad (uri=%s)",\n'
    "                            track->uri.c_str());\n"
    "        return false;\n"
    "    }\n"
)
if old2 in src:
    src = src.replace(old2, new2, 1)
    print("✅ Fix #2 applied: play() decoderWorker_ guard")
    changes += 1
else:
    print("❌ Fix #2 FAILED: pattern play() tidak match — cek manual")

PC.write_text(src)

# ============================================================
# FIX #3 — DecoderWorker::start: force stop kalau running
# ============================================================
src = DW.read_text()
old3 = (
    "bool DecoderWorker::start(const std::string& uri, double startPosition) {\n"
    "    if (running_.load()) return false;\n"
)
new3 = (
    "bool DecoderWorker::start(const std::string& uri, double startPosition) {\n"
    "    // 🔥 FIX: jangan silent-fail — force stop+join kalau masih running\n"
    "    if (running_.load()) {\n"
    '        __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",\n'
    '                            "start(): already running — forcing stop() (uri=%s)",\n'
    "                            uri.c_str());\n"
    "        stop();\n"
    "    }\n"
)
if old3 in src:
    src = src.replace(old3, new3, 1)
    print("✅ Fix #3 applied: DecoderWorker::start force stop")
    changes += 1
else:
    print("❌ Fix #3 FAILED: pattern start() tidak match — cek manual")

DW.write_text(src)

print(f"\n{'='*50}")
print(f"Total: {changes}/3 patches applied")
if changes < 3:
    print("⚠️  Ada yang gagal — paste output ini + isi file yang gagal")