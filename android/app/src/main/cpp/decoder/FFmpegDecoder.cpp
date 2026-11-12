#include "FFmpegDecoder.h"
#include "ContentUriResolver.h"

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswresample/swresample.h>
#include <libavutil/channel_layout.h>
#include <libavutil/samplefmt.h>
#include <libavutil/opt.h>
}

#include <android/log.h>
#include <cmath>

namespace pristine::decoder {

// =====================================================
// CTOR / DTOR
// =====================================================

FFmpegDecoder::FFmpegDecoder(const DecodeConfig& config)
    : AudioDecoder(config) {}

FFmpegDecoder::~FFmpegDecoder() {
    cleanup();
}

// =====================================================
// OPEN
// =====================================================

bool FFmpegDecoder::onOpen(
    const std::string& uri,
    const AudioFormat* /*hint*/) {

    cleanup();

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "onOpen: %s", uri.c_str());

    // content:// adalah skema ContentProvider Android, BUKAN jalur file.
    // FFmpeg tidak punya handler untuk itu, jadi avformat_open_input selalu
    // gagal kalau URI diteruskan mentah. Resolver menyalin isinya ke cache
    // dan mengembalikan jalur file.
    //
    // Tanpa langkah ini, pemutaran berhenti pada trek pertama yang URI-nya
    // belum di-resolve sisi Kotlin (MAX_PRE_RESOLVE = 5, sisanya deferred).
    std::string resolvedUri = ContentUriResolver::resolve(uri);

    if (resolvedUri.empty()) {
        // Resolve gagal - JANGAN jatuh kembali ke uri asli. content://
        // mentah pasti gagal juga, dan pesan errornya jadi menyesatkan.
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: gagal resolve content:// uri=%s", uri.c_str());
        return false;
    }

    if (resolvedUri != uri) {
        __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                            "onOpen: resolved -> %s", resolvedUri.c_str());
    }

    if (avformat_open_input(
            &formatCtx_,
            resolvedUri.c_str(),
            nullptr,
            nullptr) < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: avformat_open_input failed (uri=%s)",
                            resolvedUri.c_str());
        return false;
    }

    if (avformat_find_stream_info(
            formatCtx_,
            nullptr) < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: avformat_find_stream_info failed");
        cleanup();
        return false;
    }

    // 🔥 FIX (2026-11-12, B7-D4): cache durasi SEKARANG, saat formatCtx_
    // masih valid dan stream info sudah ter-probe. Getter durasi tidak
    // lagi menyentuh formatCtx_ (UAF vs close dari thread lain).
    // AV_NOPTS_VALUE / negatif = durasi tidak diketahui → 0.0, SAMA
    // seperti perilaku lama di mata pemanggil (durSec <= 0.0 = fallback
    // metadata di loadTrack, decDur > 0.0 gate di self-heal render).
    const int64_t probedDuration = formatCtx_->duration;
    durationSeconds_.store(
        (probedDuration != AV_NOPTS_VALUE && probedDuration > 0)
            ? static_cast<double>(probedDuration) / AV_TIME_BASE
            : 0.0,
        std::memory_order_release);

    audioStreamIndex_ =
        av_find_best_stream(
            formatCtx_,
            AVMEDIA_TYPE_AUDIO,
            -1,
            -1,
            nullptr,
            0);

    if (audioStreamIndex_ < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: no audio stream found");
        cleanup();
        return false;
    }

    if (!setupCodec()) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: setupCodec failed");
        cleanup();
        return false;
    }

    if (!setupResampler(codecCtx_->sample_rate,
                        codecCtx_->sample_fmt,
                        &codecCtx_->ch_layout)) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: setupResampler failed");
        cleanup();
        return false;
    }

    frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();

    if (!frame_ || !packet_) {
        cleanup();
        return false;
    }

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "onOpen: success");
    return true;
}

// =====================================================
// CLOSE
// =====================================================

