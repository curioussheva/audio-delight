// src/features/headphone/autoDisableCorrection.ts
//
// Aturan auto-OFF koreksi saat perangkat kabel dicabut (keputusan
// 2026-11-18). Murni — tanpa React Native — supaya bisa diuji Jest.
//
// Logika: koreksi mati bila rute output berpindah DARI perangkat kabel
// (jack 3,5 mm / DAC USB / line-out) KE perangkat bukan kabel (atau
// hilang), saat koreksi aktif. Tidak auto-ON saat dicolok lagi.
//
// Bukan berdasarkan hilangnya perangkat dari daftar `devices`: daftar itu
// hanya di-refresh saat mount (`useAudioOutput`), jadi tidak bisa melihat
// cabut sesudahnya — sinyal hidupnya adalah `currentDevice` (poll 3
// detik). Bluetooth disconnect TIDAK memicu: tipe sebelumnya bukan kabel.
// Pindah kabel -> kabel lain juga tidak memicu.

/**
 * Tipe perangkat kabel — nilai `type` dari `AudioDeviceDescriptor`
 * (`specs/NativeDeviceModule.ts`).
 */
export const WIRED_DEVICE_TYPES: ReadonlySet<string> = new Set([
  "headset",
  "usb",
  "line_out",
]);

export function shouldAutoDisableCorrection(
  prevDeviceType: string | null,
  nextDeviceType: string | null,
  correctionEnabled: boolean,
): boolean {
  if (!correctionEnabled) return false;
  if (prevDeviceType === null) return false;
  if (!WIRED_DEVICE_TYPES.has(prevDeviceType)) return false;
  return nextDeviceType === null || !WIRED_DEVICE_TYPES.has(nextDeviceType);
}
