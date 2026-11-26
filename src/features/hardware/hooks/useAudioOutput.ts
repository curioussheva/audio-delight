// src/features/hardware/hooks/useAudioOutput.ts
//
// Hook jalur output audio: daftar perangkat, perangkat aktif, pemilihan, dan
// status jujur bit-perfect per jalur.
//
// POLL-1: hook ini kini selector tipis di atas audioOutputStore — SATU
// poller 3 detik + SATU langganan PristineDeviceChange bersama untuk
// seluruh app (ref-count: mulai saat subscriber pertama, berhenti saat
// subscriber terakhir pergi). Dulu tiap instance hook punya interval +
// subscription sendiri (sampai 8 simultan: DSP 8, immersive 6,
// bit-perfect 6). Return type TIDAK berubah — semua pemakai (Analyzer,
// Settings, BitPerfectSubscreen, useHeadphoneCorrection, useHrtfGate,
// useOutputProfiles) tidak disentuh.
//
// Pengganti useUSBDAC untuk pemilihan perangkat. useUSBDAC hanya melihat
// perangkat USB, sehingga pemilihan speaker/jack/Bluetooth/HDMI mustahil dan
// jalur yang benar-benar dipakai tidak pernah terlihat.
// Lihat docs/AUDIO_OUTPUT_PATHS.md.

import { useEffect } from "react";
import {
  canBeBitPerfect,
  pathKindOf,
  type ActiveDeviceStatus,
  type AudioDeviceDescriptor,
  type BluetoothA2dpStatusInfo,
  type OutputPathKind,
} from "../api/audioOutput";
import { useAudioOutputStore } from "../store/audioOutputStore";

export interface UseAudioOutputReturn {
  /** Semua perangkat output yang terdeteksi Android. */
  devices: AudioDeviceDescriptor[];
  /** Perangkat yang SEDANG mengeluarkan suara (bukan yang diminta). */
  currentDevice: AudioDeviceDescriptor | null;
  /** Status jujur dari native: diminta vs dipakai. */
  status: ActiveDeviceStatus | null;
  /** Jalur perangkat aktif: "direct" | "audioflinger" | "unknown". */
  pathKind: OutputPathKind;
  /** true kalau jalur aktif secara arsitektur mustahil bit-perfect. */
  pathLossy: boolean;
  /** true kalau perangkat aktif mungkin bit-perfect (null = belum tahu). */
  canBeBitPerfect: boolean | null;
  /**
   * Codec A2DP aktif. `available: false` kalau perangkat aktif bukan
   * Bluetooth, atau codecnya tidak bisa dibaca.
   */
  bluetoothCodec: BluetoothA2dpStatusInfo;
  loading: boolean;
  error: string | null;
  /** Baca ulang daftar perangkat dari Android. */
  refresh: () => Promise<void>;
  /** Pilih perangkat. false = id tidak dikenal. */
  selectDevice: (deviceId: string) => Promise<boolean>;
  /** Lepas preferensi; Android yang memilih. */
  clearSelection: () => Promise<boolean>;
}

export const useAudioOutput = (): UseAudioOutputReturn => {
  const devices = useAudioOutputStore((s) => s.devices);
  const currentDevice = useAudioOutputStore((s) => s.currentDevice);
  const status = useAudioOutputStore((s) => s.status);
  const bluetoothCodec = useAudioOutputStore((s) => s.bluetoothCodec);
  const loading = useAudioOutputStore((s) => s.loading);
  const error = useAudioOutputStore((s) => s.error);
  const refresh = useAudioOutputStore((s) => s.refresh);
  const selectDevice = useAudioOutputStore((s) => s.selectDevice);
  const clearSelection = useAudioOutputStore((s) => s.clearSelection);

  // POLL-1: satu subscriber = satu hitung ref-count di store. Unmount
  // melepas hitungan; interval + langganan event berhenti saat hitungan
  // kembali 0.
  useEffect(() => useAudioOutputStore.getState().subscribe(), []);

  const pathKind = pathKindOf(currentDevice);

  return {
    devices,
    currentDevice,
    status,
    pathKind,
    pathLossy: status?.pathLossy ?? pathKind === "audioflinger",
    canBeBitPerfect: canBeBitPerfect(currentDevice),
    bluetoothCodec,
    loading,
    error,
    refresh,
    selectDevice,
    clearSelection,
  };
};

export default useAudioOutput;
