import { useEffect, useCallback, useRef } from "react";
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  State,
  Capability,
  Event,
  useTrackPlayerEvents,
} from "react-native-track-player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { Song } from "@/shared/types/audio";

/**
 * Hook kustom untuk mengelola pemutaran audio dan sinkronisasi dengan Native DSP (Equalizer).
 */
export const useAudioPlayer = () => {
  const isReady = useRef(false);
  const playbackState = usePlaybackState();
  const progress = useProgress();

  // Ambil actions dari Player Store
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setPosition = usePlayerStore((state) => state.setPosition);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrevious = usePlayerStore((state) => state.playPrevious);

  // Ambil action dari Equalizer Store untuk sinkronisasi Session ID
  const setAudioSessionId = useEqualizerStore(
    (state) => state.setAudioSessionId,
  );

  /**
   * Fungsi untuk mengambil Audio Session ID dari Track Player
   * dan mengirimkannya ke store Equalizer agar efek DSP aktif.
   */
  const syncAudioSession = useCallback(async () => {
    try {
      // @ts-ignore - getAudioSessionId tersedia di Android untuk RNTP
      const sessionId = await TrackPlayer.getAudioSessionId();
      if (sessionId && sessionId !== -1) {
        console.log("🎵 [Player] Syncing Audio Session ID:", sessionId);
        setAudioSessionId(sessionId);
      }
    } catch (e) {
      console.warn("Gagal mendapatkan Audio Session ID:", e);
    }
  }, [setAudioSessionId]);

  // 1. Setup Awal Track Player
  useEffect(() => {
    const setupPlayer = async () => {
      if (isReady.current) return;

      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });

        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.Stop,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
        });

        isReady.current = true;
        // Coba sinkronisasi session ID pertama kali
        syncAudioSession();
      } catch (error) {
        console.error("Gagal setup TrackPlayer:", error);
      }
    };

    setupPlayer();

    return () => {
      // Cleanup jika diperlukan (biasanya di level App root)
    };
  }, [syncAudioSession]);

  // 2. Listener Event: Sinkronisasi ulang saat lagu berganti
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged && event.track) {
      // Beri sedikit delay agar engine audio Android siap memberikan Session ID baru
      setTimeout(syncAudioSession, 500);
    }
  });

  // 3. Fungsi Load & Play Lagu
  const loadSong = useCallback(
    async (song: Song) => {
      try {
        if (!isReady.current) return;

        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: song.id,
          url: song.uri,
          title: song.title,
          artist: song.artist,
          artwork: song.artwork,
          duration: song.duration,
        });

        await TrackPlayer.play();
        setCurrentSong(song);
        setIsPlaying(true);

        // Sinkronisasi DSP untuk lagu yang baru dimuat
        setTimeout(syncAudioSession, 800);
      } catch (error) {
        console.error("Error memuat lagu:", error);
      }
    },
    [setCurrentSong, setIsPlaying, syncAudioSession],
  );

  // 4. Kontrol Transport (Play, Pause, Toggle)
  const play = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.play();
    setIsPlaying(true);
  }, [setIsPlaying]);

  const pause = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const togglePlayPause = useCallback(async () => {
    if (!isReady.current) return;
    if (playbackState.state === State.Playing) {
      await pause();
    } else {
      await play();
    }
  }, [playbackState.state, play, pause]);

  // 5. Seek & Skip
  const seek = useCallback(async (position: number) => {
    if (!isReady.current) return;
    await TrackPlayer.seekTo(position); // posisi dalam detik
  }, []);

  const skipToNext = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToNext();
    playNext();
  }, [playNext]);

  const skipToPrevious = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToPrevious();
    playPrevious();
  }, [playPrevious]);

  // 6. Sinkronisasi Progress ke Player Store secara real-time
  useEffect(() => {
    setPosition(progress.position);
    setDuration(progress.duration);
    setIsPlaying(playbackState.state === State.Playing);
  }, [
    playbackState.state,
    progress.position,
    progress.duration,
    setPosition,
    setDuration,
    setIsPlaying,
  ]);

  return {
    loadSong,
    play,
    pause,
    togglePlayPause,
    seek,
    skipToNext,
    skipToPrevious,
    isPlaying: playbackState.state === State.Playing,
    position: progress.position,
    duration: progress.duration,
    isLoading: !isReady.current,
  };
};
