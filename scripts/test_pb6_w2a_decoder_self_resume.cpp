// scripts/test_pb6_w2a_decoder_self_resume.cpp
//
// Uji PB6-W2A (2026-11-12): decoder memantau level queue sendiri.
//
// Latar: dulu render() (audio thread) yang me-resume decoder tiap
// callback saat queue < 60% (snapshotWorker() + resume() per callback).
// Sekarang jeda backpressure (queue > 90%) dilepas sendiri oleh thread
// decoder lewat timed wait 10 ms + predikat auto-resume, dan jeda
// eksplisit (user pause / seek) memakai flag terpisah yang TIDAK PERNAH
// dilepas predikat. Tes ini membuktikan pemisahan itu dengan decoder
// palsu (tanpa FFmpeg) — sifat yang diuji:
//
//   T1  backpressure pause self-resume saat predikat berubah false->true.
//   T2  pause() eksplisit TIDAK self-resume walau predikat selalu true
//       (regresi bug 2026-10-10: resume saat pause menghidupkan audio);
//       resume() eksplisit tetap melepas.
//   T3  pause() eksplisit yang datang SELAMA backpressure-paused tetap
//       menahan decoder walau predikat true; resume() melepas keduanya.
//   T4  stop() membangunkan worker yang backpressure-paused dengan
//       cepat (tidak menggantung di timed wait).
//   T5  tanpa predikat (tidak di-set controller), backpressure-paused
//       tetap tertidur sampai resume() eksplisit — perilaku lama, aman.
//
// Cara jalankan (dari akar proyek, satu baris):
//   g++ -std=c++20 -O2 -Iandroid/app/src/main/cpp/decoder -Iandroid/app/src/main/cpp -Iscripts/test_stubs scripts/test_pb6_w2a_decoder_self_resume.cpp android/app/src/main/cpp/decoder/DecoderWorker.cpp android/app/src/main/cpp/decoder/AudioDecoder.cpp android/app/src/main/cpp/decoder/StreamResampler.cpp android/app/src/main/cpp/resampler/LinearResampler.cpp -o /tmp/test_pb6_w2a_decoder_self_resume -pthread && /tmp/test_pb6_w2a_decoder_self_resume
//
// PlaybackController::render() sendiri TIDAK diuji di sini (butuh
// PCMQueue + Oboe + JNI) — penghapusan blok resume dari render()
// diverifikasi lewat review diff + build GH.

#include "DecoderWorker.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <memory>
#include <thread>
#include <vector>

using namespace pristine::decoder;
using namespace std::chrono_literals;

// ---- decoder palsu: Success selamanya, tanpa FFmpeg --------------------
class FakeDecoder : public AudioDecoder {
public:
    explicit FakeDecoder(const DecodeConfig& cfg = {}) : AudioDecoder(cfg) {}

    [[nodiscard]] bool isSeekable() const override { return true; }
    [[nodiscard]] DecoderCapabilities getCapabilities() const override {
        return DecoderCapabilities{};
    }
    [[nodiscard]] double getPositionSeconds() const override { return 0.0; }
    [[nodiscard]] uint64_t getPositionFrames() const override { return 0; }
    [[nodiscard]] double getDurationSeconds() const override { return 0.0; }

protected:
    bool onOpen(const std::string&, const AudioFormat*) override {
        return true;
    }
    void onClose() override {}
    DecodeResult onDecode(uint32_t /*maxFrames*/) override {
        DecodeResult r;
        r.status = DecodeStatus::Success;
        // 1024 frame stereo — isi tidak penting, hanya dihitung callback.
        r.samples.assign(2048, 0.1f);
        r.framesDecoded = 1024;
        return r;
    }
    bool onSeek(double) override { return true; }
    bool onSeekToFrame(uint64_t) override { return true; }
    AudioFormat onGetInputFormat() const override {
        AudioFormat f;
        f.sampleRate = 48000;
        f.channels = 2;
        f.sampleFormat = SampleFormat::F32;
        f.channelLayout = ChannelLayout::Stereo;
        return f;
    }
};

// ---- harness ------------------------------------------------------------
static int gPassed = 0;
static int gFailed = 0;

static void check(bool ok, const char* what) {
    if (ok) {
        ++gPassed;
        std::printf("  PASS  %s\n", what);
    } else {
        ++gFailed;
        std::printf("  FAIL  %s\n", what);
    }
}

// Tunggu predikat sampai `timeout`; false bila timeout.
template <typename F>
static bool waitUntil(F&& pred, std::chrono::milliseconds timeout) {
    const auto deadline = std::chrono::steady_clock::now() + timeout;
    while (std::chrono::steady_clock::now() < deadline) {
        if (pred()) return true;
        std::this_thread::sleep_for(5ms);
    }
    return pred();
}

// Satu worker + fake decoder, dengan callback yang menghitung chunk dan
// (opsional) memanggil pauseForBackpressure() saat mencapai `pauseAt`
// chunk — meniru cabang backpressure decode callback PlaybackController
// (queue > 90%). Predikat auto-resume dibaca dari `allowResume`.
struct Rig {
    std::shared_ptr<DecoderWorker> worker;
    std::atomic<int> chunks{0};
    std::atomic<bool> allowResume{false};
    int pauseAt = -1;  // -1 = callback tidak pernah backpressure-pause

