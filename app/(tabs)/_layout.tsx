import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../src/constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(13,16,24,0.97)',
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="player"
        options={{
          title: 'Player',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>♪</Text>,
        }}
      />
      <Tabs.Screen
        name="eq"
        options={{
          title: 'EQ',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>≋</Text>,
        }}
      />
      <Tabs.Screen
        name="spatial"
        options={{
          title: 'Spatial',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>◎</Text>,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>☰</Text>,
        }}
      />
    </Tabs>
  );
}
