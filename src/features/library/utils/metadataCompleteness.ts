// src/features/library/utils/metadataCompleteness.ts
//
// U1: MusicBrainz sebagai "sapu bersih" — hanya mengisi field yang masih
// kosong dari enrichment lokal, TIDAK PERNAH menimpa data lokal.
// Lirik TIDAK ikut sapu bersih (MusicBrainz tidak menyediakan lirik;
// lirik tetap lokal, item L1).
//
// "Kosong" = nilai tidak ada / hanya spasi, ATAU placeholder MediaStore
// ("Unknown Artist" / "Unknown Album", metadata.ts:102-103,
// scanner.ts:195-196) — placeholder itu berarti datanya memang tidak ada,
// bukan data beneran. Judul praktis tidak pernah kosong (fallback nama
// file), tapi tetap dihitung demi konsistensi.

import type { Song } from "@/shared/types/audio";
import { parseIntOrKeep } from "@/shared/utils/numbers";

/** Field yang bisa dilengkapi MusicBrainz (manual, di [id].tsx). */
export type FillableField =
  | "title"
  | "artist"
  | "album"
  | "year"
  | "label"
  | "artwork"
  | "artistImageUrl"
  | "artistBio";

export const FILLABLE_FIELDS: readonly FillableField[] = [
  "title",
  "artist",
  "album",
  "year",
  "label",
  "artwork",
  "artistImageUrl",
  "artistBio",
];

export const FILLABLE_FIELD_LABELS: Record<FillableField, string> = {
  title: "Judul",
  artist: "Artis",
  album: "Album",
  year: "Tahun",
  label: "Label",
  artwork: "Cover",
  artistImageUrl: "Foto artis",
  artistBio: "Bio artis",
};

/** Field yang tampil per hasil di MetadataSyncModal (info artis diambil
 * terpisah sesudah pilih, jadi tidak ikut pratinjau per hasil). */
export const RESULT_FIELDS: readonly FillableField[] = [
  "title",
  "artist",
  "album",
  "year",
  "label",
  "artwork",
];

const PLACEHOLDERS: Partial<Record<FillableField, string>> = {
  artist: "Unknown Artist",
  album: "Unknown Album",
};

export function isTextMissing(value: string | undefined | null): boolean {
  return !value || value.trim().length === 0;
}

/** Satu field kosong? Placeholder MediaStore dihitung kosong. */
export function isFieldMissing(
  song: Pick<
    Song,
    | "title"
    | "artist"
    | "album"
    | "year"
    | "label"
    | "artwork"
    | "artistImageUrl"
    | "artistBio"
  >,
  field: FillableField,
): boolean {
  switch (field) {
    case "year":
      return !song.year;
    case "title":
      return isTextMissing(song.title);
    case "artist":
      return (
        isTextMissing(song.artist) ||
        song.artist?.trim() === PLACEHOLDERS.artist
      );
    case "album":
      return (
        isTextMissing(song.album) || song.album?.trim() === PLACEHOLDERS.album
      );
    case "label":
      return isTextMissing(song.label);
    case "artwork":
      return isTextMissing(song.artwork);
    case "artistImageUrl":
      return isTextMissing(song.artistImageUrl);
    case "artistBio":
      return isTextMissing(song.artistBio);
  }
}

/** Field mana saja yang masih kosong (untuk penanda + badge + modal). */
export function missingMetadataFields(
  song: Pick<
    Song,
    | "title"
    | "artist"
    | "album"
    | "year"
    | "label"
    | "artwork"
    | "artistImageUrl"
    | "artistBio"
  >,
): FillableField[] {
  return FILLABLE_FIELDS.filter((field) => isFieldMissing(song, field));
}

export function countMissingMetadata(
  song: Pick<
    Song,
    | "title"
    | "artist"
    | "album"
    | "year"
    | "label"
    | "artwork"
    | "artistImageUrl"
    | "artistBio"
  >,
): number {
  return missingMetadataFields(song).length;
}

export interface OnlineFillInput {
  title?: string;
  artist?: string;
  album?: string;
  /** Tahun apa adanya dari MusicBrainz (string, bisa non-numerik). */
  year?: string;
  label?: string;
  /** URL cover (dari releaseId) — bukan releaseId mentah. */
  artwork?: string;
  artistImageUrl?: string;
  artistBio?: string;
}

function hasOnlineValue(field: FillableField, online: OnlineFillInput): boolean {
  if (field === "year") return parseIntOrKeep(online.year, undefined) !== undefined;
  return !isTextMissing(online[field]);
}

/**
 * Isi-yang-kosong-saja: kembalikan Partial<Song> yang HANYA berisi field
 * yang lokalnya kosong DAN online punya nilai. Field lokal yang sudah
 * terisi TIDAK PERNAH ada di hasil — jadi tidak tertimpa, dan tidak ikut
 * ditandai `markEdited` oleh updateMetadata (I3 menandai field yang ada
 * di payload). Tahun non-numerik dari online diabaikan (bukan NaN).
 */
export function fillEmptyFields(
  local: Pick<
    Song,
    | "title"
    | "artist"
    | "album"
    | "year"
    | "label"
    | "artwork"
    | "artistImageUrl"
    | "artistBio"
  >,
  online: OnlineFillInput,
): Partial<Song> {
  const out: Partial<Song> = {};
  if (isFieldMissing(local, "title") && !isTextMissing(online.title))
    out.title = online.title!.trim();
  if (isFieldMissing(local, "artist") && !isTextMissing(online.artist))
    out.artist = online.artist!.trim();
  if (isFieldMissing(local, "album") && !isTextMissing(online.album))
    out.album = online.album!.trim();
  if (isFieldMissing(local, "year")) {
    const year = parseIntOrKeep(online.year, undefined);
    if (year !== undefined) out.year = year;
  }
  if (isFieldMissing(local, "label") && !isTextMissing(online.label))
    out.label = online.label!.trim();
  if (isFieldMissing(local, "artwork") && !isTextMissing(online.artwork))
    out.artwork = online.artwork!.trim();
  if (
    isFieldMissing(local, "artistImageUrl") &&
    !isTextMissing(online.artistImageUrl)
  )
    out.artistImageUrl = online.artistImageUrl!.trim();
  if (isFieldMissing(local, "artistBio") && !isTextMissing(online.artistBio))
    out.artistBio = online.artistBio!.trim();
  return out;
}

export interface FillPreview {
  /** Online punya nilai dan lokal kosong → akan diisi bila diterapkan. */
  toFill: FillableField[];
  /** Online punya nilai tapi lokal sudah terisi → tidak diubah. */
  kept: FillableField[];
}

/**
 * Pratinjau untuk MetadataSyncModal: per hasil online, field mana yang
 * "akan diisi" vs "sudah ada — tidak diubah". Field yang online-nya pun
 * kosong tidak masuk ke mana-mana (tidak ada yang diisi/dilindungi).
 * `missingFields` = hasil missingMetadataFields(lagu lokal).
 */
export function previewOnlineFill(
  missingFields: readonly FillableField[],
  online: OnlineFillInput,
): FillPreview {
  const toFill: FillableField[] = [];
  const kept: FillableField[] = [];
  for (const field of RESULT_FIELDS) {
    if (!hasOnlineValue(field, online)) continue;
    if (missingFields.includes(field)) toFill.push(field);
    else kept.push(field);
  }
  return { toFill, kept };
}
