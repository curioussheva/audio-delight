/**
 * Toggle "Mode Gelap" harus simetris untuk keluarga brand (U-P1-26):
 * pristine-noir ↔ pristine-porcelain. Dulu pasangan dipilih dari kontras
 * latar terdekat dan Porcelain jatuh ke ocean-wave — sakelar diam-diam
 * mengganti keluarga tema.
 */

import { ALL_THEMES } from "@/shared/constants/theme";
import {
  findCounterpartTheme,
  resolveToggleTarget,
} from "@/shared/utils/themeMode";

describe("findCounterpartTheme (U-P1-26)", () => {
  it("memasangkan pristine-noir → pristine-porcelain", () => {
    expect(findCounterpartTheme("pristine-noir")).toBe("pristine-porcelain");
  });

  it("memasangkan pristine-porcelain → pristine-noir (bukan ocean-wave)", () => {
    expect(findCounterpartTheme("pristine-porcelain")).toBe("pristine-noir");
  });

  it("tema di luar keluarga brand tetap memakai perilaku lama (lawan-mode)", () => {
    // ocean-wave gelap → pasangannya harus tema terang.
    const counterpart = findCounterpartTheme("ocean-wave");
    expect(counterpart).not.toBeNull();
    expect(ALL_THEMES[counterpart!].isDark).toBe(false);
  });

  it("id tidak dikenal mengembalikan null", () => {
    expect(findCounterpartTheme("tidak-ada" as any)).toBeNull();
  });
});

describe("resolveToggleTarget (U-P1-26)", () => {
  it("toggle dua kali kembali ke tema semula (Noir → Porcelain → Noir)", () => {
    const once = resolveToggleTarget("pristine-noir");
    expect(once).toBe("pristine-porcelain");
    expect(resolveToggleTarget(once)).toBe("pristine-noir");
  });

  it("toggle dua kali kembali ke tema semula (Porcelain → Noir → Porcelain)", () => {
    const once = resolveToggleTarget("pristine-porcelain");
    expect(once).toBe("pristine-noir");
    expect(resolveToggleTarget(once)).toBe("pristine-porcelain");
  });
});
