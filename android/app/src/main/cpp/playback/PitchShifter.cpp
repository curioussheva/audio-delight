// PitchShifter.cpp
//
// Phase vocoder pitch shift, dua tahap (Fase R, 2026-11-11). Lihat
// PitchShifter.h untuk desain + sifat yang dijamin.
// Harness: scripts/test_pitch_shifter.cpp
#include "PitchShifter.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace pristine::playback {

namespace {
constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;
}  // namespace

PitchShifter::PitchShifter()
    : hann_(kWindowFrames),
      prevPhase_(kHalfBins + 1, 0.0f),
      synthPhaseL_(kHalfBins + 1, 0.0f),
      synthPhaseR_(kHalfBins + 1, 0.0f),
      inL_(kWindowFrames),
      inR_(kWindowFrames),
      specL_(kWindowFrames),
      specR_(kWindowFrames),
      synL_(kWindowFrames),
      synR_(kWindowFrames),
      outL_(kWindowFrames),
      outR_(kWindowFrames) {
    // Hann periodik: w[n] = 0.5 - 0.5*cos(2*pi*n/N).
    for (int32_t n = 0; n < kWindowFrames; ++n) {
        hann_[n] = 0.5f - 0.5f * std::cos(kTwoPi * static_cast<float>(n) /
                                         static_cast<float>(kWindowFrames));
    }
}

float PitchShifter::wrapPi(float angle) noexcept {
    float a = std::fmod(angle + kPi, kTwoPi);
    if (a < 0.0f) a += kTwoPi;
    return a - kPi;
}

float PitchShifter::cubic(float x0, float x1, float x2, float x3,
                          float t) noexcept {
    // Catmull-Rom: di t=0 persis x1, di t=1 persis x2.
    const float t2 = t * t;
    const float t3 = t2 * t;
    return 0.5f * ((2.0f * x1) + (-x0 + x2) * t +
                   (2.0f * x0 - 5.0f * x1 + 4.0f * x2 - x3) * t2 +
                   (-x0 + 3.0f * x1 - 3.0f * x2 + x3) * t3);
}

void PitchShifter::setRatio(float ratio) noexcept {
    if (!std::isfinite(ratio) || ratio < 0.5f || ratio > 2.0f) return;
    if (ratio == ratio_) return;
    ratio_ = ratio;
    // Arah (jangan dibalik — sudah terbukti harness): stretch sebesar S
    // (durasi xS, pitch tetap) lalu resample step S (durasi /S, pitch xS).
    // Dulu 1/S dua-duanya: hasilnya pitch 1/S (440 -> 448, oktaf malah turun).
    stretchRatio_ = ratio;
    resampleStep_ = ratio;
    reset();
}

void PitchShifter::reset() noexcept {
    input_.clear();
    stretchOut_.clear();
    synthPos_ = 0.0;
    stretchOutReadPos_ = 0;
    resampleIn_.clear();
    resamplePos_ = 0.0;
    output_.clear();
    outputReadPos_ = 0;
    std::fill(prevPhase_.begin(), prevPhase_.end(), 0.0f);
    std::fill(synthPhaseL_.begin(), synthPhaseL_.end(), 0.0f);
    std::fill(synthPhaseR_.begin(), synthPhaseR_.end(), 0.0f);
    hasPrevious_ = false;
}

void PitchShifter::push(const float* input, size_t frames,
                        uint32_t channels) noexcept {
    if (!input || frames == 0 || channels == 0) return;
    if (channels != channels_) {
        // Channel berubah (tidak terjadi di praktik — selalu stereo dari
        // AudioCallback) -> buang state lama daripada mencampur layout.
        reset();
        channels_ = channels;
    }
    input_.insert(input_.end(), input, input + frames * channels);
    while (input_.size() / channels_ >=
           static_cast<size_t>(kWindowFrames)) {
        if (!processStretchHop()) break;
    }
    feedResampler();
}

size_t PitchShifter::pull(float* output, size_t frames,
                          uint32_t channels) noexcept {
    if (!output || frames == 0 || channels == 0 || channels != channels_) {
        return 0;
    }
    const size_t available =
        (output_.size() / channels_ > outputReadPos_)
            ? output_.size() / channels_ - outputReadPos_
            : 0;
    const size_t n = std::min(frames, available);
    if (n > 0) {
        std::memcpy(output, output_.data() + outputReadPos_ * channels,
                    n * channels * sizeof(float));
        outputReadPos_ += n;
    }
    // Kompaksi: buang prefix yang sudah ditarik supaya output_ tidak
    // tumbuh tanpa batas. Hanya saat sudah terkumpul cukup (sekali per
    // beberapa detik) — erase per pull terlalu mahal.
    if (outputReadPos_ >= 4096) {
        if (outputReadPos_ * channels_ >= output_.size()) {
            output_.clear();
            outputReadPos_ = 0;
        } else {
            output_.erase(output_.begin(),
                          output_.begin() + static_cast<std::ptrdiff_t>(
                                                outputReadPos_ * channels_));
            outputReadPos_ = 0;
        }
    }
    return n;
}

