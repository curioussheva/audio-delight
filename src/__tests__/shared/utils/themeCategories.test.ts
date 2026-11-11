import {
  THEME_CATEGORIES,
  sortThemeCategoryKeys,
  themeCategoryLabel,
} from "@/shared/constants/theme";

describe("themeCategoryLabel", () => {
  it("mengembalikan label yang dikenal", () => {
    expect(themeCategoryLabel("dark")).toBe("🌙 Dark");
    expect(themeCategoryLabel("light")).toBe("☀️ Light");
    expect(themeCategoryLabel("premium")).toBe("💎 Premium");
    expect(themeCategoryLabel("nature")).toBe("🌿 Nature");
    expect(themeCategoryLabel("lainnya")).toBe("📦 Lainnya");
  });

  it("memberi label generik untuk kunci yang belum dikenal", () => {
    expect(themeCategoryLabel("foo")).toBe("📦 Foo");
  });
});

describe("sortThemeCategoryKeys", () => {
  it("mengurutkan sesuai urutan picker dan menaruh lainnya di akhir", () => {
    expect(sortThemeCategoryKeys(["lainnya", "nature", "dark"])).toEqual([
      "dark",
      "nature",
      "lainnya",
    ]);
  });

  it("menaruh kunci tak dikenal paling akhir dengan urutan asli", () => {
    expect(sortThemeCategoryKeys(["zzz", "dark", "aaa"])).toEqual([
      "dark",
      "zzz",
      "aaa",
    ]);
  });

  it("tidak mengubah array asal", () => {
    const keys = ["light", "dark"];
    sortThemeCategoryKeys(keys);
    expect(keys).toEqual(["light", "dark"]);
  });
});

describe("THEME_CATEGORIES vs picker", () => {
  it("setiap kategori yang ada ikut terurut dan punya label", () => {
    const keys = Object.keys(THEME_CATEGORIES);
    const sorted = sortThemeCategoryKeys(keys);
    expect([...sorted].sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(themeCategoryLabel(key).length).toBeGreaterThan(0);
    }
  });
});
