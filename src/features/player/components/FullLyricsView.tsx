import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, FlatList, Dimensions } from "react-native";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";

const { height } = Dimensions.get("window");

export const FullLyricsView = () => {
  const { lyrics, position: progress } = usePlayerStore();
  const { colors } = useTheme().theme;

  // Warna lirik dari token tema, diukur di atas background.primary.
  //
  // KENAPA PANEL SOLID: lirik dirender di atas gradien layar player
  // (LinearGradient absoluteFill, emas->navy di Noir) — tidak ada SATU
  // warna teks pun yang lolos 4,5 di sepanjang gradien itu (text.primary
  // saja 2,97:1 di ujung atas Noir). Jadi kotak lirik diberi latar
  // background.primary sendiri, seperti kotak artwork yang digantikannya;
  // angka di bawah terukur di atas latar itu, bukan di atas gradien.
  //
  // Aktif: aksen tema selama terbaca, jatuh ke text.primary bila tidak.
  // Non-aktif: text.tertiary. Empty: text.secondary.
  // Noir: aktif 11,64 / non-aktif 5,34 / empty 10,38.
  // Porcelain: aktif 5,77 / non-aktif 5,03 / empty 8,20.
  // Lolos AA 4,5:1 di 22/22 tema (diukur rumus contrast.ts).
  const activeColor = accentOn(
    [colors.accent.primary],
    colors.background.primary,
    [colors.text.primary],
  );

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
            isActive
              ? {
                  color: activeColor,
                  // Glow sewarna baris aktif (warna tema selalu #RRGGBB).
                  textShadowColor: `${activeColor}66`,
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 15,
                }
              : { color: colors.text.tertiary },
          ]}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  if (!lyrics.length) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: colors.background.primary },
        ]}
      >
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>
          Instrumental or No Lyrics Found
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
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
  // Panel solid senada kotak artwork (lihat komentar di atas soal gradien).
  container: { flex: 1, borderRadius: 16, overflow: "hidden" },
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    overflow: "hidden",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
