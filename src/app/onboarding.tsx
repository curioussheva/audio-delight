import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import NativeDSPModule from "@/services/native/NativeDSPModule";

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<
    "bit-perfect" | "dsp" | null
  >(null);

  const handleSelectMode = (mode: "bit-perfect" | "dsp") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMode(mode);
  };

  const handleFinish = async () => {
    if (!selectedMode) return;

    try {
      await AsyncStorage.setItem("audio_mode_preference", selectedMode);
      await AsyncStorage.setItem("has_onboarded", "true");

      if (selectedMode === "bit-perfect") {
        await NativeDSPModule.toggleExclusiveMode(true);
        await NativeDSPModule.releaseAllFX();
      } else {
        await NativeDSPModule.toggleExclusiveMode(false);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(drawer)/(tabs)/library");
    } catch (error) {
      console.error("Onboarding failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <View style={styles.header}>
        {/* Path logo diperbaiki: naik 2 level dari src/app/onboarding.tsx */}
        <Image
          source={require("../../assets/images/logo.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.welcomeText, { color: colors.text.primary }]}>
          Welcome to PristineAudio
        </Text>
        <View
          style={[styles.divider, { backgroundColor: colors.primary[500] }]}
        />
      </View>

      <View style={styles.optionsContainer}>
        {/* Card Bit-Perfect */}
        <TouchableOpacity
          style={[
            styles.modeCard,
            selectedMode === "bit-perfect" && {
              borderColor: colors.primary[500],
            },
          ]}
          onPress={() => handleSelectMode("bit-perfect")}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.primary[500] + "33" },
            ]}
          >
            <Ionicons
              name="lock-closed"
              size={32}
              color={colors.primary[500]}
            />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
              Bit-Perfect Mode
            </Text>
            <Text
              style={[styles.cardDescription, { color: colors.text.secondary }]}
            >
              Raw, lossless output. Ideal for USB DAC & hi-res audio.
            </Text>
            <View style={styles.tagRow}>
              <Text style={styles.tag}>LOSSLESS</Text>
              <Text style={styles.tag}>DAC</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Card DSP - warna secondary diganti pakai primary biar sesuai tipe */}
        <TouchableOpacity
          style={[
            styles.modeCard,
            selectedMode === "dsp" && { borderColor: colors.primary[500] },
          ]}
          onPress={() => handleSelectMode("dsp")}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.primary[500] + "33" },
            ]}
          >
            <Ionicons name="pulse" size={32} color={colors.primary[500]} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
              DSP Mode
            </Text>
            <Text
              style={[styles.cardDescription, { color: colors.text.secondary }]}
            >
              Equalizer, visualizer, & enhanced processing.
            </Text>
            <View style={styles.tagRow}>
              <Text style={styles.tag}>EQ</Text>
              <Text style={styles.tag}>VISUALIZER</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Next Button - gray diganti hardcode sementara */}
      <TouchableOpacity
        style={[
          styles.nextButton,
          { backgroundColor: selectedMode ? colors.primary[500] : "#4A4A4A" },
        ]}
        onPress={handleFinish}
        disabled={!selectedMode}
      >
        <Text style={styles.nextButtonText}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// Styles tetap sama, tidak diubah
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", marginTop: 60, marginBottom: 40 },
  logo: { width: 120, height: 120, marginBottom: 20 },
  welcomeText: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  divider: { height: 4, width: 80, borderRadius: 2 },
  optionsContainer: { flex: 1, gap: 16, paddingHorizontal: 20 },
  modeCard: {
    padding: 20,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  cardDescription: { fontSize: 12, lineHeight: 18, opacity: 0.8 },
  tagRow: { flexDirection: "row", marginTop: 10, gap: 6 },
  tag: {
    fontSize: 8,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#D4AF37",
    color: "#D4AF37",
  },
  nextButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#00D4AA",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  nextButtonText: { fontSize: 15, fontWeight: "800", letterSpacing: 1 },
});
