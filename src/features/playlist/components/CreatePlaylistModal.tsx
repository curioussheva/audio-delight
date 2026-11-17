// src/features/playlist/components/CreatePlaylistModal.tsx
//
// Dialog input nama playlist lintas-platform.
//
// B2 (ronde 8): "Buat Playlist Baru" MATI TOTAL di Android — pemanggil
// dulu memakai `Alert.prompt`, yang iOS-only (`@platform ios` di
// react-native Alert.js); di Android no-op tanpa warning. Modal ini
// jalan di Android + iOS dengan komponen RN biasa (Modal + TextInput).
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

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
  const { colors } = theme;

  const [name, setName] = useState("");

  // Reset input setiap kali dialog dibuka — nama dari pemakaian
  // sebelumnya tidak boleh terbawa.
  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  // Teks di atas tombol primary[500] — dipilih dari luminansi primary
  // (pola yang sama dengan PlaylistList), bukan hardcoded "#fff".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

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
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background.primary },
          ]}
        >
          <Text style={[styles.title, { color: colors.text.primary }]}>
            Buat Playlist Baru
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                color: colors.text.primary,
                backgroundColor: colors.background.secondary,
                borderColor: colors.background.tertiary,
              },
            ]}
            placeholder="Masukkan nama playlist"
            placeholderTextColor={colors.text.disabled}
            value={name}
            onChangeText={setName}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            autoFocus
            autoCapitalize="sentences"
            maxLength={100}
            accessibilityLabel="Nama playlist baru"
          />

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: colors.background.tertiary },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Batal"
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: colors.text.secondary },
                ]}
              >
                Batal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.button,
                styles.submitButton,
                {
                  backgroundColor: colors.primary[500],
                  opacity: canSubmit ? 1 : 0.5,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Buat playlist"
            >
              <Text style={[styles.buttonText, { color: onPrimary }]}>
                Buat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  button: {
    minWidth: 88,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 22,
    paddingHorizontal: 20,
  },
  cancelButton: {
    borderWidth: 1,
  },
  submitButton: {},
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
