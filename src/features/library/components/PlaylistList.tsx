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
}

interface PlaylistRowProps {
  item: PlaylistItem;
  isFavorite?: boolean;
  onPress: (item: PlaylistItem) => void;
  colors: any;
}

interface PlaylistListProps {
  playlists: PlaylistItem[];
  favoriteCount?: number;
  onPlaylistPress: (playlist: PlaylistItem) => void;
  onCreateNew?: () => void;
  onImportM3U?: () => void;
}

// ── Playlist Row (List Item) ─────────────────────────────────────────────────
const PlaylistRow = memo(
  ({ item, isFavorite = false, onPress, colors }: PlaylistRowProps) => {
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
          </Text>
        </View>

        <ChevronRight size={18} color={colors.text.disabled} />
      </TouchableOpacity>
    );
  }
);

PlaylistRow.displayName = "PlaylistRow";

// ── Main PlaylistList ────────────────────────────────────────────────────────
export const PlaylistList: React.FC<PlaylistListProps> = ({
  playlists = [],
  favoriteCount = 0,
  onPlaylistPress,
  onCreateNew,
  onImportM3U,
}) => {
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

  // Solusi Performa: Jangan masukkan `colors` ke dependency useCallback renderItem
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

  // Full Empty State (Jika tidak ada lagu favorit DAN tidak ada playlist buatan)
  if (playlists.length === 0 && favoriteCount === 0) {
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
              {onImportM3U && (
                <TouchableOpacity
                  onPress={handleImport}
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
                onPress={handleCreate}
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
};

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
 