// src/services/audio/DSPPipeline.ts
import { NativeModules } from 'react-native';
import { EqualizerBand } from '../../types/dsp.types';

const { USBDACModule } = NativeModules;

export class DSPPipeline {
  /**
   * Mengirim parameter EQ ke Android Native.
   * Di sisi Native, kita akan menggunakan android.media.audiofx.Equalizer
   */
  static async updateEqualizer(bands: EqualizerBand[]) {
    if (!USBDACModule) return;

    try {
      // Kita kirim array gain saja, karena frekuensi biasanya tetap (fixed bands)
      const gains = bands.map(b => b.gain);
      await USBDACModule.setEqualizerGains(gains);
    } catch (e) {
      console.error("DSP Error:", e);
    }
  }

  static async setEnabled(enabled: boolean) {
    if (USBDACModule) {
      await USBDACModule.toggleEqualizer(enabled);
    }
  }
}
