import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { 
  AppState as RNAppState, 
  Platform, 
  Animated, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity 
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Context & Theme
import { ThemeProvider } from "@/context/ThemeContext";

// Components
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";

// Core Engine & Stores
import TrackPlayer from "react-native-track-player";
import { audioEngine } from "@/features/player/api/engine";
import { playbackService } from "@/features/player/api/playback";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";

// Register Playback Service
TrackPlayer.registerPlaybackService(() => playbackService);
SplashScreen.preventAutoHideAsync();

type AppInitState = "initializing" | "loading" | "ready" | "error";

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);

  // Store Selectors
  const initStore = usePlayerStore((s) => s.initStore);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);
  const isAutoScanEnabled = useLibraryStore((s) => s.isAutoScanEnabled);

  // --- 1. Master Audio Sync (DSP & Bit-Perfect) ---
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.audioMode === "bit-perfect") {
        console.log("🛡️ [System] Bit-Perfect Active: Disabling DSP");
        const eqEnabled = useEqualizerStore.getState().isEQEnabled;
        if (eqEnabled) {
          useEqualizerStore.getState().setEQEnabled(false);
        }
      }
    });

    return unsub;
  }, []);

  // --- 2. Background Task Orchestrator ---
  // Mendaftarkan atau menghapus task berdasarkan toggle user
  useEffect(() => {
    if (appState !== "ready" || Platform.OS !== "android") return;

    const syncBackgroundTask = async () => {
      if (isAutoScanEnabled) {
        await BackgroundScanTask.register(60); // Scan tiap 60 menit
      } else {
        await BackgroundScanTask.unregister();
      }
    };

    syncBackgroundTask();
  }, [isAutoScanEnabled, appState]);

  // --- 3. Core Initialization Logic ---
  const performInitialization = useCallback(async () => {
    try {
      console.log("[App] Starting Core Initialization...");
      
      // A. Driver & Base Store
      await audioEngine.initialize();
      await initStore();

      // B. Load Preferences & Guard EQ vs Bit-Perfect
      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      const eqStore = useEqualizerStore.getState();

      if (savedMode === "bit-perfect") {
        await setAudioMode("bit-perfect");
        await eqStore.setEQEnabled(false);
      } else {
        await setAudioMode("dsp");
        if (eqStore.isEQEnabled) await eqStore.setEQEnabled(true);
      }

      console.log("[App] Core Init Success");
      setAppState("loading");
    } catch (error) {
      console.error("[App] Init Failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Initialization Error");
      setAppState("error");
    }
  }, [initStore, setAudioMode]);

  // --- 4. Lifecycle Handlers ---
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      performInitialization();
    }
  }, [performInitialization]);

  const handleLoadingComplete = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    
    // Memberikan jeda halus sebelum transisi opacity
    setTimeout(() => {
      setAppState("ready");
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 200);
  }, [contentOpacity]);

  // --- Rendering Logic ---
  if (appState === "error") {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Pristine Audio Engine Failure</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity 
          style={styles.retryButton} 
          onPress={() => {
            setAppState("initializing");
            hasInitialized.current = false;
            performInitialization();
          }}
        >
          <Text style={styles.retryText}>Retry Init</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // State loading & initializing menggunakan LoadingScreen
  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LoadingScreen onLoadingComplete={handleLoadingComplete} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Animated.View style={[styles.container, { opacity: contentOpacity }]}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(drawer)" />
              <Stack.Screen 
                name="player/index" 
                options={{ 
                  presentation: "modal", 
                  animation: "slide_from_bottom",
                  gestureEnabled: true,
                  gestureDirection: "vertical"
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
  container: { flex: 1, backgroundColor: '#000' },
  errorContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#000', 
    padding: 20 
  },
  errorTitle: { color: '#FF4444', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  errorMessage: { color: '#888', textAlign: 'center', marginBottom: 20 },
  retryButton: { 
    paddingVertical: 12, 
    paddingHorizontal: 24, 
    borderColor: '#00D4AA', 
    borderWidth: 1, 
    borderRadius: 8 
  },
  retryText: { color: '#00D4AA', fontWeight: 'bold' }
});
  