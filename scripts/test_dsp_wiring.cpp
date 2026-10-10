// =====================================================
// scripts/test_dsp_wiring.cpp
// =====================================================
//
// Membuktikan bahwa penyaluran config DSP (2026-10-10) benar-benar bekerja.
//
// Sebelum fix: `DSPChain::applyConfig()` nol pemanggil dari jalur produksi,
// jadi `DSPChain::mConfig` selamanya default dan keempat node berjalan sebagai
// identity. Mode DSP mengeluarkan PCM identik dengan BitPerfect.
//
// Test ini memakai `DSPChain` yang SEBENARNYA (bukan tiruan), dijalankan pada
// laju 44100 seperti stream nyata.
//
// Bangun & jalankan:
//   clang++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_dsp_wiring.cpp \
//     android/app/src/main/cpp/dsp/DSPChain.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     android/app/src/main/cpp/dsp/tone/EQNode.cpp \
//     android/app/src/main/cpp/dsp/tone/GainNode.cpp \
//     android/app/src/main/cpp/dsp/spatial/StereoWidenerNode.cpp \
//     android/app/src/main/cpp/dsp/dynamics/LimiterNode.cpp \
//     android/app/src/main/cpp/dsp/EQProcessor.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o "$TMPDIR/test_dsp_wiring"

#include <cmath>
#include <cstdio>
#include <vector>

#include "dsp/DSPChain.h"
#include "core/DSPConfig.h"
#include "core/AudioTypes.h"

using namespace pristine;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) gPass++; else gFail++;
}

static constexpr double kPi = 3.14159265358979323846;

// Isi satu blok dengan sinus frekuensi `hz`, amplitudo `amp`.
static void fillSine(
    float* left, float* right, int frames,
    double hz, double sampleRate, double amp, long long& phase
) {
    for (int i = 0; i < frames; ++i) {
        const float v = static_cast<float>(
            amp * std::sin(2.0 * kPi * hz * (double)phase / sampleRate)
        );
        left[i] = v;
        right[i] = v;
        ++phase;
    }
}

static double rms(const float* x, int n) {
    double s = 0.0;
    for (int i = 0; i < n; ++i) s += (double)x[i] * (double)x[i];
    return std::sqrt(s / (double)n);
}

static double dB(double ratio) {
    return 20.0 * std::log10(ratio > 1e-12 ? ratio : 1e-12);
}

// Ukur gain rantai pada frekuensi tertentu, dengan config tertentu.
//
// `prepareRate` = laju yang dipakai saat merancang filter (DSPChain::prepare).
// `streamRate`  = laju sample yang BENAR-BENAR mengalir.
//
// Keduanya dipisah dengan sengaja: bug lama adalah filter dirancang untuk
// 48000 sementara stream berjalan di 44100. Kalau keduanya disamakan, bug itu
// tidak akan pernah terlihat.
static double measureGain(
    int prepareRate,
    int streamRate,
    double testHz,
    const DSPConfig& cfg,
    double inAmp = 0.5
) {
    const int block = 512;
    const int warmup = 40;   // buang transien filter
    const int measure = 1;

    DSPChain chain;
    chain.prepare(prepareRate, block);
    chain.applyConfig(cfg);

    std::vector<float> l(block), r(block);
    long long phase = 0;

    double inRms = 0.0, outRms = 0.0;

    for (int b = 0; b < warmup + measure; ++b) {
        fillSine(l.data(), r.data(), block, testHz, streamRate, inAmp, phase);
        const double before = rms(l.data(), block);
        chain.process(l.data(), r.data(), block);
        if (b == warmup) {
            inRms = before;
            outRms = rms(l.data(), block);
        }
    }

    return dB(outRms / inRms);
}

