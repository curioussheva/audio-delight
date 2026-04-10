import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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

export const ControlKnob = ({
  label,
  value,
  onChange,
  color,
  disabled,
}: KnobProps) => {
  // Range rotasi: -135° (min) ke 135° (max)
  const MIN_ROT = -135;
  const MAX_ROT = 135;

  // 1. Validasi awal: pastikan value tidak NaN/undefined
  const safeInitialValue = isNaN(value)
    ? 0
    : Math.min(1000, Math.max(0, value));

  // 2. Shared Value untuk rotasi derajat
  const rotation = useSharedValue(
    interpolate(safeInitialValue, [0, 1000], [MIN_ROT, MAX_ROT]),
  );

  // 3. Untuk tracking gesture
  const startRotation = useSharedValue(0);
  const isGesturing = useSharedValue(false);

  // 4. EFFECT: Sinkronisasi saat Preset berubah dari luar
  useEffect(() => {
    if (!isNaN(value) && !isGesturing.value) {
      const newRot = interpolate(value, [0, 1000], [MIN_ROT, MAX_ROT]);
      rotation.value = withSpring(newRot, {
        damping: 18,
        stiffness: 120,
        mass: 0.5,
      });
    }
  }, [value]);

  // Helper function untuk konversi warna ke RGBA
  const hexToRGBA = (hex: string, opacity: number) => {
    // Hapus '#' jika ada
    const cleanHex = hex.replace("#", "");

    // Parse RGB
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  // 5. Gesture Handler
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
      const roundedValue = Math.round(newValue);
      runOnJS(onChange)(roundedValue);
    })
    .onEnd(() => {
      isGesturing.value = false;
      const currentRot = rotation.value;
      const snappedValue = Math.round(
        interpolate(currentRot, [MIN_ROT, MAX_ROT], [0, 1000]),
      );
      if (
        Math.abs(
          snappedValue - interpolate(currentRot, [MIN_ROT, MAX_ROT], [0, 1000]),
        ) > 5
      ) {
        const snappedRot = interpolate(
          snappedValue,
          [0, 1000],
          [MIN_ROT, MAX_ROT],
        );
        rotation.value = withSpring(snappedRot, {
          damping: 20,
          stiffness: 150,
        });
        runOnJS(onChange)(snappedValue);
      }
    });

  // 6. Animated Styles
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(disabled ? 0.4 : 1, { duration: 200 }),
    transform: [{ scale: withTiming(disabled ? 0.95 : 1, { duration: 200 }) }],
  }));

  // 7. Format display value
  const displayValue = !isNaN(value) ? Math.round(value / 10) : 0;

  // 8. Warna dinamis berdasarkan nilai (menggunakan RGBA)
  const getDynamicColor = () => {
    if (disabled) return "#444";
    const intensity = displayValue / 100;
    if (displayValue > 70) return color;
    if (displayValue > 30) return hexToRGBA(color, 0.8);
    return hexToRGBA(color, 0.6);
  };

  // 9. Border color dengan opacity menggunakan RGBA
  const getBorderColor = () => {
    if (disabled) return "rgba(68, 68, 68, 0.3)";
    return hexToRGBA(color, 0.3);
  };

  // 10. Tick color dinamis
  const getTickColor = (tickRot: number) => {
    if (disabled) return "rgba(255,255,255,0.05)";
    const diff = Math.abs(rotation.value - tickRot);
    if (diff < 15) {
      return hexToRGBA(color, 0.8);
    }
    return "rgba(255,255,255,0.1)";
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
          {/* Tick marks around knob */}
          <View style={styles.tickMarks}>
            {[-135, -90, -45, 0, 45, 90, 135].map((angle, idx) => {
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const tickColor = getTickColor(angle);
              return (
                <View
                  key={idx}
                  style={[
                    styles.tick,
                    {
                      transform: [{ rotate: `${angle}deg` }],
                      backgroundColor: tickColor,
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Center dot */}
          <View
            style={[styles.centerDot, { backgroundColor: getDynamicColor() }]}
          />

          {/* Knob pointer */}
          <Animated.View style={[styles.knobInner, animatedStyle]}>
            <View
              style={[styles.pointer, { backgroundColor: getDynamicColor() }]}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Text style={[styles.valueText, { color: getDynamicColor() }]}>
        {displayValue}%
      </Text>

      {/* Min/Max labels */}
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
