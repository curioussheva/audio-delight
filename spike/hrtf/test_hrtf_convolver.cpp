// =====================================================
// spike/hrtf/test_hrtf_convolver.cpp
// =====================================================
//
// Harness host untuk konvolver partitioned HRTF. Semua yang bisa
// dibuktikan tanpa perangkat dibuktikan di sini:
//
//   1. FFTPlan round-trip (forward -> inverse = identitas).
//   2. Konvolver vs FIR langsung (FIRFilter, referensi) pada sinyal
//      panjang, dengan SEMUA ukuran chunk process() 1..1920 —
//      membuktikan FIFO streaming + latensi satu blok, bukan cuma
//      kelipatan 256.
//   3. Tes impuls: output = IR (digeser satu blok).
//   4. Sunyi -> sunyi; NaN tidak menggantung (reset membersihkan).
//   5. Validasi kernel (panjang, NaN, null).
//   6. Passthrough bila kernel belum dimuat.
//
// Bangun & jalankan (dari root repo):
//   cmake -S spike/hrtf -B /tmp/hrtf-build
//   cmake --build /tmp/hrtf-build
//   /tmp/hrtf-build/test_hrtf_convolver
//
// Atau langsung g++:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp
//     spike/hrtf/test_hrtf_convolver.cpp
//     android/app/src/main/cpp/dsp/convolution/UniformPartitionedConvolver.cpp
//     android/app/src/main/cpp/dsp/convolution/FIRFilter.cpp
//     android/app/src/main/cpp/fft/FFTPlan.cpp
//     -o /tmp/test_hrtf_convolver && /tmp/test_hrtf_convolver
//
// Dengan sanitizer:
//   g++ -std=c++17 -O1 -g -fsanitize=address,undefined -I android/app/src/main/cpp
//     (file yang sama) -o /tmp/test_hrtf_convolver_asan && /tmp/test_hrtf_convolver_asan
//
// Yang TIDAK dibuktikan harness ini (butuh build NDK + HP):
//   kompilasi NDK, bunyi di headphone, CPU di POCO M6, gate.
//   Lihat hrtf-implementation-report.md.
//
// SPDX-License-Identifier: MIT

#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>
#include <vector>

#include "dsp/convolution/FIRFilter.h"
#include "dsp/convolution/UniformPartitionedConvolver.h"
#include "fft/FFTPlan.h"

namespace {

int gChecks = 0;
int gFailures = 0;

void check(bool ok, const char* name) {
    ++gChecks;
    if (!ok) {
        ++gFailures;
        std::printf("FAIL: %s\n", name);
    } else {
        std::printf("ok: %s\n", name);
    }
}

float maxAbsDiff(
    const std::vector<float>& a,
    const std::vector<float>& b
) {
    float m = 0.0f;
    const size_t n = a.size() < b.size() ? a.size() : b.size();
    for (size_t i = 0; i < n; ++i) {
        const float d = std::fabs(a[i] - b[i]);
        if (d > m) {
            m = d;
        }
    }
    return m;
}

// Referensi: konvolusi langsung (FIRFilter, per sampel).
std::vector<float> directConvolve(
    const std::vector<float>& input,
    const std::vector<float>& kernel
) {
    pristine::FIRFilter fir;
    fir.setKernel(kernel);
    std::vector<float> out(input.size());
    for (size_t i = 0; i < input.size(); ++i) {
        out[i] = fir.process(input[i]);
    }
    return out;
}

// Jalankan konvolver dengan chunk process() berukuran `chunk`
// (chunk <= 0 = satu panggilan untuk seluruh sinyal).
std::vector<float> chunkedConvolve(
    pristine::UniformPartitionedConvolver& conv,
    const std::vector<float>& input,
    int chunk
) {
    std::vector<float> out(input.size(), 0.0f);
    if (chunk <= 0) {
        conv.process(
            input.data(),
            out.data(),
            static_cast<int>(input.size())
        );
        return out;
    }
    size_t pos = 0;
    while (pos < input.size()) {
        const int n = static_cast<int>(
            input.size() - pos < static_cast<size_t>(chunk)
                ? input.size() - pos
                : static_cast<size_t>(chunk)
        );
        conv.process(input.data() + pos, out.data() + pos, n);
        pos += static_cast<size_t>(n);
    }
    return out;
}

std::vector<float> randomSignal(
    size_t n,
    float amplitude,
    unsigned seed
) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-amplitude, amplitude);
    std::vector<float> out(n);
    for (size_t i = 0; i < n; ++i) {
        out[i] = dist(rng);
    }
    return out;
}