int main() {
    std::printf("=======================================================\n");
    std::printf("DSP WIRING — apakah config benar-benar sampai ke node\n");
    std::printf("=======================================================\n\n");

    DSPConfig flat;                 // semua default: EQ 0 dB, width 1.0, gain 1.0
    flat.limiterEnabled = true;

    // ---- 1. Flat = identity -------------------------------------------
    std::printf("1. Config flat harus identity (tidak ada pemrosesan)\n");

    {
        const double g = measureGain(44100, 44100, 1000.0, flat);
        std::printf("     gain pada 1 kHz: %.4f dB\n", g);
        check("flat: |gain| < 0.01 dB (bit-exact)", std::fabs(g) < 0.01);
    }

    // ---- 2. EQ +6 dB di band 1000 Hz benar-benar diterapkan -----------
    std::printf("\n2. EQ +6 dB di band 5 (1000 Hz) harus menaikkan 1 kHz\n");

    {
        DSPConfig eq = flat;
        eq.eqGain[5] = 6.0f;

        const double g1k = measureGain(44100, 44100, 1000.0, eq);
        std::printf("     gain pada 1 kHz: %+.2f dB (harap ~+6 dB)\n", g1k);
        check("EQ: gain 1 kHz dalam 5.0..7.0 dB", g1k > 5.0 && g1k < 7.0);

        // Band lain harus relatif tidak tersentuh (Q=1.414, jadi masih ada
        // sedikit pengaruh di tetangga, tapi 16 kHz harus jauh lebih kecil).
        const double g16k = measureGain(44100, 44100, 16000.0, eq);
        std::printf("     gain pada 16 kHz: %+.2f dB (harap ~0 dB)\n", g16k);
        check("EQ: 16 kHz praktis tidak terpengaruh (< 0.5 dB)",
              std::fabs(g16k) < 0.5);
    }

    // ---- 3. Bass boost ------------------------------------------------
    std::printf("\n3. Bass boost +9 dB di 100 Hz\n");

    {
        DSPConfig bass = flat;
        bass.bassBoost = 9.0f;

        const double g100 = measureGain(44100, 44100, 60.0, bass);
        std::printf("     gain pada 60 Hz: %+.2f dB\n", g100);
        check("bass: 60 Hz naik > 4 dB", g100 > 4.0);

        const double g5k = measureGain(44100, 44100, 5000.0, bass);
        std::printf("     gain pada 5 kHz: %+.2f dB\n", g5k);
        check("bass: 5 kHz praktis tidak berubah (< 0.5 dB)",
              std::fabs(g5k) < 0.5);
    }

    // ---- 4. Sample rate salah (bug lama) ------------------------------
    std::printf("\n4. Bug lama: filter dirancang 48000, stream berjalan 44100\n");
    std::printf("   (band 1 kHz dihitung dengan laju keliru)\n");

    {
        DSPConfig eq = flat;
        eq.eqGain[5] = 6.0f;

        const double good = measureGain(44100, 44100, 1000.0, eq);
        const double bad  = measureGain(48000, 44100, 1000.0, eq);

        std::printf("     dirancang 44100 -> gain 1 kHz %+.2f dB\n", good);
        std::printf("     dirancang 48000 -> gain 1 kHz %+.2f dB\n", bad);
        check("laju benar memberi gain lebih besar daripada laju salah",
              good > bad + 0.2);
    }

    // ---- 5. Master gain & stereo width --------------------------------
    std::printf("\n5. Master gain dan stereo width\n");

    {
        DSPConfig g = flat;
        g.masterGain = 0.5f;

        const double gain = measureGain(44100, 44100, 1000.0, g);
        std::printf("     master gain 0.5 -> %+.2f dB (harap -6.02)\n", gain);
        check("masterGain 0.5 = -6.02 dB",
              std::fabs(gain + 6.0206) < 0.1);
    }

    {
        // Stereo width 0.0 = mono: L dan R harus identik.
        const int block = 512;
        DSPChain chain;
        chain.prepare(44100, block);

        DSPConfig w = flat;
        w.stereoWidth = 0.0f;
        chain.applyConfig(w);

        std::vector<float> l(block), r(block);
        for (int i = 0; i < block; ++i) {
            l[i] = 0.4f;
            r[i] = -0.4f;
        }
        chain.process(l.data(), r.data(), block);

        const bool mono = std::fabs(l[block - 1] - r[block - 1]) < 1e-5f;
        std::printf("     width 0.0: L=%.4f R=%.4f (harus sama)\n",
                    l[block - 1], r[block - 1]);
        check("stereoWidth 0.0 melebur ke mono", mono);
    }

    // ---- 6. Limiter ikut terkonfigurasi -------------------------------
    std::printf("\n6. Limiter mengikuti config\n");

    {
        DSPConfig on = flat;
        on.limiterEnabled = true;
        DSPConfig off = flat;
        off.limiterEnabled = false;

        // Sinyal di atas ambang 0.98 supaya limiter punya efek.
        const double a = measureGain(44100, 44100, 1000.0, on, 1.6);
        const double b = measureGain(44100, 44100, 1000.0, off, 1.6);

        std::printf("     limiter ON  -> %+.2f dB\n", a);
        std::printf("     limiter OFF -> %+.2f dB\n", b);
        check("limiter ON meredam sinyal di atas ambang (a < b)", a < b);
    }

    std::printf("\n=======================================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("=======================================================\n");

    return gFail == 0 ? 0 : 1;
}
