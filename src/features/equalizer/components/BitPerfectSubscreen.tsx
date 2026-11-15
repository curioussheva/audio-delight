import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";

// TEMPORARY — diganti langkah Bit-Perfect di ronde ini sebelum push.
export function BitPerfectSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <View style={[styles.wrap, { marginHorizontal: spacing.md }]}>
      <Text style={[styles.note, { color: colors.text.secondary }]}>
        Subscreen Bit-Perfect — diisi di langkah berikut ronde ini.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
  },
});
