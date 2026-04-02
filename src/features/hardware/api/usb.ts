import { NativeModules, Platform, DeviceEventEmitter } from "react-native";
import { DACInfo, DACCapabilities } from "@/shared/types/dac";

// Ambil module native
const { USBDACModule } = NativeModules;

class USBDACService {
  private currentDAC: DACInfo | null = null;
  private isExclusiveMode = false;
  private listeners: ((dac: DACInfo | null) => void)[] = [];

  constructor() {
    this.initNativeListeners();
  }

  private initNativeListeners() {
    if (Platform.OS === "android") {
      // PERBAIKAN: Nama event harus sama dengan emit di Kotlin ("onDACChange")
      DeviceEventEmitter.addListener("onDACChange", async (event) => {
        console.log(`[USBDAC] Hardware event: ${event.status}`);
        await this.refreshDACStatus();
      });
    }
  }

  private async refreshDACStatus() {
    const dacs = await this.detectDACs();
    this.currentDAC = dacs.length > 0 ? dacs[0] : null;
    this.notifyListeners();
  }

  async detectDACs(): Promise<DACInfo[]> {
    if (Platform.OS !== "android" || !USBDACModule) return [];

    try {
      // PERBAIKAN: Gunakan 'detectDACs' sesuai nama di USBDACModule.kt
      const devices = (await USBDACModule.detectDACs()) || [];

      return devices.map((d: any) => ({
        id: d.id.toString(),
        name: d.name || "Unknown DAC",
        manufacturer: "USB Audio Device", // Data dari AudioDeviceInfo
        capabilities: this.parseCapabilities(d),
        sampleRates: d.sampleRates || [44100, 48000],
        bitDepths: [16, 24], // Default untuk Android AudioDevice API
        isNativeDSDSupported: d.supportsHiRes || false,
      }));
    } catch (error) {
      console.error("[USBDAC] Detection failed:", error);
      return [];
    }
  }

  private parseCapabilities(device: any): DACCapabilities {
    const sr = device.sampleRates || [];
    return {
      dsdDoP: false, // Perlu library native tambahan untuk DoP
      dsdNative: device.supportsHiRes,
      mqaRenderer: false,
      dsd64: sr.includes(2822400),
      dsd128: sr.includes(5644800),
      dsd256: sr.includes(11289600),
      dsd512: sr.includes(22579200),
      pcm192: sr.some((r: number) => r >= 192000),
      pcm384: sr.some((r: number) => r >= 384000),
      pcm768: sr.some((r: number) => r >= 768000),
    };
  }

  // --- DSP & Effects Bridge ---

  async updateEqualizer(gains: number[], sessionId: number): Promise<void> {
    if (USBDACModule?.setEqualizerGains) {
      await USBDACModule.setEqualizerGains(gains, sessionId);
    }
  }

  async updateBassBoost(strength: number, sessionId: number): Promise<void> {
    if (USBDACModule?.setBassBoost) {
      await USBDACModule.setBassBoost(strength, sessionId);
    }
  }

  async updateVirtualizer(strength: number, sessionId: number): Promise<void> {
    if (USBDACModule?.setVirtualizer) {
      await USBDACModule.setVirtualizer(strength, sessionId);
    }
  }

  // --- Getters & Listeners ---
  getCurrentDAC = () => this.currentDAC;
  isExclusiveActive = () => this.isExclusiveMode;

  addListener(callback: (dac: DACInfo | null) => void) {
    this.listeners.push(callback);
    callback(this.currentDAC);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.currentDAC));
  }
}

export default new USBDACService();
