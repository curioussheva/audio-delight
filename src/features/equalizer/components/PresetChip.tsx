import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";

interface PresetChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export const PresetChip: React.FC<PresetChipProps> = ({
  label,
  isActive,
  onPress,
  disabled,
}) => {
  const { theme } = useTheme();

  const handlePress = () => {
    if (!disabled) {
      console.log(`🎯 [PresetChip] Switched to: ${label}`);
      onPress();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={disabled}
      style={[
        styles.chip,
        {
          backgroundColor:
            theme.colors.background.elevated ||
            theme.colors.background.secondary,
          borderColor: theme.colors.border.light,
          borderWidth: 1,
          opacity: disabled ? 0.4 : 1, // Visual feedback saat Bit-Perfect aktif
        },
        isActive &&
          !disabled && {
            backgroundColor: theme.colors.primary[500],
            borderColor: theme.colors.primary[500],
            // Efek Glow Cyberpunk
            shadowColor: theme.colors.primary[500],
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
          { color: theme.colors.text.secondary },
          isActive &&
            !disabled && {
              color: theme.colors.background.primary, // Kontras tinggi saat aktif
              fontWeight: "900",
            },
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 12, // Dibuat sedikit lebih kotak (squircle) agar terlihat pro
    marginRight: 10,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 11,
    letterSpacing: 1.2, // Spasi antar huruf untuk gaya industrial
  },
});
