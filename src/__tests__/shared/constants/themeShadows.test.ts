/**
 * Cacat shadows (Fase 2): 6 tema mengisi slot `shadows` dengan
 * BASE_SPACING lewat `as any` — bayangan berisi angka spacing, bukan
 * objek bayangan. Dampak lama: `...theme.shadows.md` di dalam style
 * adalah no-op (spread angka = objek kosong), jadi pemakai shadows
 * tidak pernah mendapat bayangan di 6 tema itu. Test ini mengunci
 * perbaikannya: semua tema memakai objek bayangan bertipe benar.
 */
import { ALL_THEMES } from "../../../shared/constants/theme";
import { BASE_SHADOWS } from "../../../shared/constants/themes/base";

const themes = Object.values(ALL_THEMES);

/** 6 tema yang dulu cacat (Fase 0 §5, Fase 1 §7). */
const FIXED_IDS = [
  "neon-cyber",
  "sunset-orange",
  "forest-green",
  "ocean-wave",
  "golden-hour",
  "rose-gold",
] as const;

describe("shadows tema", () => {
  it("setiap tema punya shadows sm/md/lg sebagai objek bayangan", () => {
    for (const t of themes) {
      for (const key of ["sm", "md", "lg"] as const) {
        const s = t.shadows[key] as unknown as Record<string, unknown>;
        expect(typeof s).toBe("object");
        expect(s).not.toBeNull();
        expect(typeof s.shadowColor).toBe("string");
        expect(typeof s.shadowOpacity).toBe("number");
        expect(typeof s.shadowRadius).toBe("number");
        expect(typeof s.elevation).toBe("number");
      }
    }
  });

  it("tidak ada lagi tema yang mengisi shadows dengan angka spacing", () => {
    for (const t of themes) {
      // Dulu: shadows = BASE_SPACING -> shadows.sm adalah angka 8.
      expect(typeof t.shadows.sm).not.toBe("number");
      expect(typeof t.shadows.md).not.toBe("number");
      expect(typeof t.shadows.lg).not.toBe("number");
    }
  });

  it("6 tema yang dulu cacat kini memakai BASE_SHADOWS", () => {
    for (const id of FIXED_IDS) {
      const t = ALL_THEMES[id];
      expect(t).toBeDefined();
      expect(t.shadows).toEqual(BASE_SHADOWS);
    }
  });

  it("bayangan memakai warna hangat, bukan hitam pekat", () => {
    // BASE_SHADOWS (Fase 1): shadowColor "#1D130C". Tema inline di
    // theme.ts memakai salinan lokal dengan warna yang sama.
    for (const t of themes) {
      for (const key of ["sm", "md", "lg"] as const) {
        const s = t.shadows[key] as unknown as Record<string, unknown>;
        expect(s.shadowColor).toBe("#1D130C");
      }
    }
  });
});
