// =====================================================
// core/AudioPipeline.cpp
// =====================================================

#include "AudioPipeline.h"

#include "PanLaw.h"

#include <algorithm>
#include <cmath>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioPipeline::AudioPipeline() = default;

// =====================================================
// PREPARE
// =====================================================

void AudioPipeline::prepare(
    int32_t sampleRate,
    int32_t maxFrames
) {

    // (mSampleRate/mMaxFrames dihapus 2026-11-10: hanya ditulis, tidak
    // pernah dibaca. Parameter langsung diteruskan ke bawah.)
    //
    // (C-MODESW, 2026-11-12): mSampleRate disimpan lagi — durasi fade-in
    // ganti mode dihitung darinya (lihat onModeChanged). mMaxFrames tetap
    // tidak disimpan: tidak ada pemakai.
    mSampleRate = sampleRate;

    // (C-MODESW): prepare() membangun ulang graph DSP (node BARU dengan
    // state default), jadi tidak ada mode "sebelumnya" yang perlu
    // dibandingkan — buffer pertama sesudah prepare() hanya mencatat mode,
    // tanpa reset dan tanpa fade (lihat mModeSeen).
    mModeSeen = false;
    mFadeFramesRemaining = 0;
    mFadeFramesTotal = 0;

    // 🔥 FIX (2026-11-11, DSP-M1): prepare() membangun ulang graph DSP
    // (DSPChain::prepare -> buildGraph: 5 node BARU dengan state default),
    // jadi config yang sudah diterapkan ke node lama HILANG. Guard dedup
    // applyDSPConfig() membandingkan config baru dengan mAppliedConfig yang
    // masih sama -> return dini, config tidak pernah dikirim ulang ke node
    // baru. Akibatnya tiap reopen stream (mode toggle, cabut/colok device,
    // ganti laju) diam-diam mematikan EQ/koreksi headphone sampai user
    // mengubah sesuatu. Reset guard di sini supaya applyDSPConfig berikutnya
    // (buffer pertama sesudah reopen) menerapkan ulang config ke node baru.
    mConfigApplied = false;

    mDSP.prepare(
        sampleRate,
        maxFrames
    );

    // Immersive ikut disiapkan di sini, bukan saat mode dipilih: perpindahan
    // mode harus bisa terjadi live, dan menyiapkan rantai resonan di audio
    // thread saat user menekan tombol berarti alokasi + perhitungan koefisien
    // di jalur realtime.
    mImmersive.prepare(sampleRate);
}

// =====================================================
// RESET
// =====================================================

void AudioPipeline::reset() {

    mDSP.reset();

    mImmersive.reset();

    // (C-MODESW): state rantai baru dibersihkan, jadi tidak ada mode
    // "sebelumnya" yang perlu dibandingkan — sama seperti prepare():
    // buffer pertama sesudah reset() hanya mencatat mode, tanpa reset
    // ulang dan tanpa fade. Tanpa ini, play pertama sesudah stop()
    // (AudioEngine::stop -> reset()) akan fade-in 8 ms di awal lagu.
    mModeSeen = false;
    mFadeFramesRemaining = 0;
    mFadeFramesTotal = 0;
}

// =====================================================
// PROCESS
// =====================================================

