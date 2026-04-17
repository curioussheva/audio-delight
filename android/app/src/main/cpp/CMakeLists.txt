cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

# 1. Tambahkan direktori Oboe
# Pastikan folder 'oboe' ada di dalam direktori yang sama dengan CMakeLists ini
add_subdirectory(oboe)

# 2. Definisikan library utama
add_library(
    pristineaudio_engine
    SHARED
    Native-lib.cpp             # Pastikan huruf kecil jika filenya native-lib.cpp
    AudioEngine.cpp
    NativeDSPModule.cpp
)

# 3. Masukkan direktori header agar file .cpp bisa menemukan .h tanpa path rumit
target_include_directories(
    pristineaudio_engine
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# 4. Hubungkan semua library pendukung
target_link_libraries(
    pristineaudio_engine
    oboe        # Mesin audio
    log         # Untuk __android_log_print
    android     # Untuk fungsionalitas sistem Android
)
