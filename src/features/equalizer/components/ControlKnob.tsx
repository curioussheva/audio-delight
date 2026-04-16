import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  SharedValue,
  interpolate,
  runOnJS,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface KnobProps {
  label: string;
  value: number; // 0 - 1000
  onChange: (val: number) => void;
  color: string;
  disabled?: boolean;
}

const TICK_ANGLES = [-135, -90, -45, 0, 45, 90, 135];
const KNOB_SIZE = 120;
const OUTER_SIZE = 140;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseHexToRGB = (hex: string) => {
  const cleanHex = hex.replace("#", "");
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
};

const hexToRGBA = (hex: string, opacity: number): string => {
  const { r, g, b } = parseHexToRGB(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// ─── AnimatedTick ─────────────────────────────────────────────────────────────

const AnimatedTick = ({
  angle,
  rotation,
  rgb,
  disabled,
}: {
  angle: number;
  rotation: SharedValue<number>;
  rgb: { r: number; g: number; b: number };
  disabled?: boolean;
}) => {
  const animStyle = useAnimatedStyle(() => {
    if (disabled) return { backgroundColor: "rgba(255,255,255,0.05)" };
    const diff = Math.abs(rotation.value - angle);
    const isActive = diff < 20;

    return {
      backgroundColor: isActive
        ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`
        : "rgba(255,255,255,0.1)",
      height: isActive ? 14 : 10,
    };
  });

  return <Animated.View style={[styles.tick, animStyle]} />;
};

// ─── Main ControlKnob ─────────────────────────────────────────────────────────

export const ControlKnob = ({
  label,
  value,
  onChange,
  color,
  disabled,
}: KnobProps) => {
  const MIN_ROT = -135;
  const MAX_ROT = 135;

  const rgb = parseHexToRGB(color);
  const rotation = useSharedValue(
    interpolate(value || 0, [0, 1000], [MIN_ROT, MAX_ROT])
  );
  const startRotation = useSharedValue(0);
  const offsetY = useSharedValue(0); // ✅ Definisikan offset

  // Sync saat value prop berubah
  useEffect(() => {
    if (!isNaN(value)) {
      const newRot = interpolate(value, [0, 1000], [MIN_ROT, MAX_ROT]);
      rotation.value = withSpring(newRot, { damping: 15, stiffness: 100 });
    }
  }, [value]);

  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      const sensitivity = 0.5;
      let delta = e.translationY * sensitivity;
      let newRot = startRotation.value - delta;

      newRot = Math.min(MAX_ROT, Math.max(MIN_ROT, newRot));
      rotation.value = newRot;

      const newValue = interpolate(newRot, [MIN_ROT, MAX_ROT], [0, 1000]);
      runOnJS(onChange)(Math.round(newValue));
    });

  const animatedKnobStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(disabled ? 0.4 : 1),
    transform: [{ scale: withTiming(disabled ? 0.92 : 1) }],
  }));

  const displayValue = !isNaN(value) ? Math.round(value / 10) : 0;

  return (
    <View style={[styles.container, { width: OUTER_SIZE }]}>
      <Text style={[styles.label, { color: disabled ? "#444" : "#AAA" }]}>
        {label}
      </Text>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.knobWrapper, containerStyle]}>
          <View style={[styles.knobOuter, { borderColor: hexToRGBA(color, 0.2) }]}>
            <View style={styles.tickMarksContainer}>
              {TICK_ANGLES.map((angle) => (
                <AnimatedTick
                  key={angle}
                  angle={angle}
                  rotation={rotation}
                  rgb={rgb}
                  disabled={disabled}
                />
              ))}
            </View>

            <View style={[styles.centerDot, { backgroundColor: color }]} />

            <Animated.View style={[styles.knobSurface, animatedKnobStyle]}>
              <View style={[styles.pointer, { backgroundColor: color }]}>
                <View style={[styles.pointerGlow, { backgroundColor: color }]} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>

      <View style={styles.infoContainer}>
        <Text style={[styles.valueText, { color: disabled ? "#444" : color }]}>
          {displayValue}%
        </Text>
        <View style={styles.rangeRow}>
          <Text style={styles.rangeLabel}>0</Text>
          <Text style={styles.rangeLabel}>100</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginHorizontal: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 15,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  knobWrapper: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
  },
  knobOuter: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    borderWidth: 3,
    backgroundColor: "#050505",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 15,
  },
  tickMarksContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  tick: {
    position: "absolute",
    width: 3,
    borderRadius: 2,
    top: -5,
  },
  centerDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 10,
    opacity: 0.9,
  },
  knobSurface: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    paddingTop: 10,
  },
  pointer: {
    width: 5,
    height: 35,
    borderRadius: 3,
    zIndex: 5,
  },
  pointerGlow: {
    width: "100%",
    height: "100%",
    borderRadius: 3,
    opacity: 0.4,
    transform: [{ scale: 1.5 }],
  },
  infoContainer: {
    alignItems: "center",
    marginTop: 15,
  },
  valueText: {
    fontSize: 22,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 60,
    marginTop: 2,
  },
  rangeLabel: {
    fontSize: 8,
    color: "#444",
    fontWeight: "bold",
  },
}); 