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
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { ControlKnob } from "@/features/equalizer/components/ControlKnob";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Save, ShieldAlert, Zap, RotateCcw } from "lucide-react-native";
import {
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import { LIST_BOTTOM_PADDING } from "@/app/(drawer)/(tabs)/_layout";

const { width } = Dimensions.get("window");

const REVERB_LABELS = ["None", "Small", "Medium", "Large", "Room", "Studio", "Plate"];

// Komponen kecil untuk switch individual
const MiniSwitch = ({ value, onValueChange, disabled, color, label }: any) => (
  <View style={styles.miniSwitchContainer}>
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: "#333", true: color + "88" }}
      thumbColor={value && !disabled ? color : "#999"}
      style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
    />
    <Text style={[styles.miniSwitchLabel, { color: value && !disabled ? color : "#666" }]}>
      {label}
    </Text>
  </View>
);

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const eq = useEqualizer();
  const [isModalVisible, setModalVisible] = useState(false);

  const verticalScrollRef = useRef<ScrollView>(null);

  const handleToggleEQ = () => {
    if (eq.isDSPDisabled) return;
    eq.toggleEQ();
  };

  const handleSliderTouchStart = () => {
    verticalScrollRef.current?.setNativeProps({ scrollEnabled: false });
  };

  const handleSliderTouchEnd = () => {
    setTimeout(() => {
      verticalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);
  };

  const handleReset = () => {
    Alert.alert("Reset DSP", "Reset semua ke posisi netral?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => eq.resetToDefault(),
      },
    ]);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background.primary }]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollView
          ref={verticalScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: LIST_BOTTOM_PADDING }]}
          scrollEventThrottle={16}
        >
          {/* ── HEADER ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                Precision DSP
              </Text>
              <View style={styles.statusRow}>
                <Zap
                  size={12}
                  color={eq.isEQEnabled && !eq.isDSPDisabled ? theme.colors.primary[500] : "#666"}
                />
                <Text
                  style={[
                    styles.subtitle,
                    { color: eq.isEQEnabled && !eq.isDSPDisabled ? theme.colors.primary[500] : "#666" },
                  ]}
                >
                  {eq.isDSPDisabled
                    ? "BIT-PERFECT BYPASS"
                    : eq.isEQEnabled
                      ? "ENGINE ACTIVE"
                      : "ENGINE STANDBY"}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={handleReset}
                disabled={eq.isDSPDisabled}
                style={styles.resetBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <RotateCcw
                  size={16}
                  color={eq.isDSPDisabled ? "#444" : theme.colors.text.secondary}
                  strokeWidth={2}
                />
              </TouchableOpacity>

              <Switch
                value={eq.isEQEnabled && !eq.isDSPDisabled}
                onValueChange={handleToggleEQ}
                disabled={eq.isDSPDisabled}
                trackColor={{ false: "#333", true: theme.colors.primary[500] + "88" }}
                thumbColor={
                  eq.isEQEnabled && !eq.isDSPDisabled ? theme.colors.primary[500] : "#999"
                }
              />
            </View>
          </View>

          {/* ── GRAPH ──────────────────────────────────────────────────────── */}
          <View
            style={[
              styles.graphCard,
              { backgroundColor: theme.colors.background.secondary },
            ]}
          >
            <FrequencyGraph bands={eq.currentBands} width={width - 60} height={140} />
            {eq.isDSPDisabled && (
              <View style={styles.lockOverlay}>
                <ShieldAlert color="#D4AF37" size={32} />
                <Text style={styles.lockText}>DSP LOCKED</Text>
              </View>
            )}
          </View>

          {/* ── MASTER KNOBS WITH SWITCHES ─────────────────────────────────── */}
          <View style={styles.knobBoard}>
            {/* Bass Control */}
            <View style={styles.knobColumn}>
              <MiniSwitch
                label="BASS"
                value={eq.isBassEnabled}
                onValueChange={eq.setBassEnabled}
                disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                color="#FF3D00"
              />
              <ControlKnob
                label="" // Label dipindah ke switch
                value={eq.bassStrength}
                onChange={eq.setBassBoost}
                color="#FF3D00"
                disabled={!eq.isEQEnabled || !eq.isBassEnabled || eq.isDSPDisabled}
              />
            </View>

            {/* Virtualizer Control */}
            <View style={styles.knobColumn}>
              <MiniSwitch
                label="STAGE"
                value={eq.isVirtualizerEnabled}
                onValueChange={eq.setVirtualizerEnabled}
                disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                color="#00E5FF"
              />
              <ControlKnob
                label=""
                value={eq.virtualizerLevel}
                onChange={eq.setVirtualizer}
                color="#00E5FF"
                disabled={!eq.isEQEnabled || !eq.isVirtualizerEnabled || eq.isDSPDisabled}
              />
            </View>

            {/* Reverb Control */}
            <View style={styles.knobColumn}>
              <MiniSwitch
                label="REVERB"
                value={eq.isReverbEnabled}
                onValueChange={eq.setReverbEnabled}
                disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                color="#AA00FF"
              />
              <ControlKnob
                label=""
                value={eq.reverbPreset * 166}
                onChange={(v) => eq.setReverb(Math.round(v / 166))}
                color="#AA00FF"
                disabled={!eq.isEQEnabled || !eq.isReverbEnabled || eq.isDSPDisabled}
              />
              <Text style={[styles.reverbValue, { opacity: eq.isReverbEnabled ? 1 : 0.5 }]}>
                {REVERB_LABELS[eq.reverbPreset] ?? "None"}
              </Text>
            </View>
          </View>

          {/* ── PRESET SELECTOR ────────────────────────────────────────────── */}
          {/* ... (Bagian Preset tetap sama) */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>
              SOUND PROFILES
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              disabled={!eq.isEQEnabled || eq.isDSPDisabled}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Save size={18} color={theme.colors.primary[500]} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetScroll}
          >
            {eq.allPresets.map((preset) => (
              <PresetChip
                key={preset.id}
                label={preset.name}
                isActive={eq.activePresetId === preset.id}
                onPress={() => eq.applyPreset(preset.id)}
                disabled={!eq.isEQEnabled || eq.isDSPDisabled}
              />
            ))}
          </ScrollView>

          {/* ── MIXER SLIDERS ──────────────────────────────────────────────── */}
          {/* ... (Bagian Mixer tetap sama) */}
          <View
            style={[
              styles.mixerBoard,
              { backgroundColor: theme.colors.background.secondary },
            ]}
          >
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={eq.currentBands}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item, index }) => (
                <EqualizerBand
                  frequency={item.frequency}
                  gain={item.gain}
                  onValueChange={(v) => eq.updateBandGain(index, v)}
                  disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                  color={theme.colors.primary[500]}
                  onTouchStart={handleSliderTouchStart}
                  onTouchEnd={handleSliderTouchEnd}
                />
              )}
              contentContainerStyle={styles.slidersRow}
              decelerationRate="fast"
              snapToInterval={70}
              snapToAlignment="center"
              scrollEnabled={true}
              nestedScrollEnabled={true}
            />
          </View>
        </ScrollView>
      </GestureHandlerRootView>

      <SavePresetModal
        visible={isModalVisible}
        onSave={(name) => {
          eq.savePreset(name);
          setModalVisible(false);
        }}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... (Styles lain tetap sama)
  container: { flex: 1 },
  scrollContent: { paddingTop: 4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  subtitle: { fontSize: 8, fontWeight: "bold", marginLeft: 5, letterSpacing: 1 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resetBtn: {
    padding: 4,
  },
  graphCard: {
    marginHorizontal: 10,
    borderRadius: 24,
    padding: 5,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  lockText: { color: "#D4AF37", fontWeight: "900", marginTop: 10, fontSize: 12 },

  // --- Style Baru untuk Knobs & Switch ---
  knobBoard: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginVertical: 15, // Disesuaikan agar pas
    paddingHorizontal: 5,
  },
  knobColumn: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  miniSwitchContainer: {
    alignItems: "center",
    marginBottom: -5, // Merapatkan jarak antara switch dan knob
  },
  miniSwitchLabel: {
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 0.5,
    marginTop: -2,
  },
  reverbValue: { 
    color: "#AA00FF", 
    fontSize: 9, 
    fontWeight: "bold", 
    marginTop: -5 
  },
  // ----------------------------------------

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 11, fontWeight: "bold", letterSpacing: 1.5 },
  presetScroll: { paddingLeft: 20, marginBottom: 20 },
  mixerBoard: {
    marginHorizontal: 5,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  slidersRow: {
    paddingHorizontal: 10,
    alignItems: "flex-end",
  },
});
 