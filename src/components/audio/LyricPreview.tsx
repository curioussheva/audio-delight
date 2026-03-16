import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { usePlayerStore } from '@/store/playerStore';

export const LyricsPreview = () => {
  const { lyrics, position: progress } = usePlayerStore();

  const currentLine = useMemo(() => {
    if (!lyrics.length) return null;
    // Cari baris lirik berdasarkan progress lagu saat ini
    return [...lyrics].reverse().find((line) => progress >= line.time);
  }, [lyrics, progress]);

  if (!currentLine) return null;

  return (
    <Animated.View 
      entering={FadeInUp} 
      exiting={FadeOutDown} 
      style={styles.container}
    >
      <Text style={styles.text} numberOfLines={1}>
        {currentLine.text}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 170, // Di atas FloatingPlayer
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: '80%',
  },
  text: {
    color: '#00D4AA', // Aksen Teal
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
