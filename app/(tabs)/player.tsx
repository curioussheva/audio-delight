import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { PlayerControls } from '../../src/components/player/PlayerControls';
import { ProgressBar } from '../../src/components/player/ProgressBar';
import { useVisualizer } from '../../src/hooks/useVisualizer';
import { SpectrumBars } from '../../src/components/visualizer/SpectrumBars';

export default function PlayerScreen() {
  const { currentTrack } = usePlayerStore();
  const { fftData, start, stop } = useVisualizer();

  useEffect(() => {
    start();
    return () => stop();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.nowPlaying}>NOW PLAYING</Text>
        <View style={styles.artWrap}>
          <View style={styles.art}>
            <Text style={styles.artEmoji}>♪</Text>
          </View>
        </View>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack?.title ?? 'Pilih lagu dari Library'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {currentTrack?.artist ?? '—'}
          </Text>
        </View>
        <ProgressBar />
        <PlayerControls />
        <View style={styles.spectrumWrap}>
          <SpectrumBars fftData={fftData} width={300} height={60} barCount={32} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080a0f' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 16 },
  nowPlaying: { fontSize: 10, color: '#6378ff', letterSpacing: 3, textAlign: 'center' },
  artWrap: { alignItems: 'center', marginVertical: 8 },
  art: { width: 220, height: 220, borderRadius: 20, backgroundColor: '#111520', borderWidth: 1, borderColor: 'rgba(99,120,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  artEmoji: { fontSize: 72, opacity: 0.3 },
  trackInfo: { alignItems: 'center', gap: 4 },
  trackTitle: { fontSize: 22, fontWeight: '700', color: '#e8eaf6', textAlign: 'center' },
  trackArtist: { fontSize: 14, color: '#5a6080', textAlign: 'center' },
  spectrumWrap: { flex: 1, justifyContent: 'flex-end', paddingBottom: 8 },
});
