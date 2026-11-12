#pragma once

#include "AudioDecoder.h"

#include <atomic>
#include <cstdint>

struct AVFormatContext;
struct AVCodecContext;
struct AVFrame;
struct AVPacket;
struct SwrContext;
struct AVChannelLayout;

namespace pristine::decoder {

// =====================================================
// FFMPEG DECODER
// =====================================================

class FFmpegDecoder final : public AudioDecoder {
public:
    explicit FFmpegDecoder(const DecodeConfig& config = {});
    ~FFmpegDecoder() override;

    FFmpegDecoder(const FFmpegDecoder&) = delete;
    FFmpegDecoder& operator=(const FFmpegDecoder&) = delete;

protected:

    // =========================================
    // AudioDecoder
    // =========================================

    bool onOpen(
        const std::string& uri,
        const AudioFormat* hint
    ) override;

    void onClose() override;

    DecodeResult onDecode(
        uint32_t maxFrames
    ) override;

    bool onSeek(
        double positionSeconds
    ) override;

    bool onSeekToFrame(
        uint64_t frame
    ) override;

    AudioFormat onGetInputFormat() const override;

    // 🔥 FIX (2026-11-11, D-M1): selalu false — decoder ini me-resample
    // sendiri via swr ke target rate + stereo. Base class tidak boleh
    // me-resample lagi (frame-count salah domain → heap OOB).
    bool needsResampling() const noexcept override;

    DecoderCapabilities
    getCapabilities() const override;

    // =========================================
    // Position
    // =========================================

    double
    getPositionSeconds() const override;

    uint64_t
    getPositionFrames() const override;

    double
    getDurationSeconds() const override;

    // =========================================
    // Capabilities
    // =========================================

    bool isSeekable() const override;

private:
    std::vector<float> scratchBuffer_;  // 🔥 reusable
    bool formatLogged_ = false;  // 🔥 per-instance, bukan static global


    bool setupCodec();
    // 🔥 FIX (2026-11-12, B7-W4): setupResampler diparameterisasi supaya
    // jalur open dan jalur rebuild mid-stream memakai satu implementasi.
    // Saat open, input diambil dari codecCtx_; saat rebuild, dari frame_
    // yang parameternya berubah. Mencatat konfigurasi input yang berhasil
    // di-init ke swrInput*_* (dipakai perbandingan di onDecode).
    bool setupResampler(
        int inputSampleRate,
        int inputSampleFormat,
        const AVChannelLayout* inputLayout
    );
    void cleanup();

    DecodeResult decodeFrame();

    static SampleFormat
    convertSampleFormat(
        int ffmpegFormat
    );

private:

    AVFormatContext* formatCtx_ = nullptr;
    AVCodecContext* codecCtx_ = nullptr;
    AVFrame* frame_ = nullptr;
    AVPacket* packet_ = nullptr;
    SwrContext* swrCtx_ = nullptr;

    int audioStreamIndex_ = -1;

    AudioFormat inputFormat_;

    // 🔥 FIX (2026-11-12, B7-D4): posisi + durasi sebagai atomik.
    // getDurationSeconds()/getPositionSeconds()/getPositionFrames() dibaca
    // lintas thread (render thread via DecoderWorker::getPosition/
    // getDuration — self-heal di PlaybackController::render — dan watcher
    // JS) sementara formatCtx_ bisa dibebaskan kapan saja oleh close() dari
    // stopDecoder (UAF: getter lama membaca formatCtx_->duration tanpa
    // lock). currentFrame_ plain juga data race (ditulis thread decode di
    // onDecode/onSeek, dibaca thread lain). Cache durasi diisi sekali saat
    // open (di bawah, formatCtx_ masih valid); posisi dihitung dari
    // currentFrame_ atomik. Durasi 0.0 = tidak terisi (AV_NOPTS_VALUE /
    // file tanpa durasi) — pemanggil tetap memperlakukannya sebagai
    // "belum tahu" dan self-heal tetap jalan sampai terisi.
    std::atomic<uint64_t> currentFrame_{0};
    std::atomic<double> durationSeconds_{0.0};

    // 🔥 FIX (2026-11-12, B7-W4): konfigurasi input swr saat ini, dicatat
    // setupResampler() sesudah swr_init sukses. onDecode membandingkan
    // parameter tiap frame dengan nilai ini (murah: 5× compare skalar)
    // dan hanya rebuild bila ada yang berubah — HE-AAC SBR bisa mengubah
    // sample_rate di tengah file, sementara setupResampler lama hanya
    // jalan sekali dari codecCtx_ saat open. Layout disimpan sebagai
    // skalar (order/mask/nb_channels) supaya header ini tetap bebas
    // include FFmpeg; untuk layout native ketiganya sudah menentukan
    // layout penuh (setara av_channel_layout_compare). Layout CUSTOM
    // (map per-kanal di opaque) tidak dibedakan — tidak ada decoder di
    // app ini yang menghasilkannya; file seperti itu tetap jalan dengan
    // konfigurasi frame pertama, sama seperti perilaku lama.
    int swrInputSampleRate_ = 0;
    int swrInputSampleFormat_ = -1; // AVSampleFormat sebagai int; -1 = belum diset
    int swrInputChannels_ = 0;
    int swrInputLayoutOrder_ = 0;   // AVChannelOrder sebagai int; 0 = UNSPEC
    uint64_t swrInputLayoutMask_ = 0;

    // 🔥 FIX (2026-11-12, B7-W1): hitung error avcodec_send_packet
    // BERUNTUN (paket korup). Di-reset tiap paket berhasil dikirim, di
    // cleanup(), dan di onSeek() — trek/posisi baru mulai dari nol.
    // Hanya dipakai bila config().continueOnError; ambang batasnya
    // config().maxConsecutiveErrors (default 3).
    uint32_t consecutiveSendErrors_ = 0;

    uint64_t durationFrames_ = 0;

    std::vector<uint8_t> packetBuffer_;
};

} // namespace pristine::decoder 