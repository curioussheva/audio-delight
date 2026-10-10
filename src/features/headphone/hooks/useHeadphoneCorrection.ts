// src/features/headphone/hooks/useHeadphoneCorrection.ts
//
// Menyambungkan profil koreksi headphone ke perangkat output yang aktif.
//
// Inti Fase E bagian "ingat per perangkat": saat output berpindah dari kabel A
// ke kabel B, profil yang terikat ke B dipasang otomatis. Deteksi perangkat
// memakai `useAudioOutput()` yang sudah ada (polling 3 detik) - tidak ada
// mekanisme baru yang dibangun di sini.

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { useHeadphoneStore, validatePreset } from "../store/headphoneStore";
import type { HeadphoneProfile } from "../types";

export interface UseHeadphoneCorrectionReturn {
  /** Semua profil tersimpan. */
  profiles: HeadphoneProfile[];
  /** Profil yang sedang terpasang. null = tidak ada. */
  activeProfile: HeadphoneProfile | null;
  enabled: boolean;
  /** Perangkat yang sedang mengeluarkan suara. */
  currentDevice: { id: string; name: string; type: string } | null;
  /** Profil yang terikat ke perangkat aktif, kalau ada. */
  boundProfileId: string | null;

  /** Muat teks preset, validasi, lalu simpan. Gagal -> { ok: false }. */
  importPreset: (
    name: string,
    presetText: string,
  ) => Promise<{ ok: boolean; filterCount: number; profileId?: string }>;

  activate: (profileId: string) => Promise<boolean>;
  deactivate: () => Promise<void>;
  remove: (profileId: string) => void;

  /** Ikat profil ke perangkat yang sedang aktif. */
  bindCurrentDevice: (profileId: string | null) => void;

  /** true kalau perangkat aktif punya ikatan profil. */
  hasBinding: boolean;
}

export const useHeadphoneCorrection =
  (): UseHeadphoneCorrectionReturn => {
    const profiles = useHeadphoneStore((s) => s.profiles);
    const activeProfileId = useHeadphoneStore((s) => s.activeProfileId);
    const enabled = useHeadphoneStore((s) => s.enabled);
    const deviceProfiles = useHeadphoneStore((s) => s.deviceProfiles);

    const activateProfile = useHeadphoneStore((s) => s.activateProfile);
    const deactivateStore = useHeadphoneStore((s) => s.deactivate);
    const addProfile = useHeadphoneStore((s) => s.addProfile);
    const deleteProfile = useHeadphoneStore((s) => s.deleteProfile);
    const bindDevice = useHeadphoneStore((s) => s.bindDevice);
    const syncForDevice = useHeadphoneStore((s) => s.syncForDevice);
    const pruneDevices = useHeadphoneStore((s) => s.pruneDevices);

    const { currentDevice, devices } = useAudioOutput();

    const deviceId = currentDevice ? String(currentDevice.id) : null;

    // Cegah setState setelah unmount; sync dipicu polling 3 detik.
    const mounted = useRef(true);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    // Buang ikatan ke perangkat yang sudah tidak terpasang. Id perangkat tidak
    // stabil antar colok-cabut, jadi entri basi adalah hal normal.
    useEffect(() => {
      if (devices.length === 0) return;
      pruneDevices(devices.map((d) => String(d.id)));
    }, [devices, pruneDevices]);

    // Perangkat aktif berubah -> pasang profil yang terikat padanya.
    useEffect(() => {
      if (!deviceId) return;
      void syncForDevice(deviceId);
    }, [deviceId, syncForDevice]);

    const activeProfile = useMemo(
      () => profiles.find((p) => p.id === activeProfileId) ?? null,
      [profiles, activeProfileId],
    );

    const boundProfileId = deviceId ? deviceProfiles[deviceId] ?? null : null;

    const importPreset = useCallback(
      async (name: string, presetText: string) => {
        const trimmed = presetText.trim();

        if (!trimmed) {
          return { ok: false, filterCount: 0 };
        }

        // Validasi lewat native. Ini yang menentukan diterima atau ditolak -
        // bukan pemeriksaan bentuk teks di JS. Kalau native menolak, preset
        // TIDAK disimpan: lebih baik tidak ada profil daripada profil yang
        // tidak bisa diterapkan.
        const result = await validatePreset(trimmed);

        if (!result.ok) {
          return { ok: false, filterCount: 0 };
        }

        // Ringkasan filter belum bisa dibaca dari native (hanya jumlahnya),
        // jadi `filters` dikosongkan dan `filterCount` diisi. UI menampilkan
        // jumlah, bukan rincian yang tidak kita punya.
        const id = addProfile(name.trim() || "Tanpa nama", trimmed, {
          preampDb: 0,
          filters: [],
        });

        return { ok: true, filterCount: result.filterCount, profileId: id };
      },
      [addProfile],
    );

    const activate = useCallback(
      async (profileId: string) => {
        const ok = await activateProfile(profileId);
        if (!mounted.current) return ok;
        return ok;
      },
      [activateProfile],
    );

    const deactivate = useCallback(async () => {
      await deactivateStore();
    }, [deactivateStore]);

    const remove = useCallback(
      (profileId: string) => {
        deleteProfile(profileId);
      },
      [deleteProfile],
    );

    const bindCurrentDevice = useCallback(
      (profileId: string | null) => {
        if (!deviceId) return;
        bindDevice(deviceId, profileId);
      },
      [deviceId, bindDevice],
    );

    return {
      profiles,
      activeProfile,
      enabled,
      currentDevice: currentDevice
        ? {
            id: String(currentDevice.id),
            name: currentDevice.name,
            type: currentDevice.type,
          }
        : null,
      boundProfileId,
      importPreset,
      activate,
      deactivate,
      remove,
      bindCurrentDevice,
      hasBinding: boundProfileId !== null,
    };
  };

export default useHeadphoneCorrection;
