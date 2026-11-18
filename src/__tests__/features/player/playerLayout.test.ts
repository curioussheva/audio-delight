import {
  artworkSize,
  visualizerWidth,
  lyricsVerticalPadding,
} from "@/features/player/utils/playerLayout";

describe("playerLayout — artworkSize", () => {
  it("portrait: lebar layar - 100 (sama seperti sebelumnya)", () => {
    // POCO M6: 393x873 dp.
    expect(artworkSize(393, 873)).toBe(293);
  });

  it("landscape: dibatasi tinggi layar, tidak membesar ikut lebar", () => {
    // Layar sama setelah rotasi: 873 lebar, 393 tinggi.
    expect(artworkSize(873, 393)).toBe(293);
  });

  it("layar kecil: mengikuti dimensi terkecil", () => {
    expect(artworkSize(360, 640)).toBe(260);
    expect(artworkSize(800, 360)).toBe(260);
  });
});

describe("playerLayout — visualizerWidth", () => {
  it("lebar layar - 108 (padding konten 48 + panel 24 + skala 28 + margin 8)", () => {
    expect(visualizerWidth(393)).toBe(285);
    expect(visualizerWidth(800)).toBe(692);
  });
});

describe("playerLayout — lyricsVerticalPadding", () => {
  it("tinggi layar / 2,5 (sama seperti sebelumnya, tapi reaktif rotasi)", () => {
    expect(lyricsVerticalPadding(873)).toBeCloseTo(349.2);
    expect(lyricsVerticalPadding(436)).toBeCloseTo(174.4);
  });
});
