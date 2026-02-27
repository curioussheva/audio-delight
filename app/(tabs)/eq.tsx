import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
// 1. Ganti ke SafeAreaView dari react-native-safe-area-context
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { Colors } from '../../src/constants/colors';
import { EQBoard } from '../../src/components/eq/EQBoard';
import { useEQStore } from '../../src/store/useEQStore';
// Pastikan path ini benar sesuai struktur tree kamu
import { ALL_PRESETS } from '../../src/audio/presets'; 

export default function EQScreen() {
  const { activePresetId, applyPreset } = useEQStore();

  return (
    // 'edges' memastikan padding hanya di atas untuk menghindari notch
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Equalizer</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>10-BAND</Text>
        </View>
      </View>

      {/* Preset Chips */}
      <View style={{ height: 50 }}> 
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
      </View>

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
    paddingTop: 12, // Dikurangi karena sudah ada SafeAreaView
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.accentDim || '#1a1a1a', // Fallback jika undefined
    borderWidth: 1, borderColor: Colors.borderStrong || '#333',
  },
  badgeText: { fontSize: 10, color: Colors.accent || '#00ff00', fontFamily: 'monospace', letterSpacing: 1 },
  presets: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row', // Memastikan arah baris di Termux/Android
  },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border || '#333',
    backgroundColor: 'transparent',
    marginRight: 8,
    height: 35, // Tinggi eksplisit membantu render di beberapa versi RN
  },
  chipActive: {
    backgroundColor: Colors.accent || '#00ff00',
    borderColor: Colors.accent || '#00ff00',
  },
  chipText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  boardWrap: { flex: 1, paddingBottom: 16 },
});
