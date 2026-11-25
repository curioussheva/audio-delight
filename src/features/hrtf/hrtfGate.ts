// src/features/hrtf/hrtfGate.ts
//
// Gate HRTF: efek ini hanya bermakna di headphone — butuh dua telinga
// terisolasi supaya cue spasial (ITD/ILD dari HRIR) sampai utuh. Di
// speaker, crosstalk di udara membunuh cue-nya (keputusan csheva
// 2026-11-19, langkah 6).
//
// FUNGSI MURNI — tanpa React Native / store / native. Diuji di
// src/__tests__/features/hrtf/hrtfGate.test.ts.
//
// Perangkat yang diizinkan:
//   headset, usb  -> ya (jack / DAC USB — IEM & headphone kabel)
//   bluetooth     -> ya, DENGAN CATATAN: bridge tidak bisa membedakan TWS
//                    dari speaker Bluetooth (keduanya melapor "bluetooth").
//                    HRTF di speaker BT tidak terdengar (crosstalk), tapi
//                    tidak merusak apa pun — v1 menerima ini.
//   speaker, earpiece, hdmi, line_out, unknown -> tidak.
//   line_out sengaja TIDAK: jack line-out masuk mixer/amplifier ->
//   speaker, bukan headphone (amplifier headphone tidak bisa dibedakan
//   dari sini — fail closed).
//
// Beda dari auto-off koreksi headphone (autoDisableCorrection.ts):
// koreksi mati saat rute PINDAH dari kabel ke bukan kabel; HRTF mati
// kapan pun perangkat AKTIF bukan headphone — termasuk BT -> speaker
// dan speaker -> speaker (koreksi sengaja tidak memicu di situ karena
// di luar lingkupnya; HRTF tidak punya "lingkup kabel", jadi aturannya
// murni "perangkat sekarang harus headphone").
//
// Aturan yang sama dengan koreksi: TIDAK auto-ON saat headphone kembali
// (user yang menyalakan lagi). Observasi pertama yang SUDAH berisi tipe
// non-headphone tetap diperiksa (EQ-24); yang dilewati hanya bila
// perangkat belum diketahui (next null, EQ-25) — jangan matikan HRTF
// yang dipersist ON hanya karena poll pertama belum kembali.

export type AudioDeviceTypeName =
  | "usb"
  | "speaker"
  | "headset"
  | "bluetooth"
  | "hdmi"
  | "earpiece"
  | "line_out"
  | "unknown";

/** Perangkat output tempat HRTF diizinkan. */
export const HRTF_DEVICE_TYPES: ReadonlySet<string> = new Set([
  "headset",
  "usb",
  "bluetooth",
]);

/**
 * Apakah HRTF diizinkan di perangkat ini — untuk keadaan toggle di UI.
 * null/undefined (belum diketahui) -> true: jangan kunci toggle karena
 * poll pertama belum kembali; gate hook yang mematikan HRTF sendiri
 * begitu perangkat diketahui bukan headphone.
 */
export function isHrtfAllowedDevice(
  deviceType: string | null | undefined,
): boolean {
  if (deviceType == null) return true;
  return HRTF_DEVICE_TYPES.has(deviceType);
}

/**
 * Haruskah HRTF dimatikan otomatis saat rute berpindah?
 * @param prevDeviceType tipe sebelumnya; null = observasi pertama
 *   (dipertahankan di signature untuk kompatibilitas — tidak lagi
 *   memengaruhi keputusan sejak EQ-24)
 * @param nextDeviceType tipe sekarang; null = perangkat belum diketahui
 * @param hrtfEnabled HRTF sedang menyala
 */
export function shouldAutoDisableHrtf(
  prevDeviceType: string | null,
  nextDeviceType: string | null,
  hrtfEnabled: boolean,
): boolean {
  void prevDeviceType;
  if (!hrtfEnabled) return false;
  // EQ-24: observasi pertama yang SUDAH berisi tipe non-headphone
  // (mis. speaker) tetap diperiksa — dulu `prev === null` membuat
  // observasi itu lolos dan HRTF ON bertahan di speaker.
  // EQ-25: lewati HANYA bila perangkat belum diketahui (next null).
  if (nextDeviceType === null) return false;
  return !HRTF_DEVICE_TYPES.has(nextDeviceType);
}
