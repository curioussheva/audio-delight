// src/features/library/components/SongListItem.tsx
import React, { memo, useState } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Song } from "@/shared/types/audio";
import { formatTime } from "@/shared/utils/time";
import { DURATION_FONT_FAMILY } from "@/shared/utils/typography";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import { pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { Music2, AudioLines, Heart, X } from "lucide-react-native";

interface SongListItemProps {
  item: Song;
  isNowPlaying: boolean;
  isFavorite: boolean;
  colors: any;
  onPress: (song: Song) => void;
  onToggleFavorite: (id: string) => void;
  // Item CRUD playlist (Opsi A): bila diisi, tombol × muncul di samping
  // hati. Tidak diisi (mis. daftar Library) → tampilan sama seperti dulu.
  onRemove?: (song: Song) => void;
}

// ─── Artwork Thumbnail ────────────────────────────────────────────────────────

// Lazyload-fix (butir 3): negative cache URI artwork gagal, level modul.
// `imgError` saja adalah state per-mount — URI artwork yang rusak dicoba
// lagi tiap baris masuk viewport saat fling (log: MediaMetadataRetriever
// "negative length" 9× untuk URI yang sama; ExpoImage gagal 34×).
// URI yang sekali terbukti gagal TIDAK dicoba lagi sampai restart app
// (scope sesi). Alternatif yang sengaja TIDAK diambil: TTL/eviction —
// artwork yang gagal karena file rusak tidak akan pulih dalam satu sesi;
// bila URI gagal karena file belum ada lalu muncul kemudian, restart app
// diperlukan (bukan ditebak).
const failedArtworkUris = new Set<string>();

const ArtworkThumb = memo(
  ({
    uri,
    isNowPlaying,
    colors,
  }: {
    uri?: string | null;
    isNowPlaying: boolean;
    colors: any;
  }) => {
    const [imgError, setImgError] = useState(false);
    // Lewati URI yang sudah terbukti gagal (negative cache) — jangan
    // coba lagi tiap remount saat fling.
    const showImage =
      !!uri &&
      !imgError &&
      !isNowPlaying &&
      !(uri && failedArtworkUris.has(uri));

    // Ikon di atas thumb primary[500] (lagu sedang diputar) — dipilih dari
    // luminansi primary (background.primary 1,12:1 di charcoal-black),
    // bukan warna latar mentah.
    const onPrimary =
      pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
      "#FFFFFF";

    if (isNowPlaying) {
      return (
        <View
          style={[
            styles.artworkContainer,
            { backgroundColor: colors.primary[500] },
          ]}
        >
          <AudioLines
            size={20}
            color={onPrimary}
            strokeWidth={2.5}
          />
        </View>
      );
    }

    if (showImage) {
      return (
        <View style={styles.artworkContainer}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => {
              // Catat URI gagal ke negative cache supaya remount
              // berikutnya (fling) tidak mencoba lagi.
              if (uri) failedArtworkUris.add(uri);
              setImgError(true);
            }}
          />
        </View>
      );
    }

    return (
      <View
        style={[
          styles.artworkContainer,
          { backgroundColor: colors.background.secondary },
        ]}
      >
        <Music2 size={20} color={colors.text.tertiary} strokeWidth={1.5} />
      </View>
    );
  },
);

// ─── SongListItem ─────────────────────────────────────────────────────────────

