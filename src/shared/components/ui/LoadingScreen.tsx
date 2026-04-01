import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Image } from "expo-image";

const COLORS = {
  background: "#040B13",
  accent: "#00D4AA",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0B0C0",
  credit: "#5A6B7E",
};

const LOGO_SOURCE = require("../../../../assets/images/splash.png");

export default function LoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade + Scale masuk (sedikit lebih lambat dan elegan)
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1200,           // lebih halus
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 12,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();

    // Rotasi logo yang sangat lembut (bisa dinikmati selama loading)
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 18000,          // 32 detik sekali putaran (sangat slow)
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.content}>
        {/* Logo Area */}
        <View style={styles.logoContainer}>
          <Animated.Image
            source={LOGO_SOURCE}
            style={[
              styles.logo,
              {
                transform: [
                  { scale: scaleAnim },
                  {
                    rotate: rotateAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "7deg"],
                    }),
                  },
                ],
              },
            ]}
            contentFit="contain"
            transition={800}
          />
        </View>

        {/* Loading Indicator */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size={Platform.OS === "ios" ? "large" : 52}
            color={COLORS.accent}
          />
          <Text style={styles.loadingText}>Initializing Pure Sound Experience...</Text>
        </View>

        {/* Brand Text */}
        <View style={styles.brandContainer}>
          <Text style={styles.pristineText}>PRISTINE</Text>
          <Text style={styles.audioText}>AUDIO</Text>
        </View>

        {/* Credit */}
        <Text style={styles.creditText}>
          Proudly Presented by Curious Sheva
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 80,
  },
  logo: {
    width: 290,
    height: 165,
    shadowColor: "#00D4AA",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 25,
  },
  loadingContainer: {
    alignItems: "center",
    marginBottom: 70,
  },
  loadingText: {
    marginTop: 20,
    color: COLORS.textSecondary,
    fontSize: 15.5,
    letterSpacing: 1.3,
    fontWeight: "500",
    textAlign: "center",
  },
  brandContainer: {
    alignItems: "center",
  },
  pristineText: {
    fontSize: 46,
    fontWeight: "900",
    color: COLORS.textPrimary,
    letterSpacing: 8,
    textAlign: "center",
  },
  audioText: {
    fontSize: 18.5,
    fontWeight: "600",
    color: COLORS.textSecondary,
    letterSpacing: 9.5,
    marginTop: -8,
  },
  creditText: {
    position: "absolute",
    bottom: 60,
    color: COLORS.credit,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1,
  },
});