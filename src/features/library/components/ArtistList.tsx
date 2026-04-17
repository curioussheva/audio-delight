import React, { memo, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Play,
  Heart,
  User,
  AudioLines,
  RefreshCw,
  ChevronRight,
  Info, // Import icon Info
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import OnlineMetadataService from "../services/OnlineMetadataService";
import { useSettingsStore } from "@/features/settings/store/settingsStore"; // Import store

// ── Artist Row ───────────────────────────────────────────────────
const ArtistRow = memo(({ item, onPress, colors, enableOnlineImage }: any) => {
  const [usableUri, setUsableUri] = useState<string | null>(
    item.artwork || null,
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (item.artwork) return;

    const fetchOnlineImage = async () => {
      // Hanya fetch jika pengaturan aktif
      if (enableOnlineImage) {
        setIsLoading(true);
        try {
          const result = await OnlineMetadataService.getArtistEnrichment(
            item.name,
          );
          if (isMounted && result.imageUrl) {
            setUsableUri(result.imageUrl);
          }
        } catch (e) {
          console.warn(`[ArtistList] Image fetch failed for ${item.name}:`, e);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }
    };

    fetchOnlineImage();
    return () => {
      isMounted = false;
    };
  }, [item.name, item.artwork, enableOnlineImage]);

  return (
    <TouchableOpacity
      onPress={() => onPress({ ...item, resolvedArtwork: usableUri })}
      activeOpacity={0.7}
      style={styles.artistRow}
    >
      <View style={styles.avatarContainer}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary[500]} />
        ) : usableUri ? (
          <Image
            source={{ uri: usableUri }}
            style={styles.avatarImage}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.avatarFallback,
              { backgroundColor: colors.background.tertiary },
            ]}
          >
            <User size={28} color={colors.text.disabled} />
          </View>
        )}
      </View>

      <View style={styles.artistInfo}>
        <Text
          style={[styles.artistName, { color: colors.text.primary }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[styles.artistMeta, { color: colors.text.tertiary }]}>
          {item.trackCount} lagu • {item.albumCount} album
        </Text>
      </View>

      <ChevronRight size={18} color={colors.background.tertiary} />
    </TouchableOpacity>
  );
});

