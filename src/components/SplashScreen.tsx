import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { COLORS, TYPOGRAPHY } from "@/constants/theme";

const { width } = Dimensions.get("window");

export const SplashScreen: React.FC<{ onFinish: () => void }> = ({
  onFinish,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Rotasi vinyl
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // Scale in animasi
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();

    // Fade in teks
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    // Animasi dot berkedip
    const createDotAnimation = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    };

    createDotAnimation(dot1Anim, 0);
    createDotAnimation(dot2Anim, 300);
    createDotAnimation(dot3Anim, 600);

    // Selesai setelah 3 detik
    const timer = setTimeout(onFinish, 3000);
    return () => clearTimeout(timer);
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      {/* Vinyl Disc */}
      <Animated.View
        style={[
          styles.vinylContainer,
          { transform: [{ rotate: spin }, { scale: scaleAnim }] },
        ]}
      >
        <Svg width={300} height={300} viewBox="0 0 300 300">
          {/* Outer Ring */}
          <Circle
            cx="150"
            cy="150"
            r="140"
            stroke={COLORS.primary[500]}
            strokeWidth="4"
            strokeDasharray="20 10"
            fill="none"
          />
          <Circle
            cx="150"
            cy="150"
            r="120"
            stroke={COLORS.primary[500]}
            strokeWidth="2"
            opacity="0.5"
            fill="none"
          />
          {/* Center */}
          <Circle
            cx="150"
            cy="150"
            r="100"
            fill={COLORS.background.secondary}
          />

          {/* Waveform */}
          <Path
            d="M90 150 L110 130 L130 170 L150 110 L170 170 L190 130 L210 150"
            stroke={COLORS.primary[500]}
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />

          {/* PA Letters */}
          <Path
            d="M110 180 L110 120 L140 120 Q160 120 160 140 Q160 160 140 160 L110 160"
            stroke={COLORS.text.primary}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          <Circle
            cx="180"
            cy="150"
            r="20"
            stroke={COLORS.text.primary}
            strokeWidth="8"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Text */}
      <Animated.View style={[styles.textContainer, { opacity: opacityAnim }]}>
        <Text style={styles.title}>PRISTINE</Text>
        <Text style={styles.subtitle}>AUDIO</Text>
        <Text style={styles.tagline}>High-Fidelity Audio Experience</Text>
      </Animated.View>

      {/* Animated Dots */}
      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { opacity: dot1Anim }]} />
        <Animated.View style={[styles.dot, { opacity: dot2Anim }]} />
        <Animated.View style={[styles.dot, { opacity: dot3Anim }]} />
      </View>

      {/* Wave */}
      <Svg width={width} height={100} style={styles.wave}>
        <Path
          d={`M0 50 Q${width * 0.25} 20, ${width * 0.5} 50 T${width} 50`}
          stroke={COLORS.primary[500]}
          strokeWidth="2"
          fill="none"
          opacity="0.3"
        />
        <Path
          d={`M0 70 Q${width * 0.25} 40, ${width * 0.5} 70 T${width} 70`}
          stroke={COLORS.primary[500]}
          strokeWidth="2"
          fill="none"
          opacity="0.2"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  vinylContainer: {
    marginBottom: 40,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    ...TYPOGRAPHY.h1,
    fontSize: 48,
    color: COLORS.text.primary,
    letterSpacing: 4,
    marginBottom: 8,
  },
  subtitle: {
    ...TYPOGRAPHY.h1,
    fontSize: 48,
    color: COLORS.primary[500],
    letterSpacing: 4,
    marginBottom: 16,
  },
  tagline: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text.secondary,
    fontSize: 18,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 60,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary[500],
    marginHorizontal: 8,
  },
  wave: {
    position: "absolute",
    bottom: 50,
  },
});
