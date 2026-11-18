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
//
// Fase 2 redesign: layout dari builder murni buildStateStyles (token
// Fase 1) — satu rupa keadaan layar. Pesan kini body2 (14/400),
// sebelumnya 14/500: satu tingkat bobot, disatukan dengan EmptyState
// dan ErrorState.
import React, { useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { buildStateStyles } from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

export interface ScreenLoadingProps {
  message?: string;
  style?: StyleProp<ViewStyle>;
}

export function ScreenLoading({ message, style }: ScreenLoadingProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useThemedStyles(
    useCallback((t: Theme) => buildStateStyles(t), []),
  );

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}
