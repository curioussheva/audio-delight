import { ALL_PRESETS, makeBands } from "@/features/equalizer/constants/presets";
import { EqualizerBand, Preset } from "@/features/equalizer/types";
import NativeDSPModule from "@/features/visualizer/native/NativeDSPModule";
import AsyncStorage from "@react-native-async-storage/async-storage";

class EqualizerService {
  // Gunakan preset "flat" sebagai default saat inisialisasi
  private currentBands: EqualizerBand[] = ALL_PRESETS[0].bands;
  private bassStrength: number = 0;
  private reverbPreset: number = 0;
  private virtualizerLevel: number = 0;

  /**
   * Mengambil semua settings yang tersimpan dan menerapkannya sekaligus.
   * Dipanggil saat lagu baru mulai (onTrackChanged) atau saat engine di-reset.
   */
  async applyAllSettings(sessionId: number) {
    if (!sessionId || sessionId <= 0) {
      console.warn("[EQ Service] Invalid Session ID, skipping DSP apply.");
      return;
    }

    // TUNGGU SEBENTAR: Beri waktu bagi Android Audio Framework untuk
    // membersihkan state Session ID sebelumnya dan menyiapkan AudioTrack baru.
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      console.log(`🎛️ [EQ Service] Syncing DSP to Session: ${sessionId}`);

      // 1. EQ Bands
      const gains = this.currentBands.map((b) => b.gain);
      await NativeDSPModule.setFullEqualizer(gains, sessionId);

      // 2. Bass Boost
      await NativeDSPModule.setBassBoost(this.bassStrength, sessionId);

      // 3. Virtualizer (Stage)
      await NativeDSPModule.setVirtualizer(this.virtualizerLevel, sessionId);

      // 4. Reverb
      await NativeDSPModule.setReverbPreset(this.reverbPreset, sessionId);
    } catch (e) {
      console.error("[EqualizerService] Failed to apply DSP:", e);
    }
  }

  // --- BASS BOOST ---
  async setBassBoost(strength: number, sessionId: number) {
    this.bassStrength = strength;
    if (sessionId > 0) {
      await NativeDSPModule.setBassBoost(strength, sessionId);
    }
    await AsyncStorage.setItem("dsp_bass_strength", strength.toString());
  }

  // --- VIRTUALIZER (STAGE) ---
  async setVirtualizer(level: number, sessionId: number) {
    this.virtualizerLevel = level;
    if (sessionId > 0) {
      await NativeDSPModule.setVirtualizer(level, sessionId);
    }
    await AsyncStorage.setItem("dsp_virtualizer_level", level.toString());
  }

  // --- REVERB ---
  async setReverb(presetIndex: number, sessionId: number) {
    this.reverbPreset = presetIndex;
    if (sessionId > 0) {
      await NativeDSPModule.setReverbPreset(presetIndex, sessionId);
    }
    await AsyncStorage.setItem("dsp_reverb_preset", presetIndex.toString());
  }

  // --- EQUALIZER ---
  async setPreset(presetId: string, sessionId: number = 0) {
    // ← tambah param
    const preset = ALL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      this.currentBands = [...preset.bands];

      if (sessionId > 0) {
        // ← hanya apply ke native jika session valid
        const gains = this.currentBands.map((b) => b.gain);
        await NativeDSPModule.setFullEqualizer(gains, sessionId);
      }

      await AsyncStorage.setItem("dsp_last_preset_id", presetId);
      const gains = this.currentBands.map((b) => b.gain);
      await AsyncStorage.setItem("dsp_custom_gains", JSON.stringify(gains));
    }
  }

  // --- PERSISTENCE ---
  async loadSavedSettings() {
    try {
      const [savedBass, savedReverb, savedGains, savedVirtualizer] =
        await Promise.all([
          AsyncStorage.getItem("dsp_bass_strength"),
          AsyncStorage.getItem("dsp_reverb_preset"),
          AsyncStorage.getItem("dsp_custom_gains"),
          AsyncStorage.getItem("dsp_virtualizer_level"),
        ]);

      if (savedBass) this.bassStrength = parseInt(savedBass);
      if (savedReverb) this.reverbPreset = parseInt(savedReverb);
      if (savedVirtualizer) this.virtualizerLevel = parseInt(savedVirtualizer);

      if (savedGains) {
        const gains = JSON.parse(savedGains);
        // Pastikan makeBands menghasilkan objek lengkap (id, freq, gain, q, type)
        this.currentBands = makeBands(gains);
      }

      console.log("[EQ Service] Settings loaded from disk");
    } catch (e) {
      console.error("[EqualizerService] Load settings failed:", e);
    }
  }

  getState() {
    return {
      bands: this.currentBands,
      bassStrength: this.bassStrength,
      reverbPreset: this.reverbPreset,
      virtualizerLevel: this.virtualizerLevel,
    };
  }
}

export default new EqualizerService();
