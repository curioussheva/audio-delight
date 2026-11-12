#pragma once

#include <algorithm>
#include <cstdint>
#include <vector>

namespace pristine::audio {

// =====================================================
// RATE SELECTION — SATU-SATUNYA IMPLEMENTASI PEMILIHAN LAJU
// =====================================================
//
// (C-R1, 2026-11-12) Menggantikan DUA implementasi lama yang duplikat dan
// saling bertentangan:
//   - DeviceRateDetector::pickBestRate() — memakai daftar GABUNGAN laju
//     SEMUA perangkat output (DAC 384 kHz ikut menghitung walau audio
//     keluar di speaker), dan array kosong getSampleRates() dilewati
//     begitu saja sehingga perangkat "laju sembarang" dilaporkan sebagai
//     "deteksi gagal";
//   - EngineManager::pickBestRateFor() — salinan aturan yang sama terhadap
//     daftar SATU perangkat, dengan fallback ke detector global kalau
//     daftarnya kosong.
//
// Kini HANYA ada fungsi ini. Pemanggil (EngineManager, AudioEngine)
// mengambil daftar laju dari AudioDeviceManager — satu-satunya sumber data
// perangkat — lalu memanggil fungsi ini. Tidak ada JNI di sini, tidak ada
// global, tidak ada lock: murni fungsi atas (fileRate, daftar laju),
// jadi bisa diuji di host tanpa NDK (scripts/test_rate_selection.cpp).
//
// Aturan, berurutan:
//   0. fileRate <= 0 -> 48000 (tidak ada info file).
//   1. daftar kosong -> fileRate apa adanya. Kosong berarti "tidak ada
//      info" ATAU "perangkat mendukung laju sembarang" (AOSP:
//      getSampleRates() kosong = arbitrary rates) — dalam kedua arti itu
//      mencoba laju asli lebih benar daripada mematok 48000.
//   2. fileRate didukung persis -> pakai itu (bit-perfect, tanpa konversi).
//   3. pembagi bulat TERBESAR dari fileRate yang didukung -> pakai itu
//      (downsample integer, mis. file 88,2 kHz di {44100, 48000} -> 44100,
//      rasio 2:1: tiap sampel ke-2 dipakai, tanpa interpolasi fraksional).
//   4. laju tertinggi yang didukung yang TIDAK melebihi laju file.
//   5. semua laju perangkat di atas laju file -> pakai yang terendah
//      (kenaikan sesedikit mungkin).
//
// PERBEDAAN DARI DUA IMPLEMENTASI LAMA (dicatat supaya tidak dianggap bug):
//   a. Langkah 3 adalah PERBAIKAN yang disengaja. Aturan lama: kelipatan
//      bulat TERKECIL DI ATAS laju file (upsample integer). Contoh yang
//      berubah:
//        - file 88200, {44100, 48000}: lama 48000 (resample fraksional
//          88,2k -> 48k), baru 44100 (desimasi bulat 2:1).
//        - file 48000, {44100, 96000}: lama 96000 (upsample 2x), baru
//          44100 (pembagi bulat tidak ada, jadi jatuh ke langkah 4).
//      Langkah 3 hanya mengubah hasil bila pembagi bulat ADA tapi laju
//      tertinggi <= fileRate BUKAN pembagi (mis. {44100, 48000} untuk
//      88200); kalau tidak ada pembagi, hasilnya sama dengan aturan lama.
//   b. Daftar kosong di pickBestRateFor() lama JATUH KE detector global
//      (daftar gabungan semua perangkat). Kini tidak ada lagi fallback
//      global: kosong -> fileRate (aturan 1).
//   c. Langkah 5 lama memakai rates.front() dengan asumsi daftar terurut
//      menaik; di sini memakai min_element, jadi tahan terhadap daftar
//      yang tidak terurut.
//   d. fileRate <= 0 -> 48000 dan daftar kosong -> fileRate sama dengan
//      perilaku DeviceRateDetector::pickBestRate() lama.
inline int32_t pickBestRate(int32_t fileRate,
                            const std::vector<int32_t>& supportedRates) {
    if (fileRate <= 0) return 48000;

    // Belum ada info perangkat (atau perangkat mendukung laju sembarang):
    // coba laju asli daripada langsung menurunkan ke 48 kHz.
    if (supportedRates.empty()) return fileRate;

    // 2. Persis didukung -> tanpa konversi sama sekali.
    if (std::find(supportedRates.begin(), supportedRates.end(), fileRate) !=
        supportedRates.end()) {
        return fileRate;
    }

    // 3. Pembagi bulat terbesar (downsample integer). Rate conversion
    //    fraksional (mis. 88,2k -> 48k) butuh interpolasi yang mengubah
    //    sampel; rasio bulat tidak.
    int32_t bestDivisor = 0;
    for (int32_t r : supportedRates) {
        if (r < fileRate && fileRate % r == 0 && r > bestDivisor) {
            bestDivisor = r;
        }
    }
    if (bestDivisor > 0) return bestDivisor;

    // 4. Laju tertinggi yang didukung yang TIDAK melebihi laju file (turun
    //    sesedikit mungkin, tetap dalam rentang yang didukung perangkat).
    //    JANGAN mengembalikan laju file kalau perangkat tidak mendukungnya
    //    - stream akan gagal dibuka.
    int32_t bestLower = 0;
    for (int32_t r : supportedRates) {
        if (r <= fileRate && r > bestLower) bestLower = r;
    }
    if (bestLower > 0) return bestLower;

    // 5. Semua laju perangkat lebih tinggi dari laju file (jarang): pakai
    //    yang terendah supaya kenaikan sesedikit mungkin.
    return *std::min_element(supportedRates.begin(), supportedRates.end());
}

} // namespace pristine::audio
