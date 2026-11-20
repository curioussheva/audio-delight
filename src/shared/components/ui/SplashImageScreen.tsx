// shared/components/ui/SplashImageScreen.tsx
//
// Interstitial splash.png: gambar yang sama dengan splash native
// (app.json → expo-splash-screen → splash.png) ditampilkan lagi sebagai
// gambar in-app sesaat setelah splash native hilang, sebelum rute tampil.
// `contain` — bukan `cover`: splash.png potret 752×1376 dengan teks di
// atas ("Experience Pure Sound") dan bawah ("Curious Sheva"); `cover`
// di layar 360×800 akan memotong kedua teks itu. Latar = background
// tema (saat cold start ThemeContext mengembalikan default pristine-noir
// yang gelap — menyatu dengan gambar yang juga gelap).
import React from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/shared/context/ThemeContext";

export default function SplashImageScreen() {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.primary },
      ]}
    >
      <Image
        source={require("../../../../assets/images/splash.png")}
        style={styles.image}
        contentFit="contain"
        accessibilityLabel="Pristine Audio — Experience Pure Sound"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { flex: 1, width: "100%" },
});
