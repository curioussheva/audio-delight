// src/__tests__/features/equalizer/scrollIndicator.test.ts
import {
  MIN_THUMB_WIDTH_PCT,
  canScrollLeft,
  canScrollRight,
  computeScrollIndicator,
  formatBandFrequency,
  formatBandFrequencyFull,
  pageScrollOffset,
  visibleBandRange,
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

describe("formatBandFrequencyFull", () => {
  it("legenda lengkap: Hz di bawah 1000, kHz di atasnya", () => {
    expect(formatBandFrequencyFull(31)).toBe("31 Hz");
    expect(formatBandFrequencyFull(500)).toBe("500 Hz");
    expect(formatBandFrequencyFull(1000)).toBe("1 kHz");
    expect(formatBandFrequencyFull(16000)).toBe("16 kHz");
  });
});

describe("canScrollLeft / canScrollRight", () => {
  const mid = { offsetX: 150, contentWidth: 666, layoutWidth: 274 };
  const start = { offsetX: 0, contentWidth: 666, layoutWidth: 274 };
  const end = { offsetX: 392, contentWidth: 666, layoutWidth: 274 };
  const fits = { offsetX: 0, contentWidth: 200, layoutWidth: 300 };
  const unmeasured = { offsetX: 0, contentWidth: 0, layoutWidth: 0 };

  it("tengah: dua arah bisa", () => {
    expect(canScrollLeft(mid)).toBe(true);
    expect(canScrollRight(mid)).toBe(true);
  });

  it("awal: kiri mati, kanan hidup; ujung: sebaliknya", () => {
    expect(canScrollLeft(start)).toBe(false);
    expect(canScrollRight(start)).toBe(true);
    expect(canScrollLeft(end)).toBe(true);
    expect(canScrollRight(end)).toBe(false);
  });

  it("konten muat atau belum terukur: dua arah mati", () => {
    expect(canScrollLeft(fits)).toBe(false);
    expect(canScrollRight(fits)).toBe(false);
    expect(canScrollLeft(unmeasured)).toBe(false);
    expect(canScrollRight(unmeasured)).toBe(false);
  });
});

describe("pageScrollOffset", () => {
  const mid = { offsetX: 150, contentWidth: 666, layoutWidth: 274 };
  const start = { offsetX: 0, contentWidth: 666, layoutWidth: 274 };
  const end = { offsetX: 392, contentWidth: 666, layoutWidth: 274 };

  it("geser satu halaman ke kanan/kiri", () => {
    expect(pageScrollOffset(mid, 1)).toBe(392);
    expect(pageScrollOffset(mid, -1)).toBe(0);
  });

  it("dijepit di ujung: tidak lewat 0 / maxOffset", () => {
    expect(pageScrollOffset(start, -1)).toBe(0);
    expect(pageScrollOffset(end, 1)).toBe(392);
  });

  it("belum terukur atau konten muat: tetap di tempat", () => {
    const unmeasured = { offsetX: 0, contentWidth: 0, layoutWidth: 0 };
    expect(pageScrollOffset(unmeasured, 1)).toBe(0);
    const fits = { offsetX: 0, contentWidth: 200, layoutWidth: 300 };
    expect(pageScrollOffset(fits, 1)).toBe(0);
  });
});

describe("visibleBandRange", () => {
  const base = {
    contentWidth: 666,
    layoutWidth: 274,
    bandCount: 10,
    bandWidth: 65,
    contentPadding: 8,
  };

  it("awal: band 1–5 (indeks 0–4)", () => {
    expect(visibleBandRange({ ...base, offsetX: 0 })).toEqual({
      firstIndex: 0,
      lastIndex: 4,
    });
  });

  it("tengah: band 3–7 (indeks 2–6)", () => {
    expect(visibleBandRange({ ...base, offsetX: 150 })).toEqual({
      firstIndex: 2,
      lastIndex: 6,
    });
  });

  it("ujung: band 6–10 (indeks 5–9)", () => {
    expect(visibleBandRange({ ...base, offsetX: 392 })).toEqual({
      firstIndex: 5,
      lastIndex: 9,
    });
  });

  it("belum terukur: asumsikan tampilan awal band 1–5", () => {
    expect(
      visibleBandRange({
        offsetX: 0,
        contentWidth: 0,
        layoutWidth: 0,
        bandCount: 10,
        bandWidth: 65,
        contentPadding: 8,
      }),
    ).toEqual({ firstIndex: 0, lastIndex: 4 });
  });

  it("tanpa band: 0–0", () => {
    expect(
      visibleBandRange({ ...base, offsetX: 0, bandCount: 0 }),
    ).toEqual({ firstIndex: 0, lastIndex: 0 });
  });
});
