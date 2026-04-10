/**
 * src/app/(drawer)/song/[id].tsx
 * Refactored for MusicBrainz Integration
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  Heart,
  Play,
  Music,
  AlertCircle,
  Database,
  Info,
  Calendar,
  Disc,
  Folder,
} from "lucide-react-native";

// Hooks & Store
import { useTheme } from "@/shared/context/ThemeContext";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";

// Services & Types
import { LibraryScanner } from "@/features/library/api/scanner";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";
import { MetadataSyncModal } from "@/features/library/components/MetadataSyncModal";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// FIX #1: Import formatDuration dan formatFileSize dari audio.ts (bukan @/shared/utils/audio)
import { Song, formatDuration, formatFileSize } from "@/shared/types/audio";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppliedMeta {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  label?: string;
  releaseId?: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { colors } = theme;

  const tracks = useLibraryStore((state) => state.tracks);
  const updateTrackInStore = useLibraryStore((state) => state.updateTrack);
  const toggleFavoriteStore = useLibraryStore((state) => state.toggleFavorite);
  const playSong = usePlayerStore((state) => state.playSong);

  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // ── Song Selection ─────────────────────────────────────────────────────────

  // FIX #2: tracks sudah bertipe Song[] dari store, tidak perlu casting
  const song: Song | undefined = useMemo(
    () => tracks?.find((t) => t.id.toString() === id),
    [tracks, id]
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePlay = async () => {
    if (!song) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Song sudah bertipe Song — playSong langsung menerima tanpa casting
    await playSong(song, tracks);
    router.push("/player");
  };

  const handleToggleFavorite = () => {
    if (!song) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleFavoriteStore(song.id);
  };

  const handleApplyMetadata = async (newMeta: AppliedMeta) => {
    if (!song) return;
    setIsUpdating(true);

    try {
      const artworkUrl = newMeta.releaseId
        ? OnlineMetadataService.getCoverArtUrl(newMeta.releaseId)
        : song.artwork;

      const updatedData: Partial<Song> = {
        title: newMeta.title || song.title,
        artist: newMeta.artist || song.artist,
        album: newMeta.album || song.album,
        year: parseInt(newMeta.year ?? "0") || song.year,
        label: newMeta.label || song.label,
        artwork: artworkUrl,
        // FIX #3: isEnriched adalah boolean di type Song
        isEnriched: true,
        // FIX #4: gunakan nama field yang sesuai type Song (lastEnrichedAt, bukan last_enriched_at)
        lastEnrichedAt: Date.now(),
      };

      // 1. Persist ke SQLite
      await LibraryScanner.updateMetadata(song.id, updatedData);

      // 2. Update Zustand store (UI reaktif)
      updateTrackInStore(song.id, updatedData);

      setSyncModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(
        "Gagal memperbarui",
        "Terjadi kesalahan saat menyimpan metadata."
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const getReadablePath = (path?: string): string => {
    if (!path) return "-";
    return path
      .replace(/^.*\/tree\/primary:|^\/storage\/emulated\/0\//, "")
      .replace(/\/[^/]+$/, "");
  };

  // ── Render: Not Found ──────────────────────────────────────────────────────

  if (!song) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background.primary, padding: 40 },
        ]}
      >
        <AlertCircle size={48} color={colors.status.error} />
        <Text style={[styles.errorText, { color: colors.text.primary }]}>
          Lagu tidak ditemukan
        </Text>
        <TouchableOpacity
          style={[
            styles.backButton,
            { backgroundColor: colors.background.secondary },
          ]}
          onPress={() => router.back()}
        >
          <Text style={{ color: colors.primary[500], fontWeight: "600" }}>
            Kembali
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Computed display values ────────────────────────────────────────────────

  const bitrateDisplay =
    song.bitrate && song.bitrate > 0
      ? `${Math.round(song.bitrate / 1000)} kbps`
      : "VBR";

  // FIX #5: channels sekarang ada di Song type — akses langsung, tidak perlu cast
  const channelsDisplay =
    song.channels === 1 ? "Mono" : song.channels === 2 ? "Stereo" : `${song.channels ?? 2}ch`;

  const resolutionDisplay =
    song.sampleRate && song.bitDepth
      ? `${(song.sampleRate / 1000).toFixed(1)} kHz / ${song.bitDepth}-bit`
      : song.sampleRate
      ? `${(song.sampleRate / 1000).toFixed(1)} kHz`
      : "-";

  // ── Render: Main ───────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER HERO */}
        <View
          style={[
            styles.hero,
            { paddingTop: Math.max(insets.top, 20) },
          ]}
        >
          <View style={styles.navBar}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <ArrowLeft size={26} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setSyncModalVisible(true)}
                style={[
                  styles.iconBtn,
                  { backgroundColor: `${colors.primary[500]}15` },
                ]}
              >
                <Database size={22} color={colors.primary[500]} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleToggleFavorite}
                style={styles.iconBtn}
              >
                <Heart
                  size={26}
                  color={
                    song.isFavorite
                      ? colors.status.error
                      : colors.text.primary
                  }
                  fill={song.isFavorite ? colors.status.error : "transparent"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Artwork — FIX #5: icon sebagai layer di belakang, bukan di placeholder prop */}
          <View style={styles.artworkWrapper}>
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: colors.background.tertiary,
                },
              ]}
            >
              <Music size={80} color={colors.text.disabled} />
            </View>
            <Image
              source={song.artwork ? { uri: song.artwork } : null}
              style={styles.artwork}
              contentFit="cover"
              transition={300}
            />
          </View>

          <Text
            style={[styles.title, { color: colors.text.primary }]}
            numberOfLines={2}
          >
            {song.title}
          </Text>
          <Text
            style={[styles.artist, { color: colors.text.secondary }]}
          >
            {song.artist}
          </Text>

          <View style={styles.badgeContainer}>
            <QualityBadge
              sampleRate={song.sampleRate}
              bitDepth={song.bitDepth}
              codec={song.codec}
            />
          </View>
        </View>

        {/* MAIN ACTION */}
        <TouchableOpacity
          style={[
            styles.playButton,
            { backgroundColor: colors.primary[500] },
          ]}
          onPress={handlePlay}
        >
          <Play size={22} color="#FFF" fill="#FFF" />
          <Text style={styles.playButtonText}>PUTAR SEKARANG</Text>
        </TouchableOpacity>

        {/* METADATA ALBUM */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Disc size={16} color={colors.primary[500]} />
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.primary[500] },
              ]}
            >
              METADATA ALBUM
            </Text>
          </View>
          <DetailRow label="Album" value={song.album || "Unknown Album"} colors={colors} />
          <DetailRow label="Tahun" value={song.year?.toString() || "-"} colors={colors} />
          <DetailRow label="Label" value={song.label || "-"} colors={colors} />
          <DetailRow label="Publisher" value={song.publisher || "-"} colors={colors} />
        </View>

        {/* SPESIFIKASI AUDIO */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Info size={16} color={colors.primary[500]} />
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.primary[500] },
              ]}
            >
              SPESIFIKASI AUDIO
            </Text>
          </View>
          <DetailRow label="Format" value={song.codec?.toUpperCase() || "-"} colors={colors} />
          <DetailRow label="Resolusi" value={resolutionDisplay} colors={colors} />
          <DetailRow label="Bitrate" value={bitrateDisplay} colors={colors} />
          <DetailRow label="Saluran" value={channelsDisplay} colors={colors} />
          <DetailRow label="Durasi" value={formatDuration(song.duration)} colors={colors} />
        </View>

        {/* LOKASI FILE */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Folder size={16} color={colors.primary[500]} />
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.primary[500] },
              ]}
            >
              LOKASI FILE
            </Text>
          </View>
          <DetailRow label="Ukuran" value={formatFileSize(song.fileSize || 0)} colors={colors} />
          <DetailRow label="Path" value={getReadablePath(song.folder)} colors={colors} />
          <DetailRow label="Filename" value={song.filename} colors={colors} />
        </View>

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {/* SYNC MODAL */}
      <MetadataSyncModal
        visible={syncModalVisible}
        onClose={() => setSyncModalVisible(false)}
        initialTitle={song.title}
        initialArtist={song.artist}
        onSelect={handleApplyMetadata}
        colors={colors}
      />

      {/* Loading Overlay */}
      {isUpdating && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      )}
    </View>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: string | undefined;
  colors: any;
}

const DetailRow = ({ label, value, colors }: DetailRowProps) => (
  <View
    style={[styles.detailRow, { borderBottomColor: colors.border.light }]}
  >
    <Text style={[styles.detailLabel, { color: colors.text.tertiary }]}>
      {label}
    </Text>
    <Text
      style={[styles.detailValue, { color: colors.text.primary }]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {value ?? "-"}
    </Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  hero: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 30 },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
  },
  iconBtn: { padding: 10, borderRadius: 15 },
  artworkWrapper: {
    width: 280,
    height: 280,
    borderRadius: 40,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#111",
  },
  artwork: { width: "100%", height: "100%" },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  artist: { fontSize: 18, textAlign: "center", opacity: 0.7 },
  badgeContainer: { marginTop: 16 },
  playButton: {
    flexDirection: "row",
    marginHorizontal: 24,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 32,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  playButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 1,
  },
  sectionCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 28,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  detailLabel: { fontSize: 13, flex: 0.4 },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    flex: 0.6,
    textAlign: "right",
  },
  errorText: { fontSize: 18, fontWeight: "700", marginTop: 20 },
  backButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
});
 