/**
 * useLibrary — Week 2
 * Scan storage + pick files, persist to AsyncStorage
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types/audio.types';
import { scanLibrary, pickAudioFiles } from '../services/LibraryScanner';

const STORAGE_KEY = 'audiodelight-library';

export function useLibrary() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setTracks(JSON.parse(raw)); } catch (_) {}
      }
    });
  }, []);

  const saveTracks = async (newTracks: Track[]) => {
    setTracks(newTracks);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newTracks));
  };

  const scan = useCallback(async () => {
    setIsLoading(true);
    try {
      const found = await scanLibrary();
      // Merge dengan existing tracks (dedupe by id)
      const existingIds = new Set(tracks.map(t => t.id));
      const newOnes = found.filter(t => !existingIds.has(t.id));
      await saveTracks([...tracks, ...newOnes]);
    } catch (e) {
      console.warn('[Library] Scan error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [tracks]);

  const pick = useCallback(async () => {
    try {
      const picked = await pickAudioFiles();
      if (!picked.length) return;
      const existingIds = new Set(tracks.map(t => t.id));
      const newOnes = picked.filter(t => !existingIds.has(t.id));
      if (newOnes.length) {
        await saveTracks([...tracks, ...newOnes]);
      }
    } catch (e) {
      console.warn('[Library] Pick error:', e);
    }
  }, [tracks]);

  const remove = useCallback(async (id: string) => {
    await saveTracks(tracks.filter(t => t.id !== id));
  }, [tracks]);

  const clear = useCallback(async () => {
    await saveTracks([]);
  }, []);

  return { tracks, isLoading, scan, pick, remove, clear };
}
