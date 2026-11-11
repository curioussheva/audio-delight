// src/features/player/hooks/useAudioSessionRetry.ts
//
// U-P2-24: kondisi "tidak ada audio session" ditangani berbeda di dua
// tab — Analyzer cuma menunggu tanpa tombol aksi, Visualizer punya
// tombol retry (diperbaiki U-P1-27). Logika pemulihan yang sama
// dipakai kedua tab, jadi diekstrak ke hook ini supaya polanya SATU:
// pesan "Audio session tidak tersedia. Coba restart lagu." + tombol
// retry yang benar-benar memulihkan sesi.
//
// Jalur pemulihan (identik dengan handleRetry Visualizer U-P1-27):
// (1) pakai ID yang sudah dibuat audioEngine saat startup — store bisa
// ketinggalan karena init race; (2) bila engine pun belum punya sesi,
// minta lewat createAudioSession (mengembalikan sesi yang sudah ada
// bila ada, bukan sesi baru tiap panggil). ID yang pulih ditulis ke
// kedua store supaya SpectrumAnalyzer men-start visualizerService;
// start() dipanggil juga langsung supaya tidak menunggu re-render.
// Bila tidak ada sesi yang bisa dipulihkan, kembalikan false —
// tidak ada klaim sukses palsu.
import { useCallback, useState } from "react";

import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import NativeDSPModule from "@/features/equalizer/api/nativeInterface";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";

export function useAudioSessionRetry() {
  const [isRetrying, setIsRetrying] = useState(false);
  const setAudioSessionId = usePlayerStore((s) => s.setAudioSessionId);

  const retryAudioSession = useCallback(async (): Promise<boolean> => {
    if (isRetrying) return false;
    setIsRetrying(true);
    try {
      let id = audioEngine.getSessionId();
      if (!id || id <= 0) {
        try {
          const res = await NativeDSPModule?.createAudioSession?.();
          id = res?.sessionId ?? null;
        } catch (e) {
          console.warn("[useAudioSessionRetry] createAudioSession gagal:", e);
        }
      }
      if (id && id > 0) {
        setAudioSessionId(id);
        useEqualizerStore.getState().setAudioSessionId(id);
        const ok = await visualizerService.start(id);
        if (!ok) {
          console.warn(
            "[useAudioSessionRetry] visualizerService.start gagal untuk sesi",
            id,
          );
        }
        return true;
      }
      console.warn(
        "[useAudioSessionRetry] tidak ada audio session yang bisa dipulihkan",
      );
      return false;
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, setAudioSessionId]);

  return { isRetrying, retryAudioSession };
}
