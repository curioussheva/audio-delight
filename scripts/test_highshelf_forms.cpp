// Harness Batch 13 — perbandingan bentuk S vs Q pada HighShelf (RBJ).
// Menjawab: seberapa luas zona NaN bentuk-S, dan apakah fc > Nyquist memang
// membuat filter tak stabil (klem 0,49*sr di BiquadFilter::designOk).
// BUKAN bagian build: file standalone, dikompilasi manual dengan g++.
//   g++ -O2 -std=c++17 scripts/test_highshelf_forms.cpp -o /tmp/t && /tmp/t
// Hasil run 2026-11-14 (g++ 13.3.0, -O2 -std=c++17):
//   kombinasi=2700 | S-form: NaN=684 tak-stabil=112 | Q-form: NaN=0 tak-stabil=150 (di atas Nyquist: 150)
// Artinya: 150/150 kasus tak-stabil Q-form berada di atas Nyquist -> klem wajib.
// Catatan: butuh #include <initializer_list> supaya range-for atas braced list
// compile di libstdc++ (tanpa itu: "deducing from brace-enclosed initializer list").
#include <cmath>
#include <cstdio>
#include <initializer_list>
struct C { double b0, b1, b2, a1, a2; };
static C highShelf(double fc, double q, double gainDb, double sr, bool sForm) {
    const double A = std::pow(10.0, gainDb / 40.0);
    const double w0 = 2.0 * M_PI * fc / sr, cw = std::cos(w0), sw = std::sin(w0);
    const double alpha = sForm ? (sw / 2.0) * std::sqrt((A + 1.0 / A) * (1.0 / q - 1.0) + 2.0)
                               : sw / (2.0 * q);
    const double beta = 2.0 * std::sqrt(A) * alpha;
    const double a0 = (A + 1) - (A - 1) * cw + beta;
    return { A * ((A + 1) + (A - 1) * cw + beta) / a0,
             -2 * A * ((A - 1) + (A + 1) * cw) / a0,
             A * ((A + 1) + (A - 1) * cw - beta) / a0,
             2 * ((A - 1) - (A + 1) * cw) / a0,
             ((A + 1) - (A - 1) * cw - beta) / a0 };
}
static bool stable(const C& c) {   // segitiga stabilitas biquad
    return std::isfinite(c.a1) && std::isfinite(c.a2) &&
           std::fabs(c.a2) < 1.0 && std::fabs(c.a1) < 1.0 + c.a2;
}
int main() {
    int n = 0, nanS = 0, nanQ = 0, unS = 0, unQ = 0, unQnyq = 0;
    for (double sr : {44100.0, 96000.0, 192000.0})
    for (double fc : {1000.0, 5000.0, 10000.0, 16000.0, 20000.0, 24000.0})
    for (double q : {0.5, 0.7, 1.0, 2.0, 4.0, 10.0})
    for (double g = -30; g <= 30; g += 2.5) {
        ++n;
        const C s = highShelf(fc, q, g, sr, true), f = highShelf(fc, q, g, sr, false);
        if (!std::isfinite(s.b0)) ++nanS; else if (!stable(s)) ++unS;
        if (!std::isfinite(f.b0)) ++nanQ; else if (!stable(f)) { ++unQ; if (fc > sr / 2) ++unQnyq; }
    }
    std::printf("kombinasi=%d | S-form: NaN=%d tak-stabil=%d | Q-form: NaN=%d tak-stabil=%d (di atas Nyquist: %d)\n",
                n, nanS, unS, nanQ, unQ, unQnyq);
}
