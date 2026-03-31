import React, { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { formatTime } from "@/shared/utils/time";
import Slider from "@react-native-community/slider";
import { FullLyricsView } from "@/features/player/components/FullLyricsView";
import { SpectogramView } from "@/features/visualizer/components/SpectogramView";
import { SpectrumAnalyzer } from "@/features/visualizer/components/SpectrumAnalyzer";
import { SleepTimerModal } from "@/features/player/components/SleepTimerModal";
import { useTheme } from "@/context/ThemeContext";

// ← Tambahkan ini
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  // ← Tambahkan hook ini
  const insets = useSafeAreaInsets();

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

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      {/* BACKGROUND AREA - Visualizer & Blur */}
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
      <View
        style={[styles.overlay, { backgroundColor: "rgba(4, 11, 19, 0.75)" }]}
      />

      {/* KONTEN UTAMA dengan Safe Area Insets */}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom + 10, // tambahan sedikit biar tidak terlalu rapat dengan home indicator
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-down" size={28} color="#FFF" />
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
              <Ionicons
                name="musical-notes"
                size={22}
                color={showLyrics ? "#00D4AA" : "#FFF"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtnSmall}
              onPress={() => setIsTimerVisible(true)}
            >
              <Ionicons name="time-outline" size={22} color="#FFF" />
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
              <Ionicons
                name="shuffle-outline"
                size={24}
                color={shuffle ? "#00D4AA" : "rgba(255,255,255,0.6)"}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={playPrevious}>
              <Ionicons name="play-skip-back" size={36} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={42}
                color="#000"
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={playNext}>
              <Ionicons name="play-skip-forward" size={36} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleRepeat}>
              <Ionicons
                name={repeat === "track" ? "repeat" : "repeat-outline"}
                size={24}
                color={repeat !== "off" ? "#00D4AA" : "rgba(255,255,255,0.6)"}
              />
            </TouchableOpacity>
          </View>

          <BlurView intensity={20} tint="dark" style={styles.engineBadge}>
            <Ionicons name="pulse" size={16} color={colors.primary[500]} />
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
  container: { 
    flex: 1, 
    backgroundColor: "#040B13" 
  },
  overlay: { 
    ...StyleSheet.absoluteFillObject 
  },
  content: { 
    flex: 1 
  },
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
  position: 'absolute',
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