// Kernel mirip HRIR: onset tajam + peluruhan eksponensial.
std::vector<float> decayingKernel(int length, unsigned seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
    std::vector<float> k(static_cast<size_t>(length));
    for (int i = 0; i < length; ++i) {
        const float env = std::exp(-static_cast<float>(i) / 40.0f);
        k[static_cast<size_t>(i)] = dist(rng) * env;
    }
    // Normalisasi: peak = 1.
    float peak = 0.0f;
    for (float v : k) {
        peak = std::fmax(peak, std::fabs(v));
    }
    if (peak > 0.0f) {
        for (float& v : k) {
            v /= peak;
        }
    }
    return k;
}

constexpr int kBlock = pristine::UniformPartitionedConvolver::kBlockSize;

void testFftRoundTrip() {
    pristine::FFTPlan plan(512);
    check(plan.isValid(), "FFTPlan(512) valid");

    const std::vector<float> in = randomSignal(512, 1.0f, 42);
    std::vector<pristine::Complex> spec(512);
    std::vector<float> back(512);
    plan.forward(in.data(), spec.data());
    plan.inverse(spec.data(), back.data());

    const float diff = maxAbsDiff(in, back);
    std::printf("  fft round-trip max diff = %.3e\n", diff);
    check(diff < 1e-5f, "FFTPlan forward->inverse = identitas");
}

void testConvolverVsDirect() {
    const std::vector<float> kernel = decayingKernel(256, 7);
    const std::vector<float> input = randomSignal(48000, 0.9f, 123);
    const std::vector<float> ref = directConvolve(input, kernel);

    // Chunk sizes: kelipatan blok, bukan kelipatan, 1, dan 1920
    // (maks callback). Konvolver terlambat tepat satu blok: output
    // sampel n = referensi sampel n-256; 256 sampel pertama = 0.
    const int chunks[] = {0, 1, 7, 63, 128, 255, 256, 257, 511, 512,
                          1000, 1920};
    for (int chunk : chunks) {
        pristine::UniformPartitionedConvolver conv;
        conv.prepare(48000);
        check(conv.setKernel(kernel.data(), 256), "setKernel 256 tap");
        const std::vector<float> out = chunkedConvolve(conv, input, chunk);

        // Bandingkan dari sampel 256 ke depan.
        float diff = 0.0f;
        for (size_t i = kBlock; i < input.size(); ++i) {
            diff = std::fmax(diff, std::fabs(out[i] - ref[i - kBlock]));
        }
        // 256 sampel pertama harus nol (prime latensi).
        float headMax = 0.0f;
        for (int i = 0; i < kBlock; ++i) {
            headMax = std::fmax(headMax, std::fabs(out[static_cast<size_t>(i)]));
        }
        char name[128];
        std::snprintf(
            name, sizeof(name),
            "konvolver == FIR langsung (chunk=%d)", chunk
        );
        std::printf(
            "  chunk=%-5d max diff = %.3e, head max = %.3e\n",
            chunk, diff, headMax
        );
        check(diff < 1e-4f, name);
        std::snprintf(
            name, sizeof(name),
            "256 sampel pertama nol (chunk=%d)", chunk
        );
        check(headMax == 0.0f, name);
    }
}

void testImpulse() {
    const std::vector<float> kernel = decayingKernel(256, 99);
    std::vector<float> input(4096, 0.0f);
    input[0] = 1.0f;

    pristine::UniformPartitionedConvolver conv;
    conv.prepare(48000);
    conv.setKernel(kernel.data(), 256);
    std::vector<float> out(4096, 0.0f);
    conv.process(input.data(), out.data(), 4096);

    // Output = IR, digeser satu blok (256). Ekor sesudah 256+256 = 0.
    float diff = 0.0f;
    for (int i = 0; i < 256; ++i) {
        diff = std::fmax(
            diff,
            std::fabs(out[static_cast<size_t>(kBlock + i)] - kernel[static_cast<size_t>(i)])
        );
    }
    float tailMax = 0.0f;
    for (int i = 512; i < 4096; ++i) {
        tailMax = std::fmax(tailMax, std::fabs(out[static_cast<size_t>(i)]));
    }
    std::printf(
        "  impulse: IR diff = %.3e, tail max = %.3e\n", diff, tailMax
    );
    check(diff < 1e-5f, "impuls -> IR digeser satu blok");
    check(tailMax < 1e-6f, "ekor impuls nol sesudah IR habis");
}

