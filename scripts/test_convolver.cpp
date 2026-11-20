// =====================================================
// scripts/test_convolver.cpp
// =====================================================
//
// Uji convolver / impulse response loader (2026-11-20):
//   [1] UniformPartitionedConvolver multi-partisi vs konvolusi
//       langsung (IR 1000 tap, chunk 1..1920, latensi 1 blok).
//   [2] Jalur satu-partisi (HRTF) tidak berubah.
//   [3] Live swap kernel saat audio jalan (generation bump).
//   [4] IRLoader: WAV mono16 / stereo24 / float-NaN / garbage /
//       missing / sunyi / laju / terlalu panjang.
//   [5] ConvolverNode: bypass bit-exact (tanpa IR, toggle OFF,
//       IR dihapus), IR identitas = tunda 1 blok, resample.
//   [6] DSPChain: convolver idle = rantai tak berubah; load IR via
//       chain (status + info tap/durasi); IR terlalu panjang sesudah
//       resample ditolak dan IR lama dipertahankan.
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_convolver.cpp \
//     android/app/src/main/cpp/dsp/convolution/UniformPartitionedConvolver.cpp \
//     android/app/src/main/cpp/dsp/convolution/ConvolverNode.cpp \
//     android/app/src/main/cpp/dsp/convolution/IRLoader.cpp \
//     android/app/src/main/cpp/fft/FFTPlan.cpp \
//     android/app/src/main/cpp/dsp/DSPChain.cpp \
//     android/app/src/main/cpp/dsp/graph/DSPGraph.cpp \
//     android/app/src/main/cpp/dsp/tone/EQNode.cpp \
//     android/app/src/main/cpp/dsp/tone/GainNode.cpp \
//     android/app/src/main/cpp/dsp/tone/ReverbNode.cpp \
//     android/app/src/main/cpp/dsp/hrtf/HRTFNode.cpp \
//     android/app/src/main/cpp/dsp/spatial/StereoWidenerNode.cpp \
//     android/app/src/main/cpp/dsp/dynamics/LimiterNode.cpp \
//     android/app/src/main/cpp/dsp/EQProcessor.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     android/app/src/main/cpp/dsp/headphone/HeadphoneCorrectionNode.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     -o "$TMPDIR/test_convolver" && "$TMPDIR/test_convolver"

#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <vector>

#include "core/DSPConfig.h"
#include "dsp/DSPChain.h"
#include "dsp/convolution/ConvolverNode.h"
#include "dsp/convolution/IRLoader.h"
#include "dsp/convolution/UniformPartitionedConvolver.h"

using namespace pristine;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) gPass++; else gFail++;
}

static bool nearly(float a, float b, float tol = 1e-4f) {
    return std::fabs(a - b) <= tol;
}

static unsigned gRandState = 12345;
static float frand() {
    gRandState = gRandState * 1664525u + 1013904223u;
    return ((gRandState >> 8) & 0xFFFFFF) / 8388608.0f - 1.0f;
}

// Konvolusi langsung (referensi): out[n] = sum in[n-k]*ir[k].
static std::vector<float> directConv(
    const std::vector<float>& in,
    const std::vector<float>& ir
) {
    std::vector<float> out(in.size(), 0.0f);
    for (size_t n = 0; n < in.size(); ++n) {
        for (size_t k = 0; k < ir.size() && k <= n; ++k) {
            out[n] += in[n - k] * ir[k];
        }
    }
    return out;
}

