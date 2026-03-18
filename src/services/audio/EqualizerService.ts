import { ALL_PRESETS, makeBands } from "@/constants/equalizerPresets";
import { EqualizerBand } from "@/types/equalizer";
import NativeDSPModule from "../native/NativeDSPModule";
import AsyncStorage from "@react-native-async-storage/async-storage";

class EqualizerService {
  private currentBands: EqualizerBand[] = ALL_PRESETS[0].bands;
  private bassStrength: number = 0;
  private reverbPreset: number = 0;

  /**
   * Helper private untuk memetakan gains ke objek EqualizerBand
   * agar sesuai dengan ekspektasi NativeDSPModule
   */
  private mapGainsToBands(gains: number[]): EqualizerBand[] {
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    return gains.map((gain, index) => ({
      id: index,
      frequency: frequencies[index],
      gain: gain,
      // TAMBAHKAN INI:
      q: 1.0, // Nilai standar Q factor
      type: "peaking", // Tipe filter standar untuk equalizer 10-band
    }));
  }

  async applyAllSettings(sessionId: number) {
    if (sessionId === 0) return;

    try {
      // 1. Terapkan EQ Bands (Kirim objek EqualizerBand[], bukan number[])
      await NativeDSPModule.setEqualizer(this.currentBands);

      // 2. Terapkan Bass Boost
      await NativeDSPModule.setBassBoost(this.bassStrength, sessionId);

      // 3. Terapkan Reverb
      await NativeDSPModule.setReverbPreset(this.reverbPreset, sessionId);
    } catch (e) {
      console.error("[EqualizerService] Failed to apply DSP:", e);
    }
  }

  // --- BASS BOOST ---
  async setBassBoost(strength: number, sessionId: number) {
    this.bassStrength = strength;
    await NativeDSPModule.setBassBoost(strength, sessionId);
    await AsyncStorage.setItem("dsp_bass_strength", strength.toString());
  }

  // --- REVERB ---
  async setReverb(presetIndex: number, sessionId: number) {
    this.reverbPreset = presetIndex;
    await NativeDSPModule.setReverbPreset(presetIndex, sessionId);
    await AsyncStorage.setItem("dsp_reverb_preset", presetIndex.toString());
  }

  // --- EQUALIZER ---
  async setPreset(presetId: string, _sessionId: number) {
    const preset = ALL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      this.currentBands = [...preset.bands];
      // Kirim seluruh array objek band
      await NativeDSPModule.setEqualizer(this.currentBands);
      await AsyncStorage.setItem("dsp_last_preset_id", presetId);
    }
  }

  async updateSingleBand(index: number, gain: number, _sessionId: number) {
    // Pastikan kita mengupdate referensi dengan benar
    const updatedBands = [...this.currentBands];
    updatedBands[index] = { ...updatedBands[index], gain };
    this.currentBands = updatedBands;

    await NativeDSPModule.setEqualizer(this.currentBands);

    // Simpan gains mentah ke storage
    const gains = this.currentBands.map((b) => b.gain);
    await AsyncStorage.setItem("dsp_custom_gains", JSON.stringify(gains));
  }

  // --- PERSISTENCE ---
  async loadSavedSettings() {
    try {
      const [savedBass, savedReverb, savedGains] = await Promise.all([
        AsyncStorage.getItem("dsp_bass_strength"),
        AsyncStorage.getItem("dsp_reverb_preset"),
        AsyncStorage.getItem("dsp_custom_gains"),
      ]);

      if (savedBass) this.bassStrength = parseInt(savedBass);
      if (savedReverb) this.reverbPreset = parseInt(savedReverb);
      if (savedGains) {
        const gains = JSON.parse(savedGains);
        this.currentBands = makeBands(gains);
      }
    } catch (e) {
      console.error("[EqualizerService] Load settings failed:", e);
    }
  }

  getState() {
    return {
      bands: this.currentBands,
      bassStrength: this.bassStrength,
      reverbPreset: this.reverbPreset,
    };
  }
}

export default new EqualizerService();
