import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Rect, LinearGradient, vec } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  fftData: SharedValue<number[]>;
  width: number; height: number; barCount?: number;
}

export function SpectrumBars({ fftData, width, height, barCount = 48 }: Props) {
  const gap = 2;
  const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
  const [bars, setBars] = useState<number[]>(new Array(barCount).fill(3));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const update = () => {
      if (!active) return;
      const data = fftData.value;
      const step = Math.max(1, Math.floor(data.length / barCount));
      setBars(Array.from({ length: barCount }, (_, i) =>
        Math.max(3, (data[Math.min(i * step, data.length - 1)] ?? 0) * height)
      ));
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [fftData, barCount, height]);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {bars.map((h, i) => {
          const x = i * (barWidth + gap);
          return (
            <Rect key={i} x={x} y={height - h} width={barWidth} height={h}>
              <LinearGradient start={vec(x, height)} end={vec(x, 0)} colors={['#6378ff', '#00e5c0']}/>
            </Rect>
          );
        })}
      </Canvas>
    </View>
  );
}
