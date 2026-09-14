import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
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

        <View style={styles.emptyActionGroup}>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary[500] }]}
            onPress={handleCreate}
          >
            <Plus size={20} color="#fff" strokeWidth={3} />
            <Text style={styles.createBtnText}>Buat Playlist Baru</Text>
          </TouchableOpacity>

          {onImportM3U && (
            <TouchableOpacity
              style={[
                styles.importBtn,
                {
                  borderColor: colors.primary[500],
                  backgroundColor: `${colors.primary[500]}10`,
                },
              ]}
              onPress={handleImport}
            >
              <FileDown
                size={18}
                color={colors.primary[500]}
                strokeWidth={2.5}
              />
              <Text
                style={[styles.importBtnText, { color: colors.primary[500] }]}
              >
                Import M3U / M3U8
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <FlatList
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
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  playlistInfo: { flex: 1, marginLeft: 16 },
  playlistName: { fontSize: 16, fontWeight: "700" },
  playlistMeta: { fontSize: 12, marginTop: 2 },

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
  sectionTitle: { fontSize: 18, fontWeight: "800" },

  actionHeaderGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  smallAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },

  userListEmpty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  userListEmptyText: {
    fontSize: 13,
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
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
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
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    width: "100%",
  },
  createBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1.5,
    gap: 8,
    width: "100%",
  },
  importBtnText: {
    fontWeight: "700",
    fontSize: 14,
  },
});
 