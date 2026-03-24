//src/features/library/components/AlbumGrid.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/context/ThemeContext";

const { width } = Dimensions.get("window");
const COLS = 2;
const CARD_SIZE = (width - 48) / COLS;

interface Album { name: string; artist: string; artwork?: string; count: number }
interface Props { albums: Album[] }

export const AlbumGrid: React.FC<Props> = ({ albums }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <FlatList
      data={albums}
      keyExtractor={(a) => `${a.name}__${a.artist}`}
      numColumns={COLS}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
      columnWrapperStyle={{ gap: spacing.md }}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.card, { width: CARD_SIZE, backgroundColor: colors.background.secondary }]}
          activeOpacity={0.8}
        >
          <Image
            source={item.artwork ? { uri: item.artwork } : require("../../../../assets/images/icon.png")}
            style={[styles.art, { width: CARD_SIZE, height: CARD_SIZE }]}
            contentFit="cover"
          />
          <View style={{ padding: spacing.sm }}>
            <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.artist, { color: colors.text.secondary }]} numberOfLines={1}>
              {item.artist}
            </Text>
            <Text style={[styles.count, { color: colors.text.tertiary }]}>
              {item.count} track
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: "hidden" },
  art: {},
  name: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  artist: { fontSize: 12, marginTop: 2 },
  count: { fontSize: 11, marginTop: 2 },
});

