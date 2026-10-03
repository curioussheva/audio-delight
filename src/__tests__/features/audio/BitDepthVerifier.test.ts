/**
 * Mock analyzer - modul aslinya menyeret expo-file-system,
 * expo-media-library, dan @missingcore/audio-metadata. Yang diuji di sini
 * adalah logika heuristik, bukan pembacaan file.
 */
jest.mock("@/features/visualizer/api/analyzer", () => ({
  audioAnalyzer: { analyzeSong: jest.fn() },
}));

import {
  analyzeBitDepth,
  estimateRealBitDepth,
  calculateConfidence,
  theoreticalDrForBitDepth,
} from "../../../features/audio/api/BitDepthVerifier";
import { audioAnalyzer } from "@/features/visualizer/api/analyzer";
import type { Song } from "@/shared/types/audio";

const makeSong = (over: Partial<Song> = {}): Song =>
  ({
    id: "s1",
    uri: "file:///x.flac",
    title: "T",
    artist: "A",
    album: "Al",
    duration: 100,
    ...over,
  }) as Song;

const mockedAnalyze = audioAnalyzer.analyzeSong as jest.Mock;

const makeAnalysis = (over: Record<string, unknown> = {}) => ({
  songId: "s1",
  isLossless: true,
  confidence: 90,
  detectedBitrateKbps: 2000,
  estimatedSpectralCutoffHz: 40000,
  estimatedDynamicRangeDb: 110,
  peakFrequencyHz: 1000,
  warnings: [],
  analysisMethod: "heuristic" as const,
  format: { codec: "FLAC", sampleRate: 96000, bitDepth: 24, channels: 2 },
  ...over,
});

beforeEach(() => {
  mockedAnalyze.mockReset();
});

describe("estimateRealBitDepth - skala ambang", () => {
  // REGRESI UTAMA: ambang lama 18/26 (bukan 16/24) menuntut DR >= 110 dB
  // sebelum file diakui 24-bit. 24-bit asli realistis 100-120 dB DR,
  // sehingga hampir semua hi-res asli dituduh 16-bit alias palsu.
  it("REGRESI: 24-bit asli (DR 110) dikenali sebagai 24, bukan 16", () => {
    expect(estimateRealBitDepth(24, 110, 40000, 0, 2000, 96000)).toBe(24);
  });

  it("REGRESI: 24-bit asli DR rendah (100 dB) tetap 24", () => {
    expect(estimateRealBitDepth(24, 100, 40000, 0, 2000, 96000)).toBe(24);
  });

  it("16-bit (DR 96) tetap 16", () => {
    expect(estimateRealBitDepth(16, 96, 22050, 0, 1411, 44100)).toBe(16);
  });

  it("24-bit di-padding: DR 16-bit di file 24-bit -> 16", () => {
    // DR 90 dB konsisten dengan 16-bit, walau header bilang 24
    expect(estimateRealBitDepth(24, 90, 20000, 0, 1411, 44100)).toBe(16);
  });

  it("DR sangat tinggi -> 32", () => {
    expect(estimateRealBitDepth(32, 160, 80000, 0, 9000, 192000)).toBe(32);
  });

  it("batas 16/24 tepat di DR teoretis 16-bit (98.08 dB)", () => {
    const dr16 = theoreticalDrForBitDepth(16); // ~98.08
    // Sedikit di atas batas 16-bit -> 24-bit
    expect(estimateRealBitDepth(24, dr16 + 1, 40000, 0, 2000, 96000)).toBe(24);
  });
});

describe("estimateRealBitDepth - detektor upsample", () => {
  // REGRESI: parameter sampleRate dulu di-hardcode 44100 di pemanggil,
  // sehingga `sampleRate > 48000` selalu false dan upsample 44.1k -> 96k
  // tidak pernah terdeteksi.
  it("REGRESI: CD yang di-upsample ke 96k terdeteksi terbatas spektrum", () => {
    // DR 110 (kelihatan hi-res) tapi cutoff 22 kHz = isi CD
    const hasil = estimateRealBitDepth(24, 110, 22000, 0, 1411, 96000);
    expect(hasil).toBe(16);
  });

  it("cutoff di atas 22.05 kHz tidak dianggap terbatas", () => {
    expect(estimateRealBitDepth(24, 110, 30000, 0, 2000, 96000)).toBe(24);
  });

  it("sample rate 44.1k tidak pernah kena penalti spektral", () => {
    // cutoff 20k pada 44.1k itu normal, bukan indikasi upsample
    expect(estimateRealBitDepth(24, 110, 20000, 0, 1411, 44100)).toBe(24);
  });

  it("cutoff tepat di 22050 tidak dianggap terbatas (batas eksklusif)", () => {
    expect(estimateRealBitDepth(24, 110, 22050, 0, 2000, 96000)).toBe(24);
  });
});

