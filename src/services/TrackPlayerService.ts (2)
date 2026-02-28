/**
 * TrackPlayerService — Background audio & media session
 * Call setupTrackPlayer() once at app startup.
 */

import TrackPlayer, {
  Capability,
  AppKilledPlaybackBehavior,
  Event,
  RepeatMode,
  State,
} from 'react-native-track-player';

export async function setupTrackPlayer(): Promise<boolean> {
  let isSetup = false;

  try {
    await TrackPlayer.getActiveTrack();
    isSetup = true;
  } catch {
    // Not initialized yet
  }

  if (!isSetup) {
    await TrackPlayer.setupPlayer({
      minBuffer: 15,
      maxBuffer: 50,
      backBuffer: 30,
      waitForBuffer: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      progressUpdateEventInterval: 1,
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Queue);
  }

  return isSetup;
}

/**
 * Playback service — runs in background thread.
 * Register this with TrackPlayer.registerPlaybackService()
 */
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());

  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    TrackPlayer.seekTo(position);
  });

  // Duck volume 70% on audio interruption (call, notification)
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    if (permanent) {
      await TrackPlayer.stop();
    } else if (paused) {
      await TrackPlayer.setVolume(0.3);
    } else {
      await TrackPlayer.setVolume(1.0);
    }
  });
}
