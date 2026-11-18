// src/shared/utils/uiStyles.ts
//
// Builder gaya MURNI untuk komponen inti Fase 2 — dipisah dari komponen
// React-nya supaya bisa diuji jest logika-murni (jest proyek ini tidak
// mengimpor react-native; lihat jest.config.cjs).
//
// Semua ukuran/warna diambil dari token tema Fase 1 (spacing, radius,
// tipografi, shadows, accent.onPrimary/onPrimaryKey). Keputusan yang
// dikunci di sini (bukan per komponen):
// - Tinggi tombol tunggal 48 (Fase 0 T9: 48 tersering untuk primer).
// - Tombol membulat pill (radius.pill) — bentuk tombol yang sudah ada
//   di app (radius 22–28 di PlaylistList/CreatePlaylistModal).
// - Teks di atas permukaan berwarna SELALU dipilih terukur (pickReadable
//   / accentOn), bukan diasumsikan — mengikuti kontrak contrast.ts.
// - fontFamily diambil dari token (Inter/Playfair), bukan fontWeight
//   sistem semata.
import type { TextStyle, ViewStyle } from "react-native";

import type { Theme } from "@/shared/constants/themes/types";
import {
  accentOn,
  contrastRatio,
  pickReadable,
  AA_LARGE,
  AA_NORMAL,
} from "./contrast";

/** Bobot font → keluarga token (Inter/Playfair dari Fase 1). */
export function weightToFamily(
  theme: Theme,
  weight: "400" | "500" | "600" | "700",
): string | undefined {
  const f = theme.typography.fontFamily;
  if (!f) return undefined;
  switch (weight) {
    case "400":
      return f.regular;
    case "500":
      return f.medium;
    case "600":
      return f.semiBold;
    case "700":
      return f.bold;
    default:
      return f.regular;
  }
}

// ── Tombol ─────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "text";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Aksi destruktif (mis. "Hapus" di ConfirmDialog) — isi status.error. */
  destructive?: boolean;
  /**
   * Permukaan tempat tombol duduk (untuk mengukur keterbacaan teks).
   * Default: background.primary (layar). Dialog mengoper elevated.
   */
  surface?: string;
}

export interface ButtonStyles {
  container: ViewStyle;
  label: TextStyle;
}

/**
 * Primer = amber identitas (accent.primary) dengan teks onPrimary yang
 * dijamin AA oleh themeAccent.test.ts di SEMUA tema. Sekunder/teks =
 * aksen yang terbaca di atas permukaan (accentOn, jatuh ke teks tema
 * bila aksen tidak lolos). Destruktif = status.error dengan teks yang
 * dipilih terukur (putih/hitam).
 */
export function buildButtonStyles(
  theme: Theme,
  options: ButtonStyleOptions = {},
): ButtonStyles {
  const { colors, radius, spacing, typography } = theme;
  const variant = options.variant ?? "primary";
  const surface = options.surface ?? colors.background.primary;
  const button = typography.button ?? {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  };

  const labelBase: TextStyle = {
    fontSize: button.fontSize,
    fontWeight: button.fontWeight as TextStyle["fontWeight"],
    fontFamily: weightToFamily(theme, "600"),
    lineHeight: button.lineHeight,
    textAlign: "center",
  };

  const containerBase: ViewStyle = {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.s20 ?? 20,
    borderRadius: radius.pill,
  };

  if (variant === "primary") {
    if (options.destructive) {
      const labelColor =
        pickReadable(["#FFFFFF", "#000000"], colors.status.error, AA_NORMAL) ??
        "#FFFFFF";
      return {
        container: {
          ...containerBase,
          backgroundColor: colors.status.error,
          opacity: options.disabled ? 0.5 : 1,
        },
        label: { ...labelBase, color: labelColor },
      };
    }
    return {
      container: {
        ...containerBase,
        backgroundColor: colors.accent.primary,
        opacity: options.disabled ? 0.5 : 1,
      },
      label: { ...labelBase, color: colors.accent.onPrimary },
    };
  }

  // Sekunder (garis) dan teks: warna aksen yang terbaca di permukaan ini.
  const accent = accentOn([colors.accent.primary], surface, [
    colors.text.primary,
  ]);

  if (variant === "secondary") {
    return {
      container: {
        ...containerBase,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: accent,
        opacity: options.disabled ? 0.5 : 1,
      },
      label: { ...labelBase, color: accent },
    };
  }

  return {
    container: {
      ...containerBase,
      backgroundColor: "transparent",
      paddingHorizontal: spacing.sm,
      opacity: options.disabled ? 0.5 : 1,
    },
    label: { ...labelBase, color: accent },
  };
}

