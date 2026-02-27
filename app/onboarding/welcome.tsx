import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../src/constants/colors';

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🎧</Text>
          </View>
          <Text style={styles.logoTag}>// AudioDelight</Text>
          <Text style={styles.heading}>Telinga kamu{'\n'}layak yang terbaik.</Text>
          <Text style={styles.sub}>
            Independent EQ + Spatial Audio untuk audiophile. Semua proses lokal, tanpa cloud.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '≋', text: '10-Band Parametric EQ' },
            { icon: '◎', text: 'Spatial 3D · Binaural HRTF' },
            { icon: '▶', text: 'FLAC / MP3 / OGG · Lokal' },
            { icon: '🔒', text: 'Offline · No ads · No upload' },
          ].map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push('/onboarding/mode-select')}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Mulai Setup →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  logoWrap: {
    alignItems: 'flex-start',
    gap: 12,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.accentDim,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoEmoji: { fontSize: 36 },
  logoTag: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: 'monospace',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 42,
  },
  sub: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  features: {
    gap: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
    color: Colors.accent,
  },
  featureText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
