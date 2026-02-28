/**
 * EQCurve — Week 3
 * Visualisasi kurva EQ realtime menggunakan Skia Path.
 * Menghitung frequency response dari semua band (peaking/shelf filters)
 * dan menggambar sebagai smooth bezier curve.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import {
  Canvas, Path, Skia, LinearGradient, vec,
  Paint, Line,
} from '@shopify/react-native-skia';
import { EQBand } from '../../types/audio.types';

interface Props {
  bands: EQBand[];
  width: number;
  height: number;
  isEnabled: boolean;
}

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const DB_RANGE = 14; // ±14 dB display range

// ─── Biquad filter frequency response ────────────────────────────────────────
function bandResponse(band: EQBand, freq: number): number {
  const { frequency: f0, gain: dBgain, q, type } = band;
  const gainLin = 10 ** (dBgain / 40);
  const w0 = (2 * Math.PI * freq) / 44100;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);

  let b0, b1, b2, a0, a1, a2;

  if (type === 'peaking') {
    b0 = 1 + alpha * gainLin;
    b1 = -2 * cosW;
    b2 = 1 - alpha * gainLin;
    a0 = 1 + alpha / gainLin;
    a1 = -2 * cosW;
    a2 = 1 - alpha / gainLin;
  } else if (type === 'lowshelf') {
    const A = gainLin;
    b0 = A * ((A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * alpha);
    b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
    b2 = A * ((A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * alpha);
    a0 = (A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * alpha;
    a1 = -2 * ((A - 1) + (A + 1) * cosW);
    a2 = (A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * alpha;
  } else { // highshelf
    const A = gainLin;
    b0 = A * ((A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * alpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
    b2 = A * ((A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * alpha);
    a0 = (A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * alpha;
    a1 = 2 * ((A - 1) - (A + 1) * cosW);
    a2 = (A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * alpha;
  }

  // |H(e^jw)|^2
  const phi = Math.sin(w0 / 2) ** 2;
  const num = (b0 + b1 + b2) ** 2 - 4 * (b0 * b1 + 4 * b0 * b2 + b1 * b2) * phi + 16 * b0 * b2 * phi ** 2;
  const den = (a0 + a1 + a2) ** 2 - 4 * (a0 * a1 + 4 * a0 * a2 + a1 * a2) * phi + 16 * a0 * a2 * phi ** 2;

  if (den < 0.0000001) return 0;
  return 10 * Math.log10(Math.max(0.0000001, num / den));
}

function totalResponse(bands: EQBand[], freq: number): number {
  return bands.reduce((sum, b) => sum + bandResponse(b, freq), 0);
}

function freqToX(freq: number, w: number): number {
  return ((Math.log10(freq) - Math.log10(FREQ_MIN)) /
    (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN))) * w;
}

function dbToY(db: number, h: number): number {
  return h / 2 - (db / DB_RANGE) * (h / 2);
}

export function EQCurve({ bands, width, height, isEnabled }: Props) {
  const PAD = 0;
  const w = width - PAD * 2;
  const h = height;
  const POINTS = 120;

  const { curvePath, fillPath } = useMemo(() => {
    const curve = Skia.Path.Make();
    const fill = Skia.Path.Make();

    const points: [number, number][] = [];
    for (let i = 0; i <= POINTS; i++) {
      const t = i / POINTS;
      const freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** t;
      const db = isEnabled ? totalResponse(bands, freq) : 0;
      const x = PAD + freqToX(freq, w);
      const y = dbToY(Math.max(-DB_RANGE, Math.min(DB_RANGE, db)), h);
      points.push([x, y]);
    }

    // Draw smooth bezier
    curve.moveTo(points[0][0], points[0][1]);
    fill.moveTo(points[0][0], h);
    fill.lineTo(points[0][0], points[0][1]);

    for (let i = 1; i < points.length - 1; i++) {
      const cpx = (points[i][0] + points[i - 1][0]) / 2;
      const cpy = (points[i][1] + points[i - 1][1]) / 2;
      curve.quadTo(points[i - 1][0], points[i - 1][1], cpx, cpy);
      fill.quadTo(points[i - 1][0], points[i - 1][1], cpx, cpy);
    }
    curve.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
    fill.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
    fill.lineTo(points[points.length - 1][0], h);
    fill.close();

    return { curvePath: curve, fillPath: fill };
  }, [bands, isEnabled, width, height]);

  const zeroY = dbToY(0, h);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {/* Zero line */}
        <Line
          p1={vec(0, zeroY)}
          p2={vec(width, zeroY)}
          color="rgba(99,120,255,0.15)"
          strokeWidth={1}
        />

        {/* Fill under curve */}
        <Path path={fillPath} style="fill" opacity={isEnabled ? 0.08 : 0.03}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, h)}
            colors={['#6378ff', 'transparent']}
          />
        </Path>

        {/* Curve line */}
        <Path
          path={curvePath}
          style="stroke"
          strokeWidth={2}
          strokeJoin="round"
          strokeCap="round"
          opacity={isEnabled ? 1 : 0.3}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(width, 0)}
            colors={['#6378ff', '#00e5c0']}
          />
        </Path>
      </Canvas>
    </View>
  );
}
