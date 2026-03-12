// src/app/settings.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUSBDAC } from '@/hooks/useUSBDAC';

export default function SettingsScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { colors, spacing } = theme;
  
  const { 
    dacs, 
    currentDAC, 
    isExclusiveMode, 
    toggleExclusiveMode,
    scanDACs 
  } = useUSBDAC();

  const [showDacSettings, setShowDacSettings] = useState(false);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Tampilan */}
      <View style={[styles.section, { 
        margin: spacing.md,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
      }]}>
        <Text style={[styles.sectionTitle, { 
          padding: spacing.md,
          color: colors.text.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
        }]}>
          Tampilan
        </Text>
        
        <View style={[styles.settingRow, { 
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: spacing.md,
        }]}>
          <Text style={{ color: colors.text.primary }}>Mode Gelap</Text>
          <Switch
            value={isDarkMode}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
          />
        </View>
      </View>

      {/* Audio */}
      <View style={[styles.section, { 
        margin: spacing.md,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
      }]}>
        <Text style={[styles.sectionTitle, { 
          padding: spacing.md,
          color: colors.text.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
        }]}>
          Audio
        </Text>
        
        <TouchableOpacity 
          style={[styles.settingRow, { 
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: spacing.md,
          }]}
          onPress={() => setShowDacSettings(!showDacSettings)}
        >
          <Text style={{ color: colors.text.primary }}>USB DAC</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {currentDAC ? (
              <>
                <Text style={{ color: colors.primary[500], marginRight: spacing.xs }}>
                  {currentDAC.name}
                </Text>
                <View style={[styles.dot, { 
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.status.success,
                  marginRight: spacing.xs,
                }]} />
              </>
            ) : (
              <Text style={{ color: colors.text.secondary }}>Tidak terdeteksi</Text>
            )}
            <Ionicons 
              name={showDacSettings ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color={colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>

        {showDacSettings && (
          <View style={{ padding: spacing.md }}>
            <TouchableOpacity
              style={[styles.dacButton, { 
                backgroundColor: colors.background.primary,
                padding: spacing.md,
                borderRadius: 8,
                alignItems: 'center',
                marginBottom: spacing.md,
              }]}
              onPress={scanDACs}
            >
              <Text style={{ color: colors.text.primary }}>Scan USB DAC</Text>
            </TouchableOpacity>

            {dacs.length > 0 ? (
              dacs.map((dac) => (
                <TouchableOpacity
                  key={dac.id}
                  style={[styles.dacItem, { 
                    padding: spacing.md,
                    backgroundColor: currentDAC?.id === dac.id ? colors.primary[500] + '20' : 'transparent',
                    borderRadius: 8,
                    marginBottom: spacing.xs,
                  }]}
                >
                  <Text style={{ color: colors.text.primary }}>{dac.name}</Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                    {dac.capabilities.dsdNative ? 'DSD Native • ' : ''}
                    {dac.sampleRates?.slice(-1)[0]}kHz max
                  </Text>
                </TouchableOpacity>
              ))
            ) : null}

            {currentDAC && (
              <View style={[styles.exclusiveMode, { 
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: spacing.md,
                paddingTop: spacing.md,
                borderTopWidth: 1,
                borderTopColor: colors.background.tertiary,
              }]}>
                <Text style={{ color: colors.text.primary }}>Exclusive Mode</Text>
                <Switch
                  value={isExclusiveMode}
                  onValueChange={toggleExclusiveMode}
                  trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* About */}
      <View style={[styles.section, { 
        margin: spacing.md,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
      }]}>
        <Text style={[styles.sectionTitle, { 
          padding: spacing.md,
          color: colors.text.primary,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
        }]}>
          Tentang
        </Text>
        
        <View style={[styles.settingRow, { 
          padding: spacing.md,
        }]}>
          <Text style={{ color: colors.text.primary }}>Versi</Text>
          <Text style={{ color: colors.text.secondary }}>1.0.0</Text>
        </View>

        <TouchableOpacity style={[styles.settingRow, { 
          padding: spacing.md,
        }]}>
          <Text style={{ color: colors.text.primary }}>Lisensi & Kredit</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    // style di-inline
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dacButton: {
    alignItems: 'center',
  },
  dacItem: {
    // style di-inline
  },
  exclusiveMode: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});