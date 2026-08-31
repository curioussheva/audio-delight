// src/features/player/hooks/useTrackPlayerHandler.ts

import { useEffect, useRef } from "react";
import TrackPlayer, {
  Event,
  useTrackPlayerEvents,
  Capability,
  State,
} from "react-native-track-player";
import { usePlayerStore } from "../store/playerStore";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import { RNTP_ENABLED } from "../api/rntpEnabled";

// Helper untuk konversi URI
const normalizeUri = (uri: string): string => {
  if (!uri) return "";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  if (uri.startsWith("content://")) return uri;
  if (uri.startsWith("file://")) return uri;
  return `file://${uri}`;
};

// Helper untuk validasi URI
const isValidUri = (uri: string): boolean => {
  return !!(
    uri &&
    (uri.startsWith("http") ||
      uri.startsWith("content://") ||
      uri.startsWith("file://"))
  );
};

export const useTrackPlayerHandler = () => {
  const {
    currentSong,
    setCurrentSong,
    setIsPlaying,
    setPosition,
    setDuration,
  } = usePlayerStore();

  const errorCountRef = useRef(0);
  const lastErrorTimeRef = useRef(0);
  const isInitializedRef = useRef(false);

  // Setup TrackPlayer
  useEffect(() => {
    const setupPlayer = async () => {
      if (!RNTP_ENABLED) {
        console.log("RNTP disabled, skipping setup");
        return;
      }

      try {
        await TrackPlayer.setupPlayer({
          minBuffer: 100,
          maxBuffer: 300,
          playBuffer: 2,
          backBuffer: 60,
          waitForBuffer: true,
        });

        await TrackPlayer.updateOptions({
          android: {
            alwaysPauseOnInterruption: true,
            notificationCapabilities: [
              Capability.Play,
              Capability.Pause,
              Capability.SkipToNext,
              Capability.SkipToPrevious,
              Capability.SeekTo,
            ],
          },
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
          ],
        });

        isInitializedRef.current = true;
        console.log("[TrackPlayer] Setup complete");
      } catch (error) {
        console.error("[TrackPlayer] Setup failed:", error);
        isInitializedRef.current = false;
      }
    };

    setupPlayer();
  }, []);

  // Handle track player events
  useTrackPlayerEvents(
    [
      Event.PlaybackState,
      Event.PlaybackError,
      Event.PlaybackQueueEnded,
      Event.PlaybackProgressUpdated,
    ],
    async (event) => {
      if (!RNTP_ENABLED) {
        return;
      }

      switch (event.type) {
        case Event.PlaybackError:
          const now = Date.now();
          if (now - lastErrorTimeRef.current > 5000) {
            lastErrorTimeRef.current = now;
            errorCountRef.current = 0;
          }

          errorCountRef.current++;

          if (errorCountRef.current <= 3) {
            const track = await TrackPlayer.getActiveTrack();
            console.warn("[TrackPlayer] Playback error:", {
              uri: track?.url,
              error: event.message,
              attempt: errorCountRef.current,
            });
          }

          if (errorCountRef.current < 3) {
            setTimeout(() => {
              TrackPlayer.skipToNext();
            }, 1000);
          }
          break;

        case Event.PlaybackState:
          try {
            const playbackState = await TrackPlayer.getPlaybackState();
            const state = playbackState?.state;

            const isPlaying = state === State.Playing;
            setIsPlaying(isPlaying);

            if (isPlaying) {
              const position = await TrackPlayer.getPosition();
              const duration = await TrackPlayer.getDuration();
              setPosition(position);
              setDuration(duration);
            }
          } catch (error) {
            console.warn("[TrackPlayer] Failed to get playback state:", error);
          }
          break;

        case Event.PlaybackProgressUpdated:
          try {
            const position = await TrackPlayer.getPosition();
            setPosition(position);
          } catch (error) {
            // Silent fail
          }
          break;

        case Event.PlaybackQueueEnded:
          console.log("[TrackPlayer] Queue ended");
          break;
      }
    },
  );

  // Play song dengan auto-fix untuk missing URI
  const playSong = async (
    song: Song,
    queueSongs?: Song[],
  ): Promise<boolean> => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, playSong skipped");
      return false;
    }

    // Validasi song object
    if (!song || !song.id) {
      console.error("[TrackPlayer] Cannot play song: invalid song object");
      return false;
    }

    let targetSong = song;

    // Coba perbaiki jika URI missing
    if (!targetSong.uri) {
      console.log(
        `[TrackPlayer] Missing URI for ${targetSong.title}, attempting to fix...`,
      );
      try {
        const freshSong = await LibraryScanner.getSongById(targetSong.id);
        if (freshSong && freshSong.uri) {
          targetSong = freshSong;
          console.log(
            `[TrackPlayer] Fixed missing URI: ${targetSong.uri.substring(0, 50)}...`,
          );
        } else {
          console.error(
            `[TrackPlayer] Cannot fix missing URI for ${targetSong.title}`,
          );
          return false;
        }
      } catch (error) {
        console.error(
          "[TrackPlayer] Failed to fetch song from database:",
          error,
        );
        return false;
      }
    }

    const normalizedUri = normalizeUri(targetSong.uri);

    if (!isValidUri(normalizedUri)) {
      console.error(`[TrackPlayer] Invalid URI format: ${normalizedUri}`);
      return false;
    }

    try {
      errorCountRef.current = 0;

      const playQueue = queueSongs || [targetSong];
      const tracks = playQueue.map((s) => ({
        id: s.id,
        url: normalizeUri(s.uri),
        title: s.title || "Unknown Title",
        artist: s.artist || "Unknown Artist",
        album: s.album || "Unknown Album",
        artwork: s.artwork,
        duration: s.duration || 0,
      }));

      const validTracks = tracks.filter((t) => t.url && isValidUri(t.url));
      if (validTracks.length === 0) {
        console.error("[TrackPlayer] No valid tracks to play");
        return false;
      }

      const currentIndex = validTracks.findIndex((t) => t.id === targetSong.id);

      await TrackPlayer.reset();
      await TrackPlayer.add(validTracks);

      if (currentIndex >= 0) {
        await TrackPlayer.skip(currentIndex);
      } else {
        await TrackPlayer.skip(0);
      }

      await TrackPlayer.play();

      setCurrentSong(targetSong);
      console.log(`[TrackPlayer] Playing: ${targetSong.title}`);
      return true;
    } catch (error) {
      console.error("[TrackPlayer] Failed to play song:", error);
      return false;
    }
  };

  const togglePlay = async () => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, togglePlay skipped");
      return;
    }

    try {
      const playbackState = await TrackPlayer.getPlaybackState();
      const state = playbackState?.state;

      if (state === State.Playing) {
        await TrackPlayer.pause();
      } else if (state === State.Paused || state === State.Ready) {
        await TrackPlayer.play();
      } else {
        const { currentSong: storeSong } = usePlayerStore.getState();
        if (storeSong) {
          await playSong(storeSong);
        }
      }
    } catch (error) {
      console.error("[TrackPlayer] Toggle play failed:", error);
    }
  };

  const seek = async (position: number) => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, seek skipped");
      return;
    }

    try {
      await TrackPlayer.seekTo(position);
    } catch (error) {
      console.error("[TrackPlayer] Seek failed:", error);
    }
  };

  const playNext = async () => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, playNext skipped");
      return;
    }

    try {
      const queue = await TrackPlayer.getQueue();
      const currentTrack = await TrackPlayer.getActiveTrack();
      const currentIndex = queue.findIndex((t) => t.id === currentTrack?.id);

      if (currentIndex < queue.length - 1) {
        await TrackPlayer.skipToNext();
      } else {
        console.log("[TrackPlayer] End of queue");
      }
    } catch (error) {
      console.error("[TrackPlayer] Skip to next failed:", error);
    }
  };

  const playPrevious = async () => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, playPrevious skipped");
      return;
    }

    try {
      const position = await TrackPlayer.getPosition();
      if (position > 3) {
        await TrackPlayer.seekTo(0);
      } else {
        await TrackPlayer.skipToPrevious();
      }
    } catch (error) {
      console.error("[TrackPlayer] Skip to previous failed:", error);
    }
  };

  const getPlaybackState = async () => {
    if (!RNTP_ENABLED) {
      console.log("RNTP disabled, getPlaybackState returns null");
      return null;
    }

    try {
      return await TrackPlayer.getPlaybackState();
    } catch (error) {
      console.error("[TrackPlayer] Get playback state failed:", error);
      return null;
    }
  };

  return {
    playSong,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    getPlaybackState,
  };
}; 