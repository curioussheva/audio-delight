// src/features/hardware/store/audioOutputStore.ts
//
// POLL-1: SATU poller output audio ber-ref-count untuk seluruh app.
//
// Dulu tiap pemakaian useAudioOutput() (6 ekspresi, sampai 8 instance
// simultan — DSP 8, immersive 6, bit-perfect 6) punya interval 3 detik
// sendiri + subscribe PristineDeviceChange sendiri: ~5,3 panggilan
// bridge/detik (8/detik saat Bluetooth aktif) + spike ~24 call tiap
// colok/cabut. Sekarang satu interval + satu subscription, dimulai saat
// subscriber pertama (subscribe()) dan berhenti saat subscriber terakhir
// pergi (unsubscribe yang dikembalikan).
//
// Poll tetap ada sebagai jaring pengaman, bukan hanya event: rute yang
// dipindah Android dari luar app tidak mengirim event apa pun (lihat
// komentar di useAudioOutput lama). Refresh digerakkan event
// PristineDeviceChange (native meng-emit dari AudioDeviceCallback saat
// colok/cabut) + poll 3 detik.
//
// Guard per-node render pindah ke sini dari hook (2026-11-22): syncStatus
// memanggil setStatus/setCurrentDevice/setBluetoothCodec dengan objek
// BARU dari native walau nilainya sama — bandingkan dulu, referensi lama
// dipertahankan bila tidak berubah, supaya pemakai tidak render ulang
// tiap 3 detik tanpa alasan.

import { create } from "zustand";
import AudioOutputService, {
  type ActiveDeviceStatus,
  type AudioDeviceDescriptor,
  type BluetoothA2dpStatusInfo,
} from "../api/audioOutput";

export interface AudioOutputStoreState {
  /** Semua perangkat output yang terdeteksi Android. */
  devices: AudioDeviceDescriptor[];
  /** Perangkat yang SEDANG mengeluarkan suara (bukan yang diminta). */
  currentDevice: AudioDeviceDescriptor | null;
  /** Status jujur dari native: diminta vs dipakai. */
  status: ActiveDeviceStatus | null;
  /** Codec A2DP aktif. `connected: false` bila bukan Bluetooth. */
  bluetoothCodec: BluetoothA2dpStatusInfo;
  loading: boolean;
  error: string | null;
  /** Baca ulang status + perangkat aktif (2 call, in-flight di-gate). */
  syncStatus: () => Promise<void>;
  /** Baca ulang daftar perangkat dari Android + syncStatus. */
  refresh: () => Promise<void>;
  /** Pilih perangkat. false = id tidak dikenal. */
  selectDevice: (deviceId: string) => Promise<boolean>;
  /** Lepas preferensi; Android yang memilih. */
  clearSelection: () => Promise<boolean>;
  /**
   * Naikkan ref-count subscriber; mulai poller + langganan event saat
   * 0→1. Mengembalikan pelepas — panggil saat unmount; saat hitungan
   * kembali 0, interval + langganan event dilepas.
   */
  subscribe: () => () => void;
}

// Per-node render (2026-11-22): bandingkan dulu; referensi lama
// dipertahankan bila tidak ada yang berubah.
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

// Cabang non-Bluetooth sudah terjaga (kembalikan prev bila tidak
// connected); cabang Bluetooth ini yang dulu bocor tanpa guard.
const sameBluetoothCodec = (
  prev: BluetoothA2dpStatusInfo,
  next: BluetoothA2dpStatusInfo,
): boolean =>
  prev.connected === next.connected &&
  prev.deviceName === next.deviceName &&
  prev.address === next.address;

