// Test standalone untuk logika shuffle TrackQueue.
// Compile di Termux (tidak butuh Android SDK/NDK):
//   clang++ -std=c++17 -I android/app/src/main/cpp \
//     scripts/test_track_queue.cpp android/app/src/main/cpp/playback/TrackQueue.cpp \
//     -o "$TMPDIR/test_track_queue" && "$TMPDIR/test_track_queue"
//
// Ini test logika murni. Build native Android sebenarnya tetap lewat CI,
// tapi test ini menjaga regresi shuffle tanpa perlu device.

#include "playback/TrackQueue.h"

#include <algorithm>
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

// B17-P-b (2026-11-15): setTracks(startIndex) — JS mengirim antrean
// ASLI + indeks lagu yang di-tap, tanpa rotasi. Shuffle OFF: current
// langsung = startIndex; advance/retreat jalan dari sana.
static void test_setTracksStartIndexShuffleOff() {
    TrackQueue q;
    q.setTracks(makeQueue(10), false, 4);

    ASSERT_TRUE(
        q.current()->uri == "track-4",
        "startIndex OFF: current() == trek yang di-tap (index 4)"
    );
    ASSERT_TRUE(
        q.currentIndex() == 4,
        "startIndex OFF: currentIndex() == 4"
    );
    ASSERT_TRUE(q.advance(), "startIndex OFF: advance() dari 4 berhasil");
    ASSERT_TRUE(
        q.current()->uri == "track-5",
        "startIndex OFF: advance() -> track-5"
    );
    ASSERT_TRUE(q.retreat(), "startIndex OFF: retreat() berhasil");
    ASSERT_TRUE(
        q.current()->uri == "track-4",
        "startIndex OFF: retreat() balik ke track-4"
    );
}

// B17-P-b: shuffle ON — trek yang di-tap ditukar ke posisi aktif 0,
// sisa urutan shuffle tetap permutasi lengkap (advance menjangkau
// semua trek, retreat dari 0 kembali ke trek yang di-tap).
static void test_setTracksStartIndexShuffleOn() {
    TrackQueue q;
    q.setTracks(makeQueue(10));
    q.setShuffleMode(ShuffleMode::On);

    q.setTracks(makeQueue(10), false, 7);

    ASSERT_TRUE(
        q.current()->uri == "track-7",
        "startIndex ON: current() == trek yang di-tap (index 7)"
    );
    ASSERT_TRUE(
        q.currentIndex() == 0,
        "startIndex ON: currentIndex() == 0 (posisi aktif)"
    );
    ASSERT_TRUE(
        q.activeTracks()[0].uri == "track-7",
        "startIndex ON: activeTracks()[0] == trek yang di-tap"
    );

    // Permutasi tetap lengkap: 10 advance (repeat=all) menjangkau semua.
    q.setRepeatMode(RepeatMode::All);
    std::vector<bool> seen(10, false);
    for (int i = 0; i < 10; ++i) {
        const size_t n = static_cast<size_t>(
            std::stoul(q.current()->uri.substr(6))
        );
        seen[n] = true;
        q.advance();
    }
    bool allSeen = true;
    for (bool s : seen) {
        if (!s) allSeen = false;
    }
    ASSERT_TRUE(allSeen, "startIndex ON: permutasi lengkap, 10 trek terkunjungi");

    // Retreat dari posisi aktif 0 (repeat=all) kembali ke trek yang di-tap.
    q.setTracks(makeQueue(10), false, 7);
    q.setRepeatMode(RepeatMode::All);
    q.retreat(); // 0 -> ujung (wrap)
    q.advance(); // ujung -> 0
    ASSERT_TRUE(
        q.current()->uri == "track-7",
        "startIndex ON: wrap retreat+advance balik ke trek yang di-tap"
    );
}

// B17-P-b: startIndex di luar batas jatuh ke 0 (perilaku lama), baik
// shuffle OFF maupun ON — tidak pernah UB / indeks liar.
static void test_setTracksStartIndexOutOfRange() {
    TrackQueue q;
    q.setTracks(makeQueue(10), false, 99);
    ASSERT_TRUE(
        q.current()->uri == "track-0",
        "startIndex OOR OFF: fallback ke track-0"
    );
    ASSERT_TRUE(
        q.currentIndex() == 0,
        "startIndex OOR OFF: currentIndex() == 0"
    );

    q.setShuffleMode(ShuffleMode::On);
    q.setTracks(makeQueue(10), false, 99);
    ASSERT_TRUE(
        q.current()->uri == "track-0",
        "startIndex OOR ON: fallback ke track-0 di posisi aktif 0"
    );
    ASSERT_TRUE(
        q.currentIndex() == 0,
        "startIndex OOR ON: currentIndex() == 0"
    );
    ASSERT_TRUE(
        q.activeTracks()[0].uri == "track-0",
        "startIndex OOR ON: activeTracks()[0] == track-0"
    );
}

