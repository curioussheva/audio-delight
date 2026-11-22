// src/shared/components/ui/ConfirmDialog.tsx
//
// SATU-SATUNYA mekanisme konfirmasi (Fase 2 redesign) untuk aksi
// destruktif — menggantikan Alert.alert di titik pemakaian yang
// dimigrasi. Alert.alert yang lain TIDAK diganti massal (itu migrasi
// per layar di Fase 3); tidak ada jalur Alert.alert BARU.
//
// Keputusan: batal = tombol teks (tenang), konfirmasi = tombol primer;
// destruktif (default) memakai isi status.error. Judul h4, pesan
// body2, overlay dari token.
import React, { memo, useCallback } from "react";
import { Modal, View, Text } from "react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { useTheme } from "@/shared/context/ThemeContext";
import { buildDialogStyles } from "@/shared/utils/uiStyles";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import type { Theme } from "@/shared/constants/themes/types";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Default true — dialog ini untuk aksi destruktif. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Per-node render (2026-11-22): memo — onConfirm/onCancel pemanggil stabil.
export const ConfirmDialog = memo(function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Ya",
  cancelLabel = "Batal",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useTheme();
  const surface = theme.colors.background.elevated;
  const styles = useThemedStyles(
    useCallback((t: Theme) => buildDialogStyles(t), []),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <PristineButton
              label={cancelLabel}
              onPress={onCancel}
              variant="text"
              surface={surface}
              accessibilityLabel={cancelLabel}
            />
            <PristineButton
              label={confirmLabel}
              onPress={onConfirm}
              variant="primary"
              destructive={destructive}
              surface={surface}
              accessibilityLabel={confirmLabel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
})