void AudioPipeline::process(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    // (C-MODESW, 2026-11-12): deteksi ganti mode live.
    //
    // Dulu tidak ada jejak mode sebelumnya: config mode lain baru dikirim
    // di buffer pertama sesudah switch (applyDSPConfig + dedup
    // dspConfigEquals), sementara rantai tujuan berjalan dengan state
    // biquad/resonator STALE dari terakhir kali mode itu aktif — bisa di
    // laju/config berbeda — dan transien step-response-nya terdengar
    // sebagai klik/pop. Sekarang mode dibandingkan sekali per chunk di
    // sini (satu-satunya choke point: satu-satunya pemanggil process() di
    // AudioCallback — jalur live (applyPipeline) — lewat sini dengan params
    // yang sama per buffer).
    //
    // Hanya saat BENAR-BENAR berubah: onModeChanged() mereset rantai
    // tujuan + mempersenjatai fade-in. Mode sama -> tidak ada reset,
    // tidak ada fade, biaya nol kecuali satu banding enum.
    const ProcessingMode mode = params.processingMode;

    if (!mModeSeen) {
        // Buffer pertama sejak prepare()/reset(): node masih segar,
        // hanya catat mode.
        mLastMode = mode;
        mModeSeen = true;
    } else if (mode != mLastMode) {
        onModeChanged(mode);
        mLastMode = mode;
    }

    switch (
        params.processingMode
    ) {

        case ProcessingMode::BitPerfect:

            processBitPerfect(
                left,
                right,
                frames
            );

            break;

        case ProcessingMode::DSP:

            processDSP(
                left,
                right,
                frames,
                params
            );

            break;

        case ProcessingMode::Immersive:

            processImmersive(
                left,
                right,
                frames,
                params
            );

            break;

        default:

            // (C-CAST, 2026-11-12): nilai liar TIDAK PERNAH boleh sampai
            // ke sini (JNI + EngineManager menolaknya), tapi switch tanpa
            // default dulu berarti mode tak dikenal = buffer lewat tanpa
            // perlakuan yang jelas. Fail-safe: perlakukan sebagai
            // BitPerfect — processBitPerfect() adalah no-op, buffer
            // diteruskan utuh tanpa DSP apa pun. BUKAN DSP/Immersive:
            // nilai liar tidak boleh diam-diam diproses sebagai mode
            // apa pun. Tanpa log di sini: jalur audio thread, per buffer
            // — log akan membanjiri logcat.
            processBitPerfect(
                left,
                right,
                frames
            );

            break;
    }
}

// =====================================================
// GANTI MODE LIVE (C-MODESW, 2026-11-12)
// =====================================================
//
// Dua langkah saat mode benar-benar berubah:
//
//   1. RESET RANTAI TUJUAN — state biquad EQ/koreksi headphone
//      (DSPChain) atau resonator Solfeggio/brainwave (ImmersiveStage)
//      dari terakhir kali mode itu aktif adalah STALE: bisa ditulis di
//      laju sample atau config berbeda, dan biquad dengan z1/z2 lama
//      yang langsung memproses sinyal baru menghasilkan transien
//      step-response (klik/pop). Hanya rantai TUJUAN yang direset —
//      rantai lama dibiarkan apa adanya: kalau user kembali ke mode
//      itu nanti, giliran mode itu yang direset sebagai tujuan, jadi
//      tidak ada state lama yang pernah dipakai langsung.
//      Reset di sini TANPA alokasi (hanya menolkan state node yang
//      sudah ada), jadi aman di audio thread; prepare() sudah
//      mengalokasikan node di luar jalur realtime.
//
//   2. FADE-IN 8 ms — reset saja tidak cukup: biquad/resonator dengan
//      state nol yang langsung memproses sinyal keras tetap punya
//      step-response di frame-frame pertama. Fade-in linear 0 -> 1
//      menutupi transien itu. Durasi 8 ms: 384 frame @48 kHz (96 kHz
//      -> 768, 192 kHz -> 1536; semuanya masih dalam satu chunk
//      kMax 1920) — cukup panjang untuk menutupi transien biquad,
//      cukup pendek untuk tidak terdengar sebagai dip/gap.
//
//   KENAPA FADE-IN, BUKAN DRY/WET CROSSFADE: crossfade butuh rantai
//   LAMA tetap jalan paralel selama fade (CPU ganda + output rantai
//   lama — yang state-nya stale dan baru saja dibuang — dicampur
//   kembali ke output, persis artefak yang mau dihilangkan). Fade-in
//   hanya menyentuh output rantai tujuan, tanpa menjalankan apa pun
//   yang lain.
//
//   KENAPA BITPERFECT TANPA FADE: BitPerfect tidak punya state (tidak
//   ada yang direset) dan HARUS bit-exact — mengalikan output dengan
//   ramp gain berapa pun akan merusak bit-perfectness. Loncatan dari
//   terproses ke mentah saat pindah KE BitPerfect adalah sifat
//   pergantian mode itu sendiri, bukan state stale, jadi tidak ada
//   yang perlu ditutupi di sini.
void AudioPipeline::onModeChanged(
    ProcessingMode mode
) noexcept {

    switch (mode) {

        case ProcessingMode::DSP:
            mDSP.reset();
            break;

        case ProcessingMode::Immersive:
            mImmersive.reset();
            break;

        case ProcessingMode::BitPerfect:
            // Stateless + bit-exact: tidak ada reset, tidak ada fade.
            mFadeFramesRemaining = 0;
            mFadeFramesTotal = 0;
            return;

        default:
            // (C-CAST, 2026-11-12): mode liar tidak punya rantai untuk
            // direset dan tidak boleh mempersenjatai fade — keluar tanpa
            // menyentuh state apa pun. process() menangani mode ini
            // sebagai passthrough BitPerfect (lihat default di sana).
            return;
    }

    // 8 ms dalam frame. Fallback 48 kHz bila prepare() belum pernah
    // dipanggil (mSampleRate <= 0) — process() tanpa prepare praktis
    // tidak terjadi (DSPChain memagari mPrepared), tapi jangan pernah
    // membagi/mengali dengan laju yang belum valid.
    const int32_t rate = mSampleRate > 0 ? mSampleRate : 48000;
    mFadeFramesTotal = (rate * 8) / 1000;
    if (mFadeFramesTotal <= 0) {
        mFadeFramesTotal = 1;
    }
    mFadeFramesRemaining = mFadeFramesTotal;
}

