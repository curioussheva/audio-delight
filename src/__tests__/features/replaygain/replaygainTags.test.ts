// src/__tests__/features/replaygain/replaygainTags.test.ts
//
// Parser tag ReplayGain dari byte mentah: FLAC (Vorbis comment), MP3
// (ID3v2 TXXX), MP4/M4A (atom custom `----` di ilst). Buffer dibuat
// tangan di sini — tidak butuh file asli / device.

import {
  base64ToBytes,
  parseReplayGainTags,
} from "../../../features/replaygain/tags";

const enc = new TextEncoder();

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}
function u32be(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function bytes(...parts: Array<number[] | Uint8Array>): Uint8Array {
  const out: number[] = [];
  for (const p of parts) out.push(...p);
  return new Uint8Array(out);
}

/** Satu blok Vorbis comment dari pasangan key=value. */
function flacFile(pairs: Array<[string, string]>): Uint8Array {
  const vendor = enc.encode("test");
  const comments = pairs.map(([k, v]) => {
    const c = enc.encode(`${k}=${v}`);
    return [...u32le(c.length), ...c];
  });
  const body = [
    ...u32le(vendor.length),
    ...vendor,
    ...u32le(pairs.length),
    ...comments.flat(),
  ];
  // Header blok: 0x84 = last + tipe 4, panjang 24-bit big-endian.
  return bytes(
    enc.encode("fLaC"),
    [0x84, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff],
    body,
  );
}

/** File ID3v2.3 minimal dengan frame TXXX (encoding 0 / 3). */
function mp3File(frames: Array<{ desc: string; value: string; enc?: number }>): Uint8Array {
  const frameBytes = frames.map(({ desc, value, enc: e = 0 }) => {
    const body = bytes(
      [e],
      enc.encode(desc),
      [0],
      enc.encode(value),
    );
    return [...enc.encode("TXXX"), ...u32be(body.length), 0, 0, ...body];
  });
  const tag = frameBytes.flat();
  const size = tag.length;
  const synchsafe = [
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ];
  return bytes(enc.encode("ID3"), [3, 0, 0], synchsafe, tag);
}

/** Box MP4 generik: size(4) + type(4) + payload. */
function box(type: string, ...payload: Array<number[] | Uint8Array>): Uint8Array {
  const body = payload.flatMap((p) => [...p]);
  return bytes(u32be(8 + body.length), enc.encode(type), body);
}

function mp4File(pairs: Array<[string, string]>): Uint8Array {
  const custom = pairs.map(([name, value]) =>
    box(
      "----",
      box("mean", [0, 0, 0, 0], enc.encode("com.apple.iTunes")),
      box("name", [0, 0, 0, 0], enc.encode(name)),
      box("data", [0, 0, 0, 1, 0, 0, 0, 0], enc.encode(value)),
    ),
  );
  return bytes(
    box("ftyp", enc.encode("M4A ")),
    box(
      "moov",
      box(
        "udta",
        box("meta", [0, 0, 0, 0], box("ilst", ...custom)),
      ),
    ),
  );
}

describe("parseReplayGainTags — FLAC", () => {
  it("membaca track + album gain dan peak dari Vorbis comment", () => {
    const tags = parseReplayGainTags(
      flacFile([
        ["REPLAYGAIN_TRACK_GAIN", "-6.23 dB"],
        ["REPLAYGAIN_ALBUM_GAIN", "-2.50 dB"],
        ["REPLAYGAIN_TRACK_PEAK", "0.987312"],
        ["REPLAYGAIN_ALBUM_PEAK", "0.912"],
        ["TITLE", "Lagu Uji"],
      ]),
    );
    expect(tags).toEqual({
      trackGainDb: -6.23,
      albumGainDb: -2.5,
      trackPeak: 0.987312,
      albumPeak: 0.912,
    });
  });
  it("key case-insensitive, tanpa tag RG -> null", () => {
    expect(
      parseReplayGainTags(
        flacFile([["replaygain_track_gain", "+3 dB"]]),
      ),
    ).toEqual({ trackGainDb: 3 });
    expect(parseReplayGainTags(flacFile([["TITLE", "X"]]))).toBeNull();
  });
  it("byte terpotong tidak throw", () => {
    expect(parseReplayGainTags(new Uint8Array([0x66, 0x4c, 0x61]))).toBeNull();
    expect(parseReplayGainTags(flacFile([["REPLAYGAIN_TRACK_GAIN", "-6 dB"]]).subarray(0, 10))).toBeNull();
  });
});

describe("parseReplayGainTags — ID3v2 TXXX", () => {
  it("membaca TXXX REPLAYGAIN_TRACK_GAIN (encoding Latin-1)", () => {
    const tags = parseReplayGainTags(
      mp3File([{ desc: "REPLAYGAIN_TRACK_GAIN", value: "-8.41 dB" }]),
    );
    expect(tags).toEqual({ trackGainDb: -8.41 });
  });
  it("membaca TXXX UTF-8 + beberapa frame sekaligus", () => {
    const tags = parseReplayGainTags(
      mp3File([
        { desc: "REPLAYGAIN_TRACK_GAIN", value: "-6.00 dB", enc: 3 },
        { desc: "REPLAYGAIN_ALBUM_GAIN", value: "-1.25 dB", enc: 3 },
        { desc: "REPLAYGAIN_TRACK_PEAK", value: "0.5", enc: 3 },
        { desc: "Bukan RG", value: "abaikan", enc: 3 },
      ]),
    );
    expect(tags).toEqual({
      trackGainDb: -6,
      albumGainDb: -1.25,
      trackPeak: 0.5,
    });
  });
  it("frame RVA2 / tanpa TXXX -> null", () => {
    expect(parseReplayGainTags(mp3File([]))).toBeNull();
  });
});

describe("parseReplayGainTags — MP4 ilst ----", () => {
  it("membaca atom custom com.apple.iTunes", () => {
    const tags = parseReplayGainTags(
      mp4File([
        ["REPLAYGAIN_TRACK_GAIN", "-4.75 dB"],
        ["REPLAYGAIN_TRACK_PEAK", "0.831"],
      ]),
    );
    expect(tags).toEqual({ trackGainDb: -4.75, trackPeak: 0.831 });
  });
  it("tanpa ilst -> null", () => {
    expect(parseReplayGainTags(box("ftyp", enc.encode("M4A ")))).toBeNull();
  });
});

describe("parseReplayGainTags — format lain", () => {
  it("format tak dikenal -> null, tidak throw", () => {
    expect(parseReplayGainTags(enc.encode("OggS...."))).toBeNull();
    expect(parseReplayGainTags(new Uint8Array(0))).toBeNull();
  });
});

describe("base64ToBytes", () => {
  it("round-trip dengan TextEncoder", () => {
    const original = flacFile([["REPLAYGAIN_TRACK_GAIN", "-6.23 dB"]]);
    const b64 = Buffer.from(original).toString("base64");
    const decoded = base64ToBytes(b64);
    expect(decoded).toEqual(original);
    expect(parseReplayGainTags(decoded)).toEqual({ trackGainDb: -6.23 });
  });
});
