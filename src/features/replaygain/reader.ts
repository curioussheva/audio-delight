// src/features/replaygain/reader.ts
//
// Baca tag ReplayGain dari file lagu — tipis: baca byte secukupnya lewat
// expo-file-system (range read, BUKAN seluruh file), lalu serahkan ke
// parser murni `parseReplayGainTags`.
//
// Biaya baca: tag FLAC/ID3v2 ada di AWAL file, jadi cukup 256 KiB pertama.
// MP4 (`moov`) bisa di akhir file (tanpa faststart) — bila head tidak
// ketemu `ilst`, baca 256 KiB terakhir sebagai fallback. Sekali per lagu:
// hasilnya di-cache di memori + dipersist ke DB (store), jadi pemutaran
// berikutnya gratis. URI content:// dicoba langsung dulu (Expo bisa baca
// via ContentResolver); bila gagal, resolve ke file lokal dengan pola yang
// sama seperti analyzer (MediaLibrary -> copy ke cache -> baca -> hapus).

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { base64ToBytes, parseReplayGainTags } from "./tags";
import type { ReplayGainTags } from "./replaygain";

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 256 * 1024;

async function readRangeBase64(
  uri: string,
  length: number,
  position: number,
): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    length,
    position,
  });
}

/**
 * content:// -> file lokal (salinan cache), pola sama seperti
 * `resolveToLocalUri` di analyzer. Kembalikan { localUri, tempPath }.
 */
async function resolveToLocalUri(
  uri: string,
  filename: string,
): Promise<{ localUri: string; tempPath: string | null }> {
  if (!uri.startsWith("content://")) return { localUri: uri, tempPath: null };
  const assetId = uri.split("/").pop() ?? "";
  const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
  const sourceUri = assetInfo.localUri ?? assetInfo.uri;
  if (!sourceUri) throw new Error(`Cannot resolve localUri for: ${uri}`);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp3";
  const tempPath = `${FileSystem.cacheDirectory}rg_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: tempPath });
  return { localUri: tempPath, tempPath };
}

async function readHeadAndTail(
  uri: string,
): Promise<{ head: Uint8Array; tail: Uint8Array | null; size: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`File not found: ${uri}`);
  const size = info.size ?? 0;
  const headB64 = await readRangeBase64(uri, Math.min(HEAD_BYTES, size || HEAD_BYTES), 0);
  const head = base64ToBytes(headB64);
  let tail: Uint8Array | null = null;
  if (size > HEAD_BYTES) {
    const tailB64 = await readRangeBase64(
      uri,
      TAIL_BYTES,
      Math.max(0, size - TAIL_BYTES),
    );
    tail = base64ToBytes(tailB64);
  }
  return { head, tail, size };
}

/**
 * Baca tag ReplayGain dari satu file. Kembalikan null bila file bukan
 * FLAC/MP3/MP4, tidak punya tag RG, atau tidak bisa dibaca — TIDAK pernah
 * throw (pemanggil mencatat warning dan lanjut tanpa RG).
 */
export async function readReplayGainTags(
  uri: string,
  filename = "",
): Promise<ReplayGainTags | null> {
  let tempPath: string | null = null;
  try {
    // Coba baca langsung (file:// dan content:// yang didukung Expo).
    let head: Uint8Array;
    let tail: Uint8Array | null;
    try {
      ({ head, tail } = await readHeadAndTail(uri));
    } catch (directErr) {
      if (!uri.startsWith("content://")) throw directErr;
      const resolved = await resolveToLocalUri(uri, filename);
      tempPath = resolved.tempPath;
      ({ head, tail } = await readHeadAndTail(resolved.localUri));
    }
    const fromHead = parseReplayGainTags(head);
    if (fromHead) return fromHead;
    // MP4 dengan moov di akhir: coba ekor file.
    if (tail) return parseReplayGainTags(tail);
    return null;
  } catch (e) {
    console.warn(`[ReplayGain] baca tag gagal untuk "${uri}":`, e);
    return null;
  } finally {
    if (tempPath) {
      try {
        await FileSystem.deleteAsync(tempPath, { idempotent: true });
      } catch {}
    }
  }
}
