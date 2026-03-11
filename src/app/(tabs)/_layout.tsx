import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { COLORS } from '@/constants/theme';

const TabBarIcon = ({ name, color, size }: { name: any; color: string; size: number }) => {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background.secondary,
          borderTopColor: COLORS.background.tertiary,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.primary[500],
        tabBarInactiveTintColor: COLORS.text.tertiary,
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
            <TabBarIcon name="library" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="playlists"
        options={{
          title: 'Playlists',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="list" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="player"
        options={{
          title: 'Player',
          tabBarIcon: ({ color, size }) => (
            <View style={{
              backgroundColor: COLORS.primary[500],
              width: 50,
              height: 50,
              borderRadius: 25,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 20,
              shadowColor: COLORS.primary[500],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <Ionicons name="play" size={28} color={COLORS.background.primary} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      
      <Tabs.Screen
        name="equalizer"
        options={{
          title: 'Equalizer',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="options" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="visualizer"
        options={{
          title: 'Visualizer',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="analytics" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="search" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}