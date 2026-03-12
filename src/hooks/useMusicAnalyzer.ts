// src/hooks/useMusicAnalyzer.ts
import { useState, useCallback } from 'react';
import MusicMetadataService, { MusicAnalysisResult } from '@/services/audio/MusicMetadataService';
import { Song } from '@/types/audio';

export const useMusicAnalyzer = () => {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<Map<string, MusicAnalysisResult>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const analyzeSong = useCallback(async (song: Song) => {
    setAnalyzing(true);
    setError(null);
    
    try {
      const result = await MusicMetadataService.analyze(song.uri);
      setResults(prev => new Map(prev).set(song.id, result));
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const getAnalysis = useCallback((songId: string) => {
    return results.get(songId);
  }, [results]);

  const clearAnalysis = useCallback(() => {
    setResults(new Map());
  }, []);

  return {
    analyzing,
    error,
    analyzeSong,
    getAnalysis,
    clearAnalysis,
  };
};