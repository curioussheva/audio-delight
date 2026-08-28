import USBDACModule from "../../../specs/USBDACModule";
import { EqualizerBand } from "@/shared/types/dsp";
import NativeDSPModule from "@/features/visualizer/native/NativeDSPModule";
import USBDACService from "@/features/hardware/api/USBDACModule"; // ← TAMBAH


export class DSPPipeline {
  private static currentMode: "bit-perfect" | "dsp" = "dsp";
  private static currentDACId: string | null = null; // ← TAMBAH untuk simpan DAC ID

  // ← TAMBAH setter agar bisa di-set dari hook/store saat DAC terdeteksi
  static setCurrentDACId(dacId: string | null) {
    this.currentDACId = dacId;
  }

  static async setProcessingMode(mode: "bit-perfect" | "dsp") {
    this.currentMode = mode;

    if (mode === "bit-perfect") {
      // BEFORE: await NativeDSPModule.toggleExclusiveMode(true);
      // AFTER:
      if (this.currentDACId) {
        await USBDACService.setExclusiveMode(this.currentDACId, true);
      }
      await NativeDSPModule.releaseAllFX();
    } else {
      // BEFORE: await NativeDSPModule.toggleExclusiveMode(false);
      // AFTER:
      if (this.currentDACId) {
        await USBDACService.setExclusiveMode(this.currentDACId, false);
      }
    }
  }

  static async applyDSP(
    bands: EqualizerBand[],
    bassStrength: number,
    reverbPreset: number,
    sessionId: number,
  ) {
    if (this.currentMode === "bit-perfect" || sessionId <= 0) return;

    try {
      const gains = bands.map((b) => b.gain);
      await NativeDSPModule.setFullEqualizer(gains, sessionId); // ← ganti USBDACModule
      await NativeDSPModule.setBassBoost(bassStrength, sessionId);
      await NativeDSPModule.setReverbPreset(reverbPreset, sessionId);
    } catch (e) {
      console.error("DSP Pipeline Error:", e);
    }
  }
} 