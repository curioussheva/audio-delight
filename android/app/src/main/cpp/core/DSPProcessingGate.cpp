// =====================================================
// core/DSPProcessingGate.cpp
// =====================================================

#include "DSPProcessingGate.h"

#include <atomic>

namespace pristine {

namespace {

// Bawaan saat build. 1 = pipeline DIPROSES di jalur produksi.
//
// Dipilih 1 pada 2026-10-07: tiga mode (BitPerfect/DSP/Immersive) harus
// benar-benar berfungsi, bukan hanya tersimpan. Mode yang tombolnya ada tapi
// tidak berefek adalah bentuk "tampak tersedia padahal tidak ada" - persis
// yang dihindari.
//
// Sakelar ini tetap ada (bukan dihapus) karena:
//   - perbandingan "dengan DSP" vs "tanpa DSP" secara langsung di perangkat,
//     lewat tombol diagnostik di settings (setDSPProcessingEnabled)
//   - jalur keluar cepat kalau ada bug DSP di perangkat tanpa revert kode
#ifndef PRISTINE_DSP_IN_PRODUCTION
#define PRISTINE_DSP_IN_PRODUCTION 1
#endif

constexpr bool kBuildDefault = (PRISTINE_DSP_IN_PRODUCTION != 0);

// Mulai dari bawaan build; bisa diubah saat runtime.
std::atomic<bool> gEnabled{kBuildDefault};

} // namespace

bool DSPProcessingGate::enabled() noexcept {
    return gEnabled.load(std::memory_order_acquire);
}

void DSPProcessingGate::setEnabled(bool enabled) noexcept {
    gEnabled.store(enabled, std::memory_order_release);
}

bool DSPProcessingGate::buildDefault() noexcept {
    return kBuildDefault;
}

} // namespace pristine
