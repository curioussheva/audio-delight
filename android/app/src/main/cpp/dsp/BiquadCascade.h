#pragma once

#include <cstdint>

#include "BiquadFilter.h"

namespace pristine {

// =====================================================
// TIPE FILTER UNTUK PRESET (AutoEQ / Squiglink / DDC)
// =====================================================
//
// Nilai numeriknya sengaja berurutan mulai 0 supaya parser bisa memetakan
// langsung dari teks preset tanpa tabel konversi tambahan.
enum class FilterType {
    Peaking = 0,   // "PK"  — bell
    LowShelf = 1,  // "LSC" / "LS" — shelf bawah
    HighShelf = 2, // "HSC" / "HS" — shelf atas
};

// =====================================================
// BIQUAD CASCADE
// =====================================================
//
// Rantai filter untuk koreksi headphone: beberapa biquad disusun seri,
// plus satu preamp di depan.
//
// KENAPA KAPASITAS TETAP
//
// 16 filter, array statis. AutoEQ biasanya mengeluarkan 5-10 filter; 16
// memberi ruang untuk preset lebih panjang tanpa alokasi dinamis. Alokasi
// di audio thread tidak boleh terjadi sama sekali - ini yang membedakan
// kelas ini dari `std::vector` yang dipakai `HeadphoneCorrection` lama.
//
// URUTAN DI CHAIN
//
// Preamp dulu, lalu cascade. Preset AutoEQ selalu menyertakan preamp negatif
// (mis. -6.8 dB) justru karena band-nya di-boost; tanpa preamp puncak
// gabungan melewati full scale dan limiter bekerja terus-menerus.
//
// Lihat docs/HEADPHONE_CORRECTION.md.
class BiquadCascade {
public:

    // Kapasitas filter. Preset di atas ini dipotong, dan pemanggil bisa
    // memeriksa lewat `overflowed()`.
    static constexpr int kMaxFilters = 16;

    // =============================================
    // KONFIGURASI
    // =============================================
    //
    // Semua setter di bawah ini memakai `powf`/`cosf`/`sinf` lewat
    // `BiquadFilter::setPeakingEQ` dkk. Panggil dari control thread saat
    // preset dimuat, JANGAN tiap buffer.

    // Kosongkan rantai: nol filter, preamp 0 dB, semua state direset.
    void clear() noexcept;

    // Set filter ke-`index`. Mengembalikan false kalau index di luar rentang.
    bool setFilter(
        int index,
        FilterType type,
        float freqHz,
        float q,
        float gainDb,
        float sampleRate
    ) noexcept;

    // Set jumlah filter aktif. Filter di atas ini tidak diproses.
    void setActiveCount(int count) noexcept;

    int activeCount() const noexcept { return mActive; }

    // Preamp dalam dB, diterapkan sebelum cascade.
    void setPreamp(float gainDb) noexcept;
    float preamp() const noexcept { return mPreampLinear; }

    // =============================================
    // LAJU
    // =============================================
    //
    // Menghitung ulang koefisien seluruh filter dengan laju baru. Dipanggil
    // saat stream dibuka dengan laju nyata (bukan yang diminta) - inilah
    // keunggulan atas `.vdc` Viper yang menyimpan koefisien statis untuk
    // 44100/48000 saja.
    void setSampleRate(float sampleRate) noexcept;

    // =============================================
    // PEMROSESAN
    // =============================================

    void process(
        float* left,
        float* right,
        int32_t numFrames
    ) noexcept;

    void reset() noexcept;

    // =============================================
    // STATUS
    // =============================================

    bool isActive() const noexcept { return mActive > 0; }

    // true kalau ada `setFilter` yang ditolak karena kapasitas penuh.
    bool overflowed() const noexcept { return mOverflowed; }

private:

    BiquadFilter mLeft[kMaxFilters];
    BiquadFilter mRight[kMaxFilters];

    // Parameter per filter, disimpan supaya `setSampleRate` bisa menghitung
    // ulang koefisien tanpa parser perlu mengirim ulang.
    FilterType mType[kMaxFilters] = { FilterType::Peaking };
    float mFreq[kMaxFilters] = { 0.0f };
    float mQ[kMaxFilters] = { 0.707f };
    float mGainDb[kMaxFilters] = { 0.0f };

    int mActive = 0;
    bool mOverflowed = false;

    float mSampleRate = 48000.0f;

    float mPreampDb = 0.0f;
    float mPreampLinear = 1.0f;
};

} // namespace pristine
