// src/features/outputprofile/outputProfile.ts
//
// Logika MURNI profil per output (automatic EQ/preset switching by audio
// output) — tanpa React, tanpa zustand, tanpa native, supaya bisa diuji
// Jest (`jest.config.cjs` hanya menjalankan logika murni).
//
// VERIFIKASI DULU (2026-11-20, sebelum implementasi — jangan percaya
// laporan deep-insight buta-buta):
//
// 1. Preseden: AutoEQ otomatis OFF saat kabel dicabut
//    (`features/headphone/autoDisableCorrection.ts` + hook
//    `useHeadphoneCorrection`). Sinyal hidupnya adalah `currentDevice`
//    dari `useAudioOutput()` (poll 3 detik ke
//    `NativeDeviceModule.getCurrentOutputDevice()`); event native
//    `PristineDeviceChange` hanya me-refresh DAFTAR perangkat, bukan
//    perangkat aktif. Fitur ini memakai sinyal yang sama.
// 2. Kategori yang BENAR-BENAR bisa dibedakan hari ini = nilai `type`
//    dari `AudioDeviceDescriptor` (`specs/NativeDeviceModule.ts`),
//    yang dipetakan C++ `AudioDeviceManager::mapDeviceType` dari
//    `AudioDeviceInfo.getType()` Android:
//      headset -> jack kabel (WIRED_HEADSET/WIRED_HEADPHONES)
//      usb     -> DAC USB (USB_DEVICE/USB_HEADSET)
//      speaker -> speaker internal (BUILTIN_SPEAKER/SAFE)
//      line_out -> line analog/digital, dock analog
//      bluetooth -> SEMUA Bluetooth (SCO/A2DP/BLE headset/speaker/
//        broadcast/hearing aid) — runtuh jadi SATU tipe.
//      hdmi / earpiece / unknown -> "other" (tidak pernah auto-switch).
// 3. TWS vs CAR BT TIDAK BISA DIBEDAKAN dari kode yang ada:
//    `BluetoothA2dpStatus` (Kotlin) hanya expose connected/nama/alamat.
//    `BluetoothDevice.getBluetoothClass()` memang API publik dan SECARA
//    TEORI bisa membedakan (major class CAR_AUDIO vs HEADPHONES), tapi
//    itu butuh plumbing native baru (Kotlin -> spec -> JS) + izin
//    BLUETOOTH_CONNECT + rebuild + bukti device — di luar scope ronde
//    ini. Maka keduanya DIGABUNG jujur jadi satu kategori "bluetooth"
//    (satu preset untuk semua BT), bukan ditebak dari nama perangkat
//    (tebakan nama rapuh: "Car" bisa jadi nama TWS user). Follow-up
//    tercatat di hook (`useOutputProfiles.ts`).
// 4. Menerapkan preset otomatis AMAN: `equalizerStore.applyPreset(id)`
//    adalah jalur yang sama persis dengan user mengetuk chip preset —
//    set bands + efek, dorong ke native bila EQ menyala. Guard di
//    `shouldAutoApplyOutputProfile`: hanya bila fitur ON, EQ menyala
//    (tidak pernah menyalakan EQ diam-diam), kategori BENAR-BENAR
//    berubah, target ada (preset custom yang dihapus -> batal, bukan
//    crash), dan target belum aktif (no-op dihindari).
// 5. Manual override dihormati BY CONSTRUCTION: hook hanya bereaksi
//    pada TRANSISI kategori. User mengubah EQ manual setelah auto-
//    switch tidak memicu apa-apa — tidak ada re-apply sampai output
//    benar-benar berpindah lagi. Transisi ke "other" (null/unknown,
//    mis. stream sempat tertutup saat poll) diabaikan dan TIDAK
//    menimpa kategori terakhir yang diketahui, supaya flapping poll
//    tidak menerapkan ulang preset dan menimpa pilihan manual.

/** Kategori output yang dipakai pemetaan profil. */
export type OutputCategory =
  | "wired"
  | "usb"
  | "bluetooth"
  | "speaker"
  | "line_out"
  | "other";

/** Kategori yang bisa dikonfigurasi user di Settings ("other" tidak). */
export type ConfigurableOutputCategory = Exclude<OutputCategory, "other">;

export const CONFIGURABLE_OUTPUT_CATEGORIES: readonly ConfigurableOutputCategory[] =
  ["wired", "usb", "bluetooth", "speaker", "line_out"];

