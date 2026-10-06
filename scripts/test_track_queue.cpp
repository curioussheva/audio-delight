// Test standalone untuk logika shuffle TrackQueue.
// Compile di Termux (tidak butuh Android SDK/NDK):
//   clang++ -std=c++17 -I android/app/src/main/cpp \
//     scripts/test_track_queue.cpp android/app/src/main/cpp/playback/TrackQueue.cpp \
//     -o "$TMPDIR/test_track_queue" && "$TMPDIR/test_track_queue"
//
// Ini test logika murni. Build native Android sebenarnya tetap lewat CI,
// tapi test ini menjaga regresi shuffle tanpa perlu device.

#include "playback/TrackQueue.h"

#include <cstdio>
#include <string>
#include <vector>

#define ASSERT_TRUE(cond, msg)                                                 \
    do {                                                                       \
        if (!(cond)) {                                                         \
            std::fprintf(stderr, "FAIL: %s (line %d)\n", (msg), __LINE__);     \
            ++gFailures;                                                       \
        } else {                                                               \
            std::fprintf(stdout, "ok:   %s\n", (msg));                         \
        }                                                                      \
    } while (0)

static int gFailures = 0;

using pristine::playback::TrackInfo;
using pristine::playback::TrackQueue;
using pristine::playback::ShuffleMode;
using pristine::playback::RepeatMode;

static TrackInfo makeTrack(const std::string& uri) {
    TrackInfo t;
    t.uri = uri;
    return t;
}

static std::vector<TrackInfo> makeQueue(size_t n) {
    std::vector<TrackInfo> out;
    out.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        out.push_back(makeTrack("track-" + std::to_string(i)));
    }
    return out;
}

// 🔥 BUG ASLI (2026-10-06): user tap trek index 0 (Dark Sky Island), tapi
// native main trek acak karena shuffle on dan setTracks tidak menjaga
// posisi 0. Reproduksi persis kondisi di log device.
static void test_setTracksShuffleOnKeepsTrackZeroFirst() {
    TrackQueue q;
    q.setTracks(makeQueue(50));

    // Simulasikan: shuffle dinyalakan dulu, lalu user tap lagu baru.
    q.setShuffleMode(ShuffleMode::On);

    // Queue baru: trek target ada di index 0 (playSong reorder selalu
    // naruh trek yang di-tap di index 0).
    auto tracks = makeQueue(50);
    tracks[0] = makeTrack("DARK-SKY-ISLAND");
    q.setTracks(tracks);

    const auto cur = q.current();
    ASSERT_TRUE(cur.has_value(), "setTracks+shuffleOn: current() tidak null");
    ASSERT_TRUE(
        cur->uri == "DARK-SKY-ISLAND",
        "setTracks+shuffleOn: trek index 0 (yang user tap) tetap di posisi 0"
    );
    ASSERT_TRUE(
        q.current() == q.activeTracks()[0],
        "setTracks+shuffleOn: current() == activeTracks()[0]"
    );
}

// Trek selain 0 juga harus diputar saat di-reorder ke index 0.
static void test_setTracksShuffleOnArbitraryTapIndex() {
    TrackQueue q;
    q.setTracks(makeQueue(20));
    q.setShuffleMode(ShuffleMode::On);

    // User tap trek index 13 → playSong reorder jadi [13, 14, ...]
    auto tracks = makeQueue(20);
    std::rotate(tracks.begin(), tracks.begin() + 13, tracks.end());
    q.setTracks(tracks);

    const auto cur = q.current();
    ASSERT_TRUE(cur.has_value(), "setArb+shuffleOn: current() tidak null");
    ASSERT_TRUE(
        cur->uri == "track-13",
        "setArb+shuffleOn: trek di-tap (index 13) tetap diputar"
    );
}

// Toggle shuffle ON→OFF tidak boleh mengganti trek yang sedang diputar.
static void test_shuffleOffKeepsPlayingTrack() {
    TrackQueue q;
    q.setTracks(makeQueue(10));

    // Main trek index 7.
    q.jumpTo(7);
    const std::string before = q.current()->uri;

    q.setShuffleMode(ShuffleMode::On);
    q.setShuffleMode(ShuffleMode::Off);

    const std::string after = q.current()->uri;
    ASSERT_TRUE(
        before == after,
        "toggle ON->OFF: trek yang diputar tidak berubah"
    );
}

