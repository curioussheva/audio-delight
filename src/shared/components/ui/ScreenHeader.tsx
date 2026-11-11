// src/shared/components/ui/ScreenHeader.tsx
//
// U-P2-53: SATU komponen header layar.
//
// Dulu ada 5 variasi header untuk 8 screen: Library (hamburger + judul
// + stats), Equalizer/Analyzer/Visualizer (judul teks saja), Playlist
// (tanpa judul), Settings (teks "Settings"), About (logo + nama + versi).
// Komponen ini menyatukan polanya: hamburger buka drawer di kiri
// (DrawerMenuButton, U-P2-49), blok judul + subjudul di tengah, dan slot
// `actions` di kanan untuk tombol khas layar itu (mis. reset DSP).
//
// Pengecualian yang sengaja TIDAK memakai komponen ini (dicatat, bukan
// lupa):
// - Library: headernya stateful (mode pencarian menukar seluruh isi
//   header) + menampilkan stats library — tetap header sendiri.
// - About: header branding (logo + nama + versi + banner) — tetap
//   bespoke; hamburgernya baris tersendiri di atasnya (U-P2-49).
// - Detail playlist / detail lagu: header detail (tombol kembali + nama
//   item + aksi hapus), bukan header layar.
import React, { type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { DrawerMenuButton } from "@/shared/components/ui/DrawerMenuButton";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Tombol khas layar itu, di kanan judul (mis. reset). */
  actions?: ReactNode;
  /** Tampilkan hamburger buka drawer. Default true (screen di drawer). */
  showMenu?: boolean;
  /** "large" = judul 32 (Settings); default 20. */
  variant?: "default" | "large";
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  actions,
  showMenu = true,
  variant = "default",
  style,
}: ScreenHeaderProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View style={[styles.header, style]}>
      {showMenu && <DrawerMenuButton />}
      <View style={styles.titleBlock}>
        <Text
          style={[
            styles.title,
            variant === "large" && styles.titleLarge,
            { color: colors.text.primary },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  titleLarge: {
    fontSize: 32,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
});
