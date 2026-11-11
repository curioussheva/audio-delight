/**
 * getRandomTheme mengecualikan tema aktif (U-P2-35) dan getThemeById jatuh
 * ke tema default brand (U-P2-39) — bukan midnight-blue lagi.
 */

import {
  ALL_THEMES,
  DEFAULT_THEME,
  getRandomTheme,
  getThemeById,
} from "@/shared/constants/theme";

describe("getRandomTheme (U-P2-35)", () => {
  it("tidak pernah mengembalikan tema yang dikecualikan", () => {
    for (let i = 0; i < 50; i++) {
      expect(getRandomTheme("pristine-noir").id).not.toBe("pristine-noir");
    }
  });

  it("tanpa pengecualian tetap mengembalikan tema yang terdaftar", () => {
    const theme = getRandomTheme();
    expect(ALL_THEMES[theme.id]).toBe(theme);
  });

  it("mengembalikan tema lain bila hanya satu tema yang tersisa di pool", () => {
    // Pool = semua tema kecuali yang dikecualikan; dengan 22 tema,
    // hasilnya selalu ada dan selalu berbeda dari yang dikecualikan.
    const ids = new Set(
      Array.from({ length: 50 }, () => getRandomTheme("emerald-noir").id),
    );
    expect(ids.has("emerald-noir")).toBe(false);
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("getThemeById (U-P2-39)", () => {
  it("id tidak dikenal jatuh ke DEFAULT_THEME (pristine-noir)", () => {
    expect(getThemeById("tidak-ada" as any)).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME.id).toBe("pristine-noir");
  });

  it("id dikenal mengembalikan tema itu", () => {
    expect(getThemeById("pristine-porcelain").id).toBe("pristine-porcelain");
  });
});
