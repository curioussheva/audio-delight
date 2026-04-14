import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
  Animated,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useAudioProgress } from "@/features/player/hooks/useAudioProgress";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { formatTime } from "@/shared/utils/time";
import Slider from "@react-native-community/slider";
import { SleepTimerModal } from "@/features/player/components/SleepTimerModal";
import { useTheme } from "@/context/ThemeContext";
import { useSafePadding } from "@/shared/hooks/useSafePadding";

// Lucide Icons
import {
  ChevronDown,
  Clock,
  Shuffle,
  SkipBack,
  SkipForward,
  Repeat,
  Play,
  Pause,
  Heart,
  ListMusic,
  Mic2,
  Volume2,
  Sparkles,
  Info,
} from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const safePadding = useSafePadding();
  const router = useRouter();

  const [showLyrics, setShowLyrics] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  const { position, duration } = useAudioProgress(250);

  const {
    currentSong,
    isPlaying,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    audioMode,
  } = usePlayerStore();

  const artworkScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(artworkScale, {
      toValue: isPlaying ? 1 : 0.98,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  useEffect(() => {
    usePlayerStore.getState().setMainPlayerOpen(true);
    return () => usePlayerStore.getState().setMainPlayerOpen(false);
  }, []);

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    togglePlay();
  };

  const handleSkip = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(artworkScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(artworkScale, {
        toValue: 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
    action();
  };

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLiked(!isLiked);
  };

  const handleOpenDetail = () => {
    if (currentSong?.id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: "/(drawer)/song/[id]",
        params: { id: currentSong.id },
      });
    }
  };

  if (!currentSong) return null;

  // Helper untuk warna dinamis
  const goldColor = colors.accent?.primary || colors.primary[500] || "#D4AF37";
  const primaryColor = colors.primary[500];
  const textPrimary = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary = colors.text.tertiary;
  const backgroundColor = colors.background.primary;
  const backgroundSecondary = colors.background.secondary;
  const backgroundElevated = colors.background.elevated;
  const borderColor = colors.border?.light || colors.background.tertiary;
  const successColor = colors.status.success;
  const errorColor = colors.status.error;

  // Gradient colors - sesuaikan untuk light/dark mode
  const gradientColors = colors.gradient?.primary || [
    backgroundColor,
    isDark ? "#000000" : colors.background.secondary,
  ];

  // Warna untuk bottom utilities bar
  const bottomBarColor = isDark 
    ? "rgba(255,255,255,0.05)" 
    : "rgba(0,0,0,0.03)";

  // Warna ikon default untuk light mode (gunakan textSecondary agar lebih terlihat)
  const iconColorDefault = isDark ? textTertiary : textSecondary;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <LinearGradient
        colors={gradientColors as [string, string, ...string[]]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: safePadding.paddingTop,
            paddingBottom: safePadding.paddingBottom + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
          >
            <ChevronDown size={28} color={textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitle}>
            <Text style={[styles.nowPlayingText, { color: textTertiary }]}>
              NOW PLAYING
            </Text>
            <View style={styles.audioModeBadge}>
              <Sparkles size={12} color={goldColor} />
              <Text style={[styles.audioModeText, { color: goldColor }]}>
                {audioMode?.toUpperCase() || "STANDARD"}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.headerBtn} onPress={handleOpenDetail}>
            <Info size={24} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ARTWORK SECTION */}
        <View style={styles.artworkSection}>
          <Pressable onPress={() => setShowLyrics(!showLyrics)}>
            <Animated.View
              style={[
                styles.artworkContainer,
                { transform: [{ scale: artworkScale }] },
                theme.shadows.xl,
              ]}
            >
              <Image
                source={
                  currentSong.artwork
                    ? { uri: currentSong.artwork }
                    : require("../../../assets/images/icon.png")
                }
                style={styles.artwork}
                contentFit="cover"
                transition={300}
              />
            </Animated.View>
          </Pressable>
        </View>

        {/* SONG INFO & LIKE BTN */}
        <View style={styles.songInfoContainer}>
          <View style={styles.songTextWrapper}>
            <Text
              style={[styles.songTitle, { color: textPrimary }]}
              numberOfLines={1}
            >
              {currentSong.title}
            </Text>
            <Text
              style={[styles.artistName, { color: textSecondary }]}
              numberOfLines={1}
            >
              {currentSong.artist}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLike} style={styles.likeBtn}>
            <Heart
              size={28}
              color={isLiked ? errorColor : textTertiary}
              fill={isLiked ? errorColor : "transparent"}
            />
          </TouchableOpacity>
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={position}
            onSlidingComplete={seek}
            minimumTrackTintColor={primaryColor}
            maximumTrackTintColor={borderColor}
            thumbTintColor={primaryColor}
          />
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: textTertiary }]}>
              {formatTime(position)}
            </Text>
            <Text style={[styles.timeText, { color: textTertiary }]}>
              {formatTime(duration)}
            </Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsSection}>
          <TouchableOpacity onPress={toggleShuffle} style={styles.controlBtn}>
            <Shuffle
              size={22}
              color={shuffle ? primaryColor : iconColorDefault}
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSkip(playPrevious)}
            style={styles.controlBtn}
          >
            <SkipBack size={32} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.playBtn,
              { backgroundColor: primaryColor },
            ]}
            onPress={handlePlayPause}
          >
            {isPlaying ? (
              <Pause size={32} color={isDark ? "#000" : "#FFF"} strokeWidth={2.5} />
            ) : (
              <Play
                size={32}
                color={isDark ? "#000" : "#FFF"}
                strokeWidth={2.5}
                style={{ marginLeft: 2 }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSkip(playNext)}
            style={styles.controlBtn}
          >
            <SkipForward size={32} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleRepeat} style={styles.controlBtn}>
            <Repeat
              size={22}
              color={repeat !== "off" ? primaryColor : iconColorDefault}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>

        {/* Audio Info */}
        <View style={styles.audioInfo}>
          <View style={styles.audioBadge}>
            <Mic2 size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {((currentSong.sampleRate || 0) / 1000).toFixed(0)} kHz
            </Text>
          </View>
          <View style={[styles.audioDot, { backgroundColor: borderColor }]} />
          <View style={styles.audioBadge}>
            <Volume2 size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.bitDepth || 0} bit
            </Text>
          </View>
          <View style={[styles.audioDot, { backgroundColor: borderColor }]} />
          <View style={styles.audioBadge}>
            <ListMusic size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.codec?.toUpperCase() || "MP3"}
            </Text>
          </View>
        </View>

        {/* BOTTOM UTILITY BAR */}
        <View
          style={[
            styles.bottomUtilities,
            { backgroundColor: isDark ? backgroundSecondary : bottomBarColor },
          ]}
        >
          <TouchableOpacity onPress={() => setIsTimerVisible(true)}>
            <Clock size={20} color={iconColorDefault} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowLyrics(!showLyrics)}>
            <Mic2
              size={20}
              color={showLyrics ? primaryColor : iconColorDefault}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(drawer)/analyzer")}>
            <Sparkles size={20} color={iconColorDefault} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sleep Timer Modal */}
      <SleepTimerModal
        visible={isTimerVisible}
        onClose={() => setIsTimerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    alignItems: "center",
  },
  nowPlayingText: {
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: "800",
  },
  audioModeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  audioModeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  artworkSection: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  artworkContainer: {
    width: width - 100,
    height: width - 100,
    borderRadius: 16,
    overflow: "hidden",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  songTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  artistName: {
    fontSize: 16,
    fontWeight: "500",
  },
  progressSection: {
    marginBottom: 30,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -8,
    paddingHorizontal: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  controlsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  controlBtn: {
    padding: 8,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  audioInfo: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    gap: 12,
  },
  audioBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  audioText: {
    fontSize: 12,
    fontWeight: "500",
  },
  audioDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  songInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
    width: "100%",
  },
  songTextWrapper: {
    flex: 1,
    paddingRight: 20,
  },
  likeBtn: {
    padding: 10,
  },
  bottomUtilities: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 15,
    borderRadius: 20,
  },
}); 