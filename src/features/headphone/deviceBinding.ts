// src/features/headphone/deviceBinding.ts
//
// Logika pengikatan profil ke perangkat output - MURNI, tanpa React, tanpa
// zustand, tanpa native. Dipisah supaya bisa diuji (`jest.config.cjs` hanya
// menjalankan logika murni: file yang mengimpor react-native tidak bisa ikut).
//
// Semua bagian di bawah ini dulu ada di dalam store/hook. Selama di sana, satu-
// satunya cara memeriksanya adalah menjalankannya di device.

import type { DeviceProfileMap, HeadphoneProfile } from "./types";

/**
 * Kunci perangkat dari id native.
 *
 * Native memakai `AudioDeviceInfo.getId()` (int). Kunci disimpan sebagai
 * string supaya JSON AsyncStorage tetap stabil - `Record<number, string>`
 * tidak bertahan melewati serialisasi.
 */
export const deviceKey = (id: string | number | null | undefined): string => {
  if (id === null || id === undefined) return "";
  return String(id);
};

/**
 * Buang ikatan ke perangkat yang sudah tidak ada.
 *
 * Id perangkat TIDAK stabil antar colok-cabut - cabut lalu colok ulang bisa
 * memberi id berbeda. Jadi entri basi adalah hal normal, bukan tanda
 * kerusakan. Dibuang supaya peta tidak menumpuk id mati.
 *
 * Mengembalikan objek baru; objek lama tidak diubah.
 */
export const pruneDeviceProfiles = (
  map: DeviceProfileMap,
  availableIds: Array<string | number>,
): DeviceProfileMap => {
  const available = new Set(availableIds.map(deviceKey));
  const next: DeviceProfileMap = {};

  for (const [id, profileId] of Object.entries(map)) {
    if (available.has(id)) next[id] = profileId;
  }

  return next;
};

/**
 * Profil yang terikat ke perangkat ini, atau null.
 *
 * Ikatan yang menunjuk ke profil yang sudah dihapus juga mengembalikan null -
 * kalau tidak, `activateProfile()` akan dipanggil dengan id mati dan gagal
 * tanpa penjelasan.
 */
export const resolveProfileForDevice = (
  map: DeviceProfileMap,
  deviceId: string | number | null | undefined,
  profiles: HeadphoneProfile[],
): string | null => {
  const key = deviceKey(deviceId);
  if (!key) return null;

  const profileId = map[key];
  if (!profileId) return null;

  const exists = profiles.some((p) => p.id === profileId);
  return exists ? profileId : null;
};

/**
 * Apakah profil ini boleh dipasang otomatis untuk perangkat ini.
 *
 * `syncForDevice` TIDAK boleh menyentuh koreksi kalau:
 *  - tidak ada id perangkat, atau
 *  - perangkat tidak punya ikatan, atau
 *  - profil itu sudah aktif.
 *
 * Perangkat tanpa ikatan sengaja tidak melepas koreksi yang sedang aktif:
 * mematikannya otomatis akan membatalkan pilihan manual user.
 */
export const shouldAutoActivate = (
  map: DeviceProfileMap,
  deviceId: string | number | null | undefined,
  profiles: HeadphoneProfile[],
  activeProfileId: string | null,
): boolean => {
  const target = resolveProfileForDevice(map, deviceId, profiles);
  if (!target) return false;
  return target !== activeProfileId;
};
