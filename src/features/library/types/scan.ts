export type ScanMode = "quick" | "full" | "deep" | "artist";
export type ScanPhase =
  | "discover"
  | "process"
  | "enrich"
  | "complete"
  | "cleanup"
  | "scanning"
  | "saving";
export type EnrichmentLevel = 1 | 2 | 3 | 4;

export interface ScanProgress {
  phase: ScanPhase;
  level?: EnrichmentLevel;
  current: number;
  total: number;
  message?: string;
  currentSong?: string;
  currentArtist?: string;
}

// Tab untuk Library UI
export type LibraryTab =
  | "song"
  | "album"
  | "artist"
  | "genre"
  | "folder"
  | "filetype"
  | "playlist";

// QueueItem yang lengkap (source of truth)
export interface QueueItem {
  songId: string;
  uri: string;
  priority: number;
  level: EnrichmentLevel;
  addedAt: number;
  retryCount: number;
}

export interface EnrichmentProgress {
  level: EnrichmentLevel;
  current: number;
  total: number;
  currentSong?: string;
  currentArtist?: string;
  success: number;
  failed: number;
}

export interface ScanResult {
  mode: ScanMode;
  level: EnrichmentLevel;
  discovered: number;
  added: number;
  updated: number;
  removed: number;
  enrichmentQueued: number;
  duration: number;
  errors: string[];
}

export interface ScanStoreState {
  isAutoScanning: boolean;
  autoScanProgress: ScanProgress | null;
  isManualScanning: boolean;
  manualScanProgress: ScanProgress | null;
  isEnriching: boolean;
  enrichmentProgress: EnrichmentProgress | null;
  enrichmentQueueSize: number;
  lastScanAt: number | null;
  lastEnrichmentAt: number | null;
  unenrichedCount: number;
  pendingArtistImages: number;
}

export interface ScanStoreActions {
  startAutoScan: () => void;
  updateAutoScanProgress: (progress: ScanProgress) => void;
  finishAutoScan: (result?: Partial<ScanResult>) => void; // Dibuat optional agar fleksibel
  startManualScan: () => void;
  updateManualScanProgress: (progress: ScanProgress) => void;
  finishManualScan: (result?: Partial<ScanResult>) => void;
  startEnrichment: (level: EnrichmentLevel, total: number) => void;
  updateEnrichmentProgress: (progress: EnrichmentProgress) => void;
  finishEnrichment: (result?: { success: number; failed: number }) => void;
  setEnrichmentQueueSize: (size: number) => void;
  setUnenrichedCount: (count: number) => void;
  setPendingArtistImages: (count: number) => void;
}

// Hapus blok export { ... } di bawah jika sebelumnya menyebabkan konflik duplicate identifier
