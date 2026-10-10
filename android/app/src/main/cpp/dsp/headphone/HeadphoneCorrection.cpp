#include "HeadphoneCorrection.h"
#include <cstring>

namespace pristine { namespace dsp {

bool HeadphoneCorrection::loadProfile(const std::string& model) {
    (void)model;
    // 🔥 FIX (2026-10-10): dulu `return true` tanpa memuat apa pun.
    //
    // Itu sukses palsu: pemanggil tidak punya cara membedakan "profil
    // diterapkan" dari "tidak ada yang terjadi". `docs/BOILERPLATE_AND_STUBS.md`
    // §2 melarangnya secara eksplisit - stub boleh kosong, tidak boleh
    // mengembalikan sukses.
    //
    // Sekarang gagal dengan berisik sampai benar-benar ada pemuat profil.
    // Rencananya: parser preset parametric/graphic (lihat
    // docs/HEADPHONE_CORRECTION.md).
    return false;
}

void HeadphoneCorrection::process(float* left, float* right, int32_t numFrames) {
    applyFIR(mFilterLeft, left, numFrames);
    applyFIR(mFilterRight, right, numFrames);
}

void HeadphoneCorrection::applyFIR(const std::vector<float>& coeffs, float* inout, int32_t numFrames) {
    if (coeffs.empty()) return;
    for (int32_t i = 0; i < numFrames; ++i) {
        inout[i] *= coeffs[0]; // trivial
    }
}

void HeadphoneCorrection::reset() {}

}} // namespace