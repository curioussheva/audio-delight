import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/context/ThemeContext';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AudioPropertyToast } from '@/components/audio/AudioPropertyToast';
import FloatingPlayer from '@/components/audio/FloatingPlayer'; 
import { useTrackPlayerHandler } from '@/hooks/useTrackPlayerHandler';

// PERBAIKAN 1: Import dengan kurung kurawal dan huruf kecil
import { audioEngine } from '@/services/audio/AudioEngine'; 
import { usePlayerStore } from '@/store/playerStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  
  const segments = useSegments();
  const router = useRouter();
  const initStore = usePlayerStore(state => state.initStore);

  // 1. Inisialisasi Startup
  useEffect(() => {
    const prepare = async () => {
      try {
        // PERBAIKAN 2: Gunakan 'audioEngine' (huruf kecil) hasil import tadi
        await Promise.all([
          audioEngine.initialize(), 
          initStore(),
          AsyncStorage.getItem('has_onboarded').then(val => setHasOnboarded(val === 'true'))
        ]);
      } catch (e) {
        console.error("Initialization failed", e);
      } finally {
        setIsReady(true);
      }
    };
    prepare();
  }, []);

  // 2. Logic Proteksi Onboarding (Navigation Guard)
  useEffect(() => {
    if (!isReady || hasOnboarded === null) return;

    const firstSegment = segments[0] as string; // Casting ke string agar lebih aman
    const isInsideApp = firstSegment === '(drawer)' || firstSegment === '(tabs)';

    if (!hasOnboarded && isInsideApp) {
      router.replace('/onboarding' as any);
    } else if (hasOnboarded && firstSegment === 'onboarding') {
      router.replace('/(drawer)/(tabs)/library' as any);
    }
  }, [hasOnboarded, segments, isReady]);

  // 3. Jalankan Listener Musik
  useTrackPlayerHandler();

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(drawer)" />
            <Stack.Screen 
              name="player/index" 
              options={{ 
                presentation: 'transparentModal', 
                animation: 'slide_from_bottom',
                gestureEnabled: true,
              }} 
            />
          </Stack>

          {/* Toast dan FloatingPlayer diletakkan di luar Stack agar tetap melayang */}
          <AudioPropertyToast />
          <FloatingPlayer />
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
