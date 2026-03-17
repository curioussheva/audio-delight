import { NativeModules } from 'react-native';
import { EqualizerBand } from '@/types/dsp.types';

// Definisi interface agar TS tidak komplain
interface NativeDSPInterface {
  toggleExclusiveMode(enabled: boolean): Promise<boolean>;
  setEqualizer(bands: EqualizerBand[]): Promise<void>;
  getHardwareSampleRate(): Promise<number>;
  // Tambahkan ini agar sinkron dengan Kotlin:
  setBassBoost(strength: number, audioSessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, audioSessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;
}


// Ambil dari NativeModules
const { NativeDSPModule } = NativeModules;

export default NativeDSPModule as NativeDSPInterface;
