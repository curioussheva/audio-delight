import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, Circle, LinearGradient, vec, Rect } from '@shopify/react-native-skia';
import { Colors } from '../../src/constants/colors';

export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.container}>
      {/* Background glow */}
      <Canvas style={[StyleSheet.absoluteFillObject, { width, height }]} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height} color="#080a0f"/>
        <Circle cx={width/2} cy={height*0.3} r={200} color="rgba(99,120,255,0.06)"/>
        <Circle cx={width*0.8} cy={height*0.6} r={120} color="rgba(0,229,192,0.04)"/>
      </Canvas>

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <Text style={styles.logoIcon}>♪</Text>
          </View>
          <Text style={styles.logoRing}>◌</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>AudioDelight</Text>
        <Text style={styles.subtitle}>
          Equalizer audiophile dengan{'\n'}spatial 3D binaural
        </Text>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '🎚️', text: '10-band parametric EQ' },
            { icon: '🎧', text: 'HRTF 3D spatial audio' },
            { icon: '📊', text: 'Real-time spectrum analyzer' },
            { icon: '🎵', text: 'FLAC, MP3, OGG support' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <View style={styles.cta}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => router.replace('/(tabs)/player')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>Mulai Sekarang</Text>
        </TouchableOpacity>
        <Text style={styles.legal}>
          Basic gratis selamanya · Premium Rp 50k/tahun
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },

  logoWrap: { alignItems: 'center', justifyContent: 'center', width: 120, height: 120 },
  logo: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: Colors.accentDim,
    borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  logoIcon: { fontSize: 40 },
  logoRing: {
    position: 'absolute', fontSize: 120,
    color: 'rgba(99,120,255,0.15)',
  },

  title: { fontSize: 36, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  subtitle: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  features: { gap: 12, width: '100%' },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 13, color: Colors.text, flex: 1 },

  cta: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
  btnPrimary: {
    backgroundColor: Colors.accent, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 12,
  },
  btnPrimaryText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  legal: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
});
