import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { usePlayerStore } from '../src/store/usePlayerStore';

export default function RootLayout() {
  const { init } = usePlayerStore();

  useEffect(() => {
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#080a0f' }}>
      <StatusBar style="light" backgroundColor="#080a0f" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
