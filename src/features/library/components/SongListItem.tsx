import React, { memo } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import QualityBadge from '@/shared/components/ui/QualityBadge';
import { formatTime } from '@/shared/utils/time';
import { Song } from '@/shared/types/audio';

// ← Import Lucide Icons
import {
  Music,           // musical-note
  BarChart3,       // stats-chart (untuk now playing)
  Heart,           // heart / heart-outline
} from 'lucide-react-native';

interface SongListItemProps {
  item: Song;
  isNowPlaying: boolean;
  isFavorite: boolean;
  colors: any;
  onPress: (song: Song) => void;
  onToggleFavorite: (id: string) => void;
}

export const SongListItem = memo(({
  item,
  isNowPlaying,
  isFavorite,
  colors,
  onPress,
  onToggleFavorite,
}: SongListItemProps) => {

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(item);
  };

  const handleFavoritePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggleFavorite(item.id);
  };

  return (
    <TouchableOpacity
      style={[
        styles.songCard,
        isNowPlaying && { backgroundColor: colors.background.tertiary },
      ]}
      onPress={handlePress}
      activeOpacity={0.6}
    >
      {/* Artwork Section */}
      <View
        style={[
          styles.artworkPlaceholder,
          {
            backgroundColor: isNowPlaying
              ? `${colors.primary[500]}20`
              : colors.background.secondary,
          },
        ]}
      >
        {isNowPlaying ? (
          <BarChart3
            size={22}
            color={colors.primary[500]}
            strokeWidth={2.5}
          />
        ) : (
          <Music
            size={22}
            color={colors.text.tertiary}
            strokeWidth={2.2}
          />
        )}
      </View>

      {/* Info Section */}
      <View style={styles.songInfo}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.songTitle,
              { color: isNowPlaying ? colors.primary[500] : colors.text.primary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>

          {(item.sampleRate || item.codec) && (
            <QualityBadge
              sampleRate={item.sampleRate}
              codec={item.codec}
            />
          )}
        </View>

        <Text
          style={[styles.songArtist, { color: colors.text.secondary }]}
          numberOfLines={1}
        >
          {item.artist} <Text style={{ color: colors.text.tertiary }}>•</Text> {item.album || "Unknown Album"}
        </Text>
      </View>

      {/* Actions Section */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          onPress={handleFavoritePress}
          style={styles.favoriteBtn}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Heart
            size={20}
            color={isFavorite ? colors.status.error : colors.text.tertiary}
            strokeWidth={isFavorite ? 0 : 2.5}
            fill={isFavorite ? colors.status.error : "transparent"}
          />
        </TouchableOpacity>

        <Text style={[styles.durationText, { color: colors.text.tertiary }]}>
          {formatTime(item.duration || 0)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isNowPlaying === nextProps.isNowPlaying &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.colors === nextProps.colors
  );
});

const styles = StyleSheet.create({
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 72,
  },
  artworkPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  songInfo: {
    flex: 1,
    marginHorizontal: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'space-between',
  },
  songTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 4,
  },
  songArtist: {
    fontSize: 13,
    marginTop: 1,
  },
  rightActions: {
    alignItems: "flex-end",
    justifyContent: 'center',
    height: '100%',
  },
  favoriteBtn: {
    padding: 4,
  },
  durationText: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    marginTop: 2,
  },
}); 