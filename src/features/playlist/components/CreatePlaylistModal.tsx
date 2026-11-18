// src/features/playlist/components/CreatePlaylistModal.tsx
//
// Dialog input nama playlist lintas-platform.
//
// B2 (ronde 8): "Buat Playlist Baru" MATI TOTAL di Android — pemanggil
// dulu memakai `Alert.prompt`, yang iOS-only (`@platform ios` di
// react-native Alert.js); di Android no-op tanpa warning. Modal ini
// jalan di Android + iOS dengan komponen RN biasa (Modal + TextInput).
//
// Fase 2 redesign: kartu = SectionCard (radius lg seperti
// ConfirmDialog), input = PristineTextInput, tombol = PristineButton
// (batal = teks, buat = primer). Judul + aksi mengikuti gaya dialog
// yang sama dengan ConfirmDialog.
import React, { useCallback, useEffect, useState } from "react";
import { Modal, View, Text } from "react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { buildDialogStyles } from "@/shared/utils/uiStyles";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { PristineTextInput } from "@/shared/components/ui/PristineTextInput";
import type { Theme } from "@/shared/constants/themes/types";

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { theme } = useTheme();
  const dialogStyles = useThemedStyles(
    useCallback((t: Theme) => buildDialogStyles(t), []),
  );

  const [name, setName] = useState("");

  // Reset input setiap kali dialog dibuka — nama dari pemakaian
  // sebelumnya tidak boleh terbawa.
  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={dialogStyles.overlay}>
        <SectionCard
          style={{
            borderRadius: theme.radius.lg,
            gap: theme.spacing.md,
          }}
        >
          <Text style={dialogStyles.title}>Buat Playlist Baru</Text>

          <PristineTextInput
            placeholder="Masukkan nama playlist"
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            autoFocus
            autoCapitalize="sentences"
            maxLength={100}
            accessibilityLabel="Nama playlist baru"
          />

          <View style={dialogStyles.actions}>
            <PristineButton
              label="Batal"
              variant="text"
              onPress={onClose}
              surface={theme.colors.background.elevated}
            />
            <PristineButton
              label="Buat"
              onPress={handleSubmit}
              disabled={!canSubmit}
            />
          </View>
        </SectionCard>
      </View>
    </Modal>
  );
};
