// =====================================================
// dsp/DSPChain.h
// Final Production-Oriented Version
// =====================================================

#pragma once

#include <string>
#include <vector>

#include "../core/DSPConfig.h"

#include "convolution/ConvolverNode.h"
#include "graph/DSPGraph.h"

namespace pristine {

class DSPChain {
public:

    // =================================================
    // LIFECYCLE
    // =================================================

    void prepare(
        int sampleRate,
        int maxFrames
    );

    void reset();

    // =================================================
    // CONFIG
    // =================================================

    void applyConfig(
        const DSPConfig& config
    );

    // =================================================
    // PROCESS
    // =================================================

    void process(
        float* left,
        float* right,
        int frames
    );

    // =================================================
    // CONVOLVER — IMPULSE RESPONSE (2026-11-20)
    // =================================================
    //
    // IR tinggal DI SINI (master copy), bukan di node: prepare()
    // membangun ulang graph dengan node BARU, jadi node sendiri tidak
    // bisa jadi satu-satunya pemilik original. buildGraph()
    // menyerahkan original ke node segar (setIrSource); node
    // me-rebuild kernel di prepare() untuk laju stream saat itu.
    //
    // loadConvolverIr() dipanggil dari thread JNI/UI (bukan audio
    // thread): parse WAV + validasi panjang + stage kernel ke node
    // yang sedang hidup (bila ada — live-safe lewat
    // setKernelPartitioned). Return status kLoad* ConvolverNode
    // (angka sama dengan IrLoadStatus / ConvolverIrStatus JS).
    // Gagal = IR lama dipertahankan.
    int loadConvolverIr(
        const std::string& path
    );

    // Hapus IR (master copy + node hidup). Toggle convolver tetap
    // dipegang DSPConfig (convolverEnabled) — clear hanya membuang
    // filenya dari rantai.
    void clearConvolverIr();

    bool convolverIrLoaded() const {
        return mIrLoaded;
    }

    int convolverIrSampleRateHz() const {
        return mIrRateHz;
    }

    // Panjang IR (tap) sesudah resample ke laju stream SAAT INI,
    // atau 0 bila tidak ada IR.
    int convolverIrTaps() const;

    // Durasi IR (ms) pada laju stream saat ini, atau 0.
    int convolverIrDurationMs() const;

private:

    // =================================================
    // GRAPH
    // =================================================

    void buildGraph();

private:

    DSPGraph mGraph;

    DSPConfig mConfig;

    int mSampleRate = 48000;
    int mMaxFrames = 1920;

    bool mPrepared = false;

    // =================================================
    // CONVOLVER — IR MASTER COPY (2026-11-20)
    // =================================================

    // Node hidup di graph (nullptr sebelum buildGraph pertama).
    // TIDAK owning — graph yang memiliki node; pointer ini hanya
    // untuk meneruskan load/clear saat audio jalan. Di-nol-kan di
    // awal buildGraph() (node lama dihancurkan clear()).
    ConvolverNode* mConvolver = nullptr;

    // IR asli (laju file) + lajunya. Hanya ditulis thread JNI/UI
    // (load/clear) dan dibaca buildGraph()/prepare() — bukan audio
    // thread (node membaca kopinya sendiri).
    std::vector<float> mIrOriginal;
    int mIrRateHz = 0;
    bool mIrLoaded = false;
};

} // namespace pristine
