import React, { useState } from "react";
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
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Save,
  TriangleAlert,
  Zap,
  RotateCcw,
  Eye,
  EyeOff,
  Settings2,
  ChevronRight,
} from "lucide-react-native";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useTheme } from "@/context/ThemeContext";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { HorizontalSlider } from "@/features/equalizer/components/HorizontalSlider";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { HeadphoneSection } from "@/features/headphone/components/HeadphoneSection";
import { FLOATING_PLAYER_CLEARANCE } from "@/features/player/layout";

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

/** Label mode yang jujur - dibaca dari state, bukan dikarang di UI. */
const MODE_LABELS: Record<string, string> = {
  bitperfect: "BIT-PERFECT",
  "bit-perfect": "BIT-PERFECT",
  dsp: "DSP",
  immersive: "IMMERSIVE",
};

// ─── MINI COMPONENTS ─────────────────────────────────────────────────────

interface MiniSwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  color: string;
  label: string;
}

const MiniSwitch = ({
  value,
  onValueChange,
  disabled,
  color,
  label,
}: MiniSwitchProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const on = value && !disabled;

  return (
    <View style={styles.miniSwitchContainer}>
      <Text
        style={[
          styles.miniSwitchLabel,
          { color: on ? color : colors.text.secondary },
        ]}
      >
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        // Track OFF dulu `#222` di atas kartu `#0A0A0A` - rasio 1.24, praktis
        // tak terlihat. Sekarang dari token supaya terbaca di semua tema.
        trackColor={{
          false: colors.background.tertiary,
          true: color + "55",
        }}
        thumbColor={on ? color : colors.text.tertiary}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }}
      />
    </View>
  );
};

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────

