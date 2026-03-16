import React, { useMemo } from 'react';
import { 
  Skia, 
  Canvas, 
  Path, 
  LinearGradient, 
  vec, 
  BlurMask 
} from '@shopify/react-native-skia';
import { EqualizerBand } from '@/types/equalizer';

interface Props {
  bands: EqualizerBand[];
  width?: number;
  height?: number;
}

export const FrequencyGraph: React.FC<Props> = ({ bands, width = 340, height = 120 }) => {
  const { curvePath, fillPath } = useMemo(() => {
    const skPath = Skia.Path.Make();
    const midY = height / 2;
    const stepX = width / (bands.length - 1);

    // Titik awal
    const firstY = midY - (bands[0].gain * (height / 28));
    skPath.moveTo(0, firstY);

    for (let i = 1; i < bands.length; i++) {
      const x = i * stepX;
      const y = midY - (bands[i].gain * (height / 28));
      
      const prevX = (i - 1) * stepX;
      const prevY = midY - (bands[i-1].gain * (height / 28));

      // Cubic Bezier untuk kurva yang lebih natural (analog-like)
      const cp1x = prevX + (x - prevX) / 2;
      const cp2x = prevX + (x - prevX) / 2;
      
      skPath.cubicTo(cp1x, prevY, cp2x, y, x, y);
    }

    // Buat path untuk gradien area di bawah kurva
    const fill = skPath.copy();
    fill.lineTo(width, height);
    fill.lineTo(0, height);
    fill.close();

    return { curvePath: skPath, fillPath: fill };
  }, [bands, width, height]);

  return (
    <Canvas style={{ width, height }}>
      {/* Area Fill (Gradien bawah) */}
      <Path path={fillPath}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={['rgba(0, 212, 170, 0.2)', 'rgba(0, 212, 170, 0)']}
        />
      </Path>

      {/* Garis Utama Kurva */}
      <Path
        path={curvePath}
        style="stroke"
        strokeWidth={3}
        strokeJoin="round"
        strokeCap="round"
      >
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
          colors={['#00D4AA', '#00AADD', '#D4AF37']}
        />
        {/* Efek Glow Tipis */}
        <BlurMask blur={2} style="outer" />
      </Path>
    </Canvas>
  );
};
