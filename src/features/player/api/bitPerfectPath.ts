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
 *  3. `isBitPerfect` → aktif; `exclusiveFailed` → fallback shared.
 *     `exclusiveFailed` hanya bisa true bila native sudah terbaca
 *     (`available`), jadi di titik ini "ditolak" adalah tuduhan yang sah.
 *  4. Bukan bit-perfect sama sekali → idle.
 */
export function describeBitPerfectPath(
  status: Pick<
    BitPerfectStatus,
    | "requested"
    | "streamExclusive"
    | "isBitPerfect"
    | "exclusiveFailed"
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
      label: "Bit-Perfect aktif — output murni",
      tone: "active",
      note: "Sinyal langsung ke perangkat, tanpa DSP — hanya fade anti-klik 10 ms di awal/akhir lagu dan setelah seek/resume, 15 ms saat pause.",
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
    note: "Pilih mode Bit-Perfect untuk jalur langsung ke perangkat — tanpa DSP, hanya fade anti-klik.",
  };
}
