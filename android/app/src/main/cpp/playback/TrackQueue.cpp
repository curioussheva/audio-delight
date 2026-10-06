#include "TrackQueue.h"

#include <algorithm>

namespace pristine::playback {

TrackQueue::TrackQueue()
    :
    mRandom(
        std::random_device{}()
    ) {
}

// =====================================
// Queue Management
// =====================================

void TrackQueue::setTracks(
    const std::vector<TrackInfo>& tracks
) {
    std::lock_guard lock(mMutex);

    mTracks = tracks;

    mCurrentIndex = 0;

    rebuildShuffle();

    // 🔥 FIX (2026-10-06): saat shuffle ON, trek pertama queue baru HARUS
    // trek index 0 (yang user tap / sedang diputar), bukan trek acak.
    //
    // rebuildShuffle() mengisi mShuffleOrder = [0,1,2,...,n] lalu di-shuffle,
    // jadi mShuffleOrder[0] bisa index BERAPA PUN (mis. 39). Tanpa ini,
    // play() memanggil queue_->current() → activeQueue()[0] → trek acak.
    // Gejala di device: user tap "Dark Sky Island" (index 0), native main
    // trek URI[39] (1000996760) — UI dan speaker tidak sync.
    if (
        mShuffleMode != ShuffleMode::Off &&
        !mShuffleOrder.empty()
    ) {
        // Cari di mana index 0 sekarang berada, lalu tukar ke posisi 0.
        const auto it = std::find(
            mShuffleOrder.begin(),
            mShuffleOrder.end(),
            static_cast<size_t>(0)
        );
        if (
            it != mShuffleOrder.end() &&
            it != mShuffleOrder.begin()
        ) {
            std::iter_swap(
                it,
                mShuffleOrder.begin()
            );
        }
    }
}

void TrackQueue::appendTrack(
    const TrackInfo& track
) {
    std::lock_guard lock(mMutex);

    mTracks.push_back(track);

    rebuildShuffle();
}

void TrackQueue::insertTrack(
    size_t index,
    const TrackInfo& track
) {
    std::lock_guard lock(mMutex);

    if (index > mTracks.size()) {
        index = mTracks.size();
    }

    mTracks.insert(
        mTracks.begin() + index,
        track
    );

    rebuildShuffle();
}

void TrackQueue::removeTrack(
    size_t index
) {
    std::lock_guard lock(mMutex);

    if (index >= mTracks.size()) {
        return;
    }

    mTracks.erase(
        mTracks.begin() + index
    );

    if (
        mCurrentIndex >= mTracks.size() &&
        !mTracks.empty()
    ) {
        mCurrentIndex =
            mTracks.size() - 1;
    }

    rebuildShuffle();
}

void TrackQueue::clear() {

    std::lock_guard lock(mMutex);

    mTracks.clear();

    mShuffleOrder.clear();

    mCurrentIndex = 0;
}

std::vector<TrackInfo> TrackQueue::tracks() const {
    std::lock_guard lock(mMutex);

    return mTracks;
}

// Queue dalam urutan AKTIF (ter-shuffle kalau shuffle menyala).
//
// Dipakai untuk navigasi dan untuk indeks yang dilaporkan ke UI, supaya
// indeks selalu menunjuk lagu yang sama dengan yang benar-benar diputar
// native. Sebelumnya JNI memakai tracks() (urutan asli), sehingga saat
// shuffle menyala indeks UI tidak cocok dengan lagu yang berbunyi.
std::vector<TrackInfo> TrackQueue::activeTracks() const {
    std::lock_guard lock(mMutex);

    const auto& queue = activeQueue();
    return std::vector<TrackInfo>(queue.begin(), queue.end());
}

// =====================================
// Navigation
// =====================================

std::optional<TrackInfo>
TrackQueue::current() const {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex];
}

std::optional<TrackInfo>
TrackQueue::next() const {

    std::lock_guard lock(mMutex);

    if (!hasNext()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex + 1];
}

std::optional<TrackInfo>
TrackQueue::previous() const {

    std::lock_guard lock(mMutex);

    if (!hasPrevious()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex - 1];
}

std::optional<TrackInfo>
TrackQueue::peek(
    size_t offset
) const {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return std::nullopt;
    }

    const size_t target =
        mCurrentIndex + offset;

    const auto& queue =
        activeQueue();

    if (target >= queue.size()) {
        return std::nullopt;
    }

    return queue[target];
}

bool TrackQueue::advance() {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return false;
    }

    switch (mRepeatMode) {

    case RepeatMode::One:
        return true;

    case RepeatMode::All:

        if (
            mCurrentIndex + 1 >=
            activeQueue().size()
        ) {
            mCurrentIndex = 0;
            return true;
        }

        ++mCurrentIndex;
        return true;

    case RepeatMode::Off:

        if (
            mCurrentIndex + 1 >=
            activeQueue().size()
        ) {
            return false;
        }

        ++mCurrentIndex;
        return true;
    }

    return false;
}

bool TrackQueue::retreat() {

    std::lock_guard lock(mMutex);

    if (
        mTracks.empty() ||
        mCurrentIndex == 0
    ) {
        return false;
    }

    --mCurrentIndex;

    return true;
}

bool TrackQueue::jumpTo(
    size_t index
) {
    std::lock_guard lock(mMutex);

    if (
        index >= activeQueue().size()
    ) {
        return false;
    }

    mCurrentIndex = index;

    return true;
}

// =====================================
// Modes
// =====================================

