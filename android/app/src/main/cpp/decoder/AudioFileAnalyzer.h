// =====================================================
// decoder/AudioFileAnalyzer.h
// =====================================================
//
// Analisis spektral OFFLINE sebuah file audio: decode beberapa jendela
// dari sepanjang file, FFT, lalu ukur konten frekuensi tertinggi yang
// NYATA (bukan dari label metadata).
//
// Dibuat 2026-11-11 (deteksi file hi-res/lossless palsu — tab Analyzer):
// tab Analyzer sebelumnya hanya menebak dari metadata (codec + bitrate +
// ekstensi) — "spectral cutoff" dan "dynamic range"-nya nilai tabel/rumus,
// bukan hasil ukur. FLAC palsu dari MP3 lolos sebagai lossless. Analyzer
// ini mengukur langsung dari sampel hasil decode.
//
// Cara pakai: analyzeFile(path) — path file lokal (plain path; prefix
// "file://" dipotong di JNI). Jalan sinkron di thread pemanggil; decode
// 5 jendela × 8192 frame biasanya < 1 detik untuk file lokal.
//
// Dua hal yang diukur:
//   1. Cutoff terukur: bin tertinggi yang magnitudenya di atas ambang
//      -60 dB relatif terhadap puncak spektrum (max antar-jendela).
//      - File 96 kHz asli: konten nyata di atas 22 kHz.
//      - Upsample CD 44,1 kHz: tembok di ~22,05 kHz.
//      - Sumber lossy (MP3/AAC) dibungkus FLAC: potongan ~16-20 kHz.
//      Ambang relatif -60 dB dipilih supaya noise dither 16-bit
//      (~-93 dBFS, putih di semua frekuensi) tidak terhitung konten
//      selama jendela terkeras mendekati 0 dBFS.
//   2. Rasio LSB-16: fraksi sampel kanal kiri yang tepat berada di grid
//      16-bit (x * 32768 bulat). File 24-bit hasil padding dari 16-bit
//      punya 8 bit bawah nol -> rasio ~1. File 24-bit asli -> rasio ~0.
//      Syarat: decode di laju ASLI file (tanpa resample, dither=none)
//      supaya kuantisasi tidak rusak — lihat two-pass open di .cpp.
//      Mono-mix TIDAK dipakai untuk tes ini: (L+R)/2 menggeser grid.
//
// Batasan jujur: spektrum tidak bisa membuktikan "studio master" —
// rekaman hi-res asli dari master analog tua bisa saja memang sepi di
// atas 22 kHz. Verdict yang benar adalah pengukuran ("tidak ada konten
// di atas X kHz"), bukan cap palsu/asli mutlak. Lihat
// docs/ANALYZER_FFT_2026-11-11.md.

#pragma once

#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace pristine::analyzer {

// Ukuran FFT per jendela. Pangkat dua. Resolusi frekuensi = rate / 8192
// (11,7 Hz @96 kHz; 5,4 Hz @44,1 kHz) — jauh lebih dari cukup untuk
// menemukan cutoff di orde kHz.
inline constexpr int kFftSize = 8192;

// Jendela analisis: 5 titik di sepanjang file (10/30/50/70/90%).
inline constexpr int kMaxWindows = 5;

// Jendela dengan frame kurang dari ini dilewati (terlalu pendek).
inline constexpr int kMinWindowFrames = 4096;

// Ambang konten: -60 dB relatif terhadap puncak spektrum.
inline constexpr double kCutoffThresholdDb = -60.0;

// Puncak spektrum di bawah ini (satuan magnitude bin mentah) dianggap
// terlalu senyap untuk dinilai. Sinus 0 dBFS, Hann, N=8192 -> bin ~2048;
// 0,5 ~= -72 dBFS.
inline constexpr double kMinPeakMagnitude = 0.5;

struct SpectralAnalysis {
    bool ok = false;
    std::string error;

    double durationSeconds = 0.0;
    uint32_t sampleRate = 0;
    uint32_t channels = 0;

    // Frekuensi tertinggi dengan konten nyata (Hz). 0 kalau tidak terukur.
    double measuredCutoffHz = 0.0;
    double peakDbfs = -120.0;
    double rmsDbfs = -120.0;

    // Fraksi sampel kanal kiri di grid 16-bit (0..1). ~1 = padding 16-bit.
    double lsbZeroRatio16 = 0.0;

    int windowsUsed = 0;
};

// =====================================================
// Logika murni (header-only, bisa diuji tanpa FFmpeg)
// =====================================================

inline double dbfs(double linear) {
    if (!(linear > 0.0)) return -120.0;
    const double db = 20.0 * std::log10(linear);
    return db < -120.0 ? -120.0 : db;
}

// Cari cutoff dari spektrum magnitude (panjang fftSize/2, bin 0..Nyquist).
// Mengembalikan frekuensi (Hz) bin tertinggi di atas ambang, atau 0 kalau
// spektrum terlalu senyap untuk dinilai.
inline double findCutoffHz(
    const std::vector<float>& magnitudes,
    double sampleRate,
    int fftSize
) {
    if (magnitudes.empty() || sampleRate <= 0.0 || fftSize <= 0) return 0.0;

    float peak = 0.0f;
    for (float m : magnitudes) {
        if (m > peak) peak = m;
    }
    if (peak < static_cast<float>(kMinPeakMagnitude)) return 0.0;

    const double threshold =
        static_cast<double>(peak) *
        std::pow(10.0, kCutoffThresholdDb / 20.0);

    // Cari dari atas (Nyquist) ke bawah: bin tertinggi di atas ambang.
    for (int i = static_cast<int>(magnitudes.size()) - 1; i >= 1; --i) {
        if (static_cast<double>(magnitudes[i]) > threshold) {
            return static_cast<double>(i) * sampleRate /
                   static_cast<double>(fftSize);
        }
    }
    return 0.0;
}

// Fraksi sampel yang tepat berada di grid 16-bit.
// Sampel int16/int24 -> float adalah eksak (mantissa float 24-bit), jadi
// sampel hasil padding 16-bit memenuhi x*32768 bulat persis; sampel 24-bit
// asli hampir tidak pernah (peluang ~0,2% per sampel pada epsilon ini).
inline double lsbZeroRatio16(const std::vector<float>& samplesLeft) {
    if (samplesLeft.empty()) return 0.0;
    constexpr double kEpsilon = 1e-3;
    size_t onGrid = 0;
    for (float x : samplesLeft) {
        const double scaled = static_cast<double>(x) * 32768.0;
        const double frac = scaled - std::floor(scaled);
        if (frac < kEpsilon || frac > 1.0 - kEpsilon) ++onGrid;
    }
    return static_cast<double>(onGrid) /
           static_cast<double>(samplesLeft.size());
}

// =====================================================
// Entry point (implementasi di AudioFileAnalyzer.cpp)
// =====================================================

// Decode + FFT file di `path` (plain path lokal). Mengembalikan struct di
// atas; kalau gagal, ok=false + error berisi alasannya.
SpectralAnalysis analyzeFile(const std::string& path);

} // namespace pristine::analyzer
