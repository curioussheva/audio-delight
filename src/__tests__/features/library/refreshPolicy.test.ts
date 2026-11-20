/**
 * refreshPolicy — Fase 4: satu bump, satu arti, di semua layar.
 * Logika murni, tanpa react-native.
 */
import {
  isLibraryScanRunning,
  shouldRefreshLibraryOnBump,
  shouldReloadPlaylistsOnBump,
  shouldReloadSmartPlaylistsOnBump,
} from "../../../features/library/services/refreshPolicy";

describe("shouldRefreshLibraryOnBump", () => {
  it("resume → refresh daftar lagu", () => {
    expect(shouldRefreshLibraryOnBump("resume")).toBe(true);
  });

  it("manual-scan → refresh daftar lagu", () => {
    expect(shouldRefreshLibraryOnBump("manual-scan")).toBe(true);
  });

  it("playlist-change → TIDAK refresh daftar lagu (lagu tidak berubah)", () => {
    expect(shouldRefreshLibraryOnBump("playlist-change")).toBe(false);
  });

  it("null (belum ada bump) → tidak refresh", () => {
    expect(shouldRefreshLibraryOnBump(null)).toBe(false);
  });
});

describe("shouldReloadPlaylistsOnBump", () => {
  it("playlist-change dari instance lain → reload", () => {
    expect(
      shouldReloadPlaylistsOnBump("playlist-change", "playlists-1", "playlists-2"),
    ).toBe(true);
  });

  it("playlist-change dari diri sendiri → TIDAK reload (sudah update lokal)", () => {
    expect(
      shouldReloadPlaylistsOnBump("playlist-change", "playlists-1", "playlists-1"),
    ).toBe(false);
  });

  it("playlist-change tanpa asal tercatat → reload (aman: asal tak dikenal)", () => {
    expect(
      shouldReloadPlaylistsOnBump("playlist-change", null, "playlists-1"),
    ).toBe(true);
  });

  it("resume / manual-scan → TIDAK reload playlist", () => {
    expect(
      shouldReloadPlaylistsOnBump("resume", "coordinator", "playlists-1"),
    ).toBe(false);
    expect(
      shouldReloadPlaylistsOnBump("manual-scan", "library", "playlists-1"),
    ).toBe(false);
  });
});

describe("shouldReloadSmartPlaylistsOnBump", () => {
  it("resume / manual-scan → reload (daftar lagu berubah)", () => {
    expect(shouldReloadSmartPlaylistsOnBump("resume")).toBe(true);
    expect(shouldReloadSmartPlaylistsOnBump("manual-scan")).toBe(true);
  });

  it("playlist-change → TIDAK reload (lagu tidak berubah, hanya playlist manual)", () => {
    expect(shouldReloadSmartPlaylistsOnBump("playlist-change")).toBe(false);
  });

  it("null (belum ada bump) → tidak reload", () => {
    expect(shouldReloadSmartPlaylistsOnBump(null)).toBe(false);
  });
});

describe("isLibraryScanRunning", () => {
  it("manual saja / auto saja / keduanya → true", () => {
    expect(
      isLibraryScanRunning({ isManualScanning: true, isAutoScanning: false }),
    ).toBe(true);
    expect(
      isLibraryScanRunning({ isManualScanning: false, isAutoScanning: true }),
    ).toBe(true);
    expect(
      isLibraryScanRunning({ isManualScanning: true, isAutoScanning: true }),
    ).toBe(true);
  });

  it("tidak ada scan → false", () => {
    expect(
      isLibraryScanRunning({ isManualScanning: false, isAutoScanning: false }),
    ).toBe(false);
  });
});
