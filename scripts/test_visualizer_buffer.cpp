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

// B17-V1 (2026-11-15): ring kSize = 4096, jendela baca kReadSize =
// 2048. Tes memakai konstanta itu (bukan hardcode 2048) supaya drift
// ukuran ketahuan di compile-time, bukan lewat hasil yang diam-diam
// salah. "Satu ring penuh" = 4096 tulis, "jendela" = 2048 baca.
// NaN/Inf/|x|>2 → 0.0f. Karena itu data pola di test ini HARUS dalam
// rentang audio (|x| <= 2); nilai penanda seperti 10.0f akan di-nol-kan
// dan test jendela gagal — bukan karena ring-nya rusak, tapi karena
// datanya di luar rentang audio yang sah.
static void writePattern(VisualizerBuffer& buf, const std::vector<float>& v) {
    buf.write(v.data(), v.data(), static_cast<int32_t>(v.size()));
}

// =====================================================
// 1. Tulis satu ring penuh (4096), baca 2048 -> 2048 terakhir
// =====================================================
static void testFullRing() {
    std::printf("\n[1] Tulis 4096 (satu ring penuh), baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> in(VisualizerBuffer::kSize);
    for (uint32_t i = 0; i < VisualizerBuffer::kSize; ++i)
        in[i] = std::sin(i * 0.01f) * 0.5f;
    writePattern(buf, in);

    std::vector<float> out(VisualizerBuffer::kReadSize, -1.0f);
    buf.read(out.data(), VisualizerBuffer::kReadSize);

    bool ok = true;
    bool anyNonZero = false;
    for (uint32_t i = 0; i < VisualizerBuffer::kReadSize; ++i) {
        if (out[i] != 0.0f) anyNonZero = true;
        // Jendela baca = separuh akhir ring (B17-V1).
        if (!nearly(out[i], in[VisualizerBuffer::kReadSize + i])) { ok = false; break; }
    }
    check(anyNonZero, "read() mengembalikan data bukan nol (B3)");
    check(ok, "2048 sample terakhir sama dengan yang ditulis");
}

// =====================================================
// 2. Tulis 4096 lalu 512 lagi, baca 2048 -> 2048 terakhir
// =====================================================
static void testAdvance() {
    std::printf("\n[2] Tulis 4096 + 512, baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> first(VisualizerBuffer::kSize);
    for (uint32_t i = 0; i < VisualizerBuffer::kSize; ++i)
        // Skala 0.00025: maks ~1.02, di bawah batas sanitasi |x|>2 (V-M1).
        first[i] = i * 0.00025f;
    writePattern(buf, first);

    std::vector<float> second(512);
    for (int i = 0; i < 512; ++i) second[i] = 1.5f + i * 0.0005f;
    writePattern(buf, second);

    std::vector<float> out(VisualizerBuffer::kReadSize, -1.0f);
    buf.read(out.data(), VisualizerBuffer::kReadSize);

    bool ok = true;
    for (uint32_t i = 0; i < VisualizerBuffer::kReadSize; ++i) {
        // Total 4608 tulis, 2048 terakhir = first[2560..4095] + second[0..511].
        float expected = (i < 1536) ? first[2560 + i] : second[i - 1536];
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
// 4. Wrap-around: tulis 5000 (melewati satu putaran ring 4096),
// baca 2048 -> 2048 terakhir
// =====================================================
static void testWrap() {
    std::printf("\n[4] Tulis 5000 (melewati satu putaran ring 4096), baca 2048\n");

    VisualizerBuffer buf;
    std::vector<float> in(5000);
    // Skala 0.00025: maks ~1.25, di bawah batas sanitasi |x|>2 (V-M1).
    for (int i = 0; i < 5000; ++i) in[i] = i * 0.00025f;
    writePattern(buf, in);

    std::vector<float> out(2048, -1.0f);
    buf.read(out.data(), 2048);

    bool ok = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(out[i], (2952 + i) * 0.00025f)) { ok = false; break; }
    }
    check(ok, "setelah wrap, 2048 terakhir benar (2952..4999)");
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
// 6. Guard (V-M2/V-m1): write(frames<=0) no-op, read(size>kReadSize) clamp
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
    // (clamp ke kReadSize, B17-V1 — dulu clamp ke kSize yang sama
    // dengan jendela), bukan jendela berulang. read(8192) sama.
    std::vector<float> big(4096, -1.0f);
    buf.read(big.data(), 4096);
    bool noRepeat = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(big[i], before[i])) { noRepeat = false; break; }
    }
    check(noRepeat, "read(4096) di-clamp ke 2048 terakhir (tanpa duplikasi)");

    std::vector<float> huge(8192, -1.0f);
    buf.read(huge.data(), 8192);
    bool hugeClamped = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(huge[i], before[i])) { hugeClamped = false; break; }
    }
    check(hugeClamped, "read(8192) juga di-clamp ke 2048 terakhir");
}

// =====================================================
// 7. clear() (B17-V1): sesudah clear, read() nol semua; tulis
// sesudah clear mengalir normal lagi (tidak ada data basi).
// =====================================================
static void testClear() {
    std::printf("\n[7] clear(): ring kosong, tulis sesudahnya normal\n");

    VisualizerBuffer buf;
    std::vector<float> in(4096);
    for (int i = 0; i < 4096; ++i) in[i] = 1.0f;
    writePattern(buf, in);

    std::vector<float> before(2048, -1.0f);
    buf.read(before.data(), 2048);
    bool wasFull = true;
    for (int i = 0; i < 2048; ++i) {
        if (!nearly(before[i], 1.0f)) { wasFull = false; break; }
    }
    check(wasFull, "sebelum clear: jendela penuh data");

    buf.clear();

    std::vector<float> cleared(2048, -1.0f);
    buf.read(cleared.data(), 2048);
    bool allZero = true;
    for (int i = 0; i < 2048; ++i) {
        if (cleared[i] != 0.0f) { allZero = false; break; }
    }
    check(allZero, "sesudah clear(): read() mengembalikan nol semua");

    // Tulis lagi sesudah clear: 100 sample, jendela = nol + data baru.
    std::vector<float> again(100, 0.5f);
    writePattern(buf, again);
    std::vector<float> after(2048, -1.0f);
    buf.read(after.data(), 2048);
    bool headZero = true;
    for (int i = 0; i < 1948; ++i) {
        if (after[i] != 0.0f) { headZero = false; break; }
    }
    bool tailHalf = true;
    for (int i = 1948; i < 2048; ++i) {
        if (!nearly(after[i], 0.5f)) { tailHalf = false; break; }
    }
    check(headZero && tailHalf, "tulis sesudah clear() mengalir normal, tanpa data basi");

    // clear() pada buffer kosong: aman, no-op.
    VisualizerBuffer fresh;
    fresh.clear();
    std::vector<float> freshOut(2048, -1.0f);
    fresh.read(freshOut.data(), 2048);
    bool freshZero = true;
    for (int i = 0; i < 2048; ++i) {
        if (freshOut[i] != 0.0f) { freshZero = false; break; }
    }
    check(freshZero, "clear() pada buffer baru aman (tetap nol)");
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
    testClear();

    std::printf("\n%d lulus, %d gagal\n", gPassed, gFailed);
    return gFailed == 0 ? 0 : 1;
}
