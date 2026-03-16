import React from 'react';
import { Tabs, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import FloatingPlayer from '@/components/audio/FloatingPlayer';
import { LyricsPreview } from '@/components/audio/LyricPreview';


export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: theme.colors.primary[500],
          tabBarInactiveTintColor: theme.colors.text.tertiary,
          tabBarStyle: styles.tabBar,
          // Menggunakan BlurView sebagai latar belakang Tab Bar
          tabBarBackground: () => (
            <BlurView
              intensity={Platform.OS === 'ios' ? 80 : 100}
              tint={(theme as any).dark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ),
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="equalizer"
          options={{
            title: 'DSP',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="analytics-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="visualizer"
          options={{
            title: 'Live',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pulse-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Floating Player tetap berada di atas Tabs */}
      <View style={{ flex: 1 }}>
  <Stack /> 
  <LyricsPreview />
  <FloatingPlayer />
</View>

    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute', // Membuatnya melayang agar blur terlihat
    borderTopWidth: 0,
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    backgroundColor: 'transparent', // Penting agar BlurView bekerja
  },
});
