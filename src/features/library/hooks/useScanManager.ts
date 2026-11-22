/**
 * useScanManager Hook
 *
 * Per-node render Library (2026-11-22, prinsip csheva — hanya node yang
 * bersangkutan yang render ulang): hook ini dulu `const store =
 * useLibraryStore()` TANPA selector — satu langganan ke seluruh store —
 * sehingga tiap tick progres scan/enrichment (tiap `set()` store)
 * me-render ulang SEMUA pemakainya, termasuk LibraryScreen utuh.
 *
 * Sekarang dipisah dua hook, masing-masing selector per nilai:
 * - `useScanManager` — flag boolean (isManual/isAuto/isEnriching,
 *   isLocked) + aksi (manualRescan/enrichMetadata/cancelScan). Dipakai
 *   LibraryScreen: layar hanya bangun saat scan mulai/selesai, TIDAK
 *   tiap tick progres.
 * - Hook progres per kelompok pemakai (di bawah) — tiap pemakai hanya
 *   melanggan field yang ditampilkannya: `useManualScanProgress`
 *   (LibraryTabBar), `useAutoScanProgress` (ScanStatusBar +
 *   `useScanStatusVisible`), `useEnrichmentProgress`
 *   (LibraryTabBar + ScanStatusBar + EnrichMetadataModal),
 *   `useEnrichmentCounts` (LibraryHeader/badge — hanya hitungan, tanpa
 *   objek progres), `useScanFlags` (hanya boolean mulai/selesai).
 *
 * KOREKSI (2026-11-22, audit Library): komentar lama di sini mengklaim
 * "selector per nilai: tick manual tidak membangunkan subscriber
 * enrichment" — klaim itu SALAH pada `useScanProgress` lama. Hook lama
 * memanggil 10 selector sekaligus dan mengembalikannya dalam satu
 * objek, jadi SEMUA pemakainya melanggan KE-10 field: tick manual
 * membangunkan subscriber enrichment (dan sebaliknya), dan perubahan
 * `lastScanAt`/`lastEnrichmentAt` membangunkan semua node progres.
 * `useMemo` pada objek kembalian tidak menolong: pemicu render ulang
 * adalah langganan selector, bukan identitas objek. Pemecahan di bawah
 * memperbaikinya dengan memisahkan LANGGANAN per kelompok pemakai —
 * bukan sekadar memisahkan field di dalam satu hook yang sama.
 * `useScanProgress` dihapus: tidak ada pemakai yang memakai semua
 * field-nya.
 *
 * Kembalian tiap hook di-`useMemo` (pola useEqualizer.ts opsi 2) supaya
 * identitas objeknya stabil selama potongannya tidak berubah.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  UnifiedScanService,
  ScanAlreadyRunningError,
} from "../services/UnifiedScanService";
import { runInitialScan } from "../services/initialScan";
import { useLibraryStore } from "../store/libraryStore";
import { ScanProgress } from "../types/scan";
import { shouldRunInitialScan } from "../services/initialScanGuard";

export function useScanManager() {
  // Selector per flag — boolean hanya berubah saat scan/enrichment
  // mulai/selesai, bukan tiap tick progres.
  const isManualScanning = useLibraryStore((s) => s.isManualScanning);
  const isAutoScanning = useLibraryStore((s) => s.isAutoScanning);
  const isEnriching = useLibraryStore((s) => s.isEnriching);
  const hasInitialized = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  // ── Initial Scan hanya jika library kosong ──────────────────────────────────
  // S1: fresh install WAJIB quickscan — SATU KALI, metadata minimal (satu
  // query MediaStore via quickDiff), lalu tandai selesai.
  // BUKAN deep scan: kode lama yang dikomen memanggil
  // UnifiedScanService.manualScan() (full diff) — sengaja TIDAK dipulihkan.
  // Initial scan TIDAK punya toggle (keputusan csheva 2026-11-18:
  // "Pindai Awal" dihapus dari Settings) — jalan secara default saat
  // fresh install. quickDiff dipanggil dengan bypassAutoScanGate karena
  // gerbang quickDiff milik Auto Discovery; bypass di sini pernyataan
  // "gerbang sudah diperiksa pemanggil" (shouldRunInitialScan di bawah
  // sudah memeriksa library kosong + belum pernah scan + tidak ada scan
  // jalan), supaya satu engine tidak perlu tahu kebijakan scan perdana.
  // Delay 1 dtk dipertahankan dari kode lama: memberi waktu rehydrate
  // zustand-persist (tracks dari AsyncStorage) + izin media dari
  // performInitialization, supaya tracks.length tidak dibaca saat store
  // masih kosong padahal library sebenarnya sudah ada.
  // startAutoScan/finishAutoScan: menyalakan status scan yang sudah ada
  // supaya EmptyLibrary menampilkan status "Memindai library…" (statis —
  // tanpa spinner/angka; angka progres hidup di bar LibraryTabBar, lihat
  // batas maks 2 animasi notif 2026-11-22) selama quickDiff jalan
  // (quickDiff sendiri tidak melaporkan progres — lihat S4) dan supaya
  // resume quickDiff lain tidak tumpang tindih selama scan perdana jalan.
  // Rantai lengkapnya ada di services/initialScan.ts (runInitialScan):
  // quickDiff → setTracks → handleResumeDiffResult (antre lagu baru +
  // jalankan worker enrichment). Dipisah supaya rantai itu bisa diuji
  // tanpa me-render hook.
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const timer = setTimeout(async () => {
      const currentStore = useLibraryStore.getState();

      if (
        !shouldRunInitialScan({
          trackCount: currentStore.tracks.length,
          hasCompletedInitialScan: currentStore.hasCompletedInitialScan,
          isManualScanning: currentStore.isManualScanning,
          isAutoScanning: currentStore.isAutoScanning,
        })
      ) {
        return;
      }

      console.log(
        "[useScanManager] Fresh/empty library → Running initial quick scan",
      );
      setIsLocked(true);
      try {
        await runInitialScan(currentStore);
      } catch (err) {
        console.warn("[useScanManager] Initial scan error:", err);
      } finally {
        currentStore.finishAutoScan();
        setIsLocked(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // ── Manual Rescan ───────────────────────────────────────────────────────────
  // FASE 4: efek AppState quick-diff resume SUDAH PINDAH ke
  // useForegroundRefreshCoordinator (ter-mount sekali di root _layout) —
  // satu listener, satu penjaga J3-1, urutan diff-dulu-baru-bump. Hook ini
  // tinggal memegang initial scan + aksi manual (rescan/enrich/cancel).
  const manualRescan = useCallback(
    async (onProgress?: (progress: ScanProgress) => void) => {
      console.log("[useScanManager] manualRescan called");
      console.log("[useScanManager] - isLocked:", isLocked);
      // Per-node render: hook ini TIDAK lagi melanggan store utuh —
      // flag dibaca segar dari getState() (pola yang sama dengan guard
      // di bawah), bukan dari closure `store` yang dulu ikut membangunkan
      // pemakai hook tiap set() store.
      const liveForLog = useLibraryStore.getState();
      console.log(
        "[useScanManager] - isManualScanning:",
        liveForLog.isManualScanning,
      );
      console.log(
        "[useScanManager] - isAutoScanning:",
        liveForLog.isAutoScanning,
      );

      // N27: baca flag scan dari getState() (segar), bukan hanya closure
      // hook — dua tap cepat sebelum re-render dulu sama-sama lolos cek
      // isLocked/store karena closure-nya basi, lalu yang kedua dilempar
      // service sebagai "sudah jalan". Guard service (isRunning) tetap
      // lapis terakhir; lemparan ini bertipe supaya pemanggil bisa
      // membedakannya dari kegagalan scan beneran.
      const live = useLibraryStore.getState();
      if (isLocked || live.isManualScanning || live.isAutoScanning) {
        console.warn("[useScanManager] ❌ Scan locked or already running");
        throw new ScanAlreadyRunningError();
      }

      console.log("[useScanManager] ✅ Setting isLocked = true");
      setIsLocked(true);
      try {
        const result = await UnifiedScanService.manualScan(onProgress);
        console.log("[useScanManager] ✅ manualScan completed");
        return result;
      } catch (err) {
        console.error("[useScanManager] ❌ manualScan error:", err);
        throw err;
      } finally {
        console.log("[useScanManager] 🔚 Setting isLocked = false");
        setIsLocked(false);
      }
    },
    // Flag scan dibaca segar via getState() di dalam — callback hanya
    // bergantung pada kunci lokal, jadi identitasnya stabil selama tidak
    // ada operasi yang dikunci (pemakai memo tidak batal tiap tick).
    [isLocked],
  );

  // ── Enrich Metadata ─────────────────────────────────────────────────────────
  const enrichMetadata = useCallback(
    async (options?: {
      songIds?: string[];
      limit?: number;
      onProgress?: (
        current: number,
        total: number,
        songInfo?: { title?: string; artist?: string },
      ) => void;
    }) => {
      if (isLocked) throw new Error("Operation in progress");
      setIsLocked(true);
      try {
        return await UnifiedScanService.enrichMetadata(options || {});
      } finally {
        setIsLocked(false);
      }
    },
    [isLocked],
  );

  const cancelScan = useCallback(() => {
    UnifiedScanService.cancel?.();
    // N21: JANGAN setIsLocked(false) di sini. Cancel hanya meng-abort
    // (J2-4: isRunning sengaja tetap true sampai operasi mendeteksi abort
    // di checkpoint-nya); kunci ini dilepas oleh finally operasi yang
    // sedang jalan (enrichMetadata/manualRescan/initial scan). Dulu
    // cancel membuka kunci secara sinkron sementara abort masih merambat
    // — mulai lagi langsung melempar "Scan already in progress" dari
    // guard UnifiedScanService.isRunning.
  }, []);

  const canScan = !isLocked && !isManualScanning && !isAutoScanning;

  // Hanya flag + aksi — TIDAK ada objek progres/hitungan di sini:
  // pemakai hook ini (LibraryScreen) tidak boleh bangun tiap tick.
  // Yang butuh angka progres memakai hook per kelompok di bawah
  // (useManualScanProgress / useAutoScanProgress / useEnrichmentProgress).
  return useMemo(
    () => ({
      isAutoScanning,
      isManualScanning,
      isEnriching,
      isLocked,
      canScan,
      manualRescan,
      enrichMetadata,
      cancelScan,
    }),
    [
      isAutoScanning,
      isManualScanning,
      isEnriching,
      isLocked,
      canScan,
      manualRescan,
      enrichMetadata,
      cancelScan,
    ],
  );
}

/**
 * useScanFlags — hanya boolean mulai/selesai scan/enrichment, tanpa
 * angka progres. Pemakai: node yang hanya perlu tahu "sedang jalan
 * atau tidak" (mis. LibraryHeader untuk tombol scan/badge).
 */
