// =====================================================
// scripts/test_reverb.cpp
// =====================================================
//
// Membuktikan ReverbNode (Freeverb, 2026-11-19) benar-benar bekerja —
// bukan stub seperti sebelumnya.
//
// Bangun & jalankan (g++ tersedia di VM; clang++ di komentar file lain
// setara):
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_reverb.cpp \
//     android/app/src/main/cpp/dsp/DSPChain.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     android/app/src/main/cpp/dsp/tone/EQNode.cpp \
//     android/app/src/main/cpp/dsp/tone/GainNode.cpp \
//     android/app/src/main/cpp/dsp/tone/ReverbNode.cpp \
//     android/app/src/main/cpp/dsp/spatial/StereoWidenerNode.cpp \
//     android/app/src/main/cpp/dsp/dynamics/LimiterNode.cpp \
//     android/app/src/main/cpp/dsp/EQProcessor.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     android/app/src/main/cpp/dsp/headphone/HeadphoneCorrectionNode.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     -o /tmp/test_reverb && /tmp/test_reverb
//
// Yang TIDAK bisa dibuktikan di sini (butuh NDK + HP): wiring JNI /
// Kotlin dan bunyi di telinga. Yang dibuktikan: matematika node +
// penyaluran preset lewat DSPChain.

#include <cmath>
#include <cstdio>
#include <vector>

#include "dsp/DSPChain.h"
#include "dsp/tone/ReverbNode.h"
#include "core/DSPConfig.h"

using namespace pristine;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) gPass++; else gFail++;
}

static DSPConfig configWithReverb(int preset) {
    DSPConfig cfg;
    cfg.reset();
    cfg.reverbPreset = preset;
    return cfg;
}

// Energi (jumlah kuadrat) satu jendela.
static double windowEnergy(const std::vector<float>& x, int from, int to) {
    double e = 0.0;
    for (int i = from; i < to && i < (int)x.size(); ++i) {
        e += (double)x[i] * (double)x[i];
    }
    return e;
}

