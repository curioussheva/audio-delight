import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

const COLORS = {
  bgGradient: ["#000000", "#1a1a1a"] as const,
  accent: "#00D4AA",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0B0C0",
  credit: "#3A4B5E",
};

const BOOT_SEQUENCE = [
  "Mounting High-Res Audio Engine...",
  "Optimizing Bit-Perfect Path...",
  "Loading Pristine Soundstage...",
  "System Ready.",
];

// Komponen Waveform Sederhana
const WaveformBar = ({ index }: { index: number }) => {
  const heightValue = useSharedValue(10);

  useEffect(() => {
    heightValue.value = withDelay(
      index * 100,
      withRepeat(
        withSequence(
          withTiming(30 + Math.random() * 20, { duration: 500 }),
          withTiming(10, { duration: 500 }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightValue.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          width: 3,
          backgroundColor: COLORS.accent,
          borderRadius: 2,
          marginHorizontal: 2,
        },
        animatedStyle,
      ]}
    />
  );
};

export default function LoadingScreen() {
  const [loadingText, setLoadingText] = useState(BOOT_SEQUENCE[0]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Boot Text Logic
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step < BOOT_SEQUENCE.length) setLoadingText(BOOT_SEQUENCE[step]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {/* Background Fullscreen Gradient */}
      <LinearGradient
        colors={COLORS.bgGradient}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Logo Section dengan Aura Glow */}
        <View style={styles.logoWrapper}>
          <View style={styles.glowCircle} />
          <AnimatedExpoImage
            source={require("../../../../assets/images/icon.png")}
            style={[styles.logo, { transform: [{ scale: logoScale }] }]}
            contentFit="contain"
          />
        </View>

        {/* Custom Audio Waveform Loader */}
        <View style={styles.loaderArea}>
          <View style={styles.waveformContainer}>
            {[1, 2, 3, 4, 5].map((i) => (
              <WaveformBar key={i} index={i} />
            ))}
          </View>
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>

        {/* Branding Section */}
        <View style={styles.brandContainer}>
          <Text style={styles.pristineText}>PRISTINE</Text>
          <View style={styles.audioBadge}>
            <Text style={styles.audioText}>ULTRA HD AUDIO</Text>
          </View>
        </View>

        {/* Bottom Credit */}
        <View style={styles.footer}>
          <Text style={styles.creditText}>HANDCRAFTED BY CURIOUS SHEVA</Text>
          <View style={[styles.line, { backgroundColor: COLORS.accent }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 60,
  },
  logo: {
    width: width * 0.7,
    height: 180,
  },
  glowCircle: {
    position: "absolute",
    width: 200,
    height: 100,
    backgroundColor: COLORS.accent,
    borderRadius: 100,
    opacity: 0.1,
    filter: Platform.OS === "ios" ? "blur(40px)" : undefined, // Blur hanya support iOS di style standar
  },
  loaderArea: {
    alignItems: "center",
    height: 100,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    marginBottom: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    opacity: 0.8,
  },
  brandContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  pristineText: {
    color: COLORS.textPrimary,
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 12,
  },
  audioBadge: {
    marginTop: 5,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 4,
  },
  audioText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 4,
  },
  footer: {
    position: "absolute",
    bottom: 50,
    alignItems: "center",
  },
  creditText: {
    color: COLORS.credit,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: "700",
  },
  line: {
    height: 2,
    width: 20,
    marginTop: 8,
    borderRadius: 1,
    opacity: 0.5,
  },
});
