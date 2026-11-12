#pragma once
#include "DeviceTypes.h"
#include <cstdint>
#include <string>
#include <vector>

namespace pristine {

struct AudioDeviceDescriptor {
    // ID perangkat dari Android (AudioDeviceInfo.getId()). Dipakai untuk
    // memilih perangkat lewat setActiveDevice().
    std::string id;

    std::string name;

    DeviceType type = DeviceType::BUILTIN_SPEAKER;

    // Laju yang paling mungkin dipakai. Diambil sebagai laju tertinggi yang
    // didukung perangkat, bukan konstanta - perangkat berbeda punya rentang
    // berbeda (HP biasanya hanya 48000, DAC bisa 384000).
    int32_t preferredSampleRate = 48000;

    // true kalau perangkat tidak lewat mixer sistem. Hanya USB/HDMI yang bisa
    // begitu; speaker dan headphone built-in SELALU lewat mixer.
    //
    // Dipakai untuk kejujuran UI: jangan tampilkan "bit-perfect" kalau
    // perangkatnya sendiri tidak punya jalur langsung.
    bool supportsExclusive = false;

    // Semua laju yang didukung perangkat, urut menaik. Kosong = tidak
    // diketahui (API < 23 atau pembacaan gagal) ATAU perangkat mendukung
    // laju sembarang — bedakan lewat supportsArbitraryRates di bawah.
    //
    // Disimpan supaya pemilihan laju per-file bisa dilakukan tanpa JNI lagi:
    // audio::pickBestRate() (core/RateSelection.h) butuh daftar ini, dan
    // memanggil JNI berkali-kali saat ganti track itu boros.
    std::vector<int32_t> supportedSampleRates;

    // true kalau AudioDeviceInfo.getSampleRates() perangkat ini
    // mengembalikan array KOSONG. Menurut javadoc AOSP, array kosong berarti
    // perangkat mendukung laju SEMBARANG ("an empty array indicates that
    // the device supports arbitrary rates"), BUKAN "tidak ada laju" —
    // jadi daftar kosong di sini bukan deteksi gagal, dan pickBestRate()
    // boleh memakai laju file apa adanya. (C-R1, 2026-11-12: sebelumnya
    // array kosong dilewati begitu saja oleh DeviceRateDetector, dan
    // perangkat semacam itu dilaporkan "deteksi gagal".)
    bool supportsArbitraryRates = false;

    // true kalau perangkat ini USB (DAC eksternal).
    bool isUsb = false;
};

} // namespace pristine
