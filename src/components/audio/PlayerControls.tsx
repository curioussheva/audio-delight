// Di src/components/audio/PlayerControls.tsx (update)
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native"; // ← TAMBAHKAN Text
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { usePlayerStore } from "@/store/playerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useTheme } from "@/context/ThemeContext";

export const PlayerControls: React.FC = () => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const { play, pause, skipToNext, skipToPrevious } = useAudioPlayer();
  const { isPlaying, shuffle, repeat, toggleShuffle, toggleRepeat } =
    usePlayerStore(); // ← HAPUS favorite
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isPlaying ? 1 : 1.1) }],
  }));

  return (
    <View style={styles.container}>
      {/* Main controls */}
      <View style={[styles.mainControls, { gap: spacing.lg }]}>
        <TouchableOpacity onPress={toggleShuffle}>
          <Ionicons
            name="shuffle"
            size={24}
            color={shuffle ? colors.primary[500] : colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={skipToPrevious}>
          <Ionicons
            name="play-skip-back"
            size={32}
            color={colors.text.primary}
          />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.playButton,
            playButtonStyle,
            { backgroundColor: colors.primary[500] },
          ]}
        >
          <TouchableOpacity onPress={isPlaying ? pause : play}>
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={40}
              color={colors.background.primary}
            />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity onPress={skipToNext}>
          <Ionicons
            name="play-skip-forward"
            size={32}
            color={colors.text.primary}
          />
        </TouchableOpacity>

        <View style={{ position: "relative" }}>
          <TouchableOpacity onPress={() => toggleRepeat()}>
            <Ionicons
              name={
                repeat === "track"
                  ? "repeat"
                  : repeat === "all"
                    ? "repeat"
                    : "repeat-outline"
              }
              size={24}
              color={
                repeat !== "off" ? colors.primary[500] : colors.text.secondary
              }
            />
          </TouchableOpacity>
          {repeat === "track" && (
            <View
              style={[
                styles.repeatOneIndicator,
                { backgroundColor: colors.primary[500] },
              ]}
            />
          )}
        </View>
      </View>

      {/* Secondary controls - HAPUS FAVORITE SEMENTARA */}
      <View style={[styles.secondaryControls, { gap: spacing.lg }]}>
        <TouchableOpacity>
          <Ionicons
            name="heart-outline"
            size={24}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity>
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity>
          <Ionicons
            name="download-outline"
            size={24}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowMoreOptions(true)}>
          <Ionicons
            name="ellipsis-horizontal"
            size={24}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      {/* More options modal - SEDERHANAKAN SEMENTARA */}
      <Modal
        visible={showMoreOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoreOptions(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}
          activeOpacity={1}
          onPress={() => setShowMoreOptions(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.background.primary },
            ]}
          >
            <Text style={{ color: colors.text.primary, padding: spacing.md }}>
              More options coming soon...
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // style di-inline
  },
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  repeatOneIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  secondaryControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
});
