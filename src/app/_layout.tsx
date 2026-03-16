import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/context/ThemeContext';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { AudioPropertyToast } from '@/components/audio/AudioPropertyToast';
import FloatingPlayer from '@/components/audio/FloatingPlayer'; // Import ini juga
import { useTrackPlayerHandler } from '@/hooks/useTrackPlayerHandler';
import AudioEngine from '@/services/audio/AudioEngine';
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
        // Init Audio Engine & Store secara paralel
        await Promise.all([
          AudioEngine.initialize(),
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

    const firstSegment = segments[0] as any;
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
        {/* View pembungkus agar UI Toast & FloatingPlayer tetap berada di atas Stack */}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(drawer)" />
            <Stack.Screen 
              name="player/index" 
              options={{ 
                presentation: 'transparentModal', // Gunakan transparent agar background player terlihat mewah
                animation: 'slide_from_bottom',
                gestureEnabled: true,
              }} 
            />
          </Stack>

          {/* Komponen Global - Sekarang bisa akses theme.colors */}
          <AudioPropertyToast />
          <FloatingPlayer />
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
