// app/_layout.tsx
import React, { useState, useEffect } from "react";
import { Stack, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from 'expo-splash-screen';

import { ThemeProvider } from "@/context/ThemeContext";
import LoadingScreen from '@/shared/components/ui/LoadingScreen';
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

import TrackPlayer from "react-native-track-player";
import { useTrackPlayerHandler } from "@/features/player/hooks/useTrackPlayerHandler";
import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { playbackService } from "@/features/player/api/playback";
import { BackgroundScanTask } from '@/features/library/services/BackgroundScanTask';
import { useLibraryStore } from '@/features/library/store/libraryStore';

TrackPlayer.registerPlaybackService(() => playbackService);
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  const initStore = usePlayerStore((state) => state.initStore);
  const autoScanEnabled = useLibraryStore(s => s.scanStatus.autoScanEnabled);
  
  const pathname = usePathname();
  const isPlayerOpen = pathname.startsWith("/player");

  // Background Task
  useEffect(() => {
    if (autoScanEnabled) {
      BackgroundScanTask.register(30);
    } else {
      BackgroundScanTask.unregister();
    }
  }, [autoScanEnabled]);

  // Main Initialization + Minimum Loading Time
  useEffect(() => {
    const prepareApp = async () => {
      try {
        // Inisialisasi yang diperlukan
        await Promise.all([
          audioEngine.initialize().catch(() => console.warn("Audio init deferred")),
          initStore(),
        ]);

        // ★★★ Minimum loading time (agar LoadingScreen terlihat jelas) ★★★
        await new Promise(resolve => setTimeout(resolve, 2400)); // 2.4 detik

      } catch (error) {
        console.error("App initialization failed:", error);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();   // Hide native splash
      }
    };

    prepareApp();
  }, [initStore]);

  useTrackPlayerHandler();

  // Tampilkan LoadingScreen selama proses inisialisasi
  if (!isReady) {
    return <LoadingScreen />;
  }

  // App utama
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(drawer)" />
            <Stack.Screen
              name="player/index"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
          </Stack>

          {/* Floating Player harus di luar Stack agar selalu muncul */}
          <FloatingPlayer />

          <AudioPropertyToast />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
} 
