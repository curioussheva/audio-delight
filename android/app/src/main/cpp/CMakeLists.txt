# =====================================================
# PristineAudio Native Engine
# =====================================================

cmake_minimum_required(VERSION 3.22.1)

project(pristine-audio)

# =====================================================
# C++ STANDARD
# =====================================================

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# =====================================================
# BUILD TYPE
# =====================================================

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# =====================================================
# GLOBAL FLAGS
# =====================================================

set(CMAKE_CXX_FLAGS_RELEASE
    "${CMAKE_CXX_FLAGS_RELEASE} -O3 -DNDEBUG"
)

set(CMAKE_CXX_FLAGS_DEBUG
    "${CMAKE_CXX_FLAGS_DEBUG} -O0 -g"
)

# =====================================================
# SOURCE COLLECTION
# =====================================================

file(GLOB_RECURSE ALL_SRCS
    "core/*.cpp"

    "manager/*.cpp"
    "modes/*.cpp"

    "playback/*.cpp"
    "decoder/*.cpp"

    "dsp/*.cpp"
    "dsp/*/*.cpp"

    "fft/*.cpp"

    "devices/*.cpp"
    "usb/*.cpp"

    "realtime/*.cpp"
    "session/*.cpp"

    "profiling/*.cpp"

    "visualizer/*.cpp"

    "utils/*.cpp"

    "jni/*.cpp"
)

# =====================================================
# OPTIONAL EXCLUDES
# =====================================================

set(EXCLUDED_SRCS
    # add placeholders/tests here
)

list(REMOVE_ITEM ALL_SRCS ${EXCLUDED_SRCS})

# =====================================================
# SHARED LIBRARY
# =====================================================

add_library(
    pristine-audio
    SHARED
    ${ALL_SRCS}
)

# =====================================================
# INCLUDE DIRECTORIES
# =====================================================

target_include_directories(
    pristine-audio
    PRIVATE

    ${CMAKE_CURRENT_SOURCE_DIR}

    core

    manager
    modes

    playback
    decoder

    dsp
    dsp/graph
    dsp/tone
    dsp/spatial
    dsp/dynamics
    dsp/filters
    dsp/convolution
    dsp/immersive
    dsp/headphone

    fft

    devices
    usb

    realtime
    session

    profiling

    visualizer

    utils

    jni
)

# =====================================================
# OBOE
# =====================================================

find_package(oboe REQUIRED CONFIG)

# =====================================================
# OPTIONAL FFMPEG
# =====================================================

option(ENABLE_FFMPEG "Enable FFmpeg decoder" ON)

if(ENABLE_FFMPEG)

    find_package(PkgConfig REQUIRED)

    pkg_check_modules(
        FFMPEG
        libavcodec
        libavformat
        libswresample
        libavutil
    )

    if(FFMPEG_FOUND)

        target_include_directories(
            pristine-audio
            PRIVATE
            ${FFMPEG_INCLUDE_DIRS}
        )

        target_link_libraries(
            pristine-audio
            ${FFMPEG_LIBRARIES}
        )

        target_compile_definitions(
            pristine-audio
            PRIVATE
            ENABLE_FFMPEG=1
        )

    endif()

endif()

# =====================================================
# COMPILER OPTIONS
# =====================================================

target_compile_options(
    pristine-audio
    PRIVATE

    -Wall
    -Wextra

    -Werror=return-type

    -Wno-unused-parameter
    -Wno-unused-variable
    -Wno-missing-field-initializers

    -ffast-math
    -fstrict-aliasing

    -fvisibility=hidden

    -ffunction-sections
    -fdata-sections
)

# =====================================================
# SIMD / CPU OPTIMIZATION
# =====================================================

if(CMAKE_SYSTEM_PROCESSOR MATCHES "armv7")

    target_compile_options(
        pristine-audio
        PRIVATE
        -mfpu=neon
    )

elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64")

    # NEON enabled by default
endif()

# =====================================================
# LINK OPTIONS
# =====================================================

target_link_options(
    pristine-audio
    PRIVATE

    -Wl,--gc-sections
)

# =====================================================
# DEFINITIONS
# =====================================================

target_compile_definitions(
    pristine-audio
    PRIVATE

    OBOE_ENABLE_LOGGING=1

    PRISTINE_AUDIO_ENGINE=1
)

# =====================================================
# LINK LIBRARIES
# =====================================================

target_link_libraries(
    pristine-audio

    oboe::oboe

    android
    log
)

# =====================================================
# INSTALL (OPTIONAL)
# =====================================================

# install(
#     TARGETS pristine-audio
#     DESTINATION lib
# ) 