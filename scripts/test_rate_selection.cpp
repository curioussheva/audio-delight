// Test standalone untuk pickBestRate() (core/RateSelection.h, C-R1).
// Compile di host (tidak butuh Android SDK/NDK — fungsi murni, tanpa JNI):
//   g++ -std=c++20 -I android/app/src/main/cpp \
//     scripts/test_rate_selection.cpp -o /tmp/test_rate_selection \
//     && /tmp/test_rate_selection
//
// Ini test logika murni. Build native Android sebenarnya tetap lewat CI,
// tapi test ini menjaga regresi aturan pemilihan laju tanpa perlu device.

#include "core/RateSelection.h"

#include <cstdint>
#include <cstdio>
#include <vector>

#define ASSERT_EQ(got, want, msg)                                              \
    do {                                                                       \
        if ((got) != (want)) {                                                 \
            std::fprintf(stderr, "FAIL: %s (line %d): dapat %d, mau %d\n",     \
                         (msg), __LINE__, (int)(got), (int)(want));            \
            ++gFailures;                                                       \
        } else {                                                               \
            std::fprintf(stdout, "ok:   %s -> %d\n", (msg), (int)(got));        \
        }                                                                      \
    } while (0)

static int gFailures = 0;

using pristine::audio::pickBestRate;

int main() {
    // Aturan 2: persis didukung -> laju file.
    ASSERT_EQ(pickBestRate(44100, {44100, 48000}), 44100,
              "exact 44100 di {44100,48000}");
    ASSERT_EQ(pickBestRate(48000, {44100, 48000, 96000}), 48000,
              "exact 48000 di {44100,48000,96000}");
    ASSERT_EQ(pickBestRate(192000, {44100, 48000, 96000, 192000}), 192000,
              "exact 192000");

    // Aturan 3 (C-R1, contoh tugas): pembagi bulat terbesar — file 88,2 kHz
    // di {44100, 48000} -> 44100 (rasio 2:1), BUKAN 48000 seperti aturan lama.
    ASSERT_EQ(pickBestRate(88200, {44100, 48000}), 44100,
              "pembagi bulat 88200 di {44100,48000} -> 44100");
    // Pembagi menang atas "tertinggi <= file": 176400 di {44100,48000,96000}
    // -> 44100 (176400 % 44100 == 0), bukan 96000.
    ASSERT_EQ(pickBestRate(176400, {44100, 48000, 96000}), 44100,
              "pembagi 176400 di {44100,48000,96000} -> 44100");
    // 96000 di {44100, 48000}: 48000 membagi 96000 -> 48000 (juga tertinggi
    // <= file; kedua langkah setuju di sini).
    ASSERT_EQ(pickBestRate(96000, {44100, 48000}), 48000,
              "pembagi 96000 di {44100,48000} -> 48000");

    // Aturan 4: tertinggi <= laju file bila tidak ada pembagi bulat.
    // 96000 di {44100, 88200}: tidak ada pembagi (96000 % 88200 != 0,
    // 96000 % 44100 != 0) -> 88200.
    ASSERT_EQ(pickBestRate(96000, {44100, 88200}), 88200,
              "tertinggi <= file 96000 di {44100,88200} -> 88200");
    // Aturan lama vs baru (tercatat di RateSelection.h): file 48000 di
    // {44100, 96000} — lama 96000 (kelipatan bulat di atas), baru 44100.
    ASSERT_EQ(pickBestRate(48000, {44100, 96000}), 44100,
              "baru: 48000 di {44100,96000} -> 44100 (lama: 96000)");

    // Aturan 5: semua laju di atas laju file -> terendah.
    ASSERT_EQ(pickBestRate(44100, {48000, 96000}), 48000,
              "semua di atas 44100 di {48000,96000} -> 48000");
    ASSERT_EQ(pickBestRate(8000, {44100, 48000}), 44100,
              "semua di atas 8000 -> 44100");

    // Aturan 1: daftar kosong -> laju file apa adanya (tidak ada info, atau
    // perangkat laju sembarang).
    ASSERT_EQ(pickBestRate(96000, {}), 96000, "kosong -> 96000 (fileRate)");
    ASSERT_EQ(pickBestRate(44100, {}), 44100, "kosong -> 44100 (fileRate)");

    // Aturan 0: fileRate <= 0 -> 48000.
    ASSERT_EQ(pickBestRate(0, {44100, 48000}), 48000, "fileRate 0 -> 48000");
    ASSERT_EQ(pickBestRate(-44100, {44100, 48000}), 48000,
              "fileRate negatif -> 48000");
    ASSERT_EQ(pickBestRate(0, {}), 48000, "fileRate 0 + kosong -> 48000");

    // Daftar tidak terurut tetap benar (langkah 5 memakai min_element,
    // bukan front()).
    ASSERT_EQ(pickBestRate(88200, {48000, 44100}), 44100,
              "tidak terurut 88200 di {48000,44100} -> 44100");
    ASSERT_EQ(pickBestRate(44100, {96000, 48000}), 48000,
              "tidak terurut 44100 di {96000,48000} -> 48000");

    if (gFailures == 0) {
        std::printf("SEMUA TES LULUS\n");
        return 0;
    }
    std::printf("%d TES GAGAL\n", gFailures);
    return 1;
}