// ── Kartu / section ────────────────────────────────────────────────────────

export type CardPadding = "sm" | "md" | "lg";

export interface CardStyleOptions {
  padding?: CardPadding;
}

export interface CardStyles {
  container: ViewStyle;
}

/**
 * Kartu section: permukaan elevated + radius kartu (md) + bayangan md +
 * garis hairline border.light. Satu bentuk kartu untuk semua layar
 * (Fase 0 T1: radius kartu 8/10/12/16/20 tersebar tanpa peran).
 */
export function buildCardStyles(
  theme: Theme,
  options: CardStyleOptions = {},
): CardStyles {
  const { colors, radius, shadows, spacing } = theme;
  const pad =
    options.padding === "sm"
      ? spacing.sm
      : options.padding === "lg"
        ? spacing.lg
        : spacing.md;
  return {
    container: {
      backgroundColor: colors.background.elevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.light,
      padding: pad,
      ...shadows.md,
    },
  };
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export interface DialogStyles {
  overlay: ViewStyle;
  card: ViewStyle;
  title: TextStyle;
  message: TextStyle;
  actions: ViewStyle;
}

/**
 * Dialog konfirmasi: overlay dari token (background.overlay, fallback
 * hitam 50%), kartu = SectionCard + gap, judul h4, pesan body2, aksi
 * rata kanan dengan gap. Tombolnya memakai PristineButton.
 */
export function buildDialogStyles(theme: Theme): DialogStyles {
  const { colors, radius, spacing, typography } = theme;
  const card = buildCardStyles(theme);
  const h4 = typography.h4 ?? { fontSize: 20, fontWeight: "600", lineHeight: 28 };
  const body2 = typography.body2 ?? {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  };
  return {
    overlay: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.background.overlay ?? "rgba(0, 0, 0, 0.5)",
    },
    card: {
      ...card.container,
      borderRadius: radius.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: h4.fontSize,
      fontWeight: h4.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "600"),
      lineHeight: h4.lineHeight,
      color: colors.text.primary,
    },
    message: {
      fontSize: body2.fontSize,
      fontWeight: body2.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "400"),
      lineHeight: body2.lineHeight,
      color: colors.text.secondary,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
  };
}

// ── Input teks ─────────────────────────────────────────────────────────────

export interface TextInputStyleOptions {
  focused?: boolean;
  error?: boolean;
  disabled?: boolean;
}

export interface TextInputStyles {
  container: ViewStyle;
  input: TextStyle;
  label: TextStyle;
  errorText: TextStyle;
}

/**
 * Input: tinggi 48 (sama dengan tombol — satu garis visual), radius md,
 * border medium, latar secondary. Fokus: border aksen. Error: border +
 * teks status.error.
 */
