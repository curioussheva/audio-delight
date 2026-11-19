// =====================================================
// jni/NativeVisualizerModule.cpp
// =====================================================

#include <jni.h>
#include "JniGuard.h"

#include <algorithm>
#include <cmath>
#include <mutex>

#include "../fft/FFTProcessor.h"
#include "../manager/EngineManager.h"
#include "../visualizer/VisualizerBuffer.h"

using namespace pristine;

namespace {

// Indeks bin linear untuk posisi normalisasi t (0..1) pada skala log.
// Cerminan persis NativeVisualizerBridge.kt::logIndex (dihapus E1,
// 2026-11-19): batas bawah pendengaran 20 Hz, batas atas Nyquist stream
// aktual. Dipakai mapToLogBins di bawah — keduanya harus tetap sama.
int visualizerLogIndex(double t, int half, double nyquist) {
    if (t <= 0.0) return 0;
    const double minF = 20.0;
    const double maxF = nyquist;
    const double freq = minF * std::pow(maxF / minF, t);
    const int idx = static_cast<int>(freq / nyquist * half);
    if (idx < 0) return 0;
    if (idx > half - 1) return half - 1;
    return idx;
}

} // namespace

extern "C" {

// =====================================================
// SPEKTRUM SIAP PAKAI (E1, 2026-11-19 — FFT pindah ke C++)
// =====================================================
//
// Dulu JNI ini hanya mengembalikan 2048 sample mentah (getVisualizerData),
// lalu FFT + log-bins dihitung di Kotlin (NativeVisualizerBridge) di
// thread bridge tiap poll — beban itu yang membuat poll 100 ms terasa
// berat. Sekarang FFT (FFTProcessor + FFTPlan 2048) + pemetaan 128 bin log
// + skala dB dihitung DI SINI, dan Kotlin tinggal meneruskan hasilnya ke
// JS. Kontrak ke JS TIDAK berubah: tetap 128 bin 0.0-1.0.
//
// Skala dipertahankan identik dengan Kotlin lama, supaya tampilan tidak
// berubah:
// - jendela Hann 0.5*(1-cos(2*pi*i/(N-1))) — sama dengan Kotlin
//   (FFTProcessor memakai createHanningWindow yang sama persis);
// - magnitude = |X[i]| / 1024 — FFTProcessor mengembalikan |X| mentah,
//   jadi /1024 dilakukan di langkah log-bin di bawah;
// - bin log 20 Hz..Nyquist stream (fallback 48 kHz bila engine belum
//   start), rata-rata magnitude per bin, dB = 20*log10(linear),
//   normalisasi (dB+80)/80 di-clamp 0..1 — dBFS -80..0, tidak berubah.
// - tap TETAP sesudah DSP (VisualizerBuffer diisi AudioCallback
//   pasca-pipeline); yang pindah hanya TEMPAT FFT dihitung, bukan sumber
//   data.
//
// Threading: dipanggil dari thread bridge (T2) lewat getFFTData() —
// satu poller, diserialkan di Kotlin (synchronized). FFTProcessor
// menyimpan buffer anggota yang dipakai ulang (tanpa alokasi per tick),
// jadi panggilannya diserialkan dengan mutex statis sebagai
// defense-in-depth. Bukan audio thread — tidak ada pantangan realtime
// di sini.
JNIEXPORT void JNICALL
Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getSpectrumData(
    JNIEnv* env,
    jobject,
    jfloatArray out
) {
    pristine::jni::guardedVoid(env, "getSpectrumData", [&]() {

    // FIX B2 (2026-11-10): 2048, bukan 256 — dipertahankan di sini.
    // Ukuran ini harus sama dengan VisualizerBuffer::kReadSize (2048):
    // read() mengembalikan `size` sample terakhir dari ring. Ring-nya
    // sendiri lebih besar (kSize = 4096, B17-V1) — jendela baca tetap 2048.
    constexpr int kVisualizerSize = 2048;
    constexpr int kOutputBins = 128;
    // Skala dBFS (keputusan csheva 2026-11-14: full scale + warna clip).
    constexpr double kDbFloor = -80.0;
    constexpr double kDbCeil = 0.0;
    static_assert(kVisualizerSize == static_cast<int>(VisualizerBuffer::kReadSize),
                  "kVisualizerSize harus sama dengan VisualizerBuffer::kReadSize");

    // Kotlin mengirim satu FloatArray(128) yang dipakai ulang tiap
    // panggilan dan fungsi ini hanya mengisinya via SetFloatArrayRegion.
    // Array null / lebih pendek dari 128 ditolak keras supaya tidak
    // diam-diam menghitung spektrum dari data basi.
    if (out == nullptr || env->GetArrayLength(out) < kOutputBins) {
        jclass exClass = env->FindClass("java/lang/IllegalArgumentException");
        if (exClass != nullptr) {
            env->ThrowNew(exClass, "getSpectrumData: out null atau < 128");
            env->DeleteLocalRef(exClass);
        }
        return;
    }

    // Buffer kerja + FFTProcessor dipakai ulang antar tick (tanpa alokasi
    // per tick — FFTPlan menghitung tabel twiddle/bit-reversal sekali di
    // konstruktor). Diserialkan dengan mutex, lihat komentar di atas.
    static std::mutex spectrumMutex;
    std::lock_guard<std::mutex> lock(spectrumMutex);
    static FFTProcessor processor(kVisualizerSize);

    // Stack array, bukan heap (pola yang sama dengan getVisualizerData lama).
    float samples[kVisualizerSize];
    EngineManager::get()
        .engine()
        .getVisualizerData(
            samples,
            kVisualizerSize
        );

    // magnitude[0..1024] = |X| mentah (tanpa /1024 — lihat komentar di atas).
    float magnitude[kVisualizerSize / 2 + 1];
    processor.process(samples, magnitude);

    // Nyquist dari laju stream aktual (bukan hardcode): engine reopen per
    // laju file, dan bin teratas = Nyquist. Bila engine belum start
    // (rate 0), fallback 48 kHz — sama dengan default Kotlin lama.
    const int streamRate = EngineManager::get().actualSampleRate();
    const double nyquist = (streamRate > 0 ? streamRate : 48000) / 2.0;

    const int half = kVisualizerSize / 2;
    float bins[kOutputBins];
    for (int b = 0; b < kOutputBins; ++b) {
        const int lo = visualizerLogIndex(
            static_cast<double>(b) / kOutputBins, half, nyquist);
        const int hi = visualizerLogIndex(
            static_cast<double>(b + 1) / kOutputBins, half, nyquist);

        double sum = 0.0;
        int count = 0;
        const int end = std::max(hi, lo + 1);
        for (int i = lo; i < end && i < half; ++i) {
            // Bagi /half di sini: samakan skala Kotlin lama (|X|/1024).
            sum += static_cast<double>(magnitude[i]) / half;
            ++count;
        }
        const double linear = count > 0 ? sum / count : 0.0;

        // dB, lalu petakan ke 0.0-1.0.
        const double db = 20.0 * std::log10(std::max(linear, 1e-9));
        double normalized = (db - kDbFloor) / (kDbCeil - kDbFloor);
        if (normalized < 0.0) normalized = 0.0;
        if (normalized > 1.0) normalized = 1.0;
        bins[b] = static_cast<float>(normalized);
    }

    env->SetFloatArrayRegion(
        out,
        0,
        kOutputBins,
        bins
    );
    });
}

}