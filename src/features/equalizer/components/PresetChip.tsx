import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

interface PresetChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}

export const PresetChip: React.FC<PresetChipProps> = ({
  label,
  isActive,
  onPress,
  onLongPress,
  disabled,
}) => {
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
        [
          colors.text.inverse,
          colors.background.primary,
          colors.text.primary,
        ],
        accent,
        AA_NORMAL,
      ) ?? colors.background.primary)
    : colors.text.primary;

  const handlePress = () => {
    if (!disabled) onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
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
          isActive && !disabled && { fontWeight: "900" },
        ]}
        numberOfLines={1}
      >
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 10,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
