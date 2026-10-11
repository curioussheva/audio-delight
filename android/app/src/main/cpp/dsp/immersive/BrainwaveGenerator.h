#pragma once
#include <cstdint>

namespace pristine { namespace dsp {

enum class BrainwaveType {
    DELTA, THETA, ALPHA, BETA, GAMMA
};

// =====================================================
// BRAINWAVE GENERATOR
// =====================================================
//
// Menambahkan binaural beat ke sinyal yang sudah ada (BUKAN menggantinya).
//
// Versi sebelumnya MENOLKAN buffer:
//
//     for (...) { left[i] = 0.0f; right[i] = 0.0f; }
//
// Itu bukan efek yang tidak berjalan - itu menghapus musiknya. Karena
// ImmersiveStage memanggilnya paling akhir, mengaktifkan mode Immersive dengan
// `brainwaveFreq > 0` menghasilkan keheningan total. Sekarang ia menambahkan.
//
// Cara kerja binaural beat: kedua channel diberi nada pembawa yang frekuensinya
// berbeda sedikit (selisih = frekuensi beat). Saraf pendengaran mempersepsikan
// selisihnya sebagai denyut. Efek ini hanya bekerja lewat HEADPHONE - pada
// speaker, kedua channel bercampur di udara dan beat-nya hilang.
//
// Amplitudo carrier sengaja kecil dan dikalikan `mVolume`, supaya ia menjadi
// lapisan halus di bawah musik, bukan nada yang mendominasi.
class BrainwaveGenerator {
public:
    BrainwaveGenerator();

    void setType(BrainwaveType type);

    // volume 0..1. 0 = tidak menambahkan apa pun (bypass).
    void setVolume(float volume);

    // Menambahkan beat ke buffer (in-place), tidak menggantinya.
    void generate(float* left, float* right, int32_t numFrames, float sampleRate);

    void reset();

private:
    // Frekuensi beat (Hz) untuk tiap band.
    static float beatFrequency(BrainwaveType type);

    BrainwaveType mType = BrainwaveType::ALPHA;

    float mVolume = 0.2f;

    // Fase carrier kiri & kanan. TIDAK direset tiap buffer - fase harus
    // kontinu, kalau tidak akan terdengar klik di setiap batas buffer.
    float mPhaseL = 0.0f;
    float mPhaseR = 0.0f;
};

}} // namespace
