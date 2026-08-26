import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getDevices(): Promise<object[]>;
  setActiveDevice(deviceId: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceModule');