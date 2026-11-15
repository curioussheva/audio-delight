// src/features/headphone/data/builtinPresetSearch.ts
//
// Pencarian preset IEM bawaan berdasarkan nama (brand + model).
//
// Logika murni (tanpa React Native) supaya bisa diuji di jest. Dipakai
// picker di HeadphoneSection: ketik nama, bukan gulir dropdown panjang.

import {
  BUILTIN_HEADPHONE_PRESETS,
  type BuiltinHeadphonePreset,
} from "./builtinPresets";

/**
 * Cari preset bawaan berdasarkan brand/model.
 *
 * Query kosong -> daftar kosong (picker menampilkan petunjuk, bukan daftar
 * panjang 24 model). Pencocokan case-insensitive, substring — "chu",
 * "moondrop", "zero" semuanya ketemu.
 */
export function searchBuiltinPresets(
  query: string,
): BuiltinHeadphonePreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return BUILTIN_HEADPHONE_PRESETS.filter((p) =>
    `${p.brand} ${p.model}`.toLowerCase().includes(q),
  );
}
