// src/features/replaygain/tags.ts
//
// Pembaca tag ReplayGain dari byte file — logika MURNI (bisa diuji Jest).
//
// Format yang didukung (nilai tag selalu bentuk "−6,23 dB" / angka polos):
// - FLAC: Vorbis comment REPLAYGAIN_TRACK_GAIN / REPLAYGAIN_ALBUM_GAIN /
//   REPLAYGAIN_TRACK_PEAK / REPLAYGAIN_ALBUM_PEAK.
// - MP3 (ID3v2.3 / v2.4): frame TXXX dengan deskripsi yang sama.
// - MP4/M4A: atom custom `----:com.apple.iTunes:REPLAYGAIN_*` di ilst.
// Yang TIDAK didukung (sengaja, dicatat): frame RVA2 ID3v2 (gain relatif
// per-kanal, bukan ReplayGain standar) dan tag Ogg Vorbis di luar FLAC.
// Parser ini best-effort: byte tak dikenal / terpotong -> null, TIDAK
// pernah throw (pemanggil di level store yang mencatat warning).

import {
  parseReplayGainDb,
  parseReplayGainPeak,
  type ReplayGainTags,
} from "./replaygain";

const TRACK_GAIN = "REPLAYGAIN_TRACK_GAIN";
const ALBUM_GAIN = "REPLAYGAIN_ALBUM_GAIN";
const TRACK_PEAK = "REPLAYGAIN_TRACK_PEAK";
const ALBUM_PEAK = "REPLAYGAIN_ALBUM_PEAK";

/** Decode Base64 ke byte — tanpa dependensi (tidak ada `buffer` di app). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);
  const bytes: number[] = [];
  let acc = 0;
  let accBits = 0;
  for (const ch of clean) {
    if (ch === "=") break;
    const v = lookup.get(ch);
    if (v === undefined) continue;
    acc = (acc << 6) | v;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      bytes.push((acc >> accBits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

const ascii = (bytes: Uint8Array, start: number, len: number): string => {
  let s = "";
  for (let i = start; i < start + len && i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
};

const utf8 = (bytes: Uint8Array, start: number, len: number): string => {
  try {
    return new TextDecoder("utf-8").decode(
      bytes.subarray(start, Math.min(bytes.length, start + len)),
    );
  } catch {
    return ascii(bytes, start, len);
  }
};

/** Decode UTF-16 (BOM LE/BE, default LE) — untuk deskripsi TXXX encoding 1. */
function utf16(bytes: Uint8Array, start: number, len: number): string {
  const end = Math.min(bytes.length, start + len);
  let le = true;
  let i = start;
  if (end - i >= 2) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xfe) {
      le = true;
      i += 2;
    } else if (bytes[i] === 0xfe && bytes[i + 1] === 0xff) {
      le = false;
      i += 2;
    }
  }
  let s = "";
  for (; i + 1 < end; i += 2) {
    const code = le
      ? bytes[i] | (bytes[i + 1] << 8)
      : (bytes[i] << 8) | bytes[i + 1];
    if (code === 0) break;
    s += String.fromCharCode(code);
  }
  return s;
}

function applyTag(
  out: ReplayGainTags,
  key: string,
  value: string,
): void {
  const k = key.trim().toUpperCase();
  if (k === TRACK_GAIN) {
    const v = parseReplayGainDb(value);
    if (v !== null) out.trackGainDb = v;
  } else if (k === ALBUM_GAIN) {
    const v = parseReplayGainDb(value);
    if (v !== null) out.albumGainDb = v;
  } else if (k === TRACK_PEAK) {
    const v = parseReplayGainPeak(value);
    if (v !== null) out.trackPeak = v;
  } else if (k === ALBUM_PEAK) {
    const v = parseReplayGainPeak(value);
    if (v !== null) out.albumPeak = v;
  }
}

function isComplete(t: ReplayGainTags): boolean {
  return (
    t.trackGainDb !== undefined &&
    t.albumGainDb !== undefined &&
    t.trackPeak !== undefined &&
    t.albumPeak !== undefined
  );
}

function finish(t: ReplayGainTags): ReplayGainTags | null {
  return t.trackGainDb !== undefined ||
    t.albumGainDb !== undefined ||
    t.trackPeak !== undefined ||
    t.albumPeak !== undefined
    ? t
    : null;
}

// ── FLAC ────────────────────────────────────────────────────────────────────

