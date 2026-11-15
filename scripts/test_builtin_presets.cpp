// =====================================================
// scripts/test_builtin_presets.cpp
// =====================================================
//
// Membuktikan SEMUA preset IEM bawaan lolos parser aplikasi SENDIRI
// (`dsp/PresetParser.cpp`) — bukan salinan logikanya, bukan regex:
//   - setiap file .txt di src/features/headphone/data/presets/
//     di-parse lewat `parseParametricPreset`
//   - ok harus true, filter 1..16, preamp finite
//   - Fc/Q/gain tiap filter dicek ulang ke rentang parser
//     (Fc 10..20000 Hz, Q 0.1..20, gain -30..30 dB)
//
// Kompilasi (dari root repo):
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_builtin_presets.cpp \
//     android/app/src/main/cpp/dsp/PresetParser.cpp \
//     android/app/src/main/cpp/dsp/BiquadCascade.cpp \
//     android/app/src/main/cpp/dsp/BiquadFilter.cpp \
//     -o /tmp/test_builtin_presets
//
// Jalankan:
//   /tmp/test_builtin_presets src/features/headphone/data/presets
//
// Keluar 0 kalau semua preset lolos, 1 kalau ada satu saja yang gagal.
// Kalau ada yang gagal: perbaiki DATANYA, jangan ubah test ini.

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "dsp/PresetParser.h"

namespace fs = std::filesystem;
using namespace pristine;

static std::string readFile(const fs::path& p) {
    std::ifstream in(p, std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

int main(int argc, char** argv) {
    const std::string dir =
        argc > 1 ? argv[1] : "src/features/headphone/data/presets";

    if (!fs::is_directory(dir)) {
        std::cerr << "direktori preset tidak ada: " << dir << "\n";
        return 1;
    }

    std::vector<fs::path> files;
    for (const auto& e : fs::directory_iterator(dir)) {
        if (e.is_regular_file() && e.path().extension() == ".txt") {
            files.push_back(e.path());
        }
    }

    if (files.empty()) {
        std::cerr << "tidak ada file .txt di " << dir << "\n";
        return 1;
    }

    int pass = 0, fail = 0;
    int totalFilters = 0;

    for (const auto& path : files) {
        const std::string text = readFile(path);
        const std::string name = path.stem().string();
        ParseResult r = parseParametricPreset(text, name);

        std::string reason;
        if (!r.ok) {
            reason = "parser menolak: " + r.error;
        } else if (r.preset.filters.empty() ||
                   r.preset.filters.size() > BiquadCascade::kMaxFilters) {
            reason = "jumlah filter di luar 1..16";
        } else if (!std::isfinite(r.preset.preampDb)) {
            reason = "preamp tidak finite";
        } else {
            for (const auto& f : r.preset.filters) {
                if (!std::isfinite(f.freqHz) || !std::isfinite(f.q) ||
                    !std::isfinite(f.gainDb) ||
                    !(f.freqHz >= 10.0f && f.freqHz <= 20000.0f) ||
                    !(f.q >= 0.1f && f.q <= 20.0f) ||
                    !(f.gainDb >= -30.0f && f.gainDb <= 30.0f)) {
                    reason = "filter di luar rentang parser";
                    break;
                }
            }
        }

        if (reason.empty()) {
            ++pass;
            totalFilters += static_cast<int>(r.preset.filters.size());
            std::cout << "  [PASS] " << name << ": "
                      << r.preset.filters.size() << " filter, preamp "
                      << r.preset.preampDb << " dB\n";
        } else {
            ++fail;
            std::cout << "  [FAIL] " << name << ": " << reason << "\n";
        }
    }

    std::cout << "preset bawaan: " << pass << " lolos, " << fail
              << " gagal, " << totalFilters << " filter total\n";
    return fail == 0 ? 0 : 1;
}