void FFmpegDecoder::onClose() {
    cleanup();
}

// =====================================================
// DECODE
// =====================================================

DecodeResult FFmpegDecoder::onDecode(
    uint32_t maxFrames) {

    DecodeResult result;
    result.samples.reserve(
        maxFrames * 2); // asumsi stereo

    // 🩹 FIX: counter output lokal — exit condition loop HARUS
    // pakai domain output (targetSampleRate), bukan framesDecoded
    // yang ada di domain input. Tanpa ini, file dengan rasio
    // downsample besar (mis. 96kHz->48kHz = 2:1) menghasilkan
    // output ~50% lebih sedikit dari yang diminta per panggilan,
    // menyebabkan pcmQueue_ starved -> pulsing/chipmunk.
    uint32_t outputFramesThisCall = 0;

    while (outputFramesThisCall < maxFrames) {

        int readResult = av_read_frame(
            formatCtx_,
            packet_);

        if (readResult < 0) {
            // EOF atau error
            result.status = DecodeStatus::EndOfStream;
            break;
        }

        if (packet_->stream_index != audioStreamIndex_) {
            av_packet_unref(packet_);
            continue;
        }

        // 🔥 FIX (2026-11-12, B7-W1): avcodec_send_packet bisa gagal karena
        // dua alasan yang berbeda — jangan samakan.
        //
        // EAGAIN = decoder penuh, BUKAN error: paket belum dikonsumsi.
        // Teruskan ke receive_frame di bawah seperti biasa (drain membebaskan
        // ruang); jangan hitung sebagai consecutive error, jangan skip lagu.
        // Praktis tidak terjadi di loop ini (receive di-drain penuh sesudah
        // tiap send), jadi paket yang terbuang di sini paling banyak satu
        // frame — glitch terbatas, bukan skip.
        //
        // Error lain (mis. AVERROR_INVALIDDATA) = paket korup. Bila
        // continueOnError, lewati paket itu dan lanjutkan decode; gagal
        // (Error) hanya sesudah maxConsecutiveErrors beruntun. Bila
        // continueOnError mati, pertahankan perilaku lama: Error langsung.
        // Counter di-reset tiap paket berhasil dikirim, dan di-reset di
        // cleanup()/onSeek() supaya trek/posisi baru mulai dari nol.
        const int sendResult = avcodec_send_packet(
            codecCtx_,
            packet_);
        if (sendResult == AVERROR(EAGAIN)) {
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "B7-W1: send_packet EAGAIN (decoder penuh) — drain dulu, paket dilewati");
            av_packet_unref(packet_);
            // Fall through ke receive loop di bawah.
        } else if (sendResult < 0) {
            av_packet_unref(packet_);
            if (!config().continueOnError) {
                result.status = DecodeStatus::Error;
                result.errorMessage =
                    "B7-W1: avcodec_send_packet failed";
                return result;
            }
            if (++consecutiveSendErrors_ >=
                    config().maxConsecutiveErrors) {
                __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                    "B7-W1: %u consecutive send_packet errors — stop decoding",
                    consecutiveSendErrors_);
                result.status = DecodeStatus::Error;
                result.errorMessage =
                    "B7-W1: too many consecutive send_packet errors";
                return result;
            }
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "B7-W1: send_packet failed (%d) — lewati paket (%u/%u)",
                sendResult, consecutiveSendErrors_,
                config().maxConsecutiveErrors);
            continue;
        } else {
            consecutiveSendErrors_ = 0;
            av_packet_unref(packet_);
        }

        while (true) {
            int receiveResult = avcodec_receive_frame(
                codecCtx_,
                frame_);

            if (receiveResult == AVERROR(EAGAIN))
                break;

            if (receiveResult == AVERROR_EOF) {
                result.status = DecodeStatus::EndOfStream;
                return result;
            }

            if (receiveResult < 0) {
                result.status = DecodeStatus::Error;
                return result;
            }

            // 🔥 FIX (2026-11-12, B7-W4): parameter frame bisa berubah di
            // tengah file (HE-AAC SBR: sample_rate naik sesudah SBR aktif)
            // sementara swr hanya dikonfigurasi sekali saat open dari
            // codecCtx_. Bandingkan parameter frame dengan konfigurasi swr
            // saat ini; rebuild hanya bila ada yang berubah, jadi jalur
            // normal (parameter tetap) cuma tambah 5× compare skalar.
            //
            // ch_layout UNSPEC (order == AV_CHANNEL_ORDER_UNSPEC) diberi
            // default dulu via av_channel_layout_default() dari jumlah
            // kanal — layout hasil default-lah yang dibandingkan dan
            // dipakai rebuild. Bila nb_channels juga 0, default gagal dan
            // layout tetap UNSPEC: perbandingan tetap mendeteksi perubahan
            // dan rebuild gagal dengan cara yang sama seperti open dengan
            // layout tak valid (Error, bukan output sampah).
            //
            // Rebuild = swr_free + setup ulang penuh (jalur yang sama
            // dengan open): swr_alloc_set_opts2 di atas konteks yang sudah
            // di-init tidak dijamin aman. Sisa delay filter lama (±128
            // sampel) ikut terbuang — glitch ≤ ~3 ms di titik transisi.
            AVChannelLayout frameLayout = frame_->ch_layout;
            if (frameLayout.order == AV_CHANNEL_ORDER_UNSPEC) {
                av_channel_layout_default(&frameLayout, frameLayout.nb_channels);
            }

            if (frame_->sample_rate != swrInputSampleRate_ ||
                frame_->format != swrInputSampleFormat_ ||
                frameLayout.nb_channels != swrInputChannels_ ||
                frameLayout.order != swrInputLayoutOrder_ ||
                frameLayout.mask != swrInputLayoutMask_) {
                __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                    "B7-W4: frame params changed (rate %d->%d, fmt %d->%d, ch %d->%d) — rebuilding resampler",
                    swrInputSampleRate_, frame_->sample_rate,
                    swrInputSampleFormat_, frame_->format,
                    swrInputChannels_, frameLayout.nb_channels);
                swr_free(&swrCtx_);
                if (!setupResampler(frame_->sample_rate,
                                    frame_->format,
                                    &frameLayout)) {
                    __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                        "B7-W4: resampler rebuild failed — stop decoding");
                    result.status = DecodeStatus::Error;
                    return result;
                }
                // Log FORMAT CHECK sekali lagi dengan parameter baru.
                formatLogged_ = false;
            }

            // 🔥 FIX (2026-10-06): formatLogged adalah member per-instance,
            // bukan static global. Sebelumnya static di dalam fungsi → hanya
            // log trek pertama yang pernah dibuka; trek 96kHz berikutnya
            // tidak pernah di-log, menyembunyikan info format saat debugging.
            if (!formatLogged_) {
                __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                    "FORMAT CHECK: codecCtx_->sample_fmt=%d, frame_->format=%d, codecCtx_->sample_rate=%d, frame_->sample_rate=%d, nb_samples=%d",
                    codecCtx_->sample_fmt, frame_->format,
                    codecCtx_->sample_rate, frame_->sample_rate,
                    frame_->nb_samples);
                formatLogged_ = true;
            }

            // 🔥 FIX (2026-10-09, "96kHz crash"): guard tiga lapis terhadap
            // swr_convert() yang menulis melewati estimasi swr_get_out_samples().
            //
            // Gejala: SIGSEGV SEGV_ACCERR (memcpy 18432 B, src page-aligned
            // PROT_NONE) di thread decoder, 26 ms setelah FORMAT CHECK pertama
            // FLAC 96kHz → 48kHz, tepat saat auto-advance EOF → loadTrack.
            //
            // swr_get_out_samples() adalah ESTIMASI. Untuk rasio kompleks
            // (96k→48k = 2:1) + konversi format planar→packed, output bisa
            // sedikit melebihi estimasi pada frame awal (priming/delay filter
            // filter_size=128). Margin 1024 ternyata TIDAK cukup.
            //
            // Lapis 1: margin dinaikkan ke +4096 frames (16 KB stereo float).
            // Lapis 2: scratchBuffer_ selalu dialokasi ULANG dengan slack ×4,
            //          bukan ×2, supaya realloc di tengah loop tidak pernah
            //          membebani pointer `temp` (vector resize menyalin lama
            //          lalu membebaskan lama → pointer lama dangling).
            // Lapis 3: converted di-CLAMP ke outSamples. swr_convert dijamin
            //          tidak menulis lebih dari yang kita sediakan, tapi nilai
            //          kembali yang lebih besar langsung meledakkan insert()
            //          di bawah → ini yang menghasilkan memcpy 18432 B dari
            //          region PROT_NONE.
            const int estSamples =
                swr_get_out_samples(swrCtx_, frame_->nb_samples);
            const int outSamples =
                (estSamples > 0 ? estSamples : 0) + 4096;

            const int channels = 2; // output stereo

            const size_t neededSize = static_cast<size_t>(outSamples) * channels;
            if (scratchBuffer_.size() < neededSize * 4) {
                // Alokasi penuh + slack. resize() pada vector Kosong aman;
                // resize() pada vector berisi menyalin data lama dulu, tapi
                // kita selalu mengambil `temp` SETELAH ini.
                scratchBuffer_.resize(neededSize * 4);
            }
            float* temp = scratchBuffer_.data();
            if (!temp) {
                __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                    "scratchBuffer_ null (size=%zu) — skip frame",
                    scratchBuffer_.size());
                av_frame_unref(frame_);
                continue;
            }

            uint8_t* out[] = {
                reinterpret_cast<uint8_t*>(temp)
            };

            int converted = swr_convert(
                swrCtx_,
                out,
                outSamples,
                const_cast<const uint8_t**>(frame_->extended_data),
                frame_->nb_samples);

            // 🔥 Lapis 3: clamp. Jangan pernah percaya nilai kembali melebihi
            // buffer yang kita sediakan.
            if (converted > outSamples) {
                __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                    "swr_convert overflow: converted=%d > outSamples=%d — clamped",
                    converted, outSamples);
                converted = outSamples;
            }

            if (converted > 0) {

    // 🔥 FIX (2026-10-06): guard magnitudo SEBELUM masuk queue.
    // Bit pattern malloc garbage (1e18-1e32) lolos dari isnan/isinf.
    // Buang di sini supaya queue hanya pernah berisi audio valid.
    {
        int badCount = 0;
        const size_t total = static_cast<size_t>(converted) * channels;
        for (size_t i = 0; i < total; ++i) {
            float& v = temp[i];
            if (std::isnan(v) || std::isinf(v) || v > 2.0f || v < -2.0f) {
                badCount++;
                v = 0.0f;
            }
        }
        if (badCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "swr output guard: %zu/%zu samples out-of-range cleaned",
                (size_t)badCount, total);
        }
    }

    // 🔥 FIX (2026-10-06, "96kHz masih cacat"): kGain 0.89 (-1 dB) diterapkan
    // ke SEMUA sample. Ini menghianati mode bit-perfect: BitPerfectPipeline
    // sengaja kosong ("no gain"), tapi decoder sudah memotong 1 dB lebih dulu.
    // Untuk file hi-res 96kHz, ini merusak dynamics yang seharusnya utuh.
    //
    // Headroom 1 dB duluan diperlukan karena EQ/limiter di pipeline lain
    // bisa memperkuat sinyal melewati 0 dBFS. Tapi bit-perfect tidak punya
    // stage tersebut, jadi gain ini hanya merusak. Pindahkan ke pipeline
    // yang benar-benar butuh headroom (ImmersivePipeline) — bukan di sini.
    //
    // Sekarang: TIDAK ADA gain di decoder. PCM keluar utuh dari swr_convert.
    {
        int nanCount = 0;
        for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
            float& v = temp[i];
            if (std::isnan(v) || std::isinf(v)) {
                nanCount++;
                v = 0.0f;
            }
        }
        static int totalNan = 0;
        totalNan += nanCount;
        if (nanCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "NaN/Inf detected: %d of %zu samples cleaned (total=%d)",
                nanCount, static_cast<size_t>(converted) * channels, totalNan);
        }
    }

    result.samples.insert(
        result.samples.end(),
        temp,
        temp + converted * channels);

    // ✅ FIX: framesDecoded = input frames (44.1k), currentFrame_ = output frames (48k)
    // ⚠️ INVARIAN (D-M1, 2026-11-11): framesDecoded SENGAJA domain input,
    // sementara result.samples berisi frame domain OUTPUT (converted).
    // Karena itu applyResampling() base class TIDAK BOLEH jalan untuk
    // decoder ini — ia memakai framesDecoded sebagai jumlah frame buffer
    // (lihat AudioDecoder::applyResampling) dan akan membaca melewati akhir
    // buffer. needsResampling() di-override false di bawah; jangan hapus
    // override itu tanpa memperbaiki domain framesDecoded dulu.
    result.framesDecoded += frame_->nb_samples;
    currentFrame_.fetch_add(
        static_cast<uint64_t>(converted),
        std::memory_order_relaxed);
    // FIX (Prioritas 1): counter output lokal — INI yang dipakai exit condition
    outputFramesThisCall += static_cast<uint32_t>(converted);

    // 🔥 DEBUG: log min/max setiap ~4096 output frames
    static int64_t totalOut = 0;
    totalOut += converted;
    if (totalOut % 4096 < static_cast<int64_t>(converted) && converted > 0) {
        float minV = 1e9f, maxV = -1e9f;
        double sumAbs = 0.0;
        const size_t debugN = static_cast<size_t>(converted) * channels;
        for (size_t i = 0; i < debugN; ++i) {
            float v = temp[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
            sumAbs += (v < 0 ? -v : v);
        }
        float meanAbs = static_cast<float>(sumAbs / (static_cast<size_t>(converted) * channels));
        static int resampleLogCount = 0;
        resampleLogCount++;
        if (resampleLogCount % 500 == 0) {
            __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                "resample out: min=%.4f max=%.4f mean=%.4f (frames=%d)",
                minV, maxV, meanAbs, converted);
        }
    }
}

            if (outputFramesThisCall >= maxFrames)
                break;
        }

        if (outputFramesThisCall >= maxFrames)
            break;
    }

    static int decodeLogCount = 0;
    decodeLogCount++;
    if (decodeLogCount % 500 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                            "onDecode: framesDecoded=%u, status=%d",
                            result.framesDecoded, (int)result.status);
    }

    result.status =
        result.framesDecoded > 0
            ? DecodeStatus::Success
            : DecodeStatus::EndOfStream;

    result.framePosition =
        currentFrame_.load(std::memory_order_relaxed);

    return result;
}

