import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Lucide Icons
import {
  Palette,
  Cpu,
  Music,
  Info,
  Brush,
  Moon,
  Sun,
  ChevronRight,
  CheckCircle,
  RefreshCw,
  Globe,
  Wifi,
  Database,
} from "lucide-react-native";
import { useLibraryStore } from "@/features/library/store/libraryStore"; // Pastikan path benar
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { Search } from "lucide-react-native"; // Icon tambahan jika ingin lebih visual

import * as Haptics from "expo-haptics";

import { useTheme } from "@/context/ThemeContext";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { ThemePicker } from "@/shared/components/ui/ThemePicker";
import type { Theme } from "@/constants/themes/types";
import { selectArtists } from "@/features/library/store/selectors";
import { useSettingsStore } from "@/features/settings/store/settingsStore";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";

import { Zap, ShieldCheck } from "lucide-react-native";
import { ALL_PRESETS } from "@/features/equalizer/constants/presets";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";

// ─── Reusable Sub Components ────────────────────────────────────────────────

type SectionProps = {
  colors: Theme["colors"];
  spacing: Theme["spacing"];
  children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ colors, spacing, children }) => (
  <View
    style={[
      styles.section,
      {
        backgroundColor: colors.background.secondary,
        marginBottom: spacing.md,
      },
    ]}
  >
    {children}
  </View>
);

type SectionHeaderProps = {
  icon: React.ReactNode;
  title: string;
  colors: Theme["colors"];
  spacing: Theme["spacing"];
  collapsible?: boolean;
  expanded?: boolean;
  onPress?: () => void;
  rightSlot?: React.ReactNode;
};

const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  colors,
  spacing,
  collapsible = false,
  expanded,
  onPress,
  rightSlot,
}) => {
  const Wrapper = collapsible ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[
        styles.sectionHeader,
        {
          padding: spacing.md,
          borderBottomColor: colors.background.tertiary,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.row}>
        {icon}
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text.primary, marginLeft: spacing.sm },
          ]}
        >
          {title}
        </Text>
      </View>

      <View style={styles.row}>
        {rightSlot}
        {collapsible && (
          <ChevronRight
            size={20}
            color={colors.text.secondary}
            style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          />
        )}
      </View>
    </Wrapper>
  );
};

type SettingRowProps = {
  colors: Theme["colors"];
  spacing: Theme["spacing"];
  children: React.ReactNode;
  bordered?: boolean;
};

