import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface MediaTrack {
  id: string;
  uri: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  fileSize?: number;
  sampleRate?: number;
  bitDepth?: number;
  codec: string;
  folder: string;
  artwork?: string;
  modificationTime?: number;
}

export type LibraryTab =
  | "song"
  | "album"
  | "artist"
  | "genre"
  | "folder"
  | "playlist"
  | "filetype";

interface ScanStatus {
  isScanning: boolean;
  progress: number;
  total: number;
  scanned: number;
  lastScanAt: number | null;
  error: string | null;
  autoScanEnabled: boolean; // ← tambah ini
}

interface LibraryState {
  tracks: MediaTrack[];
  activeTab: LibraryTab;
  scanStatus: ScanStatus;
  setTracks: (tracks: MediaTrack[]) => void;
  setActiveTab: (tab: LibraryTab) => void;
  setScanStatus: (status: Partial<ScanStatus>) => void;
  setScanning: (isScanning: boolean, scanned: number, total?: number) => void;
  clearLibrary: () => void;
}

const DEFAULT_SCAN: ScanStatus = {
  isScanning: false,
  progress: 0,
  //  currentFile: undefined,
  total: 0,
  scanned: 0,
  lastScanAt: null,
  error: null,
  autoScanEnabled: true,
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      tracks: [],
      activeTab: "song",

      scanStatus: DEFAULT_SCAN, // ← Fixed: use DEFAULT_SCAN

      setTracks: (tracks) => set({ tracks }),

      setActiveTab: (activeTab) => set({ activeTab }),

      setScanStatus: (status) =>
        set((state) => ({
          scanStatus: {
            ...state.scanStatus,
            ...status,
            // Auto-update lastScanAt when scan reaches 100%
            ...(status.progress === 100 ? { lastScanAt: Date.now() } : {}),
          },
        })),

      setScanning: (isScanning, scanned, total) =>
        set((state) => ({
          scanStatus: {
            ...state.scanStatus,
            isScanning,
            scanned,
            ...(total !== undefined ? { total } : {}),
            // Set lastScanAt saat scan selesai
            ...(!isScanning && scanned > 0 ? { lastScanAt: Date.now() } : {}),
          },
        })),

      clearLibrary: () => set({ tracks: [], scanStatus: DEFAULT_SCAN }),
    }),

    {
      name: "@pristineaudio/library",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        autoScanEnabled: state.scanStatus.autoScanEnabled,
      }),
    },
  ),
);

// ── Optimized Selectors

export const selectAlbums = (tracks: MediaTrack[]) => {
  if (!tracks?.length) return [];
  const map = new Map<
    string,
    { name: string; artist: string; artwork?: string; count: number }
  >();

  for (const t of tracks) {
    // ✅ Fixed: template literal yang benar
    const key = `${t.album || "Unknown"}__${t.artist || "Unknown"}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        name: t.album || "Unknown Album",
        artist: t.artist || "Unknown Artist",
        artwork: t.artwork,
        count: 1,
      });
    } else {
      existing.count++;
      if (!existing.artwork && t.artwork) existing.artwork = t.artwork;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const selectArtists = (tracks: MediaTrack[]) => {
  const map = new Map<
    string,
    { name: string; albumCount: number; trackCount: number }
  >();

  for (const t of tracks) {
    const artistName = t.artist || "Unknown Artist";
    const albumName = t.album || "Unknown Album";

    let artist = map.get(artistName);
    if (!artist) {
      artist = { name: artistName, albumCount: 0, trackCount: 0 };
      map.set(artistName, artist);
    }

    artist.trackCount++;
    if (!artist.albumCount) artist.albumCount = 1; // simplified version
  }

  return Array.from(map.values())
    .map((a) => ({
      name: a.name,
      trackCount: a.trackCount,
      albumCount: a.albumCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const selectFolders = (tracks: MediaTrack[]) => {
  const map = new Map<string, number>();
  for (let i = 0; i < tracks.length; i++) {
    const path = tracks[i].folder || "Unknown";
    map.set(path, (map.get(path) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([path, count]) => {
      // Lebih aman split untuk SAF path
      const parts = path.split(/[/|%2F]/);
      return { path, name: parts.pop() || "Root", count };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const selectGenres = (tracks: MediaTrack[]) => {
  const map = new Map<string, number>();
  for (let i = 0; i < tracks.length; i++) {
    const g = tracks[i].genre || "Unknown";
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const selectFileTypes = (tracks: MediaTrack[]) => {
  const map = new Map<string, number>();
  for (let i = 0; i < tracks.length; i++) {
    const codec = tracks[i].codec || "Unknown";
    map.set(codec, (map.get(codec) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([codec, count]) => ({ codec, count }))
    .sort((a, b) => b.count - a.count);
};
