import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { Colors } from '../../src/constants/colors';
import { useSpatialStore } from '../../src/store/useSpatialStore';
import { useHeadTracking } from '../../src/hooks/useHeadTracking';

function ToggleRow({
  label,
  desc,
  value,
  onToggle,
  isPremium,
}: {
  label: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
  isPremium?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <View style={styles.toggleLabelRow}>
          <Text style={styles.toggleLabel}>{label}</Text>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <TouchableOpacity
        style={[styles.switch, value && styles.switchOn]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </TouchableOpacity>
    </View>
  );
}

export default function SpatialScreen() {
  const {
    enabled, binauralEnabled, headTrackingEnabled,
    setSpatialEnabled, setBinauralEnabled, setHeadTrackingEnabled,
    position, setPosition,
  } = useSpatialStore();

  // Activate head tracking hook
  useHeadTracking();

  // Map position to pad percentage
  const padX = ((position.x + 5) / 10) * 100;
  const padY = ((position.y + 2) / 4) * 100;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spatial 3D</Text>
        <View style={styles.premiumHeaderBadge}>
          <Text style={styles.premiumHeaderText}>PREMIUM</Text>
        </View>
      </View>

      {/* XY Pad */}
      <View style={styles.padSection}>
        <View
          style={styles.pad}
          onTouchMove={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            const padSize = 240;
            const x = ((locationX / padSize) * 10) - 5;
            const y = ((locationY / padSize) * 4) - 2;
            setPosition({ ...position, x, y });
          }}
        >
          {/* Rings */}
          {[60, 120, 180, 240].map((size) => (
            <View
              key={size}
              style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
            />
          ))}
          {/* Crosshair */}
          <View style={styles.crossH} />
          <View style={styles.crossV} />
          {/* Labels */}
          <Text style={[styles.padLabel, styles.lblTop]}>FRONT</Text>
          <Text style={[styles.padLabel, styles.lblBot]}>BACK</Text>
          <Text style={[styles.padLabel, styles.lblLeft]}>L</Text>
          <Text style={[styles.padLabel, styles.lblRight]}>R</Text>
          {/* Sound dot */}
          <View
            style={[
              styles.soundDot,
              { left: `${padX}%`, top: `${padY}%` },
            ]}
          />
        </View>
        <Text style={styles.padHint}>
          Drag untuk atur posisi suara · X: {position.x.toFixed(1)} Y: {position.y.toFixed(1)}
        </Text>
      </View>

      {/* Toggles */}
      <View style={styles.toggles}>
        <ToggleRow
          label="Spatial Audio"
          desc="Enable 3D audio processing"
          value={enabled}
          onToggle={() => setSpatialEnabled(!enabled)}
        />
        <ToggleRow
          label="Binaural HRTF"
          desc="3D suara via headphone · HRTF model"
          value={binauralEnabled}
          onToggle={() => setBinauralEnabled(!binauralEnabled)}
          isPremium
        />
        <ToggleRow
          label="Head Tracking"
          desc="Gyro sensor · orientasi suara otomatis"
          value={headTrackingEnabled}
          onToggle={() => setHeadTrackingEnabled(!headTrackingEnabled)}
          isPremium
        />
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠ AudioDelight menggunakan simulasi spatial 3D dengan HRTF.
          Bukan produk resmi Dolby Atmos®. Gunakan headphone untuk hasil terbaik.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  premiumHeaderBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.accent2Dim,
    borderWidth: 1, borderColor: Colors.accent2,
  },
  premiumHeaderText: { fontSize: 10, color: Colors.accent2, fontFamily: 'monospace', letterSpacing: 1 },
  padSection: { alignItems: 'center', marginVertical: 8 },
  pad: {
    width: 240, height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(99,120,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(99,120,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(99,120,255,0.08)',
  },
  crossH: {
    position: 'absolute',
    height: 1, left: 0, right: 0,
    backgroundColor: 'rgba(99,120,255,0.12)',
  },
  crossV: {
    position: 'absolute',
    width: 1, top: 0, bottom: 0,
    backgroundColor: 'rgba(99,120,255,0.12)',
  },
  padLabel: {
    position: 'absolute',
    fontSize: 9, fontFamily: 'monospace',
    color: Colors.textDim, letterSpacing: 1,
  },
  lblTop: { top: 8, alignSelf: 'center' },
  lblBot: { bottom: 8, alignSelf: 'center' },
  lblLeft: { left: 8 },
  lblRight: { right: 8 },
  soundDot: {
    position: 'absolute',
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent2,
    marginLeft: -9, marginTop: -9,
    elevation: 6,
    shadowColor: Colors.accent2,
    shadowOpacity: 0.8, shadowRadius: 8,
  },
  padHint: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', marginTop: 8 },
  toggles: { gap: 10, paddingHorizontal: 24 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14, gap: 12,
  },
  toggleInfo: { flex: 1, gap: 3 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  premiumBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.accent2Dim,
  },
  premiumText: { fontSize: 8, color: Colors.accent2, fontFamily: 'monospace', letterSpacing: 0.5 },
  toggleDesc: { fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace' },
  switch: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: Colors.accent },
  switchThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.textMuted,
  },
  switchThumbOn: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  disclaimer: {
    marginHorizontal: 24, marginTop: 12,
    padding: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,150,0,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,150,0,0.2)',
  },
  disclaimerText: { fontSize: 11, color: 'rgba(255,170,80,0.85)', lineHeight: 17, fontFamily: 'monospace' },
});
