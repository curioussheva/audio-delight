#include <jni.h>
#include <android/log.h>
#include "manager/EngineManager.h"

#define LOG_TAG "PristineJNI"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "JNI_OnLoad called — initializing EngineManager");
    pristine::EngineManager::get().start();
    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "EngineManager started successfully");
    return JNI_VERSION_1_6;
}