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
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useAudioProgress } from "@/features/player/hooks/useAudioProgress";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { formatTime } from "@/shared/utils/time";
import Slider from "@react-native-community/slider";
import { FullLyricsView } from "@/features/player/components/FullLyricsView";
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
  Music,
  Play,
  Pause,
  Heart,
  ListMusic,
  Mic2,
  Volume2,
  Sparkles,
  Info, // Tambahkan icon Info
} from "lucide-react-native";

const { width, height } = Dimensions.get("window");

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
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
      // Arahkan ke song-detail dengan ID lagu yang sedang diputar
      router.push({
        pathname: "/(drawer)/song/[id]",
        params: { id: currentSong.id },
      });
    }
  };

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={["#1a1a1a", "#0a0a0a", "#000000"]}
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
        {/* REVISED HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
          >
            <ChevronDown size={28} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.headerTitle}>
            <Text style={styles.nowPlayingText}>NOW PLAYING</Text>
            <View style={styles.audioModeBadge}>
              <Sparkles size={12} color="#D4AF37" />
              <Text style={styles.audioModeText}>
                {audioMode?.toUpperCase() || "STANDARD"}
              </Text>
            </View>
          </View>

          {/* Tombol Info Baru untuk akses Song Detail */}
          <TouchableOpacity style={styles.headerBtn} onPress={handleOpenDetail}>
            <Info size={24} color="#FFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ARTWORK SECTION */}
        <View style={styles.artworkSection}>
          <Pressable onPress={() => setShowLyrics(!showLyrics)}>
            <Animated.View
              style={[
                styles.artworkContainer,
                { transform: [{ scale: artworkScale }] },
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
            <Text style={styles.songTitle} numberOfLines={1}>
              {currentSong.title}
            </Text>
            <Text style={styles.artistName} numberOfLines={1}>
              {currentSong.artist}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLike} style={styles.likeBtn}>
            <Heart
              size={28}
              color={isLiked ? colors.status.error : "rgba(255,255,255,0.3)"}
              fill={isLiked ? colors.status.error : "transparent"}
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
            minimumTrackTintColor="#FFF"
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor="#FFF"
            //    thumbStyle={styles.thumb}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controlsSection}>
          <TouchableOpacity onPress={toggleShuffle} style={styles.controlBtn}>
            <Shuffle
              size={22}
              color={shuffle ? "#FFF" : "rgba(255,255,255,0.4)"}
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSkip(playPrevious)}
            style={styles.controlBtn}
          >
            <SkipBack size={32} color="#FFF" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause}>
            {isPlaying ? (
              <Pause size={32} color="#000" strokeWidth={2.5} />
            ) : (
              <Play
                size={32}
                color="#000"
                strokeWidth={2.5}
                style={{ marginLeft: 2 }}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSkip(playNext)}
            style={styles.controlBtn}
          >
            <SkipForward size={32} color="#FFF" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleRepeat} style={styles.controlBtn}>
            <Repeat
              size={22}
              color={repeat !== "off" ? "#FFF" : "rgba(255,255,255,0.4)"}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>

        {/* Audio Info */}
        <View style={styles.audioInfo}>
          <View style={styles.audioBadge}>
            <Mic2 size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
            <Text style={styles.audioText}>
              {((currentSong.sampleRate || 0) / 1000).toFixed(0)} kHz
            </Text>
          </View>
          <View style={styles.audioDot} />
          <View style={styles.audioBadge}>
            <Volume2 size={14} color="rgba(255,255,255,0.6)" strokeWidth={2} />
            <Text style={styles.audioText}>
              {currentSong.bitDepth || 0} bit
            </Text>
          </View>
          <View style={styles.audioDot} />
          <View style={styles.audioBadge}>
            <ListMusic
              size={14}
              color="rgba(255,255,255,0.6)"
              strokeWidth={2}
            />
            <Text style={styles.audioText}>
              {currentSong.codec?.toUpperCase() || "MP3"}
            </Text>
          </View>
        </View>

        {/* BOTTOM UTILITY BAR */}
        <View style={styles.bottomUtilities}>
          <TouchableOpacity onPress={() => setIsTimerVisible(true)}>
            <Clock size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowLyrics(!showLyrics)}>
            <Mic2
              size={20}
              color={showLyrics ? colors.primary[500] : "rgba(255,255,255,0.6)"}
            />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(drawer)/analyzer")}>
            <Sparkles size={20} color="rgba(255,255,255,0.6)" />
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
    backgroundColor: "#000",
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
  headerTitle: { alignItems: "center" },
  nowPlayingText: {
    color: "rgba(255,255,255,0.4)",
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
    color: "#D4AF37",
  },
  artworkSection: {
    alignItems: "center",
    marginTop: 20, // Memberi jarak dari header
    marginBottom: 30,
  },
  artworkContainer: {
    width: width - 100,
    height: width - 100,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  songInfo: {
    alignItems: "center",
    marginBottom: 30,
  },
  songTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  artistName: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  progressSection: {
    marginBottom: 30,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFF",
    shadowColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -8,
    paddingHorizontal: 8,
  },
  timeText: {
    color: "rgba(255,255,255,0.5)",
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
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
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
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "500",
  },
  audioDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginBottom: 20,
  },
  actionBtn: {
    padding: 8,
  },
  headerBtnSmall: { padding: 8, borderRadius: 20 },
  iconBlur: { width: 40, height: 40, borderRadius: 8 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySubtitle: { fontSize: 14, opacity: 0.7 },
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
  },
});
