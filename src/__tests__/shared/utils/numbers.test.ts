import { parseIntOrKeep } from "../../../shared/utils/numbers";

describe("parseIntOrKeep (U-P2-05)", () => {
  it("mengembalikan angka hasil parse untuk string numerik", () => {
    expect(parseIntOrKeep("2024", 1999)).toBe(2024);
    expect(parseIntOrKeep("2024-05-01", 1999)).toBe(2024);
  });

  it("mempertahankan nilai lama untuk string non-numerik (bukan NaN)", () => {
    const result = parseIntOrKeep("tahun-rilis", 1999);
    expect(result).toBe(1999);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("mempertahankan nilai lama untuk string kosong / undefined / null", () => {
    expect(parseIntOrKeep("", 1999)).toBe(1999);
    expect(parseIntOrKeep(undefined, 1999)).toBe(1999);
    expect(parseIntOrKeep(null, 1999)).toBe(1999);
  });

  it("mengembalikan undefined bila tidak ada nilai lama dan parse gagal", () => {
    expect(parseIntOrKeep("bukan-angka", undefined)).toBeUndefined();
    expect(parseIntOrKeep(undefined, undefined)).toBeUndefined();
  });
});
