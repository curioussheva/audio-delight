// src/features/visualizer/api/outputModeLabel.ts
//
// Label "Mode" di kartu OUTPUT AKTIF (analyzer.tsx).
//
// C-LABEL (2026-11-12): label lama menampilkan "Bit-Perfect" hanya dari
// status jalur perangkat — rateHonored && !pathLossy && honored dari
// getActiveDeviceStatus(). Itu TIDAK PERNAH memeriksa apakah stream Oboe
// benar-benar exclusive: AAudio bisa menolak exclusive dan Oboe fallback
// diam-diam ke SharedMode, sementara sampel tetap lewat mixer AudioFlinger.
// Labelnya mengklaim bit-perfect padahal jalurnya tidak.
//
// Syarat "Bit-Perfect" sekarang ditambah satu: streamExclusive —
// NativeDSPModule.isExclusiveModeActive() (sync, isBlockingSynchronousMethod;
// NativeDSPModule.kt:331) benar-benar true. Nilai itu dibaca lewat
// useBitPerfectStatus, bukan panggilan mentah di render: hook itu yang
// membedakan "belum tahu" dari "ditolak" (unavailable = native belum siap,
// stale = polling hanya jalan saat playing, jadi bacaan saat pause bisa
// basi — pemakai dilarang menampilkan verdict live bila stale, U-P1-04).
// Selama exclusive belum terkonfirmasi, label jatuh ke "Tidak dapat
// diverifikasi" — JANGAN pernah klaim Bit-Perfect dari status yang belum
// diketahui.
//
// Cabang lain TIDAK berubah: "Tidak dapat disimpulkan" (perangkat belum
// diketahui), "Jalur mustahil bit-perfect" (jalur lossy secara arsitektur),
// dan "Bukan bit-perfect" tetap seperti sebelumnya.
//
// Logika MURNI (tanpa React Native) supaya bisa diuji Jest.

export interface OutputModeLabelInput {
  /** null = perangkat aktif belum diketahui — jangan klaim apa pun. */
  canBeBitPerfect: boolean | null;
  /** true kalau laju stream sama dengan laju file (tidak ada konversi). */
  rateHonored: boolean;
  /** true kalau jalur ini secara arsitektur TIDAK BISA bit-perfect. */
  pathLossy: boolean;
  /** true kalau permintaan perangkat dihormati (yang dipakai = yang diminta). */
  honored: boolean;
  /** Stream Oboe benar-benar exclusive (isExclusiveModeActive()). */
  streamExclusive: boolean;
  /**
   * Status exclusive belum terkonfirmasi: native belum siap (unavailable)
   * atau bacaan bisa basi (stale saat pause). Selama ini true, label
   * TIDAK BOLEH mengklaim Bit-Perfect — juga tidak boleh menuduh
   * fallback, karena yang belum diketahui bukan yang ditolak.
   */
  exclusiveUnknown: boolean;
}

/**
 * Label baris "Mode" di kartu OUTPUT AKTIF.
 *
 * "Bit-Perfect" HANYA bila semua syarat jalur lama terpenuhi DAN exclusive
 * benar-benar aktif dan terkonfirmasi. Exclusive belum terkonfirmasi →
 * "Tidak dapat diverifikasi". Exclusive terkonfirmasi tidak aktif →
 * "Bukan bit-perfect".
 */
export function getOutputModeLabel(input: OutputModeLabelInput): string {
  if (input.canBeBitPerfect === null) return "Tidak dapat disimpulkan";
  if (input.rateHonored && !input.pathLossy && input.honored) {
    if (input.exclusiveUnknown) return "Tidak dapat diverifikasi";
    return input.streamExclusive ? "Bit-Perfect" : "Bukan bit-perfect";
  }
  return input.pathLossy ? "Jalur mustahil bit-perfect" : "Bukan bit-perfect";
}