void testSilenceAndNan() {
    const std::vector<float> kernel = decayingKernel(256, 5);
    pristine::UniformPartitionedConvolver conv;
    conv.prepare(48000);
    conv.setKernel(kernel.data(), 256);

    std::vector<float> zeros(2048, 0.0f);
    std::vector<float> out(2048, 1.0f);
    conv.process(zeros.data(), out.data(), 2048);
    float m = 0.0f;
    for (float v : out) {
        m = std::fmax(m, std::fabs(v));
    }
    check(m == 0.0f, "sunyi -> sunyi");

    // NaN masuk: tidak crash; sesudah reset, sunyi lagi.
    std::vector<float> nanIn(512, 0.0f);
    nanIn[10] = std::nanf("");
    std::vector<float> nanOut(512, 0.0f);
    conv.process(nanIn.data(), nanOut.data(), 512);
    check(true, "NaN masuk tidak crash");
    conv.reset();
    std::vector<float> out2(512, 1.0f);
    conv.process(zeros.data(), out2.data(), 512);
    m = 0.0f;
    for (float v : out2) {
        m = std::fmax(m, std::fabs(v));
    }
    check(m == 0.0f, "reset() membersihkan state sesudah NaN");
}

void testKernelValidation() {
    pristine::UniformPartitionedConvolver conv;
    conv.prepare(48000);
    const std::vector<float> kernel(256, 0.5f);
    std::vector<float> nanKernel(256, 0.5f);
    nanKernel[3] = std::nanf("");

    check(!conv.setKernel(nullptr, 256), "tolak kernel null");
    check(!conv.setKernel(kernel.data(), 0), "tolak panjang 0");
    check(!conv.setKernel(kernel.data(), 257), "tolak panjang > 256");
    check(!conv.setKernel(nanKernel.data(), 256), "tolak kernel NaN");
    check(!conv.isReady(), "tidak ready sesudah penolakan");

    std::vector<float> one(1, 1.0f);
    check(conv.setKernel(one.data(), 1), "terima panjang 1");
    check(conv.isReady(), "ready sesudah kernel valid");

    // Passthrough bila belum ada kernel.
    pristine::UniformPartitionedConvolver fresh;
    fresh.prepare(48000);
    const std::vector<float> in = randomSignal(100, 0.8f, 3);
    std::vector<float> out(100, 0.0f);
    fresh.process(in.data(), out.data(), 100);
    check(maxAbsDiff(in, out) == 0.0f, "passthrough bila kernel belum dimuat");
}

void testRandomChunkStream() {
    // Aliran panjang dengan ukuran chunk acak per panggilan —
    // skenario callback nyata yang paling mendekati.
    const std::vector<float> kernel = decayingKernel(256, 31);
    const std::vector<float> input = randomSignal(96000, 0.9f, 77);
    const std::vector<float> ref = directConvolve(input, kernel);

    pristine::UniformPartitionedConvolver conv;
    conv.prepare(48000);
    conv.setKernel(kernel.data(), 256);

    std::mt19937 rng(2024);
    std::uniform_int_distribution<int> chunkDist(1, 1920);
    std::vector<float> out(input.size(), 0.0f);
    size_t pos = 0;
    while (pos < input.size()) {
        const int n = std::min<int>(
            chunkDist(rng),
            static_cast<int>(input.size() - pos)
        );
        conv.process(input.data() + pos, out.data() + pos, n);
        pos += static_cast<size_t>(n);
    }

    float diff = 0.0f;
    for (size_t i = kBlock; i < input.size(); ++i) {
        diff = std::fmax(diff, std::fabs(out[i] - ref[i - kBlock]));
    }
    std::printf("  random chunks max diff = %.3e\n", diff);
    check(diff < 1e-4f, "chunk acak 1..1920 == FIR langsung");
}

} // namespace

int main() {
    std::printf("== HRTF convolver host tests ==\n");
    testFftRoundTrip();
    testConvolverVsDirect();
    testImpulse();
    testSilenceAndNan();
    testKernelValidation();
    testRandomChunkStream();
    std::printf(
        "== %d checks, %d failures ==\n", gChecks, gFailures
    );
    return gFailures == 0 ? 0 : 1;
}