export function buildTextInputStyles(
  theme: Theme,
  options: TextInputStyleOptions = {},
): TextInputStyles {
  const { colors, radius, spacing, typography } = theme;
  const body1 = typography.body1 ?? {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
  };
  const caption = typography.caption ?? {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  };
  return {
    container: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: options.error
        ? colors.status.error
        : options.focused
          ? colors.accent.primary
          : colors.border.medium,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md - 2,
      opacity: options.disabled ? 0.5 : 1,
    },
    input: {
      flex: 1,
      fontSize: body1.fontSize,
      fontWeight: body1.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "400"),
      lineHeight: body1.lineHeight,
      color: colors.text.primary,
      paddingVertical: spacing.sm,
    },
    label: {
      fontSize: caption.fontSize,
      fontWeight: "600",
      fontFamily: weightToFamily(theme, "600"),
      lineHeight: caption.lineHeight + 4,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    errorText: {
      fontSize: caption.fontSize,
      fontWeight: caption.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "400"),
      lineHeight: caption.lineHeight + 4,
      color: colors.status.error,
      marginTop: spacing.xs,
    },
  };
}

// ── Keadaan (empty / error / loading) ──────────────────────────────────────

export interface StateStyles {
  container: ViewStyle;
  title: TextStyle;
  message: TextStyle;
}

/**
 * Satu layout untuk ketiga keadaan: tengah, padding 24, gap 12, judul
 * 16/600, pesan 14/secondary. Ikon + aksi diserahkan ke komponen
 * (warna ikon per keadaan: tertiary untuk kosong, error untuk galat).
 */
export function buildStateStyles(theme: Theme): StateStyles {
  const { colors, spacing, typography } = theme;
  const body1 = typography.body1 ?? {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
  };
  const body2 = typography.body2 ?? {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  };
  return {
    container: {
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
      gap: spacing.s12 ?? 12,
    },
    title: {
      fontSize: body1.fontSize,
      fontWeight: "600",
      fontFamily: weightToFamily(theme, "600"),
      lineHeight: body1.lineHeight,
      color: colors.text.primary,
      textAlign: "center",
    },
    message: {
      fontSize: body2.fontSize,
      fontWeight: body2.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "400"),
      lineHeight: body2.lineHeight,
      color: colors.text.secondary,
      textAlign: "center",
    },
  };
}

// ── Toast ──────────────────────────────────────────────────────────────────

export type ToastType = "success" | "info" | "error";

export interface ToastStyles {
  container: ViewStyle;
  card: ViewStyle;
  message: TextStyle;
}

/**
 * Toast global: kartu elevated + radius lg + ikon berwarna per tipe
 * (diukur AA_LARGE 3.0 sebagai elemen grafis, jatuh ke teks tema bila
 * status tidak lolos). Posisi `top` TIDAK di sini — komponen yang
 * menentukan (di bawah AudioPropertyToast, top 40/60, supaya keduanya
 * tidak menumpuk bila muncul bersamaan).
 */
export function buildToastStyles(
  theme: Theme,
  type: ToastType,
): ToastStyles & { iconColor: string } {
  const { colors, radius, spacing } = theme;
  const body2 = theme.typography.body2 ?? {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  };
  const statusColor =
    type === "success"
      ? colors.status.success
      : type === "error"
        ? colors.status.error
        : colors.accent.primary;
  const iconColor =
    pickReadable(
      [statusColor, colors.text.primary],
      colors.background.elevated,
      AA_LARGE,
    ) ?? colors.text.primary;
  return {
    container: {
      position: "absolute",
      alignSelf: "center",
      zIndex: 9999,
      width: "85%",
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.s10 ?? 10,
      backgroundColor: colors.background.elevated,
      borderWidth: 1,
      borderColor: colors.border.light,
      borderRadius: radius.lg,
      padding: spacing.s12 ?? 12,
      ...theme.shadows.md,
    },
    message: {
      flex: 1,
      fontSize: body2.fontSize,
      fontWeight: body2.fontWeight as TextStyle["fontWeight"],
      fontFamily: weightToFamily(theme, "400"),
      lineHeight: body2.lineHeight,
      color: colors.text.primary,
    },
    iconColor,
  };
}

/** Rasio kontras — diekspor ulang supaya test komponen tidak mengimpor contrast langsung. */
export { contrastRatio, AA_NORMAL, AA_LARGE };
