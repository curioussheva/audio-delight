/**
 * U-P2-06: dedup getArtistEnrichment — dua panggilan bersamaan untuk artis
 * yang sama harus berbagi satu rangkaian request jaringan, bukan dua.
 * Cache SQLite di-mock sebagai miss; fetch di-mock dengan jawaban
 * MusicBrainz kalengan. Delay rate-limit 1100ms di service tetap jalan
 * (waktu nyata), jadi tes ini ~1,5 detik.
 */
jest.mock("@/shared/lib/sqlite", () => ({
  db: {
    execute: jest.fn(() => ({ rows: { item: () => undefined } })),
  },
}));

// clearArtistCache menyentuh libraryStore (cermin di memori) — mock store
// supaya tes tidak memuat zustand + AsyncStorage sungguhan.
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: {
    getState: jest.fn(() => ({ tracks: [], setTracks: jest.fn() })),
  },
}));

import OnlineMetadataService from "../../../features/library/services/OnlineMetadataService";
import { db } from "@/shared/lib/sqlite";
import { useLibraryStore } from "@/features/library/store/libraryStore";

const jsonResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe("getArtistEnrichment dedup (U-P2-06)", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/artist/?query=")) {
        return Promise.resolve(jsonResponse({ artists: [{ id: "mbid-1" }] }));
      }
      if (url.includes("/release-group?")) {
        return Promise.resolve(
          jsonResponse({ "release-groups": [{ id: "rg-1" }] }),
        );
      }
      if (url.includes("/artist/mbid-1?")) {
        return Promise.resolve(jsonResponse({ relations: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it(
    "dua panggilan bersamaan untuk artis yang sama hanya menembak satu pencarian MBID",
    async () => {
      const [a, b] = await Promise.all([
        OnlineMetadataService.getArtistEnrichment("Test Artist"),
        OnlineMetadataService.getArtistEnrichment("Test Artist"),
      ]);

      const mbidCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
        url.includes("/artist/?query="),
      );
      expect(mbidCalls).toHaveLength(1);
      // Kedua pemanggil mendapat hasil yang sama (promise yang sama).
      expect(b).toBe(a);
      expect(a.source).toBe("musicbrainz");
      expect(a.imageUrl).toContain("coverartarchive.org");
    },
    15000,
  );

  it(
    "panggilan setelah request selesai menembak request baru (map dibersihkan)",
    async () => {
      await OnlineMetadataService.getArtistEnrichment("Solo Artist");
      await OnlineMetadataService.getArtistEnrichment("Solo Artist");

      const mbidCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
        url.includes("/artist/?query="),
      );
      expect(mbidCalls).toHaveLength(2);
    },
    15000,
  );
});

/**
 * clearArtistCache — tombol Settings "Kosongkan Cache Gambar Artis".
 * Dulu no-op (hanya log + return true); sekarang benar-benar menghapus
 * URL gambar dari artist_cache + songs + store di memori, sementara bio
 * (teks "Tentang Artis") dipertahankan di semua tempat.
 */
describe("clearArtistCache", () => {
  const executeMock = db.execute as jest.Mock;
  const getStateMock = useLibraryStore.getState as jest.Mock;

  // Bentuk track mengikuti MediaTrack di store (snake_case).
  const trackWithImage = {
    id: "1",
    title: "Lagu A",
    artist: "Artis A",
    artist_image_url: "https://coverartarchive.org/1.jpg",
    artist_bio: "Bio artis A",
  };
  const trackWithoutImage = {
    id: "2",
    title: "Lagu B",
    artist: "Artis B",
    artist_bio: "Bio artis B",
  };

  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockImplementation((sql: string) => {
      if (sql.includes("artist_cache")) return { rowsAffected: 2 };
      if (sql.includes("UPDATE songs")) return { rowsAffected: 5 };
      return { rows: { item: () => undefined } };
    });
    getStateMock.mockReset();
    getStateMock.mockReturnValue({
      tracks: [trackWithImage, trackWithoutImage],
      setTracks: jest.fn(),
    });
  });

  it("menghapus image_url dari artist_cache + songs, bio tidak disentuh", async () => {
    const ok = await OnlineMetadataService.clearArtistCache();

    expect(ok).toBe(true);
    const sqls = executeMock.mock.calls.map(([sql]: [string]) => sql);
    expect(sqls).toHaveLength(2);
    expect(sqls[0]).toContain("UPDATE artist_cache SET image_url = NULL");
    expect(sqls[1]).toContain(
      "UPDATE songs SET artist_image_url = NULL",
    );
    // Bio tidak boleh muncul di SQL penghapusan mana pun.
    for (const sql of sqls) {
      expect(sql.toLowerCase()).not.toContain("bio");
    }
  });

  it("mencerminkan ke store di memori: hanya track bergambar yang diubah", async () => {
    const setTracksMock = jest.fn();
    getStateMock.mockReturnValue({
      tracks: [trackWithImage, trackWithoutImage],
      setTracks: setTracksMock,
    });

    await OnlineMetadataService.clearArtistCache();

    expect(setTracksMock).toHaveBeenCalledTimes(1);
    const nextTracks = setTracksMock.mock.calls[0][0] as unknown[];
    expect(nextTracks).toHaveLength(2);
    expect(nextTracks[0]).toEqual({ ...trackWithImage, artist_image_url: undefined });
    // Track tanpa gambar + bio tidak berubah (identitas objek dipertahankan).
    expect(nextTracks[1]).toBe(trackWithoutImage);
  });

  it("tidak memanggil setTracks bila tidak ada track bergambar", async () => {
    const setTracksMock = jest.fn();
    getStateMock.mockReturnValue({
      tracks: [trackWithoutImage],
      setTracks: setTracksMock,
    });

    await OnlineMetadataService.clearArtistCache();

    expect(setTracksMock).not.toHaveBeenCalled();
  });

  it("gagal DB mengembalikan false", async () => {
    executeMock.mockImplementation(() => {
      throw new Error("db locked");
    });
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const ok = await OnlineMetadataService.clearArtistCache();

    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
