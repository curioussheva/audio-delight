# =====================================================
# PristineAudio Native Engine — RN 0.83
# =====================================================

cmake_minimum_required(VERSION 3.22.1)
project(pristine-audio VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# =====================================================
# React Native path + official flags
# =====================================================

if(NOT DEFINED REACT_NATIVE_DIR)
  get_filename_component(REACT_NATIVE_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native"
    ABSOLUTE)
endif()

if(EXISTS "${REACT_NATIVE_DIR}/ReactAndroid/cmake-utils/folly-flags.cmake")
  include("${REACT_NATIVE_DIR}/ReactAndroid/cmake-utils/folly-flags.cmake")
  add_compile_options(${folly_FLAGS})
  message(STATUS "Using official folly-flags.cmake")
else()
  message(WARNING "folly-flags.cmake not found — using fallback")
  add_compile_definitions(
    FOLLY_NO_CONFIG=1
    FOLLY_MOBILE=1
    FOLLY_USE_LIBCPP=1
    FOLLY_HAVE_CLOCK_GETTIME=1
    FOLLY_HAVE_PTHREAD=1
  )
endif()

if(EXISTS "${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")
  include("${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")
  message(STATUS "Using official react-native-flags.cmake")
else()
  function(target_compile_reactnative_options target)
    set(visibility PRIVATE)
    if(ARGC GREATER 1)
      set(visibility ${ARGV1})
    endif()
    target_compile_options(${target} ${visibility} -fexceptions -frtti -std=c++20)
    target_compile_definitions(${target} ${visibility}
      FOLLY_NO_CONFIG=1 FOLLY_MOBILE=1 FOLLY_USE_LIBCPP=1 RN_SERIALIZABLE_STATE=1)
    if(TARGET ReactAndroid::reactnative)
      target_link_libraries(${target} ${visibility} ReactAndroid::reactnative)
    endif()
    if(TARGET ReactAndroid::jsi)
      target_link_libraries(${target} ${visibility} ReactAndroid::jsi)
    endif()
  endfunction()
endif()

# =====================================================
# Build type
# =====================================================

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -O3 -DNDEBUG -fomit-frame-pointer")
set(CMAKE_CXX_FLAGS_DEBUG   "${CMAKE_CXX_FLAGS_DEBUG} -O0 -g3 -fno-omit-frame-pointer")

# =====================================================
# Sources
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
  "resampler/*.cpp"
)

# Tambahkan file-file JNI yang diperlukan oleh pristine-audio secara eksplisit
list(APPEND ALL_SRCS
  jni/OnLoad.cpp
  jni/JSIInstaller.cpp
  jni/NativeAudioFeed.cpp
  jni/NativeDSPModule.cpp
  jni/NativeDeviceModule.cpp
  jni/NativePlaybackModule.cpp
  jni/NativePristineAudio.cpp
  jni/NativeVisualizerModule.cpp
)

set(EXCLUDED_SRCS "")
file(GLOB_RECURSE TEST_SRCS "tests/*.cpp" "*_test.cpp" "*Test.cpp")
if(TEST_SRCS)
  list(APPEND EXCLUDED_SRCS ${TEST_SRCS})
endif()

# =====================================================
# FFmpeg Prebuilt
# =====================================================

option(ENABLE_FFMPEG "Enable FFmpeg decoder support" ON)
set(PRISTINE_FFMPEG_AVAILABLE FALSE)

