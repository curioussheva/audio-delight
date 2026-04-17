cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

# Fetch Oboe dari source — lebih reliable daripada Prefab di CI
include(FetchContent)
FetchContent_Declare(
    oboe
    GIT_REPOSITORY https://github.com/google/oboe.git
    GIT_TAG 1.9.0
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(oboe)

add_library(
    pristineaudio_engine
    SHARED
    Native-lib.cpp
    AudioEngine.cpp
    NativeDSPModule.cpp
    NativeVisualizerBridge.cpp
)

target_link_libraries(
    pristineaudio_engine
    oboe
    log
    android
)  