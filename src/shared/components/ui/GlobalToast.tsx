// src/shared/components/ui/GlobalToast.tsx
//
// Toast global (Fase 2 redesign) — dibaca dari toastStore, tampil
// 3500 ms lalu hilang sendiri (sama dengan AudioPropertyToast).
// Berdampingan dengan AudioPropertyToast (khusus info audio) —
// keduanya tidak digabung paksa (rencana Fase 4). Posisi di bawah
// toast audio (top 40/60) supaya keduanya tidak menumpuk bila muncul
// bersamaan. Pengaktifan penuh di Fase 4; pemakaian pertama di
// migrasi Playlist (import M3U).
import React, { useCallback, useEffect } from "react";
import { Platform, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { AlertCircle, CheckCircle2, Info } from "lucide-react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { useToastStore } from "@/shared/store/toastStore";
import { buildToastStyles } from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

const TOAST_DURATION_MS = 3500;

// AudioPropertyToast di top 40 (Android) / 60 (iOS) setinggi ±65 —
// toast global duduk di bawahnya dengan jeda.
const TOAST_TOP = Platform.OS === "ios" ? 132 : 112;

const ICONS = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
} as const;

export function GlobalToast() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismissToast);
  const styles = useThemedStyles(
    useCallback(
      (theme: Theme) => buildToastStyles(theme, toast?.type ?? "info"),
      [toast?.type],
    ),
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  const Icon = ICONS[toast.type];

  return (
    <Animated.View
      entering={FadeInUp.springify()}
      exiting={FadeOutUp}
      style={[styles.container, { top: TOAST_TOP }]}
    >
      <View style={styles.card}>
        <Icon size={18} color={styles.iconColor} />
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}
