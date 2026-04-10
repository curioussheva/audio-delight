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
  AppState, 
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

// Prevent splash screen from auto-hiding - we'll control it manually
SplashScreen.preventAutoHideAsync();

// App initialization states
type AppInitState = 
  | "initializing"    // First load, show LoadingScreen
  | "loading"         // LoadingScreen visible, init running
  | "ready"           // Init done, fade to app
  | "error";          // Init failed

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Animation values for content fade in
  const contentOpacity = useRef(new Animated.Value(0)).current;
  
  const initStore = usePlayerStore((state) => state.initStore);
  const autoScanEnabled = useLibraryStore((s) => s.isAutoScanning);
  const setAudioMode = usePlayerStore((state) => state.setAudioMode);
  
  const pathname = usePathname();
  const segments = useSegments();
  const isPlayerOpen = pathname?.startsWith("/player");
  
  // Refs to prevent multiple initializations
  const hasInitialized = useRef(false);
  const appStateSubscription = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);

  // --- Master Audio Sync (Prevent Require Cycle) ---
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
    appStateSubscription.current = AppState.addEventListener("change", (nextAppState) => {
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
      
      // Initialize audio engine (non-blocking)
      audioEngine.initialize().catch((err) => 
        console.warn("[App] Audio engine init warning:", err.message)
      );

      // Initialize player store
      await initStore();

      // Load EQ settings
      const eqStore = useEqualizerStore.getState();
      await eqStore.setEQEnabled(eqStore.isEQEnabled);

      // Restore audio mode preference
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
    
    // Hide native splash screen first
    SplashScreen.hideAsync().catch(() => {
      // Ignore errors
    });

    // Small delay to ensure SplashScreen is fully hidden
    setTimeout(() => {
      setAppState("ready");
      
      // Fade in content
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 100);
  }, [contentOpacity]);

  // --- Start Initialization ---
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Start initialization immediately
    performInitialization().then(() => {
      // Don't transition yet - wait for LoadingScreen to finish its animation
      setAppState("loading");
    }).catch(() => {
      // Error already handled in performInitialization
    });
  }, [performInitialization]);

  // --- Retry Handler ---
  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setAppState("initializing");
    hasInitialized.current = false;
    
    // Small delay before retry
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
    backgroundColor: '#000', // Ensure black background always
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
 