// B17-P-b: keepCurrentUri=true yang BERHASIL mengabaikan startIndex —
// trek yang sedang main yang menang, bukan indeks yang diminta.
static void test_setTracksKeepIgnoresStartIndex() {
    TrackQueue q;
    q.setTracks(makeQueue(10));
    q.jumpTo(3); // sedang main track-3
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "keep+startIndex: setup current() == track-3"
    );

    q.setTracks(makeQueue(8), true, 6);
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "keep+startIndex: keep=true menang, current() tetap track-3"
    );

    // Varian shuffle ON: sama — trek yang main dipertahankan.
    q.setShuffleMode(ShuffleMode::On);
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "keep+startIndex: setup shuffle ON current() == track-3"
    );
    q.setTracks(makeQueue(8), true, 6);
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "keep+startIndex: shuffle ON keep=true tetap pertahankan track-3"
    );
}

// Trek selain 0 juga harus diputar saat di-reorder ke index 0.
static void test_setTracksShuffleOnArbitraryTapIndex() {
    TrackQueue q;
    q.setTracks(makeQueue(20));
    q.setShuffleMode(ShuffleMode::On);

    // Queue sudah tersusun supaya trek yang di-tap ada di index 0
    // (dulu playSong me-rotate seperti ini; sejak B17-P-b rotasi dihapus
    // dan startIndex yang dipakai — kasus ini kini memvalidasi default
    // startIndex=0 dengan antrean yang memang diawali trek target).
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

// B16-T3 (2026-11-15): activeSizeLocked() O(1) — ukuran queue aktif
// harus selalu == size(), shuffle ON maupun OFF, termasuk sesudah
// setTracks dengan keepCurrentUri true/false. activeSizeLocked() sendiri
// private, jadi yang diuji adalah perilaku publik yang memakainya:
// activeTracks().size() + batas jumpTo().
static void test_activeSizeEqualsTrackCount() {
    TrackQueue q;

    // Queue kosong.
    ASSERT_TRUE(q.activeTracks().empty(), "activeSize: queue kosong -> 0");
    ASSERT_TRUE(!q.jumpTo(0), "activeSize: jumpTo(0) gagal di queue kosong");

    q.setTracks(makeQueue(10));
    ASSERT_TRUE(
        q.activeTracks().size() == q.size(),
        "activeSize: shuffle OFF == size()"
    );
    ASSERT_TRUE(q.jumpTo(9), "activeSize: jumpTo(size-1) OK shuffle OFF");
    ASSERT_TRUE(!q.jumpTo(10), "activeSize: jumpTo(size) ditolak shuffle OFF");

    q.setShuffleMode(ShuffleMode::On);
    ASSERT_TRUE(
        q.activeTracks().size() == q.size(),
        "activeSize: shuffle ON == size()"
    );
    ASSERT_TRUE(q.jumpTo(9), "activeSize: jumpTo(size-1) OK shuffle ON");
    ASSERT_TRUE(!q.jumpTo(10), "activeSize: jumpTo(size) ditolak shuffle ON");

    // setTracks keepCurrentUri=true: trek yang sedang main (track-3)
    // masih ada di queue baru yang lebih kecil.
    q.setShuffleMode(ShuffleMode::Off);
    q.jumpTo(3); // shuffle OFF: urutan asli, current() == track-3
    q.setShuffleMode(ShuffleMode::On); // toggle pertahankan trek yang main
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "activeSize: setup keep=true, current() == track-3"
    );
    q.setTracks(makeQueue(8), true); // track-0..track-7, berisi track-3
    ASSERT_TRUE(
        q.activeTracks().size() == 8,
        "activeSize: setTracks keep=true, shuffle ON == size()"
    );
    ASSERT_TRUE(
        q.current()->uri == "track-3",
        "activeSize: keep=true pertahankan trek yang sedang main"
    );
    ASSERT_TRUE(q.jumpTo(7), "activeSize: jumpTo(size-1) OK sesudah keep=true");
    ASSERT_TRUE(!q.jumpTo(8), "activeSize: jumpTo(size) ditolak sesudah keep=true");

    // setTracks keepCurrentUri=false: reset ke posisi 0.
    q.setTracks(makeQueue(6), false);
    ASSERT_TRUE(
        q.activeTracks().size() == 6,
        "activeSize: setTracks keep=false, shuffle ON == size()"
    );
    ASSERT_TRUE(
        q.currentIndex() == 0,
        "activeSize: keep=false reset ke posisi 0"
    );

    // Matikan shuffle: ukuran tetap == size().
    q.setShuffleMode(ShuffleMode::Off);
    ASSERT_TRUE(
        q.activeTracks().size() == 6,
        "activeSize: shuffle OFF sesudah setTracks == size()"
    );
}

