// Di src/components/audio/QueueManager.tsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import DraggableFlatList from "react-native-draggable-flatlist";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { Song } from "@/shared/types/audio";
import { formatTime } from "@/shared/utils/time";

interface QueueManagerProps {
  onClose: () => void;
  visible: boolean;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  onClose: _onClose,
  visible,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const { queue, currentSong, setQueue } = usePlayerStore();
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;

  const handleReorder = (data: Song[]) => {
    setQueue(data);
  };

  const handleRemove = (index: number) => {
    const newQueue = [...queue];
    newQueue.splice(index, 1);
    setQueue(newQueue);
  };

  const renderQueueItem = ({ item, index, drag, isActive }: any) => {
    const isCurrent = currentSong?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.queueItem,
          {
            backgroundColor: isActive
              ? colors.background.tertiary
              : isCurrent
                ? colors.primary[500] + "20"
                : "transparent",
            padding: spacing.sm,
            borderRadius: 8,
            marginBottom: spacing.xs,
          },
        ]}
        onLongPress={drag}
        disabled={isActive}
      >
        <View
          style={[
            styles.queueItemContent,
            { flexDirection: "row", alignItems: "center" },
          ]}
        >
          <View style={{ width: 30, alignItems: "center" }}>
            {isCurrent && (
              <Ionicons
                name="volume-high"
                size={16}
                color={colors.primary[500]}
              />
            )}
          </View>

          <View
            style={[
              styles.queueInfo,
              { flex: 1, marginHorizontal: spacing.sm },
            ]}
          >
            <Text
              style={[
                styles.queueTitle,
                {
                  color: isCurrent ? colors.primary[500] : colors.text.primary,
                  fontWeight: isCurrent ? "600" : "400",
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[styles.queueArtist, { color: colors.text.secondary }]}
              numberOfLines={1}
            >
              {item.artist}
            </Text>
          </View>

          <Text style={[styles.queueDuration, { color: colors.text.tertiary }]}>
            {formatTime(item.duration)}
          </Text>

          <TouchableOpacity
            onPress={() => handleRemove(index)}
            style={{ marginLeft: spacing.sm }}
          >
            <Ionicons name="close" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          <Ionicons
            name="reorder-three"
            size={20}
            color={colors.text.secondary}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background.secondary },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.header,
          {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: spacing.md,
          },
        ]}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Up Next ({queue.length})
        </Text>
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-up"}
          size={20}
          color={colors.text.secondary}
        />
      </TouchableOpacity>

      {expanded && (
        <DraggableFlatList
          data={queue}
          keyExtractor={(item) => item.id}
          renderItem={renderQueueItem}
          onDragEnd={({ data }) => handleReorder(data)}
          contentContainerStyle={{ padding: spacing.md }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // style di-inline via props
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  // QueueManager specific
  queueItem: {
    // style di-inline
  },
  queueItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  queueInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  queueArtist: {
    fontSize: 12,
  },
  queueDuration: {
    fontSize: 12,
  },
  // PlaybackSpeed specific
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  preset: {
    borderRadius: 20,
  },
  currentSpeed: {
    fontSize: 14,
    fontWeight: "600",
  },
  // SleepTimer specific
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  option: {
    borderRadius: 20,
  },
  activeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // SongMetadata specific
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  meta: {
    fontSize: 12,
    marginRight: 8,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  formatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  format: {
    fontSize: 12,
  },
  bitrate: {
    fontSize: 12,
    fontWeight: "500",
  },
});
