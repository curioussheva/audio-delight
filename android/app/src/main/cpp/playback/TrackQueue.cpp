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
    const std::vector<TrackInfo>& tracks,
    bool keepCurrentUri
) {
    std::lock_guard lock(mMutex);

    // B9-setTracks-keep (2026-11-12): tangkap trek yang sedang main
    // SEBELUM mTracks ditimpa — sesudah itu antrean lama hilang.
    // ⚠️ JANGAN panggil current() di sini — dia lock mMutex lagi, dan
    // kita sudah pegang lock (std::mutex tidak rekursif → deadlock).
    // Baca langsung lewat activeAt(), pola yang sama dengan
    // setShuffleMode() di bawah. oldActiveIndex = posisi AKTIF lama,
    // dipakai lagi bila shuffle menyala (lihat bawah).
    std::optional<TrackInfo> playingTrack;
    size_t oldActiveIndex = 0;
    if (
        keepCurrentUri &&
        !mTracks.empty() &&
        mCurrentIndex < activeSizeLocked()
    ) {
        playingTrack = activeAt(mCurrentIndex);
        oldActiveIndex = mCurrentIndex;
    }

    mTracks = tracks;

    mCurrentIndex = 0;

    rebuildShuffle();

    // B9-setTracks-keep: trek lama masih ada di antrean baru → pertahankan.
    if (playingTrack) {
        const auto it = std::find(
            mTracks.begin(),
            mTracks.end(),
            *playingTrack
        );
        if (it != mTracks.end()) {
            const size_t trackIdx = static_cast<size_t>(
                std::distance(mTracks.begin(), it)
            );
            if (mShuffleMode == ShuffleMode::Off) {
                mCurrentIndex = trackIdx;
                return;
            } else {
                // Shuffle ON: tukar trackIdx ke posisi AKTIF lama, jadi
                // current() tetap trek yang sama di posisi yang sama
                // (pola yang sama dengan setShuffleMode() OFF→ON).
                // Guard: posisi lama bisa di luar antrean baru yang
                // menyusut — kalau begitu mCurrentIndex = posisi acak
                // track itu di mShuffleOrder (tetap trek yang sama).
                const auto sit = std::find(
                    mShuffleOrder.begin(),
                    mShuffleOrder.end(),
                    trackIdx
                );
                if (sit != mShuffleOrder.end()) {
                    if (oldActiveIndex < mShuffleOrder.size()) {
                        std::iter_swap(
                            sit,
                            mShuffleOrder.begin() + oldActiveIndex
                        );
                        mCurrentIndex = oldActiveIndex;
                    } else {
                        mCurrentIndex = static_cast<size_t>(
                            std::distance(mShuffleOrder.begin(), sit)
                        );
                    }
                    return;
                }
                // State tak valid (trackIdx tidak ada di mShuffleOrder —
                // seharusnya mustahil karena rebuildShuffle() mengisinya
                // dari mTracks): JANGAN return — jatuh ke perilaku lama
                // di bawah (mCurrentIndex=0 + tukar index 0 ke depan).
                mCurrentIndex = 0;
            }
        }
        // Tidak ketemu di antrean baru → jatuh ke perilaku lama di bawah.
    }

    // 🔥 FIX (2026-10-06): saat shuffle ON, trek pertama queue baru HARUS
    // trek index 0 (yang user tap / sedang diputar), bukan trek acak.
    //
    // rebuildShuffle() mengisi mShuffleOrder = [0,1,2,...,n] lalu di-shuffle,
    // jadi mShuffleOrder[0] bisa index BERAPA PUN (mis. 39). Tanpa ini,
    // play() memanggil queue_->current() → activeAt(0) → trek acak.
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

    // B9-activeQueue: activeQueue() sudah mengembalikan vektor by value —
    // dulu disalin SEKALI LAGI ke vektor baru (2× salinan penuh).
    return activeQueue();
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

    // B9-activeQueue: SATU TrackInfo via activeAt, tanpa salinan vektor.
    // Dulu: activeQueue() menyalin SELURUH queue (1–2 MB + ribuan alokasi
    // untuk playlist ribuan lagu) hanya untuk mengambil [mCurrentIndex] —
    // dan current() dipanggil watcher 500 ms via getCurrentTrack, jadi
    // salinan penuh itu terjadi tiap 500 ms. Guard batas juga baru: dulu
    // queue[mCurrentIndex] tanpa cek (UB bila indeks di luar ukuran
    // aktif); di state valid nilainya sama, di state tak valid kini
    // nullopt, bukan UB.
    if (mCurrentIndex >= activeSizeLocked()) {
        return std::nullopt;
    }

    return activeAt(mCurrentIndex);
}

bool TrackQueue::advance() {

    std::lock_guard lock(mMutex);

    return stepForwardLocked(false);
}

