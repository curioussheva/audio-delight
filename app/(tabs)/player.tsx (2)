/**
 * Player Screen — Week 2
 * Full connected player: artwork, track info, progress, controls, visualizer
 */
import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { PlayerControls } from '../../src/components/player/PlayerControls';
import { ProgressBar } from '../../src/components/player/ProgressBar';
import { useVisualizer } from '../../src/hooks/useVisualizer';
import { SpectrumBars } from '../../src/components/visualizer/SpectrumBars';

const ARTWORK_SIZE = 220;

function formatFormat(fmt?: string) {
  if (!fmt) return '';
  return fmt.toUpperCase();
}

export default function PlayerScreen() {
  const { currentTrack, playbackState, init, isInitialized } = usePlayerStore();
  const { fftData, start, stop } = useVisualizer();
  const { width } = useWindowDimensions();
  const isPlaying = playbackState === 'playing';

  useEffect(() => {
    if (!isInitialized) init();
  }, []);

  useEffect(() => {
    if (isPlaying) start();
    else stop();
  }, [isPlaying]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.nowPlaying}>NOW PLAYING</Text>
        {currentTrack?.format && (
          <View style={styles.formatBadge}>
            <Text style={styles.formatText}>{formatFormat(currentTrack.format)}</Text>
          </View>
        )}
      </View>

      {/* Album Art */}
      <View style={styles.artWrap}>
        <View style={[styles.art, isPlaying && styles.artGlow]}>
          {currentTrack ? (
            <Text style={styles.artInitial}>
              {currentTrack.title.charAt(0).toUpperCase()}
            </Text>
          ) : (
            <Text style={styles.artEmoji}>♪</Text>
          )}
        </View>
        {/* Subtle pulse ring when playing */}
        {isPlaying && <View style={styles.artRing} />}
      </View>

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {currentTrack?.title ?? 'Pilih lagu dari Library'}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {currentTrack?.artist ?? '—'}
        </Text>
      </View>

      {/* Progress Bar */}
      <ProgressBar />

      {/* Controls */}
      <PlayerControls />

      {/* Spectrum Visualizer */}
      <View style={styles.spectrumWrap}>
        <SpectrumBars
          fftData={fftData}
          width={width - 48}
          height={64}
          barCount={48}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080a0f' },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 24,
    gap: 12,
  },
  nowPlaying: {
    fontSize: 10, color: '#6378ff',
    letterSpacing: 3, fontWeight: '600',
  },
  formatBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(99,120,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(99,120,255,0.3)',
  },
  formatText: { fontSize: 9, color: '#6378ff', letterSpacing: 1 },

  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  art: {
    width: ARTWORK_SIZE, height: ARTWORK_SIZE,
    borderRadius: 24,
    backgroundColor: '#111520',
    borderWidth: 1, borderColor: 'rgba(99,120,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  artGlow: {
    borderColor: 'rgba(99,120,255,0.3)',
    shadowColor: '#6378ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  artRing: {
    position: 'absolute',
    width: ARTWORK_SIZE + 20,
    height: ARTWORK_SIZE + 20,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(99,120,255,0.15)',
  },
  artInitial: { fontSize: 72, color: '#6378ff', fontWeight: '800', opacity: 0.7 },
  artEmoji: { fontSize: 72, opacity: 0.2 },

  trackInfo: { alignItems: 'center', paddingHorizontal: 32, gap: 4, marginBottom: 16 },
  trackTitle: {
    fontSize: 20, fontWeight: '700', color: '#e8eaf6',
    textAlign: 'center',
  },
  trackArtist: { fontSize: 13, color: '#5a6080', textAlign: 'center' },

  spectrumWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
});
