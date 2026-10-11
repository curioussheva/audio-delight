#pragma once
#include "FFTypes.h"
#include <memory>
#include <vector>

namespace pristine {

/**
 * FFT radix-2 (decimation in time), kompleks, maju + balik.
 *
 * `n` harus pangkat dua. Tabel twiddle dan bit-reversal dihitung sekali di
 * konstruktor, jadi `forward()`/`inverse()` tidak mengalokasi memori - penting
 * karena keduanya dipanggil dari jalur audio/visualizer berulang.
 *
 * Riwayat: kelas ini dulu stub (`forward()` hanya menyalin input ke output).
 * Tabel `mCfg` di bawah adalah sisa dari rencana memakai kissfft; dependensi
 * itu tidak pernah ada di proyek, jadi implementasinya ditulis sendiri.
 */
class FFTPlan {
public:
    explicit FFTPlan(int n);
    ~FFTPlan();

    /** Transformasi maju. `realInput` berisi n sampel real. */
    void forward(const float* realInput, Complex* complexOutput);

    /** Transformasi balik. Menghasilkan n sampel real (sudah dibagi n). */
    void inverse(const Complex* complexInput, float* realOutput);

    int getSize() const { return mSize; }

    /** true kalau plan siap dipakai (ukuran pangkat dua dan > 0). */
    bool isValid() const { return mSize > 0; }

private:
    int mSize;
    int mLevels;                  // log2(mSize)

    std::vector<int> mBitRev;     // indeks urutan bit-reversed
    std::vector<Complex> mTwiddle; // exp(-2*pi*i*k/n), k = 0..n/2-1
    std::vector<Complex> mScratch; // buffer kerja, ukuran n
};

} // namespace pristine
