// Harness presisi float vs double untuk SolfeggioResonator (bandpass RBJ).
//
// Bukti numerik pertama untuk item parkir I1-double. Input white noise
// ±0,5, 2 detik per kombinasi, 10% awal dibuang (transien).
//
// Ronde 1 (referensi double): galat puncak (dBFS) untuk Q 4,0 (nilai tetap
// pasca-Batch 18 C2), kasus terburuk per laju (frekuensi 174 Hz; template
// dalam app 396-963 Hz):
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
// DICABUT untuk laju tinggi.
//
// Ronde 2 (referensi long double, pasca-refaktor I1-double): kolom
// "double" di bawah adalah galat DF-I double vs referensi long double —
// HARUS jauh di bawah -200 dBFS di semua kombinasi; bila tidak, double
// pun belum cukup. HASIL (2026-11-16, deterministik, seed sama):
// galat double puncak terburuk -245,9 dBFS (384 kHz, 174 Hz, Q 4,0),
// RMS terburuk -256,3 dBFS (kombinasi sama); di semua 60 kombinasi
// puncak -245…-298 dBFS, RMS -256…-315 dBFS. Bar -200 dBFS DILEWATI
// dengan margin 45 dB — I1-double SELESAI di sisi aritmetika. Kolom
// float mereproduksi ronde 1 (referensi ganti double -> long double
// hampir tidak mengubahnya: float -67,9 dBFS @384k/174Hz/Q4,0 tetap).
// Catatan: bar -200 dBFS berlaku untuk harness ini (tanpa I/O float);
// kelas produksi BiquadFilter::process mengembalikan float, jadi
// galat output-nya berlantai di -150 dBFS — lihat
// scripts/test_biquad_bandpass.cpp.
//
// Kompilasi: g++ -O2 -std=c++17 scripts/test_solfeggio_precision.cpp -o /tmp/t && /tmp/t
#include <cmath>
#include <cstdio>
#include <initializer_list>
#include <random>
template <class T> struct Bp {
    T b0{}, b1{}, b2{}, a1{}, a2{}, x1{}, x2{}, y1{}, y2{};
    // Desain dihitung dalam long double supaya referensi (T = long double)
    // benar-benar berpresisi penuh; untuk T = float/double, hasil desain
    // dicetak ke bawah ke T — kuantisasi koefisien itulah yang diukur.
    void design(long double fc, long double q, long double sr) {
        const long double w0 = 2.0L * acosl(-1.0L) * fc / sr, alpha = sinl(w0) / (2.0L * q), a0 = 1.0L + alpha;
        b0 = T(alpha / a0); b1 = T(0); b2 = T(-alpha / a0);
        a1 = T(-2.0L * cosl(w0) / a0); a2 = T((1.0L - alpha) / a0);
    }
    T proc(T x) { T y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }
};
int main() {
    std::mt19937 rng(1); std::uniform_real_distribution<double> d(-0.5, 0.5);
    std::printf("    sr    fc    Q | float puncak | float rms | double puncak | double rms\n");
    for (double sr : {44100.0, 48000.0, 96000.0, 192000.0, 384000.0})
    for (double fc : {174.0, 396.0, 528.0, 963.0})
    for (double q : {0.7, 4.0, 8.0}) {
        Bp<float> f; Bp<double> g; Bp<long double> r;
        f.design(fc, q, sr); g.design(fc, q, sr); r.design(fc, q, sr);
        const int N = int(sr * 2);
        double maxef = 0, sef = 0, maxeg = 0, seg = 0;
        for (int i = 0; i < N; ++i) {
            const double x = d(rng);
            const long double yr = r.proc((long double)x);
            const double yf = f.proc(float(x)), yg = g.proc(x);
            if (i > N / 10) {
                const double ef = std::fabs(yf - (double)yr), eg = std::fabs(yg - (double)yr);
                maxef = std::fmax(maxef, ef); sef += ef * ef;
                maxeg = std::fmax(maxeg, eg); seg += eg * eg;
            }
        }
        const double n = N * 0.9;
        std::printf("%6.0f %5.0f %4.1f | %10.1f | %9.1f | %11.1f | %9.1f\n", sr, fc, q,
                    20 * std::log10(maxef + 1e-30), 20 * std::log10(std::sqrt(sef / n) + 1e-30),
                    20 * std::log10(maxeg + 1e-30), 20 * std::log10(std::sqrt(seg / n) + 1e-30));
    }
}
