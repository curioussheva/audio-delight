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
import { Library, SlidersHorizontal, Activity, BarChart2 } from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";

// ─── Konstanta tinggi — dipakai di sini dan bisa diexport untuk paddingBottom list
export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 60 : 64;
export const FLOATING_PLAYER_HEIGHT = 72; // tinggi FloatingPlayer
export const FLOATING_PLAYER_MARGIN = 8;  // jarak player dari tab bar

// Total padding bawah yang dibutuhkan list agar row terakhir tidak tertutup
export const LIST_BOTTOM_PADDING =
  TAB_BAR_HEIGHT + FLOATING_PLAYER_HEIGHT + FLOATING_PLAYER_MARGIN + 12;

// ── Tab Item ──────────────────────────────────────────────────────────────────

const TAB_ICONS: Record<string, any> = {
  library:   Library,
  equalizer: SlidersHorizontal,
  visualizer: Activity,
  analyzer:  BarChart2,
};

const TabItem = memo(({ route, isFocused, onPress, colors, label }: any) => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  const IconComponent = TAB_ICONS[route.name] ?? Activity;

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
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
        <IconComponent
          size={22}
          color={isFocused ? colors.primary[500] : colors.text.tertiary}
          strokeWidth={isFocused ? 2.5 : 1.8}  // konsisten semua tab
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

// ── Custom Tab Bar ────────────────────────────────────────────────────────────

const CustomTabBar = memo(({ state, descriptors, navigation }: any) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 85 : 100}
      tint={theme.isDark ? "dark" : "light"}
      style={[
        styles.tabBar,
        {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        if (options.href === null) return null;

        const isFocused = state.index === index;

        return (
          <TabItem
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={() => navigation.navigate(route.name)}
            colors={theme.colors}
            label={options.title ?? route.name}
          />
        );
      })}
    </BlurView>
  );
});

// ── Main Layout ───────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isPlayerOpen = pathname.startsWith("/player");

  // FloatingPlayer muncul di semua tab kecuali saat player fullscreen
  const showFloatingPlayer = !isPlayerOpen;

  // Bottom = tinggi tab bar + safe area insets
  const tabBarTotalHeight = TAB_BAR_HEIGHT + insets.bottom;

  // Player nempel tepat di atas tab bar dengan margin kecil
  const playerBottom = tabBarTotalHeight + FLOATING_PLAYER_MARGIN;

  const renderTabBar = useCallback(
    (props: any) => <CustomTabBar {...props} />,
    [theme],
  );

  return (
    <View style={styles.container}>
      <Tabs
        tabBar={renderTabBar}
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        <Tabs.Screen name="library"    options={{ title: "Library" }} />
        <Tabs.Screen name="equalizer"  options={{ title: "DSP" }} />
        <Tabs.Screen name="visualizer" options={{ title: "Live" }} />
        <Tabs.Screen name="analyzer"   options={{ title: "Analyzer" }} />
      </Tabs>

      {showFloatingPlayer && (
        <View style={[styles.floatingContainer, { bottom: playerBottom }]}>
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
    borderTopColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

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
    right: 12,       // ✅ simetris
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 20,
  },
});
 