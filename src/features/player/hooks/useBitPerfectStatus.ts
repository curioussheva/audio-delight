/**
 * Status bit-perfect yang JUJUR.
 *
 * `audioMode === "bit-perfect"` di store hanya mencatat **APA YANG DIPILIH
 * USER**. AAudio bisa menolak exclusive mode — Oboe otomatis fallback ke
 * SharedMode, dan sampel tetap lewat AudioFlinger mixer (konversi + gain
 * tambahan). Dari UI, dua keadaan itu tidak bisa dibedakan tanpa membaca
 * status stream aktual.
 *
 * Hook ini menjembatani keduanya:
 *   - `audioMode`        = pilihan user  (playerStore)
 *   - `streamExclusive`  = keadaan nyata (NativeDSPModule.isExclusiveModeActive)
 *   - `isBitPerfect`     = keduanya true
 *   - `exclusiveFailed`  = user minta bit-perfect tapi AAudio menolak
 *
 * Lihat docs/WORKFLOW.md syarat 1 & 2.
 */
import { useEffect, useState } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";
import NativeDSPModule from "@/features/equalizer/api/nativeInterface";

export interface BitPerfectStatus {
  /** User memilih mode bit-perfect di settings. */
  requested: boolean;
  /** Oboe stream benar-benar exclusive (AAudio menerimanya). */
  streamExclusive: boolean;
  /** Bit-perfect sebenarnya aktif: dipilih DAN diterima. */
  isBitPerfect: boolean;
  /** User minta bit-perfect tapi device/AAudio menolak → fallback shared. */
  exclusiveFailed: boolean;
  /** Laju stream yang benar-benar dibuka Oboe (Hz). 0 = belum start. */
  actualSampleRate: number;
  /** Native module belum siap (library belum load / engine belum start). */
  unavailable: boolean;
}

const INITIAL: BitPerfectStatus = {
  requested: false,
  streamExclusive: false,
  isBitPerfect: false,
  exclusiveFailed: false,
  actualSampleRate: 0,
  unavailable: true,
};

/**
 * Baca status stream aktual dari native.
 *
 * Dua query sync (`isBlockingSynchronousMethod`) supaya selalu fresh —
 * `setExclusiveMode()` stop+start stream, bacaan async bisa dapat status
 * stream LAMA tepat di tengah transisi.
 */
const readStreamStatus = (): {
  exclusive: boolean;
  rate: number;
  available: boolean;
} => {
  try {
    if (!NativeDSPModule?.isExclusiveModeActive) {
      return { exclusive: false, rate: 0, available: false };
    }
    return {
      exclusive: NativeDSPModule.isExclusiveModeActive(),
      rate: NativeDSPModule.getActualSampleRate?.() ?? 0,
      available: true,
    };
  } catch {
    // Native tidak ter-load atau engine belum start — bukan error fatal.
    return { exclusive: false, rate: 0, available: false };
  }
};

export const useBitPerfectStatus = (
  /** Interval re-read (ms). Default 2000 — hanya untuk deteksi fallback
   *  diam-diam setelah user colok/cabut DAC. */
  pollIntervalMs = 2000,
): BitPerfectStatus => {
  const audioMode = usePlayerStore((s) => s.audioMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [status, setStatus] = useState<BitPerfectStatus>(INITIAL);

  useEffect(() => {
    const sync = () => {
      const { exclusive, rate, available } = readStreamStatus();
      const requested = audioMode === "bit-perfect";

      setStatus({
        requested,
        streamExclusive: exclusive,
        isBitPerfect: requested && exclusive,
        exclusiveFailed: requested && !exclusive,
        actualSampleRate: rate,
        unavailable: !available,
      });
    };

    sync();

    // Re-read saat mode diganti. setExclusiveMode() stop+start stream —
    // status baru hanya akurat setelah stream terbuka kembali.
    const timeout = setTimeout(sync, 400);

    // Poll: AAudio bisa mencabut exclusive di tengah pemutaran (device
    // dicabut, audio focus, dsb). Hanya saat playing supaya idle tidak
    // bangun native.
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying) {
      interval = setInterval(sync, pollIntervalMs);
    }

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [audioMode, isPlaying, pollIntervalMs]);

  return status;
};
