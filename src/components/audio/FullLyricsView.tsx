import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Dimensions } from "react-native";
import { usePlayerStore } from "@/store/playerStore";

const { height } = Dimensions.get("window");

export const FullLyricsView = () => {
  const { lyrics, position: progress } = usePlayerStore();

  const flatListRef = useRef<FlatList>(null);

  // Temukan index lirik yang sedang aktif
  const activeIndex = lyrics.findIndex((line, index) => {
    const nextLine = lyrics[index + 1];
    return progress >= line.time && (!nextLine || progress < nextLine.time);
  });

  // Auto-scroll lirik ke tengah layar saat berganti baris
  useEffect(() => {
    if (activeIndex !== -1) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex,
        viewPosition: 0.5, // Taruh di tengah layar
        animated: true,
      });
    }
  }, [activeIndex]);

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isActive = index === activeIndex;

    return (
      <View style={styles.lineWrapper}>
        <Text
          style={[
            styles.lyricText,
            isActive ? styles.activeText : styles.inactiveText,
          ]}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  if (!lyrics.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Instrumental or No Lyrics Found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={lyrics}
        keyExtractor={(item) => item.time.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Mencegah error jika scroll cepat
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingVertical: height / 2.5, // Ruang kosong agar lirik awal bisa di tengah
    paddingHorizontal: 30,
  },
  lineWrapper: {
    marginVertical: 12,
  },
  lyricText: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "left",
  },
  activeText: {
    color: "#00D4AA", // Teal Akses (Karaoke Style)
    textShadowColor: "rgba(0, 212, 170, 0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  inactiveText: {
    color: "rgba(255, 255, 255, 0.2)", // Redup jika bukan baris aktif
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 16,
    fontWeight: "600",
  },
});
