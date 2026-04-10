import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  audioAnalyzer,
  AnalysisResult,
} from "@/features/visualizer/api/analyzer";
import { Song } from "@/shared/types/audio";
import {
  visualizerEmitter,
  startVisualizer,
  stopVisualizer,
  subscribeToFft, // Gunakan helper yang sudah dibuat
  FftData,
} from "@/features/visualizer/native/VisualizerBridge";

interface UseAudioAnalyzerReturn {
  isAnalyzing: boolean;
  analysisError: string | null;
  spectrumData: number[];
  isVisualizerActive: boolean; // ✅ TAMBAH: Status visualizer
  analyzeSingle: (
    song: Song,
    options?: { force?: boolean },
  ) => Promise<AnalysisResult | null>;
  analyzeBatch: (
    songs: Song[],
    options?: { force?: boolean },
  ) => Promise<AnalysisResult[]>;
  startLiveVisualizer: (sessionId: number) => Promise<boolean>; // ✅ Return boolean
  stopLiveVisualizer: () => void; // ✅ TAMBAH: Stop function
  getAnalysis: (songId: string) => AnalysisResult | undefined;
  clearResults: () => void;
}

const EMPTY_SPECTRUM = new Array(128).fill(0); // ✅ Konstanta untuk reset

export const useAudioAnalyzer = (): UseAudioAnalyzerReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, AnalysisResult>>(
    new Map(),
  );
  const [spectrumData, setSpectrumData] = useState<number[]>(EMPTY_SPECTRUM);
  const [isVisualizerActive, setIsVisualizerActive] = useState(false); // ✅ Track status

  // ✅ GUNAKAN REF untuk tracking cleanup dan session
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentSessionRef = useRef<number | null>(null);

  // ─── Cleanup Function ───────────────────────────────────────────────
  const cleanupVisualizer = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    stopVisualizer();
    setSpectrumData(EMPTY_SPECTRUM);
    setIsVisualizerActive(false);
    currentSessionRef.current = null;
  }, []);

  // ✅ CLEANUP SAAT UNMOUNT
  useEffect(() => {
    return () => {
      cleanupVisualizer();
    };
  }, [cleanupVisualizer]);

  // ─── Live Visualizer Control ────────────────────────────────────────
  const startLiveVisualizer = useCallback(
    async (sessionId: number): Promise<boolean> => {
      // ✅ VALIDASI
      if (!sessionId || sessionId <= 0) {
        console.warn("[useAudioAnalyzer] Invalid session ID:", sessionId);
        return false;
      }

      // ✅ PREVENT DOUBLE START - cleanup existing dulu
      if (currentSessionRef.current === sessionId) {
        console.log(
          "[useAudioAnalyzer] Visualizer already active for session",
          sessionId,
        );
        return true; // Sudah aktif untuk session ini
      }

      cleanupVisualizer();

      try {
        // ✅ SUBSCRIBE DULU sebelum start (tidak miss data awal)
        unsubscribeRef.current = subscribeToFft((data: FftData) => {
          setSpectrumData(data);
        });

        const success = await startVisualizer(sessionId);

        if (success) {
          currentSessionRef.current = sessionId;
          setIsVisualizerActive(true);
          return true;
        } else {
          // Start failed, cleanup subscription
          cleanupVisualizer();
          return false;
        }
      } catch (err) {
        console.error("[useAudioAnalyzer] Failed to start visualizer:", err);
        cleanupVisualizer();
        return false;
      }
    },
    [cleanupVisualizer],
  );

  // ✅ TAMBAH: Stop function yang bisa dipanggil consumer
  const stopLiveVisualizer = useCallback(() => {
    console.log("[useAudioAnalyzer] Stopping visualizer");
    cleanupVisualizer();
  }, [cleanupVisualizer]);

  // ─── Static File Analysis ───────────────────────────────────────────
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

        // ✅ FIX: Return semua hasil (cached + baru)
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

  // ─── Helpers ────────────────────────────────────────────────────────
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
      isVisualizerActive, // ✅ Export status
      analyzeSingle,
      analyzeBatch,
      startLiveVisualizer,
      stopLiveVisualizer, // ✅ Export stop function
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
