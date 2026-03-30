import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task'; // GANTI INI
import * as Notifications from 'expo-notifications';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { runMediaStoreDiff, runEnrichment } from './ScanDiffEngine';
import { useLibraryStore } from '../store/libraryStore';

const TASK_NAME = 'PRISTINE_BACKGROUND_SCAN';
const NOTIF_CHANNEL = 'media-scanner';

// ─────────────────────────────────────────────────────────────
// DEFINE TASK — Tetap di root level
// ─────────────────────────────────────────────────────────────
TaskManager.defineTask(TASK_NAME, async () => {
  console.log('🔄 [BackgroundTask] Woke up, running diff scan...');

  try {
    const result = await runMediaStoreDiff();

    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log('[BackgroundTask] No changes detected.');
      return BackgroundTask.BackgroundTaskResult.NoData; // Ganti enum
    }

    const { setScanStatus } = useLibraryStore.getState();
    setScanStatus({ lastScanAt: Date.now() });

    await _sendChangeNotification(result.newCount, result.deletedCount);
    await runEnrichment();

    console.log(`✅ [BackgroundTask] Done. +${result.newCount}, -${result.deletedCount}`);
    return BackgroundTask.BackgroundTaskResult.NewData; // Ganti enum

  } catch (error) {
    console.error('[BackgroundTask] Task failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed; // Ganti enum
  }
});

export const BackgroundScanTask = {

  async register(intervalMinutes = 30): Promise<void> {
    if (Platform.OS !== 'android') return;

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) return;

    await _setupNotificationChannel();

    try {
      // GANTI: registerTaskAsync -> scheduleTaskAsync
      await BackgroundTask.scheduleTaskAsync(TASK_NAME, {
        interval: intervalMinutes * 60, // Detik
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log(`✅ [BackgroundTask] Registered: ${intervalMinutes} menit.`);
    } catch (e) {
      console.warn('[BackgroundTask] Register failed:', e);
    }
  },

  async unregister(): Promise<void> {
    try {
      // GANTI: unregisterTaskAsync (dari library baru)
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      console.log('🛑 [BackgroundTask] Unregistered.');
    } catch (e) {
      console.warn('[BackgroundTask] Unregister failed:', e);
    }
  },

  async isRegistered(): Promise<boolean> {
    return TaskManager.isTaskRegisteredAsync(TASK_NAME);
  },

  // Manual run tetap sama karena tidak bergantung pada library background
  async runManual(onProgress?: (current: number, total: number) => void): Promise<void> {
    const { setScanning, setScanStatus } = useLibraryStore.getState();
    setScanning(true, 0, 0);

    try {
      const result = await runMediaStoreDiff(onProgress);
      if (result.newCount > 0 || result.deletedCount > 0) {
        setScanStatus({ lastScanAt: Date.now() });
        await _sendChangeNotification(result.newCount, result.deletedCount);
      }
      if (result.newCount > 0) {
        setTimeout(() => runEnrichment(onProgress), 3000);
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