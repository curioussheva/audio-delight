import type { BitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";

/** Nada verdict jalur bit-perfect — dipakai pemanggil untuk memilih warna. */
export type BitPerfectPathTone =
  | "active"
  | "fallback"
  | "stale"
  | "not-ready"
  | "idle";

export interface BitPerfectPathVerdict {
  /** Label status stream yang ditampilkan. */
  label: string;
  tone: BitPerfectPathTone;
  /** Penjelasan jujur di bawah label. */
  note: string;
}

/**
 * Pemetaan jujur status stream → verdict tampilan (modul murni).
 *
 * Aturan (lihat header useBitPerfectStatus, U-P1-04):
 *  1. `unavailable` dulu: native belum terbaca — jangan tuduh apa pun,
 *     tampilkan "Native belum siap".
 *  2. `stale` (pause) berikutnya: verdict live dilarang — tampilkan hanya
 *     keadaan TERAKHIR DIKETAHUI (Exclusive/Shared) dengan catatan
 *     "diperbarui saat memutar". Jangan pernah menampilkan verdict live
 *     sebagai keadaan saat ini selama stale.
 *  3. `isBitPerfect` → aktif; `rateMismatch` → exclusive tapi laju
 *     berbeda (decoder meresample) — bukan bit-perfect, jangan tuduh
 *     exclusive gagal; `exclusiveFailed` → fallback shared.
 *     `exclusiveFailed` dan `rateMismatch` hanya bisa true bila native
 *     sudah terbaca (`available`), jadi di titik ini keduanya tuduhan
 *     yang sah.
 *  4. Bukan bit-perfect sama sekali → idle.
 */
export function describeBitPerfectPath(
  status: Pick<
    BitPerfectStatus,
    | "requested"
    | "streamExclusive"
    | "isBitPerfect"
    | "exclusiveFailed"
    | "rateMismatch"
    | "unavailable"
    | "stale"
  >,
): BitPerfectPathVerdict {
  if (status.unavailable) {
    return {
      label: "Native belum siap",
      tone: "not-ready",
      note: "Status stream belum bisa dibaca — engine belum start.",
    };
  }

  if (status.stale) {
    const lastKnown = status.streamExclusive ? "Exclusive" : "Shared";
    return {
      label: `${lastKnown} (terakhir diketahui)`,
      tone: "stale",
      note: "Diperbarui saat memutar — status bisa berubah saat pause.",
    };
  }

  if (status.isBitPerfect) {
    return {
      label: "Exclusive, tanpa DSP",
      tone: "active",
      note: "Exclusive ke perangkat, tanpa DSP. Fade anti-klik 10 ms di awal, akhir, seek, dan resume; 15 ms saat pause.",
    };
  }

  if (status.rateMismatch) {
    return {
      label: "Exclusive — laju berbeda",
      tone: "fallback",
      note: "Exclusive, tetapi laju stream berbeda dari file — ada resampling.",
    };
  }

  if (status.exclusiveFailed) {
    return {
      label: "Fallback shared",
      tone: "fallback",
      note: "Device menolak exclusive — audio lewat mixer Android (volume dan resampling sistem tetap berlaku). App hanya melakukan fade anti-klik (10 ms awal/akhir/seek/resume, 15 ms saat pause).",
    };
  }

  return {
    label: "Bit-Perfect tidak dipilih",
    tone: "idle",
    note: "Status exclusive baru diketahui saat memutar.",
  };
}
