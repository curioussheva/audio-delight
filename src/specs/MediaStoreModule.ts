import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  queryAudioFiles(): Promise<object[]>;
  getAlbumArtUri(albumId: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MediaStoreModule');