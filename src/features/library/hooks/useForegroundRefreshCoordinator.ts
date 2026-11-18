/**
 * useForegroundRefreshCoordinator — Fase 4: SATU pemicu refresh foreground.
 *
 * PETA JALUR LAMA (sebelum dilebur — lihat fase4-report.md §1):
 * library.tsx dan useScanManager masing-masing mendengarkan AppState
 * "active" dengan penjaga sendiri-sendiri (cooldown 60 dtk + skip <3 dtk
 * background, nilainya sama tapi state-nya terpisah — J3-1 menyatukan
 * KEPUTUSANNYA di resumeRefreshGuard, tapi pemicunya tetap dua).
 * Dua cacat koordinasi tersisa:
 * 1. URUTAN TERBALIK: refresh Library (debounce 500ms) jalan SEBELUM
 *    quickDiff (800ms) — jadi refresh membaca DB sebelum diff ditulis,
 *    dan lagu baru/hilang baru tampil di resume BERIKUTNYA.
 * 2. REFRESH DI TENGAH SCAN: listener Library tidak memeriksa apakah
 *    scan sedang jalan (quickDiff memeriksanya) — baca DB saat tulis
 *    diff berjalan bisa mengembalikan daftar sebagian/kosong.
 *
 * Jalur baru: SATU listener di sini (ter-mount sekali di root _layout,
 * hidup selama app ready). Keputusan boleh-jalan-atau-tidak TETAP
 * `shouldRunResumeRefresh` (J3-1 — debounce + cooldown dipertahankan,
 * bukan diganti): refreshKey mengganti PEMICUNYA, bukan PENGAMANNYA.
 * Urutan di tiap resume yang lolos penjaga: quickDiff DULU (tulis diff
 * ke DB + antre enrichment), BARU bump refreshKey("resume") — subscriber
 * Library baru membaca DB setelah diff tertulis.
 *
 * Yang SENGAJA tidak dilebur ke sini:
 * - syncFromNative (playerStore, J1-3): sinkronisasi antrean native —
 *   domain playback, bukan data library.
 * - Initial scan (useScanManager): sekali saat mount Library kosong.
 * - Manual rescan / pull-to-refresh: pemicu pengguna, jalurnya sendiri
 *   (manual rescan me-bump "manual-scan" saat selesai).
 */
import { useEffect } from "react";
import { AppState } from "react-native";

import { ScanDiffEngine } from "../services/ScanDiffEngine";
import { handleResumeDiffResult } from "../services/resumeEnrichment";
import {
  MIN_BACKGROUND_MS,
  RESUME_SCAN_COOLDOWN_MS,
  shouldRunResumeRefresh,
} from "../services/resumeRefreshGuard";
import { useLibraryStore } from "../store/libraryStore";
import { useRefreshStore } from "@/shared/store/refreshStore";

// J3-1: konstanta penjaga tetap dari resumeRefreshGuard — jangan gandakan
// nilainya di sini (lihat juga re-export lama di useScanManager yang
// sudah dihapus bersama listener gandanya).
export { MIN_BACKGROUND_MS, RESUME_SCAN_COOLDOWN_MS };

// Debounce resume — dulu quickDiff 800ms; refresh Library 500ms.
// Satu timer 800ms (yang lebih panjang): user yang cepat kembali ke
// background lagi tidak memicu pekerjaan.
const RESUME_DEBOUNCE_MS = 800;
// Throttle log penolakan cooldown (pola lama useScanManager).
const RESUME_LOG_THROTTLE_MS = 10_000;

// State level modul supaya selamat dari remount (pola yang sama dengan
// useScanManager lama: _globalLastResumeScan dkk.).
let _backgroundedAt = 0;
let _lastResumeRunAt = 0;
let _isQuickDiffRunning = false;
let _lastResumeLogAt = 0;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Quick diff resume. True bila diff benar-benar jalan (walau hasilnya
 * kosong — auto-scan OFF juga butuh refresh Library sesudahnya, karena
 * quickDiff tidak pernah setTracks). False bila dilewat (scan jalan)
 * atau gagal — saat itu JANGAN bump, biar UI tidak membaca DB yang
 * sedang ditulis; bump penutup scan yang akan me-refresh.
 */
async function runResumeQuickDiff(): Promise<boolean> {
  const store = useLibraryStore.getState();
  if (store.isManualScanning || store.isAutoScanning) {
    console.log("[ForegroundRefresh] Scan is running, skip quick diff");
    return false;
  }
  if (_isQuickDiffRunning) return false;

  _isQuickDiffRunning = true;
  // Timestamp dicatat SEBELUM jalan (pola lama): cooldown 60 dtk dihitung
  // dari pekerjaan terakhir yang dimulai, bukan yang selesai.
  _lastResumeRunAt = Date.now();
  console.log("[ForegroundRefresh] App resumed → Running quick diff...");
  try {
    const diffResult = await ScanDiffEngine.quickDiff();
    // S2: antre lagu baru + jalankan worker enrichment.
    await handleResumeDiffResult(diffResult);
    return true;
  } catch (err) {
    console.warn("[ForegroundRefresh] Quick diff on resume failed:", err);
    return false;
  } finally {
    _isQuickDiffRunning = false;
  }
}

export function useForegroundRefreshCoordinator(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      // 🔥 FIX Bug #4: track background duration (skip audio focus
      // false positive) — pola lama useScanManager, dipindah ke sini.
      if (nextState === "background" || nextState === "inactive") {
        _backgroundedAt = Date.now();
        return;
      }
      if (nextState !== "active") return;
      if (_isQuickDiffRunning) return;

      const now = Date.now();

      // J3-1: SATU predikat penjaga bersama (resumeRefreshGuard) —
      // skip kalau baru <3 dtk di background, cooldown 60 dtk antar
      // refresh foreground. Penjaga TIDAK diubah di Fase 4.
      const resumeDecision = shouldRunResumeRefresh({
        backgroundedAt: _backgroundedAt,
        lastRunAt: _lastResumeRunAt,
        now,
      });
      if (resumeDecision !== "ok") {
        if (
          resumeDecision === "cooldown" &&
          now - _lastResumeLogAt > RESUME_LOG_THROTTLE_MS
        ) {
          console.log("[ForegroundRefresh] Resume cooldown active, skip");
          _lastResumeLogAt = now;
        }
        return;
      }

      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        void runResumeQuickDiff().then((ran) => {
          // URUTAN YANG DIPERBAIKI: bump hanya sesudah diff selesai —
          // subscriber Library membaca DB yang sudah berisi diff.
          if (ran) {
            useRefreshStore
              .getState()
              .bumpRefreshKey("resume", "coordinator");
          }
        });
      }, RESUME_DEBOUNCE_MS);
    });

    return () => {
      subscription.remove();
      if (_debounceTimer) clearTimeout(_debounceTimer);
    };
  }, []);
}
