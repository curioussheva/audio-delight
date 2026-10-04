import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { View } from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { FLOATING_PLAYER_HEIGHT } from "@/features/player/layout";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

export default function TabsLayout() {
  // 🔥 Tinggi tab bar dari react-navigation (safe-area aware), bukan tebakan 70.
  // Kalau tab bar lebih tinggi dari 60 (gesture nav, dsb.), FloatingPlayer
  // sebelumnya ikut menutupinya.
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const currentSong = usePlayerStore((s) => s.currentSong);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "#0A0A0A",
            borderTopColor: "#222",
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: "#00D4AA",
          tabBarInactiveTintColor: "#666",
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="library-music" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="equalizer"
          options={{
            title: "Equalizer",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="equalizer" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="analyzer"
          options={{
            title: "Analyzer",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="graphic-eq" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="visualizer"
          options={{
            title: "Visualizer",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="waves" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* 🔥 Floating Player — posisi absolute di atas tab bar.
          bottom = tinggi tab bar sebenarnya (safe-area aware), bukan 70. */}
      <View
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          bottom: tabBarHeight,
          zIndex: 100,
          elevation: 10, // Android shadow
        }}
        pointerEvents="box-none"
      >
        <FloatingPlayer />
      </View>
    </View>
  );
} 