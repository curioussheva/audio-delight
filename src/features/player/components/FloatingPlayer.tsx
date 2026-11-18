// src/features/player/components/FloatingPlayer.tsx
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

import { GestureDetector, Gesture } from "react-native-gesture-handler";

import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
} from "lucide-react-native";

import { usePlayerStore } from "@/features/player/store/playerStore";
import { progressPercent } from "@/shared/utils/queueNavigation";
import { isHiRes } from "@/shared/utils/audioQuality";
import { pickReadable, parseHex, AA_NORMAL } from "@/shared/utils/contrast";
import { useTheme } from "@/shared/context/ThemeContext";

const PLACEHOLDER = require("../../../../assets/images/icon.png");

// ON/OFF Shuffle/Repeat — latar disc ON = tint primary 15% di atas pill
// (pola "selected" yang sama dengan layar Player d0ddf23d, ControlKnob,
// ReverbDropdown). Nama + rumus sama supaya dedup di masa depan tinggal
// pindah ke shared. parseHex mengembalikan null untuk hex yang tidak
// terbaca → fallback ke warna aslinya (tanpa tint), bukan hitam buta.
const hexToRGBA = (hex: string, opacity: number): string => {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

export default function FloatingPlayer() {
  const { theme } = useTheme();
  const { colors, shadows } = theme;
  const router = useRouter();

    const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);

  const translateX = useSharedValue(0);

  // Progress bar untuk FloatingPlayer.
  //
  // Sebelumnya memakai useAnimatedStyle yang membaca `position`/`duration`
  // dari React state DI LUAR worklet. Worklet Reanimated tidak ikut re-render
  // saat state berubah, jadi lebarnya bisa beku walau posisi audio jalan.
  //
  // Perbaikannya: nilai progress disimpan di shared value sendiri, dan
  // di-update lewat useEffect setiap kali state benar-benar berubah. Worklet
  // hanya membaca shared value - itu reaktif dengan benar.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(progressPercent(position, duration) / 100, {
      duration: 200,
    });
  }, [position, duration, progress]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > 80) runOnJS(playPrevious)();
      else if (e.translationX < -80) runOnJS(playNext)();
      translateX.value = withSpring(0);
    });

  const animatedProgress = useAnimatedStyle(() => {
    return { width: `${progress.value * 100}%` };
  });

  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(translateX.value, { damping: 20 }) }],
    opacity: withTiming(Math.abs(translateX.value) > 20 ? 0.75 : 1),
  }));

  // U-P2-14: ikon Play/Pause di atas primary[500] dulu memakai
  // colors.text.inverse — lolos di 2 tema brand (Noir 8,09, Porcelain
  // 5,77) tapi 18 tema lain belum terukur. Standarkan ke pickReadable
  // seperti player utama: warna dipilih dari luminansi primary[500]
  // per tema, jadi ambang AA dijamin, bukan ditebak.
  const playIconColor =
    pickReadable(["#FFFFFF", "#000000"], colors.primary[500], AA_NORMAL) ??
    "#FFFFFF";

  // ON/OFF Shuffle/Repeat — SATU mekanisme dengan layar Player (d0ddf23d):
  // ON = ikon primary[500] + disc tint 15% + stroke 2.5 ("bold"); OFF =
  // ikon text.tertiary polos tanpa latar + stroke 2. Status terbaca dari
  // bentuk (ada/tidak ada disc) + bobot, bukan hanya warna. repeatOn
  // dipakai ikon Repeat (warna + disc + stroke) dan accessibilityState.
  const repeatOn = repeat !== "off";
  const toggleOnBackground = hexToRGBA(colors.primary[500], 0.15);

  // ✅ Hanya sembunyikan kalau tidak ada lagu — isFocused DIHAPUS
  //    TabsLayout yang handle visibility per tab
  if (!currentSong) return null;

  const artworkSource = currentSong.artwork
    ? { uri: currentSong.artwork }
    : PLACEHOLDER;

  return (
    // ✅ outer TIDAK punya position absolute / bottom — TabsLayout yang atur
    <GestureDetector gesture={swipeGesture}>
      <Animated.View
        style={[
          s.wrapper,
          {
            backgroundColor: colors.background.elevated,
            // U-P2-13: dulu fallback border "#ffffff20" hardcoded — di
            // tema terang garisnya nyaris tak terlihat di atas elevated
            // putih. Fallback sekarang token tema (background.tertiary).
            borderColor:
              colors.border?.light ?? colors.background.tertiary,
            ...shadows?.xl,
          },
          animatedContainer,
        ]}
      >
        {/* Accent line */}
        <View
          style={[s.accentLine, { backgroundColor: colors.primary[500] }]}
        />

        {/* Progress bar */}
        <View
          style={[
            s.progressBg,
            { backgroundColor: colors.background.tertiary },
          ]}
        >
          <Animated.View
            style={[
              s.progressFill,
              { backgroundColor: colors.primary[400] },
              animatedProgress,
            ]}
          />
        </View>

        {/* Content */}
        <View style={s.content}>
          {/* Artwork */}
          <Pressable onPress={() => router.push("/player")}>
            <Image
              source={artworkSource}
              style={[
                s.artwork,
                { backgroundColor: colors.background.tertiary },
              ]}
              contentFit="cover"
              transition={300}
            />
          </Pressable>

          {/* Info */}
          <Pressable
            style={s.info}
            onPress={() => router.push("/player")}
          >
            <Text
              style={[s.title, { color: colors.text.primary }]}
              numberOfLines={1}
            >
              {currentSong.title}
            </Text>

            <View style={s.metaRow}>
              {isHiRes(currentSong) && (
                <View
                  style={[s.hiResBadge, { borderColor: colors.status.warning }]}
                >
                  <Text style={[s.hiResText, { color: colors.status.warning }]}>
                    HI-RES
                  </Text>
                </View>
              )}
              <Text
                style={[s.artist, { color: colors.text.secondary }]}
                numberOfLines={1}
              >
                {currentSong.artist || "Unknown Artist"}
              </Text>
            </View>
          </Pressable>

          {/* Controls — tombol dibuat tombol BENARAN (padding), bukan
              ikon telanjang + hitSlop besar: dulu hitSlop 13 di ikon 18px
              dengan gap 6 membuat zona sentuh tetangga tumpang tindih
              20dp, jadi ketukan di antaranya sering jatuh ke tombol
              sebelah. Sekarang tiap kontrol 30–38dp visual + hitSlop
              kecil (tumpang tindih ≤5dp), area sentuh total 44dp. */}
          <View style={s.controls}>
            <Pressable
              onPress={toggleShuffle}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel="Acak"
              accessibilityState={{ selected: shuffle }}
              style={[
                s.toggleBtn,
                shuffle && s.toggleOn,
                shuffle && { backgroundColor: toggleOnBackground },
              ]}
            >
              <Shuffle
                size={18}
                color={
                  shuffle ? colors.primary[500] : colors.text.tertiary
                }
                strokeWidth={shuffle ? 2.5 : 2}
              />
            </Pressable>

            <Pressable
              onPress={playPrevious}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Lagu sebelumnya"
              style={s.ctrlBtn}
            >
              <SkipBack
                size={20}
                color={colors.text.secondary}
                strokeWidth={2.5}
              />
            </Pressable>

            <Pressable
              onPress={togglePlay}
              hitSlop={3}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Jeda" : "Putar"}
              style={[s.playBtn, { backgroundColor: colors.primary[500] }]}
            >
              {isPlaying ? (
                <Pause size={20} color={playIconColor} strokeWidth={3} />
              ) : (
                <Play
                  size={20}
                  color={playIconColor}
                  strokeWidth={3}
                  style={{ marginLeft: 2 }}
                />
              )}
            </Pressable>

            <Pressable
              onPress={playNext}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Lagu berikutnya"
              style={s.ctrlBtn}
            >
              <SkipForward
                size={20}
                color={colors.text.secondary}
                strokeWidth={2.5}
              />
            </Pressable>

            {/* Repeat One dulu hanya dot 5px di bawah ikon (pola yang
                sama dengan layar Player sebelum LAYOUT-V2). Kini badge
                angka "1" 13×13 di sudut disc — skala pill dari badge
                14×14 Player; teks 8px tetap terbaca karena digit "1"
                hanya satu garis vertikal. */}
            <Pressable
              onPress={toggleRepeat}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel={
                repeat === "track"
                  ? "Ulangi satu lagu"
                  : repeat === "all"
                    ? "Ulangi semua"
                    : "Ulangi mati"
              }
              accessibilityState={{ selected: repeatOn }}
              style={[
                s.toggleBtn,
                s.repeatBtn,
                repeatOn && s.toggleOn,
                repeatOn && { backgroundColor: toggleOnBackground },
              ]}
            >
              <Repeat
                size={18}
                color={
                  repeatOn ? colors.primary[500] : colors.text.tertiary
                }
                strokeWidth={repeatOn ? 2.5 : 2}
              />
              {repeat === "track" && (
                <View
                  style={[
                    s.repeatOneBadge,
                    { backgroundColor: colors.primary[500] },
                  ]}
                >
                  <Text
                    style={[s.repeatOneBadgeText, { color: playIconColor }]}
                  >
                    1
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  // ✅ wrapper langsung — tidak ada outer dengan position absolute
  wrapper: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentLine: { height: 2.5, width: "100%" },
  progressBg: { height: 1.5, width: "100%" },
  progressFill: { height: "100%", borderRadius: 1 },
  content: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    // 12 → 10 + gap 10 → 8 + artwork 44 → 40: memberi ruang 12dp untuk
    // kontrol yang diperlebar, supaya judul tidak hancur (lihat hitungan
    // di laporan miniplayer).
    paddingHorizontal: 10,
    gap: 8,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  artist: {
    fontSize: 12,
    flexShrink: 1,
  },
  hiResBadge: {
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  hiResText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Tombol kontrol BENARAN 30–32dp (bukan ikon telanjang): disc toggle
  // 30×30 (ikon 18 + padding 6) + hitSlop 7 = sentuh 44dp; prev/next
  // 32×32 (ikon 20 + padding 6) + hitSlop 6 = sentuh 44dp; Play 38 +
  // hitSlop 3 = 44dp (tetap). Tumpang tindih zona sentuh tetangga
  // ≤5dp (dulu 20dp) — ketukan tidak lagi jatuh ke tombol sebelah.
  toggleBtn: {
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  // ON/OFF Shuffle/Repeat — disc ON: tombol 30×30 jadi lingkaran penuh
  // (radius 15). Latar tint diisi inline (toggleOnBackground) karena
  // warnanya ikut primary[500] tema (pola yang sama dengan Player).
  toggleOn: {
    borderRadius: 15,
  },
  ctrlBtn: {
    padding: 6,
  },
  // Pembungkus relatif supaya badge Repeat One bisa diposisikan absolut
  // di sudut disc.
  repeatBtn: {
    position: "relative",
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  // Badge angka "1" Repeat One — skala pill dari badge 14×14 Player:
  // 13×13 menempel di sudut kanan-bawah disc (menjorok 3dp ke gap,
  // tidak menabrak tombol sebelah karena gap kontrol 8dp).
  repeatOneBadge: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 7,
    right: -3,
    bottom: -3,
    justifyContent: "center",
    alignItems: "center",
  },
  repeatOneBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    textAlign: "center",
  },
});
