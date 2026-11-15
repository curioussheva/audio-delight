/**
 * Preset IEM bawaan: setiap preset harus lolos parser aplikasi sendiri.
 *
 * Dua lapis verifikasi (sengaja rangkap, bukan duplikat):
 *  1. Test ini (jest): mirror aturan terima `parseParametricPreset` dari
 *     `android/app/src/main/cpp/dsp/PresetParser.cpp`, diterapkan ke SEMUA
 *     preset bawaan — baik dari file `.txt` sumber maupun dari modul TS
 *     hasil generate. Aturannya disalin apa adanya (lihat komentar di
 *     `parsePresetMirror`): Fc 10–20000 Hz, Q 0,1–20, gain ±30 dB, preamp
 *     ±40 dB, maks 16 filter, dan SETIAP baris Filter harus ter-parse
 *     (`totalFilterLines == parsedCount`) — kalau satu baris gagal, preset
 *     ditolak utuh, bukan diterapkan sebagian.
 *  2. `scripts/test_builtin_presets.cpp`: parser C++ ASLI yang sama, dijalankan
 *     langsung atas file `.txt`-nya (lihat header file itu untuk perintah
 *     kompilasi). Test ini TIDAK menggantikan (2) — ia memastikan data yang
 *     dibundel ke aplikasi (modul TS) sama byte-per-byte dengan yang
 *     diverifikasi (2), dan menjaga konsistensi indeks.
 *
 * Kalau ada preset yang gagal di sini, perbaiki DATANYA (ambil ulang dari
 * AutoEq / buang modelnya) — jangan pernah melonggarkan test ini.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  BUILTIN_HEADPHONE_PRESETS,
  type BuiltinHeadphonePreset,
} from "@/features/headphone/data/builtinPresets";
import { searchBuiltinPresets } from "@/features/headphone/data/builtinPresetSearch";

const DATA_DIR = join(__dirname, "../../../features/headphone/data");

interface IndexEntry {
  id: string;
  brand: string;
  model: string;
  database: string;
  rig: string;
  target: string;
  source: string;
  file: string;
}

const index: IndexEntry[] = JSON.parse(
  readFileSync(join(DATA_DIR, "builtinPresets.json"), "utf-8"),
);

// ============================================================
// Mirror `parseParametricPreset` (PresetParser.cpp).
//
// Aturan yang dicerminkan — JANGAN diubah tanpa mengubah C++-nya juga:
//  - `#` komentar dan baris kosong dilewati.
//  - `Preamp: <n> dB` — koma desimal diterima; di luar ±40 dB DIABAIKAN
//    (bukan error), preamp terakhir yang sah yang dipakai.
//  - `Filter N: ON|OFF PK|LSC|HSC Fc <n> [Hz|kHz] Gain <n> [dB] Q <n>`
//    dalam urutan bebas; alias tipe PK/PEAK/PEAKING/PEQ, LSC/LS/LOWSHELF,
//    HSC/HS/HIGHSHELF; token tak dikenal (mis. BW/S/SLOPE) = baris gagal.
//  - Tanpa Q -> 0.707 (peringatan, bukan error). Tanpa Fc -> baris gagal.
//  - Per baris: 10 <= Fc <= 20000, 0.1 <= Q <= 20, -30 <= gain <= 30.
//  - Akhir: 0 filter -> gagal; > 16 filter -> gagal; baris Filter yang
//    tidak menghasilkan filter (total != parsed) -> gagal.
// ============================================================

type MirrorFilterType = "peaking" | "lowshelf" | "highshelf";

interface MirrorFilter {
  type: MirrorFilterType;
  freqHz: number;
  q: number;
  gainDb: number;
}

interface MirrorResult {
  ok: boolean;
  preampDb: number;
  filters: MirrorFilter[];
  error: string;
}

const FILTER_TYPES: Record<string, MirrorFilterType> = {
  PK: "peaking",
  PEAK: "peaking",
  PEAKING: "peaking",
  PEQ: "peaking",
  LSC: "lowshelf",
  LS: "lowshelf",
  LOWSHELF: "lowshelf",
  LOW_SHELF: "lowshelf",
  HSC: "highshelf",
  HS: "highshelf",
  HIGHSHELF: "highshelf",
  HIGH_SHELF: "highshelf",
};

function parseFloatToken(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  if (t.includes(",") && !t.includes(".")) t = t.replace(/,/g, ".");
  const m = /^[-+0-9.eE]+/.exec(t);
  if (!m) return null;
  const v = Number.parseFloat(m[0]);
  return Number.isFinite(v) ? v : null;
}

function parsePresetMirror(text: string): MirrorResult {
  let preampDb = 0;
  const filters: MirrorFilter[] = [];
  let totalFilterLines = 0;

  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith("PREAMP")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const v = parseFloatToken(line.slice(colon + 1));
      if (v === null) continue;
      if (v >= -40 && v <= 40) preampDb = v;
      continue;
    }

    if (!upper.startsWith("FILTER")) {
      return { ok: false, preampDb, filters, error: `baris tak dikenal: ${line}` };
    }

    totalFilterLines += 1;
    const colon = line.indexOf(":");
    const rest = colon === -1 ? "" : line.slice(colon + 1);
    const tok = rest.split(/\s+/).filter(Boolean);
    if (tok.length === 0) {
      return { ok: false, preampDb, filters, error: "Filter tanpa parameter" };
    }

    let i = 0;
    if (tok[0].toUpperCase() === "ON" || tok[0].toUpperCase() === "OFF") {
      if (tok[0].toUpperCase() === "OFF") {
        return { ok: false, preampDb, filters, error: "Filter OFF ikut terhitung" };
      }
      i = 1;
    }
    if (i >= tok.length) {
      return { ok: false, preampDb, filters, error: "Filter tanpa tipe" };
    }
    const type = FILTER_TYPES[tok[i].toUpperCase()];
    if (!type) {
      return { ok: false, preampDb, filters, error: `tipe tak dikenal: ${tok[i]}` };
    }
    i += 1;

    let freqHz: number | null = null;
    let q: number | null = null;
    let gainDb = 0;
    let bad = false;
    while (i < tok.length) {
      const key = tok[i].toUpperCase();
      if (key === "FC" || key === "FREQ" || key === "FREQUENCY" || key === "GAIN" || key === "Q") {
        if (i + 1 >= tok.length) {
          bad = true;
          break;
        }
        let v = parseFloatToken(tok[i + 1]);
        if (v === null) {
          bad = true;
          break;
        }
        let next = i + 2;
        if (next < tok.length) {
          const unit = tok[next].toUpperCase();
          if (unit === "KHZ") {
            v *= 1000;
            next += 1;
          } else if (
            unit === "HZ" ||
            unit === "DB" ||
            unit === "DB/OCT" ||
            unit === "DB/OCTAVE" ||
            unit === "DB/8VE" ||
            unit === "%"
          ) {
            next += 1;
          }
        }
        if (key === "FC" || key === "FREQ" || key === "FREQUENCY") freqHz = v;
        else if (key === "GAIN") gainDb = v;
        else q = v;
        i = next;
        continue;
      }
      bad = true;
      break;
    }
    if (bad || freqHz === null) {
      return { ok: false, preampDb, filters, error: `baris filter gagal parse: ${line}` };
    }
    if (q === null) q = 0.707;
    if (
      !(freqHz >= 10 && freqHz <= 20000) ||
      !(q >= 0.1 && q <= 20) ||
      !(gainDb >= -30 && gainDb <= 30)
    ) {
      return {
        ok: false,
        preampDb,
        filters,
        error: `Fc/Q/Gain di luar rentang: ${line}`,
      };
    }
    filters.push({ type, freqHz, q, gainDb });
  }

  if (filters.length === 0) {
    return { ok: false, preampDb, filters, error: "tidak ada filter" };
  }
  if (filters.length > 16) {
    return { ok: false, preampDb, filters, error: "lebih dari 16 filter" };
  }
  if (totalFilterLines !== filters.length) {
    return {
      ok: false,
      preampDb,
      filters,
      error: `hanya ${filters.length} dari ${totalFilterLines} baris filter terbaca`,
    };
  }
  return { ok: true, preampDb, filters, error: "" };
}

// ============================================================
// Test
// ============================================================

describe("preset IEM bawaan", () => {
  it("indeks berisi 24 model, id unik, metadata lengkap", () => {
    expect(index.length).toBe(24);
    expect(BUILTIN_HEADPHONE_PRESETS.length).toBe(24);
    const ids = new Set(index.map((e) => e.id));
    expect(ids.size).toBe(index.length);
    for (const e of index) {
      expect(e.id.startsWith("builtin-")).toBe(true);
      expect(e.brand.trim().length).toBeGreaterThan(0);
      expect(e.model.trim().length).toBeGreaterThan(0);
      expect(e.database.trim().length).toBeGreaterThan(0);
      // Rig + target tercatat per preset — bukan klaim umum.
      expect(e.rig.trim().length).toBeGreaterThan(0);
      expect(e.target).toContain("Harman in-ear 2019");
      expect(e.source).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/jaakkopasanen\/AutoEq\/master\/results\//,
      );
      expect(e.file).toMatch(/^presets\/[a-z0-9-]+\.txt$/);
    }
  });

  it("modul TS hasil generate sama dengan indeks (id/brand/model/rig/target/sumber)", () => {
    const byId = new Map<string, BuiltinHeadphonePreset>(
      BUILTIN_HEADPHONE_PRESETS.map((p) => [p.id, p]),
    );
    expect(byId.size).toBe(index.length);
    for (const e of index) {
      const p = byId.get(e.id);
      expect(p).toBeDefined();
      expect(p?.brand).toBe(e.brand);
      expect(p?.model).toBe(e.model);
      expect(p?.rig).toBe(e.rig);
      expect(p?.target).toBe(e.target);
      expect(p?.source).toBe(e.source);
    }
  });

  it("setiap file .txt di data/presets tercantum di indeks (tidak ada file yatim)", () => {
    const files = readdirSync(join(DATA_DIR, "presets")).filter((f) =>
      f.endsWith(".txt"),
    );
    const indexed = new Set(index.map((e) => e.file.split("/")[1]));
    expect(files.sort()).toEqual([...indexed].sort());
  });

  it.each(index)(
    "preset $brand $model lolos parser (teks .txt = teks modul TS)",
    (entry) => {
      const txt = readFileSync(join(DATA_DIR, entry.file), "utf-8");
      const bundled = BUILTIN_HEADPHONE_PRESETS.find((p) => p.id === entry.id);
      expect(bundled).toBeDefined();
      // Modul TS harus sama byte-per-byte dengan file sumber — kalau tidak,
      // verifikasi parser C++ atas .txt tidak berlaku untuk yang dibundel.
      expect(bundled?.presetText).toBe(txt);

      for (const [label, text] of [
        ["txt", txt],
        ["modul TS", bundled?.presetText ?? ""],
      ] as const) {
        const r = parsePresetMirror(text);
        expect(`${label}: ${r.error}`).toBe(`${label}: `);
        expect(r.ok).toBe(true);
        expect(r.filters.length).toBeGreaterThanOrEqual(1);
        expect(r.filters.length).toBeLessThanOrEqual(16);
        expect(r.filters.length).toBe(bundled?.filterCount);
        expect(r.preampDb).toBeCloseTo(bundled?.preampDb ?? 0, 6);
        expect(Number.isFinite(r.preampDb)).toBe(true);
        expect(r.preampDb).toBeGreaterThanOrEqual(-40);
        expect(r.preampDb).toBeLessThanOrEqual(40);
        for (const f of r.filters) {
          expect(Number.isFinite(f.freqHz)).toBe(true);
          expect(Number.isFinite(f.q)).toBe(true);
          expect(Number.isFinite(f.gainDb)).toBe(true);
          expect(f.freqHz).toBeGreaterThanOrEqual(10);
          expect(f.freqHz).toBeLessThanOrEqual(20000);
          expect(f.q).toBeGreaterThanOrEqual(0.1);
          expect(f.q).toBeLessThanOrEqual(20);
          expect(f.gainDb).toBeGreaterThanOrEqual(-30);
          expect(f.gainDb).toBeLessThanOrEqual(30);
        }
      }
    },
  );

  it("pencarian preset bawaan: nama, bukan dropdown panjang", () => {
    expect(searchBuiltinPresets("")).toEqual([]);
    expect(searchBuiltinPresets("   ")).toEqual([]);
    const chu = searchBuiltinPresets("chu");
    expect(chu.map((p) => p.id)).toEqual(["builtin-moondrop-chu"]);
    expect(searchBuiltinPresets("CHU")).toEqual(chu);
    const moondrop = searchBuiltinPresets("moondrop");
    expect(moondrop.length).toBe(6);
    expect(searchBuiltinPresets("zero").length).toBeGreaterThanOrEqual(3);
    expect(searchBuiltinPresets("tidak-ada-model-ini")).toEqual([]);
  });
});
