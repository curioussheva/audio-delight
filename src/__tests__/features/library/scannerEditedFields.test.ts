/**
 * I3 (G2): editan user di [id].tsx tidak boleh tertimpa rescan.
 *
 * Regresi yang dikunci: `updateExistingSong` dulu menimpa
 * title/artist/album/genre/year/trackNumber/discNumber dari nilai
 * MediaStore setiap quickDiff/full scan — komentarnya mengklaim
 * "PRESERVE user data" padahal yang dipertahankan hanya
 * isFavorite/playCount/dll. Perilaku baru: field yang pernah diedit
 * user (edit manual + terapkan MusicBrainz di [id].tsx) ditandai di
 * kolom `edited_fields` (JSON array) dan dilewati `updateExistingSong`.
 * Enrichment TIDAK menandai — field hasil enrichment tetap boleh
 * diperbarui scan berikutnya.
 *
 * Pola mock mengikuti ScanDiffEngine.test.ts / scannerUpdateMetadata.test.ts.
 */
jest.mock("@/features/library/api/metadata", () => ({}));
jest.mock("@/features/library/native/MediaStoreModule", () => ({
  MediaStore: { queryAudioFiles: jest.fn() },
}));
jest.mock("@/shared/lib/sqlite", () => ({
  db: { execute: jest.fn(() => ({ rows: { _array: [] } })) },
}));

import { LibraryScanner } from "@/features/library/api/scanner";
import { db } from "@/shared/lib/sqlite";

const executeMock = db.execute as jest.Mock;

let existingRow: any = null;

const rowFor = (overrides: any = {}) => ({
  id: "1",
  uri: "content://media/external/audio/media/1",
  title: "Lagu Lama",
  artist: "Artis Lama",
  album: "Album Lama",
  duration: 200,
  ...overrides,
});

const lastUpdate = () => {
  const calls = executeMock.mock.calls.filter(([sql]: [string]) =>
    sql.startsWith("UPDATE songs SET"),
  );
  return calls[calls.length - 1] as [string, any[]] | undefined;
};

describe("I3 — updateMetadata menandai field yang diedit", () => {
  beforeEach(() => {
    existingRow = null;
    executeMock.mockClear();
    executeMock.mockImplementation((sql: string) => {
      if (/FROM songs WHERE id/i.test(sql)) {
        return { rows: { _array: existingRow ? [existingRow] : [] } };
      }
      return { rows: { _array: [] } };
    });
  });

  it("markEdited: field yang diedit masuk edited_fields, digabung dengan penanda lama", async () => {
    existingRow = rowFor({ edited_fields: '["artist"]' });

    await LibraryScanner.updateMetadata(
      "1",
      { title: "Baru", genre: "Rock" },
      { markEdited: true },
    );

    const update = lastUpdate();
    expect(update).toBeDefined();
    const [sql, params] = update as [string, any[]];
    expect(sql).toContain("title = ?");
    expect(sql).toContain("genre = ?");
    expect(sql).toContain("edited_fields = ?");
    expect(params).toContain(JSON.stringify(["artist", "genre", "title"]));
  });

  it("TANPA markEdited: edited_fields tidak disentuh (jalur enrichment)", async () => {
    existingRow = rowFor({ edited_fields: '["title"]' });

    await LibraryScanner.updateMetadata("1", { title: "Baru" });

    const update = lastUpdate();
    expect(update).toBeDefined();
    const [sql] = update as [string, any[]];
    expect(sql).toContain("title = ?");
    expect(sql).not.toContain("edited_fields");
  });

  it("markEdited: field yang tidak ditimpa scan (label) tidak ikut ditandai", async () => {
    existingRow = rowFor({});

    await LibraryScanner.updateMetadata(
      "1",
      { label: "XL", title: "Baru" },
      { markEdited: true },
    );

    const update = lastUpdate();
    expect(update).toBeDefined();
    const [, params] = update as [string, any[]];
    // Hanya "title" yang ditandai — label tidak ditimpa scan.
    expect(params).toContain(JSON.stringify(["title"]));
  });
});

describe("I3 — updateExistingSong melewati field yang ditandai", () => {
  beforeEach(() => {
    existingRow = null;
    executeMock.mockClear();
    executeMock.mockImplementation((sql: string) => {
      if (/FROM songs WHERE id/i.test(sql)) {
        return { rows: { _array: existingRow ? [existingRow] : [] } };
      }
      return { rows: { _array: [] } };
    });
  });

  const scanSong = () =>
    ({
      id: "1",
      uri: "content://media/external/audio/media/1",
      title: "Dari MediaStore",
      artist: "Artis Baru",
      album: "Album Baru",
      genre: "Pop",
      year: 1999,
      trackNumber: 5,
      discNumber: 1,
      duration: 200,
    }) as any;

  it("REGRESI G2: judul yang diedit user bertahan, field lain tetap ter-update", async () => {
    existingRow = rowFor({ edited_fields: '["title"]' });

    await LibraryScanner.saveToDatabase(scanSong());

    const update = lastUpdate();
    expect(update).toBeDefined();
    const [sql, params] = update as [string, any[]];
    expect(sql).not.toContain("title = ?");
    expect(params).not.toContain("Dari MediaStore");
    expect(sql).toContain("artist = ?");
    expect(sql).toContain("album = ?");
    expect(sql).toContain("year = ?");
    expect(sql).toContain("lastSeenAt = ?");
  });

  it("tanpa penanda: perilaku lama — semua field ter-update dari scan", async () => {
    existingRow = rowFor({});

    await LibraryScanner.saveToDatabase(scanSong());

    const update = lastUpdate();
    expect(update).toBeDefined();
    const [sql, params] = update as [string, any[]];
    expect(sql).toContain("title = ?");
    expect(sql).toContain("artist = ?");
    expect(params).toContain("Dari MediaStore");
  });
});

describe("I3 — dbRowToSong memetakan edited_fields", () => {
  it("JSON array valid → editedFields", () => {
    const song = LibraryScanner.dbRowToSong(
      rowFor({ edited_fields: '["title","artist"]' }),
    );
    expect(song.editedFields).toEqual(["title", "artist"]);
  });

  it("kolom kosong / JSON rusak → undefined (tidak throw)", () => {
    expect(
      LibraryScanner.dbRowToSong(rowFor({})).editedFields,
    ).toBeUndefined();
    expect(
      LibraryScanner.dbRowToSong(rowFor({ edited_fields: "bukan-json" }))
        .editedFields,
    ).toBeUndefined();
  });
});
