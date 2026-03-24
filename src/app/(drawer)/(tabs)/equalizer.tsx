import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Hooks & Store
import { useTheme } from "@/context/ThemeContext";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";

// UI Components (Asumsi Anda memisahkan file atau menaruhnya di folder components)
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const {
    currentBands,
    activePresetId,
    allPresets,
    updateBandGain,
    applyPreset,
    savePreset,
    isDSPDisabled,
  } = useEqualizer();

  const [modalVisible, setModalVisible] = useState(false);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.primary },
      ]}
    >
      {/* 1. Header & Status */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Equalizer
          </Text>
          <Text
            style={[styles.subtitle, { color: theme.colors.text.secondary }]}
          >
            10-Band Precision Engine
          </Text>
        </View>
        {isDSPDisabled && (
          <View style={styles.bitPerfectBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#D4AF37" />
            <Text style={styles.bitPerfectText}>Bit-Perfect Active</Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 2. Visualisasi Kurva (Skia) */}
        <View style={styles.graphContainer}>
          <FrequencyGraph bands={currentBands} />
        </View>

        {/* 3. Preset Selector (Horizontal) */}
        <View style={styles.presetSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
          >
            {/* Tombol Simpan Custom */}
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              style={[
                styles.saveAction,
                { borderColor: theme.colors.primary[500] },
              ]}
            >
              <Ionicons
                name="add"
                size={20}
                color={theme.colors.primary[500]}
              />
            </TouchableOpacity>

            {allPresets.map((preset) => (
              <PresetChip
                key={preset.id}
                label={preset.name}
                isActive={activePresetId === preset.id}
                onPress={() => applyPreset(preset.id)}
                disabled={isDSPDisabled}
              />
            ))}
          </ScrollView>
        </View>

        {/* 4. Sliders (10-Band) */}
        <View
          style={[
            styles.slidersCard,
            { backgroundColor: theme.colors.background.secondary },
          ]}
        >
          {isDSPDisabled ? (
            <View style={styles.disabledOverlay}>
              <Ionicons
                name="lock-closed"
                size={40}
                color={theme.colors.text.tertiary}
              />
              <Text
                style={[
                  styles.disabledText,
                  { color: theme.colors.text.secondary },
                ]}
              >
                DSP dinonaktifkan untuk menjaga kualitas Bit-Perfect
              </Text>
            </View>
          ) : (
            currentBands.map((band, index) => (
              <EqualizerBand
                key={band.id}
                frequency={band.frequency}
                gain={band.gain}
                onValueChange={(val: number) => updateBandGain(index, val)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* 5. Modal Simpan */}
      <SavePresetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={(name) => {
          savePreset(name);
          setModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  scrollContent: { paddingBottom: 40 },
  graphContainer: {
    alignItems: "center",
    marginVertical: 20,
    paddingHorizontal: 10,
  },
  presetSection: { marginBottom: 25 },
  chipScroll: { paddingLeft: 20, paddingRight: 10, alignItems: "center" },
  saveAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  slidersCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    minHeight: 400,
  },
  bitPerfectBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(212, 175, 55, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.3)",
  },
  bitPerfectText: {
    color: "#D4AF37",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 5,
  },
  disabledOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  disabledText: {
    textAlign: "center",
    marginTop: 15,
    lineHeight: 20,
    fontSize: 14,
  },
});