void AudioPipeline::applyModeSwitchFade(
    float* left,
    float* right,
    int32_t frames
) noexcept {

    if (mFadeFramesRemaining <= 0 || frames <= 0) {
        return;
    }

    // Fade bisa membentang lebih dari satu chunk (chunk pendek / laju
    // tinggi): hanya fade min(frames, sisa), simpan sisanya untuk chunk
    // berikutnya. Gain dihitung dari posisi absolut dalam fade, bukan
    // dari posisi dalam chunk, supaya ramp tetap linear 0 -> 1 walau
    // terpotong di batas chunk.
    const int32_t n = std::min(frames, mFadeFramesRemaining);
    const int32_t doneBefore =
        mFadeFramesTotal - mFadeFramesRemaining;

    for (int32_t i = 0; i < n; ++i) {
        const float gain =
            static_cast<float>(doneBefore + i + 1) /
            static_cast<float>(mFadeFramesTotal);
        left[i] *= gain;
        right[i] *= gain;
    }

    mFadeFramesRemaining -= n;
}

// =====================================================
// BIT PERFECT
// =====================================================

void AudioPipeline::processBitPerfect(
    float*,
    float*,
    int32_t
) noexcept {

    // intentionally bypass all DSP
}

// =====================================================
// DSP
// =====================================================

void AudioPipeline::processDSP(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    // 🔥 FIX (2026-10-10): dulu parameter di sini TIDAK diberi nama dan tidak
    // dipakai sama sekali — `mDSP.process()` jalan dengan `DSPChain::mConfig`
    // default, sehingga EQ/gain/width semuanya identity.
    applyDSPConfig(params);

    mDSP.process(
        left,
        right,
        frames
    );

    // (C-MODESW): fade-in 8 ms sesudah ganti mode ke DSP — menutupi
    // transien step-response biquad yang baru direset. No-op bila tidak
    // ada fade aktif.
    applyModeSwitchFade(left, right, frames);
}

// =====================================================
// KONFIGURASI DSP
// =====================================================

