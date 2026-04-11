// app/_layout.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Stack, 
  usePathname,
  useRootNavigationState,
  useSegments 
} from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { 
  AppState as RNAppState,  // ✅ alias untuk React Native AppState
  Platform, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider } from "@/context/ThemeContext";
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

import TrackPlayer from "react-native-track-player";
import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { playbackService } from "@/features/player/api/playback";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";

// Register playback service
TrackPlayer.registerPlaybackService(() => playbackService);

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Local type untuk app initialization state — nama berbeda dari RNAppState
type AppInitState = 
  | "initializing"
  | "loading"
  | "ready"
  | "error";

export default function RootLayout() {
  // ✅ Pakai AppInitState, bukan AppState
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const contentOpacity = useRef(new Animated.Value(0)).current;
  
  const initStore = usePlayerStore((state) => state.initStore);
  const autoScanEnabled = useLibraryStore((s) => s.isAutoScanning);
  const setAudioMode = usePlayerStore((state) => state.setAudioMode);
  
  const pathname = usePathname();
  const segments = useSegments();
  const isPlayerOpen = pathname?.startsWith("/player");
  
  const hasInitialized = useRef(false);
  // ✅ Pakai RNAppState untuk addEventListener
  const appStateSubscription = useRef<ReturnType<typeof RNAppState.addEventListener> | null>(null);

  // --- Master Audio Sync ---
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.audioMode === "bit-perfect") {
        console.log("🛡️ [System Sync] Bit-Perfect Active: Forcing DSP Off");
        useEqualizerStore.getState().setEQEnabled(false);
      }
    });
    return unsub;
  }, []);

  // --- Background Task Registration ---
  useEffect(() => {
    if (Platform.OS !== "android") return;
    
    if (autoScanEnabled) {
      BackgroundScanTask.register(30).catch((err) =>
        console.warn("[BackgroundTask] Registration failed:", err),
      );
    } else {
      BackgroundScanTask.unregister().catch((err) =>
        console.warn("[BackgroundTask] Unregistration failed:", err),
      );
    }
  }, [autoScanEnabled]);

  // --- App State Listener (Resume Playback) ---
  useEffect(() => {
    // ✅ Pakai RNAppState
    appStateSubscription.current = RNAppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        const { isPlaying, currentSong } = usePlayerStore.getState();
        if (isPlaying && currentSong) {
          TrackPlayer.play().catch((err) =>
            console.warn("[App] Failed to resume playback:", err),
          );
        }
      }
    });

    return () => appStateSubscription.current?.remove();
  }, []);

  // --- Core Initialization Logic ---
  const performInitialization = useCallback(async () => {
    try {
      console.log("[App] Starting initialization...");
      
      audioEngine.initialize().catch((err) => 
        console.warn("[App] Audio engine init warning:", err.message)
      );

      await initStore();

      const eqStore = useEqualizerStore.getState();
      await eqStore.setEQEnabled(eqStore.isEQEnabled);

      const savedMode = await AsyncStorage.getItem("audio_mode_preference");
      if (savedMode && (savedMode === "bit-perfect" || savedMode === "dsp")) {
        await setAudioMode(savedMode);
      }

      console.log("[App] Core initialization complete");
      
    } catch (error) {
      console.error("[App] Initialization failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      setAppState("error");
      throw error;
    }
  }, [initStore, setAudioMode]);

  // --- Handle Loading Complete ---
  const handleLoadingComplete = useCallback(() => {
    console.log("[App] LoadingScreen complete, transitioning to app...");
    
    SplashScreen.hideAsync().catch(() => {});

    setTimeout(() => {
      setAppState("ready");
      
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 400);
  }, [contentOpacity]);

  // --- Start Initialization ---
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    performInitialization().then(() => {
      setAppState("loading");
    }).catch(() => {});
  }, [performInitialization]);

  // --- Retry Handler ---
  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setAppState("initializing");
    hasInitialized.current = false;
    
    setTimeout(() => {
      performInitialization().then(() => {
        setAppState("loading");
      });
    }, 100);
  }, [performInitialization]);

  // --- Error State ---
  if (appState === "error") {
    return (
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Failed to initialize app</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Tap to Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // --- Loading State ---
  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={styles.container}>
        <LoadingScreen onLoadingComplete={handleLoadingComplete} />
      </GestureHandlerRootView>
    );
  }

  // --- Ready State ---
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Animated.View style={[styles.contentContainer, { opacity: contentOpacity }]}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(drawer)" />
              <Stack.Screen
                name="player/index"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                  gestureEnabled: true,
                  gestureDirection: "vertical",
                  contentStyle: { backgroundColor: '#000' },
                }}
              />
            </Stack>

            <AudioPropertyToast />
            
            {/* FloatingPlayer - commented out as per original */}
            {/* {!isPlayerOpen && <FloatingPlayer />} */}
          </Animated.View>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  errorTitle: {
    color: "#FF4444",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  errorMessage: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 30,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00D4AA',
  },
  retryText: {
    color: "#00D4AA",
    fontSize: 16,
    fontWeight: "600",
  },
});
 