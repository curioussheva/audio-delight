import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { SpectrumAnalyzer } from '@/components/visualizer/SpectrumAnalyzer';
import { usePlayerStore } from '@/store/playerStore';
import { COLORS, TYPOGRAPHY, SPACING } from '@/constants/theme';

type VisualizerMode = 'bars' | 'wave' | 'circle';

export default function VisualizerScreen() {
  const { currentSong, isPlaying } = usePlayerStore();
  const [mode, setMode] = useState<VisualizerMode>('bars');
  const [sensitivity, setSensitivity] = useState(0.5);

  if (!currentSong) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="analytics" size={64} color={COLORS.background.tertiary} />
        <Text style={styles.emptyText}>Putar lagu untuk melihat visualizer</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Visualizer</Text>
        <View style={styles.modeButtons}>
          {(['bars', 'wave', 'circle'] as VisualizerMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.modeButton, mode === m && styles.modeButtonActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.visualizerContainer}>
        {mode === 'bars' && (
          <SpectrumAnalyzer
            width={350}
            height={200}
            barCount={32}
            color={COLORS.primary[500]}
            sensitivity={sensitivity}
          />
        )}
        {mode === 'wave' && (
          <SpectrumAnalyzer
            width={350}
            height={200}
            barCount={64}
            barWidth={2}
            barSpacing={1}
            color={COLORS.primary[500]}
            sensitivity={sensitivity}
          />
        )}
        {mode === 'circle' && (
          <View style={styles.circlePlaceholder}>
            <Text style={styles.comingSoon}>Coming Soon</Text>
          </View>
        )}
      </View>

      <View style={styles.controlPanel}>
        <Text style={styles.controlLabel}>Sensitivity</Text>
        <Slider
          style={styles.slider}
          minimumValue={0.2}
          maximumValue={1.5}
          value={sensitivity}
          onValueChange={setSensitivity}
          minimumTrackTintColor={COLORS.primary[500]}
          maximumTrackTintColor={COLORS.background.tertiary}
          thumbTintColor={COLORS.primary[500]}
        />
        <Text style={styles.sensitivityValue}>{sensitivity.toFixed(1)}x</Text>
      </View>

      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{currentSong.title}</Text>
        <Text style={styles.songArtist}>{currentSong.artist}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background.primary,
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text.secondary,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background.tertiary,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text.primary,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  modeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    backgroundColor: COLORS.background.tertiary,
  },
  modeButtonActive: {
    backgroundColor: COLORS.primary[500],
  },
  modeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.text.secondary,
  },
  modeTextActive: {
    color: COLORS.background.primary,
    fontWeight: '600',
  },
  visualizerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circlePlaceholder: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoon: {
    ...TYPOGRAPHY.body2,
    color: COLORS.text.tertiary,
  },
  controlPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  controlLabel: {
    ...TYPOGRAPHY.body2,
    color: COLORS.text.secondary,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sensitivityValue: {
    ...TYPOGRAPHY.body2,
    color: COLORS.primary[500],
    width: 50,
    textAlign: 'right',
  },
  songInfo: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  songTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  songArtist: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
});