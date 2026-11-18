import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  getFFTData(): Promise<number[]>;
  // F6: addListener/removeListeners DIHAPUS — native TIDAK mengirim event
  // apa pun (polling-only via getFFTData, lihat komentar di wrapper).
  // Sebelumnya spec mendeklarasikannya padahal Kotlin tidak punya: kontrak
  // fiktif yang mengundang NativeEventEmitter yang menunggu event yang
  // tidak pernah datang. Dipilih hapus dari spec (bukan tambah method
  // kosong di Kotlin) supaya tidak ada stub event yang tampak tersedia.
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeVisualizerBridge');
