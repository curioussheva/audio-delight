#pragma once

#include "PlaybackTypes.h"

#include <vector>
#include <optional>
#include <mutex>
#include <random>

namespace pristine::playback {

class TrackQueue {
public:

    TrackQueue();

    ~TrackQueue() = default;

    TrackQueue(
        const TrackQueue&
    ) = delete;

    TrackQueue& operator=(
        const TrackQueue&
    ) = delete;

    // =====================================
    // Queue Management
    // =====================================

    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): appendTrack /
    // insertTrack / removeTrack / clear() dihapus — 0 pemakai di seluruh
    // cpp/ (hanya setTracks yang hidup). Menghapus removeTrack juga
    // menghapus p-m1/p-m2 laten audit (remove di tengah playback tidak
    // menyesuaikan mCurrentIndex / mShuffleOrder dengan benar).
    //
    // B9-setTracks-keep (2026-11-12): keepCurrentUri=true mempertahankan
    // trek yang sedang diputar bila masih ada di tracks baru (cocok
    // operator==: uri+durationMs+sampleRate, lihat PlaybackTypes.h).
    // Shuffle OFF: mCurrentIndex = indeksnya di tracks baru. Shuffle ON:
    // trek itu ditukar ke posisi AKTIF yang sama (mCurrentIndex lama),
    // jadi current() tetap trek yang sama — pola yang sama dengan
    // setShuffleMode() OFF→ON di bawah. Tidak ketemu → fallback 0
    // (perilaku lama). Default false = perilaku lama, IDENTIK:
    // mCurrentIndex=0 dan (shuffle ON) trek index 0 di posisi aktif 0.
    //
    // ⚠️ JANGAN kirim keep=true dari playSong/resume JS: keduanya
    // mengirim antrean yang SUDAH di-rotate supaya lagu yang di-tap /
    // di-resume ada di indeks 0 dan justru MENGANDALKAN reset ke 0.
    // keep=true hanya untuk pengirim-ulang playlist yang TIDAK
    // me-rotate (mis. refresh library saat memutar) — belum ada
    // pemanggilnya; API ini disediakan untuk itu.
    void setTracks(
        const std::vector<TrackInfo>& tracks,
        bool keepCurrentUri = false
    );

    // =====================================
    // Navigation
    // =====================================

