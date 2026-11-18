/**
 * Gaya komponen inti Fase 2 (uiStyles.ts) — builder murni, diuji tanpa
 * react-native. Mengunci: warna dari token, kontras WCAG AA untuk teks
 * di atas permukaan berwarna di SEMUA tema, dan ukuran dari token.
 */
import { ALL_THEMES } from "../../../shared/constants/theme";
import {
  buildButtonStyles,
  buildCardStyles,
  buildDialogStyles,
  buildTextInputStyles,
  buildStateStyles,
  buildToastStyles,
  contrastRatio,
  AA_NORMAL,
  AA_LARGE,
} from "../../../shared/utils/uiStyles";

const themes = Object.values(ALL_THEMES);
const ember = ALL_THEMES["pristine-ember"];
const hearth = ALL_THEMES["pristine-hearth"];

describe("PristineButton", () => {
  it("primer tema hangat = amber + onPrimary gelap", () => {
    for (const t of [ember, hearth]) {
      const s = buildButtonStyles(t, { variant: "primary" });
      expect(s.container.backgroundColor).toBe("#B7791F");
      expect(s.label.color).toBe("#1D130C");
    }
  });

  it("teks primer terbaca (AA) di semua tema", () => {
    for (const t of themes) {
      const s = buildButtonStyles(t, { variant: "primary" });
      const r = contrastRatio(
        s.label.color as string,
        s.container.backgroundColor as string,
      );
      expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("teks sekunder/teks terbaca (AA) di atas latar layar di semua tema", () => {
    for (const t of themes) {
      for (const variant of ["secondary", "text"] as const) {
        const s = buildButtonStyles(t, { variant });
        const r = contrastRatio(
          s.label.color as string,
          t.colors.background.primary,
        );
        expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it("destruktif: isi status.error dengan teks yang terbaca di semua tema", () => {
    for (const t of themes) {
      const s = buildButtonStyles(t, {
        variant: "primary",
        destructive: true,
      });
      expect(s.container.backgroundColor).toBe(t.colors.status.error);
      const r = contrastRatio(s.label.color as string, t.colors.status.error);
      expect(r).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("ukuran dari token: tinggi 48, radius pill, label peran button", () => {
    for (const t of themes) {
      const s = buildButtonStyles(t);
      expect(s.container.minHeight).toBe(48);
      expect(s.container.borderRadius).toBe(t.radius.pill);
      expect(s.label.fontSize).toBe(t.typography.button?.fontSize ?? 16);
      expect(s.label.fontWeight).toBe("600");
    }
  });

  it("disabled meredup, bukan hilang", () => {
    const s = buildButtonStyles(ember, { disabled: true });
    expect(s.container.opacity).toBe(0.5);
  });
});

describe("SectionCard", () => {
  it("kartu dari token: elevated + radius md + bayangan md + hairline", () => {
    for (const t of themes) {
      const s = buildCardStyles(t);
      expect(s.container.backgroundColor).toBe(t.colors.background.elevated);
      expect(s.container.borderRadius).toBe(t.radius.md);
      expect(s.container.borderWidth).toBe(1);
      expect(s.container.borderColor).toBe(t.colors.border.light);
      expect(s.container.padding).toBe(t.spacing.md);
      expect(s.container).toMatchObject(t.shadows.md as object);
    }
  });

  it("padding mengikuti opsi sm/md/lg dari token spacing", () => {
    expect(buildCardStyles(ember, { padding: "sm" }).container.padding).toBe(
      ember.spacing.sm,
    );
    expect(buildCardStyles(ember, { padding: "lg" }).container.padding).toBe(
      ember.spacing.lg,
    );
  });
});

describe("ConfirmDialog", () => {
  it("overlay dari token, kartu radius lg, judul h4, pesan body2", () => {
    for (const t of themes) {
      const s = buildDialogStyles(t);
      expect(s.overlay.backgroundColor).toBe(
        t.colors.background.overlay ?? "rgba(0, 0, 0, 0.5)",
      );
      expect(s.card.borderRadius).toBe(t.radius.lg);
      expect(s.title.fontSize).toBe(t.typography.h4?.fontSize ?? 20);
      expect(s.title.color).toBe(t.colors.text.primary);
      expect(s.message.color).toBe(t.colors.text.secondary);
      expect(s.message.fontSize).toBe(t.typography.body2?.fontSize ?? 14);
    }
  });
});

describe("PristineTextInput", () => {
  it("input dari token: tinggi 48, radius md, latar secondary", () => {
    for (const t of themes) {
      const s = buildTextInputStyles(t);
      expect(s.container.minHeight).toBe(48);
      expect(s.container.borderRadius).toBe(t.radius.md);
      expect(s.container.backgroundColor).toBe(t.colors.background.secondary);
      expect(s.input.fontSize).toBe(t.typography.body1?.fontSize ?? 16);
      expect(s.input.color).toBe(t.colors.text.primary);
    }
  });

  it("fokus = border aksen, error = border + teks status.error", () => {
    const focused = buildTextInputStyles(ember, { focused: true });
    expect(focused.container.borderColor).toBe(ember.colors.accent.primary);
    const error = buildTextInputStyles(ember, { error: true });
    expect(error.container.borderColor).toBe(ember.colors.status.error);
    expect(error.errorText.color).toBe(ember.colors.status.error);
  });
});

describe("keadaan (empty/error/loading)", () => {
  it("satu layout: padding 24, judul 16/600, pesan 14/secondary", () => {
    for (const t of themes) {
      const s = buildStateStyles(t);
      expect(s.container.padding).toBe(t.spacing.lg);
      expect(s.title.fontSize).toBe(t.typography.body1?.fontSize ?? 16);
      expect(s.title.fontWeight).toBe("600");
      expect(s.title.color).toBe(t.colors.text.primary);
      expect(s.message.fontSize).toBe(t.typography.body2?.fontSize ?? 14);
      expect(s.message.color).toBe(t.colors.text.secondary);
    }
  });
});

describe("GlobalToast", () => {
  it("ikon tiap tipe terbaca (AA besar) di atas elevated di semua tema", () => {
    for (const t of themes) {
      for (const type of ["success", "info", "error"] as const) {
        const s = buildToastStyles(t, type);
        const r = contrastRatio(s.iconColor, t.colors.background.elevated);
        expect(r).toBeGreaterThanOrEqual(AA_LARGE);
        expect(s.message.color).toBe(t.colors.text.primary);
        expect(s.card.backgroundColor).toBe(t.colors.background.elevated);
        expect(s.card.borderRadius).toBe(t.radius.lg);
      }
    }
  });
});
