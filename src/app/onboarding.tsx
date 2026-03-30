import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import NativeDSPModule from "@/features/visualizer/native/DSPModule";

// 1. Tipe Data Terpusat
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

// 2. Sub-Komponen untuk Card (Clean Code)
const ModeCard = ({ mode, isSelected, onSelect, title, description, icon, tags, colors }: ModeCardProps) => (
  <TouchableOpacity
    activeOpacity={0.7}
    style={[
      styles.modeCard,
      { backgroundColor: isSelected ? colors.primary[500] + "15" : "transparent" },
      isSelected && { borderColor: colors.primary[500] },
    ]}
    onPress={() => onSelect(mode)}
  >
    <View style={[styles.iconCircle, { backgroundColor: colors.primary[500] + "33" }]}>
      <Ionicons name={icon} size={30} color={colors.primary[500]} />
    </View>
    <View style={styles.cardContent}>
      <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{title}</Text>
      <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>{description}</Text>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <Text key={tag} style={[styles.tag, { borderColor: colors.primary[500], color: colors.primary[500] }]}>
            {tag}
          </Text>
        ))}
      </View>
    </View>
  </TouchableOpacity>
);

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<AudioMode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectMode = (mode: AudioMode) => {
    console.log(`🔘 [Onboarding] Mode dipilih: ${mode}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMode(mode);
  };

  const handleFinish = async () => {
    if (!selectedMode || isSubmitting) {
        console.log("⚠️ [Onboarding] Click diabaikan: belum pilih mode atau sedang submit.");
        return;
    }

    console.log("🚀 [Onboarding] Memulai proses handleFinish...");
    setIsSubmitting(true);

    try {
      // Step 1: Simpan Preferences
      console.log("💾 [Onboarding] Menyimpan ke AsyncStorage...");
      await Promise.all([
        AsyncStorage.setItem("audio_mode_preference", selectedMode),
        AsyncStorage.setItem("has_onboarded", "true"),
      ]);
      console.log("✅ [Onboarding] AsyncStorage berhasil diupdate.");

      // Step 2: Native Module Call
      if (NativeDSPModule) {
        const isBitPerfect = selectedMode === "bit-perfect";
        console.log(`🔌 [Onboarding] Memanggil NativeDSPModule.toggleExclusiveMode(${isBitPerfect})...`);

        // Kita beri timeout/safety agar tidak hang jika native module stuck
        await NativeDSPModule.toggleExclusiveMode?.(isBitPerfect);

        if (isBitPerfect) {
          console.log("🔌 [Onboarding] Memanggil NativeDSPModule.releaseAllFX()...");
          await NativeDSPModule.releaseAllFX?.();
        }
        console.log("✅ [Onboarding] Native Module calls selesai.");
      } else {
        console.warn("⚠️ [Onboarding] NativeDSPModule tidak terdeteksi!");
      }

      // Step 3: Navigasi
      console.log("📍 [Onboarding] Mencoba pindah ke rute: /library");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      router.replace("/library");
      console.log("🏁 [Onboarding] Fungsi router.replace telah dipanggil.");

    } catch (error) {
      console.error("❌ [Onboarding] CRASH/ERROR:", error);
      Alert.alert("Error", "Gagal menyelesaikan pengaturan.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
      console.log("🔚 [Onboarding] State isSubmitting dikembalikan ke false.");
    }
  };


  return (
    <SafeAreaView 
    style={[styles.container, { backgroundColor: colors.background.primary }]}
    // Tambahkan edges jika ingin kontrol lebih detail (opsional)
    edges={['right', 'top', 'left']} 
  >
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/logo.png")} // Path sudah disesuaikan untuk src/app/
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.welcomeText, { color: colors.text.primary }]}>PristineAudio</Text>
        <View style={[styles.divider, { backgroundColor: colors.primary[500] }]} />
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
            { backgroundColor: selectedMode ? colors.primary[500] : colors.background.secondary },
            !selectedMode && { opacity: 0.5 }
          ]}
          onPress={handleFinish}
        >
          <Text style={[styles.nextButtonText, { color: selectedMode ? "#000" : colors.text.secondary }]}>
            {isSubmitting ? "Processing..." : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", marginTop: 40, marginBottom: 30 },
  logo: { width: 100, height: 100, marginBottom: 15 },
  welcomeText: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  divider: { height: 3, width: 40, borderRadius: 2, marginTop: 8 },
  optionsContainer: { flex: 1, paddingHorizontal: 24, gap: 16 },
  modeCard: {
    padding: 20,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 }
    }),
  },
  iconCircle: { width: 52, height: 52, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  cardContent: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  cardDescription: { fontSize: 13, lineHeight: 18, opacity: 0.7 },
  tagRow: { flexDirection: "row", marginTop: 12, gap: 8 },
  tag: { fontSize: 9, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  footer: { paddingHorizontal: 24, paddingBottom: 20 },
  nextButton: { height: 58, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  nextButtonText: { fontSize: 16, fontWeight: "700" },
});  