function parseFlac(bytes: Uint8Array): ReplayGainTags | null {
  const out: ReplayGainTags = {};
  // "fLaC" + blok metadata: header 4 byte (1 bit last, 7 bit type,
  // 24 bit panjang big-endian). Tipe 4 = Vorbis comment.
  let pos = 4;
  while (pos + 4 <= bytes.length) {
    const header = bytes[pos];
    const type = header !== undefined ? header & 0x7f : 0;
    const isLast = header !== undefined && (header & 0x80) !== 0;
    const len = (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const dataStart = pos + 4;
    const dataEnd = Math.min(bytes.length, dataStart + len);
    if (type === 4) {
      parseVorbisComment(bytes, dataStart, dataEnd, out);
      return finish(out);
    }
    if (isLast) break;
    pos = dataEnd;
  }
  return finish(out);
}

function parseVorbisComment(
  bytes: Uint8Array,
  start: number,
  end: number,
  out: ReplayGainTags,
): void {
  const u32le = (p: number): number =>
    p + 4 <= end
      ? bytes[p]! |
        (bytes[p + 1]! << 8) |
        (bytes[p + 2]! << 16) |
        (bytes[p + 3]! << 24)
      : 0;
  let p = start;
  const vendorLen = u32le(p);
  p += 4 + vendorLen;
  if (p + 4 > end) return;
  const count = u32le(p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= end; i++) {
    const len = u32le(p);
    p += 4;
    if (p + len > end) return;
    const comment = utf8(bytes, p, len);
    p += len;
    const eq = comment.indexOf("=");
    if (eq > 0) applyTag(out, comment.slice(0, eq), comment.slice(eq + 1));
    if (isComplete(out)) return;
  }
}

// ── ID3v2 (MP3) ─────────────────────────────────────────────────────────────

function parseId3v2(bytes: Uint8Array): ReplayGainTags | null {
  const out: ReplayGainTags = {};
  // Header 10 byte: "ID3" ver(1) rev(1) flags(1) size(4 synchsafe).
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return null;
  const version = bytes[3] ?? 0;
  const flags = bytes[5] ?? 0;
  const tagSize =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  let data = bytes.subarray(10, Math.min(bytes.length, 10 + tagSize));
  // Unsynchronisation (flag 0x80): buang 0x00 sesudah 0xFF.
  if (flags & 0x80) {
    const cleaned: number[] = [];
    for (let i = 0; i < data.length; i++) {
      cleaned.push(data[i]!);
      if (data[i] === 0xff && data[i + 1] === 0x00) i++;
    }
    data = new Uint8Array(cleaned);
  }
  // Extended header (flag 0x40): lewati (v2.3: 4 byte ukuran; v2.4: 1 byte
  // jumlah flag + synchsafe — keduanya diawali ukuran, pakai itu).
  let pos = 0;
  if (flags & 0x40) {
    if (version >= 4) {
      if (data.length < 1) return finish(out);
      const extSize = data[0] ?? 0;
      pos = 1 + extSize;
    } else {
      if (data.length < 4) return finish(out);
      const extSize =
        (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!;
      pos = 4 + extSize;
    }
  }
  const isV24 = version >= 4;
  while (pos + 10 <= data.length) {
    const id = ascii(data, pos, 4);
    if (id === "\0\0\0\0" || id.charCodeAt(0) === 0) break;
    let size: number;
    if (isV24) {
      size =
        ((data[pos + 4]! & 0x7f) << 21) |
        ((data[pos + 5]! & 0x7f) << 14) |
        ((data[pos + 6]! & 0x7f) << 7) |
        (data[pos + 7]! & 0x7f);
    } else {
      size =
        (data[pos + 4]! << 24) |
        (data[pos + 5]! << 16) |
        (data[pos + 6]! << 8) |
        data[pos + 7]!;
    }
    const bodyStart = pos + 10;
    const bodyEnd = Math.min(data.length, bodyStart + size);
    if (id === "TXXX" && bodyEnd > bodyStart) {
      parseTxxx(data, bodyStart, bodyEnd, out);
      if (isComplete(out)) return out;
    }
    if (size <= 0) break;
    pos = bodyEnd;
  }
  return finish(out);
}

function parseTxxx(
  data: Uint8Array,
  start: number,
  end: number,
  out: ReplayGainTags,
): void {
  if (start >= end) return;
  const encoding = data[start] ?? 0;
  const body = start + 1;
  let descEnd = -1;
  let desc = "";
  if (encoding === 1 || encoding === 2) {
    // UTF-16: terminator 00 00.
    for (let i = body; i + 1 < end; i += 2) {
      if (data[i] === 0 && data[i + 1] === 0) {
        descEnd = i;
        break;
      }
    }
    if (descEnd < 0) return;
    desc = utf16(data, body, descEnd - body);
    // Nilai UTF-16 dimulai sesudah terminator; hilangkan BOM bila ada.
    let vStart = descEnd + 2;
    if (
      vStart + 1 < end &&
      ((data[vStart] === 0xff && data[vStart + 1] === 0xfe) ||
        (data[vStart] === 0xfe && data[vStart + 1] === 0xff))
    ) {
      vStart += 2;
    }
    applyTag(out, desc, utf16(data, vStart, end - vStart));
  } else {
    // ISO-8859-1 (0) / UTF-8 (3): terminator 00.
    for (let i = body; i < end; i++) {
      if (data[i] === 0) {
        descEnd = i;
        break;
      }
    }
    if (descEnd < 0) return;
    desc =
      encoding === 3
        ? utf8(data, body, descEnd - body)
        : ascii(data, body, descEnd - body);
    const value =
      encoding === 3
        ? utf8(data, descEnd + 1, end - descEnd - 1)
        : ascii(data, descEnd + 1, end - descEnd - 1);
    applyTag(out, desc, value);
  }
}

// ── MP4/M4A ─────────────────────────────────────────────────────────────────

function parseMp4(bytes: Uint8Array): ReplayGainTags | null {
  const out: ReplayGainTags = {};
  // Cari 'moov' di top-level, lalu turun: udta -> meta -> ilst -> '----'.
  const moov = findBox(bytes, 0, bytes.length, "moov");
  if (!moov) return null;
  const udta = findBox(bytes, moov.start, moov.end, "udta");
  if (!udta) return null;
  const meta = findBox(bytes, udta.start, udta.end, "meta");
  if (!meta) return null;
  // 'meta' punya 4 byte version/flags sebelum anak-anaknya.
  const ilst = findBox(bytes, meta.start + 4, meta.end, "ilst");
  if (!ilst) return null;
  let pos = ilst.start;
  while (pos + 8 <= ilst.end) {
    const size = readU32(bytes, pos);
    const type = ascii(bytes, pos + 4, 4);
    if (size < 8 || pos + size > ilst.end) break;
    if (type === "----") parseCustomAtom(bytes, pos + 8, pos + size, out);
    if (isComplete(out)) return out;
    pos += size;
  }
  return finish(out);
}

function readU32(bytes: Uint8Array, pos: number): number {
  return (
    ((bytes[pos] ?? 0) << 24) |
    ((bytes[pos + 1] ?? 0) << 16) |
    ((bytes[pos + 2] ?? 0) << 8) |
    (bytes[pos + 3] ?? 0)
  ) >>> 0;
}

/** Cari box anak `type` di [start, end). Kembalikan isi (tanpa header 8). */
function findBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  type: string,
): { start: number; end: number } | null {
  let pos = start;
  while (pos + 8 <= end) {
    let size = readU32(bytes, pos);
    const t = ascii(bytes, pos + 4, 4);
    let headerLen = 8;
    if (size === 1) {
      // largesize 64-bit.
      if (pos + 16 > end) return null;
      const hi = readU32(bytes, pos + 8);
      const lo = readU32(bytes, pos + 12);
      size = hi * 0x100000000 + lo;
      headerLen = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerLen || pos + size > end) return null;
    if (t === type) {
      return { start: pos + headerLen, end: pos + size };
    }
    pos += size;
  }
  return null;
}

/**
 * Atom `----`: anak mean (namespace, "com.apple.iTunes"), name (nama tag),
 * data (4 byte version/flags + 4 byte locale + payload UTF-8).
 */
function parseCustomAtom(
  bytes: Uint8Array,
  start: number,
  end: number,
  out: ReplayGainTags,
): void {
  let name: string | null = null;
  let value: string | null = null;
  let pos = start;
  while (pos + 8 <= end) {
    const size = readU32(bytes, pos);
    const type = ascii(bytes, pos + 4, 4);
    if (size < 8 || pos + size > end) break;
    const bodyStart = pos + 8;
    const bodyEnd = pos + size;
    if (type === "name") {
      name = utf8(bytes, bodyStart, bodyEnd - bodyStart).replace(/\0/g, ""); // eslint-disable-line no-control-regex -- NUL adalah terminator string di metadata biner (iTunSMPB/MP4); strip NUL disengaja
    } else if (type === "data" && bodyEnd - bodyStart >= 8) {
      // 4 byte type-indicator + 4 byte locale, lalu payload.
      value = utf8(bytes, bodyStart + 8, bodyEnd - bodyStart - 8).replace(
        /\0/g, // eslint-disable-line no-control-regex -- NUL adalah terminator string di metadata biner (iTunSMPB/MP4); strip NUL disengaja
        "",
      );
    }
    pos += size;
  }
  if (name !== null && value !== null) applyTag(out, name, value);
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Parse tag ReplayGain dari byte awal file. Mendeteksi format dari magic:
 * "fLaC", "ID3", atau box "ftyp" MP4. Format lain / byte tak dikenal ->
 * null. TIDAK pernah throw.
 */
export function parseReplayGainTags(bytes: Uint8Array): ReplayGainTags | null {
  try {
    if (bytes.length >= 4 && ascii(bytes, 0, 4) === "fLaC") {
      return parseFlac(bytes);
    }
    if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") {
      return parseId3v2(bytes);
    }
    if (
      bytes.length >= 8 &&
      ascii(bytes, 4, 4) === "ftyp"
    ) {
      return parseMp4(bytes);
    }
    return null;
  } catch {
    return null;
  }
}
