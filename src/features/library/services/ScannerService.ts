import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { useLibraryStore } from '../store/libraryStore';
import { LibraryScanner } from '../api/scanner';
import {
  getMetadata,
  getArtwork,
  MetadataPresets,
} from '@missingcore/react-native-metadata-retriever';

let isScanning = false;
let shouldCancel = false;

const SUPPORTED_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg', '.opus', '.dsf', '.dsd'];
const SAF = FileSystem.StorageAccessFramework;

export class ScannerService {

  static async scanWithProgress(
    directoryUri: string,
    options?: { onProgress?: (current: number, total: number) => void; onComplete?: () => void; }
  ): Promise<void> {
    if (isScanning) return;

    console.log("🚀 [ScannerService] Starting with URI:", directoryUri);
    isScanning = true;
    shouldCancel = false;
    const { setScanning } = useLibraryStore.getState();

    try {
      if (Platform.OS === 'android') await ScannerService.setupNotificationChannel();
      setScanning(true, 0);

      // ── FASE 1: Kumpulkan semua file URI ──
      console.log("🔍 [ScannerService] Collecting files...");
      const allFiles: Array<{ uri: string; filename: string }> = [];
      const visited = new Set<string>();

      await ScannerService.collectFiles(directoryUri, allFiles, visited);

      const total = allFiles.length;
      console.log(`📋 [ScannerService] Found ${total} audio files. Starting processing...`);

      if (total === 0) {
        await ScannerService.showCompleteNotification(0);
        options?.onComplete?.();
        return;
      }

      // ── FASE 2: Proses satu per satu ──
      let processed = 0;

      for (const { uri: fileUri, filename } of allFiles) {
        if (shouldCancel) throw new Error('SCAN_CANCELLED');

        // Ambil metadata via react-native-metadata-retriever (support SAF URI native)
        let meta: Awaited<ReturnType<typeof getMetadata>> | null = null;
        let artwork: string | null = null;

        try {
          meta = await getMetadata(fileUri, MetadataPresets.standard);
        } catch {
          console.warn(`[Scanner] Metadata failed for ${filename}, using filename fallback`);
        }

        // Artwork diambil terpisah — bisa null, tidak blocking
        try {
          artwork = await getArtwork(fileUri);
        } catch {
          // artwork tetap null, tidak masalah
        }

        // Derive codec dari ekstensi filename
        const codec = filename.split('.').pop()?.toUpperCase() ?? 'UNKNOWN';

        // Derive folder dari directoryUri
        const folderParts = directoryUri.split('%2F');
        const folder = decodeURIComponent(folderParts[folderParts.length - 1] ?? directoryUri);

        // Simpan ke DB
        try {
          await LibraryScanner.saveToDatabase({
            id: fileUri,
            uri: fileUri,
            filename,
            title: meta?.title || filename.replace(/\.[^/.]+$/, ""),
            artist: meta?.artist || "Unknown Artist",
            album: meta?.album || "Unknown Album",
            genre: "Unknown Genre",           // metadata-retriever belum expose genre, enrichment nanti
            folder,
            fileSize: 0,                      // akan diisi ScanDiffEngine nanti
            duration: Math.floor((meta?.duration ?? 0) / 1000), // ms → detik
            sampleRate: 0,                    // tidak tersedia di MetadataPresets.standard
            bitDepth: 0,                      // akan diisi enrichment layer
            codec,
            artwork: artwork ?? undefined,
            isEnriched: false,                // flag untuk enrichment pipeline
            dateAdded: Date.now(),
          });
        } catch (dbErr) {
          console.warn(`[Scanner] DB error for ${filename}:`, dbErr);
        }

        processed++;
        setScanning(true, processed, total);
        options?.onProgress?.(processed, total);

        if (processed % 20 === 0) {
          await ScannerService.updateNotification(
            `Memindai ${processed} / ${total} lagu...`, processed
          );
        }
      }

      await ScannerService.showCompleteNotification(processed);
      options?.onComplete?.();

    } catch (error: any) {
      if (error.message !== 'SCAN_CANCELLED') {
        console.error('[ScannerService] Critical Scan Error:', error);
        await ScannerService.showErrorNotification(error.message || String(error));
      }
    } finally {
      isScanning = false;
      setScanning(false, 0, 0);
    }
  }

  private static async collectFiles(
    uri: string,
    result: Array<{ uri: string; filename: string }>,
    visited: Set<string>
  ): Promise<void> {
    if (!SAF || visited.has(uri)) return;
    visited.add(uri);

    let entries: string[];
    try {
      entries = await SAF.readDirectoryAsync(uri);
    } catch {
      return;
    }

    if (!entries || entries.length === 0) return;

    for (const entryUri of entries) {
      if (shouldCancel) return;
      if (!entryUri || typeof entryUri !== 'string') continue;
      if (visited.has(entryUri)) continue;

      const isAudio = SUPPORTED_EXTENSIONS.some(ext =>
        entryUri.toLowerCase().endsWith(ext)
      );

      if (isAudio) {
        const parts = entryUri.split('/');
        const filename = decodeURIComponent(parts[parts.length - 1] || "Unknown");
        result.push({ uri: entryUri, filename });
        visited.add(entryUri);
      } else {
        await ScannerService.collectFiles(entryUri, result, visited);
      }
    }
  }

  // ── Notifications ──

  private static async setupNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('media-scanner', {
      name: 'Media Scanner',
      importance: Notifications.AndroidImportance.LOW,
      sound: undefined,
    });
  }

  private static async updateNotification(body: string, _count: number): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: 'scanning-notif',
        content: { title: 'Pristine Audio: Scanning', body, sticky: true },
        trigger: null,
      });
    } catch (e) {
      console.warn('Update notif failed', e);
    }
  }

  private static async showCompleteNotification(count: number): Promise<void> {
    if (Platform.OS !== 'android') return;
    await Notifications.dismissNotificationAsync('scanning-notif');
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Scan Selesai', body: `${count} lagu berhasil ditambahkan ke Library.` },
      trigger: null,
    });
  }

  private static async showErrorNotification(message: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Scan Gagal', body: message },
      trigger: null,
    });
  }

  static cancelScan(): void {
    shouldCancel = true;
    isScanning = false;
    Notifications.dismissAllNotificationsAsync();
  }
} 