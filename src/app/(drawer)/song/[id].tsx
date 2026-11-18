// src/app/(drawer)/song/[id].tsx
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { PristineTextInput } from "@/shared/components/ui/PristineTextInput";
import { useToastStore } from "@/shared/store/toastStore";
import { FONT_FAMILY } from "@/shared/constants/themes/base";
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
  User,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, accentOn, AA_NORMAL } from "@/shared/utils/contrast";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { LibraryScanner } from "@/features/library/api/scanner";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";
import { MetadataSyncModal } from "@/features/library/components/MetadataSyncModal";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import { Song, formatDuration, formatFileSize } from "@/shared/types/audio";
import {
  missingMetadataFields,
  isFieldMissing,
  fillEmptyFields,
  FILLABLE_FIELD_LABELS,
  type FillableField,
} from "@/features/library/utils/metadataCompleteness";
// L2: menu Lirik — logika murni status/parse/penanda manual + baris
// lirik dari DB untuk pratinjau & player store.
import {
  getLyricsKind,
  lyricsLineCount,
  parsePastedLyrics,
  lyricsToDisplayText,
  mergeEditedFields,
} from "@/features/library/utils/lyricsEdit";
import { songLyricsToLines } from "@/features/library/services/lyricsSource";

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
    <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
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
  keyboardType?: "default" | "numeric";
  style?: any;
  // U-P2-05: placeholder wajib diisi pemanggil — dulu placeholderTextColor
  // disetel tapi tidak pernah ada placeholder, jadi field kosong tidak
  // memberi petunjuk format yang diharapkan.
  placeholder: string;
}

