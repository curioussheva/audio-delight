import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
const Platform = require("react-native").Platform;

import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";

export const AudioPropertyToast = () => {
  const { currentSong } = usePlayerStore();
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (currentSong) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3500); // Muncul selama 3.5 detik
      return () => clearTimeout(timer);
    }
  }, [currentSong]);

  if (!visible || !currentSong) return null;

  // Judul melabeli FILE, bukan output (U-P1-03): isHiRes adalah properti
  // file, sementara output bisa di-resample/di-DSP atau fallback ke
  // shared — mengklaim "Output" dari properti file itu palsu.
  // Detail teknis hanya menampilkan nilai yang benar-benar ada; yang
  // tidak ada dihilangkan (dulu bitDepth kosong tampil "undefinedbit").
  const detailsParts: string[] = [];
  if (currentSong.codec) detailsParts.push(currentSong.codec.toUpperCase());
  if (currentSong.bitDepth) detailsParts.push(`${currentSong.bitDepth}bit`);
  if (currentSong.sampleRate)
    detailsParts.push(`${currentSong.sampleRate / 1000}kHz`);
  const detailsText =
    detailsParts.length > 0 ? detailsParts.join(" • ") : "—";

  // U-P2-13: dulu emas #D4AF37 / teal #00D4AA hardcoded — emasnya bukan
  // emas brand (#C9A96A) dan keduanya mengabaikan tema. Sekarang dari
  // token tema: Hi-Res = primary[500] (emas champagne brand di Noir,
  // bronze di Porcelain), non-Hi-Res = accentOn di atas elevated.
  // Blur ikut tema (gelap di Noir, terang di Porcelain) supaya pasangan
  // warnanya tetap lolos (diukur rumus contrast.ts, vs elevated):
  // primary[500] Noir 5,77 / Porcelain 6,29; aksen perak Noir 8,30 /
  // bronze Porcelain 6,29; teks text.primary/secondary 11,82–18,13.
  const hiResColor = colors.primary[500];
  const standardColor = accentOn(
    [colors.accent.primary],
    colors.background.elevated,
    [colors.text.primary],
  );
  const accentColor = currentSong.isHiRes ? hiResColor : standardColor;

  return (
    <Animated.View
      entering={FadeInUp.springify()}
      exiting={FadeOutUp}
      style={styles.container}
    >
      <BlurView
        intensity={60}
        tint={isDark ? "dark" : "light"}
        style={[
          styles.blur,
          {
            backgroundColor: colors.background.elevated,
            borderColor: colors.border.light,
          },
        ]}
      >
        <View style={[styles.indicator, { backgroundColor: accentColor }]} />
        <Ionicons
          name={currentSong.isHiRes ? "ribbon" : "checkmark-circle"}
          size={18}
          color={accentColor}
        />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {currentSong.isHiRes ? "Hi-Res Audio File" : "Audio File"}
          </Text>
          <Text style={[styles.details, { color: colors.text.secondary }]}>
            {detailsText}
          </Text>
        </View>
      </BlurView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    alignSelf: "center",
    zIndex: 9999,
    width: "85%",
  },
  blur: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  indicator: {
    width: 4,
    height: 25,
    borderRadius: 2,
    marginRight: 12,
  },
  textContainer: {
    marginLeft: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  details: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
