import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NowPlaying } from '@/components/audio/NowPlaying';
import { PlayerControls } from '@/components/audio/PlayerControls';
import { usePlayerStore } from '@/store/playerStore';

export default function PlayerScreen() {
  const { currentSong } = usePlayerStore();

  if (!currentSong) {
    return (
      <View style={styles.center}>
        <Text style={styles.noSong}>Pilih lagu dari Library</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NowPlaying />
      <PlayerControls />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A1628' },
  noSong: { color: '#C8D4E0', fontSize: 16 },
});