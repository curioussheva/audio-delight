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
import * as Haptics from "expo-haptics";
import { Song } from "@/shared/types/audio";
import { formatTime } from "@/shared/utils/time";
import QualityBadge from "@/shared/components/ui/QualityBadge";
import { Music2, AudioLines, Heart } from "lucide-react-native";

interface SongListItemProps {
  item: Song;
  isNowPlaying: boolean;
  isFavorite: boolean;
  colors: any;
  onPress: (song: Song) => void;
  onToggleFavorite: (id: string) => void;
  onMorePress?: (song: Song) => void;
}

// ─── Artwork Thumbnail ────────────────────────────────────────────────────────

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
    const showImage = !!uri && !imgError && !isNowPlaying;

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
            color={colors.background.primary}
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
            onError={() => setImgError(true)}
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
    onMorePress,
  }: SongListItemProps) => {
    const handlePress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress(item);
    };

    return (
      <TouchableOpacity
        style={[
          styles.container,
          isNowPlaying && { backgroundColor: `${colors.primary[500]}10` },
        ]}
        onPress={handlePress}
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
              codec={item.codec}
              isHiRes={item.isHiRes}
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
            {item.bitDepth > 0 ? item.bitDepth : 16}bit
            {" | "}
            {item.sampleRate > 0 ? (item.sampleRate / 1000).toFixed(1) : "44.1"}
            kHz
          </Text>
        </View>

        {/* 3. Right Section — rata atas */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onToggleFavorite(item.id)}
            style={styles.iconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Heart
              size={17}
              color={isFavorite ? colors.status.error : colors.text.tertiary}
              fill={isFavorite ? colors.status.error : "transparent"}
              strokeWidth={isFavorite ? 0 : 2}
            />
          </TouchableOpacity>
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
    prev.colors.primary[500] === next.colors.primary[500],
);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start", // ← seluruh row rata atas
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 2,
  },

  // Artwork
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
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
    fontWeight: "600",
    flexShrink: 1,
    marginRight: 6,
  },
  subText: {
    fontSize: 12,
  },
  techInfo: {
    fontSize: 10,
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
  iconButton: {
    padding: 2,
  },
  duration: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