// Toggle OFF→ON tidak boleh mengganti trek yang sedang diputar.
static void test_shuffleOnKeepsPlayingTrack() {
    TrackQueue q;
    q.setTracks(makeQueue(10));

    q.jumpTo(4);
    const std::string before = q.current()->uri;

    q.setShuffleMode(ShuffleMode::On);

    const std::string after = q.current()->uri;
    ASSERT_TRUE(
        before == after,
        "toggle OFF->ON: trek yang diputar tidak berubah"
    );
}

// advance() dengan repeat=all harus loop dan tidak crash saat shuffle on.
static void test_advanceWithShuffleAndRepeatAll() {
    TrackQueue q;
    q.setTracks(makeQueue(10));
    q.setShuffleMode(ShuffleMode::On);
    q.setRepeatMode(RepeatMode::All);

    const auto first = q.current()->uri;

    std::vector<std::string> visited;
    for (int i = 0; i < 30; ++i) {
        visited.push_back(q.current()->uri);
        q.advance();
    }

    // Semua trek harus ter-cover dalam satu loop penuh (10 advance pertama).
    std::vector<bool> seen(10, false);
    for (const auto& uri : visited) {
        // uri format "track-N"
        const size_t n = static_cast<size_t>(
            std::stoul(uri.substr(6))
        );
        if (n < seen.size()) seen[n] = true;
    }
    bool allSeen = true;
    for (bool s : seen) {
        if (!s) allSeen = false;
    }
    ASSERT_TRUE(allSeen, "repeat=all+shuffle: 10 trek semua terkunjungi");

    // Setelah 10 advance (satu loop), balik ke trek pertama.
    q.jumpTo(0);
    ASSERT_TRUE(
        q.current()->uri == first,
        "repeat=all+shuffle: jumpTo(0) balik ke trek pertama queue aktif"
    );
}

// activeQueue() tidak boleh crash atau return trek invalid saat queue
// menyusut setelah rebuildShuffle.
static void test_activeQueueShrunkQueue() {
    TrackQueue q;
    q.setTracks(makeQueue(20));
    q.setShuffleMode(ShuffleMode::On);

    // Ganti queue yang lebih kecil — mShuffleOrder masih size 20.
    q.setTracks(makeQueue(5));

    const auto active = q.activeTracks();
    ASSERT_TRUE(
        active.size() <= 5,
        "queue menyusut: activeTracks() tidak melebihi ukuran baru"
    );
    for (const auto& t : active) {
        ASSERT_TRUE(
            !t.uri.empty(),
            "queue menyusut: tidak ada trek invalid/empty di activeTracks()"
        );
    }
}

// mCurrentIndex valid setelah setTracks (tidak out-of-bounds).
static void test_currentIndexAfterSetTracks() {
    TrackQueue q;
    q.setTracks(makeQueue(50));
    q.setShuffleMode(ShuffleMode::On);
    q.setTracks(makeQueue(10));

    const auto idx = q.currentIndex();
    ASSERT_TRUE(
        idx < q.activeTracks().size(),
        "setTracks ukuran berubah: currentIndex() dalam batas"
    );
    ASSERT_TRUE(
        q.current().has_value(),
        "setTracks ukuran berubah: current() valid"
    );
}

// repeat=one: advance() tetap di trek yang sama (music player standar).
static void test_repeatOneStays() {
    TrackQueue q;
    q.setTracks(makeQueue(10));
    q.setRepeatMode(RepeatMode::One);

    const std::string before = q.current()->uri;
    q.advance();
    ASSERT_TRUE(
        q.current()->uri == before,
        "repeat=one: advance() tetap di trek yang sama"
    );
}

int main() {
    std::fprintf(stdout, "=== TrackQueue shuffle regression tests ===\n\n");

    test_setTracksShuffleOnKeepsTrackZeroFirst();
    test_setTracksShuffleOnArbitraryTapIndex();
    test_shuffleOffKeepsPlayingTrack();
    test_shuffleOnKeepsPlayingTrack();
    test_advanceWithShuffleAndRepeatAll();
    test_activeQueueShrunkQueue();
    test_currentIndexAfterSetTracks();
    test_repeatOneStays();

    std::fprintf(
        stdout,
        "\n=== %s (%d failure) ===\n",
        gFailures == 0 ? "ALL PASSED" : "HAS FAILURES",
        gFailures
    );
    return gFailures == 0 ? 0 : 1;
}
