// src/shared/components/ui/EmptyState.tsx
//
// U-P2-53: SATU komponen empty state — dihidupkan kembali dari komponen
// mati yang sama namanya.
//
// Versi lama (mati, 0 pemakai) tanpa props dan teks hardcoded "Tidak ada
// lagu terpilih" — berbohong di semua konteks kecuali itu. Versi ini
// MEWAJIBKAN `title` sebagai prop, jadi tiap layar menulis pesannya
// sendiri; `message`, `icon`, dan aksi opsional. Warna dari tema
// (dulu `#888` hardcoded).
//
// Pemakai: Visualizer (tidak ada lagu), Playlist detail (playlist
// kosong), Library (pencarian tanpa hasil), Search (tanpa hasil).
// Yang sengaja TIDAK dimigrasikan: EmptyLibrary (punya aksi scan +
// progress — komponen khusus, bukan sekadar pesan), placeholder kartu
// Analyzer ("Putar lagu untuk melihat spektrum" — teks di dalam kartu,
// bukan empty state layar), dan state error (punya tombol retry sendiri).
import React, { type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

export interface EmptyStateProps {
  /** Judul — wajib, ditulis per layar supaya tidak berbohong. */
  title: string;
  message?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = ({
  title,
  message,
  icon,
  actionLabel,
  onActionPress,
  style,
}: EmptyStateProps) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  return (
    <View style={[styles.container, style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[styles.message, { color: colors.text.secondary }]}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onActionPress ? (
        <TouchableOpacity
          style={[styles.action, { backgroundColor: colors.primary[500] }]}
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionText, { color: onPrimary }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  icon: {
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
  },
  action: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  actionText: {
    fontWeight: "600",
  },
});
