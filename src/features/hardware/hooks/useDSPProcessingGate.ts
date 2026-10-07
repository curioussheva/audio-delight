// src/features/hardware/hooks/useDSPProcessingGate.ts
//
// Sakelar diagnostik untuk pemrosesan DSP di jalur produksi.
//
// KENAPA INI ADA
//
// Sebelum 2026-10-07, `AudioPipeline::process()` - tempat ketiga mode
// (BitPerfect/DSP/Immersive) hidup - tidak pernah dipanggil saat memutar lagu.
// Mode DSP tidak berefek dan bit-perfect hanya benar secara kebetulan.
//
// Setelah disambungkan, `DSPChain` mulai benar-benar mengeksekusi PCM di jalur
// produksi - sesuatu yang belum pernah terjadi, jadi ada risiko bug DSP yang
// baru muncul. Sakelar ini membuat perbandingan "dengan DSP" vs "tanpa DSP"
// bisa dilakukan SAAT PEMUTARAN, tanpa build ulang dan tanpa revert.
//
// Ini BUKAN preferensi user - ini alat diagnosa. Nilainya tidak disimpan:
// setiap app dibuka, kembali ke default build (menyala).
//
// Lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.

import { useCallback, useEffect, useState } from "react";
import NativeDSPModuleSpec from "@/specs/NativeDSPModule";

export interface UseDSPProcessingGateReturn {
  /** true kalau pipeline sedang memproses PCM di jalur produksi. */
  enabled: boolean;
  /** Native belum siap (library belum ter-load). */
  unavailable: boolean;
  /** Nyalakan/matikan. Berlaku pada buffer audio berikutnya. */
  setEnabled: (enabled: boolean) => void;
  /** true kalau default build memang menyala (untuk label UI). */
  isBuildDefault: boolean;
}

const readGate = (): { enabled: boolean; unavailable: boolean } => {
  try {
    if (!NativeDSPModuleSpec?.isDSPProcessingEnabled) {
      return { enabled: false, unavailable: true };
    }
    return {
      enabled: NativeDSPModuleSpec.isDSPProcessingEnabled() === true,
      unavailable: false,
    };
  } catch {
    // Native belum ter-load - bukan error fatal.
    return { enabled: false, unavailable: true };
  }
};

export const useDSPProcessingGate = (): UseDSPProcessingGateReturn => {
  const [state, setState] = useState(readGate);

  // Baca ulang saat mount: nilai build default baru diketahui setelah native
  // siap, dan itu terjadi setelah render pertama.
  useEffect(() => {
    setState(readGate());
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    try {
      NativeDSPModuleSpec?.setDSPProcessingEnabled?.(enabled);
      setState(readGate());
    } catch (e) {
      console.warn("[DSPGate] gagal mengubah sakelar:", e);
    }
  }, []);

  return {
    enabled: state.enabled,
    unavailable: state.unavailable,
    setEnabled,
    // Menyala secara default; kalau tidak, itu keputusan build.
    isBuildDefault: true,
  };
};

export default useDSPProcessingGate;
