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
 *   - `rateHonored`      = laju stream == laju file (NativeDSPModule.isRateHonored)
 *   - `isBitPerfect`     = ketiganya true
 *   - `exclusiveFailed`  = user minta bit-perfect tapi AAudio menolak
 *   - `rateMismatch`     = exclusive diterima, tapi laju stream != laju file
 *                          (decoder meresample) — bukan bit-perfect (C3.3).
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
  /** User minta bit-perfect tapi device/AAudio menolak → fallback shared.
   *  Hanya true bila native benar-benar sudah terbaca (available) — saat
   *  native belum siap, exclusive=false adalah "belum tahu", bukan
   *  "ditolak" (U-P1-04: dulu langsung menuduh FALLBACK). */
  exclusiveFailed: boolean;
  /** Laju stream sama dengan laju file (tidak ada resampling). */
  rateHonored: boolean;
  /** Exclusive diterima, tapi laju stream != laju file — decoder
   *  meresample, jadi bukan bit-perfect. Hanya true bila native sudah
   *  terbaca (available), supaya tidak menuduh saat "belum tahu". */
  rateMismatch: boolean;
  /** Laju stream yang benar-benar dibuka Oboe (Hz). 0 = belum start. */
  actualSampleRate: number;
  /** Laju HARDWARE stream (Hz) — yang benar-benar jalan di DAC/mixer.
   *  Bisa berbeda dari actualSampleRate (laju sisi app). 0 = belum start /
   *  tidak diketahui. (F2, 2026-11-16.) */
  hardwareSampleRate: number;
  /** Native module belum siap (library belum load / engine belum start). */
  unavailable: boolean;
  /**
   * Status tidak lagi dipolling live — polling hanya jalan saat playing,
   * jadi saat pause verdict (FALLBACK / laju) bisa basi (U-P1-04).
   * Pemakai jangan menampilkan verdict live bila stale.
   */
  stale: boolean;
}

const INITIAL: BitPerfectStatus = {
  requested: false,
  streamExclusive: false,
  isBitPerfect: false,
  exclusiveFailed: false,
  rateHonored: true,
  rateMismatch: false,
  actualSampleRate: 0,
  hardwareSampleRate: 0,
  unavailable: true,
  stale: true,
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
  hardwareRate: number;
  rateHonored: boolean;
  available: boolean;
} => {
  try {
    if (!NativeDSPModule?.isExclusiveModeActive) {
      return {
        exclusive: false,
        rate: 0,
        hardwareRate: 0,
        rateHonored: true,
        available: false,
      };
    }
    return {
      exclusive: NativeDSPModule.isExclusiveModeActive(),
      rate: NativeDSPModule.getActualSampleRate?.() ?? 0,
      // F2: metode baru di spec/Kotlin/JNI; `?.() ?? 0` supaya JS lama
      // tetap jalan lawan APK lama (tampilkan "—", bukan menebak).
      hardwareRate: NativeDSPModule.getHardwareSampleRate?.() ?? 0,
      // C3.3: metode baru di spec/Kotlin/JNI; `?.() ?? true` supaya JS
      // lama tetap jalan lawan APK lama (jangan tuduh resampling bila
      // metodenya belum ada).
      rateHonored: NativeDSPModule.isRateHonored?.() ?? true,
      available: true,
    };
  } catch {
    // Native tidak ter-load atau engine belum start — bukan error fatal.
    return {
      exclusive: false,
      rate: 0,
      hardwareRate: 0,
      rateHonored: true,
      available: false,
    };
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
      const { exclusive, rate, hardwareRate, rateHonored, available } =
        readStreamStatus();
      const requested = audioMode === "bit-perfect";

      setStatus({
        requested,
        streamExclusive: exclusive,
        // C3.3: syarat ketiga — laju stream harus sama dengan laju file.
        // File 44,1 kHz di stream 48 kHz (decoder meresample) bukan
        // bit-perfect meski exclusive diterima.
        isBitPerfect: requested && exclusive && rateHonored,
        // Jangan tuduh FALLBACK saat native belum siap: exclusive=false
        // di situ artinya "belum tahu", bukan "ditolak" (U-P1-04).
        exclusiveFailed: requested && available && !exclusive,
        rateHonored,
        // Exclusive diterima tapi laju berbeda — jangan tuduh exclusive
        // gagal, yang berbeda lajunya.
        rateMismatch: requested && available && exclusive && !rateHonored,
        actualSampleRate: rate,
        hardwareSampleRate: hardwareRate,
        unavailable: !available,
        // Saat pause polling berhenti — verdict yang tersisa bisa basi
        // (mis. DAC dicabut saat pause). Pemakai harus menyembunyikan
        // verdict live bila stale (U-P1-04).
        stale: !isPlaying,
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
