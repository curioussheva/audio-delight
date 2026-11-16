// Harness presisi float vs double untuk SolfeggioResonator (bandpass RBJ).
//
// Bukti numerik pertama untuk item parkir I1-double. Input white noise
// ±0,5, 2 detik per kombinasi, 10% awal dibuang (transien). Referensi:
// double DF-I yang sama (desain dihitung double, lalu dicetak ke T).
//
// Galat puncak (dBFS) untuk Q 4,0 (nilai tetap pasca-Batch 18 C2),
// kasus terburuk per laju (frekuensi 174 Hz; template dalam app 396-963 Hz):
//
//   Laju     Terburuk   (174 Hz)   Terburuk template app (396/528/963 Hz)
//   48 kHz     -101,7                 -104,9 (396 Hz)
//   96 kHz      -98,1                 -102,8 (528 Hz)
//   192 kHz     -85,3                  -91,1 (528 Hz)
//   384 kHz     -67,9 (RMS -78,8)      -80,3 (396 Hz)
//
// Bacanya (aturan pengirim): puncak < -110 dBFS tidak terdengar (float
// cukup); > -96 dBFS di kombinasi nyata berarti double dibutuhkan.
// Pola: galat naik dengan laju sampling, turun dengan frekuensi. Di
// 48 kHz (HP csheva, mentok 48 kHz) float cukup; di 192/384 kHz (DAC
// eksternal) float menambahkan hiss ~-68 dBFS di pita resonator —
// pengurangan nyata untuk app audiophile. Kesimpulan "float cukup"
// DICABUT untuk laju tinggi; resonator (dan kandidat float lain:
// DC blocker HarmonicExciter, akumulator fase BrainwaveGenerator)
// direkomendasikan pindah ke double.
//
// Kompilasi: g++ -O2 -std=c++17 scripts/test_solfeggio_precision.cpp -o /tmp/t && /tmp/t
#include <cmath>
#include <cstdio>
#include <initializer_list>
#include <random>
template <class T> struct Bp {
    T b0{}, b1{}, b2{}, a1{}, a2{}, x1{}, x2{}, y1{}, y2{};
    void design(double fc, double q, double sr) {
        const double w0 = 2 * M_PI * fc / sr, alpha = std::sin(w0) / (2 * q), a0 = 1 + alpha;
        b0 = T(alpha / a0); b1 = T(0); b2 = T(-alpha / a0);
        a1 = T(-2 * std::cos(w0) / a0); a2 = T((1 - alpha) / a0);
    }
    T proc(T x) { T y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }
};
int main() {
    std::mt19937 rng(1); std::uniform_real_distribution<double> d(-0.5, 0.5);
    std::printf("    sr    fc    Q | err puncak dBFS | err rms dBFS\n");
    for (double sr : {44100.0, 48000.0, 96000.0, 192000.0, 384000.0})
    for (double fc : {174.0, 396.0, 528.0, 963.0})
    for (double q : {0.7, 4.0, 8.0}) {
        Bp<float> f; Bp<double> g; f.design(fc, q, sr); g.design(fc, q, sr);
        const int N = int(sr * 2); double maxe = 0, se = 0;
        for (int i = 0; i < N; ++i) {
            const double x = d(rng), yf = f.proc(float(x)), yg = g.proc(x);
            if (i > N / 10) { const double e = std::fabs(yf - yg); maxe = std::fmax(maxe, e); se += e * e; }
        }
        std::printf("%6.0f %5.0f %4.1f | %10.1f | %10.1f\n", sr, fc, q,
                    20 * std::log10(maxe + 1e-30), 20 * std::log10(std::sqrt(se / (N * 0.9)) + 1e-30));
    }
}
