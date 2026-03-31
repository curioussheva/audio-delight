import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { runMediaStoreDiff, runEnrichment } from './ScanDiffEngine';
import { useLibraryStore } from '../store/libraryStore';

const TASK_NAME = 'PRISTINE_BACKGROUND_SCAN';
const NOTIF_CHANNEL = 'media-scanner';

// ── Register task — WAJIB di root level module ─────────────────
TaskManager.defineTask(TASK_NAME, async () => {
  console.log('🔄 [BackgroundTask] Woke up, running diff scan...');

  try {
    const result = await runMediaStoreDiff();

    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log('[BackgroundTask] No changes detected. Sleeping.');
      return BackgroundTask.BackgroundTaskResult.NoData;
    }

    const { setScanStatus } = useLibraryStore.getState();
    setScanStatus({ lastScanAt: Date.now() });

    await _sendChangeNotification(result.newCount, result.deletedCount);
    await runEnrichment();

    console.log(`✅ [BackgroundTask] Done. +${result.newCount} new, -${result.deletedCount} deleted.`);
    return BackgroundTask.BackgroundTaskResult.Success;

  } catch (error) {
    console.error('[BackgroundTask] Task failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ── Public API ─────────────────────────────────────────────────
export const BackgroundScanTask = {

  async register(intervalMinutes = 30): Promise<void> {
    if (Platform.OS !== 'android') return;

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      console.warn('[BackgroundTask] MediaLibrary permission not granted.');
      return;
    }

    await _setupNotificationChannel();

    try {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: intervalMinutes * 60,
      });
      console.log(`✅ [BackgroundTask] Registered. Interval: ${intervalMinutes} menit.`);
    } catch (e) {
      console.warn('[BackgroundTask] Register failed (mungkin sudah terdaftar):', e);
    }
  },

  async unregister(): Promise<void> {
    try {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      console.log('🛑 [BackgroundTask] Unregistered.');
    } catch (e) {
      console.warn('[BackgroundTask] Unregister failed:', e);
    }
  },

  async isRegistered(): Promise<boolean> {
    return TaskManager.isTaskRegisteredAsync(TASK_NAME);
  },

  async getStatus(): Promise<BackgroundTask.BackgroundTaskStatus | null> {
    try {
      return await BackgroundTask.getStatusAsync();
    } catch {
      return null;
    }
  },

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

      if (result.newCount > 0) {
        // Delay enrichment agar tidak bersaing dengan UI
        setTimeout(() => runEnrichment(onProgress), 3000);
      }

    } finally {
      setScanning(false, 0, 0);
    }
  },
};

// ── Internal Helpers ───────────────────────────────────────────
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
    content: { title: 'Pristine Audio', body: parts.join(', ') },
    trigger: null,
  });
} 