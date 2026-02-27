import { useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

/**
 * Sync TrackPlayer state → Zustand.
 * Safe mode jika RNTP tidak tersedia (Expo Go).
 */
export function useTrackPlayerSync() {
  const { isRNTPAvailable } = usePlayerStore();

  useEffect(() => {
    if (!isRNTPAvailable) return;
    
    let unsub: (() => void) | null = null;
    
    try {
      const { usePlaybackState, useProgress, useTrackPlayerEvents, Event } = 
        require('react-native-track-player');
      // Hook-based sync hanya bisa dipanggil dari component
      // Ini akan dipanggil dari component yang proper
    } catch (e) {
      // RNTP tidak tersedia, skip
    }

    return () => unsub?.();
  }, [isRNTPAvailable]);
}