int main() {
    std::printf("ReverbNode (Freeverb) — host test\n");

    // --- 1. Pemetaan preset ---
    {
        const ReverbParams off = ReverbParams::fromPreset(0);
        check("preset 0: wet 0, dry 1", off.wet == 0.0f && off.dry == 1.0f);
        bool allWet = true;
        bool allDry = true;
        for (int p = 1; p <= 6; ++p) {
            const ReverbParams pr = ReverbParams::fromPreset(p);
            if (!(pr.wet > 0.0f)) allWet = false;
            if (!(pr.dry < 1.0f)) allDry = false;
            if (!(pr.roomSize > 0.0f && pr.roomSize <= 1.0f)) allWet = false;
        }
        check("preset 1..6: wet > 0, dry < 1, roomSize 0..1", allWet && allDry);
        const ReverbParams bad = ReverbParams::fromPreset(7);
        check("preset tak dikenal (7): sama dengan Off",
              bad.wet == 0.0f && bad.dry == 1.0f);
        const ReverbParams neg = ReverbParams::fromPreset(-1);
        check("preset negatif: sama dengan Off",
              neg.wet == 0.0f && neg.dry == 1.0f);
        // Plate paling terang (damp terkecil), Large Hall paling gelap
        // di antara ruang besar — pemetaan yang didokumentasikan.
        check("plate (6) damp < large hall (5) damp",
              ReverbParams::fromPreset(6).damp <
                  ReverbParams::fromPreset(5).damp);
        check("large hall (5) wet > small room (1) wet",
              ReverbParams::fromPreset(5).wet >
                  ReverbParams::fromPreset(1).wet);
    }

    // --- 2. Preset 0 = passthrough bit-exact ---
    {
        ReverbNode node;
        node.prepare(48000, 1920);
        node.applyConfig(configWithReverb(0));
        std::vector<float> l(4096), r(4096);
        for (int i = 0; i < 4096; ++i) {
            l[i] = std::sin(i * 0.01f) * 0.5f;
            r[i] = std::cos(i * 0.013f) * 0.5f;
        }
        const std::vector<float> l0 = l, r0 = r;
        node.process(l.data(), r.data(), 4096);
        bool exact = true;
        for (int i = 0; i < 4096; ++i) {
            if (l[i] != l0[i] || r[i] != r0[i]) { exact = false; break; }
        }
        check("preset 0: output bit-exact sama dengan input", exact);
    }

    // --- 3. Impuls -> ekor yang meluruh (preset 5, Large Hall) ---
    {
        ReverbNode node;
        node.prepare(48000, 1920);
        node.applyConfig(configWithReverb(5));
        const int N = 240000;  // 5 detik @48k
        std::vector<float> l(N, 0.0f), r(N, 0.0f);
        l[0] = 1.0f;
        r[0] = 1.0f;
        // Proses per chunk 1920 (seperti callback nyata).
        for (int off = 0; off < N; off += 1920) {
            const int n = std::min(1920, N - off);
            node.process(l.data() + off, r.data() + off, n);
        }
        // Sampel 0 = dry saja (comb belum terisi): 0.70 * 1.0.
        check("impuls sample 0 = dry 0.70 (large hall)",
              std::fabs(l[0] - 0.70f) < 1e-6f);
        // Ekor ada (bukan senyap) dan meluruh: energi awal >> energi akhir.
        const double eEarly = windowEnergy(l, 2000, 20000);
        const double eLate = windowEnergy(l, 100000, 120000);
        check("ekor ada: energi 2000..20000 > 0", eEarly > 1e-6);
        check("ekor meluruh: energi 100k..120k < 1% energi awal",
              eLate < eEarly * 0.01);
        check("ekor praktis habis di 4..5 detik (< 1e-6)",
              windowEnergy(l, 192000, 240000) < 1e-6);
        // Stereo: ekor kiri != kanan (spread delay berbeda).
        bool stereoDiffers = false;
        for (int i = 2000; i < 20000; ++i) {
            if (std::fabs(l[i] - r[i]) > 1e-6f) { stereoDiffers = true; break; }
        }
        check("ekor stereo: kiri != kanan", stereoDiffers);
    }

    // --- 4. Stabil: 10 detik noise keras tidak meledak ---
    {
        ReverbNode node;
        node.prepare(48000, 1920);
        node.applyConfig(configWithReverb(5));
        const int N = 480000;
        std::vector<float> l(N), r(N);
        unsigned s = 12345;
        for (int i = 0; i < N; ++i) {
            s = s * 1664525u + 1013904223u;
            const float v = ((s >> 9) & 0xFFFF) / 32768.0f - 1.0f;
            l[i] = v * 0.9f;
            r[i] = v * 0.9f;
        }
        float peak = 0.0f;
        for (int off = 0; off < N; off += 1920) {
            const int n = std::min(1920, N - off);
            node.process(l.data() + off, r.data() + off, n);
            for (int i = off; i < off + n; ++i) {
                peak = std::max(peak, std::fabs(l[i]));
                peak = std::max(peak, std::fabs(r[i]));
                if (!std::isfinite(l[i]) || !std::isfinite(r[i])) {
                    peak = 1e9f;
                    break;
                }
            }
        }
        // Puncak BOLEH > 1: comb beresonansi (gain resonansi 1/(1-fb)
        // ~5x) sehingga noise 0.9 bisa memuncak ~2.3 — itu wajar untuk
        // reverb, dan limiter yang duduk SESUDAH node ini di rantai
        // yang menangkapnya. Bukti stabilitas: finite + TERBATAS
        // (feedback tak stabil akan mencapai 1e30 dalam hitungan detik)
        // + meluruh sesudah input berhenti (di bawah).
        check("stabil: 10 dtk noise 0.9 -> finite, puncak < 6.0",
              peak < 6.0f);
        std::printf("      (puncak terukur: %.3f)\n", peak);
        // Sesudah input berhenti, ekor harus meluruh sampai habis.
        // Uji RELATIF (bukan absolut): sesudah 10 dtk noise, energi
        // steady-state besar, jadi ambang absolut 1e-6 tidak masuk akal
        // — yang dibuktikan adalah peluruhan: detik ke-2 < 1% detik ke-1
        // (teori: 0,65^32 ≈ 8e-7 per 48000 sampel).
        std::vector<float> tail(96000, 0.0f), tailr(96000, 0.0f);
        node.process(tail.data(), tailr.data(), 96000);
        const double eTail1 = windowEnergy(tail, 0, 48000);
        const double eTail2 = windowEnergy(tail, 48000, 96000);
        check("stabil: ekor meluruh sesudah input berhenti (detik-2 < 1% detik-1)",
              eTail2 < eTail1 * 0.01);
        std::printf("      (energi ekor detik-1: %.3g, detik-2: %.3g)\n",
                    eTail1, eTail2);
    }

    // --- 5. Preset berbeda -> suara berbeda ---
    {
        auto runPreset = [](int preset) {
            ReverbNode node;
            node.prepare(48000, 1920);
            node.applyConfig(configWithReverb(preset));
            std::vector<float> l(8192), r(8192);
            for (int i = 0; i < 8192; ++i) {
                l[i] = std::sin(i * 0.02f) * 0.5f;
                r[i] = l[i];
            }
            node.process(l.data(), r.data(), 8192);
            return l;
        };
        const std::vector<float> a = runPreset(1);
        const std::vector<float> b = runPreset(5);
        double diff = 0.0;
        for (int i = 0; i < 8192; ++i) diff += std::fabs(a[i] - b[i]);
        check("preset 1 vs 5: output berbeda", diff > 1.0);
    }

    // --- 6. 5 -> 0: sesudah fade, passthrough bit-exact lagi ---
    {
        ReverbNode node;
        node.prepare(48000, 1920);
        node.applyConfig(configWithReverb(5));
        std::vector<float> l(4096, 0.5f), r(4096, 0.5f);
        node.process(l.data(), r.data(), 4096);
        node.applyConfig(configWithReverb(0));
        // 10000 sampel fade (one-pole 0.002 -> settle jauh sebelum ini).
        std::vector<float> fade(10000, 0.25f), fader(10000, 0.25f);
        node.process(fade.data(), fader.data(), 10000);
        std::vector<float> s(1024), sr(1024);
        for (int i = 0; i < 1024; ++i) {
            s[i] = std::sin(i * 0.03f) * 0.4f;
            sr[i] = s[i];
        }
        const std::vector<float> s0 = s;
        node.process(s.data(), sr.data(), 1024);
        bool exact = true;
        for (int i = 0; i < 1024; ++i) {
            if (s[i] != s0[i]) { exact = false; break; }
        }
        check("5 -> 0: sesudah fade, passthrough bit-exact lagi", exact);
    }

    // --- 7. Laju sampel lain: 44,1 kHz jalan, delay ikut skala ---
    {
        // Ekor pertama muncul di delay comb terpendek (allpass punya
        // jalur langsung -g*x, jadi tidak menambah delay): 1116 @44,1k,
        // round(1116*48000/44100) = 1215 @48k. Itu bukti delay diskalakan
        // ke laju sampel, bukan dipatok 44,1 kHz.
        auto firstWetAt = [](int sampleRate) {
            ReverbNode node;
            node.prepare(sampleRate, 1920);
            node.applyConfig(configWithReverb(5));
            std::vector<float> l(8192, 0.0f), r(8192, 0.0f);
            l[0] = 1.0f;
            r[0] = 1.0f;
            node.process(l.data(), r.data(), 8192);
            for (int i = 1; i < 8192; ++i) {
                if (std::fabs(l[i]) > 1e-6f) return i;
            }
            return -1;
        };
        check("44,1k: ekor pertama di sampel 1116",
              firstWetAt(44100) == 1116);
        check("48k: ekor pertama di sampel 1215 (delay ikut skala)",
              firstWetAt(48000) == 1215);
    }

    // --- 8. Lewat DSPChain penuh: preset 0 = identity, 5 = berubah ---
    {
        auto runChain = [](int preset) {
            DSPChain chain;
            chain.prepare(48000, 1920);
            chain.applyConfig(configWithReverb(preset));
            std::vector<float> l(4096), r(4096);
            for (int i = 0; i < 4096; ++i) {
                l[i] = std::sin(i * 0.01f) * 0.5f;
                r[i] = std::cos(i * 0.013f) * 0.5f;
            }
            const std::vector<float> l0 = l;
            chain.process(l.data(), r.data(), 4096);
            double diff = 0.0;
            for (int i = 0; i < 4096; ++i) diff += std::fabs(l[i] - l0[i]);
            return diff;
        };
        check("DSPChain preset 0: output == input (diff 0)",
              runChain(0) == 0.0);
        check("DSPChain preset 5: output berubah",
              runChain(5) > 1.0);
    }

    std::printf("\n%d PASS, %d FAIL\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
