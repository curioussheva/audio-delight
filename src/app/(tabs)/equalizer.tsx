import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { EqualizerBand } from '@/components/equalizer/EqualizerBand';
import { FrequencyGraph } from '@/components/equalizer/FrequencyGraph';
import { useEqualizer } from '@/hooks/useEqualizer';

export default function EqualizerScreen() {
  const {
    bands,
    isActive,
    presetName,
    updateBand,
    applyPreset,
    toggleEQ,
    presets,
  } = useEqualizer();

  const [showPresets, setShowPresets] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Equalizer</Text>
        <View style={styles.headerRight}>
          <Text style={styles.activeText}>
            {isActive ? 'Aktif' : 'Nonaktif'}
          </Text>
          <Switch
            value={isActive}
            onValueChange={toggleEQ}
            trackColor={{ false: '#1F2A3A', true: '#00D4AA' }}
            thumbColor={isActive ? '#F0F4F8' : '#C8D4E0'}
          />
        </View>
      </View>

      {/* Frequency Response Graph */}
      <FrequencyGraph bands={bands} />

      {/* EQ Bands */}
      <ScrollView style={styles.bandsContainer}>
        {bands.map((band, index) => (
          <EqualizerBand
            key={band.frequency}
            frequency={band.frequency}
            gain={band.gain}
            onGainChange={(gain: number) => updateBand(index, gain)} // ← FIX: add type
          />
        ))}
      </ScrollView>

      {/* Presets */}
      <View style={styles.presetsSection}>
        <TouchableOpacity
          style={styles.presetsHeader}
          onPress={() => setShowPresets(!showPresets)}
        >
          <Text style={styles.presetsTitle}>Presets</Text>
          <Text style={styles.presetsArrow}>
            {showPresets ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>

        {showPresets && (
          <View style={styles.presetsGrid}>
            {presets.map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetButton,
                  presetName === preset && styles.presetButtonActive,
                ]}
                onPress={() => applyPreset(preset)}
              >
                <Text
                  style={[
                    styles.presetText,
                    presetName === preset && styles.presetTextActive,
                  ]}
                >
                  {preset.charAt(0).toUpperCase() + preset.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  title: {
    color: '#F0F4F8',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeText: {
    color: '#C8D4E0',
    fontSize: 14,
  },
  bandsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  presetsSection: {
    borderTopWidth: 1,
    borderTopColor: '#1F2A3A',
    padding: 16,
  },
  presetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetsTitle: {
    color: '#F0F4F8',
    fontSize: 18,
    fontWeight: '600',
  },
  presetsArrow: {
    color: '#C8D4E0',
    fontSize: 16,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  presetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F2A3A',
    minWidth: 80,
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: '#00D4AA',
  },
  presetText: {
    color: '#C8D4E0',
    fontSize: 14,
    fontWeight: '500',
  },
  presetTextActive: {
    color: '#0A1628',
  },
});