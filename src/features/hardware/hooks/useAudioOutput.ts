// src/features/hardware/hooks/useAudioOutput.ts
//
// Hook jalur output audio: daftar perangkat, perangkat aktif, pemilihan, dan
// status jujur bit-perfect per jalur.
//
// Pengganti useUSBDAC untuk pemilihan perangkat. useUSBDAC hanya melihat
// perangkat USB, sehingga pemilihan speaker/jack/Bluetooth/HDMI mustahil dan
// jalur yang benar-benar dipakai tidak pernah terlihat.
// Lihat docs/AUDIO_OUTPUT_PATHS.md.

import { useCallback, useEffect, useRef, useState } from "react";
import AudioOutputService, {
  canBeBitPerfect,
  pathKindOf,
  type ActiveDeviceStatus,
  type AudioDeviceDescriptor,
  type OutputPathKind,
} from "../api/audioOutput";

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
  const [devices, setDevices] = useState<AudioDeviceDescriptor[]>([]);
  const [currentDevice, setCurrentDevice] =
    useState<AudioDeviceDescriptor | null>(null);
  const [status, setStatus] = useState<ActiveDeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cegah setState setelah unmount: refresh dipicu dari beberapa jalur.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const syncStatus = useCallback(async () => {
    const [nextStatus, nextDevice] = await Promise.all([
      AudioOutputService.getStatus(),
      AudioOutputService.getCurrentDevice(),
    ]);
    if (!mounted.current) return;
    setStatus(nextStatus);
    setCurrentDevice(nextDevice);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await AudioOutputService.listDevices();
      if (!mounted.current) return;
      setDevices(list);
      await syncStatus();
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Gagal membaca perangkat");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [syncStatus]);

  const selectDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        // native menutup & membuka ulang stream di perangkat ini, lalu
        // menghitung laju dari kapabilitas perangkat BARU. Jadi status harus
        // dibaca ulang setelah panggilan selesai, bukan sebelum.
        const ok = await AudioOutputService.selectDevice(deviceId);
        if (!mounted.current) return ok;

        if (!ok) {
          setError(`Perangkat ${deviceId} tidak ada di daftar`);
          return false;
        }

        await syncStatus();
        return true;
      } catch (e) {
        if (mounted.current) {
          setError(e instanceof Error ? e.message : "Gagal memilih perangkat");
        }
        return false;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [syncStatus],
  );

  const clearSelection = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const ok = await AudioOutputService.clearSelection();
      if (!mounted.current) return ok;
      await syncStatus();
      return ok;
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Gagal melepas pilihan");
      }
      return false;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [syncStatus]);

  useEffect(() => {
    refresh();

    // Device bisa dicolok/dicabut saat app berjalan. Statusnya dipoll pelan
    // karena endpoint-nya murah (baca state native, tanpa JNI ke AudioManager)
    // dan pemilihan perangkat dari luar app (mis. Android memindahkan rute)
    // tidak mengirim event apa pun ke kita.
    const interval = setInterval(syncStatus, 3000);
    return () => clearInterval(interval);
    // refresh stabil (useCallback tanpa dependensi yang berubah).
  }, [refresh, syncStatus]);

  const pathKind = pathKindOf(currentDevice);

  return {
    devices,
    currentDevice,
    status,
    pathKind,
    pathLossy: status?.pathLossy ?? pathKind === "audioflinger",
    canBeBitPerfect: canBeBitPerfect(currentDevice),
    loading,
    error,
    refresh,
    selectDevice,
    clearSelection,
  };
};

export default useAudioOutput;
