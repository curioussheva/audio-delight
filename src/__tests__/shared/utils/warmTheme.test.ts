/**
 * Tema hangat + token Fase 1.
 *
 * Mengunci keputusan redesign final (2026-11-18): pasangan hangat
 * pristine-ember / pristine-hearth terdaftar dan jadi default, token
 * spacing/radius/tipografi/bayangan terisi, dan toggle "Mode Gelap"
 * simetris untuk pasangan hangat.
 */

import {
  ALL_THEMES,
  DEFAULT_THEME,
  THEME_CATEGORIES,
} from "../../../shared/constants/theme";
import {
  BASE_SPACING,
  BASE_TYPOGRAPHY,
  BASE_SHADOWS,
  BASE_RADIUS,
  FONT_FAMILY,
} from "../../../shared/constants/themes/base";
import { findCounterpartTheme } from "../../../shared/utils/themeMode";

describe("tema hangat (Fase 1)", () => {
  it("pristine-ember + pristine-hearth terdaftar", () => {
    const ember = ALL_THEMES["pristine-ember"];
    const hearth = ALL_THEMES["pristine-hearth"];
    expect(ember).toBeDefined();
    expect(hearth).toBeDefined();
    expect(ember.isDark).toBe(true);
    expect(hearth.isDark).toBe(false);
    expect(ember.colors.background.primary).toBe("#1D130C");
    expect(hearth.colors.background.primary).toBe("#FDF9F1");
    expect(ember.colors.accent.primary).toBe("#B7791F");
    expect(hearth.colors.accent.primary).toBe("#B7791F");
  });

  it("default aplikasi adalah pristine-ember", () => {
    expect(DEFAULT_THEME.id).toBe("pristine-ember");
  });

  it("tema hangat masuk kategori picker", () => {
    expect(THEME_CATEGORIES.dark).toContain("pristine-ember");
    expect(THEME_CATEGORIES.light).toContain("pristine-hearth");
  });

  it("toggle simetris untuk pasangan hangat", () => {
    expect(findCounterpartTheme("pristine-ember")).toBe("pristine-hearth");
    expect(findCounterpartTheme("pristine-hearth")).toBe("pristine-ember");
  });
});

describe("token Fase 1", () => {
  it("spacing mencakup 10/12/20 dari kebiasaan nyata kode", () => {
    expect(BASE_SPACING.s10).toBe(10);
    expect(BASE_SPACING.s12).toBe(12);
    expect(BASE_SPACING.s20).toBe(20);
    // Skala lama tetap utuh
    expect(BASE_SPACING.sm).toBe(8);
    expect(BASE_SPACING.md).toBe(16);
    expect(BASE_SPACING.lg).toBe(24);
  });

  it("radius punya 4 tingkat + pill dari pengelompokan nyata", () => {
    expect(BASE_RADIUS).toEqual({ sm: 8, md: 12, lg: 16, xl: 20, pill: 999 });
  });

  it("setiap tema punya radius dari token", () => {
    for (const t of Object.values(ALL_THEMES)) {
      expect(t.radius).toEqual(BASE_RADIUS);
    }
  });

  it("tipografi merujuk font Playfair Display + Inter lewat token", () => {
    expect(BASE_TYPOGRAPHY.fontFamily).toEqual({
      regular: FONT_FAMILY.regular,
      medium: FONT_FAMILY.medium,
      semiBold: FONT_FAMILY.semiBold,
      bold: FONT_FAMILY.bold,
      display: FONT_FAMILY.display,
      displayBold: FONT_FAMILY.displayBold,
    });
    expect(FONT_FAMILY.display).toBe("PlayfairDisplay-Regular");
    expect(FONT_FAMILY.displayBold).toBe("PlayfairDisplay-Bold");
    expect(FONT_FAMILY.regular).toBe("Inter-Regular");
  });

  it("bayangan memakai warna hangat, bukan hitam pekat", () => {
    for (const level of Object.values(BASE_SHADOWS)) {
      const shadow = level as { shadowColor?: string };
      expect(shadow.shadowColor).toBe("#1D130C");
    }
  });
});
