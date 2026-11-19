// =====================================================
// dsp/DSPChain.cpp
// Final Production-Oriented Version
// =====================================================

#include "DSPChain.h"

#include "dynamics/LimiterNode.h"
#include "headphone/HeadphoneCorrectionNode.h"
#include "spatial/StereoWidenerNode.h"
#include "tone/EQNode.h"
#include "tone/GainNode.h"
#include "tone/ReverbNode.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void DSPChain::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate;
    mMaxFrames = maxFrames;

    // =========================================
    // BUILD DSP GRAPH
    // =========================================

    buildGraph();

    // =========================================
    // PREPARE GRAPH
    // =========================================

    mGraph.prepare(
        sampleRate,
        maxFrames
    );

    mPrepared = true;
}

// =====================================================
// RESET
// =====================================================

void DSPChain::reset() {

    mGraph.reset();
}

// =====================================================
// APPLY CONFIG
// =====================================================

void DSPChain::applyConfig(
    const DSPConfig& config
) {

    mConfig = config;

    mGraph.applyConfig(
        config
    );
}

// =====================================================
// PROCESS
// =====================================================

void DSPChain::process(
    float* left,
    float* right,
    int frames
) {

    if (!mPrepared) {
        return;
    }

    if (!mConfig.enabled) {
        return;
    }

    mGraph.process(
        left,
        right,
        frames
    );
}

// =====================================================
// BUILD GRAPH
// =====================================================

void DSPChain::buildGraph() {

    // =========================================
    // CLEAR OLD GRAPH
    // =========================================

    mGraph.clear();

    // =========================================
    // HEADPHONE CORRECTION STAGE
    // =========================================
    //
    // 🔥 FASE D (2026-10-10): diletakkan SEBELUM EQNode.
    //
    // Koreksi headphone = netralisasi alat; EQ user = selera. Urutan ini sama
    // dengan AutoEQ + Equalizer APO. Kalau dibalik, setiap kali ganti
    // headphone, tuning user harus diulang dari nol.
    //
    // Node ini melewati buffer tanpa perubahan kalau koreksi dimatikan atau
    // belum ada preset terpasang (lihat applyConfig).

    mGraph.addNode(
        std::make_unique<
            HeadphoneCorrectionNode
        >()
    );

    // =========================================
    // TONE STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<EQNode>()
    );

    // =========================================
    // SPATIAL STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            StereoWidenerNode
        >()
    );

    // =========================================
    // REVERB STAGE (2026-11-19)
    // =========================================
    //
    // Freeverb (Schroeder-Moorer) sesudah widener, sebelum gain +
    // limiter. Urutan ini disengaja:
    //   - Sesudah widener: ekor reverb ikut mendapat lebar stereo
    //     (widener melebarkan sinyal kering; reverb yang ditaruh
    //     sebelumnya akan terdengar sempit di tengah).
    //   - Sebelum gain: master gain mengatur level AKHIR termasuk
    //     ekor — slider gain 0 benar-benar membisukan segalanya.
    //   - Sebelum limiter: limiter menangkap puncak campuran
    //     kering+basah (reverb bisa menaikkan puncak sesaat).
    // Preset 0 = node passthrough bit-exact (biaya NOL sesudah fade),
    // jadi rantai tanpa reverb berperilaku persis seperti sebelumnya.

    mGraph.addNode(
        std::make_unique<
            ReverbNode
        >()
    );

    // =========================================
    // GAIN STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            GainNode
        >()
    );

    // =========================================
    // DYNAMICS STAGE
    // =========================================

    mGraph.addNode(
        std::make_unique<
            LimiterNode
        >()
    );
}

} // namespace pristine