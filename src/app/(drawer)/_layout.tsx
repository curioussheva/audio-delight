// src/app/(drawer)/_layout.tsx
//
// Drawer navigator PristineAudio.
//
// Sebelumnya drawer hanya memakai warna hardcoded (`#0A0A0A`, `#00D4AA`) dan
// tidak punya identitas sama sekali - tidak ada logo, tidak ada versi, tidak
// ada jejak siapa pengembangnya. Padahal pengguna tema terang akan mendapat
// drawer hitam pekat yang tidak nyambung dengan sisa aplikasi.
//
// Sekarang memakai `DrawerContentScrollView` + `DrawerItemList` supaya:
//   - header logo bisa ditambahkan tanpa menulis ulang daftar item,
//   - footer versi & pengembang ikut ter-scroll bersama item,
//   - warnanya berasal dari tema aktif, bukan literal.
//
// Versi dibaca dari app.json lewat expo-constants, jadi tidak perlu diubah
// manual setiap rilis - dan tidak akan pernah menyimpang dari APK yang
// benar-benar terpasang.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Constants from "expo-constants";

import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";

import { useTheme } from "@/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

// Pengembang. Satu tempat saja supaya tidak tersebar di beberapa file.
const DEVELOPER = "curioussheva";

const APP_NAME = "PristineAudio";

/**
 * Membaca versi aplikasi.
 *
 * `expo-constants` mengekspos `expoConfig` (dari app.json) pada build EAS/CI,
 * dan `manifest` pada build lama. Keduanya dicoba supaya label versi tidak
 * hilang diam-diam hanya karena satu bentuk tidak tersedia.
 */
function readAppVersion(): string {
  const fromExpoConfig = Constants.expoConfig?.version;
  if (typeof fromExpoConfig === "string" && fromExpoConfig.length > 0) {
    return fromExpoConfig;
  }

  const manifest = Constants.manifest as { version?: string } | null;
  if (manifest && typeof manifest.version === "string") {
    return manifest.version;
  }

  return "-";
}

const DrawerContent: React.FC<DrawerContentComponentProps> = (props) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const version = readAppVersion();

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.scrollContent}
      style={{ backgroundColor: colors.background.secondary }}
    >
      {/* HEADER: logo + nama + versi */}
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
            borderBottomColor: colors.border.medium,
          },
        ]}
      >
        <Image
          source={require("../../../assets/images/dev-logo.png")}
          style={styles.logo}
          contentFit="contain"
        />

        <Text style={[styles.appName, { color: colors.text.primary }]}>
          {APP_NAME}
        </Text>

        <Text style={[styles.version, { color: colors.text.tertiary }]}>
          v{version}
        </Text>
      </View>

      {/* ITEM NAVIGASI - dirender oleh navigator, kita tidak menulisnya ulang */}
      <View style={[styles.items, { paddingTop: spacing.sm }]}>
        <DrawerItemList {...props} />
      </View>

      {/* FOOTER: pengembang */}
      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            marginTop: spacing.lg,
            borderTopColor: colors.border.medium,
          },
        ]}
      >
        <Text style={[styles.devLabel, { color: colors.text.tertiary }]}>
          DIKEMBANGKAN OLEH
        </Text>

        <Text style={[styles.devName, { color: colors.text.secondary }]}>
          {DEVELOPER}
        </Text>
      </View>
    </DrawerContentScrollView>
  );
};

export default function DrawerLayout() {
  const { theme } = useTheme();

  const { colors } = theme;

  // Warna item aktif TIDAK bisa langsung memakai `primary[500]`.
  //
  // Di tema gelap, `primary[500]` justru warna gelap - terukur 1.06 di
  // charcoal-black dan 1.20 di midnight-blue terhadap latar drawer. Item yang
  // sedang aktif jadi nyaris tak terbaca, dan itu justru informasi paling
  // penting di sebuah menu.
  //
  // `pickReadable` memilih aksen kalau lulus ambang, kalau tidak jatuh ke
  // text.primary. Hasilnya dihitung sekali per render, bukan di dalam
  // navigator (yang hanya menerima satu nilai warna).
  const activeTint = pickReadable(
    [colors.primary[500], colors.primary[400], colors.text.primary],
    colors.background.secondary,
    AA_NORMAL,
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,

          // Warna dari tema aktif. Drawer yang selalu hitam akan terlihat
          // sebagai panel asing bagi pengguna tema terang.
          drawerStyle: {
            backgroundColor: theme.colors.background.secondary,
            width: 280,
          },

          drawerActiveTintColor: activeTint,
          drawerInactiveTintColor: colors.text.secondary,
          drawerActiveBackgroundColor: colors.background.tertiary,

          drawerLabelStyle: {
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.3,
          },
        }}
      >
        <Drawer.Screen
          name="(tabs)"
          options={{ drawerLabel: "Library", title: "Library" }}
        />
        <Drawer.Screen
          name="playlist"
          options={{ drawerLabel: "Playlist", title: "Playlist" }}
        />
        <Drawer.Screen
          name="about"
          options={{ drawerLabel: "About", title: "About" }}
        />
        <Drawer.Screen
          name="settings"
          options={{ drawerLabel: "Settings", title: "Settings" }}
        />
        <Drawer.Screen
          name="song/[id]"
          options={{ drawerItemStyle: { display: "none" } }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingTop: 0 },
  header: { alignItems: "center", borderBottomWidth: 1 },
  logo: { width: 72, height: 72, marginBottom: 10 },
  appName: { fontSize: 18, fontWeight: "900", letterSpacing: 1.5 },
  version: { fontSize: 11, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  items: { flex: 1 },
  footer: { borderTopWidth: 1, alignItems: "center" },
  devLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  devName: { fontSize: 13, fontWeight: "700", marginTop: 4, letterSpacing: 0.5 },
});
