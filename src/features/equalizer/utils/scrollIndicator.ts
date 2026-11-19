// src/features/equalizer/utils/scrollIndicator.ts
//
// Geometri indikator geser horizontal strip DETAIL BAND — matematika
// murni, tanpa React, supaya bisa dites unit (pola yang sama dengan
// bandThumbMath / verticalSliderMath).
//
// Latar: teks "10 band · geser untuk 1k–16k" saja tidak cukup — strip
// tetap dikira cuma 5 slider (screenshot HP 2026-11-20 00:46), karena
// indikator scroll bawaan Android tipis dan memudar. Bar indikator
// permanen di bawah strip menunjukkan posisi scroll (thumb) + rentang
// penuh (label ujung 31–16k) supaya 5 band sisanya ketahuan.

export interface ScrollIndicatorMetrics {
  /** Jarak scroll horizontal saat ini (px). */
  offsetX: number;
  /** Lebar total konten daftar (px). */
  contentWidth: number;
  /** Lebar area tampak daftar (px). */
  layoutWidth: number;
}

export interface ScrollIndicatorGeometry {
  /** Lebar thumb sebagai persen dari lebar track (0–100). */
  thumbWidthPct: number;
  /** Posisi kiri thumb sebagai persen dari lebar track (0–100). */
  thumbLeftPct: number;
}

/** Lebar thumb minimum (%) supaya tetap terlihat saat konten sangat panjang. */
export const MIN_THUMB_WIDTH_PCT = 10;

export function computeScrollIndicator({
  offsetX,
  contentWidth,
  layoutWidth,
}: ScrollIndicatorMetrics): ScrollIndicatorGeometry {
  // Belum terukur atau konten muat seluruhnya: tidak ada yang di-scroll.
  if (contentWidth <= 0 || layoutWidth <= 0 || contentWidth <= layoutWidth) {
    return { thumbWidthPct: 100, thumbLeftPct: 0 };
  }
  const thumbWidthPct = Math.max(
    MIN_THUMB_WIDTH_PCT,
    (layoutWidth / contentWidth) * 100,
  );
  const maxOffset = contentWidth - layoutWidth;
  const progress = Math.min(1, Math.max(0, offsetX / maxOffset));
  const thumbLeftPct = Math.min(
    100 - thumbWidthPct,
    Math.max(0, progress * (100 - thumbWidthPct)),
  );
  return { thumbWidthPct, thumbLeftPct };
}

/** Format frekuensi band seperti label di bawah fader (Band.tsx):
    di bawah 1000 -> "31", 1000 ke atas -> "1k" / "16k". Dipakai untuk
    label ujung bar indikator supaya bahasanya sama dengan strip. */
export function formatBandFrequency(frequency: number): string {
  return frequency < 1000 ? `${frequency}` : `${frequency / 1000}k`;
}
