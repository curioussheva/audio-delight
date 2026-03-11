import { NativeModules, Platform } from 'react-native';
import { DACInfo, DACCapabilities, AudioOutputMode } from '@/types/dac.types';

const { USBDACModule } = NativeModules;

class USBDACService {
  private currentDAC: DACInfo | null = null;
  private isExclusiveMode = false;
  private listeners: ((dac: DACInfo | null) => void)[] = [];

  async detectDACs(): Promise<DACInfo[]> {
    if (Platform.OS !== 'android') return [];
    
    try {
      const devices = await USBDACModule?.getUSBDevices() || [];
      const dacs = devices.filter((d: any) => 
        d.deviceClass === 'AUDIO' && 
        d.productName?.toLowerCase().includes('dac')
      );
      
      return dacs.map((d: any) => ({
        id: d.deviceId,
        name: d.productName || 'Unknown DAC',
        manufacturer: d.manufacturerName || 'Unknown',
        capabilities: this.detectCapabilities(d),
        sampleRates: this.getSupportedSampleRates(d),
        bitDepths: [16, 24, 32],
        isNativeDSDSupported: d.features?.includes('DSD_NATIVE'),
      }));
    } catch (error) {
      console.error('Failed to detect DACs:', error);
      return [];
    }
  }

  private detectCapabilities(device: any): DACCapabilities {
    return {
      dsdDoP: device.features?.includes('DSD_DOP') || false,
      dsdNative: device.features?.includes('DSD_NATIVE') || false,
      mqaRenderer: device.features?.includes('MQA_RENDERER') || false,
      dsd64: device.features?.includes('DSD64') || false,
      dsd128: device.features?.includes('DSD128') || false,
      dsd256: device.features?.includes('DSD256') || false,
      dsd512: device.features?.includes('DSD512') || false,
      pcm192: device.features?.includes('PCM192') || false,
      pcm384: device.features?.includes('PCM384') || false,
      pcm768: device.features?.includes('PCM768') || false,
    };
  }

  private getSupportedSampleRates(device: any): number[] {
    const rates = [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000, 705600, 768000];
    return rates.filter(r => device.sampleRates?.includes(r));
  }

  async setExclusiveMode(enable: boolean, dacId?: string): Promise<boolean> {
    try {
      if (enable && dacId) {
        // Aktifkan exclusive mode untuk DAC tertentu
        const result = await USBDACModule?.setExclusiveMode(dacId, {
          sampleRate: 'auto', // Auto follow source
          bitDepth: 24,
          bufferSize: 256, // Low latency untuk audiophile
          dsdMode: 'native', // 'native' atau 'dop'
        });
        
        if (result) {
          this.isExclusiveMode = true;
          this.currentDAC = (await this.detectDACs()).find(d => d.id === dacId) || null;
          this.notifyListeners();
        }
        return result || false;
      } else {
        // Matikan exclusive mode
        await USBDACModule?.releaseExclusiveMode();
        this.isExclusiveMode = false;
        this.currentDAC = null;
        this.notifyListeners();
        return true;
      }
    } catch (error) {
      console.error('Failed to set exclusive mode:', error);
      return false;
    }
  }

  getCurrentDAC(): DACInfo | null {
    return this.currentDAC;
  }

  isExclusiveModeActive(): boolean {
    return this.isExclusiveMode;
  }

  addListener(callback: (dac: DACInfo | null) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentDAC));
  }
}

export default new USBDACService();