// Test domain logika posisi/seek decoder untuk berbagai rasio sample rate.
// Mereplikasi logika getPositionSeconds/onSeek setelah fix.
// jalankan: clang++ -O2 -o domain_test2 domain_test2.cpp && ./domain_test2
#include <cstdio>
#include <cmath>
#include <cstdint>
#include <vector>

struct DecodeConfig {
    uint32_t targetSampleRate = 48000;
    uint32_t chunkFrames = 4096;
};

// Model decoder: currentFrame_ = OUTPUT frames setelah swr_convert
struct DecoderModel {
    uint64_t currentFrame_ = 0;
    DecodeConfig cfg;
    uint32_t inputRate = 0;

    // FIX: bagi dengan targetSampleRate (domain output)
    double getPositionSecondsFixed() const {
        if (cfg.targetSampleRate == 0) return 0.0;
        return (double)currentFrame_ / cfg.targetSampleRate;
    }

    // BUG lama: bagi dengan inputRate (domain input)
    double getPositionSecondsBuggy() const {
        if (inputRate == 0) return 0.0;
        return (double)currentFrame_ / inputRate;
    }

    // FIX: onSeek pakai domain output
    void seekFixed(double seconds) {
        currentFrame_ = (uint64_t)(seconds * cfg.targetSampleRate);
    }
    // BUG lama
    void seekBuggy(double seconds) {
        currentFrame_ = (uint64_t)(seconds * inputRate);
    }
};

int failures = 0;
void check(const char* name, bool cond) {
    printf("  %-42s %s\n", name, cond ? "OK" : "FAIL");
    if (!cond) failures++;
}

int main() {
    printf("=== TEST DOMAIN POSISI 96kHz -> 48kHz ===\n");
    {
        DecoderModel d;
        d.inputRate = 96000;
        d.cfg.targetSampleRate = 48000;
        // 100 detik audio @48k output
        d.currentFrame_ = 100 * 48000;

        check("posisi fixed = 100s", fabs(d.getPositionSecondsFixed() - 100.0) < 0.001);
        check("posisi buggy = 50s (2x cepat)", fabs(d.getPositionSecondsBuggy() - 50.0) < 0.001);

        // seek ke 50s
        d.seekFixed(50.0);
        check("seek fixed ke 50s -> pos 50s",
              fabs(d.getPositionSecondsFixed() - 50.0) < 0.001);
        d.seekBuggy(50.0);
        // buggy: currentFrame_ = 50 * 96000 = 4,800,000
        // lalu dibaca lagi dengan buggy /96000 = 50s — konsisten secara internal!
        // TAPI clock stream (PlaybackClock) pakai domain 48k:
        // clock_->seekToSeconds(50, 48000) = 2,400,000 frame.
        // Decoder: 4,800,000 vs Clock: 2,400,000 → posisi PISAH 2x.
        check("seek buggy internal konsisten (tapi 2x vs clock stream)",
              fabs(d.getPositionSecondsBuggy() - 50.0) < 0.001);
        // Buktikan ketidakcocokan dengan clock stream:
        uint64_t clockFrames = (uint64_t)(50.0 * 48000);
        uint64_t decoderFramesBuggy = (uint64_t)(50.0 * 96000);
        check("decoder buggy 2x lipat clock stream",
              decoderFramesBuggy == clockFrames * 2);
    }

    printf("\n=== TEST DOMAIN POSISI 44.1kHz -> 48kHz ===\n");
    {
        DecoderModel d;
        d.inputRate = 44100;
        d.cfg.targetSampleRate = 48000;
        d.currentFrame_ = 100 * 48000;

        check("posisi fixed = 100s", fabs(d.getPositionSecondsFixed() - 100.0) < 0.001);
        // rasio 48000/44100 = 1.088x
        check("posisi buggy = 108.8s (1.088x cocok log speed 1.08x)",
              fabs(d.getPositionSecondsBuggy() - 108.843) < 0.01);
    }

    printf("\n=== TEST DOMAIN POSISI 48kHz -> 48kHz (tidak ada perubahan) ===\n");
    {
        DecoderModel d;
        d.inputRate = 48000;
        d.cfg.targetSampleRate = 48000;
        d.currentFrame_ = 100 * 48000;
        check("posisi fixed = 100s", fabs(d.getPositionSecondsFixed() - 100.0) < 0.001);
        check("posisi buggy = 100s (sama, tidak ada bug)", fabs(d.getPositionSecondsBuggy() - 100.0) < 0.001);
    }

    printf("\n=== TEST THROUGHPUT CHUNK FRAMES ===\n");
    {
        // FLAC 96k: 2304 input frame → 1152 output per frame decode
        // chunk 4096: butuh ceil(4096/1152) = 4 input frame → output 4608 (overshoot 512)
        // chunk 16384: butuh 15 frame → output ~17280
        struct Case { const char* name; uint32_t chunk; uint32_t expectedOut; };
        // output per input frame = 0.5
        // chunk 4096: frame yang dibaca sampai >= chunk: 8 frame input = 4096 out
        // chunk 16384: 32 frame = 16384 out
        uint32_t perFrame = 1152;
        for (uint32_t chunk : {4096u, 8192u, 16384u}) {
            uint32_t frames = 0, out = 0;
            while (out < chunk) { frames++; out += perFrame; }
            printf("  chunk %5u: %2u frame input → %u output (rasio %.2f)\n",
                   chunk, frames, out, (double)out / chunk);
        }
        // 50us sleep per loop: loop rate saat backpressure
        printf("\n  loop rate saat tertekan (11 loop/s dari log):\n");
        for (uint32_t chunk : {4096u, 16384u}) {
            uint32_t out = 0;
            while (out < chunk) out += 1152;
            double fps = 11.0 * out;
            printf("    chunk %5u → %7u out/loop × 11 = %9.0f fps vs 48000 %s\n",
                   chunk, out, fps, fps >= 48000 ? "AMAN" : "DEFICIT");
        }
    }

    printf("\n=== TEST GUARD MAGNITUDO ===\n");
    {
        // float 1e18 valid, bukan NaN
        float garbage = -1.1213967195321139e18f;
        check("garbage 1e18 bukan NaN", !std::isnan(garbage));
        check("garbage 1e18 bukan Inf", !std::isinf(garbage));
        check("guard |v|>2.0 menangkap garbage", garbage > 2.0f || garbage < -2.0f);
        // audio normal
        float audio = 0.8f;
        check("audio 0.8 lolos guard", !(audio > 2.0f || audio < -2.0f));
        // clip ekstrim (musik ter-limit bisa sampai ~1.0)
        float clip = 1.2f;
        check("clip 1.2 lolos guard", !(clip > 2.0f || clip < -2.0f));
    }

    printf("\n");
    if (failures == 0) {
        printf("=== SEMUA TEST LULUS ===\n");
    } else {
        printf("=== %d TEST GAGAL ===\n", failures);
    }
    return failures;
}