bool PitchShifter::processStretchHop() noexcept {
    const uint32_t ch = channels_;
    if (ch == 0 || input_.size() / ch < static_cast<size_t>(kWindowFrames)) {
        return false;
    }

    // --- Analisis: windowed L/R -> FFT. Mix mono didapat dari rata-rata
    // spektrum (STFT linear: FFT((L+R)/2) == (FFT(L)+FFT(R))/2), jadi cukup
    // 2 FFT maju, bukan 3.
    for (int32_t n = 0; n < kWindowFrames; ++n) {
        const float w = hann_[n];
        inL_[n] = input_[static_cast<size_t>(n) * ch] * w;
        inR_[n] = (ch == 2)
                      ? input_[static_cast<size_t>(n) * ch + 1] * w
                      : inL_[n];
    }
    plan_.forward(inL_.data(), specL_.data());
    plan_.forward(inR_.data(), specR_.data());

    // --- Phase vocoder time-stretch sebesar R = 1/S (Dolson).
    // Fase sintesis maju R * (advance_harapan + deviasi) per hop; hop
    // sintesis = R * hop analisis (fraksional). Pitch TIDAK berubah di
    // tahap ini — yang berubah hanya durasi (tahap 2 yang menggeser pitch).
    const float hopSynth = static_cast<float>(kHopFrames) * stretchRatio_;
    for (int32_t k = 0; k <= kHalfBins; ++k) {
        const float magL = std::abs(specL_[k]);
        const float magR = std::abs(specR_[k]);
        if (k == 0 || k == kHalfBins) {
            // Bin DC + Nyquist: real — magnitudo saja, tanpa fase.
            synL_[k] = Complex(magL, 0.0f);
            synR_[k] = Complex(magR, 0.0f);
            prevPhase_[k] = 0.0f;
            continue;
        }
        // Deviasi dari mix mono = fase rata-rata spektrum L/R (STFT linear).
        const Complex mono = (specL_[k] + specR_[k]) * 0.5f;
        const float phase = std::arg(mono);
        if (!hasPrevious_) {
            // Hop pertama: belum ada acuan — sintesis = frame ini apa adanya,
            // tiap channel mulai dari fasenya sendiri (beda fase = delay
            // stereo dipertahankan).
            prevPhase_[k] = phase;
            synthPhaseL_[k] = std::arg(specL_[k]);
            synthPhaseR_[k] = std::arg(specR_[k]);
        } else {
            const float expected = kTwoPi *
                                   static_cast<float>(kHopFrames) *
                                   static_cast<float>(k) /
                                   static_cast<float>(kWindowFrames);
            const float delta = wrapPi(phase - prevPhase_[k] - expected);
            const float trueAdvance = expected + delta;
            // Kenaikan SAMA untuk kedua channel — beda fase (delay stereo)
            // konstan sepanjang lagu, tidak hanyut.
            const float advance = stretchRatio_ * trueAdvance;
            synthPhaseL_[k] = wrapPi(synthPhaseL_[k] + advance);
            synthPhaseR_[k] = wrapPi(synthPhaseR_[k] + advance);
            prevPhase_[k] = phase;
        }
        synL_[k] = std::polar(magL, synthPhaseL_[k]);
        synR_[k] = std::polar(magR, synthPhaseR_[k]);
    }
    // Simetri konjugat untuk IFFT -> output real.
    for (int32_t k = kHalfBins + 1; k < kWindowFrames; ++k) {
        synL_[k] = std::conj(synL_[kWindowFrames - k]);
        synR_[k] = std::conj(synR_[kWindowFrames - k]);
    }
    hasPrevious_ = true;

    plan_.inverse(synL_.data(), outL_.data());
    plan_.inverse(synR_.data(), outR_.data());

    // --- Overlap-add ke stretchOut_ (skala tetap).
    // Posisi sintesis fraksional (dibulatkan) — hop sintesis umumnya bukan
    // bilangan bulat (mis. 512*0.9818 = 502.7). Skala = 8*Hs/(3*N) =
    // kebalikan rata-rata jumlah Hann^2 pada hop Hs (eksak di steady
    // state; di tepi aliran output cukup ter-taper mengikuti jendela).
    // JANGAN bagi per-sampel oleh norm: di tepi jendela norm ~0 sementara
    // IFFT hasil modifikasi fase tidak nol -> meledak (T5: maxAbs 114).
    const float olaScale =
        8.0f * hopSynth / (3.0f * static_cast<float>(kWindowFrames));
    const size_t base = static_cast<size_t>(synthPos_ + 0.5);
    const size_t need = (base + kWindowFrames) * ch;
    if (stretchOut_.size() < need) stretchOut_.resize(need, 0.0f);
    for (int32_t n = 0; n < kWindowFrames; ++n) {
        const float w = hann_[n] * olaScale;
        const size_t idx = (base + n) * ch;
        stretchOut_[idx] += outL_[n] * w;
        if (ch == 2) stretchOut_[idx + 1] += outR_[n] * w;
    }

    // Geser input sebesar hop analisis; posisi sintesis maju sebesar hop
    // sintesis (fraksional).
    input_.erase(input_.begin(),
                 input_.begin() + static_cast<std::ptrdiff_t>(
                                      kHopFrames * static_cast<int32_t>(ch)));
    synthPos_ += hopSynth;
    return true;
}

