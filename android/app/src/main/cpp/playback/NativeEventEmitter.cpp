#include "NativeEventEmitter.h"
#include <android/log.h>

namespace pristine::playback {

static JavaVM* g_jvm = nullptr;
static jobject g_moduleRef = nullptr;
static jmethodID g_methodId = nullptr;

PRISTINE_EXPORT void initJavaVm(JavaVM* vm) {
    g_jvm = vm;
}

PRISTINE_EXPORT void initModuleRef(JNIEnv* env, jobject instance) {
    if (!env || !instance) return;
    if (g_moduleRef) {
        env->DeleteGlobalRef(g_moduleRef);
    }
    g_moduleRef = env->NewGlobalRef(instance);

    // Cache method ID sekali: (Ljava/lang/String;)V
    jclass cls = env->GetObjectClass(g_moduleRef);
    if (cls) {
        g_methodId = env->GetMethodID(cls, "onNativeTrackEnded", "(Ljava/lang/String;)V");
        env->DeleteLocalRef(cls);
    }

    __android_log_print(ANDROID_LOG_INFO, "NativeEventEmitter",
                        "initModuleRef: ref=%p method=%p",
                        (void*)g_moduleRef, (void*)g_methodId);
}

PRISTINE_EXPORT void emitTrackEnded(const std::string& uri) {
    if (!g_jvm || !g_moduleRef || !g_methodId) return;

    JNIEnv* env = nullptr;
    bool attached = false;

    // Thread decoder biasanya belum attach ke JVM.
    if (g_jvm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
            __android_log_print(ANDROID_LOG_WARN, "NativeEventEmitter",
                                "emitTrackEnded: AttachCurrentThread failed");
            return;
        }
        attached = true;
    }

    if (!env) return;

    jstring jUri = env->NewStringUTF(uri.c_str());
    env->CallVoidMethod(g_moduleRef, g_methodId, jUri);
    env->DeleteLocalRef(jUri);

    if (attached) {
        g_jvm->DetachCurrentThread();
    }
}

} // namespace pristine::playback
