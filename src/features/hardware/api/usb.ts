import { NativeModules, Platform, DeviceEventEmitter } from "react-native";
import { DACInfo, DACCapabilities } from "@/shared/types/dac";

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
      // Listener otomatis dari sisi Kotlin (USB_DEVICE_ATTACHED / DETACHED)
      DeviceEventEmitter.addListener("onUSBDeviceStateChanged", async () => {
        console.log("[USBDAC] USB State change detected, re-scanning...");
        await this.refreshDACStatus();
      });
    }
  }

  private async refreshDACStatus() {
    const dacs = await this.detectDACs();
    this.currentDAC = dacs.length > 0 ? dacs[0] : null; // Ambil DAC pertama jika ada
    this.notifyListeners();
  }

  async detectDACs(): Promise<DACInfo[]> {
    if (Platform.OS !== "android" || !USBDACModule) return [];

    try {
      const devices = (await USBDACModule.getUSBDevices()) || [];

      // Filter perangkat audio (Class 1 atau 2)
      return devices
        .filter(
          (d: any) => d.deviceClass === "AUDIO" || d.hasAudioOutput === true,
        )
        .map((d: any) => ({
          id: d.deviceId,
          name: d.productName || "Unknown DAC",
          manufacturer: d.manufacturerName || "Unknown",
          capabilities: this.parseCapabilities(d),
          sampleRates: d.sampleRates || [44100, 48000],
          bitDepths: d.bitDepths || [16, 24],
          isNativeDSDSupported: d.features?.includes("DSD_NATIVE") || false,
        }));
    } catch (error) {
      console.error("[USBDAC] Detection failed:", error);
      return [];
    }
  }

  private parseCapabilities(device: any): DACCapabilities {
    const f = device.features || [];
    return {
      dsdDoP: f.includes("DSD_DOP"),
      dsdNative: f.includes("DSD_NATIVE"),
      mqaRenderer: f.includes("MQA_RENDERER"),
      dsd64: f.includes("DSD64"),
      dsd128: f.includes("DSD128"),
      dsd256: f.includes("DSD256"),
      dsd512: f.includes("DSD512"), // Tambahkan baris ini!
      pcm192: f.includes("PCM192") || device.sampleRates?.includes(192000),
      pcm384: f.includes("PCM384") || device.sampleRates?.includes(384000),
      pcm768: f.includes("PCM768") || device.sampleRates?.includes(768000),
    };
  }

  async setExclusiveMode(enable: boolean, dacId?: string): Promise<boolean> {
    if (!USBDACModule) return false;
    try {
      if (enable && (dacId || this.currentDAC?.id)) {
        const targetId = dacId || this.currentDAC?.id;
        const result = await USBDACModule.setExclusiveMode(targetId, {
          sampleRate: "auto",
          bitDepth: 24,
          bufferSize: 256,
          dsdMode: "native",
        });

        this.isExclusiveMode = result;
        return result;
      } else {
        await USBDACModule.releaseExclusiveMode();
        this.isExclusiveMode = false;
        return true;
      }
    } catch (error) {
      console.error("[USBDAC] Exclusive mode toggle failed:", error);
      return false;
    } finally {
      this.notifyListeners();
    }
  }

  // Getters
  getCurrentDAC = () => this.currentDAC;
  isExclusiveActive = () => this.isExclusiveMode;

  // Listener pattern untuk React Hooks
  addListener(callback: (dac: DACInfo | null) => void) {
    this.listeners.push(callback);
    // Trigger langsung saat subscribe untuk sync awal
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
