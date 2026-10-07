import { EqualizerBand } from "@/shared/types/dsp";
import NativeDSPModule from "@/features/visualizer/native/NativeDSPModule";
import NativeDSPModuleSpec, {
  ProcessingModeValue,
  type ProcessingModeValue as ProcessingModeValueType,
} from "@/specs/NativeDSPModule";

/**
 * Mode pemrosesan audio â dikirim ke engine native, bukan ke DSP session
 * Android.
 *
 * KENAPA INI DITULIS ULANG
 *
 * Versi sebelumnya memakai `USBDACService.setExclusiveMode(id, enable)` untuk
 * menyalakan "bit-perfect". Itu jalur yang salah dan tidak mungkin bekerja:
 *
 *  1. `USBDACModule.kt` tidak punya JNI sama sekali (nol `external fun`), jadi
 *     `setExclusiveMode` hanya `resolve({ success: true })` â selalu sukses
 *     palsu, tidak menyentuh stream Oboe.
 *  2. Itu jalur perangkat USB, sedangkan pemilihan perangkat sekarang lewat
 *     `AudioOutputService` (NativeDeviceModule).
 *  3. Pemrosesan (mode) dan jalur (exclusive) adalah dua hal berbeda;
 *     menggabungkannya di satu fungsi membuat keduanya tidak bisa diatur
 *     terpisah â dan itulah yang membuat mode ketiga mustahil ditambahkan.
 *
 * Sekarang: mode dikirim lewat `NativeDSPModuleSpec.setProcessingMode()`, yang
 * jalurnya lengkap sampai `EngineManager` dan dibaca per-buffer (live, tanpa
 * restart stream).
 *
 * Lihat docs/adr/0001-tiga-mode-satu-sumber-kebenaran.md.
 */

export type ProcessingModeName = "bit-perfect" | "dsp" | "immersive";

const modeValue = (mode: ProcessingModeName): ProcessingModeValueType =>
  mode === "bit-perfect"
    ? ProcessingModeValue.BitPerfect
    : mode === "immersive"
      ? ProcessingModeValue.Immersive
      : ProcessingModeValue.DSP;

export class DSPPipeline {
  private static currentMode: ProcessingModeName = "dsp";

  static getMode(): ProcessingModeName {
    return this.currentMode;
  }

  /**
   * Ganti mode pemrosesan. LIVE â berlaku pada buffer audio berikutnya.
   *
   * Tidak menyentuh exclusive: itu syarat jalur, diatur terpisah oleh
   * `AudioEngine.toggleExclusiveMode()`. Mode yang gagal secara jalur
   * (bit-perfect tanpa DAC) tetap berbunyi.
   */
  static async setProcessingMode(mode: ProcessingModeName): Promise<void> {
    this.currentMode = mode;

    try {
      NativeDSPModuleSpec?.setProcessingMode?.(modeValue(mode));
      console.log(`[DSPPipeline] Mode -> ${mode} (${modeValue(mode)})`);
    } catch (e) {
      console.warn("[DSPPipeline] setProcessingMode gagal:", e);
    }

    // Di bit-perfect DSP memang dilewati; melepas FX Android mencegah slider
    // EQ bergerak tanpa efek. Di immersive, FX justru bagian rantainya â
    // jangan dilepas.
    if (mode === "bit-perfect") {
      try {
        await NativeDSPModule?.releaseAllFX?.();
      } catch (e) {
        console.warn("[DSPPipeline] releaseAllFX gagal:", e);
      }
    }
  }

  /**
   * Terapkan EQ ke DSP session Android.
   *
   * Ini BUKAN DSPChain C++ â ini efek level Android session. Keduanya bisa
   * aktif bersamaan, dan itu memang disengaja: EQ Android bekerja untuk jalur
   * shared, DSPChain bekerja di PCM.
   */
  static async applyDSP(
    bands: EqualizerBand[],
    bassStrength: number,
    reverbPreset: number,
    sessionId: number,
  ): Promise<void> {
    if (this.currentMode === "bit-perfect" || sessionId <= 0) return;

    try {
      const gains = bands.map((b) => b.gain);
      await NativeDSPModule.setFullEqualizer(gains, sessionId);
      await NativeDSPModule.setBassBoost(bassStrength, sessionId);
      await NativeDSPModule.setReverbPreset(reverbPreset, sessionId);
    } catch (e) {
      console.error("DSP Pipeline Error:", e);
    }
  }
}
