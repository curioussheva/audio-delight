import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Definisikan fungsi yang akan dipanggil dari JS ke C++
  startEngine(): void;
  stopEngine(): void;
  setVolume(volume: number): void;
}

export default TurboModuleRegistry.getEnforced<Spec>('PristineAudio');
