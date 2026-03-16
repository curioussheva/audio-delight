import React, { useEffect, useRef, memo } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Canvas, Rect, Skia, Group } from '@shopify/react-native-skia';
import { visualizerEmitter } from '@/services/native/VisualizerBridge';

interface SpectogramViewProps {
  width?: number;
  height?: number;
  isPlaying: boolean;
}
// Konstanta untuk performa
const MAX_ROWS = 35; // Jumlah baris waktu yang disimpan
const BINS = 48;    // Jumlah kolom frekuensi (downsampled untuk performa)

export const SpectogramView = memo(({ 
  width = Dimensions.get('window').width - 40, 
  height = 180 
}: SpectogramViewProps) => {
  
  // Menggunakan Ref untuk menyimpan data tanpa trigger re-render
  const dataRef = useRef<number[][]>(Array(MAX_ROWS).fill(Array(BINS).fill(0)));
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  useEffect(() => {
    const subscription = visualizerEmitter.addListener('onFftData', (fftData: number[]) => {
      // 1. Downsampling: Ambil rata-rata atau skip data agar sesuai dengan BINS
      const step = Math.floor(fftData.length / BINS);
      const normalizedRow = [];
      
      for (let i = 0; i < BINS; i++) {
        const val = fftData[i * step] || 0;
        // Normalisasi (asumsi data 0-60dB dari Kotlin)
        normalizedRow.push(Math.min(1, val / 60));
      }

      // 2. Update buffer data (Antrian: Baris baru masuk atas, baris lama keluar bawah)
      dataRef.current = [normalizedRow, ...dataRef.current.slice(0, MAX_ROWS - 1)];
      
      // 3. Trigger render manual
      forceUpdate();
    });

    return () => subscription.remove();
  }, []);

  /**
   * Heatmap Color Logic (Optimasi kalkulasi warna)
   */
  const getHeatmapColor = (amp: number) => {
    'worklet'; // Jika menggunakan reanimated, namun di sini cukup fungsi murni
    if (amp < 0.25) return Skia.Color(`rgb(0, ${Math.floor(amp * 1020)}, 255)`);
    if (amp < 0.5) return Skia.Color(`rgb(0, 255, ${255 - Math.floor((amp - 0.25) * 1020)})`);
    if (amp < 0.75) return Skia.Color(`rgb(${Math.floor((amp - 0.5) * 1020)}, 255, 0)`);
    return Skia.Color(`rgb(255, ${255 - Math.floor((amp - 0.75) * 1020)}, 0)`);
  };

  const cellWidth = width / BINS;
  const cellHeight = height / MAX_ROWS;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LIVE SPECTRUM ANALYSIS</Text>
        <View style={styles.liveIndicator} />
      </View>

      <Canvas style={{ width, height }}>
        <Group>
          {dataRef.current.map((row, t) => 
            row.map((amplitude, f) => {
              // Hanya gambar jika ada energi (optimasi draw call)
              if (amplitude < 0.05) return null;
              
              return (
                <Rect
                  key={`${t}-${f}`}
                  x={f * cellWidth}
                  y={t * cellHeight}
                  width={cellWidth + 0.4}
                  height={cellHeight + 0.4}
                  color={getHeatmapColor(amplitude)}
                />
              );
            })
          )}
        </Group>
      </Canvas>

      <View style={styles.footer}>
        <View style={styles.labels}>
          <Text style={styles.label}>20Hz</Text>
          <Text style={styles.label}>MIDDLE</Text>
          <Text style={styles.label}>22kHz</Text>
        </View>
        <View style={styles.gradientLine} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  footer: {
    marginTop: 8,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
  },
  gradientLine: {
    height: 2,
    marginTop: 4,
    borderRadius: 1,
    backgroundColor: '#1E293B',
    width: '100%',
  }
});
