// =====================================================
// jni/OnLoad.cpp
// =====================================================

#include <jni.h>

JNIEXPORT jint JNICALL
JNI_OnLoad(
    JavaVM* vm,
    void*
) {

    return JNI_VERSION_1_6;
}