export function useScanFlags() {
  const isManualScanning = useLibraryStore((s) => s.isManualScanning);
  const isAutoScanning = useLibraryStore((s) => s.isAutoScanning);
  const isEnriching = useLibraryStore((s) => s.isEnriching);

  return useMemo(
    () => ({ isManualScanning, isAutoScanning, isEnriching }),
    [isManualScanning, isAutoScanning, isEnriching],
  );
}

/**
 * useManualScanProgress — progres manual scan saja. Pemakai:
 * LibraryTabBar (bar + pill "Scanning N / M files"). Tick manual
 * hanya membangunkan pemakai hook ini — subscriber enrichment dan
 * subscriber auto scan tidak ikut bangun.
 */
export function useManualScanProgress() {
  const isManualScanning = useLibraryStore((s) => s.isManualScanning);
  const manualScanProgress = useLibraryStore((s) => s.manualScanProgress);

  return useMemo(
    () => ({ isManualScanning, manualScanProgress }),
    [isManualScanning, manualScanProgress],
  );
}

/**
 * useAutoScanProgress — progres auto scan saja. Pemakai: ScanStatusBar
 * (chip "Scanning library... N/M") + `useScanStatusVisible` (TabsLayout,
 * hanya butuh flag-nya). Tick auto scan tidak membangunkan subscriber
 * manual/enrichment.
 */
