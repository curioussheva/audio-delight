// =====================================================
// dsp/DSPChain.cpp
// Final Production-Oriented Version
// =====================================================

#include "DSPChain.h"

#include "convolution/IRLoader.h"
#include "dynamics/LimiterNode.h"
#include "headphone/HeadphoneCorrectionNode.h"
#include "hrtf/HRTFNode.h"
#include "spatial/StereoWidenerNode.h"
#include "tone/EQNode.h"
#include "tone/GainNode.h"
#include "tone/ReverbNode.h"

#include <cmath>

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
// CONVOLVER — IMPULSE RESPONSE (2026-11-20)
// =====================================================

int DSPChain::loadConvolverIr(
    const std::string& path
) {

    WavIrData data;
    const IrLoadStatus status =
        IRLoader::loadWavMono(path, data);
    if (status != IrLoadStatus::Ok) {
        return static_cast<int>(status);
    }

    // Validasi panjang sesudah resample ke laju stream SAAT INI —
    // sebelum menyimpan apa pun: gagal = IR lama dipertahankan.
    const int outLen = static_cast<int>(
        std::llround(
            static_cast<double>(data.samples.size()) *
            static_cast<double>(mSampleRate) /
            static_cast<double>(data.sampleRateHz)
        )
    );
    if (
        outLen < 1 ||
        outLen > UniformPartitionedConvolver::kMaxMultiKernelLength
    ) {
        return ConvolverNode::kLoadTooLong;
    }

    mIrOriginal = data.samples;
    mIrRateHz = data.sampleRateHz;
    mIrLoaded = true;

    // Node sedang hidup: serahkan + stage kernel sekarang (live-safe
    // — audio thread memasangnya di process() berikutnya). Bila belum
    // ada node (sebelum prepare pertama), buildGraph yang akan
    // menyerahkan IR ke node segar.
    if (mConvolver) {
        mConvolver->setIrSource(mIrOriginal, mIrRateHz);
        mConvolver->stageKernelForRate(mSampleRate);
    }

    return ConvolverNode::kLoadOk;
}

void DSPChain::clearConvolverIr() {

    mIrOriginal.clear();
    mIrRateHz = 0;
    mIrLoaded = false;

    if (mConvolver) {
        mConvolver->clearIr();
    }
}

int DSPChain::convolverIrTaps() const {

    if (
        !mIrLoaded ||
        mIrOriginal.empty() ||
        mIrRateHz <= 0 ||
        mSampleRate <= 0
    ) {
        return 0;
    }
    return static_cast<int>(
        std::llround(
            static_cast<double>(mIrOriginal.size()) *
            static_cast<double>(mSampleRate) /
            static_cast<double>(mIrRateHz)
        )
    );
}

int DSPChain::convolverIrDurationMs() const {

    const int taps = convolverIrTaps();
    if (taps <= 0 || mSampleRate <= 0) {
        return 0;
    }
    return static_cast<int>(
        std::llround(
            static_cast<double>(taps) * 1000.0 /
            static_cast<double>(mSampleRate)
        )
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

    // Node lama dihancurkan clear() — pointer live di-nol-kan dulu;
    // diisi lagi saat node convolver baru ditambahkan di bawah.
    mConvolver = nullptr;

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
    // CONVOLVER STAGE — IMPULSE RESPONSE (2026-11-20)
    // =========================================
    //
    // IR .wav pilihan user (concert hall, tube amp, karakter
    // headphone — ala convolver ViPER4Android) sesudah reverb,
    // sebelum HRTF. Urutan ini disengaja:
    //   - Sesudah reverb: IR *adalah* ruangnya — menaruh convolver
    //     sebelum reverb berarti ekor Freeverb menimpa ruang IR;
    //     sesudah reverb, IR membentuk ruang AKHIR dari seluruh mix
    //     (kering + widener + ekor reverb). Memakai keduanya
    //     bersamaan = dua ruang bertumpuk; biasanya pakai salah satu.
    //   - Sebelum HRTF: ekor IR ikut ter-spatialisasi sebagai
    //     virtual speaker — alasan yang sama persis dengan HRTF
    //     sesudah reverb. Kalau convolver duduk sesudah HRTF, sinyal
    //     binaural yang sudah jadi dikonvolusi lagi dengan IR mono
    //     (ruang di atas ruang yang sudah ter-spatialisasi).
    //   - Sebelum gain: master gain mengatur level AKHIR termasuk
    //     IR; slider gain 0 tetap membisukan segalanya.
    //   - Sebelum limiter: limiter menangkap puncak campuran
    //     kering+IR (IR panas bisa menaikkan puncak sesaat).
    // Toggle OFF / belum ada IR = node passthrough bit-exact
    // (biaya NOL sesudah fade), jadi rantai tanpa convolver
    // berperilaku persis seperti sebelumnya. Bit-perfect tidak
    // tersentuh: node hanya hidup di DSPChain (processDSP),
    // processBitPerfect() no-op.

    {
        auto convolver =
            std::make_unique<ConvolverNode>();
        ConvolverNode* raw = convolver.get();
        if (mGraph.addNode(std::move(convolver))) {
            mConvolver = raw;

            // IR yang sudah dimuat sebelum graph ini dibangun (load
            // sebelum engine start / sesudah prepare sebelumnya)
            // diserahkan ke node segar — node me-rebuild kernel di
            // prepare() untuk laju stream saat itu.
            if (mIrLoaded) {
                mConvolver->setIrSource(mIrOriginal, mIrRateHz);
            }
        }
    }

    // =========================================
    // HRTF STAGE (2026-11-19)
    // =========================================
    //
    // Virtual speaker ±30° (HRIR KEMAR, SADIE II DFC) sesudah reverb,
    // sebelum gain + limiter. Urutan ini disengaja (keputusan user):
    //   - Sesudah widener: HRTF me-render mix yang sudah dilebarkan
    //     (keduanya komplementer, bukan pilihan).
    //   - Sesudah reverb: ekor reverb ikut ter-spatialisasi — kalau
    //     HRTF duduk sebelum reverb, sinyal kering di luar kepala
    //     sementara ekornya tetap stereo di dalam kepala.
    //   - Sebelum gain: master gain mengatur level AKHIR termasuk
    //     trim HRIR (+0,39 dB); slider gain 0 tetap membisukan
    //     segalanya.
    //   - Sebelum limiter: limiter menangkap puncak campuran (dua
    //     virtual speaker bisa menaikkan puncak sesaat).
    // Toggle OFF = node passthrough bit-exact (biaya NOL sesudah
    // fade), jadi rantai tanpa HRTF berperilaku persis seperti
    // sebelumnya. Bit-perfect tidak tersentuh: node hanya hidup di
    // DSPChain (processDSP), processBitPerfect() no-op.

    mGraph.addNode(
        std::make_unique<
            HRTFNode
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