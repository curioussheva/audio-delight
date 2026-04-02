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
} from "lucide-react-native";

import { useTheme } from "@/context/ThemeContext";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { ThemePicker } from "@/shared/components/ui/ThemePicker";
import type { Theme } from "@/constants/themes/types";

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
          onPress: () =>
            Alert.alert("Sukses", "Semua pengaturan telah direset"),
        },
      ],
    );
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
                      {dac.id} • {dac.channelCount} Channels
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
                  value={isExclusiveMode}
                  onValueChange={toggleExclusiveMode}
                  disabled={loading}
                  trackColor={{
                    false: colors.background.tertiary,
                    true: colors.primary[500],
                  }}
                  thumbColor={isExclusiveMode ? colors.text.primary : "#f4f3f4"}
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
        <View style={{ padding: spacing.md }}>
          <SettingRow colors={colors} spacing={spacing}>
            <Text style={{ color: colors.text.primary }}>Default EQ</Text>
            <Text style={{ color: colors.primary[500] }}>
              {defaultEQ || "Flat"}
            </Text>
          </SettingRow>

          <SettingRow colors={colors} spacing={spacing}>
            <Text style={{ color: colors.text.primary }}>Playback Speed</Text>
            <Text style={{ color: colors.primary[500] }}>
              {playbackSpeed || 1.0}x
            </Text>
          </SettingRow>
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{
        padding: 16, // fallback manual
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