void PitchShifter::feedResampler() noexcept {
    const uint32_t ch = channels_;
    if (ch == 0) return;

    // Pindahkan frame stretch yang sudah final (posisinya < base hop
    // terakhir — hop berikut mulai di >= synthPos_, jadi tidak lagi
    // menyentuh daerah itu) ke resampleIn_ (sudah ternormalisasi oleh
    // skala OLA tetap di processStretchHop).
    const double hopSynth =
        static_cast<double>(kHopFrames) * stretchRatio_;
    const size_t safeFrames =
        (synthPos_ > hopSynth)
            ? static_cast<size_t>(synthPos_ - hopSynth)
            : 0;
    if (safeFrames > stretchOutReadPos_) {
        const size_t n = safeFrames - stretchOutReadPos_;
        const size_t oldSize = resampleIn_.size() / ch;
        resampleIn_.resize((oldSize + n) * ch);
        std::memcpy(resampleIn_.data() + oldSize * ch,
                    stretchOut_.data() + stretchOutReadPos_ * ch,
                    n * ch * sizeof(float));
        stretchOutReadPos_ = safeFrames;
    }

    // Kompaksi stretchOut_ (prefix yang sudah di-resample).
    if (stretchOutReadPos_ >= 8192) {
        stretchOut_.erase(
            stretchOut_.begin(),
            stretchOut_.begin() +
                static_cast<std::ptrdiff_t>(stretchOutReadPos_ * ch));
        synthPos_ -= static_cast<double>(stretchOutReadPos_);
        stretchOutReadPos_ = 0;
    }

    // Resample kubik: tiap frame output maju resampleStep_ (= S) frame
    // input — output = input / S frame (pitch xS). Butuh x[i+2] tersedia —
    // berhenti 2 frame sebelum ujung.
    const size_t availFrames = resampleIn_.size() / ch;
    while (resamplePos_ + 2.0 < static_cast<double>(availFrames)) {
        const size_t i = static_cast<size_t>(resamplePos_);
        const float t = static_cast<float>(resamplePos_ - i);
        for (uint32_t c = 0; c < ch; ++c) {
            const auto at = [&](size_t f) -> float {
                if (f >= availFrames) f = availFrames - 1;
                return resampleIn_[f * ch + c];
            };
            const float x0 = (i == 0) ? at(0) : at(i - 1);
            output_.push_back(
                cubic(x0, at(i), at(i + 1), at(i + 2), t));
        }
        resamplePos_ += resampleStep_;
    }

    // Kompaksi resampleIn_: buang prefix yang sudah dilewati (sisakan 2
    // frame riwayat untuk interpolasi kubik).
    const size_t consumed = static_cast<size_t>(resamplePos_);
    if (consumed >= 8192) {
        const size_t eraseFrames = consumed - 2;
        resampleIn_.erase(
            resampleIn_.begin(),
            resampleIn_.begin() +
                static_cast<std::ptrdiff_t>(eraseFrames * ch));
        resamplePos_ -= static_cast<double>(eraseFrames);
    }
}

}  // namespace pristine::playback
