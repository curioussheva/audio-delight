// src/app/(drawer)/song/[id].tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
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
  Disc,
  Folder,
  Edit3,
  Check,
  X,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { LibraryScanner } from "@/features/library/api/scanner";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";
import { MetadataSyncModal } from "@/features/library/components/MetadataSyncModal";
import QualityBadge from "@/shared/components/ui/QualityBadge";
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

interface EditFormData {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  trackNumber: string;
  discNumber: string;
  composer: string;
  publisher: string;
  label: string;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: string | undefined;
  colors: any;
}

const DetailRow = ({ label, value, colors }: DetailRowProps) => (
  <View style={[styles.detailRow, { borderBottomColor: colors.border.light }]}>
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

interface EditFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: any;
  keyboardType?: "default" | "numeric";
  style?: any;
}

const EditField = ({
  label,
  value,
  onChangeText,
  colors,
  keyboardType = "default",
  style,
}: EditFieldProps) => (
  <View style={[styles.editFieldContainer, style]}>
    <Text style={[styles.editLabel, { color: colors.text.tertiary }]}>
      {label}
    </Text>
    <TextInput
      style={[
        styles.editInput,
        {
          color: colors.text.primary,
          backgroundColor: colors.background.tertiary,
          borderColor: colors.border.light,
        },
      ]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholderTextColor={colors.text.disabled}
    />
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const song: Song | undefined = useMemo(
    () => tracks?.find((t) => t.id.toString() === id),
    [tracks, id],
  );

  const [editForm, setEditForm] = useState<EditFormData>({
    title: "",
    artist: "",
    album: "",
    genre: "",
    year: "",
    trackNumber: "",
    discNumber: "",
    composer: "",
    publisher: "",
    label: "",
  });

  useEffect(() => {
    if (song) {
      setEditForm({
        title: song.title || "",
        artist: song.artist || "",
        album: song.album || "",
        genre: song.genre || "",
        year: song.year?.toString() || "",
        trackNumber: song.trackNumber?.toString() || "",
        discNumber: song.discNumber?.toString() || "",
        composer: song.composer || "",
        publisher: song.publisher || "",
        label: song.label || "",
      });
    }
  }, [song]);

  const handlePlay = async () => {
    if (!song) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      const artistName = newMeta.artist?.trim() || song.artist;
      const enrichment =
        await OnlineMetadataService.getArtistEnrichment(artistName);

      const updatedData: Partial<Song> = {
        title: newMeta.title?.trim() || song.title,
        artist: artistName,
        album: newMeta.album?.trim() || song.album,
        year: newMeta.year ? parseInt(newMeta.year, 10) : song.year,
        label: newMeta.label?.trim() || song.label,
        artistImageUrl: enrichment.imageUrl || song.artistImageUrl,
        artistBio: enrichment.bio || song.artistBio,
        isEnriched: true,
        lastEnrichedAt: enrichment.lastUpdated || Date.now(),
      };

      if (newMeta.releaseId) {
        updatedData.artwork = OnlineMetadataService.getCoverArtUrl(
          newMeta.releaseId,
        );
      }

      await LibraryScanner.updateMetadata(song.id, updatedData);
      updateTrackInStore(song.id, updatedData);

      setSyncModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("[SongDetail] Failed to apply metadata:", error);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan metadata.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!song) return;
    setIsSaving(true);

    try {
      const updatedData: Partial<Song> = {
        title: editForm.title.trim() || song.title,
        artist: editForm.artist.trim() || song.artist,
        album: editForm.album.trim() || song.album,
        genre: editForm.genre.trim() || song.genre,
        year: parseInt(editForm.year) || song.year,
        trackNumber: parseInt(editForm.trackNumber) || song.trackNumber,
        discNumber: parseInt(editForm.discNumber) || song.discNumber,
        composer: (editForm.composer as any) || (song as any).composer,
        publisher: editForm.publisher.trim() || song.publisher,
        label: editForm.label.trim() || song.label,
      };

      await LibraryScanner.updateMetadata(song.id, updatedData);
      updateTrackInStore(song.id, updatedData);

      setIsEditMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan metadata.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (song) {
      setEditForm({
        title: song.title || "",
        artist: song.artist || "",
        album: song.album || "",
        genre: song.genre || "",
        year: song.year?.toString() || "",
        trackNumber: song.trackNumber?.toString() || "",
        discNumber: song.discNumber?.toString() || "",
        composer: (song as any).composer || "",
        publisher: song.publisher || "",
        label: song.label || "",
      });
    }
    setIsEditMode(false);
  };

  const getReadablePath = (path?: string): string => {
    if (!path) return "-";
    return path
      .replace(/^.*\/tree\/primary:|^\/storage\/emulated\/0\//, "")
      .replace(/\/[^/]+$/, "");
  };

  const bitrateDisplay =
    song?.bitrate && song.bitrate > 0
      ? `${Math.round(song.bitrate / 1000)} kbps`
      : "VBR";
  const channelsDisplay =
    song?.channels === 1
      ? "Mono"
      : song?.channels === 2
        ? "Stereo"
        : `${song?.channels ?? 2}ch`;
  const resolutionDisplay =
    song?.sampleRate && song?.bitDepth
      ? `${(song.sampleRate / 1000).toFixed(1)} kHz / ${song.bitDepth}-bit`
      : song?.sampleRate
        ? `${(song.sampleRate / 1000).toFixed(1)} kHz`
        : "-";

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

  const renderEditForm = () => (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.background.secondary },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Edit3 size={16} color={colors.primary[500]} />
        <Text style={[styles.sectionTitle, { color: colors.primary[500] }]}>
          EDIT METADATA
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={handleCancelEdit}
          style={styles.iconBtnSmall}
        >
          <X size={20} color={colors.text.tertiary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSaveEdit} style={styles.iconBtnSmall}>
          <Check size={20} color={colors.status.success} />
        </TouchableOpacity>
      </View>

      <EditField
        label="Judul"
        value={editForm.title}
        onChangeText={(text) => setEditForm({ ...editForm, title: text })}
        colors={colors}
      />
      <EditField
        label="Artis"
        value={editForm.artist}
        onChangeText={(text) => setEditForm({ ...editForm, artist: text })}
        colors={colors}
      />
      <EditField
        label="Album"
        value={editForm.album}
        onChangeText={(text) => setEditForm({ ...editForm, album: text })}
        colors={colors}
      />
      <EditField
        label="Genre"
        value={editForm.genre}
        onChangeText={(text) => setEditForm({ ...editForm, genre: text })}
        colors={colors}
      />
      <View style={styles.rowFields}>
        <EditField
          label="Tahun"
          value={editForm.year}
          onChangeText={(text) => setEditForm({ ...editForm, year: text })}
          colors={colors}
          keyboardType="numeric"
          style={{ flex: 1, marginRight: 8 }}
        />
        <EditField
          label="Track No."
          value={editForm.trackNumber}
          onChangeText={(text) =>
            setEditForm({ ...editForm, trackNumber: text })
          }
          colors={colors}
          keyboardType="numeric"
          style={{ flex: 1 }}
        />
      </View>
      <EditField
        label="Label"
        value={editForm.label}
        onChangeText={(text) => setEditForm({ ...editForm, label: text })}
        colors={colors}
      />
      <EditField
        label="Publisher"
        value={editForm.publisher}
        onChangeText={(text) => setEditForm({ ...editForm, publisher: text })}
        colors={colors}
      />
      <EditField
        label="Komposer"
        value={editForm.composer}
        onChangeText={(text) => setEditForm({ ...editForm, composer: text })}
        colors={colors}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) }]}>
          <View style={styles.navBar}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <ArrowLeft size={26} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {!isEditMode && (
                <TouchableOpacity
                  onPress={() => setIsEditMode(true)}
                  style={[
                    styles.iconBtn,
                    { backgroundColor: `${colors.primary[500]}15` },
                  ]}
                >
                  <Edit3 size={22} color={colors.primary[500]} />
                </TouchableOpacity>
              )}
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
                    song.isFavorite ? colors.status.error : colors.text.primary
                  }
                  fill={song.isFavorite ? colors.status.error : "transparent"}
                />
              </TouchableOpacity>
            </View>
          </View>

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
          <Text style={[styles.artist, { color: colors.text.secondary }]}>
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

        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: colors.primary[500] }]}
          onPress={handlePlay}
        >
          <Play size={22} color="#FFF" fill="#FFF" />
          <Text style={styles.playButtonText}>PUTAR SEKARANG</Text>
        </TouchableOpacity>

        {isEditMode ? (
          renderEditForm()
        ) : (
          <>
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.background.secondary },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Disc size={16} color={colors.primary[500]} />
                <Text
                  style={[styles.sectionTitle, { color: colors.primary[500] }]}
                >
                  METADATA ALBUM
                </Text>
              </View>
              <DetailRow
                label="Album"
                value={song.album || "Unknown Album"}
                colors={colors}
              />
              <DetailRow
                label="Tahun"
                value={song.year?.toString() || "-"}
                colors={colors}
              />
              <DetailRow
                label="Label"
                value={song.label || "-"}
                colors={colors}
              />
              <DetailRow
                label="Publisher"
                value={song.publisher || "-"}
                colors={colors}
              />
            </View>

            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.background.secondary },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Info size={16} color={colors.primary[500]} />
                <Text
                  style={[styles.sectionTitle, { color: colors.primary[500] }]}
                >
                  SPESIFIKASI AUDIO
                </Text>
              </View>
              <DetailRow
                label="Format"
                value={song.codec?.toUpperCase() || "-"}
                colors={colors}
              />
              <DetailRow
                label="Resolusi"
                value={resolutionDisplay}
                colors={colors}
              />
              <DetailRow
                label="Bitrate"
                value={bitrateDisplay}
                colors={colors}
              />
              <DetailRow
                label="Saluran"
                value={channelsDisplay}
                colors={colors}
              />
              <DetailRow
                label="Durasi"
                value={formatDuration(song.duration)}
                colors={colors}
              />
            </View>

            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.background.secondary },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Folder size={16} color={colors.primary[500]} />
                <Text
                  style={[styles.sectionTitle, { color: colors.primary[500] }]}
                >
                  LOKASI FILE
                </Text>
              </View>
              <DetailRow
                label="Ukuran"
                value={formatFileSize(song.fileSize || 0)}
                colors={colors}
              />
              <DetailRow
                label="Path"
                value={getReadablePath(song.folder)}
                colors={colors}
              />
              <DetailRow
                label="Filename"
                value={song.filename}
                colors={colors}
              />
            </View>
          </>
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {(isUpdating || isSaving) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      )}

      <MetadataSyncModal
        visible={syncModalVisible}
        onClose={() => setSyncModalVisible(false)}
        initialTitle={song.title}
        initialArtist={song.artist}
        onSelect={handleApplyMetadata}
        colors={colors}
      />
    </View>
  );
}

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
  iconBtnSmall: { padding: 8, marginLeft: 4 },
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
  editFieldContainer: { marginBottom: 16 },
  editLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  editInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: "500",
  },
  rowFields: { flexDirection: "row", gap: 8 },
});
