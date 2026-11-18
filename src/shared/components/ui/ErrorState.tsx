// src/shared/components/ui/ErrorState.tsx
//
// Keadaan galat yang bisa dipakai ulang (Fase 2 redesign) — pasangan
// EmptyState untuk kegagalan muat: ikon + judul + pesan + aksi coba
// lagi. Menggantikan cabang error yang ditulis per layar (Search
// menulisnya inline; komentarnya mencatat "sengaja tidak
// dimigrasikan" menunggu komponen ini). Ikon selalu AlertCircle
// status.error — satu rupa galat di semua layar.
import React, { useCallback } from "react";
import {
  View,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AlertCircle } from "lucide-react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { useTheme } from "@/shared/context/ThemeContext";
import { buildStateStyles } from "@/shared/utils/uiStyles";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import type { Theme } from "@/shared/constants/themes/types";

export interface ErrorStateProps {
  /** Judul — wajib, ditulis per layar supaya tidak berbohong. */
  title: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({
  title,
  message,
  actionLabel,
  onActionPress,
  style,
}: ErrorStateProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(
    useCallback((t: Theme) => buildStateStyles(t), []),
  );

  return (
    <View style={[styles.container, style]}>
      <AlertCircle size={48} color={theme.colors.status.error} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onActionPress ? (
        <PristineButton
          label={actionLabel}
          onPress={onActionPress}
          variant="secondary"
          accessibilityLabel={actionLabel}
        />
      ) : null}
    </View>
  );
}
