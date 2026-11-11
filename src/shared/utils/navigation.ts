/**
 * safeGoBack — satu pola untuk semua tombol kembali.
 *
 * Masalah yang ditutup: `router.back()` mentah tidak tertangani kalau
 * tidak ada history (layar root tab/drawer) — expo-router mencetak
 * "The action 'GO_BACK' was not handled by any navigator" — dan guard
 * `canGoBack()` saja tidak menutup race double-tap, karena dispatch
 * back ditunda ke flush effect: dua tap sama-sama lolos guard sebelum
 * flush pertama jalan, tap kedua mendarat di layar root tanpa history.
 * (Ditemukan di sesi Metro 2026-11-12: double-tap tombol tutup player.)
 *
 * Helper ini: (1) cek `canGoBack()` — kalau tidak ada history, jatuh ke
 * Library lewat `replace` supaya tombol tidak pernah jadi no-op;
 * (2) debounce modul-level 400ms — hanya satu aksi back per jendela,
 * jadi tap ganda / tap + swipe-dismiss yang berlomba tidak bisa
 * mengirim GO_BACK kedua ke layar root.
 *
 * Sengaja TIDAK mengimpor expo-router: router diterima sebagai
 * antarmuka struktural minimal, supaya helper ini tetap logika murni
 * dan bisa diuji tanpa react-native. `useRouter()` memenuhi antarmuka
 * ini secara struktural.
 */

/** Subset router yang dibutuhkan tombol kembali. */
export interface BackCapableRouter {
  canGoBack(): boolean;
  back(): void;
  replace(href: string): void;
}

/** Fallback kalau tidak ada history: layar Library. */
export const LIBRARY_FALLBACK = "/(drawer)/(tabs)/library";

/** Jendela debounce antar aksi back (ms). */
export const GO_BACK_DEBOUNCE_MS = 400;

let lastGoBackAt = 0;

/**
 * Kembali satu langkah, atau ke Library kalau tidak ada history.
 * Mengembalikan `true` kalau sebuah aksi navigasi dijalankan,
 * `false` kalau panggilan diabaikan karena masih dalam jendela debounce.
 */
export function safeGoBack(
  router: BackCapableRouter,
  fallback: string = LIBRARY_FALLBACK,
): boolean {
  const now = Date.now();
  if (now - lastGoBackAt < GO_BACK_DEBOUNCE_MS) return false;
  lastGoBackAt = now;
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
  return true;
}

/** Hanya untuk tes: reset jendela debounce antar kasus. */
export function resetSafeGoBackDebounce(): void {
  lastGoBackAt = 0;
}
