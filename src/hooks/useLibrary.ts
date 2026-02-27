import { useState, useCallback } from 'react';
import { Track } from '../types/audio.types';
import { scanLibrary, pickAudioFiles } from '../services/LibraryScanner';

interface LibraryState {
  tracks: Track[];
  isLoading: boolean;
  error: string | null;
  hasScanned: boolean;
}

export function useLibrary() {
  const [state, setState] = useState<LibraryState>({
    tracks: [],
    isLoading: false,
    error: null,
    hasScanned: false,
  });

  const scan = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const tracks = await scanLibrary();
      setState({ tracks, isLoading: false, error: null, hasScanned: true });
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: 'Gagal scan library. Cek permission storage.',
      }));
    }
  }, []);

  const pickFiles = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const picked = await pickAudioFiles();
      setState((s) => ({
        ...s,
        isLoading: false,
        // Merge new files, avoid duplicates
        tracks: [
          ...s.tracks,
          ...picked.filter((p) => !s.tracks.find((t) => t.uri === p.uri)),
        ],
      }));
      return picked;
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false, error: 'Gagal memilih file.' }));
      return [];
    }
  }, []);

  return {
    ...state,
    scan,
    pickFiles,
  };
}
