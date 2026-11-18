/**
 * resumeRefreshGuard.ts — J3-1: SATU predikat penjaga untuk SEMUA pemicu
 * refresh saat app kembali foreground.
 *
 * Masalah asal (Batch JS-3, J3-1): library.tsx dan useScanManager masing-
 * masing mendengarkan AppState "active" dengan penjaga sendiri-sendiri
 * (cooldown + durasi background yang nilainya sama tapi state-nya
 * terpisah), sehingga tiap kembali foreground ada dua pekerjaan MediaStore
 * yang tumpang tindih. Commit 372d86ed sudah menyamakan NILAI penjaganya;
 * modul ini menyatukan LOGIKA keputusannya di satu fungsi murni supaya
 * kedua pemicu tidak bisa menyimpang lagi — dan supaya penjaganya bisa
 * diuji jest (jest proyek ini hanya untuk logika murni, tanpa react-native).
 *
 * CATATAN — kenapa dua pemicu ini TIDAK dilebur jadi satu jalur (sudah
 * diverifikasi ke kode, 2026-11-18): keduanya mengerjakan hal yang
 * saling melengkapi, bukan duplikat.
 * - quickDiff (ScanDiffEngine.quickDiff) return kosong saat auto-scan
 *   mati (default OFF, libraryStore.ts:111) dan TIDAK PERNAH setTracks —
 *   jadi tanpa refresh library.tsx, UI tidak menampilkan lagu baru/hilang.
 * - refresh library.tsx (getLibrarySongs + reload) memperbarui daftar
 *   yang tampil tapi tidak menulis diff ke DB / tidak antre enrichment.
 * Melebur keduanya (satu timestamp bersama) akan membuat satu pekerjaan
 * hilang di tiap resume. Yang disatukan di sini adalah KEPUTUSAN
 * boleh-jalan-atau-tidak; pekerjaannya tetap dua, masing-masing dengan
 * cooldown 60 dtk + skip <3 dtk background sendiri.
 */

// Minimum interval antara resume refresh — diekspor supaya pemicu refresh
// foreground lain memakai cooldown yang SAMA (J3-1).
export const RESUME_SCAN_COOLDOWN_MS = 60_000; // 🔥 FIX Bug #4: 60s
export const MIN_BACKGROUND_MS = 3_000; // 🔥 FIX Bug #4: skip resume <3s di bg

export interface ResumeRefreshState {
  /** Timestamp saat app masuk background/inactive; 0 = belum pernah. */
  backgroundedAt: number;
  /** Timestamp terakhir pemicu ini jalan; 0 = belum pernah jalan. */
  lastRunAt: number;
  /** Jam saat ini (Date.now()), diinjeksikan supaya bisa diuji. */
  now: number;
}

/**
 * Alasan penolakan — dipakai pemanggil untuk logging diagnostik (mis.
 * useScanManager hanya me-log penolakan cooldown, yang dit-throttle).
 */
export type ResumeRefreshSkipReason =
  | "ok"
  | "background-too-short"
  | "cooldown";

/**
 * Keputusan boleh-jalan-atau-tidak untuk satu pemicu refresh foreground:
 * app cukup lama di background (>= 3 dtk — mengabaikan false positive
 * audio focus) DAN sudah lewat cooldown sejak jalan terakhir (>= 60 dtk).
 */
export function shouldRunResumeRefresh({
  backgroundedAt,
  lastRunAt,
  now,
}: ResumeRefreshState): ResumeRefreshSkipReason {
  if (backgroundedAt > 0 && now - backgroundedAt < MIN_BACKGROUND_MS) {
    return "background-too-short";
  }
  if (now - lastRunAt < RESUME_SCAN_COOLDOWN_MS) {
    return "cooldown";
  }
  return "ok";
}
