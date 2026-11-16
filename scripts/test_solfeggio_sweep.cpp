// =====================================================
// scripts/test_solfeggio_sweep.cpp
// =====================================================
//
// Membuktikan perbaikan C2 Batch 18 pada SolfeggioResonator:
//
//   1. Wet berubah MULUS per sampel saat intensity di-sweep 0 -> 1 dan
//      1 -> 0 per sampel (one-pole 0.002) — bukan lompatan per buffer.
//      Dibuktikan dengan membandingkan output produksi (float) terhadap
//      model referensi double yang independen (RBJ Q tetap 4.0 +
//      wet one-pole 0.002 + snap 1e-4): bila wet meloncat atau Q
//      mengikuti intensity, output menyimpang jauh dari referensi.
//
//   2. Q / koefisien TIDAK berubah saat hanya intensity berubah.
//      Dibuktikan dua cara: (a) perbandingan terhadap referensi Q=4.0
//      pada intensity 0.1 dan 1.0; (b) dua instans produksi dengan
//      intensity berbeda menghasilkan y0 (=(out-in)/wet) yang identik
//      — y0 hanya bergantung pada koefisien, bukan pada wet.
//
//   3. Koefisien tetap dihitung ulang saat FREKUENSI berubah
//      (referensi ikut berubah freq di tengah jalan; output tetap cocok).
//
//   4. Bypass hanya setelah wet meluruh: sesudah intensity -> 0, ekor
//      resonansi masih keluar (output != input) lalu output menjadi
//      bit-identik dengan input begitu bypass aktif — tanpa diskontinuitas.
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_solfeggio_sweep.cpp \
//     android/app/src/main/cpp/dsp/immersive/SolfeggioResonator.cpp \
//     -o /tmp/test_solfeggio_sweep && /tmp/test_solfeggio_sweep

#include "dsp/immersive/SolfeggioResonator.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace pristine::dsp;

static int gPass = 0;
static int gFail = 0;

static void check(bool ok, const std::string& what) {
    if (ok) {
        ++gPass;
        std::printf("  PASS  %s\n", what.c_str());
    } else {
        ++gFail;
        std::printf("  FAIL  %s\n", what.c_str());
    }
}

// Model referensi (double, ditulis independen dari kode produksi):
// RBJ bandpass constant-skirt-gain, Q TETAP 4.0, wet one-pole 0.002
// menuju target + snap 1e-4, bypass bila target <= 0 dan wet < 1e-4.
// Wet dimajukan sekali per sampel dan dipakai bersama oleh L dan R
// pada sampel yang sama.
struct RefPerSample {
    double b0 = 0.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0;
    double lx1 = 0.0, lx2 = 0.0, ly1 = 0.0, ly2 = 0.0;
    double rx1 = 0.0, rx2 = 0.0, ry1 = 0.0, ry2 = 0.0;
    double wet = 0.0;
    double cachedFreq = -1.0;

    void updateCoeffs(double freq, double sr) {
        if (freq == cachedFreq) return;
        cachedFreq = freq;
        const double Q = 4.0;
        const double effFreq = std::min(freq, 0.45 * sr);
        const double w0 = 2.0 * M_PI * effFreq / sr;
        const double cosW0 = std::cos(w0);
        const double sinW0 = std::sin(w0);
        const double alpha = sinW0 / (2.0 * Q);
        const double a0 = 1.0 + alpha;
        b0 = alpha / a0;
        b1 = 0.0;
        b2 = -alpha / a0;
        a1 = (-2.0 * cosW0) / a0;
        a2 = (1.0 - alpha) / a0;
    }