namespace {

// Bandingkan config yang akan dikirim dengan yang sudah terpasang.
//
// Hanya field yang benar-benar DIBACA node `DSPChain` yang ikut dibandingkan:
// EQ 10 band, bass boost, master gain, balance, stereo width, limiter.
// Field immersive (solfeggioFreq, brainwaveFreq, resonanceIntensity) tidak
// ikut — `ImmersiveStage` membacanya langsung dari `DSPParameters`, bukan
// lewat `DSPConfig`.
bool dspConfigEquals(
    const DSPConfig& a,
    const DSPConfig& b
) noexcept {

    if (a.enabled != b.enabled) return false;
    if (a.limiterEnabled != b.limiterEnabled) return false;
    if (a.mode != b.mode) return false;

    if (a.masterGain != b.masterGain) return false;
    if (a.balance != b.balance) return false;
    if (a.stereoWidth != b.stereoWidth) return false;
    if (a.bassBoost != b.bassBoost) return false;

    for (int i = 0; i < 10; ++i) {
        if (a.eqGain[i] != b.eqGain[i]) return false;
    }

    // �� FASE D (2026-10-10): preset koreksi headphone WAJIB dibandingkan.
    //
    // Tanpa ini, memilih headphone lain saat koreksi sudah aktif tidak akan
    // terkirim ke rantai — flag-nya tidak berubah, jadi config dianggap sama.
    // Bug-nya senyap: UI berubah, suara tidak.
    if (a.headphoneCorrectionEnabled != b.headphoneCorrectionEnabled) {
        return false;
    }

    if (a.headphonePreset.preampDb != b.headphonePreset.preampDb) {
        return false;
    }

    if (a.headphonePreset.filterCount != b.headphonePreset.filterCount) {
        return false;
    }

    for (int i = 0; i < a.headphonePreset.filterCount; ++i) {

        const auto& fa = a.headphonePreset.filters[i];
        const auto& fb = b.headphonePreset.filters[i];

        if (fa.type != fb.type) return false;
        if (fa.freqHz != fb.freqHz) return false;
        if (fa.q != fb.q) return false;
        if (fa.gainDb != fb.gainDb) return false;
    }

    return true;
}

} // namespace

void AudioPipeline::applyDSPConfig(
    const DSPParameters& params
) noexcept {

    mDspConfig.enabled = true;
    mDspConfig.limiterEnabled = params.limiterEnabled;
    mDspConfig.mode = params.processingMode;

    mDspConfig.masterGain = params.masterGain;
    mDspConfig.balance = params.balance;
    mDspConfig.stereoWidth = params.stereoWidth;
    mDspConfig.bassBoost = params.bassBoostGain;

    for (int i = 0; i < 10; ++i) {
        mDspConfig.eqGain[i] = params.eqGains[i];
    }

    // 🔥 FASE D (2026-10-10): preset koreksi headphone ikut dikirim.
    //
    // Bandingkan juga di dspConfigEquals — preset berubah tanpa flag berubah
    // harus tetap terkirim, kalau tidak, memilih headphone lain saat koreksi
    // sudah aktif tidak akan terdengar.
    mDspConfig.headphoneCorrectionEnabled =
        params.headphoneCorrectionEnabled;

    mDspConfig.headphonePreset =
        params.headphonePreset;

    // `enabled` sengaja SELALU true, bukan `params.dspEnabled`.
    //
    // `dspEnabled` adalah flag lama yang tidak punya pemanggil di JS dan
    // defaultnya false. Kalau ia dipakai sebagai gerbang, `DSPChain::process()`
    // akan langsung `return` dan mode DSP tetap tidak berefek — persis bug yang
    // sedang diperbaiki. Gerbang yang sah adalah mode itu sendiri: fungsi ini
    // hanya dipanggil dari cabang DSP/Immersive.
    //
    // Lihat docs/DSP_CHAIN_AUDIT.md § "dspEnabled/limiterEnabled".

    if (mConfigApplied && dspConfigEquals(mDspConfig, mAppliedConfig)) {
        return;
    }

    mDSP.applyConfig(mDspConfig);

    mAppliedConfig = mDspConfig;
    mConfigApplied = true;
}

