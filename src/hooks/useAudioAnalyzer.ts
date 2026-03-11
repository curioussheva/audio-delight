import { useState, useCallback } from 'react';
import AudioAnalyzerService from '@/services/audio/AudioAnalyzerService';
import { AnalysisResult } from '@/services/audio/AudioAnalyzerService';
import { Song } from '@/types/audio';

export const useAudioAnalyzer = () => {
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<Map<string, AnalysisResult>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const analyzeSong = useCallback(async (song: Song) => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await AudioAnalyzerService.analyzeSong(song);
      setResults(prev => new Map(prev).set(song.id, result));
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const analyzeBatch = useCallback(async (songs: Song[]) => {
    setAnalyzing(true);
    setError(null);
    try {
      const batchResults = await AudioAnalyzerService.batchAnalyze(songs);
      const newMap = new Map(results);
      batchResults.forEach(result => {
        newMap.set(result.songId, result);
      });
      setResults(newMap);
      return batchResults;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setAnalyzing(false);
    }
  }, [results]);

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
    analyzeBatch,
    getAnalysis,
    clearAnalysis,
  };
};