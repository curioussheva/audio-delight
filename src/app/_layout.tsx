import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

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

// 🔥 DIAGNOSTICS
import {
  startAudioDiagnostics,
  getAudioSnapshot,
  printDiagnosticReport,
  type AudioDiagnosticsHandle,
} from "@/features/player/api/diagnostics";
import { runAudioTestMatrix } from "@/features/player/api/testMatrix";
 
SplashScreen.preventAutoHideAsync();

type AppInitState = "initializing" | "loading" | "ready" | "error";

const DIAGNOSTIC_INTERVAL_MS = 5000;

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasInitialized = useRef(false);
  const diagRef = useRef<AudioDiagnosticsHandle | null>(null);

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

    // 🔥 FIX: Clear old audio cache (anti penumpukan)
    try {
      const { NativeModules } = require("react-native");
      const svc = NativeModules.NativePlaybackService;
      if (svc?.clearCache) {
        const deleted = await svc.clearCache();
        console.log(`[BOOT] 🧹 Cleared ${deleted} cache files`);
      } else {
        console.log("[BOOT] ⚠️ clearCache");
      }
    } catch (e) {
      console.warn("[BOOT] Cache cleanup skipped:", e);
    }

    // 🔥 FIX: Reset stuck scan state (anti macet)
    try {
      const { UnifiedScanService } = require("@/features/library/services/UnifiedScanService");
      const libraryStore = require("@/features/library/store/libraryStore").useLibraryStore.getState();
      
      let didReset = false;
      
      if (UnifiedScanService?.isRunning) {
        console.warn("[BOOT] 🚨 Reset UnifiedScanService.isRunning");
        UnifiedScanService.isRunning = false;
        UnifiedScanService.currentMode = null;
        UnifiedScanService.abortController = null;
        didReset = true;
      }
      
      if (libraryStore?.isManualScanning || libraryStore?.isAutoScanning) {
        console.warn("[BOOT] 🚨 Reset store scan state");
        libraryStore.finishManualScan?.();
        libraryStore.finishAutoScan?.();
        didReset = true;
      }
      
      if (didReset) {
        console.log("[BOOT] ✅ Stuck scan state reset");
      }
    } catch (e) {
      console.warn("[BOOT] Scan reset skipped:", e);
    }

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




  // ============================================================
  // 🔥 DIAGNOSTICS MONITOR (dev only)
  // ============================================================
  useEffect(() => {
    if (!__DEV__) return;
    if (appState !== "ready") return;

    console.log("[DIAG] 🔍 Starting audio diagnostics monitor...");
    const diag = startAudioDiagnostics({
      intervalMs: DIAGNOSTIC_INTERVAL_MS,
      verbose: true,
      speedLowThreshold: 0.5,
      speedHighThreshold: 1.5,
    });

    diagRef.current = diag;

    // 🔥 Expose ke global untuk trigger manual dari console
    (global as any).__audioDiag = diag;
    (global as any).__audioSnapshot = getAudioSnapshot;
    (global as any).__audioReport = () => printDiagnosticReport(diag);
    (global as any).__audioTestMatrix = runAudioTestMatrix;

    console.log("[DIAG] ✅ Diagnostics started");
    console.log(
      "[DIAG] Available: __audioSnapshot(), __audioReport(), __audioTestMatrix()",
    );

    return () => {
      console.log("[DIAG] 🛑 Stopping diagnostics monitor");
      diag.stop();
      diagRef.current = null;
      delete (global as any).__audioDiag;
      delete (global as any).__audioSnapshot;
      delete (global as any).__audioReport;
      delete (global as any).__audioTestMatrix;
    };
  }, [appState]);

  // Handle loading complete
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

  // ── UI STATE: ERROR ──────────────────────────────
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

  // ── UI STATE: INITIALIZING / LOADING ─────────────
  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <LoadingScreen onLoadingComplete={handleLoadingComplete} />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // ── UI STATE: READY ──────────────────────────────
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