// =====================================================
// IMMERSIVE
// =====================================================

void AudioPipeline::processImmersive(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    // =============================================
    // TIGA MODE TERPISAH - IMMERSIVE TANPA DSPChain
    // =============================================
    //
    // Sebelumnya blok ini memanggil `applyDSPConfig(params)` lalu
    // `mDSP.process()` lebih dulu, sehingga EQ, bass boost, dan pelebar
    // stereo IKUT memproses di mode Immersive. Akibatnya mode tidak
    // benar-benar terpisah: kontrol EQ diam-diam mengubah suara immersive.
    //
    // Sekarang immersive murni: hanya rantai resonansinya sendiri.
    //
    // Master gain dan balance tetap berlaku, karena keduanya soal LEVEL dan
    // PANORAMA output, bukan karakter suara. Tanpa keduanya, slider volume
    // di mode immersive akan diam saja.

    // =============================================
    // IMMERSIVE CHAIN
    // =============================================
    //
    // Rantai nyata (Solfeggio -> Harmonic -> Spatial -> Brainwave).
    //
    // (C-I1, 2026-11-12): rantai jalan DULU, master gain & balance
    // SESUDAHNYA. Urutan lama (gain dulu, rantai sesudah) punya dua
    // cacat: (a) resonator/exciter/spatial memproses sinyal yang sudah
    // dilemahkan masterGain, bukan full-level; (b) tone brainwave yang
    // DITAMBAHKAN BrainwaveGenerator::generate() di akhir rantai
    // (ImmersiveStage::process tahap 4, `+=`) tidak pernah diskalakan
    // masterGain — volume slider diam terhadap tone. Sekarang tone ikut
    // diskalakan gain/balance seperti seluruh output.
    mImmersive.process(
        left,
        right,
        frames,
        params
    );

    // ---- Master gain & balance -------------------------------------------
    //
    // (C-PAN, 2026-11-12): hukum pan LINEAR lewat helper bersama
    // panLawLinear() (core/PanLaw.h) — sama dengan GainNode (mode DSP).
    // Dulu di sini constant-power cos/sin: tengah 0,7071 (-3,01 dB),
    // jadi pindah mode DSP -> Immersive di balance 0 terdengar sebagai
    // lompatan volume -3 dB. Alasan pemilihan hukum ada di PanLaw.h.
    //
    // (C-I1): blok ini dipindah ke SESUDAH mImmersive.process() —
    // lihat komentar di atas. Perilaku gain/balance sendiri tidak
    // berubah, hanya posisinya: seluruh output rantai, termasuk tone
    // brainwave, ikut diskalakan.
    const float gain = params.masterGain;
    const float bal = params.balance;
    const PanGains pan = panLawLinear(bal);
    const float gainL = gain * pan.left;
    const float gainR = gain * pan.right;

    // Lewati kalau benar-benar netral (gain 1,0 DAN balance 0) supaya
    // tidak ada pembulatan tak perlu.
    //
    // (C-PAN): kondisi lama `gainL != 1.0f || gainR != 1.0f` praktis
    // mati di hukum cosinus — gainL == gainR == 1,0 hanya bila
    // gain = √2 dan balance = 0 — jadi loop selalu jalan walau netral.
    // Cek input langsung ini ekuivalen di hukum linear (gainL/gainR
    // == 1,0 tepat saat gain == 1,0 dan balance == 0) dan jujur soal
    // kapan skip terjadi.
    if (gain != 1.0f || bal != 0.0f) {
        for (int32_t i = 0; i < frames; ++i) {
            left[i] *= gainL;
            right[i] *= gainR;
        }
    }

    // (C-MODESW): fade-in 8 ms sesudah ganti mode ke Immersive — menutupi
    // transien step-response resonator yang baru direset. No-op bila tidak
    // ada fade aktif.
    applyModeSwitchFade(left, right, frames);
}

} // namespace pristine 