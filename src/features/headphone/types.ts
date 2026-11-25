// src/features/headphone/types.ts
//
// Tipe koreksi headphone. Terpisah dari `features/equalizer/types.ts`
// dengan sengaja: `Preset` di sana adalah EQ 10-band bergrafis (band tetap,
// hanya gain), sedangkan profil di sini adalah cascade parametrik 16 filter
// (Fc/Q/Gain per filter) plus preamp. Mencampur keduanya akan membuat
// `applyPreset()` EQ mencoba menerapkan profil yang bentuknya berbeda.

/** Jenis filter. Cocok dengan `FilterType` di C++ (`dsp/BiquadCascade.h`). */
export type HeadphoneFilterType = "peaking" | "lowshelf" | "highshelf";

export interface HeadphoneFilter {
  type: HeadphoneFilterType;
  freqHz: number;
  q: number;
  gainDb: number;
}

/** Asal profil - menentukan cara ia dibuat, bukan cara ia dipakai. */
export type HeadphonePresetSource = "parametric" | "graphic" | "ddc";

/**
 * Satu profil koreksi headphone.
 *
 * `presetText` disimpan apa adanya: itu sumber kebenaran yang dikirim ke
 * native. `filters` hanya ringkasan hasil parse untuk ditampilkan di UI.
 * Kalau keduanya berbeda, `presetText` yang menang - native mem-parse ulang
 * teks itu setiap kali preset dimuat, jadi ia tidak pernah bergantung pada
 * ringkasan yang mungkin sudah usang.
 */
export interface HeadphoneProfile {
  id: string;
  name: string;
  source: HeadphonePresetSource;
  preampDb: number;
  filterCount: number;
  filters: HeadphoneFilter[];
  /** Teks preset asli (AutoEQ/Squiglink). Dikirim utuh ke native. */
  presetText: string;
}

/**
 * Pemetaan perangkat output -> profil.
 *
 * EQ-23: kunci STABIL `type:name` (mis. `headset:GK-Kunten`), BUKAN id
 * native `AudioDeviceInfo.getId()` (int). Id itu tidak stabil antar
 * colok-cabut — cabut lalu colok ulang bisa memberi id berbeda — jadi
 * ikatan berkunci id mati saat perangkat dicabut lalu tidak pernah
 * cocok lagi. Nama bisa berubah untuk Bluetooth (suffix kodek), tapi
 * `type:name` tetap jauh lebih stabil daripada id int; alamat BT /
 * vendor-product USB tidak dibawa deskriptor perangkat, jadi belum
 * bisa dipakai sebagai kunci.
 *
 * Ikatan LAMA berkunci id int (mis. `"7"`) yang tersimpan di
 * AsyncStorage menjadi yatim: tidak pernah cocok dengan kunci baru,
 * tapi SENGAJA tidak dihapus diam-diam — user bisa mengikat ulang
 * perangkatnya; prune otomatis yang dulu membuangnya juga dihentikan
 * (lihat useHeadphoneCorrection).
 */
export type DeviceProfileMap = Record<string, string>;

export interface HeadphoneCorrectionStore {
  // --- State ---
  profiles: HeadphoneProfile[];
  deviceProfiles: DeviceProfileMap;
  /** Profil yang sedang terpasang di native. null = tidak ada koreksi. */
  activeProfileId: string | null;
  enabled: boolean;
  /**
   * EQ-21: profil yang BENAR-BENAR sudah dimuat ke native di sesi ini.
   * Runtime saja — TIDAK dipersist (tidak masuk `partialize`).
   * `activeProfileId` yang dipersist mengklaim "aktif" walau native
   * sudah lupa presetnya setelah restart; `loadedProfileId` hanya
   * terisi bila `activateProfile` berhasil di sesi ini, jadi
   * `syncForDevice` bisa membedakan "sudah dimuat" dari "hanya
   * tercatat aktif".
   */
  loadedProfileId: string | null;

  // --- Actions ---

  /** Muat profil ke native. false = ditolak native (teks cacat). */
  activateProfile: (profileId: string) => Promise<boolean>;

  /** Matikan koreksi tanpa menghapus profil. */
  deactivate: () => Promise<void>;

  /** Simpan profil hasil parse. Mengembalikan id. */
  addProfile: (
    name: string,
    presetText: string,
    parsed: { preampDb: number; filters: HeadphoneFilter[] },
  ) => string;

  deleteProfile: (profileId: string) => void;

  /** Ikat perangkat ke profil. `null` = lepas ikatan. */
  bindDevice: (deviceId: string, profileId: string | null) => void;

  /**
   * Terapkan profil yang terikat ke perangkat ini, kalau ada.
   * Dipanggil saat perangkat aktif berubah.
   */
  syncForDevice: (deviceId: string | null) => Promise<void>;

  /**
   * EQ-21: pulihkan koreksi ke native saat boot. Bila `enabled` dan ada
   * `activeProfileId` tersimpan, muat ulang profil itu — native
   * melupakan preset saat proses mati, sementara state persisten tetap
   * mengklaim aktif. Tanpa ini koreksi "aktif" di UI tapi tidak
   * terdengar sampai user men-tap ulang. Dipanggil dari
   * `equalizerStore.initialize()` (hub restore DSP saat boot).
   */
  restoreToNative: () => Promise<void>;

  /** Buang ikatan ke perangkat yang sudah tidak ada. */
  pruneDevices: (availableIds: string[]) => void;

  resetAll: () => Promise<void>;
}
