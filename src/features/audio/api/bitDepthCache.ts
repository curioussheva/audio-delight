// src/features/audio/api/bitDepthCache.ts
//
// Cache hasil analyzeBitDepth per lagu (item 8 optimasi render).
//
// Tanpa cache, tiap mount / pindah tab dengan lagu yang sama menganalisis
// ulang dari nol (baca file + FFT native). Cache ini menyimpan hasil
// analisis supaya kembalinya ke lagu yang sama tampil seketika.
//
// Key HARUS mencakup semua input yang memengaruhi hasil — dicek ke kode:
// - analyzeBitDepth (BitDepthVerifier.ts) membaca song.bitDepth dan
//   song.sampleRate langsung.
// - audioAnalyzer.analyzeSong (analyzer.ts) membaca song.uri +
//   song.filename (resolve file + detectCodec dari ekstensi),
//   song.bitDepth / song.sampleRate (fallback klaim file), dan ukuran
//   file di disk (bitrate hasil hitung). song.fileSize / song.bitrate /
//   song.codec adalah klaim metadata untuk file yang sama — bila berubah
//   (edit metadata / rescan) hasil lama tidak boleh dipakai lagi.
// - song.title TIDAK memengaruhi hasil (hanya dipakai di pesan log),
//   jadi sengaja TIDAK masuk key: edit judul saja tidak perlu
//   analisis ulang.
// - song.id masuk key supaya dua lagu berbeda yang kebetulan berbagi
//   uri/filename tidak saling menukar hasil.

import type { Song } from "@/shared/types/audio";
import type { BitDepthAnalysis } from "./BitDepthVerifier";

/** Batas entri supaya cache tidak tumbuh tanpa batas di library besar. */
export const BIT_DEPTH_CACHE_MAX_ENTRIES = 200;

/** Jeda debounce analisis di AnalyzerScreen (ms). */
export const BIT_DEPTH_DEBOUNCE_MS = 400;

const cache = new Map<string, BitDepthAnalysis>();

/** Key cache dari semua field lagu yang memengaruhi hasil analisis. */
export function getBitDepthCacheKey(song: Song): string {
  // JSON.stringify supaya pemisah tidak bisa bertabrakan dengan isi field
  // (mis. "|" di dalam uri/filename).
  return JSON.stringify([
    song.id ?? "",
    song.uri ?? "",
    song.filename ?? "",
    song.bitDepth ?? "",
    song.sampleRate ?? "",
    song.bitrate ?? "",
    song.codec ?? "",
    song.fileSize ?? "",
  ]);
}

export function getCachedBitDepth(key: string): BitDepthAnalysis | undefined {
  return cache.get(key);
}

export function setCachedBitDepth(
  key: string,
  result: BitDepthAnalysis,
): void {
  // Hapus dulu kalau sudah ada supaya urutan penyisipan (untuk eviksi
  // FIFO) mengikuti penulisan terbaru.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, result);
  while (cache.size > BIT_DEPTH_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Hanya untuk pengujian — kosongkan cache antar test. */
export function clearBitDepthCache(): void {
  cache.clear();
}
