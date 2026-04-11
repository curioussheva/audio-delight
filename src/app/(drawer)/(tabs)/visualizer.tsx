// src/app/visualizer.tsx (atau lokasi sesuai routing)

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import Slider from "@react-native-community/slider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafePadding } from "@/shared/hooks/useSafePadding";

import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useUSBDAC } from "@/features/hardware/hooks/useUSBDAC"; // ✅ TAMBAH
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import USBDACService from "@/features/hardware/api/USBDACModule";
// Icons
import { Activity, Settings, Gauge, X } from "lucide-react-native";

const { width, height } = Dimensions.get("window");

type VisualizerMode = "bars" | "wave" | "circle";
type ColorTheme = "default" | "neon" | "pastel" | "fire" | "ocean";

interface ColorPreset {
  name: string;
  primary: string;
  secondary: string;
}

const COLOR_PRESETS: Record<ColorTheme, ColorPreset> = {
  default: { name: "Default", primary: "#00D4AA", secondary: "#2B6EB0" },
  neon: { name: "Neon", primary: "#FF10F0", secondary: "#00FFFF" },
  pastel: { name: "Pastel", primary: "#FFB6C1", secondary: "#87CEEB" },
  fire: { name: "Fire", primary: "#FF4500", secondary: "#FFD700" },
  ocean: { name: "Ocean", primary: "#1E90FF", secondary: "#40E0D0" },
};

