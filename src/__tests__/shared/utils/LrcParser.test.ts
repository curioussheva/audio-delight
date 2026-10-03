import { parseLRC } from "../../../shared/utils/LrcParser";

describe("parseLRC", () => {
  it("parse satu timestamp per baris", () => {
    const out = parseLRC("[00:12.34]Halo dunia");
    expect(out).toEqual([{ time: 12340, text: "Halo dunia" }]);
  });

  it("parse format 3 digit milidetik", () => {
    expect(parseLRC("[01:02.345]Teks")).toEqual([
      { time: 62345, text: "Teks" },
    ]);
  });

  it("pad 2 digit milidetik jadi ratusan (34 -> 340ms)", () => {
    expect(parseLRC("[00:01.34]x")[0].time).toBe(1340);
  });

  it("dua timestamp di satu baris menghasilkan dua entri", () => {
    const out = parseLRC("[00:01.00][00:05.00]Reff");
    expect(out).toEqual([
      { time: 1000, text: "Reff" },
      { time: 5000, text: "Reff" },
    ]);
  });

  it("urut naik walau input tidak berurutan", () => {
    const out = parseLRC("[00:10.00]b\n[00:02.00]a");
    expect(out.map((l) => l.text)).toEqual(["a", "b"]);
  });

  it("abaikan baris tanpa teks", () => {
    expect(parseLRC("[00:01.00]\n\n[00:02.00]ada")).toEqual([
      { time: 2000, text: "ada" },
    ]);
  });

  it("abaikan baris tanpa timestamp", () => {
    expect(parseLRC("bukan lirik\n[00:03.00]asli")).toEqual([
      { time: 3000, text: "asli" },
    ]);
  });

  it("teks kosong menghasilkan array kosong", () => {
    expect(parseLRC("")).toEqual([]);
  });

  it("menit lebih dari 60 tetap dihitung benar", () => {
    expect(parseLRC("[99:59.99]akhir")[0].time).toBe(99 * 60000 + 59 * 1000 + 990);
  });

  // REGRESI: regex ber-flag `g` bersifat stateful lintas pemanggilan exec().
  // Kalau lastIndex tidak direset, baris setelah baris ber-timestamp bisa
  // kehilangan timestamp-nya.
  it("REGRESI: timestamp di baris kedua tetap terbaca", () => {
    const out = parseLRC("[00:01.00]satu\n[00:02.00]dua\n[00:03.00]tiga");
    expect(out.map((l) => l.text)).toEqual(["satu", "dua", "tiga"]);
    expect(out.map((l) => l.time)).toEqual([1000, 2000, 3000]);
  });

  it("REGRESI: pemanggilan berturut-turut tidak saling mengotori state regex", () => {
    const a = parseLRC("[00:01.00]a\n[00:02.00]b");
    const b = parseLRC("[00:03.00]c\n[00:04.00]d");
    expect(a.map((l) => l.time)).toEqual([1000, 2000]);
    expect(b.map((l) => l.time)).toEqual([3000, 4000]);
  });
});
