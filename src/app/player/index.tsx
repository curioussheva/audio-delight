import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Pressable,
  Animated, // Tambahkan Animated
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient"; // Import Gradient
import ImageColors from "react-native-image-colors"; // Import Image Colors
import * as Haptics from "expo-haptics"; // Import Haptics
import { useAudioProgress } from "@/features/player/hooks/useAudioProgress";

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
import { ChevronDown, Clock, Shuffle, SkipBack, SkipForward, Repeat, Music, Activity, Play, Pause } from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function PlayerScreen() {
   const { theme } = useTheme();
  const { colors } = theme;
  const safePadding = useSafePadding();
  const router = useRouter();

  // State
  const [showLyrics, setShowLyrics] = useState(false); // Perbaikan typo/deklarasi
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [bgColor, setBgColor] = useState<string>("#040B13");
  
  // Audio Progress
  const { position, duration } = useAudioProgress(250); 

  const {
    currentSong, isPlaying, togglePlay, seek,
    playNext, playPrevious, shuffle, repeat, 
    toggleShuffle, toggleRepeat, audioMode,
  } = usePlayerStore();

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
;

  // 1. Ambil Warna Dominan dari Album Art
  useEffect(() => {
    if (currentSong?.artwork) {
      ImageColors.getColors(currentSong.artwork, {
        fallback: "#040B13",
        cache: true,
        key: currentSong.artwork,
      }).then((result: any) => {
        if (Platform.OS === "android") {
          setBgColor(result.average || result.dominant || "#040B13");
        } else {
          setBgColor(result.background || "#040B13");
        }
      });
    }
  }, [currentSong?.artwork]);

  useEffect(() => {
    if (currentSong?.artwork) {
      ImageColors.getColors(currentSong.artwork, {
        fallback: "#040B13",
        cache: true,
        key: currentSong.artwork,
      }).then((result: any) => {
        if (Platform.OS === "android") {
          setBgColor(result.average || result.dominant || "#040B13");
        } else {
          setBgColor(result.background || "#040B13");
        }
      });
    }
  }, [currentSong?.artwork]);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isPlaying ? 1 : 0.9,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [isPlaying]);

  useEffect(() => {
    usePlayerStore.getState().setMainPlayerOpen(true);
    return () => usePlayerStore.getState().setMainPlayerOpen(false);
  }, []);
  
  // Haptic Helpers
  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    togglePlay();
  };
  
  const handleSkip = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };

  if (!currentSong) return null;

  return (
    <View style={styles.container}>
      {/* BACKGROUND AREA (DYNAMIC GRADIENT) */}
      <LinearGradient
        colors={[bgColor, "#040B13", "#040B13"]}
        locations={[0, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.spectrogramContainer}>
        <SpectogramView isPlaying={isPlaying} />
      </View>

      {/* KONTEN UTAMA */}
      <View
        style={[
          styles.content,
          {
            paddingTop: safePadding.paddingTop,
            paddingBottom: safePadding.paddingBottom + 10,
            paddingHorizontal: safePadding.paddingLeft || 25,
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
            <Text style={[styles.audioModeText, { color: audioMode === 'bitperfect' ? '#D4AF37' : colors.primary[500] }]}>
              ({audioMode?.toUpperCase() || "STANDARD"})
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtnSmall} onPress={() => setShowLyrics(!showLyrics)}>
              <Music size={22} color={showLyrics ? colors.primary[500] : "#FFF"} strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.headerBtnSmall} onPress={() => setIsTimerVisible(true)}>
              <Clock size={22} color="#FFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* MIDDLE SECTION */}
        <Pressable style={styles.middleSection} onPress={() => setShowLyrics(!showLyrics)}>
          {!showLyrics ? (
            <>
              {/* Artwork dengan Animasi Scale */}
              <Animated.View style={[styles.artworkContainer, { transform: [{ scale: scaleAnim }] }]}>
                <Image
                  source={currentSong.artwork ? { uri: currentSong.artwork } : require("../../../assets/images/icon.png")}
                  style={styles.mainArtwork}
                  contentFit="cover"
                  transition={300} // Efek transisi halus saat lagu ganti
                />
                {/* Shadow sekarang menggunakan warna dinamis dari background */}
                <View style={[styles.artworkShadow, { backgroundColor: bgColor, shadowColor: bgColor }]} />
                
                <View style={styles.analyzerWrapper}>
                  <SpectrumAnalyzer isPlaying={isPlaying} color={colors.primary[500]} />
                </View>
              </Animated.View>

              <View style={styles.infoContainer}>
                <Text style={styles.titleText} numberOfLines={1}>{currentSong.title}</Text>
                <Text style={styles.artistText} numberOfLines={1}>{currentSong.artist}</Text>
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
        maximumValue={duration}
        value={position}
        onSlidingComplete={seek}
      minimumTrackTintColor={colors.primary[500]}
      maximumTrackTintColor="rgba(255,255,255,0.2)"
      thumbTintColor="#FFF"
    />
            <View style={styles.timeRow}>
        <Text>{formatTime(position)}</Text>
        <Text>{formatTime(duration)}</Text>
          </View>
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity onPress={toggleShuffle}>
              <Shuffle size={24} color={shuffle ? colors.primary[500] : "rgba(255,255,255,0.4)"} strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleSkip(playPrevious)}>
              <SkipBack size={36} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.playBtn, { backgroundColor: colors.primary[500], shadowColor: colors.primary[500] }]} onPress={handlePlayPause}>
              {isPlaying ? (
                <Pause size={40} color="#000" strokeWidth={3} />
              ) : (
                <Play size={40} color="#000" strokeWidth={3} style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleSkip(playNext)}>
              <SkipForward size={36} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleRepeat}>
              <Repeat size={24} color={repeat !== "off" ? colors.primary[500] : "rgba(255,255,255,0.4)"} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <BlurView intensity={20} tint="dark" style={styles.engineBadge}>
            <Activity size={16} color={colors.primary[500]} strokeWidth={2.5} />
            <Text style={[styles.engineText, { color: colors.primary[400] }]}>
              {(currentSong.sampleRate || 0) / 1000} kHz • {currentSong.bitDepth || 0} bit • {currentSong.codec?.toUpperCase() || "MP3"}
            </Text>
          </BlurView>
        </View>
      </View>
      
      <SleepTimerModal visible={isTimerVisible} onClose={() => setIsTimerVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#040B13" },
  content: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
  },
  headerBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-start" },
  headerTitle: { alignItems: "center" },
  nowPlayingText: { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  audioModeText: { fontSize: 10, fontWeight: "800", marginTop: 2, letterSpacing: 1 },
  
  middleSection: { flex: 1, justifyContent: "center" },
  
  artworkContainer: {
    width: width - 70,
    height: width - 70,
    alignSelf: "center",
    justifyContent: "center",
  },
  mainArtwork: {
    flex: 1,
    borderRadius: 20, // Agak dikurangi dari 25 agar tidak terlalu bulat
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)", // Border lebih subtle
  },
  artworkShadow: {
    position: "absolute",
    bottom: -15, // Ditarik sedikit ke bawah
    left: 20,
    right: 20,
    height: 40,
    opacity: 0.4, // Opacity dinaikkan sedikit karena warnanya dinamis
    borderRadius: 20,
    shadowRadius: 30,
    shadowOpacity: 0.8,
    elevation: 20,
    zIndex: -1,
    filter: "blur(20px)", // Efek blur ekstra jika support
  },
  analyzerWrapper: { height: 40, width: "100%", marginTop: 20 },

  infoContainer: { marginTop: 30, alignItems: "center", paddingHorizontal: 20 },
  titleText: { color: "#FFF", fontSize: 26, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
  artistText: { color: "rgba(255,255,255,0.6)", fontSize: 18, marginTop: 6, textAlign: "center", fontWeight: "500" },

  bottomSection: { paddingBottom: 20 },
  progressSection: { marginTop: 20 },
  slider: { width: "100%", height: 40 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -10, paddingHorizontal: 15 },
  timeText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }, // tabular-nums mencegah teks bergeser saat detik berjalan

  controlsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 24, paddingHorizontal: 10 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    elevation: 10,
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
    borderColor: "rgba(255,255,255,0.08)",
    alignSelf: 'center', // Badge ditengah
  },
  engineText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  
  headerActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerBtnSmall: { width: 38, height: 38, justifyContent: "center", alignItems: "flex-end" },
  spectrogramContainer: { ...StyleSheet.absoluteFillObject, opacity: 0.3, zIndex: -1 },
});
 