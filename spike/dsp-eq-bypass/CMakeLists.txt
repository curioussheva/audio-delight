# =====================================================
# spike/dsp-eq-bypass/CMakeLists.txt — HARNESS HOST P0-1
# =====================================================
#
# Build STANDALONE (di luar build app). TIDAK di-include oleh
# android/app/src/main/cpp/CMakeLists.txt — target app default
# tidak berubah sama sekali.
#
#   cmake -S spike/dsp-eq-bypass -B /tmp/eq-bypass-build
#   cmake --build /tmp/eq-bypass-build
#   /tmp/eq-bypass-build/test_dsp_eq_bypass
#   /tmp/eq-bypass-build/test_pipeline_eq_bypass
#
# Sanitizer (ASan+UBSan, pola spike/hrtf):
#   cmake -S spike/dsp-eq-bypass -B /tmp/eq-bypass-asan \
#     -DCMAKE_CXX_FLAGS="-O1 -g -fsanitize=address,undefined" \
#     -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined"
#   cmake --build /tmp/eq-bypass-asan
#   /tmp/eq-bypass-asan/test_dsp_eq_bypass
#   /tmp/eq-bypass-asan/test_pipeline_eq_bypass
#
# Target:
#   test_dsp_eq_bypass      — DSPChain langsung: enabled=false
#                             passthrough bit-exact walau EQ +6 dB,
#                             enabled=true menerapkan EQ, toggle pulih.
#   test_pipeline_eq_bypass — AudioPipeline::process() mode DSP:
#                             membuktikan applyDSPConfig memetakan
#                             params.eqEnabled -> DSPConfig.enabled dan
#                             dedup dspConfigEquals mendeteksi toggle.
#
# SPDX-License-Identifier: MIT

cmake_minimum_required(VERSION 3.16)
project(dsp-eq-bypass-spike CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(PRISTINE_CPP ${CMAKE_CURRENT_SOURCE_DIR}/../../android/app/src/main/cpp)

# Rantai DSP lengkap (dipakai kedua tes): graph + semua node +
# penopangnya (biquad, konvolver HRTF, FFT, koreksi headphone).
set(DSP_CHAIN_SOURCES
  ${PRISTINE_CPP}/dsp/DSPChain.cpp
  ${PRISTINE_CPP}/dsp/graph/DSPGraph.cpp
  ${PRISTINE_CPP}/dsp/tone/EQNode.cpp
  ${PRISTINE_CPP}/dsp/tone/GainNode.cpp
  ${PRISTINE_CPP}/dsp/tone/ReverbNode.cpp
  ${PRISTINE_CPP}/dsp/dynamics/LimiterNode.cpp
  ${PRISTINE_CPP}/dsp/spatial/StereoWidenerNode.cpp
  ${PRISTINE_CPP}/dsp/headphone/HeadphoneCorrectionNode.cpp
  ${PRISTINE_CPP}/dsp/headphone/HeadphoneCorrection.cpp
  ${PRISTINE_CPP}/dsp/headphone/CrossfeedProcessor.cpp
  ${PRISTINE_CPP}/dsp/hrtf/HRTFNode.cpp
  ${PRISTINE_CPP}/dsp/EQProcessor.cpp
  ${PRISTINE_CPP}/dsp/BiquadCascade.cpp
  ${PRISTINE_CPP}/dsp/BiquadFilter.cpp
  ${PRISTINE_CPP}/dsp/OutputStage.cpp
  ${PRISTINE_CPP}/dsp/convolution/UniformPartitionedConvolver.cpp
  ${PRISTINE_CPP}/dsp/convolution/FIRFilter.cpp
  ${PRISTINE_CPP}/fft/FFTPlan.cpp
)

add_executable(test_dsp_eq_bypass
  test_dsp_eq_bypass.cpp
  ${DSP_CHAIN_SOURCES}
)
target_include_directories(test_dsp_eq_bypass PRIVATE ${PRISTINE_CPP})
target_compile_options(test_dsp_eq_bypass PRIVATE -Wall -Wextra)

# Tes pipeline: + AudioPipeline + ImmersiveStage beserta node
# immersive-nya (prepare() pipeline menyiapkan ketiganya).
add_executable(test_pipeline_eq_bypass
  test_pipeline_eq_bypass.cpp
  ${DSP_CHAIN_SOURCES}
  ${PRISTINE_CPP}/core/AudioPipeline.cpp
  ${PRISTINE_CPP}/core/ImmersiveStage.cpp
  ${PRISTINE_CPP}/dsp/immersive/BrainwaveGenerator.cpp
  ${PRISTINE_CPP}/dsp/immersive/FFTResonanceAnalyzer.cpp
  ${PRISTINE_CPP}/dsp/immersive/HarmonicExciter.cpp
  ${PRISTINE_CPP}/dsp/immersive/SolfeggioResonator.cpp
  ${PRISTINE_CPP}/dsp/immersive/SpatialFieldProcessor.cpp
)
target_include_directories(test_pipeline_eq_bypass PRIVATE ${PRISTINE_CPP})
target_compile_options(test_pipeline_eq_bypass PRIVATE -Wall -Wextra)
