import React from 'react';
import { View } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';

interface Props {
  fftData: SharedValue<number[]>;
  width: number;
  height: number;
  barCount?: number;
}

export function SpectrumBars({ fftData, width, height, barCount = 32 }: Props) {
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

  // Compute bar heights on UI thread - tidak perlu baca .value saat render
  const barHeights = useDerivedValue(() => {
    const data = fftData.value;
    const step = Math.max(1, Math.floor(data.length / barCount));
    return Array.from({ length: barCount }, (_, i) => {
      const val = data[Math.min(i * step, data.length - 1)] ?? 0;
      return Math.max(4, val * height);
    });
  });

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {Array.from({ length: barCount }, (_, i) => {
          const x = i * (barWidth + gap);
          // Baca barHeights.value hanya di dalam Canvas (UI thread aman)
          const h = barHeights.value[i] ?? 4;
          return (
            <RoundedRect
              key={i}
              x={x}
              y={height - h}
              width={barWidth}
              height={h}
              r={2}
            >
              <LinearGradient
                start={vec(x, height)}
                end={vec(x, 0)}
                colors={['#6378ff', '#00e5c0']}
              />
            </RoundedRect>
          );
        })}
      </Canvas>
    </View>
  );
}
