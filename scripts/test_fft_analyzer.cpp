// Harness audit fft 2026-11-11 — bukti dua temuan di fft/ (semua dormant, 0 caller).
//
// T1 (FFTProcessor): input DC (semua 1.0) lewat FFTProcessor(2048).process().
//   Yang benar: puncak di bin 0 (~1024 = jumlah jendela Hann 2048), bin
//   Nyquist (1024) ~0. Yang terjadi karena reinterpret_cast di process():
//   forward() membaca buffer Complex sebagai float — sinyal jadi
//   [x0,0,x1,0,...] (setengah frame pertama disisipi nol) — sehingga muncul
//   puncak PALSU di Nyquist ~512 dan bin 0 cuma ~512.
// T2 (SpectrumAnalyzer, mode "oob", JALANKAN DI BAWAH ASan): isi buffer
//   sampai penuh (2048 sampel) lalu feed() 16 sampel lagi. feed() menulis
//   mRingBuffer[mWritePos++] SEBELUM cek batas, dan cap-nya menahan
//   mWritePos di mFFTSize — jadi setiap sampel sesudah penuh menulis
//   mRingBuffer[2048] (OOB WRITE, heap-buffer-overflow).
//
// Compile:
//   g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/fft \
//     -Iandroid/app/src/main/cpp/dsp/convolution -Iandroid/app/src/main/cpp \
//     scripts/test_fft_analyzer.cpp android/app/src/main/cpp/fft/FFTPlan.cpp \
//     android/app/src/main/cpp/fft/FFTProcessor.cpp \
//     android/app/src/main/cpp/fft/SpectrumAnalyzer.cpp \
//     android/app/src/main/cpp/dsp/convolution/WindowFunctions.cpp \
//     -o /tmp/test_fft_analyzer
//   ASan: tambah -fsanitize=address -g, jalankan: /tmp/test_fft_asan oob
#include <cstdio>
#include <cmath>
#include <cstring>
#include <vector>
#include "FFTPlan.h"
#include "FFTProcessor.h"
#include "SpectrumAnalyzer.h"

using namespace pristine;

static void testFFTProcessorDC() {
    const int N = 2048;
    FFTProcessor proc(N);
    std::vector<float> in(N, 1.0f), mag(N / 2 + 1, 0.0f);
    proc.process(in.data(), mag.data());
    printf("T1 FFTProcessor DC: mag[0]=%.1f mag[1]=%.1f mag[1024 Nyquist]=%.1f\n",
           mag[0], mag[1], mag[N / 2]);
    // Referensi benar: jendela Hann 2048 x DC -> FFTPlan langsung di array real.
    FFTPlan plan(N);
    std::vector<float> win(N);
    std::vector<Complex> spec(N);
    for (int i = 0; i < N; ++i)
        win[i] = 0.5f * (1.0f - std::cos(2.0f * (float)M_PI * i / (N - 1)));
    plan.forward(win.data(), spec.data());
    float ref0 = std::abs(spec[0]);
    float refNyq = std::abs(spec[N / 2]);
    printf("T1 referensi benar:   mag[0]=%.1f mag[1024 Nyquist]=%.1f\n", ref0, refNyq);
    bool bug = (mag[N / 2] > 100.0f && refNyq < 1.0f);
    printf("T1 %s: puncak Nyquist palsu %.1f (harusnya ~0)\n",
           bug ? "BUG TERBUKTI" : "tidak terbukti", mag[N / 2]);
}

static void testAnalyzerOOB() {
    // Di bawah ASan: harus abort dengan heap-buffer-overflow WRITE.
    const int N = 2048;
    SpectrumAnalyzer an(N, 48000);
    std::vector<float> chunk(N, 0.5f), extra(16, 0.5f);
    an.feed(chunk.data(), N);          // isi sampai penuh persis
    printf("T2 buffer penuh, feed 16 sampel lagi (OOB kalau bug ada)...\n");
    fflush(stdout);
    an.feed(extra.data(), 16);         // <-- menulis mRingBuffer[2048]
    printf("T2 selesai tanpa abort (tanpa ASan OOB tidak ketahuan)\n");
}

int main(int argc, char** argv) {
    if (argc > 1 && std::strcmp(argv[1], "oob") == 0) {
        testAnalyzerOOB();
    } else {
        testFFTProcessorDC();
    }
    return 0;
}
