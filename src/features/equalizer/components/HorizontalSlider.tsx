import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";

import { GestureDetector, Gesture } from "react-native-gesture-handler";

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  runOnJS,
  withSpring,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_WIDTH = SCREEN_WIDTH - 60;

interface SliderProps {
  label: string;
  value: number; // 0 - 1000
  onChange: (val: number) => void;
  color: string;
  disabled?: boolean;
}

export const HorizontalSlider = ({
  label,
  value,
  onChange,
  color,
  disabled,
}: SliderProps) => {
  const translateX = useSharedValue(
    interpolate(value, [0, 1000], [0, SLIDER_WIDTH]),
  );

  // Sync value dari luar (preset)
  React.useEffect(() => {
    translateX.value = withSpring(
      interpolate(value, [0, 1000], [0, SLIDER_WIDTH]),
    );
  }, [value]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      let nextX = e.x;
      if (nextX < 0) nextX = 0;
      if (nextX > SLIDER_WIDTH) nextX = SLIDER_WIDTH;

      translateX.value = nextX;
      const newValue = interpolate(nextX, [0, SLIDER_WIDTH], [0, 1000]);
      runOnJS(onChange)(Math.round(newValue));
    });

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: translateX.value,
    backgroundColor: color,
    shadowColor: color,
  }));

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - 10 }],
  }));

  return (
    <View style={[styles.container, disabled && { opacity: 0.4 }]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>{Math.round(value / 10)}%</Text>
      </View>

      <GestureDetector gesture={gesture}>
        <View style={styles.track}>
          {/* Progress Fill */}
          <Animated.View style={[styles.fill, animatedFillStyle]} />

          {/* Thumb / Handle */}
          <Animated.View style={[styles.thumb, animatedThumbStyle]}>
            <View style={[styles.thumbInner, { backgroundColor: color }]} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 20,
    marginVertical: 12,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    color: "#888",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  value: {
    fontSize: 12,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 6,
    width: SLIDER_WIDTH,
    backgroundColor: "#1A1A1A",
    borderRadius: 3,
    justifyContent: "center",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  thumb: {
    position: "absolute",
    width: 30,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbInner: {
    width: 4,
    height: 20,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
});