// =====================================================
// SEEK
// =====================================================

bool FFmpegDecoder::onSeek(
    double positionSeconds) {

    if (!formatCtx_)
        return false;

    int64_t timestamp =
        static_cast<int64_t>(positionSeconds * AV_TIME_BASE);

    if (av_seek_frame(
            formatCtx_,
            -1,
            timestamp,
            AVSEEK_FLAG_BACKWARD) < 0) {
        return false;
    }

    avcodec_flush_buffers(codecCtx_);

    // 🔥 FIX (2026-11-12, B7-W1): posisi baru = konteks baru — error
    // kirim paket sebelum seek tidak boleh dihitung beruntun dengan
    // error sesudah seek.
    consecutiveSendErrors_ = 0;

    // KOREKSI (2026-11-10): percobaan p-m10 memakai `stream->cur_dts`
    // sebagai posisi AKTUAL pasca-seek DIHAPUS — field itu TIDAK ADA di
    // AVStream publik FFmpeg 6.1.2 (dipakai repo ini); `cur_dts` hanya ada
    // di FFmpeg 2.x dan sejak 3.0 pindah ke AVStreamInternal yang tidak
    // bisa diakses. Build Dev 42832521358 gagal kompilasi tepat di dua
    // baris itu. Tidak ada accessor publik "DTS saat ini" di libavformat
    // 60 — posisi pasca-seek yang sebenarnya baru diketahui saat paket
    // berikutnya dibaca. Jadi kembali ke perilaku lama: currentFrame_
    // dari posisi yang DIMINTA. Untuk file audio (MP3/FLAC/AAC) galatnya
    // kecil: seek mendarat di keyframe ≤ target dan frame audio hampir
    // independen (offset ≤ ~1 frame). Bagian p-m10 yang PENTING — urutan
    // seek (decoder dulu, clock dari getPosition() hanya bila sukses) —
    // ada di PlaybackController::seek() dan TIDAK tersentuh koreksi ini.

    // 🔥 FIX (2026-10-06): domain currentFrame_ adalah OUTPUT (targetSampleRate),
    // bukan codecCtx_->sample_rate. Bug kembar getPositionSeconds: untuk FLAC
    // 96kHz, seek ke 10s menulis 960000 frame, tapi playback stream 48kHz
    // hanya 480000 frame di 10 detik → posisi langsung melompat 2x dan audio
    // yang keluar tidak cocok dengan posisi yang dilaporkan.
    currentFrame_.store(
        static_cast<uint64_t>(
            positionSeconds * config().targetSampleRate),
        std::memory_order_relaxed);

    return true;
}

