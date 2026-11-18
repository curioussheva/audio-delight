/**
 * refreshCoalescer.ts — Fase 4: satu pekerjaan refresh yang sedang jalan
 * tidak boleh diduplikasi oleh pemicu kedua.
 *
 * Masalah yang diperbaiki: refresh foreground berulang (dua bump
 * berdekatan, atau pull-to-refresh saat subscriber refreshKey juga jalan)
 * dulu menjalankan `getLibrarySongs()` + `reload()` dua kali bersamaan —
 * dua baca DB penuh + dua `setTracks`. Coalescer mengembalikan promise
 * yang SAMA ke pemanggil kedua: pekerjaannya tetap satu, hasilnya
 * dibagikan. Setelah pekerjaan selesai, panggilan berikutnya jalan lagi
 * seperti biasa (bukan hasil basi yang di-cache).
 *
 * Logika murni, tanpa react-native — diuji jest.
 */
export interface RefreshCoalescer {
  /**
   * Jalankan `task`, atau kembalikan pekerjaan yang sedang jalan bila ada.
   * Penolakan diteruskan ke semua penunggu, dan slot in-flight dibersihkan
   * supaya panggilan berikutnya bisa jalan lagi.
   */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** True selama ada pekerjaan yang sedang jalan. */
  readonly isRunning: boolean;
}

export function createRefreshCoalescer(): RefreshCoalescer {
  let inFlight: Promise<unknown> | null = null;

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (inFlight) return inFlight as Promise<T>;
      let p: Promise<T>;
      try {
        p = task();
      } catch (err) {
        // task sync-throw (async fn tidak pernah begini) — jangan kunci slot.
        return Promise.reject(err);
      }
      inFlight = p;
      // `.then(clear, clear)` (bukan `.finally`): promise hasil then ini
      // selalu resolve, jadi tidak ada unhandled rejection dari wrapper.
      const clear = () => {
        if (inFlight === p) inFlight = null;
      };
      p.then(clear, clear);
      return p;
    },
    get isRunning(): boolean {
      return inFlight !== null;
    },
  };
}