bool TrackQueue::stepForwardLocked(
    bool manual
) {
    if (mTracks.empty()) {
        return false;
    }

    // B9-TOCTOU: badan lama advance()/advanceManual() dipindah ke sini
    // tanpa perubahan semantik — activeQueue().size() diganti
    // activeSizeLocked() (nilai sama, tanpa salinan vektor).
    const size_t n = activeSizeLocked();

    if (manual) {
        // 🔥 FIX (2026-11-10, P-M5): manual next SELALU maju, apa pun
        // repeat mode. Di ujung queue: wrap ke 0 kalau repeat menyala
        // (One/All), diam kalau Off.
        if (mCurrentIndex + 1 < n) {
            ++mCurrentIndex;
            return true;
        }

        if (mRepeatMode != RepeatMode::Off) {
            mCurrentIndex = 0;
            return true;
        }

        return false;
    }

    switch (mRepeatMode) {

    case RepeatMode::One:
        return true;

    case RepeatMode::All:

        if (
            mCurrentIndex + 1 >=
            n
        ) {
            mCurrentIndex = 0;
            return true;
        }

        ++mCurrentIndex;
        return true;

    case RepeatMode::Off:

        if (
            mCurrentIndex + 1 >=
            n
        ) {
            return false;
        }

        ++mCurrentIndex;
        return true;
    }

    return false;
}

// 🔥 FIX (2026-11-10, P-M5): manual next SELALU maju, apa pun repeat mode.
//
// advance() dipakai bersama untuk dua keperluan berbeda — auto-advance EOF
// dan tombol Next manual — dan semantik repeat-one yang benar hanya untuk
// EOF. Akibatnya dengan Repeat One, Next me-restart lagu yang sama (advance
// return true tanpa bergerak), sementara Previous tetap mundur (retreat
// tidak memeriksa repeat mode) — asimetris dan membingungkan.
//
// advanceManual() dipakai PlaybackController::next() saja. Di ujung queue:
// wrap ke 0 kalau repeat menyala (One/All), diam kalau Off.
bool TrackQueue::advanceManual() {

    std::lock_guard lock(mMutex);

    return stepForwardLocked(true);
}

// B9-TOCTOU (2026-11-12): step + get dalam SATU lock — lihat header.
// Semantik = advance() + current() lama, tanpa jendela sela.
std::optional<TrackInfo>
TrackQueue::advanceAndGet() {

    std::lock_guard lock(mMutex);

    if (!stepForwardLocked(false)) {
        return std::nullopt;
    }

    return activeAt(mCurrentIndex);
}

std::optional<TrackInfo>
TrackQueue::advanceManualAndGet() {

    std::lock_guard lock(mMutex);

    if (!stepForwardLocked(true)) {
        return std::nullopt;
    }

    return activeAt(mCurrentIndex);
}

std::optional<TrackInfo>
TrackQueue::retreatAndGet() {

    std::lock_guard lock(mMutex);

    if (!stepBackLocked()) {
        return std::nullopt;
    }

    return activeAt(mCurrentIndex);
}

bool TrackQueue::retreat() {

    std::lock_guard lock(mMutex);

    return stepBackLocked();
}

bool TrackQueue::stepBackLocked() {

    if (mTracks.empty()) {
        return false;
    }

    // B9-TOCTOU: badan lama retreat() dipindah ke sini tanpa perubahan
    // semantik — activeQueue().size()/empty() diganti activeSizeLocked().
    //
    // 🔥 FIX (2026-10-10): wrap-around saat repeat All.
    //
    // Versi lama langsung return false kalau mCurrentIndex == 0, jadi
    // previous() di trek pertama no-op meskipun repeat All aktif. Tombol
    // previous() PlaybackController memakai retreat() sekarang, jadi
    // perilaku ini jadi terlihat oleh user.
    if (mCurrentIndex == 0) {
        if (mRepeatMode == RepeatMode::All && activeSizeLocked() > 0) {
            mCurrentIndex = activeSizeLocked() - 1;
            return true;
        }
        return false;
    }

    --mCurrentIndex;

    return true;
}

