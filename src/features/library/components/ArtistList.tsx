import React, { memo, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
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
  ChevronRight,
} from "lucide-react-native";

import { useTheme } from "@/shared/context/ThemeContext";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import type { MediaTrack } from "../store/libraryStore";
import { formatTime } from "@/shared/utils/time";
import { DURATION_FONT_FAMILY } from "@/shared/utils/typography";
import QualityBadge from "@/shared/components/ui/QualityBadge";

// ── Artist Row ───────────────────────────────────────────────────
// I2-revisi: TIDAK ada fetch online di sini lagi — foto artis hanya dari
// artwork lokal (atau cache yang diterapkan lewat [id].tsx). Tanpa
// artwork, tampil ikon User (fallback) seperti sebelumnya.
const ArtistRow = memo(({ item, onPress, colors }: any) => {
  const usableUri = item.artwork || null;

  return (
    <TouchableOpacity
      onPress={() => onPress({ ...item, resolvedArtwork: usableUri })}
      activeOpacity={0.7}
      style={styles.artistRow}
    >
      <View style={styles.avatarContainer}>
        {usableUri ? (
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
            <QualityBadge
              sampleRate={track.sampleRate}
              bitDepth={track.bitDepth}
              codec={track.codec}
            />
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
// U-P1-18 (bonus): prop `artists` yang dikirim library.tsx dipakai bila
// diberikan (artists = hasil selectArtists, bentuknya sama dengan turunan
// internal), dengan fallback ke turunan dari tracks bila tidak diberikan.
// I2-revisi: prop `enableOnlineArtistImage` + header "Scan Artist
// Metadata" DIHAPUS — tidak ada fetch online di tab ini lagi; online
// hanya di [id].tsx.
interface ArtistListProps {
  tracks: MediaTrack[];
  artists?: Array<{
    id: string;
    name: string;
    trackCount: number;
    albumCount: number;
    artwork?: string;
    duration: number;
  }>;
  currentTrackId?: string;
  favoriteIds?: Set<string>;
  onSongPress: (track: MediaTrack, queue: MediaTrack[]) => void;
  onToggleFavorite?: (songId: string) => void | Promise<boolean>;
}

export const ArtistList: React.FC<ArtistListProps> = ({
  tracks,
  artists,
  currentTrackId,
  favoriteIds = new Set(),
  onSongPress,
  onToggleFavorite,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;

  // Teks/ikon di atas tombol primary[500] — dipilih dari luminansi primary
  // (putih 2,24:1 di Noir, hitam 9,37:1), bukan hardcoded "#FFF".
  const onPrimary =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  const [selectedArtist, setSelectedArtist] = useState<any>(null);

  const enrichedArtists = useMemo(() => {
    const unknownLast = (a: { name: string }, b: { name: string }) => {
      if (a.name === "Unknown Artist") return 1;
      if (b.name === "Unknown Artist") return -1;
      return a.name.localeCompare(b.name);
    };

    // U-P1-18 (bonus): pakai `artists` dari pemanggil bila ada — bentuknya
    // sama dengan turunan internal (sudah ada albumCount). Urutan
    // dipertahankan sama (Unknown Artist terakhir).
    if (artists) return [...artists].sort(unknownLast);

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
      .sort(unknownLast);
  }, [artists, tracks]);

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
          {/* U-P2-09: back berlabel, sama seperti Folder/Format/Genre —
              dulu ikon saja tanpa label. */}
          <TouchableOpacity
            onPress={() => setSelectedArtist(null)}
            style={styles.backBtn}
          >
            <ChevronLeft size={24} color={colors.primary[500]} />
            <Text style={[styles.backLabel, { color: colors.primary[500] }]}>
              Artists
            </Text>
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
                  // U-P2-09: guard antrean kosong — tanpa ini filteredSongs
                  // yang sempat kosong memanggil playSong(undefined, []).
                  onPress={() => {
                    if (filteredSongs.length > 0)
                      onSongPress(filteredSongs[0], filteredSongs);
                  }}
                >
                  <Play size={20} color={onPrimary} fill={onPrimary} />
                  <Text style={[styles.playBtnText, { color: onPrimary }]}>
                    PLAY ALL
                  </Text>
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
      <FlatList
        data={enrichedArtists}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ArtistRow
            item={item}
            onPress={setSelectedArtist}
            colors={colors}
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
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    justifyContent: "flex-start",
    paddingHorizontal: 8,
  },
  backLabel: { fontSize: 16, fontWeight: "600", marginLeft: 4 },
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
  // U-P2-04: tanpa `color` — warna teks selalu di-overide inline dengan
  // onPrimary (pickReadable atas primary[500]) di pemakaian style ini.
  playBtnText: { fontWeight: "800", letterSpacing: 1 },

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
  duration: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.6,
    // U-P2-09: satu font durasi bersama (baris ini dulu tanpa fontFamily).
    fontFamily: DURATION_FONT_FAMILY,
  },
});
