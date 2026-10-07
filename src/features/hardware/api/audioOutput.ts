// src/features/hardware/api/audioOutput.ts
//
// Jalur output audio: daftar perangkat, pemilihan, dan status jujur tentang
// apa yang benar-benar dipakai.
//
// Sebelumnya UI memakai USBDACModule, yang menyaring HANYA perangkat USB
// (`if (isUsbDevice(device))`) sehingga speaker internal, jack, Bluetooth, dan
// HDMI tidak pernah muncul. Modulnya juga tidak punya JNI sama sekali:
// setSampleRate()/setExclusiveMode() hanya mengembalikan success:true.
//
// NativeDeviceModule dipakai di sini karena ia membaca SELURUH perangkat
// output dan pemilihannya benar-benar diteruskan ke engine
// (nativeSetActiveDevice -> EngineManager::setRequestedDeviceId -> stream
// dibuka ulang di perangkat itu). Lihat docs/AUDIO_OUTPUT_PATHS.md.

import NativeDeviceModule from "@/specs/NativeDeviceModule";
import type {
  ActiveDeviceStatus,
  AudioDeviceDescriptor,
  BluetoothCodecInfo,
} from "@/specs/NativeDeviceModule";

export type { ActiveDeviceStatus, AudioDeviceDescriptor, BluetoothCodecInfo };

/**
 * Jalur output secara arsitektur.
 *
 * - `direct`      : perangkat punya jalur langsung; bit-perfect MUNGKIN
 *                   (USB DAC, HDMI) - tergantung apakah stream berhasil
 *                   dibuka exclusive.
 * - `audioflinger`: perangkat selalu lewat mixer sistem; bit-perfect TIDAK
 *                   MUNGKIN (speaker internal, jack headset, Bluetooth).
 *
 * Pembedaan ini penting supaya "exclusive ditolak" pada speaker tidak
 * dilaporkan sebagai kegagalan, dan tidak ikut menutupi kegagalan nyata pada
 * DAC.
 */
export type OutputPathKind = "direct" | "audioflinger" | "unknown";

export const pathKindOf = (
  device: AudioDeviceDescriptor | null | undefined,
): OutputPathKind => {
  if (!device) return "unknown";
  if (device.type === "usb" || device.type === "hdmi") return "direct";
  if (device.type === "unknown") return "unknown";
  return "audioflinger";
};

/**
 * Apakah perangkat ini mungkin bit-perfect.
 *
 * `null` = belum tahu (belum ada info perangkat) - jangan mengklaim apa pun.
 */
export const canBeBitPerfect = (
  device: AudioDeviceDescriptor | null | undefined,
): boolean | null => {
  const kind = pathKindOf(device);
  if (kind === "unknown") return null;
  return kind === "direct";
};

export const AudioOutputService = {
  /** Semua perangkat output yang terdeteksi Android, bukan hanya USB. */
  listDevices: async (): Promise<AudioDeviceDescriptor[]> => {
    try {
      return (await NativeDeviceModule.getDevices()) ?? [];
    } catch (e) {
      console.warn("[AudioOutput] listDevices gagal:", e);
      return [];
    }
  },

  /**
   * Pilih perangkat output.
   *
   * Mengembalikan false kalau id tidak ada di daftar perangkat - native
   * memvalidasi dan menolak, bukan mengembalikan true-but-blind.
   *
   * Efek samping di native: kalau stream sedang berjalan, ia ditutup dan
   * dibuka ulang di perangkat ini dengan laju yang dihitung dari kapabilitas
   * perangkat BARU (bukan perangkat lama).
   */
  selectDevice: async (deviceId: string): Promise<boolean> => {
    try {
      return (await NativeDeviceModule.setActiveDevice(deviceId)) === true;
    } catch (e) {
      console.warn("[AudioOutput] selectDevice gagal:", e);
      return false;
    }
  },

  /** Lepas preferensi perangkat; Android yang memilih. */
  clearSelection: async (): Promise<boolean> => {
    try {
      return (await NativeDeviceModule.setActiveDevice("")) === true;
    } catch (e) {
      console.warn("[AudioOutput] clearSelection gagal:", e);
      return false;
    }
  },

  /** Status jujur: diminta vs dipakai vs sanggup-tidaknya jalur. */
  getStatus: async (): Promise<ActiveDeviceStatus | null> => {
    try {
      return await NativeDeviceModule.getActiveDeviceStatus();
    } catch (e) {
      console.warn("[AudioOutput] getStatus gagal:", e);
      return null;
    }
  },

  /**
   * Perangkat yang SEDANG mengeluarkan suara.
   *
   * Ini yang boleh ditampilkan namanya di UI. Kalau pilihan DAC tidak
   * dihormati, di sini yang muncul speaker internal.
   */
  getCurrentDevice: async (): Promise<AudioDeviceDescriptor | null> => {
    try {
      return await NativeDeviceModule.getCurrentOutputDevice();
    } catch (e) {
      console.warn("[AudioOutput] getCurrentDevice gagal:", e);
      return null;
    }
  },

  /**
   * Status jalur A2DP.
   *
   * A2DP selalu lossy, jadi ini bukan alat untuk mengklaim bit-perfect -
   * justru sebaliknya: menjelaskan mengapa jalur Bluetooth tidak bisa.
   *
   * `activeCodec` selalu kosong: getCodecStatus() bukan API publik. Yang bisa
   * ditampilkan hanya daftar codec yang DIDUKUNG, bukan yang sedang dipakai.
   */
  getBluetoothCodec: async (): Promise<BluetoothCodecInfo> => {
    try {
      return await NativeDeviceModule.getBluetoothCodec();
    } catch (e) {
      console.warn("[AudioOutput] getBluetoothCodec gagal:", e);
      return {
        available: false,
        deviceName: "",
        supportedCodecs: [],
        activeCodec: "",
        lossless: false,
      };
    }
  },
};

export default AudioOutputService;