bool FFmpegDecoder::onSeekToFrame(
    uint64_t frame) {

    // frame di sini adalah domain OUTPUT (sama dengan currentFrame_).
    // Konversi ke detik pakai laju output, lalu seek berbasis waktu AV.
    const uint32_t outRate = config().targetSampleRate;
    if (outRate == 0) {
        return false;
    }
    return onSeek(
        static_cast<double>(frame) / outRate);
}

// =====================================================
// FORMAT INFO
// =====================================================

// 🔥 FIX (2026-11-11, D-M1): decoder ini me-resample SENDIRI via swr ke
// cfg.targetSampleRate + stereo (lihat setupResampler) — base class TIDAK
// boleh me-resample lagi. Dulu needsResampling() base membandingkan laju
// FILE vs outputFormat_ default 48000, jadi untuk file non-48 kHz
// applyResampling() jalan dengan framesDecoded domain INPUT melawan buffer
// domain OUTPUT → heap OOB read (96 kHz → SIGSEGV, terbukti harness ASAN),
// tempo salah (44,1 kHz → −8,8%), dan 2× cepat di stream 96 kHz.
bool FFmpegDecoder::needsResampling() const noexcept {
    return false;
}

AudioFormat FFmpegDecoder::onGetInputFormat() const {
    AudioFormat format;

    if (!codecCtx_)
        return format;

    format.sampleRate = codecCtx_->sample_rate;
    format.channels = codecCtx_->ch_layout.nb_channels;
    format.sampleFormat = convertSampleFormat(codecCtx_->sample_fmt);
    format.durationSeconds = getDurationSeconds();

    // Map channel count to ChannelLayout
    switch (format.channels) {
        case 1: format.channelLayout = ChannelLayout::Mono; break;
        case 2: format.channelLayout = ChannelLayout::Stereo; break;
        case 6: format.channelLayout = ChannelLayout::Surround5_1; break;
        case 8: format.channelLayout = ChannelLayout::Surround7_1; break;
        default: format.channelLayout = ChannelLayout::Unknown; break;
    }

    return format;
}

