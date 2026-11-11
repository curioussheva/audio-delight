/**
 * Definisi standar kualitas audio (U-P1-01).
 *
 * Standar: HI-RES = codec lossless DAN (sampleRate > 48000 ATAU
 * bitDepth > 16). LOSSLESS ditentukan codec saja — jangan pernah dari
 * bitDepth (MediaStore memberi default 16 ke file tanpa BITS_PER_SAMPLE).
 * "M4A" sengaja bukan lossless: wadah itu bisa ALAC atau AAC.
 */

import {
  isLosslessCodec,
  isHiRes,
  LOSSLESS_CODECS,
} from "@/shared/utils/audioQuality";

describe("isLosslessCodec", () => {
  it("mengenali semua codec lossless standar", () => {
    for (const codec of [
      "FLAC",
      "ALAC",
      "WAV",
      "AIFF",
      "APE",
      "WAVPACK",
      "TTA",
      "DSD",
      "DSF",
      "DFF",
    ]) {
      expect(isLosslessCodec(codec)).toBe(true);
    }
  });

  it("menolak codec lossy", () => {
    for (const codec of ["MP3", "AAC", "OGG", "VORBIS", "OPUS", "WMA"]) {
      expect(isLosslessCodec(codec)).toBe(false);
    }
  });

  it("menolak M4A — wadah, bukan codec (bisa ALAC atau AAC)", () => {
    expect(isLosslessCodec("M4A")).toBe(false);
    expect(isLosslessCodec("MP4")).toBe(false);
  });

  it("tidak peduli huruf besar/kecil dan spasi", () => {
    expect(isLosslessCodec("flac")).toBe(true);
    expect(isLosslessCodec("  Alac ")).toBe(true);
    expect(isLosslessCodec("mp3")).toBe(false);
  });

  it("aman untuk null / undefined / string kosong", () => {
    expect(isLosslessCodec(null)).toBe(false);
    expect(isLosslessCodec(undefined)).toBe(false);
    expect(isLosslessCodec("")).toBe(false);
  });

  it("daftar LOSSLESS_CODECS memuat tepat 10 codec standar", () => {
    expect(LOSSLESS_CODECS.size).toBe(10);
  });
});

describe("isHiRes", () => {
  it("FLAC 96 kHz / 16-bit = HI-RES (rate melebihi CD)", () => {
    expect(
      isHiRes({ codec: "FLAC", sampleRate: 96000, bitDepth: 16 }),
    ).toBe(true);
  });

  it("FLAC 44,1 kHz / 24-bit = HI-RES (depth melebihi CD)", () => {
    expect(
      isHiRes({ codec: "FLAC", sampleRate: 44100, bitDepth: 24 }),
    ).toBe(true);
  });

  it("FLAC 16-bit / 44,1 kHz = BUKAN Hi-Res (lossless tapi CD-quality)", () => {
    expect(
      isHiRes({ codec: "FLAC", sampleRate: 44100, bitDepth: 16 }),
    ).toBe(false);
  });

  it("batas tepat 48 kHz / 16-bit = BUKAN Hi-Res (harus MELEBIHI)", () => {
    expect(
      isHiRes({ codec: "FLAC", sampleRate: 48000, bitDepth: 16 }),
    ).toBe(false);
    expect(
      isHiRes({ codec: "WAV", sampleRate: 48000, bitDepth: 16 }),
    ).toBe(false);
  });

  it("AAC 96 kHz = BUKAN Hi-Res (lossy, apa pun ratenya)", () => {
    expect(
      isHiRes({ codec: "AAC", sampleRate: 96000, bitDepth: 24 }),
    ).toBe(false);
  });

  it("MP3 24-bit = BUKAN Hi-Res (lossy, apa pun depth-nya)", () => {
    expect(
      isHiRes({ codec: "MP3", sampleRate: 48000, bitDepth: 24 }),
    ).toBe(false);
  });

  it("M4A 96 kHz = BUKAN Hi-Res (wadah, tidak bisa dipastikan lossless)", () => {
    expect(
      isHiRes({ codec: "M4A", sampleRate: 96000, bitDepth: 24 }),
    ).toBe(false);
  });

  it("aman untuk data kosong / tidak lengkap", () => {
    expect(isHiRes(null)).toBe(false);
    expect(isHiRes(undefined)).toBe(false);
    expect(isHiRes({})).toBe(false);
    // Lossless tapi rate/depth tidak diketahui: tidak bisa klaim Hi-Res.
    expect(isHiRes({ codec: "FLAC" })).toBe(false);
    expect(isHiRes({ codec: "FLAC", sampleRate: 96000 })).toBe(true);
    expect(isHiRes({ codec: "FLAC", bitDepth: 24 })).toBe(true);
  });

  it("tidak peduli huruf codec", () => {
    expect(
      isHiRes({ codec: "flac", sampleRate: 96000, bitDepth: 16 }),
    ).toBe(true);
  });
});
