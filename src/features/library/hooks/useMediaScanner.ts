// src/features/library/hooks/useMediaScanner.ts

import { useEffect, useCallback, useRef, useState } from "react";
import * as MediaLibrary from "expo-media-library";
import { AppState, AppStateStatus } from "react-native";
import { useLibraryStore } from "../store/libraryStore";
import { LibraryScanner } from "../api/scanner";
import type { MediaTrack } from "../store/libraryStore";

const AUDIO_EXTENSIONS = new Set([
  "flac",
  "mp3",
  "aac",
  "m4a",
  "alac",
  "wav",
  "ogg",
  "opus",
  "dsf",
  "dff",
  "ape",
  "wma",
]);

const MIN_DURATION_MS = 30_000; // 30 detik minimal
const SCAN_DEBOUNCE_MS = 2000; // Debounce 2 detik

const getCodec = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const codecMap: Record<string, string> = {
    flac: "FLAC",
    mp3: "MP3",
    aac: "AAC",
    m4a: "AAC",
    alac: "ALAC",
    wav: "WAV",
    ogg: "OGG",
    opus: "OPUS",
    dsf: "DSD",
    dff: "DSD",
    ape: "APE",
    wma: "WMA",
  };
  return codecMap[ext] ?? ext.toUpperCase();
};

const parseArtistFromFilename = (filename: string): string => {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");

  if (dashIndex > 0) {
    const beforeDash = withoutExt.substring(0, dashIndex).trim();
    if (
      !/^\d+$/.test(beforeDash) &&
      beforeDash.length <= 50 &&
      beforeDash.length > 1
    ) {
      return beforeDash;
    }
  }
  return "Unknown Artist";
};

const parseTitleFromFilename = (filename: string): string => {
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim();
  const dashIndex = withoutExt.indexOf(" - ");

  if (dashIndex > 0) {
    return withoutExt.substring(dashIndex + 3).trim();
  }
  return withoutExt;
};

