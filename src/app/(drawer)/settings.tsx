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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { ThemePicker } from "@/shared/components/ui/ThemePicker";
import type { Theme } from "@/constants/themes/types";

// ─── Reusable sub-components ────────────────────────────────────────────────

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
  icon: React.ComponentProps<typeof Ionicons>["name"];
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
        <Ionicons name={icon} size={24} color={colors.primary[500]} />
        <Text style={[styles.sectionTitle, { color: colors.text.primary, marginLeft: spacing.sm }]}>
          {title}
        </Text>
      </View>
      <View style={styles.row}>
        {rightSlot}
        {collapsible && (
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.text.secondary}
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

  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDacSettings, setShowDacSettings] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

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

  const { playbackSpeed, defaultEQ } = usePlayerStore();

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleScanDAC = async () => {
    try {
      await scanDACs();
      Alert.alert("Sukses", "Scan USB DAC selesai");
    } catch {
      Alert.alert("Error", "Gagal scan USB DAC");
    }
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
          onPress: () => Alert.alert("Sukses", "Semua pengaturan telah direset"),
        },
      ],
    );
  };

  // ─── Sections ──────────────────────────────────────────────────────────────

  const renderTampilan = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon="color-palette-outline"
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
          <Ionicons name="brush-outline" size={20} color={colors.text.secondary} />
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>Tema</Text>
        </View>
        <View style={styles.row}>
          <View
            style={[
              styles.themeColorDot,
              { backgroundColor: colors.primary[500], marginRight: spacing.xs },
            ]}
          />
          <Text style={{ color: colors.text.secondary, marginRight: spacing.xs }}>
            {theme.name}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
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
          <Ionicons
            name={isDarkMode ? "moon-outline" : "sunny-outline"}
            size={20}
            color={colors.text.secondary}
          />
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>
            Mode Gelap
          </Text>
        </View>
        <Switch
          value={isDarkMode}
          onValueChange={toggleTheme}
          trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
          thumbColor={isDarkMode ? colors.text.primary : colors.text.secondary}
        />
      </View>
    </Section>
  );

  const renderDAC = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon="hardware-chip-outline"
        title="USB DAC"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showDacSettings}
        onPress={() => setShowDacSettings((v) => !v)}
        rightSlot={
          currentDAC ? (
            <View
              style={[styles.statusDot, { backgroundColor: colors.status.success, marginRight: spacing.sm }]}
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
                  marginBottom: spacing.sm,
                },
              ]}
            >
              <Text style={{ color: colors.status.error, fontSize: 12 }}>
                Error: {error}
              </Text>
            </View>
          )}

          {loading && (
            <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
              <ActivityIndicator size="small" color={colors.primary[500]} />
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: spacing.xs }}>
                Processing...
              </Text>
            </View>
          )}

          {/* Status & Scan */}
          <View style={[styles.settingRow, { marginBottom: spacing.md }]}>
            <Text style={{ color: colors.text.secondary }}>
              Status: {currentDAC ? "Terhubung" : "Tidak terdeteksi"}
            </Text>
            <TouchableOpacity
              onPress={handleScanDAC}
              disabled={loading}
              style={[styles.pill, { backgroundColor: colors.primary[500] }]}
            >
              <Text style={{ color: colors.background.primary, fontSize: 12 }}>
                {loading ? "Scanning..." : "Scan"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Daftar DAC */}
          {dacs.length > 0 && (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: spacing.xs }}>
                Device tersedia:
              </Text>
              {dacs.map((dac) => (
                <TouchableOpacity
                  key={dac.id}
                  onPress={() => selectDAC(dac.id)}
                  style={[
                    styles.dacItem,
                    {
                      backgroundColor:
                        currentDAC?.id === dac.id
                          ? colors.primary[500] + "25"
                          : "transparent",
                      padding: spacing.sm,
                      borderRadius: 8,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontWeight: "600" }}>
                      {dac.name}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                      {dac.id} • {dac.channelCount} Channels
                    </Text>
                  </View>
                  {currentDAC?.id === dac.id && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary[500]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Exclusive Mode + Sample Rate */}
          {currentDAC && (
            <>
              <SettingRow colors={colors} spacing={spacing}>
                <Text style={{ color: colors.text.primary }}>Exclusive Mode</Text>
                <View style={[styles.row, { gap: spacing.xs }]}>
                  {isExclusiveMode && (
                    <View style={[styles.statusDot, { backgroundColor: colors.status.success }]} />
                  )}
                  <Switch
                    value={isExclusiveMode}
                    onValueChange={() => { toggleExclusiveMode(); }}
                    disabled={loading}
                    trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
                    thumbColor={isExclusiveMode ? colors.text.primary : "#f4f3f4"}
                  />
                </View>
              </SettingRow>

              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.text.secondary, marginBottom: spacing.xs }}>
                  Sample Rate
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.row, { gap: spacing.xs }]}>
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
                    <TouchableOpacity
                      onPress={() => setSampleRate(0)}
                      style={[
                        styles.pill,
                        {
                          backgroundColor:
                            config?.sampleRate === 0
                              ? colors.primary[500]
                              : colors.background.tertiary,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            config?.sampleRate === 0
                              ? colors.background.primary
                              : colors.text.primary,
                          fontSize: 12,
                        }}
                      >
                        Auto
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>

              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: colors.background.tertiary, marginTop: spacing.md },
                ]}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                  ℹ️ Exclusive mode mengirim audio langsung ke DAC tanpa modifikasi.
                </Text>
              </View>
            </>
          )}
        </View>
      )}
    </Section>
  );

  const renderAudio = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon="musical-notes-outline"
        title="Audio"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showAudioSettings}
        onPress={() => setShowAudioSettings((v) => !v)}
      />

      {showAudioSettings && (
        <View style={{ padding: spacing.md }}>
          {/* Default EQ */}
          <TouchableOpacity style={styles.settingRow}>
            <Text style={{ color: colors.text.primary }}>Default EQ</Text>
            <View style={styles.row}>
              <Text style={{ color: colors.text.secondary, marginRight: spacing.xs }}>
                {defaultEQ || "Flat"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            </View>
          </TouchableOpacity>

          {/* Playback Speed */}
          <SettingRow colors={colors} spacing={spacing}>
            <Text style={{ color: colors.text.primary }}>Playback Speed</Text>
            <Text style={{ color: colors.primary[500] }}>{playbackSpeed || 1.0}x</Text>
          </SettingRow>

          {/* ReplayGain */}
          <SettingRow colors={colors} spacing={spacing}>
            <Text style={{ color: colors.text.primary }}>ReplayGain</Text>
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
            />
          </SettingRow>
        </View>
      )}
    </Section>
  );

  const renderAbout = () => (
    <Section colors={colors} spacing={spacing}>
      <SectionHeader
        icon="information-circle-outline"
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
              Version 1.0.0 (Build 2026.03)
            </Text>
          </View>

          <View
            style={[
              styles.infoBox,
              { backgroundColor: colors.background.tertiary, marginBottom: spacing.md },
            ]}
          >
            <Text style={{ color: colors.text.primary, marginBottom: spacing.xs }}>
              High-Fidelity Audio Player for Audiophiles
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              {"• 10-band Equalizer with presets\n"}
              {"• Real-time spectrum visualizer\n"}
              {"• FLAC/DSD support\n"}
              {"• USB DAC exclusive mode\n"}
              {"• M3U playlist import/export"}
            </Text>
          </View>

          <TouchableOpacity style={styles.settingRow}>
            <Text style={{ color: colors.text.primary }}>Lisensi & Kredit</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          <SettingRow colors={colors} spacing={spacing}>
            <Text style={{ color: colors.text.primary }}>Kebijakan Privasi</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </SettingRow>
        </View>
      )}
    </Section>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.text.primary, marginBottom: spacing.md }]}>
        Settings
      </Text>

      {renderTampilan()}
      {renderDAC()}
      {renderAudio()}
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
        <Text style={{ color: colors.status.error }}>Reset All Settings</Text>
      </TouchableOpacity>

      <ThemePicker
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  section: {
    borderRadius: 16,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  themeColorDot: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dacItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  alertBox: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoBox: {
    padding: 8,
    borderRadius: 8,
  },
  resetButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
}); 