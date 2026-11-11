import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
const Platform = require("react-native").Platform;

import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore } from "@/features/player/store/playerStore";

export const AudioPropertyToast = () => {
  const { currentSong } = usePlayerStore();
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

  return (
    <Animated.View
      entering={FadeInUp.springify()}
      exiting={FadeOutUp}
      style={styles.container}
    >
      <BlurView intensity={60} tint="dark" style={styles.blur}>
        <View
          style={[
            styles.indicator,
            { backgroundColor: currentSong.isHiRes ? "#D4AF37" : "#00D4AA" },
          ]}
        />
        <Ionicons
          name={currentSong.isHiRes ? "ribbon" : "checkmark-circle"}
          size={18}
          color={currentSong.isHiRes ? "#D4AF37" : "#00D4AA"}
        />
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {currentSong.isHiRes ? "Hi-Res Audio File" : "Audio File"}
          </Text>
          <Text style={styles.details}>{detailsText}</Text>
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
    borderColor: "rgba(255,255,255,0.1)",
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
    color: "#FFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  details: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
