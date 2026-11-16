# =====================================================
# spike/usb-direct/CMakeLists.txt — SPIKE "USB Direct"
# =====================================================
#
# Build STANDALONE (di luar build app). TIDAK di-include oleh
# android/app/src/main/cpp/CMakeLists.txt — target app default
# tidak berubah sama sekali.
#
#   cmake -S spike/usb-direct -B /tmp/usb-direct-build
#   cmake --build /tmp/usb-direct-build
#   /tmp/usb-direct-build/test_usb_direct
#
# Target:
#   usb_direct_core — parser + sine + streaming (tanpa JNI).
#   test_usb_direct — harness host (g++, tanpa perangkat).
#   usb_direct_jni  — HANYA bila PRISTINE_USB_DIRECT_JNI=ON dan
#                     JNI tersedia (CI/NDK). Default OFF.
#
# SPDX-License-Identifier: MIT

cmake_minimum_required(VERSION 3.16)
project(usb-direct-spike CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_library(usb_direct_core STATIC
  usb_direct.cpp
  usb_direct_stream.cpp
)
target_include_directories(usb_direct_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(usb_direct_core PRIVATE -Wall -Wextra)

add_executable(test_usb_direct test_usb_direct.cpp)
target_link_libraries(test_usb_direct PRIVATE usb_direct_core pthread)
target_compile_options(test_usb_direct PRIVATE -Wall -Wextra)

option(PRISTINE_USB_DIRECT_JNI "Build JNI bridge (butuh jni.h dari NDK)" OFF)
if(PRISTINE_USB_DIRECT_JNI)
  find_package(JNI)
  if(JNI_FOUND)
    add_library(usb_direct_jni SHARED usb_direct_jni.cpp)
    target_link_libraries(usb_direct_jni PRIVATE usb_direct_core ${JNI_LIBRARIES})
    target_include_directories(usb_direct_jni PRIVATE ${JNI_INCLUDE_DIRS})
    message(STATUS "usb_direct_jni: ENABLED")
  else()
    message(WARNING "PRISTINE_USB_DIRECT_JNI=ON tapi JNI tidak ditemukan — skip usb_direct_jni")
  endif()
endif()
