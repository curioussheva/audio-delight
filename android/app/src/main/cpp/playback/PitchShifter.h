// PitchShifter.h
//
// Phase vocoder pitch shift — ubah pitch TANPA mengubah tempo (Fase R,
// 2026-11-11). Lawan dari WSOLA (PlaybackRateProcessor): WSOLA ubah tempo
// tanpa pitch; ini ubah pitch tanpa tempo. Keduanya kontrol ortogonal yang
// independen (speed × retune bisa jalan bareng).
//
// Arsitektur (dua tahap — ini yang BENAR; satu tahap "skala advance fase
// dengan hop sama" TIDAK menggeser pitch, hanya mengacaukan koherensi
// antar-frame — terbukti harness: rasio 1.0 keluar 447 Hz, rasio 2.0
// keluar 423 Hz):
//   1. Time-stretch phase vocoder (Dolson) sebesar R = S: STFT Hann 2048,
//      hop analisis 512, hop sintesis 512*S (fraksional, akumulator),
//      fase sintesis maju S * (advance_harapan + deviasi). Pitch tidak
//      berubah, durasi jadi S kali.
//   2. Resampler kubik (Catmull-Rom) step S: durasi kembali 1 kali,
//      pitch jadi S kali. Untuk S di sekitar 1 (±100 sen) interpolasi kubik
//      sudah transparan (imaging ~-40 dB).
//   Net: frame masuk = frame keluar (frame-count preserving) -> clock posisi
//   (hitung frame INPUT) + kontrol speed tidak terganggu.
//
// Detail:
//   - Deviasi fase (estimasi frekuensi) DIBAGI dari mix mono (L+R)/2 —
//     kokoh untuk konten stereo berkorelasi — tapi fase sintesisnya
//     PER-CHANNEL (masing-masing mulai dari fase channel-nya sendiri, maju
//     dengan kenaikan yang sama): beda fase antar-channel dipertahankan,
//     jadi delay stereo (citra) tidak hanyut. Berbagi satu fase sintesis
//     untuk kedua channel justru MENGHAPUS delay (terbukti harness T6).
//   - DC + Nyquist diperlakukan sebagai real (magnitudo saja, tanpa fase).
//   - Normalisasi OLA skala tetap = 8*Hs/(3*N) (rata-rata jumlah Hann^2
//     pada hop sintesis Hs — eksak di steady state, benar untuk hop berapa
//     pun). Bukan pembagian per-sampel oleh norm: di tepi jendela norm ~0
//     sementara IFFT hasil modifikasi fase tidak nol -> pembagian meledak
//     (terbukti harness T5: noise maxAbs 114).
//   - ratio 1.0 = bypass (controller TIDAK memanggil prosesor sama sekali,
//     seperti WSOLA — jalur bit-perfect tidak tersentuh).
//   - latensi awal ~1,5 jendela (~48 ms @48 kHz) — tertutup fade-in 300 ms,
//     sama seperti WSOLA (21 ms).
//   - Ekor track: sisa input < 1 jendela tidak diproses (maks ~43 ms,
//     di dalam fade-out 300 ms — sama seperti WSOLA).
//
// Threading: HANYA audio thread (render) yang memanggil push/pull; reset()
// dari loadTrack/seek/stop dilindungi clearing_ + waitForRenderIdle (pola
// yang sama dengan PlaybackRateProcessor). setRatio() me-reset buffer bila
// rasio berubah — perubahan rasio efektif paling lambat satu callback.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "../fft/FFTPlan.h"

namespace pristine::playback {

class PitchShifter {
public:
    PitchShifter();

    // Rasio pitch (1.0 = A=440 standar, 432/440 = 0.98182 = A=432 Verdi).
    // Rentang 0.5..2.0 (±1 oktaf). Nilai di luar rentang atau non-finite
    // diabaikan. Perubahan rasio me-reset buffer (audio lama tidak boleh
    // keluar lagi sebagai glitch).
    void setRatio(float ratio) noexcept;
    [[nodiscard]] float ratio() const noexcept { return ratio_; }

    // Dorong frame input (interleaved) ke prosesor. Dipanggil dari render().
    void push(const float* input, size_t frames, uint32_t channels) noexcept;
    // Tarik frame output (interleaved). Mengembalikan jumlah frame yang
    // benar-benar dihasilkan (bisa kurang kalau input belum cukup — latensi
    // awal ~1,5 jendela; render() mengisi sisanya dengan senyap).
    [[nodiscard]] size_t pull(float* output, size_t frames,
                              uint32_t channels) noexcept;

