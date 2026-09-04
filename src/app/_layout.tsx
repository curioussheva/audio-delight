import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

console.log("[BOOT] 0. _layout module loaded");
const Platform = require("react-native").Platform;
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as MediaLibrary from "expo-media-library";
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

type AppInitState = "initializing" | "permission_denied" | "loading" | "ready" | "error";

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);
  const hasTriggeredDummyPlay = useRef(false);

  // --- 1. Store Selectors ---
  const initStore = usePlayerStore((s) => s.initStore);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);
  const isAutoScanEnabled = useLibraryStore((s) => s.isAutoScanEnabled);

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

  // --- 3. Background Task Registrar (Android Task Scheduler) ---
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

  // --- 4. Core Initialization Logic (Engine & Permission Gatekeeper) ---
  const performInitialization = useCallback(async () => {
    try {
      console.log("[BOOT] 1. _layout performInitialization start");

      // 🔴 A. Cek & Request Permission File Media (Android/iOS)
      if (Platform.OS === "android") {
        console.log("[BOOT] Checking media permissions...");
        const { status } = await MediaLibrary.getPermissionsAsync();

        if (status !== "granted") {
          console.log("[BOOT] Requesting media permissions...");
          const request = await MediaLibrary.requestPermissionsAsync();

          if (request.status !== "granted") {
            console.warn("[BOOT] Media permission denied.");
            setAppState("permission_denied");
            return; // Tahan startup jika tidak ada izin file
          }
        }
        console.log("[BOOT] ✅ Media Permission Granted!");
      }

      // 🟢 B. Inisialisasi Audio Engine & Player Store
      console.log("[BOOT] 2. audioEngine.initialize() calling...");
      await audioEngine.initialize();
      console.log("[BOOT] 3. audioEngine.initialize() done");
      
      await initStore();
      console.log("[BOOT] 4. initStore() done");

      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      const eqStore = useEqualizerStore.getState();

      if (savedMode === "bit-perfect") {
        await setAudioMode("bit-perfect");
        eqStore.setEQEnabled(false);
      } else {
        await setAudioMode("dsp");
      }

      // 🟢 C. Core Setup Selesai
      // Note: Panggilan Scanning DISENGAJA TIDAK ADA di sini.
      // Scanner dihandle penuh oleh `useScanManager` di layar utama.
      console.log("[BOOT] ✅ Core Initialization Success.");
      setAppState("loading");
    } catch (error) {
      console.error("[BOOT] ❌ Initialization Fatal Error:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Pristine Engine Failure",
      );
      setAppState("error");
    }
  }, [initStore, setAudioMode]);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      performInitialization();
    }
  }, [performInitialization]);

  // ============================================================
  // 🔥 DUMMY AUTOPLAY UNTUK DEBUG (PAKAI PATH ABSOLUT) 🔥
  // ============================================================
  useEffect(() => {
    if (appState !== "ready" || hasTriggeredDummyPlay.current) return;
    hasTriggeredDummyPlay.current = true;

    const autoPlayTestTrack = async () => {
      try {
        console.log("[DUMMY] 🔥 Triggering autoplay with ABSOLUTE PATH...");

        const testTrack = {
          id: "test_001",
          uri: "/storage/emulated/0/Music/test.mp3",
          title: "SoundHelix Test Tone",
          artist: "SoundHelix",
          album: "Debug",
          duration: 18000,
        };

        console.log("[DUMMY] Track:", testTrack);

        const service = audioEngine.playbackService;
        if (!service) {
          console.error("[DUMMY] ❌ audioEngine.playbackService is null!");
          return;
        }

        console.log("[DUMMY] Setting queue...");
        await service.setQueue([testTrack]);

        console.log("[DUMMY] Calling play()...");
        await service.play();

        console.log("[DUMMY] ✅ Play command sent. Check audio logs!");
      } catch (e) {
        console.error("[DUMMY] ❌ Autoplay error:", e);
      }
    };

    const timer = setTimeout(autoPlayTestTrack, 3000);
    return () => clearTimeout(timer);
  }, [appState]);

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

  // --- UI STATE: PERMISSION DENIED ---
  if (appState === "permission_denied") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Akses Storage Diperlukan</Text>
            <Text style={styles.errorMessage}>
              PristineAudio membutuhkan izin membaca file media di perangkat kamu untuk memindai dan memutar lagu.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setAppState("initializing");
                performInitialization();
              }}
            >
              <Text style={styles.retryText}>Berikan Izin Akses</Text>
            </TouchableOpacity>
          </View>
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

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
                hasTriggeredDummyPlay.current = false;
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
 