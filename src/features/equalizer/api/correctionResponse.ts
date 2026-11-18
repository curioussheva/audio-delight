// src/features/equalizer/api/correctionResponse.ts
//
// Matematika murni untuk kurva gabungan di FrequencyGraph (tab Equalizer):
// respons koreksi headphone + EQ manual = suara yang benar-benar didengar.
//
// SUMBER DATA — hanya untuk tampil, bukan untuk audio:
//   Filter koreksi TIDAK tersimpan di JS state (`HeadphoneProfile.filters`
//   selalu kosong — `importPreset` menyimpannya tanpa rincian, dan native
//   tidak menyediakan pembacaan balik). Satu-satunya sumber adalah
//   `presetText` (teks AutoEQ/Squiglink) profil aktif, yang di-parse DI SINI
//   khusus untuk tampilan. Kebenaran audio tetap parse native atas teks yang
//   sama — parser ini meniru aturannya (lihat
//   `android/app/src/main/cpp/dsp/PresetParser.cpp`): token Fc/Gain/Q dalam
//   urutan bebas, alias tipe yang sama, OFF dilewati, Q default 0.707 bila
//   tak disebut, dan — yang terpenting — gagal total bila ada satu baris
//   Filter yang tak terbaca (native juga menolak preset sebagian).
//   Parse gagal -> null -> kurva gabungan disembunyikan, bukan ditebak.
//
// RESPONS — cerminan `BiquadFilter.cpp` (RBJ cookbook, alpha = sin(w0)/(2Q)
//   untuk ketiga jenis filter, shelf memakai beta = 2*sqrt(A)*alpha):
//   koefisien yang sama, lalu magnitudo |H(e^jw)| dalam dB. dB dijumlah antar
//   filter (cascade seri) dan ditambah preamp (flat, diterapkan native
//   sebelum cascade) + kurva EQ (rantai DSP: koreksi dulu, baru EQ).
//   Laju sampling tampilan 48 kHz — asumsi display (pita band maks 16 kHz,
//   jauh di bawah Nyquist 44,1k maupun 48k, jadi selisihnya diabaikan).

import type { HeadphoneFilter } from "@/features/headphone/types";

/** Laju sampling untuk respons tampilan (bukan laju stream — lihat atas). */
export const COMBINED_CURVE_SAMPLE_RATE_HZ = 48000;
/** Kapasitas cascade native (BiquadCascade::kMaxFilters). */
export const MAX_CORRECTION_FILTERS = 16;

export interface ParsedCorrectionPreset {
  preampDb: number;
  filters: HeadphoneFilter[];
}

const FILTER_TYPE_ALIASES: Record<string, HeadphoneFilter["type"]> = {
  pk: "peaking",
  peak: "peaking",
  peaking: "peaking",
  peq: "peaking",
  lsc: "lowshelf",
  ls: "lowshelf",
  lowshelf: "lowshelf",
  low_shelf: "lowshelf",
  hsc: "highshelf",
  hs: "highshelf",
  highshelf: "highshelf",
  high_shelf: "highshelf",
};

function parseNumberToken(tok: string): number | null {
  // parseFloat berhenti di karakter tak dikenal — sama seperti parseFloat
  // native ("105Hz" -> 105). Koma desimal TIDAK dinormalisasi: native juga
  // membacanya sebagai bilangan bulat, jadi samakan perilakunya.
  const v = parseFloat(tok);
  return Number.isFinite(v) ? v : null;
}

/**
 * Parse teks preset AutoEQ/Squiglink khusus untuk tampilan.
 * null = tidak bisa dibaca dengan yakin (bukan preset yang dikenal, ada
 * baris Filter yang gagal, atau >16 baris) — pemanggil menyembunyikan
 * kurva gabungan, bukan menebak.
 */
