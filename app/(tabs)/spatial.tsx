/**
 * Spatial Screen — Week 3
 * XY Pad + controls spatial audio
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSpatialStore } from '../../src/store/useSpatialStore';
import { XYPad } from '../../src/components/spatial/XYPad';
import { Colors } from '../../src/constants/colors';

function ToggleRow({ label, desc, value, onToggle, isPremium }: {
  label: string; desc: string; value: boolean;
  onToggle: () => void; isPremium?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.toggleInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.toggleLabel}>{label}</Text>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

export default function SpatialScreen() {
  const {
    isHRTFEnabled, isSurroundEnabled, isHeadTrackingEnabled,
    position, setPosition,
    toggleHRTF, toggleSurround, toggleHeadTracking,
  } = useSpatialStore();

  const handlePosition = useCallback((x: number, y: number) => {
    setPosition({ ...position, x, y });
  }, [position, setPosition]);

  const resetPosition = useCallback(() => {
    setPosition({ x: 0, y: 0, z: 0 });
  }, [setPosition]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Spatial Audio</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={resetPosition}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* HRTF badge */}
        <View style={styles.hrtfRow}>
          <View style={[styles.hrtfBadge, isHRTFEnabled && styles.hrtfBadgeActive]}>
            <Text style={[styles.hrtfText, isHRTFEnabled && styles.hrtfTextActive]}>
              {isHRTFEnabled ? '● HRTF ACTIVE' : '○ HRTF OFF'}
            </Text>
          </View>
          <Text style={styles.hint}>Gunakan headphone untuk efek terbaik 🎧</Text>
        </View>

        {/* XY Pad */}
        <View style={styles.padWrap}>
          <XYPad
            x={position.x}
            y={position.y}
            onPositionChange={handlePosition}
            size={260}
            disabled={!isHRTFEnabled}
          />
        </View>

        {/* Z axis (depth) */}
        <View style={styles.zRow}>
          <Text style={styles.zLabel}>Depth (Z)</Text>
          <View style={styles.zBtns}>
            {[-2, -1, 0, 1, 2].map(z => (
              <TouchableOpacity
                key={z}
                style={[styles.zBtn, position.z === z && styles.zBtnActive]}
                onPress={() => setPosition({ ...position, z })}
              >
                <Text style={[styles.zBtnText, position.z === z && styles.zBtnTextActive]}>
                  {z > 0 ? `+${z}` : z}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Toggles */}
        <View style={styles.toggles}>
          <ToggleRow
            label="HRTF 3D"
            desc="Head-Related Transfer Function — simulasi suara 3D binaural"
            value={isHRTFEnabled}
            onToggle={toggleHRTF}
            isPremium
          />
          <ToggleRow
            label="Virtual Surround"
            desc="Simulasi speaker surround 7.1 melalui headphone"
            value={isSurroundEnabled}
            onToggle={toggleSurround}
            isPremium
          />
          <ToggleRow
            label="Head Tracking"
            desc="Gunakan gyroscope untuk tracking posisi kepala"
            value={isHeadTrackingEnabled}
            onToggle={toggleHeadTracking}
            isPremium
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  resetBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
  },
  resetText: { fontSize: 12, color: Colors.textMuted },

  hrtfRow: { paddingHorizontal: 24, gap: 6, marginBottom: 16 },
  hrtfBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  hrtfBadgeActive: { borderColor: Colors.accent, backgroundColor: Colors.accentDim },
  hrtfText: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },
  hrtfTextActive: { color: Colors.accent },
  hint: { fontSize: 11, color: Colors.textMuted },

  padWrap: { alignItems: 'center', marginBottom: 16 },

  zRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 20, gap: 12,
  },
  zLabel: { fontSize: 12, color: Colors.textMuted, width: 60 },
  zBtns: { flexDirection: 'row', gap: 8 },
  zBtn: {
    width: 44, height: 36, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  zBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  zBtnText: { fontSize: 12, color: Colors.textMuted },
  zBtnTextActive: { color: '#fff', fontWeight: '700' },

  toggles: {
    marginHorizontal: 16, borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: 32,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  toggleInfo: { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  toggleDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  premiumBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, backgroundColor: 'rgba(255,184,77,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,184,77,0.3)',
  },
  premiumText: { fontSize: 8, color: '#ffb84d', letterSpacing: 1 },
  switch: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    padding: 3,
  },
  switchOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  switchThumb: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.textMuted,
  },
  switchThumbOn: { backgroundColor: '#fff', marginLeft: 20 },
});
