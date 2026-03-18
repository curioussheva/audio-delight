import { NativeModules } from "react-native";
import { EqualizerBand } from "../../types/dsp.types";
import NativeDSPModule from "../native/NativeDSPModule"; // Gunakan interface yang kita buat

const { USBDACModule } = NativeModules;

export class DSPPipeline {
  private static currentMode: "bit-perfect" | "dsp" = "dsp";

  /**
   * Mengatur mode global berdasarkan pilihan di Onboarding
   */
  static async setProcessingMode(mode: "bit-perfect" | "dsp") {
    this.currentMode = mode;

    if (mode === "bit-perfect") {
      // Matikan semua pemrosesan software untuk jalur murni
      await NativeDSPModule.toggleExclusiveMode(true);
      await NativeDSPModule.releaseAllFX();
    } else {
      // Aktifkan kembali mixer Android untuk mengizinkan DSP
      await NativeDSPModule.toggleExclusiveMode(false);
    }
  }

  /**
   * Update EQ, Bass Boost, dan Reverb secara bersamaan
   */
  static async applyDSP(
    bands: EqualizerBand[],
    bassStrength: number,
    reverbPreset: number,
    sessionId: number,
  ) {
    if (this.currentMode === "bit-perfect" || sessionId <= 0) return;

    try {
      // 1. Update Equalizer Bands
      const gains = bands.map((b) => b.gain);
      await USBDACModule.setEqualizerGains(gains, sessionId);

      // 2. Update Bass Boost
      await NativeDSPModule.setBassBoost(bassStrength, sessionId);

      // 3. Update Reverb
      await NativeDSPModule.setReverbPreset(reverbPreset, sessionId);
    } catch (e) {
      console.error("DSP Pipeline Error:", e);
    }
  }
}
