// =====================================================
// dsp/PresetParser.cpp
// =====================================================

#include "PresetParser.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <sstream>

namespace pristine {

namespace {

// =====================================================
// UTILITAS TEKS
// =====================================================

std::string toUpper(const std::string& s) {
    std::string out = s;
    std::transform(out.begin(), out.end(), out.begin(),
        [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    return out;
}

std::string trim(const std::string& s) {
    const char* ws = " \t\r\n";
    const auto b = s.find_first_not_of(ws);
    if (b == std::string::npos) return "";
    const auto e = s.find_last_not_of(ws);
    return s.substr(b, e - b + 1);
}

// Buang `#` dan apa pun setelahnya.
std::string stripComment(const std::string& s) {
    const auto p = s.find('#');
    return (p == std::string::npos) ? s : s.substr(0, p);
}

// Parse float yang toleran: menerima koma desimal (sebagian preset Eropa)
// dan menolak sisa karakter yang bukan bagian angka.
bool parseFloat(const std::string& s, float& out) {
    std::string t = trim(s);
    if (t.empty()) return false;

    // Koma desimal -> titik. Hanya kalau tidak ada titik sama sekali,
    // supaya pemisah ribuan gaya "1,000.5" tidak salah diterjemahkan.
    if (t.find(',') != std::string::npos && t.find('.') == std::string::npos) {
        std::replace(t.begin(), t.end(), ',', '.');
    }

    // Buang satuan di belakang ("105Hz", "5.5dB", "0.70").
    std::string num;
    for (char c : t) {
        if (std::isdigit(static_cast<unsigned char>(c)) ||
            c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E') {
            num += c;
        } else {
            break;
        }
    }
    if (num.empty()) return false;

    char* end = nullptr;
    const double v = std::strtod(num.c_str(), &end);
    if (end == num.c_str()) return false;
    if (!std::isfinite(v)) return false;

    out = static_cast<float>(v);
    return true;
}

// =====================================================
// TIPE FILTER
// =====================================================

bool parseFilterType(const std::string& token, FilterType& out) {
    const std::string t = toUpper(token);

    if (t == "PK" || t == "PEAK" || t == "PEAKING" || t == "PEQ") {
        out = FilterType::Peaking;
        return true;
    }
    if (t == "LSC" || t == "LS" || t == "LOWSHELF" || t == "LOW_SHELF") {
        out = FilterType::LowShelf;
        return true;
    }
    if (t == "HSC" || t == "HS" || t == "HIGHSHELF" || t == "HIGH_SHELF") {
        out = FilterType::HighShelf;
        return true;
    }
    return false;
}

} // namespace

// =====================================================
// PARSE PRESET PARAMETRIK
// =====================================================

ParseResult parseParametricPreset(
    const std::string& text,
    const std::string& name
) {
    ParseResult result;
    result.preset.name = name;

    std::istringstream stream(text);
    std::string raw;
    int lineNo = 0;
    int parsedCount = 0;

    while (std::getline(stream, raw)) {

        ++lineNo;

        std::string line = trim(stripComment(raw));
        if (line.empty()) continue;

        const std::string upper = toUpper(line);

        // ---- Preamp --------------------------------------------------
        if (upper.rfind("PREAMP", 0) == 0) {
            const auto colon = line.find(':');
            if (colon == std::string::npos) {
                result.warnings.push_back(
                    "baris " + std::to_string(lineNo) +
                    ": 'Preamp' tanpa ':' - diabaikan");
                continue;
            }

            float db = 0.0f;
            if (!parseFloat(line.substr(colon + 1), db)) {
                result.warnings.push_back(
                    "baris " + std::to_string(lineNo) +
                    ": nilai preamp tidak terbaca - diabaikan");
                continue;
            }
            result.preset.preampDb = db;
            continue;
        }

        // ---- Filter N ------------------------------------------------
        if (upper.rfind("FILTER", 0) != 0) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": baris tidak dikenali - dilewati");
            continue;
        }

        // Jumlahkan SEMUA baris Filter, termasuk yang OFF, supaya preset yang
        // barisnya gagal di-parse tidak lolos sebagai "preset kecil".
        ++result.preset.totalFilterLines;

        // Buang "Filter N:" -> sisanya parameter.
        const auto colon = line.find(':');
        std::string rest = (colon == std::string::npos)
            ? std::string()
            : line.substr(colon + 1);

        std::istringstream ls(rest);
        std::vector<std::string> tok;
        std::string w;
        while (ls >> w) tok.push_back(w);

        if (tok.empty()) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": 'Filter' tanpa parameter - dilewati");
            continue;
        }

        // ON / OFF
        ParsedFilter f;
        size_t i = 0;

        const std::string onoff = toUpper(tok[0]);
        if (onoff == "ON" || onoff == "OFF") {
            f.enabled = (onoff == "ON");
            i = 1;
        }

