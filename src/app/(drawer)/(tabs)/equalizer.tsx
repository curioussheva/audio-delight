import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ScrollView,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Save,
  ShieldAlert,
  Zap,
  RotateCcw,
  Eye,
  EyeOff,
  Settings2,
  Layers,
  ChevronRight,
} from "lucide-react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useTheme } from "@/context/ThemeContext";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { HorizontalSlider } from "@/features/equalizer/components/HorizontalSlider";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { LIST_BOTTOM_PADDING } from "@/app/(drawer)/(tabs)/_layout";

if (
  require("react-native").Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");
const REVERB_LABELS = [
  "None",
  "Small Room",
  "Medium Room",
  "Large Room",
  "Medium Hall",
  "Large Hall",
  "Plate",
];

// ─── MINI COMPONENTS ─────────────────────────────────────────────────────

const MiniSwitch = ({ value, onValueChange, disabled, color, label }: any) => (
  <View style={styles.miniSwitchContainer}>
    <Text
      style={[
        styles.miniSwitchLabel,
        { color: value && !disabled ? color : "#666" },
      ]}
    >
      {label}
    </Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: "#222", true: color + "44" }}
      thumbColor={value && !disabled ? color : "#444"}
      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
    />
  </View>
);

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const eq = useEqualizer();
  const [isModalVisible, setModalVisible] = useState(false);

  const [visibleSections, setVisibleSections] = useState({
    graph: true,
    effects: true,
    mixer: true,
  });

  const toggleSection = (section: keyof typeof visibleSections) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVisibleSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleReset = () => {
    Alert.alert("Reset DSP", "Kembalikan ke pengaturan netral?", [
      { text: "Batal" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => eq.resetToDefault(),
      },
    ]);
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.primary },
      ]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* UI TOGGLES */}
        <View style={styles.viewControls}>
          <TouchableOpacity
            onPress={() => toggleSection("graph")}
            style={styles.viewBtn}
          >
            {visibleSections.graph ? (
              <Eye size={12} color={theme.colors.primary[500]} />
            ) : (
              <EyeOff size={12} color="#444" />
            )}
            <Text
              style={[
                styles.viewBtnText,
                { color: visibleSections.graph ? "#FFF" : "#444" },
              ]}
            >
              GRAPH
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleSection("effects")}
            style={styles.viewBtn}
          >
            {visibleSections.effects ? (
              <Zap size={12} color="#00E5FF" />
            ) : (
              <EyeOff size={12} color="#444" />
            )}
            <Text
              style={[
                styles.viewBtnText,
                { color: visibleSections.effects ? "#FFF" : "#444" },
              ]}
            >
              EFFECTS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleSection("mixer")}
            style={styles.viewBtn}
          >
            {visibleSections.mixer ? (
              <Settings2 size={12} color="#AA00FF" />
            ) : (
              <EyeOff size={12} color="#444" />
            )}
            <Text
              style={[
                styles.viewBtnText,
                { color: visibleSections.mixer ? "#FFF" : "#444" },
              ]}
            >
              MIXER
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: LIST_BOTTOM_PADDING }}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text
                style={[styles.title, { color: theme.colors.text.primary }]}
              >
                Precision DSP
              </Text>
              <Text style={styles.subtitle}>
                ENGINE: {eq.isEQEnabled ? "ACTIVE" : "BYPASS"}
              </Text>
            </View>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
              <RotateCcw size={18} color="#666" />
            </TouchableOpacity>
          </View>

          {/* 1. GRAPH SECTION */}
          {visibleSections.graph && (
            <View style={styles.graphCard}>
              <FrequencyGraph
                bands={eq.currentBands}
                width={width - 40}
                height={140}
              />
            </View>
          )}

          {/* 2. EFFECTS SECTION (SLIDERS & REVERB) */}
          {visibleSections.effects && (
            <View style={styles.effectsSection}>
              {/* BASS SLIDER */}
              <View style={styles.effectItem}>
                <MiniSwitch
                  label="BASS BOOST"
                  value={eq.isBassEnabled}
                  onValueChange={eq.setBassEnabled}
                  color="#FF3D00"
                />
                <HorizontalSlider
                  label="INTENSITY"
                  value={eq.bassStrength}
                  onChange={eq.setBassBoost}
                  color="#FF3D00"
                  disabled={!eq.isBassEnabled}
                />
              </View>

              {/* VIRTUALIZER SLIDER */}
              <View style={styles.effectItem}>
                <MiniSwitch
                  label="STAGE VIRTUALIZER"
                  value={eq.isVirtualizerEnabled}
                  onValueChange={eq.setVirtualizerEnabled}
                  color="#00E5FF"
                />
                <HorizontalSlider
                  label="WIDTH"
                  value={eq.virtualizerLevel}
                  onChange={eq.setVirtualizer}
                  color="#00E5FF"
                  disabled={!eq.isVirtualizerEnabled}
                />
              </View>

              {/* REVERB PRESET SELECTOR (MODERN BOX STYLE) */}
              <View style={styles.effectItem}>
                <MiniSwitch
                  label="ENVIRONMENT REVERB"
                  value={eq.isReverbEnabled}
                  onValueChange={eq.setReverbEnabled}
                  color="#AA00FF"
                />
                <TouchableOpacity
                  style={[
                    styles.reverbBox,
                    !eq.isReverbEnabled && { opacity: 0.3 },
                  ]}
                  disabled={!eq.isReverbEnabled}
                  onPress={() => {
                    const next = (eq.reverbPreset + 1) % REVERB_LABELS.length;
                    eq.setReverb(next);
                  }}
                >
                  <Text style={styles.reverbLabel}>ENVIRONMENT</Text>
                  <View style={styles.reverbValueRow}>
                    <Text style={[styles.reverbValue, { color: "#AA00FF" }]}>
                      {REVERB_LABELS[eq.reverbPreset]}
                    </Text>
                    <ChevronRight size={16} color="#AA00FF" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 3. PRESETS */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SOUND PROFILES</Text>
            <TouchableOpacity onPress={() => setModalVisible(true)}>
              <Save size={18} color={theme.colors.primary[500]} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetScroll}
          >
            {eq.allPresets.map((p) => (
              <PresetChip
                key={p.id}
                label={p.name}
                isActive={eq.activePresetId === p.id}
                onPress={() => eq.applyPreset(p.id)}
              />
            ))}
          </ScrollView>

          {/* 4. MIXER SECTION */}
          {visibleSections.mixer && (
            <View style={styles.mixerBoard}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={eq.currentBands}
                keyExtractor={(item) => item.frequency.toString()}
                renderItem={({ item, index }) => (
                  <EqualizerBand
                    frequency={item.frequency}
                    gain={item.gain}
                    onValueChange={(v) => eq.updateBandGain(index, v)}
                    color={theme.colors.primary[500]}
                    disabled={!eq.isEQEnabled}
                  />
                )}
                contentContainerStyle={{ paddingHorizontal: 10 }}
                // Penting: agar tidak bentrok dengan scroll utama
                directionalLockEnabled={true}
                onScrollEndDrag={() => {
                  /* optional logic */
                }}
              />
            </View>
          )}
        </ScrollView>
      </GestureHandlerRootView>
      <SavePresetModal
        visible={isModalVisible}
        onSave={(n) => {
          eq.savePreset(n);
          setModalVisible(false);
        }}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  viewControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    backgroundColor: "#050505",
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#111",
  },
  viewBtnText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: {
    fontSize: 8,
    color: "#666",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  resetBtn: { padding: 8 },
  graphCard: {
    height: 160,
    backgroundColor: "#0A0A0A",
    marginHorizontal: 15,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  effectsSection: {
    paddingHorizontal: 15,
    gap: 15,
    marginBottom: 25,
  },
  effectItem: {
    backgroundColor: "#0A0A0A",
    paddingVertical: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#111",
  },
  miniSwitchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 5,
  },
  miniSwitchLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },

  // Reverb Specific Style
  reverbBox: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 15,
    backgroundColor: "#050505",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reverbLabel: { color: "#444", fontSize: 9, fontWeight: "bold" },
  reverbValueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  reverbValue: { fontSize: 13, fontWeight: "900" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#666",
    letterSpacing: 1.5,
  },
  presetScroll: { paddingLeft: 20, marginBottom: 30 },
  mixerBoard: {
    backgroundColor: "#0A0A0A",
    marginHorizontal: 15,
    borderRadius: 24,
    paddingVertical: 20,
    marginBottom: 40,
  },
});
