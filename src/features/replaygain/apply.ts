// src/features/replaygain/apply.ts
//
// Orkestrasi per-lagu ReplayGain — dipanggil playerStore (saat lagu
// berganti) dan Settings (saat toggle/mode berubah), fire-and-forget,
// TIDAK memblokir playback.
//
// Urutan resolusi tag untuk satu lagu:
//   1. Tag sudah ada di objek Song (dari DB) -> pakai langsung, tanpa I/O.
//   2. Cache memori per sesi -> pakai langsung.
//   3. Baca tag dari file (reader, range read) -> simpan ke DB + tulis
//      balik ke objek Song, supaya pemutaran berikut gratis.
//   4. Lagu tanpa tag -> gain user apa adanya (RG tidak mengubah apa pun).
//
// Bila RG mati, tidak ada I/O sama sekali. Modul ini sengaja TERPISAH dari
// store (lihat komentar di store): ia mengimpor sqlite + reader, dan hanya
// diimpor modul yang memang sudah menanggung dependensi itu (playerStore
// sudah mengimpor sqlite; Settings adalah layar).

import { SongQueries } from "@/shared/lib/sqlite";
import type { Song } from "@/shared/types/audio";
import type { ReplayGainTags } from "./replaygain";
import { tagsFromSong, useReplayGainStore } from "./store/replayGainStore";

// Cache sesi: songId -> tag (null = sudah dibaca, tidak punya tag RG).
const _tagsCache = new Map<string, ReplayGainTags | null>();
// Token anti-balapan: skip cepat antar lagu tidak boleh menimpa tag lagu
// terbaru dengan hasil baca lagu lama yang selesai belakangan.
let _applySeq = 0;

/**
 * Selesaikan tag untuk satu lagu dan jadikan tag aktif di store.
 * Mengembalikan tag (null = tidak ada / RG mati). Tidak pernah throw —
 * kegagalan baca/persist hanya dicatat, playback tetap jalan tanpa RG.
 */
export async function applyReplayGainForSong(
  song: Song | null,
): Promise<ReplayGainTags | null> {
  const seq = ++_applySeq;
  const store = useReplayGainStore.getState();
  if (!song || !store.isReplayGainEnabled) {
    if (seq === _applySeq) store.setCurrentTags(null, null);
    return null;
  }

  // 1. Tag sudah menempel di objek Song (dari DB).
  const fromSong = tagsFromSong(song);
  if (fromSong) {
    if (seq === _applySeq) store.setCurrentTags(song.id, fromSong);
    return fromSong;
  }

  // 2. Cache sesi.
  if (_tagsCache.has(song.id)) {
    const cached = _tagsCache.get(song.id) ?? null;
    if (seq === _applySeq) store.setCurrentTags(song.id, cached);
    return cached;
  }

  // 3. Baca dari file (sekali per lagu — lalu persist + cache).
  // Reader diimpor LAZY: ia menarik expo-file-system (ESM di
  // node_modules yang tidak bisa diparse ts-jest node) — impor statis di
  // sini akan menyeretnya ke graf impor playerStore dan meruntuhkan test
  // yang memuat playerStore tanpa mock expo. Hanya dimuat saat RG nyala
  // dan tag belum ada (jalur ini tidak pernah jalan saat RG mati).
  let tags: ReplayGainTags | null;
  try {
    const { readReplayGainTags } = await import("./reader");
    tags = await readReplayGainTags(song.uri, song.filename ?? "");
  } catch (e) {
    console.warn("[ReplayGain] baca tag gagal:", e);
    tags = null;
  }
  if (seq !== _applySeq) return tags; // lagu sudah berganti, abaikan
  _tagsCache.set(song.id, tags);
  if (tags) {
    // Tulis balik ke objek Song (antrean) + DB (pemutaran berikut).
    if (tags.trackGainDb !== undefined) {
      song.replaygainTrackGainDb = tags.trackGainDb;
    }
    if (tags.albumGainDb !== undefined) {
      song.replaygainAlbumGainDb = tags.albumGainDb;
    }
    if (tags.trackPeak !== undefined) {
      song.replaygainTrackPeak = tags.trackPeak;
    }
    if (tags.albumPeak !== undefined) {
      song.replaygainAlbumPeak = tags.albumPeak;
    }
    try {
      SongQueries.updateReplayGain(song.id, tags);
    } catch (e) {
      console.warn("[ReplayGain] simpan tag ke DB gagal:", e);
    }
  }
  useReplayGainStore.getState().setCurrentTags(song.id, tags);
  return tags;
}
