cmake_minimum_required(VERSION 3.22.1)

project("pristineaudio_engine")

# Mencari library Oboe yang sudah di-include via Gradle Prefab
find_package(oboe REQUIRED CONFIG)

# Mendefinisikan library utama kita
add_library(
    pristineaudio_engine
    SHARED
    native-lib.cpp
    AudioEngine.cpp
)

# Menghubungkan library pendukung
target_link_libraries(
    pristineaudio_engine
    oboe::oboe      # Library Oboe untuk low-latency audio
    log             # Untuk melihat log di Logcat
    android         # API native Android
)