import React from 'react'; // ← PASTIKAN REACT DI IMPORT
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { AnalysisResult } from '@/services/audio/AudioAnalyzerService';

interface SpectogramViewProps {
  analysis?: AnalysisResult;
  width?: number;
  height?: number;
}

export const SpectogramView: React.FC<SpectogramViewProps> = ({
  analysis,
  width = Dimensions.get('window').width - 32,
  height = 200,
}) => {
  const [spectogramData, setSpectogramData] = React.useState<number[][]>([]);

  React.useEffect(() => {
    if (analysis?.spectogramData) {
      setSpectogramData(analysis.spectogramData);
    } else {
      // Data dummy untuk preview
      const dummy: number[][] = [];
      for (let i = 0; i < 100; i++) {
        const row: number[] = [];
        for (let j = 0; j < 256; j++) {
          row.push(Math.random() * 0.5 + 0.3 * Math.sin(i * 0.1) + 0.2 * Math.sin(j * 0.05));
        }
        dummy.push(row);
      }
      setSpectogramData(dummy);
    }
  }, [analysis]);

  const drawSpectogram = () => {
    if (!spectogramData.length) return null;

    const paths: React.JSX.Element[] = []; // ← FIX: pakai React.JSX
    const timeSteps = spectogramData.length;
    const freqBins = spectogramData[0].length;
    const cellWidth = width / freqBins;
    const cellHeight = height / timeSteps;

    for (let t = 0; t < timeSteps; t++) {
      for (let f = 0; f < freqBins; f++) {
        const amplitude = spectogramData[t][f];
        const intensity = Math.floor(amplitude * 255);
        const color = `rgb(${intensity}, ${intensity}, 255)`;
        
        const x = f * cellWidth;
        const y = t * cellHeight;
        
        // Gambar rectangle untuk setiap pixel spektogram
        const path = Skia.Path.Make();
        path.addRect({ x, y, width: cellWidth, height: cellHeight });
        
        paths.push(
          <Path
            key={`${t}-${f}`}
            path={path}
            color={color}
            style="fill"
          />
        );
      }
    }

    return paths;
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={{ width, height }}>
        {drawSpectogram()}
      </Canvas>
      
      {/* Label frekuensi */}
      <View style={styles.labels}>
        <Text style={styles.label}>20Hz</Text>
        <Text style={styles.label}>20kHz</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A1628',
    borderRadius: 8,
    overflow: 'hidden',
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  label: {
    color: '#C8D4E0',
    fontSize: 10,
  },
});