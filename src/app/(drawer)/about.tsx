import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export default function AboutScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const features = [
    { icon: 'infinite', title: 'Lossless Support', desc: 'FLAC, ALAC, WAV, & DSF playback' },
    { icon: 'pulse', title: 'Visualizer Pro', desc: 'Real-time spectral & peak analysis' },
    { icon: 'color-palette', title: 'Adaptive UI', desc: 'Dynamic themes based on album art' },
    { icon: 'options', title: 'Bit-Perfect', desc: 'Direct audio processing engine' },
  ];

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Fallback jika gagal membuka link
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
          source={require('@/assets/images/dev-logo.png')} 
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.title, { color: colors.primary[500] }]}>PristineAudio</Text>
        <Text style={[styles.version, { color: colors.text.tertiary }]}>v1.0.0-PRO</Text>
      </View>

      {/* Features Grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>CORE FEATURES</Text>
        <View style={styles.featuresGrid}>
          {features.map((f, i) => (
            <View key={i} style={[styles.featureCard, { backgroundColor: colors.background.secondary }]}>
              <Ionicons name={f.icon as any} size={24} color={colors.primary[500]} />
              <Text style={[styles.featureTitle, { color: colors.text.primary }]}>{f.title}</Text>
              <Text style={[styles.featureDesc, { color: colors.text.tertiary }]}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Developer & Contact Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>CONNECT</Text>
        
        <TouchableOpacity 
          style={[styles.linkRow, { backgroundColor: colors.background.secondary }]}
          onPress={() => openLink('https://www.facebook.com/share/1BC9oPdjdP/')}
        >
          <Ionicons name="logo-facebook" size={20} color="#1877F2" />
          <Text style={[styles.linkText, { color: colors.text.primary }]}>Facebook Page</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.linkRow, { backgroundColor: colors.background.secondary, marginTop: spacing.sm }]}
          onPress={() => openLink('mailto:curioussheva@gmail.com')}
        >
          <Ionicons name="mail-outline" size={20} color={colors.primary[500]} />
          <Text style={[styles.linkText, { color: colors.text.primary }]}>curioussheva@gmail.com</Text>
          <Ionicons name="copy-outline" size={16} color={colors.text.tertiary} />
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
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 100, height: 100, marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  version: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 30 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 15 },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureCard: { width: '48%', padding: 15, borderRadius: 16 },
  featureTitle: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  featureDesc: { fontSize: 11, marginTop: 4, lineHeight: 14 },
  linkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 15, 
    borderRadius: 12,
  },
  linkText: { flex: 1, marginLeft: 12, fontSize: 14, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: 10, opacity: 0.5, marginTop: 20 }
});
