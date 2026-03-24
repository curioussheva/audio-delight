import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";

export const OutputSettings: React.FC = () => {
  // Dekstruksi isExclusiveMode agar bisa digunakan di Switch
  const { currentDAC, isExclusiveMode, toggleExclusiveMode } = useUSBDAC();

  if (!currentDAC) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.infoText}>
          Internal Audio Device (System Mixer)
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dacName}>{currentDAC.name}</Text>
        <Text style={styles.manufacturer}>
          {currentDAC.manufacturer || "Unknown Manufacturer"}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Bit-Perfect (Exclusive Mode)</Text>
          <Text style={styles.subLabel}>
            Bypass sistem audio Android untuk kualitas murni.
          </Text>
        </View>
        <Switch
          value={isExclusiveMode}
          // Membungkus toggleExclusiveMode agar tidak konflik dengan ekspektasi Return Type Switch
          onValueChange={() => {
            toggleExclusiveMode();
          }}
          trackColor={{ false: "#162539", true: "#00D4AA" }}
          thumbColor={isExclusiveMode ? "#FFF" : "#C8D4E0"}
        />
      </View>

      {isExclusiveMode && (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>MODE: BIT-PERFECT ACTIVE</Text>
          <Text style={styles.statusSubText}>
            DSP & Equalizer di-bypass untuk menjaga integritas data.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#162539", borderRadius: 12 },
  emptyContainer: { padding: 16, alignItems: "center" },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3C52",
    paddingBottom: 8,
  },
  dacName: { color: "#00D4AA", fontSize: 16, fontWeight: "bold" },
  manufacturer: { color: "#C8D4E0", fontSize: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { color: "#FFF", fontSize: 14, fontWeight: "600" },
  subLabel: { color: "#6B7E93", fontSize: 11, marginTop: 2 },
  statusBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "rgba(0, 212, 170, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#00D4AA",
  },
  statusText: {
    color: "#00D4AA",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  statusSubText: {
    color: "#00D4AA",
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    opacity: 0.8,
  },
  infoText: { color: "#6B7E93", fontSize: 14 },
});
