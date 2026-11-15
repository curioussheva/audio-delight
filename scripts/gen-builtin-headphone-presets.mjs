// scripts/gen-builtin-headphone-presets.mjs
//
// Regenerasi `src/features/headphone/data/builtinPresets.ts` dari sumber
// kebenaran: `builtinPresets.json` (indeks: id/brand/model/rig/target/sumber)
// + `data/presets/*.txt` (teks preset AutoEq verbatim, satu file per model).
//
// Jalankan: `node scripts/gen-builtin-headphone-presets.mjs`
//
// JANGAN edit file hasil generate dengan tangan: edit JSON/.txt-nya, lalu
// jalankan ulang script ini. Test jest
// `src/__tests__/features/headphone/builtinPresets.test.ts` memastikan
// `presetText` di file hasil generate sama byte-per-byte dengan .txt-nya,
// supaya keduanya tidak pernah melenceng diam-diam.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src/features/headphone/data");

const index = JSON.parse(
  readFileSync(join(dataDir, "builtinPresets.json"), "utf-8"),
);

const presets = index.map((entry) => {
  const { file, ...meta } = entry;
  const text = readFileSync(join(dataDir, file), "utf-8");
  const filterCount = (text.match(/^Filter \d+:/gim) ?? []).length;
  const preampMatch = text.match(/^Preamp:\s*(-?[\d.,]+)/im);
  const preampDb = preampMatch
    ? Number.parseFloat(preampMatch[1].replace(",", "."))
    : 0;
  if (filterCount === 0) {
    throw new Error(`${file}: tidak ada baris Filter`);
  }
  if (!Number.isFinite(preampDb)) {
    throw new Error(`${file}: preamp tidak terbaca`);
  }
  // `file` sengaja TIDAK ikut ke modul TS: runtime tidak butuh path .txt,
  // dan interface BuiltinHeadphonePreset memang tidak punya field itu.
  return { ...meta, presetText: text, filterCount, preampDb };
});

const header = `// src/features/headphone/data/builtinPresets.ts
//
// FILE HASIL GENERATE — jangan edit dengan tangan.
// Sumber: builtinPresets.json + data/presets/*.txt (teks AutoEq verbatim).
// Regenerasi: \`node scripts/gen-builtin-headphone-presets.mjs\`.
//
// Setiap preset = hasil parametric-EQ AutoEq (jaakkopasanen/AutoEq) untuk
// satu model IEM, ke target Harman in-ear 2019. Rig + target + URL sumber
// tercatat per preset di bawah; teks presetnya sendiri TIDAK diutak-atik.

export interface BuiltinHeadphonePreset {
  /** Id stabil, mis. "builtin-moondrop-chu". */
  id: string;
  brand: string;
  model: string;
  /** Database AutoEq asal pengukuran, mis. "oratory1990". */
  database: string;
  /** Rig pengukuran + database, mis. "oratory1990 — GRAS RA0045 (IEC 60318-4)". */
  rig: string;
  /** Kurva target yang dipakai AutoEq. */
  target: string;
  /** URL mentah file ParametricEQ.txt di repo AutoEq. */
  source: string;
  /** Teks preset AutoEq verbatim — inilah yang dikirim ke native. */
  presetText: string;
  /** Jumlah baris Filter di presetText. */
  filterCount: number;
  /** Preamp (dB) dari baris "Preamp:". */
  preampDb: number;
}

export const BUILTIN_HEADPHONE_PRESETS: BuiltinHeadphonePreset[] = `;

const body = JSON.stringify(presets, null, 2);

writeFileSync(
  join(dataDir, "builtinPresets.ts"),
  `${header}${body};\n`,
  "utf-8",
);

console.log(
  `builtinPresets.ts ditulis: ${presets.length} preset, ` +
    `${presets.reduce((n, p) => n + p.filterCount, 0)} filter total.`,
);
