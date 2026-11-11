// src/shared/components/ui/ScreenLoading.tsx
//
// U-P2-53: SATU pola loading layar — ActivityIndicator + pesan, warna tema.
//
// Dulu tiap screen menulis loading sendiri: Library ("Loading
// library..."), Analyzer ("Menunggu audio session..." / "Mempersiapkan
// visualizer..."), Visualizer tanpa loading state sama sekali. Komponen
// ini dipakai untuk loading layar penuh dan di dalam ListEmptyComponent.
//
// Sengaja TANPA `flex: 1` — pemanggil yang menaruhnya di wadah flex:1
// (mis. `s.center` di Library) yang memberi ukuran layar; di dalam
// ListEmptyComponent ia cukup sebesar kontennya.
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";

export interface ScreenLoadingProps {
  message?: string;
  style?: StyleProp<ViewStyle>;
}

export function ScreenLoading({ message, style }: ScreenLoadingProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
      {message ? (
        <Text style={[styles.message, { color: colors.text.secondary }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