export const useMediaScanner = () => {
  // 1. Gunakan Unified Store Actions
  const {
    tracks,
    setTracks,
    isAutoScanning,
    autoScanProgress,
    startAutoScan,
    updateAutoScanProgress,
    finishAutoScan,
  } = useLibraryStore();

  const [error, setError] = useState<string | null>(null);

  const hasScannedRef = useRef(false);
  const scanTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isScanningRef = useRef(false);

  const scan = useCallback(
    async (force = false) => {
      // Prevent concurrent scans
      if (isScanningRef.current || isAutoScanning) {
        console.log("[useMediaScanner] Scan already in progress, skipping...");
        return;
      }

      if (!force && hasScannedRef.current) return;

      isScanningRef.current = true;
      setError(null);

      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setError("Izin akses media ditolak");
        isScanningRef.current = false;
        return;
      }

      // 2. Mulai Auto Scan via Store
      startAutoScan();

      try {
        // Get total count first
        const { totalCount } = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.audio,
        });

        let allTracks: MediaTrack[] = [];
        let cursor: string | undefined;
        let scannedCount = 0;

        do {
          const page = await MediaLibrary.getAssetsAsync({
            mediaType: MediaLibrary.MediaType.audio,
            first: 100,
            after: cursor,
            sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
          });

          // Process each asset
          for (const asset of page.assets) {
            const ext = asset.filename.split(".").pop()?.toLowerCase() ?? "";

            // Filter valid audio files
            if (!AUDIO_EXTENSIONS.has(ext)) continue;

            const durationSec = asset.duration || 0;
            if (durationSec * 1000 < MIN_DURATION_MS) continue;

            // Get file size (try to get from asset)
            let fileSize = 0;
            try {
              const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
              fileSize =
                (assetInfo as any).size || (assetInfo as any).fileSize || 0;
            } catch {
              // Fallback: estimate based on duration and bitrate
              const estimatedBitrate =
                getCodec(asset.filename) === "FLAC" ? 1411 : 320;
              fileSize = Math.round(
                (durationSec * estimatedBitrate * 1000) / 8,
              );
            }

            const track: MediaTrack = {
              id: asset.id,
              uri: asset.uri,
              filename: asset.filename,
              title: parseTitleFromFilename(asset.filename),
              artist: parseArtistFromFilename(asset.filename),
              album: "Unknown Album",
              genre: "Unknown",
              duration: durationSec, // Convert to seconds
              fileSize,
              codec: getCodec(asset.filename),
              folder: asset.uri.substring(0, asset.uri.lastIndexOf("/")),
              modificationTime: asset.modificationTime,
              artwork: undefined,
              sampleRate: 0,
              bitDepth: 0,
              bitrate: 0,
              isFavorite: false,
              playCount: 0,
              dateAdded: asset.creationTime || Date.now(),
              lastSeenAt: Date.now(),
              isEnriched: false,
            };

            allTracks.push(track);
          }

          scannedCount += page.assets.length;
          cursor = page.hasNextPage ? page.endCursor : undefined;

          // 3. Update Progress via Store
          updateAutoScanProgress({
            phase: "discover",
            current: scannedCount,
            total: totalCount,
          });
        } while (cursor);

        // Save to store
        setTracks(allTracks);

        // Also save to SQLite via LibraryScanner for persistence
        try {
          for (const track of allTracks) {
            // Gunakan optional chaining jika saveToDatabase belum ter-implementasi
            await LibraryScanner.saveToDatabase?.({
              ...track,
              isEnriched: false,
            });
          }
          console.log(
            `[useMediaScanner] Saved ${allTracks.length} tracks to database`,
          );
        } catch (dbError) {
          console.error(
            "[useMediaScanner] Failed to save to database:",
            dbError,
          );
        }

        // 4. Selesaikan Scan
        finishAutoScan();
        hasScannedRef.current = true;
      } catch (err: any) {
        console.error("[useMediaScanner] Scan failed:", err);
        setError(err?.message || "Scan gagal");
        finishAutoScan();
      } finally {
        isScanningRef.current = false;
      }
    },
    [
      isAutoScanning,
      setTracks,
      startAutoScan,
      updateAutoScanProgress,
      finishAutoScan,
    ],
  );

  // Debounced scan for media changes
  const debouncedScan = useCallback(
    (force = false) => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      scanTimeoutRef.current = setTimeout(() => {
        scan(force);
      }, SCAN_DEBOUNCE_MS);
    },
    [scan],
  );

  // 1. Initial scan & MediaLibrary listener
  useEffect(() => {
    if (tracks.length === 0) {
      scan(true);
    }

    let subscription: MediaLibrary.Subscription | null = null;

    const setupListener = async () => {
      if (MediaLibrary.addListener) {
        subscription = MediaLibrary.addListener(() => {
          console.log("[useMediaScanner] Media library changed, rescanning...");
          debouncedScan(true);
        });
      }
    };

    setupListener();

    return () => {
      if (subscription) {
        subscription.remove();
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []); // Run once

  // 2. Rescan when app returns to foreground
  useEffect(() => {
    let lastAppState = AppState.currentState;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        lastAppState.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        if (hasScannedRef.current) {
          console.log("[useMediaScanner] App resumed, checking for changes...");
          debouncedScan(false);
        }
      }
      lastAppState = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => subscription.remove();
  }, [debouncedScan]);

  // 3. Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Hitung persentase progress
  const progressPercent =
    autoScanProgress && autoScanProgress.total > 0
      ? Math.round((autoScanProgress.current / autoScanProgress.total) * 100)
      : 0;

  return {
    scan: () => scan(true),
    isScanning: isAutoScanning,
    progress: progressPercent,
    scanned: autoScanProgress?.current || 0,
    total: autoScanProgress?.total || 0,
    error,
  };
};
