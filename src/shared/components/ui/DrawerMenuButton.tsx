// src/shared/components/ui/DrawerMenuButton.tsx
//
// U-P2-49: SATU tombol buka drawer untuk semua screen di dalam drawer.
//
// Dulu hanya Library yang punya affordance ini (`library.tsx` —
// `navigation.dispatch(DrawerActions.openDrawer())` dengan ikon Menu 26);
// Equalizer/Analyzer/Visualizer/Playlist/About/Settings tidak punya
// hamburger maupun tombol back, jadi user hanya bisa mengandalkan
// edge-swipe (tanpa petunjuk) atau hardware back. Tombol ini menyamakan
// polanya: ikon Menu 26, warna teks utama, posisi paling kiri header.
//
// Target sentuh: ikon 26 + hitSlop 12 + min 44x44 -> efektif ~50dp,
// di atas rekomendasi 48dp (U-P2-01 mencatat tombol ikon shell lama
// hanya ~40-42dp dengan hitSlop 8). Library ikut memakai komponen ini
// supaya tidak ada dua pola tombol drawer.
import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "expo-router";
import { DrawerActions } from "@react-navigation/native";
import { Menu } from "lucide-react-native";
import { useTheme } from "@/shared/context/ThemeContext";

export function DrawerMenuButton() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      hitSlop={12}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Buka menu drawer"
    >
      <Menu size={26} color={colors.text.primary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
});
