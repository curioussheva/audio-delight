import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  SharedValue,           // ✅ import langsung, bukan Animated.SharedValue
  interpolate,
  runOnJS,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface KnobProps {
  label: string;
  value: number; // Nilai mentah 0 - 1000
  onChange: (val: number) => void;
  color: string;
  disabled?: boolean;
}

// Tick angles tetap (tidak perlu dihitung ulang tiap render)
const TICK_ANGLES = [-135, -90, -45, 0, 45, 90, 135];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse hex color ke komponen RGB.
 * Dipanggil di JS thread (render), hasilnya di-pass sebagai plain number
 * ke worklet — sehingga tidak perlu string parsing di dalam useAnimatedStyle.
 */
const parseHexToRGB = (hex: string): { r: number; g: number; b: number } => {
  const cleanHex = hex.replace("#", "");
  return {
    r: parseInt(cleanHex.substring(0, 2), 16),
    g: parseInt(cleanHex.substring(2, 4), 16),
    b: parseInt(cleanHex.substring(4, 6), 16),
  };
};

/** Tetap tersedia untuk penggunaan di JS thread (render biasa) */
const hexToRGBA = (hex: string, opacity: number): string => {
  const { r, g, b } = parseHexToRGB(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// ─── AnimatedTick ─────────────────────────────────────────────────────────────
// Menerima RGB sebagai angka — tidak ada string parsing di dalam worklet
const AnimatedTick = ({
  angle,
  rotation,
  colorR,
  colorG,
  colorB,
  disabled,
}: {
  angle: number;
  rotation: SharedValue<number>;  // ✅ SharedValue langsung, bukan Animated.SharedValue
  colorR: number;
  colorG: number;
  colorB: number;
  disabled?: boolean;
}) => {
  const animStyle = useAnimatedStyle(() => {
    "worklet";
    if (disabled) return { backgroundColor: "rgba(255,255,255,0.05)" };
    const diff = Math.abs(rotation.value - angle);
    // Bangun string rgba langsung dari number — aman di worklet
    const bg =
      diff < 15
        ? `rgba(${colorR},${colorG},${colorB},0.8)`
        : "rgba(255,255,255,0.1)";
    return { backgroundColor: bg };
  });

  return (
    <Animated.View
      style={[
        styles.tick,
        { transform: [{ rotate: `${angle}deg` }] },
        animStyle,
      ]}
    />
  );
};

// ─── ControlKnob ──────────────────────────────────────────────────────────────
export const ControlKnob = ({
  label,
  value,
  onChange,
  color,
  disabled,
}: KnobProps) => {
  const MIN_ROT = -135;
  const MAX_ROT = 135;

  const safeInitialValue = isNaN(value)
    ? 0
    : Math.min(1000, Math.max(0, value));

  // Parse hex sekali di JS thread — hasilnya di-pass ke worklet sebagai number
  const rgb = parseHexToRGB(color);

  const rotation = useSharedValue(
    interpolate(safeInitialValue, [0, 1000], [MIN_ROT, MAX_ROT]),
  );
  const startRotation = useSharedValue(0);
  const isGesturing = useSharedValue(false);

  // Sync saat preset berubah dari luar
  useEffect(() => {
    if (!isNaN(value)) {
      // ✅ Tidak baca .value di sini — hanya tulis
      const newRot = interpolate(value, [0, 1000], [MIN_ROT, MAX_ROT]);
      rotation.value = withSpring(newRot, {
        damping: 18,
        stiffness: 120,
        mass: 0.5,
      });
    }
  }, [value]);

  // Gesture Handler
  const gesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isGesturing.value = true;
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      const sensitivity = 0.6;
      let delta = e.translationY * sensitivity + e.translationX * 0.3;
      let newRot = startRotation.value - delta;
      newRot = Math.min(MAX_ROT, Math.max(MIN_ROT, newRot));
      rotation.value = newRot;

      const newValue = interpolate(newRot, [MIN_ROT, MAX_ROT], [0, 1000]);
      runOnJS(onChange)(Math.round(newValue));
    })
    .onEnd(() => {
      isGesturing.value = false;
      const currentRot = rotation.value;
      const snappedValue = Math.round(
        interpolate(currentRot, [MIN_ROT, MAX_ROT], [0, 1000]),
      );
      const diff = Math.abs(
        snappedValue - interpolate(currentRot, [MIN_ROT, MAX_ROT], [0, 1000]),
      );
      if (diff > 5) {
        const snappedRot = interpolate(snappedValue, [0, 1000], [MIN_ROT, MAX_ROT]);
        rotation.value = withSpring(snappedRot, { damping: 20, stiffness: 150 });
        runOnJS(onChange)(snappedValue);
      }
    });

  // Animated styles
  const animatedKnobStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(disabled ? 0.4 : 1, { duration: 200 }),
    transform: [{ scale: withTiming(disabled ? 0.95 : 1, { duration: 200 }) }],
  }));

  // Nilai display — murni dari prop, tidak perlu shared value
  const displayValue = !isNaN(value) ? Math.round(value / 10) : 0;

  const getDynamicColor = () => {
    if (disabled) return "#444";
    if (displayValue > 70) return color;
    if (displayValue > 30) return hexToRGBA(color, 0.8);
    return hexToRGBA(color, 0.6);
  };

  const getBorderColor = () => {
    if (disabled) return "rgba(68, 68, 68, 0.3)";
    return hexToRGBA(color, 0.3);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: disabled ? "#444" : "#888" }]}>
        {label}
      </Text>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.knobOuter,
            { borderColor: getBorderColor() },
            containerStyle,
          ]}
        >
          {/* Tick marks — setiap tick punya animated style sendiri */}
          <View style={styles.tickMarks}>
            {TICK_ANGLES.map((angle) => (
              <AnimatedTick
                key={angle}
                angle={angle}
                rotation={rotation}
                colorR={rgb.r}
                colorG={rgb.g}
                colorB={rgb.b}
                disabled={disabled}
              />
            ))}
          </View>

          {/* Center dot */}
          <View
            style={[styles.centerDot, { backgroundColor: getDynamicColor() }]}
          />

          {/* Knob pointer */}
          <Animated.View style={[styles.knobInner, animatedKnobStyle]}>
            <View
              style={[styles.pointer, { backgroundColor: getDynamicColor() }]}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Text style={[styles.valueText, { color: getDynamicColor() }]}>
        {displayValue}%
      </Text>

      <View style={styles.rangeLabels}>
        <Text style={[styles.rangeText, { color: disabled ? "#333" : "#666" }]}>
          MIN
        </Text>
        <Text style={[styles.rangeText, { color: disabled ? "#333" : "#666" }]}>
          MAX
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginHorizontal: 8,
    width: 80,
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    marginBottom: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  knobOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    backgroundColor: "#0A0A0A",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
    position: "relative",
  },
  tickMarks: {
    position: "absolute",
    width: "90%",
    height: "90%",
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
  },
  tick: {
    position: "absolute",
    width: 2,
    height: 8,
    borderRadius: 1,
    top: -2,
    left: "50%",
    marginLeft: -1,
  },
  centerDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFF",
    opacity: 0.8,
    zIndex: 2,
  },
  knobInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  pointer: {
    width: 3.5,
    height: 20,
    borderRadius: 2,
    shadowColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  valueText: {
    fontSize: 13,
    marginTop: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  rangeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  rangeText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
 