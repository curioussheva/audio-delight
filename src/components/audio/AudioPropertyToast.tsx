import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Platform } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore } from "@/store/playerStore";

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
            {currentSong.isHiRes ? "Hi-Res Audio Output" : "Pure Audio Output"}
          </Text>
          <Text style={styles.details}>
            {currentSong.codec?.toUpperCase()} • {currentSong.bitDepth}bit /{" "}
            {(currentSong.sampleRate || 0) / 1000}kHz.
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
