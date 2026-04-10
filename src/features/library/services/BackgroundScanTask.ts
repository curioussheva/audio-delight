/**
 * BackgroundScanTask.ts
 * Background task untuk scan library di Android
 */

import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

import { runMediaStoreDiff } from "./ScanDiffEngine";
import { useLibraryStore } from "../store/libraryStore";
import { LibraryScanner } from "../api/scanner";

const TASK_NAME = "PRISTINE_BACKGROUND_SCAN";
const NOTIF_CHANNEL = "media-scanner";

let isTaskRunning = false;

TaskManager.defineTask(TASK_NAME, async () => {
  console.log("🔄 [BackgroundTask] Woke up, running diff scan...");

  if (isTaskRunning) {
    console.log("[BackgroundTask] Task already running, skipping...");
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  isTaskRunning = true;

  try {
    const shouldProceed = await _checkConditions();
    if (!shouldProceed) {
      console.log("[BackgroundTask] Conditions not optimal, skipping");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await runMediaStoreDiff();

    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log("[BackgroundTask] No changes detected.");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Update store (flat state)
    const store = useLibraryStore.getState();
    store.finishAutoScan?.(); // atau update lastScanAt jika ada action

    await _sendChangeNotification(result.newCount, result.deletedCount);

    // Enrichment untuk new songs (limited)
    if (result.newCount > 0) {
      console.log(`[BackgroundTask] Enriching ${result.newCount} new songs...`);
      // Panggil enrichMetadata dengan limit kecil untuk background
      // await UnifiedScanService.enrichMetadata({ limit: 50 });
    }

    console.log(
      `✅ [BackgroundTask] Done. +( {result.newCount}, - ){result.deletedCount}`,
    );

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("[BackgroundTask] Task failed:", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    isTaskRunning = false;
  }
});

// ── Public API ─────────────────────────────────────────────────
export const BackgroundScanTask = {
  async register(intervalMinutes = 30): Promise<boolean> {
    if (Platform.OS !== "android") {
      console.log("[BackgroundTask] Only supported on Android");
      return false;
    }

    const [mediaPermission] = await Promise.all([
      MediaLibrary.requestPermissionsAsync(),
      Notifications.requestPermissionsAsync(),
    ]);

    if (!mediaPermission.granted) {
      console.warn("[BackgroundTask] MediaLibrary permission not granted.");
      return false;
    }

    await _setupNotificationChannel();

    try {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: intervalMinutes * 60,
      });
      console.log(
        `✅ [BackgroundTask] Registered. Interval: ${intervalMinutes} menit.`,
      );
      return true;
    } catch (e) {
      console.warn("[BackgroundTask] Register failed:", e);
      return false;
    }
  },

  async unregister(): Promise<void> {
    try {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      console.log("🛑 [BackgroundTask] Unregistered.");
    } catch (e) {
      console.warn("[BackgroundTask] Unregister failed:", e);
    }
  },

  async isRegistered(): Promise<boolean> {
    try {
      return await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    } catch {
      return false;
    }
  },

  async runManual(
    onProgress?: (
      phase: "diff" | "enrich",
      current: number,
      total: number,
    ) => void,
  ): Promise<{ newCount: number; deletedCount: number }> {
    console.log("[BackgroundTask] Manual scan started...");

    const store = useLibraryStore.getState();
    let newCount = 0;
    let deletedCount = 0;

    try {
      store.startManualScan?.();
      onProgress?.("diff", 0, 0);

      const result = await runMediaStoreDiff((current, total) => {
        onProgress?.("diff", current, total);
      });

      newCount = result.newCount;
      deletedCount = result.deletedCount;

      if (newCount > 0 || deletedCount > 0) {
        store.finishManualScan?.();
        await _sendChangeNotification(newCount, deletedCount);
      }

      return { newCount, deletedCount };
    } catch (error) {
      console.error("[BackgroundTask] Manual scan failed:", error);
      throw error;
    } finally {
      // Pastikan state kembali ke false
      store.finishManualScan?.();
    }
  },
};

// ── Internal Helpers ───────────────────────────────────────────

async function _setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: "Media Scanner",
      importance: Notifications.AndroidImportance.LOW,
      sound: undefined,
      vibrationPattern: undefined,
      enableVibrate: false,
    });
  } catch (error) {
    console.warn(
      "[BackgroundTask] Failed to setup notification channel:",
      error,
    );
  }
}

async function _sendChangeNotification(
  newCount: number,
  deletedCount: number,
): Promise<void> {
  if (Platform.OS !== "android") return;

  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} lagu baru`);
  if (deletedCount > 0) parts.push(`${deletedCount} lagu dihapus`);

  if (parts.length === 0) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `scan-${Date.now()}`,
      content: {
        title: "Pristine Audio",
        body: parts.join(", "),
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });
  } catch (error) {
    console.warn("[BackgroundTask] Failed to send notification:", error);
  }
}

async function _checkConditions(): Promise<boolean> {
  // TODO: Tambahkan pengecekan battery/network jika diperlukan
  return true;
}
