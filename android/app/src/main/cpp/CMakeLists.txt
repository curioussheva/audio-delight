cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---- Oboe ----
add_subdirectory(oboe)

# ---- React Native headers ----
set(RN_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native")

# ---- Codegen Output (cari di beberapa lokasi yang mungkin) ----
set(CODEGEN_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../build/generated/source/codegen")
set(CODEGEN_DIR_ALT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../app/build/generated/source/codegen")
set(CODEGEN_DIR_ALT2 "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../build/generated/source/codegen")

# Pilih direktori yang ada
if(EXISTS "${CODEGEN_DIR}/jni")
    set(CODEGEN_INCLUDE_DIR "${CODEGEN_DIR}/jni")
elseif(EXISTS "${CODEGEN_DIR_ALT}/jni")
    set(CODEGEN_INCLUDE_DIR "${CODEGEN_DIR_ALT}/jni")
elseif(EXISTS "${CODEGEN_DIR_ALT2}/jni")
    set(CODEGEN_INCLUDE_DIR "${CODEGEN_DIR_ALT2}/jni")
else()
    set(CODEGEN_INCLUDE_DIR "")
    message(WARNING "Codegen directory not found. TurboModule may not compile.")
endif()

# ---- Library utama ----
add_library(
    pristineaudio_engine
    SHARED
    Native-lib.cpp
    AudioEngine.cpp
    NativePristineAudio.cpp
)

# ---- Include directories ----
target_include_directories(
    pristineaudio_engine
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/oboe/include
    ${CODEGEN_INCLUDE_DIR}
    ${RN_DIR}/ReactCommon
    ${RN_DIR}/ReactCommon/react/nativemodule/core
    ${RN_DIR}/ReactCommon/react/nativemodule/core/platform/android
    ${RN_DIR}/ReactAndroid/src/main/jni/react/turbomodule
    ${RN_DIR}/ReactAndroid/src/main/jni
)

# ---- Link ----
target_link_libraries(
    pristineaudio_engine
    oboe
    android
    log
    OpenSLES
    atomic
    m
)