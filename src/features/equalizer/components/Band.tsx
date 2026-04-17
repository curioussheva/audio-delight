import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  runOnJS,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// Tambah di atas file, atau import dari file types
interface BandProps {
  frequency: number;
  gain: number;
  onValueChange: (gain: number) => void;
  color?: string;
  disabled?: boolean;
}

const { width } = Dimensions.get("window");
const BAND_WIDTH = 65; // Ukuran lebar yang pas untuk scroll horizontal
const SLIDER_HEIGHT = 160; // Tinggi area geser

export const EqualizerBand = ({
  frequency,
  gain,
  onValueChange,
  color,
  disabled,
}: BandProps) => {
  const translateY = useSharedValue(
    interpolate(gain, [-12, 12], [SLIDER_HEIGHT, 0]),
  );

  // Sync saat gain berubah (misal ganti preset)
  React.useEffect(() => {
    translateY.value = withSpring(
      interpolate(gain, [-12, 12], [SLIDER_HEIGHT, 0]),
    );
  }, [gain]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      let nextY = e.y;
      if (nextY < 0) nextY = 0;
      if (nextY > SLIDER_HEIGHT) nextY = SLIDER_HEIGHT;

      translateY.value = nextY;
      const newGain = interpolate(nextY, [0, SLIDER_HEIGHT], [12, -12]);
      runOnJS(onValueChange)(parseFloat(newGain.toFixed(1)));
    });

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - 12 }],
    backgroundColor: gain === 0 ? "#333" : color,
    shadowColor: color,
  }));

  const animatedFillStyle = useAnimatedStyle(() => ({
    height: SLIDER_HEIGHT - translateY.value,
    backgroundColor: color,
    opacity: interpolate(Math.abs(gain), [0, 12], [0.2, 0.8]),
  }));

  const freqLabel = frequency < 1000 ? `${frequency}` : `${frequency / 1000}k`;

  return (
    <View style={[styles.container, { opacity: disabled ? 0.3 : 1 }]}>
      {/* DB Value di atas */}
      <Text style={[styles.gainText, { color: gain !== 0 ? color : "#555" }]}>
        {gain > 0 ? `+${gain.toFixed(0)}` : gain.toFixed(0)}
      </Text>

      <GestureDetector gesture={gesture}>
        <View style={styles.faderTrack}>
          {/* Garis-garis Skala (Tick Marks) */}
          <View style={styles.ticks}>
            {[12, 6, 0, -6, -12].map((v) => (
              <View
                key={v}
                style={[styles.tickLine, v === 0 && styles.tickZero]}
              />
            ))}
          </View>

          {/* Fill Progress dari Bawah */}
          <Animated.View style={[styles.fill, animatedFillStyle]} />

          {/* Knob Fader Kotak (Studio Style) */}
          <Animated.View style={[styles.thumb, animatedThumbStyle]}>
            <View style={styles.thumbLine} />
          </Animated.View>
        </View>
      </GestureDetector>

      <Text style={styles.freqText}>{freqLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: BAND_WIDTH,
    alignItems: "center",
    paddingVertical: 10,
  },
  gainText: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 8,
    fontVariant: ["tabular-nums"],
  },
  faderTrack: {
    width: 30, // Area sentuh lebih lebar
    height: SLIDER_HEIGHT,
    backgroundColor: "#080808",
    borderRadius: 4,
    justifyContent: "flex-end",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#151515",
    overflow: "visible",
  },
  ticks: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 0,
  },
  tickLine: {
    width: 10,
    height: 1,
    backgroundColor: "#222",
  },
  tickZero: {
    width: 20,
    backgroundColor: "#333",
  },
  fill: {
    width: 4,
    borderRadius: 2,
    position: "absolute",
    bottom: 0,
  },
  thumb: {
    width: 26,
    height: 24,
    borderRadius: 4,
    position: "absolute",
    left: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  thumbLine: {
    width: 15,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 1,
  },
  freqText: {
    marginTop: 12,
    fontSize: 10,
    color: "#666",
    fontWeight: "bold",
  },
});
