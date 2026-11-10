#pragma once

#include <cstdint>
#include <string>

namespace pristine::playback {

enum class PlaybackStatus {
    Stopped,
    Playing,
    Paused,
    Buffering,
    Seeking,
    Completed,
    Error
};

enum class RepeatMode {
    Off,
    One,
    All
};

enum class ShuffleMode {
    Off,
    On
};

struct PlaybackPosition {

    uint64_t positionMs = 0;

    uint64_t durationMs = 0;
};

struct TrackInfo {

    std::string id;

    std::string uri;

    std::string path;

    std::string title;

    std::string artist;

    std::string album;

    std::string artworkUri;

    uint64_t durationMs = 0;

    uint32_t sampleRate = 0;

    uint16_t channels = 0;

    uint16_t bitDepth = 0;

    // 🔥 FIX (2026-10-06): identitas trek. Dipakai std::find di
    // setShuffleMode/setTracks untuk menjaga trek yang sedang diputar
    // tetap di posisi yang benar saat mode shuffle berubah.
    // URI unik per trek (content:// media id), jadi itu identitasnya.
    //
    // 🔥 FIX (2026-11-10, p-m6): bandingkan juga durationMs + sampleRate.
    // URI yang sama bisa muncul dua kali (lagu yang sama ditambahkan 2x);
    // find() mengembalikan kecocokan PERTAMA, dan dua entri dengan URI sama
    // tapi metadata berbeda (mis. jalur resolve berbeda) bisa tertukar saat
    // toggle shuffle. Dua entri yang byte-identical tetap dianggap trek yang
    // sama — tidak ada beda yang teramati (audio dan metadata identik).
    bool operator==(
        const TrackInfo& other
    ) const {
        return uri == other.uri &&
               durationMs == other.durationMs &&
               sampleRate == other.sampleRate;
    }

    bool operator!=(
        const TrackInfo& other
    ) const {
        return !(*this == other);
    }
};

} // namespace pristine::playback 