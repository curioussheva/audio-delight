
#!/usr/bin/env python3
"""
Script patch untuk menambahkan log debugging di:
1. PlaybackController::play()
2. PlaybackController::loadTrack()
3. PlaybackController::startDecoder()
4. NativePlaybackModule nativeSetQueue
5. NativePlaybackModule nativePlay
"""

import os
import shutil
import re
from datetime import datetime

ROOT = "android/app/src/main/cpp"
FILES = {
    "playback": f"{ROOT}/playback/PlaybackController.cpp",
    "jni": f"{ROOT}/jni/NativePlaybackModule.cpp",
}

# Backup dulu
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
for key, path in FILES.items():
    if os.path.exists(path):
        backup = f"{path}.backup_{timestamp}"
        shutil.copy2(path, backup)
        print(f"✅ Backup: {backup}")
    else:
        print(f"❌ File not found: {path}")
        exit(1)

# ============================================================
# Patch PlaybackController.cpp
# ============================================================
pc_path = FILES["playback"]
with open(pc_path, "r") as f:
    content = f.read()

# --- Patch play() ---
play_new = '''bool PlaybackController::play() {
    if (!initialized_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - not initialized");
        return false;
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): decoderWorker_=%s, queue_=%s",
                        decoderWorker_ ? "exists" : "null",
                        queue_ ? "exists" : "null");

    if (!decoderWorker_) {
        if (!queue_) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "play(): FAILED - queue_ null");
            return false;
        }

        auto track = queue_->current();
        if (!track) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "play(): FAILED - queue_->current() null (size=%zu)",
                                queue_->tracks().size());
            return false;
        }

        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "play(): track uri=%s, calling loadTrack",
                            track->uri.c_str());

        if (!loadTrack(*track)) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "play(): FAILED - loadTrack returned false");
            return false;
        }
    }

    playing_.store(true, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->resume();
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): SUCCESS");
    return true;
}'''

# Replace play() function using regex
pattern = r'bool PlaybackController::play\(\) \{.*?\n\}'
content = re.sub(pattern, play_new, content, count=1, flags=re.DOTALL)

# --- Patch loadTrack() ---
load_new = '''bool PlaybackController::loadTrack(const TrackInfo& track) {
    if (!initialized_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "loadTrack(): FAILED - not initialized");
        return false;
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): START uri=%s", track.uri.c_str());

    stopDecoder();
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();

    bool result = startDecoder(track);
    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): DONE startDecoder=%s",
                        result ? "true" : "false");
    return result;
}'''

pattern = r'bool PlaybackController::loadTrack\(const TrackInfo& track\) \{.*?\n\}'
content = re.sub(pattern, load_new, content, count=1, flags=re.DOTALL)

# --- Patch startDecoder() ---
start_new = '''bool PlaybackController::startDecoder(const TrackInfo& track) {
    try {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): creating decoder for uri=%s",
                            track.uri.c_str());

        decoderWorker_ = std::make_unique<decoder::DecoderWorker>(
            std::make_unique<decoder::FFmpegDecoder>()
        );

        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );
                }
            }
        );

        bool ok = decoderWorker_->start(track.uri, 0.0);
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): ok=%d, uri=%s",
                            ok ? 1 : 0, track.uri.c_str());
        return ok;
    }
    catch (const std::exception& e) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "startDecoder(): exception: %s", e.what());
        return false;
    }
    catch (...) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "startDecoder(): unknown exception");
        return false;
    }
}'''

pattern = r'bool PlaybackController::startDecoder\(const TrackInfo& track\) \{.*?\n\}'
content = re.sub(pattern, start_new, content, count=1, flags=re.DOTALL)

with open(pc_path, "w") as f:
    f.write(content)
print(f"✅ Patched: {pc_path}")

# ============================================================
# Patch NativePlaybackModule.cpp
# ============================================================
jni_path = FILES["jni"]
with open(jni_path, "r") as f:
    content = f.read()

# --- Patch nativeSetQueue ---
setqueue_new = '''JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue(
    JNIEnv* env, jobject, jobjectArray uris) {

    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue() called");

    auto* controller = getController();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativeSetQueue: controller null!");
        return;
    }

    jsize length = env->GetArrayLength(uris);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: length=%d", (int)length);

    std::vector<pristine::playback::TrackInfo> tracks;
    for (jsize i = 0; i < length; ++i) {
        jstring js = (jstring) env->GetObjectArrayElement(uris, i);
        if (!js) continue;

        const char* cstr = env->GetStringUTFChars(js, nullptr);
        if (!cstr) { env->DeleteLocalRef(js); continue; }

        __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                            "nativeSetQueue: URI[%d] = %s", (int)i, cstr);

        pristine::playback::TrackInfo info;
        info.uri = cstr;
        tracks.push_back(info);

        env->ReleaseStringUTFChars(js, cstr);
        env->DeleteLocalRef(js);
    }

    controller->queue()->setTracks(tracks);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: setTracks called with %zu tracks",
                        tracks.size());
}'''

pattern = r'JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue\(.*?\n\}'
content = re.sub(pattern, setqueue_new, content, count=1, flags=re.DOTALL)

# --- Patch nativePlay ---
play_jni_new = '''JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject) {
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() called from JS");
    auto* controller = getController();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativePlay: controller null!");
        return;
    }
    controller->play();
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() returned");
}'''

pattern = r'JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay\(JNIEnv\*, jobject\) \{.*?\n\}'
content = re.sub(pattern, play_jni_new, content, count=1, flags=re.DOTALL)

with open(jni_path, "w") as f:
    f.write(content)
print(f"✅ Patched: {jni_path}")

print("\n🎉 All patches applied! Rebuild with: npx expo run:android --device")
