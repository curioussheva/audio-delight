// src/__tests__/features/library/trackListMerge.test.ts
//
// Tes murni untuk merge `setTracks` (Item 2 — spike completion scan):
// tanpa DB, tanpa runtime. Mengunci dua janji:
//   1. daftar segar yang isinya SAMA PERSIS dengan yang tampil ->
//      `changed: false` + array lama dikembalikan (pemanggil melewatkan
//      `set()` sepenuhnya — nol re-render);
//   2. daftar yang BERUBAH -> `changed: true`, isi + urutan SAMA
//      dengan daftar segar, tapi lagu yang tidak berubah memakai kembali
//      referensi objek lama (memo di bawah bisa melewatkannya).
import {
  isTrackContentEqual,
  mergeTrackList,
} from "@/features/library/store/trackListMerge";

type T = Record<string, unknown> & { id: string };

const track = (over: Record<string, unknown> = {}): T => ({
  id: "1",
  uri: "content://media/1",
  title: "Judul",
  artist: "Artis",
  album: "Album",
  duration: 180,
  codec: "MP3",
  isEnriched: false,
  isFavorite: false,
  lastSeenAt: 1700000000000,
  editedFields: undefined,
  ...over,
});

describe("isTrackContentEqual", () => {
  it("objek beda identitas, field sama -> sama", () => {
    expect(isTrackContentEqual(track(), track())).toBe(true);
  });

  it("satu field berubah -> beda", () => {
    expect(isTrackContentEqual(track(), track({ title: "Lain" }))).toBe(false);
  });

  it("editedFields: array beda identitas, elemen sama -> sama (JSON.parse tiap load)", () => {
    expect(
      isTrackContentEqual(
        track({ editedFields: ["title"] }),
        track({ editedFields: ["title"] }),
      ),
    ).toBe(true);
  });

  it("editedFields: elemen beda -> beda", () => {
    expect(
      isTrackContentEqual(
        track({ editedFields: ["title"] }),
        track({ editedFields: ["artist"] }),
      ),
    ).toBe(false);
  });

  it("kunci undefined vs kunci tak ada -> sama", () => {
    const a = track();
    const b = track();
    delete (b as Record<string, unknown>).editedFields;
    expect(isTrackContentEqual(a, b)).toBe(true);
  });

  it("nilai objek non-array beda referensi -> beda (konservatif, jangan basi)", () => {
    expect(
      isTrackContentEqual(
        track({ extra: { x: 1 } }),
        track({ extra: { x: 1 } }),
      ),
    ).toBe(false);
    const shared = { x: 1 };
    expect(
      isTrackContentEqual(track({ extra: shared }), track({ extra: shared })),
    ).toBe(true);
  });
});

describe("mergeTrackList", () => {
  it("daftar segar isi sama (objek baru semua) -> changed false, array lama dikembalikan", () => {
    const prev = [track({ id: "1" }), track({ id: "2", title: "Dua" })];
    const next = [track({ id: "1" }), track({ id: "2", title: "Dua" })];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(false);
    expect(merged.tracks).toBe(prev);
  });

  it("daftar kosong -> daftar segar: changed true, isi = next", () => {
    const next = [track({ id: "1" }), track({ id: "2" })];
    const merged = mergeTrackList([], next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks).toEqual(next);
  });

  it("satu lagu berubah judul -> hanya lagu itu objek baru, sisanya referensi lama", () => {
    const prev = [track({ id: "1" }), track({ id: "2" }), track({ id: "3" })];
    const next = [
      track({ id: "1" }),
      track({ id: "2", title: "Baru" }),
      track({ id: "3" }),
    ];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks[0]).toBe(prev[0]);
    expect(merged.tracks[1]).toBe(next[1]);
    expect(merged.tracks[1]).not.toBe(prev[1]);
    expect(merged.tracks[2]).toBe(prev[2]);
    expect(merged.tracks.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("lagu baru di akhir -> lagu lama dipakai ulang, urutan dipertahankan", () => {
    const prev = [track({ id: "1" }), track({ id: "2" })];
    const next = [track({ id: "1" }), track({ id: "2" }), track({ id: "9" })];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks[0]).toBe(prev[0]);
    expect(merged.tracks[1]).toBe(prev[1]);
    expect(merged.tracks[2]).toBe(next[2]);
  });

  it("lagu hilang -> changed true, sisanya referensi lama", () => {
    const prev = [track({ id: "1" }), track({ id: "2" }), track({ id: "3" })];
    const next = [track({ id: "1" }), track({ id: "3" })];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks).toEqual([prev[0], prev[2]]);
    expect(merged.tracks[0]).toBe(prev[0]);
    expect(merged.tracks[1]).toBe(prev[2]);
  });

  it("urutan berubah (isi sama) -> changed true, referensi dipakai ulang, urutan = next", () => {
    const prev = [track({ id: "1" }), track({ id: "2" })];
    const next = [track({ id: "2" }), track({ id: "1" })];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks.map((t) => t.id)).toEqual(["2", "1"]);
    expect(merged.tracks[0]).toBe(prev[1]);
    expect(merged.tracks[1]).toBe(prev[0]);
  });

  it("array yang sama (referensi) -> changed false tanpa kerja", () => {
    const prev = [track({ id: "1" })];
    expect(mergeTrackList(prev, prev)).toEqual({ tracks: prev, changed: false });
  });

  it("isEnriched berubah (enrichment selesai) -> lagu itu saja yang baru", () => {
    const prev = [track({ id: "1", isEnriched: false }), track({ id: "2" })];
    const next = [track({ id: "1", isEnriched: true }), track({ id: "2" })];
    const merged = mergeTrackList(prev, next);
    expect(merged.changed).toBe(true);
    expect(merged.tracks[0]).toBe(next[0]);
    expect(merged.tracks[1]).toBe(prev[1]);
  });
});