    // Proses SATU sampel stereo. Mengembalikan false bila bypass.
    bool sample(double xL, double xR, double freq, double target,
                double sr, double& outL, double& outR) {
        updateCoeffs(freq, sr);
        if (target <= 0.0 && wet < 1e-4) {
            outL = xL;
            outR = xR;
            return false;
        }
        wet += (target - wet) * 0.002;
        if (std::fabs(target - wet) <= 1e-4) wet = target;

        const double yL = b0 * xL + b1 * lx1 + b2 * lx2 - a1 * ly1 - a2 * ly2;
        lx2 = lx1; lx1 = xL;
        ly2 = ly1; ly1 = yL;
        outL = xL + wet * yL;

        const double yR = b0 * xR + b1 * rx1 + b2 * rx2 - a1 * ry1 - a2 * ry2;
        rx2 = rx1; rx1 = xR;
        ry2 = ry1; ry1 = yR;
        outR = xR + wet * yR;
        return true;
    }
};

static const double kSr = 48000.0;
static const double kFreq = 528.0;

// Sinyal uji: 528 Hz (tepat di pita) + 700 Hz (di luar pusat pita).
// Komponen 700 Hz PENTING: gain bandpass RBJ di frekuensi tengah (528 Hz)
// adalah 0 dB untuk SEMUA Q, jadi sinyal 528 Hz murni tidak bisa
// membedakan Q=1,43 dari Q=8. Komponen off-center-lah yang membuat tes
// sensitif terhadap Q.
static double testSignal(int i) {
    return 0.5 * std::sin(2.0 * M_PI * kFreq * i / kSr)
         + 0.3 * std::sin(2.0 * M_PI * 700.0 * i / kSr);
}

// =====================================================
// 1. Sweep intensity 0 -> 1 per sampel: wet mulus, Q tetap 4.0
// =====================================================
static void testSweepUp() {
    std::printf("\n1. Sweep intensity 0 -> 1 per sampel\n");

    const int n = 48000;
    SolfeggioResonator prod;
    prod.prepare(48000);
    prod.setFrequency(528.0f);

    RefPerSample ref;
    double maxDiff = 0.0;
    double maxJump = 0.0;
    double prevOut = 0.0;

    for (int i = 0; i < n; ++i) {
        const float target = static_cast<float>(i) / (n - 1); // 0 -> 1
        prod.setIntensity(target);

        float l = static_cast<float>(testSignal(i));
        float r = l;
        prod.process(&l, &r, 1);

        double refL = 0.0, refR = 0.0;
        ref.sample(testSignal(i), testSignal(i), kFreq, target, kSr, refL, refR);

        const double diff = std::fabs(static_cast<double>(l) - refL);
        if (diff > maxDiff) maxDiff = diff;
        if (i > 0) {
            const double jump = std::fabs(static_cast<double>(l) - prevOut);
            if (jump > maxJump) maxJump = jump;
        }
        prevOut = l;
    }

    std::printf("        (selisih maks vs referensi Q=4.0 + wet halus: %.2e)\n",
                maxDiff);
    std::printf("        (loncatan output maks antar-sampel: %.4f)\n", maxJump);
    check(maxDiff < 2e-4,
          "output cocok dengan referensi Q tetap 4.0 + wet one-pole");
    // Input sendiri berubah maks ~0.062/sampel (0.5*sin 528 Hz +
    // 0.3*sin 700 Hz); output yang halus ikut dalam orde itu. Wet yang
    // meloncat per buffer akan menambah loncatan jauh di atas itu.
    check(maxJump < 0.13, "tidak ada loncatan wet per buffer (zipper)");
}

