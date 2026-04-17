// src/features/library/services/BackgroundScanTask.ts

import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

import { ScanDiffEngine } from "./ScanDiffEngine";
import { MetadataEnricher } from "./MetadataEnricher"; // ✅ Import MetadataEnricher
import { useLibraryStore } from "../store/libraryStore";

const TASK_NAME = "PRISTINE_BACKGROUND_SCAN";
const NOTIF_CHANNEL = "media-scanner";

let isTaskRunning = false;

/**
 * DEFINISI TASK
 * Berjalan secara periodik di background Android
 */
TaskManager.defineTask(TASK_NAME, async () => {
  console.log("🔄 [BackgroundTask] Woke up...");

  // Guard 1: Jangan double run
  if (isTaskRunning) return BackgroundTask.BackgroundTaskResult.Success;

  // Guard 2: Cek apakah user mengizinkan auto-scan di store
  const { isAutoScanEnabled } = useLibraryStore.getState();
  if (!isAutoScanEnabled) {
    console.log(
      "[BackgroundTask] Auto-scan is DISABLED by user. Unregistering task...",
    );
    await BackgroundTask.unregisterTaskAsync(TASK_NAME).catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  isTaskRunning = true;

  try {
    const shouldProceed = await _checkConditions();
    if (!shouldProceed) return BackgroundTask.BackgroundTaskResult.Success;

    // 1. Jalankan Full Diff
    const result = await ScanDiffEngine.runMediaStoreDiff();

    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log("[BackgroundTask] No changes detected.");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // 2. ✅ PENTING: Antrekan lagu baru untuk ekstraksi artwork/metadata
    if (result.newCount > 0 && result.newSongs && result.newSongs.length > 0) {
      console.log(
        `[BackgroundTask] Queuing ${result.newCount} new songs for artwork enrichment...`,
      );

      await MetadataEnricher.queueSongs(
        result.newSongs.map((s: any) => ({
          id: s.id,
          uri: s.uri,
          priority: 0,
          level: 2, // Level 2 untuk ekstraksi lengkap (termasuk artwork)
        })),
      );

      // Jalankan worker di background (jangan ditunggu/await agar task tidak timeout)
      MetadataEnricher.startBackgroundWorker().catch((err) => {
        console.warn(
          "[BackgroundTask] Background worker encountered an error:",
          err,
        );
      });
    }

    // 3. Beritahu user jika ada perubahan koleksi
    await _sendChangeNotification(result.newCount, result.deletedCount);

    console.log(
      `✅ [BackgroundTask] Success: +${result.newCount}, -${result.deletedCount}`,
    );
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error("[BackgroundTask] Task execution failed:", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    isTaskRunning = false;
  }
});

// ── Public API ─────────────────────────────────────────────────
export const BackgroundScanTask = {
  /**
   * Mendaftarkan task ke Android System
   */
  async register(intervalMinutes = 60): Promise<boolean> {
    if (Platform.OS !== "android") return false;

    const { isAutoScanEnabled } = useLibraryStore.getState();
    if (!isAutoScanEnabled) {
      console.log(
        "[BackgroundTask] Skip registration: User disabled auto-scan.",
      );
      return false;
    }

    const { status: mediaPerm } = await MediaLibrary.requestPermissionsAsync();
    const { status: notifPerm } = await Notifications.requestPermissionsAsync();

    if (mediaPerm !== "granted") {
      console.warn("[BackgroundTask] Permission missing.");
      return false;
    }

    await _setupNotificationChannel();

    try {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: intervalMinutes * 60,
      });
      console.log(`✅ [BackgroundTask] Registered (${intervalMinutes} min).`);
      return true;
    } catch (e) {
      console.warn("[BackgroundTask] Registration error:", e);
      return false;
    }
  },

  async unregister(): Promise<void> {
    try {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      console.log("🛑 [BackgroundTask] Unregistered.");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (
        msg.includes("not registered") ||
        msg.includes("not found") ||
        e?.code === "ERR_TASK_NOT_REGISTERED"
      ) {
        console.log("[BackgroundTask] Task was not registered, skipping.");
      } else {
        console.error("[BackgroundTask] Unregister failed:", e);
      }
    }
  },

  async isRegistered(): Promise<boolean> {
    try {
      return await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    } catch {
      return false;
    }
  },
};

// ── Internal Helpers ───────────────────────────────────────────

async function _checkConditions(): Promise<boolean> {
  // Logic: pastikan baterai aman, dll (jika diperlukan)
  return true;
}

async function _setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
    name: "Pristine Library Sync",
    importance: Notifications.AndroidImportance.LOW,
    showBadge: false,
  });
}

async function _sendChangeNotification(
  newCount: number,
  deletedCount: number,
): Promise<void> {
  const body = [
    newCount > 0 ? `${newCount} lagu baru ditemukan` : null,
    deletedCount > 0 ? `${deletedCount} lagu dihapus` : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (!body) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Library Diperbarui",
      body: body,
    },
    trigger: null,
  });
}
