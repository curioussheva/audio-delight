import React, { useState, useEffect } from "react";
import { Stack, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import TrackPlayer from "react-native-track-player";

import { ThemeProvider } from "@/context/ThemeContext";
//import { LoadingScreen } from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";
import { useTrackPlayerHandler } from "@/features/player/hooks/useTrackPlayerHandler";
import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { playbackService } from "@/features/player/api/playback";
import { BackgroundScanTask } from '@/features/library/services/BackgroundScanTask';
import { useLibraryStore } from '@/features/library/store/libraryStore';

TrackPlayer.registerPlaybackService(() => playbackService);

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const initStore = usePlayerStore((state) => state.initStore);
  const pathname = usePathname();
  const isPlayerOpen = pathname.startsWith("/player");
  const autoScanEnabled = useLibraryStore(s => s.scanStatus.autoScanEnabled);

  useEffect(() => {
    if (autoScanEnabled) {
      BackgroundScanTask.register(30); // setiap 30 menit
    } else {
      BackgroundScanTask.unregister();
    }
  }, [autoScanEnabled]); 

  useEffect(() => {
    const prepareApp = async () => {
      try {
        await Promise.all([
          audioEngine.initialize().catch(() => console.warn("Audio init deferred")),
          initStore(),
        ]);
      } catch (error) {
        console.error("App initialization failed:", error);
      } finally {
        setIsReady(true);
      }
    };
    prepareApp();
  }, []);

  useTrackPlayerHandler();

 // if (!isReady) return <LoadingScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <SafeAreaView style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(drawer)" />
              <Stack.Screen
                name="player/index"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                }}
              />
            </Stack>

            <AudioPropertyToast />
            
          </SafeAreaView>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
  