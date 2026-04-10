import React, { useCallback, memo, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Animated,
} from "react-native";
import { Tabs, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Library, SlidersHorizontal, Activity } from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

// ── Tab Item Component ───────────────────────────────────────────────────────
const TabItem = memo(({ route, isFocused, onPress, colors, label }: any) => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const IconComponent = useMemo(() => {
    if (route.name === "library") return Library;
    if (route.name === "equalizer") return SlidersHorizontal;
    return Activity;
  }, [route.name]);

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.tabItem}
      activeOpacity={1}
    >
      <Animated.View
        style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}
      >
        <IconComponent
          size={22}
          color={isFocused ? colors.primary[500] : colors.text.tertiary}
          strokeWidth={isFocused ? 2.5 : 2}
        />
        <Text
          style={[
            styles.tabLabel,
            { color: isFocused ? colors.primary[500] : colors.text.tertiary },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ── Custom Tab Bar ───────────────────────────────────────────────────────────
const CustomTabBar = memo(({ state, descriptors, navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Tinggi Tab Bar dihitung berdasarkan safe area insets
  const tabBarHeight = Platform.OS === "ios" ? 60 + insets.bottom : 75;

  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 85 : 100}
      tint={theme.isDark ? "dark" : "light"}
      style={[
        styles.tabBar,
        { height: tabBarHeight, paddingBottom: insets.bottom },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        if (options.href === null) return null; // Jangan render jika href null

        const label = options.title ?? route.name;
        const isFocused = state.index === index;

        return (
          <TabItem
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={() => navigation.navigate(route.name)}
            colors={theme.colors}
            label={label}
          />
        );
      })}
    </BlurView>
  );
});

// ── Main Layout ──────────────────────────────────────────────────────────────
export default function TabsLayout() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Memastikan Floating Player hanya muncul di root library
  const isLibraryTab = pathname === "/" || pathname.startsWith("/library");
  const isPlayerOpen = pathname.startsWith("/player");

  const renderTabBar = useCallback(
    (props: any) => <CustomTabBar {...props} />,
    [theme],
  );

  // Jarak bawah Floating Player agar tepat di atas Tab Bar
  const playerBottomOffset = Platform.OS === "ios" ? insets.bottom + 65 : 85;

  return (
    <View style={styles.container}>
      <Tabs
        tabBar={renderTabBar}
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        <Tabs.Screen name="library" options={{ title: "Library" }} />
        <Tabs.Screen name="equalizer" options={{ title: "DSP" }} />
        <Tabs.Screen name="visualizer" options={{ title: "Live" }} />
        <Tabs.Screen name="analyzer" options={{ title: "analyzer" }} />
      </Tabs>

      {!isPlayerOpen && isLibraryTab && (
        <View
          style={[styles.floatingContainer, { bottom: playerBottomOffset }]}
        >
          <FloatingPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  floatingContainer: {
    position: "absolute",
    left: 12,
    right: 30,
    zIndex: 999,
    // Shadow untuk membuat player terlihat melayang
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
});
