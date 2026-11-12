import {
  cacheFileName,
  fnv1a64Hex,
  hasDeferredEntries,
  isUnresolvedContentUri,
  parseSetQueueLog,
} from "@/shared/utils/cacheNaming";

/**
 * Anti-regresi untuk bug "playback gagal pada trek ke-6"
 * (logcat 2026-10-04 12:22 - lihat docs/LOGCAT_2026-10-04_12-18.md).
 */
describe("cacheNaming - konsistensi penamaan cache", () => {
  // Nilai acuan FNV-1a 64-bit (offset basis 14695981039346656037, prima
  // 1099511628211, atas byte UTF-8). Kalau test ini gagal, penamaan cache
  // native dan Kotlin berbeda dan trek yang sama akan tersalin dua kali
  // ke cache. (B9-cache64, 2026-11-12: sebelumnya javaStringHashCode
  // 32-bit — nilai lama dari log device ada di git history test ini.)
  it("fnv1a64Hex cocok dengan FNV-1a 64-bit referensi", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("ab")).toBe("089c4407b545986a");
    expect(fnv1a64Hex("abc")).toBe("e71fa2190541574b");

    // Nilai referensi (dihitung Python, implementasi FNV-1a independen).
    expect(fnv1a64Hex("hello")).toBe("a430d84680aabd0b");
    expect(fnv1a64Hex("content")).toBe("420c75b526b35282");
  });

  // Verifikasi silang terhadap URI media nyata (dulu dipin terhadap
  // javaStringHashCode di log device 2026-10-04 12:18 — nilai hashCode
  // lamanya: 103427732, 103426715, 104411712, 104436729).
  // Kalau hash ini bergeser, dua implementasi (Kotlin dan native)
  // membuat file berbeda untuk trek yang sama: cache ganda, dan salinan
  // ulang yang tidak perlu.
  it("hash URI cocok dengan nama file cache", () => {
    const tabel = [
      ["content://media/external/audio/media/1000984680", "9c5a4af27be4837d"],
      ["content://media/external/audio/media/1000984566", "82df37f26d9aa220"],
      ["content://media/external/audio/media/1000996759", "9c60e0cee929c291"],
      ["content://media/external/audio/media/1000997269", "8ea3f9d7ff1be9a4"],
    ] as const;

    for (const [uri, expected] of tabel) {
      expect(fnv1a64Hex(uri)).toBe(expected);
      expect(cacheFileName(uri, "mpeg")).toBe(`audio_${expected}.mpeg`);
    }
  });

  it("hash cocok untuk URI media yang bentuknya nyata", () => {
    const uri = "content://media/external/audio/media/1000997269";
    // Dipin terhadap hasil referensi: harus deterministik lintas platform.
    const h = fnv1a64Hex(uri);
    expect(h).toBe("8ea3f9d7ff1be9a4");
    expect(h).toBe(fnv1a64Hex(uri));
    // Selalu 16 digit hex lowercase, zero-padded — tanpa tanda minus
    // (dulu hashCode 32-bit bisa negatif: audio_-158821441.mpeg).
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("menghasilkan nama file dengan format audio_<hash>.<ext>", () => {
    const uri = "content://media/external/audio/media/1000997269";
    const name = cacheFileName(uri, "mpeg");
    expect(name).toMatch(/^audio_[0-9a-f]{16}\.mpeg$/);
    expect(name).toBe(`audio_${fnv1a64Hex(uri)}.mpeg`);
  });

  it("hash tidak pernah negatif — nama file selalu hex 16 digit", () => {
    // URI yang dulu menghasilkan hashCode negatif (-158821441 dkk).
    const uri = "content://media/external/audio/media/1000984680";
    const name = cacheFileName(uri, "mpeg");
    const hashPart = name.slice("audio_".length, name.lastIndexOf("."));
    expect(hashPart).toMatch(/^[0-9a-f]{16}$/);
    expect(hashPart).not.toContain("-");
  });

  it("URI berbeda menghasilkan nama cache berbeda", () => {
    const a = cacheFileName("content://media/external/audio/media/1", "mpeg");
    const b = cacheFileName("content://media/external/audio/media/2", "mpeg");
    expect(a).not.toBe(b);
  });

  it("URI sama + ext sama menghasilkan nama sama (cache bisa dipakai ulang)", () => {
    const uri = "content://media/external/audio/media/1000997269";
    expect(cacheFileName(uri, "mpeg")).toBe(cacheFileName(uri, "mpeg"));
  });
});

describe("cacheNaming - deteksi entri yang belum di-resolve", () => {
  it("mengenali content:// sebagai belum di-resolve", () => {
    expect(isUnresolvedContentUri("content://media/external/audio/media/1")).toBe(true);
  });

  it("mengenali jalur file cache sebagai sudah di-resolve", () => {
    expect(
      isUnresolvedContentUri(
        "/data/user/0/com.pristineaudio.app/cache/audio_9c60e0cee929c291.mpeg",
      ),
    ).toBe(false);
  });

  it("mengenali jalur storage biasa sebagai sudah di-resolve", () => {
    expect(isUnresolvedContentUri("/storage/emulated/0/Music/a.flac")).toBe(false);
  });

  it("hasDeferredEntries true kalau ada content:// mentah", () => {
    // Bentuk antrean nyata dari log: 5 resolved, sisanya deferred.
    const queue = [
      "/data/user/0/com.pristineaudio.app/cache/audio_1.mpeg",
      "/data/user/0/com.pristineaudio.app/cache/audio_2.mpeg",
      "content://media/external/audio/media/1000997269",
    ];
    expect(hasDeferredEntries(queue)).toBe(true);
  });

  it("hasDeferredEntries false kalau semua sudah di-resolve", () => {
    const queue = [
      "/data/user/0/com.pristineaudio.app/cache/audio_1.mpeg",
      "/storage/emulated/0/Music/b.flac",
    ];
    expect(hasDeferredEntries(queue)).toBe(false);
  });

  it("antrean kosong tidak dianggap punya entri deferred", () => {
    expect(hasDeferredEntries([])).toBe(false);
  });
});

describe("cacheNaming - parsing log setQueue (deteksi regresi)", () => {
  it("mengurai baris log nyata", () => {
    const line =
      "setQueue: total=48, resolved=5, deferred=43, elapsed=769ms";
    expect(parseSetQueueLog(line)).toEqual({
      total: 48,
      resolved: 5,
      deferred: 43,
    });
  });

  it("mengembalikan null untuk baris yang bukan setQueue", () => {
    expect(parseSetQueueLog("resolveContentUriToPath: cache hit x.mpeg")).toBeNull();
  });

  it("kegagalan yang terjadi di device bisa direproduksi sebagai data uji", () => {
    // Inilah bentuk baris log yang menyertai bug. Test ini memastikan
    // deteksinya bekerja, sehingga regresi yang sama bisa dikenali dari log
    // tanpa perlu membaca manual.
    const line = "setQueue: total=48, resolved=5, deferred=43, elapsed=482ms";
    const parsed = parseSetQueueLog(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.deferred).toBeGreaterThan(0);
    // deferred > 0 berarti ada entri content:// mentah di antrean.
    expect(parsed!.total - parsed!.resolved).toBe(parsed!.deferred);
  });
});
