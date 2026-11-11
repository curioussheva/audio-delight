// src/app/(drawer)/song/[id].tsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
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
import { safeGoBack } from "@/shared/utils/navigation";
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
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { LibraryScanner } from "@/features/library/api/scanner";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";
import { MetadataSyncModal } from "@/features/library/components/MetadataSyncModal";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import { Song, formatDuration, formatFileSize } from "@/shared/types/audio";
import { parseIntOrKeep } from "@/shared/utils/numbers";

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
  // U-P2-05: placeholder wajib diisi pemanggil — dulu placeholderTextColor
  // disetel tapi tidak pernah ada placeholder, jadi field kosong tidak
  // memberi petunjuk format yang diharapkan.
  placeholder: string;
}

const EditField = ({
  label,
  value,
  onChangeText,
  colors,
  keyboardType = "default",
  style,
  placeholder,
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
      placeholder={placeholder}
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

  // Teks/ikon di atas tombol primary[500] — dipilih dari luminansi primary
  // (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#FFF".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  // U-P2-50: tombol "Kembali" harus selalu punya tujuan — masuk via
  // deep link tidak ada history untuk router.back(), jadi fallback ke
  // Library. Pola yang sama dengan search.tsx. (Pesan "id tidak ada"
  // vs "id tidak diberikan" sudah dibedakan sejak U-P1-21.)
  // Sejak 2026-11-12 lewat safeGoBack: canGoBack + fallback + debounce
  // 400ms supaya double-tap tidak mengirim GO_BACK kedua ke layar root.
  const handleBack = useCallback(() => {
    safeGoBack(router);
  }, [router]);

  const tracks = useLibraryStore((state) => state.tracks);
  const setTracks = useLibraryStore((state) => state.setTracks);
  // U-P1-21: sinyal "library belum termuat" — tracks ter-persist di
  // AsyncStorage, tapi sebelum rehydrate / sebelum scan perdana selesai,
  // tracks kosong BUKAN berarti lagunya tidak ada. hasCompletedInitialScan
  // false = scan perdana belum pernah selesai; isAuto/ManualScanning =
  // library masih dipindai saat ini.
  const hasCompletedInitialScan = useLibraryStore(
    (state) => state.hasCompletedInitialScan,
  );
  const isAutoScanning = useLibraryStore((state) => state.isAutoScanning);
  const isManualScanning = useLibraryStore(
    (state) => state.isManualScanning,
  );
  const updateTrackInStore = useLibraryStore((state) => state.updateTrack);
  const toggleFavoriteStore = useLibraryStore((state) => state.toggleFavorite);
  const playSong = usePlayerStore((state) => state.playSong);

  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // U-P1-21: retry memuat ulang library dari SQLite saat lagu tidak
  // ketemu / store belum termuat.
  const [isRetrying, setIsRetrying] = useState(false);

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
    // U-P2-05: jangan navigasi ke Player bila playSong gagal — user
    // dilempar ke layar Player padahal lagu tidak jalan. playSong
    // mengembalikan false + mengisi playError saat native menolak.
    const ok = await playSong(song, tracks);
    if (!ok) {
      Alert.alert(
        "Gagal memutar",
        "Lagu ini tidak bisa diputar. Coba lagu lain.",
      );
      return;
    }
    router.push("/player");
  };

  const handleToggleFavorite = () => {
    if (!song) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleFavoriteStore(song.id);
  };

  // U-P1-21: retry jujur — baca ulang library dari SQLite ke store. Kalau
  // lagu memang ada, `song` terisi dan layar detail muncul sendiri; kalau
  // tetap tidak ada, layar "tidak ditemukan" tetap tampil (bukan loading).
  const handleRetryLoad = async () => {
    setIsRetrying(true);
    try {
      const fresh = await LibraryScanner.getLibrarySongs();
      if (fresh) setTracks(fresh as any);
    } catch (e) {
      console.warn("[SongDetail] Retry load failed:", e);
    } finally {
      setIsRetrying(false);
    }
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
        // U-P2-05: tahun non-numerik dari MusicBrainz jangan jadi NaN —
        // pertahankan tahun lama bila parse gagal.
        year: parseIntOrKeep(newMeta.year, song.year),
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
    // U-P2-05: guard double-tap — tanpa ini dua ketukan Check mengirim
    // dua updateMetadata bersamaan.
    if (isSaving) return;
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

  // Bitrate sudah disimpan dalam kbps (MediaStoreModule.kt:26 membagi
  // bps / 1000, metadataAdapter.ts juga) — jangan dibagi lagi (U-P1-07:
  // dulu 1411 kbps tampil "1 kbps"). Bitrate 0 = tidak diketahui, bukan
  // "VBR".
  const bitrateDisplay =
    song?.bitrate && song.bitrate > 0 ? `${Math.round(song.bitrate)} kbps` : "-";
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

  // U-P1-21: bedakan "belum termuat" dari "benar-benar tidak ada". Dulu
  // layar ini langsung menuduh "Lagu tidak ditemukan" saat store belum
  // terisi (cold start / deep link / library masih scan) — padahal lagunya
  // ada. Cabang loading tampil selama scan perdana belum selesai atau
  // library masih dipindai; "tidak ditemukan" hanya setelah termuat.
  if (!song) {
    const isLoadingLibrary =
      isRetrying || !hasCompletedInitialScan || isAutoScanning || isManualScanning;

    if (isLoadingLibrary) {
      return (
        <View
          style={[
            styles.center,
            { backgroundColor: colors.background.primary, padding: 40 },
          ]}
        >
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={[styles.errorText, { color: colors.text.primary }]}>
            Memuat lagu…
          </Text>
          <Text
            style={[styles.loadingSubtext, { color: colors.text.secondary }]}
          >
            Menunggu library selesai dimuat.
          </Text>
          <TouchableOpacity
            style={[
              styles.backButton,
              { backgroundColor: colors.primary[500] },
            ]}
            onPress={handleRetryLoad}
            disabled={isRetrying}
          >
            <Text style={{ color: onPrimary, fontWeight: "600" }}>
              {isRetrying ? "Memuat…" : "Muat ulang"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.backButton,
              { backgroundColor: colors.background.secondary },
            ]}
            onPress={handleBack}
          >
            <Text style={{ color: colors.primary[500], fontWeight: "600" }}>
              Kembali
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background.primary, padding: 40 },
        ]}
      >
        <AlertCircle size={48} color={colors.status.error} />
        <Text style={[styles.errorText, { color: colors.text.primary }]}>
          {!id ? "ID lagu tidak diberikan" : "Lagu tidak ditemukan"}
        </Text>
        <TouchableOpacity
          style={[
            styles.backButton,
            { backgroundColor: colors.primary[500] },
          ]}
          onPress={handleRetryLoad}
          disabled={isRetrying}
        >
          <Text style={{ color: onPrimary, fontWeight: "600" }}>
            {isRetrying ? "Memuat…" : "Coba lagi"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.backButton,
            { backgroundColor: colors.background.secondary },
          ]}
          onPress={handleBack}
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
          accessibilityRole="button"
          accessibilityLabel="Batalkan edit"
        >
          <X size={20} color={colors.text.tertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSaveEdit}
          style={styles.iconBtnSmall}
          accessibilityRole="button"
          accessibilityLabel="Simpan metadata"
        >
          <Check size={20} color={colors.status.success} />
        </TouchableOpacity>
      </View>

      <EditField
        label="Judul"
        value={editForm.title}
        onChangeText={(text) => setEditForm({ ...editForm, title: text })}
        colors={colors}
        placeholder="Judul lagu"
      />
      <EditField
        label="Artis"
        value={editForm.artist}
        onChangeText={(text) => setEditForm({ ...editForm, artist: text })}
        colors={colors}
        placeholder="Nama artis"
      />
      <EditField
        label="Album"
        value={editForm.album}
        onChangeText={(text) => setEditForm({ ...editForm, album: text })}
        colors={colors}
        placeholder="Nama album"
      />
      <EditField
        label="Genre"
        value={editForm.genre}
        onChangeText={(text) => setEditForm({ ...editForm, genre: text })}
        colors={colors}
        placeholder="Genre"
      />
      <View style={styles.rowFields}>
        <EditField
          label="Tahun"
          value={editForm.year}
          onChangeText={(text) => setEditForm({ ...editForm, year: text })}
          colors={colors}
          keyboardType="numeric"
          style={{ flex: 1, marginRight: 8 }}
          placeholder="2024"
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
          placeholder="1"
        />
      </View>
      {/* U-P2-05: discNumber ada di EditFormData dan ikut tersimpan, tapi
          tidak pernah bisa diubah dari UI — tambahkan field-nya. */}
      <EditField
        label="Disc No."
        value={editForm.discNumber}
        onChangeText={(text) => setEditForm({ ...editForm, discNumber: text })}
        colors={colors}
        keyboardType="numeric"
        placeholder="1"
      />
      <EditField
        label="Label"
        value={editForm.label}
        onChangeText={(text) => setEditForm({ ...editForm, label: text })}
        colors={colors}
        placeholder="Label rekaman"
      />
      <EditField
        label="Publisher"
        value={editForm.publisher}
        onChangeText={(text) => setEditForm({ ...editForm, publisher: text })}
        colors={colors}
        placeholder="Publisher"
      />
      <EditField
        label="Komposer"
        value={editForm.composer}
        onChangeText={(text) => setEditForm({ ...editForm, composer: text })}
        colors={colors}
        placeholder="Nama komposer"
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) }]}>
          <View style={styles.navBar}>
            {/* U-P2-09: back berlabel "Kembali" — pola yang sama dengan
                detail Album/Artist/Folder/Format/Genre. */}
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.iconBtn, styles.backBtn]}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <ArrowLeft size={26} color={colors.text.primary} />
              <Text
                style={[styles.backLabel, { color: colors.text.primary }]}
              >
                Kembali
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {!isEditMode && (
                <TouchableOpacity
                  onPress={() => setIsEditMode(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit metadata"
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
                accessibilityRole="button"
                accessibilityLabel="Sinkronkan metadata"
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
                accessibilityRole="button"
                accessibilityLabel={
                  song.isFavorite ? "Hapus dari favorit" : "Tambah ke favorit"
                }
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
          <Play size={22} color={onPrimary} fill={onPrimary} />
          <Text style={[styles.playButtonText, { color: onPrimary }]}>
            PUTAR SEKARANG
          </Text>
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
  // U-P2-01: padding 10 + ikon 22 lama = 42dp, di bawah 44dp.
  // padding 12 → 46dp (ikon 22) / 50dp (ikon 26).
  iconBtn: { padding: 12, borderRadius: 15 },
  // U-P2-09: tombol back berlabel (dipakai navBar layar utama).
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backLabel: { fontSize: 16, fontWeight: "600" },
  // U-P2-01: padding 8 + ikon 20 lama = 36dp, di bawah 44dp.
  // padding 12 → 44dp.
  iconBtnSmall: { padding: 12, marginLeft: 4 },
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
    // U-P2-04: tanpa `color` — warna teks di-overide inline dengan
    // onPrimary (pickReadable atas primary[500]) di pemakaian style ini.
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
  loadingSubtext: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
  },
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