DecoderCapabilities FFmpegDecoder::getCapabilities() const {
    DecoderCapabilities caps;

    caps.supportsSeeking = true;
    caps.supportsStreaming = true;
    caps.supportsGapless = true;
    caps.supportsMetadata = true;
    caps.supportsEmbeddedArtwork = false;
    caps.maxChannels = 8;
    caps.maxSampleRate = 192000;
    caps.supportedFormats = {
        "mp3",
        "aac",
        "m4a",
        "flac",
        "wav",
        "ogg",
        "opus"
    };

    return caps;
}

// 🔥 FIX (2026-11-12, B7-D4): baca dari cache atomik yang diisi di
// onOpen — TIDAK LAGI menyentuh formatCtx_ (UAF vs close dari thread
// lain). 0.0 = durasi tidak diketahui (file tanpa durasi / AV_NOPTS_VALUE
// saat open); pemanggil sudah memperlakukan <= 0.0 sebagai "belum tahu".
double FFmpegDecoder::getDurationSeconds() const {
    return durationSeconds_.load(std::memory_order_acquire);
}

// =====================================================
// POSITION
// =====================================================

double FFmpegDecoder::getPositionSeconds() const {
    // currentFrame_ dihitung dari HASIL swr_convert, jadi domainnya adalah
    // laju OUTPUT (config().targetSampleRate), bukan codecCtx_->sample_rate.
    //
    // BUG (2026-10-06, "96kHz masih cacat"): pembagung pakai sample_rate ASLI
    // file. Untuk FLAC 96kHz, currentFrame_ (48k) / 96000 = posisi 2x
    // terlalu cepat → UI desync, progress bar melompat, speed false-positive.
    const uint32_t outRate = config().targetSampleRate;
    if (outRate == 0) {
        return 0.0;
    }
    return static_cast<double>(
        currentFrame_.load(std::memory_order_relaxed)) / outRate;
}