void TrackQueue::setShuffleMode(
    ShuffleMode mode
) {
    std::lock_guard lock(mMutex);

    if (
        mShuffleMode == mode
    ) {
        return;
    }

    // 🔥 FIX (2026-10-06): pertahankan trek yang sedang diputar saat toggle.
    //
    // mCurrentIndex adalah posisi di queue AKTIF. Saat shuffle ON, posisi 0
    // berarti mShuffleOrder[0] (mis. trek 39). Kalau shuffle dimatikan tanpa
    // menyesuaikan, posisi 0 tiba-tiba berarti trek 0 — lagunya berubah
    // padahal user tidak skip. Sebaliknya saat OFF→ON, trek index 39 harus
    // tetap bisa diakses.
    //
    // ⚠️ JANGAN panggil current() di sini — dia lock mMutex lagi, dan kita
    // sudah pegang lock (std::mutex tidak rekursif → deadlock). Baca
    // langsung lewat activeQueue().
    std::optional<TrackInfo> playingTrack;
    if (!mTracks.empty()) {
        const auto& act = activeQueue();
        if (mCurrentIndex < act.size()) {
            playingTrack = act[mCurrentIndex];
        }
    }

    mShuffleMode = mode;

    rebuildShuffle();

    if (
        playingTrack &&
        mode == ShuffleMode::Off
    ) {
        // ON→OFF: cari trek yang sedang main di queue asli, lompat ke sana.
        const auto it = std::find(
            mTracks.begin(),
            mTracks.end(),
            *playingTrack
        );
        if (it != mTracks.end()) {
            mCurrentIndex = static_cast<size_t>(
                std::distance(mTracks.begin(), it)
            );
        }
    } else if (
        playingTrack &&
        mode == ShuffleMode::On
    ) {
        // OFF→ON: trek yang sedang main harus ada di posisi mCurrentIndex
        // dari shuffled order supaya current() tetap trek yang sama.
        const auto it = std::find(
            mTracks.begin(),
            mTracks.end(),
            *playingTrack
        );
        if (it != mTracks.end()) {
            const size_t trackIdx = static_cast<size_t>(
                std::distance(mTracks.begin(), it)
            );
            // Cari trackIdx di mShuffleOrder, tukar ke posisi mCurrentIndex.
            const auto sit = std::find(
                mShuffleOrder.begin(),
                mShuffleOrder.end(),
                trackIdx
            );
            if (sit != mShuffleOrder.end()) {
                const size_t target = (mCurrentIndex < mShuffleOrder.size())
                    ? mCurrentIndex
                    : 0;
                std::iter_swap(
                    sit,
                    mShuffleOrder.begin() + target
                );
            }
        }
    }
}

ShuffleMode
TrackQueue::getShuffleMode() const {

    return mShuffleMode;
}

void TrackQueue::setRepeatMode(
    RepeatMode mode
) {
    mRepeatMode = mode;
}

RepeatMode
TrackQueue::getRepeatMode() const {

    return mRepeatMode;
}

// =====================================
// Queries
// =====================================

bool TrackQueue::isEmpty() const {

    std::lock_guard lock(mMutex);

    return mTracks.empty();
}

bool TrackQueue::hasNext() const {

    if (mTracks.empty()) {
        return false;
    }

    return (
        mCurrentIndex + 1 <
        activeQueue().size()
    );
}

bool TrackQueue::hasPrevious() const {

    return mCurrentIndex > 0;
}

size_t
TrackQueue::size() const {

    std::lock_guard lock(mMutex);

    return mTracks.size();
}

size_t
TrackQueue::currentIndex() const {

    return mCurrentIndex;
}

// =====================================
// Internal
// =====================================

std::vector<TrackInfo>
TrackQueue::activeQueue() const {

    if (
        mShuffleMode ==
        ShuffleMode::Off
    ) {
        return mTracks;
    }

    // 🔥 FIX (2026-10-06): buang static thread_local.
    //
    // Cache thread_local itu race menunggu kecelakaan: activeQueue() dipanggil
    // dari banyak thread (decoder, JNI/UI, advance thread), dan masing-masing
    // memegang versi sendiri. Setelah mTracks berubah (setTracks), thread lain
    // masih baca cache LAMA — trek yang sudah tidak ada di queue, atau urutan
    // yang sudah tidak valid. Gejala: desync antara native playback dan UI.
    //
    // Membangun ulang setiap kali memang O(n), tapi n = ukuran queue (<= ~200)
    // dan ini hanya saat shuffle ON. Bandingkan dengan decode per-chunk yang
    // jauh lebih berat — tidak ada di hot path yang penting.
    std::vector<TrackInfo> shuffled;

    shuffled.reserve(
        mShuffleOrder.size()
    );

    for (
        auto index :
        mShuffleOrder
    ) {
        // Guard: setelah setTracks, mShuffleOrder bisa berisi index >= size
        // kalau ukuran queue menyusut. Skip index tidak valid, jangan UB.
        if (
            index < mTracks.size()
        ) {
            shuffled.push_back(
                mTracks[index]
            );
        }
    }

    // ⚠️ Return by VALUE, bukan reference. std::vector<TrackInfo> di header
    // di-deklarasikan return-by-value; return reference ke local adalah
    // dangling reference (clang warning -Wreturn-stack-address).
    return shuffled;
}

void TrackQueue::rebuildShuffle() {

    mShuffleOrder.clear();

    mShuffleOrder.reserve(
        mTracks.size()
    );

    for (
        size_t i = 0;
        i < mTracks.size();
        ++i
    ) {
        mShuffleOrder.push_back(i);
    }

    std::shuffle(
        mShuffleOrder.begin(),
        mShuffleOrder.end(),
        mRandom
    );
}

} // namespace pristine::playback 