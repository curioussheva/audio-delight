import React from "react";
import { Tabs, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { StyleSheet, Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/context/ThemeContext";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";
import { LyricsPreview } from "@/features/player/components/LyricPreview";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { colors } = theme;
  const pathname = usePathname();
  const isPlayerOpen = pathname.startsWith("/player");

  return (
    /* PENTING: Gunakan edges untuk menghindari double padding di bawah 
      karena TabBar sudah punya padding sendiri.
    */

      <View style={styles.container}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarActiveTintColor: colors.primary[500],
            tabBarInactiveTintColor: colors.text.tertiary,
            tabBarStyle: styles.tabBar,
            tabBarBackground: () => (
              <BlurView
                intensity={Platform.OS === "ios" ? 80 : 100}
                tint={theme.isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ),
          }}
        >
          {/* Screens tetap sama */}
          <Tabs.Screen name="library" options={{ title: "Library" }} />
          <Tabs.Screen name="equalizer" options={{ title: "DSP" }} />
          <Tabs.Screen name="visualizer" options={{ title: "Live" }} />
          <Tabs.Screen name="song/[id]" options={{ href: null }} />
        </Tabs>

        {/* Overlays */}
        <LyricsPreview />
        {!isPlayerOpen && <FloatingPlayer />}
      </View>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    position: "absolute",
    borderTopWidth: 0,
    elevation: 0,
    // Di Android, jangan terlalu tinggi agar tidak menutupi FloatingPlayer
    height: Platform.OS === "ios" ? 88 : 64, 
    paddingBottom: Platform.OS === "ios" ? 30 : 10,
    backgroundColor: "transparent",
  },
});
 