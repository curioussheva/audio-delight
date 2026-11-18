import {
  artworkSize,
  visualizerWidth,
  lyricsVerticalPadding,
  VISUALIZER_CANVAS_HEIGHT,
  PLAYER_CHROME_DP,
  PLAYER_CHIPS_DP,
  PLAYER_ARTWORK_MIN_DP,
} from "@/features/player/utils/playerLayout";

describe("playerLayout — artworkSize (LAYOUT-V3: anggaran vertikal)", () => {
  it("POCO M6 360x800 muat 1 layar: 800 - 24 - 48 - 586 = 142", () => {
    expect(artworkSize(360, 800)).toBe(142);
  });

  it("POCO M6 393x873 muat 1 layar: 873 - 24 - 48 - 586 = 215", () => {
    expect(artworkSize(393, 873)).toBe(215);
  });

  it("chip speed/tuning tampil: sampul mengecil 41dp supaya tetap muat", () => {
    expect(artworkSize(360, 800, 24, 48, true)).toBe(101);
    expect(artworkSize(393, 873, 24, 48, true)).toBe(174);
  });

  it("gesture nav (insets.bottom kecil): selisihnya jadi ruang sampul", () => {
    // insets.bottom 20 (bukan 48): 800 - 24 - 20 - 586 = 170.
    expect(artworkSize(360, 800, 24, 20)).toBe(170);
  });

  it("dibatasi lebar: tidak lebih dari lebar layar - 100", () => {
    // Layar sangat tinggi: anggaran tinggi 750, tapi lebar 800 - 100 = 700.
    expect(artworkSize(800, 1400)).toBe(700);
  });

  it("layar kecil/landscape: lantai 96, ScrollView jadi pengaman scroll", () => {
    expect(artworkSize(360, 640)).toBe(96);
    expect(artworkSize(800, 360)).toBe(96);
    expect(artworkSize(873, 393)).toBe(96);
  });

  it("konstanta anggaran terdokumentasi (bila style berubah, ubah ini)", () => {
    expect(PLAYER_CHROME_DP).toBe(586);
    expect(PLAYER_CHIPS_DP).toBe(41);
    expect(PLAYER_ARTWORK_MIN_DP).toBe(96);
    expect(VISUALIZER_CANVAS_HEIGHT).toBe(64);
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
