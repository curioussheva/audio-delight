import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  scanMediaStore(): Promise<object[]>;
  getAlbumArt(albumId: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MediaStoreModule');
