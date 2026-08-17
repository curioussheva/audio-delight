#include "TransportControls.h"

namespace pristine::playback {

TransportControls::TransportControls(CommandHandler handler) : handler_(std::move(handler)) {
    // Default policies
    sourcePolicies_[CommandSource::AppUI] = {
        .allowBackground = false,
        .requiresAudioFocus = true,
        .canInterrupt = true,
        .dedupWindowMs = 0,
        .priority = 5
    };
    
    sourcePolicies_[CommandSource::Bluetooth] = {
        .allowBackground = true,
        .requiresAudioFocus = true,
        .canInterrupt = true,
        .dedupWindowMs = 300,      // ← debounce 300ms
        .priority = 4
    };
    
    sourcePolicies_[CommandSource::Headset] = {
        .allowBackground = true,
        .requiresAudioFocus = true,
        .canInterrupt = true,
        .dedupWindowMs = 500,      // ← headset button bounce
        .priority = 4
    };
    
    sourcePolicies_[CommandSource::AndroidAuto] = {
        .allowBackground = true,
        .requiresAudioFocus = false,  // ← AA manages focus
        .canInterrupt = true,
        .dedupWindowMs = 100,
        .priority = 6
    };
    
    sourcePolicies_[CommandSource::Notification] = {
        .allowBackground = true,
        .requiresAudioFocus = false,  // ← notification just reflects state
        .canInterrupt = false,
        .dedupWindowMs = 200,
        .priority = 3
    };
    
    sourcePolicies_[CommandSource::System] = {
        .allowBackground = true,
        .requiresAudioFocus = false,
        .canInterrupt = false,
        .dedupWindowMs = 0,
        .priority = 10  // ← highest, audio focus regain
    };
}

// ---- Convenience methods ----

std::future<TransportResult> TransportControls::bluetoothPlay() {
    return play(CommandSource::Bluetooth);
}

std::future<TransportResult> TransportControls::headsetPlay() {
    return play(CommandSource::Headset);
}

std::future<TransportResult> TransportControls::androidAutoPlay() {
    return play(CommandSource::AndroidAuto);
}

std::future<TransportResult> TransportControls::notificationPlay() {
    return play(CommandSource::Notification);
}

// ---- Deduplication ----

bool TransportControls::isDuplicate(const TransportRequest& request) const {
    std::lock_guard<std::mutex> lock(dedupMutex_);
    
    auto it = sourcePolicies_.find(request.source);
    if (it == sourcePolicies_.end()) return false;
    
    const auto& policy = it->second;
    if (policy.dedupWindowMs <= 0) return false;
    
    auto lastIt = lastCommandTime_.find(request.command);
    if (lastIt == lastCommandTime_.end()) return false;
    
    int64_t elapsed = request.timestampMs - lastIt->second;
    return elapsed < policy.dedupWindowMs;
}

bool TransportControls::shouldProcessCommand(const TransportRequest& request) const {
    // Check policy
    auto it = sourcePolicies_.find(request.source);
    if (it == sourcePolicies_.end()) return true;  // default allow
    
    const auto& policy = it->second;
    
    // Background check (simplified — actual check needs context)
    // if (!policy.allowBackground && appIsInBackground) return false;
    
    // Deduplication
    if (isDuplicate(request)) {
        return false;
    }
    
    return true;
}

// ---- Enqueue dengan timestamp & dedup ----

void TransportControls::enqueueCommand(TransportRequest&& request, std::promise<TransportResult>& promise) {
    request.timestampMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
    
    if (!shouldProcessCommand(request)) {
        promise.set_value(TransportResult::AlreadyInState);  // atau custom result
        return;
    }
    
    // Update dedup tracking
    {
        std::lock_guard<std::mutex> lock(dedupMutex_);
        lastCommandTime_[request.command] = request.timestampMs;
    }
    
    std::lock_guard<std::mutex> lock(queueMutex_);
    
    PendingCommand pending;
    pending.request = std::move(request);
    pending.promise = std::move(promise);
    pending.enqueueTime = std::chrono::steady_clock::now();
    
    commandQueue_.push(std::move(pending));
    commandAvailable_.notify_one();
}

void TransportControls::clearCommandsFromSource(CommandSource source) {
    std::lock_guard<std::mutex> lock(queueMutex_);
    
    std::queue<PendingCommand> filtered;
    while (!commandQueue_.empty()) {
        auto& cmd = commandQueue_.front();
        if (cmd.request.source != source) {
            filtered.push(std::move(cmd));
        } else {
            cmd.promise.set_value(TransportResult::Error);  // cancel
        }
        commandQueue_.pop();
    }
    
    commandQueue_ = std::move(filtered);
}

} // namespace pristine::playback