describe("estimateRealBitDepth - rasio kompresi (padding)", () => {
  it("rasio sangat efisien pada 24-bit memicu penalti pengali 0.8", () => {
    const tanpa = estimateRealBitDepth(24, 110, 40000, 0, 2000, 96000);
    const dengan = estimateRealBitDepth(24, 110, 40000, 0.1, 2000, 96000);
    expect(tanpa).toBe(24);
    // 18.0 * 0.8 = 14.4 -> turun ke 16
    expect(dengan).toBe(16);
  });

  it("rasio di atas ambang tidak memicu penalti", () => {
    // expectedRatio untuk 24-bit = 0.45; ambang = 0.2925
    expect(estimateRealBitDepth(24, 110, 40000, 0.4, 2000, 96000)).toBe(24);
  });
});

describe("calculateConfidence", () => {
  it("tanpa selisih tidak mengurangi confidence", () => {
    expect(calculateConfidence(24, 24, 90)).toBe(90);
  });

  it("turun 5 poin per bit selisih", () => {
    expect(calculateConfidence(24, 20, 90)).toBe(70);
    expect(calculateConfidence(16, 24, 90)).toBe(50);
  });

  it("tidak pernah di bawah 0", () => {
    expect(calculateConfidence(32, 16, 10)).toBe(0);
  });

  it("tidak pernah di atas 100", () => {
    expect(calculateConfidence(24, 24, 150)).toBe(100);
  });
});

describe("theoreticalDrForBitDepth", () => {
  it("rumus 6.02N + 1.76", () => {
    expect(theoreticalDrForBitDepth(16)).toBeCloseTo(98.08, 2);
    expect(theoreticalDrForBitDepth(24)).toBeCloseTo(146.24, 2);
  });
});

describe("analyzeBitDepth - jalur lengkap", () => {
  it("memakai sampleRate dari lagu, bukan 44100", async () => {
    mockedAnalyze.mockResolvedValue(
      makeAnalysis({
        estimatedDynamicRangeDb: 110,
        estimatedSpectralCutoffHz: 22000, // isi CD
      }),
    );
    const hasil = await analyzeBitDepth(
      makeSong({ bitDepth: 24, sampleRate: 96000 }),
    );
    // Kalau sampleRate di-hardcode 44100, penalti spektral tidak jalan
    // dan hasilnya 24 (tidak terdeteksi).
    expect(hasil.realDepth).toBe(16);
    // 16 vs 24 = selisih 8 bit, di atas toleransi 4 -> ditandai fake
    expect(hasil.isFake).toBe(true);
  });

  it("file 16-bit tidak pernah fake", async () => {
    mockedAnalyze.mockResolvedValue(
      makeAnalysis({ estimatedDynamicRangeDb: 96, estimatedSpectralCutoffHz: 20000 }),
    );
    const hasil = await analyzeBitDepth(makeSong({ bitDepth: 16, sampleRate: 44100 }));
    expect(hasil.isFake).toBe(false);
  });

  it("fallback ke sampleRate analysis kalau lagu tidak punya", async () => {
    mockedAnalyze.mockResolvedValue(
      makeAnalysis({
        estimatedDynamicRangeDb: 110,
        estimatedSpectralCutoffHz: 22000,
        format: { codec: "FLAC", sampleRate: 96000, bitDepth: 24, channels: 2 },
      }),
    );
    const hasil = await analyzeBitDepth(makeSong({ bitDepth: 24 }));
    expect(hasil.realDepth).toBe(16);
  });

  it("analysis null -> confidence 0, tidak fake", async () => {
    mockedAnalyze.mockResolvedValue(null);
    const hasil = await analyzeBitDepth(makeSong({ bitDepth: 24 }));
    expect(hasil).toEqual({
      declaredDepth: 24,
      realDepth: 24,
      isFake: false,
      confidence: 0,
      paddingRatio: 0,
    });
  });

  it("analyzer melempar error -> tidak crash, confidence 0", async () => {
    mockedAnalyze.mockRejectedValue(new Error("boom"));
    const hasil = await analyzeBitDepth(makeSong({ bitDepth: 24 }));
    expect(hasil.confidence).toBe(0);
    expect(hasil.isFake).toBe(false);
  });

  it("bitDepth tidak ada di metadata -> dianggap 16", async () => {
    mockedAnalyze.mockResolvedValue(makeAnalysis({ estimatedDynamicRangeDb: 96 }));
    const hasil = await analyzeBitDepth(makeSong({}));
    expect(hasil.declaredDepth).toBe(16);
  });
});
