// =====================================================
// decoder/AudioFileAnalyzer.cpp
// =====================================================
//
// Implementasi analyzeFile() — lihat AudioFileAnalyzer.h untuk desain,
// ambang, dan batasan.
//
// Dua hal yang harus dijaga di sini (keduanya soal kejujuran pengukuran):
//
//   1. Decode di laju ASLI file (two-pass open). setTargetFormat() HARUS
//      dipanggil SEBELUM open() — setelah open, swr sudah dikonfigurasi
//      (lihat PlaybackController::startDecoder yang melakukan hal sama).
//      Pass 1 buka dengan target default hanya untuk membaca laju input
//      + durasi; pass 2 buka lagi dengan target = laju input, stereo.
//      Kalau file di-resample (naik/turun), cutoff yang diukur adalah
//      cutoff filter resampler, bukan cutoff file — pengukuran bohong.
//   2. Decoder ini milik analyzer sepenuhnya (instans FFmpegDecoder lokal,
//      bukan playback controller). Tidak mengganggu playback yang sedang
//      jalan; tidak ada state bersama.
//
// Catatan thread: analyzeFile() jalan sinkron di thread pemanggil (thread
// modul Kotlin @ReactMethod, bukan audio thread). Decode 5 jendela kecil
// biasanya < 1 detik untuk file lokal; file di jaringan / lambat bisa
// lebih — pemanggil TS menanganinya sebagai Promise biasa.

#include "AudioFileAnalyzer.h"

#include "FFmpegDecoder.h"
#include "../fft/FFTPlan.h"

#include <algorithm>
#include <cmath>

