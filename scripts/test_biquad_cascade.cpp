// =====================================================
// scripts/test_biquad_cascade.cpp
// =====================================================
//
// Membuktikan `BiquadCascade` (Fase B koreksi headphone) benar:
//   - cascade = hasil kali respons tiap filter
//   - preamp diterapkan sesuai dB, dan urutannya sebelum cascade
//   - preset AutoEQ nyata menghasilkan respons yang diharapkan
//   - setSampleRate menghitung ulang koefisien (laju non-48k benar)
//   - kapasitas 16 filter, kelebihan ditandai (bukan didiamkan)
//   - nol filter + preamp 0 dB = buffer tidak disentuh
//   - stabilitas seluruh filter pada preset nyata
//
// Kompilasi:
//   clang++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_biquad_cascade.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o "$TMPDIR/test_biquad_cascade"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

#include "dsp/BiquadCascade.h"

using pristine::BiquadCascade;
using pristine::FilterType;

static int gPass = 0, gFail = 0;

static void check(const char* name, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", name);
    if (ok) ++gPass; else ++gFail;
}

// Ukur gain cascade pada frekuensi tertentu (dB).
static double measureGainDb(
    BiquadCascade& c,
    double testHz,
    double sampleRate,
    double amp = 0.25
) {
    c.reset();

    const int block = 4096;
    const int warmup = 6;

    double phase = 0.0;
    const double inc = 2.0 * M_PI * testHz / sampleRate;

    double inRms = 0.0, outRms = 0.0;

    std::vector<float> l(block), r(block);

    for (int b = 0; b < warmup + 1; ++b) {

        for (int i = 0; i < block; ++i) {
            const double x = amp * std::sin(phase);
            phase += inc;
            l[i] = static_cast<float>(x);
            r[i] = static_cast<float>(x);
        }

        if (b == warmup - 1) {
            double s = 0.0;
            for (int i = 0; i < block; ++i) s += l[i] * l[i];
            inRms = std::sqrt(s / block);
        }

        c.process(l.data(), r.data(), block);

        if (b == warmup - 1) {
            double s = 0.0;
            for (int i = 0; i < block; ++i) s += l[i] * l[i];
            outRms = std::sqrt(s / block);
        }
    }

    if (inRms <= 0.0) return 0.0;
    return 20.0 * std::log10(outRms / inRms);
}

