import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Satu perangkat output audio.
 *
 * `exclusive` = perangkat punya jalur langsung ke perangkat keras (lewati
 * mixer AudioFlinger). Hanya USB dan HDMI. Speaker internal dan jack headset
 * SELALU lewat mixer - jadi `exclusive: false` di situ bukan kegagalan,
 * melainkan batas jalurnya.
 */
export interface AudioDeviceDescriptor {
  id: string;
  name: string;
  /** "usb" | "speaker" | "headset" | "bluetooth" | "hdmi" | "earpiece" | "unknown" */
  type: string;
  /** Laju maksimum yang didukung perangkat (Hz). */
  sampleRate: number;
  /** true kalau perangkat bisa punya jalur langsung (USB/HDMI). */
  exclusive: boolean;
  isUsb: boolean;
}

/**
 * Status perangkat yang BENAR-BENAR dipakai stream.
 *
 * `requested` vs `actual` inilah yang membedakan "sedang memakai DAC" dari
 * "mengira memakai DAC": Android boleh mengabaikan permintaan perangkat.
 */
export interface ActiveDeviceStatus {
  /** Id yang diminta. 0 = tidak ada preferensi. */
  requested: number;
  /** Id yang benar-benar dipakai stream. 0 = dipilih sistem. */
  actual: number;
  /** true kalau permintaan perangkat dihormati. */
  honored: boolean;
  /**
   * true kalau jalur ini memang TIDAK BISA bit-perfect (speaker internal,
   * jack, Bluetooth, atau OpenSLES) - apa pun yang diminta user.
   *
   * Bedakan dari `honored`: yang itu soal apakah perangkat yang dipilih
   * benar-benar dipakai, yang ini soal apakah jalurnya sanggup.
   */
  pathLossy: boolean;
  /** true kalau laju stream sama dengan laju file (tidak ada konversi). */
  rateHonored: boolean;
}

/**
 * Status jalur A2DP.
 *
 * A2DP **selalu lossy** (SBC/aptX/LDAC semuanya lossy). Sampel masuk ke encoder
 * sebelum dikirim, jadi bit-perfect mustahil lewat Bluetooth.
 *
 * Codec TIDAK bisa dibaca dari app biasa:
 *  - `getCodecStatus()` (codec aktif) bukan API publik
 *  - `getSupportedCodecTypes()` butuh izin signature-level BLUETOOTH_PRIVILEGED
 *
 * Yang tersisa hanyalah: terhubung atau tidak, dan ke perangkat apa.
 */
export interface BluetoothA2dpStatusInfo {
  /** true kalau ada perangkat A2DP terhubung. */
  connected: boolean;
  /** Nama perangkat A2DP. "" kalau tidak ada / tidak terbaca. */
  deviceName: string;
  /** Alamat perangkat (MAC). "" kalau tidak terbaca. */
  address: string;
}

export interface Spec extends TurboModule {
  getDevices(): Promise<AudioDeviceDescriptor[]>;
  setActiveDevice(deviceId: string): Promise<boolean>;
  getActiveDeviceStatus(): Promise<ActiveDeviceStatus>;
  /**
   * Perangkat yang SEDANG mengeluarkan suara. null kalau stream memilih
   * sendiri atau belum dibuka.
   */
  getCurrentOutputDevice(): Promise<AudioDeviceDescriptor | null>;
  /**
   * Status jalur A2DP: terhubung atau tidak, ke perangkat apa.
   *
   * Codec tidak bisa dibaca dari app biasa - jangan dikarang.
   */
  getBluetoothCodec(): Promise<BluetoothA2dpStatusInfo>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceModule');
