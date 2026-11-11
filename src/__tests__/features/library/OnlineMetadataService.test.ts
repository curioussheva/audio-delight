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

import OnlineMetadataService from "../../../features/library/services/OnlineMetadataService";

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
