// src/__tests__/features/equalizer/modeInfo.test.ts
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import type { AudioMode } from "@/features/player/store/playerStore";

const MODES: AudioMode[] = ["bit-perfect", "dsp", "immersive"];

describe("MODE_INFO", () => {
  it("ketiga mode punya label + deskripsi non-kosong", () => {
    for (const mode of MODES) {
      expect(MODE_INFO[mode].label.trim().length).toBeGreaterThan(0);
      expect(MODE_INFO[mode].description.trim().length).toBeGreaterThan(0);
    }
  });

  it("deskripsi tiap mode berbeda", () => {
    const descriptions = MODES.map((m) => MODE_INFO[m].description);
    expect(new Set(descriptions).size).toBe(MODES.length);
  });
});
