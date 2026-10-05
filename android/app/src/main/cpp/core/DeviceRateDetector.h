#pragma once

#include <cstdint>
#include <vector>

// JavaVM dipakai oleh setDeviceRateDetectorVm() di bawah.
#include <jni.h>

namespace pristine::audio {

// =====================================================
// DEVICE RATE DETECTOR
// =====================================================
//
// Sebelumnya laju stream dipatok 48000 di kode. Akibatnya SEMUA file
// dikonversi ke 48 kHz - termasuk file 96/192 kHz - dan itu kebalikan dari
// bit-perfect: sampel harus sampai ke DAC pada laju aslinya.
//
// Detector ini membaca kapabilitas perangkat output yang SEDANG AKTIF
// (termasuk DAC USB kalau terpasang) lewat AudioManager Android, lalu
// memberi tahu laju mana yang didukung.
//
// Pemakaian:
//   1. panggil refresh() saat engine start atau saat device berubah
//   2. pilih laju target dengan pickBestRate(fileRate) - laju file kalau
//      didukung, kalau tidak laju terdekat yang didukung
//   3. berikan laju itu ke AudioEngine::start()
//
// Semua panggilan JNI aman dipanggil dari thread mana pun: kalau thread belum
// ter-attach, ia di-attach sementara lalu di-detach lagi.

class DeviceRateDetector {
public:

    // Baca ulang daftar laju yang didukung perangkat output aktif.
    // Mengembalikan jumlah laju yang terdeteksi (0 kalau gagal - pemanggil
    // harus memakai default 48000).
    static int refresh();

    // Laju-laju yang didukung, urut menaik. Kosong = tidak diketahui.
    static const std::vector<int32_t>& supportedRates();

    // Nama perangkat output aktif (untuk log/diagnosa). Kosong kalau gagal.
    static const char* activeDeviceName();

    // true kalau perangkat output aktif adalah USB (DAC eksternal).
    static bool isUsbActive();

    // Pilih laju terbaik untuk sebuah file.
    //
    // Aturan, berurutan:
    //   1. kalau fileRate didukung persis -> pakai itu (bit-perfect, tanpa
    //      konversi sama sekali)
    //   2. kalau ada laju yang merupakan kelipatan bulat fileRate -> pakai
    //      yang terkecil (upsample integer, tidak ada rate conversion
    //      fraksional yang merusak sampel)
    //   3. kalau tidak -> pakai laju tertinggi yang didukung (lebih baik
    //      daripada turun ke 48 kHz)
    //   4. kalau tidak ada info -> kembalikan fileRate apa adanya
    static int32_t pickBestRate(int32_t fileRate);

    // true kalau laju ini didukung perangkat.
    static bool supportsRate(int32_t rate);

    // true kalau pilihannya sama dengan laju file (tidak ada konversi).
    static bool isBitPerfectFor(int32_t fileRate);

private:
    DeviceRateDetector() = delete;
};

// PRISTINE_EXPORT dari core/Export.h - wajib karena fungsi ini dipanggil
// OnLoad.cpp yang ada di target library lain.
#include "core/Export.h"

// Dipanggil sekali dari JNI_OnLoad supaya detector bisa memakai JNI.
// Dipisah dari kelas karena butuh JavaVM dan tidak ada hubungannya dengan
// state deteksi itu sendiri.
PRISTINE_EXPORT void setDeviceRateDetectorVm(JavaVM* vm);

} // namespace pristine::audio
