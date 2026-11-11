import React from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";

// Versi dibaca dari app.json supaya tidak menyimpang dari APK yang terpasang.
// Sebelumnya label di sini hardcoded "v1.0.0-PRO" sementara app.json sudah di
// 1.0.37 - dua angka berbeda yang sama-sama mengaku versi aplikasi.
const APP_VERSION =
  Constants.expoConfig?.version ??
  (Constants.manifest as { version?: string } | null)?.version ??
  "-";

export default function AboutScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  // U-P2-37: aksen sebagai TEKS/IKON diukur seperti Equalizer, bukan
  // primary[500] mentah (gagal 4,5 di 9/22 tema sebagai teks, gagal 3,0 di
  // 8 tema sebagai ikon — mis. charcoal-black 1,12). Judul di atas
  // background.primary, ikon di atas kartu background.secondary.
  const accentOnPrimary = accentOn(
    [colors.primary[500]],
    colors.background.primary,
    [colors.text.primary, colors.text.secondary],
  );
  const accentOnSecondary = accentOn(
    [colors.primary[500]],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );

  const features = [
    {
      icon: "infinite",
      title: "Lossless Support",
      desc: "FLAC, ALAC, WAV, & DSF playback",
    },
    {
      icon: "pulse",
      title: "Visualizer Pro",
      desc: "Real-time spectral & peak analysis",
    },
    // Klaim "Adaptive UI — Dynamic themes based on album art" DIHAPUS
    // (U-P1-08): tidak ada kode yang menurunkan tema dari sampul album —
    // satu-satunya komponen itu (DynamicBackground) mati, tema hanya
    // dipilih manual lewat ThemePicker.
    {
      icon: "options",
      title: "Bit-Perfect",
      desc: "Direct audio processing engine",
    },
  ];

  // U-P2-46: kegagalan buka link DULU ditelan diam-diam (`catch (() => {})`)
  // — user mengetuk, tidak terjadi apa-apa, tanpa penjelasan. Sekarang
  // gagal dibuka disampaikan lewat Alert.
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Tidak bisa membuka tautan",
        "Periksa aplikasi email/browser di perangkat ini, lalu coba lagi.",
      );
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* Header Section */}
      <View style={[styles.header, { marginTop: spacing.xxl }]}>
        <Image
          source={require("../../../assets/images/dev-logo.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.title, { color: accentOnPrimary }]}>
          PristineAudio
        </Text>
        <Text style={[styles.version, { color: colors.text.tertiary }]}>
          v{APP_VERSION}
        </Text>
        {/* Banner "Curious Sheva" — aset branding (2026-11-11): kredit
            developer di bawah header About. */}
        <Image
          source={require("../../../assets/images/curious-sheva-banner.png")}
          style={styles.banner}
          contentFit="cover"
        />
      </View>

      {/* Features Grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
          CORE FEATURES
        </Text>
        <View style={styles.featuresGrid}>
          {features.map((f, i) => (
            <View
              key={i}
              style={[
                styles.featureCard,
                { backgroundColor: colors.background.secondary },
              ]}
            >
              <Ionicons
                name={f.icon as any}
                size={24}
                color={accentOnSecondary}
              />
              <Text
                style={[styles.featureTitle, { color: colors.text.primary }]}
              >
                {f.title}
              </Text>
              <Text
                style={[styles.featureDesc, { color: colors.text.tertiary }]}
              >
                {f.desc}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Developer & Contact Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
          CONNECT
        </Text>

        <TouchableOpacity
          style={[
            styles.linkRow,
            { backgroundColor: colors.background.secondary },
          ]}
          onPress={() => openLink("https://www.facebook.com/share/1BC9oPdjdP/")}
        >
          <Ionicons name="logo-facebook" size={20} color="#1877F2" />
          <Text style={[styles.linkText, { color: colors.text.primary }]}>
            Facebook Page
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.tertiary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.linkRow,
            {
              backgroundColor: colors.background.secondary,
              marginTop: spacing.sm,
            },
          ]}
          onPress={() => openLink("mailto:curioussheva@gmail.com")}
        >
          <Ionicons name="mail-outline" size={20} color={accentOnSecondary} />
          <Text style={[styles.linkText, { color: colors.text.primary }]}>
            curioussheva@gmail.com
          </Text>
          {/* U-P2-46: ikon ekor DULU `copy-outline` padahal aksinya membuka
              aplikasi mail (bukan menyalin). Sekarang chevron seperti baris
              Facebook — aksi yang sama, ikon yang sama. */}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.text.tertiary}
          />
        </TouchableOpacity>
      </View>

      <Text style={[styles.footer, { color: colors.text.tertiary }]}>
        Crafted with Precision for Audiophiles.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", marginBottom: 30 },
  logo: { width: 100, height: 100, marginBottom: 15 },
  banner: {
    width: "92%",
    aspectRatio: 1600 / 427,
    borderRadius: 12,
    marginTop: 18,
  },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  version: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 30 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 15,
  },
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  featureCard: { width: "48%", padding: 15, borderRadius: 16 },
  featureTitle: { fontSize: 14, fontWeight: "700", marginTop: 10 },
  featureDesc: { fontSize: 11, marginTop: 4, lineHeight: 14 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
  },
  linkText: { flex: 1, marginLeft: 12, fontSize: 14, fontWeight: "600" },
  footer: { textAlign: "center", fontSize: 10, opacity: 0.5, marginTop: 20 },
});
