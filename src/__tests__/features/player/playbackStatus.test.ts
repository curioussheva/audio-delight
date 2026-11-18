import { sleepRemainingMinutes } from "@/features/player/utils/playbackStatus";

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
