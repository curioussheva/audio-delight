#include "DSPGraph.h"

namespace pristine {

namespace {

// =====================================================
// PENGAMAN OUTPUT PER NODE (C-P2, 2026-11-12)
// =====================================================
//
// Satu sampel non-finite di output sebuah node berarti state internal node
// itu sudah teracuni — mis. z1/z2 biquad DF-II = NaN, yang MENETAP walau
// koefisien sudah diperbaiki (hanya reset() yang membersihkan). Kalau
// dibiarkan, NaN merambat ke node hilir dan meracuni state mereka juga.
//
// Karena itu, sesudah tiap node memproses: pindai buffer; bila ada sampel
// non-finite, nol-kan sampel itu (supaya tidak merambat ke node berikut)
// dan reset() node yang mengeluarkannya. Nilai valid tidak disentuh —
// pindai hanya membaca, dan reset() hanya jalan bila benar-benar ada
// NaN/Inf. Kalau koefisien node masih rusak, node me-reset tiap buffer
// (murah, tanpa akumulasi) sampai koefisien diperbaiki — lalu pulih sendiri
// tanpa stop/reopen.
//
// Biaya: 2×frames uji bit-pattern per node per buffer (frames ≤ 1920,
// 5 node di DSPChain) — jauh di bawah satu operasi trig, tanpa
// alokasi/lock. Dipasang di sini, bukan di DSPChain::process: loop
// per-node HANYA ada di DSPGraph::process — DSPChain hanya mendelegasikan.
void sanitizeNodeOutput(
    DSPNode& node,
    float* left,
    float* right,
    int frames
) {

    bool poisoned = false;

    for (int i = 0; i < frames; ++i) {

        if (!isFiniteFloat(left[i])) {
            left[i] = 0.0f;
            poisoned = true;
        }

        if (!isFiniteFloat(right[i])) {
            right[i] = 0.0f;
            poisoned = true;
        }
    }

    if (poisoned) {
        node.reset();
    }
}

} // namespace

// =====================================================
// PREPARE
// =====================================================

void DSPGraph::prepare(
    int sampleRate,
    int maxFrames
) {

    mSampleRate = sampleRate;
    mMaxFrames = maxFrames;

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i]->prepare(
            sampleRate,
            maxFrames
        );
    }

    mPrepared = true;
}

// =====================================================
// RESET
// =====================================================

void DSPGraph::reset() {

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i]->reset();
    }
}

// =====================================================
// CLEAR
// =====================================================

void DSPGraph::clear() {

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i].reset();
    }

    mNodeCount = 0;

    // (B14-M-H6): node sudah tidak ada — addNode berikutnya tidak boleh
    // prepare langsung (lihat addNode), melainkan menunggu prepare().
    mPrepared = false;
}

// =====================================================
// APPLY CONFIG
// =====================================================

void DSPGraph::applyConfig(
    const DSPConfig& config
) {

    for (int i = 0; i < mNodeCount; ++i) {

        mNodes[i]->applyConfig(
            config
        );
    }
}

// =====================================================
// ADD NODE
// =====================================================

bool DSPGraph::addNode(
    std::unique_ptr<DSPNode> node
) {

    if (!node) {
        return false;
    }

    if (
        mNodeCount >=
        kMaxNodes
    ) {
        return false;
    }

    // (B14-M-H6): JANGAN prepare di sini bila graph belum pernah
    // di-prepare — mSampleRate/mMaxFrames masih basi (default 48000 /
    // laju prepare sebelumnya), dan prepare() yang segera menyusul akan
    // memanggil node->prepare() lagi dengan laju benar (EQProcessor
    // di-prepare 2x per start: trig 10 band 2x). Node yang ditambah
    // sesudah prepare() (graph sudah hidup) tetap di-prepare langsung
    // dengan laju saat ini.
    if (mPrepared) {

        node->prepare(
            mSampleRate,
            mMaxFrames
        );
    }

    mNodes[mNodeCount++] =
        std::move(node);

    return true;
}

// =====================================================
// PROCESS
// =====================================================

void DSPGraph::process(
    float* left,
    float* right,
    int frames
) {

    for (int i = 0; i < mNodeCount; ++i) {

        auto& node =
            mNodes[i];

        if (
            !node ||
            !node->isEnabled()
        ) {
            continue;
        }

        node->process(
            left,
            right,
            frames
        );

        // (C-P2, 2026-11-12): output non-finite = state node teracuni.
        // Nol-kan sampelnya supaya tidak merambat, lalu reset state node
        // itu supaya NaN tidak menetap di DF-II sampai stop/reopen.
        sanitizeNodeOutput(
            *node,
            left,
            right,
            frames
        );
    }
}

} // namespace pristine