/** Label Indonesia per kategori (dipakai Settings + toast). */
export const OUTPUT_CATEGORY_LABELS: Record<OutputCategory, string> = {
  wired: "Headphone kabel (jack)",
  usb: "DAC USB",
  bluetooth: "Bluetooth (TWS / mobil / speaker)",
  speaker: "Speaker HP",
  line_out: "Line-out",
  other: "Output lain",
};

/**
 * Kategori dari nilai `type` native (`AudioDeviceDescriptor.type`).
 * null/undefined (belum ada info perangkat) dan tipe yang tidak dikenal
 * -> "other": tidak pernah memicu auto-switch.
 */
export function categoryOfDeviceType(
  type: string | null | undefined,
): OutputCategory {
  switch (type) {
    case "headset":
      return "wired";
    case "usb":
      return "usb";
    case "bluetooth":
      return "bluetooth";
    case "speaker":
      return "speaker";
    case "line_out":
      return "line_out";
    default:
      return "other";
  }
}

/**
 * Pemetaan kategori -> preset EQ yang diterapkan otomatis.
 * `null` = "tetap seperti sekarang" (tanpa perubahan) — nilai default
 * untuk semua kategori kecuali speaker.
 */
export type OutputProfileMap = Record<ConfigurableOutputCategory, string | null>;

/**
 * Default pemetaan (saat fitur dinyalakan, sebelum user mengatur):
 * hanya speaker yang punya preset (Flat — sesuai contoh spek:
 * "phone speaker -> flat"); kategori lain tanpa perubahan sampai user
 * memilih. Menyalakan fitur tidak boleh mengubah suara yang sedang
 * berjalan secara diam-diam.
 */
export const DEFAULT_OUTPUT_PROFILE_MAP: OutputProfileMap = {
  wired: null,
  usb: null,
  bluetooth: null,
  speaker: "flat",
  line_out: null,
};

/** Bentuk minimal preset yang cukup untuk lookup nama (bawaan + custom). */
export interface PresetNameLookup {
  id: string;
  name: string;
}

export function presetNameById(
  presets: PresetNameLookup[],
  presetId: string | null | undefined,
): string | null {
  if (!presetId) return null;
  return presets.find((p) => p.id === presetId)?.name ?? null;
}

/**
 * Preset yang harus diterapkan untuk kategori ini, atau null (= jangan
 * ubah apa-apa).
 *
 * null bila: kategori "other", mapping null ("tetap seperti sekarang"),
 * atau id preset tidak ada di daftar yang tersedia (mis. preset custom
 * sudah dihapus sesudah pemetaan disimpan — batal diam-diam, bukan
 * menerapkan id mati).
 */
export function resolveOutputPreset(
  mapping: OutputProfileMap,
  category: OutputCategory,
  availablePresetIds: string[],
): string | null {
  if (category === "other") return null;
  const target = mapping[category];
  if (!target) return null;
  return availablePresetIds.includes(target) ? target : null;
}

export interface AutoApplyDecisionInput {
  /** Sakelar utama fitur (default OFF — user harus opt-in). */
  enabled: boolean;
  /** EQ master menyala. OFF = jangan terapkan (dan jangan nyalakan EQ). */
  eqEnabled: boolean;
  /** Kategori terakhir yang diketahui (null = belum ada, mis. app baru start). */
  prevCategory: OutputCategory | null;
  /** Kategori sekarang (sudah difilter: "other" tidak pernah sampai sini). */
  nextCategory: OutputCategory;
  /** Preset hasil resolveOutputPreset (null = tidak ada yang diterapkan). */
  targetPresetId: string | null;
  /** Preset yang sedang aktif. */
  activePresetId: string | null;
}

/**
 * Apakah auto-switch boleh jalan pada transisi ini.
 *
 * - Fitur mati / EQ mati -> tidak.
 * - Belum ada kategori sebelumnya (app baru start, perangkat pertama
 *   kali terbaca) -> tidak: hanya TRANSISI live yang memicu, bukan
 *   keadaan saat boot. (Kalau tidak, membuka app dengan speaker aktif
 *   langsung menimpa preset user.)
 * - Kategori sama -> tidak (inilah yang menghormati manual override:
 *   user mengubah EQ lalu poll berikutnya membaca kategori yang sama
 *   tidak memicu apa-apa).
 * - Target null / target sudah aktif -> tidak.
 */
export function shouldAutoApplyOutputProfile(input: AutoApplyDecisionInput): boolean {
  if (!input.enabled) return false;
  if (!input.eqEnabled) return false;
  if (input.prevCategory === null) return false;
  if (input.prevCategory === input.nextCategory) return false;
  if (!input.targetPresetId) return false;
  if (input.targetPresetId === input.activePresetId) return false;
  return true;
}
