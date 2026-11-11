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
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { formatTime } from "@/shared/utils/time";
import Slider from "@react-native-community/slider";
import { SleepTimerModal } from "@/features/player/components/SleepTimerModal";
import { FullLyricsView } from "@/features/player/components/FullLyricsView";
import { useTheme } from "@/context/ThemeContext";
import { useSafePadding } from "@/shared/hooks/useSafePadding";

// ✅ Import SpectogramView (bukan SpectrumAnalyzer)
import { SpectogramView } from "@/features/visualizer/components/SpectogramView";
import { accentOn, pickReadable, AA_NORMAL } from "@/shared/utils/contrast";

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
  TriangleAlert,
  Music,
  X,
} from "lucide-react-native";

const { width } = Dimensions.get("window");

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const safePadding = useSafePadding();
  const router = useRouter();

  const [showLyrics, setShowLyrics] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);

  const { position, duration } = useAudioProgress(250);

  const {
    currentSong,
    isPlaying,
    playError,
    clearPlayError,
    playSong,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    audioMode,
    audioSessionId, // ✅ Diperlukan untuk SpectogramView
  } = usePlayerStore();

  // U-P1-19: hati memakai state favorit asli (libraryStore, dicerminkan
  // dari kolom songs.isFavorite) — hook HARUS di atas return kondisional,
  // jangan dipindah ke bawah (U-P0-4: Rules of Hooks).
  const { isFavorite, toggleFavorite } = useFavorites();

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
    if (!currentSong) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // U-P1-19: tulis ke sumber kebenaran yang sama (kolom songs.isFavorite
    // via libraryStore) — bukan state lokal. Dulu hati lagu A tetap menyala
    // di lagu B dan hilang saat player ditutup.
    toggleFavorite(currentSong.id);
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

  // 🔥 Badge mode audio yang jujur. audioMode = pilihan user; AAudio bisa
  // menolak exclusive → fallback shared. Tanpa ini badge "BIT-PERFECT"
  // bohong kalau device menolak.
  //
  // Hook ini HARUS di atas `if (!currentSong) return null` (2026-11-11,
  // perbaikan U-P0-4): hook setelah return kondisional melanggar Rules
  // of Hooks — jumlah hook berubah saat currentSong null ↔ ada, React
  // melempar "Rendered more hooks than during the previous render" dan
  // layar crash. Dulu pemanggilannya ada di bawah return (baris ~156).
  const bpStatus = useBitPerfectStatus();

  // Warna tombol Play dihitung di sini (sebelum early return U-P1-20)
  // karena empty/error state juga memakai tombol primary.
  const primaryColor = colors.primary[500];
  // Ikon/teks di atas tombol primary — warnanya harus dibaca dari
  // LUMINANSI primary, bukan dari gelap/terang tema. Dulu isDark ? "#000"
  // : "#FFF": di 8/20 tema ikon tidak terbaca (tema gelap + primary gelap
  // → hitam di atas gelap).
  const playIconColor =
    pickReadable(["#FFFFFF", "#000000"], primaryColor, AA_NORMAL) ??
    "#FFFFFF";

  // U-P1-20: jangan `return null` — layar hitam tanpa penjelasan saat
  // player dibuka tanpa lagu (deep link / antrean habis). Cabang ini tetap
  // SETELAH semua hook di atas (U-P0-4), hanya mengganti layar kosong
  // dengan empty/error state yang jujur: playError store akhirnya dibaca.
  if (!currentSong) {
    const isError = !!playError;
    return (
      <View
        style={[
          styles.container,
          styles.emptyContainer,
          {
            backgroundColor: colors.background.primary,
            paddingTop: safePadding.paddingTop,
            paddingBottom: safePadding.paddingBottom,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.back()}
            accessibilityLabel="Tutup player"
          >
            <ChevronDown size={28} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContent}>
          {isError ? (
            <TriangleAlert size={48} color={colors.status.error} />
          ) : (
            <Music size={48} color={colors.text.tertiary} />
          )}
          <Text
            style={[styles.emptyTitle, { color: colors.text.primary }]}
          >
            {isError
              ? "Lagu gagal diputar"
              : "Tidak ada lagu yang diputar"}
          </Text>
          <Text
            style={[styles.emptySubtitle, { color: colors.text.secondary }]}
          >
            {isError
              ? playError
              : "Buka library dan pilih lagu untuk mulai memutar."}
          </Text>
          <TouchableOpacity
            style={[
              styles.emptyPrimaryBtn,
              { backgroundColor: colors.primary[500] },
            ]}
            onPress={() => router.push("/(drawer)/(tabs)/library")}
          >
            <Text
              style={[
                styles.emptyPrimaryBtnText,
                { color: playIconColor },
              ]}
            >
              Buka Library
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptySecondaryBtn}
            onPress={() => router.back()}
          >
            <Text
              style={[
                styles.emptySecondaryBtnText,
                { color: colors.text.secondary },
              ]}
            >
              Tutup
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // U-P1-19: hati menyala hanya bila lagu yang SEDANG diputar ini favorit —
  // dihitung tiap render dari store, jadi ikut ganti lagu dengan benar
  // (dulu state lokal false yang tidak pernah reset saat ganti lagu).
  const isLiked = isFavorite(currentSong.id);

  // Helper warna dinamis
  const goldColor = accentOn([colors.accent.primary], colors.background.primary, [colors.text.primary]);
  const textPrimary = colors.text.primary;
  const textSecondary = colors.text.secondary;
  const textTertiary = colors.text.tertiary;
  const backgroundColor = colors.background.primary;
  const backgroundSecondary = colors.background.secondary;
  const borderColor = colors.border?.light || colors.background.tertiary;
  const errorColor = colors.status.error;

  const gradientColors = colors.gradient?.primary || [
    backgroundColor,
    isDark ? "#000000" : colors.background.secondary,
  ];

  const bottomBarColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)";

  const iconColorDefault = isDark ? textTertiary : textSecondary;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <LinearGradient
        colors={gradientColors as [string, string, ...string[]]}
        locations={gradientColors.length === 3 ? [0, 0.5, 1] : [0, 1]}
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
              {/* Verdict live (FALLBACK / laju) hanya saat status tidak
                  basi: saat pause polling berhenti, jadi badge hanya
                  menampilkan label mode (U-P1-04). */}
              {audioMode === "bit-perfect" &&
              !bpStatus.stale &&
              bpStatus.exclusiveFailed ? (
                // Bit-perfect diminta tapi AAudio menolak — jangan pamer
                // label "BIT-PERFECT" yang tidak benar.
                <TriangleAlert size={12} color={errorColor} />
              ) : (
                <Sparkles size={12} color={goldColor} />
              )}
              <Text
                style={[
                  styles.audioModeText,
                  {
                    color:
                      audioMode === "bit-perfect" &&
                      !bpStatus.stale &&
                      bpStatus.exclusiveFailed
                        ? errorColor
                        : goldColor,
                  },
                ]}
              >
                {audioMode === "bit-perfect"
                  ? !bpStatus.stale && bpStatus.exclusiveFailed
                    ? "FALLBACK"
                    : !bpStatus.stale && bpStatus.actualSampleRate > 0
                      ? `BIT-PERFECT ${bpStatus.actualSampleRate / 1000}K`
                      : "BIT-PERFECT"
                  : audioMode === "immersive"
                    ? "SOLFEGGIO"
                    : audioMode === "dsp"
                      ? "DSP"
                      : "STANDARD"}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.headerBtn} onPress={handleOpenDetail}>
            <Info size={24} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* U-P1-20: playError akhirnya dibaca. Store mengisi playError
            BERSAMA currentSong saat native play() gagal — tanpa banner ini
            kegagalan itu tetap tak terlihat meski lagunya tampil. */}
        {playError ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.background.secondary },
            ]}
          >
            <TriangleAlert size={18} color={errorColor} />
            <Text
              style={[styles.errorBannerText, { color: colors.text.primary }]}
              numberOfLines={2}
            >
              {playError}
            </Text>
            <TouchableOpacity
              onPress={() => void playSong(currentSong)}
              hitSlop={8}
            >
              <Text
                style={[styles.errorBannerRetry, { color: primaryColor }]}
              >
                Coba lagi
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearPlayError} hitSlop={8}>
              <X size={18} color={textTertiary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ARTWORK SECTION — ketuk artwork / tombol lirik untuk beralih
            ke tampilan lirik (FullLyricsView). Sebelumnya showLyrics hanya
            mengubah warna ikon Mic — lirik tidak pernah dirender. */}
        {showLyrics ? (
          <View style={[styles.artworkSection, styles.lyricsSection]}>
            <FullLyricsView />
          </View>
        ) : (
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
        )}

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

        {/* ✅ SPECTOGRAM VIEW */}
        <SpectogramView
          width={width - 48}
          height={120}
          isPlaying={isPlaying}
          audioSessionId={audioSessionId}
          bins={64}
          maxRows={30}
          colorScheme="classic"
          sensitivity={2.0}
          showLabels={false} // bisa dimatikan untuk tampilan minimal
        />

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
            style={[styles.playBtn, { backgroundColor: primaryColor }]}
            onPress={handlePlayPause}
          >
            {isPlaying ? (
              <Pause
                size={32}
                color={playIconColor}
                strokeWidth={2.5}
              />
            ) : (
              <Play
                size={32}
                color={playIconColor}
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

        {/* Audio Info — tanpa metadata jangan klaim angka mustahil
            (U-P1-06): dulu tampil "0 kHz", "0 bit", dan codec kosong
            diklaim "MP3". */}
        <View style={styles.audioInfo}>
          <View style={styles.audioBadge}>
            <Mic2 size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.sampleRate
                ? `${(currentSong.sampleRate / 1000).toFixed(0)} kHz`
                : "-"}
            </Text>
          </View>
          <View style={[styles.audioDot, { backgroundColor: borderColor }]} />
          <View style={styles.audioBadge}>
            <Volume2 size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.bitDepth ? `${currentSong.bitDepth} bit` : "-"}
            </Text>
          </View>
          <View style={[styles.audioDot, { backgroundColor: borderColor }]} />
          <View style={styles.audioBadge}>
            <ListMusic size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.codec?.toUpperCase() || "-"}
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
          <TouchableOpacity
            onPress={() => setIsTimerVisible(true)}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Sleep timer"
          >
            <Clock size={20} color={iconColorDefault} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowLyrics(!showLyrics)}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Lirik"
          >
            <Mic2
              size={20}
              color={showLyrics ? primaryColor : iconColorDefault}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(drawer)/analyzer")}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Buka analyzer"
          >
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
  // Tampilan lirik menempati kotak yang sama dengan artwork supaya layout
  // tidak lompat saat beralih (FullLyricsView flex:1 mengisi kotak ini).
  lyricsSection: {
    width: width - 100,
    height: width - 100,
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
  // ✅ Style untuk spectogram
  spectogramWrapper: {
    alignItems: "center",
    marginBottom: 24,
    borderRadius: 12,
    overflow: "hidden",
  },
  progressSection: {
    marginBottom: 20,
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
    marginBottom: 20,
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
  // Target sentuh >= 44dp (U-P1-38): ikon 20px + padding 12 di tiap sisi.
  utilityBtn: {
    padding: 12,
  },
  // U-P1-20: empty/error state — bukan layar hitam.
  emptyContainer: {
    paddingHorizontal: 24,
  },
  emptyContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  emptyPrimaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
  },
  emptyPrimaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  emptySecondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // U-P1-20: banner saat lagu tampil tapi pemutaran gagal.
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  errorBannerRetry: {
    fontSize: 13,
    fontWeight: "700",
  },
});
