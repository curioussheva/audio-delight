// Di src/components/audio/AlbumArt.tsx
import React, { useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { SpectrumAnalyzer } from '@/components/visualizer/SpectrumAnalyzer';

interface AlbumArtProps {
  artwork?: string;
  isPlaying: boolean;
  onToggleVisualizer: () => void;
  showVisualizer: boolean;
  size?: number;
}

export const AlbumArt: React.FC<AlbumArtProps> = ({
  artwork,
  isPlaying,
  onToggleVisualizer,
  showVisualizer,
  size = 280,
}) => {
  const { theme } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onToggleVisualizer}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: showVisualizer ? size / 2 : 16,
          transform: [{ scale: isPressed ? 0.98 : 1 }],
        },
      ]}
    >
      {artwork && !showVisualizer ? (
        <Image
          source={{ uri: artwork }}
          style={[styles.image, { width: size, height: size, borderRadius: 16 }]}
        />
      ) : showVisualizer ? (
        <SpectrumAnalyzer   // ← HAPUS style prop, tidak didukung
          width={size}
          height={size}
          barCount={32}
          color={theme.colors.primary[500]}
          backgroundColor={theme.colors.background.secondary}
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: theme.colors.background.tertiary }]}>
          <Text style={[styles.placeholderText, { color: theme.colors.primary[500] }]}>  // ← PAKAI Text
            ♪
          </Text>
        </View>
      )}

      {showVisualizer && isPlaying && (
        <BlurView
          intensity={20}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {},
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {  // ← TAMBAHKAN
    fontSize: 48,
    fontWeight: 'bold',
  },
});