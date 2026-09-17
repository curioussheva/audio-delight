import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import { NativeModules } from "react-native";

console.log("[BOOT] 0. _layout module loaded");
const Platform = require("react-native").Platform;
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { Animated, StyleSheet, View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider } from "@/context/ThemeContext";
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";

import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";

SplashScreen.preventAutoHideAsync();

type AppInitState = "initializing" | "loading" | "ready" | "error";

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);
  const hasTriggeredDummyPlay = useRef(false);

  const initStore = usePlayerStore((s) => s.initStore);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);

  // DSP Guard
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.audioMode === "bit-perfect") {
        const eqStore = useEqualizerStore.getState();
        if (eqStore.isEQEnabled) {
          console.log("🛡️ [System] Bit-Perfect Mode active, disabling DSP.");
          eqStore.setEQEnabled(false);
        }
      }
    });
    return unsub;
  }, []);

  // Init
  const performInitialization = useCallback(async () => {
    try {
      console.log("[BOOT] 1. Initializing Audio Engine & Stores...");
      await audioEngine.initialize();
      await initStore();

      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      const eqStore = useEqualizerStore.getState();

      if (savedMode === "bit-perfect") {
        await setAudioMode("bit-perfect");
        eqStore.setEQEnabled(false);
      } else {
        await setAudioMode("dsp");
      }

      console.log("[BOOT] ✅ Engine & Store initialization success.");
      setAppState("loading");
    } catch (error) {
      console.error("[BOOT] ❌ Initialization Fatal Error:", error);
      setErrorMessage(error instanceof Error ? error.message : "Engine Failure");
      setAppState("error");
    }
  }, [initStore, setAudioMode]);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      performInitialization();
    }
  }, [performInitialization]);

  // 🔥 DUMMY AUTOPLAY untuk DEBUG
  useEffect(() => {
    if (appState !== "ready" || hasTriggeredDummyPlay.current) return;
    hasTriggeredDummyPlay.current = true;

    const timer = setTimeout(async () => {
      try {
        console.log("[DUMMY] 🔥 Starting autoplay test...");
        const module = NativeModules.NativePlaybackModule;
        if (!module) return;

        const testUri = "/storage/emulated/0/Music/The Rose - Leo Rojas.mp3";  // ← Leo Rojas test file

        await module.setQueue([testUri]);
        console.log("[DUMMY] ✅ setQueue done");
        await module.play();
        console.log("[DUMMY] ✅ play() done");

        // 🔥 Monitor setiap 2 detik, 5 kali
        let checkCount = 0;
        const interval = setInterval(() => {
          checkCount++;
          try {
            const status = module.getStatus();
            const position = module.getPosition();
            console.log(`[DUMMY] Check #${checkCount} - Status: ${status} Position: ${position}`);
          } catch (e) {}
          
          if (checkCount >= 5) clearInterval(interval);
        }, 2000);

      } catch (e) {
        console.error("[DUMMY] ❌ Error:", e);
      }
    }, 10000);

    return () => clearTimeout(timer);
}, [appState]);

  const handleLoadingComplete = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    setTimeout(() => {
      setAppState("ready");
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 200);
  }, [contentOpacity]);

  if (appState === "error") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>System Engine Failure</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setAppState("initializing");
                hasInitialized.current = false;
                performInitialization();
              }}
            >
              <Text style={styles.retryText}>Retry Initialize</Text>
            </TouchableOpacity>
          </View>
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <LoadingScreen onLoadingComplete={handleLoadingComplete} />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#000" },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(drawer)" />
              <Stack.Screen
                name="player/index"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                  gestureEnabled: true,
                  gestureDirection: "vertical",
                }}
              />
            </Stack>
            <AudioPropertyToast />
          </Animated.View>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  errorTitle: {
    color: "#FF4444",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  errorMessage: {
    color: "#888",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 20,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderColor: "#00D4AA",
    borderWidth: 1.5,
    borderRadius: 12,
  },
  retryText: { color: "#00D4AA", fontWeight: "bold", fontSize: 16 },
}); 