    void build(bool withCheck) {
        auto decoder = std::make_unique<FakeDecoder>();
        // Format target == format input fake (48000/stereo) supaya
        // needsResampling() false — tidak ada resampling di jalur uji.
        AudioFormat target;
        target.sampleRate = 48000;
        target.channels = 2;
        target.sampleFormat = SampleFormat::F32;
        target.channelLayout = ChannelLayout::Stereo;
        decoder->setTargetFormat(target);

        worker = std::make_shared<DecoderWorker>(std::move(decoder));
        std::weak_ptr<DecoderWorker> weak = worker;
        worker->setDecodeCallback(
            [this, weak](DecodeResult&& /*result*/) {
                const int n = ++chunks;
                if (pauseAt > 0 && n == pauseAt) {
                    if (auto w = weak.lock()) w->pauseForBackpressure();
                }
            });
        if (withCheck) {
            worker->setAutoResumeCheck(
                [this]() { return allowResume.load(); });
        }
    }

    bool start() { return worker->start("fake://pb6-w2a"); }
    void stop() { worker->stop(); }
};

int main() {
    std::printf("PB6-W2A decoder self-resume test\n");

    // T1: backpressure pause -> self-resume saat predikat true.
    {
        Rig rig;
        rig.pauseAt = 5;
        rig.build(/*withCheck=*/true);
        check(rig.start(), "T1: worker start");
        check(waitUntil([&] { return rig.chunks.load() >= 5; }, 2000ms),
              "T1: 5 chunk ter-decode");
        check(waitUntil([&] { return rig.worker->isPaused(); }, 1000ms),
              "T1: backpressure-paused (isPaused)");
        const int stuck = rig.chunks.load();
        std::this_thread::sleep_for(150ms);  // ~15 periode timed wait
        check(rig.chunks.load() == stuck,
              "T1: TIDAK self-resume selama predikat false");
        rig.allowResume.store(true);
        check(waitUntil([&] { return rig.chunks.load() >= stuck + 10; },
                        1000ms),
              "T1: self-resume saat predikat true (+10 chunk)");
        check(!rig.worker->isPaused(), "T1: isPaused false sesudah resume");
        rig.stop();
    }

    // T2: pause() eksplisit tidak pernah self-resume walau predikat true.
    {
        Rig rig;
        rig.build(/*withCheck=*/true);
        rig.allowResume.store(true);  // predikat selalu mengizinkan
        check(rig.start(), "T2: worker start");
        check(waitUntil([&] { return rig.chunks.load() >= 5; }, 2000ms),
              "T2: 5 chunk ter-decode");
        rig.worker->pause();
        check(rig.worker->isPaused(), "T2: isPaused sesudah pause()");
        const int stuck = rig.chunks.load();
        std::this_thread::sleep_for(200ms);  // ~20 periode timed wait
        check(rig.chunks.load() == stuck,
              "T2: TIDAK self-resume saat pause() eksplisit (predikat true)");
        rig.worker->resume();
        check(waitUntil([&] { return rig.chunks.load() >= stuck + 10; },
                        1000ms),
              "T2: resume() eksplisit melepas jeda (+10 chunk)");
        rig.stop();
    }

    // T3: pause() eksplisit selama backpressure-paused tetap menahan.
    {
        Rig rig;
        rig.pauseAt = 5;
        rig.build(/*withCheck=*/true);
        rig.allowResume.store(true);
        check(rig.start(), "T3: worker start");
        check(waitUntil([&] { return rig.worker->isPaused(); }, 2000ms),
              "T3: backpressure-paused");
        rig.worker->pause();  // jeda eksplisit menumpuk di atas backpressure
        const int stuck = rig.chunks.load();
        std::this_thread::sleep_for(150ms);
        check(rig.chunks.load() == stuck,
              "T3: TIDAK self-resume saat pause() eksplisit menumpuk");
        rig.worker->resume();
        check(waitUntil([&] { return rig.chunks.load() >= stuck + 10; },
                        1000ms),
              "T3: resume() melepas kedua jeda (+10 chunk)");
        rig.stop();
    }

    // T4: stop() membangunkan worker yang backpressure-paused dengan cepat.
    {
        Rig rig;
        rig.pauseAt = 5;
        rig.build(/*withCheck=*/true);  // predikat tetap false
        check(rig.start(), "T4: worker start");
        check(waitUntil([&] { return rig.worker->isPaused(); }, 2000ms),
              "T4: backpressure-paused");
        const auto t0 = std::chrono::steady_clock::now();
        rig.stop();
        const auto took = std::chrono::steady_clock::now() - t0;
        check(took < 1000ms, "T4: stop() kembali < 1 dtk dari timed wait");
    }

    // T5: tanpa predikat, backpressure-paused tidur sampai resume().
    {
        Rig rig;
        rig.pauseAt = 5;
        rig.build(/*withCheck=*/false);
        check(rig.start(), "T5: worker start");
        check(waitUntil([&] { return rig.worker->isPaused(); }, 2000ms),
              "T5: backpressure-paused");
        const int stuck = rig.chunks.load();
        std::this_thread::sleep_for(150ms);
        check(rig.chunks.load() == stuck,
              "T5: TIDAK self-resume tanpa predikat (perilaku lama)");
        rig.worker->resume();
        check(waitUntil([&] { return rig.chunks.load() >= stuck + 10; },
                        1000ms),
              "T5: resume() eksplisit tetap melepas (+10 chunk)");
        rig.stop();
    }

    std::printf("PB6-W2A self-resume: %d lolos, %d gagal\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