// FASE 3 additional: form edit memakai PristineTextInput (Fase 2) — label
// + input + fokus/error dari token yang sama dengan form lain. Warna label
// mengikuti builder (text.secondary); tinggi 48 + radius md sama seperti
// sebelumnya, latar container secondary (dulu tertiary) + border medium.
const EditField = ({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  style,
  placeholder,
}: EditFieldProps) => (
  <PristineTextInput
    label={label}
    value={value}
    onChangeText={onChangeText}
    keyboardType={keyboardType}
    placeholder={placeholder}
    style={[styles.editFieldContainer, style]}
  />
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

// FASE 3 additional: geometri kartu seksi dipertahankan (margin luar 20/16)
// — SectionCard sendiri yang memberi permukaan elevated + radius md +
// bayangan md dari token (dulu kartu lokal: permukaan secondary, radius 28,
// padding 20).
const sectionCardStyle = { marginHorizontal: 20, marginBottom: 16 };

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

  // FASE 3 additional: judul seksi (teks + ikon) di atas kartu SectionCard
  // (elevated) — primary[500] mentah hanya 3,78 di Ember (diukur dulu),
  // jadi pakai accentOn: amber dipertahankan di mana lolos, jatuh ke
  // accent.orange (6,68 di Ember) bila tidak.
  const accentOnElevated = accentOn(
    [colors.primary[500], colors.accent.orange],
    colors.background.elevated,
    [colors.text.primary, colors.text.secondary],
  );

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
  // L2: bila lagu yang diedit liriknya sedang diputar, player store ikut
  // di-update supaya FullLyricsView langsung menampilkan lirik baru.
  const currentSong = usePlayerStore((state) => state.currentSong);
  const setPlayerLyrics = usePlayerStore((state) => state.setLyrics);
  // FASE 3 additional: umpan balik gagal/validasi lewat toast error
  // (Fase 2) — menggantikan Alert.alert di layar ini.
  const showToast = useToastStore((s) => s.showToast);

  const [syncModalVisible, setSyncModalVisible] = useState(false);
  // L2: menu Lirik — editor tempel + dialog hapus.
  const [lyricsEditorVisible, setLyricsEditorVisible] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [isLyricsBusy, setIsLyricsBusy] = useState(false);
  const [deleteLyricsVisible, setDeleteLyricsVisible] = useState(false);
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

  // U1: field mana yang masih kosong — penanda "data belum lengkap",
  // badge tombol sync, dan pratinjau modal. Placeholder "Unknown
  // Artist/Album" dihitung kosong (lihat metadataCompleteness.ts).
  const missingFields: FillableField[] = useMemo(
    () => (song ? missingMetadataFields(song) : []),
    [song],
  );
  const missingCount = missingFields.length;
  const missingLabels = missingFields
    .map((f) => FILLABLE_FIELD_LABELS[f])
    .join(", ");

  // L2: status lirik dari DB — synced (.lrc) menang atas polos, sama
  // seperti player (songLyricsToLines). Dipakai seksi LIRIK.
  const lyricsKind = useMemo(
    () => (song ? getLyricsKind(song) : "none"),
    [song],
  );
  const lyricLines = useMemo(
    () => (song ? songLyricsToLines(song) : []),
    [song],
  );
  const lyricsCount = useMemo(
    () => (song ? lyricsLineCount(song) : 0),
    [song],
  );
  const lyricsStatusText =
    lyricsKind === "synced"
      ? `Lirik tersinkron (.lrc) · ${lyricsCount} baris`
      : lyricsKind === "plain"
        ? `Lirik polos · ${lyricsCount} baris`
        : "Belum ada lirik";
  const lyricPreview = lyricLines.slice(0, 3).map((l) => l.text);

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

  // N8: id lagu yang terakhir dipakai mengisi form edit. Tanpa ini,
  // setiap update store (toggle favorit, enrichment markAsEnriched,
  // refresh) membuat objek `song` baru dan efek di bawah me-reset
  // ketikan user yang belum disimpan.
  const editFormSongIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!song) return;
    // N8: isi ulang form hanya bila lagu berganti ATAU saat tidak sedang
    // mengedit. Selagi mengedit lagu yang sama, update store apa pun
    // tidak boleh menyentuh ketikan user; keluar mode edit (simpan /
    // batal) mengisi ulang dari data lagu terkini.
    if (isEditMode && song.id === editFormSongIdRef.current) return;
    editFormSongIdRef.current = song.id;
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
  }, [song, isEditMode]);

  const handlePlay = async () => {
    if (!song) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // U-P2-05: jangan navigasi ke Player bila playSong gagal — user
    // dilempar ke layar Player padahal lagu tidak jalan. playSong
    // mengembalikan false + mengisi playError saat native menolak.
    const ok = await playSong(song, tracks);
    if (!ok) {
      showToast("Lagu ini tidak bisa diputar. Coba lagu lain.", "error");
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

      // U1: MusicBrainz = "sapu bersih" — isi YANG KOSONG saja. Online
      // hanya mengisi field lokal yang kosong (placeholder "Unknown
      // Artist/Album" dihitung kosong); field lokal yang sudah terisi
      // tidak pernah ada di payload, jadi tidak tertimpa. Cover diisi
      // hanya bila artwork lokal kosong; foto/bio artis juga begitu.
      // Tahun non-numerik dari online diabaikan (lihat fillEmptyFields).
      const filled = fillEmptyFields(song, {
        title: newMeta.title,
        artist: newMeta.artist,
        album: newMeta.album,
        year: newMeta.year,
        label: newMeta.label,
        artwork: newMeta.releaseId
          ? OnlineMetadataService.getCoverArtUrl(newMeta.releaseId)
          : undefined,
        artistImageUrl: enrichment.imageUrl,
        artistBio: enrichment.bio,
      });

      const updatedData: Partial<Song> = {
        ...filled,
        isEnriched: true,
        lastEnrichedAt: enrichment.lastUpdated || Date.now(),
      };

      await LibraryScanner.updateMetadata(song.id, updatedData, {
        // I3 (G2): tandai field yang diterapkan dari MusicBrainz —
        // rescan tidak boleh menimpanya. updateMetadata hanya menandai
        // field yang ada di payload, dan payload U1 hanya berisi field
        // yang benar-benar diisi — jadi yang ditandai = yang diisi.
        markEdited: true,
      });
      updateTrackInStore(song.id, updatedData);

      setSyncModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // FASE 4: lengkapi dari MusicBrainz kini ber-toast sukses (dulu
      // hanya haptic + modal tertutup).
      showToast("Metadata dilengkapi dari MusicBrainz.", "success");
    } catch (error) {
      console.error("[SongDetail] Failed to apply metadata:", error);
      showToast("Terjadi kesalahan saat menyimpan metadata.", "error");
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

      await LibraryScanner.updateMetadata(song.id, updatedData, {
        // I3 (G2): tandai field yang diedit manual — rescan tidak boleh
        // menimpanya.
        markEdited: true,
      });
      updateTrackInStore(song.id, updatedData);

      setIsEditMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // FASE 4: simpan edit metadata kini ber-toast sukses (dulu hanya
      // haptic + keluar mode edit).
      showToast("Metadata disimpan.", "success");
    } catch (error) {
      showToast("Terjadi kesalahan saat menyimpan metadata.", "error");
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

  // ─── L2: menu Lirik (manual, lokal saja) ─────────────────────────────
  //
  // Satu jalur simpan untuk ketiga aksi (tempel / impor / hapus): tulis
  // ke DB via updateMetadata + markEdited (pola I3 — lirik yang diatur
  // manual tidak dihidupkan lagi enrichment/lazy-load), update store,
  // dan update player store bila lagu ini sedang diputar supaya
  // FullLyricsView langsung menampilkan lirik baru. `payload` selalu
  // memuat KEDUA field supaya yang tidak dipakai ikut dibersihkan
  // (tempel polos menghapus synced lama, dan sebaliknya).

  const applyLyricsChange = async (
    payload: { lyrics: string; lyricsSynced: string },
    lines: { time: number; text: string }[],
  ): Promise<boolean> => {
    if (!song || isLyricsBusy) return false;
    setIsLyricsBusy(true);
    try {
      await LibraryScanner.updateMetadata(song.id, payload, {
        markEdited: true,
      });
      updateTrackInStore(song.id, {
        ...payload,
        editedFields: mergeEditedFields(
          song.editedFields,
          "lyrics",
          "lyricsSynced",
        ),
      });
      if (currentSong?.id === song.id) setPlayerLyrics(lines);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (error) {
      console.error("[SongDetail] Failed to save lyrics:", error);
      showToast("Terjadi kesalahan saat menyimpan lirik.", "error");
      return false;
    } finally {
      setIsLyricsBusy(false);
    }
  };

  const handleOpenLyricsEditor = () => {
    if (!song) return;
    setLyricsDraft(lyricsToDisplayText(song));
    setLyricsEditorVisible(true);
  };

  const handleSaveLyricsDraft = async () => {
    const parsed = parsePastedLyrics(lyricsDraft);
    if (!parsed) {
      showToast("Tulis atau tempel lirik dulu.", "error");
      return;
    }
    const ok = await applyLyricsChange(
      { lyrics: parsed.lyrics, lyricsSynced: parsed.lyricsSynced },
      parsed.lines,
    );
    if (ok) {
      setLyricsEditorVisible(false);
      // FASE 4: simpan lirik kini ber-toast sukses (dulu hanya haptic).
      showToast("Lirik disimpan.", "success");
    }
  };

  const handleImportLrc = async () => {
    if (!song || isLyricsBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // .lrc tidak punya MIME terdaftar — tampilkan semua file, lalu
        // validasi ekstensi + isi (pola yang sama dengan import M3U di
        // library.tsx: copyToCacheDirectory + file.name asli).
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const file = result.assets[0];
      if (!/\.lrc$/i.test(file.name ?? "")) {
        showToast("Pilih file dengan ekstensi .lrc.", "error");
        return;
      }
      const text = await FileSystem.readAsStringAsync(file.uri);
      const parsed = parsePastedLyrics(text);
      if (!parsed || parsed.kind !== "synced") {
        showToast(
          "File .lrc tidak berisi baris ber-timestamp [mm:ss.xx].",
          "error",
        );
        return;
      }
      const ok = await applyLyricsChange(
        { lyrics: "", lyricsSynced: parsed.lyricsSynced },
        parsed.lines,
      );
      // FASE 4: impor .lrc kini ber-toast sukses (dulu hanya haptic).
      if (ok) showToast("Lirik dari file .lrc disimpan.", "success");
    } catch (error) {
      console.error("[SongDetail] Failed to import .lrc:", error);
      showToast("File .lrc tidak bisa dibaca.", "error");
    }
  };

  const handleConfirmDeleteLyrics = async () => {
    // Hapus = kedua kolom dikosongkan (string "" TERTULIS oleh
    // updateMetadata, bukan dilewati) + ditandai edited, jadi proses
    // otomatis tidak menghidupkan lagi lirik lagu ini.
    const ok = await applyLyricsChange({ lyrics: "", lyricsSynced: "" }, []);
    if (ok) {
      setDeleteLyricsVisible(false);
      // FASE 4: hapus lirik tetap lewat ConfirmDialog — toast ini hanya
      // umpan balik SESUDAH konfirmasi.
      showToast("Lirik dihapus.", "info");
    }
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
            <Text style={{ color: onPrimary, fontFamily: FONT_FAMILY.semiBold }}>
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
            <Text style={{ color: colors.primary[500], fontFamily: FONT_FAMILY.semiBold }}>
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
          <Text style={{ color: onPrimary, fontFamily: FONT_FAMILY.semiBold }}>
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
          <Text style={{ color: colors.primary[500], fontFamily: FONT_FAMILY.semiBold }}>
            Kembali
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderEditForm = () => (
    <SectionCard style={sectionCardStyle}>
      <View style={styles.sectionHeader}>
        <Edit3 size={16} color={accentOnElevated} />
        <Text style={[styles.sectionTitle, { color: accentOnElevated }]}>
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
        placeholder="Judul lagu"
      />
      <EditField
        label="Artis"
        value={editForm.artist}
        onChangeText={(text) => setEditForm({ ...editForm, artist: text })}
        placeholder="Nama artis"
      />
      <EditField
        label="Album"
        value={editForm.album}
        onChangeText={(text) => setEditForm({ ...editForm, album: text })}
        placeholder="Nama album"
      />
      <EditField
        label="Genre"
        value={editForm.genre}
        onChangeText={(text) => setEditForm({ ...editForm, genre: text })}
        placeholder="Genre"
      />
      <View style={styles.rowFields}>
        <EditField
          label="Tahun"
          value={editForm.year}
          onChangeText={(text) => setEditForm({ ...editForm, year: text })}
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
        keyboardType="numeric"
        placeholder="1"
      />
      <EditField
        label="Label"
        value={editForm.label}
        onChangeText={(text) => setEditForm({ ...editForm, label: text })}
        placeholder="Label rekaman"
      />
      <EditField
        label="Publisher"
        value={editForm.publisher}
        onChangeText={(text) => setEditForm({ ...editForm, publisher: text })}
        placeholder="Publisher"
      />
      <EditField
        label="Komposer"
        value={editForm.composer}
        onChangeText={(text) => setEditForm({ ...editForm, composer: text })}
        placeholder="Nama komposer"
      />
    </SectionCard>
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
              <Music size={80} color={colors.text.secondary} />
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
            {/* U1: judul kosong tampil "-" (konsisten dengan baris detail). */}
            {isFieldMissing(song, "title") ? "-" : song.title}
          </Text>
          <Text style={[styles.artist, { color: colors.text.secondary }]}>
            {/* U1: "Unknown Artist" = kosong → "-". */}
            {isFieldMissing(song, "artist") ? "-" : song.artist}
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
          style={[
            styles.playButton,
            { backgroundColor: colors.primary[500] },
            theme.shadows.lg,
          ]}
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
            {/* U1: penanda "data belum lengkap" + tombol sync. Bila ada
                field kosong, tombol DITEKANKAN (latar primary) + badge
                jumlah field kosong; bila lengkap, tampil biasa (tetap
                bisa ditekan, untuk koreksi data yang salah). */}
            {missingCount > 0 && (
              <View style={styles.incompleteNotice}>
                <AlertCircle
                  size={16}
                  color={colors.status.warning ?? colors.primary[500]}
                />
                <Text
                  style={[
                    styles.incompleteNoticeText,
                    { color: colors.status.warning ?? colors.primary[500] },
                  ]}
                >
                  Data belum lengkap: {missingLabels}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.syncButton,
                missingCount > 0
                  ? { backgroundColor: colors.primary[500] }
                  : {
                      backgroundColor: colors.background.secondary,
                      borderWidth: 1,
                      borderColor: colors.border.light,
                    },
              ]}
              onPress={() => setSyncModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={
                missingCount > 0
                  ? `Lengkapi dari MusicBrainz, ${missingCount} field kosong`
                  : "Lengkapi dari MusicBrainz"
              }
            >
              <Database
                size={18}
                color={
                  missingCount > 0 ? onPrimary : colors.primary[500]
                }
              />
              <Text
                style={[
                  styles.syncButtonText,
                  {
                    color:
                      missingCount > 0 ? onPrimary : colors.text.primary,
                  },
                ]}
              >
                Lengkapi dari MusicBrainz
              </Text>
              {missingCount > 0 && (
                <View
                  style={[
                    styles.syncBadge,
                    { backgroundColor: onPrimary },
                  ]}
                >
                  <Text
                    style={[
                      styles.syncBadgeText,
                      { color: colors.primary[500] },
                    ]}
                  >
                    {missingCount} kosong
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <SectionCard style={sectionCardStyle}>
              <View style={styles.sectionHeader}>
                <Disc size={16} color={accentOnElevated} />
                <Text
                  style={[styles.sectionTitle, { color: accentOnElevated }]}
                >
                  METADATA ALBUM
                </Text>
              </View>
              <DetailRow
                label="Album"
                value={isFieldMissing(song, "album") ? "-" : song.album}
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
            </SectionCard>

            {/* U1 (Koreksi 2): bio & foto artis dari DB — sebelumnya hanya
                ditulis ke DB (handleApplyMetadata) tapi tidak pernah
                ditampilkan di layar ini. Kosong → "-" (konsisten dengan
                baris detail lain). */}
            <SectionCard style={sectionCardStyle}>
              <View style={styles.sectionHeader}>
                <User size={16} color={accentOnElevated} />
                <Text
                  style={[styles.sectionTitle, { color: accentOnElevated }]}
                >
                  TENTANG ARTIS
                </Text>
              </View>
              {song.artistImageUrl ? (
                <Image
                  source={{ uri: song.artistImageUrl }}
                  style={styles.artistImage}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <DetailRow label="Foto" value="-" colors={colors} />
              )}
              {song.artistBio ? (
                <Text
                  style={[styles.artistBio, { color: colors.text.primary }]}
                >
                  {song.artistBio}
                </Text>
              ) : (
                <DetailRow label="Bio" value="-" colors={colors} />
              )}
            </SectionCard>

            {/* L2: seksi Lirik — status dari DB + aksi manual lokal untuk
                lagu tanpa file .lrc. Tulis/tempel menerima teks polos
                atau LRC; impor membaca file .lrc pilihan user; hapus
                memakai ConfirmDialog (data user). */}
            <SectionCard style={sectionCardStyle}>
              <View style={styles.sectionHeader}>
                <Music size={16} color={accentOnElevated} />
                <Text
                  style={[styles.sectionTitle, { color: accentOnElevated }]}
                >
                  LIRIK
                </Text>
              </View>
              <DetailRow
                label="Status"
                value={lyricsStatusText}
                colors={colors}
              />
              {lyricPreview.length > 0 && (
                <Text
                  style={[
                    styles.lyricsPreview,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={3}
                >
                  {lyricPreview.join("\n")}
                </Text>
              )}
              <View style={styles.lyricsActions}>
                <TouchableOpacity
                  style={[
                    styles.lyricsActionBtn,
                    { borderColor: colors.border.light },
                  ]}
                  onPress={handleOpenLyricsEditor}
                  accessibilityRole="button"
                  accessibilityLabel="Tulis atau tempel lirik"
                >
                  <Text
                    style={[
                      styles.lyricsActionBtnText,
                      { color: colors.text.primary },
                    ]}
                  >
                    Tulis / Tempel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.lyricsActionBtn,
                    { borderColor: colors.border.light },
                  ]}
                  onPress={handleImportLrc}
                  accessibilityRole="button"
                  accessibilityLabel="Impor file .lrc"
                >
                  <Text
                    style={[
                      styles.lyricsActionBtnText,
                      { color: colors.text.primary },
                    ]}
                  >
                    Impor .lrc
                  </Text>
                </TouchableOpacity>
                {lyricsKind !== "none" && (
                  <TouchableOpacity
                    style={[
                      styles.lyricsActionBtn,
                      { borderColor: colors.border.light },
                    ]}
                    onPress={() => setDeleteLyricsVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Hapus lirik"
                  >
                    <Text
                      style={[
                        styles.lyricsActionBtnText,
                        { color: colors.status.error },
                      ]}
                    >
                      Hapus
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {lyricsEditorVisible && (
                <View style={styles.lyricsEditor}>
                  <TextInput
                    style={[
                      styles.lyricsEditorInput,
                      {
                        color: colors.text.primary,
                        backgroundColor: colors.background.tertiary,
                        borderColor: colors.border.light,
                      },
                    ]}
                    value={lyricsDraft}
                    onChangeText={setLyricsDraft}
                    multiline
                    numberOfLines={8}
                    textAlignVertical="top"
                    placeholder="Tempel lirik di sini — teks polos atau format LRC [mm:ss.xx]…"
                    placeholderTextColor={colors.text.disabled}
                    accessibilityLabel="Editor lirik"
                  />
                  <Text
                    style={[
                      styles.lyricsEditorHint,
                      { color: colors.text.secondary },
                    ]}
                  >
                    Baris ber-timestamp [mm:ss.xx] disimpan sebagai lirik
                    tersinkron; teks polos disimpan sebagai lirik biasa.
                  </Text>
                  <View style={styles.lyricsActions}>
                    <TouchableOpacity
                      style={[
                        styles.lyricsSaveBtn,
                        { backgroundColor: colors.primary[500] },
                      ]}
                      onPress={handleSaveLyricsDraft}
                      disabled={isLyricsBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Simpan lirik"
                    >
                      <Text
                        style={[
                          styles.lyricsActionBtnText,
                          { color: onPrimary },
                        ]}
                      >
                        {isLyricsBusy ? "Menyimpan…" : "Simpan lirik"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.lyricsActionBtn,
                        { borderColor: colors.border.light },
                      ]}
                      onPress={() => setLyricsEditorVisible(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Batalkan tulis lirik"
                    >
                      <Text
                        style={[
                          styles.lyricsActionBtnText,
                          { color: colors.text.primary },
                        ]}
                      >
                        Batal
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard style={sectionCardStyle}>
              <View style={styles.sectionHeader}>
                <Info size={16} color={accentOnElevated} />
                <Text
                  style={[styles.sectionTitle, { color: accentOnElevated }]}
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
            </SectionCard>

            <SectionCard style={sectionCardStyle}>
              <View style={styles.sectionHeader}>
                <Folder size={16} color={accentOnElevated} />
                <Text
                  style={[styles.sectionTitle, { color: accentOnElevated }]}
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
            </SectionCard>
          </>
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {(isUpdating || isSaving || isLyricsBusy) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      )}

      {/* L2: hapus lirik = hapus data user → ConfirmDialog (Fase 2).
          File .lrc di penyimpanan TIDAK ikut dihapus. */}
      <ConfirmDialog
        visible={deleteLyricsVisible}
        title="Hapus lirik?"
        message="Lirik lagu ini akan dihapus dari database dan tidak akan dimunculkan lagi oleh scan. File .lrc di penyimpanan tidak dihapus."
        confirmLabel="Hapus"
        onConfirm={handleConfirmDeleteLyrics}
        onCancel={() => setDeleteLyricsVisible(false)}
      />

      <MetadataSyncModal
        visible={syncModalVisible}
        onClose={() => setSyncModalVisible(false)}
        initialTitle={song.title}
        initialArtist={song.artist}
        missingFields={missingFields}
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
  backLabel: { fontSize: 16, fontFamily: FONT_FAMILY.semiBold },
  // U-P2-01: padding 8 + ikon 20 lama = 36dp, di bawah 44dp.
  // padding 12 → 44dp.
  iconBtnSmall: { padding: 12, marginLeft: 4 },
  artworkWrapper: {
    width: 280,
    height: 280,
    borderRadius: 40,
    overflow: "hidden",
    marginBottom: 24,
  },
  artwork: { width: "100%", height: "100%" },
  title: {
    fontSize: 26,
    fontFamily: FONT_FAMILY.displayBold,
    textAlign: "center",
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  artist: { fontSize: 18, fontFamily: FONT_FAMILY.regular, textAlign: "center" },
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
  },
  playButtonText: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.bold,
    // U-P2-04: tanpa `color` — warna teks di-overide inline dengan
    // onPrimary (pickReadable atas primary[500]) di pemakaian style ini.
    letterSpacing: 1,
  },
  // U1: tombol sync "Lengkapi dari MusicBrainz" — ditekankan (latar
  // primary) + badge bila ada field kosong, biasa bila sudah lengkap.
  syncButton: {
    flexDirection: "row",
    marginHorizontal: 24,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  syncButtonText: { fontSize: 15, fontFamily: FONT_FAMILY.bold },
  syncBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  syncBadgeText: { fontSize: 12, fontFamily: FONT_FAMILY.bold },
  incompleteNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  incompleteNoticeText: { fontSize: 13, fontFamily: FONT_FAMILY.semiBold, flex: 1 },
  artistImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: "center",
    marginBottom: 16,
  },
  artistBio: { fontSize: 14, lineHeight: 20 },
  // L2: seksi Lirik — pratinjau, deret aksi, editor tempel.
  lyricsPreview: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  lyricsActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  lyricsActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lyricsActionBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.bold },
  lyricsEditor: { marginTop: 12 },
  lyricsEditorInput: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 20,
  },
  lyricsEditorHint: { fontSize: 12, lineHeight: 16, marginTop: 8 },
  lyricsSaveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 11, fontFamily: FONT_FAMILY.bold, letterSpacing: 1.5 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  detailLabel: { fontSize: 13, flex: 0.4 },
  detailValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    flex: 0.6,
    textAlign: "right",
  },
  errorText: { fontSize: 18, fontFamily: FONT_FAMILY.bold, marginTop: 20 },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.medium,
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
  rowFields: { flexDirection: "row", gap: 8 },
});