// Bottom padding: ruang untuk tab bar + FloatingPlayer (FLOATING_PLAYER_CLEARANCE).
const LIST_BOTTOM_PADDING = FLOATING_PLAYER_CLEARANCE + 20;

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;

  const eq = useEqualizer();
  const { audioMode } = usePlayerStore();

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
      { text: "Batal", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => eq.resetToDefault(),
      },
    ]);
  };

  // Preset custom bisa DISIMPAN tapi dulu tidak bisa DIHAPUS dari UI - aksi
  // `deletePreset` ada di store tapi nol pemanggil. Tekan lama untuk menghapus.
  const handlePresetLongPress = (
    id: string,
    name: string,
    isCustom?: boolean,
  ) => {
    if (!isCustom) return;

    Alert.alert("Hapus preset", `Hapus "${name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: () => eq.deletePreset(id),
      },
    ]);
  };

  const modeLabel =
    MODE_LABELS[String(audioMode ?? "")] ??
    String(audioMode ?? "-").toUpperCase();

  const bassColor =
    colors.accent?.orange ?? colors.status.warning ?? colors.primary[500];
  const widthColor = colors.accent?.blue ?? colors.primary[500];
  const reverbColor = colors.accent?.purple ?? colors.primary[500];
  const masterColor = colors.accent?.green ?? colors.primary[500];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* UI TOGGLES */}
        <View
          style={[
            styles.viewControls,
            {
              backgroundColor: colors.background.secondary,
              borderBottomColor: colors.border.medium,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => toggleSection("graph")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan grafik"
            accessibilityState={{ expanded: visibleSections.graph }}
          >
            {visibleSections.graph ? (
              <Eye size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.graph
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
              ]}
            >
              GRAFIK
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleSection("effects")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan efek"
            accessibilityState={{ expanded: visibleSections.effects }}
          >
            {visibleSections.effects ? (
              <Zap size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.effects
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
              ]}
            >
              EFEK
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleSection("mixer")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan mixer"
            accessibilityState={{ expanded: visibleSections.mixer }}
          >
            {visibleSections.mixer ? (
              <Settings2 size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.mixer
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
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
          <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text.primary }]}>
                Precision DSP
              </Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                MODE {modeLabel} · MESIN {eq.isEQEnabled ? "AKTIF" : "BYPASS"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleReset}
              style={[
                styles.resetBtn,
                { padding: spacing.sm, minWidth: 44, minHeight: 44 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset DSP ke pengaturan netral"
            >
              <RotateCcw size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* 0a. SAKELAR UTAMA.
              Dulu layar ini TIDAK punya sakelar master: `isEQEnabled` bernilai
              false secara default dan hanya pernah dimatikan
              (`setEQEnabled(false)`) dari _layout. Artinya seluruh kontrol di
              layar ini tersambung ke engine yang tidak pernah menyala - orang
              menggeser slider, tidak terjadi apa pun, tanpa penjelasan. */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background.secondary,
                borderColor: colors.border.medium,
                marginHorizontal: spacing.md,
                padding: spacing.md,
                marginBottom: spacing.md,
              },
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  Pemrosesan DSP
                </Text>
                <Text style={[styles.cardHint, { color: colors.text.secondary }]}>
                  EQ, bass boost, pelebar stereo, dan koreksi headphone hanya
                  berlaku saat ini menyala.
                </Text>
              </View>
              <Switch
                value={eq.isEQEnabled}
                onValueChange={eq.toggleEQ}
                disabled={eq.isDSPDisabled}
                trackColor={{
                  false: colors.background.tertiary,
                  true: masterColor,
                }}
                thumbColor={eq.isEQEnabled ? masterColor : colors.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel="Pemrosesan DSP"
                accessibilityState={{
                  checked: eq.isEQEnabled,
                  disabled: eq.isDSPDisabled,
                }}
              />
            </View>
          </View>

          {/* 0b. Mode Bit-Perfect memblokir seluruh DSP. Dulu kontrol hanya
              diam-diam tidak bereaksi (`if (isDSPDisabled) return`) tanpa
              penjelasan apa pun di layar. */}
          {eq.isDSPDisabled && (
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.status.error,
                  marginHorizontal: spacing.md,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <TriangleAlert size={18} color={colors.status.error} />
              <Text
                style={[
                  styles.warningText,
                  { color: colors.text.primary, marginLeft: spacing.sm },
                ]}
              >
                Mode Bit-Perfect aktif — seluruh DSP dilewati supaya output
                murni. Pilih mode DSP di Pengaturan untuk memakai kontrol di
                layar ini.
              </Text>
            </View>
          )}

          {/* 1. KOREKSI HEADPHONE — diletakkan PALING ATAS karena diproses
              paling awal di DSPChain (sebelum EQ). Koreksi menetralkan alat,
              EQ menyetel selera; menaruh kontrol EQ di atas akan menyesatkan
              tentang urutan yang sebenarnya. */}
          <HeadphoneSection />

          {/* 2. GRAPH SECTION */}
          {visibleSections.graph && (
            <View
              style={[
                styles.graphCard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                  marginHorizontal: spacing.md,
                  marginBottom: spacing.md,
                  padding: spacing.sm,
                },
              ]}
            >
              <FrequencyGraph
                bands={eq.currentBands}
                width={width - spacing.md * 2 - spacing.sm * 2 - 2}
                height={140}
              />
            </View>
          )}

          {/* 3. EFFECTS SECTION (SLIDERS & REVERB) */}
          {visibleSections.effects && (
            <View
              style={[
                styles.effectsSection,
                { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
              ]}
            >
              {/* BASS SLIDER */}
              <View
                style={[
                  styles.effectItem,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                    paddingVertical: spacing.md,
                  },
                ]}
              >
                <MiniSwitch
                  label="BASS BOOST"
                  value={eq.isBassEnabled}
                  onValueChange={eq.setBassEnabled}
                  disabled={eq.isDSPDisabled}
                  color={bassColor}
                />
                <HorizontalSlider
                  label="INTENSITAS"
                  value={eq.bassStrength}
                  onChange={eq.setBassBoost}
                  color={bassColor}
                  disabled={!eq.isBassEnabled || eq.isDSPDisabled}
                />
              </View>

              {/* VIRTUALIZER SLIDER */}
              <View
                style={[
                  styles.effectItem,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                    paddingVertical: spacing.md,
                  },
                ]}
              >
                <MiniSwitch
                  label="PELEBAR STEREO"
                  value={eq.isVirtualizerEnabled}
                  onValueChange={eq.setVirtualizerEnabled}
                  disabled={eq.isDSPDisabled}
                  color={widthColor}
                />
                <HorizontalSlider
                  label="LEBAR"
                  value={eq.virtualizerLevel}
                  onChange={eq.setVirtualizer}
                  color={widthColor}
                  disabled={!eq.isVirtualizerEnabled || eq.isDSPDisabled}
                />
              </View>

              {/* REVERB PRESET SELECTOR */}
              <View
                style={[
                  styles.effectItem,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                    paddingVertical: spacing.md,
                  },
                ]}
              >
                <MiniSwitch
                  label="REVERB LINGKUNGAN"
                  value={eq.isReverbEnabled}
                  onValueChange={eq.setReverbEnabled}
                  disabled={eq.isDSPDisabled}
                  color={reverbColor}
                />
                <TouchableOpacity
                  style={[
                    styles.reverbBox,
                    {
                      backgroundColor: colors.background.tertiary,
                      borderColor: colors.border.medium,
                      marginHorizontal: spacing.md,
                      marginTop: spacing.sm,
                      padding: spacing.md,
                      minHeight: 44,
                    },
                    (!eq.isReverbEnabled || eq.isDSPDisabled) && {
                      opacity: 0.4,
                    },
                  ]}
                  disabled={!eq.isReverbEnabled || eq.isDSPDisabled}
                  onPress={() => {
                    const next = (eq.reverbPreset + 1) % REVERB_LABELS.length;
                    eq.setReverb(next);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reverb: ${REVERB_LABELS[eq.reverbPreset]}. Tekan untuk pilihan berikutnya.`}
                >
                  <Text
                    style={[styles.reverbLabel, { color: colors.text.secondary }]}
                  >
                    LINGKUNGAN
                  </Text>
                  <View style={styles.reverbValueRow}>
                    <Text style={[styles.reverbValue, { color: reverbColor }]}>
                      {REVERB_LABELS[eq.reverbPreset]}
                    </Text>
                    <ChevronRight size={16} color={colors.text.secondary} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 4. PRESETS */}
          <View
            style={[
              styles.sectionHeader,
              { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
              PROFIL SUARA
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              disabled={eq.isDSPDisabled}
              accessibilityRole="button"
              accessibilityLabel="Simpan profil saat ini"
              style={[
                styles.iconBtn,
                eq.isDSPDisabled && { opacity: 0.4 },
              ]}
            >
              <Save size={18} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.presetScroll,
              { paddingLeft: spacing.md, marginBottom: spacing.lg },
            ]}
            contentContainerStyle={{ paddingRight: spacing.md }}
          >
            {eq.allPresets.map((p) => (
              <PresetChip
                key={p.id}
                label={p.name}
                isActive={eq.activePresetId === p.id}
                onPress={() => eq.applyPreset(p.id)}
                onLongPress={() =>
                  handlePresetLongPress(p.id, p.name, p.isCustom)
                }
                disabled={eq.isDSPDisabled}
              />
            ))}
          </ScrollView>

          {/* 5. MIXER SECTION */}
          {visibleSections.mixer && (
            <View
              style={[
                styles.mixerBoard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                  marginHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  marginBottom: spacing.xl,
                },
              ]}
            >
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
                    disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                  />
                )}
                contentContainerStyle={{ paddingHorizontal: spacing.sm }}
                // Penting: agar tidak bentrok dengan scroll utama
                directionalLockEnabled={true}
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
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    minHeight: 36,
  },
  viewBtnText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginTop: 2,
  },
  resetBtn: { alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  cardHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
  },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17 },
  graphCard: {
    minHeight: 160,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  effectsSection: { gap: 12 },
  effectItem: {
    borderRadius: 20,
    borderWidth: 1,
  },
  miniSwitchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    minHeight: 32,
  },
  miniSwitchLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  reverbBox: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reverbLabel: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  reverbValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  reverbValue: { fontSize: 13, fontWeight: "900" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
  },
  sectionTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  presetScroll: { flexGrow: 0 },
  mixerBoard: {
    borderRadius: 20,
    borderWidth: 1,
  },
});
