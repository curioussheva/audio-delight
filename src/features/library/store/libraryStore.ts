/**
 * src/features/library/store/libraryStore.ts
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScanStoreState, ScanStoreActions, LibraryTab } from "../types/scan";
import { LibraryScanner } from "../api/scanner";
import { mergeTrackList } from "./trackListMerge";

// Definisi MediaTrack tetap sama seperti kode Anda...
export interface MediaTrack {
  id: string;
  uri: string;
  originalUri?: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  fileSize?: number;
  sampleRate: number;
  bitDepth: number;
  bitrate?: number;
  codec: string;
  folder: string;
  artwork?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  label?: string;
  publisher?: string;
  dateAdded: number;
  playCount: number;
  isFavorite: boolean;
  isHiRes?: boolean;
  isEnriched: boolean;
  enrichedAt?: number;
  modificationTime?: number;
  lastSeenAt: number;
  channels?: number;
  last_enriched_at?: number;
  artist_bio?: string;
  artist_image_url?: string;
  // L1: lirik lokal (lihat Song).
  lyrics?: string;
  lyricsSynced?: string;
  // L2: penanda I3 (`edited_fields`) — store perlu membawanya supaya
  // guard lirik di enrichment backfill + lazy-load bisa membaca dari
  // track store (dbRowToSong sudah memetakannya dari DB).
  editedFields?: string[];
}

/**
 * FIX 1: Update LibraryState Interface
 * Tambahkan isAutoScanEnabled dan toggleAutoScanEnabled agar dikenali TS
 */
