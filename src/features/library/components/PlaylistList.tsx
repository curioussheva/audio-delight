import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ListRenderItem,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ListMusic,
  Plus,
  Heart,
  ChevronRight,
  Layers,
  Sparkles,
  FileDown,
  Wand2,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { buildButtonStyles } from "@/shared/utils/uiStyles";

// ── Types Definition ────────────────────────────────────────────────────────
export interface PlaylistItem {
  id: string;
  name: string;
  count?: number;
  paths?: string[];
  // Smart playlist (virtual): dihitung live dari library — tidak bisa
  // tambah/hapus lagu atau dihapus (seperti "Lagu Disukai").
  isSmart?: boolean;
}

interface PlaylistRowProps {
  item: PlaylistItem;
  isFavorite?: boolean;
  isSmart?: boolean;
  onPress: (item: PlaylistItem) => void;
  colors: any;
}

interface PlaylistListProps {
  playlists: PlaylistItem[];
  favoriteCount?: number;
  // Ringkasan smart playlist (id `smart:*` + hitungan) — dirender di
  // seksi "Playlist Otomatis" antara Favorit dan Playlist Saya.
  smartPlaylists?: PlaylistItem[];
  onPlaylistPress: (playlist: PlaylistItem) => void;
  onCreateNew?: () => void;
  onImportM3U?: () => void;
}

// ── Playlist Row (List Item) ─────────────────────────────────────────────────
const PlaylistRow = memo(
  ({ item, isFavorite = false, isSmart = false, onPress, colors }: PlaylistRowProps) => {
    const handlePress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress(item);
    };

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={styles.playlistRow}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isFavorite
                ? `${colors.status.error}15`
                : `${colors.primary[500]}12`,
            },
          ]}
        >
          {isFavorite ? (
            <Heart
              size={26}
              color={colors.status.error}
              fill={colors.status.error}
            />
          ) : isSmart ? (
            <Wand2 size={26} color={colors.primary[500]} strokeWidth={2} />
          ) : (
            <ListMusic size={26} color={colors.primary[500]} strokeWidth={2} />
          )}
        </View>

        <View style={styles.playlistInfo}>
          <Text
            style={[styles.playlistName, { color: colors.text.primary }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={[styles.playlistMeta, { color: colors.text.tertiary }]}>
            {item.count || 0} tracks
            {isSmart ? " • Otomatis" : ""}
          </Text>
        </View>

        <ChevronRight size={18} color={colors.text.disabled} />
      </TouchableOpacity>
    );
  }
);

PlaylistRow.displayName = "PlaylistRow";

