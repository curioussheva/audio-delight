cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

add_subdirectory(oboe)

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
