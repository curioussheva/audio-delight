// =====================================================
// dsp/headphone/HeadphoneCorrectionNode.cpp
// =====================================================

#include "HeadphoneCorrectionNode.h"

#include <algorithm>

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void HeadphoneCorrectionNode::prepare(
    int sampleRate,
    int
) {

    mAppliedSampleRate = sampleRate;

    // Rantai belum dikonfigurasi di sini: presetnya belum tentu ada saat
    // stream dibuka. Yang penting laju sudah tercatat, supaya applyConfig
    // pertama menghitung koefisien dengan laju yang benar.

    mHasApplied = false;

    // Node tanpa preset tidak boleh mengaku aktif. `DSPNode::mEnabled`
    // defaultnya true, jadi tanpa baris ini node akan "aktif" padahal tidak
    // ada satu filter pun terpasang — persis bentuk "tampak tersedia padahal
    // tidak ada" yang dihindari di docs/BOILERPLATE_AND_STUBS.md §2.
    setEnabled(false);
}

// =====================================================
// RESET
// =====================================================

void HeadphoneCorrectionNode::reset() {

    mCascade.reset();
}

// =====================================================
// PROCESS
// =====================================================

void HeadphoneCorrectionNode::process(
    float* left,
    float* right,
    int frames
) {

    mCascade.process(left, right, frames);
}

// =====================================================
// APPLY CONFIG
// =====================================================
//
// Berjalan di audio thread. Tidak mengalokasi: `mApplied` sudah jadi member,
// dan `mCascade` memakai array statis.
//
// Preset dibandingkan dengan yang terakhir dipasang. Kalau sama, tidak ada
// yang dikerjakan — menghitung ulang koefisien 16 biquad (powf/cosf/sinf)
// tiap buffer akan membebani audio thread tanpa manfaat.

