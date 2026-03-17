import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
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
    
    // Faktor skala: pastikan gain maksimal (misal 12dB) tidak keluar dari kanvas
    // Kita sisakan margin 10% agar glow tidak terpotong
    const verticalScale = (height * 0.4) / 12; 

    const getX = (i: number) => i * stepX;
    const getY = (gain: number) => midY - (gain * verticalScale);

    skPath.moveTo(getX(0), getY(bands[0].gain));

    for (let i = 1; i < bands.length; i++) {
      const x = getX(i);
      const y = getY(bands[i].gain);
      const prevX = getX(i - 1);
      const prevY = getY(bands[i - 1].gain);

      // CP1 dan CP2 di tengah sumbu X memberikan kelengkungan S-curve yang smooth
      const cp1x = prevX + (x - prevX) * 0.5;
      const cp2x = prevX + (x - prevX) * 0.5;
      
      skPath.cubicTo(cp1x, prevY, cp2x, y, x, y);
    }

    const fill = skPath.copy();
    fill.lineTo(width, height);
    fill.lineTo(0, height);
    fill.close();

    return { curvePath: skPath, fillPath: fill };
  }, [bands, width, height]);

  return (
    <View style={styles.container}>
      {/* Garis Tengah 0dB (Reference Line) */}
      <View style={[styles.zeroLine, { top: height / 2, width }]} />
      
      <Canvas style={{ width, height }}>
        <Path path={fillPath}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={['rgba(0, 212, 170, 0.25)', 'transparent']}
          />
        </Path>

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
            colors={['#00D4AA', '#D4AF37']}
          />
          <BlurMask blur={3} style="outer" />
        </Path>
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'relative' },
  zeroLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)', // Garis halus penanda 0dB
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  }
});
