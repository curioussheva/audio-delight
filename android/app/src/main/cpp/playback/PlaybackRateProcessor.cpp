// PlaybackRateProcessor.cpp
//
// WSOLA time-stretch (P-M9, 2026-11-10). Lihat header untuk desain.
#include "PlaybackRateProcessor.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

namespace pristine::playback {

PlaybackRateProcessor::PlaybackRateProcessor() {
    // PB6-W2B: pre-alokasi buffer streaming (kapasitas di header).
    // hann_ di bawah SUDAH pre-alloc sejak awal — bukan duplikasi.
    input_.reserve(kInputCapacity);
    mono_.reserve(kMonoCapacity);
    output_.reserve(kOutputCapacity);
    // Hann periodik (penyebut W, bukan W-1): dengan hop W/2 jumlah jendela
    // yang tumpang tindih = 1.0 persis (COLA) — tidak ada modulasi amplitudo.
    hann_.resize(kWindowFrames);
    constexpr float kTwoPi = 6.28318530717958647692f;
    for (uint32_t i = 0; i < kWindowFrames; ++i) {
        hann_[i] = 0.5f * (1.0f - std::cos(kTwoPi * static_cast<float>(i) /
                                           static_cast<float>(kWindowFrames)));
    }
}

void PlaybackRateProcessor::setRate(float rate) noexcept {
    if (!std::isfinite(rate) || rate < 0.5f || rate > 2.0f) return;
    if (rate == rate_) return;
    rate_ = rate;
    reset();
}

void PlaybackRateProcessor::reset() noexcept {
    input_.clear();
    mono_.clear();
    output_.clear();
    synthesisPos_ = 0;
    outputReadPos_ = 0;
    advanceFrac_ = 0.0;
    hasPrevious_ = false;
}

void PlaybackRateProcessor::push(const float* input, size_t frames,
                                 uint32_t channels) noexcept {
    if (!input || frames == 0 || channels == 0) return;
    if (channels != channels_) {
        // Channel berubah (tidak terjadi di praktik — selalu stereo dari
        // AudioCallback) → buang state lama daripada mencampur layout.
        reset();
        channels_ = channels;
    }
    const size_t oldFrames = input_.size() / channels_;
    input_.insert(input_.end(), input, input + frames * channels);
    mono_.reserve(oldFrames + frames);
    for (size_t f = 0; f < frames; ++f) {
        float mix = 0.0f;
        for (uint32_t c = 0; c < channels; ++c) {
            mix += input[f * channels + c];
        }
        mono_.push_back(mix);
    }
    processAvailable();
}

size_t PlaybackRateProcessor::pull(float* output, size_t frames,
                                   uint32_t channels) noexcept {
    if (!output || frames == 0 || channels == 0 || channels != channels_) {
        return 0;
    }
    const size_t available =
        (synthesisPos_ > outputReadPos_) ? synthesisPos_ - outputReadPos_ : 0;
    const size_t n = std::min(frames, available);
    if (n > 0) {
        std::memcpy(output, output_.data() + outputReadPos_ * channels,
                    n * channels * sizeof(float));
        outputReadPos_ += n;
    }
    // Kompaksi sesekali supaya vector tidak menahan prefix yang sudah
    // ditarik selamanya. Ekor parsial [synthesisPos_, synthesisPos_+W-Hs)
    // ikut terjaga (indeksnya > outputReadPos_).
    if (outputReadPos_ >= 8192) {
        output_.erase(output_.begin(),
                      output_.begin() + static_cast<std::ptrdiff_t>(
                                            outputReadPos_ * channels));
        synthesisPos_ -= outputReadPos_;
        outputReadPos_ = 0;
    }
    return n;
}

void PlaybackRateProcessor::processAvailable() noexcept {
    const uint32_t ch = channels_;
    if (ch == 0) return;
    for (;;) {
        const size_t inFrames = input_.size() / ch;
        if (inFrames < kWindowFrames) return;

        if (!hasPrevious_) {
            // Window pertama: tanpa pencarian (belum ada ekor pembanding).
            placeWindow(0);
            hasPrevious_ = true;
            continue;
        }

        // Hop analisis nominal (fraksional, supaya rata-rata jangka panjang
        // tepat = 512 * rate walaupun dibulatkan per langkah). Rate 2x =
        // konsumsi input 2x lebih cepat dari output (durasi output setengah
        // input); rate 0.5x = sebaliknya. JANGAN dibalik: hop = Hs * rate,
        // bukan Hs / rate (bug awal: laju terbalik + bias korelasi, terbukti
        // test_rate_processor 2026-11-10).
        advanceFrac_ += static_cast<double>(kHopFrames) *
                        static_cast<double>(rate_);
        const size_t nominal = static_cast<size_t>(advanceFrac_);
        advanceFrac_ -= static_cast<double>(nominal);

        // Rentang pencarian offset di sekitar nominal. Kalau input belum
        // cukup untuk kandidat terjauh, persempit — kalau bahkan advance
        // NOMINAL tidak muat, tunggu push() berikutnya. Tanpa ini,
        // pencarian terpaksa memilih offset kecil (maxStart kecil) dan
        // window itu menambah 512 frame output dengan hampir tanpa konsumsi
        // input — durasi output menggelembung (terbukti: 0.5x jadi 2.64x,
        // 1.0x jadi 1.06x, karena best berkala jatuh ke 13–80 saat input
        // menipis). FIFO output menahan ~1 jendela, jadi menunggu satu
        // push lagi tidak terdengar.
        const size_t maxStart = inFrames - kWindowFrames;
        if (maxStart < nominal) return;
        const size_t lo =
            (nominal > kToleranceFrames) ? nominal - kToleranceFrames : 0;
        size_t hi = nominal + kToleranceFrames;
        if (hi > maxStart) hi = maxStart;

        // Pilih offset: korelasi tertinggi, TAPI di antara kandidat yang
        // korelasinya ≥95% dari maksimum, pilih yang paling dekat dengan
        // nominal. Tanpa aturan ini, sinyal periodik (sine murni) membuat
        // semua offset sefase punya korelasi nyaris sama dan pencarian
        // memilih sembarang — advance rata-rata meleset dari nominal dan
        // laju output ikut meleset (terbukti: 1.0x jadi 1.27x di test).
        float bestScore = -std::numeric_limits<float>::infinity();
        for (size_t c = lo; c <= hi; ++c) {
            const float score = correlationAt(c);
            if (score > bestScore) bestScore = score;
        }
        size_t best = nominal;
        if (best < lo) best = lo;
        if (best > hi) best = hi;
        if (bestScore > 0.0f) {
            const float threshold = bestScore * 0.95f;
            size_t bestDist = std::numeric_limits<size_t>::max();
            for (size_t c = lo; c <= hi; ++c) {
                if (correlationAt(c) < threshold) continue;
                const size_t dist = (c > nominal) ? c - nominal : nominal - c;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = c;
                }
            }
            // Kalau korelasi di offset nominal sudah cukup baik (≥80% dari
            // maks), pakai nominal persis — laju jadi tepat. Penting untuk
            // musik nyata yang korelasinya tidak setajam sine murni (di sana
            // offset nominal biasanya sudah hampir sebaik maksimum). Sine
            // murni tidak lolos (korelasi nominal negatif) dan tetap memakai
            // offset sefase di atas.
            if (nominal >= lo && nominal <= hi &&
                correlationAt(nominal) >= bestScore * 0.8f) {
                best = nominal;
            }
        }
        // Jaminan progres: offset 0 berarti window yang sama ditempatkan
        // ulang tanpa mengonsumsi input → loop tak berujung. Paksa maju ke
        // nominal (atau 1 kalau input hanya pas satu jendela — tunggu push
        // berikutnya kalau bahkan itu tidak muat).
        if (best == 0) {
            if (maxStart == 0) return;
            best = std::min(nominal, maxStart);
        }
        placeWindow(best);
        compactInput(best);
    }
}

