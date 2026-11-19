// src/__tests__/features/equalizer/scrollIndicator.test.ts
import {
  MIN_THUMB_WIDTH_PCT,
  computeScrollIndicator,
  formatBandFrequency,
} from "@/features/equalizer/utils/scrollIndicator";

describe("computeScrollIndicator", () => {
  it("konten muat seluruhnya: thumb penuh, kiri 0", () => {
    expect(
      computeScrollIndicator({ offsetX: 0, contentWidth: 300, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 100, thumbLeftPct: 0 });
    expect(
      computeScrollIndicator({ offsetX: 0, contentWidth: 200, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 100, thumbLeftPct: 0 });
  });

  it("belum terukur (lebar 0): thumb penuh, kiri 0", () => {
    expect(
      computeScrollIndicator({ offsetX: 0, contentWidth: 0, layoutWidth: 0 }),
    ).toEqual({ thumbWidthPct: 100, thumbLeftPct: 0 });
  });

  it("setengah tampak di awal: lebar 50, kiri 0", () => {
    expect(
      computeScrollIndicator({ offsetX: 0, contentWidth: 600, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 50, thumbLeftPct: 0 });
  });

  it("setengah tampak di tengah: lebar 50, kiri 25", () => {
    expect(
      computeScrollIndicator({ offsetX: 150, contentWidth: 600, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 50, thumbLeftPct: 25 });
  });

  it("setengah tampak di ujung: lebar 50, kiri 50", () => {
    expect(
      computeScrollIndicator({ offsetX: 300, contentWidth: 600, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 50, thumbLeftPct: 50 });
  });

  it("offset dijepit ke [0, maks]: negatif -> 0, lewat ujung -> 100 - lebar", () => {
    expect(
      computeScrollIndicator({ offsetX: -50, contentWidth: 600, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 50, thumbLeftPct: 0 });
    expect(
      computeScrollIndicator({ offsetX: 999, contentWidth: 600, layoutWidth: 300 }),
    ).toEqual({ thumbWidthPct: 50, thumbLeftPct: 50 });
  });

  it("konten sangat panjang: lebar thumb dijaga minimum, kiri dijepit", () => {
    expect(
      computeScrollIndicator({ offsetX: 1900, contentWidth: 2000, layoutWidth: 100 }),
    ).toEqual({
      thumbWidthPct: MIN_THUMB_WIDTH_PCT,
      thumbLeftPct: 100 - MIN_THUMB_WIDTH_PCT,
    });
  });
});

describe("formatBandFrequency", () => {
  it("di bawah 1000 apa adanya, 1000 ke atas jadi k", () => {
    expect(formatBandFrequency(31)).toBe("31");
    expect(formatBandFrequency(500)).toBe("500");
    expect(formatBandFrequency(1000)).toBe("1k");
    expect(formatBandFrequency(16000)).toBe("16k");
  });
});
