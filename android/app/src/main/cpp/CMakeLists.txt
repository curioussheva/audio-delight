# =====================================================
# PristineAudio Native Engine — Enhanced
# =====================================================

cmake_minimum_required(VERSION 3.22.1)
project(pristine-audio VERSION 1.0.0 LANGUAGES CXX)

# =====================================================
# C++ STANDARD
# =====================================================

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)  # Strict standard compliance

# =====================================================
# BUILD TYPE DEFAULT
# =====================================================

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "MinSizeRel" "RelWithDebInfo")
endif()

# =====================================================
# GLOBAL FLAGS
# =====================================================

set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3 -DNDEBUG -fomit-frame-pointer")
set(CMAKE_CXX_FLAGS_DEBUG   "${CMAKE_CXX_FLAGS_DEBUG} -O0 -g3 -fno-omit-frame-pointer")
set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "${CMAKE_CXX_FLAGS_RELWITHDEBINFO} -O3 -g -DNDEBUG")

# =====================================================
# SOURCE COLLECTION (WITH DEPENDS)
# =====================================================

file(GLOB_RECURSE ALL_SRCS CONFIGURE_DEPENDS
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
# EXCLUDED SOURCES
# =====================================================

set(EXCLUDED_SRCS "")

# Exclude test files if any
file(GLOB_RECURSE TEST_SRCS "tests/*.cpp" "*_test.cpp" "*Test.cpp")
if(TEST_SRCS)
    list(APPEND EXCLUDED_SRCS ${TEST_SRCS})
endif()

if(EXCLUDED_SRCS)
    list(REMOVE_ITEM ALL_SRCS ${EXCLUDED_SRCS})
endif()

# =====================================================
# SHARED LIBRARY
# =====================================================

add_library(pristine-audio SHARED ${ALL_SRCS})

# =====================================================
# INCLUDE DIRECTORIES
# =====================================================

target_include_directories(pristine-audio
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
# OBOE (Audio I/O)
# =====================================================

find_package(oboe REQUIRED CONFIG)

# =====================================================
# FFMPEG DECODER
# =====================================================

option(ENABLE_FFMPEG "Enable FFmpeg decoder support" ON)

if(ENABLE_FFMPEG)
    find_package(PkgConfig QUIET)
    
    if(PkgConfig_FOUND)
        pkg_check_modules(FFMPEG QUIET
            libavcodec>=58.0
            libavformat>=58.0
            libswresample>=3.0
            libavutil>=56.0
        )
    endif()
    
    if(FFMPEG_FOUND)
        message(STATUS "FFmpeg found via pkg-config")
        target_include_directories(pristine-audio PRIVATE ${FFMPEG_INCLUDE_DIRS})
        target_link_libraries(pristine-audio ${FFMPEG_LIBRARIES})
        target_compile_definitions(pristine-audio PRIVATE ENABLE_FFMPEG=1)
        
        # pkg-config doesn't always set INTERFACE include properly
        target_compile_options(pristine-audio PRIVATE ${FFMPEG_CFLAGS_OTHER})
    else()
        # Fallback: manual find for Android NDK / custom paths
        message(STATUS "FFmpeg not found via pkg-config, trying manual find...")
        
        find_library(AVCODEC_LIB avcodec PATHS ${CMAKE_SOURCE_DIR}/../libs/ffmpeg/${ANDROID_ABI} NO_DEFAULT_PATH)
        find_library(AVFORMAT_LIB avformat PATHS ${CMAKE_SOURCE_DIR}/../libs/ffmpeg/${ANDROID_ABI} NO_DEFAULT_PATH)
        find_library(SWRESAMPLE_LIB swresample PATHS ${CMAKE_SOURCE_DIR}/../libs/ffmpeg/${ANDROID_ABI} NO_DEFAULT_PATH)
        find_library(AVUTIL_LIB avutil PATHS ${CMAKE_SOURCE_DIR}/../libs/ffmpeg/${ANDROID_ABI} NO_DEFAULT_PATH)
        
        if(AVCODEC_LIB AND AVFORMAT_LIB)
            message(STATUS "FFmpeg found manually")
            target_link_libraries(pristine-audio ${AVCODEC_LIB} ${AVFORMAT_LIB} ${SWRESAMPLE_LIB} ${AVUTIL_LIB})
            target_compile_definitions(pristine-audio PRIVATE ENABLE_FFMPEG=1)
        else()
            message(WARNING "FFmpeg not found, decoder will use PCM only")
        endif()
    endif()
endif()

# =====================================================
# COMPILER OPTIONS
# =====================================================

target_compile_options(pristine-audio
    PRIVATE
        -Wall
        -Wextra
        -Werror=return-type
        -Werror=uninitialized
        -Wno-unused-parameter
        -Wno-unused-variable
        -Wno-missing-field-initializers
        
        # Performance
        -ffast-math
        -fstrict-aliasing
        
        # Binary size
        -fvisibility=hidden
        -ffunction-sections
        -fdata-sections
        
        # Security
        -fstack-protector-strong
        -D_FORTIFY_SOURCE=2
)

# =====================================================
# SIMD / ARCHITECTURE FLAGS
# =====================================================

if(ANDROID_ABI STREQUAL "arm64-v8a")
    target_compile_options(pristine-audio PRIVATE -march=armv8-a+fp+simd)
    target_compile_definitions(pristine-audio PRIVATE ARM_NEON=1 __ARM_NEON=1)
    
elseif(ANDROID_ABI STREQUAL "armeabi-v7a")
    target_compile_options(pristine-audio PRIVATE -mfloat-abi=softfp -mfpu=neon-vfpv4 -marm)
    target_compile_definitions(pristine-audio PRIVATE ARM_NEON=1 __ARM_NEON=1)
    
elseif(ANDROID_ABI STREQUAL "x86_64")
    target_compile_options(pristine-audio PRIVATE -msse4.2 -mavx2)
    target_compile_definitions(pristine-audio PRIVATE X86_SSE=1 X86_AVX2=1)
    
elseif(ANDROID_ABI STREQUAL "x86")
    target_compile_options(pristine-audio PRIVATE -msse4.2)
    target_compile_definitions(pristine-audio PRIVATE X86_SSE=1)
endif()

# =====================================================
# LINK OPTIONS
# =====================================================

target_link_options(pristine-audio
    PRIVATE
        -Wl,--gc-sections
        -Wl,--exclude-libs,ALL  # Hide symbols from static libs
        -Wl,-z,relro,-z,now     # Security hardening
)

# =====================================================
# CONDITIONAL DEFINITIONS
# =====================================================

# Oboe logging hanya di Debug
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(pristine-audio PRIVATE OBOE_ENABLE_LOGGING=1)
else()
    target_compile_definitions(pristine-audio PRIVATE OBOE_ENABLE_LOGGING=0)
endif()

target_compile_definitions(pristine-audio
    PRIVATE
        PRISTINE_AUDIO_ENGINE=1
        $<$<CONFIG:Debug>:DEBUG_BUILD=1>
        $<$<CONFIG:Release>:RELEASE_BUILD=1>
)

# =====================================================
# PRECOMPILED HEADERS (Speed up build)
# =====================================================

target_precompile_headers(pristine-audio
    PRIVATE
        <cstdint>
        <vector>
        <memory>
        <atomic>
        core/AudioTypes.h
        core/AudioConstants.h
        utils/AudioMath.h
)

# =====================================================
# LINK LIBRARIES
# =====================================================

target_link_libraries(pristine-audio
    oboe::oboe
    android
    log
)

# =====================================================
# STRIP SYMBOLS IN RELEASE
# =====================================================

if(CMAKE_BUILD_TYPE STREQUAL "Release" OR CMAKE_BUILD_TYPE STREQUAL "MinSizeRel")
    add_custom_command(TARGET pristine-audio POST_BUILD
        COMMAND ${CMAKE_STRIP} --strip-unneeded $<TARGET_FILE:pristine-audio>
        COMMENT "Stripping symbols for release..."
    )
endif()

# =====================================================
# EXPORT COMPILE COMMANDS (for IDE support)
# =====================================================

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
 