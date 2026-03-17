import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image'; // Gunakan expo-image untuk performa
import NativeDSPModule from '@/services/native/NativeDSPModule';

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<'bit-perfect' | 'dsp' | null>(null);

  const handleSelectMode = (mode: 'bit-perfect' | 'dsp') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMode(mode);
  };

  const handleFinish = async () => {
  if (!selectedMode) return;
  
  try {
    // 1. Simpan preferensi
    await AsyncStorage.setItem('audio_mode_preference', selectedMode);
    await AsyncStorage.setItem('has_onboarded', 'true');
    
    // 2. Set mode awal ke Native
    if (selectedMode === 'bit-perfect') {
      await NativeDSPModule.toggleExclusiveMode(true);
      await NativeDSPModule.releaseAllFX(); // Pastikan efek bersih
    } else {
      await NativeDSPModule.toggleExclusiveMode(false);
      // Opsional: set default bass boost sedikit agar terasa bedanya
      // Note: Ini butuh sessionId, biasanya dilakukan saat player mulai
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(drawer)/(tabs)/library' as any);
  } catch (e) {
    console.error("Gagal menyimpan onboarding", e);
  }
};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.header}>
        {/* Menggunakan Logo Premium Anda */}
        <Image 
  source={require('../../assets/images/splash.png')} 
  style={styles.logo}
  contentFit="contain"
/>

        <Text style={[styles.welcomeText, { color: colors.text.secondary }]}>Experience Pure Sound</Text>
        <View style={[styles.divider, { backgroundColor: colors.primary[500] }]} />
      </View>

      <View style={styles.optionsContainer}>
        {/* Mode 1: Bit-Perfect */}
        <TouchableOpacity 
          activeOpacity={0.8}
          style={[
            styles.modeCard, 
            { backgroundColor: colors.background.secondary },
            selectedMode === 'bit-perfect' && { borderColor: '#D4AF37', borderWidth: 2 }
          ]}
          onPress={() => handleSelectMode('bit-perfect')}
        >
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(212, 175, 55, 0.1)' }]}>
            <Ionicons name="infinite-outline" size={32} color="#D4AF37" />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>True Bit-Rate (Pure)</Text>
            <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
              Memintas SRC Android. Output audio asli tanpa manipulasi software.
            </Text>
            <View style={styles.tagRow}>
              <Text style={styles.tag}>AUDIOPHILE</Text>
              <Text style={styles.tag}>DIRECT</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Mode 2: DSP Enhanced */}
        <TouchableOpacity 
          activeOpacity={0.8}
          style={[
            styles.modeCard, 
            { backgroundColor: colors.background.secondary },
            selectedMode === 'dsp' && { borderColor: '#00D4AA', borderWidth: 2 }
          ]}
          onPress={() => handleSelectMode('dsp')}
        >
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(0, 212, 170, 0.1)' }]}>
            <Ionicons name="options-outline" size={32} color="#00D4AA" />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>DSP Processing</Text>
            <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
              Aktifkan Equalizer, Bass Boost, dan Reverb untuk karakter suara kustom.
            </Text>
            <View style={styles.tagRow}>
              <Text style={[styles.tag, { color: '#00D4AA', borderColor: '#00D4AA' }]}>CUSTOM EQ</Text>
              <Text style={[styles.tag, { color: '#00D4AA', borderColor: '#00D4AA' }]}>ENHANCED</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[
          styles.nextButton, 
          { backgroundColor: selectedMode ? colors.primary[500] : colors.background.tertiary }
        ]}
        disabled={!selectedMode}
        onPress={handleFinish}
      >
        <Text style={[styles.nextButtonText, { color: '#000' }]}>
          MULAI MENDENGARKAN
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: { marginTop: 40, marginBottom: 30, alignItems: 'center' },
  logo: { width: 180, height: 100, marginBottom: 10 },
  welcomeText: { fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', fontWeight: '600' },
  divider: { height: 2, width: 30, marginTop: 15, borderRadius: 1 },
  optionsContainer: { flex: 1, gap: 16 },
  modeCard: { 
    padding: 20, 
    borderRadius: 20, 
    flexDirection: 'row', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    // Shadow untuk kesan elevasi premium
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 }
    })
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardDescription: { fontSize: 12, lineHeight: 18, opacity: 0.8 },
  tagRow: { flexDirection: 'row', marginTop: 10, gap: 6 },
  tag: { 
    fontSize: 8, 
    fontWeight: '900', 
    paddingHorizontal: 7, 
    paddingVertical: 3, 
    borderRadius: 4, 
    borderWidth: 1, 
    borderColor: '#D4AF37', 
    color: '#D4AF37' 
  },
  nextButton: { 
    height: 56, 
    borderRadius: 28, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20,
    // Pantulan cahaya untuk tombol utama
    shadowColor: '#00D4AA',
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  nextButtonText: { fontSize: 15, fontWeight: '800', letterSpacing: 1 }
});
