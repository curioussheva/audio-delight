#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <utility>

namespace pristine::playback {

class PlaybackClock {
public:
    PlaybackClock() = default;

    // Audio thread
    void advanceFrames(uint32_t frames) noexcept;

    // Seek
    void seekToFrame(uint64_t frame) noexcept;
    void seekToSeconds(double seconds, uint32_t sampleRate) noexcept;

    // Duration (atomic, satu field). Di-set loadTrack() dari durasi decoder
    // / metadata (P-M8, 2026-11-10) — sebelumnya tidak pernah di-set siapa
    // pun sehingga selalu 0.
    void setDurationFrames(uint64_t frames) noexcept;

    // Pasangan posisi+durasi yang KONSISTEN (satu generasi).
    //
    // 🔥 FIX (2026-11-10, p-m17): dulu reset() melakukan tiga store terpisah
    // dan progress() dua load terpisah — pembaca bisa melihat posisi track
    // baru + durasi track lama. Komentar "snapshot consistent" tidak dijamin
    // implementasi. Sekarang pasangan ini dibaca/ditulis di bawah satu mutex
    // (hanya reset() dan method ini yang menguncinya; advanceFrames tetap
    // lock-free karena satu atomic op sudah konsisten sendiri).
    [[nodiscard]] std::pair<uint64_t, uint64_t> snapshotPositionAndDuration() const noexcept;

    void reset() noexcept;

private:
    alignas(64) std::atomic<uint64_t> positionFrames_{0};
    alignas(64) std::atomic<uint64_t> durationFrames_{0};

    // Hanya melindungi pasangan (position, duration) di reset() +
    // snapshotPositionAndDuration(). Tidak pernah dipegang bersama lock lain.
    mutable std::mutex snapshotMutex_;
};

} // namespace pristine::playback