// =====================================================
// [1] Multi-partisi vs konvolusi langsung
// =====================================================
static void testMultiPartition() {
    std::printf("\n[1] Multi-partisi vs konvolusi langsung\n");

    std::vector<float> ir(1000);
    for (auto& v : ir) v = frand() * 0.5f;
    std::vector<float> in(5000);
    for (auto& v : in) v = frand();
    const std::vector<float> ref = directConv(in, ir);

    UniformPartitionedConvolver conv;
    conv.prepare(48000);
    check("setKernelPartitioned(1000 tap) ok",
          conv.setKernelPartitioned(ir.data(), 1000));

    // Streaming dengan chunk aneh (ala Oboe): 1, 7, 256, 333, 1920...
    std::vector<float> out(5000, 0.0f);
    int pos = 0;
    const int sizes[] = {1, 7, 256, 333, 1920, 5, 1000, 1278};
    int si = 0;
    while (pos < 5000) {
        int n = sizes[si++ % 8];
        if (pos + n > 5000) n = 5000 - pos;
        conv.process(in.data() + pos, out.data() + pos, n);
        pos += n;
    }

    // Latensi tepat 1 blok: out[n] == ref[n-256]; 256 pertama nol.
    float maxErr = 0.0f;
    for (int n = 256; n < 5000; ++n) {
        maxErr = std::max(maxErr, std::fabs(out[n] - ref[n - 256]));
    }
    float maxHead = 0.0f;
    for (int n = 0; n < 256; ++n) {
        maxHead = std::max(maxHead, std::fabs(out[n]));
    }
    check("4 partisi terpasang", conv.numPartitions() == 4);
    check("output = ref tertunda 256 (err < 1e-3)",
          maxErr < 1e-3f);
    check("256 sampel pertama = 0 (latensi 1 blok)",
          maxHead < 1e-6f);

    // Batas: 98305 tap ditolak, 98304 diterima.
    std::vector<float> tooLong(
        UniformPartitionedConvolver::kMaxMultiKernelLength + 1, 0.0f);
    check("kernel 98305 tap ditolak",
          !conv.setKernelPartitioned(
              tooLong.data(),
              (int)tooLong.size()));
    check("kernel lama dipertahankan sesudah tolak",
          conv.numPartitions() == 4);
}

// =====================================================
// [2] Satu partisi (jalur HRTF) tidak berubah
// =====================================================
static void testSinglePartition() {
    std::printf("\n[2] Satu partisi (jalur HRTF)\n");

    std::vector<float> ir(200);
    for (auto& v : ir) v = frand() * 0.5f;
    std::vector<float> in(2000);
    for (auto& v : in) v = frand();
    const std::vector<float> ref = directConv(in, ir);

    UniformPartitionedConvolver conv;
    conv.prepare(48000);
    check("setKernel(200 tap) ok",
          conv.setKernel(ir.data(), 200));
    std::vector<float> out(2000, 0.0f);
    conv.process(in.data(), out.data(), 2000);
    float maxErr = 0.0f;
    for (int n = 256; n < 2000; ++n) {
        maxErr = std::max(maxErr, std::fabs(out[n] - ref[n - 256]));
    }
    check("1 partisi, output = ref tertunda 256 (err < 1e-3)",
          conv.numPartitions() == 1 && maxErr < 1e-3f);

    // Tanpa kernel = passthrough (tidak membisukan audio).
    UniformPartitionedConvolver empty;
    empty.prepare(48000);
    std::vector<float> outEmpty(512, 0.0f);
    empty.process(in.data(), outEmpty.data(), 512);
    bool identical = true;
    for (int i = 0; i < 512; ++i) {
        if (outEmpty[i] != in[i]) identical = false;
    }
    check("tanpa kernel = passthrough bit-exact", identical);
}

// =====================================================
// [3] Live swap kernel
// =====================================================
static void testLiveSwap() {
    std::printf("\n[3] Live swap kernel\n");

    std::vector<float> irA(512, 0.0f);
    irA[0] = 0.5f; // identitas × 0,5
    UniformPartitionedConvolver conv;
    conv.prepare(48000);
    check("kernel A terpasang",
          conv.setKernelPartitioned(irA.data(), 512));

    std::vector<float> in(3000, 0.0f);
    in[0] = 1.0f; // impuls
    std::vector<float> out(3000, 0.0f);
    conv.process(in.data(), out.data(), 3000);
    check("impuls A keluar di 256 × 0,5",
          nearly(out[256], 0.5f, 1e-4f));

    // Stage kernel B saat audio "jalan", lalu proses lagi.
    std::vector<float> irB(512, 0.0f);
    irB[0] = 1.0f; // identitas × 1
    const int genBefore = conv.kernelGeneration();
    check("kernel B di-stage",
          conv.setKernelPartitioned(irB.data(), 512));
    std::vector<float> in2(3000, 0.0f);
    in2[0] = 1.0f;
    std::vector<float> out2(3000, 0.0f);
    conv.process(in2.data(), out2.data(), 3000);
    check("generasi naik 1 saat swap",
          conv.kernelGeneration() == genBefore + 1);
    check("impuls B keluar di 256 × 1,0",
          nearly(out2[256], 1.0f, 1e-4f));
}