void HeadphoneCorrectionNode::applyConfig(
    const DSPConfig& config
) {

    // Koreksi dimatikan: kosongkan rantai sekali saja.
    if (!config.headphoneCorrectionEnabled) {

        if (mHasApplied) {
            mCascade.clear();
            mApplied = HeadphonePresetData{};
            mHasApplied = false;
        }

        setEnabled(false);
        return;
    }

    const HeadphonePresetData& preset =
        config.headphonePreset;

    // Tidak ada preset terpasang: jangan sentuh buffer sama sekali.
    if (preset.filterCount <= 0) {

        if (mHasApplied) {
            mCascade.clear();
            mApplied = HeadphonePresetData{};
            mHasApplied = false;
        }

        setEnabled(false);
        return;
    }

    // Sudah terpasang dan identik: tidak ada yang perlu dihitung.
    if (mHasApplied && mAppliedSampleRate > 0) {

        bool same = (mApplied.preampDb == preset.preampDb) &&
                    (mApplied.filterCount == preset.filterCount);

        if (same) {
            // (C-I2, 2026-11-12): defense-in-depth — filterCount diklaim
            // 0..16 (PresetParser menolak > kMaxFilters, dan
            // AudioState::headphonePreset() menjepit salinan yang keluar),
            // tapi loop ini mengindeks filters[i] di KEDUA sisi tanpa
            // guard. Jepit batas loop ke kapasitas array; preset valid
            // (≤ 16) tidak berubah. Loop pasang di bawah sudah punya guard
            // `index >= BiquadCascade::kMaxFilters` — terverifikasi, tidak
            // diubah.
            const int filterCount = std::min(
                preset.filterCount,
                HeadphonePresetData::kMaxFilters
            );

            for (int i = 0; i < filterCount; ++i) {

                const auto& a = mApplied.filters[i];
                const auto& b = preset.filters[i];

                if (a.type != b.type ||
                    a.freqHz != b.freqHz ||
                    a.q != b.q ||
                    a.gainDb != b.gainDb) {
                    same = false;
                    break;
                }
            }
        }

        if (same) {
            setEnabled(true);
            return;
        }
    }

    // ---- Pasang preset -------------------------------------------
    //
    // Hanya di sini koefisien dihitung. Ini terjadi saat preset berganti,
    // bukan tiap buffer.
    //
    // (B15-H1): bangun ke cascade SEMENTARA di stack (tanpa alokasi heap),
    // tukar ke mCascade hanya bila SEMUA filter berhasil. Preset yang
    // gagal satu filter pun DITOLAK seluruhnya: mCascade live, preamp
    // live, mApplied, dan status enabled tidak disentuh — preset lama
    // tetap berlaku, atau node tetap nonaktif bila belum pernah ada
    // preset yang berhasil terpasang. Pilihan "preset lama tetap
    // berlaku" (bukan disable node) karena penolakan berarti preset baru
    // tidak berpengaruh sama sekali; mematikan node akan membunuh
    // koreksi yang sedang berjalan dengan benar gara-gara preset baru
    // yang rusak. Ini menutup tiga lubang lama: (a) mCascade.clear()
    // di awal menghapus preset lama sebelum tahu preset baru valid;
    // (b) setPreamp() menempel di cascade live walau semua filter
    // gagal; (c) mApplied dicatat walau loop break, sehingga dedup
    // di atas bisa meng-enable kembali preset gagal-sebagian tanpa
    // mencoba ulang. Karena mApplied tidak dicatat saat gagal,
    // pemanggilan ulang dengan preset yang sama tidak cocok dengan
    // dedup dan mencoba applyConfig lagi dari awal.
    //
    // Perilaku klem frekuensi (designOk) TIDAK diubah — itu urusan H2.

    BiquadCascade staged;

    // Benih laju dari prepare(), supaya koefisien dihitung dengan laju
    // yang benar (setFilter di bawah juga meneruskan laju ini; bila
    // mAppliedSampleRate <= 0, staged memakai default 48 kHz — sama
    // seperti node baru).
    if (mAppliedSampleRate > 0) {
        staged.setSampleRate(static_cast<float>(mAppliedSampleRate));
    }

    staged.setPreamp(preset.preampDb);

    // (B15-H2): laju efektif untuk guard Nyquist — sama dengan laju yang
    // dipakai staged.setFilter di bawah (prepare(), atau default 48 kHz
    // staged bila prepare() belum dipanggil). Pakai default di sini juga:
    // bila mAppliedSampleRate <= 0, threshold 0,49*0 akan melewati semua
    // filter, padahal staged mendesain di 48 kHz.
    const float effectiveSampleRate =
        mAppliedSampleRate > 0
            ? static_cast<float>(mAppliedSampleRate)
            : 48000.0f;

    bool ok = true;
    int index = 0;

    for (int i = 0; i < preset.filterCount; ++i) {

        if (index >= BiquadCascade::kMaxFilters) {
            // Preset lebih panjang dari kapasitas: tolak seluruhnya,
            // jangan pasang prefix-nya saja. (Parser sudah menolak
            // filterCount > 16, jadi jalur ini praktis tak terjangkau.)
            ok = false;
            break;
        }

        const auto& f = preset.filters[i];

        // (B15-H2): LEWATI filter di atas Nyquist, jangan digeser.
        // designOk mengklem Fc ke 0,49*sr — filter 20 kHz pada stream
        // 32 kHz akan dibangun di 15.680 Hz, menaruh koreksi di
        // frekuensi yang salah tanpa penanda. Melewati filter ini
        // mempertahankan sisa preset tetap benar. Filter yang dilewati
        // tidak masuk hitungan aktif dan tidak memanggil setFilter sama
        // sekali, jadi tidak pernah sampai ke designOk untuk diklem.
        if (f.freqHz >= 0.49f * effectiveSampleRate) {
            continue;
        }

        FilterType type = FilterType::Peaking;

        if (f.type == 1) {
            type = FilterType::LowShelf;
        } else if (f.type == 2) {
            type = FilterType::HighShelf;
        }

        if (!staged.setFilter(
                index, type, f.freqHz, f.q, f.gainDb,
                static_cast<float>(mAppliedSampleRate))) {
            ok = false;
            break;
        }

        ++index;
    }

    if (!ok) {
        // Ditolak: jangan sentuh apa pun yang live. `staged` (termasuk
        // preamp preset gagal) dibuang bersama stack frame.
        return;
    }

    staged.setActiveCount(index);

    // Semua filter berhasil: tukar sekaligus. BiquadCascade hanya berisi
    // array statis + skalar (tanpa pointer/alokasi), jadi copy assignment
    // default aman. State filter staged masih nol — sama seperti clear()
    // lama yang me-reset state.
    mCascade = staged;

    mApplied = preset;
    mHasApplied = true;

    setEnabled(index > 0);
}

// =====================================================
// AKSES
// =====================================================

BiquadCascade&
HeadphoneCorrectionNode::cascade() {

    return mCascade;
}

int HeadphoneCorrectionNode::activeFilterCount() const {

    return mCascade.activeCount();
}

} // namespace pristine