// B17-headless (2026-11-15): setTracks harus menyimpan metadata
// TrackInfo (title/artist/album/artworkUri/durationMs) apa adanya, dan
// current() mengembalikannya — metadata inilah yang dibaca
// nativeGetCurrentTrackInfo untuk notifikasi / lock screen saat Next
// headless. Tanpa ini, TrackInfo hanya membawa uri + sampleRate.
static void test_setTracksKeepsMetadata() {
    TrackQueue q;
    std::vector<TrackInfo> tracks;
    for (int i = 0; i < 3; ++i) {
        TrackInfo t;
        t.uri = "track-" + std::to_string(i);
        t.title = "Judul " + std::to_string(i);
        t.artist = "Artis " + std::to_string(i);
        t.album = "Album " + std::to_string(i);
        t.artworkUri = "content://art/" + std::to_string(i);
        t.durationMs = static_cast<uint64_t>(180000 + i * 1000);
        t.sampleRate = 44100;
        tracks.push_back(t);
    }
    q.setTracks(tracks);

    const auto cur0 = q.current();
    ASSERT_TRUE(cur0.has_value(), "meta: current() tidak null");
    ASSERT_TRUE(cur0->title == "Judul 0", "meta: current() title == Judul 0");
    ASSERT_TRUE(cur0->artist == "Artis 0", "meta: current() artist == Artis 0");
    ASSERT_TRUE(cur0->album == "Album 0", "meta: current() album == Album 0");
    ASSERT_TRUE(
        cur0->artworkUri == "content://art/0",
        "meta: current() artworkUri == content://art/0"
    );
    ASSERT_TRUE(cur0->durationMs == 180000, "meta: current() durationMs == 180000");
    ASSERT_TRUE(cur0->sampleRate == 44100, "meta: current() sampleRate tetap 44100");

    // advance() ke track-1: metadata ikut berganti, bukan tertinggal.
    q.advance();
    const auto cur1 = q.current();
    ASSERT_TRUE(cur1.has_value(), "meta: current() sesudah advance tidak null");
    ASSERT_TRUE(cur1->uri == "track-1", "meta: advance() ke track-1");
    ASSERT_TRUE(cur1->title == "Judul 1", "meta: advance() title == Judul 1");
    ASSERT_TRUE(cur1->artist == "Artis 1", "meta: advance() artist == Artis 1");
    ASSERT_TRUE(cur1->durationMs == 181000, "meta: advance() durationMs == 181000");

    // jumpTo(2): metadata track-2.
    ASSERT_TRUE(q.jumpTo(2), "meta: jumpTo(2) OK");
    const auto cur2 = q.current();
    ASSERT_TRUE(cur2.has_value(), "meta: current() sesudah jumpTo tidak null");
    ASSERT_TRUE(cur2->title == "Judul 2", "meta: jumpTo title == Judul 2");
    ASSERT_TRUE(
        cur2->artworkUri == "content://art/2",
        "meta: jumpTo artworkUri == content://art/2"
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
    test_setTracksStartIndexShuffleOff();
    test_setTracksStartIndexShuffleOn();
    test_setTracksStartIndexOutOfRange();
    test_setTracksKeepIgnoresStartIndex();
    test_shuffleOffKeepsPlayingTrack();
    test_shuffleOnKeepsPlayingTrack();
    test_advanceWithShuffleAndRepeatAll();
    test_activeQueueShrunkQueue();
    test_currentIndexAfterSetTracks();
    test_activeSizeEqualsTrackCount();
    test_repeatOneStays();
    test_setTracksKeepsMetadata();

    std::fprintf(
        stdout,
        "\n=== %s (%d failure) ===\n",
        gFailures == 0 ? "ALL PASSED" : "HAS FAILURES",
        gFailures
    );
    return gFailures == 0 ? 0 : 1;
}
