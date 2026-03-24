import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useTheme } from "@/context/ThemeContext";

export default function FloatingPlayer() {
  const { theme } = useTheme();
  const router = useRouter();

  const {
    currentSong,
    isPlaying,
    togglePlay,
    position: progress,
    duration,
    playNext,
    playPrevious,
  } = usePlayerStore();

  const translateX = useSharedValue(0);

  // --- SEMUA HOOK HARUS DI ATAS ---

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > 100) {
        runOnJS(playPrevious)();
      } else if (event.translationX < -100) {
        runOnJS(playNext)();
      }
      translateX.value = withSpring(0);
    });

  const animatedProgressStyle = useAnimatedStyle(() => {
    const validDuration = duration > 0 ? duration : 1;
    const percentage = Math.min(Math.max(progress / validDuration, 0), 1);
    return { width: `${percentage * 100}%` };
  });

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: withTiming(translateX.value === 0 ? 1 : 0.7),
  }));

  // --- BARU BOLEH CEK CONDITION UNTUK RENDER ---
  
  if (!currentSong) return null; // Pindahkan ke sini (setelah semua hook terpanggil)
 
  return (
    <View style={styles.outerContainer}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.wrapper, animatedContainerStyle]}>
          <Pressable
            style={styles.pressable}
            onPress={() => router.push("/player" as any)} // Casting to any untuk router path
          >
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.progressBarBackground}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { backgroundColor: theme.colors.primary[500] },
                  animatedProgressStyle,
                ]}
              />
            </View>

            <View style={styles.content}>
              <Image
                source={
                  currentSong.artwork
                    ? { uri: currentSong.artwork }
                    : require("../../../../assets/images/icon.png")
                }
                style={styles.artwork}
                contentFit="cover"
                transition={200}
              />

              <View style={styles.info}>
                <Text
                  style={[styles.title, { color: theme.colors.text.primary }]}
                  numberOfLines={1}
                >
                  {currentSong.title}
                </Text>

                <View style={styles.row}>
                  {/* 3. Gunakan currentSong.bitDepth > 16 sebagai indikator Hi-Res jika isHiRes undefined */}
                  {(currentSong.isHiRes ||
                    (currentSong.bitDepth && currentSong.bitDepth > 16)) && (
                    <View
                      style={[styles.hiResBadge, { borderColor: "#D4AF37" }]}
                    >
                      <Text style={styles.hiResText}>HI-RES</Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.artist,
                      { color: theme.colors.text.secondary },
                    ]}
                    numberOfLines={1}
                  >
                    {currentSong.artist}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={(e) => {
                  e.stopPropagation(); // 4. Tambahkan stopPropagation agar tidak membuka player screen saat klik play
                  togglePlay();
                }}
                style={({ pressed }) => [
                  styles.playButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={28}
                  color={isPlaying ? theme.colors.primary[500] : "#FFF"}
                />
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... (Tetap gunakan styles yang Anda berikan, sudah bagus)
  outerContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 100 : 85, // Penyesuaian jarak dari bawah
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  wrapper: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.5)", // Fallback jika blur tidak render
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  pressable: {
    height: 68,
    flexDirection: "column",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  info: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  artist: {
    fontSize: 12,
    opacity: 0.7,
  },
  hiResBadge: {
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(212, 175, 55, 0.1)",
  },
  hiResText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#D4AF37",
  },
  playButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  progressBarBackground: {
    height: 2.5,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressBarFill: {
    height: "100%",
    // shadow tidak akan terlihat tanpa width/height di android, tapi biarkan untuk iOS
  },
});
