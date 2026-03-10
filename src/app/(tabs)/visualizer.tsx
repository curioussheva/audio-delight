import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SpectrumAnalyzer } from '@/components/visualizer/SpectrumAnalyzer';
import { usePlayerStore } from '@/store/playerStore';

type VisualizerMode = 'bars' | 'waveform' | 'circle';

export default function VisualizerScreen() {
  const { currentSong, isPlaying } = usePlayerStore();
  const [mode, setMode] = useState<VisualizerMode>('bars');

  if (!currentSong) {
    return (
      <View style={styles.center}>
        <Text style={styles.noSong}>Putar lagu untuk melihat visualizer</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Visualizer</Text>
        <View style={styles.modeButtons}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'bars' && styles.modeButtonActive]}
            onPress={() => setMode('bars')}
          >
            <Text style={[styles.modeText, mode === 'bars' && styles.modeTextActive]}>
              Bars
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'waveform' && styles.modeButtonActive]}
            onPress={() => setMode('waveform')}
          >
            <Text style={[styles.modeText, mode === 'waveform' && styles.modeTextActive]}>
              Wave
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'circle' && styles.modeButtonActive]}
            onPress={() => setMode('circle')}
          >
            <Text style={[styles.modeText, mode === 'circle' && styles.modeTextActive]}>
              Circle
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.visualizerContainer}>
        {mode === 'bars' && (
          <SpectrumAnalyzer
            width={350}
            height={200}
            barCount={32}
            color="#00D4AA"
          />
        )}
        {mode === 'waveform' && (
          <SpectrumAnalyzer
            width={350}
            height={200}
            barCount={64}
            barWidth={2}
            barSpacing={1}
            color="#00D4AA"
          />
        )}
        {mode === 'circle' && (
          <View style={styles.circlePlaceholder}>
            <Text style={styles.comingSoon}>Coming Soon</Text>
          </View>
        )}
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
    backgroundColor: '#0A1628',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1628',
  },
  noSong: {
    color: '#C8D4E0',
    fontSize: 16,
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
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1F2A3A',
  },
  modeButtonActive: {
    backgroundColor: '#00D4AA',
  },
  modeText: {
    color: '#C8D4E0',
    fontSize: 12,
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#0A1628',
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
    backgroundColor: '#1F2A3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoon: {
    color: '#C8D4E0',
    fontSize: 16,
  },
  songInfo: {
    padding: 24,
    alignItems: 'center',
  },
  songTitle: {
    color: '#F0F4F8',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  songArtist: {
    color: '#C8D4E0',
    fontSize: 16,
    textAlign: 'center',
  },
});