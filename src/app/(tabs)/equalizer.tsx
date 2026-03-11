import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { EqualizerBand } from '@/components/equalizer/EqualizerBand';
import { FrequencyGraph } from '@/components/equalizer/FrequencyGraph';
import { useEqualizer } from '@/hooks/useEqualizer';

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;

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
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { 
        borderBottomColor: colors.background.tertiary,
        padding: spacing.lg,
      }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Equalizer</Text>
        <View style={[styles.headerRight, { gap: spacing.sm }]}>
          <Text style={[styles.activeText, { color: colors.text.secondary }]}>
            {isActive ? 'Aktif' : 'Nonaktif'}
          </Text>
          <Switch
            value={isActive}
            onValueChange={toggleEQ}
            trackColor={{ 
              false: colors.background.tertiary, 
              true: colors.primary[500] 
            }}
            thumbColor={isActive ? colors.text.primary : colors.text.tertiary}
          />
        </View>
      </View>

      {/* Frequency Response Graph */}
      <FrequencyGraph bands={bands} />

      {/* EQ Bands */}
      <ScrollView style={[styles.bandsContainer, { paddingHorizontal: spacing.md }]}>
        {bands.map((band, index) => (
          <EqualizerBand
            key={band.frequency}
            frequency={band.frequency}
            gain={band.gain}
            onGainChange={(gain: number) => updateBand(index, gain)}
          />
        ))}
      </ScrollView>

      {/* Presets */}
      <View style={[styles.presetsSection, { 
        borderTopColor: colors.background.tertiary,
        padding: spacing.lg,
      }]}>
        <TouchableOpacity
          style={styles.presetsHeader}
          onPress={() => setShowPresets(!showPresets)}
        >
          <Text style={[styles.presetsTitle, { color: colors.text.primary }]}>
            Presets
          </Text>
          <Text style={[styles.presetsArrow, { color: colors.text.secondary }]}>
            {showPresets ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>

        {showPresets && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={[styles.presetsScroll, { marginTop: spacing.md }]}
          >
            <View style={[styles.presetsGrid, { 
              paddingHorizontal: spacing.md,
              gap: spacing.sm,
            }]}>
              {presets.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetButton,
                    {
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                      backgroundColor: presetName === preset 
                        ? colors.primary[500] 
                        : colors.background.tertiary,
                    },
                  ]}
                  onPress={() => applyPreset(preset)}
                >
                  <Text
                    style={{
                      fontSize: typography.button.fontSize,
                      fontWeight: typography.button.fontWeight as any,
                      lineHeight: typography.button.lineHeight,
                      color: presetName === preset 
                        ? colors.background.primary 
                        : colors.text.secondary,
                    }}
                  >
                    {preset.charAt(0).toUpperCase() + preset.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeText: {
    fontSize: 14,
  },
  bandsContainer: {
    flex: 1,
  },
  presetsSection: {
    borderTopWidth: 1,
  },
  presetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  presetsArrow: {
    fontSize: 16,
  },
  presetsScroll: {
    // style di-inline
  },
  presetsGrid: {
    flexDirection: 'row',
  },
  presetButton: {
    borderRadius: 24,
  },
});