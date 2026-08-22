#pragma once

#include "PlaybackTypes.h"
#include <functional>
#include <future>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <string>

namespace pristine::playback {

// =====================================================
// COMMAND SOURCE (siapa yang trigger)
// =====================================================

enum class CommandSource {
    AppUI,           // User tap di app
    Bluetooth,       // AVRCP / A2DP media button
    Headset,         // Wired headset button
    AndroidAuto,     // Android Auto / Automotive OS
    Notification,    // Media notification
    Voice,           // Voice command (Assistant)
    System,          // Audio focus regain
    Remote,          // Cast / remote control
    Unknown
};

// =====================================================
// COMMAND RESULT & COMMAND TYPE
// =====================================================

enum class TransportCommand {
    Play,
    Pause,
    Stop,
    Seek,
    Next,
    Previous,
    BluetoothPlay,
    HeadsetPlay,
    AndroidAutoPlay,
    NotificationPlay
};

enum class TransportResult {
    OK,
    AlreadyInState,
    Error
};

struct TransportRequest {
    TransportCommand command;
    double seekPosition = 0.0;
    size_t targetIndex = 0;
    RepeatMode repeatMode = RepeatMode::Off;
    ShuffleMode shuffleMode = ShuffleMode::Off;
    float playbackRate = 1.0f;
    
    CommandSource source = CommandSource::Unknown;  // ← NEW
    std::string sourceId;                          // ← device ID, session ID, dll
    int64_t timestampMs = 0;                       // ← untuk deduplication
};

// =====================================================
// SOURCE-SPECIFIC BEHAVIOR
// =====================================================

struct SourcePolicy {
    bool allowBackground = false;
    bool requiresAudioFocus = true;
    bool canInterrupt = false;
    int dedupWindowMs = 0;        // 0 = no dedup
    int priority = 0;             // higher = more important
};

// =====================================================
// TRANSPORT CONTROLS (with source awareness)
// =====================================================

class TransportControls {
public:
    using CommandHandler = std::function<TransportResult(const TransportRequest&)>;

    explicit TransportControls(CommandHandler handler);
    ~TransportControls();

    // ---- Source-aware async commands ----
    
    [[nodiscard]] std::future<TransportResult> play(CommandSource source = CommandSource::AppUI);
    [[nodiscard]] std::future<TransportResult> pause(CommandSource source = CommandSource::AppUI);
    [[nodiscard]] std::future<TransportResult> stop(CommandSource source = CommandSource::AppUI);
    [[nodiscard]] std::future<TransportResult> seek(double positionSeconds, CommandSource source = CommandSource::AppUI);
    [[nodiscard]] std::future<TransportResult> next(CommandSource source = CommandSource::AppUI);
    [[nodiscard]] std::future<TransportResult> previous(CommandSource source = CommandSource::AppUI);
    
    // ---- Convenience untuk external sources ----
    
    [[nodiscard]] std::future<TransportResult> bluetoothPlay();
    [[nodiscard]] std::future<TransportResult> headsetPlay();
    [[nodiscard]] std::future<TransportResult> androidAutoPlay();
    [[nodiscard]] std::future<TransportResult> notificationPlay();
    
    // ---- Deduplication & filtering ----
    
    void setSourcePolicy(CommandSource source, const SourcePolicy& policy);
    [[nodiscard]] bool shouldProcessCommand(const TransportRequest& request) const;
    
    // ---- Process & clear ----
    
    void processPendingCommands();
    void clearPendingCommands();
    void clearCommandsFromSource(CommandSource source);  // ← useful saat disconnect
    
    [[nodiscard]] size_t pendingCommandCount() const;
    [[nodiscard]] bool hasPendingCommands() const;

private:
    struct PendingCommand {
        TransportRequest request;
        std::promise<TransportResult> promise;
        std::chrono::steady_clock::time_point enqueueTime;
    };

    CommandHandler handler_;
    mutable std::mutex queueMutex_;
    std::queue<PendingCommand> commandQueue_;
    std::condition_variable commandAvailable_;
    
    // Source policies
    std::unordered_map<CommandSource, SourcePolicy> sourcePolicies_;
    mutable std::mutex policyMutex_;
    
    // Deduplication tracking
    mutable std::mutex dedupMutex_;
    std::unordered_map<TransportCommand, int64_t> lastCommandTime_;
    
    void enqueueCommand(TransportRequest&& request, std::promise<TransportResult>& promise);
    [[nodiscard]] TransportResult executeCommandSync(const TransportRequest& request, std::chrono::milliseconds timeout);
    [[nodiscard]] bool isDuplicate(const TransportRequest& request) const;
};

} // namespace pristine::playback
 