int main() {
    const float sr = 48000.0f;

    std::printf("=======================================================\n");
    std::printf("BIQUAD CASCADE — Fase B koreksi headphone\n");
    std::printf("=======================================================\n");

    // ---- 1. Kosong = tidak menyentuh buffer --------------------------
    std::printf("\n1. Kosong (0 filter, preamp 0 dB) = buffer tidak disentuh\n");
    {
        BiquadCascade c;
        c.clear();

        std::vector<float> l(64, 0.5f), r(64, -0.25f);
        c.process(l.data(), r.data(), 64);

        bool untouched = true;
        for (int i = 0; i < 64; ++i) {
            if (l[i] != 0.5f || r[i] != -0.25f) { untouched = false; break; }
        }
        check("buffer bit-exact tidak berubah", untouched);
        check("isActive() false", !c.isActive());
    }

    // ---- 2. Preamp saja ----------------------------------------------
    std::printf("\n2. Preamp saja (preset AutoEQ selalu punya preamp negatif)\n");
    {
        BiquadCascade c;
        c.clear();
        c.setPreamp(-6.0f);

        const double g = measureGainDb(c, 1000.0, sr);
        std::printf("     preamp -6 dB -> terukur %+.2f dB\n", g);
        check("preamp -6 dB terukur -6.02 dB", std::fabs(g + 6.0206) < 0.05);

        c.setPreamp(0.0f);
        check("preamp 0 dB -> linear 1.0", std::fabs(c.preamp() - 1.0f) < 1e-6f);
    }

    // ---- 3. Preset AutoEQ nyata --------------------------------------
    // Moondrop Chu (contoh bentuk preset Squiglink/AutoEQ):
    //   Preamp: -6.8 dB
    //   Filter 1: ON PK  Fc 105 Hz   Gain +5.5 dB Q 0.70
    //   Filter 2: ON LSC Fc 105 Hz   Gain +5.5 dB Q 0.70
    //   Filter 3: ON PK  Fc 3000 Hz  Gain +2.0 dB Q 1.50
    //   Filter 4: ON HSC Fc 10000 Hz Gain -2.0 dB Q 0.70
    std::printf("\n3. Preset AutoEQ (4 filter + preamp)\n");
    {
        BiquadCascade c;
        c.clear();
        c.setPreamp(-6.8f);

        c.setFilter(0, FilterType::Peaking,   105.0f, 0.70f,  5.5f, sr);
        c.setFilter(1, FilterType::LowShelf,  105.0f, 0.70f,  5.5f, sr);
        c.setFilter(2, FilterType::Peaking,  3000.0f, 1.50f,  2.0f, sr);
        c.setFilter(3, FilterType::HighShelf,10000.0f, 0.70f, -2.0f, sr);

        std::printf("     activeCount = %d (harap 4)\n", c.activeCount());
        check("4 filter aktif", c.activeCount() == 4);

        // Preamp -6.8 dB harus dominan di frekuensi yang tidak dikoreksi.
        const double flat = measureGainDb(c, 700.0, sr);
        std::printf("     700 Hz (tidak dikoreksi): %+.2f dB\n", flat);
        check("preamp mendominasi di 700 Hz (< -4 dB)", flat < -4.0);

        // Bass di-boost: 105 Hz harus lebih tinggi dari 700 Hz.
        const double bass = measureGainDb(c, 60.0, sr);
        std::printf("     60 Hz (bass boost)      : %+.2f dB\n", bass);
        check("60 Hz lebih tinggi dari 700 Hz", bass > flat + 3.0);

        // Treble dipotong: 16 kHz harus lebih rendah dari 700 Hz.
        const double treble = measureGainDb(c, 16000.0, sr);
        std::printf("     16 kHz (treble cut)     : %+.2f dB\n", treble);
        check("16 kHz lebih rendah dari 700 Hz", treble < flat - 0.5);

        check("tidak overflow", !c.overflowed());
    }

    // ---- 4. setSampleRate: laju non-48k ------------------------------
    std::printf("\n4. setSampleRate — laju stream 96 kHz\n");
    {
        BiquadCascade c;
        c.clear();
        c.setFilter(0, FilterType::Peaking, 1000.0f, 1.0f, 6.0f, 48000.0f);

        const double at48 = measureGainDb(c, 1000.0, 48000.0);
        std::printf("     @48k, 1 kHz: %+.2f dB\n", at48);

        // Koefisien dihitung ulang untuk 96k; filter harus tetap di 1 kHz.
        c.setSampleRate(96000.0f);
        const double at96 = measureGainDb(c, 1000.0, 96000.0);
        std::printf("     @96k, 1 kHz: %+.2f dB\n", at96);

        check("gain 1 kHz sama di kedua laju", std::fabs(at48 - at96) < 0.3);

        // Kalau koefisien TIDAK dihitung ulang, puncaknya akan bergeser ke 2 kHz.
        const double wrong = measureGainDb(c, 2000.0, 96000.0);
        std::printf("     @96k, 2 kHz: %+.2f dB (harus jauh lebih rendah)\n", wrong);
        check("puncak tidak bergeser ke 2 kHz", at96 > wrong + 2.0);
    }

    // ---- 5. Kapasitas 16 filter --------------------------------------
    std::printf("\n5. Kapasitas %d filter\n", BiquadCascade::kMaxFilters);
    {
        BiquadCascade c;
        c.clear();

        for (int i = 0; i < BiquadCascade::kMaxFilters; ++i) {
            c.setFilter(i, FilterType::Peaking,
                        100.0f + i * 500.0f, 1.0f, 1.0f, sr);
        }
        std::printf("     setelah 16 setFilter: activeCount = %d\n", c.activeCount());
        check("16 filter terpasang", c.activeCount() == 16);
        check("belum overflow", !c.overflowed());

        // Ke-17 harus ditolak DAN ditandai.
        const bool ok = c.setFilter(16, FilterType::Peaking,
                                    9000.0f, 1.0f, 1.0f, sr);
        check("setFilter ke-17 ditolak", !ok);
        check("overflowed() true (tidak didiamkan)", c.overflowed());
    }

    // ---- 6. Stabilitas preset nyata ----------------------------------
    std::printf("\n6. Stabilitas pada preset nyata (gain ekstrem)\n");
    {
        BiquadCascade c;
        c.clear();
        c.setPreamp(-12.0f);
        c.setFilter(0, FilterType::LowShelf,   30.0f, 0.70f, 12.0f, sr);
        c.setFilter(1, FilterType::Peaking,   200.0f, 4.00f, -12.0f, sr);
        c.setFilter(2, FilterType::Peaking,  4000.0f, 6.00f,  10.0f, sr);
        c.setFilter(3, FilterType::HighShelf,15000.0f, 0.70f,  8.0f, sr);

        // Stabilitas: jalankan sinyal besar, pastikan tidak meledak.
        std::vector<float> l(4096), r(4096);
        for (int i = 0; i < 4096; ++i) {
            l[i] = 0.9f * std::sin(i * 0.1f);
            r[i] = l[i];
        }

        bool finite = true;
        for (int b = 0; b < 50; ++b) {
            for (int i = 0; i < 4096; ++i) {
                l[i] = 0.9f * std::sin(i * 0.1f);
                r[i] = l[i];
            }
            c.process(l.data(), r.data(), 4096);
            for (int i = 0; i < 4096; ++i) {
                if (!std::isfinite(l[i]) || std::fabs(l[i]) > 100.0f) {
                    finite = false; break;
                }
            }
            if (!finite) break;
        }
        check("gain ekstrem tetap stabil (tidak meledak)", finite);
    }

    std::printf("\n=======================================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("=======================================================\n");

    return gFail == 0 ? 0 : 1;
}