        if (i >= tok.size()) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": tidak ada tipe filter - dilewati");
            continue;
        }

        // Tipe filter
        FilterType type;
        if (!parseFilterType(tok[i], type)) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": tipe filter '" + tok[i] + "' tidak dikenal - dilewati");
            continue;
        }
        f.type = type;
        ++i;

        // Fc / Gain / Q dalam urutan bebas.
        bool haveFc = false, haveQ = false;
        bool bad = false;

        while (i < tok.size()) {

            const std::string key = toUpper(tok[i]);

            // Kunci yang dikenal butuh satu nilai setelahnya.
            if (key == "FC" || key == "FREQ" || key == "FREQUENCY" ||
                key == "GAIN" || key == "Q" || key == "BW" ||
                key == "S" || key == "SLOPE") {

                if (i + 1 >= tok.size()) {
                    result.warnings.push_back(
                        "baris " + std::to_string(lineNo) +
                        ": '" + tok[i] + "' tanpa nilai - baris dilewati");
                    bad = true;
                    break;
                }

                float v = 0.0f;
                if (!parseFloat(tok[i + 1], v)) {
                    result.warnings.push_back(
                        "baris " + std::to_string(lineNo) +
                        ": nilai '" + tok[i + 1] + "' untuk " + key +
                        " tidak terbaca - baris dilewati");
                    bad = true;
                    break;
                }

                // Satuan opsional setelah nilai: `Fc 105 Hz`, `Gain 5.5 dB`.
                // Tanpa ini, token "Hz"/"dB" terbaca sebagai kunci tak dikenal
                // dan seluruh baris dibuang.
                size_t next = i + 2;

                if (next < tok.size()) {
                    const std::string unit = toUpper(tok[next]);

                    if (unit == "HZ") {
                        next += 1;
                    } else if (unit == "KHZ") {
                        v *= 1000.0f;
                        next += 1;
                    } else if (unit == "DB" || unit == "DB/OCT" ||
                               unit == "DB/OCTAVE" || unit == "DB/8VE" ||
                               unit == "%") {
                        next += 1;
                    }
                }

                if (key == "FC" || key == "FREQ" || key == "FREQUENCY") {
                    f.freqHz = v;
                    haveFc = true;
                } else if (key == "GAIN") {
                    f.gainDb = v;
                } else {
                    // Q, BW, S, SLOPE semuanya diperlakukan sebagai faktor
                    // bentuk filter. AutoEQ memakai Q; beberapa preset memakai
                    // S (slope) untuk shelf.
                    f.q = v;
                    haveQ = true;
                }

                i = next;
                continue;
            }

            // Token tanpa kunci (mis. urutan "Fc 105 Gain 5.5 Q 0.7" sudah
            // tertangani). Sisa yang tak dikenal = baris bermasalah.
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": token '" + tok[i] + "' tidak dikenal - baris dilewati");
            bad = true;
            break;
        }

        if (bad) continue;

        if (!haveFc) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": tanpa Fc - baris dilewati");
            continue;
        }

        if (!haveQ) {
            // Q bawaan AutoEQ untuk shelf/peaking kalau tidak disebut.
            f.q = 0.707f;
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": tanpa Q - memakai 0.707");
        }

        // Sanity: Fc harus di dalam rentang audio dan Q positif.
        if (!(f.freqHz > 0.0f) || !(f.q > 0.0f)) {
            result.warnings.push_back(
                "baris " + std::to_string(lineNo) +
                ": Fc/Q tidak masuk akal - baris dilewati");
            continue;
        }

        result.preset.filters.push_back(f);
        ++parsedCount;
    }

    // ---- Validasi akhir ---------------------------------------------

    if (parsedCount == 0) {
        result.ok = false;
        result.error = "tidak ada filter yang berhasil di-parse";
        return result;
    }

    if (parsedCount > BiquadCascade::kMaxFilters) {
        result.ok = false;
        result.error =
            "preset punya " + std::to_string(parsedCount) +
            " filter, kapasitas maksimum " +
            std::to_string(BiquadCascade::kMaxFilters);
        return result;
    }

    // Kalau ada baris Filter yang TIDAK menghasilkan filter, itu tanda preset
    // tidak terbaca lengkap - lebih baik gagal daripada diterapkan sebagian.
    if (result.preset.totalFilterLines != parsedCount) {
        result.ok = false;
        result.error =
            "hanya " + std::to_string(parsedCount) + " dari " +
            std::to_string(result.preset.totalFilterLines) +
            " baris filter yang terbaca";
        return result;
    }

    result.ok = true;
    return result;
}

// =====================================================
// TERAPKAN KE CASCADE
// =====================================================

bool applyPreset(
    BiquadCascade& cascade,
    const ParsedPreset& preset,
    float sampleRate
) {
    if (sampleRate <= 0.0f) {
        return false;
    }

    cascade.clear();
    cascade.setPreamp(preset.preampDb);

    int index = 0;

    for (const auto& f : preset.filters) {

        if (!f.enabled) {
            continue;
        }

        if (index >= BiquadCascade::kMaxFilters) {
            return false;
        }

        if (!cascade.setFilter(
                index, f.type, f.freqHz, f.q, f.gainDb, sampleRate)) {
            return false;
        }

        ++index;
    }

    cascade.setActiveCount(index);
    return true;
}

// =====================================================
// KONVERSI KE BENTUK POD
// =====================================================

bool toPresetData(
    const ParsedPreset& preset,
    HeadphonePresetData& out
) {
    HeadphonePresetData data;
    data.preampDb = preset.preampDb;

    int count = 0;

    for (const auto& f : preset.filters) {

        if (!f.enabled) {
            continue;
        }

        if (count >= HeadphonePresetData::kMaxFilters) {
            return false;
        }

        auto& dst = data.filters[count];

        switch (f.type) {
            case FilterType::LowShelf:
                dst.type = 1;
                break;
            case FilterType::HighShelf:
                dst.type = 2;
                break;
            case FilterType::Peaking:
            default:
                dst.type = 0;
                break;
        }

        dst.freqHz = f.freqHz;
        dst.q = f.q;
        dst.gainDb = f.gainDb;

        ++count;
    }

    if (count <= 0) {
        return false;
    }

    data.filterCount = count;
    out = data;
    return true;
}

} // namespace pristine