bool TrackQueue::jumpTo(
    size_t index
) {
    std::lock_guard lock(mMutex);

    // B9-activeQueue: activeQueue().size() diganti activeSizeLocked()
    // (nilai sama, tanpa salinan vektor).
    if (
        index >= activeSizeLocked()
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
    // langsung lewat activeAt().
    //
    // B9-activeQueue: dulu activeQueue() menyalin SELURUH queue hanya
    // untuk satu elemen [mCurrentIndex]; kini activeAt(mCurrentIndex)
    // langsung. Semantik SAMA (invarian B9-TOCTOU: semua entri
    // mShuffleOrder valid, jadi activeQueue()[i] == activeAt(i)).
    // Logika ON→OFF di bawah memakai origIdx — lihat penangkapan
    // playingOrigIdx (B9-shuffle-origIdx).
    std::optional<TrackInfo> playingTrack;
    if (!mTracks.empty() && mCurrentIndex < activeSizeLocked()) {
        playingTrack = activeAt(mCurrentIndex);
    }

    // B9-shuffle-origIdx (2026-11-12): indeks ASLI trek yang sedang main,
    // dibaca dari mShuffleOrder SEBELUM rebuildShuffle() menimpanya.
    //
    // ON→OFF dulu memakai std::find + operator== (uri+durationMs+
    // sampleRate, lihat p-m6 di PlaybackTypes.h) — find mengembalikan
    // kecocokan PERTAMA, jadi lagu duplikat yang byte-identical (mis.
    // lagu yang sama ditambahkan 2x) selalu jatuh ke indeks pertama,
    // bukan ke salinan yang benar-benar sedang diputar.
    // mShuffleOrder[mCurrentIndex] adalah indeks asli yang persis —
    // tahan duplikat, tanpa operator==.
    //
    // HARUS ditangkap di sini: rebuildShuffle() di bawah mengisi ulang
    // mShuffleOrder dengan permutasi baru, jadi sesudah itu urutan lama
    // hilang. Guard: mode lama shuffle (kalau sudah Off, early-return di
    // atas sudah keluar), mCurrentIndex di dalam mShuffleOrder, dan
    // entri di dalam mTracks.
    std::optional<size_t> playingOrigIdx;
    if (
        mShuffleMode != ShuffleMode::Off &&
        !mTracks.empty() &&
        mCurrentIndex < mShuffleOrder.size() &&
        mShuffleOrder[mCurrentIndex] < mTracks.size()
    ) {
        playingOrigIdx = mShuffleOrder[mCurrentIndex];
    }

    mShuffleMode = mode;

    rebuildShuffle();

    if (
        playingTrack &&
        mode == ShuffleMode::Off
    ) {
        // ON→OFF: lompat ke indeks asli trek yang sedang main.
        if (playingOrigIdx) {
            mCurrentIndex = *playingOrigIdx;
        } else {
            // Fallback (state tak valid / origIdx tak tertangkap):
            // perilaku lama — find kecocokan pertama via operator==.
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

    std::lock_guard lock(mMutex);

    return mShuffleMode;
}

// 🔥 FIX (2026-11-10, P-M6): tulis mRepeatMode DI BAWAH lock.
//
// Sebelumnya tanpa lock, sementara advance()/retreat() membaca mRepeatMode
// di bawah mMutex (thread advance) dan JNI thread menulisnya lewat
// nativeSetRepeatMode — data race (UB; praktis benign di arm64, tapi TSan
// menandainya). Sama seperti setShuffleMode() di atas.
void TrackQueue::setRepeatMode(
    RepeatMode mode
) {
    std::lock_guard lock(mMutex);

    mRepeatMode = mode;
}

RepeatMode
TrackQueue::getRepeatMode() const {

    std::lock_guard lock(mMutex);

    return mRepeatMode;
}

// =====================================
// Queries
// =====================================

bool TrackQueue::isEmpty() const {

    std::lock_guard lock(mMutex);

    return mTracks.empty();
}

size_t
TrackQueue::size() const {

    std::lock_guard lock(mMutex);

    return mTracks.size();
}

size_t
TrackQueue::currentIndex() const {

    // 🔥 FIX (2026-11-10, p-m3): baca di bawah lock. mCurrentIndex bukan
    // atomik; advance() (advanceThread) dan setTracks (JS thread) menulisnya
    // di bawah mMutex sementara JNI nativeGetCurrentTrackIndex membaca dari
    // thread JNI/UI tanpa lock.
    std::lock_guard lock(mMutex);

    return mCurrentIndex;
}

// =====================================
// Internal
// =====================================

// B9-TOCTOU (2026-11-12): elemen aktif ke-i TANPA menyalin vektor.
// Pemanggil WAJIB pegang mMutex dan i < activeSizeLocked().
const TrackInfo&
TrackQueue::activeAt(
    size_t i
) const {

    if (
        mShuffleMode ==
        ShuffleMode::Off
    ) {
        return mTracks[i];
    }

    return mTracks[mShuffleOrder[i]];
}

// Padanan activeQueue().size() tanpa alokasi: hitung entri
// mShuffleOrder yang valid saja (filter yang sama dengan activeQueue()).
size_t
TrackQueue::activeSizeLocked() const {

    if (
        mShuffleMode ==
        ShuffleMode::Off
    ) {
        return mTracks.size();
    }

    size_t n = 0;

    for (
        size_t index :
        mShuffleOrder
    ) {
        if (
            index <
            mTracks.size()
        ) {
            ++n;
        }
    }

    return n;
}

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