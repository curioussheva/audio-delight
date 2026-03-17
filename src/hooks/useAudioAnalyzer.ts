import { useState, useCallback, useEffect, useMemo } from 'react';
import { audioAnalyzer, AnalysisResult } from '@/services/audio/AudioAnalyzerService';
import { Song } from '@/types/audio';
import { visualizerEmitter, startVisualizer, stopVisualizer } from '@/services/native/VisualizerBridge';

interface UseAudioAnalyzerReturn {
  isAnalyzing: boolean;
  analysisError: string | null;
  spectrumData: number[];
  analyzeSingle: (song: Song, options?: { force?: boolean }) => Promise<AnalysisResult | null>;
  analyzeBatch: (songs: Song[], options?: { force?: boolean }) => Promise<AnalysisResult[]>;
  startLiveVisualizer: (sessionId: number) => Promise<void>;
  getAnalysis: (songId: string) => AnalysisResult | undefined;
  clearResults: () => void;
}

export const useAudioAnalyzer = (): UseAudioAnalyzerReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, AnalysisResult>>(new Map());
  const [spectrumData, setSpectrumData] = useState<number[]>([]);

  // ─── Live Visualizer Listener ───────────────────────────────────────
  useEffect(() => {
    if (!visualizerEmitter) return;

    const subscription = visualizerEmitter.addListener('onFftData', (data: number[]) => {
      setSpectrumData(data);
    });

    // Cleanup on unmount
    return () => {
      subscription.remove();
      stopVisualizer();
    };
  }, []);

  // ─── Live Visualizer Control ────────────────────────────────────────
  const startLiveVisualizer = useCallback(async (sessionId: number): Promise<void> => {
    if (!sessionId || sessionId <= 0) {
      console.warn('[useAudioAnalyzer] Invalid session ID for visualizer');
      return;
    }

    try {
      await startVisualizer(sessionId);
    } catch (err) {
      console.error('[useAudioAnalyzer] Failed to start visualizer:', err);
    }
  }, []);

  // ─── Static File Analysis ───────────────────────────────────────────
  const analyzeSingle = useCallback(
    async (song: Song, { force = false } = {}): Promise<AnalysisResult | null> => {
      if (!song?.id) {
        setAnalysisError('Invalid song: missing ID');
        return null;
      }

      // Skip if already analyzed and not forced
      if (!force && results.has(song.id)) {
        return results.get(song.id)!;
      }

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const result = await audioAnalyzer.analyzeSong(song);
        setResults((prev) => {
          const next = new Map(prev);
          next.set(song.id, result);
          return next;
        });
        return result;
      } catch (err: any) {
        const message = err?.message || 'Failed to analyze song';
        setAnalysisError(message);
        console.error(`[useAudioAnalyzer] analyzeSingle failed for ${song.title || song.id}:`, err);
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [results]
  );

  const analyzeBatch = useCallback(
    async (songs: Song[], { force = false } = {}): Promise<AnalysisResult[]> => {
      if (!songs?.length) return [];

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        // Filter out already analyzed songs unless force=true
        const songsToAnalyze = force
          ? songs
          : songs.filter((s) => !results.has(s.id));

        if (songsToAnalyze.length === 0) {
          return songs.map((s) => results.get(s.id)!).filter(Boolean) as AnalysisResult[];
        }

        const batchResults = await audioAnalyzer.batchAnalyze(songsToAnalyze);

        setResults((prev) => {
          const next = new Map(prev);
          batchResults.forEach((r) => next.set(r.songId, r));
          return next;
        });

        // Return results for all requested songs (including cached ones)
        return songs.map((song) => results.get(song.id) || batchResults.find((r) => r.songId === song.id)!);
      } catch (err: any) {
        const message = err?.message || 'Batch analysis failed';
        setAnalysisError(message);
        console.error('[useAudioAnalyzer] analyzeBatch failed:', err);
        return [];
      } finally {
        setIsAnalyzing(false);
      }
    },
    [results]
  );

  // ─── Helpers ────────────────────────────────────────────────────────
  const getAnalysis = useCallback(
    (songId: string): AnalysisResult | undefined => results.get(songId),
    [results]
  );

  const clearResults = useCallback(() => {
    setResults(new Map());
    setAnalysisError(null);
  }, []);

  return useMemo(
    () => ({
      isAnalyzing,
      analysisError,
      spectrumData,
      analyzeSingle,
      analyzeBatch,
      startLiveVisualizer,
      getAnalysis,
      clearResults,
    }),
    [
      isAnalyzing,
      analysisError,
      spectrumData,
      analyzeSingle,
      analyzeBatch,
      startLiveVisualizer,
      getAnalysis,
      clearResults,
    ]
  );
}; 