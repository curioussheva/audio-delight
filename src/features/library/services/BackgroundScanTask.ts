import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

import { ScanDiffEngine } from "./ScanDiffEngine"; // Gunakan engine yang sudah di-refactor
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
    console.log("[BackgroundTask] Auto-scan is DISABLED by user. Unregistering task...");
    // Self-cleanup: Jika task terpanggil tapi setting OFF, matikan task-nya
    await BackgroundTask.unregisterTaskAsync(TASK_NAME).catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  isTaskRunning = true;

  try {
    const shouldProceed = await _checkConditions();
    if (!shouldProceed) return BackgroundTask.BackgroundTaskResult.Success;

    // Jalankan Full Diff
    const result = await ScanDiffEngine.runMediaStoreDiff();

    if (result.newCount === 0 && result.deletedCount === 0) {
      console.log("[BackgroundTask] No changes detected.");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Beritahu user jika ada perubahan koleksi
    await _sendChangeNotification(result.newCount, result.deletedCount);

    console.log(`✅ [BackgroundTask] Success: +${result.newCount}, -${result.deletedCount}`);
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

    // Pastikan user mengizinkan auto-scan sebelum mendaftar
    const { isAutoScanEnabled } = useLibraryStore.getState();
    if (!isAutoScanEnabled) {
      console.log("[BackgroundTask] Skip registration: User disabled auto-scan.");
      return false;
    }

    const { status: mediaPerm } = await MediaLibrary.requestPermissionsAsync();
    const { status: notifPerm } = await Notifications.requestPermissionsAsync();

    if (mediaPerm !== 'granted') {
      console.warn("[BackgroundTask] Permission missing.");
      return false;
    }

    await _setupNotificationChannel();

    try {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: intervalMinutes * 60,
     //   stopOnTerminate: false, // Tetap jalan meski app di-kill
     //   startOnBoot: true,      // Jalan otomatis saat HP restart
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
    // Langsung unregister — skip isRegistered() check
    // kalau task tidak ada, error ditangkap di catch
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    console.log("🛑 [BackgroundTask] Unregistered.");
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (
      msg.includes("not registered") ||
      msg.includes("not found") ||
      e?.code === "ERR_TASK_NOT_REGISTERED"
    ) {
      // Task memang belum ada — bukan error sebenarnya
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
    // Kalau throw, anggap belum terdaftar
    return false;
  }
},
};

// ── Internal Helpers ───────────────────────────────────────────

async function _checkConditions(): Promise<boolean> {
  // Kamu bisa tambah logic: jangan scan jika baterai < 15%
  return true;
}

async function _setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
    name: "Pristine Library Sync",
    importance: Notifications.AndroidImportance.LOW, // Jangan ganggu user dengan suara/pop-up
    showBadge: false,
  });
}

async function _sendChangeNotification(newCount: number, deletedCount: number): Promise<void> {
  const body = [
    newCount > 0 ? `${newCount} lagu baru ditemukan` : null,
    deletedCount > 0 ? `${deletedCount} lagu dihapus` : null
  ].filter(Boolean).join(", ");

  if (!body) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Library Diperbarui",
      body: body,
    },
    trigger: null,
  });
}