export function parseCorrectionPresetText(
  presetText: string,
): ParsedCorrectionPreset | null {
  const lines = presetText.split(/\r?\n/);
  let preampDb = 0;
  const filters: HeadphoneFilter[] = [];
  let filterLines = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const upper = line.toUpperCase();

    if (upper.startsWith("PREAMP")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue; // native: baris tanpa ':' diabaikan
      const v = parseNumberToken(line.slice(colon + 1).trim());
      // Di luar ±40 dB native mengabaikan barisnya (preamp tetap 0).
      if (v !== null && v >= -40 && v <= 40) preampDb = v;
      continue;
    }

    // Baris yang tidak diawali PREAMP/FILTER dilewati native — lewati juga.
    if (!upper.startsWith("FILTER")) continue;

    filterLines += 1;
    if (filterLines > MAX_CORRECTION_FILTERS) return null;

    const colon = line.indexOf(":");
    const rest = colon === -1 ? "" : line.slice(colon + 1);
    const tok = rest.split(/\s+/).filter((t) => t.length > 0);
    if (tok.length === 0) return null;

    let i = 0;
    let enabled = true;
    const onoff = tok[0]?.toUpperCase();
    if (onoff === "ON" || onoff === "OFF") {
      enabled = onoff === "ON";
      i = 1;
    }
    if (i >= tok.length) return null;

    const type = FILTER_TYPE_ALIASES[tok[i]?.toLowerCase() ?? ""];
    if (!type) return null;
    i += 1;

    let freqHz: number | null = null;
    let gainDb = 0;
    let q: number | null = null;
    while (i < tok.length) {
      const key = tok[i]?.toUpperCase();
      if (
        key === "FC" ||
        key === "FREQ" ||
        key === "FREQUENCY" ||
        key === "GAIN" ||
        key === "Q"
      ) {
        if (i + 1 >= tok.length) return null;
        let v = parseNumberToken(tok[i + 1] ?? "");
        if (v === null) return null;
        // Satuan opsional setelah nilai (native): Hz / kHz / dB / ...
        let next = i + 2;
        if (next < tok.length) {
          const unit = tok[next]?.toUpperCase();
          if (unit === "HZ") {
            next += 1;
          } else if (unit === "KHZ") {
            v *= 1000;
            next += 1;
          } else if (
            unit === "DB" ||
            unit === "DB/OCT" ||
            unit === "DB/OCTAVE" ||
            unit === "DB/8VE" ||
            unit === "%"
          ) {
            next += 1;
          }
        }
        if (key === "FC" || key === "FREQ" || key === "FREQUENCY") {
          freqHz = v;
        } else if (key === "GAIN") {
          gainDb = v;
        } else {
          q = v;
        }
        i = next;
        continue;
      }
      // Token tak dikenal — native membuang barisnya, lalu preset gagal
      // total (totalFilterLines != parsedCount). Samakan: gagal total.
      return null;
    }

    if (freqHz === null) return null;
    if (q === null) q = 0.707; // native: Q bawaan bila tak disebut
    // Rentang per baris (native): Fc 10..20000, Q 0.1..20, Gain -30..+30.
    if (
      !(freqHz >= 10 && freqHz <= 20000) ||
      !(q >= 0.1 && q <= 20) ||
      !(gainDb >= -30 && gainDb <= 30)
    ) {
      return null;
    }

    // OFF tidak diterapkan native (PresetParser.cpp:402/437) — lewati.
    if (enabled) filters.push({ type, freqHz, q, gainDb });
  }

  if (filterLines === 0) return null;
  return { preampDb, filters };
}

