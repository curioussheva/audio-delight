/**
 * ScanQueue
 * Persistent queue management menggunakan AsyncStorage
 * Menyimpan daftar lagu yang perlu di-enrich
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueueItem } from "../types/scan";

const QUEUE_KEY = "@pristine/scan_queue_v1";
const MAX_RETRIES = 3;

export class ScanQueue {
  /**
   * Get current queue dari AsyncStorage
   */
  static async getQueue(): Promise<QueueItem[]> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[ScanQueue] Failed to get queue:", error);
      return [];
    }
  }

  /**
   * Add items ke queue
   * - Hindari duplikat
   * - Sort by priority (desc), then by addedAt (asc)
   */
  static async add(
    items: Omit<QueueItem, "addedAt" | "retryCount">[],
  ): Promise<number> {
    if (items.length === 0) return 0;

    try {
      const existing = await this.getQueue();
      const existingIds = new Set(existing.map((i) => i.songId));

      // Filter duplikat dan buat items baru
      const newItems: QueueItem[] = items
        .filter((item) => !existingIds.has(item.songId))
        .map((item) => ({
          ...item,
          addedAt: Date.now(),
          retryCount: 0,
        }));

      if (newItems.length === 0) {
        console.log("[ScanQueue] All items already in queue");
        return 0;
      }

      // Merge, sort by priority (desc), then by addedAt (asc)
      const merged = [...existing, ...newItems];
      merged.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.addedAt - b.addedAt;
      });

      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(merged));
      console.log(
        `[ScanQueue] Added ${newItems.length} items (${merged.length} total)`,
      );

      return newItems.length;
    } catch (error) {
      console.error("[ScanQueue] Failed to add items:", error);
      return 0;
    }
  }

  /**
   * Ambil dan hapus item pertama dari queue (FIFO dengan priority)
   */
  static async shift(): Promise<QueueItem | null> {
    try {
      const queue = await this.getQueue();
      if (queue.length === 0) return null;

      const item = queue.shift()!;
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      return item;
    } catch (error) {
      console.error("[ScanQueue] Failed to shift:", error);
      return null;
    }
  }

  /**
   * Retry failed item - pindah ke akhir queue dengan increment retry count
   * Returns false jika max retries reached (item di-drop)
   */
  static async retry(item: QueueItem): Promise<boolean> {
    if (item.retryCount >= MAX_RETRIES) {
      console.warn(
        `[ScanQueue] Max retries reached for ${item.songId}, dropping`,
      );
      return false;
    }

    try {
      const queue = await this.getQueue();
      queue.push({
        ...item,
        retryCount: item.retryCount + 1,
      });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log(
        `[ScanQueue] Retrying ${item.songId} (attempt ${item.retryCount + 1})`,
      );
      return true;
    } catch (error) {
      console.error("[ScanQueue] Failed to retry:", error);
      return false;
    }
  }

  /**
   * Remove specific item dari queue
   */
  static async remove(songId: string): Promise<void> {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter((item) => item.songId !== songId);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("[ScanQueue] Failed to remove:", error);
    }
  }

  /**
   * Clear entire queue
   */
  static async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
      console.log("[ScanQueue] Queue cleared");
    } catch (error) {
      console.error("[ScanQueue] Failed to clear:", error);
    }
  }

  /**
   * Get queue size
   */
  static async getSize(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  /**
   * Peek at queue tanpa menghapus
   */
  static async peek(limit: number = 10): Promise<QueueItem[]> {
    const queue = await this.getQueue();
    return queue.slice(0, limit);
  }

  /**
   * Check if queue contains specific songId
   */
  static async contains(songId: string): Promise<boolean> {
    const queue = await this.getQueue();
    return queue.some((item) => item.songId === songId);
  }
}
