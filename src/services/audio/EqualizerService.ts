import TrackPlayer from 'react-native-track-player';

export interface EqualizerBand {
  frequency: number;
  gain: number; // -12 to +12 dB
  q?: number; // Quality factor, default 1.414
}

export const EQ_PRESETS = {
  flat: [
    { frequency: 32, gain: 0 },
    { frequency: 64, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 0 },
    { frequency: 4000, gain: 0 },
    { frequency: 8000, gain: 0 },
    { frequency: 16000, gain: 0 },
  ],
  rock: [
    { frequency: 32, gain: 3 },
    { frequency: 64, gain: 4 },
    { frequency: 125, gain: 3 },
    { frequency: 250, gain: 1 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 1 },
    { frequency: 2000, gain: 3 },
    { frequency: 4000, gain: 4 },
    { frequency: 8000, gain: 3 },
    { frequency: 16000, gain: 2 },
  ],
  jazz: [
    { frequency: 32, gain: 2 },
    { frequency: 64, gain: 2 },
    { frequency: 125, gain: 2 },
    { frequency: 250, gain: 1 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 1 },
    { frequency: 2000, gain: 2 },
    { frequency: 4000, gain: 3 },
    { frequency: 8000, gain: 3 },
    { frequency: 16000, gain: 2 },
  ],
  classical: [
    { frequency: 32, gain: 0 },
    { frequency: 64, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 2 },
    { frequency: 4000, gain: 3 },
    { frequency: 8000, gain: 4 },
    { frequency: 16000, gain: 4 },
  ],
  bassBooster: [
    { frequency: 32, gain: 6 },
    { frequency: 64, gain: 6 },
    { frequency: 125, gain: 4 },
    { frequency: 250, gain: 2 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: -1 },
    { frequency: 2000, gain: -2 },
    { frequency: 4000, gain: -2 },
    { frequency: 8000, gain: -2 },
    { frequency: 16000, gain: -2 },
  ],
};

class EqualizerService {
  private bands: EqualizerBand[] = EQ_PRESETS.flat;
  private isActive: boolean = false;

  async setBands(bands: EqualizerBand[]) {
    this.bands = bands;
    if (this.isActive) {
      await this.applyEQ();
    }
  }

  async setBand(index: number, gain: number) {
    if (index >= 0 && index < this.bands.length) {
      this.bands[index].gain = Math.max(-12, Math.min(12, gain));
      if (this.isActive) {
        await this.applyEQ();
      }
    }
  }

  async applyEQ() {
    // Catatan: react-native-track-player tidak memiliki API EQ bawaan
    // Kita perlu menggunakan native module atau library terpisah
    // Untuk MVP, kita simpan state dulu
    console.log('EQ applied:', this.bands);
  }

  async enable() {
    this.isActive = true;
    await this.applyEQ();
  }

  async disable() {
    this.isActive = false;
    // Matikan EQ
  }

  getBands() {
    return this.bands;
  }

  getPreset(name: keyof typeof EQ_PRESETS) {
    return EQ_PRESETS[name];
  }
}

export default new EqualizerService();