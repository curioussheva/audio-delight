// shared/components/ui/LoadingScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
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
  cancelAnimation,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");

const COLORS = {
  bgGradient: ["#000000", "#1a1a1a"] as const,
  accent: "#00D4AA",
  textSecondary: "#A0B0C0",
};

const BOOT_SEQUENCE = [
  "Mounting High-Res Audio Engine...",
  "Optimizing Bit-Perfect Path...",
  "Loading Pristine Soundstage...",
  "System Ready.",
];

// Waveform Bar Component
const WaveformBar = ({ index, isExiting }: { index: number; isExiting: boolean }) => {
  const heightValue = useSharedValue(10);

  useEffect(() => {
    if (isExiting) {
      cancelAnimation(heightValue);
      heightValue.value = withTiming(0, { duration: 300 });
      return;
    }

    heightValue.value = withDelay(
      index * 80,
      withRepeat(
        withSequence(
          withTiming(25 + Math.random() * 15, { duration: 400 }),
          withTiming(8, { duration: 400 }),
        ),
        -1,
        true,
      ),
    );

    return () => cancelAnimation(heightValue);
  }, [isExiting]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightValue.value,
    opacity: heightValue.value > 0 ? 1 : 0,
  }));

  return (
    <Reanimated.View
      style={[
        styles.waveformBar,
        { backgroundColor: COLORS.accent },
        animatedStyle,
      ]}
    />
  );
};

interface LoadingScreenProps {
  onLoadingComplete?: () => void;
}

export default function LoadingScreen({ onLoadingComplete }: LoadingScreenProps) {
  const [loadingText, setLoadingText] = useState(BOOT_SEQUENCE[0]);
  const [isExiting, setIsExiting] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideUpAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Boot text sequence - faster timing
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step < BOOT_SEQUENCE.length) {
        setLoadingText(BOOT_SEQUENCE[step]);
        
        // Trigger exit animation on last step
        if (step === BOOT_SEQUENCE.length - 1) {
          setTimeout(() => {
            setIsExiting(true);
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(slideUpAnim, {
                toValue: -50,
                duration: 500,
                useNativeDriver: true,
              }),
            ]).start(() => {
              onLoadingComplete?.();
            });
          }, 700);
        }
      }
    }, 1000); // Reduced from 2400ms

    return () => clearInterval(interval);
  }, [onLoadingComplete]);

  const containerStyle = {
    opacity: fadeAnim,
    transform: [{ translateY: slideUpAnim }],
  };

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <LinearGradient colors={COLORS.bgGradient} style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrapper}>
          <Image
            source={require("../../../../assets/images/icon.png")}
            style={styles.logo}
            contentFit="contain"
            transition={200}
          />
        </View>

        {/* Waveform */}
        <View style={styles.loaderArea}>
          <View style={styles.waveformContainer}>
            {[0, 1, 2, 3, 4].map((i) => (
              <WaveformBar key={i} index={i} isExiting={isExiting} />
            ))}
          </View>
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>

        {/* Branding */}
        <View style={styles.brandContainer}>
          <Text style={styles.pristineText}>PRISTINE</Text>
          <View style={styles.audioBadge}>
            <Text style={styles.audioText}>ULTRA HD AUDIO</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.creditText}>HANDCRAFTED BY CuriousSheva</Text>
          <View style={[styles.line, { backgroundColor: COLORS.accent }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapper: {
    marginBottom: 40,
  },
  logo: {
    width: width * 0.5,
    height: 120,
  },
  loaderArea: {
    alignItems: "center",
    height: 80,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    marginBottom: 12,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  brandContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  pristineText: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 10,
  },
  audioBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    color: "#3A4B5E",
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
 