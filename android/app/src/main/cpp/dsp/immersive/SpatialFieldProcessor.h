#pragma once
#include <cstdint>

namespace pristine { namespace dsp {

// =====================================================
// SPATIAL FIELD PROCESSOR
// =====================================================
//
// Melebarkan citra stereo dan menambahkan kedalaman ruang.
//
// Sebelumnya kelas ini adalah stub murni: setter-nya menyimpan `mWidth` dan
// `mDepth`, tetapi process() tidak melakukan apa pun. Jadi tahap "spatial" di
// rantai Immersive tidak pernah berkontribusi walau UI punya kontrolnya.
//
// Dua mekanisme, keduanya pada domain waktu (tanpa FFT, tanpa alokasi):
//
//   width - mid/side widening. Mid = (L+R)/2, side = (L-R)/2. Side
//           diperkuat/dilemahkan lalu digabung kembali. Melebarkan citra tanpa
//           menambah gema, dan tetap mono-compatible pada width <= 1.
//
//   depth - ambience pendek (dua tap delay) yang dikembalikan ke L dan R
//           secara SILANG. Menciptakan kesan ruang di luar kepala.
//
// Semua state berukuran tetap, jadi aman dipanggil dari audio thread.
class SpatialFieldProcessor {
public:
    SpatialFieldProcessor();

    void setWidth(float width); // 0-2 (1 = netral)
    void setDepth(float depth); // 0-1 (0 = tanpa ruang)

    // Skala tap ambience terhadap laju sampling (B15-I3). Tanpa ini, tap
    // yang dinyatakan dalam ms terhadap 48 kHz menciut 4x di 192 kHz.
    void prepare(int32_t sampleRate);

    void process(float* left, float* right, int32_t numFrames);
    void reset();

private:
    float mWidth = 1.0f;
    float mDepth = 0.0f;

    // Nilai yang sedang dipakai, didekati perlahan supaya menggeser slider
    // tidak menimbulkan zipper noise.
    //
    // Diinisialisasi dari nilai netral, lalu DISAMAKAN dengan nilai setter
    // pertama (lihat setWidth/setDepth). Kalau tidak disamakan, render pertama
    // akan menyapu dari 1.0 ke nilai sebenarnya - dan itu melanggar jaminan
    // bypass bit-exact saat width 1 / depth 0.
    float mCurrentWidth = 1.0f;
    float mCurrentDepth = 0.0f;
    bool mPrimed = false;

    // Delay line ambience. 16384 sample = ~42,7 ms @ 384 kHz.
    // (B15-I3: tap terjauh terskala 9600 sampel @ 384 kHz masih muat;
    // 8192 lama hanya muat sampai ~328 kHz.)
    static constexpr int32_t kAmbienceSize = 16384;
    float mAmbienceL[kAmbienceSize] = {};
    float mAmbienceR[kAmbienceSize] = {};

    int32_t mWriteIndex = 0;

    // Posisi tap, dalam sample (nilai setara 48 kHz).
    //
    // TIGA tap dengan jarak berbeda. Tap yang seragam membuat ambience simetris
    // pada sinyal mono, sehingga tidak menghasilkan ruang sama sekali.
    static constexpr int32_t kTapNear = 576;   // ~12 ms @ 48 kHz
    static constexpr int32_t kTapMid = 888;    // ~18.5 ms @ 48 kHz
    static constexpr int32_t kTapFar = 1200;   // ~25 ms @ 48 kHz

    // Tap yang sedang dipakai, dalam sample — diskala dari referensi 48 kHz
    // di prepare() (B15-I3). Default = nilai 48 kHz, jadi perilaku lama
    // tetap bila prepare() belum pernah dipanggil.
    int32_t mTapNear = kTapNear;
    int32_t mTapMid = kTapMid;
    int32_t mTapFar = kTapFar;
};

}} // namespace
