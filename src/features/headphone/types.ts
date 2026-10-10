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
 * Kunci memakai `AudioDeviceInfo.getId()` (int) yang dikonversi ke string,
 * BUKAN nama perangkat. Nama bisa berubah (Bluetooth menambahkan suffix
 * kodek), sedangkan id stabil selama perangkat terpasang.
 *
 * Batasan yang perlu diketahui: id bersifat sementara - cabut lalu colok
 * ulang bisa memberi id berbeda. Karena itu peta ini dibersihkan saat app
 * dibuka kalau id-nya sudah tidak ada di daftar perangkat.
 */
export type DeviceProfileMap = Record<string, string>;

export interface HeadphoneCorrectionStore {
  // --- State ---
  profiles: HeadphoneProfile[];
  deviceProfiles: DeviceProfileMap;
  /** Profil yang sedang terpasang di native. null = tidak ada koreksi. */
  activeProfileId: string | null;
  enabled: boolean;

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

  /** Buang ikatan ke perangkat yang sudah tidak ada. */
  pruneDevices: (availableIds: string[]) => void;

  resetAll: () => Promise<void>;
}