export const useAudioOutputStore = create<AudioOutputStoreState>()(
  (set, get) => {
    // N19: guard in-flight untuk syncStatus — tick interval 3 dtk tidak
    // boleh jalan selagi sync sebelumnya belum selesai (dua bridge call +
    // kadang getBluetoothCodec); dua sync konkuren bisa menulis
    // currentDevice/bluetoothCodec dengan urutan terbalik. Dulu
    // per-instance (useRef di hook); kini sekali di level modul.
    let syncInFlight = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let unsubscribeDeviceChanges: (() => void) | null = null;
    let subscriberCount = 0;

    const syncStatus = async (): Promise<void> => {
      if (syncInFlight) return;
      syncInFlight = true;
      try {
        const [nextStatus, nextDevice] = await Promise.all([
          AudioOutputService.getStatus(),
          AudioOutputService.getCurrentDevice(),
        ]);
        set((prev) => ({
          status: sameStatus(prev.status, nextStatus) ? prev.status : nextStatus,
          currentDevice: sameDevice(prev.currentDevice, nextDevice) ? prev.currentDevice : nextDevice,
        }));

        // Codec hanya relevan kalau perangkat aktifnya Bluetooth.
        // Membacanya memanggil BluetoothA2dp lewat profile proxy, dan
        // itu tidak gratis - tidak ada alasan menempuhnya saat output
        // ke speaker atau DAC.
        if (nextDevice?.type === "bluetooth") {
          const codec = await AudioOutputService.getBluetoothCodec();
          set((prev) => ({
            bluetoothCodec: sameBluetoothCodec(prev.bluetoothCodec, codec) ? prev.bluetoothCodec : codec,
          }));
        } else {
          set((prev) =>
            prev.bluetoothCodec.connected
              ? {
                  bluetoothCodec: {
                    connected: false,
                    deviceName: "",
                    address: "",
                  },
                }
              : prev,
          );
        }
      } finally {
        syncInFlight = false;
      }
    };

    const refresh = async (): Promise<void> => {
      set({ loading: true, error: null });
      try {
        const list = await AudioOutputService.listDevices();
        set({ devices: list });
        await syncStatus();
      } catch (e) {
        set({
          error:
            e instanceof Error ? e.message : "Gagal membaca perangkat",
        });
      } finally {
        set({ loading: false });
      }
    };

    const selectDevice = async (deviceId: string): Promise<boolean> => {
      set({ loading: true, error: null });
      try {
        // native menutup & membuka ulang stream di perangkat ini, lalu
        // menghitung laju dari kapabilitas perangkat BARU. Jadi status
        // harus dibaca ulang setelah panggilan selesai, bukan sebelum.
        const ok = await AudioOutputService.selectDevice(deviceId);
        if (!ok) {
          set({ error: `Perangkat ${deviceId} tidak ada di daftar` });
          return false;
        }

        await syncStatus();
        return true;
      } catch (e) {
        set({
          error:
            e instanceof Error ? e.message : "Gagal memilih perangkat",
        });
        return false;
      } finally {
        set({ loading: false });
      }
    };

    const clearSelection = async (): Promise<boolean> => {
      set({ loading: true, error: null });
      try {
        const ok = await AudioOutputService.clearSelection();
        await syncStatus();
        return ok;
      } catch (e) {
        set({
          error:
            e instanceof Error ? e.message : "Gagal melepas pilihan",
        });
        return false;
      } finally {
        set({ loading: false });
      }
    };

    const subscribe = (): (() => void) => {
      subscriberCount += 1;
      if (subscriberCount === 1) {
        // F4: daftar perangkat disegarkan saat native mengabarkan
        // perubahan (DAC dicolok/dicabut).
        unsubscribeDeviceChanges =
          AudioOutputService.subscribeDeviceChanges(() => {
            void get().refresh();
          });

        // Device bisa dicolok/dicabut saat app berjalan. Statusnya
        // dipoll pelan karena endpoint-nya murah (baca state native,
        // tanpa JNI ke AudioManager) dan pemilihan perangkat dari luar
        // app (mis. Android memindahkan rute) tidak mengirim event
        // apa pun ke kita.
        interval = setInterval(() => {
          void get().syncStatus();
        }, 3000);
        void get().refresh();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        subscriberCount -= 1;
        if (subscriberCount <= 0) {
          subscriberCount = 0;
          if (interval !== null) {
            clearInterval(interval);
            interval = null;
          }
          unsubscribeDeviceChanges?.();
          unsubscribeDeviceChanges = null;
        }
      };
    };

    return {
      devices: [],
      currentDevice: null,
      status: null,
      bluetoothCodec: {
        connected: false,
        deviceName: "",
        address: "",
      },
      loading: false,
      error: null,
      syncStatus,
      refresh,
      selectDevice,
      clearSelection,
      subscribe,
    };
  },
);

export default useAudioOutputStore;
