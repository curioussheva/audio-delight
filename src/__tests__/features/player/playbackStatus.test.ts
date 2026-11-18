import {
  sleepRemainingMinutes,
  formatSpeedChip,
  formatTuningChip,
} from "@/features/player/utils/playbackStatus";
import { A432_CENTS } from "@/features/player/utils/tuning";

describe("playbackStatus — sleepRemainingMinutes", () => {
  const NOW = 1_000_000_000;

  it("null bila timer mati", () => {
    expect(sleepRemainingMinutes(null, NOW)).toBeNull();
  });

  it("15 menit penuh -> 15", () => {
    expect(sleepRemainingMinutes(NOW + 15 * 60000, NOW)).toBe(15);
  });

  it("14,9 menit dibulatkan ke atas -> 15 (cocok opsi modal)", () => {
    expect(sleepRemainingMinutes(NOW + 14.9 * 60000, NOW)).toBe(15);
  });

  it("tepat di akhir -> 0 (indikator mati)", () => {
    expect(sleepRemainingMinutes(NOW, NOW)).toBe(0);
  });

  it("sudah lewat -> 0, bukan negatif", () => {
    expect(sleepRemainingMinutes(NOW - 5000, NOW)).toBe(0);
  });
});

describe("playbackStatus — formatSpeedChip", () => {
  it("1.0x (default) -> null", () => {
    expect(formatSpeedChip(1)).toBeNull();
  });

  it("1.5x -> '1.50×'", () => {
    expect(formatSpeedChip(1.5)).toBe("1.50×");
  });

  it("0.75x -> '0.75×'", () => {
    expect(formatSpeedChip(0.75)).toBe("0.75×");
  });
});

describe("playbackStatus — formatTuningChip", () => {
  it("0 sen (A=440 default) -> null", () => {
    expect(formatTuningChip(0)).toBeNull();
  });

  it("preset Verdi -> 'A=432'", () => {
    expect(formatTuningChip(A432_CENTS)).toBe("A=432");
  });

  it("+50 sen -> frekuensi A", () => {
    expect(formatTuningChip(50)).toBe("A=452.9 Hz");
  });

  it("-50 sen -> frekuensi A", () => {
    expect(formatTuningChip(-50)).toBe("A=427.5 Hz");
  });
});