namespace pristine::analyzer {

namespace {

// Jendela Hann inline (0.5 * (1 - cos(2*pi*i/(N-1)))) — tanpa dependensi
// ke dsp/convolution. Tanpa jendela, tepi blok menimbulkan leakage yang
// mengangkat bin di atas cutoff (puncak palsu).
inline float hannWindow(int i, int n) {
    return 0.5f *
           (1.0f - std::cos(2.0f * static_cast<float>(M_PI) *
                            static_cast<float>(i) /
                            static_cast<float>(n - 1)));
}

// Fraksi posisi jendela di sepanjang file.
constexpr double kWindowFractions[kMaxWindows] = {0.10, 0.30, 0.50, 0.70,
                                                   0.90};

} // namespace

SpectralAnalysis analyzeFile(const std::string& path) {
    SpectralAnalysis result;

    if (path.empty()) {
        result.error = "path kosong";
        return result;
    }

    // ---------- Pass 1: baca laju input + durasi (target default) ----------
    uint32_t inputRate = 0;
    double durationSeconds = 0.0;
    {
        decoder::FFmpegDecoder probe;
        if (!probe.open(path)) {
            result.error = "tidak bisa membuka file: " + probe.getLastError();
            return result;
        }
        // getDurationSeconds() dideklarasikan protected di FFmpegDecoder
        // (override dari base) — akses lewat referensi base class, yang
        // mendeklarasikannya public. Jangan panggil via objek turunan.
        const decoder::AudioDecoder& probeBase = probe;
        inputRate = probe.getInputFormat().sampleRate;
        durationSeconds = probeBase.getDurationSeconds();
        probe.close();
    }

    if (inputRate == 0) {
        result.error = "laju sampel file tidak diketahui";
        return result;
    }

    result.sampleRate = inputRate;
    result.durationSeconds = durationSeconds;

    // ---------- Pass 2: decode di laju asli, stereo ----------
    decoder::DecodeConfig cfg;
    cfg.targetSampleRate = inputRate;
    cfg.targetChannels = 2;
    cfg.chunkFrames = 4096;

    decoder::FFmpegDecoder decoder(cfg);
    decoder::AudioFormat targetFormat;
    targetFormat.sampleRate = inputRate;
    targetFormat.channels = 2;
    // PENTING: sebelum open() — lihat catatan di header file ini.
    decoder.setTargetFormat(targetFormat);

    if (!decoder.open(path)) {
        result.error = "tidak bisa membuka file: " + decoder.getLastError();
        return result;
    }

    const uint32_t outChannels = decoder.getOutputFormat().channels;
    if (outChannels == 0) {
        result.error = "jumlah kanal output 0";
        decoder.close();
        return result;
    }
    result.channels = outChannels;

    // ---------- Jendela: seek + decode ----------
    // Spektrum per-bin diambil MAX antar-jendela (bukan rata-rata): rata-rata
    // mengencerkan puncak sesaat, sementara max menangkap konten nyata di
    // bagian mana pun lagu itu ada.
    std::vector<float> maxMagnitudes(
        static_cast<size_t>(kFftSize) / 2, 0.0f);
    std::vector<float> leftSamples;
    leftSamples.reserve(
        static_cast<size_t>(kMaxWindows) * kFftSize);

    double peakLinear = 0.0;
    double sumSquares = 0.0;
    size_t sampleCount = 0;

    pristine::FFTPlan plan(kFftSize);
    if (!plan.isValid()) {
        result.error = "FFTPlan tidak valid";
        decoder.close();
        return result;
    }

    int windowsUsed = 0;
    for (int w = 0; w < kMaxWindows; ++w) {
        double t = 0.0;
        if (durationSeconds > 0.0) {
            t = durationSeconds * kWindowFractions[w];
        }
        // Durasi tak diketahui (<= 0): hanya jendela pertama (dari awal).
        if (durationSeconds <= 0.0 && w > 0) break;

        if (!decoder.seek(t)) {
            // Seek gagal (file tak bisa di-seek / posisi di luar durasi):
            // lewati jendela ini, bukan gagalkan seluruh analisis.
            continue;
        }

        // Kumpulkan sampai kFftSize frame (mono-mix nanti dari sini).
        std::vector<float> mono;
        mono.reserve(static_cast<size_t>(kFftSize));
        std::vector<float> left;
        left.reserve(static_cast<size_t>(kFftSize));

        while (static_cast<int>(mono.size()) < kFftSize) {
            decoder::DecodeResult res =
                decoder.decode(cfg.chunkFrames);
            if (res.isEof() || res.samples.empty()) break;
            if (res.status == decoder::DecodeStatus::Error ||
                res.status == decoder::DecodeStatus::FatalError) {
                break;
            }
            const uint32_t frames = std::min<uint32_t>(
                res.framesDecoded,
                static_cast<uint32_t>(res.samples.size() / outChannels));
            for (uint32_t f = 0; f < frames; ++f) {
                const float l = res.samples[f * outChannels];
                float r = l;
                if (outChannels >= 2) {
                    r = res.samples[f * outChannels + 1];
                }
                mono.push_back(0.5f * (l + r));
                left.push_back(l);
            }
        }

        if (static_cast<int>(mono.size()) < kMinWindowFrames) {
            continue; // Terlalu pendek — lewati.
        }

        // Statistik level (dari sampel mono, sebelum windowing).
        for (float x : mono) {
            const double ax = std::fabs(static_cast<double>(x));
            if (ax > peakLinear) peakLinear = ax;
            sumSquares += static_cast<double>(x) * static_cast<double>(x);
            ++sampleCount;
        }
        leftSamples.insert(
            leftSamples.end(), left.begin(), left.end());

        // Hann + FFT (zero-pad sisanya sampai kFftSize).
        std::vector<float> windowed(static_cast<size_t>(kFftSize), 0.0f);
        for (size_t i = 0; i < mono.size(); ++i) {
            windowed[i] = mono[i] * hannWindow(static_cast<int>(i), kFftSize);
        }
        std::vector<pristine::Complex> spectrum(
            static_cast<size_t>(kFftSize));
        plan.forward(windowed.data(), spectrum.data());

        for (int b = 0; b < kFftSize / 2; ++b) {
            const float mag = std::abs(spectrum[static_cast<size_t>(b)]);
            if (mag > maxMagnitudes[static_cast<size_t>(b)]) {
                maxMagnitudes[static_cast<size_t>(b)] = mag;
            }
        }
        ++windowsUsed;
    }

    decoder.close();

    if (windowsUsed == 0) {
        result.error = "tidak ada jendela yang berhasil di-decode";
        return result;
    }
    result.windowsUsed = windowsUsed;

    // ---------- Cutoff + level ----------
    result.measuredCutoffHz = findCutoffHz(
        maxMagnitudes, static_cast<double>(inputRate), kFftSize);
    result.peakDbfs = dbfs(peakLinear);
    result.rmsDbfs =
        sampleCount > 0
            ? dbfs(std::sqrt(sumSquares / static_cast<double>(sampleCount)))
            : -120.0;
    result.lsbZeroRatio16 = lsbZeroRatio16(leftSamples);

    // Cutoff 0 = spektrum terlalu senyap untuk dinilai (findCutoffHz
    // mengembalikan 0 kalau puncak di bawah kMinPeakMagnitude). Itu bukan
    // "tidak ada konten" — itu "tidak bisa dinilai". Laporkan sebagai error
    // supaya pemanggil tidak menampilkan 0 Hz sebagai fakta.
    if (result.measuredCutoffHz <= 0.0) {
        result.error = "sinyal terlalu senyap untuk mengukur cutoff";
        return result;
    }

    result.ok = true;
    return result;
}

} // namespace pristine::analyzer
