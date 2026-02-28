/**
 * EQ Screen — Week 4
 * + Save custom preset button
 * + Load custom presets dari storage
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, useWindowDimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../src/constants/colors';
import { EQBoard } from '../../src/components/eq/EQBoard';
import { EQCurve } from '../../src/components/eq/EQCurve';
import { SavePresetModal } from '../../src/components/eq/SavePresetModal';
import { useEQStore } from '../../src/store/useEQStore';
import { ALL_PRESETS } from '../../src/audio/presets';
import { Preset } from '../../src/types/audio.types';
import { loadCustomPresets, deleteCustomPreset } from '../../src/services/PresetStorage';

export default function EQScreen() {
  const { bands, activePresetId, isEQEnabled, applyPreset } = useEQStore();
  const { width } = useWindowDimensions();
  const [saveVisible, setSaveVisible] = useState(false);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);

  const loadCustom = useCallback(async () => {
    const saved = await loadCustomPresets();
    setCustomPresets(saved);
  }, []);

  useEffect(() => { loadCustom(); }, []);

  const handleDelete = (preset: Preset) => {
    Alert.alert(
      'Hapus Preset',
      `Hapus "${preset.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            await deleteCustomPreset(preset.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            loadCustom();
          },
        },
      ]
    );
  };

  const allPresets = [...ALL_PRESETS, ...customPresets];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Equalizer</Text>
        <View style={styles.headerRight}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>10-BAND</Text>
          </View>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => setSaveVisible(true)}
          >
            <Text style={styles.saveBtnText}>+ Simpan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* EQ Curve */}
      <View style={styles.curveWrap}>
        <EQCurve bands={bands} width={width - 56} height={100} isEnabled={isEQEnabled} />
        <View style={styles.dbLabels}>
          {['+12', '0', '-12'].map(v => (
            <Text key={v} style={styles.dbLabel}>{v}</Text>
          ))}
        </View>
      </View>

      {/* Presets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
        {allPresets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const isCustom = preset.id.startsWith('custom_');
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.chip, isActive && styles.chipActive, isCustom && styles.chipCustom]}
              onPress={() => applyPreset(preset)}
              onLongPress={() => isCustom && handleDelete(preset)}
            >
              {isCustom && <Text style={styles.chipIcon}>★ </Text>}
              {preset.isPremium && !isCustom && <Text style={styles.chipIcon}>🔒 </Text>}
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {customPresets.length > 0 && (
        <Text style={styles.hintCustom}>Long-press preset bintang untuk hapus</Text>
      )}

      {/* EQ Board */}
      <View style={styles.boardWrap}>
        <EQBoard />
      </View>

      {/* Save Modal */}
      <SavePresetModal
        visible={saveVisible}
        onClose={() => setSaveVisible(false)}
        onSaved={(name) => {
          loadCustom();
          Alert.alert('✅ Tersimpan', `Preset "${name}" berhasil disimpan!`);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:Colors.bg },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:24, paddingTop:8, paddingBottom:4 },
  title: { fontSize:24, fontWeight:'800', color:Colors.text },
  headerRight: { flexDirection:'row', alignItems:'center', gap:8 },
  badge: { paddingHorizontal:10, paddingVertical:4, borderRadius:20, backgroundColor:Colors.accentDim, borderWidth:1, borderColor:Colors.borderStrong },
  badgeText: { fontSize:10, color:Colors.accent, letterSpacing:1 },
  saveBtn: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, backgroundColor:Colors.accent },
  saveBtnText: { fontSize:11, color:'#fff', fontWeight:'700' },
  curveWrap: { marginHorizontal:16, marginBottom:8, backgroundColor:Colors.surface, borderRadius:12, borderWidth:1, borderColor:Colors.border, padding:8, flexDirection:'row', alignItems:'stretch' },
  dbLabels: { width:28, justifyContent:'space-between', paddingVertical:4 },
  dbLabel: { fontSize:9, color:Colors.textMuted, textAlign:'right' },
  presets: { paddingHorizontal:16, paddingBottom:4, flexDirection:'row', gap:8 },
  chip: { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:Colors.border, marginRight:8 },
  chipActive: { backgroundColor:Colors.accent, borderColor:Colors.accent },
  chipCustom: { borderColor:Colors.borderStrong },
  chipIcon: { fontSize:10 },
  chipText: { fontSize:12, color:Colors.textMuted },
  chipTextActive: { color:'#fff', fontWeight:'700' },
  hintCustom: { fontSize:10, color:Colors.textMuted, paddingHorizontal:20, marginBottom:4, opacity:0.6 },
  boardWrap: { flex:1 },
});