// =====================================================
// [4] IRLoader
// =====================================================
static void w16(std::vector<uint8_t>& b, uint16_t v) {
    b.push_back(v & 0xFF);
    b.push_back((v >> 8) & 0xFF);
}
static void w32(std::vector<uint8_t>& b, uint32_t v) {
    b.push_back(v & 0xFF);
    b.push_back((v >> 8) & 0xFF);
    b.push_back((v >> 16) & 0xFF);
    b.push_back((v >> 24) & 0xFF);
}
static void tag(std::vector<uint8_t>& b, const char* t) {
    for (int i = 0; i < 4; ++i) b.push_back((uint8_t)t[i]);
}
static std::vector<uint8_t> makeWav(
    int format, int ch, int rate, int bits,
    const std::vector<uint8_t>& data,
    bool withJunkChunk = false
) {
    std::vector<uint8_t> b;
    tag(b, "RIFF");
    const size_t sizePos = b.size();
    w32(b, 0);
    tag(b, "WAVE");
    if (withJunkChunk) {
        tag(b, "LIST");
        w32(b, 5);
        b.push_back('a'); b.push_back('b'); b.push_back('c');
        b.push_back('d'); b.push_back('e'); b.push_back(0);
    }
    tag(b, "fmt ");
    w32(b, 16);
    w16(b, (uint16_t)format);
    w16(b, (uint16_t)ch);
    w32(b, (uint32_t)rate);
    w32(b, (uint32_t)(rate * ch * bits / 8));
    w16(b, (uint16_t)(ch * bits / 8));
    w16(b, (uint16_t)bits);
    tag(b, "data");
    w32(b, (uint32_t)data.size());
    b.insert(b.end(), data.begin(), data.end());
    const uint32_t riffSize = (uint32_t)(b.size() - 8);
    b[sizePos] = riffSize & 0xFF;
    b[sizePos + 1] = (riffSize >> 8) & 0xFF;
    b[sizePos + 2] = (riffSize >> 16) & 0xFF;
    b[sizePos + 3] = (riffSize >> 24) & 0xFF;
    return b;
}
static bool writeFile(const char* path, const std::vector<uint8_t>& b) {
    FILE* f = std::fopen(path, "wb");
    if (!f) return false;
    std::fwrite(b.data(), 1, b.size(), f);
    std::fclose(f);
    return true;
}

static void testIRLoader() {
    std::printf("\n[4] IRLoader\n");
    WavIrData out;

    // Mono 16-bit 44,1 kHz (+ chunk junk ganjil sebelum fmt).
    {
        std::vector<uint8_t> d;
        auto s16 = [&](int16_t v) { w16(d, (uint16_t)v); };
        s16(0); s16(16384); s16(-16384); s16(32767);
        check("tulis mono16",
              writeFile("/tmp/pristine-test-ir-mono16.wav",
                        makeWav(1, 1, 44100, 16, d, true)));
        check("mono16 Ok",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-mono16.wav",
                                    out) == IrLoadStatus::Ok);
        check("mono16 rate + jumlah",
              out.sampleRateHz == 44100 && out.samples.size() == 4);
        check("mono16 +0,5 / -0,5",
              nearly(out.samples[1], 0.5f, 1e-6f) &&
              nearly(out.samples[2], -0.5f, 1e-6f));
    }
    // Stereo 24-bit: mix (L+R)/2.
    {
        std::vector<uint8_t> d;
        auto s24 = [&](int32_t v) {
            d.push_back(v & 0xFF);
            d.push_back((v >> 8) & 0xFF);
            d.push_back((v >> 16) & 0xFF);
        };
        s24(4194304); s24(-4194304);
        s24(8388607); s24(8388607);
        writeFile("/tmp/pristine-test-ir-st24.wav",
                  makeWav(1, 2, 48000, 24, d));
        check("stereo24 Ok + mix mono",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-st24.wav",
                                    out) == IrLoadStatus::Ok &&
              out.samples.size() == 2 &&
              nearly(out.samples[0], 0.0f, 1e-6f) &&
              nearly(out.samples[1], 1.0f, 1e-5f));
    }
    // Float NaN, garbage, missing, sunyi, laju, terlalu panjang.
    {
        std::vector<uint8_t> d;
        const float nan = std::nanf("");
        uint32_t bits = 0;
        std::memcpy(&bits, &nan, 4);
        w32(d, bits);
        writeFile("/tmp/pristine-test-ir-nan.wav",
                  makeWav(3, 1, 48000, 32, d));
        check("float NaN -> FormatError",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-nan.wav",
                                    out) == IrLoadStatus::FormatError);
        std::vector<uint8_t> g(100, 0x41);
        writeFile("/tmp/pristine-test-ir-garbage.wav", g);
        check("garbage -> FormatError",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-garbage.wav",
                                    out) == IrLoadStatus::FormatError);
        check("missing -> FileError",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-nope.wav",
                                    out) == IrLoadStatus::FileError);
        std::vector<uint8_t> z(8, 0);
        writeFile("/tmp/pristine-test-ir-zero.wav",
                  makeWav(1, 1, 48000, 16, z));
        check("all-zero -> Silent",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-zero.wav",
                                    out) == IrLoadStatus::Silent);
        std::vector<uint8_t> r;
        w16(r, 1000);
        writeFile("/tmp/pristine-test-ir-rate.wav",
                  makeWav(1, 1, 4000, 16, r));
        check("rate 4000 -> RateError",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-rate.wav",
                                    out) == IrLoadStatus::RateError);
        std::vector<uint8_t> big(11 * 8000 * 2, 0);
        big[0] = 1;
        writeFile("/tmp/pristine-test-ir-long.wav",
                  makeWav(1, 1, 8000, 16, big));
        check("11 detik -> TooLong",
              IRLoader::loadWavMono("/tmp/pristine-test-ir-long.wav",
                                    out) == IrLoadStatus::TooLong);
    }
}