uint64_t FFmpegDecoder::getPositionFrames() const {
    return currentFrame_.load(std::memory_order_relaxed);
}

bool FFmpegDecoder::isSeekable() const {
    return formatCtx_ != nullptr;
}

// =====================================================
// INTERNAL
// =====================================================

bool FFmpegDecoder::setupCodec() {
    AVStream* stream =
        formatCtx_->streams[audioStreamIndex_];

    const AVCodec* codec =
        avcodec_find_decoder(stream->codecpar->codec_id);

    if (!codec)
        return false;

    codecCtx_ = avcodec_alloc_context3(codec);
    if (!codecCtx_)
        return false;

    if (avcodec_parameters_to_context(
            codecCtx_,
            stream->codecpar) < 0) {
        return false;
    }

    return avcodec_open2(
        codecCtx_,
        codec,
        nullptr) >= 0;
}

bool FFmpegDecoder::setupResampler(
    int inputSampleRate,
    int inputSampleFormat,
    const AVChannelLayout* inputLayout) {
    swrCtx_ = swr_alloc();
    if (!swrCtx_)
        return false;

    AVChannelLayout stereo;
    av_channel_layout_default(&stereo, 2);

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "setupResampler: input_rate=%d, output_rate=%d",
                        inputSampleRate, config().targetSampleRate);

    int ret = swr_alloc_set_opts2(
        &swrCtx_,
        &stereo,
        AV_SAMPLE_FMT_FLT,
        config().targetSampleRate,
        inputLayout,
        inputSampleFormat,
        inputSampleRate,
        0,
        nullptr);

    if (ret < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "swr_alloc_set_opts2 failed: %d", ret);
        return false;
    }

    // 🔥 FIX (2026-10-09, "noise di 44.1kHz"): dither HANYA diterapkan jika
    // ada konversi sample rate. Output selalu AV_SAMPLE_FMT_FLT (float), jadi
    // konversi format S16/S32→FLT tidak pernah mengurangi presisi — dither
    // hanya menambah noise floor tanpa manfaat. Untuk passthrough rate
    // (44.1k→44.1k), dither juga tidak perlu.
    const bool needsResample =
        (inputSampleRate != static_cast<int>(config().targetSampleRate));

    int filterSize = 128;
    av_opt_set_int(swrCtx_, "filter_size", filterSize, 0);
    av_opt_set_double(swrCtx_, "cutoff", 0.97, 0);
    av_opt_set_int(swrCtx_, "linear_interp", 0, 0);

    if (needsResample) {
        av_opt_set_int(swrCtx_, "dither_method", SWR_DITHER_TRIANGULAR_HIGHPASS, 0);
        av_opt_set_double(swrCtx_, "dither_scale", 0.5, 0);
    } else {
        // Passthrough: tanpa dither, tanpa noise tambahan
        av_opt_set_int(swrCtx_, "dither_method", SWR_DITHER_NONE, 0);
        av_opt_set_double(swrCtx_, "dither_scale", 0.0, 0);
    }

    int init_ret = swr_init(swrCtx_);
    __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                        "setupResampler: swr_init ret=%d (filter_size=128, cutoff=0.97, dither=%s, needsResample=%d)",
                        init_ret, needsResample ? "triangular_hp(0.5)" : "none", needsResample ? 1 : 0);
    if (init_ret < 0)
        return false;

    // 🔥 FIX (2026-11-12, B7-W4): catat konfigurasi input yang BARU SAJA
    // berhasil di-init — inilah yang dibandingkan onDecode dengan tiap
    // frame. Hanya dicatat bila swr_init sukses, supaya rebuild yang gagal
    // tidak merusak catatan konfigurasi lama.
    swrInputSampleRate_ = inputSampleRate;
    swrInputSampleFormat_ = inputSampleFormat;
    swrInputChannels_ = inputLayout->nb_channels;
    swrInputLayoutOrder_ = static_cast<int>(inputLayout->order);
    swrInputLayoutMask_ = inputLayout->mask;

    return true;
}

