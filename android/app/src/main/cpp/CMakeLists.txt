cmake_minimum_required(VERSION 3.22.1)

project("pristineaudio_engine")

# Cari library Oboe via Prefab
find_package(oboe REQUIRED CONFIG)

# Definisikan library utama
add_library(
    pristineaudio_engine
    SHARED
    native-lib.cpp
    AudioEngine.cpp
    NativeDSPModule.cpp        # Tambahkan ini untuk kontrol EQ
    NativeVisualizerBridge.cpp # Tambahkan ini untuk data visualizer
)

# Hubungkan library
target_link_libraries(
    pristineaudio_engine
    oboe::oboe
    log
    android
)
