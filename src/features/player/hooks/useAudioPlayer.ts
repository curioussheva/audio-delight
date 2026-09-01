import { useEffect, useCallback, useRef, useState } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { Song } from "@/shared/types/audio";
import NativePlaybackService from "@/specs/NativePlaybackService";

/**
 * Hook kustom untuk mengelola pemutaran audio dan sinkronisasi dengan Native DSP (Equalizer).
 */
export const useAudioPlayer = () => {
  const isReady = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Ambil actions dari Player Store
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);
  const setPositionStore = usePlayerStore((state) => state.setPosition);
  const setDurationStore = usePlayerStore((state) => state.setDuration);

  // Ambil action dari Equalizer Store untuk sinkronisasi Session ID
  const setAudioSessionId = useEqualizerStore(
    (state) => state.setAudioSessionId,
  );

  /**
   * Fungsi untuk mengambil Audio Session ID dari custom service
   * dan mengirimkannya ke store Equalizer agar efek DSP aktif.
   */
  const syncAudioSession = useCallback(async () => {
    try {
      // TODO: custom service belum punya getAudioSessionId
      // Kita bisa ambil dari NativeDSPModule.createAudioSession
      const id = await import("@/features/equalizer/api/nativeInterface")
        .then((m) => m.default.createAudioSession?.())
        .then((res) => res?.sessionId ?? null);
      if (id && id > 0) {
        console.log("🎵 [Player] Syncing Audio Session ID:", id);
        setAudioSessionId(id);
      }
    } catch (e) {
      console.warn("Gagal mendapatkan Audio Session ID:", e);
    }
  }, [setAudioSessionId]);

  // Setup awal custom service
  useEffect(() => {
    try {
      NativePlaybackService.startService();
      isReady.current = true;
      console.log("🎵 [Player] Custom playback service ready");
    } catch (error) {
      console.error("Gagal setup playback service:", error);
      isReady.current = false;
    }
  }, []);

  // Polling status & progress
  useEffect(() => {
    if (!isReady.current) return;

    const interval = setInterval(async () => {
      try {
        const status = NativePlaybackService.getStatus();
        setIsPlaying(status === 1); // asumsi 1 = playing
        const pos = NativePlaybackService.getPosition();
        setPosition(pos / 1000);
        setPositionStore(pos / 1000);
        setDurationStore(duration);
      } catch (error) {
        // silent
      }
    }, 500);

    return () => clearInterval(interval);
  }, [duration, setPositionStore, setDurationStore]);

  // 3. Fungsi Load & Play Lagu
  const loadSong = useCallback(
    async (song: Song) => {
      if (!isReady.current) return;

      try {
        NativePlaybackService.setQueue([song.uri]);
        NativePlaybackService.play();
        setCurrentSong(song);
        setIsPlaying(true);
        setDuration(song.duration || 0);
        setDurationStore(song.duration || 0);
        setTimeout(syncAudioSession, 800);
      } catch (error) {
        console.error("Error memuat lagu:", error);
      }
    },
    [setCurrentSong, syncAudioSession, setDurationStore],
  );

  // 4. Kontrol Transport
  const play = useCallback(() => {
    if (!isReady.current) return;
    NativePlaybackService.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    if (!isReady.current) return;
    NativePlaybackService.pause();
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // 5. Seek & Skip
  const seek = useCallback((position: number) => {
    if (!isReady.current) return;
    NativePlaybackService.seek(position * 1000); // posisi dalam ms
    setPosition(position);
    setPositionStore(position);
  }, [setPositionStore]);

  const skipToNext = useCallback(() => {
    if (!isReady.current) return;
    NativePlaybackService.next();
  }, []);

  const skipToPrevious = useCallback(() => {
    if (!isReady.current) return;
    NativePlaybackService.previous();
  }, []);

  return {
    loadSong,
    play,
    pause,
    togglePlayPause,
    seek,
    skipToNext,
    skipToPrevious,
    isPlaying,
    position,
    duration,
    isLoading: !isReady.current,
  };
};