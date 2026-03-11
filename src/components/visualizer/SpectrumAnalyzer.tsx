import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import VisualizerService, { FrequencyData } from '@/services/audio/VisualizerService';
import { useTheme } from '@/context/ThemeContext'; // ← IMPORT ThemeContext

interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
  barCount?: number;
  barWidth?: number;
  barSpacing?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  width = Dimensions.get('window').width - 32,
  height = 200,
  barCount = 32,
  barWidth = 6,
  barSpacing = 2,
  color,
  backgroundColor,
  sensitivity = 1, // ← DEFAULT SENSITIVITY
}) => {
  const { theme } = useTheme(); // ← AMBIL THEME
  const { colors } = theme;
  
  // Gunakan warna dari theme jika tidak disediakan props
  const barColor = color || colors.primary[500];
  const bgColor = backgroundColor || colors.background.primary;
  
  const [frequencies, setFrequencies] = useState<number[]>(new Array(barCount).fill(0));

  useEffect(() => {
    const unsubscribe = VisualizerService.addListener((data: FrequencyData) => {
      // Downsample ke jumlah bar yang diinginkan
      const step = Math.floor(data.frequencies.length / barCount);
      const newFrequencies = [];
      
      for (let i = 0; i < barCount; i++) {
        const start = i * step;
        const end = start + step;
        let sum = 0;
        
        for (let j = start; j < end; j++) {
          sum += data.frequencies[j] || 0;
        }
        
        // Normalisasi ke 0-1
        const avg = sum / step;
        newFrequencies.push(avg / 255);
      }
      
      setFrequencies(newFrequencies);
    });

    return unsubscribe;
  }, [barCount]);

  useEffect(() => {
    VisualizerService.initialize();
    return () => {
      VisualizerService.destroy();
    };
  }, []);

  // Render bars menggunakan Skia Path
  const renderBars = () => {
    const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;
    const startX = (width - totalWidth) / 2;
    
    const paths: React.JSX.Element[] = [];
    
    frequencies.forEach((value, index) => {
      // Terapkan sensitivity
      const adjustedValue = value * sensitivity;
      const barHeight = Math.min(adjustedValue * height * 0.8, height);
      const x = startX + index * (barWidth + barSpacing);
      const y = (height - barHeight) / 2;
      
      // Buat path untuk setiap bar
      const path = Skia.Path.Make();
      path.addRect(Skia.XYWHRect(x, y, barWidth, barHeight)); // ✅ fixed
      
      paths.push(
        <Path
          key={index}
          path={path}
          color={barColor}
          style="fill"
        />
      );
    });
    
    return paths;
  };

  return (
    <View style={[styles.container, { width, height, backgroundColor: bgColor }]}>
      <Canvas style={{ width, height }}>
        {renderBars()}
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
});