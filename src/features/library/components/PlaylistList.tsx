import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ListMusic,
  Plus,
  Heart,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";

// ── Playlist Row (List Item) ─────────────────────────────────────────────────
const PlaylistRow = memo(({ item, isFavorite, onPress, colors }: any) => {
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
});

// ── Main PlaylistList ────────────────────────────────────────────────────────
export const PlaylistList: React.FC<any> = ({
  playlists = [],
  favoriteCount = 0,
  onPlaylistPress,
  onCreateNew,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const handleCreate = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCreateNew?.();
  }, [onCreateNew]);

  // Render Empty State jika benar-benar tidak ada playlist & tidak ada favorit
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
          Simpan lagu favorit atau buat playlist untuk momen audiophile Anda.
        </Text>

        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary[500] }]}
          onPress={handleCreate}
        >
          <Plus size={20} color="#fff" strokeWidth={3} />
          <Text style={styles.createBtnText}>Buat Playlist Baru</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={playlists}
      keyExtractor={(item) => item.id || item.name}
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

            <TouchableOpacity
              onPress={handleCreate}
              style={[
                styles.smallAddBtn,
                { backgroundColor: `${colors.primary[500]}15` },
              ]}
            >
              <Plus size={20} color={colors.primary[500]} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <PlaylistRow item={item} onPress={onPlaylistPress} colors={colors} />
      )}
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

  smallAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
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
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  createBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
