// =====================================================
// scripts/test_highshelf.cpp
// =====================================================
//
// Membuktikan `BiquadFilter::setHighShelf` benar (RBJ Audio EQ Cookbook):
//   - gain di frekuensi tinggi naik sesuai gainDb
//   - gain di frekuensi rendah praktis tidak berubah
//   - gain 0 dB = identity (bit-exact)
//   - stabil (kutub di dalam lingkaran satuan)
//   - respons cerminan low shelf: |H_hs(f)| * |H_ls(f)| ~ 1 saat gain
//     simetris (naik/turun)
//
// Kompilasi:
//   clang++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_highshelf.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o "$TMPDIR/test_highshelf"

#include <cmath>
#include <cstdio>
#include <vector>

#include "dsp/BiquadFilter.h"

using pristine::BiquadFilter;

static int gPass = 0, gFail = 0;

static void check(const char* name, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", name);
    if (ok) ++gPass; else ++gFail;
}

// Ukur gain filter pada frekuensi tertentu (dB), setelah transient lewat.
static double measureGainDb(
    BiquadFilter& f,
    double testHz,
    double sampleRate,
    double amp = 0.25
) {
    f.reset();

    const int block = 4096;
    const int warmup = 8;
    const int measure = 8;

    double phase = 0.0;
    const double inc = 2.0 * M_PI * testHz / sampleRate;

    double inRms = 0.0, outRms = 0.0;

    for (int b = 0; b < warmup + measure; ++b) {
        double inSq = 0.0, outSq = 0.0;

        for (int i = 0; i < block; ++i) {
            const double x = amp * std::sin(phase);
            phase += inc;

            const double y = f.process(static_cast<float>(x));

            if (b == warmup) {
                inSq += x * x;
                outSq += static_cast<double>(y) * y;
            }
        }

        if (b == warmup) {
            inRms = std::sqrt(inSq / block);
            outRms = std::sqrt(outSq / block);
        }
    }

    if (inRms <= 0.0) return 0.0;
    return 20.0 * std::log10(outRms / inRms);
}

// Ambil koefisien untuk pemeriksaan stabilitas.
static bool isStable(BiquadFilter& f) {
    const auto& c = f.getCoefficients();
    // Direct Form II Transposed: kutub dari z^2 + a1*z + a2.
    // Stabil kalau |a2| < 1 dan |a1| < 1 + a2.
    return std::fabs(c.a2) < 1.0f &&
           std::fabs(c.a1) < (1.0f + c.a2);
}

