// src/shared/components/ui/PristineButton.tsx
//
// SATU tombol untuk semua layar (Fase 2 redesign) — menggantikan
// TouchableOpacity + gaya tombol yang tersebar (Fase 0 T9: tinggi
// 40/44/48/50/52, radius 22/28, warna teks "#fff" yang ditebak).
//
// Varian: primary (amber accent.primary + onPrimary), secondary (garis
// aksen yang terbaca), text (tanpa latar). Destruktif = isi status.error.
// Gaya dihitung builder murni uiStyles.ts (diuji jest di semua tema);
// komponen ini hanya merender, lewat useThemedStyles (Fase 1).
import React, { useCallback, type ReactNode } from "react";
import {
  TouchableOpacity,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import {
  buildButtonStyles,
  type ButtonVariant,
} from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

export interface PristineButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: ReactNode;
  disabled?: boolean;
  /** Aksi destruktif (mis. "Hapus" di ConfirmDialog) — isi status.error. */
  destructive?: boolean;
  /** Tombol memanjang mengikuti lebar wadah. */
  fullWidth?: boolean;
  /**
   * Permukaan tempat tombol duduk (untuk mengukur keterbacaan varian
   * secondary/text). Default: background.primary (layar).
   */
  surface?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function PristineButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  destructive = false,
  fullWidth = false,
  surface,
  style,
  testID,
  accessibilityLabel,
}: PristineButtonProps) {
  const styles = useThemedStyles(
    useCallback(
      (theme: Theme) =>
        buildButtonStyles(theme, { variant, disabled, destructive, surface }),
      [variant, disabled, destructive, surface],
    ),
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.container, fullWidth && { alignSelf: "stretch" }, style]}
    >
      {icon}
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}
