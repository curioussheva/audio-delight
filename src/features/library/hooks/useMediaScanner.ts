import { useEffect, useCallback, useRef } from "react";
import * as MediaLibrary from "expo-media-library";
import { AppState, AppStateStatus } from "react-native";
import { useLibraryStore } from "../store/libraryStore";
import type { MediaTrack } from "../store/libraryStore";

const AUDIO_EXTENSIONS = ["flac", "mp3", "aac", "m4a", "alac", "wav", "ogg", "opus", "dsf", "dff"];
const MIN_DURATION_MS = 30_000; 

const getCodec = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    flac: "FLAC", mp3: "MP3", aac: "AAC", m4a: "AAC",
    alac: "ALAC", wav: "WAV", ogg: "OGG", opus: "OPUS", 
    dsf: "DSD", dff: "DSD",
  };
  return map[ext] ?? ext.toUpperCase();
};

export const useMediaScanner = () => {
  const { tracks, setTracks, setScanStatus, scanStatus } = useLibraryStore();
  const hasScannedRef = useRef(false);

  const scan = useCallback(async (force = false) => {
    // Hindari double scan
    if (scanStatus.isScanning) return;
    if (!force && hasScannedRef.current) return;

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      setScanStatus({ error: "Izin akses media ditolak" });
      return;
    }

    setScanStatus({ isScanning: true, progress: 0, scanned: 0, error: null });

    try {
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

        const validPageTracks = page.assets
          .filter(asset => {
            const ext = asset.filename.split(".").pop()?.toLowerCase() ?? "";
            return AUDIO_EXTENSIONS.includes(ext) && (asset.duration * 1000) >= MIN_DURATION_MS;
          })
          .map(asset => ({
            id: asset.id,
            uri: asset.uri,
            filename: asset.filename,
            title: asset.filename.replace(/\.[^.]+$/, ""),
            artist: "Unknown Artist",
            album: "Unknown Album",
            genre: "Unknown",
            duration: asset.duration * 1000,
            fileSize: 0,
            codec: getCodec(asset.filename),
            folder: asset.uri.substring(0, asset.uri.lastIndexOf("/")),
            modificationTime: asset.modificationTime,
          }));

        allTracks = [...allTracks, ...validPageTracks];
        scannedCount += page.assets.length;
        cursor = page.hasNextPage ? page.endCursor : undefined;

        setScanStatus({ 
          scanned: scannedCount, 
          progress: Math.round((scannedCount / totalCount) * 100) 
        });
      } while (cursor);

      setTracks(allTracks);
      setScanStatus({ isScanning: false, progress: 100, lastScanAt: Date.now() });
      hasScannedRef.current = true;
    } catch (err: any) {
      setScanStatus({ isScanning: false, error: err?.message || "Scan gagal" });
    }
  }, [scanStatus.isScanning, setTracks, setScanStatus]);

  // 1. Inisialisasi awal & Subscription perubahan media
  useEffect(() => {
    if (tracks.length === 0) scan(true);

    // FIX: Gunakan .addListener() bukan .addChangeListener()
    const subscription = MediaLibrary.addListener(() => {
      console.log("Media library changed, rescanning...");
      scan(true);
    });

    return () => subscription.remove();
  }, []);

  // 2. Scan ulang saat kembali ke aplikasi (Foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && hasScannedRef.current) {
        scan(false);
      }
    });
    return () => subscription.remove();
  }, [scan]);

  return { scan: () => scan(true) };
};
 