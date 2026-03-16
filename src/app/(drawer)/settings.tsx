import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUSBDAC } from '@/hooks/useUSBDAC';
import { usePlayerStore } from '@/store/playerStore';
import { ThemePicker } from '@/components/ui/ThemePicker';

export default function SettingsScreen() {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { colors, spacing } = theme;

  // ===== STATE =====
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDacSettings, setShowDacSettings] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // ===== HOOKS =====
  const { 
    dacs, 
    currentDAC, 
    isExclusiveMode, 
    loading,
    error,
    config,
    scanDACs,
    selectDAC,
    toggleExclusiveMode,
    setSampleRate 
  } = useUSBDAC();

  const { playbackSpeed, defaultEQ } = usePlayerStore();

  // ===== HANDLERS =====
  const handleScanDAC = async () => {
    try {
      await scanDACs();
      Alert.alert('Sukses', 'Scan USB DAC selesai');
    } catch (error) {
      Alert.alert('Error', 'Gagal scan USB DAC');
    }
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset Settings',
      'Yakin ingin mereset semua pengaturan ke default?',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: () => {
            Alert.alert('Sukses', 'Semua pengaturan telah direset');
          }
        },
      ]
    );
  };
  
  const handleExclusiveToggle = async (value: boolean) => {
  try {
    // Memberikan feedback haptik jika tersedia
    await toggleExclusiveMode();
  } catch (err) {
    Alert.alert("Mode Eksklusif", "Gagal mengaktifkan mode eksklusif. Pastikan DAC mendukung akses langsung.");
  }
};

  // ===== RENDER SECTION: TAMPILAN =====
  const renderTampilanSection = () => (
    <View style={[styles.section, { 
      backgroundColor: colors.background.secondary,
      borderRadius: 16,
      marginBottom: spacing.md,
      overflow: 'hidden',
    }]}>
      {/* Header */}
      <View style={[styles.sectionHeader, { 
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.background.tertiary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }]}>
        <Ionicons name="color-palette-outline" size={24} color={colors.primary[500]} />
        <Text style={[styles.sectionTitle, { 
          color: colors.text.primary,
        }]}>
          Tampilan
        </Text>
      </View>

      {/* Theme Selector */}
      <TouchableOpacity
        style={[styles.settingRow, { 
          padding: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }]}
        onPress={() => setShowThemePicker(true)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="brush-outline" size={20} color={colors.text.secondary} />
          <Text style={{ color: colors.text.primary }}>Tema</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            backgroundColor: colors.primary[500],
            marginRight: spacing.xs,
          }} />
          <Text style={{ color: colors.text.secondary }}>{theme.name}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
        </View>
      </TouchableOpacity>

      {/* Dark Mode Toggle */}
      <View style={[styles.settingRow, { 
        padding: spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name={isDarkMode ? "moon-outline" : "sunny-outline"} size={20} color={colors.text.secondary} />
          <Text style={{ color: colors.text.primary }}>Mode Gelap</Text>
        </View>
        <Switch
  value={isDarkMode}
  onValueChange={() => toggleTheme()} // Perbaikan: Dibungkus agar me-return void
  trackColor={{ 
    false: colors.background.tertiary, 
    true: colors.primary[500] 
  }}
  thumbColor={isDarkMode ? colors.text.primary : colors.text.secondary}
/>

      </View>
    </View>
  );

  // ===== RENDER SECTION: USB DAC =====
  const renderDacSection = () => (
    <View style={[styles.section, { 
      backgroundColor: colors.background.secondary,
      borderRadius: 16,
      marginBottom: spacing.md,
      overflow: 'hidden',
    }]}>
      {/* Header */}
      <TouchableOpacity
        style={[styles.sectionHeader, { 
          padding: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }]}
        onPress={() => setShowDacSettings(!showDacSettings)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="hardware-chip-outline" size={24} color={colors.primary[500]} />
          <Text style={[styles.sectionTitle, { 
            color: colors.text.primary,
          }]}>
            USB DAC
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {currentDAC && (
            <View style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.status.success,
              marginRight: spacing.sm,
            }} />
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
          {/* Error Message */}
          {error && (
            <View style={{
              backgroundColor: colors.status.error + '20',
              padding: spacing.sm,
              borderRadius: 8,
              marginBottom: spacing.sm,
              borderWidth: 1,
              borderColor: colors.status.error,
            }}>
              <Text style={{ color: colors.status.error, fontSize: 12 }}>
                Error: {error}
              </Text>
            </View>
          )}

          {/* Loading Indicator */}
          {loading && (
            <View style={{
              padding: spacing.md,
              alignItems: 'center',
            }}>
              <ActivityIndicator size="small" color={colors.primary[500]} />
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: spacing.xs }}>
                Processing...
              </Text>
            </View>
          )}

          {/* Status & Scan Button */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.md,
          }}>
            <Text style={{ color: colors.text.secondary }}>
              Status: {currentDAC ? 'Terhubung' : 'Tidak terdeteksi'}
            </Text>
            <TouchableOpacity
              onPress={handleScanDAC}
              disabled={loading}
              style={{
                backgroundColor: colors.primary[500],
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: colors.background.primary, fontSize: 12 }}>
                {loading ? 'Scanning...' : 'Scan'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Daftar DAC */}
          {dacs.length > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: spacing.xs }}>
                Device tersedia:
              </Text>
              {dacs.map((dac) => (
  <TouchableOpacity
    key={dac.id}
    onPress={() => selectDAC(dac.id)}
    style={[
      styles.dacItem,
      { backgroundColor: currentDAC?.id === dac.id ? colors.primary[500] + '25' : 'transparent' }
    ]}
  >
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{dac.name}</Text>
      <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
        {dac.id} • {dac.channelCount} Channels
      </Text>
    </View>
    {currentDAC?.id === dac.id && (
      <Ionicons name="checkmark-circle" size={22} color={colors.primary[500]} />
    )}
  </TouchableOpacity>
))}
            </View>
          ) : null}

          {/* Exclusive Mode */}
          {currentDAC && (
            <>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.background.tertiary,
              }}>
                <Text style={{ color: colors.text.primary }}>Exclusive Mode</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  {isExclusiveMode && (
                    <View style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.status.success,
                    }} />
                  )}
                  <Switch
  value={isExclusiveMode}
  onValueChange={(value) => {
    // Jalankan tanpa me-return promise-nya
    toggleExclusiveMode();
  }}
  disabled={loading}
  trackColor={{ 
    false: colors.background.tertiary, 
    true: colors.primary[500] 
  }}
  thumbColor={isExclusiveMode ? colors.text.primary : '#f4f3f4'}
