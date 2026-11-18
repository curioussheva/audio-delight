/**
 * U1: MusicBrainz = "sapu bersih" — hanya isi field yang masih kosong,
 * tidak pernah timpa data lokal. Logika murni diuji di sini; tampilan
 * ([id].tsx: penanda + tombol + seksi artis, modal: tag per hasil)
 * diverifikasi di HP.
 */
import {
  isFieldMissing,
  missingMetadataFields,
  countMissingMetadata,
  fillEmptyFields,
  previewOnlineFill,
} from "@/features/library/utils/metadataCompleteness";

const COMPLETE: any = {
  title: "Lagu",
  artist: "Artis Nyata",
  album: "Album Nyata",
  year: 2020,
  label: "Label",
  artwork: "file:///cover.jpg",
  artistImageUrl: "https://x/img.jpg",
  artistBio: "Bio artis.",
};

describe("isFieldMissing", () => {
  it("semua terisi → tidak ada yang kosong", () => {
    expect(missingMetadataFields(COMPLETE)).toEqual([]);
    expect(countMissingMetadata(COMPLETE)).toBe(0);
  });

  it("placeholder MediaStore dihitung kosong", () => {
    expect(isFieldMissing({ ...COMPLETE, artist: "Unknown Artist" }, "artist")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, album: "Unknown Album" }, "album")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, artist: " Artis " }, "artist")).toBe(false);
  });

  it("string kosong / spasi / undefined / tahun 0 = kosong", () => {
    expect(isFieldMissing({ ...COMPLETE, label: "" }, "label")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, label: "   " }, "label")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, artistBio: undefined }, "artistBio")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, year: 0 }, "year")).toBe(true);
    expect(isFieldMissing({ ...COMPLETE, year: undefined }, "year")).toBe(true);
  });

  it("penghitung: 3 kosong → badge 3", () => {
    const song = { ...COMPLETE, album: "Unknown Album", label: "", artistBio: undefined };
    expect(missingMetadataFields(song)).toEqual(["album", "label", "artistBio"]);
    expect(countMissingMetadata(song)).toBe(3);
  });
});

describe("fillEmptyFields — isi-yang-kosong-saja", () => {
  const ONLINE = {
    title: "Judul Online",
    artist: "Artis Online",
    album: "Album Online",
    year: "2021",
    label: "Label Online",
    artwork: "https://coverart/x.jpg",
    artistImageUrl: "https://x/img2.jpg",
    artistBio: "Bio online.",
  };

  it("field kosong terisi, field terisi TIDAK PERNAH tertimpa", () => {
    const local = { ...COMPLETE, album: "Unknown Album", label: undefined, year: undefined };
    const out = fillEmptyFields(local, ONLINE);
    // Hanya yang kosong yang ada di hasil:
    expect(out).toEqual({
      album: "Album Online",
      year: 2021,
      label: "Label Online",
    });
    expect(out.title).toBeUndefined();
    expect(out.artist).toBeUndefined();
    expect(out.artwork).toBeUndefined();
    expect(out.artistImageUrl).toBeUndefined();
    expect(out.artistBio).toBeUndefined();
  });

  it("semua kosong → semua terisi dari online", () => {
    const local: any = { title: "", artist: "", album: "", year: undefined };
    const out = fillEmptyFields(local, ONLINE);
    expect(out.title).toBe("Judul Online");
    expect(out.artist).toBe("Artis Online");
    expect(out.album).toBe("Album Online");
    expect(out.year).toBe(2021);
    expect(out.label).toBe("Label Online");
    expect(out.artwork).toBe("https://coverart/x.jpg");
    expect(out.artistImageUrl).toBe("https://x/img2.jpg");
    expect(out.artistBio).toBe("Bio online.");
  });

  it("cover hanya diisi bila artwork lokal kosong", () => {
    const withCover = fillEmptyFields(COMPLETE, ONLINE);
    expect(withCover.artwork).toBeUndefined();
    const withoutCover = fillEmptyFields({ ...COMPLETE, artwork: "" }, ONLINE);
    expect(withoutCover.artwork).toBe("https://coverart/x.jpg");
  });

  it("foto/bio artis hanya diisi bila kosong", () => {
    expect(fillEmptyFields(COMPLETE, ONLINE).artistBio).toBeUndefined();
    const out = fillEmptyFields(
      { ...COMPLETE, artistImageUrl: undefined, artistBio: "" },
      ONLINE,
    );
    expect(out.artistImageUrl).toBe("https://x/img2.jpg");
    expect(out.artistBio).toBe("Bio online.");
  });

  it("tahun online non-numerik diabaikan (bukan NaN, bukan timpa)", () => {
    const out = fillEmptyFields({ ...COMPLETE, year: undefined }, { year: "tahun?" });
    expect(out.year).toBeUndefined();
    // Tahun lokal yang sudah ada tidak pernah disentuh walau online aneh:
    expect(fillEmptyFields(COMPLETE, { year: "tahun?" }).year).toBeUndefined();
  });

  it("online kosong → hasil kosong (tidak ada yang ditulis)", () => {
    expect(fillEmptyFields({ ...COMPLETE, label: undefined }, {})).toEqual({});
  });

  it("nilai online di-trim", () => {
    const out = fillEmptyFields({ ...COMPLETE, label: undefined }, { label: "  L  " });
    expect(out.label).toBe("L");
  });
});

describe("previewOnlineFill — tag modal", () => {
  it("akan diisi vs sudah ada — tidak diubah", () => {
    const missing = ["album", "label", "artwork"] as const;
    const preview = previewOnlineFill([...missing], {
      title: "Judul Online",
      artist: "Artis Online",
      album: "Album Online",
      year: "2021",
      label: "Label Online",
      artwork: "https://coverart/x.jpg",
    });
    expect(preview.toFill).toEqual(["album", "label", "artwork"]);
    expect(preview.kept).toEqual(["title", "artist", "year"]);
  });

  it("field yang online-nya kosong tidak masuk ke mana-mana", () => {
    const preview = previewOnlineFill(["album", "label"], {
      title: "T",
      album: "A",
    });
    expect(preview.toFill).toEqual(["album"]);
    expect(preview.kept).toEqual(["title"]);
  });

  it("semua sudah ada → toFill kosong", () => {
    const preview = previewOnlineFill([], {
      title: "T",
      album: "A",
      year: "2020",
    });
    expect(preview.toFill).toEqual([]);
    expect(preview.kept).toEqual(["title", "album", "year"]);
  });
});
