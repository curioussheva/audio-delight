import React, { useEffect } from "react";
import { View, Image, TouchableOpacity, StyleSheet, Text } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/context/ThemeContext";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

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

  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isPlaying) {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 10000,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [isPlaying]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onToggleVisualizer}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
        {artwork && !showVisualizer ? (
          <Image
            source={{ uri: artwork }}
            style={[
              styles.image,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          />
        ) : showVisualizer ? (
          <SpectrumAnalyzer
            isPlaying={isPlaying} // <--- PERBAIKAN: Tambahkan ini agar error TS2741 hilang
            width={size}
            height={size}
            barCount={32}
            color={theme.colors.primary[500]}
            backgroundColor={theme.colors.background.secondary}
          />
        ) : (
          <View
            style={[
              styles.placeholder,
              {
                backgroundColor: theme.colors.background.tertiary,
                borderRadius: size / 2,
              },
            ]}
          >
            <Text
              style={[
                styles.placeholderText,
                { color: theme.colors.primary[500] },
              ]}
            >
              ♪
            </Text>
          </View>
        )}
      </Animated.View>

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
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  image: {
    resizeMode: "cover",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 48,
    fontWeight: "bold",
  },
});