/>

                </View>
              </View>

              {/* Sample Rate Selector */}
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.text.secondary, marginBottom: spacing.xs }}>
                  Sample Rate
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {currentDAC.sampleRates?.map((rate) => (
                      <TouchableOpacity
                        key={rate}
                        onPress={() => setSampleRate(rate)}
                        style={{
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.xs,
                          backgroundColor: config?.sampleRate === rate 
                            ? colors.primary[500] 
                            : colors.background.tertiary,
                          borderRadius: 20,
                        }}
                      >
                        <Text style={{
                          color: config?.sampleRate === rate 
                            ? colors.background.primary 
                            : colors.text.primary,
                          fontSize: 12,
                        }}>
                          {rate / 1000}kHz
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => setSampleRate(0)}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
                        backgroundColor: config?.sampleRate === 0 
                          ? colors.primary[500] 
                          : colors.background.tertiary,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{
                        color: config?.sampleRate === 0 
                          ? colors.background.primary 
                          : colors.text.primary,
                        fontSize: 12,
                      }}>
                        Auto
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>

              {/* Info */}
              <View style={{
                marginTop: spacing.md,
                padding: spacing.sm,
                backgroundColor: colors.background.tertiary,
                borderRadius: 8,
              }}>
                <Text style={{ color: colors.text.secondary, fontSize: 11 }}>
                  ℹ️ Exclusive mode mengirim audio langsung ke DAC tanpa modifikasi.
                </Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );

  // ===== RENDER SECTION: AUDIO =====
  const renderAudioSection = () => (
    <View style={[styles.section, { 
      backgroundColor: colors.background.secondary,
      borderRadius: 16,
      marginBottom: spacing.md,
      overflow: 'hidden',
    }]}>
      {/* Header */}
      <TouchableOpacity
        style={[styles.sectionHeader, { 
          padding: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }]}
        onPress={() => setShowAudioSettings(!showAudioSettings)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="musical-notes-outline" size={24} color={colors.primary[500]} />
          <Text style={[styles.sectionTitle, { 
            color: colors.text.primary,
          }]}>
            Audio
          </Text>
        </View>
        <Ionicons 
          name={showAudioSettings ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={colors.text.secondary} 
        />
      </TouchableOpacity>

      {showAudioSettings && (
        <View style={{ padding: spacing.md }}>
          {/* Default EQ */}
          <TouchableOpacity style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
          }}>
            <Text style={{ color: colors.text.primary }}>Default EQ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: colors.text.secondary, marginRight: spacing.xs }}>
                {defaultEQ || 'Flat'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            </View>
          </TouchableOpacity>

          {/* Playback Speed */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.background.tertiary,
          }}>
            <Text style={{ color: colors.text.primary }}>Playback Speed</Text>
            <Text style={{ color: colors.primary[500] }}>{playbackSpeed || 1.0}x</Text>
          </View>

          {/* Replay Gain */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.background.tertiary,
          }}>
            <Text style={{ color: colors.text.primary }}>ReplayGain</Text>
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: colors.background.tertiary, true: colors.primary[500] }}
            />
          </View>
        </View>
      )}
    </View>
  );

  // ===== RENDER SECTION: TENTANG =====
  const renderAboutSection = () => (
    <View style={[styles.section, { 
      backgroundColor: colors.background.secondary,
      borderRadius: 16,
      marginBottom: spacing.md,
      overflow: 'hidden',
    }]}>
      {/* Header */}
      <TouchableOpacity
        style={[styles.sectionHeader, { 
          padding: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.background.tertiary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }]}
        onPress={() => setShowAbout(!showAbout)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="information-circle-outline" size={24} color={colors.primary[500]} />
          <Text style={[styles.sectionTitle, { 
            color: colors.text.primary,
          }]}>
            Tentang
          </Text>
        </View>
        <Ionicons 
          name={showAbout ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={colors.text.secondary} 
        />
      </TouchableOpacity>

      {showAbout && (
        <View style={{ padding: spacing.md }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[styles.appName, { 
              color: colors.primary[500],
              fontSize: 28,
              fontWeight: '700',
              marginBottom: spacing.xs,
            }]}>
              PristineAudio
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              Version 1.0.0 (Build 2026.03)
            </Text>
          </View>

          <View style={{ 
            backgroundColor: colors.background.tertiary,
            borderRadius: 8,
            padding: spacing.md,
            marginBottom: spacing.md,
          }}>
            <Text style={{ color: colors.text.primary, marginBottom: spacing.xs }}>
              High-Fidelity Audio Player for Audiophiles
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              • 10-band Equalizer with presets
              {'\n'}• Real-time spectrum visualizer
              {'\n'}• FLAC/DSD support
              {'\n'}• USB DAC exclusive mode
              {'\n'}• M3U playlist import/export
            </Text>
          </View>

          <TouchableOpacity style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
          }}>
            <Text style={{ color: colors.text.primary }}>Lisensi & Kredit</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          <TouchableOpacity style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing.sm,
            borderTopWidth: 1,
            borderTopColor: colors.background.tertiary,
          }}>
            <Text style={{ color: colors.text.primary }}>Kebijakan Privasi</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ===== RENDER =====
  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { 
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }]}>
        <Text style={[styles.headerTitle, { 
          color: colors.text.primary,
        }]}>
          Settings
        </Text>
      </View>

      {/* Sections */}
      {renderTampilanSection()}
      {renderDacSection()}
      {renderAudioSection()}
      {renderAboutSection()}

      {/* Reset Button */}
      <TouchableOpacity
        onPress={handleResetAll}
        style={{
          marginHorizontal: spacing.md,
          marginTop: spacing.md,
          padding: spacing.md,
          backgroundColor: colors.status.error + '20',
          borderRadius: 8,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.status.error,
        }}
      >
        <Text style={{ color: colors.status.error }}>Reset All Settings</Text>
      </TouchableOpacity>

      {/* Theme Picker Modal */}
      <ThemePicker
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    // style di-inline
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  section: {
    // style di-inline
  },
  sectionHeader: {
    // style di-inline
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  settingRow: {
    // style di-inline
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
  },
  dacItem: {},
});

