import { useEffect } from 'react';
import TrackPlayer, { Capability, Event, RepeatMode, State, useTrackPlayerEvents } from 'react-native-track-player';
import { usePlayerStore } from '@/store/playerStore';

const events = [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackState,
  Event.PlaybackError,
];

export const useTrackPlayerHandler = () => {
  const { 
    setDuration, 
    setCurrentSong, 
    setIsPlaying, 
    queue 
  } = usePlayerStore();

  useTrackPlayerEvents(events, async (event: any) => { 
    // 1. Menangani Perubahan Lagu (Pindah Otomatis/Manual)
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (event.track) {
        // Cari data asli dari queue berdasarkan ID untuk mendapatkan metadata lengkap
        const activeSong = queue.find(s => s.id === event.track?.id);
        if (activeSong) {
          setCurrentSong(activeSong);
          setDuration(activeSong.duration);
        }
      }
    }

    // 2. Menangani Perubahan Status (Play/Pause/Buffering)
    if (event.type === Event.PlaybackState) {
      const playing = event.state === State.Playing;
      // Gunakan set state internal zustand tanpa memicu loop ke AudioEngine
      usePlayerStore.setState({ isPlaying: playing });
    }

    // 3. Menangani Error
    if (event.type === Event.PlaybackError) {
      console.error('[TrackPlayer] Playback error:', event.message);
    }
  });

  // Loop untuk mengupdate progress (position) setiap 500ms
  useEffect(() => {
    const interval = setInterval(async () => {
      const state = await TrackPlayer.getPlaybackState();
      if (state.state === State.Playing) {
        const pos = await TrackPlayer.getPosition();
        usePlayerStore.setState({ position: pos });
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);
};