/** Koefisien biquad ternormalisasi (a0 = 1), cerminan BiquadFilter.cpp. */
interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function biquadCoefficients(
  type: HeadphoneFilter["type"],
  freqHz: number,
  q: number,
  gainDb: number,
  sampleRateHz: number,
): BiquadCoefficients | null {
  if (
    !(sampleRateHz > 0) ||
    !Number.isFinite(freqHz) ||
    !Number.isFinite(q) ||
    !Number.isFinite(gainDb)
  ) {
    return null;
  }
  // Klem seperti designOk di BiquadFilter.cpp.
  const f = Math.min(Math.max(freqHz, 1), 0.49 * sampleRateHz);
  const qq = Math.min(Math.max(q, 0.1), 20);
  const g = Math.min(Math.max(gainDb, -40), 40);
  const A = Math.pow(10, g / 40);
  const w0 = (2 * Math.PI * f) / sampleRateHz;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * qq);
  const sqrtA = Math.sqrt(A);

  if (type === "peaking") {
    const a0 = 1 + alpha / A;
    return {
      b0: (1 + alpha * A) / a0,
      b1: (-2 * cosW0) / a0,
      b2: (1 - alpha * A) / a0,
      a1: (-2 * cosW0) / a0,
      a2: (1 - alpha / A) / a0,
    };
  }

  const beta = 2 * sqrtA * alpha;
  if (type === "lowshelf") {
    const a0 = (A + 1) + (A - 1) * cosW0 + beta;
    return {
      b0: (A * ((A + 1) - (A - 1) * cosW0 + beta)) / a0,
      b1: (2 * A * ((A - 1) - (A + 1) * cosW0)) / a0,
      b2: (A * ((A + 1) - (A - 1) * cosW0 - beta)) / a0,
      a1: (-2 * ((A - 1) + (A + 1) * cosW0)) / a0,
      a2: ((A + 1) + (A - 1) * cosW0 - beta) / a0,
    };
  }

  // highshelf
  const a0 = (A + 1) - (A - 1) * cosW0 + beta;
  return {
    b0: (A * ((A + 1) + (A - 1) * cosW0 + beta)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cosW0)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cosW0 - beta)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cosW0)) / a0,
    a2: ((A + 1) - (A - 1) * cosW0 - beta) / a0,
  };
}

/**
 * Magnitudo satu filter biquad pada frekuensi `atHz`, dalam dB.
 * 0 dB untuk input yang tidak bisa dihitung (bukan NaN yang merambat).
 */
export function biquadMagnitudeDb(
  type: HeadphoneFilter["type"],
  freqHz: number,
  q: number,
  gainDb: number,
  atHz: number,
  sampleRateHz: number = COMBINED_CURVE_SAMPLE_RATE_HZ,
): number {
  if (!(atHz > 0) || !Number.isFinite(atHz)) return 0;
  const c = biquadCoefficients(type, freqHz, q, gainDb, sampleRateHz);
  if (!c) return 0;
  const w = (2 * Math.PI * atHz) / sampleRateHz;
  const cosW = Math.cos(w);
  const cos2W = Math.cos(2 * w);
  const num =
    c.b0 * c.b0 +
    c.b1 * c.b1 +
    c.b2 * c.b2 +
    2 * (c.b0 * c.b1 + c.b1 * c.b2) * cosW +
    2 * c.b0 * c.b2 * cos2W;
  const den =
    1 +
    c.a1 * c.a1 +
    c.a2 * c.a2 +
    2 * (c.a1 + c.a1 * c.a2) * cosW +
    2 * c.a2 * cos2W;
  if (!(num > 0) || !(den > 0)) return 0;
  return 10 * Math.log10(num / den);
}

/** Respons total cascade koreksi (jumlah dB) pada satu frekuensi. */
export function correctionResponseDb(
  filters: readonly HeadphoneFilter[],
  atHz: number,
  sampleRateHz: number = COMBINED_CURVE_SAMPLE_RATE_HZ,
): number {
  let total = 0;
  for (const f of filters) {
    total += biquadMagnitudeDb(
      f.type,
      f.freqHz,
      f.q,
      f.gainDb,
      atHz,
      sampleRateHz,
    );
  }
  return total;
}

/**
 * Gain gabungan per titik band: EQ manual + preamp koreksi + respons
 * koreksi pada frekuensi band itu. null bila tidak ada koreksi yang bisa
 * digambar (tidak ada profil / tidak ada filter).
 */
export function combinedCurveGains(
  bands: readonly { frequency: number; gain: number }[],
  correction: ParsedCorrectionPreset | null,
  sampleRateHz: number = COMBINED_CURVE_SAMPLE_RATE_HZ,
): number[] | null {
  if (!correction || correction.filters.length === 0) return null;
  const preamp = Math.min(
    Math.max(
      Number.isFinite(correction.preampDb) ? correction.preampDb : 0,
      -40,
    ),
    40,
  );
  return bands.map(
    (b) =>
      (Number.isFinite(b.gain) ? b.gain : 0) +
      preamp +
      correctionResponseDb(correction.filters, b.frequency, sampleRateHz),
  );
}
