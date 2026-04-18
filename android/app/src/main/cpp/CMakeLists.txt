cmake_minimum_required(VERSION 3.22.1)
project("pristineaudio_engine")

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(oboe)

add_library(
    pristineaudio_engine
    SHARED
    Native-lib.cpp
    AudioEngine.cpp
    NativeDSPModule.cpp
)

target_include_directories(
    pristineaudio_engine
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(
    pristineaudio_engine
    oboe
    log
    android
    OpenSLES
    atomic
    m
)
