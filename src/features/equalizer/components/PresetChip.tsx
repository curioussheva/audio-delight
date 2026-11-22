import React, { memo } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

interface PresetChipProps {
  /** Id preset — diteruskan ke callback supaya pemanggil bisa memakai SATU
      callback stabil untuk semua chip (bukan closure inline per chip). */
  presetId: string;
  /** Nama preset — diteruskan ke callback (toast + label). */
  presetName: string;
  label: string;
  isActive: boolean;
  onPress: (id: string, name: string) => void;
  onLongPress?: (id: string, name: string, isCustom?: boolean) => void;
  isCustom?: boolean;
  accessibilityHint?: string;
  disabled?: boolean;
}

// Opsi 2 (log #16): memo + callback berbasis id. Sebelumnya chip BUKAN
// memo DAN menerima closure inline per chip — tiap render ulang layar
// (tiap tick drag) me-render ulang SEMUA chip. Sekarang chip hanya render
// ulang bila props-nya sendiri berubah (isActive / disabled / label).
export const PresetChip = memo(
  ({
    presetId,
    presetName,
    label,
    isActive,
    onPress,
    onLongPress,
    isCustom,
    accessibilityHint,
    disabled,
  }: PresetChipProps) => {
    const { theme } = useTheme();
    const colors = theme.colors;

    const accent = colors.primary[500];

    // Chip nonaktif dulu memakai `text.secondary` di atas
    // `background.elevated`. Terukur di beberapa tema: rasio 4.34-4.40, di
    // bawah 4.5 untuk teks normal. `text.primary` selalu lulus.
    //
    // Chip AKTIF dulu memakai `background.primary` sebagai warna teks di atas
    // `primary[500]`. Itu hanya benar bila `primary[500]` benar-benar gelap.
    // Dengan bantuan pengukuran, warnanya dipilih agar selalu terbaca.
    const surface = isActive
      ? accent
      : (colors.background.elevated ?? colors.background.secondary);

    const textColor = isActive
      ? (pickReadable(
          [colors.text.inverse, colors.background.primary, colors.text.primary],
          accent,
          AA_NORMAL,
        ) ?? colors.background.primary)
      : colors.text.primary;

    const handlePress = () => {
      if (!disabled) onPress(presetId, presetName);
    };

    const handleLongPress = () => {
      if (onLongPress) onLongPress(presetId, presetName, isCustom);
    };

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected: isActive, disabled: !!disabled }}
        style={[
          styles.chip,
          {
            backgroundColor: surface,
            borderColor: isActive ? accent : colors.border.medium,
            borderWidth: 1,
            opacity: disabled ? 0.4 : 1,
          },
          isActive &&
            !disabled && {
              shadowColor: accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 10,
              elevation: 8,
            },
        ]}
      >
        <Text
          style={[
            styles.text,
            { color: textColor },
            isActive && !disabled && { fontFamily: FONT_FAMILY.bold },
          ]}
          numberOfLines={1}
        >
          {label.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: BASE_RADIUS.md,
    marginRight: 10,
    // U-P2-01: minHeight 40 lama, di bawah 44dp.
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.semiBold,
    letterSpacing: 1.2,
  },
});
