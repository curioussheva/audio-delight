import { NativeModules, Platform } from 'react-native';
import { DACInfo } from '../../types/dsp.types';

const { USBDACModule } = NativeModules;

class USBDACService {
  async detectDACs(): Promise<DACInfo[]> {
    if (Platform.OS === 'android') {
      try {
        const devices = await USBDACModule?.getUSBDevices() || [];
        return devices.filter((d: any) => d.deviceClass === 'AUDIO');
      } catch (error) {
        console.error('Failed to detect DACs:', error);
        return [];
      }
    }
    return [];
  }
  
  async setSampleRate(rate: number): Promise<boolean> {
    try {
      return await USBDACModule?.setAudioSession?.({
        sampleRate: rate,
        bufferSize: 256,
        bitDepth: 24
      }) || false;
    } catch (error) {
      console.error('Failed to set sample rate:', error);
      return false;
    }
  }
}

export default new USBDACService();