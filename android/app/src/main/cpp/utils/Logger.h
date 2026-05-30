// =====================================================
// utils/Logger.h
// =====================================================

#pragma once

#include <android/log.h>

// =====================================================
// CONFIG
// =====================================================

#ifndef PRISTINE_LOG_TAG
#define PRISTINE_LOG_TAG "PristineEngine"
#endif

// =====================================================
// LOG MACROS
// =====================================================

#if defined(NDEBUG)

// Release build
#define LOGV(...)
#define LOGD(...)

#else

// Debug build
#define LOGV(...) \
__android_log_print( \
    ANDROID_LOG_VERBOSE, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)

#endif

// =====================================================
// ALWAYS ENABLED
// =====================================================

#define LOGI(...) \
__android_log_print( \
    ANDROID_LOG_INFO, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)

#define LOGW(...) \
__android_log_print( \
    ANDROID_LOG_WARN, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)

#define LOGE(...) \
__android_log_print( \
    ANDROID_LOG_ERROR, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)

#define LOGF(...) \
__android_log_print( \
    ANDROID_LOG_FATAL, \
    PRISTINE_LOG_TAG, \
    __VA_ARGS__ \
)