const SettingRow: React.FC<SettingRowProps> = ({
  colors,
  spacing,
  children,
  bordered = true,
}) => (
  <View
    style={[
      styles.settingRow,
      {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderTopColor: colors.background.tertiary,
        borderTopWidth: bordered ? 1 : 0,
      },
    ]}
  >
    {children}
  </View>
);

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { colors, spacing } = theme;

  const {
    isAutoScanEnabled,
    toggleAutoScanEnabled, // Gunakan action yang sesuai di store kamu
  } = useLibraryStore();

  const {
    enableOnlineArtistImage,
    setEnableOnlineArtistImage,
    downloadOnlyOnWiFi,
    setDownloadOnlyOnWiFi,
  } = useSettingsStore();

  // --- 2. EXISTING STATES ---
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDacSettings, setShowDacSettings] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLibrarySettings, setShowLibrarySettings] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const {
    dacs,
    currentDAC,
    isExclusiveMode,
    loading,
    error,
    config,
    scanDACs,
    selectDAC,
    toggleExclusiveMode,
    setSampleRate,
  } = useUSBDAC();

  const [showEQPicker, setShowEQPicker] = useState(false);

  const { activePresetId, applyPreset } = useEqualizerStore();

  const {
    playbackSpeed,
    setPlaybackSpeed,
    defaultEQ,
    audioMode, // <--- Add this
    setAudioMode, // <--- Add this
  } = usePlayerStore();

  const isExclusive = audioMode === "bit-perfect";

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleScanDAC = async () => {
    try {
      await scanDACs();
      Alert.alert("Sukses", "Scan USB DAC selesai");
    } catch {
      Alert.alert("Error", "Gagal scan USB DAC");
    }
  };

  const handleToggle = (setter: (v: boolean) => void, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(value);
  };

  const handleClearCache = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Bersihkan Cache",
      "Foto artis yang sudah diunduh akan dihapus. Lanjutkan?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Bersihkan",
          style: "destructive",
          onPress: async () => {
            setIsClearing(true);
            const success = await OnlineMetadataService.clearArtistCache();
            setIsClearing(false);
            if (success) {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              Alert.alert("Sukses", "Cache telah dibersihkan.");
            }
          },
        },
      ],
    );
  };

  const handleResetAll = () => {
    Alert.alert(
      "Reset Settings",
      "Yakin ingin mereset semua pengaturan ke default?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            Alert.alert("Sukses", "Semua pengaturan telah direset"),
        },
      ],
    );
  };

  const handleToggleAutoScan = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAutoScanEnabled(); // update store dulu (optimistic)

    if (value) {
      // Aktifkan → daftarkan background task
      const ok = await BackgroundScanTask.register(30).catch((err) => {
        console.warn("[Settings] BackgroundTask register failed:", err);
        return false;
      });
      if (ok) console.log("[Settings] Background scan registered");
    } else {
      // Matikan → batalkan background task
      await BackgroundScanTask.unregister().catch((err) =>
        console.warn("[Settings] BackgroundTask unregister failed:", err),
      );
      console.log("[Settings] Background scan unregistered");
    }
  };

  // ─── Handler tambahan ─────────────────────────────────────────────────────────

  const handleSpeedChange = (delta: number) => {
    const current = playbackSpeed ?? 1.0;
    const next = Math.round((current + delta) * 4) / 4; // step 0.25, hindari float error
    const clamped = Math.min(2.0, Math.max(0.5, next));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaybackSpeed(clamped);
  };

  const handleToggleAudioMode = (toBitPerfect: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (toBitPerfect) {
      Alert.alert(
        "Aktifkan Bit-Perfect?",
        "Mode ini menonaktifkan semua DSP (EQ, Bass, Reverb) untuk output murni tanpa pemrosesan.",
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Aktifkan",
            onPress: () => setAudioMode("bit-perfect"),
          },
        ],
      );
    } else {
      setAudioMode("dsp");
    }
  };

  // ─── Sections ──────────────────────────────────────────────────────────────

  const renderTampilan = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon={
          <Palette size={24} color={colors.primary[500]} strokeWidth={2.2} />
        }
        title="Tampilan"
        colors={colors}
        spacing={spacing}
      />

      {/* Tema */}
      <TouchableOpacity
        onPress={() => setShowThemePicker(true)}
        style={[
          styles.settingRow,
          {
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
        <View style={styles.row}>
          <Brush size={20} color={colors.text.secondary} strokeWidth={2.2} />
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>
            Tema
          </Text>
        </View>
        <View style={styles.row}>
          <View
            style={[
              styles.themeColorDot,
              { backgroundColor: colors.primary[500], marginRight: spacing.xs },
            ]}
          />
          <Text
            style={{ color: colors.text.secondary, marginRight: spacing.xs }}
          >
            {theme.name}
          </Text>
          <ChevronRight
            size={20}
            color={colors.text.secondary}
            strokeWidth={2.5}
          />
        </View>
      </TouchableOpacity>

      {/* Mode Gelap */}
      <View
        style={[
          styles.settingRow,
          { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
        ]}
      >
        <View style={styles.row}>
          {isDarkMode ? (
            <Moon size={20} color={colors.text.secondary} strokeWidth={2.2} />
          ) : (
            <Sun size={20} color={colors.text.secondary} strokeWidth={2.2} />
          )}
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>
            Mode Gelap
          </Text>
        </View>
        <Switch
          value={isDarkMode}
          onValueChange={toggleTheme}
          trackColor={{
            false: colors.background.tertiary,
            true: colors.primary[500],
          }}
          thumbColor={isDarkMode ? colors.text.primary : colors.text.secondary}
        />
      </View>
    </Section>
  );

  const renderDAC = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon={<Cpu size={24} color={colors.primary[500]} strokeWidth={2.2} />}
        title="USB DAC"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showDacSettings}
        onPress={() => setShowDacSettings((v) => !v)}
        rightSlot={
          currentDAC ? (
            <View
              style={[
                styles.statusDot,
                { backgroundColor: colors.status.success },
              ]}
            />
          ) : null
        }
      />

      {showDacSettings && (
        <View style={{ padding: spacing.md }}>
          {error && (
            <View
              style={[
                styles.alertBox,
                {
                  backgroundColor: colors.status.error + "20",
                  borderColor: colors.status.error,
                },
              ]}
            >
              <Text style={{ color: colors.status.error, fontSize: 12 }}>
                Error: {error}
              </Text>
            </View>
          )}

          {/* Scan Button */}
          <TouchableOpacity
            onPress={handleScanDAC}
            disabled={loading}
            style={[
              styles.pill,
              {
                backgroundColor: colors.primary[500],
                marginBottom: spacing.md,
              },
            ]}
          >
            <Text style={{ color: colors.background.primary, fontSize: 12 }}>
              {loading ? "Scanning..." : "Scan USB DAC"}
            </Text>
          </TouchableOpacity>

          {/* Daftar DAC */}
          {dacs.length > 0 && (
            <View style={{ marginBottom: spacing.md }}>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 12,
                  marginBottom: spacing.xs,
                }}
              >
                Device Tersedia:
              </Text>
              {dacs.map((dac) => (
                <TouchableOpacity
                  key={dac.id}
                  onPress={() => selectDAC(dac.id)}
                  style={[
                    styles.dacItem,
                    currentDAC?.id === dac.id && {
                      backgroundColor: colors.primary[500] + "25",
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.text.primary, fontWeight: "600" }}
                    >
                      {dac.name}
                    </Text>
                    <Text
                      style={{ color: colors.text.secondary, fontSize: 11 }}
                    >
                      {dac.id} • {dac.channelCounts} Channels
                    </Text>
                  </View>
                  {currentDAC?.id === dac.id && (
                    <CheckCircle
                      size={22}
                      color={colors.primary[500]}
                      strokeWidth={2.5}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Exclusive Mode & Sample Rate */}
          {currentDAC && (
            <>
              <SettingRow colors={colors} spacing={spacing}>
                <Text style={{ color: colors.text.primary }}>
                  Exclusive Mode
                </Text>
                <Switch
                  value={isExclusive}
                  onValueChange={(value) => {
                    // This updates the Zustand store, which then triggers the engine
                    setAudioMode(value ? "bit-perfect" : "dsp");
                  }}
                  trackColor={{
                    false: colors.background.tertiary,
                    true: colors.primary[500],
                  }}
                  thumbColor={
                    isExclusive ? colors.text.primary : colors.text.secondary
                  }
                />
              </SettingRow>

              {/* Sample Rate Selector */}
              <View style={{ marginTop: spacing.sm }}>
                <Text
                  style={{
                    color: colors.text.secondary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Sample Rate
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: spacing.xs }}>
                    {currentDAC.sampleRates?.map((rate) => (
                      <TouchableOpacity
                        key={rate}
                        onPress={() => setSampleRate(rate)}
                        style={[
                          styles.pill,
                          {
                            backgroundColor:
                              config?.sampleRate === rate
                                ? colors.primary[500]
                                : colors.background.tertiary,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color:
                              config?.sampleRate === rate
                                ? colors.background.primary
                                : colors.text.primary,
                            fontSize: 12,
                          }}
                        >
                          {rate / 1000}kHz
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          )}
        </View>
      )}
    </Section>
  );

  // ─── renderAudio ──────────────────────────────────────────────────────────────

  const renderAudio = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon={<Music size={24} color={colors.primary[500]} strokeWidth={2.2} />}
        title="Audio"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showAudioSettings}
        onPress={() => setShowAudioSettings((v) => !v)}
      />

      {showAudioSettings && (
        <View style={{ paddingBottom: spacing.sm }}>
          {/* ── 1. Audio Mode Toggle ─────────────────────────────────────── */}
          <SettingRow colors={colors} spacing={spacing} bordered={false}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                {audioMode === "bit-perfect" ? (
                  <ShieldCheck
                    size={16}
                    color={colors.status.warning}
                    strokeWidth={2.2}
                  />
                ) : (
                  <Zap
                    size={16}
                    color={colors.primary[500]}
                    strokeWidth={2.2}
                  />
                )}
                <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                  {audioMode === "bit-perfect"
                    ? "Bit-Perfect Mode"
                    : "DSP Mode"}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {audioMode === "bit-perfect"
                  ? "Output murni tanpa EQ/DSP. Cocok untuk DAC eksternal."
                  : "EQ, Bass Boost & efek aktif."}
              </Text>
            </View>
            <Switch
              value={audioMode === "bit-perfect"}
              onValueChange={handleToggleAudioMode}
              trackColor={{
                false: colors.primary[500] + "88",
                true: colors.status.warning + "88",
              }}
              thumbColor={
                audioMode === "bit-perfect"
                  ? colors.status.warning
                  : colors.primary[500]
              }
            />
          </SettingRow>

          {/* ── 2. Default EQ Preset ─────────────────────────────────────── */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                Default EQ
              </Text>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Preset yang diterapkan saat app dibuka.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowEQPicker(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: colors.background.tertiary,
              }}
            >
              <Text
                style={{
                  color: colors.primary[500],
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {ALL_PRESETS.find((p) => p.id === activePresetId)?.name ??
                  "Flat"}
              </Text>
              <ChevronRight
                size={14}
                color={colors.primary[500]}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </SettingRow>

          {/* ── 3. Playback Speed ────────────────────────────────────────── */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                Playback Speed
              </Text>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Kecepatan putar audio (0.5× – 2.0×).
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
            >
              <TouchableOpacity
                onPress={() => handleSpeedChange(-0.25)}
                disabled={(playbackSpeed ?? 1.0) <= 0.5}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.background.tertiary,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: (playbackSpeed ?? 1.0) <= 0.5 ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.text.primary,
                    fontSize: 18,
                    lineHeight: 20,
                  }}
                >
                  −
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  minWidth: 52,
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    color: colors.primary[500],
                    fontWeight: "800",
                    fontSize: 15,
                  }}
                >
                  {(playbackSpeed ?? 1.0).toFixed(2)}×
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleSpeedChange(0.25)}
                disabled={(playbackSpeed ?? 1.0) >= 2.0}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.background.tertiary,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: (playbackSpeed ?? 1.0) >= 2.0 ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.text.primary,
                    fontSize: 18,
                    lineHeight: 20,
                  }}
                >
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </SettingRow>
        </View>
      )}

      {/* ── EQ Picker Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showEQPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEQPicker(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background.secondary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 32,
              maxHeight: "60%",
            }}
          >
            {/* Handle bar */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.text.disabled,
                alignSelf: "center",
                marginTop: 12,
                marginBottom: 16,
              }}
            />

            <Text
              style={{
                color: colors.text.primary,
                fontSize: 16,
                fontWeight: "800",
                paddingHorizontal: 20,
                marginBottom: 8,
              }}
            >
              Pilih Default EQ
            </Text>

            <FlatList
              data={ALL_PRESETS}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    applyPreset(item.id);
                    setShowEQPicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.background.tertiary,
                    backgroundColor:
                      activePresetId === item.id
                        ? colors.primary[500] + "18"
                        : "transparent",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color:
                          activePresetId === item.id
                            ? colors.primary[500]
                            : colors.text.primary,
                        fontWeight: activePresetId === item.id ? "700" : "500",
                        fontSize: 14,
                      }}
                    >
                      {item.name}
                    </Text>
                    {item.description && (
                      <Text
                        style={{
                          color: colors.text.tertiary,
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                  {activePresetId === item.id && (
                    <CheckCircle
                      size={18}
                      color={colors.primary[500]}
                      strokeWidth={2.5}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </Section>
  );

  const renderLibrary = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon={
          <Database size={24} color={colors.primary[500]} strokeWidth={2.2} />
        }
        title="Library & Metadata"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showLibrarySettings}
        onPress={() => setShowLibrarySettings(!showLibrarySettings)}
      />

      {showLibrarySettings && (
        <View style={{ paddingBottom: spacing.sm }}>
          {/* --- NEW: Auto Scan Library Toggle --- */}
          <SettingRow colors={colors} spacing={spacing} bordered={false}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                Auto Scan Library
              </Text>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Cari musik baru secara otomatis saat aplikasi dibuka atau di
                background.
              </Text>
            </View>
            <Switch
              value={isAutoScanEnabled}
              onValueChange={handleToggleAutoScan}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.primary[500],
              }}
              thumbColor={
                isAutoScanEnabled ? colors.text.primary : colors.text.secondary
              }
            />
          </SettingRow>

          {/* --- Online Artist Metadata --- */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                Online Artist Metadata
              </Text>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Otomatis cari foto artis via MusicBrainz.
              </Text>
            </View>
            <Switch
              value={enableOnlineArtistImage}
              onValueChange={(v) => handleToggle(setEnableOnlineArtistImage, v)}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.primary[500],
              }}
            />
          </SettingRow>

          {/* --- Wi-Fi Only --- */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                Hanya lewat Wi-Fi
              </Text>
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Mencegah penggunaan kuota seluler untuk mengunduh gambar.
              </Text>
            </View>
            <Switch
              value={downloadOnlyOnWiFi}
              onValueChange={(v) => handleToggle(setDownloadOnlyOnWiFi, v)}
              disabled={!enableOnlineArtistImage}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.primary[500],
              }}
            />
          </SettingRow>

          <TouchableOpacity
            style={{ padding: spacing.md, alignItems: "center" }}
            onPress={handleClearCache}
            disabled={isClearing}
          >
            {isClearing ? (
              <ActivityIndicator size="small" color={colors.primary[500]} />
            ) : (
              <Text
                style={{
                  color: colors.status.error,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Kosongkan Cache Gambar Artis
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Section>
  );

  const renderAbout = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon={<Info size={24} color={colors.primary[500]} strokeWidth={2.2} />}
        title="Tentang"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showAbout}
        onPress={() => setShowAbout((v) => !v)}
      />

      {showAbout && (
        <View style={{ padding: spacing.md }}>
          <View style={{ alignItems: "center", marginBottom: spacing.md }}>
            <Text style={[styles.appName, { color: colors.primary[500] }]}>
              PristineAudio
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              Version 1.0.0 (Build 2026)
            </Text>
          </View>

          <View
            style={[
              styles.infoBox,
              { backgroundColor: colors.background.tertiary },
            ]}
          >
            <Text
              style={{ color: colors.text.primary, marginBottom: spacing.xs }}
            >
              High-Fidelity Audio Player for Audiophiles
            </Text>
          </View>
        </View>
      )}
    </Section>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────────

  return (
  <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={[
          styles.screenTitle,
          { color: colors.text.primary, marginBottom: spacing.md },
        ]}
      >
        Settings
      </Text>

      {renderTampilan()}
      {renderDAC()}
      {renderAudio()}
      {renderLibrary()}
      {renderAbout()}

      <TouchableOpacity
        onPress={handleResetAll}
        style={[
          styles.resetButton,
          {
            backgroundColor: colors.status.error + "20",
            borderColor: colors.status.error,
            marginTop: spacing.sm,
          },
        ]}
      >
        <RefreshCw
          size={20}
          color={colors.status.error}
          strokeWidth={2.5}
          style={{ marginRight: 8 }}
        />
        <Text style={{ color: colors.status.error }}>Reset All Settings</Text>
      </TouchableOpacity>

      <ThemePicker
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
      />
    </ScrollView>
  </SafeAreaView>
);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: { fontSize: 32, fontWeight: "700" },
  section: { borderRadius: 16, overflow: "hidden" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600" },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center" },
  themeColorDot: { width: 20, height: 20, borderRadius: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  infoBox: { padding: 12, borderRadius: 12 },
  resetButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  appName: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  // Tambahkan di StyleSheet:
  alertBox: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  dacItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
});