type LibraryState = ScanStoreState &
  ScanStoreActions & {
    tracks: MediaTrack[];
    activeTab: LibraryTab;
    selectedTracks: string[];
    searchQuery: string;

    // Properti Baru
    // `isAutoScanEnabled` = gerbang Auto Discovery (resume quickDiff,
    // autoScan, background task). Kunci persist DIPAKAI ULANG dengan
    // sengaja: bagi instalasi lama nilainya selalu berarti pilihan
    // soal pemindaian otomatis berkelanjutan, jadi tidak ada migrasi
    // dan tidak ada risiko nilai tersimpan hilang.
    // (Riwayat: scan-split 2026-11-18 sempat menambah
    // `isInitialScanEnabled` sebagai gerbang scan perdana; toggle itu
    // DIHAPUS 2026-11-18 — initial scan jalan secara default saat
    // fresh install, tanpa setting.)
    isAutoScanEnabled: boolean;
    hasCompletedInitialScan: boolean; // 👈 NEW: Flag untuk scan perdana

    // `isAutoEnrichingEnabled` = gerbang Auto Enriching (start OTOMATIS
    // worker enrichment pasca scan — initial/resume/background task).
    // Default OFF (keputusan csheva 2026-11-20): enrichment TIDAK
    // jalan otomatis; user menyalakannya lewat Settings bila mau.
    // Instalasi lama dimigrasikan ke OFF (persist v1→v2). Aksi
    // eksplisit (modal manual, Rescan Library, menyalakan toggle ON)
    // TIDAK melewati gerbang ini — lihat autoEnrichingGuard.ts.
    isAutoEnrichingEnabled: boolean;

    // --- Actions ---
    setTracks: (tracks: MediaTrack[]) => void;
    setActiveTab: (tab: LibraryTab) => void;
    setSearchQuery: (query: string) => void;
    setSelectedTracks: (ids: string[]) => void;

    toggleAutoScanEnabled: () => void;
    toggleAutoEnrichingEnabled: () => void;
    setInitialScanCompleted: () => void; // 👈 NEW: Action untuk menandai scan perdana selesai

    updateTrack: (trackId: string, updatedData: Partial<MediaTrack>) => void;
    toggleFavorite: (trackId: string) => void;

    clearLibrary: () => void;
    markAsEnriched: (trackId: string, metadata?: Partial<MediaTrack>) => void;
    getUnenrichedSongs: () => MediaTrack[];

    // Compatibility Layer
    readonly scanStatus: {
      isScanning: boolean;
      lastScanAt: number | null;
      autoScanEnabled: boolean;
    };
    setScanStatus: (status: any) => void;
    readonly hasPendingEnrichment: boolean;
  };

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      // --- 1. PHYSICAL STATE ---
      tracks: [],
      activeTab: "song",
      selectedTracks: [],
      searchQuery: "",

      isAutoScanning: false,
      autoScanProgress: null,
      isManualScanning: false,
      manualScanProgress: null,
      isEnriching: false,
      enrichmentProgress: null,
      enrichmentQueueSize: 0,
      lastScanAt: null,
      lastEnrichmentAt: null,
      unenrichedCount: 0,
      pendingArtistImages: 0,

      // Default Value
      // `isAutoScanEnabled` = gerbang Auto Discovery (default OFF —
      // dipertahankan). Initial scan tidak punya toggle (jalan secara
      // default saat fresh install — spek butir 1).
      isAutoScanEnabled: false, // 👈 FIX: Default OFF
      hasCompletedInitialScan: false, // 👈 FIX: Default belum pernah scan
      // Auto Enriching default OFF (keputusan csheva 2026-11-20) —
      // enrichment hanya jalan bila user menyalakannya lewat Settings.
      isAutoEnrichingEnabled: false,

      // --- 2. CORE ACTIONS ---
      // Item 2 (spike completion scan): JANGAN ganti seluruh array
      // bila isinya sama — `mergeTrackList` melewatkan `set()` bila
      // `next` sama persis (id + urutan + semua field), dan memakai
      // kembali referensi objek lama untuk lagu yang tidak berubah bila
      // daftar benar-benar berubah. Tanpa ini, tiap scan selesai
      // (termasuk resume TANPA lagu baru/hilang, dan set ganda
      // refreshLibrary + reload) me-render ulang penuh LibraryScreen +
      // FlashList ~100 baris. Merge DI LUAR `set()` (baca `get()`
      // dulu) supaya saat tidak berubah `set()` tidak dipanggil sama
      // sekali: bukan hanya subscriber tidak diberitahu (vanilla
      // `Object.is`), tapi wrapper persist zustand juga tidak menulis
      // AsyncStorage — wrapper itu memanggil setItem SETIAP `set()`,
      // bahkan bila updater mengembalikan state yang sama. Daftar
      // akhir (isi + urutan) identik dengan `setTracks` mentah —
      // hanya identitas referensi yang dipertahankan.
      setTracks: (tracks) => {
        const merged = mergeTrackList(get().tracks, tracks);
        if (!merged.changed) return;
        set({
          tracks: merged.tracks,
          unenrichedCount: merged.tracks.filter((t) => !t.isEnriched)
            .length,
        });
      },

      setActiveTab: (activeTab) => set({ activeTab }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSelectedTracks: (selectedTracks) => set({ selectedTracks }),

      toggleAutoScanEnabled: () =>
        set((state) => ({
          isAutoScanEnabled: !state.isAutoScanEnabled,
        })),

      toggleAutoEnrichingEnabled: () =>
        set((state) => ({
          isAutoEnrichingEnabled: !state.isAutoEnrichingEnabled,
        })),

      setInitialScanCompleted: () => set({ hasCompletedInitialScan: true }), // 👈 NEW: Implementasi

      // ... (Action updateTrack, toggleFavorite, startAutoScan, dll biarkan sama persis seperti sebelumnya) ...
      updateTrack: (trackId, updatedData) =>
        set((state) => {
          const newTracks = state.tracks.map((t) =>
            t.id === trackId ? { ...t, ...updatedData } : t,
          );
          return {
            tracks: newTracks,
            unenrichedCount: newTracks.filter((t) => !t.isEnriched).length,
          };
        }),

      // U-P1-17: SATU-SATUNYA jalur toggle favorit di UI. Dulu hanya flip
      // flag di memori (tanpa tulis DB — hilang saat restart), sementara
      // hati tab Songs menulis tabel `favorites` terpisah. Sekarang tulis
      // ke kolom songs.isFavorite lewat LibraryScanner.toggleFavorite
      // (penulis tunggal) lalu cerminkan status barunya ke tracks, supaya
      // Song Detail, tab Songs, detail view, dan player membaca nilai yang
      // sama. Gagal tulis = tracks tidak berubah.
      toggleFavorite: (trackId) => {
        const next = LibraryScanner.toggleFavorite(trackId);
        const track = get().tracks.find((t) => t.id === trackId);
        if (!track || track.isFavorite === next) return;
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, isFavorite: next } : t,
          ),
        }));
      },

      startAutoScan: () =>
        set({
          isAutoScanning: true,
          autoScanProgress: { phase: "discover", current: 0, total: 0 },
        }),
      updateAutoScanProgress: (progress) => set({ autoScanProgress: progress }),
      finishAutoScan: () =>
        set({
          isAutoScanning: false,
          autoScanProgress: null,
          lastScanAt: Date.now(),
        }),

      startManualScan: () =>
        set({
          isManualScanning: true,
          manualScanProgress: { phase: "discover", current: 0, total: 0 },
        }),
      updateManualScanProgress: (progress) =>
        set({ manualScanProgress: progress }),
      finishManualScan: () =>
        set({
          isManualScanning: false,
          manualScanProgress: null,
          lastScanAt: Date.now(),
        }),

      startEnrichment: (level, total) =>
        set({
          isEnriching: true,
          enrichmentProgress: {
            level,
            current: 0,
            total,
            success: 0,
            failed: 0,
          },
        }),
      updateEnrichmentProgress: (progress) =>
        set({ enrichmentProgress: progress }),
      finishEnrichment: () =>
        set({
          isEnriching: false,
          enrichmentProgress: null,
          lastEnrichmentAt: Date.now(),
        }),

      setEnrichmentQueueSize: (size) => set({ enrichmentQueueSize: size }),
      setUnenrichedCount: (count) => set({ unenrichedCount: count }),
      setPendingArtistImages: (count) => set({ pendingArtistImages: count }),

      getUnenrichedSongs: () => get().tracks.filter((t) => !t.isEnriched),

      markAsEnriched: (trackId, metadata = {}) =>
        set((state) => {
          const updated = state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  ...metadata,
                  isEnriched: true,
                  enrichedAt: Date.now(),
                }
              : track,
          );
          return {
            tracks: updated,
            unenrichedCount: updated.filter((t) => !t.isEnriched).length,
          };
        }),

      clearLibrary: () =>
        set({
          tracks: [],
          isAutoScanning: false,
          isManualScanning: false,
          isEnriching: false,
          enrichmentQueueSize: 0,
          unenrichedCount: 0,
          lastScanAt: null,
          // Catatan: jangan reset hasCompletedInitialScan saat clear library
          // kecuali kamu benar-benar ingin scan otomatis jalan lagi dari nol.
        }),

      get hasPendingEnrichment() {
        return (
          (get().unenrichedCount || 0) > 0 ||
          (get().enrichmentQueueSize || 0) > 0
        );
      },

      get scanStatus() {
        return {
          isScanning: get().isAutoScanning || get().isManualScanning,
          lastScanAt: get().lastScanAt,
          autoScanEnabled: get().isAutoScanEnabled,
        };
      },

      setScanStatus: (status) =>
        set((state) => ({
          isAutoScanning: status.isScanning ?? state.isAutoScanning,
        })),
    }),
    {
      name: "@pristineaudio/library",
      storage: createJSONStorage(() => AsyncStorage),
      // J2-6: `tracks` TIDAK lagi dipersist. Dulu tiap set() (termasuk
      // markAsEnriched per lagu selesai enrich) menulis ulang SELURUH
      // library ke AsyncStorage — N lagu = N kali serialisasi + tulis
      // JSON seluruh library. SQLite sudah sumber kebenaran; rehidrasi
      // dari SQLite saat mount (useLibrary auto-load). Yang tetap
      // dipersist: flag/timestamp/gerbang scan + unenrichedCount.
      // Catatan perilaku: cold start kini menampilkan daftar kosong
      // sesaat sampai useLibrary selesai memuat dari SQLite (dulu daftar
      // langsung tampil dari rehydrate). Initial scan tetap aman:
      // gerbangnya hasCompletedInitialScan (persist), bukan tracks.length
      // semata — instalasi lama yang sudah pernah scan tidak mengulang
      // scan perdana hanya karena tracks belum termuat.
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }
        // Buang `tracks` dari state tersimpan instalasi lama — kalau
        // tidak, rehydrate pertama sesudah update masih memuat daftar
        // basi dari storage lama.
        const { tracks: _dropped, ...rest } = persistedState;
        // v1→v2 (2026-11-20, keputusan csheva): default Auto Enriching
        // berubah ON → OFF. Instalasi lama yang tersimpan di v1 ikut
        // dipindah ke OFF — enrichment mati kecuali user menyalakannya
        // lagi lewat Settings. Yang sudah OFF eksplisit tetap OFF.
        if (version < 2) {
          return { ...rest, isAutoEnrichingEnabled: false };
        }
        return rest;
      },
      partialize: (state) => ({
        lastScanAt: state.lastScanAt,
        lastEnrichmentAt: state.lastEnrichmentAt,
        unenrichedCount: state.unenrichedCount,
        isAutoScanEnabled: state.isAutoScanEnabled,
        // Auto Enriching dipersist supaya pilihan OFF user tidak hilang
        // saat restart (perilaku sama seperti toggle Auto Discovery).
        isAutoEnrichingEnabled: state.isAutoEnrichingEnabled,
        // Kunci `isInitialScanEnabled` (scan-split) TIDAK lagi
        // dipersist: field + toggle-nya dihapus 2026-11-18. Kunci yang
        // tertinggal di storage instalasi lama tidak dibaca lagi —
        // tidak berbahaya; hilang sendiri saat persist berikutnya
        // ditulis tanpa kunci itu.
        hasCompletedInitialScan: state.hasCompletedInitialScan, // 👈 NEW: Wajib ada agar disimpan di memori HP
      }),
    },
  ),
);
