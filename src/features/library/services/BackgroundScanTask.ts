import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { runMediaStoreDiff, runEnrichment } from './ScanDiffEngine';
import { useLibraryStore } from '@/store/libraryStore';

// ── Konstanta ──────────────────────────────────────────────────
const TASK_NAME = 'PRISTINE_BACKGROUND_SCAN';
const NOTIF_CHANNEL = 'media-scanner';

// ─────────────────────────────────────────────────────────────
// REGISTER TASK — harus di root level module, LUAR class/function
// ─────────────────────────────────────────────────────────────
TaskManager.defineTask(TASK_NAME, async () => {
  console.log('🔄 [BackgroundTask] Woke up, running diff scan...');

  try {
    const result = await runMediaStoreDiff();

    // Tidak ada perubahan — selesai diam-diam
    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log('[BackgroundTask] No changes detected. Sleeping.');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Ada perubahan — update store dan kirim notifikasi
    const { setScanStatus } = useLibraryStore.getState();
    setScanStatus({ lastScanAt: Date.now() });

    await _sendChangeNotification(result.newCount, result.deletedCount);

    // Jalankan enrichment ringan (max 20 track) agar tidak di-kill Android
    await runEnrichment();

    console.log(
      `✅ [BackgroundTask] Done. +${result.newCount} new, -${result.deletedCount} deleted.`
    );
    return BackgroundFetch.BackgroundFetchResult.NewData;

  } catch (error) {
    console.error('[BackgroundTask] Task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────
export const BackgroundScanTask = {

  /**
   * Daftarkan background task.
   * Panggil sekali saat app launch atau user enable auto-scan.
   * Minimum interval Android: 15 menit.
   */
  async register(intervalMinutes = 30): Promise<void> {
    if (Platform.OS !== 'android') return;

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      console.warn('[BackgroundTask] MediaLibrary permission not granted, cannot register.');
      return;
    }

    await _setupNotificationChannel();

    try {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: intervalMinutes * 60, // detik
        stopOnTerminate: false,  // tetap jalan walau app di-swipe
        startOnBoot: true,       // jalan ulang setelah reboot
      });
      console.log(`✅ [BackgroundTask] Registered. Interval: ${intervalMinutes} menit.`);
    } catch (e) {
      console.warn('[BackgroundTask] Register failed (mungkin sudah terdaftar):', e);
    }
  },

  /** Batalkan background task — saat user disable auto-scan. */
  async unregister(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
      console.log('🛑 [BackgroundTask] Unregistered.');
    } catch (e) {
      console.warn('[BackgroundTask] Unregister failed:', e);
    }
  },

  /** Cek apakah task sudah terdaftar. */
  async isRegistered(): Promise<boolean> {
    return TaskManager.isTaskRegisteredAsync(TASK_NAME);
  },

  /** Cek status task — untuk debug / settings screen. */
  async getStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
    try {
      return await BackgroundFetch.getStatusAsync();
    } catch {
      return null;
    }
  },

  /**
   * Trigger manual scan — dipanggil saat app foreground.
   * Sama seperti background task tapi dengan progress callback.
   */
  async runManual(
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    console.log('▶️ [BackgroundTask] Manual scan triggered.');
    const { setScanning, setScanStatus } = useLibraryStore.getState();

    setScanning(true, 0, 0);
    try {
      const result = await runMediaStoreDiff(onProgress);

      if (result.newCount > 0 || result.deletedCount > 0) {
        setScanStatus({ lastScanAt: Date.now() });
        await _sendChangeNotification(result.newCount, result.deletedCount);
      }

      // Enrichment setelah discovery selesai
      if (result.newCount > 0) {
        await runEnrichment(onProgress);
      }

    } finally {
      setScanning(false, 0, 0);
    }
  },
};

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────
async function _setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
    name: 'Media Scanner',
    importance: Notifications.AndroidImportance.LOW,
    sound: undefined,
  });
}

async function _sendChangeNotification(
  newCount: number,
  deletedCount: number
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const parts: string[] = [];
  if (newCount > 0)     parts.push(`${newCount} lagu baru ditemukan`);
  if (deletedCount > 0) parts.push(`${deletedCount} lagu dihapus`);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Pristine Audio',
      body: parts.join(', '),
    },
    trigger: null,
  });
} 