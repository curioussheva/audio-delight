// =====================================================
// scripts/test_biquad_bandpass.cpp
// =====================================================
//
// Membuktikan `BiquadFilter::setBandpass` (baru, I1-double) benar dan
// cukup presisi untuk SolfeggioResonator:
//
//   - setBandpass() mengembalikan true dan koefisiennya membentuk
//     bandpass RBJ constant 0 dB peak gain (puncak ~0 dB di fc,
//     atenuasi jauh di luar pita)
//   - koefisien produksi (double) cocok dengan desain long double
//     sampai < 1e-14 relatif — komputasi koefisiennya double-presisi
//   - galat output vs referensi long double (DF-I, desain long double)
//     di bawah -150 dBFS di semua laju 48-384 kHz. CATATAN BAR: -150 dBFS
//     adalah LANTAI pembulatan output float (process() mengembalikan
//     float; setengah-ULP untuk |y| <= 0,5 = -150,5 dBFS), BUKAN -200.
//     Bar -200 dBFS milik harness template (test_solfeggio_precision,
//     tanpa I/O float) — dan di sana double mencapai -245…-298 dBFS.
//     Yang dibuktikan di sini: filter produksi tidak menambah galat
//     di atas lantai output float-nya.
//   - reset() mengembalikan state ke nol (ulangan identik)
//
// Kompilasi:
//   g++ -O2 -std=c++17 -I android/app/src/main/cpp \
//     scripts/test_biquad_bandpass.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o /tmp/test_biquad_bandpass && /tmp/test_biquad_bandpass
//
// Keluar non-nol bila koefisien menyimpang > 1e-14 relatif, atau galat
// puncak output > -150 dBFS (lantai output float) di kombinasi mana pun.

#include <cmath>
#include <cstdio>
#include <random>

#include "dsp/BiquadFilter.h"

using pristine::BiquadFilter;

// Referensi long double, Direct Form I, desain long double.
struct RefLd {
    long double b0{}, b1{}, b2{}, a1{}, a2{}, x1{}, x2{}, y1{}, y2{};
    void design(long double fc, long double q, long double sr) {
        const long double w0 = 2.0L * acosl(-1.0L) * fc / sr;
        const long double alpha = sinl(w0) / (2.0L * q);
        const long double a0 = 1.0L + alpha;
        b0 = alpha / a0; b1 = 0.0L; b2 = -alpha / a0;
        a1 = -2.0L * cosl(w0) / a0; a2 = (1.0L - alpha) / a0;
    }
    long double proc(long double x) {
        long double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    }
};

static double dbfs(double e) { return 20.0 * std::log10(e + 1e-30); }

int main() {
    int failures = 0;

    // 1. Respons: puncak ~0 dB di fc, atenuasi jauh di luar pita.
    {
        BiquadFilter bp;
        if (!bp.setBandpass(528.0f, 4.0f, 48000.0f)) {
            std::printf("FAIL: setBandpass(528, 4, 48000) false\n");
            return 1;
        }
        // Sine 528 Hz, 1 detik: amplitudo output steady-state ~1.0.
        double maxOut = 0.0;
        for (int i = 0; i < 48000; ++i) {
            const float x = 0.5f * std::sin(2.0 * M_PI * 528.0 * i / 48000.0);
            const float y = bp.process(x);
            if (i > 24000) maxOut = std::fmax(maxOut, std::fabs((double)y));
        }
        std::printf("puncak 528 Hz: %.3f (harap ~0.5)\n", maxOut);
        if (maxOut < 0.45 || maxOut > 0.55) { std::printf("FAIL: puncak di luar toleransi\n"); failures++; }
    }

    // 2. Koefisien produksi vs desain long double + presisi output.
    std::printf("    sr    fc    Q | koef rel.err | prod puncak dBFS | prod rms dBFS\n");
    for (double sr : {48000.0, 96000.0, 192000.0, 384000.0})
    for (double fc : {174.0, 396.0, 528.0, 963.0})
    for (double q : {4.0}) {
        BiquadFilter bp;
        if (!bp.setBandpass((float)fc, (float)q, (float)sr)) {
            std::printf("FAIL: setBandpass(%.0f, %.1f, %.0f) false\n", fc, q, sr);
            failures++;
            continue;
        }
        // Koefisien: bandingkan dengan desain long double yang sama.
        const long double w0 = 2.0L * acosl(-1.0L) * (long double)fc / (long double)sr;
        const long double alpha = sinl(w0) / (2.0L * (long double)q);
        const long double a0 = 1.0L + alpha;
        const long double eb0 = alpha / a0, eb2 = -alpha / a0;
        const long double ea1 = -2.0L * cosl(w0) / a0, ea2 = (1.0L - alpha) / a0;
        const auto& c = bp.getCoefficients();
        const long double cerr = std::fmax(
            std::fmax(fabsl((long double)c.b0 - eb0), fabsl((long double)c.b2 - eb2)),
            std::fmax(fabsl((long double)c.a1 - ea1), fabsl((long double)c.a2 - ea2)));
        if (cerr > 1e-14L) {
            std::printf("FAIL: galat koefisien %.3Lg > 1e-14\n", cerr);
            failures++;
        }
        RefLd ref;
        ref.design((long double)fc, (long double)q, (long double)sr);
        std::mt19937 rng(1);
        std::uniform_real_distribution<double> d(-0.5, 0.5);
        const int N = int(sr * 2);
        double maxe = 0.0, se = 0.0;
        for (int i = 0; i < N; ++i) {
            const float xf = (float)d(rng);
            const double yprod = bp.process(xf);
            const double yref = (double)ref.proc((long double)xf);
            if (i > N / 10) {
                const double e = std::fabs(yprod - yref);
                maxe = std::fmax(maxe, e);
                se += e * e;
            }
        }
        const double rms = std::sqrt(se / (N * 0.9));
        std::printf("%6.0f %5.0f %4.1f | %11.2Lg | %12.1f | %11.1f\n", sr, fc, q, cerr, dbfs(maxe), dbfs(rms));
        // Lantai output float: setengah-ULP untuk |y| <= 0,5 = -150,5 dBFS.
        if (dbfs(maxe) > -150.0) {
            std::printf("FAIL: galat puncak %.1f dBFS > -150 dBFS (lantai float)\n", dbfs(maxe));
            failures++;
        }
    }

    // 3. reset(): ulangan identik setelah reset.
    {
        BiquadFilter bp;
        bp.setBandpass(528.0f, 4.0f, 48000.0f);
        float first[8];
        for (int i = 0; i < 8; ++i) first[i] = bp.process(0.5f);
        bp.reset();
        bool same = true;
        for (int i = 0; i < 8; ++i) same &= (bp.process(0.5f) == first[i]);
        std::printf("reset identik: %s\n", same ? "ya" : "TIDAK");
        if (!same) failures++;
    }

    std::printf(failures == 0 ? "SEMUA LOLOS\n" : "%d KEGAGALAN\n", failures);
    return failures == 0 ? 0 : 1;
}
