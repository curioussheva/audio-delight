#include "EQNode.h"

namespace pristine {

void EQNode::prepare(
    int sampleRate,
    int
) {

    // �� FIX (2026-10-10): dulu bodi kosong, jadi `mEQ.prepare()` tidak pernah
    // dipanggil dan `EQProcessor::mSampleRate` tetap nilai default 48000.
    //
    // Akibatnya koefisien biquad untuk file 44.1 kHz dihitung dengan
    // 48000 sebagai sample rate -> frekuensi tiap band meleset ~8.8%
    // (band 1 kHz jatuh di ~919 Hz). Laten selama EQ belum tersambung;
    // langsung terdengar begitu EQ dinyalakan.
    mEQ.prepare(sampleRate);
}

void EQNode::reset() {

    mEQ.reset();
}

void EQNode::process(
    float* left,
    float* right,
    int count
) {

    mEQ.process(
        left,
        right,
        count
    );
}

EQProcessor&
EQNode::processor() {

    return mEQ;
}

// =====================================================
// APPLY CONFIG
// =====================================================

void EQNode::applyConfig(
    const DSPConfig& config
) {

    for (int band = 0; band < EQProcessor::kBands; ++band) {

        mEQ.setBandGain(
            band,
            config.eqGain[band]
        );
    }

    mEQ.setBassBoost(
        config.bassBoost
    );
}

} // namespace pristine