export function useAutoScanProgress() {
  const isAutoScanning = useLibraryStore((s) => s.isAutoScanning);
  const autoScanProgress = useLibraryStore((s) => s.autoScanProgress);

  return useMemo(
    () => ({ isAutoScanning, autoScanProgress }),
    [isAutoScanning, autoScanProgress],
  );
}

/**
 * useEnrichmentProgress — progres + antrean + hitungan enrichment.
 * Pemakai: node yang MENAMPILKAN angka enrichment — LibraryTabBar
 * (bar "Enriching N / M"), ScanStatusBar (chip + cabang background),
 * EnrichMetadataModal (bar progres + hitungan). Tick enrichment
 * membangunkan pemakai hook ini saja, bukan subscriber manual/auto.
 * Node yang hanya butuh hitungan (bukan angka progres) memakai
 * `useEnrichmentCounts` di bawah supaya tidak bangun tiap tick.
 */
export function useEnrichmentProgress() {
  const isEnriching = useLibraryStore((s) => s.isEnriching);
  const enrichmentProgress = useLibraryStore((s) => s.enrichmentProgress);
  const enrichmentQueueSize = useLibraryStore((s) => s.enrichmentQueueSize);
  const unenrichedCount = useLibraryStore((s) => s.unenrichedCount);
  const hasPendingEnrichment = unenrichedCount > 0 || enrichmentQueueSize > 0;
  const isBackgroundEnriching = enrichmentQueueSize > 0 && !isEnriching;

  return useMemo(
    () => ({
      isEnriching,
      enrichmentProgress,
      enrichmentQueueSize,
      unenrichedCount,
      hasPendingEnrichment,
      isBackgroundEnriching,
    }),
    [
      isEnriching,
      enrichmentProgress,
      enrichmentQueueSize,
      unenrichedCount,
      hasPendingEnrichment,
      isBackgroundEnriching,
    ],
  );
}

/**
 * useEnrichmentCounts — hanya hitungan enrichment, TANPA objek progres.
 * Pemakai: LibraryHeader (teks "N pending" + badge Enhance) — hitungan
 * berubah jauh lebih jarang daripada tick `enrichmentProgress`, jadi
 * header tidak bangun tiap tick enrichment.
 */
export function useEnrichmentCounts() {
  const enrichmentQueueSize = useLibraryStore((s) => s.enrichmentQueueSize);
  const unenrichedCount = useLibraryStore((s) => s.unenrichedCount);
  const hasPendingEnrichment = unenrichedCount > 0 || enrichmentQueueSize > 0;

  return useMemo(
    () => ({ enrichmentQueueSize, unenrichedCount, hasPendingEnrichment }),
    [enrichmentQueueSize, unenrichedCount, hasPendingEnrichment],
  );
}
