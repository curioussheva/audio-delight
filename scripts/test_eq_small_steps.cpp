// Harness Batch 14 — langkah gain kecil band rendah vs ambang sapuan (E1).
// Menjawab: langkah gain berapa dB di 31 Hz yang selisih koefisiennya
// <= kSettledEps = 1e-4 (ambang lama EQProcessor), sehingga target disimpan
// tapi koefisien live tidak pernah menyusul dan mask sapuan tidak menyala.
// BUKAN bagian build: file standalone, dikompilasi manual dengan g++.
//   g++ -O2 -std=c++17 scripts/test_eq_small_steps.cpp -o /tmp/t && /tmp/t
// Hasil run 2026-11-14 (g++ 13.3.0, -O2 -std=gnu++17):
//   sr= 48000:  0.25dB->4.1e-05(DIABAIKAN)  0.50dB->8.3e-05(DIABAIKAN)  1.00dB->1.7e-04  2.00dB->3.3e-04
//   sr= 96000:  0.25dB->2.1e-05(DIABAIKAN)  0.50dB->4.1e-05(DIABAIKAN)  1.00dB->8.3e-05(DIABAIKAN)  2.00dB->1.7e-04
//   sr=192000:  0.25dB->1.0e-05(DIABAIKAN)  0.50dB->2.1e-05(DIABAIKAN)  1.00dB->4.1e-05(DIABAIKAN)  2.00dB->8.3e-05(DIABAIKAN)
//   sr=384000:  0.25dB->5.2e-06(DIABAIKAN)  0.50dB->1.0e-05(DIABAIKAN)  1.00dB->2.1e-05(DIABAIKAN)  2.00dB->4.1e-05(DIABAIKAN)
// Artinya: di 192/384 kHz langkah 2,0 dB pun DIABAIKAN; di 48 kHz (laju
// maksimum HP csheva) langkah 0,25-0,5 dB sudah diabaikan. Estimasi tangan
// pengirim (<=0,6 dB @192 kHz, <=1,2 dB @384 kHz) terlalu optimis >3x.
// Catatan: butuh #include <initializer_list> supaya range-for atas braced list
// compile di libstdc++ (tanpa itu: "deducing from brace-enclosed initializer list").
#include <cmath>
#include <initializer_list>
#include <cstdio>
struct C { double b0, b1, b2, a1, a2; };
static C lowShelf(double fc, double q, double gDb, double sr) {
    const double A = std::pow(10.0, gDb / 40.0), w0 = 2 * M_PI * fc / sr;
    const double cw = std::cos(w0), alpha = std::sin(w0) / (2 * q), beta = 2 * std::sqrt(A) * alpha;
    const double a0 = (A + 1) + (A - 1) * cw + beta;
    return { A * ((A + 1) - (A - 1) * cw + beta) / a0, 2 * A * ((A - 1) - (A + 1) * cw) / a0,
             A * ((A + 1) - (A - 1) * cw - beta) / a0, -2 * ((A - 1) + (A + 1) * cw) / a0,
             ((A + 1) + (A - 1) * cw - beta) / a0 };
}
static double maxDelta(const C& a, const C& b) {
    double m = 0;
    for (double d : {a.b0 - b.b0, a.b1 - b.b1, a.b2 - b.b2, a.a1 - b.a1, a.a2 - b.a2})
        m = std::fmax(m, std::fabs(d));
    return m;
}
int main() {
    for (double sr : {48000.0, 96000.0, 192000.0, 384000.0}) {
        std::printf("sr=%6.0f:", sr);
        for (double g : {0.25, 0.5, 1.0, 2.0}) {
            const double d = maxDelta(lowShelf(31, 0.707, 0, sr), lowShelf(31, 0.707, g, sr));
            std::printf("  %.2fdB->%.1e%s", g, d, d <= 1e-4 ? "(DIABAIKAN)" : "");
        }
        std::printf("\n");
    }
}
