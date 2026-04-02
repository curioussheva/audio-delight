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
  Play, 
  Layers
} from "lucide-react-native";
import { useTheme } from "@/context/ThemeContext";

// ── PlaylistRow ───────────────────────────────────────────────────────────────
const PlaylistRow = memo(({ item, isFavorite, onPress, colors }: any) => {
  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.playlistRow}>
      {/* Visual Stack / Icon */}
      <View style={[styles.iconStack, { backgroundColor: isFavorite ? `${colors.status.error}15` : `${colors.primary[500]}10` }]}>
        {isFavorite ? (
          <Heart size={24} color={colors.status.error} fill={colors.status.error} />
        ) : (
          <ListMusic size={24} color={colors.primary[500]} strokeWidth={1.5} />
        )}
      </View>

      <View style={styles.playlistInfo}>
        <Text style={[styles.playlistName, { color: colors.text.primary }]}>
          {item.name}
        </Text>
        <Text style={[styles.playlistMeta, { color: colors.text.tertiary }]}>
          {item.count || 0} Tracks
        </Text>
      </View>

      <ChevronRight size={18} color={colors.text.disabled} />
    </TouchableOpacity>
  );
});

// ── PlaylistList Main Component ──────────────────────────────────────────────
export const PlaylistList: React.FC<any> = ({ 
  playlists = [], 
  favoriteCount = 0,
  onPlaylistPress,
  onCreateNew 
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const handleCreate = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCreateNew?.();
  };

  // Jika benar-benar kosong (bahkan tidak ada favorit/default)
  if (playlists.length === 0 && favoriteCount === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background.primary }]}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.background.secondary }]}>
          <Layers size={40} color={colors.text.disabled} strokeWidth={1} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Koleksi Masih Kosong</Text>
        <Text style={[styles.emptySub, { color: colors.text.disabled }]}>
          Buat playlist pertama Anda untuk mengelompokkan lagu sesuai mood.
        </Text>
        
        <TouchableOpacity 
          style={[styles.createBtn, { backgroundColor: colors.primary[500] }]}
          onPress={handleCreate}
        >
          <Plus size={20} color="#fff" strokeWidth={2.5} />
          <Text style={styles.createBtnText}>Buat Playlist Baru</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={playlists}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Action Bar */}
            <View style={styles.actionBar}>
               <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Koleksi Anda</Text>
               <TouchableOpacity onPress={handleCreate} style={styles.smallPlusBtn}>
                 <Plus size={20} color={colors.primary[500]} />
               </TouchableOpacity>
            </View>

            {/* Default Favorites Playlist */}
            <PlaylistRow 
              isFavorite 
              item={{ name: "Lagu Disukai", count: favoriteCount, id: 'favs' }} 
              onPress={() => onPlaylistPress?.({ id: 'favs' })}
              colors={colors}
            />
            <View style={[styles.divider, { backgroundColor: colors.background.tertiary }]} />
          </View>
        }
        renderItem={({ item }) => (
          <PlaylistRow 
            item={item} 
            onPress={onPlaylistPress} 
            colors={colors} 
          />
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSection: { paddingTop: 10 },
  actionBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  smallPlusBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(0, 212, 170, 0.1)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },

  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  iconStack: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    // Memberikan efek shadow halus
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 }
    })
  },
  playlistInfo: { flex: 1, marginLeft: 16 },
  playlistName: { fontSize: 16, fontWeight: '600' },
  playlistMeta: { fontSize: 12, marginTop: 4, fontWeight: '500' },
  divider: { height: 1, marginHorizontal: 20, marginVertical: 8, opacity: 0.5 },

  // Empty State Styles
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
