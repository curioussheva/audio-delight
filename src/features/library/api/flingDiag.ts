// src/features/library/api/flingDiag.ts
//
// [FLING] — DIAGNOSTIK SEMENTARA (drawDistance 100, 2026-11-20).
// BUKAN fitur. Hapus file ini + pemakaian di library.tsx (kedua
// FlashList: onMomentumScrollBegin/End) + penyalaan di _layout.tsx
// begitu perbandingan kinerja drawDistance 100 vs 50 terjawab.
//
// PERTANYAAN: perbandingan kinerja drawDistance 100 vs 50 butuh angka,
// bukan sekadar rasa — berapa lama fling, seberapa jauh, berapa baris
// yang dilewati. Modul ini mencatat SATU baris per fling (mulai →
// selesai momentum), TIDAK PERNAH per event scroll: onScroll mentah
// terlalu panas untuk dilog.
//
// rowsEst = jarak / tinggi baris (±77 dp — SongListItem: konten ±53 dp
// + paddingVertical 20 + marginVertical 4; angka yang sama dipakai
// hitung drawDistance 3570). Itu ESTIMASI jarak-dalam-baris, BUKAN
// hitungan baris yang benar-benar ter-render (itu butuh
// onViewableItemsChanged — follow-up bila estimasi tidak cukup).
//
// Modul ini SENGAJA tidak mengimpor react-native: logika murni yang
// bisa diuji jest (aturan jest.config.cjs). Dinyalakan lewat diagGate
// (flag globalThis, diset _layout.tsx di efek dev-only); default MATI,
// jadi release tidak pernah log.

import { isTempDiagEnabled } from "@/shared/utils/diagGate";

/** Daftar yang di-fling (satu per FlashList di library.tsx). */
export type FlingList = "playlist" | "songs";

/** Tinggi satu baris lagu (dp) — lihat header soal asal angka. */
const ROW_HEIGHT_DP = 77;

interface FlingStart {
  offsetY: number;
  at: number;
}

let pendingStarts: Record<FlingList, FlingStart | null> = {
  playlist: null,
  songs: null,
};

/** Catat awal momentum (fling dimulai). */
export function noteFlingStart(
  list: FlingList,
  offsetY: number,
  nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  pendingStarts[list] = { offsetY, at: nowMs };
}

/**
 * Catat akhir momentum (fling selesai) + satu baris ringkasan.
 * Tanpa start yang tercatat (mis. start terlewat saat diagnostik
 * baru dinyalakan) tetap dilog sebagai endWithoutStart.
 */
export function noteFlingEnd(
  list: FlingList,
  offsetY: number,
  nowMs: number = performance.now(),
): void {
  if (!isTempDiagEnabled()) return;
  const start = pendingStarts[list];
  pendingStarts[list] = null;
  if (!start) {
    console.log(
      `[FLING] list=${list} endWithoutStart offsetY=${Math.round(offsetY)}dp`,
    );
    return;
  }
  const durationMs = nowMs - start.at;
  const distanceDp = Math.abs(offsetY - start.offsetY);
  const rowsEst = Math.round(distanceDp / ROW_HEIGHT_DP);
  console.log(
    `[FLING] list=${list} duration=${Math.round(durationMs)}ms distance=${Math.round(distanceDp)}dp rowsEst=${rowsEst}`,
  );
}

/** Hitung rowsEst dari jarak (untuk tes). */
export function rowsEstForDistance(distanceDp: number): number {
  return Math.round(distanceDp / ROW_HEIGHT_DP);
}

/** Reset seluruh state (tes; juga dipakai saat diagnostik di-stop). */
export function resetFlingDiagState(): void {
  pendingStarts = { playlist: null, songs: null };
}
