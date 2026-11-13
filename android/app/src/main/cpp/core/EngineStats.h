// =====================================================
// core/EngineStats.h
// =====================================================

#pragma once

#include <cstdint>

namespace pristine {

// =====================================================
// ENGINE RUNTIME STATS
// =====================================================

struct EngineStats {

    // =============================================
    // BUFFER
    // =============================================

    uint64_t bufferedSamples =
        0;

    // Ukuran buffer stream AKTUAL dalam frame (Oboe
    // getBufferSizeInFrames) — hanya dilaporkan, tidak pernah diubah:
    // setBufferSizeInFrames() tidak pernah dipanggil (C-XRUN, 2026-11-12).
    // 0 = belum dibaca / tidak ada stream.
    int32_t bufferSizeFrames =
        0;

    // =============================================
    // XRUNS
    // =============================================

    uint64_t underruns =
        0;

    uint64_t overruns =
        0;

    // XRun Oboe (getXRunCount): hitungan underrun+overrun stream ini
    // menurut HAL — BUKAN recordUnderrun()/recordOverrun() lokal yang
    // menghitung dari sisi callback kita (C-XRUN, 2026-11-12).
    uint64_t xruns =
        0;

    // =============================================
    // LATENCY
    // =============================================

    float latencyMs =
        0.0f;

    // =============================================
    // CALLBACK
    // =============================================

    float callbackTimeMs =
        0.0f;

    // =============================================
    // CPU LOAD
    // =============================================

    float cpuLoad =
        0.0f;

    // =============================================
    // STREAM
    // =============================================

    uint32_t sampleRate =
        48000;

    uint32_t channelCount =
        2;

    // Burst stream dalam frame (Oboe getFramesPerBurst). 0 = belum dibaca.
    int32_t framesPerBurst =
        0;

    // (C-XRUN, 2026-11-12): TIDAK ada field isMmap — Oboe tidak mengekspos
    // pemakaian MMAP (tidak ada isMmap() di AudioStream.h pinned 5714d53);
    // satu-satunya sumber adalah AAudio C API (AAudioStream_isMMapUsed),
    // yang butuh API 26+ sementara minSdk 24 dan libaaudio tidak di-link
    // (Oboe me-dlopen AAudio sendiri). Field yang selalu false = stub
    // yang dikompilasi, jadi sengaja tidak ditambah.

    // =============================================
    // MODE
    // =============================================

    bool exclusiveMode =
        false;

    // (C-DSPMETRIC, 2026-11-12): default false, bukan true. true berarti
    // "DSP aktif" sebelum ada stream, mode, atau gate yang diperiksa —
    // persis kebohongan yang diperbaiki item ini. false = belum terbukti
    // aktif; nilai yang benar ditulis start()/setDSPEnabled() lewat
    // computeDSPActive(). Konsisten dengan AudioMetrics::mDSPEnabled
    // (false) dan AudioMetrics::reset() (false).
    bool dspEnabled =
        false;
};

} // namespace pristine