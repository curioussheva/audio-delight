import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ← IMPORT
import { useTheme } from '@/context/ThemeContext';

export default function TabsLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets(); // ← AMBIL INSETS
  const { colors } = theme;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.secondary,
          borderTopColor: colors.background.tertiary,
          height: 60 + insets.bottom, // ← TAMBAHKAN INSET
          paddingBottom: insets.bottom, // ← SPACE UNTUK HOME INDICATOR
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="player"
        options={{
          title: 'Player',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="equalizer"
        options={{
          title: 'Equalizer',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="options" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="visualizer"
        options={{
          title: 'Analyzer',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="analytics" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}