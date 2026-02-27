import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../src/constants/colors';
import { useAppStore } from '../../src/store/useAppStore';
import { AppMode } from '../../src/types/audio.types';

const MODES: { id: AppMode; icon: string; title: string; desc: string; tags: string[] }[] = [
  {
    id: 'clarity',
    icon: '🔬',
    title: 'Clarity Mode',
    desc: 'Fokus kejernihan suara. High-res audio, precision EQ, noise reduction ringan. Cocok untuk audiophile yang dengerin detail instrumen.',
    tags: ['High-pass filter', 'Parametric EQ', 'Vocal boost', 'Low noise'],
  },
  {
    id: 'immersive',
    icon: '🌐',
    title: 'Immersive Mode',
    desc: 'Pengalaman spatial 3D. Binaural HRTF, panning 360°, head-tracking via gyro. Cocok untuk dengerin musik sambil commute.',
    tags: ['Binaural HRTF', 'Spatial 3D', 'Head-tracking', 'Reverb'],
  },
];

export default function ModeSelectScreen() {
  const [selected, setSelected] = useState<AppMode>('clarity');
  const { completeOnboarding } = useAppStore();

  const handleContinue = () => {
    completeOnboarding(selected);
    router.replace('/(tabs)/player');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View>
          <Text style={styles.step}>02 / 02</Text>
          <Text style={styles.heading}>Pilih mode{'\n'}favoritmu.</Text>
          <Text style={styles.sub}>Bisa diubah kapanpun di Settings.</Text>
        </View>

        <View style={styles.cards}>
          {MODES.map((mode) => {
            const isActive = selected === mode.id;
            return (
              <TouchableOpacity
                key={mode.id}
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => setSelected(mode.id)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.modeIcon}>{mode.icon}</Text>
                  <View style={styles.radioWrap}>
                    <View style={[styles.radio, isActive && styles.radioActive]} />
                  </View>
                </View>
                <Text style={[styles.modeTitle, isActive && styles.modeTitleActive]}>
                  {mode.title}
                </Text>
                <Text style={styles.modeDesc}>{mode.desc}</Text>
                <View style={styles.tags}>
                  {mode.tags.map((tag) => (
                    <View key={tag} style={[styles.tag, isActive && styles.tagActive]}>
                      <Text style={[styles.tagText, isActive && styles.tagTextActive]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.cta}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Masuk ke App →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  step: {
    fontSize: 11,
    color: Colors.accent,
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 12,
  },
  heading: { fontSize: 34, fontWeight: '800', color: Colors.text, lineHeight: 40 },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  cards: { gap: 16 },
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  cardActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(99,120,255,0.07)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeIcon: { fontSize: 28 },
  radioWrap: {
    width: 22, height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radio: { width: 10, height: 10, borderRadius: 5 },
  radioActive: { backgroundColor: Colors.accent },
  modeTitle: { fontSize: 18, fontWeight: '700', color: Colors.textMuted },
  modeTitleActive: { color: Colors.text },
  modeDesc: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.border,
  },
  tagActive: { borderColor: Colors.accentDim, backgroundColor: Colors.accentDim },
  tagText: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace' },
  tagTextActive: { color: Colors.accent },
  cta: {
    height: 56, borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
