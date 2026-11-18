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
//
// Fase 2 redesign: gaya dari builder murni buildStateStyles (token
// Fase 1) dan aksi memakai PristineButton — satu rupa keadaan kosong
// di semua layar. API tidak berubah, jadi pemakai lama tidak disentuh.
import React, { useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { buildStateStyles } from "@/shared/utils/uiStyles";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import type { Theme } from "@/shared/constants/themes/types";

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
  const styles = useThemedStyles(
    useCallback((t: Theme) => buildStateStyles(t), []),
  );

  return (
    <View style={[styles.container, style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onActionPress ? (
        <PristineButton
          label={actionLabel}
          onPress={onActionPress}
          variant="primary"
          accessibilityLabel={actionLabel}
        />
      ) : null}
    </View>
  );
};