// ── Artist Song Row (Detail Item) ─────────────────────────────────────────────
const ArtistSongRow = memo(
  ({
    track,
    isNowPlaying,
    isFavorite,
    onPress,
    onToggleFavorite,
    colors,
  }: any) => {
    const router = useRouter();

    const handleLongPress = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/song/[id]", params: { id: track.id } });
    };

    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        style={[
          styles.songRow,
          isNowPlaying && { backgroundColor: `${colors.primary[500]}15` },
        ]}
      >
        <View style={styles.songLeading}>
          {isNowPlaying ? (
            <AudioLines size={18} color={colors.primary[500]} />
          ) : (
            <User size={16} color={colors.text.disabled} />
          )}
        </View>

        <View style={styles.songMain}>
          <View style={styles.songTitleRow}>
            <Text
              style={[
                styles.songTitle,
                {
                  color: isNowPlaying
                    ? colors.primary[500]
                    : colors.text.primary,
                },
              ]}
              numberOfLines={1}
            >
              {track.title}
            </Text>
            <QualityBadge sampleRate={track.sampleRate} codec={track.codec} />
          </View>
          <Text
            style={[styles.songAlbum, { color: colors.text.tertiary }]}
            numberOfLines={1}
          >
            {track.album || "Unknown Album"}
          </Text>
        </View>

        <View style={styles.songTrailing}>
          <TouchableOpacity
            onPress={onToggleFavorite}
            style={styles.favBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Heart
              size={18}
              color={isFavorite ? colors.status.error : colors.text.disabled}
              fill={isFavorite ? colors.status.error : "transparent"}
            />
          </TouchableOpacity>
          <Text style={[styles.duration, { color: colors.text.disabled }]}>
            {formatTime(track.duration)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

// ── Main ArtistList ──────────────────────────────────────────────────────────
export const ArtistList: React.FC<any> = ({
  tracks,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const [selectedArtist, setSelectedArtist] = useState<any>(null);

  // Ambil state dari Settings Store
  const { enableOnlineArtistImage } = useSettingsStore();

  const handleScanMetadata = () => {
    if (!enableOnlineArtistImage) {
      // Feedback Haptic Error jika mencoba menekan saat disabled
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Fitur Dinonaktifkan",
        "Pencarian metadata online saat ini mati. Silakan aktifkan 'Online Artist Metadata' di menu Settings > Library untuk menggunakan fitur ini.",
        [{ text: "Mengerti" }],
      );
      return;
    }

    // Jika Aktif: Jalankan Notifikasi & Logic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Metadata Scan",
      "Pencarian foto dan bio artis sedang diproses di latar belakang via MusicBrainz.",
      [{ text: "OK" }],
    );

    // Logic batch scan kamu...
    // OnlineMetadataService.enhanceMultipleArtists(enrichedArtists.map(a => a.name))
  };

  const enrichedArtists = useMemo(() => {
    const map = new Map<string, any>();
    tracks.forEach((track: MediaTrack) => {
      const name = track.artist || "Unknown Artist";
      if (!map.has(name)) {
        map.set(name, {
          name,
          trackCount: 0,
          albums: new Set(),
          artwork: track.artwork,
        });
      }
      const entry = map.get(name);
      entry.trackCount += 1;
      if (track.album) entry.albums.add(track.album);
    });

    return Array.from(map.values())
      .map((a) => ({ ...a, albumCount: a.albums.size }))
      .sort((a, b) => {
        if (a.name === "Unknown Artist") return 1;
        if (b.name === "Unknown Artist") return -1;
        return a.name.localeCompare(b.name);
      });
  }, [tracks]);

  // Render detail view (jika artis dipilih)
  if (selectedArtist) {
    const filteredSongs = tracks
      .filter(
        (t: MediaTrack) =>
          (t.artist || "Unknown Artist") === selectedArtist.name,
      )
      .sort((a: any, b: any) =>
        a.album === b.album
          ? (a.trackNumber || 0) - (b.trackNumber || 0)
          : (a.album || "").localeCompare(b.album || ""),
      );

    const heroImage = selectedArtist.resolvedArtwork || selectedArtist.artwork;

    return (
      <View
        style={[
          styles.detailContainer,
          { backgroundColor: colors.background.primary },
        ]}
      >
        <View
          style={[
            styles.navBar,
            { paddingTop: Platform.OS === "ios" ? 50 : 20 },
          ]}
        >
          <TouchableOpacity
            onPress={() => setSelectedArtist(null)}
            style={styles.backBtn}
          >
            <ChevronLeft size={30} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.headerHero}>
              <View style={styles.avatarLargeContainer}>
                {heroImage ? (
                  <Image
                    source={{ uri: heroImage }}
                    style={styles.avatarLarge}
                    contentFit="cover"
                    transition={300}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarLargeFallback,
                      { backgroundColor: colors.background.tertiary },
                    ]}
                  >
                    <User size={60} color={colors.text.disabled} />
                  </View>
                )}
              </View>
              <Text
                style={[styles.headerTitle, { color: colors.text.primary }]}
              >
                {selectedArtist.name}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.playBtn,
                    { backgroundColor: colors.primary[500] },
                  ]}
                  onPress={() => onSongPress(filteredSongs[0], filteredSongs)}
                >
                  <Play size={20} color="#FFF" fill="#FFF" />
                  <Text style={styles.playBtnText}>PLAY ALL</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <ArtistSongRow
              track={item}
              isNowPlaying={item.id === currentTrackId}
              isFavorite={favoriteIds.has(item.id)}
              onPress={() => onSongPress(item, filteredSongs)}
              onToggleFavorite={() => onToggleFavorite?.(item.id)}
              colors={colors}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      </View>
    );
  }

  // Render main list
  return (
    <View style={{ flex: 1 }}>
      {/* Header Scan yang dinamis */}
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.scanHeader,
          {
            backgroundColor: enableOnlineArtistImage
              ? `${colors.primary[500]}15`
              : colors.background.tertiary,
            opacity: enableOnlineArtistImage ? 1 : 0.7,
          },
        ]}
        onPress={handleScanMetadata}
      >
        <RefreshCw
          size={16}
          color={
            enableOnlineArtistImage ? colors.primary[500] : colors.text.disabled
          }
        />
        <Text
          style={[
            styles.scanText,
            {
              color: enableOnlineArtistImage
                ? colors.primary[500]
                : colors.text.disabled,
            },
          ]}
        >
          {enableOnlineArtistImage
            ? "Scan Artist Metadata"
            : "Metadata Scan Disabled"}
        </Text>
      </TouchableOpacity>

      {/* Info Box jika disabled */}
      {!enableOnlineArtistImage && (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: `${colors.background.tertiary}50`,
              marginHorizontal: 16,
            },
          ]}
        >
          <Info size={14} color={colors.text.tertiary} />
          <Text style={[styles.infoText, { color: colors.text.tertiary }]}>
            Aktifkan "Online Artist Metadata" di pengaturan untuk mengunduh foto
            artis secara otomatis.
          </Text>
        </View>
      )}

      <FlatList
        data={enrichedArtists}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ArtistRow
            item={item}
            onPress={setSelectedArtist}
            colors={colors}
            enableOnlineImage={enableOnlineArtistImage}
          />
        )}
        ItemSeparatorComponent={() => (
          <View
            style={[
              styles.separator,
              { backgroundColor: colors.background.tertiary },
            ]}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  artistInfo: { flex: 1, marginLeft: 16 },
  artistName: { fontSize: 16, fontWeight: "700" },
  artistMeta: { fontSize: 12, marginTop: 2 },
  separator: { height: 1, marginLeft: 66 },
  detailContainer: { flex: 1 },
  navBar: { paddingHorizontal: 8, zIndex: 10 },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerHero: { alignItems: "center", padding: 20 },
  avatarLargeContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: "hidden",
    marginBottom: 20,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  avatarLarge: { width: "100%", height: "100%" },
  avatarLargeFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  headerMeta: { fontSize: 13, marginTop: 6, letterSpacing: 1 },
  actionRow: { marginTop: 25, width: "100%", paddingHorizontal: 20 },
  playBtn: {
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  playBtnText: { color: "#FFF", fontWeight: "800", letterSpacing: 1 },

  songRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  songLeading: { width: 30 },
  songMain: { flex: 1, marginLeft: 10, marginRight: 10 },
  songTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  songTitle: { fontSize: 15, fontWeight: "600", flex: 1 },
  songAlbum: { fontSize: 12, marginTop: 4 },
  songTrailing: { alignItems: "flex-end" },
  favBtn: { padding: 5 },
  duration: { fontSize: 11, marginTop: 4, opacity: 0.6 },
  scanHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  scanText: { fontWeight: "700", fontSize: 13 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  infoText: { fontSize: 11, flex: 1, lineHeight: 14 },
});