// =====================================================
// [5] ConvolverNode
// =====================================================
static void testConvolverNode() {
    std::printf("\n[5] ConvolverNode\n");

    DSPConfig config;
    config.enabled = true;
    config.convolverEnabled = true;

    // Tanpa IR + enabled = passthrough bit-exact (impuls di n=0).
    {
        ConvolverNode node;
        node.prepare(48000, 1920);
        node.applyConfig(config);
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        l[0] = 1.0f; r[0] = 1.0f;
        node.process(l.data(), r.data(), 1024);
        check("tanpa IR + enabled = passthrough (impuls di 0)",
              l[0] == 1.0f && r[0] == 1.0f && l[256] == 0.0f);
    }

    // IR identitas + enabled: impuls keluar tertunda 1 blok (256)
    // sesudah wet settle (dorong 5000 nol dulu supaya fade ~10 ms
    // selesai: wet -> 1).
    {
        ConvolverNode node;
        node.prepare(48000, 1920);
        const std::vector<float> ir = {1.0f};
        node.setIrSource(ir, 48000);
        node.prepare(48000, 1920);
        node.applyConfig(config);
        std::vector<float> zl(5000, 0.0f), zr(5000, 0.0f);
        node.process(zl.data(), zr.data(), 5000);
        check("wet settle ke 1 sesudah fade",
              node.wetCurrent() > 0.99f);
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        l[0] = 1.0f; r[0] = 1.0f;
        node.process(l.data(), r.data(), 1024);
        // l[0] tidak persis 0: wet asimtotik (~0,99995 sesudah 5000
        // sampel) masih melewatkan dry ~4,5e-05 — itu fade, bukan
        // bocor; toleransi 1e-3.
        check("IR identitas: impuls keluar di 256",
              nearly(l[256], 1.0f, 1e-3f) &&
              nearly(r[256], 1.0f, 1e-3f) && l[0] < 1e-3f);
    }

    // Toggle OFF dengan IR terpasang = passthrough bit-exact.
    {
        ConvolverNode node;
        node.prepare(48000, 1920);
        const std::vector<float> ir = {1.0f};
        node.setIrSource(ir, 48000);
        node.prepare(48000, 1920);
        DSPConfig off = config;
        off.convolverEnabled = false;
        node.applyConfig(off);
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        l[0] = 1.0f; r[0] = 1.0f;
        node.process(l.data(), r.data(), 1024);
        check("toggle OFF + IR = passthrough bit-exact",
              l[0] == 1.0f && r[0] == 1.0f && l[256] == 0.0f);
    }

    // Clear IR saat enabled = kembali passthrough (fade-out, lalu
    // bit-exact: dorong cukup banyak nol supaya wet settle ke 0).
    {
        ConvolverNode node;
        node.prepare(48000, 1920);
        const std::vector<float> ir = {1.0f};
        node.setIrSource(ir, 48000);
        node.prepare(48000, 1920);
        node.applyConfig(config);
        std::vector<float> zl(5000, 0.0f), zr(5000, 0.0f);
        node.process(zl.data(), zr.data(), 5000);
        node.clearIr();
        node.process(zl.data(), zr.data(), 5000);
        check("clear IR -> wet kembali 0",
              node.wetCurrent() < 1e-3f);
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        l[0] = 1.0f; r[0] = 1.0f;
        node.process(l.data(), r.data(), 1024);
        check("sesudah clear = passthrough bit-exact",
              l[0] == 1.0f && r[0] == 1.0f && l[256] == 0.0f);
    }

    // Resample: IR 2205 tap @22050 Hz -> 4800 tap @48 kHz.
    {
        ConvolverNode node;
        node.prepare(48000, 1920);
        const std::vector<float> ir(2205, 0.0f);
        node.setIrSource(ir, 22050);
        check("taps 22050->48000 = 4800",
              node.irTapsForRate(48000) == 4800);
        check("taps 22050->44100 = 4410",
              node.irTapsForRate(44100) == 4410);
    }
}

