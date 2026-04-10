import React from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";

interface BandProps {
  frequency: number;
  gain: number;
  onValueChange: (val: number) => void;
  color: string;
  index?: number;
  disabled?: boolean;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}

const { width } = Dimensions.get("window");
const BAND_WIDTH = (width - 48) / 10; // Dynamic width based on screen

export const EqualizerBand = ({
  frequency,
  gain,
  onValueChange,
  color,
  index = 0,
}: BandProps) => {
  const freqLabel =
    frequency < 1000
      ? `${frequency} Hz`
      : `${(frequency / 1000).toFixed(0)} kHz`;

  // Calculate bar height based on gain value
  const barHeight = Math.max(4, Math.min(80, 40 + (gain / 12) * 40));

  // Get color intensity based on gain
  const getColorIntensity = () => {
    if (gain > 6) return "#FF4444";
    if (gain > 3) return "#FF8844";
    if (gain > 0) return color;
    if (gain < -6) return "#4466FF";
    if (gain < -3) return "#4488FF";
    return color;
  };

  const barColor = getColorIntensity();

  return (
    <View style={[styles.container, { width: BAND_WIDTH }]}>
      {/* Gain Value Display */}
      <View style={styles.gainContainer}>
        <Text style={[styles.gainValue, { color: barColor }]}>
          {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
        </Text>
      </View>

      {/* Visual Bar (for better visualization) */}
      <View style={styles.visualBarContainer}>
        <View
          style={[
            styles.visualBar,
            {
              height: barHeight,
              backgroundColor: barColor,
              opacity: Math.abs(gain) / 12 + 0.3,
            },
          ]}
        />
      </View>

      {/* Vertical Slider */}
      <View style={styles.sliderWrapper}>
        <Slider
          style={styles.slider}
          minimumValue={-12}
          maximumValue={12}
          value={gain}
          onValueChange={onValueChange}
          step={0.5}
          vertical={true}
          //      thumbTintColor={color}
          minimumTrackTintColor={color}
          maximumTrackTintColor="rgba(255,255,255,0.15)"
          //    trackStyle={styles.track}
          //   thumbStyle={[styles.thumb, { backgroundColor: color }]}
        />
      </View>

      {/* Frequency Label */}
      <View style={styles.freqContainer}>
        <Text style={styles.freqText}>{freqLabel}</Text>
      </View>
    </View>
  );
};

// Alternative: Horizontal version for better UX
export const EqualizerBandHorizontal = ({
  frequency,
  gain,
  onValueChange,
  color,
}: BandProps) => {
  const freqLabel =
    frequency < 1000
      ? `${frequency} Hz`
      : `${(frequency / 1000).toFixed(0)} kHz`;

  return (
    <View style={stylesHorizontal.container}>
      <Text style={[stylesHorizontal.freqText, { color: color }]}>
        {freqLabel}
      </Text>

      <View style={stylesHorizontal.sliderContainer}>
        <Slider
          style={stylesHorizontal.slider}
          minimumValue={-12}
          maximumValue={12}
          value={gain}
          onValueChange={onValueChange}
          step={0.5}
          //          thumbTintColor={color}
          minimumTrackTintColor={color}
          maximumTrackTintColor="rgba(255,255,255,0.2)"
        />
      </View>

      <Text
        style={[
          stylesHorizontal.gainText,
          { color: gain > 0 ? color : "#FF6B6B" },
        ]}
      >
        {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    height: 260,
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  gainContainer: {
    marginBottom: 8,
    minWidth: 50,
    alignItems: "center",
  },
  gainValue: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  visualBarContainer: {
    height: 70,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 6,
  },
  visualBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: "#FFF",
    shadowColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  sliderWrapper: {
    height: 150,
    width: 40,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 8,
  },
  slider: {
    width: 140,
    height: 40,
    transform: [{ rotate: "-90deg" }],
  },
  track: {
    borderRadius: 2,
    height: 3,
  },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  freqContainer: {
    marginTop: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
  },
  freqText: {
    color: "#999",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
});

// Horizontal styles (better for most users)
const stylesHorizontal = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 12,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  freqText: {
    fontSize: 13,
    fontWeight: "600",
    width: 70,
  },
  sliderContainer: {
    flex: 1,
    marginHorizontal: 16,
  },
  slider: {
    width: "200%",
    height: 30,
  },
  gainText: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    width: 55,
    textAlign: "right",
  },
});