void FFmpegDecoder::cleanup() {
    if (packet_) {
        av_packet_free(&packet_);
    }

    if (frame_) {
        av_frame_free(&frame_);
    }

    if (codecCtx_) {
        avcodec_free_context(&codecCtx_);
    }

    if (swrCtx_) {
        swr_free(&swrCtx_);
    }

    if (formatCtx_) {
        avformat_close_input(&formatCtx_);
    }

    audioStreamIndex_ = -1;
    // 🔥 FIX (2026-11-12, B7-W1): reset hitung error kirim paket supaya
    // trek baru tidak mewarisi error trek lama.
    consecutiveSendErrors_ = 0;
    // 🔥 FIX (2026-11-12, B7-D4): reset cache atomik supaya getter tidak
    // melaporkan durasi/posisi trek lama sesudah close (perilaku lama:
    // formatCtx_ == nullptr → durasi 0, posisi 0).
    currentFrame_.store(0, std::memory_order_relaxed);
    durationSeconds_.store(0.0, std::memory_order_release);
    formatLogged_ = false;  // 🔥 reset supaya trek baru di-log lagi
}

// =====================================================
// HELPERS
// =====================================================

SampleFormat FFmpegDecoder::convertSampleFormat(int ffFormat) {
    switch (ffFormat) {
        case AV_SAMPLE_FMT_U8:  return SampleFormat::U8;
        case AV_SAMPLE_FMT_S16: return SampleFormat::S16;
        case AV_SAMPLE_FMT_S32: return SampleFormat::S32;
        case AV_SAMPLE_FMT_FLT: return SampleFormat::F32;
        case AV_SAMPLE_FMT_DBL: return SampleFormat::F64;
        default:                return SampleFormat::Unknown;
    }
}

} // namespace pristine::decoder