// scripts/test_visualizer_buffer.cpp
//
// Uji VisualizerBuffer: buktikan read() mengembalikan data yang ditulis
// write() — bukan nol, bukan data robek.
//
// Latar: perbaikan anti-tearing 9848ed0d membuat read() membaca buffer
// KEBALIKAN dari write(). Karena mWriteBuffer tidak pernah di-flip (tidak
// ada store() di file mana pun), penulis selalu ke mBufferA sementara
// pembaca selalu dari mBufferB — yang hanya berisi nol dari konstruktor.
// Akibatnya getFFTData() selalu menerima nol. Test ini gagal pada kode
// sebelum perbaikan B3 (2026-11-10) dan lolos sesudahnya.
//
// Cara jalankan (dari akar proyek):
//   g++ -std=c++17 -O2 -Iandroid/app/src/main/cpp/visualizer \
//       scripts/test_visualizer_buffer.cpp \
//       android/app/src/main/cpp/visualizer/VisualizerBuffer.cpp \
//       -o "$TMPDIR/test_visualizer_buffer" && "$TMPDIR/test_visualizer_buffer"

#include "VisualizerBuffer.h"

#include <cmath>
#include <cstdio>
#include <limits>
#include <vector>

using namespace pristine;

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

static bool nearly(float a, float b, float tol = 1e-5f) {
    return std::fabs(a - b) <= tol;
}

// CATATAN (2026-11-11, V-M1): write() men-sanitize seperti sanitizeOutput —
// NaN/Inf/|x|>2 → 0.0f. Karena itu data pola di test ini HARUS dalam
// rentang audio (|x| <= 2); nilai penanda seperti 10.0f akan di-nol-kan
// dan test jendela gagal — bukan karena ring-nya rusak, tapi karena
// datanya di luar rentang audio yang sah.
static void writePattern(VisualizerBuffer& buf, const std::vector<float>& v) {
    buf.write(v.data(), v.data(), static_cast<int32_t>(v.size()));
}

// =====================================================
// 1. Tulis satu ring penuh (2048), baca 2048 -> sama persis
// =====================================================
static void testFullRing() {
    std::printf("\n[1] Tulis 2048, baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> in(2048);
    for (int i = 0; i < 2048; ++i) in[i] = std::sin(i * 0.01f) * 0.5f;
    writePattern(buf, in);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    bool ok = true;
    bool anyNonZero = false;
    for (int i = 0; i < 2048; ++i) {
        if (out[i] != 0.0f) anyNonZero = true;
        if (!nearly(out[i], in[i])) { ok = false; break; }
    }
    check(anyNonZero, "read() mengembalikan data bukan nol (B3)");
    check(ok, "2048 sample terakhir sama dengan yang ditulis");
}

// =====================================================
// 2. Tulis 2048 lalu 512 lagi, baca 2048 -> 2048 terakhir
// =====================================================
static void testAdvance() {
    std::printf("\n[2] Tulis 2048 + 512, baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> first(2048);
    for (int i = 0; i < 2048; ++i) first[i] = i * 0.0005f;
    writePattern(buf, first);

    std::vector<float> second(512);
    for (int i = 0; i < 512; ++i) second[i] = 1.5f + i * 0.0005f;
    writePattern(buf, second);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    bool ok = true;
    for (int i = 0; i < 2048; ++i) {
        float expected = (i < 1536) ? first[512 + i] : second[i - 1536];
        if (!nearly(out[i], expected)) { ok = false; break; }
    }
    check(ok, "jendela 2048 terakhir bergeser mengikuti write()");
}

// =====================================================
// 3. Ring belum penuh: tulis 100, baca 2048
// =====================================================
static void testPartial() {
    std::printf("\n[3] Tulis 100 (ring belum penuh), baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> in(100, 1.0f);
    writePattern(buf, in);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    bool headZero = true;
    for (int i = 0; i < 1948; ++i) {
        if (out[i] != 0.0f) { headZero = false; break; }
    }
    bool tailOne = true;
    for (int i = 1948; i < 2048; ++i) {
        if (!nearly(out[i], 1.0f)) { tailOne = false; break; }
    }
    check(headZero, "bagian awal (belum ditulis) tetap nol");
    check(tailOne, "100 sample terakhir = data yang ditulis");
}

// =====================================================
// 4. Wrap-around: tulis 3000, baca 2048 -> 2048 terakhir
// =====================================================
static void testWrap() {
    std::printf("\n[4] Tulis 3000 (melewati satu putaran ring), baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> in(3000);
    for (int i = 0; i < 3000; ++i) in[i] = i * 0.0005f;
    writePattern(buf, in);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    bool ok = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(out[i], (952 + i) * 0.0005f)) { ok = false; break; }
    }
    check(ok, "setelah wrap, 2048 terakhir benar (952..2999)");
}

// =====================================================
// 5. Sanitasi (V-M1): NaN/Inf/|x|>2 -> 0.0f
// =====================================================
static void testSanitize() {
    std::printf("\n[5] Sanitasi: NaN/Inf/|x|>2 jadi 0\n");

    VisualizerBuffer buf;
    std::vector<float> in = {
        0.5f, std::nanf(""), std::numeric_limits<float>::infinity(),
        -std::numeric_limits<float>::infinity(), 2.5f, -3.0f, 1.0f, -1.0f
    };
    writePattern(buf, in);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    // 8 sample terakhir = data yang ditulis (sudah di-sanitize).
    bool ok = true;
    const float expected[8] = {0.5f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, -1.0f};
    for (int i = 0; i < 8; ++i) {
        if (!nearly(out[2040 + i], expected[i])) { ok = false; break; }
    }
    check(ok, "NaN/Inf/|x|>2 di-nol-kan, nilai sah dipertahankan");
}

// =====================================================
// 6. Guard (V-M2/V-m1): write(frames<=0) no-op, read(size>kSize) clamp
// =====================================================
static void testGuards() {
    std::printf("\n[6] Guard: write negatif no-op, read >2048 di-clamp\n");

    VisualizerBuffer buf;
    std::vector<float> in(100);
    for (int i = 0; i < 100; ++i) in[i] = i * 0.01f;
    writePattern(buf, in);

    std::vector<float> before(2048, -1.0f);
    buf.read(before.data(), 2048);

    buf.write(in.data(), in.data(), -3); // frames negatif: posisi mundur?
    buf.write(in.data(), in.data(), 0);  // frames 0: no-op
    buf.write(nullptr, nullptr, 10);     // pointer null: no-op

    std::vector<float> after(2048, -1.0f);
    buf.read(after.data(), 2048);

    bool posUnchanged = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(before[i], after[i])) { posUnchanged = false; break; }
    }
    check(posUnchanged, "write(frames<=0/null) tidak mengubah posisi/data");

    // read(4096) harus kembalikan 2048 sample terakhir SATU kali
    // (clamp ke kSize), bukan jendela berulang.
    std::vector<float> big(4096, -1.0f);
    buf.read(big.data(), 4096);
    bool noRepeat = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(big[i], before[i])) { noRepeat = false; break; }
    }
    check(noRepeat, "read(4096) di-clamp ke 2048 terakhir (tanpa duplikasi)");
}

int main() {
    std::printf("VisualizerBuffer write->read\n");
    std::printf("============================\n");

    testFullRing();
    testAdvance();
    testPartial();
    testWrap();
    testSanitize();
    testGuards();

    std::printf("\n%d lulus, %d gagal\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
