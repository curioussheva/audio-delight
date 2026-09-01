
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

console.log("[BOOT] 0. _layout module loaded");
const Platform = require("react-native").Platform;
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import {
  Animated,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Context & Theme
import { ThemeProvider } from "@/context/ThemeContext";

// Components
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";

// Core Engine & Stores

import { audioEngine } from "@/features/player/api/engine";
import { playbackService } from "@/features/player/api/playback";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { RNTP_ENABLED } from "@/features/player/api/rntpEnabled";


// Register Playback Service
// Custom playback service is used, no RNTP registration needed
console.log("RNTP disabled, custom playback service will be used");
SplashScreen.preventAutoHideAsync();

type AppInitState = "initializing" | "loading" | "ready" | "error";

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);

  // --- 1. Store Selectors ---
  const initStore = usePlayerStore((s) => s.initStore);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);
  const {
    isAutoScanEnabled,
    hasCompletedInitialScan,
    setInitialScanCompleted,
  } = useLibraryStore();

  // --- 2. Master Audio Sync (DSP Guard) ---
  // Memastikan jika Bit-Perfect aktif, EQ dipaksa mati secara sistem
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

  // --- 3. Background Task Orchestrator ---
  useEffect(() => {
    if (appState !== "ready" || Platform.OS !== "android") return;

    const syncBackgroundTask = async () => {
      try {
        if (isAutoScanEnabled) {
          await BackgroundScanTask.register(60);
        } else {
          await BackgroundScanTask.unregister();
        }
      } catch (e) {
        console.warn("[App] Background Task Sync failed:", e);
      }
    };

    syncBackgroundTask();
  }, [isAutoScanEnabled, appState]);

  // --- 4. Core Initialization Logic ---
  const performInitialization = useCallback(async () => {
    try {
      console.log("[BOOT] 5. _layout performInitialization start");

      // A. Driver & Base Store Init
      console.log("[BOOT] 6. audioEngine.initialize() calling...");
      await audioEngine.initialize();
      console.log("[BOOT] 7. audioEngine.initialize() done");
      await initStore();
      console.log("[BOOT] 8. initStore() done");

      // B. Load Preferences (Audio Mode & DSP)
      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      const eqStore = useEqualizerStore.getState();

      if (savedMode === "bit-perfect") {
        await setAudioMode("bit-perfect");
        eqStore.setEQEnabled(false);
      } else {
        await setAudioMode("dsp");
        // EQ akan mengikuti state terakhir yang tersimpan di store
      }

      // C. INITIAL QUICK SCAN (Hanya sekali seumur hidup app)
      if (!hasCompletedInitialScan) {
        console.log("[App] First install detected, performing initial scan...");
        try {
          // Ganti dengan fungsi scan library asli Anda jika sudah siap
          // await libraryScanner.scanAll();

          setInitialScanCompleted();
          console.log("[App] Initial scan successful.");
        } catch (scanError) {
          console.error("[App] Initial scan failed:", scanError);
        }
      }

      console.log("[App] Core Initialization Success.");
      setAppState("loading");
    } catch (error) {
      console.error("[App] Initialization Fatal Error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Pristine Engine Failure",
      );
      setAppState("error");
    }
  }, [
    initStore,
    setAudioMode,
    hasCompletedInitialScan,
    setInitialScanCompleted,
  ]);

  // --- 5. Lifecycle Hooks ---
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      performInitialization();
    }
  }, [performInitialization]);

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