// =====================================================
// 2. Sweep intensity 1 -> 0 per sampel + ekor tidak terpotong
// =====================================================
static void testSweepDown() {
    std::printf("\n2. Sweep intensity 1 -> 0 per sampel, lalu ekor meluruh\n");

    const int n = 48000;
    SolfeggioResonator prod;
    prod.prepare(48000);
    prod.setFrequency(528.0f);
    prod.setIntensity(1.0f);

    // Settle dulu pada intensity 1.
    {
        std::vector<float> l(4800, 0.0f), r(4800, 0.0f);
        for (int i = 0; i < 4800; ++i) l[i] = r[i] = 0.5f;
        prod.process(l.data(), r.data(), 4800);
    }

    RefPerSample ref;
    ref.wet = 1.0; // samakan kondisi settle (referensi juga sudah settle)
    // Settle referensi dengan cara yang sama (intensitas 1, input 0.5).
    for (int i = 0; i < 4800; ++i) {
        double oL = 0.0, oR = 0.0;
        ref.sample(0.5, 0.5, kFreq, 1.0, kSr, oL, oR);
    }

    double maxDiff = 0.0;
    double maxJump = 0.0;
    double prevOut = 0.0;
    for (int i = 0; i < n; ++i) {
        const float target = 1.0f - static_cast<float>(i) / (n - 1);
        prod.setIntensity(target);

        float l = static_cast<float>(testSignal(i));
        float r = l;
        prod.process(&l, &r, 1);

        double refL = 0.0, refR = 0.0;
        ref.sample(testSignal(i), testSignal(i), kFreq, target, kSr, refL, refR);

        const double diff = std::fabs(static_cast<double>(l) - refL);
        if (diff > maxDiff) maxDiff = diff;
        if (i > 0) {
            const double jump = std::fabs(static_cast<double>(l) - prevOut);
            if (jump > maxJump) maxJump = jump;
        }
        prevOut = l;
    }

    std::printf("        (selisih maks vs referensi: %.2e; loncatan maks: %.4f)\n",
                maxDiff, maxJump);
    check(maxDiff < 2e-4, "sweep turun cocok dengan referensi (wet halus)");
    check(maxJump < 0.13, "tidak ada klik saat intensity turun ke 0");
}

// =====================================================
// 3. Koefisien identik pada intensity berbeda (y0 sama)
// =====================================================
static void testCoeffsIndependentOfIntensity() {
    std::printf("\n3. Koefisien tidak bergantung pada intensity\n");

    const int n = 48000;
    SolfeggioResonator low, high;
    low.prepare(48000);
    high.prepare(48000);
    low.setFrequency(528.0f);
    high.setFrequency(528.0f);
    low.setIntensity(0.1f);
    high.setIntensity(1.0f);

    double maxY0Diff = 0.0;
    // Setelah wet settle (snap -> wet == target persis), y0 = (out-in)/wet
    // hanya bergantung pada koefisien. Bila Q mengikuti intensity,
    // y0 kedua instans akan berbeda jauh.
    for (int i = 0; i < n; ++i) {
        const float in = static_cast<float>(testSignal(i));
        float lLo = in, lHi = in;
        low.process(&lLo, &lLo, 1);
        high.process(&lHi, &lHi, 1);
        if (i > 20000) { // wet sudah settle (snap) di kedua instans
            const double y0Lo = (static_cast<double>(lLo) - in) / 0.1;
            const double y0Hi = (static_cast<double>(lHi) - in) / 1.0;
            const double d = std::fabs(y0Lo - y0Hi);
            if (d > maxY0Diff) maxY0Diff = d;
        }
    }

    std::printf("        (selisih y0 maks, intensity 0.1 vs 1.0: %.2e)\n",
                maxY0Diff);
    check(maxY0Diff < 1e-4,
          "y0 identik pada intensity 0.1 dan 1.0 (Q tetap, bukan 1.43 vs 8)");
}

