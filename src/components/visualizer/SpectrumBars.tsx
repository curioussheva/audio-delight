import React from 'react';
import { View } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  fftData: SharedValue<number[]>;
  width: number;
  height: number;
  barCount?: number;
}

export function SpectrumBars({ fftData, width, height, barCount = 32 }: Props) {
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);

  // Snapshot data sekali saat render — tidak baca di worklet
  const data = fftData.value;
  const step = Math.max(1, Math.floor(data.length / barCount));

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {Array.from({ length: barCount }, (_, i) => {
          const val = data[Math.min(i * step, data.length - 1)] ?? 0;
          const h = Math.max(4, val * height);
          const x = i * (barWidth + gap);
          return (
            <RoundedRect key={i} x={x} y={height - h} width={barWidth} height={h} r={2}>
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
