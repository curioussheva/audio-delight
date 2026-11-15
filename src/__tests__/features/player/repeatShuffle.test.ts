import {
  parseRepeatShuffleEvent,
  repeatModeFromNativeInt,
} from "@/features/player/utils/repeatShuffle";

describe("repeatModeFromNativeInt", () => {
  it("0=off, 1=track, 2=all (kontrak native, koreksi J-M1)", () => {
    expect(repeatModeFromNativeInt(0)).toBe("off");
    expect(repeatModeFromNativeInt(1)).toBe("track");
    expect(repeatModeFromNativeInt(2)).toBe("all");
  });

  it("nilai di luar kontrak jatuh ke off", () => {
    expect(repeatModeFromNativeInt(3)).toBe("off");
    expect(repeatModeFromNativeInt(-1)).toBe("off");
  });
});

describe("parseRepeatShuffleEvent", () => {
  it("payload valid {repeatMode, shuffle} lolos apa adanya", () => {
    expect(
      parseRepeatShuffleEvent({ repeatMode: "off", shuffle: false }),
    ).toEqual({ repeat: "off", shuffle: false });
    expect(
      parseRepeatShuffleEvent({ repeatMode: "all", shuffle: true }),
    ).toEqual({ repeat: "all", shuffle: true });
    expect(
      parseRepeatShuffleEvent({ repeatMode: "track", shuffle: false }),
    ).toEqual({ repeat: "track", shuffle: false });
  });

  it("payload bukan objek ditolak", () => {
    expect(parseRepeatShuffleEvent(null)).toBeNull();
    expect(parseRepeatShuffleEvent(undefined)).toBeNull();
    expect(parseRepeatShuffleEvent("off")).toBeNull();
    expect(parseRepeatShuffleEvent(1)).toBeNull();
  });

  it("repeatMode di luar off/all/track ditolak", () => {
    expect(
      parseRepeatShuffleEvent({ repeatMode: "one", shuffle: true }),
    ).toBeNull();
    expect(
      parseRepeatShuffleEvent({ repeatMode: 1, shuffle: true }),
    ).toBeNull();
    expect(parseRepeatShuffleEvent({ shuffle: true })).toBeNull();
  });

  it("shuffle bukan boolean ditolak", () => {
    expect(
      parseRepeatShuffleEvent({ repeatMode: "off", shuffle: 1 }),
    ).toBeNull();
    expect(
      parseRepeatShuffleEvent({ repeatMode: "off", shuffle: "true" }),
    ).toBeNull();
    expect(parseRepeatShuffleEvent({ repeatMode: "off" })).toBeNull();
  });
});
