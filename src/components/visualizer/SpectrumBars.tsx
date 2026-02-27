import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, LinearGradient, vec } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

interface Props {
  fftData: SharedValue<number[]>;
  width: number;
  height: number;
  barCount?: number;
}

export function SpectrumBars({ fftData, width, height, barCount = 32 }: Props) {
  const gap = 2;
  const barWidth = (width - gap * (barCount - 1)) / barCount;

  // Derived array of bar heights (on UI thread via worklet)
  const bars = useDerivedValue(() => {
    const data = fftData.value;
    const step = Math.floor(data.length / barCount);
    return Array.from({ length: barCount }, (_, i) => {
      const val = data[Math.min(i * step, data.length - 1)] ?? 0;
      return Math.max(4, val * height);
    });
  });

  return (
    <View style={{ width, height }}>
      <Canvas style={StyleSheet.absoluteFill}>
        {Array.from({ length: barCount }, (_, i) => {
          const x = i * (barWidth + gap);
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={height - (bars.value[i] ?? 4)}
                width={barWidth}
                height={bars.value[i] ?? 4}
                rx={2} ry={2}
              >
                <LinearGradient
                  start={vec(x, height)}
                  end={vec(x, 0)}
                  colors={[Colors.accent, Colors.accent3]}
                />
              </Rect>
            </React.Fragment>
          );
        })}
      </Canvas>
    </View>
  );
}
