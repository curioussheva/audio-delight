// =====================================================
// scripts/test_phase_d.cpp
// =====================================================
//
// Membuktikan Fase D koreksi headphone tersambung ke jalur produksi:
//   - toPresetData: konversi ParsedPreset -> POD (kode produksi, bukan salinan)
//   - seqlock AudioState: transfer preset antar-thread tanpa lock
//   - HeadphoneCorrectionNode: menerapkan preset dengan benar
//   - node bypass bit-exact saat nonaktif / tanpa preset
//   - preset berganti -> koefisien dihitung ulang (bukan dianggap sama)
//   - END-TO-END lewat DSPChain nyata: koreksi benar-benar terdengar
//
// Kompilasi:
//   clang++ -std=c++17 -O2 -pthread -I android/app/src/main/cpp \
//     scripts/test_phase_d.cpp \
//     android/app/src/main/cpp/dsp/headphone/HeadphoneCorrectionNode.cpp \
//     android/app/src/main/cpp/dsp/DSPChain.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     android/app/src/main/cpp/dsp/tone/EQNode.cpp \
//     android/app/src/main/cpp/dsp/tone/GainNode.cpp \
//     android/app/src/main/cpp/dsp/spatial/StereoWidenerNode.cpp \
//     android/app/src/main/cpp/dsp/dynamics/LimiterNode.cpp \
//     android/app/src/main/cpp/dsp/EQProcessor.cpp \
//     android/app/src/main/cpp/dsp/PresetParser.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o "$TMPDIR/test_phase_d"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

#include "core/AudioState.h"
#include "dsp/DSPChain.h"
#include "dsp/PresetParser.h"
#include "dsp/headphone/HeadphoneCorrectionNode.h"

using namespace pristine;

static int gPass = 0, gFail = 0;

static void check(const char* name, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", name);
    if (ok) ++gPass; else ++gFail;
}

static const char* kPreset =
    "Preamp: -6.8 dB\n"
    "Filter 1: ON PK Fc 105 Hz Gain 5.5 dB Q 0.70\n"
    "Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70\n"
    "Filter 3: ON PK Fc 3000 Hz Gain 2.0 dB Q 1.50\n"
    "Filter 4: ON HSC Fc 10000 Hz Gain -2.0 dB Q 0.70\n";

// Ukur gain pada frekuensi tertentu (dB).
static double measureGainDb(
    HeadphoneCorrectionNode& node,
    double testHz,
    double sampleRate,
    double amp = 0.25
) {
    node.reset();

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

        node.process(l.data(), r.data(), block);

        if (b == warmup - 1) {
            double s = 0.0;
            for (int i = 0; i < block; ++i) s += l[i] * l[i];
            outRms = std::sqrt(s / block);
        }
    }

    if (inRms <= 0.0) return 0.0;
    return 20.0 * std::log10(outRms / inRms);
}

// Bangun DSPConfig dengan preset terpasang.
static DSPConfig makeConfig(bool enabled) {
    DSPConfig cfg;
    cfg.enabled = true;

    auto r = parseParametricPreset(kPreset, "Chu");
    if (r.ok) {
        toPresetData(r.preset, cfg.headphonePreset);
    }

    cfg.headphoneCorrectionEnabled = enabled;
    return cfg;
}

