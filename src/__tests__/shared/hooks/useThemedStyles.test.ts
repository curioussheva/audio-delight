/**
 * Hook gaya bertema (Fase 1) — menguji helper murni `buildThemedStyles`
 * (hook React-nya sendiri adalah pembungkus `useMemo` tipis di atasnya dan
 * butuh render Testing Library, yang tidak terinstal di repo ini).
 */

import { buildThemedStyles } from "../../../shared/utils/themedStyles";
import { DEFAULT_THEME } from "../../../shared/constants/theme";

describe("buildThemedStyles", () => {
  it("membangun gaya dari token tema yang diberikan", () => {
    const styles = buildThemedStyles(DEFAULT_THEME, (t) => ({
      color: t.colors.text.primary,
      backgroundColor: t.colors.background.primary,
      fontSize: t.typography.body1?.fontSize,
      fontFamily: t.typography.fontFamily?.regular,
      padding: t.spacing.md,
      borderRadius: t.radius.md,
    }));
    expect(styles).toEqual({
      color: DEFAULT_THEME.colors.text.primary,
      backgroundColor: DEFAULT_THEME.colors.background.primary,
      fontSize: 16,
      fontFamily: "Inter-Regular",
      padding: 16,
      borderRadius: 12,
    });
  });

  it("mengikuti tema yang diberikan (bukan default global)", () => {
    const light = buildThemedStyles(DEFAULT_THEME, (t) => t.isDark);
    expect(light).toBe(true); // DEFAULT_THEME = pristine-ember (gelap)
  });
});
