import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayerStore } from "@/features/player/store/playerStore";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";
import { tabBarHeight } from "@/features/player/tabBarHeight";

export default function TabsLayout() {
  // 🔥 Tinggi tab bar dihitung manual (49dp content + safe-area inset).
  //
  // useBottomTabBarHeight() TIDAK BISA dipakai di sini: hook itu membaca
  // BottomTabBarHeightContext, yang hanya di-provider di DALAM screen
  // navigator. Komponen ini me-render <Tabs> itu sendiri — ada di luar
  // provider — jadi context undefined dan hook-nya throw:
  //   "Couldn't find the bottom tab bar height. Are you inside a screen in
  //    Bottom Tab Navigator?"
  //
  // Nilai 49 ini sama persis yang dipakai react-navigation sendiri
  // (TABBAR_HEIGHT_UIKIT di BottomTabBar.tsx) untuk variant default, jadi
  // FloatingPlayer tetap pas di atas tab bar di device gesture-nav maupun
  // device dengan inset bawah besar.
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
          bottom: currentSong ? tabBarHeight(insets.bottom) : 0,
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
