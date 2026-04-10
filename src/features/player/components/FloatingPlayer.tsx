import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";

// Lucide Icons
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
} from "lucide-react-native";

import { usePlayerStore } from "@/features/player/store/playerStore";
import { useTheme } from "@/context/ThemeContext";

const PLACEHOLDER = require("../../../../assets/images/icon.png");

export default function FloatingPlayer() {
  const { theme } = useTheme();
  const { colors, shadows } = theme;
  const router = useRouter();

  const isFocused = useIsFocused();

  const {
    currentSong,
    isPlaying,
    togglePlay,
    position,
    duration,
    playNext,
    playPrevious,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
  } = usePlayerStore();

  const translateX = useSharedValue(0);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > 80) runOnJS(playPrevious)();
      else if (e.translationX < -80) runOnJS(playNext)();
      translateX.value = withSpring(0);
    });

  const animatedProgress = useAnimatedStyle(() => {
    const pct = duration > 0 ? Math.min(position / duration, 1) : 0;
    return { width: `${pct * 100}%` };
  });

  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: withTiming(translateX.value === 0 ? 1 : 0.75),
  }));

  // Hanya muncul di Library tab + ada lagu yang diputar
  if (!currentSong || !isFocused) {
    return null;
  }

  const artworkSource = currentSong.artwork
    ? { uri: currentSong.artwork }
    : PLACEHOLDER;

  return (
    <View style={s.outer}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View
          style={[
            s.wrapper,
            {
              backgroundColor: colors.background.elevated,
              borderColor: colors.border?.light || "#ffffff20",
              ...shadows.xl,
            },
            animatedContainer,
          ]}
        >
          {/* Accent line */}
          <View
            style={[s.accentLine, { backgroundColor: colors.primary[500] }]}
          />

          {/* Progress bar */}
          <View
            style={[
              s.progressBg,
              { backgroundColor: colors.background.tertiary },
            ]}
          >
            <Animated.View
              style={[
                s.progressFill,
                { backgroundColor: colors.primary[400] },
                animatedProgress,
              ]}
            />
          </View>

          {/* Content */}
          <View style={s.content}>
            <Pressable onPress={() => router.push("/player" as any)}>
              <Image
                source={artworkSource}
                style={[
                  s.artwork,
                  { backgroundColor: colors.background.tertiary },
                ]}
                contentFit="cover"
                transition={300}
              />
            </Pressable>

            <Pressable
              style={s.info}
              onPress={() => router.push("/player" as any)}
            >
              <Text
                style={[s.title, { color: colors.text.primary }]}
                numberOfLines={1}
              >
                {currentSong.title}
              </Text>

              {/* META ROW - SUDAH DIPERBAIKI */}
              <View style={s.metaRow}>
                {/* HI-RES Badge */}
                {currentSong?.bitDepth > 16 && (
                  <View
                    style={[
                      s.hiResBadge,
                      { borderColor: colors.status.warning },
                    ]}
                  >
                    <Text
                      style={[s.hiResText, { color: colors.status.warning }]}
                    >
                      HI-RES
                    </Text>
                  </View>
                )}

                {/* Artist */}
                <Text
                  style={[s.artist, { color: colors.text.secondary }]}
                  numberOfLines={1}
                >
                  {currentSong?.artist || "Unknown Artist"}
                </Text>
              </View>
            </Pressable>

            {/* Controls */}
            <View style={s.controls}>
              <Pressable onPress={toggleShuffle} hitSlop={8}>
                <Shuffle
                  size={18}
                  color={shuffle ? colors.primary[400] : colors.text.tertiary}
                  strokeWidth={2.5}
                />
              </Pressable>

              <Pressable onPress={playPrevious} hitSlop={8}>
                <SkipBack
                  size={20}
                  color={colors.text.secondary}
                  strokeWidth={2.5}
                />
              </Pressable>

              <Pressable
                onPress={togglePlay}
                style={[s.playBtn, { backgroundColor: colors.primary[500] }]}
              >
                {isPlaying ? (
                  <Pause
                    size={20}
                    color={colors.text.inverse}
                    strokeWidth={3}
                  />
                ) : (
                  <Play
                    size={20}
                    color={colors.text.inverse}
                    strokeWidth={3}
                    style={{ marginLeft: 2 }}
                  />
                )}
              </Pressable>

              <Pressable onPress={playNext} hitSlop={8}>
                <SkipForward
                  size={20}
                  color={colors.text.secondary}
                  strokeWidth={2.5}
                />
              </Pressable>

              <Pressable
                onPress={toggleRepeat}
                hitSlop={8}
                style={{ position: "relative" }}
              >
                <Repeat
                  size={18}
                  color={
                    repeat !== "off"
                      ? colors.primary[400]
                      : colors.text.tertiary
                  }
                  strokeWidth={2.5}
                />
                {repeat === "track" && (
                  <View
                    style={[
                      s.repeatOneDot,
                      { backgroundColor: colors.primary[400] },
                    ]}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    position: "relative",
    bottom: Platform.OS === "ios" ? 100 : 85,
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  wrapper: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentLine: { height: 2.5, width: "100%" },
  progressBg: { height: 1.5, width: "100%" },
  progressFill: { height: "100%", borderRadius: 1 },
  content: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
    flexWrap: "wrap", // penting agar tidak overflow
  },
  separator: {
    color: "#888",
    marginHorizontal: 4,
    fontSize: 12,
  },
  artist: {
    fontSize: 12,
    flexShrink: 1,
  },
  hiResBadge: {
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  hiResText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  repeatOneDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    bottom: -2,
    alignSelf: "center",
  },
});