export default function VisualizerScreen() {
  const safePadding = useSafePadding();
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  // ✅ TAMBAH: Get audio session ID dari DAC
  const { currentDAC } = useUSBDAC();

  const audioSessionId = 0; // Global audio output session

  const { currentSong, isPlaying } = usePlayerStore();

  // State
  const [mode, setMode] = useState<VisualizerMode>("bars");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("default");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fps, setFps] = useState(0);
  const [isListening, setIsListening] = useState(false);

  // Refs
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());

  // FPS Counter
  useEffect(() => {
    if (!isListening) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTime.current;
      const currentFps = Math.round((frameCount.current * 1000) / delta);
      setFps(currentFps);
      frameCount.current = 0;
      lastTime.current = now;
    }, 1000);

    return () => clearInterval(interval);
  }, [isListening]);

  // ✅ TAMBAH: Track frame count untuk FPS
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    const countFrame = () => {
      frameCount.current++;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  // Toggle fullscreen dengan double tap
  const doubleTapRef = useRef(0);
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - doubleTapRef.current < 300) {
      setIsFullscreen(!isFullscreen);
      doubleTapRef.current = 0;
    } else {
      doubleTapRef.current = now;
    }
  };

  const handleSensitivityChange = (value: number) => {
    setSensitivity(value);
  };

  const toggleFpsMonitor = () => {
    setIsListening(!isListening);
    if (isListening) {
      setFps(0);
    }
  };

  const resetToDefault = () => {
    setMode("bars");
    setSensitivity(0.5);
    setColorTheme("default");
    setIsFullscreen(false);
    Alert.alert("✅", "Visualizer reset ke default");
  };

  // Render mode selector
  const renderModeSelector = () => (
    <View
      style={[
        styles.modeSelector,
        {
          backgroundColor: colors.background.secondary,
          borderRadius: 25,
          padding: spacing.xs,
        },
      ]}
    >
      {(["bars", "wave", "circle"] as VisualizerMode[]).map((m) => (
        <TouchableOpacity
          key={m}
          style={[
            styles.modeButton,
            {
              paddingVertical: spacing.sm,
              alignItems: "center",
              borderRadius: 20,
              backgroundColor: mode === m ? colors.primary[500] : "transparent",
            },
          ]}
          onPress={() => setMode(m)}
        >
          <Text
            style={{
              color:
                mode === m ? colors.background.primary : colors.text.secondary,
              fontWeight: mode === m ? "600" : "400",
            }}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Render color theme selector
  const renderColorSelector = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginVertical: spacing.md }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        {(Object.keys(COLOR_PRESETS) as ColorTheme[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.colorButton,
              {
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: 20,
                backgroundColor:
                  colorTheme === key
                    ? COLOR_PRESETS[key].primary
                    : colors.background.secondary,
              },
            ]}
            onPress={() => setColorTheme(key)}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <View
                style={[
                  styles.colorDot,
                  {
                    backgroundColor: COLOR_PRESETS[key].primary,
                  },
                ]}
              />
              <Text
                style={{
                  color:
                    colorTheme === key
                      ? colors.background.primary
                      : colors.text.primary,
                }}
              >
                {COLOR_PRESETS[key].name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  // Main content
  const renderVisualizer = () => {
    const primaryColor = COLOR_PRESETS[colorTheme].primary;

    return (
      <View style={styles.visualizerWrapper}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleDoubleTap}
          style={styles.visualizerContainer}
        >
          {/* ✅ TAMBAH: audioSessionId wajib untuk visualizer */}
          <SpectrumAnalyzer
            isPlaying={isPlaying}
            audioSessionId={audioSessionId} // ✅ CRITICAL
            width={isFullscreen ? width : width - 40}
            height={isFullscreen ? height / 2 : 250}
            mode={mode}
            sensitivity={sensitivity}
            color={primaryColor}
            backgroundColor={colors.background.primary}
            showCenterArt={mode === "circle" && !!currentSong?.artwork}
            centerArt={currentSong?.artwork}
          />
        </TouchableOpacity>

        {isListening && (
          <View style={styles.fpsCounter}>
            <Text style={{ color: colors.text.primary, fontSize: 10 }}>
              {fps} fps
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Empty state
  if (!currentSong) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background.primary,
            paddingTop: safePadding.paddingTop,
            paddingBottom: safePadding.paddingBottom,
            paddingLeft: safePadding.paddingLeft,
            paddingRight: safePadding.paddingRight,
          },
        ]}
      >
        <View style={styles.centerContainer}>
          <Activity size={64} color={colors.text.tertiary} strokeWidth={1.8} />
          <Text
            style={[
              styles.emptyText,
              {
                color: colors.text.secondary,
                marginTop: spacing.lg,
                textAlign: "center",
                paddingHorizontal: spacing.xl,
              },
            ]}
          >
            Putar lagu untuk melihat visualizer
          </Text>
          {audioSessionId === 0 && (
            <Text
              style={{
                color: colors.text.tertiary,
                fontSize: 12,
                marginTop: spacing.md,
                textAlign: "center",
              }}
            >
              (Hubungkan DAC untuk visualizer)
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ✅ TAMBAH: Warning kalau tidak ada audio session
  const showSessionWarning = audioSessionId === 0 && isPlaying;

  return (
    <GestureHandlerRootView
      style={[
        styles.container,
        {
          backgroundColor: colors.background.primary,
          paddingTop: safePadding.paddingTop,
          paddingBottom: safePadding.paddingBottom + 20,
          paddingLeft: safePadding.paddingLeft,
          paddingRight: safePadding.paddingRight,
        },
      ]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Visualizer
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity onPress={toggleFpsMonitor}>
            <Gauge
              size={24}
              color={isListening ? colors.primary[500] : colors.text.secondary}
              strokeWidth={2.5}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <Settings size={24} color={colors.text.primary} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Session Warning */}
      {showSessionWarning && (
        <View
          style={{
            backgroundColor: colors.warning?.[500] || "#F59E0B",
            padding: spacing.sm,
            marginHorizontal: spacing.lg,
            borderRadius: 8,
            marginBottom: spacing.md,
          }}
        >
          <Text style={{ color: "#000", fontSize: 12, textAlign: "center" }}>
            Visualizer memerlukan audio session. Restart track atau reconnect
            DAC.
          </Text>
        </View>
      )}

      {/* Main Visualizer + Song Info */}
      <View style={[styles.mainContent, { flex: 1 }]}>
        {renderVisualizer()}

        <View style={[styles.songInfo, { paddingHorizontal: spacing.lg }]}>
          <Text
            style={[styles.songTitle, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {currentSong.title}
          </Text>
          <Text
            style={[styles.songArtist, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {currentSong.artist}
          </Text>

          {/* ✅ TAMBAH: DAC Info */}
          {currentDAC && (
            <Text
              style={{
                color: colors.text.tertiary,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              {currentDAC.name} •{" "}
              {audioSessionId > 0 ? "Active" : "Inactive"}
            </Text>
          )}
        </View>
      </View>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            {
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.background.primary,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: spacing.lg,
              },
            ]}
          >
            {/* Modal Header */}
            <View
              style={[
                styles.modalHeader,
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: spacing.lg,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: colors.text.primary,
                    fontSize: 20,
                    fontWeight: "700",
                  },
                ]}
              >
                Visualizer Settings
              </Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <X size={24} color={colors.text.secondary} strokeWidth={3} />
              </TouchableOpacity>
            </View>

            {/* Mode Selector */}
            <View style={{ marginBottom: spacing.lg }}>
              <Text
                style={[styles.settingLabel, { color: colors.text.secondary }]}
              >
                Mode
              </Text>
              {renderModeSelector()}
            </View>

            {/* Color Theme */}
            <View style={{ marginBottom: spacing.lg }}>
              <Text
                style={[styles.settingLabel, { color: colors.text.secondary }]}
              >
                Color Theme
              </Text>
              {renderColorSelector()}
            </View>

            {/* Sensitivity */}
            <View style={{ marginBottom: spacing.lg }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: colors.text.secondary },
                  ]}
                >
                  Sensitivity
                </Text>
                <Text style={{ color: colors.primary[500] }}>
                  {sensitivity.toFixed(1)}x
                </Text>
              </View>
              <Slider
                style={{ width: "100%", height: 40 }}
                minimumValue={0.2}
                maximumValue={1.5}
                step={0.1}
                value={sensitivity}
                onValueChange={handleSensitivityChange}
                minimumTrackTintColor={colors.primary[500]}
                maximumTrackTintColor={colors.background.tertiary}
                thumbTintColor={colors.primary[500]}
              />
            </View>

            {/* Audio Session Info */}
            <View
              style={{
                backgroundColor: colors.background.secondary,
                padding: spacing.md,
                borderRadius: 8,
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                Audio Session:{" "}
                {isPlaying ? "Global Mix (Active)" : "Not Playing"}
              </Text>
              {currentDAC && (
                <Text
                  style={{
                    color: colors.text.tertiary,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  DAC: {currentDAC.name}
                </Text>
              )}
            </View>

            {/* Reset & Fullscreen */}
            <TouchableOpacity
              style={[
                styles.resetButton,
                { backgroundColor: colors.background.secondary },
              ]}
              onPress={resetToDefault}
            >
              <Text style={{ color: colors.text.primary }}>
                Reset to Default
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.fullscreenButton,
                { backgroundColor: colors.primary[500] },
              ]}
              onPress={() => {
                setIsFullscreen(!isFullscreen);
                setShowSettings(false);
              }}
            >
              <Text style={{ color: colors.background.primary }}>
                {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "700" },
  mainContent: { flex: 1 },
  visualizerWrapper: { position: "relative" },
  visualizerContainer: { alignItems: "center" },
  modeSelector: { flexDirection: "row" },
  modeButton: { flex: 1 },
  colorButton: { borderRadius: 20 },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  songInfo: { alignItems: "center", marginTop: 20 },
  songTitle: { fontSize: 18, fontWeight: "600" },
  songArtist: { fontSize: 14, marginTop: 4 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: { fontSize: 16, textAlign: "center" },
  fpsCounter: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  settingLabel: { fontSize: 14, marginBottom: 8 },
  resetButton: {
    borderRadius: 8,
    alignItems: "center",
    padding: 14,
    marginBottom: 12,
  },
  fullscreenButton: {
    borderRadius: 8,
    alignItems: "center",
    padding: 14,
  },
});