    void reset() noexcept;

private:
    static constexpr int32_t kWindowFrames = 2048;  // ~43 ms @48 kHz
    static constexpr int32_t kHopFrames = 512;      // hop analisis
    static constexpr int32_t kHalfBins = kWindowFrames / 2;

    // PB6-W2B (2026-11-12): kapasitas pre-alokasi buffer streaming
    // (reserve di ctor — ctor bukan audio thread) supaya push()/
    // feedResampler()/pull() di audio thread (noexcept) tidak pernah
    // menumbuhkan vector (bad_alloc di noexcept = terminate). clear() di
    // reset() mempertahankan kapasitas, jadi reserve sekali di sini cukup
    // seumur prosesor. Envelope: callback ≤ 3840 frame (burst maks Oboe
    // @192 kHz, C-C2 di AudioCallback.cpp — pitch path TIDAK di-guard
    // render() seperti rate path, jadi dihitung dari push mentah),
    // stereo, rasio 0.5..2.0. Turunan (frame): input_ ≤ 2048 sisa + 3840
    // push = 5888; stretchOut_ ≤ readPos 15872 + ~1024 belum pindah +
    // 7680 hop callback ini + 2048 ekor ≈ 26624; resampleIn_ ≤ 15872
    // terkonsumsi + ~4 sisa; output_ ≤ readPos 7936 + ~3840 tersedia.
    // Angka reserve (float) dibulatkan ke atas dengan headroom; di luar
    // envelope vector masih bisa tumbuh — sama seperti sebelum fix, tidak
    // lebih buruk. Buffer kerja per hop (inL_/specL_/synL_/outL_/...) SUDAH
    // pre-alloc di init list ctor — yang di-reserve di sini hanya vector
    // streaming, jangan duplikasi yang sudah ada.
    static constexpr size_t kInputCapacity = 16384;       // 8192 frame stereo
    static constexpr size_t kStretchOutCapacity = 65536;  // 32768 frame stereo
    static constexpr size_t kResampleInCapacity = 49152;  // 24576 frame stereo
    static constexpr size_t kOutputCapacity = 32768;      // 16384 frame stereo

    // Satu hop time-stretch: N frame input -> hop sintesis (fraksional)
    // frame output (overlap-add + norm). Mengembalikan true kalau diproses.
    bool processStretchHop() noexcept;
    // Pindahkan frame stretch yang sudah siap ke resampler + hasilkan
    // output akhir (kubik) ke output_.
    void feedResampler() noexcept;
    // Interpolasi kubik Catmull-Rom pada t in [0,1).
    static float cubic(float x0, float x1, float x2, float x3,
                       float t) noexcept;
    // Bungkus sudut ke [-pi, pi].
    static float wrapPi(float angle) noexcept;

    float ratio_ = 1.0f;         // S (pitch)
    float stretchRatio_ = 1.0f;  // R = 1/S (time-stretch)
    float resampleStep_ = 1.0f;  // 1/S frame input per frame output
    uint32_t channels_ = 0;

    FFTPlan plan_{kWindowFrames};
    std::vector<float> hann_;  // jendela Hann periodik, kWindowFrames

    std::vector<float> input_;  // input mentah belum dikonsumsi (interleaved)

    // Tahap 1 (stretch): OLA mentah.
    std::vector<float> stretchOut_;   // interleaved, jumlah OLA
    double synthPos_ = 0.0;           // posisi OLA berikutnya (fraksional)
    size_t stretchOutReadPos_ = 0;    // frame stretch yang sudah di-resample

    // Tahap 2 (resample kubik): frame stretch ternormalisasi.
    std::vector<float> resampleIn_;  // interleaved
    double resamplePos_ = 0.0;       // posisi baca (fraksional, frame)

    std::vector<float> output_;  // output akhir (interleaved)
    size_t outputReadPos_ = 0;   // frame output yang sudah ditarik

    // State phase vocoder (per bin 0..N/2).
    std::vector<float> prevPhase_;    // fase analisis hop sebelumnya (mono)
    std::vector<float> synthPhaseL_;  // fase sintesis berjalan, channel L
    std::vector<float> synthPhaseR_;  // fase sintesis berjalan, channel R
    bool hasPrevious_ = false;        // sudah ada hop sebelumnya?

    // Buffer kerja per hop (dialokasi sekali di konstruktor — tanpa alokasi
    // di jalur audio).
    std::vector<float> inL_, inR_;          // frame analisis (windowed)
    std::vector<Complex> specL_, specR_;    // spektrum L/R (N bin)
    std::vector<Complex> synL_, synR_;      // spektrum sintesis (N bin)
    std::vector<float> outL_, outR_;        // IFFT output (N sampel)
};

}  // namespace pristine::playback
