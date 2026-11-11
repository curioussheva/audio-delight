// src/features/player/api/externalAudioUrl.ts
//
// U-P1-33: logika murni untuk handler intent audio.
//
// app.json mendeklarasikan intent filter VIEW untuk file audio
// (scheme file/content, mime audio/*), tapi tidak ada handler — file yang
// dibuka dari Files hanya mendarat di Library tanpa diputar. Modul ini
// memutuskan URL mana yang merupakan file audio eksternal dan membangun
// Song minimal untuk URL yang belum ada di library. playSong sendiri yang
// me-resolve content:// ke native (setQueue); kegagalan di sana dilaporkan
// lewat return value playSong, bukan di sini.
//
// Sengaja TIDAK mengimpor expo-linking: Jest di repo ini hanya untuk logika
// murni tanpa dependensi expo (lihat jest.config.cjs). Skema dibaca dengan
// regex sederhana — cukup untuk membedakan file/content dari deep link.
import type { Song } from "@/shared/types/audio";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "wav",
  "aac",
  "ogg",
  "opus",
  "m4a",
  "alac",
  "aiff",
  "aif",
  "dsd",
  "dsf",
  "dff",
  "wma",
  "ape",
  "mka",
]);

/** Ambil skema (sebelum ':') + sisa URL; null bila tidak ada skema. */
function splitScheme(rawUrl: string): { scheme: string; rest: string } | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(rawUrl);
  if (!match) return null;
  return { scheme: match[1].toLowerCase(), rest: match[2] };
}

/**
 * true hanya untuk URL file audio eksternal yang bisa ditangani:
 * scheme file:// atau content://. Deep link pristineaudio:// (dan skema
 * lain) dikembalikan false — itu urusan expo-router, bukan handler ini.
 *
 * content:// sudah difilter mime audio/* oleh intent filter sistem, jadi
 * diterima apa adanya (URI MediaStore sering tanpa ekstensi). file://
 * wajib berekstensi audio yang dikenal — path filesystem tanpa ekstensi
 * audio tidak bisa dipastikan audionya.
 */
export function isExternalAudioUrl(
  rawUrl: string | null | undefined,
): boolean {
  if (!rawUrl) return false;
  const split = splitScheme(rawUrl);
  if (!split) return false;
  if (split.scheme !== "file" && split.scheme !== "content") return false;
  if (split.scheme === "content") return true;
  let path = split.rest;
  try {
    path = decodeURIComponent(path);
  } catch {
    // path mentah tetap dipakai — ekstensi dibaca apa adanya.
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Bangun Song minimal dari URL file eksternal yang belum ada di library:
 * judul dari nama file, sisanya placeholder jujur (artist "Unknown
 * Artist", durasi 0 — bukan tebakan). Dipakai hanya bila file tidak
 * ditemukan di library store; kalau ketemu, track library yang dipakai.
 */
export function songFromExternalAudioUrl(url: string): Song {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // URL mentah tetap dipakai.
  }
  const filename = decoded.split("/").pop() ?? "";
  // Segmen terakhir hanya dianggap nama file bila berekstensi (mis.
  // "Lagu.flac" di URI DocumentsProvider). ID numerik MediaStore
  // (".../media/123") bukan nama — jangan jadikan judul.
  const title =
    filename.includes(".") && filename.replace(/\.[^.]+$/, "")
      ? filename.replace(/\.[^.]+$/, "")
      : "Audio eksternal";
  return {
    id: `external:${url}`,
    uri: url,
    title,
    artist: "Unknown Artist",
    album: "",
    duration: 0,
  };
}