void PlaybackRateProcessor::placeWindow(size_t start) noexcept {
    const uint32_t ch = channels_;
    const size_t need = (synthesisPos_ + kWindowFrames) * ch;
    if (output_.size() < need) output_.resize(need, 0.0f);
    for (size_t i = 0; i < kWindowFrames; ++i) {
        const float w = hann_[i];
        for (uint32_t c = 0; c < ch; ++c) {
            output_[(synthesisPos_ + i) * ch + c] +=
                input_[(start + i) * ch + c] * w;
        }
    }
    synthesisPos_ += kHopFrames;
}

void PlaybackRateProcessor::compactInput(size_t frames) noexcept {
    if (frames == 0) return;
    const uint32_t ch = channels_;
    input_.erase(input_.begin(),
                 input_.begin() + static_cast<std::ptrdiff_t>(frames * ch));
    mono_.erase(mono_.begin(),
                mono_.begin() + static_cast<std::ptrdiff_t>(frames));
}

float PlaybackRateProcessor::correlationAt(size_t candidate) const noexcept {
    // Bandingkan ekor window sebelumnya [Hs, W) dengan kepala kandidat
    // [candidate, candidate + W - Hs) pada mix mono. Window sebelumnya
    // selalu mulai di indeks 0 (compactInput menggesernya ke sana).
    const size_t overlap = kWindowFrames - kHopFrames;
    float sum = 0.0f;
    for (size_t k = 0; k < overlap; ++k) {
        sum += mono_[kHopFrames + k] * mono_[candidate + k];
    }
    return sum;
}

}  // namespace pristine::playback
