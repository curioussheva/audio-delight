import React from 'react';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/context/ThemeContext';
import FloatingPlayer from '@/components/audio/FloatingPlayer';
import { LyricsPreview } from '@/components/audio/LyricPreview';

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: theme.colors.primary[500],
          tabBarInactiveTintColor: theme.colors.text.tertiary,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => (
            <BlurView
              intensity={Platform.OS === 'ios' ? 80 : 100}
              tint={theme.isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ),
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'library' : 'library-outline'}
                size={size}
                color={color}
                accessibilityLabel="Library"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="equalizer"
          options={{
            title: 'DSP',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'analytics' : 'analytics-outline'}
                size={size}
                color={color}
                accessibilityLabel="DSP / Equalizer"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="visualizer"
          options={{
            title: 'Live',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'pulse' : 'pulse-outline'}
                size={size}
                color={color}
                accessibilityLabel="Live Visualizer"
              />
            ),
          }}
        />
      </Tabs>

      {/* Global overlays – always visible above tabs */}
      <LyricsPreview />
      <FloatingPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    backgroundColor: 'transparent',
  },
});