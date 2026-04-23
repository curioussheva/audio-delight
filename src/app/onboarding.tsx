import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { DSPPipeline } from "@/features/visualizer/api/DSPPipeline";

type AudioMode = "bit-perfect" | "dsp";

interface ModeCardProps {
  mode: AudioMode;
  isSelected: boolean;
  onSelect: (mode: AudioMode) => void;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tags: string[];
  colors: any;
}

const ModeCard = ({
  mode,
  isSelected,
  onSelect,
  title,
  description,
  icon,
  tags,
  colors,
}: ModeCardProps) => (
  <TouchableOpacity
    activeOpacity={0.7}
    style={[
      styles.modeCard,
      {
        backgroundColor: isSelected
          ? colors.primary[500] + "15"
          : "transparent",
        borderColor: isSelected ? colors.primary[500] : "transparent",
      },
    ]}
    onPress={() => onSelect(mode)}
  >
    <View
      style={[
        styles.iconCircle,
        { backgroundColor: colors.primary[500] + "33" },
      ]}
    >
      <Ionicons name={icon} size={30} color={colors.primary[500]} />
    </View>
    <View style={styles.cardContent}>
      <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
        {title}
      </Text>
      <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
        {description}
      </Text>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <Text
            key={tag}
            style={[
              styles.tag,
              { borderColor: colors.primary[500], color: colors.primary[500] },
            ]}
          >
            {tag}
          </Text>
        ))}
      </View>
    </View>
  </TouchableOpacity>
);

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<AudioMode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Prevent back button during submission
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (isSubmitting) {
          return true; // Prevent back button during submission
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, [isSubmitting]);

  const handleSelectMode = (mode: AudioMode) => {
    console.log(`🔘 [Onboarding] Mode dipilih: ${mode}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMode(mode);
  };

  const handleFinish = async () => {
    if (!selectedMode || isSubmitting) return;

    setIsSubmitting(true);

    try {
      console.log(`[Onboarding] Finishing with mode: ${selectedMode}`);

      // Save preferences
      await AsyncStorage.setItem("audio_mode_preference", selectedMode);
      await AsyncStorage.setItem("has_onboarded", "true");

      // Set DSP processing mode
      await DSPPipeline.setProcessingMode(selectedMode);

      // Success haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Small delay for better UX
      setTimeout(() => {
        router.replace("/(drawer)/(tabs)/library");
      }, 100);
    } catch (error) {
      console.error("❌ [Onboarding] Error:", error);
      Alert.alert(
        "Setup Error",
        "Failed to complete setup. Please try again.",
        [{ text: "OK", onPress: () => setIsSubmitting(false) }],
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      // Don't reset isSubmitting if navigation succeeded
      // setIsSubmitting(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.primary,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.welcomeText, { color: colors.text.primary }]}>
          PristineAudio
        </Text>
        <View
          style={[styles.divider, { backgroundColor: colors.primary[500] }]}
        />
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Choose Your Audio Experience
        </Text>
      </View>

      <View style={styles.optionsContainer}>
        <ModeCard
          mode="bit-perfect"
          title="Bit-Perfect Mode"
          description="Output lossless murni. Terbaik untuk USB DAC & High-Res Audio."
          icon="lock-closed"
          tags={["LOSSLESS", "DAC"]}
          isSelected={selectedMode === "bit-perfect"}
          onSelect={handleSelectMode}
          colors={colors}
        />

        <ModeCard
          mode="dsp"
          title="DSP Mode"
          description="Equalizer, visualizer, & pemrosesan audio tingkat lanjut."
          icon="pulse"
          tags={["EQ", "FX"]}
          isSelected={selectedMode === "dsp"}
          onSelect={handleSelectMode}
          colors={colors}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          disabled={!selectedMode || isSubmitting}
          style={[
            styles.nextButton,
            {
              backgroundColor:
                selectedMode && !isSubmitting
                  ? colors.primary[500]
                  : colors.background.secondary,
            },
          ]}
          onPress={handleFinish}
        >
          <Text
            style={[
              styles.nextButtonText,
              {
                color:
                  selectedMode && !isSubmitting
                    ? "#000"
                    : colors.text.secondary,
              },
            ]}
          >
            {isSubmitting ? "Setting up..." : "Continue"}
          </Text>
        </TouchableOpacity>

        {!selectedMode && (
          <Text style={[styles.hintText, { color: colors.text.tertiary }]}>
            Select a mode to continue
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", marginTop: 40, marginBottom: 30 },
  logo: { width: 100, height: 100, marginBottom: 15 },
  welcomeText: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  divider: { height: 3, width: 40, borderRadius: 2, marginTop: 12 },
  optionsContainer: { flex: 1, paddingHorizontal: 24, gap: 16 },
  modeCard: {
    padding: 20,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
    }),
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  cardDescription: { fontSize: 13, lineHeight: 18, opacity: 0.7 },
  tagRow: { flexDirection: "row", marginTop: 12, gap: 8 },
  tag: {
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 20, alignItems: "center" },
  nextButton: {
    height: 58,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  nextButtonText: { fontSize: 16, fontWeight: "700" },
  hintText: { fontSize: 12, marginTop: 12, textAlign: "center" },
}); 