/**
 * Pengukuran kontras WCAG - dipakai untuk memilih warna teks di layar DSP/EQ.
 *
 * Yang diuji di sini bukan cuma aritmetikanya, tapi KEPUTUSAN yang diambil
 * darinya: kapan memakai `primary[500]` sebagai teks (aman di tema terang,
 * berbahaya di tema gelap) dan kapan harus jatuh ke `text.primary`.
 */

import {
  contrastRatio,
  parseHex,
  pickReadable,
  meetsAA,
  relativeLuminance,
  AA_NORMAL,
  AA_LARGE,
} from "@/shared/utils/contrast";

describe("parseHex", () => {
  it("membaca #RRGGBB", () => {
    expect(parseHex("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#FF3D00")).toEqual({ r: 255, g: 61, b: 0 });
  });

  it("mengembangkan #RGB jadi #RRGGBB", () => {
    expect(parseHex("#F00")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHex("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("menerima #RRGGBBAA dengan mengabaikan alpha", () => {
    expect(parseHex("#11223380")).toEqual({ r: 17, g: 34, b: 51 });
  });

  it("mengembalikan null untuk nilai yang tidak bisa dibaca", () => {
    // null HARUS dianggap "tidak diketahui", bukan hitam - kalau tidak,
    // pengukuran akan mengklaim lulus atas dasar data yang tidak ada.
    expect(parseHex(undefined)).toBeNull();
    expect(parseHex(null)).toBeNull();
    expect(parseHex("")).toBeNull();
    expect(parseHex("rebeccapurple")).toBeNull();
    expect(parseHex("rgba(0,0,0,0.5)")).toBeNull();
    expect(parseHex("#GGGGGG")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("hitam 0, putih 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("null kalau warna tidak terbaca", () => {
    expect(relativeLuminance("rgba(0,0,0,0.5)")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("hitam-putih = 21:1 (maksimum WCAG)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("warna sama dengan dirinya = 1:1", () => {
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  it("urutan argumen tidak berpengaruh", () => {
    const a = contrastRatio("#0A0A0A", "#666666");
    const b = contrastRatio("#666666", "#0A0A0A");
    expect(a).toBeCloseTo(b as number, 10);
  });

  it("null kalau salah satu tidak terbaca", () => {
    expect(contrastRatio("#FFFFFF", "rgba(0,0,0,0.7)")).toBeNull();
  });
});

describe("meetsAA", () => {
  it("nilai tidak terbaca TIDAK dianggap lulus", () => {
    // Ini yang mencegah klaim palsu: data yang tidak ada bukan bukti.
    expect(meetsAA("rgba(0,0,0,0.7)", "#FFFFFF")).toBe(false);
    expect(meetsAA("#FFFFFF", undefined)).toBe(false);
  });

  it("putih di atas hitam lulus, abu gelap di atas hitam tidak", () => {
    expect(meetsAA("#FFFFFF", "#000000")).toBe(true);
    expect(meetsAA("#444444", "#111111")).toBe(false);
  });
});

describe("pickReadable", () => {
  it("memilih kandidat pertama yang memenuhi ambang", () => {
    const chosen = pickReadable(["#444444", "#FFFFFF"], "#111111");
    expect(chosen).toBe("#FFFFFF");
  });

  it("menghormati urutan preferensi saat keduanya lulus", () => {
    const chosen = pickReadable(["#FFFFFF", "#EEEEEE"], "#000000");
    expect(chosen).toBe("#FFFFFF");
  });

  it("melewati kandidat yang tidak terbaca", () => {
    const chosen = pickReadable(["rgba(0,0,0,0.5)", "#FFFFFF"], "#111111");
    expect(chosen).toBe("#FFFFFF");
  });

  it("mengembalikan undefined kalau tidak ada kandidat yang bisa dibaca", () => {
    expect(pickReadable([undefined, null, "bukan-warna"], "#111111")).toBeUndefined();
  });

  it("kalau tidak ada yang mencapai ambang, ambil rasio TERTINGGI", () => {
    // Bukan undefined: lebih baik memberi warna paling terbaca daripada
    // tidak ada teks. Selisihnya yang jadi utang, bukan disembunyikan.
    const chosen = pickReadable(["#222222", "#555555", "#333333"], "#0A0A0A");
    expect(chosen).toBe("#555555");
  });
});

describe("kasus nyata dari layar DSP/EQ", () => {
  // Nilai-nilai ini diukur dari kode sebelum perbaikan. Kalau suatu saat
  // berubah, test ini yang memberi tahu.
  it("warna hardcoded lama memang gagal ambang", () => {
    expect(contrastRatio("#444444", "#111111")).toBeLessThan(AA_NORMAL);
    expect(contrastRatio("#444444", "#050505")).toBeLessThan(AA_NORMAL);
    expect(contrastRatio("#555555", "#0A0A0A")).toBeLessThan(AA_NORMAL);
  });

  it("text.primary di atas kartu lulus di semua mode", () => {
    // Kartu gelap (tema gelap) dan kartu terang (tema terang).
    expect(meetsAA("#EDF2F5", "#141E33")).toBe(true);
    expect(meetsAA("#0F172A", "#F8FAFC")).toBe(true);
  });

  it("primary[500] BERBAHAYA sebagai teks di tema gelap", () => {
    // charcoal-black: primary[500] #1A1A1A di atas latar #000000.
    expect(contrastRatio("#1A1A1A", "#000000")).toBeLessThan(AA_NORMAL);
    // midnight-blue: #0F1E3D di atas #0B1424.
    expect(contrastRatio("#0F1E3D", "#0B1424")).toBeLessThan(AA_NORMAL);
    // charcoal-black primary[500] hampir tak terlihat - rasio ~1.1.
    expect(contrastRatio("#1A1A1A", "#000000")).toBeLessThan(1.5);
  });

  it("pickReadable menghormati preferensi selama masih lulus ambang", () => {
    // Kartu gelap #1A1A1A: oranye #FF3D00 rasio ~5.2, jadi LULUS dan dipilih
    // (ia kandidat pertama). Yang penting: yang dipilih memang terbaca.
    const card = "#1A1A1A";
    const chosen = pickReadable(["#1A1A1A", "#FF3D00", "#EDF2F5"], card);
    expect(chosen).toBe("#FF3D00");
    expect(meetsAA(chosen, card)).toBe(true);
  });

  it("pickReadable melewati aksen yang gagal di permukaan terang", () => {
    // Kartu terang: putih gagal, oranye gagal, teks gelap lulus -> jatuh ke
    // kandidat yang memang terbaca. Ini kasus tema terang.
    const lightCard = "#F8FAFC";
    const chosen = pickReadable(["#FFFFFF", "#FF3D00", "#0F172A"], lightCard);
    expect(chosen).toBe("#0F172A");
    expect(meetsAA(chosen, lightCard)).toBe(true);
  });

  it("ambang grafis (3:1) lebih longgar daripada teks", () => {
    // BASS BOOST oranye di atas kartu gelap: lolos sebagai elemen grafis,
    // tidak lolos sebagai teks normal.
    const orange = "#FF3D00";
    const card = "#0A0A0A";
    const ratio = contrastRatio(orange, card) as number;
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
