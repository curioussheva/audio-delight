// =====================================================
// dsp/PresetParser.h
// =====================================================
//
// Parser preset koreksi headphone dari teks. Format yang didukung:
//
//   AutoEQ / Squiglink parametric (teks)
//     Preamp: -6.8 dB
//     Filter 1: ON PK Fc 105 Hz Gain 5.5 dB Q 0.70
//     Filter 2: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70
//     Filter 3: ON HSC Fc 10000 Hz Gain -2.0 dB Q 0.70
//
//   Tipe: PK / PEAKING, LSC / LS / LOWSHELF, HSC / HS / HIGHSHELF.
//
// =====================================================
// ATURAN
// =====================================================
//
//   - Parser ini MURNI: tidak membuka berkas, tidak menyentuh I/O. Ia menerima
//     teks. Pemanggil yang membaca berkas. Ini yang membuatnya bisa diuji
//     standalone di Termux tanpa device.
//   - Preset yang CACAT ditolak dengan alasan, bukan diterima sebagian.
//     `docs/BOILERPLATE_AND_STUBS.md` §2: gagal berisik, jangan sukses palsu.
//   - Jumlah filter lebih dari `BiquadCascade::kMaxFilters` = error, bukan
//     pemotongan diam-diam.
//   - Komentar (`#`), baris kosong, dan penomoran berlebih diabaikan.
//
// =====================================================

#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "../core/AudioTypes.h"

#include "BiquadCascade.h"

namespace pristine {

// =====================================================
// SATU FILTER HASIL PARSE
// =====================================================

struct ParsedFilter {
    FilterType type = FilterType::Peaking;
    float freqHz = 0.0f;
    float q = 0.707f;
    float gainDb = 0.0f;
    bool enabled = true;
};

// =====================================================
// HASIL PARSE
// =====================================================

struct ParsedPreset {
    std::string name;
    float preampDb = 0.0f;
    std::vector<ParsedFilter> filters;

    // Jumlah baris `Filter N:` yang ditemukan, termasuk yang OFF.
    // Dipakai untuk membedakan "preset kecil" dari "preset yang barisnya
    // tidak dikenali" - kalau sebuah baris filter gagal di-parse, ini
    // menandai bahwa ada yang hilang.
    int totalFilterLines = 0;
};

struct ParseResult {
    bool ok = false;
    ParsedPreset preset;

    // Terisi kalau `ok == false`. Berisi nomor baris + alasan.
    std::string error;

    // Peringatan yang tidak menggagalkan parse (mis. baris tak dikenal).
    std::vector<std::string> warnings;
};

// =====================================================
// API
// =====================================================

// Parse teks preset. `name` opsional untuk memberi label.
ParseResult parseParametricPreset(
    const std::string& text,
    const std::string& name = ""
);

// Terapkan preset hasil parse ke cascade. Menghitung ulang koefisien dengan
// `sampleRate`. Mengembalikan false kalau preset tidak muat.
//
// Filter yang `enabled == false` dilewati, tapi TIDAK menggeser indeks -
// urutan filter yang aktif tetap seperti di preset.
bool applyPreset(
    BiquadCascade& cascade,
    const ParsedPreset& preset,
    float sampleRate
);

// Konversi hasil parse ke bentuk POD yang bisa menyeberangi batas thread.
//
// Dipisah dari AudioEngine supaya jalur konversi ini bisa diuji standalone
// tanpa menarik seluruh engine (JNI, android/log.h). Test yang menyalin ulang
// logika konversi hanya menguji salinannya, bukan kode produksi.
//
// Mengembalikan false kalau tidak ada filter aktif atau jumlahnya melebihi
// kapasitas. `out` hanya ditulis kalau berhasil.
bool toPresetData(
    const ParsedPreset& preset,
    HeadphonePresetData& out
);

} // namespace pristine
