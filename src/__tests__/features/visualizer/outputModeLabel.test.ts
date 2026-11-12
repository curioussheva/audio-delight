import { getOutputModeLabel } from "@/features/visualizer/api/outputModeLabel";

const BIT_PERFECT_PATH = {
  canBeBitPerfect: true,
  rateHonored: true,
  pathLossy: false,
  honored: true,
} as const;

describe("getOutputModeLabel", () => {
  it('"Bit-Perfect" HANYA bila jalur terpenuhi DAN exclusive terkonfirmasi aktif', () => {
    expect(
      getOutputModeLabel({
        ...BIT_PERFECT_PATH,
        streamExclusive: true,
        exclusiveUnknown: false,
      }),
    ).toBe("Bit-Perfect");
  });

  it("jalur terpenuhi tapi exclusive ditolak (terkonfirmasi tidak aktif) → bukan bit-perfect", () => {
    expect(
      getOutputModeLabel({
        ...BIT_PERFECT_PATH,
        streamExclusive: false,
        exclusiveUnknown: false,
      }),
    ).toBe("Bukan bit-perfect");
  });

  it("jalur terpenuhi tapi exclusive belum terkonfirmasi (native belum siap / bacaan basi) → tidak dapat diverifikasi, JANGAN klaim Bit-Perfect", () => {
    expect(
      getOutputModeLabel({
        ...BIT_PERFECT_PATH,
        streamExclusive: true,
        exclusiveUnknown: true,
      }),
    ).toBe("Tidak dapat diverifikasi");
    expect(
      getOutputModeLabel({
        ...BIT_PERFECT_PATH,
        streamExclusive: false,
        exclusiveUnknown: true,
      }),
    ).toBe("Tidak dapat diverifikasi");
  });

  it("perangkat belum diketahui → tidak dapat disimpulkan (apa pun status exclusive-nya)", () => {
    expect(
      getOutputModeLabel({
        ...BIT_PERFECT_PATH,
        canBeBitPerfect: null,
        streamExclusive: true,
        exclusiveUnknown: false,
      }),
    ).toBe("Tidak dapat disimpulkan");
  });

  it("jalur lossy → jalur mustahil bit-perfect (tetap, walau exclusive aktif)", () => {
    expect(
      getOutputModeLabel({
        canBeBitPerfect: false,
        rateHonored: true,
        pathLossy: true,
        honored: true,
        streamExclusive: true,
        exclusiveUnknown: false,
      }),
    ).toBe("Jalur mustahil bit-perfect");
  });

  it("jalur tidak lossy tapi laju / perangkat tidak dihormati → bukan bit-perfect", () => {
    expect(
      getOutputModeLabel({
        canBeBitPerfect: true,
        rateHonored: false,
        pathLossy: false,
        honored: true,
        streamExclusive: true,
        exclusiveUnknown: false,
      }),
    ).toBe("Bukan bit-perfect");
    expect(
      getOutputModeLabel({
        canBeBitPerfect: true,
        rateHonored: true,
        pathLossy: false,
        honored: false,
        streamExclusive: true,
        exclusiveUnknown: false,
      }),
    ).toBe("Bukan bit-perfect");
  });
});
