import { Tabs } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayerStore } from "@/features/player/store/playerStore";
import FloatingPlayer from "@/features/player/components/FloatingPlayer";
import {
  ScanStatusBar,
  useScanStatusVisible,
} from "@/features/library/components/ScanStatusBar";
import { tabBarHeight } from "@/features/player/tabBarHeight";
import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

export default function TabsLayout() {
  const { theme } = useTheme();
  const { colors } = theme;
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
  const statusVisible = useScanStatusVisible();
  // Chip status scan (ScanStatusBar) duduk tepat di atas pill FloatingPlayer
  // dan mengikutinya di semua tab. Bila tidak ada lagu (pill tidak tampil)
  // chip tetap di atas tab bar, bukan menabraknya — jadi offset bawah
  // memakai tinggi tab bar bila pill ATAU chip tampil.

  // Warna tab bar dari tema aktif — pola yang sama dengan drawer
  // ((drawer)/_layout.tsx). Sebelumnya hardcoded hitam (#0A0A0A) + emerald
  // (#00D4AA), jadi user tema terang mendapat tab bar hitam pekat yang
  // tidak nyambung dengan seluruh UI terang.
  //
  // Warna tab aktif TIDAK bisa langsung memakai `primary[500]`: di tema
  // gelap primary[500] justru warna gelap (1,06 di charcoal-black terhadap
  // background.secondary). `pickReadable` memilih aksen kalau lulus ambang,
  // kalau tidak jatuh ke text.primary.
  const tabActiveTint = pickReadable(
    [colors.primary[500], colors.primary[400], colors.text.primary],
    colors.background.secondary,
    AA_NORMAL,
  );

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.background.secondary,
            borderTopColor:
              colors.border?.medium || colors.background.tertiary,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: tabActiveTint,
          tabBarInactiveTintColor: colors.text.secondary,
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
            title: "Audio",
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
      </Tabs>

      {/* 🔥 Floating Player — posisi absolute di atas tab bar.
          bottom = tinggi tab bar sebenarnya (safe-area aware), bukan 70.
          Chip status scan (ScanStatusBar) dirender tepat di atas pill dan
          mengikutinya di semua tab; pointerEvents none pada pembungkus
          chip supaya tap tembus ke daftar di bawahnya. */}
      <View
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          bottom:
            currentSong || statusVisible ? tabBarHeight(insets.bottom) : 0,
          zIndex: 100,
          elevation: 10, // Android shadow
        }}
        pointerEvents="box-none"
      >
        {statusVisible && (
          <View
            pointerEvents="none"
            style={{ alignItems: "center", marginBottom: 8 }}
          >
            <ScanStatusBar />
          </View>
        )}
        <FloatingPlayer />
      </View>
    </View>
  );
}
