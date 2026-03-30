import { useEffect } from "react";
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
} from "react-native-track-player";
import { usePlayerStore } from "@/features/player/store/playerStore";

const events = [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackState,
  Event.PlaybackError,
];

export const useTrackPlayerHandler = () => {
  const { setDuration, setCurrentSong, queue } = usePlayerStore();

  useTrackPlayerEvents(events, async (event: any) => {

    // 1. Perubahan Lagu
    if (event.type === Event.PlaybackActiveTrackChanged) {
      usePlayerStore.setState({ position: 0 });
      if (event.track) {
        const activeSong = queue.find((s) => s.id === event.track?.id);
        if (activeSong) {
          setCurrentSong(activeSong);
          setDuration(activeSong.duration);
        }
      }
    }

    // 2. Perubahan Status
    if (event.type === Event.PlaybackState) {
      const playing = event.state === State.Playing;
      usePlayerStore.setState({ isPlaying: playing });
    }

    // 3. Error — dengan detail URI untuk debug
    if (event.type === Event.PlaybackError) {
      console.error("[TrackPlayer] Playback error:", event.message);
      console.error("[TrackPlayer] Error code:", event.code);

      try {
        const track = await TrackPlayer.getActiveTrack();
        console.error("[TrackPlayer] Failed URI:", track?.url);
        console.error("[TrackPlayer] URI type:",
          track?.url?.startsWith('content://media') ? 'MediaStore' :
          track?.url?.startsWith('content://com.android') ? 'SAF' :
          track?.url?.startsWith('file://') ? 'file' : 'unknown'
        );
      } catch (e) {
        console.error("[TrackPlayer] Could not get active track:", e);
      }

      // Auto-skip ke lagu berikutnya jika source error
      // agar tidak stuck di lagu yang gagal
      try {
        const state = await TrackPlayer.getPlaybackState();
        if (state.state !== State.Playing) {
          console.warn("[TrackPlayer] Attempting skip to next after error...");
          await TrackPlayer.skipToNext();
        }
      } catch {
        // Tidak ada lagu berikutnya atau queue kosong
      }
    }

  });

  // Update progress setiap 500ms
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const state = await TrackPlayer.getPlaybackState();
        if (state.state === State.Playing) {
          const pos = await TrackPlayer.getPosition(); // sudah detik
        usePlayerStore.setState({ position: pos });
        }
      } catch {
        // Player belum siap, skip
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);
}; 