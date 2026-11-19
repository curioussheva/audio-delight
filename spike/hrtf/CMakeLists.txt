# =====================================================
# spike/hrtf/CMakeLists.txt — HARNESS HOST HRTF
# =====================================================
#
# Build STANDALONE (di luar build app). TIDAK di-include oleh
# android/app/src/main/cpp/CMakeLists.txt — target app default
# tidak berubah sama sekali.
#
#   cmake -S spike/hrtf -B /tmp/hrtf-build
#   cmake --build /tmp/hrtf-build
#   /tmp/hrtf-build/test_hrtf_convolver
#
# Target:
#   test_hrtf_convolver — harness host (g++, tanpa perangkat):
#   konvolver partitioned vs FIR langsung + FFT round-trip.
#
# SPDX-License-Identifier: MIT

cmake_minimum_required(VERSION 3.16)
project(hrtf-spike CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(PRISTINE_CPP ${CMAKE_CURRENT_SOURCE_DIR}/../../android/app/src/main/cpp)

add_executable(test_hrtf_convolver
  test_hrtf_convolver.cpp
  ${PRISTINE_CPP}/dsp/convolution/UniformPartitionedConvolver.cpp
  ${PRISTINE_CPP}/dsp/convolution/FIRFilter.cpp
  ${PRISTINE_CPP}/fft/FFTPlan.cpp
)
target_include_directories(test_hrtf_convolver PRIVATE ${PRISTINE_CPP})
target_compile_options(test_hrtf_convolver PRIVATE -Wall -Wextra)

add_executable(test_hrtf_node
  test_hrtf_node.cpp
  ${PRISTINE_CPP}/dsp/hrtf/HRTFNode.cpp
  ${PRISTINE_CPP}/dsp/convolution/UniformPartitionedConvolver.cpp
  ${PRISTINE_CPP}/dsp/convolution/FIRFilter.cpp
  ${PRISTINE_CPP}/fft/FFTPlan.cpp
)
target_include_directories(test_hrtf_node PRIVATE ${PRISTINE_CPP})
target_compile_options(test_hrtf_node PRIVATE -Wall -Wextra)