int main() {

    std::printf("=======================================================\n");
    std::printf("FASE D — koreksi headphone tersambung ke jalur produksi\n");
    std::printf("=======================================================\n");

    // ---- 1. toPresetData ---------------------------------------------
    std::printf("\n1. toPresetData: ParsedPreset -> POD (kode produksi)\n");
    {
        auto r = parseParametricPreset(kPreset);
        check("parse berhasil", r.ok);

        HeadphonePresetData pod;
        const bool ok = toPresetData(r.preset, pod);

        check("konversi berhasil", ok);
        std::printf("     filterCount = %d, preamp = %.2f\n",
                    pod.filterCount, pod.preampDb);

        check("filterCount 4", pod.filterCount == 4);
        check("preamp -6.8", std::fabs(pod.preampDb + 6.8f) < 1e-4f);
        check("filter 0 Peaking (type 0)", pod.filters[0].type == 0);
        check("filter 1 LowShelf (type 1)", pod.filters[1].type == 1);
        check("filter 3 HighShelf (type 2)", pod.filters[3].type == 2);
        check("filter 0 Fc 105", std::fabs(pod.filters[0].freqHz - 105.0f) < 1e-3f);

        // Tanpa filter aktif -> gagal, bukan POD kosong yang dianggap sukses.
        ParsedPreset empty;
        HeadphonePresetData dummy;
        check("tanpa filter aktif -> false", !toPresetData(empty, dummy));

        // POD harus bebas pointer: aman disalin antar-thread.
        check("POD polos (trivially copyable)",
              std::is_trivially_copyable<HeadphonePresetData>::value);
    }

    // ---- 2. Seqlock: transfer antar-thread ---------------------------
    std::printf("\n2. Seqlock AudioState: penulis UI + pembaca audio\n");
    {
        AudioState state;

        auto r = parseParametricPreset(kPreset);
        HeadphonePresetData presetA;
        toPresetData(r.preset, presetA);

        // Pembaca awal: belum ada preset.
        HeadphonePresetData out;
        check("awal: belum ada preset", !state.headphonePreset(out));

        state.setHeadphonePreset(presetA);
        check("setelah set: ada preset", state.headphonePreset(out));
        check("filterCount tersalin", out.filterCount == 4);
        check("preamp tersalin", std::fabs(out.preampDb + 6.8f) < 1e-4f);
        check("tipe filter tersalin", out.filters[3].type == 2);

        // --- konkurensi: penulis terus mengganti, pembaca tidak boleh
        //     pernah melihat campuran dua preset.
        AudioState shared;
        std::atomic<int> torn{0};
        std::atomic<int> reads{0};
        std::atomic<int> writes{0};

        // Preset B: 1 filter, frekuensi sangat berbeda. Kalau pembaca melihat
        // campuran A dan B, filterCount/freq akan tidak konsisten.
        auto rb = parseParametricPreset(
            "Preamp: -1.0 dB\n"
            "Filter 1: ON PK Fc 9000 Hz Gain 1.0 dB Q 1.0\n");
        HeadphonePresetData presetB;
        toPresetData(rb.preset, presetB);

        std::thread writer([&] {
            // Berbasis waktu: penulis dan pembaca harus benar-benar tumpang
            // tindih. Menghitung iterasi tidak menjamin itu — pembaca bisa
            // selesai lebih dulu (setiap panggilan gagal dalam hitungan ns
            // selama preset belum pernah dipasang).
            const auto deadline =
                std::chrono::steady_clock::now() +
                std::chrono::milliseconds(400);

            int i = 0;
            while (std::chrono::steady_clock::now() < deadline) {
                shared.setHeadphonePreset((i++ & 1) ? presetA : presetB);
            }

            writes.store(i);
        });

        std::thread reader([&] {
            const auto deadline =
                std::chrono::steady_clock::now() +
                std::chrono::milliseconds(400);

            HeadphonePresetData seen;

            while (std::chrono::steady_clock::now() < deadline) {

                if (!shared.headphonePreset(seen)) continue;
                reads.fetch_add(1);

                // Hanya dua bentuk sah: A (4 filter, preamp -6.8, f0 105)
                // atau B (1 filter, preamp -1.0, f0 9000).
                const bool isA =
                    seen.filterCount == 4 &&
                    std::fabs(seen.preampDb + 6.8f) < 1e-4f &&
                    std::fabs(seen.filters[0].freqHz - 105.0f) < 1e-3f;

                const bool isB =
                    seen.filterCount == 1 &&
                    std::fabs(seen.preampDb + 1.0f) < 1e-4f &&
                    std::fabs(seen.filters[0].freqHz - 9000.0f) < 1e-3f;

                if (!isA && !isB) {
                    torn.fetch_add(1);
                }
            }
        });

        writer.join();
        reader.join();

        std::printf("     penulisan: %d, pembacaan sah: %d, robek: %d\n",
                    writes.load(), reads.load(), torn.load());
        check("penulisan terjadi (>1000)", writes.load() > 1000);
        check("pembacaan terjadi (>1000)", reads.load() > 1000);
        check("tidak ada pembacaan robek (0)", torn.load() == 0);
    }

    // ---- 3. Node menerapkan preset ------------------------------------
    std::printf("\n3. HeadphoneCorrectionNode menerapkan preset\n");
    {
        HeadphoneCorrectionNode node;
        node.prepare(48000, 1920);

        // Sebelum config: node harus nonaktif dan tidak menyentuh buffer.
        std::vector<float> l(128, 0.5f), r(128, -0.25f);
        node.process(l.data(), r.data(), 128);
        check("sebelum config: buffer tak disentuh", l[0] == 0.5f);
        check("sebelum config: node nonaktif", !node.isEnabled());

        node.applyConfig(makeConfig(true));

        check("setelah config: node aktif", node.isEnabled());
        std::printf("     filter aktif = %d (harap 4)\n", node.activeFilterCount());
        check("4 filter aktif", node.activeFilterCount() == 4);

        const double flat   = measureGainDb(node, 700.0, 48000.0);
        const double bass   = measureGainDb(node, 60.0, 48000.0);
        const double treble = measureGainDb(node, 16000.0, 48000.0);

        std::printf("     700 Hz %+.2f | 60 Hz %+.2f | 16 kHz %+.2f dB\n",
                    flat, bass, treble);

        check("bass lebih tinggi dari mid", bass > flat + 3.0);
        check("treble lebih rendah dari mid", treble < flat - 0.5);
        check("preamp menahan level", flat < -4.0);
    }

    // ---- 4. Bypass bit-exact -----------------------------------------
    std::printf("\n4. Bypass bit-exact saat nonaktif / tanpa preset\n");
    {
        // 4a. Koreksi dimatikan.
        HeadphoneCorrectionNode node;
        node.prepare(48000, 1920);
        node.applyConfig(makeConfig(false));

        check("nonaktif: node dimatikan", !node.isEnabled());

        std::vector<float> l(64, 0.37f), r(64, -0.11f);
        node.process(l.data(), r.data(), 64);

        bool same = true;
        for (int i = 0; i < 64; ++i) {
            if (l[i] != 0.37f || r[i] != -0.11f) { same = false; break; }
        }
        check("nonaktif: buffer bit-exact", same);

        // 4b. Aktif tapi tanpa preset.
        HeadphoneCorrectionNode node2;
        node2.prepare(48000, 1920);

        DSPConfig cfg;
        cfg.enabled = true;
        cfg.headphoneCorrectionEnabled = true;   // aktif...
        cfg.headphonePreset = HeadphonePresetData{};  // ...tapi filterCount 0

        node2.applyConfig(cfg);
        check("tanpa preset: node dimatikan", !node2.isEnabled());

        std::vector<float> l2(64, 0.37f), r2(64, -0.11f);
        node2.process(l2.data(), r2.data(), 64);
        check("tanpa preset: buffer bit-exact", l2[0] == 0.37f);
    }

    // ---- 5. Ganti preset -> koefisien dihitung ulang ------------------
    std::printf("\n5. Ganti preset saat koreksi sudah aktif\n");
    {
        HeadphoneCorrectionNode node;
        node.prepare(48000, 1920);

        node.applyConfig(makeConfig(true));
        const double a1k = measureGainDb(node, 1000.0, 48000.0);

        // Preset B: boost 1 kHz +6 dB. Kalau node menganggap config "sama"
        // (karena flag tidak berubah), output tidak akan berubah.
        auto rb = parseParametricPreset(
            "Preamp: 0 dB\n"
            "Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0\n");

        DSPConfig cfgB;
        cfgB.enabled = true;
        cfgB.headphoneCorrectionEnabled = true;
        toPresetData(rb.preset, cfgB.headphonePreset);

        node.applyConfig(cfgB);

        std::printf("     preset A @1kHz = %+.2f dB, preset B @1kHz = ",
                    a1k);
        const double b1k = measureGainDb(node, 1000.0, 48000.0);
        std::printf("%+.2f dB\n", b1k);

        check("preset B menghasilkan +6 dB di 1 kHz",
              std::fabs(b1k - 6.0) < 0.3);
        check("preset benar-benar berganti", std::fabs(b1k - a1k) > 1.0);
        check("filter aktif jadi 1", node.activeFilterCount() == 1);

        // Config identik dua kali: tidak boleh mengubah hasil.
        node.applyConfig(cfgB);
        const double b1kAgain = measureGainDb(node, 1000.0, 48000.0);
        check("config identik tidak mengubah hasil",
              std::fabs(b1kAgain - b1k) < 1e-3);
    }

    // ---- 6. END-TO-END lewat DSPChain nyata ---------------------------
    std::printf("\n6. END-TO-END: koreksi lewat DSPChain sungguhan\n");
    {
        DSPChain chain;
        chain.prepare(48000, 4096);
        chain.applyConfig(makeConfig(true));

        // Ukur lewat rantai penuh (koreksi + EQ + widener + gain + limiter).
        auto measureChain = [&](double hz) {
            chain.reset();
            const int block = 4096;
            std::vector<float> l(block), r(block);
            double phase = 0.0;
            const double inc = 2.0 * M_PI * hz / 48000.0;
            double inRms = 0.0, outRms = 0.0;

            for (int b = 0; b < 8; ++b) {
                for (int i = 0; i < block; ++i) {
                    const double x = 0.2 * std::sin(phase);
                    phase += inc;
                    l[i] = static_cast<float>(x);
                    r[i] = static_cast<float>(x);
                }
                if (b == 6) {
                    double s = 0.0;
                    for (int i = 0; i < block; ++i) s += l[i] * l[i];
                    inRms = std::sqrt(s / block);
                }
                chain.process(l.data(), r.data(), block);
                if (b == 6) {
                    double s = 0.0;
                    for (int i = 0; i < block; ++i) s += l[i] * l[i];
                    outRms = std::sqrt(s / block);
                }
            }
            if (inRms <= 0.0) return 0.0;
            return 20.0 * std::log10(outRms / inRms);
        };

        const double flat   = measureChain(700.0);
        const double bass   = measureChain(60.0);
        const double treble = measureChain(16000.0);

        std::printf("     lewat DSPChain: 700 Hz %+.2f | 60 Hz %+.2f | 16 kHz %+.2f dB\n",
                    flat, bass, treble);

        // Kalau node koreksi TIDAK ada di rantai, ketiganya akan sama
        // (semua nol dB) karena EQ/widener/gain default identity.
        check("koreksi terdengar di rantai (bass > mid)", bass > flat + 3.0);
        check("koreksi terdengar di rantai (treble < mid)", treble < flat - 0.5);

        // Dengan koreksi dimatikan, rantai harus identity.
        DSPChain plain;
        plain.prepare(48000, 4096);
        DSPConfig off;
        off.enabled = true;
        off.headphoneCorrectionEnabled = false;
        plain.applyConfig(off);

        plain.reset();
        std::vector<float> l(4096), r(4096);
        double phase = 0.0;
        for (int b = 0; b < 8; ++b) {
            for (int i = 0; i < 4096; ++i) {
                const double x = 0.2 * std::sin(phase);
                phase += 2.0 * M_PI * 700.0 / 48000.0;
                l[i] = static_cast<float>(x);
                r[i] = static_cast<float>(x);
            }
            if (b == 6) {
                double s = 0.0;
                for (int i = 0; i < 4096; ++i) s += l[i] * l[i];
                // inRms dihitung di luar; cukup bandingkan amplitudo akhir
            }
            plain.process(l.data(), r.data(), 4096);
        }
        double peak = 0.0;
        for (int i = 0; i < 4096; ++i) peak = std::max(peak, (double)std::fabs(l[i]));
        std::printf("     tanpa koreksi, puncak = %.4f (input 0.2)\n", peak);
        check("tanpa koreksi: level tetap ~0.2", std::fabs(peak - 0.2) < 0.02);
    }

    std::printf("\n=======================================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("=======================================================\n");

    return gFail == 0 ? 0 : 1;
}