// =====================================================
// [6] DSPChain
// =====================================================
static void testDSPChain() {
    std::printf("\n[6] DSPChain\n");

    // Convolver idle (tanpa IR) = rantai tak berubah (bit-exact).
    {
        DSPChain chain;
        chain.prepare(48000, 1920);
        DSPConfig config;
        config.enabled = true;
        config.convolverEnabled = true;
        chain.applyConfig(config);
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        // Impuls 0,5 (bukan 1,0): limiter ambang 0,98 akan
        // melembutkan impuls 1,0 — itu tugas limiter, bukan convolver.
        l[0] = 0.5f; r[0] = 0.5f;
        chain.process(l.data(), r.data(), 1024);
        check("chain tanpa IR + enabled = bit-exact",
              l[0] == 0.5f && r[0] == 0.5f && l[256] == 0.0f);
        check("chain tanpa IR: loaded=false",
              !chain.convolverIrLoaded());
    }

    // Load IR identitas via chain: status + info.
    {
        std::vector<uint8_t> d;
        w16(d, 32767); // satu tap ~1,0
        writeFile("/tmp/pristine-test-ir-id.wav",
                  makeWav(1, 1, 48000, 16, d));
        DSPChain chain;
        chain.prepare(48000, 1920);
        const int status =
            chain.loadConvolverIr("/tmp/pristine-test-ir-id.wav");
        check("chain load IR identitas -> Ok",
              status == ConvolverNode::kLoadOk);
        check("chain info: loaded + 48k + 1 tap + 0 ms",
              chain.convolverIrLoaded() &&
              chain.convolverIrSampleRateHz() == 48000 &&
              chain.convolverIrTaps() == 1 &&
              chain.convolverIrDurationMs() == 0);

        // IR terlalu panjang sesudah resample (2,5 dtk @48k = 120000
        // tap > 98304) ditolak DAN IR lama dipertahankan.
        std::vector<uint8_t> big(120000 * 2, 0);
        big[0] = 1;
        writeFile("/tmp/pristine-test-ir-25s.wav",
                  makeWav(1, 1, 48000, 16, big));
        const int statusLong =
            chain.loadConvolverIr("/tmp/pristine-test-ir-25s.wav");
        check("IR 2,5 dtk -> TooLong",
              statusLong == ConvolverNode::kLoadTooLong);
        check("IR lama dipertahankan sesudah tolak",
              chain.convolverIrLoaded() &&
              chain.convolverIrTaps() == 1);

        // File garbage -> FormatError, IR lama tetap.
        const int statusBad = chain.loadConvolverIr(
            "/tmp/pristine-test-ir-garbage.wav");
        check("garbage -> FormatError, IR lama tetap",
              statusBad == ConvolverNode::kLoadFormatError &&
              chain.convolverIrLoaded());

        // Clear.
        chain.clearConvolverIr();
        check("clear -> loaded=false, taps=0",
              !chain.convolverIrLoaded() &&
              chain.convolverIrTaps() == 0);
    }

    // IR 44,1 kHz 1 detik via chain @48k: taps ~48000, durasi 1000 ms.
    {
        std::vector<uint8_t> d(44100 * 2, 0);
        d[0] = 1;
        writeFile("/tmp/pristine-test-ir-1s441.wav",
                  makeWav(1, 1, 44100, 16, d));
        DSPChain chain;
        chain.prepare(48000, 1920);
        check("chain load IR 44,1k 1 dtk -> Ok",
              chain.loadConvolverIr(
                  "/tmp/pristine-test-ir-1s441.wav") ==
              ConvolverNode::kLoadOk);
        check("chain info: 48000 tap, 1000 ms",
              chain.convolverIrTaps() == 48000 &&
              chain.convolverIrDurationMs() == 1000);
    }
}

int main() {
    testMultiPartition();
    testSinglePartition();
    testLiveSwap();
    testIRLoader();
    testConvolverNode();
    testDSPChain();

    std::printf("\n========================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("========================================\n");
    return gFail == 0 ? 0 : 1;
}