    [[nodiscard]]
    std::optional<TrackInfo>
    current() const;

    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): peeker next() /
    // previous() / peek() / hasNext() / hasPrevious() dihapus — 0 pemakai
    // (navigasi hidup: advance/advanceManual/retreat/jumpTo/current).
    bool advance();

    // Manual next (tombol Next): SELALU maju satu langkah, apa pun repeat
    // mode-nya. Beda dengan advance() yang dipakai auto-advance EOF: di sana
    // Repeat One memang harus me-reload trek yang sama. Tombol Next dengan
    // Repeat One harus pindah ke trek berikut (P-M5, 2026-11-10).
    bool advanceManual();

    bool retreat();

    // 🔥 FIX (2026-11-12, B9-TOCTOU): step + get ATOMIK dalam satu lock.
    //
    // advance()/advanceManual()/retreat() + current() adalah DUA lock
    // berurutan — di antaranya jumpTo()/setTracks()/setShuffleMode() dari
    // JNI bisa menyela, sehingga current() mengembalikan trek yang BUKAN
    // hasil step tadi (TOCTOU; processAdvance, next(), previous() di
    // PlaybackController.cpp semuanya kena). Ketiga method ini melakukan
    // step dan pengambilan trek dalam SATU lock, jadi tidak ada jendela
    // sela. Semantik Repeat/Shuffle PERSIS sama dengan method lama
    // (badan step dipindah ke stepForwardLocked/stepBackLocked yang
    // dipakai kedua belah pihak).
    //
    // CATATAN: ini TIDAK menutup lubang Batch 8 P2 (post EOF basi —
    // sudah ditutup generation counter di PlaybackController); yang
    // ditutup di sini hanya sela step→get di dalam TrackQueue.
    // nullopt = tidak ada lagu berikut (ujung queue + Repeat Off, atau
    // queue kosong).
    [[nodiscard]]
    std::optional<TrackInfo>
    advanceAndGet();

    [[nodiscard]]
    std::optional<TrackInfo>
    advanceManualAndGet();

    [[nodiscard]]
    std::optional<TrackInfo>
    retreatAndGet();

    bool jumpTo(
        size_t index
    );

    // =====================================
    // Modes
    // =====================================

    void setShuffleMode(
        ShuffleMode mode
    );

    [[nodiscard]]
    ShuffleMode
    getShuffleMode() const;

    void setRepeatMode(
        RepeatMode mode
    );

    [[nodiscard]]
    RepeatMode
    getRepeatMode() const;

    // =====================================
    // Queries
    // =====================================

    [[nodiscard]]
    bool isEmpty() const;

    [[nodiscard]]
    size_t size() const;

    [[nodiscard]]
    size_t currentIndex() const;


    [[nodiscard]]
    std::vector<TrackInfo>
    tracks() const;

    // Queue DALAM URUTAN AKTIF (ter-shuffle kalau shuffle menyala).
    //
    // Ini yang HARUS dipakai untuk navigasi dan untuk indeks yang dilaporkan
    // ke UI. `tracks()` mengembalikan urutan ASLI (urut file) dan hanya cocok
    // untuk menampilkan daftar tanpa navigasi - mis. daftar "semua lagu".
    //
    // Memakai tracks() untuk navigasi membuat indeks tidak cocok dengan lagu
    // yang benar-benar diputar saat shuffle menyala. Gejalanya di device:
    // shuffle berjalan (lagu berganti acak) tapi UI menampilkan urutan dan
    // posisi yang salah - "shuffle berhasil, UI tidak sinkron" (2026-10-05).
    [[nodiscard]]
    std::vector<TrackInfo>
    activeTracks() const;

private:

    [[nodiscard]]
    std::vector<TrackInfo>
    activeQueue() const;

    // Badan step advance()/advanceManual()/retreat() TANPA lock — pemanggil
    // WAJIB sudah pegang mMutex. Dipakai method lama DAN method *AndGet
    // baru, supaya semantik Repeat/Shuffle tidak pernah bercabang dua.
    // stepForwardLocked(false) = advance() (auto, hormati Repeat One);
    // stepForwardLocked(true) = advanceManual() (tombol Next, selalu maju).
    bool stepForwardLocked(
        bool manual
    );

    bool stepBackLocked();

    // Elemen ke-i dari queue AKTIF tanpa menyalin vektor (B9-TOCTOU):
    // mShuffleMode==Off ? mTracks[i] : mTracks[mShuffleOrder[i]].
    // Pemanggil WAJIB pegang mMutex dan i < activeSizeLocked().
    // Invarian: mShuffleOrder selalu dibangun ulang dari mTracks
    // (rebuildShuffle di setTracks/setShuffleMode), jadi setiap entri
    // < mTracks.size() dan posisi aktif ke-i == mShuffleOrder[i].
    [[nodiscard]]
    const TrackInfo&
    activeAt(
        size_t i
    ) const;

    // Ukuran queue AKTIF tanpa menyalin vektor — padanan
    // activeQueue().size(): entri mShuffleOrder yang tidak valid
    // (index >= mTracks.size()) tidak dihitung, sama seperti filter
    // di activeQueue().
    [[nodiscard]]
    size_t
    activeSizeLocked() const;

    void rebuildShuffle();

private:

    mutable std::mutex mMutex;

    // canonical playlist

    std::vector<TrackInfo>
        mTracks;

    // shuffled playback order

    std::vector<size_t>
        mShuffleOrder;

    size_t
        mCurrentIndex = 0;

    ShuffleMode
        mShuffleMode =
            ShuffleMode::Off;

    RepeatMode
        mRepeatMode =
            RepeatMode::Off;

    std::mt19937
        mRandom;
};

} // namespace pristine::playback 