// src/features/dsp/components/ReverbDropdown.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
} from "react-native";
import { BlurView } from "expo-blur"; // Jika kamu pakai expo, jika tidak ganti dengan View biasa + backgroundColor transparan
import { useTheme } from "@/context/ThemeContext";

// Definisi preset standar Android PresetReverb
export const REVERB_PRESETS = [
  { id: 0, label: "Off" },
  { id: 1, label: "Small Room" },
  { id: 2, label: "Medium Room" },
  { id: 3, label: "Large Room" },
  { id: 4, label: "Medium Hall" },
  { id: 5, label: "Large Hall" },
  { id: 6, label: "Plate" },
];

interface ReverbProps {
  label?: string;
  value: number; // ID preset (0 - 6)
  onChange: (presetId: number) => void;
  color: string;
  disabled?: boolean;
}

export const ReverbDropdown: React.FC<ReverbProps> = ({
  label = "REVERB",
  value,
  onChange,
  color,
  disabled,
}) => {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const currentPreset = REVERB_PRESETS.find((p) => p.id === value) || REVERB_PRESETS[0];

  const handleSelect = (presetId: number) => {
    onChange(presetId);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: disabled ? "#444" : "#888" }]}>
        {label}
      </Text>

      <Pressable
        style={[
          styles.selectorBox,
          {
            borderColor: disabled ? "rgba(68, 68, 68, 0.3)" : hexToRGBA(color, 0.3),
            backgroundColor: disabled ? "#0A0A0A" : "#111",
            opacity: disabled ? 0.6 : 1,
          },
        ]}
        disabled={disabled}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.valueText, { color: disabled ? "#666" : color }]}>
          {currentPreset.label}
        </Text>
      </Pressable>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <BlurView intensity={30} tint="dark" style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setModalVisible(false)}
          />
          <View style={[styles.dropdownContainer, { backgroundColor: theme.colors.background.primary }]}>
            <Text style={styles.modalTitle}>Select Reverb Preset</Text>
            
            <FlatList
              data={REVERB_PRESETS}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const isSelected = item.id === value;
                return (
                  <Pressable
                    style={[
                      styles.presetItem,
                      isSelected && { backgroundColor: hexToRGBA(color, 0.15) },
                    ]}
                    onPress={() => handleSelect(item.id)}
                  >
                    <Text
                      style={[
                        styles.presetLabel,
                        { color: isSelected ? color : theme.colors.text.secondary },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <View style={[styles.activeDot, { backgroundColor: color }]} />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        </BlurView>
      </Modal>
    </View>
  );
};

// Helper (kamu sudah memilikinya di file sebelumnya, saya taruh sini untuk kemudahan copy-paste)
const hexToRGBA = (hex: string, opacity: number): string => {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginHorizontal: 8,
    width: 100, // Sedikit lebih lebar dari knob agar text muat
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  selectorBox: {
    width: "100%",
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  valueText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dropdownContainer: {
    width: 250,
    maxHeight: 400,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  presetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  presetLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
