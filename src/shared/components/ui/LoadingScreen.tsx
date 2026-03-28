import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Animated,
  Easing,
  Platform,
} from "react-native";
// PERBAIKAN: Gunakan expo-image untuk performa dan handling image yang lebih baik
import { Image } from "expo-image";

/**
 * LOADINGSCREEN.TSX
 * * Komponen ini menggunakan gambar file eksternal sebagai logo utama.
 * Tampilan tetap konsisten dengan gaya premium dan gelap dari image_0.png.
 */

// Konstanta warna berdasarkan palet Splashscreen
const COLORS = {
  background: "#040B13", // Latar belakang gelap pekat
  primaryAccent: "#00D4AA", // Warna teal-hijau cerah dari visualizer (untuk loading)
  textMain: "#FFFFFF", // Warna putih bersih untuk teks "PRISTINE"
  textSecondary: "#C8D4E0", // Warna abu kebiruan lembut untuk teks "AUDIO"
};

// PERBAIKAN: Tentukan path ke file gambar logo Anda
const LOGO_SOURCE = require("../../../../assets/images/splash.png");

export const LoadingScreen: React.FC = () => {
  // Animasi untuk memudarkan (fade-in) seluruh layar saat pertama dimuat
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600, // Kecepatan pudar masuk yang halus
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Set StatusBar agar transparan untuk Fullscreen yang seamless */}
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Background Layer: Meniru ambience gelap */}
      <View style={styles.backgroundLayer}>
        {/* Opsional: Tambahkan radial gradient gelap di sini */}
      </View>

      {/* Content Container (Center alignment) */}
      <View style={styles.content}>
        {/* --- AREA LOGO (Gunakan Gambar) --- */}
        <View style={styles.logoContainer}>
          <Image
            source={LOGO_SOURCE}
            style={styles.logoImage}
            contentFit="contain" // Pastikan gambar tidak terpotong
            transition={300} // Transisi halus saat gambar muncul
            // Opsional: Tambahkan efek glow di sini jika diperlukan
          />
        </View>

        {/* --- INDIKATOR LOADING --- */}
        {/* Ditempatkan di tengah, di bawah logo dan di atas teks */}
        <View style={styles.loadingIndicatorContainer}>
          <ActivityIndicator
            size={Platform.OS === "ios" ? "small" : "large"}
            color={COLORS.primaryAccent} // Warna aksen dari visualizer
            style={styles.activityIndicator}
          />
        </View>

        {/* --- AREA TEKS --- */}
        <View style={styles.textContainer}>
          {/* "PRISTINE" - Huruf kapital, putih, bersih */}
          <Text style={[styles.textPristine, { color: COLORS.textMain }]}>
            PRISTINE
          </Text>

          {/* "AUDIO" - Lebih kecil, abu-abu lembut */}
          <Text style={[styles.textAudio, { color: COLORS.textSecondary }]}>
            AUDIO
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background, // Dasar gelap
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    // Di sini Anda bisa menambahkan gambar latar yang buram (blurry ambience)
    // Sementara ini menggunakan warna dasar gelap yang pekat.
  },
  content: {
    flex: 1,
    justifyContent: "center", // Semua konten di tengah
    alignItems: "center",
    paddingHorizontal: 20,
  },
  // --- Styling Logo (Gunakan Gambar) ---
  logoContainer: {
    marginBottom: 40, // Jarak ke indikator loading
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: 250, // Sesuaikan ukuran gambar
    height: 120, // Sesuaikan ukuran gambar
    // Opsional: Tambahkan shadow/glow di sini
    // shadowColor: '#D4AF37',
    // shadowOffset: { width: 0, height: 0 },
    // shadowOpacity: 0.5,
    // shadowRadius: 10,
  },
  // --- Styling Loading ---
  loadingIndicatorContainer: {
    justifyContent: "center",
    alignItems: "center",
    height: 80, // Area khusus untuk loading
    marginBottom: 20, // Jarak ke teks
  },
  activityIndicator: {
    transform: [{ scale: 1 }], // Biarkan ActivityIndicator native menangani ukurannya
  },
  // --- Styling Teks ---
  textContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  textPristine: {
    fontSize: 32, // Ukuran teks besar
    fontWeight: "800", // Sangat tebal
    letterSpacing: 4, // Spasi huruf yang lebar (premium)
    fontFamily: Platform.OS === "ios" ? "Avenir-Heavy" : "sans-serif-medium", // Font premium
  },
  textAudio: {
    fontSize: 14, // Jauh lebih kecil
    fontWeight: "600",
    letterSpacing: 2, // Spasi huruf (premium)
    fontFamily: Platform.OS === "ios" ? "Avenir-Medium" : "sans-serif",
  },
});

export default LoadingScreen;
