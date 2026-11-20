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

/** Format frekuensi band lengkap untuk legenda ("31 Hz", "1 kHz",
    "16 kHz"). Beda dengan formatBandFrequency ("31"/"1k"/"16k") yang
    dipakai label pendek di bawah fader dan ujung bar indikator. */
export function formatBandFrequencyFull(frequency: number): string {
  return frequency < 1000 ? `${frequency} Hz` : `${frequency / 1000} kHz`;
}

/** Bisakah strip di-scroll ke kiri (ada konten di kiri posisi saat ini)?
    Epsilon 1px supaya noise float di ujung tidak menghidupkan tombol. */
export function canScrollLeft({ offsetX }: ScrollIndicatorMetrics): boolean {
  return offsetX > 1;
}

/** Bisakah strip di-scroll ke kanan (ada konten di kanan posisi saat
    ini)? Belum terukur atau konten muat seluruhnya: tidak bisa. */
export function canScrollRight({
  offsetX,
  contentWidth,
  layoutWidth,
}: ScrollIndicatorMetrics): boolean {
  if (contentWidth <= 0 || layoutWidth <= 0 || contentWidth <= layoutWidth) {
    return false;
  }
  return offsetX < contentWidth - layoutWidth - 1;
}

/** Arah tombol geser halaman: -1 = ke kiri, +1 = ke kanan. */
export type PageScrollDirection = -1 | 1;

/** Offset sesudah geser satu halaman (selebar area tampak), dijepit ke
    [0, maxOffset]. Belum terukur atau konten muat: tetap di tempat
    (tombol dalam keadaan itu nonaktif, jadi ini hanya pengaman). */
export function pageScrollOffset(
  { offsetX, contentWidth, layoutWidth }: ScrollIndicatorMetrics,
  direction: PageScrollDirection,
): number {
  if (contentWidth <= 0 || layoutWidth <= 0 || contentWidth <= layoutWidth) {
    return offsetX;
  }
  const maxOffset = contentWidth - layoutWidth;
  return Math.min(
    maxOffset,
    Math.max(0, offsetX + direction * layoutWidth),
  );
}

export interface VisibleBandRangeInput extends ScrollIndicatorMetrics {
  /** Jumlah band (10). */
  bandCount: number;
  /** Lebar satu kolom band, px (BAND_WIDTH = 65 di Band.tsx). */
  bandWidth: number;
  /** Padding horizontal konten daftar, px (spacing.sm = 8). */
  contentPadding: number;
}

export interface VisibleBandRange {
  /** Indeks band pertama yang tampak (0-based). */
  firstIndex: number;
  /** Indeks band terakhir yang tampak (0-based). */
  lastIndex: number;
}

/** Band mana yang tampak di viewport saat ini — untuk legenda hidup
    "Band 1–5 dari 10". Band i menempati [padding + i*w, padding + (i+1)*w)
    di dalam konten. Belum terukur: asumsikan tampilan awal (band 1–5,
    yang memang dirender pertama; onLayout mengoreksi dalam satu frame
    bila layar lebih lebar). */
export function visibleBandRange({
  offsetX,
  contentWidth,
  layoutWidth,
  bandCount,
  bandWidth,
  contentPadding,
}: VisibleBandRangeInput): VisibleBandRange {
  if (bandCount <= 0) return { firstIndex: 0, lastIndex: 0 };
  if (layoutWidth <= 0 || contentWidth <= 0) {
    return { firstIndex: 0, lastIndex: Math.min(4, bandCount - 1) };
  }
  const firstIndex = Math.min(
    bandCount - 1,
    Math.max(0, Math.floor((offsetX - contentPadding) / bandWidth)),
  );
  const lastIndex = Math.min(
    bandCount - 1,
    Math.max(
      firstIndex,
      Math.floor((offsetX + layoutWidth - 1 - contentPadding) / bandWidth),
    ),
  );
  return { firstIndex, lastIndex };
}