// ── PlaylistListHeader (memo) ───────────────────────────────────────────────
// Header daftar (Favorit + Playlist Otomatis + kepala "Playlist Saya")
// dulu JSX inline di dalam PlaylistList — objek/arrow baru tiap render
// induk, jadi ScreenList/FlatList membangun ulang header tiap kali.
// Sekarang komponen memo sendiri: props-nya stabil (angka + array
// useMemo + useCallback + colors tema statis), jadi header hanya bangun
// bila isinya berubah (mis. favoriteCount / smartPlaylists berganti).
// Arrow `onPress` Favorit + objek item-nya dibuat di DALAM komponen ini
// — hanya saat header memang render ulang — bukan tiap render induk.
const PlaylistListHeader = memo(function PlaylistListHeader({
  favoriteCount,
  smartPlaylists,
  onPlaylistPress,
  onCreate,
  onImport,
  hasImport,
  colors,
}: {
  favoriteCount: number;
  smartPlaylists: PlaylistItem[];
  onPlaylistPress?: (playlist: PlaylistItem) => void;
  onCreate: () => void;
  onImport: () => void;
  hasImport: boolean;
  colors: any;
}) {
  return (
    <View style={styles.headerContainer}>
      {/* Section 1: System Playlists (Favorites) */}
      <PlaylistRow
        isFavorite
        item={{
          name: "Lagu Disukai",
          count: favoriteCount,
          id: "favorites",
        }}
        onPress={() =>
          onPlaylistPress?.({ id: "favorites", name: "Lagu Disukai" })
        }
        colors={colors}
      />

      <View
        style={[
          styles.sectionDivider,
          { backgroundColor: colors.background.tertiary },
        ]}
      />

      {/* Section 1b: Smart Playlists (virtual — dihitung live dari
          library; bukan playlist DB, jadi tidak bisa diedit/dihapus).
          Hanya tampil bila ada ringkasannya (hook gagal muat = hilang
          diam-diam, playlist manual tetap tampil). */}
      {smartPlaylists.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Wand2 size={16} color={colors.primary[500]} />
              <Text
                style={[styles.sectionTitle, { color: colors.text.primary }]}
              >
                Playlist Otomatis
              </Text>
            </View>
          </View>

          {smartPlaylists.map((item) => (
            <PlaylistRow
              key={item.id}
              item={item}
              isSmart
              onPress={onPlaylistPress}
              colors={colors}
            />
          ))}

          <View
            style={[
              styles.sectionDivider,
              { backgroundColor: colors.background.tertiary },
            ]}
          />
        </>
      )}

      {/* Section 2: User Playlists Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Sparkles size={16} color={colors.primary[500]} />
          <Text
            style={[styles.sectionTitle, { color: colors.text.primary }]}
          >
            Playlist Saya
          </Text>
        </View>

        <View style={styles.actionHeaderGroup}>
          {hasImport && (
            <TouchableOpacity
              onPress={onImport}
              style={[
                styles.smallAddBtn,
                { backgroundColor: `${colors.primary[500]}15` },
              ]}
              accessibilityLabel="Import M3U Playlist"
            >
              <FileDown
                size={18}
                color={colors.primary[500]}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onCreate}
            style={[
              styles.smallAddBtn,
              { backgroundColor: `${colors.primary[500]}15` },
            ]}
            accessibilityLabel="Buat Playlist Baru"
          >
            <Plus size={20} color={colors.primary[500]} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// memo (audit Library 2026-11-22): komparator default cukup — props
// dari library.tsx stabil (array useMemo + primitif + useCallback),
// `colors` dari useTheme() internal (objek tema statis ALL_THEMES).
// Tanpa memo, tiap ganti lagu ikut me-render ulang daftar + header
// inline di dalamnya (lihat juga P3).
export const PlaylistList = memo(function PlaylistList({
  playlists = [],
  favoriteCount = 0,
  smartPlaylists = [],
  onPlaylistPress,
  onCreateNew,
  onImportM3U,
}: PlaylistListProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  // Warna ikon = warna label dari builder tombol yang sama — terukur
  // di semua tema (Fase 2), bukan ditebak per layar.
  const primaryLabelColor = buildButtonStyles(theme, {
    variant: "primary",
  }).label.color as string;
  const secondaryLabelColor = buildButtonStyles(theme, {
    variant: "secondary",
  }).label.color as string;

  const handleCreate = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onCreateNew?.();
  }, [onCreateNew]);

  const handleImport = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onImportM3U?.();
  }, [onImportM3U]);

  // `colors` MEMANG ada di dep — komentar lama ("Jangan masukkan
  // `colors` ke dependency") SALAH dan menyesatkan: renderItem
  // meneruskan `colors` ke PlaylistRow, jadi dep wajib menyebutkannya
  // (mengeluarkannya = stale closure + pelanggaran exhaustive-deps).
  // Identitas `colors` stabil (objek tema statis ALL_THEMES, lihat
  // libraryTabMemo.test.ts), jadi renderItem tetap stabil selama tema
  // tidak berganti.
  const renderItem: ListRenderItem<PlaylistItem> = useCallback(
    ({ item }) => (
      <PlaylistRow item={item} onPress={onPlaylistPress} colors={colors} />
    ),
    [onPlaylistPress, colors]
  );

  const keyExtractor = useCallback(
    (item: PlaylistItem) => item.id || item.name,
    []
  );

  // Full Empty State (Jika tidak ada lagu favorit DAN tidak ada playlist
  // buatan DAN tidak ada lagu di smart playlist — mis. library kosong).
  // Smart playlist yang isinya 0 tetap dihitung 0: kalau library ada
  // isinya, salah satu smart playlist pasti terisi, jadi daftar tampil.
  const smartTotal = smartPlaylists.reduce(
    (sum, p) => sum + (p.count || 0),
    0,
  );
  if (playlists.length === 0 && favoriteCount === 0 && smartTotal === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: colors.background.primary },
        ]}
      >
        <View
          style={[
            styles.emptyIconCircle,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <Layers size={48} color={colors.text.disabled} strokeWidth={1} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
          Mulai Koleksi Anda
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.text.tertiary }]}>
          Simpan lagu favorit, buat playlist, atau import file M3U/M3U8 lokal.
        </Text>

        {/* Fase 2 redesign: tombol bersama (primer + sekunder). */}
        <View style={styles.emptyActionGroup}>
          <PristineButton
            label="Buat Playlist Baru"
            icon={<Plus size={20} color={primaryLabelColor} strokeWidth={3} />}
            onPress={handleCreate}
            fullWidth
          />

          {onImportM3U && (
            <PristineButton
              label="Import M3U / M3U8"
              variant="secondary"
              icon={
                <FileDown
                  size={18}
                  color={secondaryLabelColor}
                  strokeWidth={2.5}
                />
              }
              onPress={handleImport}
              fullWidth
            />
          )}
        </View>
      </View>
    );
  }

  // U-P2-53: daftar playlist lewat pola daftar bersama. Jalur yang
  // dipilih FlatList (`boundedSmall`: playlist pengguna jumlahnya kecil
  // + ada section header) — perilaku scroll tidak berubah.
  return (
    <ScreenList
      boundedSmall
      data={playlists}
      keyExtractor={keyExtractor}
      extraData={colors} // Memastikan render ulang jika tema berubah
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <PlaylistListHeader
          favoriteCount={favoriteCount}
          smartPlaylists={smartPlaylists}
          onPlaylistPress={onPlaylistPress}
          onCreate={handleCreate}
          onImport={handleImport}
          hasImport={!!onImportM3U}
          colors={colors}
        />
      }
      // Penanganan jika ada Favorit tetapi Playlist Kustom masih 0
      ListEmptyComponent={
        <View style={styles.userListEmpty}>
          <Text style={[styles.userListEmptyText, { color: colors.text.tertiary }]}>
            Belum ada playlist buatan.
          </Text>
        </View>
      }
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  );
});

const styles = StyleSheet.create({
  listContent: { paddingBottom: 120 },
  headerContainer: { paddingTop: 10 },

  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  iconContainer: {
    width: 54,
    height: 54,
    borderRadius: BASE_RADIUS.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  playlistInfo: { flex: 1, marginLeft: 16 },
  playlistName: { fontSize: 16, fontFamily: FONT_FAMILY.bold },
  playlistMeta: { fontSize: 12, fontFamily: FONT_FAMILY.regular, marginTop: 2 },

  sectionDivider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 12,
    opacity: 0.5,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 4,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 18, fontFamily: FONT_FAMILY.displayBold, lineHeight: 24 },

  actionHeaderGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallAddBtn: {
    width: 36,
    height: 36,
    borderRadius: BASE_RADIUS.pill,
    justifyContent: "center",
    alignItems: "center",
  },

  userListEmpty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  userListEmptyText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    fontStyle: "italic",
  },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: BASE_RADIUS.pill,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontFamily: FONT_FAMILY.displayBold, lineHeight: 28, marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.regular,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    opacity: 0.7,
  },
  emptyActionGroup: {
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
});
 