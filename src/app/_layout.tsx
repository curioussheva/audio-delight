// src/app/_layout.tsx (refactored)
import React, { useState, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { Stack, useSegments, useRouter, Href } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemeProvider } from '@/context/ThemeContext';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AudioPropertyToast } from '@/components/audio/AudioPropertyToast';
import FloatingPlayer from '@/components/audio/FloatingPlayer';
import { useTrackPlayerHandler } from '@/hooks/useTrackPlayerHandler';
import { audioEngine } from '@/services/audio/AudioEngine';
import { usePlayerStore } from '@/store/playerStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const segments = useSegments();
  const router = useRouter();
  const initStore = usePlayerStore((state) => state.initStore);

  useEffect(() => {
    const prepareApp = async () => {
      try {
        await Promise.all([
          audioEngine.initialize(),
          initStore(),
          AsyncStorage.getItem('has_onboarded').then((val) => {
            setHasOnboarded(val === 'true');
          }),
        ]);
      } catch (error) {
        console.error('App initialization failed:', error);
      } finally {
        setIsReady(true);
      }
    };

    prepareApp();
  }, []);

  useEffect(() => {
    if (!isReady || hasOnboarded === null) return;

    const currentRoot = segments[0];

   
if (!hasOnboarded && currentRoot && currentRoot !== 'onboarding') {
  router.replace('/onboarding' as any);
} else if (hasOnboarded && currentRoot === 'onboarding') {
  router.replace('/(drawer)/(tabs)/library' as any);
}
  }, [isReady, hasOnboarded, segments, router]);

  useTrackPlayerHandler();

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade_from_bottom',
            }}
          >
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
            <Stack.Screen
              name="player"
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
                gestureEnabled: true,
                gestureDirection: 'vertical',
                headerShown: false,
              }}
            />
          </Stack>

          {/* Persistent UI layers */}
          <AudioPropertyToast />
          <FloatingPlayer />
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}