import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
} from 'react-native';
import { Colors } from '../../src/constants/colors';
import { EQBoard } from '../../src/components/eq/EQBoard';
import { useEQStore } from '../../src/store/useEQStore';
import { ALL_PRESETS } from '../../src/audio/presets';

export default function EQScreen() {
  const { activePresetId, applyPreset } = useEQStore();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Equalizer</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>10-BAND</Text>
        </View>
      </View>

      {/* Preset Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presets}
      >
        {ALL_PRESETS.map((preset) => {
          const isActive = preset.id === activePresetId;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => applyPreset(preset)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* EQ Board */}
      <View style={styles.boardWrap}>
        <EQBoard />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.accentDim,
    borderWidth: 1, borderColor: Colors.borderStrong,
  },
  badgeText: { fontSize: 10, color: Colors.accent, fontFamily: 'monospace', letterSpacing: 1 },
  presets: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  boardWrap: { flex: 1, paddingBottom: 16 },
});
