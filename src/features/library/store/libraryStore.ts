/**
 * src/features/library/store/libraryStore.ts
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ScanStoreState,
  ScanStoreActions,
  ScanProgress,
  EnrichmentProgress,
  EnrichmentLevel,
  ScanResult,
  LibraryTab,
} from "../types/scan";

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
} 

type LibraryState = ScanStoreState &
  ScanStoreActions & {
    tracks: MediaTrack[];
    activeTab: LibraryTab;
    selectedTracks: string[];
    searchQuery: string;

    // --- Actions ---
    setTracks: (tracks: MediaTrack[]) => void;
    setActiveTab: (tab: LibraryTab) => void;
    setSearchQuery: (query: string) => void;
    setSelectedTracks: (ids: string[]) => void;
    
    /** * Memperbarui metadata lagu secara spesifik (digunakan untuk Sync MusicBrainz)
     */
    updateTrack: (trackId: string, updatedData: Partial<MediaTrack>) => void;
    
    /**
     * Toggle status favorit lagu
     */
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

      // --- 2. CORE ACTIONS ---
      setTracks: (tracks) => set({ 
        tracks,
        unenrichedCount: tracks.filter(t => !t.isEnriched).length 
      }),

      setActiveTab: (activeTab) => set({ activeTab }),
      
      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setSelectedTracks: (selectedTracks) => set({ selectedTracks }),

      /**
       * ACTION BARU: updateTrack
       * Digunakan oleh SongDetailScreen untuk update UI instan setelah Sync
       */
      updateTrack: (trackId, updatedData) => 
        set((state) => {
          const newTracks = state.tracks.map((t) => 
            t.id === trackId ? { ...t, ...updatedData } : t
          );
          return {
            tracks: newTracks,
            // Recalculate unenriched count jika status enrichment berubah
            unenrichedCount: newTracks.filter(t => !t.isEnriched).length
          };
        }),

      /**
       * ACTION BARU: toggleFavorite
       */
      toggleFavorite: (trackId) =>
        set((state) => ({
          tracks: state.tracks.map((t) =>
            t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t
          ),
        })),

      // --- 3. SCAN & ENRICHMENT ACTIONS ---
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
        }),

      // --- 4. COMPUTED GETTERS ---
      get hasPendingEnrichment() {
        const state = get();
        return (state.unenrichedCount || 0) > 0 || (state.enrichmentQueueSize || 0) > 0;
      },

      get scanStatus() {
        const state = get();
        return {
          isScanning: state.isAutoScanning || state.isManualScanning,
          lastScanAt: state.lastScanAt,
          autoScanEnabled: true,
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
      partialize: (state) => ({
        tracks: state.tracks,
        lastScanAt: state.lastScanAt,
        lastEnrichmentAt: state.lastEnrichmentAt,
        unenrichedCount: state.unenrichedCount,
      }),
    },
  ),
);

