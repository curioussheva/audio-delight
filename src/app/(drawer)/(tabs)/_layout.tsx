import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { View } from "react-native";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

export default function TabsLayout() {
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

      {/* 🔥 Floating Player — posisi absolute di atas tab bar */}
      <View
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          bottom: 70, // di atas tab bar (tinggi tab bar ~60)
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