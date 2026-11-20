// =====================================================
// dsp/convolution/IRLoader.h
// =====================================================
//
// Parser WAV untuk impulse response (convolver IR, 2026-11-20).
//
// Menggantikan stub lama (loadWavMono mengembalikan {} tanpa pernah
// mem-parse). Dipakai ConvolverNode: file IR .wav pilihan user
// (concert hall, tube amp, karakter headphone — ala convolver
// ViPER4Android) dibaca dari path file app, di-decode ke mono float,
// lalu di-resample + di-FFT oleh node.
//
// Format yang diterima (WAV RIFF, little-endian):
//   - PCM integer 8/16/24/32-bit dan IEEE float 32-bit.
//   - Mono, atau stereo (di-mix ke mono (L+R)/2 — convolver v1
//     memakai kernel yang SAMA di kedua kanal; true-stereo IR
//     dengan kernel L/R berbeda di luar cakupan v1).
//   - Laju sampel 8.000–192.000 Hz. Chunk tak dikenal (fact, LIST,
//     bext, ...) dilewati; chunk data WAJIB ada.
//   - Durasi mentah maks 10 detik — lebih panjang ditolak (bukan
//     dipotong diam-diam). Batas tap sesudah resample (98.304 tap,
//     ~2 dtk) ditegakkan ConvolverNode, bukan di sini.
//
// Status dikembalikan eksplisit (bukan vector kosong yang ambigu):
// pemanggil WAJIB memeriksa dan memberi tahu user — angka status
// yang sama dipakai JNI -> Kotlin -> JS (ConvolverIrStatus di
// specs/NativeDSPModule.ts). JANGAN ubah nomornya tanpa mengubah
// ketiga lapis itu.
//
// SPDX-License-Identifier: MIT

#pragma once

#include <string>
#include <vector>

namespace pristine {

// Hasil parse WAV IR (mono, laju asli file — resample ke laju
// stream adalah tugas ConvolverNode).
struct WavIrData {
    std::vector<float> samples;
    int sampleRateHz = 0;
};

// Status load IR — nomor stabil lintas JNI/Kotlin/JS.
enum class IrLoadStatus : int {
    Ok = 0,
    // File tidak ada / tidak bisa dibuka / gagal dibaca.
    FileError = 1,
    // Bukan RIFF/WAVE, fmt tidak didukung (codec/kanal/bit-depth),
    // chunk data hilang, atau sampel non-finite.
    FormatError = 2,
    // IR terlalu panjang (mentah > 10 dtk, atau sesudah resample
    // melebihi batas tap convolver).
    TooLong = 3,
    // Semua sampel nol — tidak ada yang bisa dikonvolusi.
    Silent = 4,
    // Laju sampel di luar 8.000–192.000 Hz.
    RateError = 5,
};

class IRLoader {
public:

    // Parse file WAV di `path` menjadi mono float. `out` hanya
    // ditulis bila return Ok. Tidak pernah melempar; semua kegagalan
    // file/parse dilaporkan lewat status.
    static IrLoadStatus loadWavMono(
        const std::string& path,
        WavIrData& out
    );

    // Batas-batas (dipakai juga ConvolverNode + pesan UI).
    static constexpr int kMinSampleRateHz = 8000;
    static constexpr int kMaxSampleRateHz = 192000;
    // Durasi mentah maksimum: 10 detik (dalam sampel, di laju file).
    static constexpr int kMaxRawDurationSec = 10;
};

} // namespace pristine
