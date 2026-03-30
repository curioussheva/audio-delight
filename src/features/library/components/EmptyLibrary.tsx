import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Untuk overlay estetik
import * as Haptics from 'expo-haptics';

interface EmptyLibraryProps {
  colors: any;
  onScan: () => void;
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({ colors, onScan }) => {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onScan();
  };

  return (
    <ImageBackground
      source={require("../../../../assets/images/splash.png")} // Pastikan path ke gambar splash kamu benar
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {/* Overlay Gradasi agar teks terbaca & gambar menyatu dengan tema dark */}
      <LinearGradient
        colors={['rgba(10, 22, 40, 0.7)', 'rgba(10, 22, 40, 0.95)']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.container}>
        <View style={styles.content}>
          {/* Tagline dari Gambar */}
          <Text style={styles.experienceText}>Experience</Text>
          <Text style={[styles.pureSoundText, { color: colors.primary[400] }]}>
            Pure Sound
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.primary[500] }]} />

          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Library Anda masih kosong. Mari temukan koleksi audio lossless Anda di perangkat ini.
          </Text>

          <TouchableOpacity
            style={[styles.scanBtn, { backgroundColor: colors.primary[500] }]}
            onPress={handlePress}
            activeOpacity={0.9}
          >
            <Ionicons name="scan-outline" size={22} color="#000" />
            <Text style={styles.scanBtnText}>MULAI PEMINDAIAN</Text>
          </TouchableOpacity>
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          <Text style={[styles.brandText, { color: colors.text.tertiary }]}>
            PROUDLY PRESENTED BY <Text style={{ fontWeight: '800' }}>CURIOUS SHEVA</Text>
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    marginTop: -40, // Sedikit ke atas agar tidak tertutup FloatingPlayer
  },
  experienceText: {
    fontSize: 42,
    fontWeight: '300',
    color: '#FFF',
    letterSpacing: 2,
    textAlign: 'center',
  },
  pureSoundText: {
    fontSize: 48,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: -10,
    letterSpacing: -1,
    textAlign: 'center',
    // Memberikan sedikit glow pada teks
    textShadowColor: 'rgba(0, 229, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  divider: {
    height: 4,
    width: 60,
    borderRadius: 2,
    marginVertical: 25,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
    paddingHorizontal: 20,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 35,
    paddingVertical: 18,
    borderRadius: 50,
    marginTop: 40,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  scanBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 15,
    marginLeft: 10,
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  brandText: {
    fontSize: 10,
    letterSpacing: 2,
  },
});
 