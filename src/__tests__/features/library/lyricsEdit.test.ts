/**
 * L2: menu Lirik di [id].tsx — logika murni (status, parse tempelan,
 * penanda manual).
 *
 * Yang dikunci: status dari DB (synced menang atas polos), tempelan LRC
 * vs polos (termasuk tag LRC yang diabaikan + teks kosong), isi awal
 * editor, dan penanda "diatur manual" yang menghalangi proses otomatis
 * menghidupkan lagi lirik yang dihapus user.
 */
import {
  getLyricsKind,
  lyricsLineCount,
  parsePastedLyrics,
  lyricsToDisplayText,
  isLyricsManuallySet,
  mergeEditedFields,
} from "@/features/library/utils/lyricsEdit";
import { UNSYNCED_LYRIC_TIME } from "@/shared/utils/LrcParser";

describe("getLyricsKind + lyricsLineCount", () => {
  it("synced menang atas polos; hitung baris dari yang tampil", () => {
    const song = {
      lyrics: "a\nb",
      lyricsSynced: "[00:01.00]la\n[00:05.00]li",
    };
    expect(getLyricsKind(song)).toBe("synced");
    expect(lyricsLineCount(song)).toBe(2);
  });

  it("polos saja → plain, hitung per baris teks", () => {
    expect(getLyricsKind({ lyrics: "a\nb\nc" })).toBe("plain");
    expect(lyricsLineCount({ lyrics: "a\nb\nc" })).toBe(3);
  });

  it("kosong / hanya spasi → none, 0 baris", () => {
    expect(getLyricsKind({})).toBe("none");
    expect(getLyricsKind({ lyrics: "   ", lyricsSynced: "  " })).toBe("none");
    expect(lyricsLineCount({ lyrics: "   " })).toBe(0);
  });

  it("synced rusak (tanpa baris ber-timestamp) → 0 baris", () => {
    expect(lyricsLineCount({ lyricsSynced: "[ti:Judul]\n[ar:Artis]" })).toBe(
      0,
    );
  });
});

describe("parsePastedLyrics", () => {
  it("LRC: tag [ti:]/[ar:] diabaikan, baris ber-timestamp jadi synced", () => {
    const parsed = parsePastedLyrics(
      "[ti:Judul]\n[ar:Artis]\n[00:01.00]la\n[00:05.50]li",
    );
    expect(parsed?.kind).toBe("synced");
    expect(parsed?.lyrics).toBe("");
    expect(parsed?.lyricsSynced).toContain("[00:01.00]la");
    expect(parsed?.lines).toEqual([
      { time: 1000, text: "la" },
      { time: 5500, text: "li" },
    ]);
  });

  it("teks polos → plain, satu baris per baris teks", () => {
    const parsed = parsePastedLyrics("baris satu\nbaris dua\n\nbaris tiga");
    expect(parsed?.kind).toBe("plain");
    expect(parsed?.lyrics).toBe("baris satu\nbaris dua\n\nbaris tiga");
    expect(parsed?.lyricsSynced).toBe("");
    expect(parsed?.lines).toEqual([
      { time: UNSYNCED_LYRIC_TIME, text: "baris satu" },
      { time: UNSYNCED_LYRIC_TIME, text: "baris dua" },
      { time: UNSYNCED_LYRIC_TIME, text: "baris tiga" },
    ]);
  });

  it("campuran: ada timestamp → synced (baris polos ikut tersimpan mentah)", () => {
    const parsed = parsePastedLyrics("[00:01.00]la\nbaris tanpa waktu");
    expect(parsed?.kind).toBe("synced");
    expect(parsed?.lines).toEqual([{ time: 1000, text: "la" }]);
    expect(parsed?.lyricsSynced).toContain("baris tanpa waktu");
  });

  it("kosong / hanya spasi → null", () => {
    expect(parsePastedLyrics("")).toBeNull();
    expect(parsePastedLyrics("   \n  ")).toBeNull();
  });
});

describe("lyricsToDisplayText", () => {
  it("synced diutamakan, kalau tidak ada pakai polos", () => {
    expect(
      lyricsToDisplayText({ lyrics: "polos", lyricsSynced: "[00:01.00]x" }),
    ).toBe("[00:01.00]x");
    expect(lyricsToDisplayText({ lyrics: "polos" })).toBe("polos");
    expect(lyricsToDisplayText({})).toBe("");
  });
});

describe("isLyricsManuallySet + mergeEditedFields", () => {
  it("ditandai bila editedFields memuat lyrics / lyricsSynced", () => {
    expect(isLyricsManuallySet({ editedFields: ["lyricsSynced"] })).toBe(true);
    expect(isLyricsManuallySet({ editedFields: ["lyrics"] })).toBe(true);
    expect(isLyricsManuallySet({ editedFields: ["title"] })).toBe(false);
    expect(isLyricsManuallySet({})).toBe(false);
    expect(isLyricsManuallySet({ editedFields: null })).toBe(false);
  });

  it("gabung penanda lama + baru, unik dan terurut", () => {
    expect(mergeEditedFields(["title"], "lyrics", "lyricsSynced")).toEqual([
      "lyrics",
      "lyricsSynced",
      "title",
    ]);
    expect(mergeEditedFields(undefined, "lyrics")).toEqual(["lyrics"]);
    expect(mergeEditedFields(["lyrics"], "lyrics", "lyricsSynced")).toEqual([
      "lyrics",
      "lyricsSynced",
    ]);
  });
});
