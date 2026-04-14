import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "@/shared/context/ThemeContext";

interface Props {
  visible: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

export const SavePresetModal: React.FC<Props> = ({
  visible,
  onSave,
  onClose,
}) => {
  const { theme } = useTheme();
  const [name, setName] = useState("");

  const handleSave = () => {
    if (name.trim()) {
      console.log(`💾 [PresetModal] Saving new preset: "${name}"`);
      onSave(name);
      setName(""); // Reset input
    }
  };

  const handleClose = () => {
    console.log(`❌ [PresetModal] Cancelled by user`);
    setName("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            {
              backgroundColor: theme.colors.background.secondary,
              borderColor: theme.colors.border.light,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Simpan Preset
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.background.tertiary,
                color: theme.colors.text.primary,
                borderColor: theme.colors.border.light,
              },
            ]}
            placeholder="Nama Preset (misal: Rock Mantap)..."
            placeholderTextColor={theme.colors.text.tertiary}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <View style={styles.actions}>
            {/* Tombol Batal */}
            <TouchableOpacity onPress={handleClose} style={styles.btn}>
              <Text
                style={[styles.btnText, { color: theme.colors.text.secondary }]}
              >
                Batal
              </Text>
            </TouchableOpacity>

            {/* Tombol Simpan */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={!name.trim()}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: name.trim()
                    ? theme.colors.primary[500]
                    : theme.colors.text.disabled,
                },
              ]}
            >
              <Text
                style={[
                  styles.saveBtnText,
                  { color: theme.colors.background.primary },
                ]}
              >
                Simpan
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
    backgroundColor: "rgba(0,0,0,0.85)", // Overlay lebih gelap untuk fokus
    justifyContent: "center",
    padding: 30,
  },
  content: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  input: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
    fontSize: 15,
    borderWidth: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 8,
  },
  btnText: {
    fontWeight: "600",
    fontSize: 15,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  saveBtnText: {
    fontWeight: "800",
    fontSize: 15,
  },
});
