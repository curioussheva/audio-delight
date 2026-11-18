import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
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
import { QueueManager } from "@/features/player/components/QueueManager";
import { FullLyricsView } from "@/features/player/components/FullLyricsView";
import { useTheme } from "@/shared/context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSafePadding } from "@/shared/hooks/useSafePadding";

// ✅ Parametric bar visualizer (biru→merah mengikuti dB) — ganti
// SpectogramView (waterfall) di main player sejak 2026-11-17.
// BUKAN SpectrumAnalyzer (dead code, jangan dipakai).
import { ParametricSpectrumView } from "@/features/visualizer/components/ParametricSpectrumView";
import { accentOn, pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import { safeGoBack } from "@/shared/utils/navigation";
import {
  sleepRemainingMinutes,
  formatSpeedChip,
  formatTuningChip,
} from "@/features/player/utils/playbackStatus";
import {
  artworkSize,
  visualizerWidth,
} from "@/features/player/utils/playerLayout";

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
  AudioLines,
  AudioWaveform,
  FileMusic,
  Sparkles,
  Info,
  TriangleAlert,
  Music,
  X,
} from "lucide-react-native";

export default function PlayerScreen() {
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const safePadding = useSafePadding();
  // Follow-up P2-7: padding bawah lokal TANPA reservasi +110
  // FloatingPlayer. useSafePadding() memberi insets.bottom + 110 saat ada
  // lagu (ruang untuk FloatingPlayer) — tapi layar ini TIDAK merender
  // FloatingPlayer (hanya layout tab yang merendernya,
  // (tabs)/_layout.tsx:102), jadi +110 itu dead space di bawah bar
  // utilitas + mencuri 110dp dari viewport tengah. Hook bersama TIDAK
  // diubah (tidak ada pemakai lain saat ini, tapi cadangannya tetap benar
  // untuk layar tab). Dipakai fixedBottom + wadah modal antrean; empty
  // state dan fixedTop tetap pakai safePadding (tanpa +110 saat tak ada
  // lagu / hanya paddingTop).
  const insets = useSafeAreaInsets();
  const playerBottomPadding = insets.bottom + 20;
  // P2-7: dimensi REAKTIF terhadap rotasi (dulu `Dimensions.get("window")`
  // di level modul — dibekukan saat import). Hook HARUS di atas return
  // kondisional, jangan dipindah ke bawah (U-P0-4: Rules of Hooks).
  const { width: windowWidth, height: windowHeight } =
    useWindowDimensions();
  const artSize = artworkSize(windowWidth, windowHeight);
  const router = useRouter();

  const [showLyrics, setShowLyrics] = useState(false);
  const [isTimerVisible, setIsTimerVisible] = useState(false);
  const [isQueueVisible, setIsQueueVisible] = useState(false);

  // U-P2-11: posisi lokal selama jari menggeser slider. Nilai slider
  // terikat ke store yang di-overwrite tiap 500ms oleh watcher posisi
  // native — tanpa state lokal, nilai bisa ditarik balik sebelum dilepas.
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  const { position, duration } = useAudioProgress();

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
    sleepTimerEnd,
    playbackSpeed,
    tuningCents,
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

  // U-P2-11: lagu berganti di tengah drag — batalkan drag supaya seek
  // saat jari dilepas tidak jatuh ke lagu yang baru.
  useEffect(() => {
    setDragPosition(null);
  }, [currentSong?.id]);

  // A4: jam untuk indikator sleep timer — detak tiap detik hanya saat
  // timer aktif, supaya sisa menit tidak basi (pola SleepTimerModal).
  const [sleepNow, setSleepNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepTimerEnd === null) return;
    const id = setInterval(() => setSleepNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepTimerEnd]);

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
            onPress={() => safeGoBack(router)}
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
            onPress={() => safeGoBack(router)}
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

  // U-P2-13: dulu fallback gradien memakai "#000000" hardcoded saat tema
  // tidak mendefinisikan gradient. Sekarang kedua stop dari token tema.
  const gradientColors = colors.gradient?.primary || [
    backgroundColor,
    colors.background.secondary,
  ];

  const iconColorDefault = isDark ? textTertiary : textSecondary;

  // A4: indikator sleep timer — null bila timer mati, 0 saat baru habis.
  const sleepRemainingMin = sleepRemainingMinutes(sleepTimerEnd, sleepNow);
  const sleepActive = sleepRemainingMin !== null && sleepRemainingMin > 0;

  // P2: chip status speed/tuning — hanya tampil bila bukan default
  // (tampilan saja, tidak mengubah perilaku).
  const speedChip = formatSpeedChip(playbackSpeed);
  const tuningChip = formatTuningChip(tuningCents);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <LinearGradient
        colors={gradientColors as [string, string, ...string[]]}
        locations={gradientColors.length === 3 ? [0, 0.5, 1] : [0, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* P2-7: header + banner error FIXED di atas (bukan bagian
          ScrollView) supaya tombol tutup + pesan error tidak pernah
          tergeser keluar layar di layar kecil. Posisi/jarak sama seperti
          sebelumnya: paddingTop safe-area + margin header seperti saat
          masih di dalam ScrollView. */}
      <View
        style={[styles.fixedTop, { paddingTop: safePadding.paddingTop }]}
      >
        {/* HEADER — A3: panel solid (background.primary) di belakang
            ikon/teks. Warna token dirancang untuk latar solid ini, bukan
            untuk gradien — terukur lolos WCAG di Noir/Ember/Porcelain
            (lihat player-fix-report.md). Pola yang sama dengan panel
            solid FullLyricsView. */}
        <View
          style={[
            styles.header,
            styles.panel,
            { backgroundColor: colors.background.primary },
          ]}
        >
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => safeGoBack(router)}
            accessibilityRole="button"
            accessibilityLabel="Tutup player"
          >
            <ChevronDown size={28} color={textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitle}>
            <Text style={[styles.nowPlayingText, { color: textTertiary }]}>
              SEDANG DIPUTAR
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

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleOpenDetail}
            accessibilityRole="button"
            accessibilityLabel="Lihat detail lagu"
          >
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
            <TouchableOpacity
              onPress={clearPlayError}
              hitSlop={13}
              accessibilityRole="button"
              accessibilityLabel="Tutup pesan error"
            >
              <X size={18} color={textTertiary} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* P2-7: hanya konten TENGAH yang boleh di-scroll (sampul/lirik,
          info lagu, visualizer). Kontrol + bar utilitas ada di fixed
          bottom di bawah ScrollView supaya tidak pernah tergeser keluar. */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* LAYOUT-V2 (1): info lagu PINDAH ke atas artwork supaya judul
            selalu terlihat tanpa scroll. Dulu di bawah artwork (di tepi
            bawah viewport tengah). Panel solid + Like ikut pindah. */}
        <View
          style={[
            styles.songInfoContainer,
            styles.panel,
            { backgroundColor: colors.background.primary },
          ]}
        >
          <View style={styles.songTextWrapper}>
            <Text
              style={[styles.songTitle, { color: textPrimary }]}
              numberOfLines={2}
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
          <TouchableOpacity
            onPress={handleLike}
            style={styles.likeBtn}
            accessibilityRole="button"
            accessibilityLabel="Suka"
            accessibilityState={{ selected: isLiked }}
          >
            <Heart
              size={28}
              color={isLiked ? errorColor : textTertiary}
              fill={isLiked ? errorColor : "transparent"}
            />
          </TouchableOpacity>
        </View>

        {/* ARTWORK SECTION — ketuk artwork / tombol lirik untuk beralih
            ke tampilan lirik (FullLyricsView). Sebelumnya showLyrics hanya
            mengubah warna ikon Mic — lirik tidak pernah dirender. */}
        {showLyrics ? (
          // Kotak lirik sama besar dengan artwork (artSize) supaya layout
          // tidak lompat saat beralih (FullLyricsView flex:1 mengisinya).
          <View
            style={[
              styles.artworkSection,
              { width: artSize, height: artSize },
            ]}
          >
            <FullLyricsView />
          </View>
        ) : (
          <View style={styles.artworkSection}>
            <Pressable
              onPress={() => setShowLyrics(!showLyrics)}
              accessibilityRole="button"
              accessibilityLabel="Tampilkan lirik"
              accessibilityHint="Ketuk untuk melihat lirik lagu"
            >
              <Animated.View
                style={[
                  styles.artworkContainer,
                  { width: artSize, height: artSize },
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
                {/* P2: petunjuk visual bahwa sampul bisa diketuk untuk
                    lirik — pil solid supaya kontras terjamin di atas foto. */}
                <View
                  style={[
                    styles.artworkLyricsHint,
                    { backgroundColor: colors.background.primary },
                  ]}
                >
                  <Mic2 size={12} color={textPrimary} />
                  <Text
                    style={[
                      styles.artworkLyricsHintText,
                      { color: textPrimary },
                    ]}
                  >
                    Lirik
                  </Text>
                </View>
              </Animated.View>
            </Pressable>
          </View>
        )}

        {/* ✅ PARAMETRIC SPECTRUM VIEW (bar biru→merah mengikuti dB) —
            ganti SpectogramView (waterfall) sejak 2026-11-17.
            Single-channel (mono FFT); dual-channel L/R butuh FFT native
            per channel (follow-up). P2: panel solid + skala dBFS di kiri
            (0 atas, −80 bawah) + label aksesibilitas — kanvas Skia
            sendiri dekoratif. */}
        <View
          style={[
            styles.visualizerPanel,
            { backgroundColor: colors.background.primary },
          ]}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Visualizer spektrum, skala dBFS"
        >
          <View style={styles.visualizerScale}>
            <Text
              style={[styles.visualizerScaleText, { color: textTertiary }]}
            >
              0
            </Text>
            <Text
              style={[styles.visualizerScaleText, { color: textTertiary }]}
            >
              dBFS
            </Text>
            <Text
              style={[styles.visualizerScaleText, { color: textTertiary }]}
            >
              −80
            </Text>
          </View>
          <ParametricSpectrumView
            width={visualizerWidth(windowWidth)}
            height={120}
            isPlaying={isPlaying}
            audioSessionId={audioSessionId}
            barCount={48}
            sensitivity={2.0}
          />
        </View>

      </ScrollView>

      {/* P2-7: kontrol utama + bar utilitas FIXED di bawah (bukan bagian
          ScrollView) — progress, kontrol, info audio, chip, bar utilitas.
          Urutan/jarak sama seperti sebelumnya. paddingBottom =
          playerBottomPadding (safe-area + 20) — TANPA reservasi +110
          FloatingPlayer dari useSafePadding: layar Player tidak merender
          FloatingPlayer, jadi +110 itu dead space + mencuri 110dp dari
          viewport tengah (follow-up P2-7). */}
      <View
        style={[
          styles.fixedBottom,
          { paddingBottom: playerBottomPadding },
        ]}
      >
        {/* Controls + Progress (LAYOUT-V2 (3): panel progres terpisah
            DIHAPUS — slider + waktu pindah ke DALAM panel kontrol, di
            bawah tombol-tombol. Satu panel, menghemat ~44dp vertikal.
            Perilaku seek tidak berubah (lihat U-P2-11 di bawah).
            A3: panel solid (lihat HEADER). */}
        <View
          style={[
            styles.controlsSection,
            styles.panel,
            { backgroundColor: colors.background.primary },
          ]}
        >
          {/* LAYOUT-V2 (3): baris tombol — slider ada di bawah baris ini,
              di dalam panel yang sama. */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={toggleShuffle}
            style={styles.controlBtn}
            accessibilityRole="button"
            accessibilityLabel="Acak"
            accessibilityState={{ selected: shuffle }}
          >
            <Shuffle
              size={22}
              color={shuffle ? primaryColor : iconColorDefault}
              strokeWidth={2}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSkip(playPrevious)}
            style={styles.controlBtn}
            accessibilityRole="button"
            accessibilityLabel="Lagu sebelumnya"
          >
            <SkipBack size={32} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: primaryColor }]}
            onPress={handlePlayPause}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Jeda" : "Putar"}
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
            accessibilityRole="button"
            accessibilityLabel="Lagu berikutnya"
          >
            <SkipForward size={32} color={textPrimary} strokeWidth={2} />
          </TouchableOpacity>

          {/* U-P2-10: Repeat One harus bisa dibedakan dari Repeat All —
              dulu hanya warna ikon berubah. Dot di bawah ikon, pola yang
              sama dengan FloatingPlayer (repeatOneDot) dan Controls (mati).
              Label aksesibilitas ikut membedakan modenya. */}
          <TouchableOpacity
            onPress={toggleRepeat}
            style={[styles.controlBtn, styles.repeatBtn]}
            accessibilityRole="button"
            accessibilityLabel={
              repeat === "track"
                ? "Ulangi satu lagu"
                : repeat === "all"
                  ? "Ulangi semua lagu"
                  : "Ulangi mati"
            }
            accessibilityState={{
              selected: repeat !== "off",
            }}
          >
            <Repeat
              size={22}
              color={repeat !== "off" ? primaryColor : iconColorDefault}
              strokeWidth={2}
            />
            {repeat === "track" && (
              <View
                style={[
                  styles.repeatOneDot,
                  { backgroundColor: primaryColor },
                ]}
              />
            )}
          </TouchableOpacity>
          </View>

          {/* LAYOUT-V2 (3): slider + waktu — pindah dari panel progres
              terpisah ke dalam panel kontrol. U-P2-11: selama drag, slider
              menampilkan nilai lokal (onValueChange) dan baru commit seek
              saat dilepas (onSlidingComplete); watcher posisi native tidak
              boleh menarik balik nilai selama drag. Saat durasi 0, slider
              tidak dirender sama sekali (max=0 tidak berguna) — diganti
              trek statis supaya layout tidak lompat. */}
          {duration > 0 ? (
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={duration}
              value={dragPosition ?? position}
              accessibilityRole="adjustable"
              accessibilityLabel="Posisi pemutaran"
              accessibilityValue={{
                min: 0,
                max: Math.round(duration),
                now: Math.round(dragPosition ?? position),
              }}
              onSlidingStart={(value) => setDragPosition(value)}
              onValueChange={(value) => setDragPosition(value)}
              onSlidingComplete={(value) => {
                setDragPosition(null);
                void seek(value);
              }}
              minimumTrackTintColor={primaryColor}
              maximumTrackTintColor={borderColor}
              thumbTintColor={primaryColor}
            />
          ) : (
            <View
              style={styles.slider}
              accessibilityRole="progressbar"
              accessibilityLabel="Posisi pemutaran belum tersedia"
            >
              <View
                style={[
                  styles.sliderDisabledTrack,
                  { backgroundColor: borderColor },
                ]}
              />
            </View>
          )}
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: textTertiary }]}>
              {formatTime(dragPosition ?? position)}
            </Text>
            <Text style={[styles.timeText, { color: textTertiary }]}>
              {formatTime(duration)}
            </Text>
          </View>
        </View>

        {/* Audio Info — A3: panel solid (lihat HEADER). Tanpa metadata
            jangan klaim angka mustahil (U-P1-06): dulu tampil "0 kHz",
            "0 bit", dan codec kosong diklaim "MP3". */}
        <View
          style={[
            styles.audioInfo,
            styles.panel,
            { backgroundColor: colors.background.primary },
          ]}
        >
          <View style={styles.audioBadge}>
            <AudioLines size={14} color={textTertiary} strokeWidth={2} />
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
            <FileMusic size={14} color={textTertiary} strokeWidth={2} />
            <Text style={[styles.audioText, { color: textTertiary }]}>
              {currentSong.codec?.toUpperCase() || "-"}
            </Text>
          </View>
        </View>

        {/* P2: chip status speed/tuning — hanya bila bukan default. */}
        {(speedChip || tuningChip) && (
          <View style={styles.playbackChips}>
            {speedChip && (
              <View
                style={[
                  styles.playbackChip,
                  { backgroundColor: colors.background.tertiary },
                ]}
              >
                <Text
                  style={[
                    styles.playbackChipText,
                    { color: colors.text.secondary },
                  ]}
                >
                  {speedChip}
                </Text>
              </View>
            )}
            {tuningChip && (
              <View
                style={[
                  styles.playbackChip,
                  { backgroundColor: colors.background.tertiary },
                ]}
              >
                <Text
                  style={[
                    styles.playbackChipText,
                    { color: colors.text.secondary },
                  ]}
                >
                  {tuningChip}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* BOTTOM UTILITY BAR — A3: latar selalu background.secondary
            (solid). Dulu mode terang memakai rgba(0,0,0,0.03) sehingga
            ikon duduk di atas gradien; mode gelap sudah solid. */}
        <View
          style={[
            styles.bottomUtilities,
            { backgroundColor: backgroundSecondary },
          ]}
        >
          <TouchableOpacity
            onPress={() => setIsTimerVisible(true)}
            style={[styles.utilityBtn, styles.sleepBtn]}
            accessibilityRole="button"
            accessibilityLabel={
              sleepActive
                ? `Timer tidur aktif, sisa ${sleepRemainingMin} menit`
                : "Timer tidur"
            }
            accessibilityState={{ selected: sleepActive }}
          >
            <Clock
              size={20}
              color={sleepActive ? primaryColor : iconColorDefault}
            />
            {sleepActive && (
              <>
                <View
                  style={[
                    styles.repeatOneDot,
                    { backgroundColor: primaryColor },
                  ]}
                />
                <View
                  style={[
                    styles.sleepBadge,
                    { backgroundColor: primaryColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.sleepBadgeText,
                      { color: playIconColor },
                    ]}
                  >
                    {`${sleepRemainingMin} mnt`}
                  </Text>
                </View>
              </>
            )}
            {/* LAYOUT-V2 (2): label teks supaya fungsi tombol jelas —
                kata sama dengan accessibilityLabel ("Timer Tidur"). */}
            <Text
              style={[
                styles.utilityLabel,
                { color: sleepActive ? primaryColor : textSecondary },
              ]}
              numberOfLines={1}
            >
              Timer Tidur
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowLyrics(!showLyrics)}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Lirik"
            accessibilityState={{ selected: showLyrics }}
          >
            <Mic2
              size={20}
              color={showLyrics ? primaryColor : iconColorDefault}
            />
            {/* LAYOUT-V2 (2): label teks "Lirik". */}
            <Text
              style={[
                styles.utilityLabel,
                { color: showLyrics ? primaryColor : textSecondary },
              ]}
              numberOfLines={1}
            >
              Lirik
            </Text>
          </TouchableOpacity>

          {/* A5: antrean — lihat + ketuk untuk lompat (tanpa reorder/hapus). */}
          <TouchableOpacity
            onPress={() => setIsQueueVisible(true)}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Antrean"
          >
            <ListMusic size={20} color={iconColorDefault} />
            {/* LAYOUT-V2 (2): label teks "Antrean". */}
            <Text
              style={[styles.utilityLabel, { color: textSecondary }]}
              numberOfLines={1}
            >
              Antrean
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(drawer)/analyzer")}
            style={styles.utilityBtn}
            accessibilityRole="button"
            accessibilityLabel="Buka analyzer"
          >
            <AudioWaveform size={20} color={iconColorDefault} />
            {/* LAYOUT-V2 (2): label teks "Analyzer". */}
            <Text
              style={[styles.utilityLabel, { color: textSecondary }]}
              numberOfLines={1}
            >
              Analyzer
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sleep Timer Modal */}
      <SleepTimerModal
        visible={isTimerVisible}
        onClose={() => setIsTimerVisible(false)}
      />

      {/* Antrean — A5: modal daftar + ketuk untuk lompat. */}
      <Modal
        visible={isQueueVisible}
        animationType="slide"
        onRequestClose={() => setIsQueueVisible(false)}
      >
        <View
          style={[
            styles.queueModalContainer,
            {
              backgroundColor: colors.background.primary,
              paddingTop: safePadding.paddingTop,
              // Follow-up P2-7: sama seperti fixedBottom — tanpa reservasi
              // +110 FloatingPlayer (modal ini bagian dari layar Player).
              paddingBottom: playerBottomPadding,
            },
          ]}
        >
          <QueueManager
            visible={isQueueVisible}
            onClose={() => setIsQueueVisible(false)}
          />
        </View>
      </Modal>
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
  // P2-7: header (atas) dan kontrol+bar utilitas (bawah) FIXED — bukan
  // bagian ScrollView — supaya tidak pernah tergeser keluar layar di
  // layar kecil. paddingHorizontal sama dengan konten ScrollView (24)
  // supaya posisi horizontal tidak berubah; paddingTop/paddingBottom
  // safe-area diberikan inline (butuh nilai useSafePadding).
  fixedTop: {
    paddingHorizontal: 24,
  },
  fixedBottom: {
    paddingHorizontal: 24,
  },
  // A3: panel solid background.primary di belakang teks/ikon (warna latar
  // diterapkan inline karena butuh token tema). Warna token dirancang
  // untuk latar solid ini — terukur lolos WCAG di Noir/Ember/Porcelain
  // (lihat player-fix-report.md). Pola yang sama dengan panel solid
  // FullLyricsView.
  panel: {
    borderRadius: 16,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 8,
  },
  headerBtn: {
    width: 44,
    height: 44,
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
    // LAYOUT-V2 (1): marginTop 20 → 0 — jarak dari header kini diberikan
    // songInfoContainer (marginTop 20); jarak info→sampul tetap 20
    // dari marginBottom songInfoContainer.
    marginTop: 0,
    marginBottom: 30,
  },
  artworkContainer: {
    borderRadius: 16,
    overflow: "hidden",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  // P2: pil petunjuk "sampul bisa diketuk untuk lirik" — latar solid
  // supaya kontras terjamin di atas foto sampul.
  artworkLyricsHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  artworkLyricsHintText: {
    fontSize: 11,
    fontWeight: "700",
  },
  // P2: panel visualizer — skala dBFS di kiri (kolom 28px, tinggi sama
  // dengan kanvas 120px; 0 di atas = 0 dB, −80 di bawah = lantai).
  visualizerPanel: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  visualizerScale: {
    width: 28,
    height: 120,
    justifyContent: "space-between",
    alignItems: "center",
    marginRight: 8,
  },
  visualizerScaleText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // P2: chip status speed/tuning (hanya bila bukan default).
  playbackChips: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  playbackChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  playbackChipText: {
    fontSize: 11,
    fontWeight: "700",
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
  slider: {
    width: "100%",
    height: 40,
  },
  // U-P2-11: trek statis pengganti slider saat durasi 0 — tinggi sama
  // dengan slider supaya layout tidak lompat.
  sliderDisabledTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 18,
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
    // LAYOUT-V2 (3): panel kini kolom — baris tombol (controlsRow) di
    // atas, slider + waktu di bawah. Dulu baris (flexDirection row).
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  // LAYOUT-V2 (3): baris 5 tombol kontrol di dalam panel kontrol.
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  // Target sentuh >= 44dp: Shuffle/Repeat (ikon 22 + padding 11x2 = 44).
  // Skip (ikon 32) jadi 54 — tidak masalah, tetap dalam bar kontrol.
  controlBtn: {
    padding: 11,
  },
  // U-P2-10: pembungkus relatif supaya dot Repeat One bisa diposisikan
  // absolut di bawah ikon (pola yang sama dengan FloatingPlayer).
  repeatBtn: {
    position: "relative",
  },
  repeatOneDot: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    bottom: 2,
    alignSelf: "center",
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
    // LAYOUT-V2 (1): panel info kini anak pertama ScrollView — marginTop
    // 20 menggantikan marginTop artworkSection yang dulu memberi jarak
    // dari header fixed.
    marginTop: 20,
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
  // LAYOUT-V2 (2): kolom (ikon di atas, label di bawah) — alignItems
  // center supaya label rata tengah di bawah ikon.
  utilityBtn: {
    padding: 12,
    alignItems: "center",
  },
  // LAYOUT-V2 (2): label teks 4 item bar utilitas. Warna textSecondary
  // (bukan tertiary) supaya kontras teks 4.5:1 di atas
  // background.secondary terjamin — dikunci playerContrast.test.ts.
  utilityLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  // A4: pembungkus relatif supaya dot + badge sisa waktu bisa diposisikan
  // absolut (pola yang sama dengan repeatBtn Repeat One).
  sleepBtn: {
    position: "relative",
  },
  sleepBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sleepBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  // A5: wadah modal antrean (QueueManager mengisi sisanya).
  queueModalContainer: {
    flex: 1,
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
