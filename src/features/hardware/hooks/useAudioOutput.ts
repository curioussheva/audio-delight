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
  type BluetoothA2dpStatusInfo,
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

// Per-node render (2026-11-22): syncStatus jalan tiap 3 detik dan
// memanggil setStatus/setCurrentDevice dengan objek BARU dari native
// walau nilainya sama — pemakai (Analyzer, Settings, dst.) render ulang
// tiap 3 detik tanpa alasan. Bandingkan dulu; referensi lama dipertahankan
// bila tidak ada yang berubah. Nilai yang berubah tetap diteruskan.
const sameDevice = (
  prev: AudioDeviceDescriptor | null,
  next: AudioDeviceDescriptor | null,
): boolean => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.type === next.type &&
    prev.sampleRate === next.sampleRate &&
    prev.exclusive === next.exclusive &&
    prev.isUsb === next.isUsb
  );
};

const sameStatus = (
  prev: ActiveDeviceStatus | null,
  next: ActiveDeviceStatus | null,
): boolean => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.requested === next.requested &&
    prev.actual === next.actual &&
    prev.honored === next.honored &&
    prev.pathLossy === next.pathLossy &&
    prev.rateHonored === next.rateHonored
  );
};

export const useAudioOutput = (): UseAudioOutputReturn => {
  const [devices, setDevices] = useState<AudioDeviceDescriptor[]>([]);
  const [currentDevice, setCurrentDevice] =
    useState<AudioDeviceDescriptor | null>(null);
  const [status, setStatus] = useState<ActiveDeviceStatus | null>(null);
  const [bluetoothCodec, setBluetoothCodec] = useState<BluetoothA2dpStatusInfo>({
    connected: false,
    deviceName: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cegah setState setelah unmount: refresh dipicu dari beberapa jalur.
  const mounted = useRef(true);

  // N19: guard in-flight untuk syncStatus — tick interval 3 dtk tidak
  // boleh jalan selagi sync sebelumnya belum selesai (dua bridge call +
  // kadang getBluetoothCodec); dua sync konkuren bisa menulis
  // currentDevice/bluetoothCodec dengan urutan terbalik. Pola yang sama
  // dengan J1-1/J1-4. Satu poller per instance layar tetap ada
  // (Settings + Analyzer + EQ mount bersamaan) — dedupe antar-instance
  // butuh poller bersama di level modul, dicatat sebagai tindak lanjut,
  // bukan di ronde ini.
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const syncStatus = useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const [nextStatus, nextDevice] = await Promise.all([
        AudioOutputService.getStatus(),
        AudioOutputService.getCurrentDevice(),
      ]);
      if (!mounted.current) return;
      setStatus((prev) => (sameStatus(prev, nextStatus) ? prev : nextStatus));
      setCurrentDevice((prev) =>
        sameDevice(prev, nextDevice) ? prev : nextDevice,
      );

      // Codec hanya relevan kalau perangkat aktifnya Bluetooth. Membacanya
      // memanggil BluetoothA2dp lewat profile proxy, dan itu tidak gratis -
      // tidak ada alasan menempuhnya saat output ke speaker atau DAC.
      if (nextDevice?.type === "bluetooth") {
        const codec = await AudioOutputService.getBluetoothCodec();
        if (mounted.current) setBluetoothCodec(codec);
      } else if (mounted.current) {
        setBluetoothCodec((prev) =>
          prev.connected
            ? {
                connected: false,
                deviceName: "",
                address: "",
              }
            : prev,
        );
      }
    } finally {
      syncInFlightRef.current = false;
    }
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

    // F4: daftar perangkat disegarkan saat native mengabarkan perubahan
    // (DAC dicolok/dicabut) — sebelumnya `devices` hanya dibaca sekali
    // saat mount dan basi sampai refresh manual.
    const unsubscribeDeviceChanges =
      AudioOutputService.subscribeDeviceChanges(() => {
        refresh();
      });

    // Device bisa dicolok/dicabut saat app berjalan. Statusnya dipoll pelan
    // karena endpoint-nya murah (baca state native, tanpa JNI ke AudioManager)
    // dan pemilihan perangkat dari luar app (mis. Android memindahkan rute)
    // tidak mengirim event apa pun ke kita.
    const interval = setInterval(syncStatus, 3000);
    return () => {
      unsubscribeDeviceChanges();
      clearInterval(interval);
    };
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
    bluetoothCodec,
    loading,
    error,
    refresh,
    selectDevice,
    clearSelection,
  };
};

export default useAudioOutput;