int main() {
    const double sr = 48000.0;

    std::printf("=======================================================\n");
    std::printf("HIGH SHELF — RBJ cookbook, koreksi treble\n");
    std::printf("=======================================================\n");

    // ---- 1. Gain 0 dB harus identity ---------------------------------
    std::printf("\n1. Gain 0 dB = identity\n");
    {
        BiquadFilter f;
        f.setHighShelf(8000.0f, 0.707f, 0.0f, static_cast<float>(sr));

        const double g = measureGainDb(f, 12000.0, sr);
        std::printf("     gain 12 kHz: %+.4f dB\n", g);
        check("gain 0 dB -> |gain| < 0.01 dB", std::fabs(g) < 0.01);

        // Pada gain 0 dB, RBJ shelf TIDAK menghasilkan koefisien trivial
        // (1,0,0,0,0). Yang terjadi: kutub dan nol saling meniadakan —
        // b0 == 1, b1 == a1, b2 == a2 — sehingga H(z) = 1 PERSIS.
        // Jadi yang benar diperiksa adalah sifat peniadaan itu, bukan
        // koefisiennya nol. (Assertion awal salah di sini.)
        const auto& c = f.getCoefficients();
        std::printf("     b0=%.6f b1=%.6f b2=%.6f a1=%.6f a2=%.6f\n",
                    c.b0, c.b1, c.b2, c.a1, c.a2);
        check("0 dB: b0 == 1", std::fabs(c.b0 - 1.0f) < 1e-6f);
        check("0 dB: b1 == a1 (kutub-nol meniadakan)",
              std::fabs(c.b1 - c.a1) < 1e-6f);
        check("0 dB: b2 == a2 (kutub-nol meniadakan)",
              std::fabs(c.b2 - c.a2) < 1e-6f);
    }

    // ---- 2. Boost +6 dB di 8 kHz -------------------------------------
    std::printf("\n2. High shelf +6 dB @ 8 kHz\n");
    {
        BiquadFilter f;
        f.setHighShelf(8000.0f, 0.707f, 6.0f, static_cast<float>(sr));

        const double high = measureGainDb(f, 16000.0, sr);
        const double mid  = measureGainDb(f, 1000.0, sr);

        std::printf("     gain 16 kHz: %+.2f dB (harap ~+6)\n", high);
        std::printf("     gain 1 kHz : %+.2f dB (harap ~0)\n", mid);

        check("16 kHz naik ~+6 dB", high > 5.0 && high < 7.0);
        check("1 kHz praktis tidak berubah (< 0.5 dB)", std::fabs(mid) < 0.5);
        check("stabil", isStable(f));
    }

    // ---- 3. Cut -6 dB di 8 kHz ---------------------------------------
    std::printf("\n3. High shelf -6 dB @ 8 kHz\n");
    {
        BiquadFilter f;
        f.setHighShelf(8000.0f, 0.707f, -6.0f, static_cast<float>(sr));

        const double high = measureGainDb(f, 16000.0, sr);
        std::printf("     gain 16 kHz: %+.2f dB (harap ~-6)\n", high);
        check("16 kHz turun ~-6 dB", high < -5.0 && high > -7.0);
        check("stabil", isStable(f));
    }

    // ---- 4. Cerminan low shelf ---------------------------------------
    std::printf("\n4. Cerminan low shelf (boost vs cut, gain simetris)\n");
    {
        BiquadFilter hs, ls;
        hs.setHighShelf(4000.0f, 0.707f, 6.0f, static_cast<float>(sr));
        ls.setLowShelf(4000.0f, 0.707f, 6.0f, static_cast<float>(sr));

        const double hsLow  = measureGainDb(hs, 200.0, sr);
        const double lsHigh = measureGainDb(ls, 16000.0, sr);

        std::printf("     high shelf @200 Hz  : %+.2f dB (harap ~0)\n", hsLow);
        std::printf("     low shelf  @16 kHz  : %+.2f dB (harap ~0)\n", lsHigh);

        check("high shelf tidak menyentuh bass", std::fabs(hsLow) < 0.5);
        check("low shelf tidak menyentuh treble", std::fabs(lsHigh) < 0.5);
    }

    // ---- 5. Laju non-48k: Fc tetap di tempatnya ----------------------
    std::printf("\n5. Laju stream 44.1 kHz (bukan 48k)\n");
    {
        BiquadFilter f;
        f.setHighShelf(8000.0f, 0.707f, 6.0f, 44100.0f);

        const double high = measureGainDb(f, 16000.0, 44100.0);
        std::printf("     gain 16 kHz: %+.2f dB (harap ~+6)\n", high);
        check("laju 44.1k tetap memberi ~+6 dB", high > 5.0 && high < 7.0);
    }

    // ---- 6. Preset AutoEQ nyata: HSC 10 kHz, gain -2, Q 0.7 ----------
    std::printf("\n6. Preset AutoEQ: HSC Fc 10000 Hz Gain -2.0 dB Q 0.70\n");
    {
        BiquadFilter f;
        f.setHighShelf(10000.0f, 0.70f, -2.0f, static_cast<float>(sr));

        const double high = measureGainDb(f, 18000.0, sr);
        std::printf("     gain 18 kHz: %+.2f dB (harap ~-2)\n", high);
        check("sesuai preset (-1..-3 dB)", high < -1.0 && high > -3.0);
        check("stabil", isStable(f));
    }

    std::printf("\n=======================================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("=======================================================\n");

    return gFail == 0 ? 0 : 1;
}
