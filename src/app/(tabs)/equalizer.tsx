import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useEqualizer } from '@/hooks/useEqualizer';
import { EqualizerBand } from '@/components/equalizer/EqualizerBand';
import { FrequencyGraph } from '@/components/equalizer/FrequencyGraph';
import { SavePresetModal } from '@/components/equalizer/SavePresetModal';
import { ALL_PRESETS } from '@/constants/equalizerPresets';
import { Preset } from '@/types/equalizer';
import { loadCustomPresets, deleteCustomPreset } from '@/services/PresetStorage';

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const { colors, spacing, typography } = theme;
  
  // Hooks
  const {
    bands,
    isActive,
    presetName,
    updateBand,
    applyPreset,
    toggleEQ,
    presets,
  } = useEqualizer();

  // State
  const [saveVisible, setSaveVisible] = useState(false);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('flat');

  // Load custom presets
  const reloadCustomPresets = useCallback(async () => {
    const loaded = await loadCustomPresets();
    setCustomPresets(loaded);
  }, []);

  useEffect(() => {
    reloadCustomPresets();
  }, []);

  // Combine all presets
  const allPresets = [...ALL_PRESETS, ...customPresets];

  // Handle preset selection
  const handleApplyPreset = (preset: Preset) => {
    Haptics.selectionAsync();
    applyPreset(preset.name.toLowerCase() as any);
    setActivePresetId(preset.id);
  };

  // Handle delete custom preset
  const handleDeletePreset = (preset: Preset) => {
    Alert.alert(
      'Hapus Preset',
      `Yakin ingin menghapus "${preset.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            await deleteCustomPreset(preset.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            reloadCustomPresets();
          },
        },
      ]
    );
  };

  // Handle save new preset
  const handleSavePreset = (name: string) => {
    reloadCustomPresets();
    Alert.alert('✅', `Preset "${name}" disimpan`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { 
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
      }]}>
        <Text style={[styles.title, { 
          color: colors.text.primary,
          fontSize: 24,
          fontWeight: '800',
        }]}>
          Equalizer
        </Text>
        
        <View style={[styles.headerRight, { 
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }]}>
          <Switch
            value={isActive}
            onValueChange={(value) => {
              Haptics.selectionAsync();
              toggleEQ();
            }}
            trackColor={{ 
              false: colors.background.tertiary, 
              true: colors.primary[500] + '80' 
            }}
            thumbColor={isActive ? colors.primary[500] : colors.text.tertiary}
          />
          
          <TouchableOpacity 
            style={[styles.saveBtn, { 
              backgroundColor: colors.primary[500],
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: 20,
            }]} 
            onPress={() => setSaveVisible(true)}
          >
            <Text style={[styles.saveBtnText, { 
              fontSize: 12,
              color: colors.background.primary,
              fontWeight: '700',
            }]}>
              + Simpan
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Frequency Graph */}
      <View style={[styles.graphContainer, { 
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        padding: spacing.sm,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.background.tertiary,
      }]}>
        <FrequencyGraph bands={bands} height={80} />
      </View>

      {/* Presets */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={[styles.presetsContainer, { 
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: spacing.xs,
        }]}
      >
        {allPresets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const isCustom = preset.id.startsWith('custom_');
          
          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.presetChip,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isActive 
                    ? colors.primary[500] 
                    : isCustom 
                      ? colors.primary[500] + '40' 
                      : colors.background.tertiary,
                  backgroundColor: isActive 
                    ? colors.primary[500] 
                    : 'transparent',
                }
              ]}
              onPress={() => handleApplyPreset(preset)}
              onLongPress={() => isCustom && handleDeletePreset(preset)}
              activeOpacity={0.7}
            >
              {isCustom && (
                <Text style={[styles.presetStar, { 
                  fontSize: 12,
                  color: '#FFB84D',
                  marginRight: 2,
                }]}>
                  ★
                </Text>
              )}
              <Text style={[
                styles.presetText,
                {
                  fontSize: 12,
                  fontWeight: isActive ? '700' : '400',
                  color: isActive 
                    ? colors.background.primary 
                    : colors.text.secondary,
                }
              ]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* EQ Sliders */}
      <View style={styles.slidersContainer}>
        <ScrollView style={{ flex: 1 }}>
          {bands.map((band, index) => (
            <EqualizerBand
              key={band.frequency}
              frequency={band.frequency}
              gain={band.gain}
              onGainChange={(gain) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateBand(index, gain);
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Save Preset Modal */}
      <SavePresetModal
        visible={saveVisible}
        onClose={() => setSaveVisible(false)}
        onSaved={handleSavePreset}
        currentBands={bands}
      />
    </SafeAreaView>
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
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveBtn: {
    borderRadius: 20,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  graphContainer: {
    // style di-inline
  },
  presetsContainer: {
    flexDirection: 'row',
  },
  presetChip: {
    borderRadius: 20,
    borderWidth: 1,
  },
  presetStar: {
    fontSize: 12,
  },
  presetText: {
    fontSize: 12,
  },
  slidersContainer: {
    flex: 1,
  },
});