if(ENABLE_FFMPEG)
    set(FFMPEG_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/libs/ffmpeg/${ANDROID_ABI}")

    if(EXISTS "${FFMPEG_ROOT}/include")
        message(STATUS "FFmpeg found at ${FFMPEG_ROOT}")
        set(PRISTINE_FFMPEG_AVAILABLE TRUE)

        include_directories("${FFMPEG_ROOT}/include")

        add_library(avcodec SHARED IMPORTED)
        set_target_properties(avcodec PROPERTIES IMPORTED_LOCATION "${FFMPEG_ROOT}/lib/libavcodec.so")

        add_library(avformat SHARED IMPORTED)
        set_target_properties(avformat PROPERTIES IMPORTED_LOCATION "${FFMPEG_ROOT}/lib/libavformat.so")

        add_library(avutil SHARED IMPORTED)
        set_target_properties(avutil PROPERTIES IMPORTED_LOCATION "${FFMPEG_ROOT}/lib/libavutil.so")

        add_library(swresample SHARED IMPORTED)
        set_target_properties(swresample PROPERTIES IMPORTED_LOCATION "${FFMPEG_ROOT}/lib/libswresample.so")

        set(FFMPEG_LIBRARIES avcodec avformat avutil swresample)
    else()
        message(WARNING "FFmpeg not found at ${FFMPEG_ROOT}")
    endif()
endif()

if(NOT PRISTINE_FFMPEG_AVAILABLE)
    message(WARNING "FFmpeg not found — excluding decoder/FFmpegDecoder.cpp")
    list(APPEND EXCLUDED_SRCS "${CMAKE_CURRENT_SOURCE_DIR}/decoder/FFmpegDecoder.cpp")
endif()

if(EXCLUDED_SRCS)
  list(REMOVE_ITEM ALL_SRCS ${EXCLUDED_SRCS})
endif()

# =====================================================
# Oboe
# =====================================================

set(OBOE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/oboe")
if(EXISTS "${OBOE_DIR}/CMakeLists.txt")
  message(STATUS "Found Oboe at ${OBOE_DIR}")
  add_subdirectory(${OBOE_DIR} oboe EXCLUDE_FROM_ALL)
  set(OBOE_LIB oboe)
else()
  message(FATAL_ERROR "Oboe not found at ${OBOE_DIR}/CMakeLists.txt")
endif()

# =====================================================
# ReactAndroid / fbjni / JSI
# =====================================================

find_package(ReactAndroid CONFIG REQUIRED)
find_package(fbjni CONFIG REQUIRED)

get_target_property(_RN_INCLUDES ReactAndroid::reactnative INTERFACE_INCLUDE_DIRECTORIES)
if(NOT _RN_INCLUDES)
  set(_RN_INCLUDES "")
endif()

set(_JSI_INCLUDES "")
if(TARGET ReactAndroid::jsi)
  get_target_property(_JSI_INCLUDES ReactAndroid::jsi INTERFACE_INCLUDE_DIRECTORIES)
  if(NOT _JSI_INCLUDES)
    set(_JSI_INCLUDES "")
  endif()
endif()

set(_FBJNI_INCLUDES "")
if(TARGET fbjni::fbjni)
  get_target_property(_FBJNI_INCLUDES fbjni::fbjni INTERFACE_INCLUDE_DIRECTORIES)
  if(NOT _FBJNI_INCLUDES)
    set(_FBJNI_INCLUDES "")
  endif()
endif()

# =====================================================
# Generated paths
# =====================================================

set(CODEGEN_JNI_DIR
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generated/source/codegen/jni")
set(AUTOLINKING_JNI_DIR
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../build/generated/autolinking/src/main/jni")
set(AUTOLINKING_CMAKE
  "${AUTOLINKING_JNI_DIR}/Android-autolinking.cmake")

# =====================================================
# Target: pristine-audio
# =====================================================

add_library(pristine-audio SHARED ${ALL_SRCS})

target_include_directories(pristine-audio PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  core manager modes playback decoder
  dsp dsp/graph dsp/tone dsp/spatial dsp/dynamics
  dsp/filters dsp/convolution dsp/immersive dsp/headphone
  fft devices usb realtime session profiling visualizer utils jni resampler
  ${_RN_INCLUDES}
  ${_JSI_INCLUDES}
  ${_FBJNI_INCLUDES}
  ${AUTOLINKING_JNI_DIR}
)

if(EXISTS "${CODEGEN_JNI_DIR}")
  target_include_directories(pristine-audio PRIVATE "${CODEGEN_JNI_DIR}")
endif()

if(PRISTINE_FFMPEG_AVAILABLE)
    target_compile_definitions(pristine-audio PRIVATE ENABLE_FFMPEG=1)
    target_link_libraries(pristine-audio PRIVATE ${FFMPEG_LIBRARIES})
endif()

target_compile_options(pristine-audio PRIVATE
  -Wall -Wextra
  -Werror=return-type -Werror=uninitialized
  -Wno-unused-parameter -Wno-unused-variable
  -Wno-unused-private-field
  -Wno-missing-field-initializers
  -Wno-mismatched-tags
  -Wno-reorder-ctor
  -Wno-defaulted-function-deleted
  -Wno-macro-redefined
  -ffast-math -fstrict-aliasing -fvisibility=hidden
  -ffunction-sections -fdata-sections
  -fstack-protector-strong -D_FORTIFY_SOURCE=2
  -fexceptions -frtti
)

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

target_link_options(pristine-audio PRIVATE
  -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,-z,relro,-z,now
)

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  target_compile_definitions(pristine-audio PRIVATE
    OBOE_ENABLE_LOGGING=1 DEBUG_BUILD=1)
else()
  target_compile_definitions(pristine-audio PRIVATE
    OBOE_ENABLE_LOGGING=0 RELEASE_BUILD=1)
endif()

target_compile_definitions(pristine-audio PRIVATE PRISTINE_AUDIO_ENGINE=1)

if(COMMAND target_compile_reactnative_options)
  target_compile_reactnative_options(pristine-audio PRIVATE)
endif()

target_precompile_headers(pristine-audio PRIVATE
  <cstdint> <vector> <memory> <atomic>
  core/AudioTypes.h core/AudioConstants.h utils/AudioMath.h
)

target_link_libraries(pristine-audio
  PUBLIC  ${OBOE_LIB}
  PRIVATE android log ReactAndroid::jsi ReactAndroid::reactnative fbjni::fbjni
)

if(CMAKE_BUILD_TYPE STREQUAL "Release" OR CMAKE_BUILD_TYPE STREQUAL "MinSizeRel")
  add_custom_command(TARGET pristine-audio POST_BUILD
    COMMAND ${CMAKE_STRIP} --strip-unneeded $<TARGET_FILE:pristine-audio>
    COMMENT "Stripping symbols for release...")
endif()

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# =====================================================
# Target: appmodules
# =====================================================

if(EXISTS "${AUTOLINKING_CMAKE}")
  message(STATUS "Found autolinking cmake at ${AUTOLINKING_CMAKE}")
  include("${AUTOLINKING_CMAKE}")

  foreach(lib ${AUTOLINKED_LIBRARIES})
    if(TARGET ${lib})
      set_target_properties(${lib} PROPERTIES
        INTERFACE_LINK_LIBRARIES ""
        LINK_LIBRARIES ""
      )
    endif()
  endforeach()
else()
  message(WARNING "Autolinking cmake not found at ${AUTOLINKING_CMAKE}")
  set(AUTOLINKED_LIBRARIES "")
endif()

if(EXISTS "${CODEGEN_JNI_DIR}/CMakeLists.txt")
  add_subdirectory("${CODEGEN_JNI_DIR}" pristineaudiospec_codegen_build EXCLUDE_FROM_ALL)

  if(TARGET react_codegen_PristineAudioSpec)
    target_include_directories(react_codegen_PristineAudioSpec PRIVATE
      ${_RN_INCLUDES}
      ${_JSI_INCLUDES}
      ${_FBJNI_INCLUDES}
    )
  endif()
endif()

# appmodules — TANPA OnLoad.cpp (hanya untuk React Native TurboModules)
add_library(appmodules SHARED
  # OnLoad.cpp tidak termasuk di sini — hanya pristine-audio yang membutuhkannya
)

target_include_directories(appmodules PRIVATE
  "${CODEGEN_JNI_DIR}"
  "${AUTOLINKING_JNI_DIR}"
  ${_RN_INCLUDES}
  ${_JSI_INCLUDES}
  ${_FBJNI_INCLUDES}
)

if(EXISTS "${AUTOLINKING_JNI_DIR}")
  target_sources(appmodules PRIVATE
    "${AUTOLINKING_JNI_DIR}/autolinking.cpp"
  )
endif()

if(EXISTS "${CODEGEN_JNI_DIR}")
  target_sources(appmodules PRIVATE
    "${CODEGEN_JNI_DIR}/PristineAudioSpec-generated.cpp"
    "${CODEGEN_JNI_DIR}/react/renderer/components/PristineAudioSpec/ComponentDescriptors.cpp"
    "${CODEGEN_JNI_DIR}/react/renderer/components/PristineAudioSpec/EventEmitters.cpp"
    "${CODEGEN_JNI_DIR}/react/renderer/components/PristineAudioSpec/Props.cpp"
    "${CODEGEN_JNI_DIR}/react/renderer/components/PristineAudioSpec/ShadowNodes.cpp"
    "${CODEGEN_JNI_DIR}/react/renderer/components/PristineAudioSpec/States.cpp"
  )
endif()

if(AUTOLINKED_LIBRARIES)
  foreach(lib ${AUTOLINKED_LIBRARIES})
    if(TARGET ${lib})
      target_include_directories(${lib} PRIVATE
        ${_RN_INCLUDES}
        ${_JSI_INCLUDES}
        ${_FBJNI_INCLUDES}
        "${AUTOLINKING_JNI_DIR}"
        "${CODEGEN_JNI_DIR}"
      )

      target_link_libraries(${lib}
        ReactAndroid::reactnative
        ReactAndroid::jsi
        fbjni::fbjni
      )
    endif()
  endforeach()

  foreach(lib ${AUTOLINKED_LIBRARIES})
    if(TARGET ${lib})
      get_target_property(_AUTOLINK_SOURCES ${lib} SOURCES)
      if(_AUTOLINK_SOURCES)
        target_sources(appmodules PRIVATE ${_AUTOLINK_SOURCES})
      endif()

      get_target_property(_AUTOLINK_INCLUDES ${lib} INTERFACE_INCLUDE_DIRECTORIES)
      if(_AUTOLINK_INCLUDES)
        target_include_directories(appmodules PRIVATE ${_AUTOLINK_INCLUDES})
      endif()

      get_target_property(_AUTOLINK_DEFS ${lib} INTERFACE_COMPILE_DEFINITIONS)
      if(_AUTOLINK_DEFS)
        target_compile_definitions(appmodules PRIVATE ${_AUTOLINK_DEFS})
      endif()

      get_target_property(_AUTOLINK_OPTS ${lib} INTERFACE_COMPILE_OPTIONS)
      if(_AUTOLINK_OPTS)
        target_compile_options(appmodules PRIVATE ${_AUTOLINK_OPTS})
      endif()
    endif()
  endforeach()
endif()

target_link_libraries(appmodules PRIVATE
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
  android
  log
) 