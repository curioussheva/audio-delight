import { useEffect } from "react";
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
} from "react-native-track-player";
import { usePlayerStore } from "@/store/playerStore";

const events = [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackState,
  Event.PlaybackError,
];

export const useTrackPlayerHandler = () => {
  const { setDuration, setCurrentSong, queue } = usePlayerStore();

  useTrackPlayerEvents(events, async (event: any) => {
    // 1. Menangani Perubahan Lagu
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (event.track) {
        const activeSong = queue.find((s) => s.id === event.track?.id);
        if (activeSong) {
          setCurrentSong(activeSong);
          setDuration(activeSong.duration);
        }
      }
    }

    // 2. Menangani Perubahan Status
    if (event.type === Event.PlaybackState) {
      const playing = event.state === State.Playing;
      usePlayerStore.setState({ isPlaying: playing });
    }

    // 3. Menangani Error
    if (event.type === Event.PlaybackError) {
      console.error("[TrackPlayer] Playback error:", event.message);
    }
  });

  // Loop untuk mengupdate progress setiap 500ms
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const state = await TrackPlayer.getPlaybackState();
        if (state.state === State.Playing) {
          const pos = await TrackPlayer.getPosition();
          usePlayerStore.setState({ position: pos });
        }
      } catch {
        // Player belum siap, skip iteration ini
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);
};
 