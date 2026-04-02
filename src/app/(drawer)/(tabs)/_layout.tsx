import React from "react";
import { Tabs, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Library, SlidersHorizontal, Activity } from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  
  // LOGIKA BARU:
  // Cek apakah user sedang di tab library
  // pathname biasanya bernilai "/library" atau "/" tergantung index route Anda
  const isLibraryTab = pathname === "/library" || pathname === "/";
  const isPlayerOpen = pathname.startsWith("/player");

  const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 64 + insets.bottom : 74;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary[500],
          tabBarInactiveTintColor: colors.text.tertiary,
          tabBarStyle: {
            height: TAB_BAR_HEIGHT,
            paddingBottom: Platform.OS === "ios" ? insets.bottom : 15,
            paddingTop: 12, // Menaikkan icon agar tidak mepet bawah
            position: "absolute",
            borderTopWidth: 0,
            elevation: 0,
          },
          tabBarBackground: () => (
            <BlurView
              intensity={80}
              tint={theme.isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="library"
          options={{
            title: "Library",
            tabBarIcon: ({ color }) => <Library size={26} color={color} strokeWidth={2.2} />,
          }}
        />
        <Tabs.Screen
          name="equalizer"
          options={{
            title: "DSP",
            tabBarIcon: ({ color }) => <SlidersHorizontal size={26} color={color} strokeWidth={2.2} />,
          }}
        />
        <Tabs.Screen
          name="visualizer"
          options={{
            title: "Live",
            tabBarIcon: ({ color }) => <Activity size={26} color={color} strokeWidth={2.5} />,
          }}
        />
        <Tabs.Screen name="song/[id]" options={{ href: null }} />
      </Tabs>

      {/* MODIFIKASI DISINI: FloatingPlayer hanya render jika di Library & Player Utama sedang tutup */}
      {!isPlayerOpen && isLibraryTab && (
  <View 
    style={[
      styles.floatingContainer, 
      { 
        bottom: TAB_BAR_HEIGHT + 12, // Naikkan sedikit dari TabBar
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
      }
    ]}
  >
    <FloatingPlayer />
  </View>
)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 999,
  },
});
