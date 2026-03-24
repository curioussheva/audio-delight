//src/features/library/components/ArtistList.tsx
import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";

interface Artist { name: string; albumCount: number; trackCount: number }
interface Props { artists: Artist[] }

export const ArtistList: React.FC<Props> = ({ artists }) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  return (
    <FlatList
      data={artists}
      keyExtractor={(a) => a.name}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.row, { paddingHorizontal: spacing.md, paddingVertical: spacing.md }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary[500] + "22" }]}>
            <Ionicons name="person" size={22} color={colors.primary[500]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text.primary }]}>{item.name}</Text>
            <Text style={[styles.sub, { color: colors.text.secondary }]}>
              {item.albumCount} album • {item.trackCount} track
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: colors.border.light, marginLeft: 72 }} />
      )}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "600" },
  sub: { fontSize: 12, marginTop: 2 },
});

