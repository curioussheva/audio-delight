import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { formatTime } from "@/shared/utils/time";
import Slider from "@react-native-community/slider";
import { FullLyricsView } from "@/features/player/components/FullLyricsView";
import { SpectogramView } from "@/features/visualizer/components/SpectogramView";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import { SleepTimerModal } from "@/features/player/components/SleepTimerModal";
import { useTheme } from "@/context/ThemeContext";
import { useSafePadding } from '@/shared/hooks/useSafePadding';

// Lucide Icons
import {
  ChevronDown,
  Clock,
  Shuffle,
  SkipBack,
  SkipForward,
  Repeat,
  Music,
  Activity,
  Play,
  Pause,
} from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const safePadding = useSafePadding();        // ← Gunakan ini saja

  const {
    currentSong,
    isPlaying,
    togglePlay,
    position,
    duration,
    seek,
    playNext,
    playPrevious,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    audioMode,
  } = usePlayerStore();

  const progress = position || 0;

  const [showLyrics, setShowLyrics] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const router = useRouter();

  // Hide Floating Player saat berada di Main Player
  useEffect(() => {
    usePlayerStore.getState().setMainPlayerOpen(true);
    
    return () => {
      usePlayerStore.getState().setMainPlayerOpen(false);
    };
  }, []);

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      {/* BACKGROUND AREA */}
      <View style={styles.spectrogramContainer}>
        <SpectogramView isPlaying={isPlaying} />
      </View>

      <Image
        source={
          currentSong.artwork
            ? { uri: currentSong.artwork }
            : require("../../../assets/images/icon.png")
        }
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={50}
      />
      <View style={[styles.overlay, { backgroundColor: "rgba(4, 11, 19, 0.75)" }]} />

      {/* KONTEN UTAMA dengan Safe Padding */}
      <View
        style={[
          styles.content,
          {
            paddingTop: safePadding.paddingTop,
            paddingBottom: safePadding.paddingBottom + 10,
            paddingLeft: safePadding.paddingLeft,
            paddingRight: safePadding.paddingRight,
          },
        ]}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ChevronDown size={28} color="#FFF" strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.headerTitle}>
            <Text style={styles.nowPlayingText}>NOW PLAYING</Text>
            <Text style={styles.audioModeText}>
              ({audioMode?.toUpperCase() || "STANDARD"})
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtnSmall}
              onPress={() => setShowLyrics(!showLyrics)}
            >
              <Music size={22} color={showLyrics ? "#00D4AA" : "#FFF"} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtnSmall}
              onPress={() => setIsTimerVisible(true)}
            >
              <Clock size={22} color="#FFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* MIDDLE SECTION */}
        <Pressable
          style={styles.middleSection}
          onPress={() => setShowLyrics(!showLyrics)}
        >
          {!showLyrics ? (
            <>
              <View style={styles.artworkContainer}>
                <Image
                  source={
                    currentSong.artwork
                      ? { uri: currentSong.artwork }
                      : require("../../../assets/images/icon.png")
                  }
                  style={styles.mainArtwork}
                  contentFit="cover"
                />
                <View style={styles.artworkShadow} />
                <View style={styles.analyzerWrapper}>
                  <SpectrumAnalyzer isPlaying={isPlaying} color="#00D4AA" />
                </View>
              </View>

              <View style={styles.infoContainer}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {currentSong.title}
                </Text>
                <Text style={styles.artistText} numberOfLines={1}>
                  {currentSong.artist}
                </Text>
              </View>
            </>
          ) : (
            <FullLyricsView />
          )}
        </Pressable>

        {/* BOTTOM SECTION */}
        <View style={styles.bottomSection}>
          <View style={styles.progressSection}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration || 1}
              value={progress}
              onSlidingComplete={seek}
              minimumTrackTintColor="#00D4AA"
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#FFF"
            />
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(progress)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity onPress={toggleShuffle}>
              <Shuffle size={24} color={shuffle ? "#00D4AA" : "rgba(255,255,255,0.6)"} strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity onPress={playPrevious}>
              <SkipBack size={36} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
              {isPlaying ? (
                <Pause size={42} color="#000" strokeWidth={3} />
              ) : (
                <Play size={42} color="#000" strokeWidth={3} style={{ marginLeft: 3 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={playNext}>
              <SkipForward size={36} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleRepeat}>
              <Repeat
                size={24}
                color={repeat !== "off" ? "#00D4AA" : "rgba(255,255,255,0.6)"}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </View>

          <BlurView intensity={20} tint="dark" style={styles.engineBadge}>
            <Activity size={16} color={colors.primary[500]} strokeWidth={2.5} />
            <Text style={[styles.engineText, { color: colors.primary[400] }]}>
              {(currentSong.sampleRate || 0) / 1000} kHz •{" "}
              {currentSong.bitDepth || 0} bit •{" "}
              {currentSong.codec?.toUpperCase() || "MP3"}
            </Text>
          </BlurView>

          <SleepTimerModal
            visible={isTimerVisible}
            onClose={() => setIsTimerVisible(false)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#040B13" },
  overlay: { ...StyleSheet.absoluteFillObject },
  content: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
    paddingHorizontal: 25,
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { alignItems: "center" },
  nowPlayingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
  },
  audioModeText: {
    color: "#D4AF37",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  middleSection: { flex: 1, justifyContent: "center" },

  artworkContainer: {
    width: width - 60,
    height: width - 60,
    alignSelf: "center",
    justifyContent: "center",
  },
  mainArtwork: {
    flex: 1,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  artworkShadow: {
    position: "absolute",
    bottom: -10,
    left: 10,
    right: 10,
    height: 30,
    backgroundColor: "#00D4AA",
    opacity: 0.15,
    borderRadius: 25,
    shadowColor: "#00D4AA",
    shadowRadius: 30,
    shadowOpacity: 0.6,
    elevation: 15,
    zIndex: -1,
  },

  infoContainer: {
    marginTop: 24,
    alignItems: "center",
    paddingHorizontal: 30,
  },

  titleText: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  artistText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    marginTop: 5,
    textAlign: "center",
  },

  bottomSection: { paddingHorizontal: 25, paddingBottom: 20 },
  progressSection: { marginTop: 20 },
  slider: { width: "100%", height: 40 },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -5,
  },
  timeText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 20,
  },
  playBtn: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: "#00D4AA",
    justifyContent: "center",
    alignItems: "center",
    elevation: 10,
    shadowColor: "#00D4AA",
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },

  engineBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  engineText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerBtnSmall: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  spectrogramContainer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
    zIndex: -1,
  },
  analyzerWrapper: {
    height: 40,
    width: "100%",
    marginTop: 20,
  },
}); 