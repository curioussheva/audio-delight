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
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";

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
  const isAutoScanEnabled = useLibraryStore((s) => s.isAutoScanEnabled);

  // --- Helper Autoplay CI (Dengan Safe Retry Limit) ---
  const triggerAutoplayForCI = useCallback(async (retries = 10) => {
    if (retries <= 0) {
      console.warn("[DUMMY] ⚠️ PlaybackService timeout/gagal terikat setelah beberapa kali coba.");
      return;
    }

    try {
      const service = audioEngine.playbackService;

      if (!service) {
        console.warn(`[DUMMY] PlaybackService belum siap, mencoba lagi (${retries} sisa)...`);
        setTimeout(() => triggerAutoplayForCI(retries - 1), 1000);
        return;
      }

      console.log("[DUMMY] 🔥 Triggering autoplay for CI log testing...");
      
      const testTrack = {
        id: "test_001",
        title: "SoundHelix Test Tone",
        artist: "SoundHelix",
        album: "Debug",
        duration: 18000,
        uri: "/storage/emulated/0/Music/test.mp3",
      };

      if (typeof audioEngine.playTestTrack === "function") {
        await audioEngine.playTestTrack(testTrack);
      } else {
        await service.setQueue([testTrack]);
        await service.play();
      }
      console.log("[DUMMY] ✅ Autoplay berhasil dijalankan!");
    } catch (err) {
      console.error("[DUMMY] ❌ Autoplay failed:", err);
    }
  }, []);

  // --- 2. Master Audio Sync (DSP Guard) ---
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

  // --- 3. Background Task Registrar (Android) ---
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
      console.log("[BOOT] 1. Initializing Audio Engine & Stores...");

      await audioEngine.initialize();
      await initStore();

      // Load saved audio mode
      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      const eqStore = useEqualizerStore.getState();

      if (savedMode === "bit-perfect") {
        await setAudioMode("bit-perfect");
        eqStore.setEQEnabled(false);
      } else {
        await setAudioMode("dsp");
      }

      console.log("[BOOT] Core Initialization Success.");
      setAppState("loading");

      // Trigger CI Test Autoplay
      triggerAutoplayForCI();
    } catch (error) {
      console.error("[BOOT] Initialization failed:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Pristine Engine Failure"
      );
      setAppState("error");
    }
  }, [initStore, setAudioMode, triggerAutoplayForCI]);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      performInitialization();
    }
  }, [performInitialization]);

  // --- UI Handlers ---
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

  // --- UI STATE: SYSTEM ERROR ---
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

  // --- UI STATE: INITIALIZING / LOADING ---
  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <LoadingScreen onLoadingComplete={handleLoadingComplete} />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // --- UI STATE: READY ---
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
            <Stack screenOptions={{ headerShown: false }}>
              {/* Cukup daftarkan route yang memerlukan opsi khusus (seperti modal/animation) */}
              <Stack.Screen
                name="song/[id]"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
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
 