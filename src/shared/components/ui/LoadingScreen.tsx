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

import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";

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

// U-P1-23: TIDAK ADA lagi urutan teks boot palsu. Dulu BOOT_SEQUENCE
// ("Mounting High-Res Audio Engine…", "Optimizing Bit-Perfect Path…",
// …) jalan pakai timer 1 dtk/langkah dan memanggil onLoadingComplete
// sendiri setelah ~4,2 dtk — tidak terikat ke langkah init nyata (teks
// "Bit-Perfect" tampil bahkan di mode DSP), dan memaksa ready sebelum
// engine selesai init bila init lambat. Sekarang layar ini indeterminate
// yang jujur: satu label "Menyiapkan audio…" + waveform beranimasi, dan
// exit HANYA jalan saat parent memberi sinyal `finishing` — sinyal itu
// dikirim _layout setelah performInitialization() sukses, jadi ready
// tidak pernah mendahului engine.

// Waveform Bar Component
const WaveformBar = ({
  index,
  isExiting,
  color,
}: {
  index: number;
  isExiting: boolean;
  color: string;
}) => {
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
        { backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
};

interface LoadingScreenProps {
  onLoadingComplete?: () => void;
  // U-P1-23: true = init nyata sudah selesai, jalankan animasi keluar lalu
  // panggil onLoadingComplete. Selama false layar ini menunggu tanpa batas
  // waktu dan tanpa berpura-pura tahu sudah sejauh mana init berjalan.
  finishing?: boolean;
}

export default function LoadingScreen({
  onLoadingComplete,
  finishing = false,
}: LoadingScreenProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  // Aksen splash (waveform, badge, garis footer): emas tema selama terbaca
  // di atas latar, jatuh ke warna teks bila tidak (pola Equalizer).
  const accent = accentOn(
    [colors.primary[500]],
    colors.background.primary,
    [colors.text.primary, colors.text.secondary],
  );

  // Gradien latar: secondary -> primary. BUKAN gradient.primary tema
  // (emas->navy di Noir): logo icon.png berlatar navy akan jadi kotak navy
  // di atas emas. Gradien navy-ke-navy (Noir) / porcelain-ke-porcelain
  // (Porcelain) menjaga logo menyatu dengan latar seperti splash native.
  const bgGradient = [colors.background.secondary, colors.background.primary];

  // U-P1-23: label tunggal yang jujur — bukan klaim langkah init.
  const loadingText = "Menyiapkan audio…";
  const [isExiting, setIsExiting] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideUpAnim = useRef(new Animated.Value(0)).current;
  // Penjaga supaya onLoadingComplete hanya dipanggil sekali (StrictMode
  // bisa menjalankan effect dua kali; animasi yang dibatalkan tidak boleh
  // memicu completion — cek `finished` di callback).
  const exitStartedRef = useRef(false);

  // U-P1-23: exit dikendalikan parent lewat `finishing`, bukan timer
  // internal. Sebelumnya interval 1 dtk di sini yang memutuskan kapan
  // loading "selesai", lepas dari keadaan engine yang sebenarnya.
  useEffect(() => {
    if (!finishing || exitStartedRef.current) return;
    exitStartedRef.current = true;
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
    ]).start(({ finished }) => {
      if (finished) {
        onLoadingComplete?.();
      }
    });
  }, [finishing, fadeAnim, slideUpAnim, onLoadingComplete]);

  const containerStyle = {
    opacity: fadeAnim,
    transform: [{ translateY: slideUpAnim }],
  };

  return (
    <Animated.View
      style={[
        styles.container,
        containerStyle,
        { backgroundColor: colors.background.primary },
      ]}
    >
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />

      <LinearGradient
        colors={bgGradient as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />

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
              <WaveformBar key={i} index={i} isExiting={isExiting} color={accent} />
            ))}
          </View>
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
            {loadingText}
          </Text>
        </View>

        {/* Branding */}
        <View style={styles.brandContainer}>
          <Text style={[styles.pristineText, { color: colors.text.primary }]}>
            PRISTINE
          </Text>
          <View style={[styles.audioBadge, { borderColor: accent }]}>
            <Text style={[styles.audioText, { color: accent }]}>
              ULTRA HD AUDIO
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.creditText, { color: colors.text.tertiary }]}>
            HANDCRAFTED BY CURIOUSSHEVA
          </Text>
          <View style={[styles.line, { backgroundColor: accent }]} />
        </View>
      </View>
    </Animated.View>
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
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  brandContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  pristineText: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 10,
  },
  audioBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 4,
  },
  audioText: {
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
    fontSize: 16,
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