export const SongListItem = memo(
  ({
    item,
    isNowPlaying,
    isFavorite,
    colors,
    onPress,
    onToggleFavorite,
    onRemove,
  }: SongListItemProps) => {
    const router = useRouter();

    const handlePress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress(item);
    };

    // U-P2-09: long-press → Song Detail, pola yang sama dengan
    // ArtistSongRow — dulu hanya ArtistSongRow yang punya jalan ini.
    const handleLongPress = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: "/song/[id]", params: { id: item.id } });
    };

    return (
      <TouchableOpacity
        style={[
          styles.container,
          isNowPlaying && { backgroundColor: `${colors.primary[500]}10` },
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        {/* 1. Artwork / Now Playing Indicator */}
        <ArtworkThumb
          uri={item.artwork}
          isNowPlaying={isNowPlaying}
          colors={colors}
        />

        {/* 2. Main Info — 3 baris */}
        <View style={styles.infoContent}>
          {/* Baris 1: Title + QualityBadge */}
          <View style={styles.topRow}>
            <Text
              style={[
                styles.title,
                {
                  color: isNowPlaying
                    ? colors.primary[500]
                    : colors.text.primary,
                },
              ]}
              numberOfLines={1}
            >
              {item.title || item.filename}
            </Text>
            <QualityBadge
              sampleRate={item.sampleRate}
              bitDepth={item.bitDepth}
              codec={item.codec}
            />
          </View>

          {/* Baris 2: Artist • Album */}
          <Text
            style={[styles.subText, { color: colors.text.secondary }]}
            numberOfLines={1}
          >
            {item.artist}
            <Text style={{ opacity: 0.4 }}> • </Text>
            {item.album}
          </Text>

          {/* Baris 3: Technical info */}
          <Text style={[styles.techInfo, { color: colors.text.tertiary }]}>
            {item.codec?.toUpperCase()}
            {" | "}
            {/* Tanpa data jangan klaim terukur (U-P1-05): dulu bitDepth
                kosong tampil "16bit" dan sampleRate kosong "44.1 kHz". */}
            {item.bitDepth > 0 ? `${item.bitDepth}bit` : "-"}
            {" | "}
            {item.sampleRate > 0
              ? `${(item.sampleRate / 1000).toFixed(1)} kHz`
              : "-"}
          </Text>
        </View>

        {/* 3. Right Section — rata atas */}
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => onToggleFavorite(item.id)}
              style={styles.iconButton}
              // U-P2-01: ikon 17 + padding 2 + hitSlop 8 lama = ±37dp.
              // hitSlop 12 → 17 + 4 + 24 = 45dp.
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={
                isFavorite ? "Hapus dari favorit" : "Tambah ke favorit"
              }
            >
              <Heart
                size={17}
                color={isFavorite ? colors.status.error : colors.text.tertiary}
                fill={isFavorite ? colors.status.error : "transparent"}
                strokeWidth={isFavorite ? 0 : 2}
              />
            </TouchableOpacity>
            {/* Item CRUD playlist: tombol × hanya bila onRemove diisi. */}
            {onRemove ? (
              <TouchableOpacity
                onPress={() => onRemove(item)}
                style={styles.iconButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Hapus dari playlist"
              >
                <X size={17} color={colors.text.tertiary} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.duration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  // Custom equality — cegah re-render yang tidak perlu
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.artwork === next.item.artwork &&
    prev.isNowPlaying === next.isNowPlaying &&
    prev.isFavorite === next.isFavorite &&
    prev.onRemove === next.onRemove &&
    prev.colors.primary[500] === next.colors.primary[500],
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start", // ← seluruh row rata atas
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BASE_RADIUS.md,
    marginVertical: 2,
  },

  // Artwork
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: BASE_RADIUS.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2, // sedikit offset agar sejajar dengan baris 1 teks
  },

  // Info area
  infoContent: {
    flex: 1,
    marginLeft: 12,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.semiBold,
    flexShrink: 1,
    marginRight: 6,
  },
  subText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
  },
  techInfo: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.regular,
    letterSpacing: 0.2,
  },

  // Right actions — rata atas
  actions: {
    alignItems: "flex-end", // ← rata atas, bukan center
    justifyContent: "flex-start",
    marginLeft: 8,
    paddingTop: 2,
    gap: 6,
  },
  // Hati + × (bila ada) berdampingan di baris atas.
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 2,
  },
  duration: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    // U-P2-09: satu font durasi bersama.
    fontFamily: DURATION_FONT_FAMILY,
  },
});
