// src/components/visualizer/SpectrumAnalyzer.tsx (update)
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import { Canvas, Path, Skia, Circle, Group } from '@shopify/react-native-skia';
import VisualizerService, { FrequencyData } from '@/services/audio/VisualizerService';
import { useTheme } from '@/context/ThemeContext';

interface SpectrumAnalyzerProps {
  width?: number;
  height?: number;
  mode?: 'bars' | 'wave' | 'circle';
  barCount?: number;
  barWidth?: number;
  barSpacing?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  onFrameRendered?: () => void;
  showCenterArt?: boolean;
  centerArt?: string;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  width = Dimensions.get('window').width - 32,
  height = 200,
  mode = 'bars',
  barCount = 32,
  barWidth = 6,
  barSpacing = 2,
  color = '#00D4AA',
  backgroundColor = '#0A1628',
  sensitivity = 1,
  onFrameRendered,
  showCenterArt = false,
  centerArt,
}) => {
  const { theme } = useTheme();
  const { colors } = theme;
  const [frequencies, setFrequencies] = useState<number[]>(new Array(barCount).fill(0));
  const [waveform, setWaveform] = useState<number[]>(new Array(128).fill(0));

  useEffect(() => {
    const unsubscribe = VisualizerService.addListener((data: FrequencyData) => {
      // Process frequencies untuk bars
      const step = Math.floor(data.frequencies.length / barCount);
      const newFrequencies = [];
      
      for (let i = 0; i < barCount; i++) {
        const start = i * step;
        const end = start + step;
        let sum = 0;
        
        for (let j = start; j < end; j++) {
          sum += data.frequencies[j] || 0;
        }
        
        const avg = sum / step;
        newFrequencies.push((avg / 255) * sensitivity);
      }
      setFrequencies(newFrequencies);

      // Process waveform untuk wave mode
      if (mode === 'wave') {
        const newWaveform = [];
        for (let i = 0; i < 128; i++) {
          const idx = Math.floor(i * (data.frequencies.length / 128));
          newWaveform.push((data.frequencies[idx] / 255) * sensitivity);
        }
        setWaveform(newWaveform);
      }

      onFrameRendered?.();
    });

    return unsubscribe;
  }, [barCount, sensitivity, mode, onFrameRendered]);

  useEffect(() => {
    VisualizerService.initialize();
    return () => {
      VisualizerService.destroy();
    };
  }, []);

  // Render bars
  const renderBars = () => {
    const totalWidth = barCount * (barWidth + barSpacing) - barSpacing;
    const startX = (width - totalWidth) / 2;
    
    const paths: React.JSX.Element[] = [];
    
    frequencies.forEach((value, index) => {
      const barHeight = Math.max(2, value * height * 0.8);
      const x = startX + index * (barWidth + barSpacing);
      const y = (height - barHeight) / 2;
      
      const path = Skia.Path.Make();
      path.addRect(Skia.XYWHRect(x, y, barWidth, barHeight));
      
      paths.push(
        <Path
          key={index}
          path={path}
          color={color}
          style="fill"
        />
      );
    });
    
    return paths;
  };

  // Render wave
  const renderWave = () => {
    const path = Skia.Path.Make();
    const step = width / waveform.length;
    
    path.moveTo(0, height / 2);
    
    for (let i = 0; i < waveform.length; i++) {
      const x = i * step;
      const y = (height / 2) + (waveform[i] * height * 0.4 * Math.sin(i * 0.2));
      path.lineTo(x, y);
    }
    
    return (
      <Path
        path={path}
        color={color}
        style="stroke"
        strokeWidth={2}
      />
    );
  };

  // Render circle
  const renderCircle = () => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;
    
    const paths: React.JSX.Element[] = [];
    
    frequencies.forEach((value, index) => {
      const angle = (index / frequencies.length) * Math.PI * 2;
      const barLength = value * radius * 1.5;
      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barLength);
      const y2 = centerY + Math.sin(angle) * (radius + barLength);
      
      const path = Skia.Path.Make();
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      
      paths.push(
        <Path
          key={index}
          path={path}
          color={color}
          style="stroke"
          strokeWidth={2}
        />
      );
    });

    return (
      <Group>
        {paths}
        {showCenterArt && centerArt ? (
          <Image 
            source={{ uri: centerArt }} 
            style={[
              StyleSheet.absoluteFill,
              { 
                width: radius * 1.5, 
                height: radius * 1.5,
                borderRadius: radius * 0.75,
                position: 'absolute',
                top: centerY - radius * 0.75,
                left: centerX - radius * 0.75,
              }
            ]} 
          />
        ) : (
          <Circle 
            cx={centerX} 
            cy={centerY} 
            r={radius * 0.5} 
            color={color + '40'} 
          />
        )}
      </Group>
    );
  };

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      <Canvas style={{ width, height }}>
        {mode === 'bars' && renderBars()}
        {mode === 'wave' && renderWave()}
        {mode === 'circle' && renderCircle()}
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