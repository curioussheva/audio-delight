cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_ANDROID_STL_TYPE c++_shared)

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fvisibility=hidden -O3")

# ---- Oboe ----
add_subdirectory(oboe)

# ---- Library utama ----
add_library(
    pristineaudio_engine
    SHARED
    Native-lib.cpp
    AudioEngine.cpp
)

# ---- Include directories ----
target_include_directories(
    pristineaudio_engine
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/oboe/include
)

# ---- Link ----
target_link_libraries(
    pristineaudio_engine
    oboe
    android
    log
    atomic
    m
) 