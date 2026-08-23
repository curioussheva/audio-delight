import {
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  audioAnalyzer,
  AnalysisResult,
} from "@/features/visualizer/api/analyzer";
import { Song } from "@/shared/types/audio";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";

interface UseAudioAnalyzerReturn {
  isAnalyzing: boolean;
  analysisError: string | null;
  spectrumData: number[];
  isVisualizerActive: boolean;
  analyzeSingle: (
    song: Song,
    options?: { force?: boolean },
  ) => Promise<AnalysisResult | null>;
  analyzeBatch: (
    songs: Song[],
    options?: { force?: boolean },
  ) => Promise<AnalysisResult[]>;
  startLiveVisualizer: (sessionId: number) => Promise<boolean>;
  stopLiveVisualizer: () => void;
  getAnalysis: (songId: string) => AnalysisResult | undefined;
  clearResults: () => void;
}

const EMPTY_SPECTRUM = new Array(128).fill(0);

export const useAudioAnalyzer = (): UseAudioAnalyzerReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, AnalysisResult>>(
    new Map(),
  );
  const [spectrumData, setSpectrumData] = useState<number[]>(EMPTY_SPECTRUM);
  const [isVisualizerActive, setIsVisualizerActive] = useState(false);

  // Cleanup saat unmount: stop visualizer & jangan biarkan polling jalan
  useEffect(() => {
    return () => {
      visualizerService.stop();
    };
  }, []);

  const startLiveVisualizer = useCallback(
    async (sessionId: number): Promise<boolean> => {
      if (!sessionId || sessionId <= 0) {
        console.warn("[useAudioAnalyzer] Invalid session ID:", sessionId);
        return false;
      }

      try {
        // Pasang callback terlebih dahulu
        visualizerService.setDataCallback((data) => {
          setSpectrumData(data);
        });

        const success = await visualizerService.start(sessionId);
        setIsVisualizerActive(success);

        if (!success) {
          // jika gagal, hentikan polling & reset
          visualizerService.stop();
          setSpectrumData(EMPTY_SPECTRUM);
        }

        return success;
      } catch (err) {
        console.error("[useAudioAnalyzer] Failed to start visualizer:", err);
        visualizerService.stop();
        setSpectrumData(EMPTY_SPECTRUM);
        setIsVisualizerActive(false);
        return false;
      }
    },
    [],
  );

  const stopLiveVisualizer = useCallback(() => {
    visualizerService.stop();
    setSpectrumData(EMPTY_SPECTRUM);
    setIsVisualizerActive(false);
  }, []);

  // ─── Static File Analysis ───────────────────────────
  const analyzeSingle = useCallback(
    async (
      song: Song,
      { force = false } = {},
    ): Promise<AnalysisResult | null> => {
      if (!song?.id) {
        setAnalysisError("Invalid song: missing ID");
        return null;
      }

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
        const message = err?.message || "Failed to analyze song";
        setAnalysisError(message);
        console.error(
          `[useAudioAnalyzer] analyzeSingle failed for ${song.title || song.id}:`,
          err,
        );
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [results],
  );

  const analyzeBatch = useCallback(
    async (
      songs: Song[],
      { force = false } = {},
    ): Promise<AnalysisResult[]> => {
      if (!songs?.length) return [];

      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const songsToAnalyze = force
          ? songs
          : songs.filter((s) => !results.has(s.id));

        if (songsToAnalyze.length === 0) {
          return songs
            .map((s) => results.get(s.id))
            .filter((r): r is AnalysisResult => r !== undefined);
        }

        const batchResults = await audioAnalyzer.batchAnalyze(songsToAnalyze);

        setResults((prev) => {
          const next = new Map(prev);
          batchResults.forEach((r) => next.set(r.songId, r));
          return next;
        });

        return songs
          .map((song) => {
            const cached = results.get(song.id);
            if (cached) return cached;
            const fresh = batchResults.find((r) => r.songId === song.id);
            return fresh!;
          })
          .filter((r): r is AnalysisResult => r !== undefined);
      } catch (err: any) {
        const message = err?.message || "Batch analysis failed";
        setAnalysisError(message);
        console.error("[useAudioAnalyzer] analyzeBatch failed:", err);
        return [];
      } finally {
        setIsAnalyzing(false);
      }
    },
    [results],
  );

  const getAnalysis = useCallback(
    (songId: string): AnalysisResult | undefined => results.get(songId),
    [results],
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
      isVisualizerActive,
      analyzeSingle,
      analyzeBatch,
      startLiveVisualizer,
      stopLiveVisualizer,
      getAnalysis,
      clearResults,
    }),
    [
      isAnalyzing,
      analysisError,
      spectrumData,
      isVisualizerActive,
      analyzeSingle,
      analyzeBatch,
      startLiveVisualizer,
      stopLiveVisualizer,
      getAnalysis,
      clearResults,
    ],
  );
};