// =====================================================
// 4. Frekuensi berubah -> koefisien tetap dihitung ulang
// =====================================================
static void testFreqChangeRecalculates() {
    std::printf("\n4. Perubahan frekuensi tetap menghitung ulang koefisien\n");

    const int n = 24000;
    SolfeggioResonator prod;
    prod.prepare(48000);
    prod.setFrequency(528.0f);
    prod.setIntensity(0.7f);

    RefPerSample ref;
    double maxDiff = 0.0;
    for (int i = 0; i < n; ++i) {
        const double freq = (i < n / 2) ? 528.0 : 741.0;
        if (i == n / 2) prod.setFrequency(741.0f);
        const float in = static_cast<float>(testSignal(i));
        float l = in;
        prod.process(&l, &l, 1);
        double refL = 0.0, refR = 0.0;
        ref.sample(testSignal(i), testSignal(i), freq, 0.7, kSr, refL, refR);
        const double diff = std::fabs(static_cast<double>(l) - refL);
        if (diff > maxDiff) maxDiff = diff;
    }

    std::printf("        (selisih maks vs referensi, pindah 528 -> 741 Hz: %.2e)\n",
                maxDiff);
    check(maxDiff < 2e-4, "koefisien mengikuti frekuensi baru (741 Hz)");
}

// =====================================================
// 5. Bypass hanya setelah wet meluruh + ekor tidak dipotong
// =====================================================
static void testBypassAfterSettle() {
    std::printf("\n5. Bypass hanya setelah wet < 1e-4 (ekor tidak terpotong)\n");

    SolfeggioResonator prod;
    prod.prepare(48000);
    prod.setFrequency(528.0f);
    prod.setIntensity(1.0f);

    const int buf = 512;
    std::vector<float> l(buf), r(buf);
    int idx = 0;
    auto fillSine = [&]() {
        for (int j = 0; j < buf; ++j, ++idx)
            l[j] = r[j] = static_cast<float>(testSignal(idx));
    };

    // Settle pada intensity 1 dengan sinus 528 Hz (tepat di pita) supaya
    // y0 besar — ekor resonansi terukur. (Input DC tidak cocok: bandpass
    // memblok DC, y0 -> 0, ekor tak terlihat.)
    for (int i = 0; i < 10; ++i) {
        fillSine();
        prod.process(l.data(), r.data(), buf);
    }

    // Intensity -> 0. Buffer pertama sesudahnya HARUS masih mengandung
    // ekor resonansi (output != input): dulu return mentah memotongnya.
    prod.setIntensity(0.0f);
    double tailMax = 0.0;
    std::vector<float> inCopy(buf);
    fillSine();
    inCopy = l;
    prod.process(l.data(), r.data(), buf);
    for (int j = 0; j < buf; ++j)
        tailMax = std::max(tailMax,
            std::fabs(static_cast<double>(l[j]) - inCopy[j]));

    std::printf("        (ekor buffer pertama setelah intensity 0: %.4f)\n",
                tailMax);
    check(tailMax > 1e-3, "ekor resonansi masih keluar setelah intensity -> 0");

    // Terus proses dengan intensity 0: output akhirnya harus bit-identik
    // dengan input (bypass aktif), dan tetap begitu.
    bool becameExact = false;
    int exactBuffers = 0;
    for (int b = 0; b < 200 && exactBuffers < 3; ++b) {
        fillSine();
        inCopy = l;
        prod.process(l.data(), r.data(), buf);
        bool exact = true;
        for (int j = 0; j < buf; ++j)
            if (l[j] != inCopy[j] || r[j] != inCopy[j]) { exact = false; break; }
        if (exact) {
            becameExact = true;
            ++exactBuffers;
        } else if (becameExact) {
            exactBuffers = 0; // jangan sampai "kebetulan" sekali
            becameExact = false;
        }
    }
    check(becameExact, "bypass aktif setelah wet meluruh (output bit-exact = input)");
}

// =====================================================
// MAIN
// =====================================================
int main() {
    std::printf("=== TEST SOLFEGGIO SWEEP (Batch 18 C2) ===\n");
    std::printf("Q tetap 4.0, wet one-pole 0.002, bypass setelah wet < 1e-4\n");

    testSweepUp();
    testSweepDown();
    testCoeffsIndependentOfIntensity();
    testFreqChangeRecalculates();
    testBypassAfterSettle();

    std::printf("\n========================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("========================================\n");

    return gFail == 0 ? 0 : 1;
}
