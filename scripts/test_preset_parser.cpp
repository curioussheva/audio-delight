// =====================================================
// scripts/test_preset_parser.cpp
// =====================================================
//
// Membuktikan parser preset parametrik (Fase C) benar:
//   - format AutoEQ/Squiglink nyata ter-parse lengkap
//   - tipe filter PK/LSC/HSC dikenali, termasuk alias
//   - preamp terbaca (termasuk negatif dan koma desimal)
//   - urutan Fc/Gain/Q bebas
//   - preset cacat DITOLAK dengan alasan, bukan diterima sebagian
//   - baris tidak dikenal / nilai rusak -> gagal, bukan diam-diam
//   - preset kepanjangan ditolak
//   - applyPreset mengisi cascade dengan benar
//   - hasil parse diterapkan -> respons audio sesuai harapan
//
// Kompilasi:
//   clang++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_preset_parser.cpp \
//     android/app/src/main/cpp/dsp/PresetParser.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o "$TMPDIR/test_preset_parser"

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "dsp/PresetParser.h"

using namespace pristine;

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

    std::vector<float> l(block), r(block);
    double inRms = 0.0, outRms = 0.0;

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

    std::printf("=======================================================\n");
    std::printf("PRESET PARSER — Fase C (AutoEQ / Squiglink)\n");
    std::printf("=======================================================\n");

    // ---- 1. Preset AutoEQ nyata --------------------------------------
    std::printf("\n1. Preset AutoEQ nyata (format Squiglink)\n");
    {
        const std::string text =
            "# Moondrop Chu - AutoEQ\n"
            "Preamp: -6.8 dB\n"
            "Filter 1: ON PK Fc 105 Hz Gain 5.5 dB Q 0.70\n"
            "Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70\n"
            "Filter 3: ON PK Fc 3000 Hz Gain 2.0 dB Q 1.50\n"
            "Filter 4: ON HSC Fc 10000 Hz Gain -2.0 dB Q 0.70\n";

        auto r = parseParametricPreset(text, "Moondrop Chu");

        check("parse berhasil", r.ok);
        if (!r.ok) std::printf("     error: %s\n", r.error.c_str());

        std::printf("     preamp = %.2f dB (harap -6.80)\n", r.preset.preampDb);
        check("preamp -6.8 terbaca", std::fabs(r.preset.preampDb + 6.8f) < 1e-4f);

        std::printf("     filter = %zu (harap 4)\n", r.preset.filters.size());
        check("4 filter terbaca", r.preset.filters.size() == 4);

        if (r.preset.filters.size() == 4) {
            const auto& f0 = r.preset.filters[0];
            check("filter 1 tipe Peaking", f0.type == FilterType::Peaking);
            check("filter 1 Fc 105", std::fabs(f0.freqHz - 105.0f) < 1e-3f);
            check("filter 1 gain 5.5", std::fabs(f0.gainDb - 5.5f) < 1e-4f);
            check("filter 1 Q 0.70", std::fabs(f0.q - 0.70f) < 1e-4f);

            check("filter 2 tipe LowShelf",
                  r.preset.filters[1].type == FilterType::LowShelf);
            check("filter 4 tipe HighShelf",
                  r.preset.filters[3].type == FilterType::HighShelf);
            check("filter 4 gain -2.0",
                  std::fabs(r.preset.filters[3].gainDb + 2.0f) < 1e-4f);
        }

        check("tanpa peringatan", r.warnings.empty());
    }

    // ---- 2. Alias tipe filter ----------------------------------------
    std::printf("\n2. Alias tipe filter\n");
    {
        const std::string text =
            "Preamp: 0 dB\n"
            "Filter 1: ON PEQ Fc 100 Hz Gain 1 dB Q 1.0\n"
            "Filter 2: ON LS Fc 200 Hz Gain 1 dB Q 0.7\n"
            "Filter 3: ON HS Fc 9000 Hz Gain 1 dB Q 0.7\n"
            "Filter 4: ON PEAKING Fc 500 Hz Gain 1 dB Q 1.0\n"
            "Filter 5: ON LOWSHELF Fc 60 Hz Gain 1 dB Q 0.7\n"
            "Filter 6: ON HIGHSHELF Fc 12000 Hz Gain 1 dB Q 0.7\n";

        auto r = parseParametricPreset(text);

        check("parse berhasil", r.ok);
        check("6 filter", r.preset.filters.size() == 6);

        if (r.preset.filters.size() == 6) {
            check("PEQ -> Peaking", r.preset.filters[0].type == FilterType::Peaking);
            check("LS -> LowShelf", r.preset.filters[1].type == FilterType::LowShelf);
            check("HS -> HighShelf", r.preset.filters[2].type == FilterType::HighShelf);
            check("PEAKING -> Peaking", r.preset.filters[3].type == FilterType::Peaking);
            check("LOWSHELF -> LowShelf", r.preset.filters[4].type == FilterType::LowShelf);
            check("HIGHSHELF -> HighShelf", r.preset.filters[5].type == FilterType::HighShelf);
        }
    }

    // ---- 3. Urutan kunci bebas + koma desimal ------------------------
    std::printf("\n3. Urutan kunci bebas + koma desimal\n");
    {
        const std::string text =
            "Preamp: -3,5 dB\n"
            "Filter 1: ON PK Q 0.5 Fc 2000 Hz Gain -4,5 dB\n";

        auto r = parseParametricPreset(text);

        check("parse berhasil", r.ok);
        if (r.ok && r.preset.filters.size() == 1) {
            std::printf("     preamp = %.2f, Fc = %.1f, gain = %.2f, Q = %.2f\n",
                        r.preset.preampDb, r.preset.filters[0].freqHz,
                        r.preset.filters[0].gainDb, r.preset.filters[0].q);
            check("koma desimal preamp -3.5",
                  std::fabs(r.preset.preampDb + 3.5f) < 1e-4f);
            check("urutan bebas: Fc tetap 2000",
                  std::fabs(r.preset.filters[0].freqHz - 2000.0f) < 1e-3f);
            check("urutan bebas: Q tetap 0.5",
                  std::fabs(r.preset.filters[0].q - 0.5f) < 1e-4f);
            check("urutan bebas: gain -4.5",
                  std::fabs(r.preset.filters[0].gainDb + 4.5f) < 1e-4f);
        }
    }

    // ---- 4. Preset CACAT harus DITOLAK -------------------------------
    std::printf("\n4. Preset cacat ditolak dengan alasan\n");
    {
        // 4a. Baris filter tidak terbaca -> jangan terapkan sebagian.
        const std::string partial =
            "Preamp: -2 dB\n"
            "Filter 1: ON PK Fc 100 Hz Gain 3 dB Q 1.0\n"
            "Filter 2: ON XX Fc 200 Hz Gain 3 dB Q 1.0\n"
            "Filter 3: ON PK Fc 300 Hz Gain 3 dB Q 1.0\n";

        auto r = parseParametricPreset(partial);
        check("baris cacat -> GAGAL (bukan sebagian)", !r.ok);
        std::printf("     error: %s\n", r.error.c_str());
        check("alasan menyebut jumlah yang terbaca",
              r.error.find("dari") != std::string::npos);

        // 4b. Tidak ada filter sama sekali.
        auto r2 = parseParametricPreset("Preamp: -2 dB\n");
        check("tanpa filter -> GAGAL", !r2.ok);

        // 4c. Teks kosong.
        auto r3 = parseParametricPreset("");
        check("teks kosong -> GAGAL", !r3.ok);

        // 4d. Kepanjangan.
        std::string big = "Preamp: 0 dB\n";
        for (int i = 1; i <= 20; ++i) {
            big += "Filter " + std::to_string(i) +
                   ": ON PK Fc " + std::to_string(100 * i) +
                   " Hz Gain 1 dB Q 1.0\n";
        }
        auto r4 = parseParametricPreset(big);
        check("20 filter -> GAGAL (kapasitas 16)", !r4.ok);
        std::printf("     error: %s\n", r4.error.c_str());
    }

    // ---- 5. Baris OFF tidak dihitung sebagai filter aktif ------------
    std::printf("\n5. Filter OFF dilewati, urutan aktif tetap\n");
    {
        const std::string text =
            "Preamp: -1 dB\n"
            "Filter 1: OFF PK Fc 100 Hz Gain 3 dB Q 1.0\n"
            "Filter 2: ON PK Fc 1000 Hz Gain 3 dB Q 1.0\n"
            "Filter 3: OFF PK Fc 5000 Hz Gain 3 dB Q 1.0\n"
            "Filter 4: ON PK Fc 8000 Hz Gain 3 dB Q 1.0\n";

        auto r = parseParametricPreset(text);
        check("parse berhasil", r.ok);
        check("4 baris terbaca", r.preset.filters.size() == 4);

        if (r.ok) {
            BiquadCascade c;
            const bool applied = applyPreset(c, r.preset, 48000.0f);
            check("applyPreset berhasil", applied);
            std::printf("     activeCount = %d (harap 2)\n", c.activeCount());
            check("hanya 2 filter aktif", c.activeCount() == 2);

            const double g1k = measureGainDb(c, 1000.0, 48000.0);
            const double g100 = measureGainDb(c, 100.0, 48000.0);
            std::printf("     1000 Hz %+.2f dB, 100 Hz %+.2f dB\n", g1k, g100);
            check("filter aktif di 1 kHz berfungsi", g1k > 1.0);
            check("filter OFF di 100 Hz tidak berefek", std::fabs(g100 + 1.0) < 0.6);
        }
    }

    // ---- 6. applyPreset -> respons audio sesuai preset ---------------
    std::printf("\n6. Preset diterapkan -> respons audio sesuai\n");
    {
        const std::string text =
            "Preamp: -6.8 dB\n"
            "Filter 1: ON PK Fc 105 Hz Gain 5.5 dB Q 0.70\n"
            "Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70\n"
            "Filter 3: ON PK Fc 3000 Hz Gain 2.0 dB Q 1.50\n"
            "Filter 4: ON HSC Fc 10000 Hz Gain -2.0 dB Q 0.70\n";

        auto r = parseParametricPreset(text, "Chu");
        check("parse berhasil", r.ok);

        if (r.ok) {
            BiquadCascade c;
            check("applyPreset berhasil", applyPreset(c, r.preset, 48000.0f));
            check("4 filter aktif", c.activeCount() == 4);

            const double flat = measureGainDb(c, 700.0, 48000.0);
            const double bass = measureGainDb(c, 60.0, 48000.0);
            const double treble = measureGainDb(c, 16000.0, 48000.0);

            std::printf("     700 Hz %+.2f dB | 60 Hz %+.2f dB | 16 kHz %+.2f dB\n",
                        flat, bass, treble);

            check("bass lebih tinggi dari mid", bass > flat + 3.0);
            check("treble lebih rendah dari mid", treble < flat - 0.5);
            check("preamp menahan level keseluruhan", flat < -4.0);
        }
    }

    // ---- 7. Laju non-48k ---------------------------------------------
    std::printf("\n7. Diterapkan di laju 44.1 kHz dan 96 kHz\n");
    {
        const std::string text =
            "Preamp: 0 dB\n"
            "Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0\n";

        auto r = parseParametricPreset(text);
        check("parse berhasil", r.ok);

        if (r.ok) {
            BiquadCascade c44;
            applyPreset(c44, r.preset, 44100.0f);
            const double g44 = measureGainDb(c44, 1000.0, 44100.0);

            BiquadCascade c96;
            applyPreset(c96, r.preset, 96000.0f);
            const double g96 = measureGainDb(c96, 1000.0, 96000.0);

            std::printf("     44.1k: %+.2f dB | 96k: %+.2f dB\n", g44, g96);
            check("gain 1 kHz benar di 44.1k", std::fabs(g44 - 6.0) < 0.3);
            check("gain 1 kHz benar di 96k", std::fabs(g96 - 6.0) < 0.3);
        }
    }

    std::printf("\n=======================================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("=======================================================\n");

    return gFail == 0 ? 0 : 1;
}
