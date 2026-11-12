// PlaybackRateProcessor.h
//
// WSOLA time-stretch tanpa perubahan pitch (P-M9, 2026-11-10).
//
// Masalah yang diperbaiki: kontrol kecepatan 0.5x–2.0x di UI hanya menulis
// Zustand + AsyncStorage; tidak ada satupun jalur ke native, jadi kecepatan
// adalah placebo sampai render(). Prosesor ini adalah jalurnya.
//
// Algoritma: WSOLA (Waveform Similarity Overlap-Add) — jendela Hann 1024
// frame, hop sintesis 512, hop analisis = 512 * rate, pencarian offset
// ±256 frame dengan cross-correlation pada mix mono (L+R) supaya transien
// tidak patah. Rate 1.0 = bypass — controller TIDAK memanggil prosesor sama
// sekali, jadi jalur bit-perfect tidak tersentuh.
//
// Streaming: push() didorong dari render() tiap callback, pull() menarik
// frame output. Latensi awal ~1 jendela (21 ms @48 kHz) — tertutup fade-in
// 300 ms. Threading: HANYA audio thread (render) yang memanggil
// push/pull; reset() dari loadTrack/seek/stop dilindungi clearing_ +
// waitForRenderIdle (pola yang sama dengan FadeEngine).
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace pristine::playback {

class PlaybackRateProcessor {
public:
    PlaybackRateProcessor();

    // Laju target (0.5..2.0). Nilai di luar rentang atau non-finite
    // diabaikan. Perubahan laju me-reset buffer (audio lama tidak boleh
    // keluar lagi sebagai glitch).
    void setRate(float rate) noexcept;
    [[nodiscard]] float rate() const noexcept { return rate_; }

    // Dorong frame input (interleaved) ke prosesor. Dipanggil dari render().
    void push(const float* input, size_t frames, uint32_t channels) noexcept;
    // Tarik frame output (interleaved). Mengembalikan jumlah frame yang
    // benar-benar dihasilkan (bisa kurang kalau input belum cukup).
    [[nodiscard]] size_t pull(float* output, size_t frames,
                              uint32_t channels) noexcept;

    void reset() noexcept;

private:
    static constexpr uint32_t kWindowFrames = 1024;    // ~21 ms @48 kHz
    static constexpr uint32_t kHopFrames = 512;        // W/2 (COLA Hann)
    static constexpr uint32_t kToleranceFrames = 256;  // W/4

    // PB6-W2B (2026-11-12): kapasitas pre-alokasi buffer streaming
    // (reserve di ctor — ctor bukan audio thread) supaya push()/pull() di
    // audio thread (noexcept) tidak pernah menumbuhkan vector (bad_alloc
    // di noexcept = terminate). clear() di reset() mempertahankan
    // kapasitas, jadi reserve sekali di sini cukup seumur prosesor.
    // Envelope: callback ≤ 3840 frame (burst maks Oboe @192 kHz, C-C2 di
    // AudioCallback.cpp), stereo, laju 0.5..2.0 — push ≤ 3872 frame
    // (render() meng-guard inputSamples ≤ 7744). Turunan (frame):
    // input_/mono_ ≤ 2048 sisa + 3872 push = 5920; output_ ≤ readPos
    // 12032 + ~5888 tersedia + 1024 ekor jendela ≈ 18944. Angka reserve
    // (float) dibulatkan ke atas dengan headroom; di luar envelope vector
    // masih bisa tumbuh — sama seperti sebelum fix, tidak lebih buruk.
    static constexpr size_t kInputCapacity = 16384;   // 8192 frame stereo
    static constexpr size_t kMonoCapacity = 8192;     // 8192 frame
    static constexpr size_t kOutputCapacity = 49152;  // 24576 frame stereo

    void processAvailable() noexcept;
    void placeWindow(size_t start) noexcept;
    void compactInput(size_t frames) noexcept;
    [[nodiscard]] float correlationAt(size_t candidate) const noexcept;

    float rate_ = 1.0f;
    uint32_t channels_ = 0;

    std::vector<float> hann_;   // jendela Hann periodik, kWindowFrames
    std::vector<float> input_;  // input belum dikonsumsi (interleaved)
    std::vector<float> mono_;   // mix mono (L+R) per frame, paralel input_
    std::vector<float> output_; // output sudah disintesis (interleaved)
    size_t synthesisPos_ = 0;   // frame output berikutnya untuk window baru
    size_t outputReadPos_ = 0;  // frame output yang sudah ditarik
    double advanceFrac_ = 0.0;  // akumulator hop analisis fraksional
    bool hasPrevious_ = false;  // sudah ada window sebelumnya?
};

}  // namespace pristine::playback
