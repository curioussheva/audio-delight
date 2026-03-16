import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY } from '@/constants/theme';

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PristineAudio</Text>
      <Text style={styles.version}>Version 1.0.0</Text>
      <Text style={styles.description}>
        High-Fidelity Audio Player for Audiophiles
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.primary[500],
    marginBottom: 8,
  },
  version: {
    ...TYPOGRAPHY.body2,
    color: COLORS.text.secondary,
    marginBottom: 16,
  },
  description: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text.primary,
    textAlign: 'center',
  },
});