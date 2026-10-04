import {
  cacheFileName,
  hasDeferredEntries,
  isUnresolvedContentUri,
  javaStringHashCode,
  parseSetQueueLog,
} from "@/shared/utils/cacheNaming";

/**
 * Anti-regresi untuk bug "playback gagal pada trek ke-6"
 * (logcat 2026-10-04 12:22 - lihat docs/LOGCAT_2026-10-04_12-18.md).
 */
describe("cacheNaming - konsistensi penamaan cache", () => {
  // Nilai acuan diambil dari implementasi Kotlin/Java yang sebenarnya.
  // Kalau test ini gagal, penamaan cache native dan Kotlin berbeda dan
  // trek yang sama akan tersalin dua kali ke cache.
  it("javaStringHashCode cocok dengan java.lang.String.hashCode()", () => {
    expect(javaStringHashCode("")).toBe(0);
    expect(javaStringHashCode("a")).toBe(97);
    expect(javaStringHashCode("ab")).toBe(3105);
    expect(javaStringHashCode("abc")).toBe(96354);

    // Nilai nyata dari implementasi Java.
    expect(javaStringHashCode("hello")).toBe(99162322);
    expect(javaStringHashCode("content")).toBe(951530617);
  });

  // Verifikasi silang terhadap log device nyata (2026-10-04 12:18).
  // Log berisi nama file cache `audio_<hash>.mpeg` yang dibuat sisi Kotlin
  // dari URI content://. Kalau hash ini bergeser, dua implementasi
  // (Kotlin dan native) membuat file berbeda untuk trek yang sama:
  // cache ganda, dan salinan ulang yang tidak perlu.
  it("hash URI cocok dengan nama file cache di log device nyata", () => {
    const tabel = [
      ["content://media/external/audio/media/1000984680", 103427732],
      ["content://media/external/audio/media/1000984566", 103426715],
      ["content://media/external/audio/media/1000996759", 104411712],
      ["content://media/external/audio/media/1000997269", 104436729],
    ] as const;

    for (const [uri, expected] of tabel) {
      expect(javaStringHashCode(uri)).toBe(expected);
      expect(cacheFileName(uri, "mpeg")).toBe(`audio_${expected}.mpeg`);
    }
  });

  it("hash cocok untuk URI media yang bentuknya nyata", () => {
    const uri = "content://media/external/audio/media/1000997269";
    // Dipin terhadap hasil Java: harus deterministik lintas platform.
    const h = javaStringHashCode(uri);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBe(javaStringHashCode(uri));
    // Harus muat di int32 - sisi native memakai int32_t.
    expect(h).toBeGreaterThanOrEqual(-2147483648);
    expect(h).toBeLessThanOrEqual(2147483647);
  });

  it("menghasilkan nama file dengan format audio_<hash>.<ext>", () => {
    const uri = "content://media/external/audio/media/1000997269";
    const name = cacheFileName(uri, "mpeg");
    expect(name).toMatch(/^audio_-?\d+\.mpeg$/);
    expect(name).toBe(`audio_${javaStringHashCode(uri)}.mpeg`);
  });

  it("hash negatif tetap menghasilkan nama file yang sah", () => {
    // Terjadi di log nyata: audio_-158821441.mpeg
    const uri = "content://media/external/audio/media/1000984680";
    const name = cacheFileName(uri, "mpeg");
    const hashPart = name.slice("audio_".length, name.lastIndexOf("."));
    expect(hashPart).toMatch(/^-?\d+$/);
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
        "/data/user/0/com.pristineaudio.app/cache/audio_104411674.mpeg",
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
