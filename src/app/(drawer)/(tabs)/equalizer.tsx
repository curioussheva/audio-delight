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
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { ControlKnob } from "@/features/equalizer/components/ControlKnob";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { SafeAreaView } from "react-native-safe-area-context";
import { Save, ShieldAlert, Zap } from "lucide-react-native";
import {
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from "react-native-gesture-handler";

const { width } = Dimensions.get("window");

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const eq = useEqualizer();
  const [isModalVisible, setModalVisible] = useState(false);

  // Refs untuk scroll views
  const verticalScrollRef = useRef<ScrollView>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);

  const getReverbLabel = (index: number) => {
    const labels = [
      "None",
      "Small",
      "Medium",
      "Large",
      "Room",
      "Studio",
      "Plate",
    ];
    return labels[index] || "None";
  };

  const handleToggleEQ = (value: boolean) => {
    if (eq.isDSPDisabled) return;
    eq.toggleEQ();
  };

  // Handler untuk mencegah gesture conflict
  const handleSliderTouchStart = () => {
    // Disable scroll vertikal saat slider disentuh
    verticalScrollRef.current?.setNativeProps({ scrollEnabled: false });
  };

  const handleSliderTouchEnd = () => {
    // Enable scroll vertikal setelah slider selesai
    setTimeout(() => {
      verticalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.primary },
      ]}
    >
      <ScrollView
        ref={verticalScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>
              Precision DSP
            </Text>
            <View style={styles.statusRow}>
              <Zap
                size={12}
                color={
                  eq.isEQEnabled && !eq.isDSPDisabled
                    ? theme.colors.primary[500]
                    : "#666"
                }
              />
              <Text
                style={[
                  styles.subtitle,
                  {
                    color:
                      eq.isEQEnabled && !eq.isDSPDisabled
                        ? theme.colors.primary[500]
                        : "#666",
                  },
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

          <Switch
            value={eq.isEQEnabled && !eq.isDSPDisabled}
            onValueChange={handleToggleEQ}
            disabled={eq.isDSPDisabled}
            trackColor={{
              false: "#333",
              true: theme.colors.primary[500] + "88",
            }}
            thumbColor={
              eq.isEQEnabled && !eq.isDSPDisabled
                ? theme.colors.primary[500]
                : "#999"
            }
          />
        </View>

        {/* GRAPH SECTION - tetap sama */}
        <View
          style={[
            styles.graphCard,
            { backgroundColor: theme.colors.background.secondary },
          ]}
        >
          <FrequencyGraph
            bands={eq.currentBands}
            width={width - 60}
            height={140}
          />
          {eq.isDSPDisabled && (
            <View style={styles.lockOverlay}>
              <ShieldAlert color="#D4AF37" size={32} />
              <Text style={styles.lockText}>DSP LOCKED</Text>
            </View>
          )}
        </View>

        {/* MASTER KNOBS */}
        <View style={styles.knobRow}>
          <ControlKnob
            label="BASS"
            value={eq.bassStrength}
            onChange={eq.setBassBoost}
            color="#FF3D00"
            disabled={!eq.isEQEnabled || eq.isDSPDisabled}
          />
          <ControlKnob
            label="STAGE"
            value={eq.virtualizerLevel}
            onChange={eq.setVirtualizer}
            color="#00E5FF"
            disabled={!eq.isEQEnabled || eq.isDSPDisabled}
          />
          <View style={styles.reverbContainer}>
            <ControlKnob
              label="REVERB"
              value={eq.reverbPreset * 166}
              onChange={(v) => eq.setReverb(Math.round(v / 166))}
              color="#AA00FF"
              disabled={!eq.isEQEnabled || eq.isDSPDisabled}
            />
            <Text style={styles.reverbValue}>
              {getReverbLabel(eq.reverbPreset)}
            </Text>
          </View>
        </View>

        {/* PRESET SELECTOR */}
        <View style={styles.sectionHeader}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.colors.text.secondary },
            ]}
          >
            SOUND PROFILES
          </Text>
          <TouchableOpacity
            onPress={() => setModalVisible(true)}
            disabled={!eq.isEQEnabled || eq.isDSPDisabled}
          >
            <Save size={18} color={theme.colors.primary[500]} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={horizontalScrollRef}
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

        {/* MIXER SLIDERS - PERBAIKAN UTAMA */}
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
          />
        </View>
      </ScrollView>

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
  container: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  subtitle: {
    fontSize: 8,
    fontWeight: "bold",
    marginLeft: 5,
    letterSpacing: 1,
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
  lockText: {
    color: "#D4AF37",
    fontWeight: "900",
    marginTop: 10,
    fontSize: 12,
  },
  knobRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginVertical: 10,
    paddingHorizontal: 10,
  },
  reverbContainer: { alignItems: "center" },
  reverbValue: {
    color: "#AA00FF",
    fontSize: 9,
    fontWeight: "bold",
    marginTop: -5,
  },
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
